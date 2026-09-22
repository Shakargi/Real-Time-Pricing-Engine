import React, { useState, useEffect } from 'react';
import { useMonteCarloData } from '../hooks/useMonteCarloData';
import FanChart from '../charts/FanChart';
import DistributionHistogram from '../charts/DistributionHistogram';
import ConnectionStatus from '../components/ConnectionStatus';

/**
 * Institutional Pre-Trade Monte Carlo Analysis Dashboard.
 * Features high-visibility KPMs (VaR, CVaR) and side-by-side stochastic distribution charts.
 */
const MonteCarloDashboard: React.FC = () => {
    const [inputSymbol, setInputSymbol] = useState<string>('');
    const [isComputing, setIsComputing] = useState<boolean>(false);

    // Engine WebSocket Connection
    const { data, status, requestSimulation } = useMonteCarloData("ws://localhost:8081/ws/monte-carlo");

    useEffect(() => {
        if (data) {
            setIsComputing(false);
        }
    }, [data]);

    const handleRunSimulation = () => {
        if (inputSymbol.trim() && status === 'CONNECTED') {
            setIsComputing(true);
            requestSimulation(inputSymbol.trim().toUpperCase());
        }
    };

    // Calculate approximate VaR/CVaR from FanChart bounds if backend doesn't explicitly send them
    const renderRiskMetric = (label: string, value: string | number | undefined, isCurrency: boolean = false) => (
        <div className="metric-card">
            <span className="metric-label">{label}</span>
            <span className={`metric-value ${value && typeof value === 'number' && value < 0 ? 'negative' : ''}`}>
                {value === undefined ? '-' : `${isCurrency ? '$' : ''}${typeof value === 'number' ? value.toFixed(2) : value}`}
            </span>
        </div>
    );

    return (
        <div className="main-panel fade-in" style={{ height: '100%', padding: 'var(--space-md)' }}>
            
            {/* Control & Status Toolbar */}
            <header className="toolbar">
                <div className="search-box" style={{ width: '350px' }}>
                    <input 
                        type="text" 
                        className="search-input"
                        placeholder="Target Asset (e.g., TSLA)" 
                        value={inputSymbol}
                        onChange={(e) => setInputSymbol(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRunSimulation()}
                    />
                    <button 
                        className="btn-primary"
                        onClick={handleRunSimulation}
                        disabled={isComputing || status !== 'CONNECTED'}
                        style={{ opacity: (isComputing || status !== 'CONNECTED') ? 0.5 : 1, width: '140px' }}
                    >
                        {isComputing ? 'SIMULATING...' : 'RUN ENGINE'}
                    </button>
                </div>
                
                <ConnectionStatus status={status} label="QUANT ENGINE" />
            </header>

            {/* Error Overlay */}
            {(status === 'ERROR' || status === 'DISCONNECTED') && (
                <div className="terminal-panel" style={{ padding: 'var(--space-md)', borderLeft: '4px solid var(--status-offline)' }}>
                    <span style={{ color: 'var(--status-offline)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                        SYSTEM FAULT: 
                    </span>
                    <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>
                        Lost connection to the quantitative pricing engine. Verify the backend WebSocket service is active.
                    </span>
                </div>
            )}

            {/* Empty / Loading State */}
            {!data && !isComputing && status === 'CONNECTED' && (
                <div className="empty-state terminal-panel" style={{ flex: 1 }}>
                    Enter an asset symbol to initiate a 10,000-path stochastic simulation.
                </div>
            )}

            {isComputing && (
                <div className="empty-state terminal-panel" style={{ flex: 1 }}>
                    <div className="skeleton-box" style={{ width: '300px', height: '4px', marginBottom: 'var(--space-md)' }} />
                    <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>Running 10,000-path simulation…</span>
                </div>
            )}

            {/* Simulation Results Layout */}
            {data && !isComputing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', flex: 1, overflow: 'hidden' }}>
                    
                    {/* High-Visibility KPM Summary Cards */}
                    <div className="metric-card-container terminal-panel" style={{ padding: 'var(--space-lg)', borderTop: 'none', borderLeft: '4px solid var(--border-active)' }}>
                        {renderRiskMetric('Target Asset', data.symbol)}
                        {renderRiskMetric('Initial Price (S0)', data.currentPrice, true)}
                        {renderRiskMetric('Time to Maturity (T)', `${data.timeToMaturity} Y`)}
                        {renderRiskMetric('Paths Simulated', data.simulatedPaths.toLocaleString())}
                        {/* Compute these once, precisely, server-side from the full simulated path
                            matrix (not approximated client-side from the already-binned fan chart
                            display data) and add var95 / cvar95 to the WS payload. Falls back to
                            '—' via renderRiskMetric until the backend sends them. */}
                        {renderRiskMetric('VaR (95%)', (data as any).var95, true)}
                        {renderRiskMetric('CVaR (95%)', (data as any).cvar95, true)}
                    </div>

                    {/* Data Visualization Grid (Side-by-Side) */}
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Shaded band shows the 5th–95th percentile range across all simulated paths.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', flex: 1, minHeight: 0 }}>
                        <div className="terminal-panel">
                            <FanChart data={data.fanChart} symbol={data.symbol} />
                        </div>
                        <div className="terminal-panel">
                            <DistributionHistogram data={data.histogram} symbol={data.symbol} />
                        </div>
                    </div>
                    
                </div>
            )}
        </div>
    );
};

export default MonteCarloDashboard;