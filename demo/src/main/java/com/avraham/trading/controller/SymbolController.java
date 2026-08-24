package com.avraham.trading.controller;

import java.util.List;

import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.avraham.trading.serivces.MarketStreamProvider;

@RestController
@RequestMapping("/api/symbols")
@CrossOrigin(origins = "*")
public class SymbolController {

    private final List<MarketStreamProvider> streamProviders;

    public SymbolController(List<MarketStreamProvider> streamProviders) {
        this.streamProviders = streamProviders;
    }

    @PostMapping("/{symbol}")
    public String addSymbol(@PathVariable String symbol) {
        String upperSymbol = symbol.toUpperCase();
        
        for (MarketStreamProvider provider : streamProviders) {
            if (provider.supports(upperSymbol)) {
                provider.subscribeSymbol(upperSymbol);
                return "Successfully routed " + upperSymbol + " to " + provider.getClass().getSimpleName();
            }
        }
        
        return "Error: No suitable provider found for symbol " + upperSymbol;
    }

    @DeleteMapping("/{symbol}")
    public String removeSymbol(@PathVariable String symbol) {
        String upperSymbol = symbol.toUpperCase();
        
        for (MarketStreamProvider provider : streamProviders) {
            if (provider.supports(upperSymbol)) {
                provider.unsubscribeSymbol(upperSymbol);
                return "Successfully removed " + upperSymbol + " from " + provider.getClass().getSimpleName();
            }
        }
        
        return "Error: No suitable provider found to remove symbol " + upperSymbol;
    }
}