"use client";

import React from "react";
import Layout from "@/components/layout";
import { toast } from "sonner";

// External Imports
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  Suspense,
} from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaSort,
  FaArrowDown,
  FaPlus,
  FaTrash,
  FaEdit,
  FaExclamationTriangle,
  FaInfoCircle,
  FaTimesCircle,
} from "react-icons/fa";

// Internal Imports
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useRouter } from "next/navigation";
import LoadingIndicator from "@/components/loading-indicator";
import { DynamicSelect } from "@/components/ui/dynamic-select";
import { SortableItem } from "@/components/sortable-item";
import {
  statusItems,
  scoreItems,
  miscItemsAnime,
  miscItemsManga,
  formatItemsAnime,
  formatItemsManga,
  hiddenFormatItemsManga,
  tagCategories,
  tags,
} from "@/lib/options";
import { fetchAniList } from "@/lib/api";
import { setItemWithExpiry, getItemWithExpiry } from "@/lib/local-storage";
import { useAuth } from "@/context/auth-context";
import Modal from "@/components/ui/modal";
import { RenameModal } from "@/components/rename-modal";
import Breadcrumbs from "@/components/breadcrumbs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  ApiError,
  ListCondition,
  CustomList,
  OptionGroup,
  CustomListApiResponse,
} from "@/lib/types";

// Animation variants
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.4 } },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

function PageData() {
  // State Hooks
  const [lists, setLists] = useState<CustomList[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [listType, setListType] = useState<"ANIME" | "MANGA">("ANIME");
  const [hideDefaultStatusLists, setHideDefaultStatusLists] =
    useState<boolean>(true);
  const [showPopup, setShowPopup] = useState<boolean>(false);
  const [isListEmpty, setIsListEmpty] = useState<boolean>(true);
  const [dataLoaded, setDataLoaded] = useState<boolean>(false);
  const [showRenameModal, setShowRenameModal] = useState<boolean>(false);
  const [currentEditList, setCurrentEditList] = useState<CustomList | null>(
    null,
  );
  const [originalSectionOrder, setOriginalSectionOrder] = useState<string[]>(
    [],
  );
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"ANIME" | "MANGA">("ANIME");

  // Ref Hooks
  const updateSectionOrderRef =
    useRef<(newOrder: string[]) => Promise<void> | null>(null);

  // Other Hooks
  const router = useRouter();
  const { token, userId } = useAuth();

  // Memoize handlers
  const handleClearCondition = useCallback((index: number) => {
    setLists((prev) => {
      const newLists = [...prev];
      newLists[index].selectedOption = "";
      return newLists;
    });
  }, []);

  const handleValueChange = useCallback((index: number, value: string) => {
    setLists((prev) => {
      const newLists = [...prev];
      newLists[index].selectedOption = value;
      return newLists;
    });
  }, []);

  const handleDelete = async (listName: string): Promise<void> => {
    const updatedLists = lists.filter((list) => list.name !== listName);
    setLists(updatedLists);

    const updatedSectionOrder = originalSectionOrder.filter(
      (name) => name !== listName,
    );
    setOriginalSectionOrder(updatedSectionOrder);

    const query = `
			mutation ($${listType.toLowerCase()}ListOptions: MediaListOptionsInput) {
				UpdateUser(${listType.toLowerCase()}ListOptions: $${listType.toLowerCase()}ListOptions) {
					mediaListOptions {
						${listType.toLowerCase()}List {
							customLists
							sectionOrder
						}
					}
				}
			}
		`;

    const variables = {
      [`${listType.toLowerCase()}ListOptions`]: {
        customLists: updatedLists.map((list) => list.name),
        sectionOrder: updatedSectionOrder,
      },
    };

    try {
      await fetchAniListData(query, variables);
      toast.success("Deleted", {
        description: `"${listName}" has been deleted and updated successfully.`,
      });
    } catch (error) {
      const apiError = error as ApiError;
      console.error("Error deleting list:", apiError);
      toast.error("Error", {
        description: apiError.message || "Failed to delete list.",
      });
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const fetchAniListData = useCallback(
    async (
      query: string,
      variables: Record<string, unknown>,
    ): Promise<unknown> => {
      const getAuthToken = (): string => {
        let authToken = token;
        if (!authToken) {
          authToken = getItemWithExpiry("anilistToken");
          if (!authToken) {
            throw new Error("Anilist token not found");
          }
        }
        return authToken;
      };

      const authToken = getAuthToken();
      return await fetchAniList(query, variables, authToken);
    },
    [token],
  );

  const updateSectionOrder = useCallback(
    async (updatedOrder: string[]): Promise<void> => {
      const query = `
				mutation ($${listType.toLowerCase()}ListOptions: MediaListOptionsInput) {
					UpdateUser(${listType.toLowerCase()}ListOptions: $${listType.toLowerCase()}ListOptions) {
						mediaListOptions {
							${listType.toLowerCase()}List {
								sectionOrder
							}
						}
					}
				}
			`;

      const variables = {
        [`${listType.toLowerCase()}ListOptions`]: {
          sectionOrder: updatedOrder,
        },
      };

      try {
        await fetchAniListData(query, variables);
        toast.success("Success", {
          description: "List order updated successfully.",
        });
      } catch (error) {
        const apiError = error as ApiError;
        console.error("Error updating sectionOrder:", apiError.message);
        toast.error("Error", {
          description: apiError.message || "Failed to update list order.",
        });
      }
    },
    [listType, fetchAniListData, toast],
  );

  useEffect(() => {
    updateSectionOrderRef.current = updateSectionOrder;
  }, [updateSectionOrder]);

  function debounce<T extends unknown[]>(
    func: (...args: T) => void,
    wait: number,
  ): (...args: T) => void {
    let timeout: NodeJS.Timeout;
    return function (...args: T) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  const debounceUpdateSectionOrder = useMemo(
    () =>
      debounce((newOrder: string[]) => {
        if (updateSectionOrderRef.current) {
          void updateSectionOrderRef.current(newOrder);
        }
      }, 300),
    [],
  );

  useEffect(() => {
    if (lists.length > 0) {
      const newConditions: ListCondition[] = lists.map((list) => ({
        name: list.name,
        condition: list.selectedOption || "",
      }));
      setItemWithExpiry(
        listType === "ANIME" ? "conditionsAnime" : "conditionsManga",
        JSON.stringify(newConditions),
        60 * 60 * 24 * 1000,
      );
    }
  }, [lists, listType]);

  useEffect(() => {
    setItemWithExpiry(
      "hideDefaultStatusLists",
      hideDefaultStatusLists,
      60 * 60 * 24 * 1000,
    );
  }, [hideDefaultStatusLists]);

  // Update when tab changes
  useEffect(() => {
    if (activeTab !== listType) {
      setListType(activeTab);
      if (dataLoaded) {
        setDataLoaded(false);
        setLists([]);
        setIsListEmpty(true);
      }
    }
  }, [activeTab, listType, dataLoaded]);

  const getDefaultOption = useCallback((listName: string): string | null => {
    const allItems: string[] = [
      ...statusItems,
      ...scoreItems,
      ...miscItemsAnime,
      ...miscItemsManga,
      ...formatItemsAnime,
      ...formatItemsManga,
      ...hiddenFormatItemsManga,
      ...tagCategories,
      ...tags,
    ];

    if (listName.includes("<5")) {
      return `Score set to below 5`;
    }

    for (const item of allItems) {
      if (listName.toLowerCase().includes(item.toLowerCase())) {
        if (statusItems.includes(item)) {
          return `Status set to ${item}`;
        } else if (scoreItems.includes(item)) {
          return `Score set to ${item}`;
        } else if (miscItemsAnime.concat(miscItemsManga).includes(item)) {
          return item.charAt(0).toUpperCase() + item.slice(1);
        } else if (
          formatItemsAnime.includes(item) ||
          formatItemsManga.includes(item) ||
          hiddenFormatItemsManga.includes(item)
        ) {
          if (hiddenFormatItemsManga.includes(item.toLowerCase())) {
            const countryMap: Record<string, string> = {
              manga: "Manga (Japan)",
              manwha: "Manga (South Korean)",
              manhua: "Manga (Chinese)",
            };
            return `Format set to ${countryMap[item.toLowerCase()]}`;
          } else {
            return `Format set to ${item}`;
          }
        } else if (tagCategories.includes(item)) {
          return `Tag Categories contain ${item}`;
        } else if (tags.includes(item)) {
          return `Tags contain ${item}`;
        }
      }
    }
    return null;
  }, []);

  const getOptions = useCallback((type: "ANIME" | "MANGA"): OptionGroup[] => {
    const genres: string[] = [
      "Action",
      "Adventure",
      "Comedy",
      "Drama",
      "Ecchi",
      "Fantasy",
      "Horror",
      "Mahou Shoujo",
      "Mecha",
      "Music",
      "Mystery",
      "Psychological",
      "Romance",
      "Sci-Fi",
      "Slice Of Life",
      "Sports",
      "Supernatural",
      "Thriller",
      "Hentai",
    ];

    const createOptionObjects = (
      items: string[],
    ): { label: string; value: string }[] =>
      items.map((item) => ({ label: item, value: item }));

    let currentMiscItems: string[] = [];
    let currentFormatItems: string[] = [];

    if (type === "ANIME") {
      currentMiscItems = miscItemsAnime;
      currentFormatItems = formatItemsAnime;
    } else if (type === "MANGA") {
      currentMiscItems = miscItemsManga;
      currentFormatItems = formatItemsManga;
    }

    return [
      {
        label: "Status",
        items: createOptionObjects(
          statusItems.map((status) => `Status set to ${status}`),
        ),
      },
      {
        label: "Score",
        items: createOptionObjects(
          scoreItems.map((score) => `Score set to ${score}`),
        ),
      },
      {
        label: "Format",
        items: createOptionObjects(
          currentFormatItems.map((format) => `Format set to ${format}`),
        ),
      },
      {
        label: "Genres",
        items: createOptionObjects(
          genres.map((genre) => `Genres contain ${genre}`),
        ),
      },
      {
        label: "Tag Categories",
        items: createOptionObjects(
          tagCategories.map(
            (tagCategory) => `Tag Categories contain ${tagCategory}`,
          ),
        ),
      },
      {
        label: "Tags",
        items: createOptionObjects(tags.map((tag) => `Tags contain ${tag}`)),
      },
      {
        label: "Misc",
        items: createOptionObjects(currentMiscItems),
      },
    ];
  }, []);

  const fetchLists = useCallback(
    async (type: "ANIME" | "MANGA"): Promise<void> => {
      if (!userId) {
        toast.error("Error", {
          description: "User ID is not available.",
        });
        return;
      }
      setLoading(true);
      setIsListEmpty(true);
      setActiveTab(type);

      const query = `
				query ($userId: Int) {
					User(id: $userId) {
						mediaListOptions {
							${type.toLowerCase()}List {
								customLists
								sectionOrder
							}
						}
					}
				}
			`;
      const variables = { userId };

      try {
        let authToken = token;
        if (!authToken) {
          authToken = getItemWithExpiry("anilistToken");
          if (!authToken) {
            throw new Error("Anilist token not found");
          }
        }
        const rawResponse = await fetchAniList(query, variables, authToken);
        const response = rawResponse as CustomListApiResponse;
        const listOptions =
          response.data.User.mediaListOptions[`${type.toLowerCase()}List`];
        const fetchedCustomLists = listOptions.customLists;
        const fetchedSectionOrder = listOptions.sectionOrder;

        const updatedSectionOrder = [
          ...fetchedSectionOrder,
          ...fetchedCustomLists.filter(
            (name: string) => !fetchedSectionOrder.includes(name),
          ),
        ];

        setOriginalSectionOrder(updatedSectionOrder);

        const orderedCustomLists = updatedSectionOrder
          .filter((name) => fetchedCustomLists.includes(name))
          .map((name) => ({
            name,
            isCustomList: true,
            selectedOption: getDefaultOption(name),
          }));

        setListType(type);
        setLists(orderedCustomLists);
        setDataLoaded(true);
        setIsListEmpty(orderedCustomLists.length === 0);
        setLoading(false);
      } catch (error) {
        const apiError = error as ApiError;
        console.error("Error in fetchLists:", apiError.message);
        toast.error("Error", {
          description: apiError.message || "Failed to fetch lists.",
        });
        setLoading(false);
      }
    },
    [getDefaultOption, toast, token, userId],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent): void => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        setLists((items) => {
          const oldIndex = items.findIndex((item) => item.name === active.id);
          const newIndex = items.findIndex((item) => item.name === over.id);

          const newOrder = arrayMove(items, oldIndex, newIndex);

          const updatedCustomLists = newOrder.map((item) => item.name);

          // Fire-and-forget: debounce only the API call, not the UI update
          debounceUpdateSectionOrder(updatedCustomLists);

          return newOrder;
        });
      }
    },
    [debounceUpdateSectionOrder],
  );

  const confirmAndNavigate = (): void => {
    setShowPopup(true);
  };

  const proceedToNextStep = (): void => {
    setShowPopup(false);
    setItemWithExpiry(
      "lists",
      JSON.stringify(lists.filter((list) => list.selectedOption)),
      60 * 60 * 24 * 1000,
    );
    setItemWithExpiry("listType", listType, 60 * 60 * 24 * 1000);
    setItemWithExpiry("userId", userId?.toString() || "", 60 * 60 * 24 * 1000);
    setItemWithExpiry(
      "hideDefaultStatusLists",
      JSON.stringify(hideDefaultStatusLists),
      60 * 60 * 24 * 1000,
    );
    router.push("/custom-list-manager/update");
  };

  const openRenameModal = (list: CustomList): void => {
    setCurrentEditList(list);
    setShowRenameModal(true);
  };

  const handleDeleteList = useCallback(
    (name: string) => {
      handleDelete(name);
    },
    [handleDelete],
  );

  // Async function to handle the actual rename logic
  const handleRenameList = useCallback(
    async (list: CustomList, trimmedName: string): Promise<void> => {
      if (!list) return;

      const duplicate = lists.some(
        (l) =>
          l.name.toLowerCase() === trimmedName.toLowerCase() &&
          l.name !== list.name,
      );
      if (duplicate) {
        toast.error("Error", {
          description: "A list with this name already exists.",
        });
        return;
      }

      setLists((prevLists) =>
        prevLists.map((l) =>
          l.name === list.name ? { ...l, name: trimmedName } : l,
        ),
      );

      const query = `
        mutation ($${listType.toLowerCase()}ListOptions: MediaListOptionsInput) {
          UpdateUser(${listType.toLowerCase()}ListOptions: $${listType.toLowerCase()}ListOptions) {
            mediaListOptions {
              ${listType.toLowerCase()}List {
                customLists
                sectionOrder
              }
            }
          }
        }
      `;

      const variables = {
        [`${listType.toLowerCase()}ListOptions`]: {
          customLists: lists.map((l) =>
            l.name === list.name ? trimmedName : l.name,
          ),
          sectionOrder: originalSectionOrder.map((name) =>
            name === list.name ? trimmedName : name,
          ),
        },
      };

      try {
        await fetchAniListData(query, variables);
        toast.success("Success", {
          description: "List order updated successfully.",
        });
      } catch (error) {
        const apiError = error as ApiError;
        console.error("Error updating list names:", apiError.message);
        toast.error("Error", {
          description: apiError.message || "Failed to update list names.",
        });
      }

      setShowRenameModal(false);
    },
    [lists, listType, fetchAniListData, toast, originalSectionOrder],
  );

  const addNewList = async (): Promise<void> => {
    const newListName = prompt("Enter the name of the new custom list:");
    if (newListName && newListName.trim() !== "") {
      const duplicate = lists.some(
        (list) => list.name.toLowerCase() === newListName.trim().toLowerCase(),
      );
      if (duplicate) {
        toast.error("Error", {
          description: "A list with this name already exists.",
        });
        return;
      }

      const updatedLists = [
        ...lists,
        {
          name: newListName.trim(),
          isCustomList: true,
          selectedOption: "",
        },
      ];
      setLists(updatedLists);

      const query = `
				mutation ($${listType.toLowerCase()}ListOptions: MediaListOptionsInput) {
					UpdateUser(${listType.toLowerCase()}ListOptions: $${listType.toLowerCase()}ListOptions) {
						mediaListOptions {
							${listType.toLowerCase()}List {
								customLists
							}
						}
					}
				}
			`;

      const variables = {
        [`${listType.toLowerCase()}ListOptions`]: {
          customLists: updatedLists.map((list) => list.name),
        },
      };

      try {
        await fetchAniListData(query, variables);
        toast.success("Success", {
          description: `New list "${newListName}" added successfully.`,
        });
      } catch (error) {
        const apiError = error as ApiError;
        console.error("Error adding new list:", apiError.message);
        toast.error("Error", {
          description: apiError.message || "Failed to add new list.",
        });
      }
    } else {
      toast.error("Error", {
        description: "List name cannot be empty.",
      });
    }
  };

  const breadcrumbs = [
    { name: "Home", href: "/" },
    {
      name: "Custom List Manager",
      href: "/custom-list-manager",
    },
  ];

  return (
    <Layout>
      <Breadcrumbs breadcrumbs={breadcrumbs} />
      <div className="min-w-[80vw]">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="mx-auto w-full max-w-6xl px-4 py-8"
        >
          <Card className="overflow-hidden border-0 shadow-xl transition-all duration-300 dark:bg-gray-800">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-8 dark:from-blue-900/40 dark:to-indigo-900/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <motion.div
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="mr-3 rounded-full bg-blue-100 p-3 text-blue-600 shadow-md dark:bg-blue-800 dark:text-blue-300"
                  >
                    <FaSort className="h-6 w-6" aria-hidden="true" />
                  </motion.div>
                  <div>
                    <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
                      Custom List Manager
                    </CardTitle>
                    <CardDescription className="mt-1 text-gray-600 dark:text-gray-300">
                      Organize and manage your AniList entries effortlessly.
                    </CardDescription>
                  </div>
                </div>

                <Sheet>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      className="flex items-center gap-1 bg-white/90 shadow-sm backdrop-blur-sm dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
                    >
                      <FaInfoCircle className="mr-1 h-4 w-4" />
                      Help
                    </Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetHeader>
                      <div className="mb-2 flex items-center gap-2">
                        <FaInfoCircle className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                        <SheetTitle className="text-lg font-bold text-blue-700 dark:text-blue-300">
                          How to Use the Custom List Manager
                        </SheetTitle>
                      </div>
                      <SheetDescription>
                        Easily organize and manage your AniList custom lists
                        with these steps:
                      </SheetDescription>
                    </SheetHeader>
                    <div className="mt-8 space-y-6">
                      {/* Steps */}
                      <ol className="space-y-5">
                        <li className="flex items-start gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-600 dark:bg-blue-900 dark:text-blue-300">
                            1
                          </span>
                          <div>
                            <span className="font-semibold text-gray-900 dark:text-white">
                              Select Anime or Manga
                            </span>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              Switch between Anime and Manga lists using the
                              tabs at the top.
                            </p>
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-lg font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300">
                            2
                          </span>
                          <div>
                            <span className="font-semibold text-gray-900 dark:text-white">
                              Fetch Your Lists
                            </span>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              Click{" "}
                              <span className="font-medium text-blue-600 dark:text-blue-400">
                                Fetch Lists
                              </span>{" "}
                              to load your custom lists from AniList.
                            </p>
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-lg font-bold text-green-600 dark:bg-green-900 dark:text-green-300">
                            3
                          </span>
                          <div>
                            <span className="font-semibold text-gray-900 dark:text-white">
                              Drag to Reorder
                            </span>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              Drag and drop lists to change their order. The new
                              order is saved automatically.
                            </p>
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-lg font-bold text-purple-600 dark:bg-purple-900 dark:text-purple-300">
                            4
                          </span>
                          <div>
                            <span className="font-semibold text-gray-900 dark:text-white">
                              Set Conditions
                            </span>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              Choose conditions for each list to control how
                              entries are sorted and filtered.
                            </p>
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-100 text-lg font-bold text-yellow-600 dark:bg-yellow-900 dark:text-yellow-300">
                            5
                          </span>
                          <div>
                            <span className="font-semibold text-gray-900 dark:text-white">
                              Add, Rename, or Delete Lists
                            </span>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              Use the buttons to add new lists, rename, or
                              delete existing ones.
                            </p>
                          </div>
                        </li>
                      </ol>

                      {/* Tips Section */}
                      <div className="rounded-lg border-l-4 border-blue-400 bg-blue-50 p-4 dark:border-blue-600 dark:bg-blue-900/20">
                        <div className="flex items-start gap-2">
                          <FaInfoCircle className="mt-0.5 h-5 w-5 text-blue-500 dark:text-blue-400" />
                          <div>
                            <span className="font-semibold text-blue-700 dark:text-blue-300">
                              Tips:
                            </span>
                            <ul className="mt-1 list-disc pl-5 text-sm text-blue-800 dark:text-blue-200">
                              <li>
                                You can hide default status lists using the
                                checkbox below the search bar.
                              </li>
                              <li>
                                Click <span className="font-medium">Next</span>{" "}
                                to proceed to updating your lists after setting
                                conditions.
                              </li>
                              <li>
                                Hover over icons for tooltips describing their
                                actions.
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>

              <div className="mt-8">
                <Tabs
                  defaultValue="ANIME"
                  value={activeTab}
                  onValueChange={(v) => setActiveTab(v as "ANIME" | "MANGA")}
                  className="w-full"
                >
                  <TabsList className="mb-6 grid w-full grid-cols-2 bg-white/20 p-1 backdrop-blur-sm dark:bg-gray-700/50">
                    <TabsTrigger
                      value="ANIME"
                      className="relative overflow-hidden rounded-md py-3 font-medium text-gray-700 transition-all after:absolute after:bottom-0 after:left-0 after:h-[3px] after:w-full after:origin-left after:scale-x-0 after:bg-blue-500 after:transition-transform data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-md data-[state=active]:after:scale-x-100 dark:text-gray-200 dark:data-[state=active]:bg-gray-800 dark:data-[state=active]:text-blue-400"
                    >
                      Anime Lists
                    </TabsTrigger>
                    <TabsTrigger
                      value="MANGA"
                      className="relative overflow-hidden rounded-md py-3 font-medium text-gray-700 transition-all after:absolute after:bottom-0 after:left-0 after:h-[3px] after:w-full after:origin-left after:scale-x-0 after:bg-blue-500 after:transition-transform data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-md data-[state=active]:after:scale-x-100 dark:text-gray-200 dark:data-[state=active]:bg-gray-800 dark:data-[state=active]:text-blue-400"
                    >
                      Manga Lists
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              {/* Search and Controls */}
              <div className="mb-6 flex flex-col gap-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="relative w-full md:w-64">
                    <Command className="rounded-lg border border-gray-200 shadow-sm dark:border-gray-700">
                      <CommandInput
                        placeholder="Search lists..."
                        value={searchTerm}
                        onValueChange={setSearchTerm}
                        className="h-10"
                      />
                      {searchTerm && (
                        <CommandList>
                          <CommandEmpty>No lists found</CommandEmpty>
                          <CommandGroup>
                            {lists.map((list) => (
                              <CommandItem
                                key={list.name}
                                onSelect={() => setSearchTerm(list.name)}
                                className="cursor-pointer"
                              >
                                {list.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      )}
                    </Command>
                  </div>

                  <div className="flex gap-3">
                    <motion.div
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      transition={
                        !dataLoaded
                          ? {
                              duration: 2,
                              repeat: Infinity,
                              repeatType: "loop",
                            }
                          : {}
                      }
                    >
                      <Button
                        onClick={() => fetchLists(activeTab)}
                        className={`flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg ${!dataLoaded ? "ring-2 ring-blue-300 ring-offset-2 ring-offset-white dark:ring-blue-500 dark:ring-offset-gray-800" : ""}`}
                      >
                        <FaArrowDown className="h-4 w-4" />
                        {!dataLoaded ? "Click to Fetch Lists" : "Fetch Lists"}
                      </Button>
                    </motion.div>

                    {!isListEmpty && (
                      <motion.div
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <Button
                          onClick={addNewList}
                          className="flex items-center gap-2 bg-green-600 text-white shadow-md hover:bg-green-700 hover:shadow-lg"
                        >
                          <FaPlus className="h-4 w-4" />
                          Add New List
                        </Button>
                      </motion.div>
                    )}
                  </div>
                </div>

                {!isListEmpty && (
                  <div className="flex items-center space-x-2 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                    <Checkbox
                      id="hideDefaultStatusLists"
                      checked={hideDefaultStatusLists}
                      onCheckedChange={(checked: boolean) =>
                        setHideDefaultStatusLists(checked)
                      }
                      className="h-5 w-5"
                    />
                    <label
                      htmlFor="hideDefaultStatusLists"
                      className="text-sm font-medium text-gray-800 dark:text-gray-200"
                    >
                      Hide Default Status Lists
                    </label>
                  </div>
                )}
              </div>

              <Separator className="mb-6" />

              {/* List Content Section */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <LoadingIndicator size="lg" />
                  <p className="mt-4 text-gray-600 dark:text-gray-400">
                    Loading your custom lists...
                  </p>
                </div>
              ) : isListEmpty ? (
                <motion.div
                  key={activeTab + "-empty"}
                  initial="hidden"
                  animate="visible"
                  variants={fadeInUp}
                  className="flex flex-col items-center justify-center py-12 text-center"
                >
                  <div className="mb-4 rounded-full bg-blue-100 p-4 text-blue-500 shadow-inner dark:bg-blue-900/30 dark:text-blue-300">
                    {!dataLoaded ? (
                      <motion.div
                        animate={{ rotateY: [0, 180, 360] }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          repeatDelay: 1,
                        }}
                      >
                        <FaArrowDown className="h-8 w-8" />
                      </motion.div>
                    ) : (
                      <FaExclamationTriangle className="h-8 w-8" />
                    )}
                  </div>
                  <h3 className="mb-2 text-xl font-medium text-gray-900 dark:text-white">
                    {!dataLoaded ? "No Lists Loaded" : "No Lists Found"}
                  </h3>
                  <p className="mb-6 max-w-md text-gray-600 dark:text-gray-300">
                    {!dataLoaded ? (
                      <>
                        Click the{" "}
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          Fetch Lists
                        </span>{" "}
                        button to load your {activeTab.toLowerCase()} lists from
                        AniList.
                      </>
                    ) : (
                      "You don't have any custom lists yet. Start by fetching your lists from AniList."
                    )}
                  </p>
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Button
                      onClick={() => fetchLists(activeTab)}
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg"
                    >
                      <FaArrowDown className="mr-2 h-4 w-4" />
                      Fetch Lists
                    </Button>
                  </motion.div>
                </motion.div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    variants={staggerContainer}
                  >
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={lists.map((list) => list.name)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-4">
                          {lists.map((list, index) => (
                            <SortableItem key={list.name} id={list.name}>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {list.name}
                              </span>
                              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          handleClearCondition(index)
                                        }
                                        className="h-8 w-8 rounded-full p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
                                      >
                                        <FaTimesCircle className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Clear condition</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>

                                <div className="w-full min-w-48 sm:w-auto">
                                  <DynamicSelect
                                    value={list.selectedOption || ""}
                                    onValueChange={(value: string) =>
                                      handleValueChange(index, value)
                                    }
                                    options={getOptions(listType)}
                                    placeholder="Select a condition"
                                    className="min-w-[240px] shadow-sm"
                                  />
                                </div>

                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openRenameModal(list)}
                                        className="h-8 w-8 rounded-full p-0 text-yellow-500 hover:bg-yellow-50 hover:text-yellow-600 dark:text-yellow-400 dark:hover:bg-yellow-900/30 dark:hover:text-yellow-300"
                                      >
                                        <FaEdit className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Rename list</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>

                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          handleDeleteList(list.name)
                                        }
                                        className="h-8 w-8 rounded-full p-0 text-red-500 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-900/30 dark:hover:text-red-300"
                                      >
                                        <FaTrash className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Delete list</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </SortableItem>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </motion.div>
                </AnimatePresence>
              )}

              {/* Pagination or Note Section */}
              {!isListEmpty && lists.length > 0 && (
                <div className="mt-6 flex justify-center">
                  <p className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                    {lists.length} lists displayed
                  </p>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="mt-8 flex justify-between">
                <motion.div
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Button
                    variant="outline"
                    onClick={() => router.push("/anilist-login")}
                    className="flex items-center border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    Back
                  </Button>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Button
                    onClick={confirmAndNavigate}
                    className="flex items-center bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg"
                    disabled={
                      !dataLoaded ||
                      isListEmpty ||
                      lists.filter((list) => list.selectedOption).length === 0
                    }
                  >
                    Next
                  </Button>
                </motion.div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Confirmation Popup */}
      <Modal
        isOpen={showPopup}
        onClose={() => setShowPopup(false)}
        onConfirm={proceedToNextStep}
        title="Confirm Selected Lists"
        confirmButtonText="Continue to Update"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-900/20">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
              You&apos;re about to update{" "}
              {lists.filter((list) => list.selectedOption).length} custom lists
            </p>
          </div>

          <div className="overflow-visible">
            <div className="pr-6">
              <motion.ul
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: {
                      staggerChildren: 0.07,
                    },
                  },
                }}
                className="space-y-2"
              >
                {lists
                  .filter((list) => list.selectedOption)
                  .map((list) => (
                    <motion.li
                      key={list.name}
                      variants={{
                        hidden: { opacity: 0, y: 10 },
                        visible: { opacity: 1, y: 0 },
                      }}
                      className="rounded-md border border-gray-200 bg-white p-3 shadow-sm transition-colors dark:border-gray-700 dark:bg-gray-800"
                    >
                      <div className="flex flex-col space-y-1">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {list.name}
                        </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {list.selectedOption}
                        </span>
                      </div>
                    </motion.li>
                  ))}
              </motion.ul>
            </div>
          </div>

          <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-900/10">
            <div className="flex items-start">
              <FaInfoCircle className="mr-2 mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-500" />
              <span className="text-amber-800 dark:text-amber-300">
                After proceeding, changes will be applied to your AniList
                account.
              </span>
            </div>
          </div>
        </div>
      </Modal>

      {/* Rename Modal */}
      <RenameModal
        isOpen={showRenameModal}
        onClose={() => setShowRenameModal(false)}
        currentListName={currentEditList?.name || ""}
        onRename={async (newName: string) => {
          if (currentEditList) {
            await handleRenameList(currentEditList, newName);
          }
        }}
      />
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
