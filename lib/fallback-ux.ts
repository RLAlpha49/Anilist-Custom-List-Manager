import type { AniListRetryContext } from "@/lib/api";

export type FallbackFailureKind =
  | "auth"
  | "network"
  | "server"
  | "rateLimit"
  | "timeout"
  | "storage"
  | "unknown";

export interface FallbackCopy {
  title: string;
  description: string;
}

const FALLBACK_COPY: Record<FallbackFailureKind, FallbackCopy> = {
  auth: {
    title: "Authentication required",
    description:
      "Your AniList session could not be confirmed. Please sign in again.",
  },
  network: {
    title: "Network connection issue",
    description:
      "We could not reach AniList right now. Check your connection, then retry.",
  },
  server: {
    title: "AniList service issue",
    description:
      "AniList is currently returning server errors. Please retry shortly.",
  },
  rateLimit: {
    title: "Rate limit reached",
    description:
      "AniList is throttling requests. Wait for the retry window, then continue.",
  },
  timeout: {
    title: "Request timed out",
    description:
      "AniList took too long to respond. Retry when the service is more responsive.",
  },
  storage: {
    title: "Storage unavailable",
    description:
      "Your browser blocked secure token storage. Disable strict storage restrictions, then try again.",
  },
  unknown: {
    title: "Something went wrong",
    description: "We could not complete this step right now. Please try again.",
  },
};

export const classifyFallbackFailure = ({
  message,
  retryReason,
}: {
  message?: string | null;
  retryReason?: AniListRetryContext["reason"] | null;
}): FallbackFailureKind => {
  if (retryReason === "networkError") {
    return "network";
  }

  if (retryReason === "rateLimit") {
    return "rateLimit";
  }

  if (retryReason === "serverError") {
    return "server";
  }

  if (retryReason === "timeout") {
    return "timeout";
  }

  const normalizedMessage = message?.toLowerCase() ?? "";

  if (
    normalizedMessage.includes("token") ||
    normalizedMessage.includes("log in") ||
    normalizedMessage.includes("auth")
  ) {
    return "auth";
  }

  if (
    normalizedMessage.includes("timed out") ||
    normalizedMessage.includes("timeout")
  ) {
    return "timeout";
  }

  if (
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("429")
  ) {
    return "rateLimit";
  }

  if (
    normalizedMessage.includes("network") ||
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("offline")
  ) {
    return "network";
  }

  if (
    normalizedMessage.includes("500") ||
    normalizedMessage.includes("502") ||
    normalizedMessage.includes("503") ||
    normalizedMessage.includes("504") ||
    normalizedMessage.includes("server")
  ) {
    return "server";
  }

  if (
    normalizedMessage.includes("storage") ||
    normalizedMessage.includes("quota") ||
    normalizedMessage.includes("private mode") ||
    normalizedMessage.includes("persist")
  ) {
    return "storage";
  }

  return "unknown";
};

export const getFallbackCopy = (kind: FallbackFailureKind): FallbackCopy => {
  return FALLBACK_COPY[kind];
};
