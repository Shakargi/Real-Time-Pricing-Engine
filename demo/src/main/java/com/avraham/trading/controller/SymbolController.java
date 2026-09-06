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
}