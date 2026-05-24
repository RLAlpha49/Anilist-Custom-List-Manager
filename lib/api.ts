import {
  type AniListGraphQLError,
  type AniListRequestVariables,
  type ApiDataGuard,
  type ApiError,
  type ApiResponse,
  type RateLimitInfo,
} from "./types";

/**
 * Local contract boundary for AniList GraphQL integration.
 *
 * Compatibility policy:
 * - Minor, additive upstream fields should not break our parser.
 * - Any breaking contract assumptions should bump this local version and
 *   trigger targeted callsite updates.
 */
export const ANILIST_API_CONTRACT_VERSION = "2026-05-23.v1";
const ANILIST_GRAPHQL_ENDPOINT = "https://graphql.anilist.co";
const NETWORK_RETRY_DELAY_SECONDS = 2;
const SERVER_RETRY_DELAY_SECONDS = 2;
const TIMEOUT_RETRY_DELAY_SECONDS = 2;
const FALLBACK_RATE_LIMIT_DELAY_SECONDS = 1;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const READ_CACHE_TTL_MS = 5_000;
const MAX_READ_CACHE_ENTRIES = 100;
const TRANSIENT_HTTP_STATUS_CODES = new Set([408, 500, 502, 503, 504]);
const API_TELEMETRY_FEATURE = "anilist-api" as const;

interface RetryMetadata {
  retryAfterSeconds?: number;
  rateLimitResetAt?: number;
}

export interface FetchAniListOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface InFlightRequestSubscriber {
  onRetry?: (retryContext: AniListRetryContext) => void;
  onFailure?: (error: ApiError) => void;
}

interface InFlightRequestEntry {
  promise: Promise<ApiResponse<unknown>>;
  subscribers: Set<InFlightRequestSubscriber>;
  requestId: string;
}

interface ReadCacheEntry {
  response: ApiResponse<unknown>;
  expiresAt: number;
}

interface RetryHandlers {
  onRetry?: (retryContext: AniListRetryContext) => void;
  onFailure?: (error: ApiError) => void;
}

type UserFacingApiErrorCode =
  | "AUTH_REQUIRED"
  | "RATE_LIMITED"
  | "NETWORK_FAILURE"
  | "REQUEST_TIMEOUT"
  | "UPSTREAM_UNAVAILABLE"
  | "REQUEST_FAILED";

interface UserFacingApiErrorDefinition {
  message: string;
}

const USER_FACING_API_ERROR_CATALOG: Record<
  UserFacingApiErrorCode,
  UserFacingApiErrorDefinition
> = {
  AUTH_REQUIRED: {
    message:
      "Your AniList session could not be verified. Please sign in again.",
  },
  RATE_LIMITED: {
    message:
      "AniList is currently rate-limiting requests. Please try again shortly.",
  },
  NETWORK_FAILURE: {
    message:
      "A network issue prevented contacting AniList. Check your connection and retry.",
  },
  REQUEST_TIMEOUT: {
    message: "AniList took too long to respond. Please try again.",
  },
  UPSTREAM_UNAVAILABLE: {
    message:
      "AniList is temporarily unavailable right now. Please retry in a moment.",
  },
  REQUEST_FAILED: {
    message: "We could not complete the AniList request. Please try again.",
  },
};

export interface UserFacingApiError {
  code: UserFacingApiErrorCode;
  message: string;
  requestId: string | null;
}

const inFlightRequests = new Map<string, InFlightRequestEntry>();
const readRequestCache = new Map<string, ReadCacheEntry>();

type ApiTelemetrySeverity = "info" | "warn" | "error";

interface ApiTelemetryEvent {
  eventName: string;
  severity: ApiTelemetrySeverity;
  requestId: string;
  operationKey: string;
  operationType: "query" | "mutation";
  retry?: {
    attempt: number;
    reason: AniListRetryContext["reason"];
    retryAfterSeconds: number;
    maxRetries: number;
  };
  error?: {
    className: string;
    message: string;
    status: number | null;
    kind: ApiError["kind"];
  };
  metadata?: Record<string, unknown>;
}

export interface AniListRetryContext {
  reason: "networkError" | "rateLimit" | "serverError" | "timeout";
  retryAfterSeconds: number;
  retryAttempt: number;
  requestId: string;
}

const generateRequestId = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const resolveOperationType = (query: string): "query" | "mutation" =>
  shouldDedupeRequest(query) ? "query" : "mutation";

const enrichApiErrorWithRequestId = (
  error: ApiError,
  requestId: string,
): ApiError => {
  error.metadata = error.metadata
    ? {
        ...error.metadata,
        requestId,
      }
    : {
        requestId,
      };

  return error;
};

const getErrorClassName = (error: ApiError): string => {
  if (error.cause instanceof Error && error.cause.name) {
    return error.cause.name;
  }

  return error.name || "Error";
};

const emitApiTelemetry = ({
  eventName,
  severity,
  requestId,
  operationKey,
  operationType,
  retry,
  error,
  metadata,
}: ApiTelemetryEvent): void => {
  const payload = {
    eventName,
    severity,
    feature: API_TELEMETRY_FEATURE,
    requestId,
    operationKey,
    operationType,
    retry,
    error,
    ...(metadata ? { metadata } : {}),
  };

  const message = `[AniList API] ${eventName}`;

  if (severity === "error") {
    console.error(message, payload);
    return;
  }

  if (severity === "warn") {
    console.warn(message, payload);
    return;
  }

  console.info(message, payload);
};

const parseResponseBody = (rawBody: string): unknown => {
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isApiError = (error: unknown): error is ApiError => {
  if (!isRecord(error)) {
    return false;
  }

  return (
    typeof error.kind === "string" &&
    typeof error.message === "string" &&
    Array.isArray(error.messages) &&
    typeof error.retryable === "boolean" &&
    Object.hasOwn(error, "status")
  );
};

const createApiError = ({
  kind,
  status,
  messages,
  retryable,
  graphQLErrors,
  metadata,
  cause,
}: {
  kind: ApiError["kind"];
  status: number | null;
  messages: string[];
  retryable: boolean;
  graphQLErrors?: AniListGraphQLError[];
  metadata?: Record<string, unknown>;
  cause?: unknown;
}): ApiError => {
  const safeMessages = messages.filter(Boolean);
  const apiError = new Error(
    safeMessages.join(", ") ||
      (status ? `Request failed with status ${status}` : "Request failed."),
  ) as ApiError;

  apiError.kind = kind;
  apiError.status = status;
  apiError.statusCode = status;
  apiError.messages = safeMessages;
  apiError.retryable = retryable;
  apiError.graphQLErrors = graphQLErrors;
  apiError.metadata = metadata;
  apiError.response = status ? { status } : undefined;
  apiError.cause = cause;

  return apiError;
};

const toGraphQLError = (error: unknown): AniListGraphQLError | null => {
  if (!isRecord(error)) {
    return null;
  }

  const message =
    typeof error.message === "string" && error.message.trim().length > 0
      ? error.message
      : "Unknown GraphQL error";

  const graphQLError: AniListGraphQLError = { message };

  if (Array.isArray(error.path)) {
    graphQLError.path = error.path.filter(
      (segment): segment is string | number =>
        typeof segment === "string" || typeof segment === "number",
    );
  }

  if (Array.isArray(error.locations)) {
    graphQLError.locations = error.locations
      .map((location) => {
        if (!isRecord(location)) {
          return null;
        }

        const line = location.line;
        const column = location.column;
        if (typeof line !== "number" || typeof column !== "number") {
          return null;
        }

        return { line, column };
      })
      .filter((location): location is { line: number; column: number } =>
        Boolean(location),
      );
  }

  if (isRecord(error.extensions)) {
    graphQLError.extensions = error.extensions;
  }

  if (typeof error.status === "number") {
    graphQLError.status = error.status;
  }

  return graphQLError;
};

const extractGraphQLErrors = (payload: unknown): AniListGraphQLError[] => {
  if (!isRecord(payload) || !Array.isArray(payload.errors)) {
    return [];
  }

  return payload.errors
    .map((error) => toGraphQLError(error))
    .filter((error): error is AniListGraphQLError => Boolean(error));
};

const getResponseErrorMessage = (status: number, payload: unknown): string => {
  const graphQLErrors = extractGraphQLErrors(payload);
  if (graphQLErrors.length > 0) {
    return graphQLErrors.map((error) => error.message).join(", ");
  }

  if (isRecord(payload) && typeof payload.message === "string") {
    return payload.message;
  }

  return `HTTP error! status: ${status}`;
};

const parseHeaderNumber = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseRetryAfterSeconds = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue >= 0) {
    return Math.ceil(numericValue);
  }

  const parsedDate = Date.parse(value);
  if (Number.isNaN(parsedDate)) {
    return null;
  }

  const secondsUntilDate = Math.ceil((parsedDate - Date.now()) / 1000);
  return secondsUntilDate > 0 ? secondsUntilDate : null;
};

const getRateLimitInfo = (headers: Headers): RateLimitInfo => ({
  remaining: parseHeaderNumber(headers.get("x-ratelimit-remaining")),
  limit: parseHeaderNumber(headers.get("x-ratelimit-limit")),
  resetAt: parseHeaderNumber(headers.get("x-ratelimit-reset")),
});

const normalizeUnknownError = (error: unknown): ApiError => {
  if (isApiError(error)) {
    return error;
  }

  if (isRecord(error) && error.kind === "timeout") {
    const timeoutMs =
      typeof error.timeoutMs === "number" && Number.isFinite(error.timeoutMs)
        ? error.timeoutMs
        : null;
    const hasTimeoutMs = timeoutMs !== null;

    return createApiError({
      kind: "timeout",
      status: null,
      messages: [
        hasTimeoutMs
          ? `AniList request timed out after ${timeoutMs}ms.`
          : "AniList request timed out.",
      ],
      retryable: true,
      metadata: {
        timeoutMs,
      },
      cause: error,
    });
  }

  if (error instanceof TypeError) {
    return createApiError({
      kind: "network",
      status: null,
      messages: [error.message || "Network Error"],
      retryable: true,
      cause: error,
    });
  }

  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return createApiError({
        kind: "network",
        status: null,
        messages: ["AniList request was cancelled."],
        retryable: false,
        metadata: {
          cancelled: true,
        },
        cause: error,
      });
    }

    return createApiError({
      kind: "unknown",
      status: null,
      messages: [error.message || "Unknown error"],
      retryable: false,
      cause: error,
    });
  }

  return createApiError({
    kind: "unknown",
    status: null,
    messages: ["Unknown error"],
    retryable: false,
    cause: error,
  });
};

const getRetryMetadata = (error: ApiError): RetryMetadata | null => {
  if (!isRecord(error.cause)) {
    return null;
  }

  const retryAfterSeconds =
    typeof error.cause.retryAfterSeconds === "number" &&
    Number.isFinite(error.cause.retryAfterSeconds) &&
    error.cause.retryAfterSeconds >= 0
      ? Math.ceil(error.cause.retryAfterSeconds)
      : undefined;

  const rateLimitResetAt =
    typeof error.cause.rateLimitResetAt === "number" &&
    Number.isFinite(error.cause.rateLimitResetAt)
      ? error.cause.rateLimitResetAt
      : undefined;

  if (retryAfterSeconds == null && rateLimitResetAt == null) {
    return null;
  }

  return {
    retryAfterSeconds,
    rateLimitResetAt,
  };
};

const getRetryDelaySeconds = (
  reason: AniListRetryContext["reason"],
  retryMetadata: RetryMetadata | null,
): number => {
  if (reason === "rateLimit") {
    let hintedDelay: number | null = null;

    if (retryMetadata?.retryAfterSeconds != null) {
      hintedDelay = retryMetadata.retryAfterSeconds;
    } else if (retryMetadata?.rateLimitResetAt != null) {
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const untilReset = retryMetadata.rateLimitResetAt - nowInSeconds;
      hintedDelay = untilReset > 0 ? untilReset : null;
    }

    return Math.max(
      1,
      Math.ceil(hintedDelay ?? FALLBACK_RATE_LIMIT_DELAY_SECONDS),
    );
  }

  if (reason === "networkError") {
    return NETWORK_RETRY_DELAY_SECONDS;
  }

  if (reason === "timeout") {
    return TIMEOUT_RETRY_DELAY_SECONDS;
  }

  return SERVER_RETRY_DELAY_SECONDS;
};

const isTransientHttpStatus = (statusCode: number | null): boolean =>
  statusCode != null && TRANSIENT_HTTP_STATUS_CODES.has(statusCode);

const resolveTimeoutMs = (timeoutMs?: number): number => {
  if (
    typeof timeoutMs !== "number" ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
  ) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  return Math.ceil(timeoutMs);
};

const createRequestAbortController = (
  timeoutMs: number,
  externalSignal?: AbortSignal,
): {
  signal: AbortSignal;
  didTimeout: () => boolean;
  wasCancelled: () => boolean;
  cleanup: () => void;
} => {
  const controller = new AbortController();
  let didTimeout = false;
  let wasCancelled = false;

  const onExternalAbort = () => {
    wasCancelled = true;
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      onExternalAbort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort);
    }
  }

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort(
      new Error(`AniList request timed out after ${timeoutMs}ms.`),
    );
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    wasCancelled: () => wasCancelled,
    cleanup: () => {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
};

const normalizeRequestValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeRequestValue(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  const sortedEntries = Object.entries(value).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return Object.fromEntries(
    sortedEntries.map(([key, nestedValue]) => [
      key,
      normalizeRequestValue(nestedValue),
    ]),
  );
};

const buildRequestDedupKey = (
  query: string,
  variables: AniListRequestVariables,
  token: string,
): string =>
  JSON.stringify({
    query: query.trim(),
    token,
    variables: normalizeRequestValue(variables),
  });

const shouldDedupeRequest = (query: string): boolean => {
  const normalizedQuery = query.trimStart();
  return !normalizedQuery.toLowerCase().startsWith("mutation");
};

const cloneRequestValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneRequestValue(entry));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        cloneRequestValue(nestedValue),
      ]),
    );
  }

  return value;
};

const cloneApiResponse = <TData>(
  response: ApiResponse<TData>,
): ApiResponse<TData> => {
  if (typeof structuredClone === "function") {
    return structuredClone(response);
  }

  return cloneRequestValue(response) as ApiResponse<TData>;
};

const pruneReadCache = () => {
  const now = Date.now();

  for (const [cacheKey, entry] of readRequestCache.entries()) {
    if (entry.expiresAt <= now) {
      readRequestCache.delete(cacheKey);
    }
  }

  while (readRequestCache.size > MAX_READ_CACHE_ENTRIES) {
    const oldestCacheKey = readRequestCache.keys().next().value;
    if (!oldestCacheKey) {
      break;
    }

    readRequestCache.delete(oldestCacheKey);
  }
};

const getCachedReadResponse = <TData>(
  cacheKey: string,
): ApiResponse<TData> | null => {
  const cachedEntry = readRequestCache.get(cacheKey);
  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    readRequestCache.delete(cacheKey);
    return null;
  }

  return cloneApiResponse(cachedEntry.response as ApiResponse<TData>);
};

const setCachedReadResponse = <TData>(
  cacheKey: string,
  response: ApiResponse<TData>,
) => {
  pruneReadCache();

  readRequestCache.set(cacheKey, {
    response: cloneApiResponse(response),
    expiresAt: Date.now() + READ_CACHE_TTL_MS,
  });

  pruneReadCache();
};

export const invalidateAniListReadCache = (params?: {
  query?: string;
  variables?: AniListRequestVariables;
  token?: string;
}): void => {
  if (!params || (!params.query && !params.variables && !params.token)) {
    readRequestCache.clear();
    return;
  }

  if (params.query && params.token) {
    const cacheKey = buildRequestDedupKey(
      params.query,
      params.variables ?? {},
      params.token,
    );
    readRequestCache.delete(cacheKey);
    return;
  }

  const normalizedVariables =
    params.variables == null
      ? null
      : JSON.stringify(normalizeRequestValue(params.variables));

  for (const cacheKey of readRequestCache.keys()) {
    const parsedKey = parseResponseBody(cacheKey);
    if (!isRecord(parsedKey)) {
      continue;
    }

    const queryMatches =
      params.query == null ||
      (typeof parsedKey.query === "string" &&
        parsedKey.query === params.query.trim());
    const tokenMatches =
      params.token == null ||
      (typeof parsedKey.token === "string" && parsedKey.token === params.token);
    const variablesMatches =
      normalizedVariables == null ||
      JSON.stringify(parsedKey.variables ?? null) === normalizedVariables;

    if (queryMatches && tokenMatches && variablesMatches) {
      readRequestCache.delete(cacheKey);
    }
  }
};

const isNetworkError = (apiError: ApiError): boolean =>
  apiError.kind === "network" ||
  apiError.message === "Network Error" ||
  apiError.message.includes("NetworkError");

const resolveUserFacingApiErrorCode = (
  apiError: ApiError,
): UserFacingApiErrorCode => {
  const statusCode = apiError.status ?? apiError.response?.status ?? null;
  const normalizedMessage = apiError.messages.join(" ").toLowerCase();

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    normalizedMessage.includes("unauthorized") ||
    normalizedMessage.includes("forbidden") ||
    normalizedMessage.includes("invalid token") ||
    normalizedMessage.includes("token")
  ) {
    return "AUTH_REQUIRED";
  }

  if (statusCode === 429) {
    return "RATE_LIMITED";
  }

  if (apiError.kind === "timeout") {
    return "REQUEST_TIMEOUT";
  }

  if (apiError.kind === "network") {
    return "NETWORK_FAILURE";
  }

  if (statusCode !== null && statusCode >= 500) {
    return "UPSTREAM_UNAVAILABLE";
  }

  return "REQUEST_FAILED";
};

export const getUserFacingApiError = (
  error: unknown,
  fallbackMessage?: string,
): UserFacingApiError => {
  const normalizedError = normalizeUnknownError(error);
  const code = resolveUserFacingApiErrorCode(normalizedError);
  const message =
    USER_FACING_API_ERROR_CATALOG[code]?.message ??
    fallbackMessage ??
    USER_FACING_API_ERROR_CATALOG.REQUEST_FAILED.message;
  const requestId =
    typeof normalizedError.metadata?.requestId === "string"
      ? normalizedError.metadata.requestId
      : null;

  return {
    code,
    message,
    requestId,
  };
};

interface RetryTelemetryContext {
  requestId: string;
  operationKey: string;
  operationType: "query" | "mutation";
}

const retryRequest = async <TData>(
  apiCall: () => Promise<ApiResponse<TData>>,
  retryCount: number,
  maxRetries: number,
  reason: AniListRetryContext["reason"],
  retryMetadata: RetryMetadata | null,
  telemetryContext: RetryTelemetryContext,
  handlers?: RetryHandlers,
): Promise<ApiResponse<TData>> => {
  const { requestId, operationKey, operationType } = telemetryContext;

  if (retryCount >= maxRetries) {
    const maxRetryError = createApiError({
      kind: "unknown",
      status: null,
      messages: ["Max retries reached for AniList requests."],
      retryable: false,
      metadata: {
        requestId,
      },
    });
    emitApiTelemetry({
      eventName: "anilist.retry.exhausted",
      severity: "error",
      requestId,
      operationKey,
      operationType,
      error: {
        className: getErrorClassName(maxRetryError),
        message: maxRetryError.message,
        status: maxRetryError.status,
        kind: maxRetryError.kind,
      },
      metadata: {
        maxRetries,
      },
    });
    handlers?.onFailure?.(maxRetryError);
    throw maxRetryError;
  }

  const retryAttempt = retryCount + 1;
  const retryAfterSeconds = getRetryDelaySeconds(reason, retryMetadata);

  const retryContext: AniListRetryContext = {
    reason,
    retryAfterSeconds,
    retryAttempt,
    requestId,
  };

  emitApiTelemetry({
    eventName: "anilist.retry.scheduled",
    severity: "warn",
    requestId,
    operationKey,
    operationType,
    retry: {
      attempt: retryAttempt,
      reason,
      retryAfterSeconds,
      maxRetries,
    },
  });
  handlers?.onRetry?.(retryContext);
  await delay(retryAfterSeconds * 1000);

  return handleRateLimit(
    apiCall,
    requestId,
    operationKey,
    operationType,
    retryAttempt,
    maxRetries,
    handlers,
  );
};

/**
 * Handles API rate limiting by retrying requests based on the error response.
 * Utilizes callbacks to allow component-level UX handling while emitting
 * structured telemetry for request lifecycle events.
 * @param apiCall - The API call function to execute.
 * @param retryCount - The current retry attempt.
 * @param retryAfter - The time to wait before retrying (in seconds).
 * @param maxRetries - The maximum number of retries before giving up.
 * @param onRetry - Optional callback to execute before retrying.
 * @param onFailure - Optional callback to execute on ultimate failure.
 * @returns The API response or throws an error after exceeding retries.
 */
const handleRateLimit = async <TData>(
  apiCall: () => Promise<ApiResponse<TData>>,
  requestId: string,
  operationKey: string,
  operationType: "query" | "mutation",
  retryCount = 0,
  maxRetries = 5,
  handlers?: RetryHandlers,
): Promise<ApiResponse<TData>> => {
  try {
    return await apiCall();
  } catch (error) {
    const apiError = normalizeUnknownError(error);
    const statusCode = apiError.status ?? apiError.response?.status ?? null;

    if (statusCode === 429) {
      return retryRequest(
        apiCall,
        retryCount,
        maxRetries,
        "rateLimit",
        getRetryMetadata(apiError),
        { requestId, operationKey, operationType },
        handlers,
      );
    }

    if (isNetworkError(apiError)) {
      return retryRequest(
        apiCall,
        retryCount,
        maxRetries,
        "networkError",
        null,
        { requestId, operationKey, operationType },
        handlers,
      );
    }

    if (apiError.kind === "timeout") {
      return retryRequest(
        apiCall,
        retryCount,
        maxRetries,
        "timeout",
        null,
        { requestId, operationKey, operationType },
        handlers,
      );
    }

    if (isTransientHttpStatus(statusCode) && retryCount < maxRetries) {
      return retryRequest(
        apiCall,
        retryCount,
        maxRetries,
        "serverError",
        null,
        { requestId, operationKey, operationType },
        handlers,
      );
    }

    const enrichedApiError = enrichApiErrorWithRequestId(apiError, requestId);
    emitApiTelemetry({
      eventName: "anilist.request.failed",
      severity: "error",
      requestId,
      operationKey,
      operationType,
      error: {
        className: getErrorClassName(enrichedApiError),
        message: enrichedApiError.message,
        status: statusCode,
        kind: enrichedApiError.kind,
      },
      metadata: {
        retryCount,
        maxRetries,
      },
    });
    handlers?.onFailure?.(enrichedApiError);
    throw enrichedApiError;
  }
};

interface AniListResponse<TData> {
  data?: TData | null;
  errors?: AniListGraphQLError[];
}

export interface AniListResponseValidation<TData> {
  dataGuard: ApiDataGuard<TData>;
  operationName: string;
}

const parseAniListResponse = async <TData>(
  response: Response,
  validation?: AniListResponseValidation<TData>,
): Promise<ApiResponse<TData>> => {
  const rawBody = await response.text();
  const parsedBody = parseResponseBody(rawBody);
  const graphQLErrors = extractGraphQLErrors(parsedBody);

  if (!response.ok) {
    const retryMetadata: RetryMetadata = {
      retryAfterSeconds:
        parseRetryAfterSeconds(response.headers.get("retry-after")) ??
        undefined,
      rateLimitResetAt:
        parseHeaderNumber(response.headers.get("x-ratelimit-reset")) ??
        undefined,
    };

    const apiError = createApiError({
      kind: "http",
      status: response.status,
      messages: [getResponseErrorMessage(response.status, parsedBody)],
      retryable:
        response.status === 429 || isTransientHttpStatus(response.status),
      graphQLErrors,
      metadata: {
        statusCode: response.status,
        retryAfterSeconds: retryMetadata.retryAfterSeconds ?? null,
        rateLimitResetAt: retryMetadata.rateLimitResetAt ?? null,
      },
      cause: retryMetadata,
    });
    throw apiError;
  }

  if (graphQLErrors.length > 0) {
    throw createApiError({
      kind: "graphql",
      status: response.status,
      messages: graphQLErrors.map((error) => error.message),
      retryable: false,
      graphQLErrors,
      metadata: {
        statusCode: response.status,
        graphQLErrorCount: graphQLErrors.length,
      },
    });
  }

  if (!isRecord(parsedBody)) {
    throw createApiError({
      kind: "unknown",
      status: response.status,
      messages: ["Invalid JSON payload returned by AniList."],
      retryable: false,
    });
  }

  const aniListResponse = parsedBody as AniListResponse<unknown>;
  if (aniListResponse.data == null) {
    throw createApiError({
      kind: "unknown",
      status: response.status,
      messages: ["AniList returned an empty data payload."],
      retryable: false,
    });
  }

  const responseData = aniListResponse.data;
  if (validation && !validation.dataGuard(responseData)) {
    throw createApiError({
      kind: "unknown",
      status: response.status,
      messages: [
        `AniList returned an unexpected ${validation.operationName} payload.`,
      ],
      retryable: false,
      cause: responseData,
    });
  }

  return {
    data: responseData as TData,
    errors: aniListResponse.errors,
    rateLimit: getRateLimitInfo(response.headers),
  };
};

/**
 * Fetches data from the AniList GraphQL API.
 * @param query - The GraphQL query string.
 * @param variables - Variables for the GraphQL query.
 * @param token - The AniList access token.
 * @param onRetry - Optional callback for retry UX updates.
 * @param onFailure - Optional callback for failure UX updates.
 * @returns The data returned from the AniList API.
 */
export const fetchAniList = async <
  TData = unknown,
  TVariables extends AniListRequestVariables = AniListRequestVariables,
>(
  query: string,
  variables: TVariables | undefined,
  token: string,
  onRetry?: (retryContext: AniListRetryContext) => void,
  onFailure?: (error: ApiError) => void,
  validation?: AniListResponseValidation<TData>,
  requestOptions?: FetchAniListOptions,
): Promise<ApiResponse<TData>> => {
  const normalizedVariables: AniListRequestVariables = variables ?? {};
  const requestId = generateRequestId();
  const operationKey = buildRequestDedupKey(query, normalizedVariables, token);
  const operationType = resolveOperationType(query);

  emitApiTelemetry({
    eventName: "anilist.request.started",
    severity: "info",
    requestId,
    operationKey,
    operationType,
  });

  const options = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables: normalizedVariables }),
  };

  const dedupeKey = shouldDedupeRequest(query) ? operationKey : null;

  if (dedupeKey) {
    const cachedResponse = getCachedReadResponse<TData>(dedupeKey);
    if (cachedResponse) {
      emitApiTelemetry({
        eventName: "anilist.request.cacheHit",
        severity: "info",
        requestId,
        operationKey,
        operationType,
      });
      return cachedResponse;
    }
  }

  const runRequest = (
    retryHandler?: (retryContext: AniListRetryContext) => void,
    failureHandler?: (error: ApiError) => void,
  ): Promise<ApiResponse<TData>> =>
    handleRateLimit(
      async () => {
        const timeoutMs = resolveTimeoutMs(requestOptions?.timeoutMs);
        const requestController = createRequestAbortController(
          timeoutMs,
          requestOptions?.signal,
        );

        try {
          const response = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
            ...options,
            signal: requestController.signal,
          });

          return await parseAniListResponse<TData>(response, validation);
        } catch (error) {
          if (requestController.didTimeout()) {
            throw createApiError({
              kind: "timeout",
              status: null,
              messages: [`AniList request timed out after ${timeoutMs}ms.`],
              retryable: true,
              metadata: {
                timeoutMs,
              },
              cause: error,
            });
          }

          if (requestController.wasCancelled()) {
            throw createApiError({
              kind: "network",
              status: null,
              messages: ["AniList request was cancelled."],
              retryable: false,
              metadata: {
                cancelled: true,
              },
              cause: error,
            });
          }

          throw error;
        } finally {
          requestController.cleanup();
        }
      },
      requestId,
      operationKey,
      operationType,
      0,
      5,
      {
        onRetry: retryHandler,
        onFailure: failureHandler,
      },
    );

  if (!dedupeKey) {
    const response = await runRequest(onRetry, onFailure);
    emitApiTelemetry({
      eventName: "anilist.request.succeeded",
      severity: "info",
      requestId,
      operationKey,
      operationType,
      metadata: {
        hasErrors: Boolean(response.errors?.length),
      },
    });
    return response;
  }

  const existingInFlight = inFlightRequests.get(dedupeKey);
  const subscriber: InFlightRequestSubscriber = { onRetry, onFailure };

  if (existingInFlight) {
    existingInFlight.subscribers.add(subscriber);
    emitApiTelemetry({
      eventName: "anilist.request.joinedInFlight",
      severity: "info",
      requestId: existingInFlight.requestId,
      operationKey,
      operationType,
      metadata: {
        subscriberCount: existingInFlight.subscribers.size,
      },
    });
    return existingInFlight.promise.finally(() => {
      existingInFlight.subscribers.delete(subscriber);
    }) as Promise<ApiResponse<TData>>;
  }

  const subscribers = new Set<InFlightRequestSubscriber>([subscriber]);
  const notifyRetrySubscribers = (retryContext: AniListRetryContext) => {
    subscribers.forEach((entry) => {
      entry.onRetry?.(retryContext);
    });
  };
  const notifyFailureSubscribers = (error: ApiError) => {
    subscribers.forEach((entry) => {
      entry.onFailure?.(error);
    });
  };

  const requestPromise = runRequest(
    notifyRetrySubscribers,
    notifyFailureSubscribers,
  ) as Promise<ApiResponse<unknown>>;

  inFlightRequests.set(dedupeKey, {
    promise: requestPromise,
    subscribers,
    requestId,
  });

  try {
    const response = (await requestPromise) as ApiResponse<TData>;
    setCachedReadResponse(dedupeKey, response);
    emitApiTelemetry({
      eventName: "anilist.request.succeeded",
      severity: "info",
      requestId,
      operationKey,
      operationType,
      metadata: {
        hasErrors: Boolean(response.errors?.length),
        deduped: true,
      },
    });
    return response;
  } finally {
    subscribers.delete(subscriber);
    inFlightRequests.delete(dedupeKey);
  }
};

/**
 * Utility function to create a delay.
 * @param ms - Milliseconds to delay.
 * @returns A promise that resolves after the specified delay.
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
