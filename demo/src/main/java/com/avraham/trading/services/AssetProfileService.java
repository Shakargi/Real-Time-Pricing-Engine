package com.avraham.trading.services;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Service responsible for fetching fundamental asset data and corporate profiles.
 * Integrates cleanly with Finnhub API, eliminating the need for WAF bypasses or browser spoofing.
 */
@Service
public class AssetProfileService {

    private static final Logger logger = LoggerFactory.getLogger(AssetProfileService.class);
    
    // Finnhub endpoints
    private static final String FINNHUB_BASE_URL = "https://finnhub.io/api/v1";
    private static final String PROFILE_ENDPOINT = "/stock/profile2?symbol=%s";
    private static final String METRICS_ENDPOINT = "/stock/metric?symbol=%s&metric=all";

    @Value("${finnhub.api.key:}") // Falls back to empty string if not defined
    private String apiKey;

    private final HttpClient httpClient;
    private final ObjectMapper mapper;

    // The watchlist now requests a profile per symbol (for logos), and each profile costs 2 Finnhub
    // calls against a 60/min free-tier limit, so successful lookups are cached.
    private static final long PROFILE_TTL_MS = Duration.ofHours(24).toMillis();
    private record CachedProfile(Map<String, String> profile, long fetchedAt) {}
    private final Map<String, CachedProfile> profileCache = new ConcurrentHashMap<>();

    public AssetProfileService() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        this.mapper = new ObjectMapper();
    }

    public Map<String, String> getAssetProfile(String symbol) {
        String key = symbol.toUpperCase();
        CachedProfile cached = profileCache.get(key);
        if (cached != null && System.currentTimeMillis() - cached.fetchedAt() < PROFILE_TTL_MS) {
            return new HashMap<>(cached.profile());
        }

        Map<String, String> fresh = fetchAssetProfile(symbol);

        // Cache only complete results: "logo" exists only when the profile call succeeded and
        // "beta" only when the metrics call did. Fallbacks and rate-limited (partial) results
        // are not cached, so a transient failure isn't sticky.
        if (fresh.containsKey("logo") && fresh.containsKey("beta")) {
            profileCache.put(key, new CachedProfile(new HashMap<>(fresh), System.currentTimeMillis()));
        }
        return fresh;
    }

    private Map<String, String> fetchAssetProfile(String symbol) {
        // Fallback instantly if no API key is configured
        if (apiKey == null || apiKey.trim().isEmpty()) {
            logger.warn("[-] Finnhub API Key is missing. Using generic fallback for {}", symbol);
            return getGenericFallbackProfile(symbol);
        }

        Map<String, String> profile = new HashMap<>();
        String querySymbol = symbol.toUpperCase();
        
        try {
            // 1. Fetch Company Profile (Name, Sector, Market Cap)
            String profileUrl = String.format(FINNHUB_BASE_URL + PROFILE_ENDPOINT, querySymbol);
            HttpRequest profileRequest = HttpRequest.newBuilder()
                    .uri(URI.create(profileUrl))
                    .header("X-Finnhub-Token", apiKey)
                    .GET()
                    .build();

            HttpResponse<String> profileResponse = httpClient.send(profileRequest, HttpResponse.BodyHandlers.ofString());
            
            if (profileResponse.statusCode() == 200) {
                JsonNode pNode = mapper.readTree(profileResponse.body());
                
                // If Finnhub returns an empty object, it means the symbol is invalid/crypto
                if (pNode.isEmpty()) {
                    return getGenericFallbackProfile(symbol);
                }

                profile.put("name", pNode.path("name").asText(symbol));
                profile.put("sector", pNode.path("finnhubIndustry").asText("N/A"));
                
                // Format Market Cap (Finnhub returns in Millions)
                double mcapMillions = pNode.path("marketCapitalization").asDouble(0);
                profile.put("marketCap", formatMarketCap(mcapMillions));
                profile.put("logo", pNode.path("logo").asText("")); // Finnhub-hosted logo URL (may be empty)
                
                // Note: Finnhub free tier doesn't provide long business descriptions, 
                // so we use a clean default message.
                profile.put("description", pNode.path("name").asText(symbol) + " operates within the " + 
                            pNode.path("finnhubIndustry").asText("financial") + " sector.");
            }

            // 2. Fetch Basic Metrics (P/E, Beta, Dividend)
            String metricsUrl = String.format(FINNHUB_BASE_URL + METRICS_ENDPOINT, querySymbol);
            HttpRequest metricsRequest = HttpRequest.newBuilder()
                    .uri(URI.create(metricsUrl))
                    .header("X-Finnhub-Token", apiKey)
                    .GET()
                    .build();
                    
            HttpResponse<String> metricsResponse = httpClient.send(metricsRequest, HttpResponse.BodyHandlers.ofString());

            if (metricsResponse.statusCode() == 200) {
                JsonNode mNode = mapper.readTree(metricsResponse.body());
                JsonNode metricData = mNode.path("metric");
                
                if (!metricData.isMissingNode()) {
                    profile.put("trailingPE", extractMetric(metricData, "peNormalizedAnnual"));
                    profile.put("beta", extractMetric(metricData, "beta"));
                    
                    double divYield = metricData.path("dividendYieldIndicatedAnnual").asDouble(0);
                    profile.put("dividendYield", divYield > 0 ? String.format("%.2f%%", divYield) : "N/A");
                }
            }
            
            return profile;

        } catch (Exception e) {
            logger.error("[-] Error fetching Finnhub data for {}: {}", symbol, e.getMessage());
        }
        
        return getGenericFallbackProfile(symbol);
    }

    /**
     * Extracts a numeric metric safely and formats it as a string.
     */
    private String extractMetric(JsonNode node, String field) {
        if (node.has(field) && !node.get(field).isNull()) {
            return String.format("%.2f", node.get(field).asDouble());
        }
        return "N/A";
    }
    
    /**
     * Converts market cap from millions to a readable string (B or T).
     */
    private String formatMarketCap(double millions) {
        if (millions <= 0) return "N/A";
        if (millions >= 1_000_000) {
            return String.format("%.2fT", millions / 1_000_000);
        } else if (millions >= 1_000) {
            return String.format("%.2fB", millions / 1_000);
        }
        return String.format("%.2fM", millions);
    }

    /**
     * A generic, dynamic fallback that handles any requested symbol if the API fails.
     */
    private Map<String, String> getGenericFallbackProfile(String symbol) {
        Map<String, String> fallback = new HashMap<>();
        fallback.put("name", symbol + " (Data Offline)");
        fallback.put("sector", "N/A");
        fallback.put("description", "Fundamental data is currently unavailable. Market pricing and real-time metrics remain fully active via streaming.");
        fallback.put("marketCap", "N/A");
        fallback.put("trailingPE", "N/A");
        fallback.put("beta", "N/A");
        fallback.put("dividendYield", "N/A");
        return fallback;
    }
}