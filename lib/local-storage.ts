const DEFAULT_EXPIRY = 60 * 60 * 24 * 1000;
const MAX_LOCAL_STORAGE_ITEM_BYTES = 256 * 1024;

type StoredItem<T> = {
  value: T;
  expiry: number;
};

export type StorageWriteResult =
  | "stored"
  | "memory-fallback"
  | "too-large"
  | "unavailable";

const inMemoryFallbackStore = new Map<string, string>();

const canUseLocalStorage = () =>
  typeof globalThis !== "undefined" && globalThis.localStorage !== undefined;

const getByteSize = (value: string): number => {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }

  return value.length;
};

const parseStoredItem = <T>(raw: string): StoredItem<T> | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredItem<T>>;

    if (typeof parsed.expiry !== "number") {
      return null;
    }

    return {
      value: parsed.value as T,
      expiry: parsed.expiry,
    };
  } catch {
    return null;
  }
};

const isExpired = (expiry: number): boolean => Date.now() > expiry;

const serializeStoredItem = <T>(
  value: T,
  ttl: number,
): { serialized: string; item: StoredItem<T> } => {
  const item: StoredItem<T> = {
    value,
    expiry: Date.now() + ttl,
  };

  return {
    serialized: JSON.stringify(item),
    item,
  };
};

const isQuotaExceededError = (error: unknown): boolean => {
  if (!(error instanceof DOMException)) {
    return false;
  }

  const errorWithLegacyCode = error as DOMException & { code?: number };

  return (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    errorWithLegacyCode.code === 22 ||
    errorWithLegacyCode.code === 1014
  );
};

const pruneExpiredLocalStorageEntries = (): void => {
  if (!canUseLocalStorage()) {
    return;
  }

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key) {
      continue;
    }

    const stored = localStorage.getItem(key);
    if (!stored) {
      continue;
    }

    const parsed = parseStoredItem<unknown>(stored);
    if (parsed && isExpired(parsed.expiry)) {
      localStorage.removeItem(key);
      inMemoryFallbackStore.delete(key);
    }
  }
};

export const isStorageFallbackResult = (result: StorageWriteResult): boolean =>
  result !== "stored";

export const setItemWithExpiry = <T>(
  key: string,
  value: T,
  ttl: number = DEFAULT_EXPIRY,
): StorageWriteResult => {
  const { serialized } = serializeStoredItem(value, ttl);

  if (getByteSize(serialized) > MAX_LOCAL_STORAGE_ITEM_BYTES) {
    inMemoryFallbackStore.set(key, serialized);
    return "too-large";
  }

  if (!canUseLocalStorage()) {
    inMemoryFallbackStore.set(key, serialized);
    return "unavailable";
  }

  try {
    localStorage.setItem(key, serialized);
    inMemoryFallbackStore.delete(key);
    return "stored";
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      inMemoryFallbackStore.set(key, serialized);
      return "memory-fallback";
    }

    pruneExpiredLocalStorageEntries();

    try {
      localStorage.setItem(key, serialized);
      inMemoryFallbackStore.delete(key);
      return "stored";
    } catch {
      inMemoryFallbackStore.set(key, serialized);
      return "memory-fallback";
    }
  }
};

export const getItemWithExpiry = <T>(key: string): T | null => {
  const getValidValueFromRaw = (raw: string): T | null => {
    const parsed = parseStoredItem<T>(raw);
    if (!parsed) {
      return null;
    }

    if (isExpired(parsed.expiry)) {
      return null;
    }

    return parsed.value;
  };

  if (canUseLocalStorage()) {
    const itemStr = localStorage.getItem(key);
    if (itemStr) {
      const value = getValidValueFromRaw(itemStr);
      if (value !== null) {
        return value;
      }

      localStorage.removeItem(key);
      inMemoryFallbackStore.delete(key);
    }
  }

  const fallbackRaw = inMemoryFallbackStore.get(key);
  if (!fallbackRaw) {
    return null;
  }

  const fallbackValue = getValidValueFromRaw(fallbackRaw);
  if (fallbackValue === null) {
    removeItemWithExpiry(key);
    return null;
  }

  return fallbackValue;
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
  inMemoryFallbackStore.delete(key);

  if (!canUseLocalStorage()) {
    return;
  }

  localStorage.removeItem(key);
};
