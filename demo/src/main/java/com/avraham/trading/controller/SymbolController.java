package com.avraham.trading.controller;

import java.util.List;

import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.avraham.trading.services.AlpacaHistoricalDataService;
import com.avraham.trading.services.BinanceHistoricalDataService;
import com.avraham.trading.services.MarketStreamProvider;

/**
 * REST Controller responsible for managing market data subscriptions.
 * Acts as a smart router that receives requests from the frontend (e.g., React),
 * triggers historical data backfilling, and opens real-time WebSocket streams
 * using the appropriate exchange provider (Strategy Pattern).
 */
@RestController
@RequestMapping("/api/symbols")
@CrossOrigin(origins = "*") // Allows cross-origin requests from frontend clients
public class SymbolController {

    // A list of all available stream providers (e.g., Alpaca, Binance) injected by Spring
    private final List<MarketStreamProvider> streamProviders;
    
    // Services responsible for fetching historical data before opening live streams
    private final AlpacaHistoricalDataService alpacaHistoryService;
    private final BinanceHistoricalDataService binanceHistoryService;

    /**
     * Constructor-based Dependency Injection.
     * Spring automatically provides the implementations for the interface and services.
     */
    public SymbolController(List<MarketStreamProvider> streamProviders, 
                            AlpacaHistoricalDataService alpacaHistoryService,
                            BinanceHistoricalDataService binanceHistoryService) {
        this.streamProviders = streamProviders;
        this.alpacaHistoryService = alpacaHistoryService;
        this.binanceHistoryService = binanceHistoryService;
    }

    /**
     * Endpoint to add a new symbol to the pricing engine.
     * Workflow:
     * 1. Identifies the correct provider (Stocks vs. Crypto).
     * 2. Fetches historical data (backfill) for mathematical models.
     * 3. Subscribes to the live WebSocket stream.
     *
     * @param symbol The ticker symbol (e.g., "AAPL" or "BTCUSDT")
     * @return A status message indicating routing success or failure
     */
    @PostMapping("/{symbol}")
    public String addSymbol(@PathVariable String symbol) {
        // Standardize the symbol format to avoid case-sensitivity issues
        String upperSymbol = symbol.toUpperCase();
        
        // Iterate through all injected providers to find the one that supports this symbol
        for (MarketStreamProvider provider : streamProviders) {
            if (provider.supports(upperSymbol)) {
                
                // Step 1: Historical Data Backfill
                // Route the backfill request to the specific REST service based on the provider's class name
                if (provider.getClass().getSimpleName().contains("Alpaca")) {
                    alpacaHistoryService.fetchAndPublishHistory(upperSymbol);
                } else if (provider.getClass().getSimpleName().contains("Binance")) {
                    binanceHistoryService.fetchAndPublishHistory(upperSymbol);
                }
                
                // Step 2: Live Stream Subscription
                // Open the real-time data pipeline for this asset
                provider.subscribeSymbol(upperSymbol);
                
                return "Successfully backfilled and routed " + upperSymbol + " to " + provider.getClass().getSimpleName();
            }
        }
        
        return "Error: No suitable provider found for symbol " + upperSymbol;
    }

    /**
     * Endpoint to remove a symbol from the pricing engine.
     * Halts the real-time data feed for this specific asset to conserve system resources.
     *
     * @param symbol The ticker symbol to remove
     * @return A status message indicating removal success or failure
     */
    @DeleteMapping("/{symbol}")
    public String removeSymbol(@PathVariable String symbol) {
        String upperSymbol = symbol.toUpperCase();
        
        // Find the appropriate provider and send an unsubscribe request
        for (MarketStreamProvider provider : streamProviders) {
            if (provider.supports(upperSymbol)) {
                provider.unsubscribeSymbol(upperSymbol);
                return "Successfully removed " + upperSymbol + " from " + provider.getClass().getSimpleName();
            }
        }
        
        return "Error: No suitable provider found to remove symbol " + upperSymbol;
    }
}