package com.avraham.trading.services;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import com.avraham.trading.model.MarketTick;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Service responsible for fetching historical stock market data from the Alpaca REST API.
 * This service acts as a backfill mechanism, retrieving past market data (up to 365 days)
 * and publishing it to Kafka before the real-time stream is established.
 */
@Service
public class AlpacaHistoricalDataService {

    private static final String TOPIC = "market_ticks";
    // REST API endpoint to fetch 365 days of historical daily bars for a given symbol
    private static final String ALPACA_REST_URL = "https://data.alpaca.markets/v2/stocks/%s/bars?timeframe=1Day&limit=365";

    @Value("${alpaca.api.key}")
    private String apiKey;

    @Value("${alpaca.api.secret}")
    private String apiSecret;

    @Autowired
    private KafkaTemplate<String, MarketTick> kafkaTemplate;

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Fetches historical data for the specified symbol and triggers the publishing process.
     * Constructs and sends an HTTP GET request to the Alpaca API.
     *
     * @param symbol The stock ticker symbol (e.g., "AAPL", "NVDA") to fetch history for.
     */
    public void fetchAndPublishHistory(String symbol) {
        String url = String.format(ALPACA_REST_URL, symbol);
        
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("APCA-API-KEY-ID", apiKey)
                .header("APCA-API-SECRET-KEY", apiSecret)
                .header("Accept", "application/json")
                .GET()
                .build();

        try {
            System.out.println("[*] Fetching historical data for: " + symbol);
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            
            if (response.statusCode() == 200) {
                parseAndPublish(symbol, response.body());
            } else {
                System.err.println("[-] Failed to fetch history for " + symbol + ". Status: " + response.statusCode());
                System.err.println("[-] Response: " + response.body());
            }
        } catch (Exception e) {
            System.err.println("[-] Error fetching historical data: " + e.getMessage());
        }
    }

    /**
     * Parses the JSON response from Alpaca and publishes each historical bar to Kafka.
     *
     * @param symbol   The stock ticker symbol.
     * @param jsonBody The raw JSON response body returned by the Alpaca API.
     * @throws Exception If JSON parsing or data extraction fails.
     */
    private void parseAndPublish(String symbol, String jsonBody) throws Exception {
        JsonNode rootNode = objectMapper.readTree(jsonBody);
        JsonNode barsNode = rootNode.get("bars");
        
        if (barsNode != null && barsNode.isArray()) {
            for (JsonNode bar : barsNode) {
                // Extract the closing price and volume for the current bar
                double closePrice = bar.get("c").asDouble();
                int volume = bar.get("v").asInt();
                
                // Convert the bar timestamp (RFC3339 format) to epoch milliseconds
                String timeString = bar.get("t").asText();
                long timestamp = Instant.parse(timeString).toEpochMilli();

                // Create the MarketTick record and publish it to the Kafka topic
                MarketTick historicalTick = new MarketTick(symbol, closePrice, volume, timestamp);
                kafkaTemplate.send(TOPIC, historicalTick);
            }
            System.out.println("[+] Successfully backfilled " + barsNode.size() + " historical records for " + symbol);
        } else {
            System.out.println("[-] No historical data found for " + symbol);
        }
    }
}