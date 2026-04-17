import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
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
import { ItemDetail } from './pages/shop/item/ItemDetail';

const MainContent: React.FC = () => {
  const [availableHeight, setAvailableHeight] = useState<number>(0);

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

  return (
    <div className="app">
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
                <ItemDetail availableHeight={availableHeight} />
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
                <ComingSoon availableHeight={availableHeight} />
              ) : (
                <ComingSoon availableHeight={availableHeight} />
              )
            }
          />
          <Route
            path="/about"
            element={
              isPageEnabled(PAGES.ABOUT) ? (
                <ComingSoon availableHeight={availableHeight} />
              ) : (
                <ComingSoon availableHeight={availableHeight} />
              )
            }
          />
          <Route
            path="/blog"
            element={
              isPageEnabled(PAGES.BLOG) ? (
                <ComingSoon availableHeight={availableHeight} />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <BottomBar />
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <NavigationProvider>
        <MainContent />
      </NavigationProvider>
    </BrowserRouter>
  );
}

export default App;
