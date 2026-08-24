package com.avraham.trading.services;

import java.io.IOException;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutionException;

import org.springframework.beans.factory.annotation.Autowired;
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
 * Service responsible for managing the real-time WebSocket connection to the Binance cryptocurrency market stream.
 * It handles dynamic subscriptions, automatic reconnections, and parses raw trade payloads
 * to publish them to the central Kafka pipeline.
 * Implements the {@link MarketStreamProvider} interface to act as a strategy for crypto routing.
 */
@Service
public class BinanceLiveStreamService implements MarketStreamProvider {

    // Kafka topic where the market data will be published
    private static final String TOPIC = "market_ticks";
    
    // Base URL for Binance's raw WebSocket streams
    private static final String BINANCE_WS_URL = "wss://stream.binance.com:9443/ws"; 

    @Autowired
    private KafkaTemplate<String, MarketTick> kafkaTemplate;

    // State management: Thread-safe set to track active crypto subscriptions for reconnection handling
    private final Set<String> activeSymbols = Collections.synchronizedSet(new HashSet<>());
    
    // The active WebSocket session
    private WebSocketSession activeSession;
    
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Binance requires a unique ID for each subscription/unsubscription request
    private int requestIdCounter = 1;

    /**
     * Initializes the WebSocket connection immediately after the Spring bean is constructed.
     */
    @PostConstruct
    public void connectToBinance() {
        startConnection();
    }

    /**
     * Establishes the WebSocket connection to Binance.
     * Configures handlers to manage the connection lifecycle and process incoming market events.
     */
    private void startConnection() {
        StandardWebSocketClient client = new StandardWebSocketClient();
        
        try {
            client.execute(new TextWebSocketHandler() {
                
                @Override
                public void afterConnectionEstablished(WebSocketSession session) throws IOException {
                    BinanceLiveStreamService.this.activeSession = session;
                    System.out.println("[+] Connected to Binance Live Market WebSocket");
                    
                    // Binance public streams do not require authentication, so we can immediately
                    // restore previous subscriptions if this is a reconnection event.
                    resubscribeAll();
                }

                @Override
                public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
                    System.err.println("[-] Binance connection closed. Status: " + status + ". Attempting reconnect...");
                    BinanceLiveStreamService.this.activeSession = null;
                    
                    // Basic retry delay before attempting to reconnect
                    Thread.sleep(5000); 
                    startConnection();
                }

                @Override
                protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
                    JsonNode rootNode = objectMapper.readTree(message.getPayload());
                    
                    // Filter out response messages (e.g., subscription confirmations) which lack the "e" (event) field.
                    // We only process incoming "trade" events.
                    if (rootNode.has("e") && "trade".equals(rootNode.get("e").asText())) {
                        
                        // Extract trade details based on Binance's JSON schema
                        String symbol = rootNode.get("s").asText(); // "s": Symbol
                        double price = rootNode.get("p").asDouble(); // "p": Price
                        
                        // Extract volume ("q": Quantity) and cast to integer to match our schema
                        double rawVolume = rootNode.get("q").asDouble();
                        int volume = (int) Math.round(rawVolume);

                        // Construct the unified MarketTick record and publish to Kafka
                        MarketTick tick = new MarketTick(symbol, price, volume, System.currentTimeMillis());
                        kafkaTemplate.send(TOPIC, tick);
                    }
                }
            }, BINANCE_WS_URL).get();
        } catch (InterruptedException | ExecutionException e) {
            System.err.println("[-] Binance WebSocket connection error: " + e.getMessage());
        }
    }

    /**
     * Resubscribes to all cryptocurrency symbols currently held in the state.
     * Essential for preventing data loss after unexpected network disconnections.
     * 
     * @throws IOException If sending the WebSocket message fails.
     */
    private void resubscribeAll() throws IOException {
        if (activeSymbols.isEmpty() || activeSession == null || !activeSession.isOpen()) return;
        
        // Binance requires stream names in lowercase with the "@trade" suffix for raw trade streams
        String jsonParams = activeSymbols.stream()
                .map(s -> "\"" + s.toLowerCase() + "@trade\"")
                .collect(java.util.stream.Collectors.joining(","));
        
        // Construct the subscription payload with a unique incremental ID
        String subPayload = String.format("{\"method\": \"SUBSCRIBE\", \"params\": [%s], \"id\": %d}", jsonParams, requestIdCounter++);
        activeSession.sendMessage(new TextMessage(subPayload));
        System.out.println("[+] Resubscribed to active crypto trades: " + activeSymbols);
    }

    /**
     * Dynamically adds a new cryptocurrency pair to the active WebSocket stream.
     *
     * @param symbol The trading pair symbol to add (e.g., "BTCUSDT").
     */
    @Override
    public void subscribeSymbol(String symbol) {
        String upperSymbol = symbol.toUpperCase();
        
        // Only trigger the API request if the symbol was not already being tracked
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

    /**
     * Dynamically removes a cryptocurrency pair from the active WebSocket stream.
     *
     * @param symbol The trading pair symbol to remove.
     */
    @Override
    public void unsubscribeSymbol(String symbol) {
        String upperSymbol = symbol.toUpperCase();
        
        // Only trigger the API request if the symbol was actually present in our tracked state
        if (activeSymbols.remove(upperSymbol)) { 
            try {
                if (this.activeSession != null && this.activeSession.isOpen()) {
                    String streamName = upperSymbol.toLowerCase() + "@trade";
                    String unsubPayload = String.format("{\"method\": \"UNSUBSCRIBE\", \"params\": [\"%s\"], \"id\": %d}", streamName, requestIdCounter++);
                    this.activeSession.sendMessage(new TextMessage(unsubPayload));
                    System.out.println("[-] Unsubscribed from Binance: " + upperSymbol);
                }
            } catch (Exception e) {
                System.err.println("[-] Failed to unsubscribe from " + upperSymbol + ": " + e.getMessage());
            }
        }
    }

    /**
     * Evaluates whether this service should handle the given symbol.
     * Binance routes are identified by the presence of a stablecoin quote currency (e.g., "USDT").
     *
     * @param symbol The ticker symbol to check.
     * @return true if the symbol represents a Binance crypto pair (ends with "USDT").
     */
    @Override
    public boolean supports(String symbol) {
        return symbol != null && symbol.toUpperCase().endsWith("USDT");
    }
}