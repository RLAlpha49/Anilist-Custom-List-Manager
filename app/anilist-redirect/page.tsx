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
import { fetchAniList } from "@/lib/api";
import { removeItemWithExpiry, setItemWithExpiry } from "@/lib/local-storage";

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

function PageData() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
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

        const urlHash: string = new URL(globalThis.location.href).hash;
        const params: URLSearchParams = new URLSearchParams(
          urlHash.substring(1),
        );
        const accessToken: string | null = params.get("access_token");

        if (!accessToken) {
          console.error("No access token found in URL hash");
          setStatus("error");
          setMessage("No access token found. Please try again.");
          return;
        }

        setProgress(48);
        setMessage("Verifying your AniList session...");
        const verifyStepStartedAt = Date.now();

        const response = await fetchAniList(VIEWER_QUERY, {}, accessToken);
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

        const viewer = response.data?.Viewer as
          | { id?: number; name?: string }
          | undefined;

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
        removeItemWithExpiry("anilistToken");
        setProgress(100);
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "An error occurred during login. Please try again.",
        );
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
    try {
      setItemWithExpiry("anilistToken", accessToken, 60 * 60 * 24 * 7 * 1000);
    } catch (error) {
      console.error("Failed to save token:", error);
      setStatus("error");
      setMessage("Failed to save token. Please try again.");
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
    if (status === "error") return "Authentication Failed";
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
                  Back to Login
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
                  Home
                </button>
              </motion.div>
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
