import React from 'react';
import './Menu.css';
import SEO from '../../components/SEO';

interface MenuProps {
  availableHeight: number;
}

const Menu: React.FC<MenuProps> = ({ availableHeight }) => {
  return (
    <div className="menu-page" style={{ minHeight: availableHeight }}>
      <SEO title="Coffee Menu | Koinonia Coffee Project" description="Explore the Koinonia Coffee Project menu, from espresso drinks to thoughtfully prepared coffee." path="/menu" />
      <div className="menu-container">
        <div className="menu-header">
          <div>
            <h1 className="menu-title">Menu</h1>
          </div>
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
