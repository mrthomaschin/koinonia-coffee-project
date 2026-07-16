import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { NavigationProvider } from './contexts/NavigationContext';
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
import OrderConfirmationPage from './pages/order-confirmation/OrderConfirmationPage';
import trackingService from './services/trackingService';
import { getGlobalItems } from './pages/shop/shopData';
import { notionService } from './services/notionService';
import { convertNotionItemsToItems } from './pages/shop/notionItemMapper';
import { createLogger } from './util/logger';

const logger = createLogger('App');

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
          <Route
            path="/order-confirmation"
            element={<OrderConfirmationPage availableHeight={availableHeight} />}
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

  useEffect(() => {
    // Load inventory data immediately on app initialization if no cache exists
    const loadInventoryImmediately = async () => {
      try {
        // Check if we already have cached data
        const cachedItems = getGlobalItems();
        if (cachedItems && cachedItems.length > 0) {
          logger.log('Inventory already cached, skipping preload');
          return;
        }

        logger.log('Loading inventory data immediately on app init...');
        const notionItems = await notionService.getInventory();
        if (notionItems && notionItems.length > 0) {
          const items = convertNotionItemsToItems(notionItems);
          // This will automatically cache the items via setGlobalItems
          const { setGlobalItems } = await import('./pages/shop/shopData');
          setGlobalItems(items);
          logger.log(`Loaded ${items.length} inventory items - ready for instant shop access`);
        }
      } catch (error) {
        logger.error('Failed to load inventory on app init:', error);
        // Silently fail - shop will handle loading on its own
      }
    };

    loadInventoryImmediately();
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
