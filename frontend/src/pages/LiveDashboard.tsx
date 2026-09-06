import React, { useState, useEffect } from 'react';
import { useLiveMarketData } from '../hooks/useLiveMarketData';
import { useMarketSubscriptions } from '../hooks/useMarketSubscriptions';
import { useMarketCandles } from '../hooks/useMarketCandles';
import TradingViewChart from '../charts/TradingViewCharts';
import type { MarketTick, OHLCVCandle } from '../types';

// ==========================================
// Isolated Chart Component for Each Symbol
// ==========================================
const SymbolLiveChart: React.FC<{ symbol: string; globalTick: MarketTick | null }> = ({ symbol, globalTick }) => {
    const [historicalCandles, setHistoricalCandles] = useState<OHLCVCandle[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // 1. Fetch 24-hour historical data on mount
    useEffect(() => {
        const fetchHistory = async () => {
            try {
                setIsLoading(true);
                setError(null);
                
                // Calls the new Java Endpoint with Fallback mechanism
                const response = await fetch(`http://localhost:8081/api/symbols/${symbol}/chart?interval=1m`);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.length > 0) {
                        setHistoricalCandles(data);
                        console.log(`[+] Loaded ${data.length} historical candles for ${symbol}`);
                    } else {
                        setError(`No data found for ${symbol}.`);
                    }
                } else {
                    setError(`Failed to fetch history (Status: ${response.status})`);
                }
            } catch (err) {
                console.error(`[-] Failed to fetch history for ${symbol}`, err);
                setError("Network error fetching history.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchHistory();
    }, [symbol]);

    // 2. Manage live candles strictly for this symbol
    const displayedTick = globalTick?.symbol === symbol ? globalTick : null;
    const { candles, currentCandle } = useMarketCandles(displayedTick);

    // 3. Combine historical backfill with real-time stream safely.
    const liveCandles = currentCandle ? [...candles, currentCandle] : candles;
    const rawChartData = [...historicalCandles, ...liveCandles];

    const uniqueDataMap = new Map();

    rawChartData.forEach(candle => {
        const minuteAlignedMs = Math.floor(candle.time / 60000) * 60000;
        
        const unixTime = Math.floor(minuteAlignedMs / 1000);
        
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

    return (
        <div className="chart-container" style={{ border: '1px solid #2b2b43', borderRadius: '5px', overflow: 'hidden' }}>
            <h3 style={{ padding: '10px', background: '#131722', color: '#26a69a', margin: 0, display: 'flex', justifyContent: 'space-between' }}>
                <span>{symbol} Live Chart</span>
            </h3>
            
            <div style={{ minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e222d' }}>
                {isLoading ? (
                    <div style={{ color: '#8b9bb4', fontSize: '1.2rem' }}>Fetching market data...</div>
                ) : error ? (
                    <div style={{ color: '#ef5350', fontSize: '1.2rem' }}>{error}</div>
                ) : (
                    <div style={{ width: '100%', height: '400px' }}>
                        <TradingViewChart data={chartData} />
                    </div>
                )}
            </div>
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

    const handleAddSymbol = async () => {
        if (symbolInput.trim()) {
            await subscribe(symbolInput.trim().toUpperCase());
            setSymbolInput('');
        }
    };

    const handleRemoveSymbol = async (symbol: string) => {
        await unsubscribe(symbol);
    };

    return (
        <div className="live-dashboard">
            <header className="dashboard-header">
                <h2>Live Market Data (Pro Terminal)</h2>
                <p className={`status-indicator ${status.toLowerCase()}`}>
                    Stream Status: {status}
                </p> 
                
                <div className="control-panel">
                    <input 
                        type="text" 
                        placeholder="Enter Symbol (e.g. BTCUSDT, AAPL)" 
                        value={symbolInput}
                        onChange={(e) => setSymbolInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSymbol()}
                    />
                    <button onClick={handleAddSymbol} className="btn-primary">
                        Subscribe
                    </button>
                </div>

                {subscribedList.length > 0 && (
                    <div className="tabs-container">
                        {/* TYPE FIX: explicitly defining sym as string */}
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
                                    onClick={() => handleRemoveSymbol(sym)}
                                    title={`Unsubscribe from ${sym}`}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </header>

            <main className="dashboard-content" style={{ padding: '20px' }}>
                {subscribedList.length === 0 ? (
                    <p>No symbol selected. Enter a symbol or select one from the tabs.</p>
                ) : (
                    /* TYPE FIX: explicitly defining sym as string */
                    subscribedList.map((sym: string) => (
                        <div key={sym} style={{ display: sym === selectedSymbol ? 'block' : 'none' }}>
                            <SymbolLiveChart symbol={sym} globalTick={tick} />
                        </div>
                    ))
                )}
            </main>
        </div>
    );
};

export default LiveDashboard;