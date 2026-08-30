/**
 * Represents a single market tick (trade) received from the live stream.
 */
export interface MarketTick {
    symbol: string;
    price: number;
    volume: number;
    timestamp: number;
}

/**
 * Represents the aggregated results of a Monte Carlo simulation from the C++ pricing engine.
 */
export interface MonteCarloResult {
    symbol: string;
    current_price: number;
    expected_price: number;
    volatility: number;
    drift: number;
    window_size: number;
    timestamp?: number; // Optional local timestamp for frontend rendering
}

export interface OHLCVCandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

/**
 * Connection status type (replaced enum with string literals for verbatimModuleSyntax compliance).
 */
export type ConnectionState = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
