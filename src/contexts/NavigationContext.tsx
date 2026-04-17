import React, { createContext, useContext, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PAGES, PageType } from '../util/constants';

interface NavigationContextType {
  currentPage: PageType;
  navigateTo: (page: PageType) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const useNavigation = (): NavigationContextType => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return context;
};

interface NavigationProviderProps {
  children: ReactNode;
}

const getPageFromPath = (pathname: string): PageType => {
  const path = pathname.slice(1);
  const pageValues = Object.values(PAGES);
  return pageValues.includes(path as PageType) ? (path as PageType) : PAGES.HOME;
};

export const NavigationProvider: React.FC<NavigationProviderProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPage = getPageFromPath(location.pathname);

  const navigateTo = (page: PageType): void => {
    const path = page === PAGES.HOME ? '/' : `/${page}`;
    navigate(path);
  };

  return (
    <NavigationContext.Provider value={{ currentPage, navigateTo }}>
      {children}
    </NavigationContext.Provider>
  );
};
