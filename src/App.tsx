import React, { useState, useEffect } from 'react';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { ContactProvider } from './contexts/ContactContext';
import AppBar from './components/AppBar';
import BottomBar from './components/BottomBar';
import ComingSoon from './components/ComingSoon';
import Homepage from './pages/homepage/Homepage';
import Contact from './pages/contact/Contact';
import { PAGES, LAYOUT } from './util/constants';
import './App.css';
import Events from './pages/events/Events';

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
        return (
          <ContactProvider>
            <Contact availableHeight={availableHeight} />
          </ContactProvider>
        );
      case PAGES.SHOP:
      case PAGES.EVENTS:
      // return <Events availableHeight={availableHeight} />;
      case PAGES.MENU:
      case PAGES.ABOUT:
      case PAGES.BLOG:
      case PAGES.GALLERY:
        return <ComingSoon availableHeight={availableHeight} />;
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
