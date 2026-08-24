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

@Service
public class AlpacaLiveStreamService implements MarketStreamProvider {

    private static final String TOPIC = "market_ticks";
    private static final String ALPACA_WS_URL = "wss://stream.data.alpaca.markets/v2/iex";

    @Value("${alpaca.api.key}")
    private String apiKey;

    @Value("${alpaca.api.secret}")
    private String apiSecret;

    @Autowired
    private KafkaTemplate<String, MarketTick> kafkaTemplate;

    // State management: Thread-safe set of currently subscribed symbols
    private final Set<String> activeSymbols = Collections.synchronizedSet(new HashSet<>());
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
                    System.out.println("[+] Connected to Alpaca Live Market WebSocket");
                    
                    // 1. Authenticate first
                    String authPayload = String.format("{\"action\": \"auth\", \"key\": \"%s\", \"secret\": \"%s\"}", apiKey, apiSecret);
                    session.sendMessage(new TextMessage(authPayload));
                }

                @Override
                public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
                    System.err.println("[-] Alpaca connection closed. Status: " + status + ". Attempting reconnect...");
                    AlpacaLiveStreamService.this.activeSession = null;
                    // In a production system, you'd want exponential backoff here.
                    Thread.sleep(5000); 
                    startConnection();
                }

                @Override
                protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
                    JsonNode rootNode = objectMapper.readTree(message.getPayload());

                    if (rootNode.isArray()) {
                        for (JsonNode node : rootNode) {
                            String messageType = node.get("T").asText();

                            if ("success".equals(messageType) && "authenticated".equals(node.get("msg").asText())) {
                                // 2. Resubscribe to ALL active symbols after successful auth
                                resubscribeAll();
                            } else if ("t".equals(messageType)) {
                                String symbol = node.get("S").asText();
                                double price = node.get("p").asDouble();
                                int volume = node.get("s").asInt();

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

    private void resubscribeAll() throws IOException {
        if (activeSymbols.isEmpty() || activeSession == null || !activeSession.isOpen()) return;
        
        String jsonSymbols = activeSymbols.stream()
                .map(s -> "\"" + s + "\"")
                .collect(java.util.stream.Collectors.joining(","));
        
        String subPayload = "{\"action\": \"subscribe\", \"trades\": [" + jsonSymbols + "]}";
        activeSession.sendMessage(new TextMessage(subPayload));
        System.out.println("[+] Resubscribed to active trades: " + activeSymbols);
    }

    @Override
    public void subscribeSymbol(String symbol) {
        String upperSymbol = symbol.toUpperCase();
        if (activeSymbols.add(upperSymbol)) { // only if it wasn't already there
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

    @Override
    public void unsubscribeSymbol(String symbol) {
        String upperSymbol = symbol.toUpperCase();
        if (activeSymbols.remove(upperSymbol)) { // only if it was actually there
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

    @Override
    public boolean supports(String symbol) {
        // If it doesn't end with USDT, we route it to Alpaca
        return symbol != null && !symbol.toUpperCase().endsWith("USDT");
    }
}