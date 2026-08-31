package com.avraham.trading.model;

/**
 * Data Transfer Object representing a single historical candlestick.
 * Specifically formatted to serve frontend charting libraries (e.g., TradingView).
 * 
 * @param time   The opening time of the candle in milliseconds since the UNIX epoch.
 * @param open   The opening price of the asset during this interval.
 * @param high   The highest price reached during this interval.
 * @param low    The lowest price reached during this interval.
 * @param close  The closing price at the end of this interval.
 * @param volume The total trading volume during this interval.
 */
public record OHLCVCandleDTO(
    long time,
    double open,
    double high,
    double low,
    double close,
    double volume
) {}