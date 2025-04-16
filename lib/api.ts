import { toast } from "sonner";
import { ApiError, ApiResponse } from "./types";

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
export const handleRateLimit = async (
  apiCall: () => Promise<ApiResponse>,
  retryCount = 0,
  retryAfter = 60,
  maxRetries = 5,
  onRetry?: (retryAttempt: number) => void,
  onFailure?: (error: ApiError) => void,
): Promise<ApiResponse> => {
  try {
    console.log("apiCall");
    const response = await apiCall();
    console.log("response", response);
    return response;
  } catch (error) {
    const apiError = error as ApiError;
    const statusCode = apiError.response?.status || null;
    const isNetworkError =
      apiError.message === "Network Error" ||
      apiError.message.includes("NetworkError");

    if (statusCode === 429 || isNetworkError) {
      if (retryCount >= maxRetries) {
        console.error("Max retries reached for rate limiting.");
        if (onFailure) onFailure(apiError);
        throw new Error("Max retries reached for rate limiting.");
      }
      console.warn(
        "Rate limit exceeded or network error, retrying after delay...",
      );
      if (onRetry) onRetry(retryCount + 1);
      await delay(retryAfter * 1000);
      return handleRateLimit(
        apiCall,
        retryCount + 1,
        retryAfter,
        maxRetries,
        onRetry,
        onFailure,
      );
    } else if (statusCode === 500 && retryCount < 5) {
      console.warn("Server error, retrying in 15 seconds...");
      if (onRetry) onRetry(retryCount + 1);
      toast.warning("Server Error", {
        description: `Retrying request in 15 seconds... Attempt ${retryCount + 1}`,
      });
      await delay(15000);
      return handleRateLimit(
        apiCall,
        retryCount + 1,
        retryAfter,
        maxRetries,
        onRetry,
        onFailure,
      );
    } else {
      console.error("API call failed:", apiError);
      if (onFailure) onFailure(apiError);
      throw apiError;
    }
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
  variables: Record<string, unknown> = {},
  token: string,
  onRetry?: (retryAttempt: number) => void,
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
    body: JSON.stringify({ query, variables }),
  };

  return handleRateLimit(
    () =>
      fetch(url, options).then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = (await response.json()) as AniListResponse;
        if (data.errors) {
          throw new Error(data.errors.map((error) => error.message).join(", "));
        }
        return data as ApiResponse;
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
