package com.avraham.trading.services;

import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Service
public class SimulationProducerService {

    private final KafkaTemplate<String, String> kafkaTemplate;
    private static final String REQUEST_TOPIC = "monte-carlo.requests";

    public SimulationProducerService(KafkaTemplate<String, String> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    /**
     * Publishes a simulation request to the Kafka topic.
     * 
     * @param payload The JSON request payload containing symbol and sessionId
     */
    public void sendSimulationRequest(String payload) {
        kafkaTemplate.send(REQUEST_TOPIC, payload);
        System.out.println("[*] Published simulation request to Kafka topic: " + REQUEST_TOPIC);
    }
}