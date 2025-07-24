"use client";

import React from "react";
import Layout from "@/components/layout";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, Suspense, JSX } from "react";
import { motion } from "framer-motion";
import {
  FaCheckCircle,
  FaHome,
  FaList,
  FaGithub,
  FaRocket,
  FaStar,
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
import { toast } from "sonner";
import Breadcrumbs from "@/components/breadcrumbs";
import { getItemWithExpiry, removeItemWithExpiry } from "@/lib/local-storage";
import LoadingIndicator from "@/components/loading-indicator";
import { cn } from "@/lib/utils";

interface Summary {
  totalListsUpdated: number;
  totalEntriesUpdated: number;
}

interface CompletedPageProps {
  summary?: Summary;
}

// Confetti component for celebration effect
const Confetti = () => {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {Array.from({ length: 60 }).map((_, index) => {
        const size = Math.random() * 10 + 5;
        const duration = Math.random() * 3 + 2;
        const left = Math.random() * 100;
        const delay = Math.random() * 0.5;
        const colors = [
          "bg-blue-500",
          "bg-green-500",
          "bg-yellow-400",
          "bg-pink-500",
          "bg-purple-500",
          "bg-indigo-500",
          "bg-red-500",
        ];
        const color = colors[Math.floor(Math.random() * colors.length)];

        return (
          <motion.div
            key={index}
            className={cn("absolute rounded-sm opacity-80", color)}
            initial={{
              top: -20,
              left: `${left}%`,
              width: size,
              height: size,
              opacity: 1,
            }}
            animate={{
              top: "100%",
              opacity: 0,
              rotate: Math.random() * 360,
            }}
            transition={{
              duration,
              delay,
              ease: "easeOut",
              repeat: 1,
              repeatDelay: 3,
            }}
          />
        );
      })}
    </div>
  );
};

// Statistic component for displaying numbers
const StatisticCard = ({ label, value }: { label: string; value: number }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 12 }}
      className="flex flex-col items-center justify-center rounded-lg bg-gradient-to-br from-white to-gray-100 p-4 text-center shadow-md dark:from-gray-800 dark:to-gray-900"
    >
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
        className="text-3xl font-bold text-blue-600 dark:text-blue-400"
      >
        {value}
      </motion.span>
      <span className="mt-1 text-sm font-medium text-gray-600 dark:text-gray-400">
        {label}
      </span>
    </motion.div>
  );
};

function PageData({ summary }: CompletedPageProps): JSX.Element {
  const router = useRouter();
  const [localSummary, setLocalSummary] = useState<Summary>({
    totalListsUpdated: 0,
    totalEntriesUpdated: 0,
  });
  const [showConfetti, setShowConfetti] = useState(true);

  const hasFetchedSummary = useRef(false);

  useEffect(() => {
    if (hasFetchedSummary.current) return;
    hasFetchedSummary.current = true;

    const storedSummary = getItemWithExpiry<string>("updateSummary");
    let summaryData: Summary = { totalListsUpdated: 0, totalEntriesUpdated: 0 };

    if (storedSummary) {
      summaryData = JSON.parse(storedSummary);
      removeItemWithExpiry("updateSummary");
    } else if (summary) {
      summaryData = summary;
    } else {
      toast.warning("No Update Information", {
        description: "No summary data was found for your recent update.",
      });
    }

    setLocalSummary(summaryData);

    // Hide confetti after 5 seconds
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, [summary]);

  const handleGoHome = () => {
    router.push("/");
  };

  const handleManageLists = () => {
    router.push("/custom-list-manager");
  };

  const breadcrumbs = [
    { name: "Home", href: "/" },
    { name: "Completed", href: "/completed" },
  ];

  // Animation variants for staggered animations
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 100,
        damping: 12,
      },
    },
  };

  return (
    <Layout>
      <Breadcrumbs breadcrumbs={breadcrumbs} />
      <div className="relative flex min-h-[80vh] items-center justify-center overflow-auto px-4 py-8">
        {showConfetti && <Confetti />}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-2xl"
        >
          <Card className="overflow-hidden border-0 bg-white/90 shadow-xl backdrop-blur-sm dark:bg-gray-800/90 dark:shadow-blue-900/5">
            <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-green-400 via-blue-500 to-purple-500"></div>

            <CardHeader className="pb-2 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 15,
                  duration: 0.8,
                }}
                className="relative mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-green-600 shadow-lg shadow-green-500/20 dark:from-green-500 dark:to-green-700"
              >
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    rotate: [0, 5, 0, -5, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    repeatType: "loop",
                    ease: "easeInOut",
                    times: [0, 0.2, 0.5, 0.8, 1],
                  }}
                >
                  <FaCheckCircle
                    className="h-12 w-12 text-white"
                    aria-hidden="true"
                  />
                </motion.div>
                <motion.div
                  className="absolute -inset-1 rounded-full"
                  animate={{
                    boxShadow: [
                      "0 0 0 0px rgba(74, 222, 128, 0.3)",
                      "0 0 0 10px rgba(74, 222, 128, 0)",
                    ],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    repeatType: "loop",
                  }}
                />
              </motion.div>

              <CardTitle className="bg-gradient-to-r from-green-600 via-blue-600 to-purple-600 bg-clip-text text-3xl font-bold text-transparent dark:from-green-400 dark:via-blue-400 dark:to-purple-400">
                Update Complete!
              </CardTitle>
              <CardDescription className="mt-2 text-base text-gray-600 dark:text-gray-300">
                Your AniList has been successfully organized and updated.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6">
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="space-y-6"
              >
                {localSummary.totalListsUpdated === 0 &&
                localSummary.totalEntriesUpdated === 0 ? (
                  <motion.div
                    variants={itemVariants}
                    className="flex flex-col items-center justify-center rounded-lg bg-yellow-50 p-4 text-center text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                  >
                    <FaStar className="mb-3 h-8 w-8 opacity-70" />
                    <p>
                      No update information was found for your recent update.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div variants={itemVariants}>
                    <h3 className="mb-4 text-center text-lg font-semibold text-gray-700 dark:text-gray-300">
                      Your Update Summary
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <StatisticCard
                        label="Custom Lists Checked"
                        value={localSummary.totalListsUpdated}
                      />
                      <StatisticCard
                        label="Entries Modified"
                        value={localSummary.totalEntriesUpdated}
                      />
                    </div>
                  </motion.div>
                )}

                <motion.div
                  variants={itemVariants}
                  className="flex flex-col justify-center space-y-3 sm:flex-row sm:space-x-4 sm:space-y-0"
                >
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full sm:w-auto"
                  >
                    <Button
                      onClick={handleManageLists}
                      className="flex w-full items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-2 text-sm font-medium text-white shadow-md transition-all duration-200 hover:shadow-lg dark:from-blue-600 dark:to-indigo-700 sm:w-auto"
                      aria-label="Manage Lists Again"
                    >
                      <FaList
                        className="mr-2 h-4 w-4 text-white"
                        aria-hidden="true"
                      />
                      Manage Lists
                    </Button>
                  </motion.div>
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Button
                      variant="outline"
                      onClick={handleGoHome}
                      className="flex w-full items-center justify-center rounded-full border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:bg-gray-50 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:w-auto"
                      aria-label="Navigate to Home"
                    >
                      <FaHome className="mr-2 h-4 w-4" aria-hidden="true" />
                      Home
                    </Button>
                  </motion.div>
                </motion.div>

                <motion.div
                  variants={itemVariants}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-800/50"
                >
                  <h2 className="mb-4 text-center text-xl font-bold text-gray-800 dark:text-white">
                    <FaRocket
                      className="mb-1 mr-2 inline-block h-5 w-5 text-purple-500"
                      aria-hidden="true"
                    />
                    Check Out My Other Projects
                  </h2>
                  <div className="flex flex-wrap justify-center gap-3">
                    <ProjectLink
                      href="https://github.com/RLAlpha49/AniCards"
                      name="AniCards"
                      color="from-purple-500 to-indigo-600"
                    />
                    <ProjectLink
                      href="https://github.com/RLAlpha49/AniSearchModel"
                      name="AniSearchModel"
                      color="from-green-500 to-emerald-600"
                    />
                    <ProjectLink
                      href="https://github.com/RLAlpha49/AniSearch"
                      name="AniSearch"
                      color="from-yellow-500 to-amber-600"
                    />
                    <ProjectLink
                      href="https://github.com/RLAlpha49/SpotifySkipTracker"
                      name="SpotifySkipTracker"
                      color="from-indigo-500 to-blue-600"
                    />
                    <ProjectLink
                      href="https://github.com/RLAlpha49/Anilist-Manga-Updater"
                      name="Anilist-Manga-Updater"
                      color="from-red-500 to-rose-600"
                      className="sm:col-span-2 md:col-span-1"
                    />
                  </div>
                </motion.div>
              </motion.div>
            </CardContent>

            <CardFooter className="flex items-center justify-center border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-800/30">
              <p className="text-center text-sm text-gray-600 dark:text-gray-400">
                Thank you for using AniList Custom List Manager!
              </p>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    </Layout>
  );
}

// Project link component
const ProjectLink = ({
  href,
  name,
  color,
  className,
}: {
  href: string;
  name: string;
  color: string;
  className?: string;
}) => {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
      className={cn("h-12", className)}
      aria-label={`View ${name} project on GitHub`}
    >
      <div
        className={cn(
          "flex h-full items-center justify-center rounded-lg bg-gradient-to-r p-[1px]",
          color,
        )}
      >
        <div className="flex h-full w-full items-center justify-center rounded-lg bg-white/50 p-2 px-3 text-sm font-medium text-black dark:bg-gray-800/50 dark:text-gray-300">
          <FaGithub className="mr-2 h-4 w-4" aria-hidden="true" />
          <span className="text-center">{name}</span>
        </div>
      </div>
    </motion.a>
  );
};

export default function Page() {
  return (
    <Suspense fallback={<LoadingIndicator />}>
      <PageData summary={undefined} />
    </Suspense>
  );
}
