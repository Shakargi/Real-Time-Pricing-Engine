import React from 'react';
import { NavLink } from 'react-router-dom';

const Navbar: React.FC = () => {
  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <h1>QuantPricing</h1>
      </div>
      <div className="navbar-links">
        <NavLink 
          to="/live" 
          className={({ isActive }: { isActive: boolean }) => isActive ? "nav-link active" : "nav-link"}
        >
          Live Trading
        </NavLink>
        <NavLink 
          to="/monte-carlo" 
          className={({ isActive }: { isActive: boolean }) => isActive ? "nav-link active" : "nav-link"}
        >
          Monte Carlo
        </NavLink>
      </div>
    </nav>
  );
};

export default Navbar;