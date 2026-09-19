import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useNavigation } from '../contexts/NavigationContext';
import { ICONS, PAGES, PageType } from '../util/constants';
import './AppBar.css';

const navItems: { label: string; page: PageType }[] = [
  { label: 'MENU', page: PAGES.MENU },
  { label: 'SHOP', page: PAGES.SHOP },
  { label: 'GALLERY', page: PAGES.GALLERY },
  { label: 'CATERING', page: PAGES.CATERING },
  { label: 'EVENTS', page: PAGES.EVENTS },
  { label: 'ACCOUNT', page: PAGES.ACCOUNT },
  { label: 'CART', page: PAGES.CART }
];

const AccountIcon: React.FC = () => (
  <svg className="nav-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.6-3.5 3.1-5.5 7-5.5s6.4 2 7 5.5" />
  </svg>
);

const CartIcon: React.FC<{ count: number }> = ({ count }) => (
  <span className="nav-icon-wrap">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 1.9-1.4L22 8H6" />
      <circle cx="10" cy="20" r="1.25" />
      <circle cx="18" cy="20" r="1.25" />
    </svg>
    {count > 0 && <span className="cart-badge">{count > 99 ? '99+' : count}</span>}
  </span>
);

const AppBar: React.FC = () => {
  const { currentPage, navigateTo } = useNavigation();
  const { cart } = useCart();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<PageType | null>(null);
  const cartCount = cart.getTotalItems();

  const handleNavClick = (page: PageType): void => {
    navigateTo(page);
    setIsMenuOpen(false);
  };

  const renderIcon = (page: PageType): React.ReactNode => {
    if (page === PAGES.CART) return <CartIcon count={cartCount} />;
    if (page === PAGES.ACCOUNT) return <AccountIcon />;
    return null;
  };

  const getAccessibleLabel = (page: PageType): string | undefined => {
    if (page === PAGES.CART) return `Cart${cartCount ? `, ${cartCount} items` : ''}`;
    if (page === PAGES.ACCOUNT) return 'Account';
    return undefined;
  };

  return (
    <div className="app-bar">
      <div className="app-bar-content">
        <Link to="/" aria-label="Koinonia Coffee Project home">
          <img src={ICONS.primary} alt="Koinonia Coffee Project" className="app-bar-logo" />
        </Link>

        <div className="app-bar-spacer" />

        <nav className="app-bar-nav-desktop" aria-label="Main navigation">
          {navItems.map(({ label, page }) => {
            const isIcon = page === PAGES.CART || page === PAGES.ACCOUNT;
            return (
              <Link
                key={page}
                to={`/${page}`}
                className={`nav-item${isIcon ? ' nav-icon-item' : ''}`}
                onMouseEnter={() => setHoveredItem(page)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => handleNavClick(page)}
                aria-label={getAccessibleLabel(page)}
              >
                {isIcon ? renderIcon(page) : <span className="nav-label">{label}</span>}
                <div
                  className="nav-underline"
                  style={{
                    width: currentPage === page || hoveredItem === page
                      ? (isIcon ? '100%' : '40px')
                      : '0'
                  }}
                />
              </Link>
            );
          })}
        </nav>

        <button
          className="app-bar-menu-button"
          type="button"
          aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
        >
          <span className="menu-icon" aria-hidden="true">☰</span>
        </button>
      </div>

      {isMenuOpen && (
        <nav className="app-bar-dropdown" aria-label="Mobile navigation">
          {navItems.map(({ label, page }) => {
            if (page === PAGES.CART) return null;
            if (page === PAGES.ACCOUNT) {
              return (
                <div className="dropdown-icon-row" key="account-cart">
                  {[PAGES.ACCOUNT, PAGES.CART].map((iconPage) => (
                    <Link
                      key={iconPage}
                      to={`/${iconPage}`}
                      className="dropdown-item dropdown-icon-item"
                      aria-label={getAccessibleLabel(iconPage)}
                      onClick={() => handleNavClick(iconPage)}
                    >
                      {renderIcon(iconPage)}
                      {currentPage === iconPage && <div className="dropdown-underline" />}
                    </Link>
                  ))}
                </div>
              );
            }

            return (
              <Link
                key={page}
                to={`/${page}`}
                className="dropdown-item"
                onClick={() => handleNavClick(page)}
              >
                <span className="dropdown-label">{label}</span>
                {currentPage === page && <div className="dropdown-underline" />}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
};

export default AppBar;
