package com.avraham.trading.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.avraham.trading.services.AlpacaHistoricalDataService;
import com.avraham.trading.services.BinanceHistoricalDataService;
import com.avraham.trading.services.MarketStreamProvider;
// Assuming you have a DTO for transferring candle data to the frontend
import com.avraham.trading.model.OHLCVCandleDTO; 

/**
 * REST Controller responsible for managing market data subscriptions and historical chart data.
 * Acts as a smart router that receives requests from the frontend (e.g., React),
 * triggers historical data backfilling, opens real-time WebSocket streams,
 * and serves aggregated OHLCV data for UI charting components.
 */
@RestController
@RequestMapping("/api/symbols")
@CrossOrigin(origins = "*") // Allows cross-origin requests from frontend clients
public class SymbolController {

    // A list of all available stream providers (e.g., Alpaca, Binance) injected by Spring
    private final List<MarketStreamProvider> streamProviders;
    
    // Services responsible for fetching historical data
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
     * 2. Fetches historical data (backfill) for the backend mathematical models.
     * 3. Subscribes to the live WebSocket stream for real-time updates.
     *
     * @param symbol The ticker symbol (e.g., "AAPL" or "BTCUSDT")
     * @return A status message indicating routing success or failure
     */
    @PostMapping("/{symbol}")
    public ResponseEntity<String> addSymbol(@PathVariable String symbol) {
        String upperSymbol = symbol.toUpperCase();
        
        for (MarketStreamProvider provider : streamProviders) {
            if (provider.supports(upperSymbol)) {
                
                // Step 1: Historical Data Backfill for backend processing
                if (provider.getClass().getSimpleName().contains("Alpaca")) {
                    alpacaHistoryService.fetchAndPublishHistory(upperSymbol);
                } else if (provider.getClass().getSimpleName().contains("Binance")) {
                    binanceHistoryService.fetchAndPublishHistory(upperSymbol);
                }
                
                // Step 2: Live Stream Subscription
                provider.subscribeSymbol(upperSymbol);
                
                return ResponseEntity.ok("Successfully backfilled and routed " + upperSymbol + " to " + provider.getClass().getSimpleName());
            }
        }
        
        return ResponseEntity.badRequest().body("Error: No suitable provider found for symbol " + upperSymbol);
    }

    /**
     * Endpoint to remove a symbol from the pricing engine.
     * Halts the real-time data feed for this specific asset to conserve system resources.
     *
     * @param symbol The ticker symbol to remove
     * @return A status message indicating removal success or failure
     */
    @DeleteMapping("/{symbol}")
    public ResponseEntity<String> removeSymbol(@PathVariable String symbol) {
        String upperSymbol = symbol.toUpperCase();
        
        for (MarketStreamProvider provider : streamProviders) {
            if (provider.supports(upperSymbol)) {
                provider.unsubscribeSymbol(upperSymbol);
                return ResponseEntity.ok("Successfully removed " + upperSymbol + " from " + provider.getClass().getSimpleName());
            }
        }
        
        return ResponseEntity.badRequest().body("Error: No suitable provider found to remove symbol " + upperSymbol);
    }

    /**
     * Endpoint to fetch historical OHLCV chart data for the frontend UI.
     * This allows the React client to build the initial chart state (e.g., TradingView chart)
     * based on user-selected timeframes without overloading the network.
     *
     * @param symbol   The ticker symbol (e.g., "AAPL" or "BTCUSDT").
     * @param interval The timeframe interval (e.g., "1m", "5m", "1h", "1d"). Defaults to "1m".
     * @return A list of OHLCV candles tailored for the frontend chart visualization.
     */
    @GetMapping("/{symbol}/chart")
    public ResponseEntity<List<OHLCVCandleDTO>> getChartHistory(
            @PathVariable String symbol,
            @RequestParam(defaultValue = "1m") String interval) {
        
        String upperSymbol = symbol.toUpperCase();
        
        try {
            // Route the request to the correct historical service based on asset type
            if (upperSymbol.endsWith("USDT")) {
                // Fetch crypto chart data from Binance
                List<OHLCVCandleDTO> chartData = binanceHistoryService.fetchChartData(upperSymbol, interval);
                return ResponseEntity.ok(chartData);
            } else {
                // Fetch stock chart data from Alpaca
                List<OHLCVCandleDTO> chartData = alpacaHistoryService.fetchChartData(upperSymbol, interval);
                return ResponseEntity.ok(chartData);
            }
        } catch (Exception e) {
            // Log the error internally and return an appropriate HTTP response
            System.err.println("[-] Failed to fetch chart history for " + upperSymbol + ": " + e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    
}