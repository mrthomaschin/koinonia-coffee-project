import React, { useState } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import { useCart } from '../contexts/CartContext';
import { PAGES, ASSETS, PageType } from '../util/constants';
import './AppBar.css';

const AppBar: React.FC = () => {
  const { currentPage, navigateTo } = useNavigation();
  const { cart } = useCart();
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [hoveredItem, setHoveredItem] = useState<PageType | null>(null);

  const cartItemCount = cart.getTotalItems();

  const navItems = [
    { label: 'MENU', page: PAGES.MENU },
    { label: 'SHOP', page: PAGES.SHOP },
    { label: 'OUR STORY', page: PAGES.ABOUT },
    { label: 'GALLERY', page: PAGES.GALLERY },
    { label: 'EVENTS', page: PAGES.EVENTS }
  ];

  const handleNavClick = (page: PageType): void => {
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

          <button
            className="cart-icon-button"
            onClick={() => handleNavClick(PAGES.CART)}
            aria-label="Shopping Cart"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            {cartItemCount > 0 && (
              <span className="cart-badge">{cartItemCount}</span>
            )}
          </button>

          <button className="contact-us-button" onClick={() => handleNavClick(PAGES.CONTACT)}>
            CONTACT US
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
          <div
            className="dropdown-item"
            onClick={() => handleNavClick(PAGES.CART)}
          >
            <span className="dropdown-label">CART</span>
            {currentPage === PAGES.CART && <div className="dropdown-underline" />}
          </div>
          <div className="dropdown-button-container">
            <button className="contact-us-button-mobile" onClick={() => handleNavClick(PAGES.CONTACT)}>
              CONTACT US
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppBar;
