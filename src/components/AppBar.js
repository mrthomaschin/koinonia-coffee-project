import React, { useState } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import { PAGES, ASSETS, COLORS, FONTS, LAYOUT } from '../util/constants';
import './AppBar.css';

const AppBar = () => {
  const { currentPage, navigateTo } = useNavigation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);

  const navItems = [
    { label: 'MENU', page: PAGES.MENU },
    { label: 'ABOUT', page: PAGES.ABOUT },
    { label: 'BLOG', page: PAGES.BLOG },
    { label: 'GALLERY', page: PAGES.GALLERY },
    { label: 'EVENTS', page: PAGES.EVENTS },
    { label: 'CONTACT', page: PAGES.CONTACT }
  ];

  const handleNavClick = (page) => {
    navigateTo(page);
    setIsMenuOpen(false);
  };

  return (
    <div className="app-bar">
      <div className="app-bar-content">
        <img
          src={ASSETS.primary}
          alt="Koinonia Coffee Project"
          className="app-bar-logo"
          onClick={() => navigateTo(PAGES.HOME)}
          style={{ cursor: 'pointer' }}
        />

        <div className="app-bar-spacer" />

        <nav className="app-bar-nav-desktop">
          {navItems.map(({ label, page }) => (
            <div
              key={page}
              className="nav-item"
              onMouseEnter={() => setHoveredItem(page)}
              onMouseLeave={() => setHoveredItem(null)}
              onClick={() => handleNavClick(page)}
            >
              <span className="nav-label">{label}</span>
              <div
                className="nav-underline"
                style={{
                  width: (currentPage === page || hoveredItem === page) ? '40px' : '0'
                }}
              />
            </div>
          ))}

          <div className="app-bar-spacer" />

          <button className="find-us-button">
            FIND US THIS WEEK
          </button>
        </nav>

        <button
          className="app-bar-menu-button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          <span className="menu-icon">☰</span>
        </button>
      </div>

      {isMenuOpen && (
        <div className="app-bar-dropdown">
          {navItems.map(({ label, page }) => (
            <div
              key={page}
              className="dropdown-item"
              onClick={() => handleNavClick(page)}
            >
              <span className="dropdown-label">{label}</span>
              {currentPage === page && <div className="dropdown-underline" />}
            </div>
          ))}
          <div className="dropdown-button-container">
            <button className="find-us-button-mobile">
              FIND US THIS WEEK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppBar;
