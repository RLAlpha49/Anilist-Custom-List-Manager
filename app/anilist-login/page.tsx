"use client";

import React from "react";
import Layout from "@/components/layout";
import { useEffect, useCallback, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  FaSignInAlt,
  FaTimesCircle,
  FaHome,
  FaUserCircle,
} from "react-icons/fa";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { useAuth } from "@/context/auth-context";
import { toast } from "sonner";
import { fetchAniList } from "@/lib/api";
import { motion } from "framer-motion";
import Breadcrumbs from "@/components/breadcrumbs";
import { getItemWithExpiry, removeItemWithExpiry } from "@/lib/local-storage";
import LoadingIndicator from "@/components/loading-indicator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const ANILIST_AUTH_URL = "https://anilist.co/api/v2/oauth/authorize";
const CLIENT_ID = process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID;

// Animation variants
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6 } },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const fadeInLeft = {
  hidden: { opacity: 0, x: -50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6 } },
};

const fadeInRight = {
  hidden: { opacity: 0, x: 50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6 } },
};

const staggerItems = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

interface ViewerData {
  id: number;
  name: string;
  avatar?: {
    medium?: string;
  };
}

function PageData() {
  const { isLoggedIn, login, logout } = useAuth();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
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
        const response = await fetchAniList(query, {}, token);
        const userData = response.data?.Viewer as ViewerData;

        if (!userData || !userData.id) {
          throw new Error("Invalid user data received");
        }

        setUsername(userData.name || "");
        setAvatarUrl(userData.avatar?.medium || "");
        login(token, userData.id.toString());

        // Don't show toast on page reload, only when explicitly logging in
        const isPageReload = document.referrer.includes(window.location.host);
        const isFromCallback = window.location.hash.includes("access_token");

        // Only show toast when coming from AniList oauth callback, not on regular page loads
        if (isFromCallback && !isPageReload) {
          toast.success("Success", {
            description: "Successfully connected to AniList!",
          });
        }
      } catch {
        toast.error("Error", {
          description: "Failed to fetch your AniList data.",
        });
      } finally {
        setLoadingUserData(false);
      }
    },
    [login],
  );

  useEffect(() => {
    const accessToken: string | null = getItemWithExpiry("anilistToken");

    if (accessToken) {
      setIsProcessing(true);
      fetchViewerData(accessToken).finally(() => setIsProcessing(false));
    } else {
      removeItemWithExpiry("anilistToken");
      logout();
    }
  }, [fetchViewerData, logout]);

  const handleLogin = (): void => {
    if (!CLIENT_ID) {
      console.error("AniList Client ID is not defined.");
      toast.error("Error", {
        description: "AniList Client ID is not defined.",
      });
      return;
    }
    const responseType: string = "token";
    const authUrl: string = `${ANILIST_AUTH_URL}?client_id=${CLIENT_ID}&response_type=${responseType}`;
    window.location.href = authUrl;
  };

  const handleNext = (): void => {
    if (isLoggedIn) {
      router.push("/custom-list-manager");
    }
  };

  const handleHome = (): void => {
    router.push("/");
  };

  const breadcrumbs = [
    { name: "Home", href: "/" },
    { name: "AniList Login", href: "/anilist-login" },
  ];

  return (
    <Layout>
      <Breadcrumbs breadcrumbs={breadcrumbs} />
      <div className="flex min-h-[80vh] flex-col items-center justify-center px-4 py-12">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="w-full max-w-5xl"
        >
          <Card className="overflow-hidden border-0 bg-white shadow-2xl dark:bg-gray-800">
            <div className="flex flex-col md:flex-row">
              {/* Left Column - Illustration */}
              <motion.div
                variants={fadeInLeft}
                className="flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-8 dark:from-blue-900/30 dark:to-indigo-900/30 md:w-1/2"
              >
                <motion.div
                  className="relative w-full max-w-md overflow-hidden rounded-lg"
                  whileHover={{ scale: 1.03 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                >
                  <motion.img
                    src="/images/anilist-illustration.png"
                    alt="AniList Illustration"
                    className="h-auto w-full rounded-lg shadow-md"
                    initial={{ scale: 1.1 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.5 }}
                  />
                  <motion.div
                    className="absolute inset-0 rounded-lg bg-gradient-to-t from-blue-900/30 to-transparent"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                  />
                </motion.div>
              </motion.div>

              {/* Right Column - Login Form */}
              <motion.div
                variants={fadeInRight}
                className="flex flex-col bg-white p-8 dark:bg-gray-800 md:w-1/2"
              >
                <CardHeader className="px-0 pt-0">
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <CardTitle className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-2xl font-bold text-transparent dark:from-blue-400 dark:to-indigo-400">
                      AniList Login
                    </CardTitle>
                    <CardDescription className="mt-2 text-gray-600 dark:text-gray-300">
                      Connect your AniList account to manage your custom lists
                      effortlessly.
                    </CardDescription>
                  </motion.div>
                </CardHeader>

                <CardContent className="flex-1 px-0">
                  <motion.div
                    variants={staggerItems}
                    className="mt-4 space-y-6"
                  >
                    {isLoggedIn && !loadingUserData ? (
                      <motion.div
                        variants={fadeInUp}
                        className="rounded-lg border border-blue-100 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20"
                      >
                        <div className="flex items-center">
                          <Avatar className="h-12 w-12 border-2 border-white shadow-md dark:border-gray-800">
                            <AvatarImage src={avatarUrl} alt={username} />
                            <AvatarFallback className="bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              <FaUserCircle className="h-8 w-8" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="ml-4">
                            <div className="flex items-center">
                              <h3 className="font-semibold text-gray-900 dark:text-white">
                                {username}
                              </h3>
                              <Badge
                                variant="outline"
                                className="ml-2 border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
                              >
                                Connected
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                              Your AniList account is connected
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ) : loadingUserData ? (
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/20">
                        <div className="flex items-center">
                          <Skeleton className="h-12 w-12 rounded-full" />
                          <div className="ml-4 space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-40" />
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {!isLoggedIn && (
                      <motion.div
                        variants={fadeInUp}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full"
                      >
                        <Button
                          onClick={handleLogin}
                          className="flex w-full items-center justify-center rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-white shadow-md transition-all duration-300 hover:from-blue-700 hover:to-indigo-700 dark:from-blue-500 dark:to-indigo-500 dark:hover:from-blue-600 dark:hover:to-indigo-600"
                          aria-label="Login with AniList"
                        >
                          <FaSignInAlt className="mr-2" aria-hidden="true" />
                          Login with AniList
                        </Button>
                      </motion.div>
                    )}

                    {isLoggedIn && (
                      <div className="w-full">
                        <Button
                          variant="outline"
                          onClick={logout}
                          className="flex w-full items-center justify-center rounded-md border-gray-300 py-3 text-gray-700 shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-blue-600 dark:bg-gray-800 dark:text-blue-300 dark:hover:bg-gray-700 dark:hover:text-blue-200"
                          aria-label="Logout (Clear Cached Token)"
                        >
                          <FaTimesCircle className="mr-2" aria-hidden="true" />
                          Logout (Clear Cached Token)
                        </Button>
                      </div>
                    )}
                  </motion.div>
                </CardContent>

                <CardFooter className="mt-auto px-0 pb-0 pt-6">
                  <div className="flex w-full flex-col justify-between space-y-3 sm:flex-row sm:space-x-3 sm:space-y-0">
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Button
                        variant="outline"
                        onClick={handleHome}
                        className="flex w-full items-center justify-center border-gray-200 bg-gray-100 text-gray-800 hover:bg-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 sm:w-auto"
                        aria-label="Navigate to Home"
                      >
                        <FaHome className="mr-2" aria-hidden="true" />
                        Home
                      </Button>
                    </motion.div>

                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="w-full sm:w-auto"
                    >
                      <Button
                        onClick={handleNext}
                        disabled={!isLoggedIn}
                        className={`flex w-full items-center justify-center bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md transition-all duration-300 hover:from-blue-700 hover:to-indigo-700 dark:from-blue-500 dark:to-indigo-500 dark:hover:from-blue-600 dark:hover:to-indigo-600 ${
                          !isLoggedIn && "cursor-not-allowed opacity-50"
                        }`}
                        aria-label="Proceed to Next Step"
                      >
                        Next
                      </Button>
                    </motion.div>
                  </div>
                </CardFooter>

                {isProcessing && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 flex items-center justify-center space-x-2"
                  >
                    <div className="relative h-6 w-6">
                      <motion.div
                        className="absolute inset-0 rounded-full border-2 border-blue-500 opacity-75 dark:border-blue-400"
                        animate={{
                          scale: [1, 1.5, 1],
                        }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                      <motion.div
                        className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent dark:border-blue-400"
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                      />
                    </div>
                    <span className="text-gray-600 dark:text-gray-300">
                      Processing...
                    </span>
                  </motion.div>
                )}
              </motion.div>
            </div>
          </Card>
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
