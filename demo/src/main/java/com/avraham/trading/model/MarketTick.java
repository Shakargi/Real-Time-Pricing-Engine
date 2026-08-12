package com.avraham.trading.model;

public record MarketTick(
    String symbol,
    double price,
    int volume,
    long timestamp
) {}