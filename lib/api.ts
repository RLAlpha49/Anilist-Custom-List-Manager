import { toast } from "sonner";

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
const TRANSIENT_HTTP_STATUS_CODES = new Set([408, 500, 502, 503, 504]);

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
}

const inFlightRequests = new Map<string, InFlightRequestEntry>();

export interface AniListRetryContext {
  reason: "networkError" | "rateLimit" | "serverError" | "timeout";
  retryAfterSeconds: number;
  retryAttempt: number;
}

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

const getFailureDescription = (error: ApiError): string =>
  error.message || "An error occurred while fetching data.";

const isNetworkError = (apiError: ApiError): boolean =>
  apiError.kind === "network" ||
  apiError.message === "Network Error" ||
  apiError.message.includes("NetworkError");

const notifyRetry = (
  retryContext: AniListRetryContext,
  onRetry?: (retryContext: AniListRetryContext) => void,
) => {
  const baseDescription = `Retrying request in ${retryContext.retryAfterSeconds} seconds... Attempt ${retryContext.retryAttempt}`;

  if (retryContext.reason === "serverError") {
    toast.warning("Server Error", {
      description: baseDescription,
    });
  } else if (retryContext.reason === "networkError") {
    toast.warning("Network Error", {
      description: baseDescription,
    });
  } else if (retryContext.reason === "timeout") {
    toast.warning("Request Timed Out", {
      description: baseDescription,
    });
  } else {
    toast.warning("Rate Limit Exceeded", {
      description: baseDescription,
    });
  }

  onRetry?.(retryContext);
};

const retryRequest = async <TData>(
  apiCall: () => Promise<ApiResponse<TData>>,
  retryCount: number,
  maxRetries: number,
  reason: AniListRetryContext["reason"],
  retryMetadata: RetryMetadata | null,
  onRetry?: (retryContext: AniListRetryContext) => void,
  onFailure?: (error: ApiError) => void,
): Promise<ApiResponse<TData>> => {
  if (retryCount >= maxRetries) {
    console.error("Max retries reached for AniList requests.");
    const maxRetryError = createApiError({
      kind: "unknown",
      status: null,
      messages: ["Max retries reached for AniList requests."],
      retryable: false,
    });
    onFailure?.(maxRetryError);
    throw maxRetryError;
  }

  const retryAttempt = retryCount + 1;
  const retryAfterSeconds = getRetryDelaySeconds(reason, retryMetadata);

  const retryContext: AniListRetryContext = {
    reason,
    retryAfterSeconds,
    retryAttempt,
  };

  console.warn(
    `AniList request will retry after ${retryAfterSeconds} seconds due to ${reason}.`,
  );
  notifyRetry(retryContext, onRetry);
  await delay(retryAfterSeconds * 1000);

  return handleRateLimit(apiCall, retryAttempt, maxRetries, onRetry, onFailure);
};

/**
 * Handles API rate limiting by retrying requests based on the error response.
 * Utilizes callbacks to handle component-specific side-effects like displaying toasts.
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
  retryCount = 0,
  maxRetries = 5,
  onRetry?: (retryContext: AniListRetryContext) => void,
  onFailure?: (error: ApiError) => void,
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
        onRetry,
        onFailure,
      );
    }

    if (isNetworkError(apiError)) {
      return retryRequest(
        apiCall,
        retryCount,
        maxRetries,
        "networkError",
        null,
        onRetry,
        onFailure,
      );
    }

    if (apiError.kind === "timeout") {
      return retryRequest(
        apiCall,
        retryCount,
        maxRetries,
        "timeout",
        null,
        onRetry,
        onFailure,
      );
    }

    if (isTransientHttpStatus(statusCode) && retryCount < maxRetries) {
      return retryRequest(
        apiCall,
        retryCount,
        maxRetries,
        "serverError",
        null,
        onRetry,
        onFailure,
      );
    }

    console.error("API call failed:", apiError);
    if (onFailure) onFailure(apiError);
    throw apiError;
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
 * @param onRetry - Optional callback for retries (e.g., to display toasts).
 * @param onFailure - Optional callback for failures (e.g., to display toasts).
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

  const options = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables: normalizedVariables }),
  };

  const dedupeKey = shouldDedupeRequest(query)
    ? buildRequestDedupKey(query, normalizedVariables, token)
    : null;

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
      0,
      5,
      retryHandler,
      failureHandler,
    );

  if (!dedupeKey) {
    return runRequest(onRetry, (error) => {
      toast.error("Request Failed", {
        description: getFailureDescription(error),
      });
      if (onFailure) onFailure(error);
    });
  }

  const existingInFlight = inFlightRequests.get(dedupeKey);
  const subscriber: InFlightRequestSubscriber = { onRetry, onFailure };

  if (existingInFlight) {
    existingInFlight.subscribers.add(subscriber);
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
    toast.error("Request Failed", {
      description: getFailureDescription(error),
    });

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
  });

  try {
    return (await requestPromise) as ApiResponse<TData>;
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
