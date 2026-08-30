import React from 'react';
import { useMonteCarloData } from '../hooks/useMonteCarloData';
import ConnectionStatus from '../components/ConnectionStatus';

const MonteCarloDashboard: React.FC = () => {
    // Initialize the WebSocket connection to the Python backend
    const { data, status } = useMonteCarloData('ws://localhost:8000/ws/pricing');

    return (
        <div className="dashboard-container" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2>Monte Carlo Simulation 🎲</h2>
                <ConnectionStatus status={status} label="Pricing Stream" />
            </div>
            
            {/* Raw data visualization panel */}
            <div className="data-panel" style={{ background: '#1e293b', padding: '15px', borderRadius: '8px', minHeight: '200px' }}>
                {data ? (
                    <pre style={{ color: '#e2e8f0', margin: 0 }}>
                        {JSON.stringify(data, null, 2)}
                    </pre>
                ) : (
                    <p style={{ color: '#94a3b8' }}>Waiting for simulation results...</p>
                )}
            </div>
        </div>
    );
};

export default MonteCarloDashboard;