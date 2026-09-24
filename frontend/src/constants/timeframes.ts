/**
 * Standardized timeframe intervals available for user selection.
 * Shared between the toolbar (LiveDashboard) and the chart panel
 * (SymbolLiveChart) so they can't drift out of sync with each other.
 */
export const TIMEFRAMES = ['1m', '5m', '15m', '1h', '1d'] as const;
export type Timeframe = typeof TIMEFRAMES[number];

/**
 * Millisecond duration of each timeframe. Critical for aligning real-time
 * stream data into the correct historical chart bucket.
 */
export const INTERVAL_MS: Record<Timeframe, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
};
