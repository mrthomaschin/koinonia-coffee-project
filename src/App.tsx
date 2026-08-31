import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { NavigationProvider } from './contexts/NavigationContext';
import { CartProvider, useCart } from './contexts/CartContext';
import { InventoryProvider } from './contexts/InventoryContext';
import { ToastContainer } from './components/Toast';
import AppBar from './components/AppBar';
import NotificationBar from './components/NotificationBar';
import BottomBar from './components/BottomBar';
import ComingSoon from './components/ComingSoon';
import Homepage from './pages/homepage/Homepage';
import Contact from './pages/contact/ContactView';
import { PAGES, LAYOUT } from './util/constants';
import { isPageEnabled } from './util/devConfig';
import './App.css';
import Catering from './pages/catering/Catering';
import Events, { EventDetail } from './pages/events/Events';
import Shop from './pages/shop/ShopView';
import { ItemView } from './pages/shop/item/ItemView';
import About from './pages/about/About';
import Menu from './pages/menu/Menu';
import CartView from './pages/cart/CartView';
import OrderConfirmationPage from './pages/order-confirmation/OrderConfirmationPage';
import trackingService from './services/trackingService';
import AccountPage from './pages/account/AccountPage';
import AccountOrdersPage from './pages/account/AccountOrdersPage';
import AccountSubscriptionsPage from './pages/account/AccountSubscriptionsPage';
import AccountDetailsPage from './pages/account/AccountDetailsPage';
import PartnerStorePage from './pages/account/PartnerStorePage';
import AccountLoginPage from './pages/account/AccountLoginPage';
import { AccountProvider } from './contexts/AccountContext';
import SEO from './components/SEO';

const MainContent: React.FC = () => {
  const [availableHeight, setAvailableHeight] = useState<number>(0);
  const location = useLocation();

  useEffect(() => {
    const calculateHeight = (): void => {
      const windowHeight = window.innerHeight;
      const calculatedHeight = windowHeight - LAYOUT.notificationBarHeight - LAYOUT.appBarHeight - LAYOUT.bottomBarHeight;
      setAvailableHeight(calculatedHeight);
    };

    calculateHeight();
    window.addEventListener('resize', calculateHeight);
    return () => window.removeEventListener('resize', calculateHeight);
  }, []);

  useEffect(() => {
    trackingService.trackPageView(location.pathname + location.search);
  }, [location]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname, location.search]);

  const { toasts, removeToast } = useCart();

  return (
    <div className="app">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <NotificationBar enabled={true} message="Free shipping on orders over $40" />
      <AppBar />
      <div className="main-content">
        {(/^(\/account(?:\/|$)|\/account-login$|\/create-account$|\/create-partner-account$|\/cart$|\/order-confirmation$)/).test(location.pathname) && (
          <SEO title="Koinonia Coffee Project" description="Koinonia Coffee Project account and order page." path={location.pathname} noIndex />
        )}
        <Routes>
          <Route path="/" element={<Homepage availableHeight={availableHeight} />} />
          <Route
            path="/contact"
            element={
              isPageEnabled(PAGES.CONTACT) ? (
                <Contact availableHeight={availableHeight} />
              ) : (
                <ComingSoon availableHeight={availableHeight} />
              )
            }
          />
          <Route
            path="/shop"
            element={
              isPageEnabled(PAGES.SHOP) ? (
                <Shop availableHeight={availableHeight} />
              ) : (
                <ComingSoon availableHeight={availableHeight} />
              )
            }
          />
          <Route
            path="/shop/:slug"
            element={
              isPageEnabled(PAGES.SHOP) ? (
                <ItemView availableHeight={availableHeight} />
              ) : (
                <ComingSoon availableHeight={availableHeight} />
              )
            }
          />
          <Route
            path="/catering"
            element={
              isPageEnabled(PAGES.CATERING) ? (
                <Catering availableHeight={availableHeight} />
              ) : (
                <ComingSoon availableHeight={availableHeight} />
              )
            }
          />
          <Route path="/events" element={<Events />} />
          <Route path="/events/:eventId" element={<EventDetail />} />
          <Route
            path="/menu"
            element={
              isPageEnabled(PAGES.MENU) ? (
                <Menu availableHeight={availableHeight} />
              ) : (
                <ComingSoon availableHeight={availableHeight} />
              )
            }
          />
          <Route
            path="/about"
            element={
              isPageEnabled(PAGES.ABOUT) ? (
                <About availableHeight={availableHeight} />
              ) : (
                <ComingSoon availableHeight={availableHeight} />
              )
            }
          />
          <Route
            path="/gallery"
            element={
              isPageEnabled(PAGES.GALLERY) ? (
                <ComingSoon availableHeight={availableHeight} />
              ) : (
                <ComingSoon availableHeight={availableHeight} />
              )
            }
          />
          <Route
            path="/cart"
            element={
              isPageEnabled(PAGES.CART) ? (
                <CartView availableHeight={availableHeight} />
              ) : (
                <ComingSoon availableHeight={availableHeight} />
              )
            }
          />
          <Route
            path="/order-confirmation"
            element={<OrderConfirmationPage availableHeight={availableHeight} />}
          />
          <Route path="/account" element={<AccountPage />}>
            <Route index element={<Navigate to="orders" replace />} />
            <Route path="orders" element={<AccountOrdersPage />} />
            <Route path="subscriptions" element={<AccountSubscriptionsPage />} />
            <Route path="details" element={<AccountDetailsPage />} />
            <Route path="partner-store" element={<PartnerStorePage />} />
          </Route>
          <Route path="/account-login" element={<AccountLoginPage />} />
          <Route path="/partner-account" element={<Navigate to="/account-login" replace />} />
          <Route path="/create-account" element={<AccountPage initialMode="create" />} />
          <Route path="/create-partner-account" element={<AccountPage initialMode="create" partnerMode />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <BottomBar />
      </div>
    </div>
  );
};

const App: React.FC = () => {
  useEffect(() => {
    trackingService.initialize();
  }, []);

  return (
    <BrowserRouter>
      <InventoryProvider>
        <CartProvider>
          <AccountProvider>
            <NavigationProvider>
              <MainContent />
            </NavigationProvider>
          </AccountProvider>
        </CartProvider>
      </InventoryProvider>
    </BrowserRouter>
  );
}

export default App;
