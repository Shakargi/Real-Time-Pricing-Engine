import React, { useCallback, useState } from 'react';
import { useLiveMarketData } from '../hooks/useLiveMarketData';
import { useMarketSubscriptions } from '../hooks/useMarketSubscriptions';
import SymbolLiveChart from '../components/SymbolLiveChart';
import WatchlistItem from '../components/WatchlistItem';
import ErrorBanner from '../components/ErrorBanner';
import ConnectionStatus from '../components/ConnectionStatus';
import { TIMEFRAMES, type Timeframe } from '../constants/timeframes';

/**
 * LiveDashboard
 *
 * The primary layout for the trading terminal. Manages the global WebSocket
 * connection, watchlist subscriptions, and the active timeframe. Individual
 * symbol rendering lives in SymbolLiveChart; watchlist rows in WatchlistItem.
 */
const LiveDashboard: React.FC = () => {
    const { subscribedList, selectedSymbol, setSelectedSymbol, subscribe, unsubscribe } = useMarketSubscriptions();

    // Subscribes over STOMP to /topic/market/{selectedSymbol} specifically —
    // see useLiveMarketData for why this replaced the previous raw-WebSocket
    // implementation, which never actually received anything from this
    // endpoint despite looking "connected".
    const { candle: liveCandle, status } = useLiveMarketData("ws://localhost:8081/ws/market-data", selectedSymbol || null);

    const [symbolInput, setSymbolInput] = useState<string>('');
    const [globalTimeframe, setGlobalTimeframe] = useState<Timeframe>('1d');
    // Latest price/change per symbol, reported up by each SymbolLiveChart so the
    // watchlist can show a live number without every row fetching independently.
    const [prices, setPrices] = useState<Record<string, { price: number; changePct: number }>>({});

    const handlePriceUpdate = useCallback((symbol: string, price: number, changePct: number) => {
        setPrices(prev => {
            const existing = prev[symbol];
            if (existing && existing.price === price && existing.changePct === changePct) return prev;
            return { ...prev, [symbol]: { price, changePct } };
        });
    }, []);

    const addSymbol = () => {
        if (!symbolInput) return;
        subscribe(symbolInput.trim().toUpperCase());
        setSymbolInput('');
    };

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
                        onKeyDown={(e) => e.key === 'Enter' && addSymbol()}
                    />
                    <button className="btn-primary" onClick={addSymbol}>
                        +
                    </button>
                </div>

                <div className="watchlist-container">
                    {subscribedList.length === 0 ? (
                        <div className="empty-state" style={{ padding: '2rem 0' }}>Watchlist is empty.</div>
                    ) : (
                        subscribedList.map((sym: string) => (
                            <WatchlistItem
                                key={sym}
                                symbol={sym}
                                active={selectedSymbol === sym}
                                price={prices[sym]?.price}
                                changePct={prices[sym]?.changePct}
                                onSelect={() => setSelectedSymbol(sym)}
                                onRemove={() => unsubscribe(sym)}
                            />
                        ))
                    )}
                </div>
            </aside>

            {/* Main Content Area: Action Toolbar & Charting Engine */}
            <main className="main-panel">
                <div className="toolbar">
                    <div className="chart-toggle-group">
                        {TIMEFRAMES.map(tf => (
                            <button
                                key={tf}
                                className={`toggle-btn ${globalTimeframe === tf ? 'active' : ''}`}
                                aria-pressed={globalTimeframe === tf}
                                onClick={() => setGlobalTimeframe(tf)}
                            >
                                {tf}
                            </button>
                        ))}
                    </div>
                    <ConnectionStatus status={status} label="STREAM" />
                </div>

                {(status === 'ERROR' || status === 'DISCONNECTED') && (
                    <ErrorBanner
                        title="SYSTEM FAULT"
                        message="Lost connection to the live market data stream. Prices below may be stale until it reconnects."
                    />
                )}

                <div style={{ flex: 1, overflow: 'hidden' }}>
                    {subscribedList.length === 0 ? (
                        <div className="empty-state terminal-panel">
                            Add a symbol to your watchlist to load market data.
                        </div>
                    ) : selectedSymbol ? (
                        <SymbolLiveChart
                            key={selectedSymbol}
                            symbol={selectedSymbol}
                            globalCandle={liveCandle}
                            timeframe={globalTimeframe}
                            onPriceUpdate={handlePriceUpdate}
                        />
                    ) : (
                        <div className="empty-state terminal-panel">
                            Select a symbol from your watchlist.
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default LiveDashboard;