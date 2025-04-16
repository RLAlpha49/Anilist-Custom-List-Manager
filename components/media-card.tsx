"use client";

import React from "react";
import { useEffect } from "react";
import { Check, Plus, Minus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { FaExternalLinkAlt } from "react-icons/fa";
import { cn } from "@/lib/utils";

export interface MediaCardProps {
  id: number;
  image: string;
  romajiTitle: string;
  englishTitle: string;
  status: string;
  score: number | null;
  repeatCount: number;
  customListChanges: string[];
  anilistLink: string;
  isUpdated: boolean;
  onAnimationEnd: () => void;
}

export function MediaCard({
  image,
  romajiTitle,
  englishTitle,
  status,
  score,
  repeatCount,
  customListChanges,
  anilistLink,
  isUpdated,
  onAnimationEnd,
}: MediaCardProps) {
  useEffect(() => {
    if (isUpdated) {
      const timeout = setTimeout(() => {
        onAnimationEnd();
      }, 1000);

      return () => {
        clearTimeout(timeout);
      };
    }
  }, [isUpdated, onAnimationEnd]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-gradient-to-r from-green-500 to-emerald-600 dark:from-green-600 dark:to-emerald-700";
      case "CURRENT":
        return "bg-gradient-to-r from-blue-500 to-sky-600 dark:from-blue-600 dark:to-sky-700";
      case "PLANNING":
        return "bg-gradient-to-r from-purple-500 to-violet-600 dark:from-purple-600 dark:to-violet-700";
      case "PAUSED":
        return "bg-gradient-to-r from-yellow-500 to-amber-600 dark:from-yellow-600 dark:to-amber-700";
      case "DROPPED":
        return "bg-gradient-to-r from-red-500 to-rose-600 dark:from-red-600 dark:to-rose-700";
      case "REPEATING":
        return "bg-gradient-to-r from-indigo-500 to-blue-600 dark:from-indigo-600 dark:to-blue-700";
      default:
        return "bg-gradient-to-r from-gray-500 to-slate-600 dark:from-gray-600 dark:to-slate-700";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: isUpdated ? [1, 1.03, 1] : 1,
        transition: {
          opacity: { duration: 0.4 },
          y: { duration: 0.4, type: "spring", stiffness: 100 },
          scale: isUpdated
            ? {
                duration: 0.6,
                times: [0, 0.5, 1],
              }
            : undefined,
        },
      }}
      exit={{
        opacity: 0,
        y: -10,
        transition: { duration: 0.2, ease: "easeOut" },
      }}
      transition={{ duration: 0.15 }}
      className={cn(
        "group overflow-hidden rounded-xl bg-white shadow-md transition-all duration-300 dark:bg-gray-800/90",
        "border border-gray-100 dark:border-gray-700",
        "hover:shadow-lg hover:shadow-blue-500/5 dark:hover:shadow-blue-900/10",
      )}
    >
      <div className="flex flex-col md:flex-row">
        <div className="relative h-52 w-full shrink-0 overflow-hidden md:h-auto md:w-44">
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-200 group-hover:scale-110"
            style={{ backgroundImage: `url(${image})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

          <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
            <span
              className={`rounded-md px-2.5 py-1 text-xs font-medium uppercase tracking-wider text-white ${getStatusColor(status)} shadow-md`}
            >
              {status.toLowerCase()}
            </span>
            {repeatCount > 1 && (
              <span className="rounded-md bg-gradient-to-r from-indigo-500 to-purple-600 px-2 py-1 text-xs font-medium text-white shadow-md">
                ×{repeatCount}
              </span>
            )}
          </div>

          <AnimatePresence>
            {isUpdated && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
              >
                <motion.div
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 10 }}
                  transition={{
                    type: "spring",
                    damping: 12,
                    stiffness: 200,
                  }}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-600 text-white shadow-lg shadow-green-500/30"
                >
                  <Check className="h-9 w-9" />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <div className="mb-2">
            <h3 className="line-clamp-1 text-lg font-bold text-gray-900 dark:text-white">
              {romajiTitle}
            </h3>
            {englishTitle !== "N/A" && (
              <p className="line-clamp-1 text-sm text-gray-600 dark:text-gray-400">
                {englishTitle}
              </p>
            )}
          </div>

          <div className="mb-3 flex items-center gap-3">
            {score !== null && score > 0 && (
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full shadow-sm",
                    score >= 8
                      ? "bg-gradient-to-r from-yellow-400 to-amber-500 text-white"
                      : score >= 6
                        ? "bg-gradient-to-r from-blue-400 to-cyan-500 text-white"
                        : "bg-gradient-to-r from-gray-200 to-gray-300 text-gray-700 dark:from-gray-700 dark:to-gray-600 dark:text-gray-300",
                  )}
                >
                  <span className="text-xs font-bold">{score}</span>
                </div>
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Score
                </span>
              </div>
            )}
          </div>

          {customListChanges.length > 0 && (
            <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-800/50">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                List Changes:
              </p>
              <ul className="space-y-1.5">
                {customListChanges.map((change, index) => {
                  const [list, action] = change.split(": ");
                  const isAdding = action.includes("Add");

                  return (
                    <motion.li
                      key={index}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full shadow-sm",
                          isAdding
                            ? "bg-gradient-to-r from-green-200 to-emerald-300 text-green-600 dark:from-green-900/50 dark:to-emerald-800/50 dark:text-green-400"
                            : "bg-gradient-to-r from-red-200 to-rose-300 text-red-600 dark:from-red-900/50 dark:to-rose-800/50 dark:text-red-400",
                        )}
                      >
                        {isAdding ? (
                          <Plus className="h-3 w-3" />
                        ) : (
                          <Minus className="h-3 w-3" />
                        )}
                      </span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {list}
                      </span>
                    </motion.li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="mt-auto flex justify-end">
            <Button
              variant="outline"
              size="sm"
              asChild
              className={cn(
                "flex items-center gap-1.5 text-xs transition-all duration-300",
                "text-gray-500 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600",
                "dark:border-gray-700 dark:text-gray-400 dark:hover:border-blue-700 dark:hover:bg-blue-950/30 dark:hover:text-blue-400",
              )}
            >
              <a
                href={anilistLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5"
              >
                <span>View on AniList</span>
                <FaExternalLinkAlt className="h-3 w-3" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
