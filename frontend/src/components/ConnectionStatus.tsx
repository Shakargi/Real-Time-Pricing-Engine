import React, { memo } from 'react';
import type { ConnectionState } from '../types';

interface ConnectionStatusProps {
  status: ConnectionState;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = memo(({ status }) => {
  const { isConnected, isConnecting } = status;
  
  let label = 'SYSTEM OFFLINE';
  let dotClass = 'offline';

  if (isConnecting) {
    label = 'CONNECTING...';
    dotClass = 'offline'; // Could add a yellow 'connecting' state CSS later
  } else if (isConnected) {
    label = 'WS: CONNECTED';
    dotClass = 'online';
  }

  return (
    <div className="status-badge">
      <span className={`status-dot ${dotClass}`} />
      <span>{label}</span>
    </div>
  );
});

ConnectionStatus.displayName = 'ConnectionStatus';