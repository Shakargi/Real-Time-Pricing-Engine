import React, { useState, useEffect } from 'react';
import { useLiveMarketData } from '../hooks/useLiveMarketData';
import { useMarketSubscriptions } from '../hooks/useMarketSubscriptions';
import { useMarketCandles } from '../hooks/useMarketCandles';
import TradingViewChart from '../charts/TradingViewCharts';
import ConnectionStatus from '../components/ConnectionStatus';
import type { MarketTick, OHLCVCandle } from '../types';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '1d'] as const;
type Timeframe = typeof TIMEFRAMES[number];

const INTERVAL_MS: Record<Timeframe, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000
};

interface AssetProfile {
    name?: string;
    sector?: string;
    description?: string;
    marketCap?: string;
    trailingPE?: string;
    beta?: string;
    dividendYield?: string;
}

const SymbolLiveChart: React.FC<{ symbol: string; globalTick: MarketTick | null; timeframe: Timeframe }> = ({ symbol, globalTick, timeframe }) => {
    const [historicalCandles, setHistoricalCandles] = useState<OHLCVCandle[]>([]);
    const [profile, setProfile] = useState<AssetProfile | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setIsLoading(true);
                setError(null);
                
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
                    setHistoricalCandles(chartData);
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

    const displayedTick = globalTick?.symbol === symbol ? globalTick : null;
    const { candles, currentCandle } = useMarketCandles(displayedTick);

    const intervalMs = INTERVAL_MS[timeframe];
    const liveCandles = currentCandle ? [...candles, currentCandle] : candles;
    const rawChartData = [...historicalCandles, ...liveCandles];
    const processChartData = (rawCandles: any[]) => {
        const cleanMap = new Map();

        rawCandles.forEach(candle => {
            if (!candle || isNaN(candle.close) || candle.close <= 0) return;

            const isFloatingDot = (candle.open === candle.close && candle.high === candle.low);
            if (candle.volume <= 0 || isFloatingDot) return;

            let ms = Number(candle.time);
            if (ms < 1e11) ms *= 1000;
            else if (ms > 1e15) ms /= 1e6;
            
            if (isNaN(ms) || ms <= 0) return;

            const unixTimeSec = Math.floor((Math.floor(ms / intervalMs) * intervalMs) / 1000);

            const existing = cleanMap.get(unixTimeSec);
            if (existing) {
                cleanMap.set(unixTimeSec, {
                    time: unixTimeSec as any,
                    open: existing.open,
                    high: Math.max(existing.high, candle.high),
                    low: Math.min(existing.low, candle.low),
                    close: candle.close,
                    volume: existing.volume + candle.volume
                });
            } else {
                cleanMap.set(unixTimeSec, {
                    time: unixTimeSec as any,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                    volume: candle.volume
                });
            }
        });

        return Array.from(cleanMap.values()).sort((a, b) => (a.time as number) - (b.time as number));
    };

    const chartData = processChartData(rawChartData);
    const currentPrice = chartData.length > 0 ? chartData[chartData.length - 1].close : null;
    const previousPrice = chartData.length > 1 ? chartData[chartData.length - 2].close : null;


    const isPriceUp = currentPrice && previousPrice && currentPrice >= previousPrice;
    const priceClass = isPriceUp ? 'flash-up' : 'flash-down';
    const priceColor = isPriceUp ? 'var(--trade-up-text)' : 'var(--trade-down-text)';

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
                    {currentPrice && (
                        <span key={currentPrice} className={`mono-data ${priceClass}`} style={{ fontSize: '1.4rem', fontWeight: 'bold', color: priceColor, borderRadius: '4px', padding: '0 4px' }}>
                            ${currentPrice.toFixed(2)}
                        </span>
                    )}
                </div>
                {isLoading && <span className="status-badge" style={{ color: 'var(--status-warning)', borderColor: 'var(--status-warning)' }}>Loading Chart...</span>}
            </div>
            
            {/* Chart Area */}
            <div className="tv-canvas-container">
                {isLoading ? (
                    <div className="empty-state">Aggregating Market Data...</div>
                ) : error ? (
                    <div className="empty-state" style={{ color: 'var(--status-offline)' }}>⚠️ {error}</div>
                ) : (
                    <TradingViewChart data={chartData} />
                )}
            </div>

            {/* Asset Profile Panel */}
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

const LiveDashboard: React.FC = () => {
    const { tick, status } = useLiveMarketData("ws://localhost:8000/ws/live");
    const { subscribedList, selectedSymbol, setSelectedSymbol, subscribe, unsubscribe } = useMarketSubscriptions();
    const [symbolInput, setSymbolInput] = useState<string>('');
    const [globalTimeframe, setGlobalTimeframe] = useState<Timeframe>('1d');

    return (
        <div className="dashboard-grid-layout fade-in">
            
            {/* Left Sidebar: Watchlist & Search */}
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

            {/* Main Area: Toolbar & Chart */}
            <main className="main-panel">
                {/* Top Toolbar */}
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
                    {/* Connection Status Hooked Directly to the Stream */}
                    <ConnectionStatus status={status} label="STREAM" />
                </div>

                {/* Active Chart Display */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    {subscribedList.length === 0 ? (
                        <div className="empty-state terminal-panel">
                            Add a symbol to your watchlist to load market data.
                        </div>
                    ) : (
                        subscribedList.map((sym: string) => (
                            <div key={sym} style={{ display: sym === selectedSymbol ? 'block' : 'none', height: '100%' }}>
                                <SymbolLiveChart symbol={sym} globalTick={tick} timeframe={globalTimeframe} />
                            </div>
                        ))
                    )}
                </div>
            </main>
        </div>
    );
};

export default LiveDashboard;