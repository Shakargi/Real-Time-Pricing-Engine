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
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import com.avraham.trading.model.MarketTick;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.annotation.PostConstruct;

/**
 * Service responsible for establishing and maintaining a persistent WebSocket connection 
 * to the Alpaca market data stream (IEX free tier).
 * 
 * Features:
 * - Handshake and authentication flow.
 * - Dynamic subscription management for active trading symbols.
 * - Automatic reconnection with state recovery (resubscribing to active streams).
 * - Precise timestamp normalization (Exchange Time vs. Server Time).
 * - Client-side rate-limiting (throttling) before publishing to Kafka.
 */
@Service
public class AlpacaLiveStreamService implements MarketStreamProvider {

    private static final Logger logger = LoggerFactory.getLogger(AlpacaLiveStreamService.class);

    // Kafka configuration
    private static final String TOPIC = "market_ticks";
    
    // Alpaca WebSocket URL for the free IEX data feed
    private static final String ALPACA_WS_URL = "wss://stream.data.alpaca.markets/v2/iex";

    @Value("${alpaca.api.key}")
    private String apiKey;

    @Value("${alpaca.api.secret}")
    private String apiSecret;

    @Autowired
    private KafkaTemplate<String, MarketTick> kafkaTemplate;

    // State management: Thread-safe set of currently tracked symbols to allow recovery upon disconnection
    private final Set<String> activeSymbols = Collections.synchronizedSet(new HashSet<>());
    
    // Throttling state: Tracks the last time a tick was published to Kafka for each symbol
    private final Map<String, Long> lastSentTimes = new ConcurrentHashMap<>();
    
    // Maximum publishing rate per symbol (1000ms = 1 tick per second maximum)
    private static final long THROTTLE_MS = 1000;
    
    // The active WebSocket session used for lifecycle management and dynamic routing
    private WebSocketSession activeSession;
    
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Initializes the WebSocket connection lifecycle immediately after the Spring context loads.
     */
    @PostConstruct
    public void connectToAlpaca() {
        startConnection();
    }

    /**
     * Bootstraps the WebSocket client, establishes the connection, and defines 
     * the event handlers for connection lifecycle and message parsing.
     */
    private void startConnection() {
        StandardWebSocketClient client = new StandardWebSocketClient();
        
        try {
            client.execute(new TextWebSocketHandler() {
                
                @Override
                public void afterConnectionEstablished(WebSocketSession session) throws IOException {
                    AlpacaLiveStreamService.this.activeSession = session;
                    logger.info("[+] Successfully connected to Alpaca Live Market WebSocket");
                    
                    // Step 1: Authenticate. Alpaca requires successful authentication before allowing data subscriptions.
                    String authPayload = String.format("{\"action\": \"auth\", \"key\": \"%s\", \"secret\": \"%s\"}", apiKey, apiSecret);
                    session.sendMessage(new TextMessage(authPayload));
                }

                @Override
                public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
                    logger.warn("[-] Alpaca connection terminated. Status: {}. Attempting to reconnect...", status);
                    AlpacaLiveStreamService.this.activeSession = null;
                    
                    // Fallback retry mechanism. 
                    // Note: In enterprise systems, an exponential backoff strategy is highly recommended.
                    Thread.sleep(5000); 
                    startConnection();
                }

                @Override
                protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
                    JsonNode rootNode = objectMapper.readTree(message.getPayload());

                    // Alpaca transmits payloads as JSON arrays containing multiple event nodes
                    if (rootNode.isArray()) {
                        for (JsonNode node : rootNode) {
                            String messageType = node.path("T").asText();

                            // Handle successful authentication event
                            if ("success".equals(messageType) && "authenticated".equals(node.path("msg").asText())) {
                                logger.info("[+] Authentication successful. Recovering data streams...");
                                // Step 2: Resubscribe to ALL previously active symbols to restore state
                                resubscribeAll();
                            } 
                            // Handle incoming Trade events ('t')
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
     * Processes a single live trade event from the WebSocket stream, normalizes 
     * the exchange timestamps, applies throttling, and publishes to Kafka.
     *
     * @param node The JSON node containing the trade payload.
     */
    private void processTradeEvent(JsonNode node) {
        String symbol = node.path("S").asText();
        double price = node.path("p").asDouble();
        int volume = node.path("s").asInt(1);

        // ---------------------------------------------------------
        // Time Normalization: Extract the exact exchange transaction time
        // ---------------------------------------------------------
        long tickTimeMs = System.currentTimeMillis(); // Fallback to current server time
        JsonNode timeNode = node.get("t");
        
        if (timeNode != null && !timeNode.isNull()) {
            if (timeNode.isTextual()) {
                // Parse RFC3339 String format (commonly used in bar/candle events)
                tickTimeMs = Instant.parse(timeNode.asText()).toEpochMilli();
            } else {
                // Parse Nanoseconds format (commonly used in live trade events)
                long rawTime = timeNode.asLong();
                tickTimeMs = rawTime > 1e15 ? rawTime / 1_000_000 : rawTime * 1_000;
            }
        }

        // ---------------------------------------------------------
        // Throttling Logic: Decoupled from the actual asset timestamp
        // ---------------------------------------------------------
        long currentServerTime = System.currentTimeMillis();
        long lastSent = lastSentTimes.getOrDefault(symbol, 0L);

        // Publish to Kafka only if the throttle window has passed
        if (currentServerTime - lastSent >= THROTTLE_MS) {
            // Construct the tick using the true exchange timestamp, not the server time
            MarketTick tick = new MarketTick(symbol, price, volume, tickTimeMs);
            
            // Publish with 'symbol' as the key to guarantee Kafka partition affinity and chronological ordering
            kafkaTemplate.send(TOPIC, symbol, tick);
            
            // Update the throttle cache
            lastSentTimes.put(symbol, currentServerTime);
        }
    }

    /**
     * Resubscribes to all tracked symbols in the internal state.
     * Crucial for maintaining data continuity if the WebSocket connection drops and reconnects.
     * 
     * @throws IOException If the WebSocket message transmission fails.
     */
    private void resubscribeAll() throws IOException {
        if (activeSymbols.isEmpty() || activeSession == null || !activeSession.isOpen()) {
            return;
        }
        
        // Format the set of symbols into a valid JSON array format
        String jsonSymbols = activeSymbols.stream()
                .map(s -> "\"" + s + "\"")
                .collect(java.util.stream.Collectors.joining(","));
        
        String subPayload = "{\"action\": \"subscribe\", \"trades\": [" + jsonSymbols + "]}";
        activeSession.sendMessage(new TextMessage(subPayload));
        logger.info("[+] Recovered subscriptions for active trades: {}", activeSymbols);
    }

    /**
     * Dynamically adds a new asset symbol to the live WebSocket stream.
     *
     * @param symbol The ticker symbol to subscribe to (e.g., "AAPL").
     */
    @Override
    public void subscribeSymbol(String symbol) {
        String upperSymbol = symbol.toUpperCase();
        
        // Add to state; only transmit the request if it wasn't already tracked
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

    /**
     * Dynamically removes an asset symbol from the live WebSocket stream 
     * and clears it from the throttling cache.
     *
     * @param symbol The ticker symbol to remove.
     */
    @Override
    public void unsubscribeSymbol(String symbol) {
        String upperSymbol = symbol.toUpperCase();
        
        // Remove from state; only transmit the request if it was actively tracked
        if (activeSymbols.remove(upperSymbol)) { 
            try {
                if (this.activeSession != null && this.activeSession.isOpen()) {
                    String unsubPayload = "{\"action\": \"unsubscribe\", \"trades\": [\"" + upperSymbol + "\"]}";
                    this.activeSession.sendMessage(new TextMessage(unsubPayload));
                    logger.info("[-] Successfully unsubscribed from Alpaca feed: {}", upperSymbol);
                }
                
                // Evict from throttle cache to prevent memory leaks over the application lifecycle
                lastSentTimes.remove(upperSymbol);
                
            } catch (Exception e) {
                logger.error("[-] Failed to unsubscribe from {}: {}", upperSymbol, e.getMessage());
            }
        }
    }

    /**
     * Evaluates whether this specific provider should handle the given symbol.
     * Alpaca handles traditional equities and ETFs, which generally do not end with "USDT".
     *
     * @param symbol The ticker symbol to evaluate.
     * @return true if the symbol is a traditional asset (does not end with "USDT").
     */
    @Override
    public boolean supports(String symbol) {
        return symbol != null && !symbol.toUpperCase().endsWith("USDT");
    }
}