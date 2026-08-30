import { useState, useEffect } from 'react';
import type { MarketTick, OHLCVCandle } from '../types';

/**
 * Custom hook to aggregate raw real-time market ticks into 1-minute OHLCV candles.
 * 
 * @param liveTick The latest market tick received from the WebSocket stream.
 * @returns An object containing the finalized historical candles and the currently updating live candle.
 */
export const useMarketCandles = (liveTick: MarketTick | null) => {
    const [candles, setCandles] = useState<OHLCVCandle[]>([]);
    const [currentCandle, setCurrentCandle] = useState<OHLCVCandle | null>(null);

    useEffect(() => {
        if (!liveTick) return;

        const tickTime = liveTick.timestamp;
        // Floor the timestamp to the nearest minute (60,000 ms) to create a unique ID for the candle
        const minuteId = Math.floor(tickTime / 60000) * 60000;

        setCurrentCandle((prevCandle: OHLCVCandle | null) => {
            // Scenario 1: First tick ever OR tick belongs to a NEW minute window
            if (!prevCandle || prevCandle.time !== minuteId) {
                
                // If an older candle was open, push it to the finalized history array
                if (prevCandle) {
                    setCandles((prevHistory) => [...prevHistory, prevCandle]);
                }
                
                // Initialize and return a fresh 1-minute candle
                return {
                    time: minuteId,
                    open: liveTick.price,
                    high: liveTick.price,
                    low: liveTick.price,
                    close: liveTick.price,
                    volume: liveTick.volume
                };
            }

            // Scenario 2: Tick belongs to the CURRENT active minute window
            return {
                ...prevCandle,
                high: Math.max(prevCandle.high, liveTick.price),
                low: Math.min(prevCandle.low, liveTick.price),
                close: liveTick.price, // The latest price is always the current close
                volume: prevCandle.volume + liveTick.volume // Accumulate volume
            };
        });
    }, [liveTick]);

    return { candles, currentCandle };
};