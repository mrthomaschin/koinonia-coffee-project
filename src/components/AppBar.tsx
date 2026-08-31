import React, { useState } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import { Link } from 'react-router-dom';
import { PAGES, ICONS, PageType } from '../util/constants';
import './AppBar.css';

const AppBar: React.FC = () => {
  const { currentPage, navigateTo } = useNavigation();
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [hoveredItem, setHoveredItem] = useState<PageType | null>(null);

  const navItems = [
    { label: 'MENU', page: PAGES.MENU },
    { label: 'SHOP', page: PAGES.SHOP },
    { label: 'OUR STORY', page: PAGES.ABOUT },
    { label: 'GALLERY', page: PAGES.GALLERY },
    { label: 'CATERING', page: PAGES.CATERING },
    { label: 'EVENTS', page: PAGES.EVENTS },
    { label: 'CART', page: PAGES.CART },
    { label: 'ACCOUNT', page: PAGES.ACCOUNT }
  ];

  const handleNavClick = (page: PageType): void => {
    navigateTo(page);
    setIsMenuOpen(false);
  };

  return (
    <div className="app-bar">
      <div className="app-bar-content">
        <Link to="/" aria-label="Koinonia Coffee Project home">
          <img src={ICONS.primary} alt="Koinonia Coffee Project" className="app-bar-logo" />
        </Link>

        <div className="app-bar-spacer" />

        <nav className="app-bar-nav-desktop">
          {navItems.map(({ label, page }) => (
            <Link
              key={page}
              to={`/${page}`}
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
            </Link>
          ))}

          <Link className="contact-us-button" to="/contact" onClick={() => setIsMenuOpen(false)}>
            CONTACT US
          </Link>
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
            <Link
              key={page}
              to={`/${page}`}
              className="dropdown-item"
              onClick={() => setIsMenuOpen(false)}
            >
              <span className="dropdown-label">{label}</span>
              {currentPage === page && <div className="dropdown-underline" />}
            </Link>
          ))}
          <div className="dropdown-button-container">
            <Link className="contact-us-button-mobile" to="/contact" onClick={() => setIsMenuOpen(false)}>
              CONTACT US
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppBar;
