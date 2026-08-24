package com.avraham.trading.serivces;

import java.io.IOException;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutionException;

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
 * Service responsible for managing the real-time WebSocket connection to the Alpaca market data stream.
 * It handles authentication, dynamic subscriptions for stocks, automatic reconnections,
 * and parsing incoming market ticks to publish them to Kafka.
 * Implements the {@link MarketStreamProvider} interface for dynamic routing.
 */
@Service
public class AlpacaLiveStreamService implements MarketStreamProvider {

    // Kafka topic where the market data will be published
    private static final String TOPIC = "market_ticks";
    // Alpaca WebSocket URL for the free IEX data feed
    private static final String ALPACA_WS_URL = "wss://stream.data.alpaca.markets/v2/iex";

    @Value("${alpaca.api.key}")
    private String apiKey;

    @Value("${alpaca.api.secret}")
    private String apiSecret;

    @Autowired
    private KafkaTemplate<String, MarketTick> kafkaTemplate;

    // State management: Thread-safe set of currently subscribed symbols to allow recovery upon disconnection
    private final Set<String> activeSymbols = Collections.synchronizedSet(new HashSet<>());
    
    // The active WebSocket session used to send subscription requests dynamically
    private WebSocketSession activeSession;
    
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Initializes the WebSocket connection immediately after the Spring bean is constructed.
     */
    @PostConstruct
    public void connectToAlpaca() {
        startConnection();
    }

    /**
     * Establishes the WebSocket connection to Alpaca.
     * Configures handlers for successful connections, disconnections, and incoming messages.
     */
    private void startConnection() {
        StandardWebSocketClient client = new StandardWebSocketClient();
        try {
            client.execute(new TextWebSocketHandler() {
                
                @Override
                public void afterConnectionEstablished(WebSocketSession session) throws IOException {
                    AlpacaLiveStreamService.this.activeSession = session;
                    System.out.println("[+] Connected to Alpaca Live Market WebSocket");
                    
                    // Step 1: Authenticate first. Alpaca requires authentication before any subscription.
                    String authPayload = String.format("{\"action\": \"auth\", \"key\": \"%s\", \"secret\": \"%s\"}", apiKey, apiSecret);
                    session.sendMessage(new TextMessage(authPayload));
                }

                @Override
                public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
                    System.err.println("[-] Alpaca connection closed. Status: " + status + ". Attempting reconnect...");
                    AlpacaLiveStreamService.this.activeSession = null;
                    
                    // Basic retry mechanism. In a production system, an exponential backoff strategy is recommended here.
                    Thread.sleep(5000); 
                    startConnection();
                }

                @Override
                protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
                    JsonNode rootNode = objectMapper.readTree(message.getPayload());

                    // Alpaca sends payloads as JSON arrays
                    if (rootNode.isArray()) {
                        for (JsonNode node : rootNode) {
                            String messageType = node.get("T").asText();

                            // Wait for successful authentication before subscribing to tracked symbols
                            if ("success".equals(messageType) && "authenticated".equals(node.get("msg").asText())) {
                                // Step 2: Resubscribe to ALL previously active symbols after successful auth
                                resubscribeAll();
                            } else if ("t".equals(messageType)) { // 't' denotes a trade event
                                // Parse incoming trade message
                                String symbol = node.get("S").asText();
                                double price = node.get("p").asDouble();
                                int volume = node.get("s").asInt();

                                // Construct the tick and publish to the Kafka pipeline
                                MarketTick tick = new MarketTick(symbol, price, volume, System.currentTimeMillis());
                                kafkaTemplate.send(TOPIC, tick);
                            }
                        }
                    }
                }
            }, ALPACA_WS_URL).get();
        } catch (InterruptedException | ExecutionException e) {
            System.err.println("[-] Alpaca WebSocket connection error: " + e.getMessage());
        }
    }

    /**
     * Resubscribes to all symbols currently held in the state.
     * This ensures data continuity if the WebSocket connection drops and reconnects.
     * 
     * @throws IOException If sending the WebSocket message fails.
     */
    private void resubscribeAll() throws IOException {
        if (activeSymbols.isEmpty() || activeSession == null || !activeSession.isOpen()) return;
        
        // Format the set of symbols into a JSON array string
        String jsonSymbols = activeSymbols.stream()
                .map(s -> "\"" + s + "\"")
                .collect(java.util.stream.Collectors.joining(","));
        
        String subPayload = "{\"action\": \"subscribe\", \"trades\": [" + jsonSymbols + "]}";
        activeSession.sendMessage(new TextMessage(subPayload));
        System.out.println("[+] Resubscribed to active trades: " + activeSymbols);
    }

    /**
     * Dynamically adds a new stock symbol to the existing WebSocket stream.
     *
     * @param symbol The stock ticker symbol to add (e.g., "AAPL").
     */
    @Override
    public void subscribeSymbol(String symbol) {
        String upperSymbol = symbol.toUpperCase();
        // Add to the state; only send the WS request if it wasn't already tracked
        if (activeSymbols.add(upperSymbol)) { 
            try {
                if (this.activeSession != null && this.activeSession.isOpen()) {
                    String subPayload = "{\"action\": \"subscribe\", \"trades\": [\"" + upperSymbol + "\"]}";
                    this.activeSession.sendMessage(new TextMessage(subPayload));
                    System.out.println("[+] Subscribed to Alpaca: " + upperSymbol);
                }
            } catch (Exception e) {
                System.err.println("[-] Failed to subscribe to " + upperSymbol + ": " + e.getMessage());
            }
        }
    }

    /**
     * Dynamically removes a stock symbol from the existing WebSocket stream.
     *
     * @param symbol The stock ticker symbol to remove.
     */
    @Override
    public void unsubscribeSymbol(String symbol) {
        String upperSymbol = symbol.toUpperCase();
        // Remove from the state; only send the WS request if it was actually tracked
        if (activeSymbols.remove(upperSymbol)) { 
            try {
                if (this.activeSession != null && this.activeSession.isOpen()) {
                    String unsubPayload = "{\"action\": \"unsubscribe\", \"trades\": [\"" + upperSymbol + "\"]}";
                    this.activeSession.sendMessage(new TextMessage(unsubPayload));
                    System.out.println("[-] Unsubscribed from Alpaca: " + upperSymbol);
                }
            } catch (Exception e) {
                System.err.println("[-] Failed to unsubscribe from " + upperSymbol + ": " + e.getMessage());
            }
        }
    }

    /**
     * Evaluates whether this service should handle the given symbol.
     * Alpaca handles traditional stocks, which generally do not end with "USDT".
     *
     * @param symbol The ticker symbol to check.
     * @return true if the symbol does not end with "USDT", false otherwise.
     */
    @Override
    public boolean supports(String symbol) {
        // If it doesn't end with USDT, we route it to Alpaca
        return symbol != null && !symbol.toUpperCase().endsWith("USDT");
    }
}