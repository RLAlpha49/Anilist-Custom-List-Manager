const DEFAULT_EXPIRY = 60 * 60 * 24 * 1000;
const MAX_LOCAL_STORAGE_ITEM_BYTES = 256 * 1024;

export const STORAGE_TTLS = {
  authSession: 60 * 60 * 24 * 7 * 1000,
  workflowCache: DEFAULT_EXPIRY,
  updateSummary: 60 * 60 * 1000,
} as const;

export const STORAGE_KEYS = {
  authToken: "aclm:auth:token",
  authUserId: "aclm:auth:user-id",
  workflowConditionsAnime: "aclm:workflow:conditions:anime",
  workflowConditionsManga: "aclm:workflow:conditions:manga",
  workflowHideDefaultStatusLists: "aclm:workflow:hide-default-status-lists",
  workflowLists: "aclm:workflow:lists",
  workflowListType: "aclm:workflow:list-type",
  workflowListsToRemoveFromAllEntries:
    "aclm:workflow:lists-to-remove-from-all-entries",
  updateStats: "aclm:update:stats",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

type StorageKeyMetadata = {
  owner: string;
  ttl: number;
  description: string;
  legacyKeys?: readonly string[];
};

export const STORAGE_KEY_REGISTRY: Record<StorageKey, StorageKeyMetadata> = {
  [STORAGE_KEYS.authToken]: {
    owner: "context/auth-context.tsx",
    ttl: STORAGE_TTLS.authSession,
    description: "AniList OAuth access token for the current client session.",
    legacyKeys: ["anilistToken"],
  },
  [STORAGE_KEYS.authUserId]: {
    owner: "context/auth-context.tsx",
    ttl: STORAGE_TTLS.authSession,
    description: "AniList user ID normalized to a number at the auth boundary.",
    legacyKeys: ["userId"],
  },
  [STORAGE_KEYS.workflowConditionsAnime]: {
    owner: "app/custom-list-manager/page.tsx",
    ttl: STORAGE_TTLS.workflowCache,
    description:
      "Cached anime list-condition selections for the current workflow.",
    legacyKeys: ["conditionsAnime"],
  },
  [STORAGE_KEYS.workflowConditionsManga]: {
    owner: "app/custom-list-manager/page.tsx",
    ttl: STORAGE_TTLS.workflowCache,
    description:
      "Cached manga list-condition selections for the current workflow.",
    legacyKeys: ["conditionsManga"],
  },
  [STORAGE_KEYS.workflowHideDefaultStatusLists]: {
    owner: "app/custom-list-manager/page.tsx",
    ttl: STORAGE_TTLS.workflowCache,
    description: "Whether the workflow hides AniList default status lists.",
    legacyKeys: ["hideDefaultStatusLists"],
  },
  [STORAGE_KEYS.workflowLists]: {
    owner: "app/custom-list-manager/page.tsx",
    ttl: STORAGE_TTLS.workflowCache,
    description:
      "Selected custom-list configuration queued for the update step.",
    legacyKeys: ["lists"],
  },
  [STORAGE_KEYS.workflowListType]: {
    owner: "app/custom-list-manager/page.tsx",
    ttl: STORAGE_TTLS.workflowCache,
    description: "The active AniList media type for the current workflow.",
    legacyKeys: ["listType"],
  },
  [STORAGE_KEYS.workflowListsToRemoveFromAllEntries]: {
    owner: "app/custom-list-manager/page.tsx",
    ttl: STORAGE_TTLS.workflowCache,
    description:
      "Lists marked for removal from all entries during the update step.",
    legacyKeys: ["listsToRemoveFromAllEntries"],
  },
  [STORAGE_KEYS.updateStats]: {
    owner: "app/custom-list-manager/update/page.tsx",
    ttl: STORAGE_TTLS.updateSummary,
    description: "Last run summary displayed on the completion screen.",
    legacyKeys: ["updateStats"],
  },
};

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

const APP_STORAGE_KEYS = Object.freeze(
  Object.keys(STORAGE_KEY_REGISTRY) as StorageKey[],
);

const APP_STORAGE_KEY_SET = new Set<string>([
  ...APP_STORAGE_KEYS,
  ...APP_STORAGE_KEYS.flatMap(
    (key) => STORAGE_KEY_REGISTRY[key].legacyKeys ?? [],
  ),
]);

const canUseLocalStorage = () =>
  typeof globalThis !== "undefined" && globalThis.localStorage !== undefined;

const getStorageKeyCandidates = (key: string): string[] => {
  const metadata = STORAGE_KEY_REGISTRY[key as StorageKey];

  return metadata ? [key, ...(metadata.legacyKeys ?? [])] : [key];
};

const removeRawStorageKey = (key: string): void => {
  inMemoryFallbackStore.delete(key);

  if (!canUseLocalStorage()) {
    return;
  }

  localStorage.removeItem(key);
};

const getRawStorageValue = (key: string): string | null => {
  if (canUseLocalStorage()) {
    const storedValue = localStorage.getItem(key);
    if (storedValue !== null) {
      return storedValue;
    }
  }

  return inMemoryFallbackStore.get(key) ?? null;
};

const getByteSize = (value: string): number => {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }

  return value.length;
};

const parseStoredItem = <T>(raw: string): StoredItem<T> | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredItem<T>> | null;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (
      !Object.hasOwn(parsed, "value") ||
      typeof parsed.expiry !== "number" ||
      !Number.isFinite(parsed.expiry)
    ) {
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
    if (!key || !APP_STORAGE_KEY_SET.has(key)) {
      continue;
    }

    const stored = localStorage.getItem(key);
    if (!stored) {
      continue;
    }

    const parsed = parseStoredItem<unknown>(stored);
    if (!parsed || isExpired(parsed.expiry)) {
      localStorage.removeItem(key);
      inMemoryFallbackStore.delete(key);
    }
  }
};

export const normalizeUserId = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
      return null;
    }

    const parsedValue = Number.parseInt(trimmedValue, 10);
    return Number.isInteger(parsedValue) && parsedValue > 0
      ? parsedValue
      : null;
  }

  return null;
};

export const isStorageFallbackResult = (result: StorageWriteResult): boolean =>
  result !== "stored";

export const setItemWithExpiry = <T>(
  key: string,
  value: T,
  ttl: number = DEFAULT_EXPIRY,
): StorageWriteResult => {
  const { serialized } = serializeStoredItem(value, ttl);
  const legacyKeys = STORAGE_KEY_REGISTRY[key as StorageKey]?.legacyKeys ?? [];

  if (getByteSize(serialized) > MAX_LOCAL_STORAGE_ITEM_BYTES) {
    inMemoryFallbackStore.set(key, serialized);
    legacyKeys.forEach(removeRawStorageKey);
    return "too-large";
  }

  if (!canUseLocalStorage()) {
    inMemoryFallbackStore.set(key, serialized);
    legacyKeys.forEach(removeRawStorageKey);
    return "unavailable";
  }

  try {
    localStorage.setItem(key, serialized);
    inMemoryFallbackStore.delete(key);
    legacyKeys.forEach(removeRawStorageKey);
    return "stored";
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      inMemoryFallbackStore.set(key, serialized);
      legacyKeys.forEach(removeRawStorageKey);
      return "memory-fallback";
    }

    pruneExpiredLocalStorageEntries();

    try {
      localStorage.setItem(key, serialized);
      inMemoryFallbackStore.delete(key);
      legacyKeys.forEach(removeRawStorageKey);
      return "stored";
    } catch {
      inMemoryFallbackStore.set(key, serialized);
      legacyKeys.forEach(removeRawStorageKey);
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

  for (const candidateKey of getStorageKeyCandidates(key)) {
    const rawValue = getRawStorageValue(candidateKey);
    if (!rawValue) {
      continue;
    }

    const parsedValue = getValidValueFromRaw(rawValue);
    if (parsedValue !== null) {
      return parsedValue;
    }

    removeRawStorageKey(candidateKey);
  }

  return null;
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
      removeItemWithExpiry(key);
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
      removeItemWithExpiry(key);
      return fallback;
    }

    removeItemWithExpiry(key);
  }

  return fallback;
};

export const removeItemWithExpiry = (key: string) => {
  getStorageKeyCandidates(key).forEach(removeRawStorageKey);
};

export const clearAppStorage = (): void => {
  APP_STORAGE_KEYS.forEach(removeItemWithExpiry);
};
