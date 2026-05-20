import { toast } from "sonner";

import { ApiError, ApiResponse, RateLimitInfo } from "./types";

export interface AniListRetryContext {
  reason: "networkError" | "rateLimit" | "serverError";
  retryAfterSeconds: number;
  retryAttempt: number;
}

interface ErrorPayload {
  errors?: Array<{ message?: string }>;
  message?: string;
}

const parseResponseBody = (rawBody: string): ErrorPayload | null => {
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as ErrorPayload;
  } catch {
    return null;
  }
};

const getResponseErrorMessage = (
  status: number,
  payload: ErrorPayload | null,
): string =>
  payload?.errors
    ?.map((error) => error.message)
    .filter(Boolean)
    .join(", ") ||
  payload?.message ||
  `HTTP error! status: ${status}`;

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

const isNetworkError = (apiError: ApiError): boolean =>
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

const retryRequest = async (
  apiCall: () => Promise<ApiResponse>,
  retryCount: number,
  retryAfterSeconds: number,
  maxRetries: number,
  reason: AniListRetryContext["reason"],
  onRetry?: (retryContext: AniListRetryContext) => void,
  onFailure?: (error: ApiError) => void,
): Promise<ApiResponse> => {
  if (retryCount >= maxRetries) {
    console.error("Max retries reached for AniList requests.");
    const maxRetryError = new Error(
      "Max retries reached for AniList requests.",
    ) as ApiError;
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
const handleRateLimit = async (
  apiCall: () => Promise<ApiResponse>,
  retryCount = 0,
  retryAfter = 60,
  maxRetries = 5,
  onRetry?: (retryContext: AniListRetryContext) => void,
  onFailure?: (error: ApiError) => void,
): Promise<ApiResponse> => {
  try {
    return await apiCall();
  } catch (error) {
    const apiError = error as ApiError;
    const statusCode = apiError.response?.status || null;

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

interface AniListGraphQLError {
  message: string;
}

interface AniListResponse {
  data?: Record<string, unknown>;
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
export const fetchAniList = async (
  query: string,
  variables: Record<string, unknown> | undefined,
  token: string,
  onRetry?: (retryContext: AniListRetryContext) => void,
  onFailure?: (error: ApiError) => void,
): Promise<ApiResponse> => {
  const url = "https://graphql.anilist.co";
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
      fetch(url, options).then(async (response) => {
        const rawBody = await response.text();
        const parsedBody = parseResponseBody(rawBody);

        if (!response.ok) {
          const apiError = new Error(
            getResponseErrorMessage(response.status, parsedBody),
          ) as ApiError;
          apiError.response = { status: response.status };
          throw apiError;
        }

        const data = parsedBody as AniListResponse;
        if (data.errors) {
          throw new Error(data.errors.map((error) => error.message).join(", "));
        }
        return {
          ...(data as ApiResponse),
          rateLimit: getRateLimitInfo(response.headers),
        };
      }),
    0,
    60,
    5,
    (retryAttempt) => {
      toast.warning("Rate Limit Exceeded", {
        description: `Retrying request in 60 seconds...\nAttempt ${retryAttempt}`,
      });
      if (onRetry) onRetry(retryAttempt);
    },
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
