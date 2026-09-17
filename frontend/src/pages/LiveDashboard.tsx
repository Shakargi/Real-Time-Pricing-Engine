import React, { useState, useEffect } from 'react';
import { useLiveMarketData } from '../hooks/useLiveMarketData';
import { useMarketSubscriptions } from '../hooks/useMarketSubscriptions';
import { useMarketCandles } from '../hooks/useMarketCandles';
import TradingViewChart from '../charts/TradingViewCharts';
import type { MarketTick, OHLCVCandle } from '../types';

// ==========================================
// Timeframe Configuration
// ==========================================
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '1d'] as const;
type Timeframe = typeof TIMEFRAMES[number];

const INTERVAL_MS: Record<Timeframe, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000
};

// ==========================================
// Isolated Chart Component for Each Symbol
// ==========================================
interface SymbolLiveChartProps {
    symbol: string;
    globalTick: MarketTick | null;
    timeframe: Timeframe;
}

// ==========================================
// Isolated Chart Component for Each Symbol
// ==========================================
const SymbolLiveChart: React.FC<{ symbol: string; globalTick: MarketTick | null; timeframe: Timeframe }> = ({ symbol, globalTick, timeframe }) => {
    const [historicalCandles, setHistoricalCandles] = useState<OHLCVCandle[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                setIsLoading(true);
                setError(null);
                setHistoricalCandles([]);
                
                const response = await fetch(`http://localhost:8081/api/symbols/${symbol}/chart?interval=${timeframe}`);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.length > 0) {
                        setHistoricalCandles(data);
                    } else {
                        setError(`Ticker '${symbol}' not found or no data available.`);
                    }
                } else {
                    setError(`Ticker '${symbol}' does not exist (HTTP ${response.status}).`);
                }
            } catch (err) {
                setError(`Network error: Unable to resolve ticker '${symbol}'.`);
            } finally {
                setIsLoading(false);
            }
        };

        fetchHistory();
    }, [symbol, timeframe]);

    const displayedTick = globalTick?.symbol === symbol ? globalTick : null;
    const { candles, currentCandle } = useMarketCandles(displayedTick);

    const intervalMs = INTERVAL_MS[timeframe];
    const liveCandles = currentCandle ? [...candles, currentCandle] : candles;
    const rawChartData = [...historicalCandles, ...liveCandles];
    const uniqueDataMap = new Map();

    rawChartData.forEach(candle => {
        const alignedMs = Math.floor(candle.time / intervalMs) * intervalMs;
        const unixTime = Math.floor(alignedMs / 1000);
        
        const existing = uniqueDataMap.get(unixTime);
        if (existing) {
            uniqueDataMap.set(unixTime, {
                ...existing,
                close: candle.close,
                high: Math.max(existing.high, candle.high),
                low: Math.min(existing.low, candle.low),
                volume: existing.volume + (candle.volume || 0)
            });
        } else {
            uniqueDataMap.set(unixTime, { ...candle, time: unixTime as any });
        }
    });

    const chartData = Array.from(uniqueDataMap.values()).sort((a, b) => a.time - b.time);

    const currentPrice = chartData.length > 0 ? chartData[chartData.length - 1].close : null;
    const previousPrice = chartData.length > 1 ? chartData[chartData.length - 2].close : null;
    const priceColor = currentPrice && previousPrice 
        ? (currentPrice >= previousPrice ? '#26a69a' : '#ef5350') 
        : '#d1d4dc';

    // חישוב סטטיסטיקות לפאנל המידע התחתון
    const periodHigh = chartData.length > 0 ? Math.max(...chartData.map(c => c.high)) : 0;
    const periodLow = chartData.length > 0 ? Math.min(...chartData.map(c => c.low)) : 0;
    const totalVolume = chartData.length > 0 ? chartData.reduce((sum, c) => sum + (c.volume || 0), 0) : 0;

    return (
        <div className="chart-container" style={{ border: '1px solid #2b2b43', borderRadius: '5px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 20px', background: '#131722', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2b2b43' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <h3 style={{ color: '#d1d4dc', margin: 0, fontSize: '1.2rem', fontWeight: '600' }}>{symbol}</h3>
                    {currentPrice && (
                        <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: priceColor }}>
                            ${currentPrice.toFixed(2)}
                        </span>
                    )}
                </div>
                {isLoading && <span style={{ fontSize: '0.8rem', color: '#f5a623' }}>Loading Data...</span>}
            </div>
            
            <div style={{ minHeight: '400px', flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e222d' }}>
                {isLoading ? (
                    <div style={{ color: '#8b9bb4', fontSize: '1.2rem' }}>Aggregating Market Data...</div>
                ) : error ? (
                    <div style={{ color: '#ef5350', fontSize: '1.2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <span>⚠️ {error}</span>
                        <span style={{ fontSize: '0.9rem', color: '#8b9bb4' }}>Please close this tab and enter a valid ticker.</span>
                    </div>
                ) : (
                    <div style={{ width: '100%', height: '400px' }}>
                        <TradingViewChart data={chartData} />
                    </div>
                )}
            </div>

            {/* פאנל פרטי נכס / Asset Details Panel */}
            {!isLoading && !error && chartData.length > 0 && (
                <div style={{ padding: '12px 20px', background: '#131722', borderTop: '1px solid #2b2b43', display: 'flex', gap: '30px', color: '#8b9bb4', fontSize: '0.9rem' }}>
                    <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Period High</span>
                        <span style={{ color: '#d1d4dc', fontWeight: '500' }}>${periodHigh.toFixed(2)}</span>
                    </div>
                    <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Period Low</span>
                        <span style={{ color: '#d1d4dc', fontWeight: '500' }}>${periodLow.toFixed(2)}</span>
                    </div>
                    <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Accumulated Volume</span>
                        <span style={{ color: '#d1d4dc', fontWeight: '500' }}>{totalVolume.toLocaleString()}</span>
                    </div>
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                        <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Data Points</span>
                        <span style={{ color: '#d1d4dc', fontWeight: '500' }}>{chartData.length} Candles</span>
                    </div>
                </div>
            )}
        </div>
    );
};

// ==========================================
// Main Dashboard Component
// ==========================================
const LiveDashboard: React.FC = () => {
    const { tick, status } = useLiveMarketData("ws://localhost:8000/ws/live");
    const { 
        subscribedList, 
        selectedSymbol, 
        setSelectedSymbol, 
        subscribe, 
        unsubscribe 
    } = useMarketSubscriptions();

    const [symbolInput, setSymbolInput] = useState<string>('');
    const [globalTimeframe, setGlobalTimeframe] = useState<Timeframe>('1m');

    const handleAddSymbol = async () => {
        if (symbolInput.trim()) {
            await subscribe(symbolInput.trim().toUpperCase());
            setSymbolInput('');
        }
    };

    return (
        <div className="live-dashboard">
            <header className="dashboard-header" style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2>Live Market Data (Pro Terminal)</h2>
                    <p className={`status-indicator ${status.toLowerCase()}`}>
                        Stream Status: {status}
                    </p> 
                </div>
                
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginTop: '10px' }}>
                    <div className="control-panel" style={{ display: 'flex', gap: '10px' }}>
                        <input 
                            type="text" 
                            placeholder="Enter Symbol (e.g. AAPL)" 
                            value={symbolInput}
                            onChange={(e) => setSymbolInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddSymbol()}
                            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #2b2b43', background: '#131722', color: '#fff' }}
                        />
                        <button onClick={handleAddSymbol} className="btn-primary" style={{ padding: '8px 16px', cursor: 'pointer' }}>
                            Subscribe
                        </button>
                    </div>

                    {/* TradingView-style Timeframe Selector */}
                    <div style={{ display: 'flex', background: '#131722', borderRadius: '4px', padding: '2px' }}>
                        {TIMEFRAMES.map(tf => (
                            <button
                                key={tf}
                                onClick={() => setGlobalTimeframe(tf)}
                                style={{
                                    background: globalTimeframe === tf ? '#2b2b43' : 'transparent',
                                    color: globalTimeframe === tf ? '#26a69a' : '#d1d4dc',
                                    border: 'none',
                                    padding: '6px 12px',
                                    borderRadius: '3px',
                                    cursor: 'pointer',
                                    fontWeight: globalTimeframe === tf ? 'bold' : 'normal',
                                }}
                            >
                                {tf.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>

                {subscribedList.length > 0 && (
                    <div className="tabs-container" style={{ marginTop: '15px' }}>
                        {subscribedList.map((sym: string) => (
                            <div key={sym} className="tab-group">
                                <button 
                                    className={`tab-btn ${selectedSymbol === sym ? 'active' : ''}`}
                                    onClick={() => setSelectedSymbol(sym)}
                                >
                                    {sym}
                                </button>
                                <button 
                                    className="tab-close-btn"
                                    onClick={() => unsubscribe(sym)}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </header>

            <main className="dashboard-content">
                {subscribedList.length === 0 ? (
                    <p style={{ color: '#8b9bb4' }}>No symbol selected. Enter a symbol or select one from the tabs.</p>
                ) : (
                    subscribedList.map((sym: string) => (
                        <div key={sym} style={{ display: sym === selectedSymbol ? 'block' : 'none' }}>
                            <SymbolLiveChart symbol={sym} globalTick={tick} timeframe={globalTimeframe} />
                        </div>
                    ))
                )}
            </main>
        </div>
    );
};

export default LiveDashboard;