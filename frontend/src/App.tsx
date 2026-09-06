import React, { useEffect } from 'react';
import { BrowserRouter as Router, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './components/NavBar';
import LiveDashboard from './pages/LiveDashboard';
import MonteCarloDashboard from './pages/MonteCarloDashboard';
import './App.css'; 

const DashboardLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === '/') {
      navigate('/live', { replace: true });
    }
  }, [location.pathname, navigate]);

  return (
    <main className="main-content" style={{ flexGrow: 1, overflow: 'hidden' }}>
      
      
      <div style={{ display: location.pathname.includes('/live') ? 'block' : 'none', height: '100%' }}>
        <LiveDashboard />
      </div>
      
      <div style={{ display: location.pathname.includes('/monte-carlo') ? 'block' : 'none', height: '100%' }}>
        <MonteCarloDashboard />
      </div>

    </main>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <div className="app-layout" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <Navbar />
        <DashboardLayout /> 
      </div>
    </Router>
  );
};

export default App;