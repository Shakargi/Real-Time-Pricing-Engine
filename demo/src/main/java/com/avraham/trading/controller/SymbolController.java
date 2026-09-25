package com.avraham.trading.controller;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.avraham.trading.services.AlpacaHistoricalDataService;
import com.avraham.trading.services.AssetProfileService;
import com.avraham.trading.services.BinanceHistoricalDataService;
import com.avraham.trading.services.MarketStreamProvider;
import com.avraham.trading.model.OHLCVCandleDTO; 

@RestController
@RequestMapping("/api/symbols")
@CrossOrigin(origins = "*") 
public class SymbolController {

    private final List<MarketStreamProvider> streamProviders;
    private final AlpacaHistoricalDataService alpacaHistoryService;
    private final BinanceHistoricalDataService binanceHistoryService;

    public SymbolController(List<MarketStreamProvider> streamProviders, 
                            AlpacaHistoricalDataService alpacaHistoryService,
                            BinanceHistoricalDataService binanceHistoryService) {
        this.streamProviders = streamProviders;
        this.alpacaHistoryService = alpacaHistoryService;
        this.binanceHistoryService = binanceHistoryService;
    }

    @PostMapping("/{symbol}")
    public ResponseEntity<String> addSymbol(@PathVariable String symbol) {
        String upperSymbol = symbol.toUpperCase();
        
        for (MarketStreamProvider provider : streamProviders) {
            if (provider.supports(upperSymbol)) {
                
                if (provider.getClass().getSimpleName().contains("Alpaca")) {
                    alpacaHistoryService.fetchAndPublishHistory(upperSymbol);
                } else if (provider.getClass().getSimpleName().contains("Binance")) {
                    binanceHistoryService.fetchAndPublishHistory(upperSymbol);
                }
                
                provider.subscribeSymbol(upperSymbol);
                
                return ResponseEntity.ok("Successfully backfilled and routed " + upperSymbol + " to " + provider.getClass().getSimpleName());
            }
        }
        
        return ResponseEntity.badRequest().body("Error: No suitable provider found for symbol " + upperSymbol);
    }

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
     * Idempotent "make sure this symbol is streaming", with no history backfill.
     * Provider subscriptions live in memory, so they are lost on a backend restart while the
     * frontend still has the symbol in its (localStorage-backed) watchlist. The frontend calls
     * this for every watchlist symbol whenever its live connection (re)establishes.
     */
    @PutMapping("/{symbol}/stream")
    public ResponseEntity<String> ensureStreaming(@PathVariable String symbol) {
        String upperSymbol = symbol.toUpperCase();

        for (MarketStreamProvider provider : streamProviders) {
            if (provider.supports(upperSymbol)) {
                provider.subscribeSymbol(upperSymbol); // no-op if already subscribed
                return ResponseEntity.ok("Streaming ensured for " + upperSymbol + " via " + provider.getClass().getSimpleName());
            }
        }

        return ResponseEntity.badRequest().body("Error: No suitable provider found for symbol " + upperSymbol);
    }

    @GetMapping("/{symbol}/chart")
    public ResponseEntity<List<OHLCVCandleDTO>> getChartHistory(
            @PathVariable String symbol,
            @RequestParam(defaultValue = "1m") String interval) {
        
        String upperSymbol = symbol.toUpperCase();
        
        try {
            if (upperSymbol.endsWith("USDT")) {
                List<OHLCVCandleDTO> chartData = binanceHistoryService.fetchChartData(upperSymbol, interval);
                return ResponseEntity.ok(chartData);
            } else {
                List<OHLCVCandleDTO> chartData = alpacaHistoryService.fetchChartData(upperSymbol, interval);
                
                if (chartData == null || chartData.isEmpty()) {
                    System.out.println("[*] Alpaca returned empty data for " + upperSymbol + " (Market closed?). Falling back to Binance...");
                    
                    chartData = binanceHistoryService.fetchChartData(upperSymbol, interval);
                }
                
                return ResponseEntity.ok(chartData);
            }
        } catch (Exception e) {
            System.err.println("[-] Failed to fetch chart history for " + upperSymbol + ": " + e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @Autowired
    private AssetProfileService assetProfileService;

    @GetMapping("/{symbol}/profile")
    public ResponseEntity<Map<String, String>> getSymbolProfile(@PathVariable String symbol) {
        Map<String, String> profile = assetProfileService.getAssetProfile(symbol);
        return ResponseEntity.ok(profile);
    }
}