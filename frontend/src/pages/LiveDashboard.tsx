import React, { useEffect, useState } from 'react';
import { useLiveMarketData } from '../hooks/useLiveMarketData';
import { useMarketSubscriptions } from '../hooks/useMarketSubscriptions';
import { useSymbolLogos } from '../hooks/useSymbolLogos';
import { useWatchlistPrices } from '../hooks/useWatchlistPrices';
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
    const { subscribedList, selectedSymbol, setSelectedSymbol, subscribe, unsubscribe, resyncStreams } = useMarketSubscriptions();
    const logos = useSymbolLogos(subscribedList);

    // Subscribes over STOMP to /topic/market/{selectedSymbol} specifically —
    // see useLiveMarketData for why this replaced the previous raw-WebSocket
    // implementation, which never actually received anything from this
    // endpoint despite looking "connected".
    const { candle: liveCandle, status } = useLiveMarketData("ws://localhost:8081/ws/market-data", selectedSymbol || null);

    // Server-side subscriptions are in-memory, so they're empty after a backend restart or a
    // fresh page load (the watchlist itself is restored from localStorage). Re-register every
    // watchlist symbol each time the live connection (re)establishes.
    useEffect(() => {
        if (status === 'CONNECTED') resyncStreams();
    }, [status, resyncStreams]);

    const [symbolInput, setSymbolInput] = useState<string>('');
    const [globalTimeframe, setGlobalTimeframe] = useState<Timeframe>('1d');
    // Live price + rolling 1-minute change for every watchlist row, independent of the
    // selected symbol's own STOMP connection above.
    const prices = useWatchlistPrices("ws://localhost:8081/ws/market-data", subscribedList);

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
                                logoUrl={logos[sym]}
                                price={prices[sym]?.price}
                                changePct={prices[sym]?.changePct ?? undefined}
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