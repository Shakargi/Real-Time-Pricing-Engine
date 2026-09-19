import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const NavBar: React.FC = () => {
    const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
    const navRef = useRef<HTMLDivElement>(null);
    const location = useLocation();

    useEffect(() => {
        const timeout = setTimeout(() => {
            if (navRef.current) {
                const activeElement = navRef.current.querySelector('.active') as HTMLElement;
                if (activeElement) {
                    setIndicatorStyle({
                        left: activeElement.offsetLeft,
                        width: activeElement.offsetWidth
                    });
                }
            }
        }, 50);

        return () => clearTimeout(timeout);
    }, [location.pathname]);

    return (
        <nav className="glass-nav-pill" ref={navRef}>
            <div 
                className="nav-indicator" 
                style={{ left: `${indicatorStyle.left}px`, width: `${indicatorStyle.width}px` }} 
            />
            
            <NavLink to="/live" className={({ isActive }) => isActive ? "tab-button active" : "tab-button"}>
                Live Trading
            </NavLink>
            <NavLink to="/monte-carlo" className={({ isActive }) => isActive ? "tab-button active" : "tab-button"}>
                Monte Carlo Simulation
            </NavLink>
        </nav>
    );
};

export default NavBar;