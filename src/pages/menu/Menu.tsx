import React from 'react';
import './Menu.css';

interface MenuProps {
  availableHeight: number;
}

const Menu: React.FC<MenuProps> = ({ availableHeight }) => {
  return (
    <div className="menu-page" style={{ minHeight: availableHeight }}>
      <div className="menu-container">
        <div className="menu-header">
          <h1 className="menu-title">Our Menu</h1>
          <p className="menu-subtitle">we take our craft seriously, from the coffee bean to the cup.</p>
        </div>
        <div className="menu-image-wrapper">
          <img
            src="/assets/Menu.png"
            alt="Koinonia Coffee Project Menu"
            className="menu-image"
          />
        </div>
      </div>
    </div>
  );
};

export default Menu;
