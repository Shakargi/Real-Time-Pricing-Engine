import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/NavBar';
import LiveDashboard from './pages/LiveDashboard';
import MonteCarloDashboard from './pages/MonteCarloDashboard';
import './App.css'; 

const App: React.FC = () => {
  return (
    <Router>
      <div className="app-layout">
        <Navbar />
        <main className="main-content">
          <Routes>
            {/* ניתוב אוטומטי מהנתיב הראשי לטאב הלייב */}
            <Route path="/" element={<Navigate to="/live" replace />} />
            
            {/* הראוטים של הטאבים שלנו */}
            <Route path="/live" element={<LiveDashboard />} />
            <Route path="/monte-carlo" element={<MonteCarloDashboard />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;