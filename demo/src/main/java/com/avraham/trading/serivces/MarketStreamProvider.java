package com.avraham.trading.serivces;

public interface  MarketStreamProvider {
    void subscribeSymbol(String symbol);
    void unsubscribeSymbol(String symbol);
    boolean supports(String symbol);
}
