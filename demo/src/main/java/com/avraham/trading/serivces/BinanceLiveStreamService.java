package com.avraham.trading.serivces;

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

@Service
public class BinanceLiveStreamService implements MarketStreamProvider {

    private static final String TOPIC = "market_ticks";
    // Changed to the base stream URL to allow dynamic subscriptions
    private static final String BINANCE_WS_URL = "wss://stream.binance.com:9443/ws"; 

    @Autowired
    private KafkaTemplate<String, MarketTick> kafkaTemplate;

    // State management
    private final Set<String> activeSymbols = Collections.synchronizedSet(new HashSet<>());
    private WebSocketSession activeSession;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Unique ID for Binance requests
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
                    
                    // Binance doesn't require auth for public streams, so we immediately resubscribe
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
                    
                    // Ignore response messages from Binance (they don't have an "e" event type)
                    if (rootNode.has("e") && "trade".equals(rootNode.get("e").asText())) {
                        String symbol = rootNode.get("s").asText();
                        double price = rootNode.get("p").asDouble();
                        
                        double rawVolume = rootNode.get("q").asDouble();
                        int volume = (int) Math.round(rawVolume);

                        MarketTick tick = new MarketTick(symbol, price, volume, System.currentTimeMillis());
                        kafkaTemplate.send(TOPIC, tick);
                    }
                }
            }, BINANCE_WS_URL).get();
        } catch (InterruptedException | ExecutionException e) {
            System.err.println("[-] Binance WebSocket connection error: " + e.getMessage());
        }
    }

    private void resubscribeAll() throws IOException {
        if (activeSymbols.isEmpty() || activeSession == null || !activeSession.isOpen()) return;
        
        // Binance requires the stream names in lowercase with "@trade" appended
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