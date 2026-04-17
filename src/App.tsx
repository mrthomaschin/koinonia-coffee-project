import React, { useState, useEffect } from 'react';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { ContactProvider } from './pages/contact/ContactViewModel';
import AppBar from './components/AppBar';
import BottomBar from './components/BottomBar';
import ComingSoon from './components/ComingSoon';
import Homepage from './pages/homepage/Homepage';
import Contact from './pages/contact/ContactView';
import { PAGES, LAYOUT } from './util/constants';
import { isPageEnabled } from './util/devConfig';
import './App.css';
import Events from './pages/events/Events';
import Shop from './pages/shop/Shop';

const MainContent: React.FC = () => {
  const { currentPage } = useNavigation();
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

  const renderPage = (): React.ReactElement => {
    switch (currentPage) {
      case PAGES.HOME:
        return <Homepage availableHeight={availableHeight} />;
      case PAGES.CONTACT:
        return isPageEnabled(PAGES.CONTACT)
          ? (
            <ContactProvider>
              <Contact availableHeight={availableHeight} />
            </ContactProvider>
          )
          : <ComingSoon availableHeight={availableHeight} />;
      case PAGES.SHOP:
        return isPageEnabled(PAGES.SHOP)
          ? <Shop availableHeight={availableHeight} />
          : <ComingSoon availableHeight={availableHeight} />;
      case PAGES.EVENTS:
        return isPageEnabled(PAGES.EVENTS)
          ? <Events availableHeight={availableHeight} />
          : <ComingSoon availableHeight={availableHeight} />;
      case PAGES.MENU:
        return isPageEnabled(PAGES.MENU)
          ? <ComingSoon availableHeight={availableHeight} />
          : <ComingSoon availableHeight={availableHeight} />;
      case PAGES.ABOUT:
        return isPageEnabled(PAGES.ABOUT)
          ? <ComingSoon availableHeight={availableHeight} />
          : <ComingSoon availableHeight={availableHeight} />;
      case PAGES.BLOG:
        return isPageEnabled(PAGES.BLOG)
          ? <ComingSoon availableHeight={availableHeight} />
          : <ComingSoon availableHeight={availableHeight} />;
      case PAGES.GALLERY:
        return isPageEnabled(PAGES.GALLERY)
          ? <ComingSoon availableHeight={availableHeight} />
          : <ComingSoon availableHeight={availableHeight} />;
      default:
        return <ComingSoon availableHeight={availableHeight} />;
    }
  };

  return (
    <div className="app">
      <AppBar />
      <div className="main-content">
        {renderPage()}
        <BottomBar />
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <NavigationProvider>
      <MainContent />
    </NavigationProvider>
  );
}

export default App;
