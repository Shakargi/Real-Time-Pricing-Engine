import React, { useState, useEffect } from 'react';
import { useMonteCarloData } from '../hooks/useMonteCarloData';
import FanChart from '../charts/FanChart';
import DistributionHistogram from '../charts/DistributionHistogram';

/**
 * The main dashboard for Pre-Trade Monte Carlo Analysis.
 * Communicates with the backend engine via WebSockets for real-time processing.
 */
const MonteCarloDashboard: React.FC = () => {
    const [inputSymbol, setInputSymbol] = useState<string>('');
    // Local state to manage the loading UI while waiting for the WS response
    const [isComputing, setIsComputing] = useState<boolean>(false);

    // Initialize WebSocket connection using the correct endpoint
    const { data, status, requestSimulation } = useMonteCarloData("ws://localhost:8081/ws/monte-carlo");

    // Automatically hide the loading spinner when new data arrives
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

    return (
        <div className="dashboard-container" style={{ padding: '20px', color: '#d1d4dc' }}>
            <header style={{ marginBottom: '20px', borderBottom: '1px solid #2b2b43', paddingBottom: '15px' }}>
                <h2>Monte Carlo Options Pricing Engine</h2>
                <div style={{ display: 'flex', gap: '10px', marginTop: '15px', alignItems: 'center' }}>
                    <input 
                        type="text" 
                        placeholder="Enter Asset Symbol (e.g., AAPL)" 
                        value={inputSymbol}
                        onChange={(e) => setInputSymbol(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRunSimulation()}
                        style={{ padding: '8px 12px', background: '#131722', color: '#fff', border: '1px solid #2b2b43', borderRadius: '4px' }}
                    />
                    <button 
                        onClick={handleRunSimulation}
                        disabled={isComputing || status !== 'CONNECTED'}
                        style={{ 
                            padding: '8px 16px', 
                            background: '#26a69a', 
                            color: '#fff', 
                            border: 'none', 
                            borderRadius: '4px', 
                            cursor: (isComputing || status !== 'CONNECTED') ? 'not-allowed' : 'pointer',
                            opacity: (isComputing || status !== 'CONNECTED') ? 0.6 : 1
                        }}
                    >
                        {isComputing ? 'Simulating...' : 'Run Simulation'}
                    </button>
                    
                    {/* Connection Status Indicator */}
                    <span style={{ 
                        marginLeft: '10px', 
                        fontSize: '0.9em',
                        color: status === 'CONNECTED' ? '#26a69a' : (status === 'ERROR' || status === 'DISCONNECTED' ? '#f23645' : '#e1ad01')
                    }}>
                        {status === 'CONNECTED' ? '● Connected' : `● ${status}`}
                    </span>
                </div>
            </header>

            {/* Error/Disconnected State */}
            {(status === 'ERROR' || status === 'DISCONNECTED') && (
                <div style={{ background: 'rgba(242, 54, 69, 0.1)', color: '#f23645', padding: '15px', borderRadius: '4px', marginBottom: '20px' }}>
                    <strong>Warning:</strong> Connection to pricing engine lost. Please check if the backend is running.
                </div>
            )}

            {/* Loading State */}
            {isComputing && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '50px' }}>
                    <div className="spinner" style={{ color: '#26a69a' }}>Engine is computing 10,000 paths...</div>
                </div>
            )}

            {/* Data Visualization */}
            {data && !isComputing && (
                <div className="results-container">
                    {/* Key Metrics Panel */}
                    <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', background: '#1e222d', padding: '15px', borderRadius: '5px' }}>
                        <div><strong>Asset:</strong> {data.symbol}</div>
                        <div><strong>Initial Price (S0):</strong> ${data.currentPrice.toFixed(2)}</div>
                        <div><strong>Time to Maturity (T):</strong> {data.timeToMaturity} Years</div>
                        <div><strong>Paths Simulated:</strong> {data.simulatedPaths.toLocaleString()}</div>
                    </div>

                    {/* Charts Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '20px' }}>
                        <div style={{ background: '#131722', border: '1px solid #2b2b43', borderRadius: '5px' }}>
                            <FanChart data={data.fanChart} symbol={data.symbol} />
                        </div>
                        <div style={{ background: '#131722', border: '1px solid #2b2b43', borderRadius: '5px' }}>
                            <DistributionHistogram data={data.histogram} symbol={data.symbol} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MonteCarloDashboard;