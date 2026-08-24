package com.avraham.trading;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * The main entry point for the Spring Boot trading application.
 * Bootstraps the application context, starts the embedded web server (Tomcat),
 * and initializes all configured components including REST controllers, 
 * Kafka producers, and WebSocket connections.
 */
@SpringBootApplication
@EnableScheduling
public class TradingApplication {
    
    /**
     * The main method that launches the application.
     * 
     * @param args Command-line arguments passed during application startup.
     */
    public static void main(String[] args) {
        SpringApplication.run(TradingApplication.class, args);
    }
}