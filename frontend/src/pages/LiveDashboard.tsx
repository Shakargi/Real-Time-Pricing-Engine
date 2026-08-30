import React, { useState, useEffect } from 'react';
import { useLiveMarketData } from '../hooks/useLiveMarketData';
import { useMarketSubscriptions } from '../hooks/useMarketSubscriptions';
import type { MarketTick } from '../types';

const LiveDashboard: React.FC = () => {
    // 1. Network & State Hooks
    const { tick, status } = useLiveMarketData("ws://localhost:8000/ws/live");
    const { 
        subscribedList, 
        selectedSymbol, 
        setSelectedSymbol, 
        subscribe, 
        unsubscribe 
    } = useMarketSubscriptions();

    // 2. Local UI State
    const [symbolInput, setSymbolInput] = useState<string>('');
    const [activeTickers, setActiveTickers] = useState<Record<string, MarketTick>>({});

    // 3. Data Aggregation Effect
    useEffect(() => {
        if (tick) {
            setActiveTickers(prev => ({
                ...prev,
                [tick.symbol]: tick
            }));
        }
    }, [tick]);

    // 4. Clean UI Handlers
    const handleAddSymbol = async () => {
        if (symbolInput.trim()) {
            await subscribe(symbolInput.trim());
            setSymbolInput('');
        }
    };

    const handleRemoveSymbol = async (symbol: string) => {
        await unsubscribe(symbol);
        setActiveTickers(prev => {
            const newState = { ...prev };
            delete newState[symbol];
            return newState;
        });
    };

    const displayedTick = selectedSymbol ? activeTickers[selectedSymbol] : null;

    // 5. Render
    return (
        <div className="live-dashboard">
            <header className="dashboard-header">
                <h2>Live Market Data (Focused View)</h2>
                <p className={`status-indicator ${status.toLowerCase()}`}>
                    Stream Status: {status}
                </p> 
                
                <div className="control-panel">
                    <input 
                        type="text" 
                        placeholder="Enter Symbol (e.g. BTCUSDT, SPY)" 
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
                        {subscribedList.map(sym => (
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

            <main className="dashboard-content">
                {selectedSymbol ? (
                    displayedTick ? (
                        <div className="debug-panel">
                            <h3>Focusing on: <span>{selectedSymbol}</span></h3>
                            {/* בעתיד הקרוב נחליף את בלוק ה-pre הזה בקומפוננטת TradingViewChart */}
                            <pre className="json-display">
                                {JSON.stringify(displayedTick, null, 2)}
                            </pre>
                        </div>
                    ) : (
                        <p>Waiting for the first tick of {selectedSymbol}...</p>
                    )
                ) : (
                    <p>No symbol selected. Enter a symbol or select one from the tabs.</p>
                )}
            </main>
        </div>
    );
};

export default LiveDashboard;