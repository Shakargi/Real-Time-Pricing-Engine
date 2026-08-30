import React from 'react';
// Explicit type-only import
import type { ConnectionState } from '../types';

interface ConnectionStatusProps {
    status: ConnectionState;
    label?: string;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status, label = "Data Stream" }) => {
    // Determine color based on current connection state
    const getStatusColor = (): string => {
        switch (status) {
            case 'CONNECTED':
                return '#4ade80'; // Green
            case 'CONNECTING':
                return '#facc15'; // Yellow
            case 'DISCONNECTED':
            case 'ERROR':
                return '#f87171'; // Red
            default:
                return '#94a3b8'; // Gray
        }
    };

    const statusColor = getStatusColor();

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#e2e8f0' }}>
            <div 
                style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: statusColor,
                    boxShadow: status === 'CONNECTED' ? `0 0 8px ${statusColor}` : 'none',
                    transition: 'all 0.3s ease-in-out'
                }}
            />
            <span>{label}: {status}</span>
        </div>
    );
};

export default ConnectionStatus;