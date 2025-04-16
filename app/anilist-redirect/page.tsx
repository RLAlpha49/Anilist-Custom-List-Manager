"use client";

import React from "react";
import Layout from "@/components/layout";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { setItemWithExpiry } from "@/lib/local-storage";
import LoadingIndicator from "@/components/loading-indicator";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";
import { FaKey, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";

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
    const timer = setTimeout(() => {
      if (status === "loading") {
        setProgress((prevProgress) => {
          const newProgress = prevProgress + 10;
          if (newProgress === 100) {
            clearTimeout(timer);
          }
          return newProgress < 100 ? newProgress : 100;
        });
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [progress, status]);

  useEffect(() => {
    try {
      const urlHash: string = new URL(window.location.href).hash;
      const params: URLSearchParams = new URLSearchParams(urlHash.substring(1));
      const accessToken: string | null = params.get("access_token");

      if (accessToken) {
        saveToken(accessToken);

        // Simulate processing with a delay
        const redirectTimer = setTimeout(() => {
          setStatus("success");
          setMessage("Login successful! Redirecting...");

          setTimeout(() => {
            router.push("/anilist-login");
          }, 1500);
        }, 2000);

        return () => clearTimeout(redirectTimer);
      } else {
        console.error("No access token found in URL hash");
        setStatus("error");
        setMessage("No access token found. Please try again.");
      }
    } catch (error) {
      console.error("Failed to process redirect:", error);
      setStatus("error");
      setMessage("An error occurred during login. Please try again.");
    }
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

  const getStatusIcon = () => {
    switch (status) {
      case "success":
        return <FaCheckCircle className="h-16 w-16 text-green-500" />;
      case "error":
        return <FaExclamationTriangle className="h-16 w-16 text-red-500" />;
      default:
        return <FaKey className="h-16 w-16 animate-pulse text-blue-500" />;
    }
  };

  const getStatusBackground = () => {
    switch (status) {
      case "success":
        return "bg-green-50 dark:bg-green-900/20";
      case "error":
        return "bg-red-50 dark:bg-red-900/20";
      default:
        return "bg-blue-50 dark:bg-blue-900/20";
    }
  };

  const getProgressColor = () => {
    switch (status) {
      case "success":
        return "bg-green-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-blue-500";
    }
  };

  return (
    <Layout>
      <div className="flex min-h-[80vh] items-center justify-center px-4 py-12">
        <AnimatePresence mode="wait">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
          >
            <Card className="overflow-hidden border-0 bg-white shadow-xl transition-all duration-300 dark:bg-gray-800">
              <motion.div
                className={`h-2 ${getProgressColor()} transition-all duration-300`}
                initial={{ width: "0%" }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
              <CardContent className="p-0">
                <div
                  className={`flex flex-col items-center justify-center p-8 ${getStatusBackground()} transition-colors duration-300`}
                >
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 260,
                      damping: 20,
                      delay: 0.2,
                    }}
                    className="mb-6"
                  >
                    {getStatusIcon()}
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-center"
                  >
                    <h3 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
                      {status === "loading"
                        ? "Authenticating with AniList"
                        : status === "success"
                          ? "Authentication Successful"
                          : "Authentication Failed"}
                    </h3>
                    <p className="text-md text-gray-600 dark:text-gray-300">
                      {message}
                    </p>
                  </motion.div>
                </div>

                {status === "loading" && (
                  <div className="bg-white p-6 dark:bg-gray-800">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          Verifying token
                        </span>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {progress}%
                        </span>
                      </div>
                      <Progress
                        value={progress}
                        className="h-2 bg-gray-200 dark:bg-gray-700"
                      />
                    </div>

                    <div className="mt-6 flex justify-center">
                      <div className="flex space-x-1">
                        <motion.div
                          animate={{
                            scale: [1, 1.2, 1],
                            opacity: [0.5, 1, 0.5],
                          }}
                          transition={{
                            duration: 1,
                            repeat: Infinity,
                            repeatType: "loop",
                            times: [0, 0.5, 1],
                            delay: 0,
                          }}
                          className="h-2 w-2 rounded-full bg-blue-500"
                        />
                        <motion.div
                          animate={{
                            scale: [1, 1.2, 1],
                            opacity: [0.5, 1, 0.5],
                          }}
                          transition={{
                            duration: 1,
                            repeat: Infinity,
                            repeatType: "loop",
                            times: [0, 0.5, 1],
                            delay: 0.2,
                          }}
                          className="h-2 w-2 rounded-full bg-blue-500"
                        />
                        <motion.div
                          animate={{
                            scale: [1, 1.2, 1],
                            opacity: [0.5, 1, 0.5],
                          }}
                          transition={{
                            duration: 1,
                            repeat: Infinity,
                            repeatType: "loop",
                            times: [0, 0.5, 1],
                            delay: 0.4,
                          }}
                          className="h-2 w-2 rounded-full bg-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
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
