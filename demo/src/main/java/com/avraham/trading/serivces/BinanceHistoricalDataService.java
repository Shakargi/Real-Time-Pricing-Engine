package com.avraham.trading.serivces;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import com.avraham.trading.model.MarketTick;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class BinanceHistoricalDataService {

    private static final String TOPIC = "market_ticks";
    private static final String BINANCE_REST_URL = "https://api.binance.com/api/v3/klines?symbol=%s&interval=1d&limit=365";

    @Autowired
    private KafkaTemplate<String, MarketTick> kafkaTemplate;

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public void fetchAndPublishHistory(String symbol) {
        String url = String.format(BINANCE_REST_URL, symbol);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Accept", "application/json")
                .GET()
                .build();

        try {
            System.out.println("[*] Fetching historical crypto data for: " + symbol);
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                parseAndPublish(symbol, response.body());
            } else {
                System.err.println("[-] Failed to fetch history for " + symbol + ". Status: " + response.statusCode());
            }
        } catch (Exception e) {
            System.err.println("[-] Error fetching Binance historical data: " + e.getMessage());
        }
    }

    private void parseAndPublish(String symbol, String jsonBody) throws Exception {
        JsonNode rootNode = objectMapper.readTree(jsonBody);

        if (rootNode.isArray()) {
            for (JsonNode kline : rootNode) {
                long openTime = kline.get(0).asLong();
                double closePrice = kline.get(4).asDouble();
                
                double rawVolume = kline.get(5).asDouble();
                int volume = (int) Math.round(rawVolume);

                MarketTick historicalTick = new MarketTick(symbol, closePrice, volume, openTime);
                kafkaTemplate.send(TOPIC, historicalTick);
            }
            System.out.println("[+] Successfully backfilled " + rootNode.size() + " historical records for " + symbol);
        }
    }
}