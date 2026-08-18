import React, { useState, useEffect } from 'react';
import type { PricingData, ConnectionState, TabView } from './types';
import { Header } from './components/Header';
import { LiveDashboard } from './components/LiveDashboard';
import './styles/fintech-theme.css';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabView>('LIVE_DASHBOARD');
  const [marketData, setMarketData] = useState<Record<string, PricingData>>({});
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [connection, setConnection] = useState<ConnectionState>({
    isConnected: false,
    isConnecting: true,
    error: null,
  });

  // 1. WebSocket Connection - Runs EXACTLY once on mount
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws');

    ws.onopen = () => setConnection({ isConnected: true, isConnecting: false, error: null });

    ws.onmessage = (event: MessageEvent) => {
      try {
        const incomingData: PricingData = JSON.parse(event.data);
        setMarketData((prev) => ({
          ...prev,
          [incomingData.symbol]: incomingData,
        }));
      } catch (error) {
        console.error('Data parse error:', error);
      }
    };

    ws.onclose = () => setConnection({ isConnected: false, isConnecting: false, error: 'Disconnected' });

    return () => ws.close();
  }, []); // <-- Empty dependency array prevents reconnects!

  // 2. Auto-select the first symbol if none is selected
  useEffect(() => {
    if (!selectedSymbol) {
      const symbols = Object.keys(marketData);
      if (symbols.length > 0) {
        setSelectedSymbol(symbols[0]);
      }
    }
  }, [marketData, selectedSymbol]);

  return (
    <div className="app-container">
      <Header 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        connectionStatus={connection} 
      />

      <main className="workspace">
        <div key={activeTab} className="tab-transition-wrapper">
          {activeTab === 'LIVE_DASHBOARD' ? (
            <LiveDashboard 
              marketData={marketData} 
              selectedSymbol={selectedSymbol}
              onSelectSymbol={setSelectedSymbol}
            />
          ) : (
            <div className="empty-state">Forecasting Models Module - Offline</div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;