package com.avraham.trading.services;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import com.avraham.trading.model.MarketTick;
import com.avraham.trading.model.OHLCVCandleDTO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Service responsible for fetching historical stock market data from the Alpaca REST API.
 * This service serves a dual purpose:
 * 1. Backfilling historical data (up to 365 days) and publishing it to Kafka for backend mathematical models.
 * 2. Fetching precise OHLCV chart data to populate the frontend UI immediately upon subscription.
 */
@Service
public class AlpacaHistoricalDataService {

    // Kafka topic where the historical market data will be published for the C++ engine
    private static final String TOPIC = "market_ticks";
    
    // REST API endpoint for historical daily bars used by the backend.
    private static final String ALPACA_BACKFILL_URL = "https://data.alpaca.markets/v2/stocks/%s/bars?timeframe=1Day&limit=365&start=%s&feed=iex";

    // REST API endpoint for fetching UI chart data with dynamic timeframes.
    private static final String ALPACA_CHART_URL = "https://data.alpaca.markets/v2/stocks/%s/bars?timeframe=%s&limit=1000&feed=iex";

    @Value("${alpaca.api.key}")
    private String apiKey;

    @Value("${alpaca.api.secret}")
    private String apiSecret;

    @Autowired
    private KafkaTemplate<String, MarketTick> kafkaTemplate;

    // Reusable HTTP Client and JSON Mapper for optimal performance
    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper objectMapper = new ObjectMapper();

    // ==========================================
    // BACKEND ENGINE METHODS (KAFKA PUBLISHING)
    // ==========================================

    /**
     * Fetches historical data for the specified symbol and triggers the publishing process to Kafka.
     * Calculates the start date dynamically (365 days in the past) and sends the GET request.
     *
     * @param symbol The stock ticker symbol (e.g., "AAPL", "NVDA") to fetch history for.
     */
    public void fetchAndPublishHistory(String symbol) {
        String startDate = LocalDate.now().minusDays(365).toString();
        String url = String.format(ALPACA_BACKFILL_URL, symbol, startDate);
        
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("APCA-API-KEY-ID", apiKey)
                .header("APCA-API-SECRET-KEY", apiSecret)
                .header("Accept", "application/json")
                .GET()
                .build();

        try {
            System.out.println("[*] Fetching historical stock data for: " + symbol + " from " + startDate);
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            
            if (response.statusCode() == 200) {
                parseAndPublish(symbol, response.body());
            } else {
                System.err.println("[-] Failed to fetch history for " + symbol + ". Status: " + response.statusCode());
                System.err.println("[-] Response: " + response.body());
            }
        } catch (Exception e) {
            System.err.println("[-] Error fetching Alpaca historical data: " + e.getMessage());
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
        
        if (barsNode != null && barsNode.isArray() && !barsNode.isEmpty()) {
            for (JsonNode bar : barsNode) {
                double closePrice = bar.get("c").asDouble();
                int volume = bar.get("v").asInt();
                String timeString = bar.get("t").asText();
                long timestamp = Instant.parse(timeString).toEpochMilli();

                MarketTick historicalTick = new MarketTick(symbol, closePrice, volume, timestamp);
                kafkaTemplate.send(TOPIC, symbol, historicalTick);
            }
            System.out.println("[+] Successfully backfilled " + barsNode.size() + " historical records for " + symbol);
        } else {
            System.out.println("[-] No historical data found for " + symbol);
        }
    }

    // ==========================================
    // FRONTEND UI METHODS (REST ENDPOINTS)
    // ==========================================

    /**
     * Fetches historical OHLCV chart data directly from the Alpaca API to serve the React frontend.
     * Maps standard timeframes to Alpaca's specific format and returns up to 1000 candles.
     *
     * @param symbol   The stock ticker symbol (e.g., "AAPL").
     * @param interval The timeframe interval requested by the frontend (e.g., "1m", "1h", "1d").
     * @return A list of OHLCVCandleDTOs ready to be rendered by TradingView charts.
     */
    public List<OHLCVCandleDTO> fetchChartData(String symbol, String interval) {
        List<OHLCVCandleDTO> candles = new ArrayList<>();
        String alpacaTimeframe = mapToAlpacaTimeframe(interval);
        String url = String.format(ALPACA_CHART_URL, symbol, alpacaTimeframe);
        
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("APCA-API-KEY-ID", apiKey)
                .header("APCA-API-SECRET-KEY", apiSecret)
                .header("Accept", "application/json")
                .GET()
                .build();
        
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            
            if (response.statusCode() == 200) {
                JsonNode root = objectMapper.readTree(response.body());
                JsonNode bars = root.get("bars");
                
                if (bars != null && bars.isArray()) {
                    for (JsonNode bar : bars) {
                        // Alpaca returns timestamp as an ISO-8601 string (e.g., "2021-04-13T14:30:00Z")
                        long time = Instant.parse(bar.get("t").asText()).toEpochMilli();
                        
                        double open = bar.get("o").asDouble();
                        double high = bar.get("h").asDouble();
                        double low = bar.get("l").asDouble();
                        double close = bar.get("c").asDouble();
                        double volume = bar.get("v").asDouble();
                        
                        candles.add(new OHLCVCandleDTO(time, open, high, low, close, volume));
                    }
                }
                System.out.println("[+] Fetched " + candles.size() + " historical chart candles for " + symbol);
            } else {
                System.err.println("[-] Failed to fetch UI chart data for " + symbol + ". Status: " + response.statusCode());
            }
        } catch (Exception e) {
            System.err.println("[-] Error fetching chart data from Alpaca for " + symbol + ": " + e.getMessage());
        }
        
        return candles;
    }

    /**
     * Helper method to map generic interval strings (from the React frontend) 
     * to Alpaca's strict required format.
     *
     * @param interval The generic interval (e.g., "1m").
     * @return The Alpaca-compliant timeframe string (e.g., "1Min").
     */
    private String mapToAlpacaTimeframe(String interval) {
        return switch (interval.toLowerCase()) {
            case "1m" -> "1Min";
            case "5m" -> "5Min";
            case "15m" -> "15Min";
            case "1h" -> "1Hour";
            case "1d" -> "1Day";
            default -> "1Min"; // Safe fallback
        };
    }
}