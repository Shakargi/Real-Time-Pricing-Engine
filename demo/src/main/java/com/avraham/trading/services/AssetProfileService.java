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
 * Integrates with the Yahoo Finance API to retrieve market capitalization, valuation
 * multiples (e.g., P/E ratio), and business summaries for both equities and cryptocurrencies.
 */
@Service
public class AssetProfileService {

    private static final Logger logger = LoggerFactory.getLogger(AssetProfileService.class);
    private static final String YAHOO_FINANCE_BASE_URL = "https://query1.finance.yahoo.com/v10/finance/quoteSummary/";
    
    // Requesting multiple modules to construct a comprehensive fundamental profile
    private static final String YAHOO_MODULES = "?modules=assetProfile,price,summaryDetail,defaultKeyStatistics";

    private final HttpClient httpClient;
    private final ObjectMapper mapper;

    public AssetProfileService() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        this.mapper = new ObjectMapper();
    }

    /**
     * Retrieves a comprehensive fundamental profile for a given ticker symbol.
     *
     * @param symbol The market ticker (e.g., "AAPL", "BTCUSDT").
     * @return A map containing fundamental data points (Sector, P/E, Market Cap, Beta, etc.).
     */
    public Map<String, String> getAssetProfile(String symbol) {
        Map<String, String> profile = new HashMap<>();
        
        // Normalize cryptocurrency symbols for Yahoo Finance compatibility (e.g., BTCUSDT -> BTC-USD)
        String querySymbol = symbol.endsWith("USDT") ? symbol.replace("USDT", "-USD") : symbol;
        String url = YAHOO_FINANCE_BASE_URL + querySymbol + YAHOO_MODULES;

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)") // Required to prevent 403 Forbidden from Yahoo
                    .header("Accept", "application/json")
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

                    // Core Corporate Profile
                    profile.put("name", price.path("shortName").asText("Unknown Asset"));
                    profile.put("sector", assetProfile.path("sector").asText("N/A"));
                    profile.put("description", assetProfile.path("longBusinessSummary").asText("No corporate description available."));
                    
                    // Fundamental Metrics (Using Yahoo's 'fmt' node for human-readable pre-formatted strings)
                    profile.put("marketCap", price.path("marketCap").path("fmt").asText("N/A"));
                    profile.put("trailingPE", summaryDetail.path("trailingPE").path("fmt").asText("N/A"));
                    profile.put("beta", summaryDetail.path("beta").path("fmt").asText("N/A"));
                    profile.put("dividendYield", summaryDetail.path("dividendYield").path("fmt").asText("N/A"));
                    
                    logger.info("[+] Successfully fetched fundamental profile for: {}", symbol);
                    return profile;
                }
            } else {
                logger.warn("[-] Failed to fetch profile for {}. HTTP Status: {}", symbol, response.statusCode());
            }
        } catch (Exception e) {
            logger.error("[-] Error fetching fundamental data for {}: {}", symbol, e.getMessage());
        }
        
        // Return empty map if resolution fails, triggering the 404 handler in the controller
        return profile;
    }
}