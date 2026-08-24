package com.avraham.trading.services;

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

/**
 * Service responsible for fetching historical cryptocurrency market data from the Binance REST API.
 * This acts as a backfill mechanism, retrieving up to 365 days of historical candlesticks (klines)
 * to initialize the mathematical pricing models before live WebSocket data begins.
 */
@Service
public class BinanceHistoricalDataService {

    // Kafka topic where the historical market data will be published
    private static final String TOPIC = "market_ticks";
    
    // REST API endpoint to fetch 365 days of daily klines (candlesticks) for a given crypto symbol
    private static final String BINANCE_REST_URL = "https://api.binance.com/api/v3/klines?symbol=%s&interval=1d&limit=365";

    @Autowired
    private KafkaTemplate<String, MarketTick> kafkaTemplate;

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Fetches historical klines for the specified cryptocurrency symbol and triggers the publishing process.
     * Constructs and sends an HTTP GET request to the public Binance API (no authentication required).
     *
     * @param symbol The cryptocurrency ticker symbol (e.g., "BTCUSDT", "ETHUSDT") to fetch history for.
     */
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

    /**
     * Parses the JSON response from Binance and publishes each historical kline to Kafka.
     * Note: Binance returns a mixed-type array for klines rather than key-value objects.
     *
     * @param symbol   The cryptocurrency ticker symbol.
     * @param jsonBody The raw JSON response body returned by the Binance API.
     * @throws Exception If JSON parsing or data extraction fails.
     */
    private void parseAndPublish(String symbol, String jsonBody) throws Exception {
        JsonNode rootNode = objectMapper.readTree(jsonBody);

        if (rootNode.isArray()) {
            for (JsonNode kline : rootNode) {
                // Extract data based on Binance's fixed array indices:
                // Index 0: Kline open time
                // Index 4: Close price
                // Index 5: Volume
                long openTime = kline.get(0).asLong();
                double closePrice = kline.get(4).asDouble();
                
                // Read volume as a double and cast to int to match the MarketTick schema
                double rawVolume = kline.get(5).asDouble();
                int volume = (int) Math.round(rawVolume);

                // Create the MarketTick record and publish it to the Kafka pipeline
                MarketTick historicalTick = new MarketTick(symbol, closePrice, volume, openTime);
                kafkaTemplate.send(TOPIC, historicalTick);
            }
            System.out.println("[+] Successfully backfilled " + rootNode.size() + " historical records for " + symbol);
        }
    }
}