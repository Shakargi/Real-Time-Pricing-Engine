package com.avraham.trading.services;

import java.io.IOException;
import java.time.Instant;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import com.avraham.trading.model.MarketTick;
import com.avraham.trading.model.OHLCVCandleDTO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.annotation.PostConstruct;

/**
 * Service responsible for establishing and maintaining a persistent WebSocket connection 
 * to the Alpaca market data stream (IEX free tier).
 * 
 * Architectural split:
 * 1. Raw Ticks -> Throttled and published to Kafka for the C++ Quant Engine.
 * 2. Aggregated Candles (OHLCV) -> Computed real-time and broadcasted via Spring WebSockets to React.
 */
@Service
public class AlpacaLiveStreamService implements MarketStreamProvider {

    private static final Logger logger = LoggerFactory.getLogger(AlpacaLiveStreamService.class);

    private static final String TOPIC = "market_ticks";
    private static final String ALPACA_WS_URL = "wss://stream.data.alpaca.markets/v2/iex";

    @Value("${alpaca.api.key}")
    private String apiKey;

    @Value("${alpaca.api.secret}")
    private String apiSecret;

    @Autowired
    private KafkaTemplate<String, MarketTick> kafkaTemplate;

    // Injects the Spring WebSocket template to push ready-made candles directly to the frontend
    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    private final Set<String> activeSymbols = Collections.synchronizedSet(new HashSet<>());
    
    // Throttling maps to prevent overwhelming Kafka and the React UI
    private final Map<String, Long> lastKafkaSentTimes = new ConcurrentHashMap<>();
    private final Map<String, Long> lastWsSentTimes = new ConcurrentHashMap<>();
    private static final long THROTTLE_MS = 1000;
    
    // Real-time Candle Aggregation State
    private final Map<String, OHLCVCandleDTO> liveCandles = new ConcurrentHashMap<>();
    
    private WebSocketSession activeSession;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @PostConstruct
    public void connectToAlpaca() {
        startConnection();
    }

    private void startConnection() {
        StandardWebSocketClient client = new StandardWebSocketClient();
        
        try {
            client.execute(new TextWebSocketHandler() {
                
                @Override
                public void afterConnectionEstablished(WebSocketSession session) throws IOException {
                    AlpacaLiveStreamService.this.activeSession = session;
                    logger.info("[+] Successfully connected to Alpaca Live Market WebSocket");
                    
                    String authPayload = String.format("{\"action\": \"auth\", \"key\": \"%s\", \"secret\": \"%s\"}", apiKey, apiSecret);
                    session.sendMessage(new TextMessage(authPayload));
                }

                @Override
                public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
                    logger.warn("[-] Alpaca connection terminated. Status: {}. Attempting to reconnect...", status);
                    AlpacaLiveStreamService.this.activeSession = null;
                    Thread.sleep(5000); 
                    startConnection();
                }

                @Override
                protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
                    JsonNode rootNode = objectMapper.readTree(message.getPayload());

                    if (rootNode.isArray()) {
                        for (JsonNode node : rootNode) {
                            String messageType = node.path("T").asText();

                            if ("success".equals(messageType) && "authenticated".equals(node.path("msg").asText())) {
                                logger.info("[+] Authentication successful. Recovering data streams...");
                                resubscribeAll();
                            } 
                            else if ("t".equals(messageType)) { 
                                processTradeEvent(node);
                            }
                        }
                    }
                }
            }, ALPACA_WS_URL).get();
            
        } catch (InterruptedException | ExecutionException e) {
            logger.error("[-] Alpaca WebSocket initialization failed: {}", e.getMessage(), e);
        }
    }

    /**
     * Processes a single live trade event.
     * Routes raw data to Kafka and dynamically aggregates 1-minute OHLCV candles for the UI.
     */
    private void processTradeEvent(JsonNode node) {
        String symbol = node.path("S").asText();
        double price = node.path("p").asDouble();
        double volume = node.path("s").asDouble(); // Fetched as double for safe aggregation

        long tickTimeMs = System.currentTimeMillis();
        JsonNode timeNode = node.get("t");
        
        if (timeNode != null && !timeNode.isNull()) {
            if (timeNode.isTextual()) {
                tickTimeMs = Instant.parse(timeNode.asText()).toEpochMilli();
            } else {
                long rawTime = timeNode.asLong();
                tickTimeMs = rawTime > 1e15 ? rawTime / 1_000_000 : rawTime * 1_000;
            }
        }

        long currentServerTime = System.currentTimeMillis();

        // ==========================================
        // 1. BACKEND ROUTE: Raw Ticks to Kafka (C++)
        // ==========================================
        long lastKafkaSent = lastKafkaSentTimes.getOrDefault(symbol, 0L);
        if (currentServerTime - lastKafkaSent >= THROTTLE_MS) {
            MarketTick tick = new MarketTick(symbol, price, (int) volume, tickTimeMs);
            kafkaTemplate.send(TOPIC, symbol, tick);
            lastKafkaSentTimes.put(symbol, currentServerTime);
        }

        // ==========================================
        // 2. FRONTEND ROUTE: OHLCV Aggregation (React)
        // ==========================================
        long currentMinuteBucket = (tickTimeMs / 60000) * 60000;

        // Flush the just-completed candle immediately on rollover. The 1s throttle below can
        // otherwise swallow a minute's final updates, leaving the client with a stale
        // close/high/low/volume for that minute.
        OHLCVCandleDTO previousCandle = liveCandles.get(symbol);
        if (previousCandle != null && previousCandle.time() < currentMinuteBucket) {
            messagingTemplate.convertAndSend("/topic/market/" + symbol, previousCandle);
        }
        
        liveCandles.compute(symbol, (key, existingCandle) -> {
            // If the candle is new or belongs to a previous minute, create a fresh one
            if (existingCandle == null || existingCandle.time() < currentMinuteBucket) {
                return new OHLCVCandleDTO(currentMinuteBucket, price, price, price, price, volume);
            } 
            // Otherwise, update the current minute's high, low, close, and cumulative volume
            else {
                return new OHLCVCandleDTO(
                    existingCandle.time(),
                    existingCandle.open(),
                    Math.max(existingCandle.high(), price),
                    Math.min(existingCandle.low(), price),
                    price,
                    existingCandle.volume() + volume
                );
            }
        });

        // Throttle UI updates to prevent rendering bottlenecks in React
        long lastWsSent = lastWsSentTimes.getOrDefault(symbol, 0L);
        if (currentServerTime - lastWsSent >= THROTTLE_MS) {
            // Push the fully computed candle to the generic Spring WebSocket channel
            messagingTemplate.convertAndSend("/topic/market/" + symbol, liveCandles.get(symbol));
            lastWsSentTimes.put(symbol, currentServerTime);
        }
    }

    private void resubscribeAll() throws IOException {
        if (activeSymbols.isEmpty() || activeSession == null || !activeSession.isOpen()) return;
        
        String jsonSymbols = activeSymbols.stream()
                .map(s -> "\"" + s + "\"")
                .collect(java.util.stream.Collectors.joining(","));
        
        String subPayload = "{\"action\": \"subscribe\", \"trades\": [" + jsonSymbols + "]}";
        activeSession.sendMessage(new TextMessage(subPayload));
        logger.info("[+] Recovered subscriptions for active trades: {}", activeSymbols);
    }

    @Override
    public void subscribeSymbol(String symbol) {
        String upperSymbol = symbol.toUpperCase();
        if (activeSymbols.add(upperSymbol)) { 
            try {
                if (this.activeSession != null && this.activeSession.isOpen()) {
                    String subPayload = "{\"action\": \"subscribe\", \"trades\": [\"" + upperSymbol + "\"]}";
                    this.activeSession.sendMessage(new TextMessage(subPayload));
                    logger.info("[+] Successfully subscribed to Alpaca feed: {}", upperSymbol);
                }
            } catch (Exception e) {
                logger.error("[-] Failed to subscribe to {}: {}", upperSymbol, e.getMessage());
            }
        }
    }

    @Override
    public void unsubscribeSymbol(String symbol) {
        String upperSymbol = symbol.toUpperCase();
        if (activeSymbols.remove(upperSymbol)) { 
            try {
                if (this.activeSession != null && this.activeSession.isOpen()) {
                    String unsubPayload = "{\"action\": \"unsubscribe\", \"trades\": [\"" + upperSymbol + "\"]}";
                    this.activeSession.sendMessage(new TextMessage(unsubPayload));
                    logger.info("[-] Successfully unsubscribed from Alpaca feed: {}", upperSymbol);
                }
                
                lastKafkaSentTimes.remove(upperSymbol);
                lastWsSentTimes.remove(upperSymbol);
                liveCandles.remove(upperSymbol);
                
            } catch (Exception e) {
                logger.error("[-] Failed to unsubscribe from {}: {}", upperSymbol, e.getMessage());
            }
        }
    }

    @Override
    public boolean supports(String symbol) {
        return symbol != null && !symbol.toUpperCase().endsWith("USDT");
    }
}