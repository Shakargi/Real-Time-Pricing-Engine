package com.avraham.trading.services;

import com.avraham.trading.model.OHLCVCandleDTO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSocket Handler responsible for establishing real-time communication with the client UI,
 * routing simulation requests, fetching necessary historical market data, and transmitting 
 * the requests to the Kafka messaging broker for asynchronous C++ processing.
 */
@Component
public class MonteCarloWebSocketHandler extends TextWebSocketHandler {

    private final SimulationProducerService producerService;
    private final AlpacaHistoricalDataService alpacaService;
    private final BinanceHistoricalDataService binanceService;
    
    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<String, WebSocketSession> activeSessions;

    /**
     * Constructor Injection for dependencies.
     */
    public MonteCarloWebSocketHandler(SimulationProducerService producerService,
                                      AlpacaHistoricalDataService alpacaService,
                                      BinanceHistoricalDataService binanceService) {
        this.producerService = producerService;
        this.alpacaService = alpacaService;
        this.binanceService = binanceService;
        
        this.objectMapper = new ObjectMapper();
        this.activeSessions = new ConcurrentHashMap<>();
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        activeSessions.put(session.getId(), session);
        System.out.println("[+] Client connected. Session ID: " + session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        try {
            JsonNode rootNode = objectMapper.readTree(message.getPayload());
            String symbol = rootNode.path("symbol").asText("AAPL");
            
            // Embed session ID for correct async response routing
            ((ObjectNode) rootNode).put("sessionId", session.getId());

            // Step 1: Fetch live market data based on the asset class
            List<OHLCVCandleDTO> candles;
            if (symbol.toUpperCase().endsWith("USDT")) {
                candles = binanceService.fetchChartData(symbol, "1d");
            } else {
                candles = alpacaService.fetchChartData(symbol, "1d");
            }

            // Step 2: Extract daily closing prices for mathematical modeling
            ArrayNode historicalPricesNode = ((ObjectNode) rootNode).putArray("historicalPrices");
            double currentPrice = 0.0;
            
            if (candles != null && !candles.isEmpty()) {
                for (OHLCVCandleDTO candle : candles) {
                    historicalPricesNode.add(candle.close());
                }
                
                // Identify the most recent closing price
                currentPrice = candles.get(candles.size() - 1).close();
            }
            
            ((ObjectNode) rootNode).put("currentPrice", currentPrice);

            // Step 3: Publish the enriched data packet to Kafka
            String enrichedPayload = objectMapper.writeValueAsString(rootNode);
            producerService.sendSimulationRequest(enrichedPayload);
            
            System.out.println("[*] Routed request to Kafka for session: " + session.getId() 
                             + " | Included " + historicalPricesNode.size() + " daily prices.");
            
        } catch (Exception e) {
            System.err.println("[-] Failed to process WebSocket message: " + e.getMessage());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        activeSessions.remove(session.getId());
        System.out.println("[-] Client disconnected. Session ID: " + session.getId());
    }

    /**
     * Routes the completed simulation results from the C++ worker back to the original client.
     * 
     * @param sessionId The unique WebSocket session identifier.
     * @param payload   The JSON serialized computation results.
     */
    public void sendResultToClient(String sessionId, String payload) {
        WebSocketSession session = activeSessions.get(sessionId);
        
        if (session != null && session.isOpen()) {
            try {
                session.sendMessage(new TextMessage(payload));
                System.out.println("[+] Sent simulation results back to session: " + sessionId);
            } catch (IOException e) {
                System.err.println("[-] Failed to send message to session: " + sessionId);
            }
        } else {
            System.err.println("[-] Session " + sessionId + " is closed or invalid. Dropping results.");
        }
    }
}