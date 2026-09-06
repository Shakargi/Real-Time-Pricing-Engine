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


// ==========================================
// Monte Carlo Simulation Types
// ==========================================

/**
 * Aggregated data for the Fan Chart visualization.
 * Arrays must be of equal length, representing the progression over time.
 */
export interface FanChartData {
    timeSteps: number[];    // X-axis: Time increments from today to maturity (T)
    percentile5: number[];  // Y-axis lower bound: 5th percentile (Pessimistic)
    median: number[];       // Y-axis middle: 50th percentile (Expected value)
    percentile95: number[]; // Y-axis upper bound: 95th percentile (Optimistic)
}

/**
 * Histogram data representing the price distribution at maturity.
 * Pre-binned by the backend to prevent frontend memory overload.
 */
export interface HistogramBin {
    binCenter: number; // The central price of the bin (e.g., $102.50)
    count: number;     // Number of simulated paths ending within this bin
}

/**
 * Data Transfer Object (DTO) containing the complete simulation results.
 * Received from the backend after C++ engine execution.
 */
export interface MonteCarloResultDTO {
    symbol: string;             // Underlying asset ticker (e.g., "AAPL")
    currentPrice: number;       // The starting price of the asset (S0)
    simulatedPaths: number;     // Total number of paths computed (e.g., 10000)
    timeToMaturity: number;     // Time to expiration in years (T)
    fanChart: FanChartData;     // Progression data for the Fan Chart
    histogram: HistogramBin[];  // Distribution data for the Histogram
}
