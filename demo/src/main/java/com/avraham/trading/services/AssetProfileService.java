package com.avraham.trading.services;

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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Service responsible for fetching fundamental asset data and corporate profiles.
 * Integrates dynamically with Yahoo Finance API using aggressive browser spoofing 
 * to bypass WAF restrictions, with a generic fallback for all symbols.
 */
@Service
public class AssetProfileService {

    private static final Logger logger = LoggerFactory.getLogger(AssetProfileService.class);
    
    // query2 is generally more permissive for headless clients than query1
    private static final String YAHOO_FINANCE_BASE_URL = "https://query2.finance.yahoo.com/v10/finance/quoteSummary/";
    private static final String YAHOO_MODULES = "?modules=assetProfile,price,summaryDetail,defaultKeyStatistics";

    private final HttpClient httpClient;
    private final ObjectMapper mapper;

    public AssetProfileService() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        this.mapper = new ObjectMapper();
    }

    public Map<String, String> getAssetProfile(String symbol) {
        Map<String, String> profile = new HashMap<>();
        
        // Format Crypto symbols correctly for Yahoo (e.g., BTCUSDT -> BTC-USD)
        String querySymbol = symbol.endsWith("USDT") ? symbol.replace("USDT", "-USD") : symbol;
        String url = YAHOO_FINANCE_BASE_URL + querySymbol + YAHOO_MODULES;

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    // Aggressive browser spoofing to bypass Cloudflare/Yahoo Anti-Bot
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
                    .header("Accept", "application/json, text/plain, */*")
                    .header("Accept-Language", "en-US,en;q=0.9")
                    .header("Origin", "https://finance.yahoo.com")
                    .header("Referer", "https://finance.yahoo.com/quote/" + querySymbol)
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            
            if (response.statusCode() == 200) {
                JsonNode root = mapper.readTree(response.body());
                JsonNode result = root.path("quoteSummary").path("result").get(0);
                
                if (result != null && !result.isMissingNode()) {
                    JsonNode assetProfile = result.path("assetProfile");
                    JsonNode price = result.path("price");
                    JsonNode summaryDetail = result.path("summaryDetail");

                    profile.put("name", price.path("shortName").asText(symbol));
                    profile.put("sector", assetProfile.path("sector").asText("N/A"));
                    profile.put("description", assetProfile.path("longBusinessSummary").asText("No corporate description available."));
                    
                    // Safely extract formatted metrics
                    profile.put("marketCap", extractYahooMetric(price, "marketCap"));
                    profile.put("trailingPE", extractYahooMetric(summaryDetail, "trailingPE"));
                    profile.put("beta", extractYahooMetric(summaryDetail, "beta"));
                    profile.put("dividendYield", extractYahooMetric(summaryDetail, "dividendYield"));
                    
                    return profile;
                }
            } else {
                logger.warn("[-] Yahoo API returned status {} for symbol {}", response.statusCode(), symbol);
            }
        } catch (Exception e) {
            logger.error("[-] Error fetching Yahoo data for {}: {}", symbol, e.getMessage());
        }
        
        // Dynamic fallback triggered if API fails or symbol is invalid
        return getGenericFallbackProfile(symbol);
    }

    /**
     * Safely extracts the "fmt" (formatted string) from Yahoo's nested JSON structure.
     */
    private String extractYahooMetric(JsonNode parentNode, String fieldName) {
        JsonNode field = parentNode.path(fieldName);
        if (field.isMissingNode() || field.isNull() || field.isEmpty()) {
            return "N/A";
        }
        return field.path("fmt").asText("N/A");
    }

    /**
     * A generic, dynamic fallback that handles ANY requested symbol 
     * without needing hardcoded switch-cases.
     */
    private Map<String, String> getGenericFallbackProfile(String symbol) {
        Map<String, String> fallback = new HashMap<>();
        fallback.put("name", symbol + " (Data Offline)");
        fallback.put("sector", "N/A");
        fallback.put("description", "Fundamental data is currently unavailable from the provider. Market pricing and real-time quantitative metrics remain fully active via streaming.");
        fallback.put("marketCap", "N/A");
        fallback.put("trailingPE", "N/A");
        fallback.put("beta", "N/A");
        fallback.put("dividendYield", "N/A");
        return fallback;
    }
}