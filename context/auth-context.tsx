"use client";

import {
  getItemWithExpiry,
  removeItemWithExpiry,
  setItemWithExpiry,
} from "@/lib/local-storage";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

interface AuthContextType {
  isLoggedIn: boolean;
  userId: string | null;
  token: string | null;
  login: (token: string, userId: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = getItemWithExpiry<string>("anilistToken");
    const storedUserId = getItemWithExpiry<string>("userId");
    if (storedToken && storedUserId) {
      setToken(storedToken);
      setUserId(storedUserId);
      setIsLoggedIn(true);
    }
  }, []);

  const login = (newToken: string, newUserId: string) => {
    setToken(newToken);
    setUserId(newUserId);
    setIsLoggedIn(true);
    setItemWithExpiry("anilistToken", newToken, 60 * 60 * 24 * 7 * 1000);
    setItemWithExpiry("userId", newUserId, 60 * 60 * 24 * 7 * 1000);
  };

  const logout = () => {
    setToken(null);
    setUserId(null);
    setIsLoggedIn(false);
    removeItemWithExpiry("anilistToken");
    removeItemWithExpiry("userId");
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, userId, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
