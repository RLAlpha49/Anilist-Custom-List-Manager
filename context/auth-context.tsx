"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getItemWithExpiry,
  normalizeUserId,
  removeItemWithExpiry,
  setItemWithExpiry,
  STORAGE_KEYS,
  STORAGE_TTLS,
} from "@/lib/local-storage";

interface AuthContextType {
  isLoggedIn: boolean;
  userId: number | null;
  token: string | null;
  login: (token: string, userId: number) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = getItemWithExpiry<string>(STORAGE_KEYS.authToken);
    const storedUserId = normalizeUserId(
      getItemWithExpiry<number | string>(STORAGE_KEYS.authUserId),
    );

    if (storedToken && storedUserId !== null) {
      setToken(storedToken);
      setUserId(storedUserId);
      setIsLoggedIn(true);
    }
  }, []);

  const login = useCallback((newToken: string, newUserId: number) => {
    setToken(newToken);
    setUserId(newUserId);
    setIsLoggedIn(true);

    setItemWithExpiry(
      STORAGE_KEYS.authToken,
      newToken,
      STORAGE_TTLS.authSession,
    );
    setItemWithExpiry(
      STORAGE_KEYS.authUserId,
      newUserId,
      STORAGE_TTLS.authSession,
    );
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUserId(null);
    setIsLoggedIn(false);

    removeItemWithExpiry(STORAGE_KEYS.authToken);
    removeItemWithExpiry(STORAGE_KEYS.authUserId);
  }, []);

  const contextValue = useMemo(
    () => ({ isLoggedIn, userId, token, login, logout }),
    [isLoggedIn, login, logout, token, userId],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
