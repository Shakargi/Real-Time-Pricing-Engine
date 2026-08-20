package com.avraham.trading.serivce;

import java.util.concurrent.ExecutionException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import com.avraham.trading.model.MarketTick;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.annotation.PostConstruct;

@Service
public class BinanceLiveStreamService {

    private static final String TOPIC = "market_ticks";
    private static final String BINANCE_WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@trade/ethusdt@trade";

    @Autowired
    private KafkaTemplate<String, MarketTick> kafkaTemplate;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @PostConstruct
    public void connectToBinance() {
        StandardWebSocketClient client = new StandardWebSocketClient();
        
        try {
            client.execute(new TextWebSocketHandler() {
                @Override
                public void afterConnectionEstablished(WebSocketSession session) {
                    System.out.println("[+] Connected to Binance Live Market WebSocket");
                }

                @Override
                protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
                    JsonNode rootNode = objectMapper.readTree(message.getPayload());
                    
                    String symbol = rootNode.get("s").asText();
                    double price = rootNode.get("p").asDouble();
                    
                    // Cast volume to int to match MarketTick record constraints
                    double rawVolume = rootNode.get("q").asDouble();
                    int volume = (int) Math.round(rawVolume);

                    MarketTick tick = new MarketTick(symbol, price, volume, System.currentTimeMillis());
                    kafkaTemplate.send(TOPIC, tick);
                }
            }, BINANCE_WS_URL).get();
        } catch (InterruptedException | ExecutionException e) {
            System.err.println("[-] WebSocket connection error: " + e.getMessage());
        }
    }
}