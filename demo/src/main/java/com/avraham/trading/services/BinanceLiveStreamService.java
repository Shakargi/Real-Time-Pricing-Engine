package com.avraham.trading.services;

import java.io.IOException;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;

import org.springframework.beans.factory.annotation.Autowired;
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
 * Service responsible for managing the real-time WebSocket connection to the Binance cryptocurrency market stream.
 * It handles dynamic subscriptions, automatic reconnections, and parses raw trade payloads.
 *
 * Architectural split (mirrors AlpacaLiveStreamService):
 * 1. Raw ticks -> throttled and published to Kafka for the C++ Quant Engine.
 * 2. Aggregated 1-minute OHLCV candles -> broadcast over STOMP to /topic/market/{symbol} for React.
 */
@Service
public class BinanceLiveStreamService implements MarketStreamProvider {

    private static final String TOPIC = "market_ticks";
    private static final String BINANCE_WS_URL = "wss://stream.binance.com:9443/ws";

    @Autowired
    private KafkaTemplate<String, MarketTick> kafkaTemplate;

    // Pushes ready-made candles to the frontend
    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    private final Set<String> activeSymbols = Collections.synchronizedSet(new HashSet<>());

    // Throttling state (independent per destination)
    private final Map<String, Long> lastKafkaSentTimes = new ConcurrentHashMap<>();
    private final Map<String, Long> lastWsSentTimes = new ConcurrentHashMap<>();
    private static final long THROTTLE_MS = 1000;

    // Real-time candle aggregation state
    private final Map<String, OHLCVCandleDTO> liveCandles = new ConcurrentHashMap<>();

    private WebSocketSession activeSession;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private int requestIdCounter = 1;

    @PostConstruct
    public void connectToBinance() {
        startConnection();
    }

    private void startConnection() {
        StandardWebSocketClient client = new StandardWebSocketClient();

        try {
            client.execute(new TextWebSocketHandler() {

                @Override
                public void afterConnectionEstablished(WebSocketSession session) throws IOException {
                    BinanceLiveStreamService.this.activeSession = session;
                    System.out.println("[+] Connected to Binance Live Market WebSocket");
                    resubscribeAll();
                }

                @Override
                public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
                    System.err.println("[-] Binance connection closed. Status: " + status + ". Attempting reconnect...");
                    BinanceLiveStreamService.this.activeSession = null;
                    Thread.sleep(5000);
                    startConnection();
                }

                @Override
                protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
                    JsonNode rootNode = objectMapper.readTree(message.getPayload());

                    // Subscription confirmations lack the "e" (event) field; only process trades.
                    if (rootNode.has("e") && "trade".equals(rootNode.get("e").asText())) {
                        processTradeEvent(rootNode);
                    }
                }
            }, BINANCE_WS_URL).get();
        } catch (InterruptedException | ExecutionException e) {
            System.err.println("[-] Binance WebSocket connection error: " + e.getMessage());
        }
    }

    /**
     * Processes a single live trade event: routes the raw tick to Kafka and
     * aggregates it into the current 1-minute candle for the UI.
     */
    private void processTradeEvent(JsonNode node) {
        String symbol = node.get("s").asText();      // "s": Symbol (uppercase, e.g. BTCUSDT)
        double price = node.get("p").asDouble();     // "p": Price
        double quantity = node.get("q").asDouble();  // "q": Quantity (kept as double for candle volume)

        long currentServerTime = System.currentTimeMillis();
        // "T": trade time in ms; fall back to server time if absent
        long tickTimeMs = node.has("T") ? node.get("T").asLong() : currentServerTime;

        // ==========================================
        // 1. BACKEND ROUTE: raw ticks to Kafka (C++)
        // ==========================================
        long lastKafkaSent = lastKafkaSentTimes.getOrDefault(symbol, 0L);
        if (currentServerTime - lastKafkaSent >= THROTTLE_MS) {
            int volume = (int) Math.round(quantity);
            MarketTick tick = new MarketTick(symbol, price, volume, currentServerTime);
            kafkaTemplate.send(TOPIC, symbol, tick);
            lastKafkaSentTimes.put(symbol, currentServerTime);
        }

        // ==========================================
        // 2. FRONTEND ROUTE: OHLCV aggregation (React)
        // ==========================================
        long currentMinuteBucket = (tickTimeMs / 60000) * 60000;

        liveCandles.compute(symbol, (key, existing) -> {
            if (existing == null || existing.time() < currentMinuteBucket) {
                return new OHLCVCandleDTO(currentMinuteBucket, price, price, price, price, quantity);
            }
            return new OHLCVCandleDTO(
                existing.time(),
                existing.open(),
                Math.max(existing.high(), price),
                Math.min(existing.low(), price),
                price,
                existing.volume() + quantity
            );
        });

        long lastWsSent = lastWsSentTimes.getOrDefault(symbol, 0L);
        if (currentServerTime - lastWsSent >= THROTTLE_MS) {
            messagingTemplate.convertAndSend("/topic/market/" + symbol, liveCandles.get(symbol));
            lastWsSentTimes.put(symbol, currentServerTime);
        }
    }

    private void resubscribeAll() throws IOException {
        if (activeSymbols.isEmpty() || activeSession == null || !activeSession.isOpen()) return;

        String jsonParams = activeSymbols.stream()
                .map(s -> "\"" + s.toLowerCase() + "@trade\"")
                .collect(java.util.stream.Collectors.joining(","));

        String subPayload = String.format("{\"method\": \"SUBSCRIBE\", \"params\": [%s], \"id\": %d}", jsonParams, requestIdCounter++);
        activeSession.sendMessage(new TextMessage(subPayload));
        System.out.println("[+] Resubscribed to active crypto trades: " + activeSymbols);
    }

    @Override
    public void subscribeSymbol(String symbol) {
        String upperSymbol = symbol.toUpperCase();

        if (activeSymbols.add(upperSymbol)) {
            try {
                if (this.activeSession != null && this.activeSession.isOpen()) {
                    String streamName = upperSymbol.toLowerCase() + "@trade";
                    String subPayload = String.format("{\"method\": \"SUBSCRIBE\", \"params\": [\"%s\"], \"id\": %d}", streamName, requestIdCounter++);
                    this.activeSession.sendMessage(new TextMessage(subPayload));
                    System.out.println("[+] Subscribed to Binance: " + upperSymbol);
                }
            } catch (Exception e) {
                System.err.println("[-] Failed to subscribe to " + upperSymbol + ": " + e.getMessage());
            }
        }
    }

    @Override
    public void unsubscribeSymbol(String symbol) {
        String upperSymbol = symbol.toUpperCase();

        if (activeSymbols.remove(upperSymbol)) {
            try {
                if (this.activeSession != null && this.activeSession.isOpen()) {
                    String streamName = upperSymbol.toLowerCase() + "@trade";
                    String unsubPayload = String.format("{\"method\": \"UNSUBSCRIBE\", \"params\": [\"%s\"], \"id\": %d}", streamName, requestIdCounter++);
                    this.activeSession.sendMessage(new TextMessage(unsubPayload));
                    System.out.println("[-] Unsubscribed from Binance: " + upperSymbol);
                }

                // Cleanup per-symbol state to prevent memory leaks
                lastKafkaSentTimes.remove(upperSymbol);
                lastWsSentTimes.remove(upperSymbol);
                liveCandles.remove(upperSymbol);

            } catch (Exception e) {
                System.err.println("[-] Failed to unsubscribe from " + upperSymbol + ": " + e.getMessage());
            }
        }
    }

    @Override
    public boolean supports(String symbol) {
        return symbol != null && symbol.toUpperCase().endsWith("USDT");
    }
}