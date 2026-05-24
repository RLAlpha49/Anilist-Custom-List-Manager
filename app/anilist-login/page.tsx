"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import {
  FaHome,
  FaSignInAlt,
  FaTimesCircle,
  FaUserCircle,
} from "react-icons/fa";
import { toast } from "sonner";

import Breadcrumbs from "@/components/breadcrumbs";
import Layout from "@/components/layout";
import LoadingIndicator from "@/components/loading-indicator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/auth-context";
import { fetchAniList } from "@/lib/api";
import { classifyFallbackFailure, getFallbackCopy } from "@/lib/fallback-ux";
import {
  getItemWithExpiry,
  removeItemWithExpiry,
  STORAGE_KEYS,
} from "@/lib/local-storage";
import { hasViewerData, type ViewerResponseData } from "@/lib/types";

const ANILIST_AUTH_URL = "https://anilist.co/api/v2/oauth/authorize";
const CLIENT_ID = process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID;

function PageData() {
  const { isLoggedIn, login, logout } = useAuth();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [loadingUserData, setLoadingUserData] = useState<boolean>(false);

  const fetchViewerData = useCallback(
    async (token: string): Promise<void> => {
      const query = `
        query {
          Viewer {
            id
            name
            avatar {
              medium
            }
          }
        }
      `;
      try {
        setLoadingUserData(true);
        const response = await fetchAniList<ViewerResponseData>(
          query,
          {},
          token,
          undefined,
          undefined,
          {
            dataGuard: hasViewerData,
            operationName: "viewer query",
          },
        );
        const userData = response.data.Viewer;

        if (!userData?.id) {
          throw new Error("Invalid user data received");
        }

        setLoginError("");
        setUsername(userData.name || "");
        setAvatarUrl(userData.avatar?.medium || "");
        login(token, userData.id);

        // Don't show toast on page reload, only when explicitly logging in
        const isPageReload = document.referrer.includes(
          globalThis.location.host,
        );
        const isFromCallback =
          globalThis.location.hash.includes("access_token");

        // Only show toast when coming from AniList oauth callback, not on regular page loads
        if (isFromCallback && !isPageReload) {
          toast.success("Success", {
            description: "Successfully connected to AniList!",
          });
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to fetch your AniList data.";

        removeItemWithExpiry(STORAGE_KEYS.authToken);
        setUsername("");
        setAvatarUrl("");
        setLoginError(message);
        logout();

        toast.error("Error", {
          description: message,
        });
      } finally {
        setLoadingUserData(false);
      }
    },
    [login, logout],
  );

  useEffect(() => {
    const accessToken = getItemWithExpiry<string>(STORAGE_KEYS.authToken);

    if (accessToken) {
      setIsProcessing(true);
      fetchViewerData(accessToken).finally(() => setIsProcessing(false));
    } else {
      setLoginError("");
      removeItemWithExpiry(STORAGE_KEYS.authToken);
      logout();
    }
  }, [fetchViewerData, logout]);

  const handleLogin = (): void => {
    setLoginError("");
    if (!CLIENT_ID) {
      console.error("AniList Client ID is not defined.");
      toast.error("Error", {
        description: "AniList Client ID is not defined.",
      });
      return;
    }
    const responseType: string = "token";
    const authUrl: string = `${ANILIST_AUTH_URL}?client_id=${CLIENT_ID}&response_type=${responseType}`;
    globalThis.location.href = authUrl;
  };

  const handleNext = (): void => {
    if (isLoggedIn) {
      router.push("/custom-list-manager");
    }
  };

  const handleHome = (): void => {
    router.push("/");
  };

  const primaryButtonClasses =
    "flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3.5 font-bold transition-all duration-200 ease-out transform-gpu hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_10px_26px_rgba(245,158,11,0.24)] active:translate-y-0 active:scale-[0.98]";

  const secondaryButtonClasses =
    "flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3.5 transition-all duration-200 ease-out transform-gpu hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(9,8,16,0.25)] active:translate-y-0 active:scale-[0.98]";
  const loginFailureKind = classifyFallbackFailure({ message: loginError });
  const loginFallbackCopy = getFallbackCopy(loginFailureKind);

  const renderAccountStatus = () => {
    if (loadingUserData) {
      return (
        <div className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      );
    }
    if (isLoggedIn) {
      return (
        <div className="flex items-center gap-4">
          <Avatar className="size-12">
            <AvatarImage src={avatarUrl} alt={username} />
            <AvatarFallback style={{ backgroundColor: "var(--z-card-up)" }}>
              <FaUserCircle size={24} style={{ color: "var(--z-muted)" }} />
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold" style={{ color: "var(--z-text)" }}>
                {username}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{
                  backgroundColor: "rgba(52,211,153,0.15)",
                  color: "var(--z-green)",
                }}
              >
                Connected
              </span>
            </div>
            <p className="text-sm" style={{ color: "var(--z-muted)" }}>
              AniList account linked
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-4">
        <div
          className="flex size-12 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--z-card-up)" }}
        >
          <FaUserCircle size={24} style={{ color: "var(--z-subtle)" }} />
        </div>
        <p className="text-sm" style={{ color: "var(--z-muted)" }}>
          No account connected
        </p>
      </div>
    );
  };

  const breadcrumbs = [
    { name: "Home", href: "/" },
    { name: "AniList Login", href: "/anilist-login" },
  ];

  return (
    <Layout>
      <Breadcrumbs breadcrumbs={breadcrumbs} />
      <div className="flex min-h-[80vh] items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <p
            className="mb-4 text-xs font-semibold tracking-widest uppercase"
            style={{ color: "var(--z-amber)" }}
          >
            Step 1 of 3 — Authentication
          </p>
          <h1
            className="mb-3 text-4xl font-black"
            style={{
              fontFamily: "var(--font-syne-var)",
              color: "var(--z-text)",
            }}
          >
            Connect AniList
          </h1>
          <p
            className="mb-10 leading-relaxed"
            style={{ color: "var(--z-muted)" }}
          >
            Log in with your AniList account to grant access to your lists and
            entries.
          </p>

          {/* Status card */}
          <div
            className="mb-6 rounded-xl p-5"
            style={{
              backgroundColor: "var(--z-card)",
              border: "1px solid var(--z-border)",
            }}
          >
            {renderAccountStatus()}
          </div>

          {loginError && (
            <div
              className="mb-6 rounded-xl p-4"
              style={{
                backgroundColor: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.2)",
              }}
            >
              <p
                className="text-sm font-medium"
                style={{ color: "var(--z-red)" }}
              >
                {loginFallbackCopy.title}
              </p>
              <p
                className="mt-1 text-sm/relaxed"
                style={{ color: "var(--z-muted)" }}
              >
                {loginFallbackCopy.description}
              </p>
              <p
                className="mt-1 text-sm/relaxed"
                style={{ color: "var(--z-text)" }}
              >
                {loginError}
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-3">
            {!isLoggedIn && (
              <button
                onClick={handleLogin}
                className={primaryButtonClasses}
                style={{ backgroundColor: "var(--z-amber)", color: "#07060f" }}
                aria-label="Login with AniList"
              >
                <FaSignInAlt size={16} />
                Login with AniList
              </button>
            )}

            {isLoggedIn && (
              <>
                <button
                  onClick={handleNext}
                  className={primaryButtonClasses}
                  style={{
                    backgroundColor: "var(--z-amber)",
                    color: "#07060f",
                  }}
                  aria-label="Continue to Custom List Manager"
                >
                  Continue
                </button>
                <button
                  onClick={logout}
                  className={secondaryButtonClasses}
                  style={{
                    border: "1px solid var(--z-border-mid)",
                    color: "var(--z-muted)",
                  }}
                  aria-label="Disconnect AniList account"
                >
                  <FaTimesCircle size={14} />
                  Disconnect
                </button>
              </>
            )}

            <button
              onClick={handleHome}
              className={`${secondaryButtonClasses} hover:text-(--z-text)`}
              style={{
                border: "1px solid var(--z-border-mid)",
                backgroundColor: "var(--z-card-up)",
                color: "var(--z-muted)",
              }}
              aria-label="Navigate to Home"
            >
              <FaHome size={14} />
              Back to Home
            </button>
          </div>

          {isProcessing && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <motion.div
                className="size-4 rounded-full border-2"
                style={{
                  borderColor: "var(--z-amber)",
                  borderTopColor: "transparent",
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              <span className="text-sm" style={{ color: "var(--z-muted)" }}>
                Processing...
              </span>
            </div>
          )}
        </motion.div>
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
