import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { CartProvider, useCart } from './contexts/CartContext';
import { ToastContainer } from './components/Toast';
import AppBar from './components/AppBar';
import BottomBar from './components/BottomBar';
import ComingSoon from './components/ComingSoon';
import Homepage from './pages/homepage/Homepage';
import Contact from './pages/contact/ContactView';
import { PAGES, LAYOUT } from './util/constants';
import { isPageEnabled } from './util/devConfig';
import './App.css';
import Events from './pages/events/Events';
import Shop from './pages/shop/ShopView';
import { ItemView } from './pages/shop/item/ItemView';
import About from './pages/about/About';
import Menu from './pages/menu/Menu';
import CartView from './pages/cart/CartView';
import trackingService from './services/trackingService';

const MainContent: React.FC = () => {
  const [availableHeight, setAvailableHeight] = useState<number>(0);
  const location = useLocation();

  useEffect(() => {
    const calculateHeight = (): void => {
      const windowHeight = window.innerHeight;
      const calculatedHeight = windowHeight - LAYOUT.appBarHeight - LAYOUT.bottomBarHeight;
      setAvailableHeight(calculatedHeight);
    };

    calculateHeight();
    window.addEventListener('resize', calculateHeight);
    return () => window.removeEventListener('resize', calculateHeight);
  }, []);

  useEffect(() => {
    trackingService.trackPageView(location.pathname + location.search);
  }, [location]);

  const { toasts, removeToast } = useCart();

  return (
    <div className="app">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <AppBar />
      <div className="main-content">
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
            path="/events"
            element={
              isPageEnabled(PAGES.EVENTS) ? (
                <Events availableHeight={availableHeight} />
              ) : (
                <ComingSoon availableHeight={availableHeight} />
              )
            }
          />
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
      <CartProvider>
        <NavigationProvider>
          <MainContent />
        </NavigationProvider>
      </CartProvider>
    </BrowserRouter>
  );
}

export default App;
