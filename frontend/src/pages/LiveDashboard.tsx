import React, { useState, useEffect } from 'react';
import { useLiveMarketData } from '../hooks/useLiveMarketData';
import { useMarketSubscriptions } from '../hooks/useMarketSubscriptions';
import TradingViewChart from '../charts/TradingViewCharts';
import ConnectionStatus from '../components/ConnectionStatus';
import type { OHLCVCandle } from '../types';

/**
 * NOTE ON THE WEBSOCKET PAYLOAD SHAPE:
 * AlpacaLiveStreamService (backend) already aggregates raw trades into a complete
 * 1-minute OHLCVCandleDTO (time/open/high/low/close/volume) server-side and pushes
 * THAT object to /topic/market/{symbol} — it never sends a bare price tick to the
 * frontend. The previous version of this file re-ran that payload through
 * `useMarketCandles`, a hook meant to build candles out of raw ticks (price/size),
 * which double-aggregates an object that is already a finished candle. That mismatch
 * is what produced header prices that didn't match the last plotted bar. The fix
 * below treats the incoming WebSocket message as the candle it actually is.
 */

/**
 * Standardized timeframe intervals available for user selection.
 */
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '1d'] as const;
type Timeframe = typeof TIMEFRAMES[number];

/**
 * Mapping of timeframes to their respective millisecond durations.
 * Critical for aligning real-time stream data into historical chart buckets.
 */
const INTERVAL_MS: Record<Timeframe, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000
};

/**
 * Represents fundamental institutional data fetched from the backend (Finnhub).
 */
interface AssetProfile {
    name?: string;
    sector?: string;
    description?: string;
    marketCap?: string;
    trailingPE?: string;
    beta?: string;
    dividendYield?: string;
}

/**
 * SymbolLiveChart Component
 * 
 * Acts as a decoupled rendering layer. It receives historical data from the REST API,
 * listens to real-time WebSocket updates, aligns the incoming data to the active timeframe,
 * and seamlessly feeds it into the Lightweight Charts instance.
 * 
 * @param {string} symbol - The market ticker (e.g., "AAPL").
 * @param {(OHLCVCandle & { symbol: string }) | null} globalCandle - The latest live 1-minute candle
 *        pushed from the backend's per-symbol WebSocket topic (already fully aggregated server-side).
 * @param {Timeframe} timeframe - The currently selected chart interval.
 */
const SymbolLiveChart: React.FC<{ symbol: string; globalCandle: (OHLCVCandle & { symbol: string }) | null; timeframe: Timeframe }> = ({ symbol, globalCandle, timeframe }) => {
    const [historicalCandles, setHistoricalCandles] = useState<OHLCVCandle[]>([]);
    const [profile, setProfile] = useState<AssetProfile | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const intervalMs = INTERVAL_MS[timeframe];

    useEffect(() => {
        const fetchData = async () => {
            try {
                setIsLoading(true);
                setError(null);
                // Clear the previous symbol/timeframe's candles immediately so the header
                // price can't keep showing a stale value while the canvas says "loading".
                setHistoricalCandles([]);
                
                const [chartRes, profileRes] = await Promise.all([
                    fetch(`http://localhost:8081/api/symbols/${symbol}/chart?interval=${timeframe}`),
                    fetch(`http://localhost:8081/api/symbols/${symbol}/profile`).catch(() => null)
                ]);
                
                if (!chartRes.ok) {
                    setError(`No market data available for '${symbol}'.`);
                    return;
                }

                const chartData = await chartRes.json();
                const profileData = profileRes && profileRes.ok ? await profileRes.json() : null;

                if (chartData && chartData.length > 0) {
                    // Format timestamps to Unix seconds strictly required by Lightweight Charts
                    const formattedHistory = chartData.map((c: any) => ({
                        ...c,
                        time: Math.floor(c.time / 1000)
                    }));
                    setHistoricalCandles(formattedHistory);
                    setProfile(profileData);
                } else {
                    setError(`Ticker '${symbol}' has no historical data.`);
                }
            } catch (err) {
                setError(`Network error fetching data for '${symbol}'.`);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [symbol, timeframe]);

    // Integrate real-time WebSocket data routed to this specific symbol.
    // The backend already sends a fully-formed 1-minute candle per symbol, so this is
    // simply "the current in-progress candle" — nothing left to aggregate client-side.
    const liveCandle = globalCandle && globalCandle.symbol === symbol ? globalCandle : null;
    const liveCandles = liveCandle ? [liveCandle] : [];
    
    /**
     * Merges historical data with live stream updates.
     * Prevents floating dots (anomalies) by filtering out zero-volume and flatline events.
     * Aligns 1-minute real-time backend updates to the currently selected chart interval (e.g., 1H, 1D).
     * 
     * @returns {OHLCVCandle[]} A chronologically sorted, collision-free array of candles.
     */
    const mergeData = () => {
        const dataMap = new Map();
        
        // 1. Process Historical Data (Provides the baseline rendering structure)
        historicalCandles.forEach(c => {
            if (!c || isNaN(c.close) || c.close <= 0) return;
            
            // Safety measure against orphaned exchange trades outside active hours
            const isFloating = c.open === c.close && c.high === c.low;
            if (c.volume <= 0 || isFloating) return;
            
            dataMap.set(c.time, c);
        });
        
        // 2. Process Live Data (Align backend candles to the UI timeframe)
        liveCandles.forEach(c => {
            if (!c || isNaN(c.close)) return;

            // Normalize backend timestamp to milliseconds
            let ms = Number(c.time);
            if (ms < 1e11) ms *= 1000; 
            
            // Align the timestamp to the active timeframe bucket and convert to Unix seconds
            const alignedSec = Math.floor((Math.floor(ms / intervalMs) * intervalMs) / 1000);
            
            const existing = dataMap.get(alignedSec);
            if (existing) {
                // Upsert: Expand the High/Low bounds and accumulate volume within the active bucket
                dataMap.set(alignedSec, {
                    ...existing,
                    high: Math.max(existing.high, c.high),
                    low: Math.min(existing.low, c.low),
                    close: c.close,
                    volume: existing.volume + (c.volume || 0)
                });
            } else {
                // Initialize a new timeframe bucket for incoming real-time data
                dataMap.set(alignedSec, {
                    time: alignedSec as any,
                    open: c.open,
                    high: c.high,
                    low: c.low,
                    close: c.close,
                    volume: c.volume || 0
                });
            }
        });

        // 3. Guarantee strict chronological sorting to prevent rendering engine crashes
        return Array.from(dataMap.values()).sort((a, b) => (a.time as number) - (b.time as number));
    };

    const chartData = mergeData();

    // Extract dynamic UI metrics for the top header and side panel
    const currentPrice = chartData.length > 0 ? chartData[chartData.length - 1].close : null;
    const previousPrice = chartData.length > 1 ? chartData[chartData.length - 2].close : null;

    const isPriceUp = currentPrice && previousPrice && currentPrice >= previousPrice;
    const priceClass = isPriceUp ? 'flash-up' : 'flash-down';
    const priceColor = isPriceUp ? 'var(--trade-up-text)' : 'var(--trade-down-text)';

    // Change vs. the OPEN of the loaded period (not vs. the prior candle) — a stable reference
    // that means the same thing regardless of which timeframe tab is active, and that we can
    // express with a glyph so direction isn't communicated by color alone.
    const periodOpen = chartData.length > 0 ? chartData[0].open : null;
    const changeAbs = currentPrice != null && periodOpen != null ? currentPrice - periodOpen : null;
    const changePct = changeAbs != null && periodOpen ? (changeAbs / periodOpen) * 100 : null;
    const isPeriodUp = changeAbs != null ? changeAbs >= 0 : null;

    const periodHigh = chartData.length > 0 ? Math.max(...chartData.map(c => c.high)) : 0;
    const periodLow = chartData.length > 0 ? Math.min(...chartData.map(c => c.low)) : 0;
    const totalVolume = chartData.length > 0 ? chartData.reduce((sum, c) => sum + (c.volume || 0), 0) : 0;

    return (
        <div className="chart-panel fade-in" style={{ height: '100%' }}>
            {/* Chart Header */}
            <div className="chart-header">
                <div className="chart-title">
                    <h3 className="symbol-label">
                        {symbol} <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'normal', fontFamily: 'var(--font-sans)' }}>{profile?.name ? `| ${profile.name}` : ''}</span>
                    </h3>
                    {!isLoading && currentPrice && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                            <span key={currentPrice} className={`mono-data ${priceClass}`} style={{ fontSize: '1.4rem', fontWeight: 'bold', color: priceColor, borderRadius: '4px', padding: '0 4px' }}>
                                ${currentPrice.toFixed(2)}
                            </span>
                            {changeAbs != null && changePct != null && (
                                <span
                                    className="mono-data"
                                    style={{ fontSize: '0.85rem', color: isPeriodUp ? 'var(--trade-up-text)' : 'var(--trade-down-text)' }}
                                    title={`Change since period open ($${periodOpen!.toFixed(2)})`}
                                >
                                    {isPeriodUp ? '▲' : '▼'} {Math.abs(changeAbs).toFixed(2)} ({Math.abs(changePct).toFixed(2)}%)
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
            
            {/* Main Chart Rendering Area */}
            <div className="tv-canvas-container">
                {isLoading ? (
                    <div className="empty-state terminal-panel" style={{ height: '100%' }}>
                        <div className="skeleton-box" style={{ width: '280px', height: '4px', marginBottom: 'var(--space-md)' }} />
                        <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>Loading {symbol} · {timeframe.toUpperCase()} candles…</span>
                    </div>
                ) : error ? (
                    <div className="empty-state" style={{ color: 'var(--status-offline)' }}>⚠️ {error}</div>
                ) : (
                    <TradingViewChart data={chartData} />
                )}
            </div>

            {/* Asset Fundamental Profile Panel */}
            {!isLoading && !error && chartData.length > 0 && profile && (
                <div style={{ borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                    <div className="metric-card-container">
                        <div className="metric-card"><span className="metric-label">Period High</span><span className="metric-value">${periodHigh.toFixed(2)}</span></div>
                        <div className="metric-card"><span className="metric-label">Period Low</span><span className="metric-value">${periodLow.toFixed(2)}</span></div>
                        <div className="metric-card"><span className="metric-label">Total Volume</span><span className="metric-value">{totalVolume.toLocaleString()}</span></div>
                        <div className="metric-card"><span className="metric-label">Market Cap</span><span className="metric-value">{profile.marketCap || '-'}</span></div>
                        <div className="metric-card"><span className="metric-label">P/E Ratio</span><span className="metric-value">{profile.trailingPE || '-'}</span></div>
                        <div className="metric-card"><span className="metric-label">Beta</span><span className="metric-value">{profile.beta || '-'}</span></div>
                        <div className="metric-card"><span className="metric-label">Div Yield</span><span className="metric-value">{profile.dividendYield || '-'}</span></div>
                    </div>
                    <div style={{ padding: '12px 20px', color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.5', backgroundColor: 'var(--bg-panel)' }}>
                        <p style={{ margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{profile.description || 'No description available.'}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * LiveDashboard Component
 * 
 * The primary layout architecture for the trading terminal. Manages the global 
 * WebSocket connection, user subscriptions (Watchlist), and global timeframe selections.
 */
const LiveDashboard: React.FC = () => {
    // Manages the global market data stream. Ensure the backend endpoint port is correctly aligned (e.g., 8081).
    // CAVEAT: if useLiveMarketData only keeps the single most recently received message,
    // subscribing to multiple symbols (e.g. AAPL + BTCUSDT, as in the watchlist) means each
    // incoming message for one symbol overwrites the last-seen state for every other symbol,
    // so a chatty symbol can starve a quieter one of live updates. For a multi-symbol
    // watchlist, useLiveMarketData should track the latest message per-symbol (e.g. a
    // Record<string, OHLCVCandle>) rather than a single shared value.
    const { tick: liveCandle, status } = useLiveMarketData("ws://localhost:8081/ws/market-data");
    const { subscribedList, selectedSymbol, setSelectedSymbol, subscribe, unsubscribe } = useMarketSubscriptions();
    
    const [symbolInput, setSymbolInput] = useState<string>('');
    const [globalTimeframe, setGlobalTimeframe] = useState<Timeframe>('1d');

    return (
        <div className="dashboard-grid-layout fade-in">
            
            {/* Sidebar Navigation: Watchlist & Search Module */}
            <aside className="sidebar-panel">
                <h2 className="sidebar-title">Live Market Data</h2>
                
                <div className="search-box">
                    <input 
                        type="text" 
                        className="search-input"
                        placeholder="Symbol (e.g. AAPL)" 
                        value={symbolInput}
                        onChange={(e) => setSymbolInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && symbolInput && (subscribe(symbolInput.trim().toUpperCase()), setSymbolInput(''))}
                    />
                    <button 
                        className="btn-primary"
                        onClick={() => symbolInput && (subscribe(symbolInput.trim().toUpperCase()), setSymbolInput(''))}>
                        +
                    </button>
                </div>

                <div className="watchlist-container">
                    {subscribedList.length === 0 ? (
                        <div className="empty-state" style={{ padding: '2rem 0' }}>Watchlist is empty.</div>
                    ) : (
                        subscribedList.map((sym: string) => (
                            <div 
                                key={sym} 
                                className={`watchlist-item ${selectedSymbol === sym ? 'active' : ''}`}
                                onClick={() => setSelectedSymbol(sym)}
                            >
                                <span className="watchlist-symbol">{sym}</span>
                                <button 
                                    className="remove-btn"
                                    onClick={(e) => { e.stopPropagation(); unsubscribe(sym); }}>
                                    ✕
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </aside>

            {/* Main Content Area: Action Toolbar & Charting Engine */}
            <main className="main-panel">
                {/* Global Actions Toolbar */}
                <div className="toolbar">
                    <div className="chart-toggle-group">
                        {TIMEFRAMES.map(tf => (
                            <button
                                key={tf}
                                className={`toggle-btn ${globalTimeframe === tf ? 'active' : ''}`}
                                onClick={() => setGlobalTimeframe(tf)}
                            >
                                {tf}
                            </button>
                        ))}
                    </div>
                    {/* Real-time Connection Status Indicator */}
                    <ConnectionStatus status={status} label="STREAM" />
                </div>

                {/* Connection Lost Overlay — mirrors the Monte Carlo page's SYSTEM FAULT banner
                    so losing either backend connection reads the same way across the app. */}
                {(status === 'ERROR' || status === 'DISCONNECTED') && (
                    <div className="terminal-panel" style={{ padding: 'var(--space-md)', borderLeft: '4px solid var(--status-offline)' }}>
                        <span style={{ color: 'var(--status-offline)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                            SYSTEM FAULT:
                        </span>
                        <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>
                            Lost connection to the live market data stream. Prices below may be stale until it reconnects.
                        </span>
                    </div>
                )}

                {/* Dynamic Chart Container */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    {subscribedList.length === 0 ? (
                        <div className="empty-state terminal-panel">
                            Add a symbol to your watchlist to load market data.
                        </div>
                    ) : (
                        subscribedList.map((sym: string) => (
                            <div key={sym} style={{ display: sym === selectedSymbol ? 'block' : 'none', height: '100%' }}>
                                <SymbolLiveChart symbol={sym} globalCandle={liveCandle as any} timeframe={globalTimeframe} />
                            </div>
                        ))
                    )}
                </div>
            </main>
        </div>
    );
};

export default LiveDashboard;