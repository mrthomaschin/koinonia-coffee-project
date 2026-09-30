import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { SavedAddresses } from '../models/AccountModel';
import { AccountProfile, accountService, AuthResponse, ChangePasswordInput, CreateAccountInput, UpdateAddressesInput, UpdateProfileInput } from '../services/accountService';

interface AccountContextType {
  account: AccountProfile | null;
  // Loaded from the backend for the signed-in account and kept in memory only.
  savedAddresses: SavedAddresses | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  // Resolves to whether the verification email was sent.
  createAccount: (input: CreateAccountInput) => Promise<{ verificationSent: boolean }>;
  // verificationSent is present when the update requested a new email.
  updateProfile: (input: UpdateProfileInput) => Promise<{ verificationSent?: boolean }>;
  updateAddresses: (input: UpdateAddressesInput) => Promise<void>;
  // Resends the link for a pending or unverified email; resolves to the address it was sent to.
  resendVerification: () => Promise<string>;
  // Resolves to how many other devices were signed out.
  changePassword: (input: ChangePasswordInput) => Promise<number>;
  // Applies a profile returned by an email verification link when it is this browser's account.
  applyVerifiedAccount: (profile: AccountProfile) => void;
  logout: () => Promise<void>;
  token: string | null;
}

const STORAGE_KEY = 'koinonia_account_session';

const storeSession = (session: AuthResponse): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // The in-memory session still works when storage is unavailable.
  }
};

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export const useAccount = (): AccountContextType => {
  const context = useContext(AccountContext);
  if (!context) throw new Error('useAccount must be used within AccountProvider');
  return context;
};

export const AccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddresses | null>(null);
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

  // Refresh the profile and saved addresses whenever a session starts, so
  // changes made on another device show up here too.
  useEffect(() => {
    if (!token) {
      setSavedAddresses(null);
      return;
    }
    let active = true;
    accountService.getDetails(token)
      .then((details) => {
        if (!active) return;
        setAccount(details.account);
        storeSession({ account: details.account, token });
        setSavedAddresses(details.addresses);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [token]);

  const saveSession = (session: AuthResponse): void => {
    setAccount(session.account);
    setToken(session.token);
    storeSession(session);
  };

  const value = useMemo<AccountContextType>(() => ({
    account,
    savedAddresses,
    token,
    isAuthenticated: !!account && !!token,
    isLoading,
    login: async (username, password) => saveSession(await accountService.login(username, password)),
    createAccount: async (input) => {
      const previousToken = token;
      const { verificationSent, ...session } = await accountService.createAccount(input);
      saveSession(session);
      // Replace the browser session with the newly created account, then
      // revoke the previous session so it cannot remain active elsewhere.
      if (previousToken && previousToken !== session.token) {
        await accountService.logout(previousToken).catch(() => undefined);
      }
      return { verificationSent };
    },
    updateProfile: async (input) => {
      if (!token) throw new Error('Your session has expired. Please log in again.');
      const { account: updated, verificationSent } = await accountService.updateProfile(token, input);
      saveSession({ account: updated, token });
      return { verificationSent };
    },
    resendVerification: async () => {
      if (!token) throw new Error('Your session has expired. Please log in again.');
      return (await accountService.resendVerification(token)).sentTo;
    },
    changePassword: async (input) => {
      if (!token) throw new Error('Your session has expired. Please log in again.');
      return (await accountService.changePassword(token, input)).signedOutSessions;
    },
    applyVerifiedAccount: (profile) => {
      if (token && account?.id === profile.id) saveSession({ account: profile, token });
    },
    updateAddresses: async (input) => {
      if (!token) throw new Error('Your session has expired. Please log in again.');
      const { addresses } = await accountService.updateAddresses(token, input);
      setSavedAddresses(addresses);
    },
    logout: async () => {
      const activeToken = token;
      setAccount(null);
      setSavedAddresses(null);
      setToken(null);
      localStorage.removeItem(STORAGE_KEY);
      if (activeToken) await accountService.logout(activeToken).catch(() => undefined);
    },
  }), [account, isLoading, savedAddresses, token]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
};
