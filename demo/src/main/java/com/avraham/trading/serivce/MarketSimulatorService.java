package com.avraham.trading.serivce;

import java.time.Instant;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.avraham.trading.model.MarketTick;

@Service
@EnableScheduling
public class MarketSimulatorService {

    private final KafkaTemplate<String, MarketTick> kafkaTemplate;
    private final String TOPIC = "market_ticks";
    private final Random random = new Random();
    
    private final Map<String, Double> currentPrices = new ConcurrentHashMap<>(Map.of(
            "AAPL", 150.0,
            "MSFT", 300.0,
            "TSLA", 250.0
    ));

    public MarketSimulatorService(KafkaTemplate<String, MarketTick> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    @Scheduled(fixedRate = 100)
    public void generateMarketTicks() {
        currentPrices.forEach((symbol, price) -> {
            double volatility = (random.nextDouble() * 0.02) - 0.01;
            double newPrice = price * (1 + volatility);
            currentPrices.put(symbol, newPrice);

            MarketTick tick = new MarketTick(
                    symbol,
                    Math.round(newPrice * 100.0) / 100.0,
                    random.nextInt(100) + 1,
                    Instant.now().toEpochMilli()
            );

            kafkaTemplate.send(TOPIC, symbol, tick).whenComplete((result, ex) -> {
                if (ex != null) {
                    System.err.println("Failed to send tick for " + symbol + ": " + ex.getMessage());
                }
            });
        });
    }
}