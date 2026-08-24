package com.avraham.trading.serivces;

/**
 * Strategy interface for market data stream providers.
 * Defines a unified contract for connecting to different financial exchanges 
 * (e.g., Alpaca for stocks, Binance for crypto) and managing asset subscriptions dynamically.
 */
public interface MarketStreamProvider {
    
    /**
     * Subscribes the provider to a real-time data stream for the given symbol.
     *
     * @param symbol The ticker symbol of the asset to subscribe to.
     */
    void subscribeSymbol(String symbol);
    
    /**
     * Unsubscribes the provider from the real-time data stream for the given symbol,
     * halting further data ingestion for that asset to conserve resources.
     *
     * @param symbol The ticker symbol of the asset to remove.
     */
    void unsubscribeSymbol(String symbol);
    
    /**
     * Evaluates whether this specific provider implementation handles the specified symbol.
     * Used by the routing controller to delegate API requests to the correct service.
     *
     * @param symbol The ticker symbol to check.
     * @return true if the provider supports the symbol, false otherwise.
     */
    boolean supports(String symbol);
}