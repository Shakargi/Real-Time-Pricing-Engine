package com.avraham.trading.services;

import com.avraham.trading.services.MonteCarloWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final MonteCarloWebSocketHandler monteCarloWebSocketHandler;

    public WebSocketConfig(MonteCarloWebSocketHandler monteCarloWebSocketHandler) {
        this.monteCarloWebSocketHandler = monteCarloWebSocketHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(monteCarloWebSocketHandler, "/ws/monte-carlo")
                .setAllowedOrigins("*");
    }
}
