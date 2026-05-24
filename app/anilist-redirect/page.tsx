"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  FaArrowLeft,
  FaCheckCircle,
  FaExclamationTriangle,
  FaHome,
  FaKey,
} from "react-icons/fa";

import Layout from "@/components/layout";
import LoadingIndicator from "@/components/loading-indicator";
import { fetchAniList, getUserFacingApiError } from "@/lib/api";
import {
  classifyFallbackFailure,
  type FallbackFailureKind,
  getFallbackCopy,
} from "@/lib/fallback-ux";
import {
  AUTH_POLICY,
  getItemWithExpiry,
  removeItemWithExpiry,
  setItemWithExpiry,
  STORAGE_KEYS,
  STORAGE_TTLS,
} from "@/lib/local-storage";
import { hasViewerData, type ViewerResponseData } from "@/lib/types";

const VIEWER_QUERY = `
  query {
    Viewer {
      id
      name
    }
  }
`;

const REDIRECT_MIN_DISPLAY_MS = 5000;
const VERIFY_STEP_MIN_DISPLAY_MS = 1500;
const PROGRESS_FINISH_VISIBLE_MS = 450;

const scrubOAuthResponseFromUrl = (): void => {
  const sanitizedPath = globalThis.location.pathname;
  globalThis.history.replaceState({}, document.title, sanitizedPath);
};

function PageData() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [failureKind, setFailureKind] =
    useState<FallbackFailureKind>("unknown");
  const [failureDetail, setFailureDetail] = useState<string | null>(null);
  const [message, setMessage] = useState<React.ReactNode>(
    "Processing login...",
  );

  useEffect(() => {
    let cancelled = false;
    let redirectTimeout: ReturnType<typeof setTimeout> | undefined;
    const loginStartedAt = Date.now();

    const verifyLogin = async () => {
      try {
        setProgress(12);
        setMessage("Checking your AniList response...");

        const currentUrl = new URL(globalThis.location.href);
        const hashParams: URLSearchParams = new URLSearchParams(
          currentUrl.hash.substring(1),
        );
        const searchParams = currentUrl.searchParams;
        const accessToken: string | null = hashParams.get("access_token");
        const returnedState: string | null =
          hashParams.get("state") ?? searchParams.get("state");
        const expectedState = getItemWithExpiry<string>(
          STORAGE_KEYS.oauthState,
        );

        scrubOAuthResponseFromUrl();
        removeItemWithExpiry(STORAGE_KEYS.oauthState);

        if (
          !returnedState ||
          !expectedState ||
          returnedState !== expectedState
        ) {
          setFailureKind("auth");
          setFailureDetail(
            "Login session validation failed. Please restart authentication.",
          );
          setStatus("error");
          setMessage(getFallbackCopy("auth").description);
          removeItemWithExpiry(STORAGE_KEYS.authToken);
          removeItemWithExpiry(STORAGE_KEYS.authUserId);
          removeItemWithExpiry(STORAGE_KEYS.authSessionIssuedAt);
          return;
        }

        if (!accessToken) {
          console.error("No access token found in URL hash");
          setFailureKind("auth");
          setFailureDetail("No access token was found in the redirect URL.");
          setStatus("error");
          setMessage(getFallbackCopy("auth").description);
          return;
        }

        setProgress(48);
        setMessage("Verifying your AniList session...");
        const verifyStepStartedAt = Date.now();

        const response = await fetchAniList<ViewerResponseData>(
          VIEWER_QUERY,
          {},
          accessToken,
          undefined,
          undefined,
          {
            dataGuard: hasViewerData,
            operationName: "viewer query",
          },
        );
        const verifyElapsedMs = Date.now() - verifyStepStartedAt;
        const verifyRemainingDelayMs = Math.max(
          0,
          VERIFY_STEP_MIN_DISPLAY_MS - verifyElapsedMs,
        );

        if (verifyRemainingDelayMs > 0) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, verifyRemainingDelayMs);
          });
        }

        const viewer = response.data.Viewer;

        if (!viewer?.id) {
          throw new Error("AniList did not return a valid account.");
        }

        if (cancelled) {
          return;
        }

        saveToken(accessToken);
        setProgress(100);
        setMessage("Finalizing your connection...");

        await new Promise<void>((resolve) => {
          setTimeout(resolve, PROGRESS_FINISH_VISIBLE_MS);
        });

        if (cancelled) {
          return;
        }

        setStatus("success");
        setMessage(
          <>
            Connected as <span className="font-semibold">{viewer.name}</span>.
            Taking you back…
          </>,
        );

        const elapsedMs = Date.now() - loginStartedAt;
        const remainingDelayMs = Math.max(
          0,
          REDIRECT_MIN_DISPLAY_MS - elapsedMs,
        );

        redirectTimeout = setTimeout(() => {
          if (cancelled) {
            return;
          }

          router.replace("/anilist-login");
        }, remainingDelayMs);
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error("Failed to process redirect:", error);
        const userFacingError = getUserFacingApiError(
          error,
          "An error occurred during login. Please try again.",
        );
        const normalizedMessage = userFacingError.message;
        const normalizedFailureKind = classifyFallbackFailure({
          message: normalizedMessage,
        });
        const safeFailureDetail = userFacingError.requestId
          ? `${normalizedMessage} (Reference ID: ${userFacingError.requestId})`
          : normalizedMessage;

        setFailureKind(normalizedFailureKind);
        setFailureDetail(safeFailureDetail);
        removeItemWithExpiry(STORAGE_KEYS.authToken);
        removeItemWithExpiry(STORAGE_KEYS.authUserId);
        removeItemWithExpiry(STORAGE_KEYS.authSessionIssuedAt);
        setProgress(100);
        setStatus("error");
        setMessage(getFallbackCopy(normalizedFailureKind).description);
      }
    };

    void verifyLogin();

    return () => {
      cancelled = true;
      if (redirectTimeout) {
        clearTimeout(redirectTimeout);
      }
    };
  }, [router]);

  const saveToken = (accessToken: string): void => {
    const persistenceResult = setItemWithExpiry(
      STORAGE_KEYS.authToken,
      accessToken,
      STORAGE_TTLS.authSession,
    );
    const issuedAtResult = setItemWithExpiry(
      STORAGE_KEYS.authSessionIssuedAt,
      Date.now(),
      AUTH_POLICY.tokenAbsoluteTtlMs,
    );

    if (persistenceResult !== "stored" || issuedAtResult !== "stored") {
      throw new Error(
        "We could not persist your AniList token in secure browser storage.",
      );
    }
  };

  const getIconBoxStyle = () => {
    if (status === "success")
      return {
        backgroundColor: "rgba(52,211,153,0.1)",
        border: "1px solid rgba(52,211,153,0.3)",
      };
    if (status === "error")
      return {
        backgroundColor: "rgba(248,113,113,0.1)",
        border: "1px solid rgba(248,113,113,0.3)",
      };
    return {
      backgroundColor: "var(--z-amber-dim)",
      border: "1px solid rgba(245,166,35,0.3)",
    };
  };

  const renderStatusIcon = () => {
    if (status === "success")
      return <FaCheckCircle size={36} style={{ color: "var(--z-green)" }} />;
    if (status === "error")
      return (
        <FaExclamationTriangle size={36} style={{ color: "var(--z-red)" }} />
      );
    return (
      <FaKey
        size={32}
        className="animate-pulse"
        style={{ color: "var(--z-amber)" }}
      />
    );
  };

  const getStatusHeading = () => {
    if (status === "success") return "Connected!";
    if (status === "error") return getFallbackCopy(failureKind).title;
    return "Authenticating...";
  };

  return (
    <Layout>
      <div className="flex min-h-[80vh] items-center justify-center px-6 py-16">
        <AnimatePresence mode="wait">
          <motion.div
            key={status}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="flex w-full max-w-md flex-col items-center text-center"
          >
            {/* Status icon */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="mb-8 flex size-24 items-center justify-center rounded-2xl"
              style={getIconBoxStyle()}
            >
              {renderStatusIcon()}
            </motion.div>

            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-3 text-3xl font-black"
              style={{
                fontFamily: "var(--font-syne-var)",
                color: "var(--z-text)",
              }}
            >
              {getStatusHeading()}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mb-8"
              style={{ color: "var(--z-muted)" }}
            >
              {message}
            </motion.p>

            {status === "loading" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="w-full"
              >
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full"
                  style={{ backgroundColor: "var(--z-card-up)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${progress}%`,
                      backgroundColor: "var(--z-amber)",
                    }}
                  />
                </div>
                <div className="mt-2 flex justify-between">
                  <span
                    className="text-xs"
                    style={{ color: "var(--z-subtle)" }}
                  >
                    Verifying token
                  </span>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "var(--z-amber)" }}
                  >
                    {progress}%
                  </span>
                </div>
              </motion.div>
            )}

            {status !== "loading" && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 flex w-full flex-col gap-3 sm:flex-row"
              >
                <button
                  type="button"
                  onClick={() => router.push("/anilist-login")}
                  className="
                    flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm
                    font-semibold
                  "
                  style={{
                    border: "1px solid var(--z-border-mid)",
                    color: "var(--z-text)",
                    backgroundColor: "rgba(255,255,255,0.03)",
                  }}
                >
                  <FaArrowLeft size={12} />
                  {status === "error" ? "Try Again" : "Back to Login"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="
                    flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm
                    font-medium
                  "
                  style={{
                    border: "1px solid var(--z-border)",
                    color: "var(--z-muted)",
                  }}
                >
                  <FaHome size={12} />
                  Go to Home
                </button>
              </motion.div>
            )}
            {status === "error" && failureDetail && (
              <p className="mt-3 text-xs" style={{ color: "var(--z-subtle)" }}>
                Details: {failureDetail}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Layout>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingIndicator />}>
      <PageData />
    </Suspense>
  );
}
