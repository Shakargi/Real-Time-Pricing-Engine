import React, { memo, useCallback } from 'react';
import type { TabView, ConnectionState } from '../types';
import { ConnectionStatus } from './ConnectionStatus';

interface HeaderProps {
  activeTab: TabView;
  onTabChange: (tab: TabView) => void;
  connectionStatus: ConnectionState;
}

export const Header: React.FC<HeaderProps> = memo(({ activeTab, onTabChange, connectionStatus }) => {
  const handleLiveClick = useCallback(() => onTabChange('LIVE_DASHBOARD'), [onTabChange]);
  const handleForecastClick = useCallback(() => onTabChange('FORECASTING'), [onTabChange]);

  return (
    <header className="header-container">
      <div className="brand-section">
        <div className="brand">
          <h1>Distributed Options Engine</h1>
          <p>Real-Time Pricing Matrix</p>
        </div>
        <nav className="tab-navigation">
          <button 
            className={`tab-button ${activeTab === 'LIVE_DASHBOARD' ? 'active' : ''}`}
            onClick={handleLiveClick}
          >
            Live Dashboard
          </button>
          <button 
            className={`tab-button ${activeTab === 'FORECASTING' ? 'active' : ''}`}
            onClick={handleForecastClick}
          >
            Forecasting Models
          </button>
        </nav>
      </div>
      <ConnectionStatus status={connectionStatus} />
    </header>
  );
});

Header.displayName = 'Header';