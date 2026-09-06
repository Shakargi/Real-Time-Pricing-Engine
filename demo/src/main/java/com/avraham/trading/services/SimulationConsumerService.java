package com.avraham.trading.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

@Service
public class SimulationConsumerService {

    private final MonteCarloWebSocketHandler webSocketHandler;
    // Instantiate ObjectMapper directly to avoid missing bean errors
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Removed ObjectMapper from constructor parameters
    public SimulationConsumerService(MonteCarloWebSocketHandler webSocketHandler) {
        this.webSocketHandler = webSocketHandler;
    }

    @KafkaListener(topics = "monte-carlo.results", groupId = "trading-backend-group")
    public void consumeSimulationResult(String payload) {
        try {
            System.out.println("[*] Received simulation results from C++ engine via Kafka.");
            
            JsonNode rootNode = objectMapper.readTree(payload);
            if (rootNode.has("sessionId")) {
                String sessionId = rootNode.get("sessionId").asText();
                
                webSocketHandler.sendResultToClient(sessionId, payload);
            } else {
                System.err.println("[-] Received result without sessionId. Cannot route to client.");
            }
        } catch (Exception e) {
            System.err.println("[-] Failed to process simulation result: " + e.getMessage());
        }
    }
}