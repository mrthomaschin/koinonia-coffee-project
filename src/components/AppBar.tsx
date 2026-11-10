import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useCart } from "../contexts/CartContext";
import { useInventory } from "../contexts/InventoryContext";
import { ICONS, PAGES } from "../util/constants";
import { SHOP_CATEGORIES, categoryFor } from "../pages/shop/shopCategories";
import { generateSlug } from "../pages/shop/shopData";
import "./AppBar.css";

// `to` doubles as the item's key; an item is active on its path and anything nested under it.
const navItems: { label: string; to: string }[] = [
  { label: "COFFEE", to: SHOP_CATEGORIES.coffee.path },
  { label: "MERCH", to: SHOP_CATEGORIES.merch.path },
  { label: "CATERING", to: `/${PAGES.CATERING}` },
  { label: "INITIATIVES", to: `/${PAGES.INITIATIVES}` },
  { label: "CALENDAR", to: `/${PAGES.CALENDAR}` },
  { label: "ACCOUNT", to: `/${PAGES.ACCOUNT}` },
  { label: "CART", to: `/${PAGES.CART}` },
];

const ACCOUNT_PATH = `/${PAGES.ACCOUNT}`;
const CART_PATH = `/${PAGES.CART}`;

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
    {count > 0 && (
      <span className="cart-badge">{count > 99 ? "99+" : count}</span>
    )}
  </span>
);

const AppBar: React.FC = () => {
  const { pathname } = useLocation();
  const { cart } = useCart();
  const { items } = useInventory();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const cartCount = cart.getTotalItems();

  // Product pages (/shop/<slug>) highlight the category the product belongs to.
  const productCategoryPath = useMemo(() => {
    const slug = pathname.match(/^\/shop\/([^/]+)$/)?.[1];
    const item = slug && items.find((i) => generateSlug(i.name) === slug);
    return item ? categoryFor(item).path : null;
  }, [pathname, items]);

  const isActive = (to: string): boolean =>
    pathname === to ||
    pathname.startsWith(`${to}/`) ||
    to === productCategoryPath;

  const handleNavClick = (): void => setIsMenuOpen(false);

  const renderIcon = (to: string): React.ReactNode => {
    if (to === CART_PATH) return <CartIcon count={cartCount} />;
    if (to === ACCOUNT_PATH) return <AccountIcon />;
    return null;
  };

  const getAccessibleLabel = (to: string): string | undefined => {
    if (to === CART_PATH)
      return `Cart${cartCount ? `, ${cartCount} items` : ""}`;
    if (to === ACCOUNT_PATH) return "Account";
    return undefined;
  };

  return (
    <div className="app-bar">
      <div className="app-bar-content">
        <Link to="/" aria-label="Koinonia Coffee Project home">
          <img
            src={ICONS.primary}
            alt="Koinonia Coffee Project"
            className="app-bar-logo"
          />
        </Link>

        <div className="app-bar-spacer" />

        <nav className="app-bar-nav-desktop" aria-label="Main navigation">
          {navItems.map(({ label, to }) => {
            const isIcon = to === CART_PATH || to === ACCOUNT_PATH;
            return (
              <Link
                key={to}
                to={to}
                className={`nav-item${isIcon ? " nav-icon-item" : ""}`}
                onMouseEnter={() => setHoveredItem(to)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={handleNavClick}
                aria-label={getAccessibleLabel(to)}
                aria-current={isActive(to) ? "page" : undefined}
              >
                {isIcon ? (
                  renderIcon(to)
                ) : (
                  <span className="nav-label">{label}</span>
                )}
                <div
                  className="nav-underline"
                  style={{
                    width:
                      isActive(to) || hoveredItem === to
                        ? isIcon
                          ? "100%"
                          : "40px"
                        : "0",
                  }}
                />
              </Link>
            );
          })}
        </nav>

        <button
          className="app-bar-menu-button"
          type="button"
          aria-label={
            isMenuOpen ? "Close navigation menu" : "Open navigation menu"
          }
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
        >
          <span className="menu-icon" aria-hidden="true">
            ☰
          </span>
        </button>
      </div>

      {isMenuOpen && (
        <nav className="app-bar-dropdown" aria-label="Mobile navigation">
          {navItems.map(({ label, to }) => {
            if (to === CART_PATH) return null;
            if (to === ACCOUNT_PATH) {
              return (
                <div className="dropdown-icon-row" key="account-cart">
                  {[ACCOUNT_PATH, CART_PATH].map((iconPath) => (
                    <Link
                      key={iconPath}
                      to={iconPath}
                      className="dropdown-item dropdown-icon-item"
                      aria-label={getAccessibleLabel(iconPath)}
                      onClick={handleNavClick}
                    >
                      {renderIcon(iconPath)}
                      {isActive(iconPath) && (
                        <div className="dropdown-underline" />
                      )}
                    </Link>
                  ))}
                </div>
              );
            }

            return (
              <Link
                key={to}
                to={to}
                className="dropdown-item"
                onClick={handleNavClick}
              >
                <span className="dropdown-label">{label}</span>
                {isActive(to) && <div className="dropdown-underline" />}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
};

export default AppBar;
