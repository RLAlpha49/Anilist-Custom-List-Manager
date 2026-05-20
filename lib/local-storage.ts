const DEFAULT_EXPIRY = 60 * 60 * 24 * 1000;

const canUseLocalStorage = () =>
  typeof globalThis !== "undefined" && globalThis.localStorage !== undefined;

export const setItemWithExpiry = <T>(
  key: string,
  value: T,
  ttl: number = DEFAULT_EXPIRY,
) => {
  if (!canUseLocalStorage()) {
    return;
  }

  const now = new Date();
  const item = {
    value: value,
    expiry: now.getTime() + ttl,
  };
  localStorage.setItem(key, JSON.stringify(item));
};

export const getItemWithExpiry = <T>(key: string): T | null => {
  if (!canUseLocalStorage()) {
    return null;
  }

  const itemStr = localStorage.getItem(key);
  if (!itemStr) {
    return null;
  }
  const item = JSON.parse(itemStr);
  const now = new Date();
  if (now.getTime() > item.expiry) {
    removeItemWithExpiry(key);
    return null;
  }
  return item.value as T;
};

export const getJsonItemWithExpiry = <T>(key: string, fallback: T): T => {
  const value = getItemWithExpiry<T | string>(key);

  if (value == null) {
    return fallback;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  return value;
};

export const getBooleanItemWithExpiry = (
  key: string,
  fallback = false,
): boolean => {
  const value = getItemWithExpiry<boolean | string>(key);

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true" || value === "false") {
      return value === "true";
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed === "boolean") {
        return parsed;
      }
    } catch {
      return fallback;
    }
  }

  return fallback;
};

export const removeItemWithExpiry = (key: string) => {
  if (!canUseLocalStorage()) {
    return;
  }

  localStorage.removeItem(key);
};
