package com.avraham.trading.serivces;

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

@Service
public class AlpacaHistoricalDataService {

    private static final String TOPIC = "market_ticks";
    private static final String ALPACA_REST_URL = "https://data.alpaca.markets/v2/stocks/%s/bars?timeframe=1Day&limit=365";

    @Value("${alpaca.api.key}")
    private String apiKey;

    @Value("${alpaca.api.secret}")
    private String apiSecret;

    @Autowired
    private KafkaTemplate<String, MarketTick> kafkaTemplate;

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper objectMapper = new ObjectMapper();

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

    private void parseAndPublish(String symbol, String jsonBody) throws Exception {
        JsonNode rootNode = objectMapper.readTree(jsonBody);
        JsonNode barsNode = rootNode.get("bars");
        
        if (barsNode != null && barsNode.isArray()) {
            for (JsonNode bar : barsNode) {
                // שולפים את נתוני הסגירה של הנר
                double closePrice = bar.get("c").asDouble();
                int volume = bar.get("v").asInt();
                
                // ממירים את זמן הנר (פורמט RFC3339) למילי-שניות
                String timeString = bar.get("t").asText();
                long timestamp = Instant.parse(timeString).toEpochMilli();

                // יוצרים את הטיק ודוחפים לקפקא
                MarketTick historicalTick = new MarketTick(symbol, closePrice, volume, timestamp);
                kafkaTemplate.send(TOPIC, historicalTick);
            }
            System.out.println("[+] Successfully backfilled " + barsNode.size() + " historical records for " + symbol);
        } else {
            System.out.println("[-] No historical data found for " + symbol);
        }
    }
}