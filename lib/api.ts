import { toast } from "sonner";

import {
  type AniListGraphQLError,
  type AniListRequestVariables,
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

export interface AniListRetryContext {
  reason: "networkError" | "rateLimit" | "serverError";
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
  cause,
}: {
  kind: ApiError["kind"];
  status: number | null;
  messages: string[];
  retryable: boolean;
  graphQLErrors?: AniListGraphQLError[];
  cause?: unknown;
}): ApiError => {
  const safeMessages = messages.filter(Boolean);
  const apiError = new Error(
    safeMessages.join(", ") ||
      (status ? `Request failed with status ${status}` : "Request failed."),
  ) as ApiError;

  apiError.kind = kind;
  apiError.status = status;
  apiError.messages = safeMessages;
  apiError.retryable = retryable;
  apiError.graphQLErrors = graphQLErrors;
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

const getRateLimitInfo = (headers: Headers): RateLimitInfo => ({
  remaining: parseHeaderNumber(headers.get("x-ratelimit-remaining")),
  limit: parseHeaderNumber(headers.get("x-ratelimit-limit")),
  resetAt: parseHeaderNumber(headers.get("x-ratelimit-reset")),
});

const normalizeUnknownError = (error: unknown): ApiError => {
  if (isApiError(error)) {
    return error;
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

const isNetworkError = (apiError: ApiError): boolean =>
  apiError.kind === "network" ||
  apiError.message === "Network Error" ||
  apiError.message.includes("NetworkError");

const notifyRetry = (
  retryContext: AniListRetryContext,
  onRetry?: (retryContext: AniListRetryContext) => void,
) => {
  if (retryContext.reason === "serverError") {
    toast.warning("Server Error", {
      description: `Retrying request in ${retryContext.retryAfterSeconds} seconds... Attempt ${retryContext.retryAttempt}`,
    });
  } else {
    toast.warning("Rate Limit Exceeded", {
      description: `Retrying request in ${retryContext.retryAfterSeconds} seconds... Attempt ${retryContext.retryAttempt}`,
    });
  }

  onRetry?.(retryContext);
};

const retryRequest = async <TData>(
  apiCall: () => Promise<ApiResponse<TData>>,
  retryCount: number,
  retryAfterSeconds: number,
  maxRetries: number,
  reason: AniListRetryContext["reason"],
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

  const retryContext: AniListRetryContext = {
    reason,
    retryAfterSeconds,
    retryAttempt: retryCount + 1,
  };

  console.warn(
    `AniList request will retry after ${retryAfterSeconds} seconds due to ${reason}.`,
  );
  notifyRetry(retryContext, onRetry);
  await delay(retryAfterSeconds * 1000);

  return handleRateLimit(
    apiCall,
    retryCount + 1,
    retryAfterSeconds,
    maxRetries,
    onRetry,
    onFailure,
  );
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
  retryAfter = 60,
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
        retryAfter,
        maxRetries,
        "rateLimit",
        onRetry,
        onFailure,
      );
    }

    if (isNetworkError(apiError)) {
      return retryRequest(
        apiCall,
        retryCount,
        retryAfter,
        maxRetries,
        "networkError",
        onRetry,
        onFailure,
      );
    }

    if (statusCode === 500 && retryCount < 5) {
      return retryRequest(
        apiCall,
        retryCount,
        15,
        5,
        "serverError",
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
  TData = Record<string, unknown>,
  TVariables extends AniListRequestVariables = AniListRequestVariables,
>(
  query: string,
  variables: TVariables | undefined,
  token: string,
  onRetry?: (retryContext: AniListRetryContext) => void,
  onFailure?: (error: ApiError) => void,
): Promise<ApiResponse<TData>> => {
  const options = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  };

  return handleRateLimit(
    () =>
      fetch(ANILIST_GRAPHQL_ENDPOINT, options).then(async (response) => {
        const rawBody = await response.text();
        const parsedBody = parseResponseBody(rawBody);
        const graphQLErrors = extractGraphQLErrors(parsedBody);

        if (!response.ok) {
          const apiError = createApiError({
            kind: "http",
            status: response.status,
            messages: [getResponseErrorMessage(response.status, parsedBody)],
            retryable: response.status === 429 || response.status >= 500,
            graphQLErrors,
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

        const data = parsedBody as AniListResponse<TData>;
        if (data.data == null) {
          throw createApiError({
            kind: "unknown",
            status: response.status,
            messages: ["AniList returned an empty data payload."],
            retryable: false,
          });
        }

        return {
          data: data.data,
          errors: data.errors,
          rateLimit: getRateLimitInfo(response.headers),
        };
      }),
    0,
    60,
    5,
    onRetry,
    (error) => {
      toast.error("Request Failed", {
        description: error.message || "An error occurred while fetching data.",
      });
      if (onFailure) onFailure(error);
    },
  );
};

/**
 * Utility function to create a delay.
 * @param ms - Milliseconds to delay.
 * @returns A promise that resolves after the specified delay.
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
