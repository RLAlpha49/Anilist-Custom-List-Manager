"use client";

import React from "react";
import Layout from "@/components/layout";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import Link from "next/link";
import { toast } from "sonner";
import { MediaCard } from "@/components/media-card";
import LoadingIndicator from "@/components/loading-indicator";
import { fetchAniList } from "@/lib/api";
import { getItemWithExpiry, setItemWithExpiry } from "@/lib/local-storage";
import { FaPlay, FaPause, FaCheckCircle } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import Breadcrumbs from "@/components/breadcrumbs";
import {
  ApiError,
  MediaEntry,
  MediaListResponse,
  MutationResponse,
} from "@/lib/types";
import Image from "next/image";

function PageData() {
  const [mediaList, setMediaList] = useState<MediaEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [updating, setUpdating] = useState<boolean>(false);
  const [currentEntry, setCurrentEntry] = useState<MediaEntry | null>(null);
  const [totalEntries, setTotalEntries] = useState<number>(0);
  const [done, setDone] = useState<boolean>(false);
  const [retryCountdown, setRetryCountdown] = useState<number>(-1);
  const [showNotice, setShowNotice] = useState<boolean>(true);
  const router = useRouter();

  const [listType, setListType] = useState<"ANIME" | "MANGA">("ANIME");
  const [userId, setUserId] = useState<string | null>(null);
  const [lists, setLists] = useState<
    Array<{ name: string; selectedOption: string }>
  >([]);
  const [hideDefaultStatusLists, setHideDefaultStatusLists] =
    useState<boolean>(true);
  const [token, setToken] = useState<string | null>(null);
  const shouldPauseRef = useRef<boolean>(false);
  const updateProcessRef = useRef<Promise<void> | null>(null);
  const [updatedEntries, setUpdatedEntries] = useState<Set<number>>(new Set());
  const isPausedRef = useRef<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [isRateLimited, setIsRateLimited] = useState<boolean>(false);
  const itemsPerPage = 10;
  const finishTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setUserId(getItemWithExpiry("userId"));
    setListType(getItemWithExpiry("listType") === "MANGA" ? "MANGA" : "ANIME");
    setLists(JSON.parse(getItemWithExpiry("lists") || "[]"));
    setHideDefaultStatusLists(
      JSON.parse(getItemWithExpiry("hideDefaultStatusLists") || "true"),
    );
    setToken(getItemWithExpiry("anilistToken"));
  }, []);

  useEffect(() => {
    const updateIsPausedState = () => {
      setIsPaused(isPausedRef.current);
    };

    updateIsPausedState();

    const interval = setInterval(updateIsPausedState, 100);

    return () => clearInterval(interval);
  }, []);

  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const getMediaUrl = useCallback(
    (entry: MediaEntry): string => {
      const base = "https://anilist.co/";
      const type = listType === "ANIME" ? "anime" : "manga";
      return `${base}${type}/${entry.media.id}`;
    },
    [listType],
  );

  const capitalizeWords = useCallback((str: string): string => {
    let words = str.split(/[\s()]+/);
    words = words.map(
      (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    );

    const index = words.findIndex((word) => word === "Manga");

    if (index >= 0 && index < words.length - 1) {
      words[index] = `${words[index]} (${words
        .slice(index + 1)
        .join(" ")
        .trim()})`;
      words = words.slice(0, index + 1);
    }

    return words.join(" ");
  }, []);

  const mediaListQuery = `
		query ($userId: Int, $type: MediaType) {
			MediaListCollection(userId: $userId, type: $type) {
			lists {
				entries {
				id
				hiddenFromStatusLists
				score(format: POINT_10)
				repeat
				status
				customLists
				media {
					id
					format
					countryOfOrigin
					title {
					romaji
					english
					}
					genres
					tags {
					name
					category
					}
					isAdult
					coverImage {
					extraLarge
					}
				}
				}
			}
			}
		}
		`;

  const fetchMediaList = useCallback(async () => {
    if (!userId && getItemWithExpiry("userId") === null) {
      toast.error("User ID is not available.");
      return;
    }

    setLoading(true);
    try {
      if (userId) {
        const variables = { userId: parseInt(userId, 10), type: listType };
        const response: MediaListResponse = await fetchAniList(
          mediaListQuery,
          variables,
          token!,
          (retryCount) => {
            console.log(`Retry attempt ${retryCount} for media list fetch`);
            setRetryCountdown(60);
            isPausedRef.current = true;
            setIsPaused(true);
            const countdownInterval = setInterval(() => {
              setRetryCountdown((prev) => {
                if (prev <= 1) {
                  clearInterval(countdownInterval);
                  isPausedRef.current = false;
                  setIsPaused(false);
                  return -1;
                }
                return prev - 1;
              });
            }, 1000);
          },
          (error: ApiError) => {
            toast.error(`Failed to fetch media list: ${error.message}`);
          },
        );
        const mediaLists = response.data.MediaListCollection?.lists || [];
        let entries: MediaEntry[] = mediaLists.flatMap((list) => list.entries);

        const seen = new Set<number>();
        entries = entries.filter((entry) => {
          const duplicate = seen.has(entry.media.id);
          seen.add(entry.media.id);
          return !duplicate;
        });

        entries = entries.map((entry) => {
          if (!entry.lists) {
            entry.lists = {};
          }
          entry.tagCategories =
            entry.media.tags?.map((tag) => tag.category) || [];
          entry.tags = entry.media.tags?.map((tag) => tag.name) || [];
          entry.genres = entry.media.genres || [];
          entry.isAdult = entry.media.isAdult || false;

          lists.forEach((list) => {
            if (!list.selectedOption) return;

            if (list.selectedOption.includes("Status set to")) {
              let status = list.selectedOption
                .split(" ")
                .slice(-1)[0]
                .toUpperCase();
              if (status === "WATCHING" || status === "READING") {
                status = "CURRENT";
              }
              if (
                entry.status === status &&
                entry.customLists[list.name] !== true
              ) {
                entry.lists![list.name] = true;
              } else if (
                entry.status !== status &&
                entry.customLists[list.name] !== false
              ) {
                entry.lists![list.name] = false;
              }
            }

            if (list.selectedOption.includes("Score set to")) {
              if (list.selectedOption.includes("below 5")) {
                if (
                  entry.score > 0 &&
                  entry.score < 5 &&
                  entry.customLists[list.name] !== true
                ) {
                  entry.lists![list.name] = true;
                } else if (
                  (entry.score >= 5 || entry.score === 0) &&
                  entry.customLists[list.name] !== false
                ) {
                  entry.lists![list.name] = false;
                }
              } else {
                const scoreCondition = parseInt(
                  list.selectedOption.split(" ").slice(-1)[0],
                  10,
                );
                if (
                  entry.score === scoreCondition &&
                  entry.customLists[list.name] !== true
                ) {
                  entry.lists![list.name] = true;
                } else if (
                  entry.score !== scoreCondition &&
                  entry.customLists[list.name] !== false
                ) {
                  entry.lists![list.name] = false;
                }
              }
            }

            if (list.selectedOption.includes("Format set to")) {
              let format = list.selectedOption
                .replace("Format set to ", "")
                .toUpperCase();
              if (
                listType === "MANGA" &&
                [
                  "MANGA",
                  "MANWHA",
                  "MANHUA",
                  "MANGA (JAPAN)",
                  "MANGA (SOUTH KOREAN)",
                  "MANGA (CHINESE)",
                ].includes(format)
              ) {
                const countryMap: Record<string, string> = {
                  MANGA: "Manga (Japan)",
                  MANWHA: "Manga (South Korean)",
                  MANHUA: "Manga (Chinese)",
                };
                const country = entry.media.countryOfOrigin;
                if (["MANGA", "MANWHA", "MANHUA"].includes(format)) {
                  format = countryMap[format as keyof typeof countryMap];
                } else {
                  format = capitalizeWords(format);
                }
                if (
                  (country === "JP" && format === "Manga (Japan)") ||
                  (country === "KR" && format === "Manga (South Korean)") ||
                  (country === "CN" && format === "Manga (Chinese)")
                ) {
                  if (entry.customLists[list.name] === false) {
                    entry.lists![list.name] = true;
                  }
                } else if (entry.customLists[list.name] !== false) {
                  entry.lists![list.name] = false;
                }
              } else if (
                entry.media.format === format &&
                entry.customLists[list.name] === false
              ) {
                entry.lists![list.name] = true;
              } else if (
                entry.media.format !== format &&
                entry.customLists[list.name] !== false
              ) {
                entry.lists![list.name] = false;
              }
            }

            if (list.selectedOption.includes("Genres contain")) {
              const genre = list.selectedOption.replace("Genres contain ", "");
              if (
                entry.genres &&
                entry.genres.includes(genre) &&
                entry.customLists[list.name] !== true
              ) {
                entry.lists![list.name] = true;
              } else if (
                entry.genres &&
                !entry.genres.includes(genre) &&
                entry.customLists[list.name] !== false
              ) {
                entry.lists![list.name] = false;
              }
            }

            if (list.selectedOption.includes("Tag Categories contain")) {
              const tagCategory = list.selectedOption.replace(
                "Tag Categories contain ",
                "",
              );
              if (
                entry.tagCategories &&
                entry.tagCategories.includes(tagCategory) &&
                entry.customLists[list.name] !== true
              ) {
                entry.lists![list.name] = true;
              } else if (
                entry.tagCategories &&
                !entry.tagCategories.includes(tagCategory) &&
                entry.customLists[list.name] !== false
              ) {
                entry.lists![list.name] = false;
              }
            }

            if (list.selectedOption.includes("Tags contain")) {
              const tag = list.selectedOption.replace("Tags contain ", "");
              if (
                entry.tags &&
                entry.tags.includes(tag) &&
                entry.customLists[list.name] !== true
              ) {
                entry.lists![list.name] = true;
              } else if (
                entry.tags &&
                !entry.tags.includes(tag) &&
                entry.customLists[list.name] !== false
              ) {
                entry.lists![list.name] = false;
              }
            }

            if (
              (list.selectedOption === "Reread" ||
                list.selectedOption === "Rewatched") &&
              entry.repeat > 0 &&
              !entry.customLists[list.name]
            ) {
              entry.lists![list.name] = true;
            } else if (
              (list.selectedOption === "Reread" ||
                list.selectedOption === "Rewatched") &&
              entry.repeat <= 0 &&
              entry.customLists[list.name]
            ) {
              entry.lists![list.name] = false;
            }

            if (
              list.selectedOption === "Adult (18+)" &&
              entry.isAdult === true &&
              entry.customLists[list.name] !== true
            ) {
              entry.lists![list.name] = true;
            } else if (
              list.selectedOption === "Adult (18+)" &&
              entry.isAdult === false &&
              entry.customLists[list.name] !== false
            ) {
              entry.lists![list.name] = false;
            }
          });

          if (entry.hiddenFromStatusLists !== hideDefaultStatusLists) {
            entry.lists!["hiddenFromStatusLists"] = hideDefaultStatusLists;
          }

          return entry;
        });

        entries = entries.filter((entry) =>
          Object.values(entry.lists!).some((value) => value !== undefined),
        );
        entries.sort((a, b) =>
          a.media.title.romaji.localeCompare(b.media.title.romaji),
        );

        setMediaList(entries);
        setTotalEntries(entries.length);
        setLoading(false);

        if (entries.length === 0) {
          setDone(true);
          toast.info("No entries to update.");
        }
      }
    } catch (error) {
      setLoading(false);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toast.error(<>An unexpected error occurred: {errorMessage}</>);
    }
  }, [
    mediaListQuery,
    listType,
    userId,
    lists,
    hideDefaultStatusLists,
    capitalizeWords,
    toast,
    token,
  ]);

  const updateMediaListQuery = `
		mutation ($mediaId: Int, $hiddenFromStatusLists: Boolean, $customLists: [String]) {
			SaveMediaListEntry (mediaId: $mediaId, hiddenFromStatusLists: $hiddenFromStatusLists, customLists: $customLists) {
				id
				hiddenFromStatusLists
				customLists
			}
		}
	`;

  const updateEntry = useCallback(
    async (entry: MediaEntry): Promise<MutationResponse> => {
      const mutation = updateMediaListQuery;

      const updatedCustomLists = { ...entry.customLists, ...entry.lists! };

      const customListsToUpdate = Object.entries(updatedCustomLists)
        .filter(([, value]) => value === true)
        .map(([key]) => key);

      const variables = {
        mediaId: entry.media.id,
        hiddenFromStatusLists: hideDefaultStatusLists,
        customLists: customListsToUpdate,
      };

      try {
        const response = await fetchAniList(
          mutation,
          variables,
          token!,
          (retryCount) => {
            console.log(`Retry attempt ${retryCount} for entry update`);
            setRetryCountdown(60);
            setIsRateLimited(true);
            isPausedRef.current = true;
            setIsPaused(true);
            const countdownInterval = setInterval(() => {
              setRetryCountdown((prev) => {
                if (prev <= 1) {
                  clearInterval(countdownInterval);
                  isPausedRef.current = false;
                  setIsPaused(false);
                  setIsRateLimited(false);
                  return -1;
                }
                return prev - 1;
              });
            }, 1000);
          },
          (error: Error) => {
            toast.error(
              `Failed to update entry ${entry.media.title.romaji}: ${error.message}`,
            );
            if (error.message === "Max retries reached for rate limiting.") {
              isPausedRef.current = true;
              setIsPaused(true);
            }
          },
        );

        return response as MutationResponse;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Max retries reached for rate limiting."
        ) {
          toast.error(
            "Exceeded maximum retry attempts due to rate limiting. Update paused.",
          );
          setIsRateLimited(true);
        }
        throw error;
      }
    },
    [updateMediaListQuery, token, hideDefaultStatusLists, toast],
  );

  const removeEntryById = useCallback((id: number): void => {
    setMediaList((prevList) => prevList.filter((e) => e.media.id !== id));
  }, []);

  const handleAnimationEnd = useCallback(
    (id: number): void => {
      removeEntryById(id);
      setUpdatedEntries((prev) => new Set(prev).add(id));
    },
    [removeEntryById],
  );

  const startUpdate = useCallback(async () => {
    setUpdating(true);
    shouldPauseRef.current = false;

    const updateLoop = async () => {
      for (const entry of mediaList) {
        while (isPausedRef.current) {
          await delay(1000);
        }

        if (shouldPauseRef.current) break;

        setCurrentEntry(entry);
        try {
          await updateEntry(entry);
          setUpdatedEntries((prev) => new Set(prev).add(entry.media.id));
          await delay(1000);

          if (updatedEntries.size + 1 === totalEntries) {
            setDone(true);
            setUpdating(false);
            toast.success("All entries have been updated successfully!");
            break;
          }
        } catch (error) {
          console.error(`Error updating entry ${entry.media.id}:`, error);
          setUpdating(false);
          break;
        }
      }
    };

    updateProcessRef.current = updateLoop();
  }, [mediaList, updateEntry, updatedEntries.size, totalEntries, toast]);

  const toggleUpdate = useCallback(() => {
    if (updating) {
      shouldPauseRef.current = true;
      isPausedRef.current = true;
      setIsPaused(true);
      setUpdating(false);
      toast.info("Update process has been paused.");
    } else {
      if (!isRateLimited) {
        isPausedRef.current = false;
        setIsPaused(false);
        startUpdate();
        toast.info("Update process has started.");
      } else {
        toast.error("Cannot start update while rate limited.");
      }
    }
  }, [updating, startUpdate, isRateLimited, toast]);

  useEffect(() => {
    const token = getItemWithExpiry("anilistToken");
    if (token) {
      fetchMediaList();
    } else {
      toast.error("Anilist token not found in local storage");
    }
  }, [fetchMediaList, toast, token]);

  const handleFinish = () => {
    if (finishTimeoutRef.current) {
      clearTimeout(finishTimeoutRef.current);
    }
    const summary = {
      totalListsUpdated: lists.length,
      totalEntriesUpdated: updatedEntries.size,
    };
    setItemWithExpiry(
      "updateSummary",
      JSON.stringify(summary),
      60 * 60 * 24 * 1000,
    );
    router.push("/completed");
  };

  useEffect(() => {
    if (done) {
      finishTimeoutRef.current = setTimeout(() => {
        handleFinish();
      }, 3000);
    }
    return () => {
      if (finishTimeoutRef.current) {
        clearTimeout(finishTimeoutRef.current);
      }
    };
  }, [done]);

  const breadcrumbs = [
    { name: "Home", href: "/" },
    { name: "Custom List Manager", href: "/custom-list-manager" },
    { name: "Update", href: "/custom-list-manager/update" },
  ];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setPage((prevPage) => prevPage + 1);
        }
      },
      { threshold: 1.0 },
    );

    const target = document.querySelector("#load-more-trigger");
    if (target) observer.observe(target);

    return () => {
      if (target) observer.unobserve(target);
    };
  }, []);

  const currentEntries = mediaList.slice(0, page * itemsPerPage);

  return (
    <Layout>
      <Breadcrumbs breadcrumbs={breadcrumbs} />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="mx-auto w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-800/95 dark:shadow-2xl dark:shadow-blue-900/10">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-8 dark:from-blue-900/40 dark:to-indigo-900/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <motion.div
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="rounded-full bg-blue-100 p-3 text-blue-600 shadow-md dark:bg-blue-800 dark:text-blue-300"
                >
                  <FaPlay className="h-5 w-5" aria-hidden="true" />
                </motion.div>
                <div>
                  <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
                    🚀 Update Custom Lists
                  </CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-300">
                    Start updating your AniList with customized conditions. You
                    can pause or resume the update process at any time.
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="ml-4 mr-4 p-6">
            {/* Controls Section */}
            <motion.div
              className="flex flex-col items-center space-y-6"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
            >
              {/* Fetch Buttons */}
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  onClick={toggleUpdate}
                  disabled={done || isRateLimited}
                  className={`flex items-center space-x-3 rounded-full px-8 py-3 text-base font-medium text-white shadow-lg transition-all ${
                    isRateLimited
                      ? "bg-yellow-500 dark:bg-yellow-600"
                      : !updating && !isPaused && !done
                        ? "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
                        : !done
                          ? isPaused
                            ? "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                            : "bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700"
                          : "bg-gradient-to-r from-green-500 to-emerald-600"
                  }`}
                  aria-label={
                    done
                      ? "Update Complete"
                      : isRateLimited
                        ? "Rate limited. Please wait."
                        : !updating && !isPaused
                          ? "Start updating"
                          : isPaused
                            ? "Resume updating"
                            : "Pause updating"
                  }
                >
                  {done ? (
                    <>
                      <FaCheckCircle className="h-5 w-5" aria-hidden="true" />
                      <span>Update Complete</span>
                    </>
                  ) : isRateLimited ? (
                    <>
                      <FaPause className="h-5 w-5" aria-hidden="true" />
                      <span>Rate Limited ({retryCountdown}s)</span>
                    </>
                  ) : !updating && !isPaused ? (
                    <>
                      <FaPlay className="h-5 w-5" aria-hidden="true" />
                      <span>Start Update</span>
                    </>
                  ) : !done ? (
                    isPaused ? (
                      <>
                        <FaPlay className="h-5 w-5" aria-hidden="true" />
                        <span>Resume Update</span>
                      </>
                    ) : (
                      <>
                        <FaPause className="h-5 w-5" aria-hidden="true" />
                        <span>Pause Update</span>
                      </>
                    )
                  ) : null}
                </Button>
              </motion.div>

              <div className="w-full px-4">
                <div className="relative h-5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width:
                        totalEntries === 0
                          ? 0
                          : (updatedEntries.size / totalEntries) * 100 + "%",
                    }}
                    transition={{ duration: 0.5 }}
                    className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 shadow-[0_0_10px_rgba(79,70,229,0.3)]"
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <p className="text-gray-700 dark:text-gray-300">
                    {updatedEntries.size} / {totalEntries} Updated
                  </p>
                  <p className="font-medium text-indigo-600 dark:text-indigo-400">
                    {totalEntries === 0
                      ? "0%"
                      : Math.round((updatedEntries.size / totalEntries) * 100) +
                        "%"}
                  </p>
                </div>
              </div>

              {/* Only show currently updating if not done */}
              {currentEntry && !done && !isPaused && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="w-full rounded-lg border border-blue-100 bg-blue-50 p-4 shadow-inner dark:border-blue-900/30 dark:bg-blue-900/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 overflow-hidden rounded-md">
                      <Image
                        src={currentEntry.media.coverImage.extraLarge || ""}
                        alt={currentEntry.media.title.romaji}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Currently updating:
                      </p>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {currentEntry.media.title.romaji}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Only show the hiddenFromStatusLists note if not done */}
              <AnimatePresence>
                {showNotice && !done && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-6 flex items-center justify-between overflow-hidden rounded-lg bg-blue-50 px-4 py-3 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
                  >
                    <span>
                      Note: Media entries with{" "}
                      <strong>hiddenFromStatusLists</strong> set to true and not
                      associated with any custom lists will not be returned by
                      the query and will not be displayed here.
                    </span>
                    <button
                      onClick={() => setShowNotice(false)}
                      className="ml-3 flex-shrink-0 rounded-full p-1 text-blue-600 hover:bg-blue-200 hover:text-blue-800 dark:text-blue-400 dark:hover:bg-blue-800/30"
                      aria-label="Dismiss notice"
                    >
                      &times;
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex w-full justify-between">
                <motion.div whileHover={{ x: -3 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    variant="outline"
                    asChild
                    className="flex items-center border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700/70 dark:text-gray-300 dark:hover:bg-gray-600"
                    aria-label="Back to Custom List Manager"
                  >
                    <Link href="/custom-list-manager">
                      <span>Back</span>
                    </Link>
                  </Button>
                </motion.div>

                <motion.div whileHover={{ x: 3 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    onClick={handleFinish}
                    className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-md hover:from-purple-600 hover:to-indigo-700"
                    aria-label="Finish updating"
                  >
                    <span>Finish</span>
                  </Button>
                </motion.div>
              </div>
            </motion.div>

            {retryCountdown > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 flex items-center gap-3 rounded-lg bg-yellow-100 px-4 py-3 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
              >
                <div className="animate-pulse rounded-full bg-yellow-200 p-1 dark:bg-yellow-700">
                  <div className="h-2 w-2 rounded-full bg-yellow-500 dark:bg-yellow-300"></div>
                </div>
                <span>
                  Rate limit exceeded. Retrying in {retryCountdown - 1}{" "}
                  seconds...
                </span>
              </motion.div>
            )}

            {!done && (
              <div className="mt-8 space-y-6">
                {loading ? (
                  <motion.div
                    className="flex h-60 flex-col items-center justify-center gap-4 rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <LoadingIndicator size="lg" />
                    <p className="text-gray-600 dark:text-gray-400">
                      Loading your media list...
                    </p>
                  </motion.div>
                ) : (
                  currentEntries.length > 0 && (
                    <motion.div
                      variants={{
                        hidden: { opacity: 0 },
                        show: {
                          opacity: 1,
                          transition: {
                            staggerChildren: 0.1,
                          },
                        },
                      }}
                      initial="hidden"
                      animate="show"
                      className="space-y-6"
                    >
                      <AnimatePresence>
                        {currentEntries.map((entry) => (
                          <motion.div
                            key={entry.media.id}
                            whileHover={{
                              scale: 1.03,
                              boxShadow: "0 8px 32px rgba(80,80,200,0.12)",
                            }}
                            transition={{
                              type: "spring",
                              stiffness: 300,
                              damping: 20,
                            }}
                            tabIndex={0}
                            aria-label={`Media card for ${entry.media.title.romaji}`}
                            className="focus:outline-none"
                          >
                            <MediaCard
                              id={entry.media.id}
                              image={entry.media.coverImage.extraLarge || ""}
                              romajiTitle={entry.media.title.romaji}
                              englishTitle={entry.media.title.english || "N/A"}
                              status={entry.status}
                              score={entry.score}
                              repeatCount={entry.repeat}
                              customListChanges={Object.entries(entry.lists!)
                                .filter(
                                  ([list, value]) =>
                                    value !== undefined &&
                                    value !== entry.customLists[list],
                                )
                                .map(
                                  ([list, value]) =>
                                    `${list}: ${
                                      value ? "Add to list" : "Remove from list"
                                    }`,
                                )}
                              anilistLink={getMediaUrl(entry)}
                              isUpdated={updatedEntries.has(entry.media.id)}
                              onAnimationEnd={() =>
                                handleAnimationEnd(entry.media.id)
                              }
                            />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </motion.div>
                  )
                )}
              </div>
            )}

            {!loading && currentEntries.length === 0 && !done && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-10 flex flex-col items-center justify-center gap-3 py-10 text-center"
              >
                <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-700">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-10 w-10 text-gray-400 dark:text-gray-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-gray-900 dark:text-gray-100">
                  No entries to update
                </h3>
                <p className="max-w-md text-gray-600 dark:text-gray-400">
                  There are no entries that match your custom list conditions or
                  need updating.
                </p>
              </motion.div>
            )}

            <div id="load-more-trigger" className="h-10"></div>
          </CardContent>
        </Card>
      </motion.div>
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
