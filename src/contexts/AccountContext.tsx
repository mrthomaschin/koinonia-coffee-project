import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccountProfile, accountService, AuthResponse, CreateAccountInput } from '../services/accountService';

interface AccountContextType {
  account: AccountProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  createAccount: (input: CreateAccountInput) => Promise<void>;
  logout: () => Promise<void>;
  token: string | null;
}

const STORAGE_KEY = 'koinonia_account_session';
const AccountContext = createContext<AccountContextType | undefined>(undefined);

export const useAccount = (): AccountContextType => {
  const context = useContext(AccountContext);
  if (!context) throw new Error('useAccount must be used within AccountProvider');
  return context;
};

export const AccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const session = JSON.parse(saved) as AuthResponse;
        setAccount(session.account);
        setToken(session.token);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveSession = (session: AuthResponse): void => {
    setAccount(session.account);
    setToken(session.token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  };

  const value = useMemo<AccountContextType>(() => ({
    account,
    token,
    isAuthenticated: !!account && !!token,
    isLoading,
    login: async (username, password) => saveSession(await accountService.login(username, password)),
    createAccount: async (input) => {
      const previousToken = token;
      const session = await accountService.createAccount(input);
      saveSession(session);
      // Replace the browser session with the newly created account, then
      // revoke the previous session so it cannot remain active elsewhere.
      if (previousToken && previousToken !== session.token) {
        await accountService.logout(previousToken).catch(() => undefined);
      }
    },
    logout: async () => {
      const activeToken = token;
      setAccount(null);
      setToken(null);
      localStorage.removeItem(STORAGE_KEY);
      if (activeToken) await accountService.logout(activeToken).catch(() => undefined);
    },
  }), [account, isLoading, token]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
};
