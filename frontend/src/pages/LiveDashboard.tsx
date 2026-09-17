import React, { useState, useEffect } from 'react';
import { useLiveMarketData } from '../hooks/useLiveMarketData';
import { useMarketSubscriptions } from '../hooks/useMarketSubscriptions';
import { useMarketCandles } from '../hooks/useMarketCandles';
import TradingViewChart from '../charts/TradingViewCharts';
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
    const priceColor = currentPrice && previousPrice ? (currentPrice >= previousPrice ? '#26a69a' : '#ef5350') : '#d1d4dc';

    const periodHigh = chartData.length > 0 ? Math.max(...chartData.map(c => c.high)) : 0;
    const periodLow = chartData.length > 0 ? Math.min(...chartData.map(c => c.low)) : 0;
    const totalVolume = chartData.length > 0 ? chartData.reduce((sum, c) => sum + (c.volume || 0), 0) : 0;

    return (
        <div style={{ border: '1px solid #2b2b43', borderRadius: '5px', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#131722' }}>
            <div style={{ padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2b2b43' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '15px' }}>
                    <h3 style={{ color: '#d1d4dc', margin: 0, fontSize: '1.4rem' }}>
                        {symbol} <span style={{ fontSize: '0.9rem', color: '#8b9bb4', fontWeight: 'normal' }}>{profile?.name ? `| ${profile.name}` : ''}</span>
                    </h3>
                    {currentPrice && (
                        <span style={{ fontSize: '1.6rem', fontWeight: 'bold', color: priceColor }}>
                            ${currentPrice.toFixed(2)}
                        </span>
                    )}
                </div>
                {isLoading && <span style={{ color: '#f5a623', fontSize: '0.9rem' }}>Loading Chart...</span>}
            </div>
            
            <div style={{ minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e222d' }}>
                {isLoading ? (
                    <div style={{ color: '#8b9bb4' }}>Aggregating Market Data...</div>
                ) : error ? (
                    <div style={{ color: '#ef5350' }}>⚠️ {error}</div>
                ) : (
                    <div style={{ width: '100%', height: '400px' }}><TradingViewChart data={chartData} /></div>
                )}
            </div>

            {!isLoading && !error && chartData.length > 0 && profile && (
                <div style={{ borderTop: '1px solid #2b2b43' }}>
                    <div style={{ padding: '12px 20px', display: 'flex', flexWrap: 'wrap', gap: '30px', borderBottom: '1px solid rgba(43,43,67,0.5)', color: '#8b9bb4', fontSize: '0.85rem', background: '#1a1e29' }}>
                        <div><span style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.7rem' }}>Period High</span><span style={{ color: '#d1d4dc' }}>${periodHigh.toFixed(2)}</span></div>
                        <div><span style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.7rem' }}>Period Low</span><span style={{ color: '#d1d4dc' }}>${periodLow.toFixed(2)}</span></div>
                        <div><span style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.7rem' }}>Total Volume</span><span style={{ color: '#d1d4dc' }}>{totalVolume.toLocaleString()}</span></div>
                        <div><span style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.7rem' }}>Market Cap</span><span style={{ color: '#d1d4dc' }}>{profile.marketCap || '-'}</span></div>
                        <div><span style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.7rem' }}>P/E Ratio</span><span style={{ color: '#d1d4dc' }}>{profile.trailingPE || '-'}</span></div>
                        <div><span style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.7rem' }}>Beta</span><span style={{ color: '#d1d4dc' }}>{profile.beta || '-'}</span></div>
                        <div><span style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.7rem' }}>Div Yield</span><span style={{ color: '#d1d4dc' }}>{profile.dividendYield || '-'}</span></div>
                    </div>
                    <div style={{ padding: '15px 20px', color: '#8b9bb4', fontSize: '0.85rem', lineHeight: '1.6' }}>
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
        <div style={{ padding: '20px', color: '#d1d4dc' }}>
            {/* Header Layout Fix */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '20px', background: '#131722', padding: '20px', borderRadius: '8px', border: '1px solid #2b2b43' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                    <h2 style={{ margin: 0 }}>Live Market Data (Pro Terminal)</h2>
                    <div style={{ padding: '6px 12px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.9rem', background: status === 'CONNECTED' ? 'rgba(38, 166, 154, 0.1)' : 'rgba(239, 83, 80, 0.1)', color: status === 'CONNECTED' ? '#26a69a' : '#ef5350' }}>
                        Stream Status: {status}
                    </div>
                </div>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input 
                            type="text" 
                            placeholder="Symbol (e.g. AAPL)" 
                            value={symbolInput}
                            onChange={(e) => setSymbolInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && symbolInput && (subscribe(symbolInput.trim().toUpperCase()), setSymbolInput(''))}
                            style={{ padding: '10px', borderRadius: '4px', border: '1px solid #2b2b43', background: '#1e222d', color: '#fff', width: '200px' }}
                        />
                        <button onClick={() => symbolInput && (subscribe(symbolInput.trim().toUpperCase()), setSymbolInput(''))} style={{ padding: '10px 20px', background: '#2962ff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                            Subscribe
                        </button>
                    </div>

                    <div style={{ display: 'flex', background: '#1e222d', borderRadius: '4px', padding: '4px' }}>
                        {TIMEFRAMES.map(tf => (
                            <button
                                key={tf}
                                onClick={() => setGlobalTimeframe(tf)}
                                style={{ background: globalTimeframe === tf ? '#2b2b43' : 'transparent', color: globalTimeframe === tf ? '#fff' : '#8b9bb4', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: globalTimeframe === tf ? 'bold' : 'normal' }}
                            >
                                {tf.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {subscribedList.length > 0 && (
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', overflowX: 'auto' }}>
                    {subscribedList.map((sym: string) => (
                        <div key={sym} style={{ display: 'flex', alignItems: 'center', background: selectedSymbol === sym ? '#2962ff' : '#1e222d', borderRadius: '4px', overflow: 'hidden' }}>
                            <button onClick={() => setSelectedSymbol(sym)} style={{ padding: '10px 20px', background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: selectedSymbol === sym ? 'bold' : 'normal' }}>
                                {sym}
                            </button>
                            <button onClick={() => unsubscribe(sym)} style={{ padding: '10px', background: 'transparent', color: '#8b9bb4', border: 'none', cursor: 'pointer' }}>✕</button>
                        </div>
                    ))}
                </div>
            )}

            <main>
                {subscribedList.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '50px', color: '#8b9bb4', background: '#131722', borderRadius: '8px', border: '1px solid #2b2b43' }}>
                        No active streams. Subscribe to a symbol to view live market data.
                    </div>
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