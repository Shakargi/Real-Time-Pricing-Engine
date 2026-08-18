import { useState, useEffect } from 'react';
import './App.css';

interface Asset {
  symbol: string;
  price: number;
}

function App() {
  const [asset, setAsset] = useState<Asset>({
    symbol: 'BTCUSDT',
    price: 0
  });

  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade');

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setAsset({
        symbol: data.s,
        price: parseFloat(data.p)
      });
    };

    ws.onerror = (error) => {
      console.error("WebSocket Error:", error);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, []);

  return (
    <div className="dashboard-container">
      <h1>לוח בקרה פיננסי בזמן אמת</h1>
      
      <div style={{ color: isConnected ? '#4caf50' : '#f44336', marginBottom: '20px' }}>
        {isConnected ? '● מחובר לזרם הנתונים' : '○ ממתין לחיבור...'}
      </div>

      <div className="ticker-card">
        <h2>{asset.symbol}</h2>
        <p className="price">
          {asset.price > 0 ? `$${asset.price.toFixed(2)}` : 'טוען...'}
        </p>
      </div>
    </div>
  );
}

export default App;