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
  AUTH_POLICY,
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
  const [sessionIssuedAt, setSessionIssuedAt] = useState<number | null>(null);

  const hydrateStoredSession = useCallback(() => {
    const storedToken = getItemWithExpiry<string>(STORAGE_KEYS.authToken);
    const storedUserId = normalizeUserId(
      getItemWithExpiry<number | string>(STORAGE_KEYS.authUserId),
    );
    const storedIssuedAt = getItemWithExpiry<number>(
      STORAGE_KEYS.authSessionIssuedAt,
    );
    const issuedAt =
      typeof storedIssuedAt === "number" && Number.isFinite(storedIssuedAt)
        ? storedIssuedAt
        : null;
    const isWithinAbsoluteTtl =
      issuedAt !== null &&
      Date.now() - issuedAt <= AUTH_POLICY.tokenAbsoluteTtlMs;

    if (storedToken && storedUserId !== null && isWithinAbsoluteTtl) {
      setToken(storedToken);
      setUserId(storedUserId);
      setSessionIssuedAt(issuedAt);
      setIsLoggedIn(true);
      return;
    }

    setToken(null);
    setUserId(null);
    setSessionIssuedAt(null);
    setIsLoggedIn(false);
    removeItemWithExpiry(STORAGE_KEYS.authToken);
    removeItemWithExpiry(STORAGE_KEYS.authUserId);
    removeItemWithExpiry(STORAGE_KEYS.authSessionIssuedAt);
  }, []);

  useEffect(() => {
    hydrateStoredSession();
  }, [hydrateStoredSession]);

  const login = useCallback((newToken: string, newUserId: number) => {
    const issuedAt = Date.now();

    setToken(newToken);
    setUserId(newUserId);
    setSessionIssuedAt(issuedAt);
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
    setItemWithExpiry(
      STORAGE_KEYS.authSessionIssuedAt,
      issuedAt,
      AUTH_POLICY.tokenAbsoluteTtlMs,
    );
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUserId(null);
    setSessionIssuedAt(null);
    setIsLoggedIn(false);

    removeItemWithExpiry(STORAGE_KEYS.authToken);
    removeItemWithExpiry(STORAGE_KEYS.authUserId);
    removeItemWithExpiry(STORAGE_KEYS.authSessionIssuedAt);
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !token || userId === null || sessionIssuedAt === null) {
      return;
    }

    let lastRefreshAt = 0;

    const refreshSessionExpiryFromActivity = () => {
      const now = Date.now();

      if (now - sessionIssuedAt > AUTH_POLICY.tokenAbsoluteTtlMs) {
        logout();
        return;
      }

      if (now - lastRefreshAt < AUTH_POLICY.activityRefreshThrottleMs) {
        return;
      }

      setItemWithExpiry(
        STORAGE_KEYS.authToken,
        token,
        STORAGE_TTLS.authSession,
      );
      setItemWithExpiry(
        STORAGE_KEYS.authUserId,
        userId,
        STORAGE_TTLS.authSession,
      );
      lastRefreshAt = now;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshSessionExpiryFromActivity();
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "keydown",
      "pointerdown",
      "scroll",
      "mousemove",
      "focus",
    ];

    activityEvents.forEach((eventName) => {
      globalThis.addEventListener(eventName, refreshSessionExpiryFromActivity, {
        passive: true,
      });
    });
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      activityEvents.forEach((eventName) => {
        globalThis.removeEventListener(
          eventName,
          refreshSessionExpiryFromActivity,
        );
      });
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isLoggedIn, logout, sessionIssuedAt, token, userId]);

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
