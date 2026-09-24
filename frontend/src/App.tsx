import React, { useEffect } from 'react';
import { BrowserRouter as Router, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './components/NavBar';
import LiveDashboard from './pages/LiveDashboard';
import MonteCarloDashboard from './pages/MonteCarloDashboard';

import './index.css';
import './App.css';
import './styles/fintech-theme.css';
import './styles/motion.css'

const DashboardLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === '/') {
      navigate('/live', { replace: true });
    }
  }, [location.pathname, navigate]);

  return (
    <main className="workspace">
      {/* 
        Mounting both panels permanently to retain WebSocket connections 
        and prevent costly Canvas/Chart re-renders. 
      */}
      <div style={{ display: location.pathname.includes('/live') ? 'flex' : 'none', height: '100%', width: '100%', flexDirection: 'column' }}>
        <LiveDashboard />
      </div>
      
      <div style={{ display: location.pathname.includes('/monte-carlo') ? 'flex' : 'none', height: '100%', width: '100%', flexDirection: 'column' }}>
        <MonteCarloDashboard />
      </div>
    </main>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      {/* 100vh Locked Viewport Shell */}
      <div className="app-container">
        
        {/* Terminal Header */}
        <header className="header-container">
          {/* NavBar is now on the Left */}
          <Navbar />
          
          {/* Brand is now on the Right */}
          <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1>QuantTrading</h1>
          </div>
        </header>
        
        {/* Main Work Area */}
        <DashboardLayout /> 
        
        {/* Persistent Status Bar for Latency & WS States */}
        <footer style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            padding: '0.4rem 1.5rem', 
            backgroundColor: 'var(--bg-panel)', 
            borderTop: '1px solid var(--border-subtle)', 
            fontSize: '0.7rem', 
            color: 'var(--text-secondary)', 
            fontFamily: 'var(--font-mono)' 
        }}>
            <div style={{ display: 'flex', gap: '2rem' }}>
                <span style={{ color: 'var(--status-online)', fontWeight: 600 }}>● SYSTEM OPTIMAL</span>
                <span>LATENCY: &lt;15ms</span>
            </div>
            <div>
                <span>DATE: {new Date().toISOString().split('T')[0]}</span>
            </div>
        </footer>

      </div>
    </Router>
  );
};

export default App;