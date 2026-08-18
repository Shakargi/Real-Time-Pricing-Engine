import React from 'react';
import type { PricingData } from '../types';
import { DataRow } from './DataRow';
import { TradingViewChart } from './Charts';

interface LiveDashboardProps {
  marketData: Record<string, PricingData>;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export const LiveDashboard: React.FC<LiveDashboardProps> = ({ 
  marketData, 
  selectedSymbol, 
  onSelectSymbol 
}) => {
  const dataEntries = Object.values(marketData);

  if (dataEntries.length === 0) {
    return (
      <div className="empty-state">
        <p>Awaiting live market ticks...</p>
      </div>
    );
  }

  const activeSymbol = selectedSymbol || dataEntries[0]?.symbol || '';
  const currentTick = marketData[activeSymbol];

  return (
    <div className="dashboard-grid-layout">
      {/* Left Pane: High Density Data Grid */}
      <div className="grid-container">
        <table className="data-grid">
          <thead>
            <tr>
              <th>Symbol</th>
              <th className="align-right">Underlying Price</th>
              <th className="align-right">Option Price</th>
            </tr>
          </thead>
          <tbody>
            {dataEntries.map((data) => (
              <DataRow 
                key={data.symbol} 
                data={data} 
                isSelected={data.symbol === activeSymbol}
                onSelect={onSelectSymbol}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Right Pane: TradingView Real-Time Chart */}
      <div className="chart-panel">
        <TradingViewChart 
          selectedSymbol={activeSymbol} 
          latestTick={currentTick} 
        />
      </div>
    </div>
  );
};