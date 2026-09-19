import React from 'react';
import type { ConnectionState } from '../types';

interface ConnectionStatusProps {
    status: ConnectionState;
    label?: string;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status, label = "STREAM" }) => {
    // Map the robust WebSocket connection states to our strict semantic CSS classes
    const getStatusClass = (): string => {
        switch (status) {
            case 'CONNECTED':
                return 'online';
            case 'CONNECTING':
                return 'processing';
            case 'DISCONNECTED':
            case 'ERROR':
                return 'offline';
            default:
                return 'offline';
        }
    };

    return (
        <div className="status-badge">
            <div className={`status-dot ${getStatusClass()}`} />
            <span>{label}: {status}</span>
        </div>
    );
};

export default ConnectionStatus;