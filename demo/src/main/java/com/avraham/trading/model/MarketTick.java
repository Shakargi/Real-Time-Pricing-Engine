package com.avraham.trading.model;

/**
 * Represents a single market data point (tick) or historical candlestick.
 * Implemented as a Java Record to provide a lightweight, immutable data carrier.
 * This object is serialized into JSON and published to the Kafka topic 
 * to be consumed by the C++ pricing engine.
 *
 * @param symbol    The ticker symbol of the asset (e.g., "AAPL", "BTCUSDT").
 * @param price     The current traded price or the closing price of a historical bar.
 * @param volume    The number of shares or tokens traded during this event.
 * @param timestamp The exact time of the trade in milliseconds since the UNIX epoch.
 */
public record MarketTick(
    String symbol,
    double price,
    int volume,
    long timestamp
) {}