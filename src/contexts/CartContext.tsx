import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { CartViewModel, CartItem } from '../pages/cart/CartViewModel';
import { ToastMessage, createToast, ToastType } from '../components/Toast';

interface CartContextType {
  cart: CartViewModel;
  forceUpdate: () => void;
  showToast: (message: string, type?: ToastType) => void;
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'koinonia_cart';

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
};

interface CartProviderProps {
  children: ReactNode;
}

const loadCartFromStorage = (): CartItem[] => {
  try {
    const stored = localStorage.getItem(CART_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (error) {
    console.error('Failed to load cart from storage:', error);
  }
  return [];
};

const saveCartToStorage = (items: CartItem[]): void => {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error('Failed to save cart to storage:', error);
  }
};

export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const [cart] = useState(() => {
    const viewModel = new CartViewModel();
    viewModel.cartItems = loadCartFromStorage();
    return viewModel;
  });
  const [, setUpdateTrigger] = useState({});
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const forceUpdate = () => {
    saveCartToStorage(cart.cartItems);
    setUpdateTrigger({});
  };

  const showToast = (message: string, type: ToastType = 'info') => {
    const toast = createToast(message, type);
    setToasts((prev) => [...prev, toast]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  useEffect(() => {
    saveCartToStorage(cart.cartItems);
  }, [cart.cartItems]);

  return (
    <CartContext.Provider value={{ cart, forceUpdate, showToast, toasts, removeToast }}>
      {children}
    </CartContext.Provider>
  );
};
