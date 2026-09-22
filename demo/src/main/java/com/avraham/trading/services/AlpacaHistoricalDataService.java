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
 *
 * IMPORTANT: Alpaca's /v2/stocks/{symbol}/bars endpoint paginates its responses. Even when the
 * caller passes a large "limit", a single HTTP response can still come back with only a subset of
 * the bars for the requested range plus a "next_page_token". Every method below now follows that
 * token until it is null, otherwise higher-resolution timeframes (1Min/5Min/15Min/1Hour) over long
 * ranges silently truncate at the edge of the first page while low-resolution ranges (1Day, few
 * bars) happen to fit in a single page and look fine.
 */
@Service
public class AlpacaHistoricalDataService {

    // Kafka topic where the historical market data will be published for the C++ engine
    private static final String TOPIC = "market_ticks";

    // REST API endpoint for historical daily bars used by the backend.
    private static final String ALPACA_BACKFILL_URL = "https://data.alpaca.markets/v2/stocks/%s/bars?timeframe=1Day&limit=10000&start=%s&feed=iex";

    // Safety cap on total bars pulled across all pages for a single request, to avoid runaway loops.
    private static final int MAX_TOTAL_BARS = 50_000;

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
     * Calculates the start date dynamically (365 days in the past) and pages through the Alpaca
     * response until next_page_token is exhausted, so the full year is actually backfilled.
     *
     * @param symbol The stock ticker symbol (e.g., "AAPL", "NVDA") to fetch history for.
     */
    public void fetchAndPublishHistory(String symbol) {
        String startDate = LocalDate.now().minusDays(365).toString();
        String baseUrl = String.format(ALPACA_BACKFILL_URL, symbol, startDate);

        int totalPublished = 0;
        String pageToken = null;

        try {
            System.out.println("[*] Fetching historical stock data for: " + symbol + " from " + startDate);

            do {
                String url = pageToken == null ? baseUrl : baseUrl + "&page_token=" + pageToken;

                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .header("APCA-API-KEY-ID", apiKey)
                        .header("APCA-API-SECRET-KEY", apiSecret)
                        .header("Accept", "application/json")
                        .GET()
                        .build();

                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

                if (response.statusCode() != 200) {
                    System.err.println("[-] Failed to fetch history for " + symbol + ". Status: " + response.statusCode());
                    System.err.println("[-] Response: " + response.body());
                    break;
                }

                JsonNode rootNode = objectMapper.readTree(response.body());
                totalPublished += publishBars(symbol, rootNode.get("bars"));

                JsonNode nextTokenNode = rootNode.get("next_page_token");
                pageToken = (nextTokenNode != null && !nextTokenNode.isNull()) ? nextTokenNode.asText() : null;

            } while (pageToken != null && totalPublished < MAX_TOTAL_BARS);

            System.out.println("[+] Successfully backfilled " + totalPublished + " historical records for " + symbol);

        } catch (Exception e) {
            System.err.println("[-] Error fetching Alpaca historical data: " + e.getMessage());
        }
    }

    /**
     * Publishes a single page's worth of bars to Kafka.
     *
     * @param symbol  The stock ticker symbol.
     * @param barsNode The "bars" array node from one page of the Alpaca response (may be null/empty).
     * @return The number of bars published from this page.
     */
    private int publishBars(String symbol, JsonNode barsNode) {
        if (barsNode == null || !barsNode.isArray() || barsNode.isEmpty()) {
            return 0;
        }

        int count = 0;
        for (JsonNode bar : barsNode) {
            double closePrice = bar.get("c").asDouble();
            int volume = bar.get("v").asInt();
            String timeString = bar.get("t").asText();
            long timestamp = Instant.parse(timeString).toEpochMilli();

            MarketTick historicalTick = new MarketTick(symbol, closePrice, volume, timestamp);
            kafkaTemplate.send(TOPIC, symbol, historicalTick);
            count++;
        }
        return count;
    }

    // ==========================================
    // FRONTEND UI METHODS (REST ENDPOINTS)
    // ==========================================

    /**
     * Fetches historical OHLCV chart data directly from the Alpaca API to serve the React frontend.
     * Maps standard timeframes to Alpaca's specific format, anchors requests securely to the current
     * time, and pages through the full result set via next_page_token so intraday timeframes (1m,
     * 5m, 15m, 1h) return data all the way up to "now" instead of stopping at the first page.
     *
     * @param symbol   The stock ticker symbol (e.g., "AAPL").
     * @param interval The timeframe interval requested by the frontend (e.g., "1m", "1h", "1d").
     * @return A list of OHLCVCandleDTOs ready to be rendered by TradingView charts.
     */
    public List<OHLCVCandleDTO> fetchChartData(String symbol, String interval) {
        List<OHLCVCandleDTO> candles = new ArrayList<>();
        String alpacaTimeframe = mapToAlpacaTimeframe(interval);

        LocalDate startDate;
        switch (interval.toLowerCase()) {
            case "1d":
                startDate = LocalDate.now().minusYears(1);
                break;
            case "1h":
                startDate = LocalDate.now().minusMonths(4);
                break;
            case "15m":
                startDate = LocalDate.now().minusDays(28);
                break;
            case "5m":
                startDate = LocalDate.now().minusDays(10);
                break;
            case "1m":
            default:
                startDate = LocalDate.now().minusDays(5);
                break;
        }

        // Precise RFC-3339 formatting to prevent timeline gaps
        String startParam = startDate.toString() + "T00:00:00Z";
        String endParam = Instant.now().toString();

        String baseUrl = String.format(
                "https://data.alpaca.markets/v2/stocks/%s/bars?timeframe=%s&limit=10000&start=%s&end=%s&feed=iex",
                symbol, alpacaTimeframe, startParam, endParam);

        String pageToken = null;

        try {
            do {
                String url = pageToken == null ? baseUrl : baseUrl + "&page_token=" + pageToken;

                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .header("APCA-API-KEY-ID", apiKey)
                        .header("APCA-API-SECRET-KEY", apiSecret)
                        .header("Accept", "application/json")
                        .GET()
                        .build();

                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

                if (response.statusCode() != 200) {
                    System.err.println("[-] Failed to fetch UI chart data for " + symbol + ". Status: " + response.statusCode());
                    break;
                }

                JsonNode root = objectMapper.readTree(response.body());
                JsonNode bars = root.get("bars");

                if (bars != null && bars.isArray()) {
                    for (JsonNode bar : bars) {
                        long time = Instant.parse(bar.get("t").asText()).toEpochMilli();
                        double open = bar.get("o").asDouble();
                        double high = bar.get("h").asDouble();
                        double low = bar.get("l").asDouble();
                        double close = bar.get("c").asDouble();
                        double volume = bar.get("v").asDouble();

                        boolean isFlatline = (open == close) && (high == low);
                        if (volume <= 0 || isFlatline) {
                            continue;
                        }

                        candles.add(new OHLCVCandleDTO(time, open, high, low, close, volume));
                    }
                }

                JsonNode nextTokenNode = root.get("next_page_token");
                pageToken = (nextTokenNode != null && !nextTokenNode.isNull()) ? nextTokenNode.asText() : null;

            } while (pageToken != null && candles.size() < MAX_TOTAL_BARS);

            System.out.println("[+] Fetched " + candles.size() + " historical chart candles for " + symbol);

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