import React, { useState, useEffect } from 'react';
import { useMonteCarloData } from '../hooks/useMonteCarloData';
import FanChart from '../charts/FanChart';
import DistributionHistogram from '../charts/DistributionHistogram';
import ConnectionStatus from '../components/ConnectionStatus';
import MetricCard from '../components/MetricCard';
import ErrorBanner from '../components/ErrorBanner';
import { useCountUp } from '../hooks/useCountUp';

/**
 * Institutional Pre-Trade Monte Carlo Analysis Dashboard.
 * Features high-visibility KPMs (VaR, CVaR) and side-by-side stochastic distribution charts.
 */
const MonteCarloDashboard: React.FC = () => {
    const [inputSymbol, setInputSymbol] = useState<string>('');
    const [isComputing, setIsComputing] = useState<boolean>(false);

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

    // Animate the headline numbers in when a run lands — this is the one
    // orchestrated "reveal" moment on this page; nothing else here animates
    // on its own.
    const animatedPrice = useCountUp(data?.currentPrice);
    const animatedPaths = useCountUp(data?.simulatedPaths);

    return (
        <div className="main-panel fade-in" style={{ height: '100%', padding: 'var(--space-md)' }}>

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

            {(status === 'ERROR' || status === 'DISCONNECTED') && (
                <ErrorBanner
                    title="SYSTEM FAULT"
                    message="Lost connection to the quantitative pricing engine. Verify the backend WebSocket service is active."
                />
            )}

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

            {data && !isComputing && (
                <div key={data.symbol} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', flex: 1, overflow: 'hidden' }}>

                    <div className="metric-card-container terminal-panel reveal" style={{ padding: 'var(--space-lg)', borderTop: 'none', borderLeft: '4px solid var(--border-active)' }}>
                        <MetricCard label="Target Asset" value={data.symbol} animateOnChange={false} />
                        <MetricCard label="Initial Price (S0)" value={animatedPrice} isCurrency />
                        <MetricCard label="Time to Maturity (T)" value={`${data.timeToMaturity} Y`} animateOnChange={false} />
                        <MetricCard label="Paths Simulated" value={animatedPaths != null ? Math.round(animatedPaths).toLocaleString() : undefined} animateOnChange={false} />
                        {/*
                          Compute these once, precisely, server-side from the full simulated path
                          matrix (not approximated client-side from the already-binned fan chart
                          display data) and add var95 / cvar95 to the WS payload. Falls back to
                          '—' via MetricCard until the backend sends them.
                        */}
                        <MetricCard label="VaR (95%)" value={(data as any).var95} isCurrency />
                        <MetricCard label="CVaR (95%)" value={(data as any).cvar95} isCurrency />
                    </div>

                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Shaded band shows the 5th–95th percentile range across all simulated paths.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', flex: 1, minHeight: 0 }}>
                        <div className="terminal-panel reveal reveal-delay-1">
                            <FanChart data={data.fanChart} symbol={data.symbol} />
                        </div>
                        <div className="terminal-panel reveal reveal-delay-2">
                            <DistributionHistogram data={data.histogram} symbol={data.symbol} />
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
};

export default MonteCarloDashboard;
