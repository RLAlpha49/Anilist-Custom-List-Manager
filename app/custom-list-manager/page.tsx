"use client";

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
// External Imports
import {
  memo,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FaArrowDown,
  FaEdit,
  FaExclamationTriangle,
  FaInfoCircle,
  FaPlus,
  FaTimesCircle,
  FaTrash,
} from "react-icons/fa";
import { toast } from "sonner";

import Breadcrumbs from "@/components/breadcrumbs";
import Layout from "@/components/layout";
import LoadingIndicator from "@/components/loading-indicator";
import { RenameModal } from "@/components/rename-modal";
import { SortableItem } from "@/components/sortable-item";
// Internal Imports
import { Checkbox } from "@/components/ui/checkbox";
import { DynamicSelect } from "@/components/ui/dynamic-select";
import Modal from "@/components/ui/modal";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/context/auth-context";
import { fetchAniList } from "@/lib/api";
import {
  getBooleanItemWithExpiry,
  getItemWithExpiry,
  getJsonItemWithExpiry,
  isStorageFallbackResult,
  setItemWithExpiry,
  STORAGE_KEYS,
  STORAGE_TTLS,
} from "@/lib/local-storage";
import {
  formatItemsAnime,
  formatItemsManga,
  hiddenFormatItemsManga,
  miscItemsAnime,
  miscItemsManga,
  scoreItems,
  statusItems,
  tagCategories,
  tags,
} from "@/lib/options";
import {
  AniListRequestVariables,
  ApiError,
  ApiResponse,
  CustomList,
  CustomListApiResponse,
  hasCustomListOptionsData,
  ListCondition,
  OptionGroup,
} from "@/lib/types";

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

function getFormatLabel(item: string): string {
  if (hiddenFormatItemsManga.includes(item.toLowerCase())) {
    const countryMap: Record<string, string> = {
      manga: "Manga (Japan)",
      manhwa: "Manga (South Korean)",
      manwha: "Manga (South Korean)",
      manhua: "Manga (Chinese)",
    };
    return `Format set to ${countryMap[item.toLowerCase()] ?? item}`;
  }
  return `Format set to ${item}`;
}

type MediaType = "ANIME" | "MANGA";

interface CachedListState {
  lists: CustomList[];
  originalSectionOrder: string[];
  dataLoaded: boolean;
  isListEmpty: boolean;
}

interface ListOptionsInputPayload {
  customLists?: string[];
  sectionOrder?: string[];
}

interface UpdateUserListOptionsVariables extends AniListRequestVariables {
  animeListOptions?: ListOptionsInputPayload;
  mangaListOptions?: ListOptionsInputPayload;
}

interface FetchUserCustomListsVariables extends AniListRequestVariables {
  userId: number;
}

const EMPTY_LIST_STATE: CachedListState = {
  lists: [],
  originalSectionOrder: [],
  dataLoaded: false,
  isListEmpty: true,
};

function ActionIconButton({
  ariaLabel,
  tooltip,
  onClick,
  className,
  style,
  children,
}: Readonly<{
  ariaLabel: string;
  tooltip: string;
  onClick: () => void;
  className: string;
  style: React.CSSProperties;
  children: ReactNode;
}>) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            onClick={onClick}
            className={`inline-flex shrink-0 items-center justify-center ${className}`}
            style={style}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const CustomListRow = memo(function CustomListRow({
  list,
  index,
  options,
  markedForRemoval,
  onUndoRemoveAll,
  onClearCondition,
  onValueChange,
  onOpenRename,
  onDelete,
  onRemoveAll,
}: Readonly<{
  list: CustomList;
  index: number;
  options: OptionGroup[];
  markedForRemoval: boolean;
  onUndoRemoveAll: (listName: string) => void;
  onClearCondition: (index: number) => void;
  onValueChange: (index: number, value: string) => void;
  onOpenRename: (list: CustomList) => void;
  onDelete: (name: string) => void;
  onRemoveAll: (list: CustomList) => void;
}>) {
  return (
    <SortableItem id={list.name}>
      <span className="font-semibold" style={{ color: "var(--z-text)" }}>
        {list.name}
      </span>

      {markedForRemoval ? (
        <span
          className="
            ml-2 inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-xs font-semibold
          "
          style={{
            backgroundColor: "var(--z-amber-dim)",
            color: "var(--z-amber)",
          }}
        >
          Will be removed from all entries{" "}
          <button
            type="button"
            aria-label="Undo remove from all entries"
            onClick={() => onUndoRemoveAll(list.name)}
            className="rounded-full p-0.5 transition-colors hover:brightness-110"
          >
            <FaTimesCircle className="size-3" />
          </button>
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <ActionIconButton
            ariaLabel="Clear condition"
            tooltip="Clear condition"
            onClick={() => onClearCondition(index)}
            className="
              size-8 rounded-full p-0 transition-all duration-150
              hover:bg-z-card-up
              active:scale-90
            "
            style={{ color: "var(--z-muted)" }}
          >
            <FaTimesCircle className="size-4" />
          </ActionIconButton>

          <div className="w-full min-w-48 sm:w-auto">
            <DynamicSelect
              value={list.selectedOption || ""}
              onValueChange={(value: string) => onValueChange(index, value)}
              options={options}
              placeholder="Select a condition"
              className="min-w-60"
            />
          </div>

          <ActionIconButton
            ariaLabel="Rename list"
            tooltip="Rename list"
            onClick={() => onOpenRename(list)}
            className="
              size-8 rounded-full p-0 transition-all duration-150
              hover:bg-z-amber-dim
              active:scale-90
            "
            style={{ color: "var(--z-amber)" }}
          >
            <FaEdit className="size-4" />
          </ActionIconButton>

          <ActionIconButton
            ariaLabel="Delete list"
            tooltip="Delete list"
            onClick={() => onDelete(list.name)}
            className="
              size-8 rounded-full p-0 transition-all duration-150
              hover:bg-[rgba(248,113,113,0.12)]
              active:scale-90
            "
            style={{ color: "var(--z-red)" }}
          >
            <FaTrash className="size-4" />
          </ActionIconButton>

          <ActionIconButton
            ariaLabel="Remove from all entries"
            tooltip="Remove from all entries"
            onClick={() => onRemoveAll(list)}
            className="
              size-8 rounded-full p-0 transition-all duration-150
              hover:bg-[rgba(34,211,238,0.12)]
              active:scale-90
            "
            style={{ color: "var(--z-frost)" }}
          >
            <FaTimesCircle className="size-4" />
          </ActionIconButton>
        </div>
      )}
    </SortableItem>
  );
});

function PageData() {
  const buildListOptionsVariables = useCallback(
    (
      type: MediaType,
      payload: ListOptionsInputPayload,
    ): UpdateUserListOptionsVariables => {
      if (type === "ANIME") {
        return { animeListOptions: payload };
      }

      return { mangaListOptions: payload };
    },
    [],
  );

  // State Hooks
  const [lists, setLists] = useState<CustomList[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [listType, setListType] = useState<MediaType>("ANIME");
  const [hideDefaultStatusLists, setHideDefaultStatusLists] = useState<boolean>(
    () =>
      getBooleanItemWithExpiry(
        STORAGE_KEYS.workflowHideDefaultStatusLists,
        true,
      ),
  );
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
  const [activeTab, setActiveTab] = useState<MediaType>("ANIME");
  const [listCache, setListCache] = useState<
    Record<MediaType, CachedListState>
  >({
    ANIME: EMPTY_LIST_STATE,
    MANGA: EMPTY_LIST_STATE,
  });
  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingDeleteList, setPendingDeleteList] = useState<CustomList | null>(
    null,
  );
  // Add list modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [addListError, setAddListError] = useState("");
  // Remove from all entries modal state
  const [showRemoveAllModal, setShowRemoveAllModal] = useState(false);
  const [pendingRemoveAllList, setPendingRemoveAllList] =
    useState<CustomList | null>(null);
  const [listsToRemoveFromAllEntries, setListsToRemoveFromAllEntries] =
    useState<string[]>(() =>
      getJsonItemWithExpiry<string[]>(
        STORAGE_KEYS.workflowListsToRemoveFromAllEntries,
        [],
      ),
    );

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
    // Remove the list from lists
    const updatedLists = lists.filter((list) => list.name !== listName);
    // Build the new customLists array
    const updatedCustomLists = updatedLists.map((list) => list.name);
    // Filter sectionOrder to only include names present in customLists
    const filteredSectionOrder = originalSectionOrder.filter((name) =>
      updatedCustomLists.includes(name),
    );

    setLists(updatedLists);
    setOriginalSectionOrder(filteredSectionOrder);

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

    const variables = buildListOptionsVariables(listType, {
      customLists: updatedCustomLists,
      sectionOrder: filteredSectionOrder,
    });

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
    async <
      TData,
      TVariables extends AniListRequestVariables = AniListRequestVariables,
    >(
      query: string,
      variables: TVariables,
    ): Promise<ApiResponse<TData>> => {
      const getAuthToken = (): string => {
        let authToken = token;
        if (!authToken) {
          authToken = getItemWithExpiry<string>(STORAGE_KEYS.authToken);
          if (!authToken) {
            throw new Error("Anilist token not found");
          }
        }
        return authToken;
      };

      const authToken = getAuthToken();
      return await fetchAniList<TData, TVariables>(query, variables, authToken);
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

      const variables = buildListOptionsVariables(listType, {
        sectionOrder: updatedOrder,
      });

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
    [buildListOptionsVariables, listType, fetchAniListData, toast],
  );

  useEffect(() => {
    updateSectionOrderRef.current = updateSectionOrder;
  }, [updateSectionOrder]);

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
        listType === "ANIME"
          ? STORAGE_KEYS.workflowConditionsAnime
          : STORAGE_KEYS.workflowConditionsManga,
        newConditions,
        STORAGE_TTLS.workflowCache,
      );
    }
  }, [lists, listType]);

  useEffect(() => {
    setItemWithExpiry(
      STORAGE_KEYS.workflowHideDefaultStatusLists,
      hideDefaultStatusLists,
      STORAGE_TTLS.workflowCache,
    );
  }, [hideDefaultStatusLists]);

  useEffect(() => {
    setListCache((prev) => ({
      ...prev,
      [listType]: {
        lists,
        originalSectionOrder,
        dataLoaded,
        isListEmpty,
      },
    }));
  }, [dataLoaded, isListEmpty, lists, listType, originalSectionOrder]);

  // Update when tab changes
  useEffect(() => {
    if (activeTab !== listType) {
      const cachedState = listCache[activeTab];
      setListType(activeTab);
      setLists(cachedState.lists);
      setOriginalSectionOrder(cachedState.originalSectionOrder);
      setDataLoaded(cachedState.dataLoaded);
      setIsListEmpty(cachedState.isListEmpty);
      setLoading(false);
    }
  }, [activeTab, listCache, listType]);

  const getDefaultOption = useCallback((listName: string): string | null => {
    const normalizedListName = listName.toLowerCase();
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

    if (
      normalizedListName.includes("manhwa") ||
      normalizedListName.includes("manwha")
    ) {
      return getFormatLabel("manhwa");
    }

    if (normalizedListName.includes("manhua")) {
      return getFormatLabel("manhua");
    }

    if (normalizedListName.includes("manga")) {
      return getFormatLabel("manga");
    }

    for (const item of allItems) {
      if (normalizedListName.includes(item.toLowerCase())) {
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
          return getFormatLabel(item);
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
    async (type: MediaType): Promise<void> => {
      if (!userId) {
        toast.error("Error", {
          description: "User ID is not available.",
        });
        return;
      }
      setLoading(true);
      setIsListEmpty(true);

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
      if (!userId) {
        throw new TypeError("Invalid AniList user ID.");
      }

      const variables: FetchUserCustomListsVariables = {
        userId,
      };

      try {
        let authToken = token;
        if (!authToken) {
          authToken = getItemWithExpiry<string>(STORAGE_KEYS.authToken);
          if (!authToken) {
            throw new Error("Anilist token not found");
          }
        }
        const response = await fetchAniList<
          CustomListApiResponse["data"],
          FetchUserCustomListsVariables
        >(query, variables, authToken);
        const listKey = `${type.toLowerCase()}List`;
        if (!hasCustomListOptionsData(response.data, listKey)) {
          throw new Error(
            "AniList returned an unexpected custom list payload.",
          );
        }

        const listOptions = response.data.User.mediaListOptions[listKey];
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
    const writeResults = [
      setItemWithExpiry(
        STORAGE_KEYS.workflowLists,
        lists.map((list) => ({
          name: list.name,
          selectedOption: list.selectedOption,
        })),
        STORAGE_TTLS.workflowCache,
      ),
      setItemWithExpiry(
        STORAGE_KEYS.workflowListsToRemoveFromAllEntries,
        listsToRemoveFromAllEntries,
        STORAGE_TTLS.workflowCache,
      ),
      setItemWithExpiry(
        STORAGE_KEYS.workflowListType,
        listType,
        STORAGE_TTLS.workflowCache,
      ),
      setItemWithExpiry(
        STORAGE_KEYS.workflowHideDefaultStatusLists,
        hideDefaultStatusLists,
        STORAGE_TTLS.workflowCache,
      ),
    ];

    if (writeResults.some(isStorageFallbackResult)) {
      toast.warning("Using temporary storage fallback", {
        description:
          "Some data could not be persisted to browser storage. Continuing with in-memory fallback for this tab.",
      });
    }

    router.push("/custom-list-manager/update");
  };

  const openRenameModal = useCallback((list: CustomList): void => {
    setCurrentEditList(list);
    setShowRenameModal(true);
  }, []);

  const handleDeleteList = useCallback(
    (name: string) => {
      const list = lists.find((l) => l.name === name) || null;
      setPendingDeleteList(list);
      setShowDeleteModal(true);
    },
    [lists],
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

      const variables = buildListOptionsVariables(listType, {
        customLists: lists.map((l) =>
          l.name === list.name ? trimmedName : l.name,
        ),
        sectionOrder: originalSectionOrder.map((name) =>
          name === list.name ? trimmedName : name,
        ),
      });

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
    [
      buildListOptionsVariables,
      lists,
      listType,
      fetchAniListData,
      toast,
      originalSectionOrder,
    ],
  );

  const addNewList = useCallback(() => {
    setNewListName("");
    setAddListError("");
    setShowAddModal(true);
  }, []);

  const handleAddListConfirm = async () => {
    const trimmedName = newListName.trim();
    if (!trimmedName) {
      setAddListError("List name cannot be empty.");
      return;
    }
    const duplicate = lists.some(
      (list) => list.name.toLowerCase() === trimmedName.toLowerCase(),
    );
    if (duplicate) {
      setAddListError("A list with this name already exists.");
      return;
    }

    const updatedLists = [
      ...lists,
      {
        name: trimmedName,
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

    const variables = buildListOptionsVariables(listType, {
      customLists: updatedLists.map((list) => list.name),
    });

    try {
      await fetchAniListData<
        CustomListApiResponse["data"],
        UpdateUserListOptionsVariables
      >(query, variables);
      toast.success("Success", {
        description: `New list "${trimmedName}" added successfully.`,
      });
      setShowAddModal(false);
      setNewListName("");
      setAddListError("");
    } catch (error) {
      const apiError = error as ApiError;
      console.error("Error adding new list:", apiError.message);
      setAddListError(apiError.message || "Failed to add new list.");
    }
  };

  // Remove from all entries logic
  const handleRemoveAllClick = useCallback((list: CustomList) => {
    setPendingRemoveAllList(list);
    setShowRemoveAllModal(true);
  }, []);

  // Undo remove from all entries
  const handleUndoRemoveAll = useCallback((listName: string) => {
    setListsToRemoveFromAllEntries((prev) =>
      prev.filter((name) => name !== listName),
    );
  }, []);

  const handleRemoveAllConfirm = useCallback(() => {
    if (pendingRemoveAllList) {
      setListsToRemoveFromAllEntries((prev) => {
        if (!prev.includes(pendingRemoveAllList.name)) {
          return [...prev, pendingRemoveAllList.name];
        }
        return prev;
      });
      setShowRemoveAllModal(false);
      setPendingRemoveAllList(null);
    }
  }, [pendingRemoveAllList]);

  const handleRemoveAllCancel = useCallback(() => {
    setShowRemoveAllModal(false);
    setPendingRemoveAllList(null);
  }, []);

  const listOptions = useMemo(
    () => getOptions(listType),
    [getOptions, listType],
  );

  const renderedListRows = useMemo(
    () =>
      lists.map((list, index) => (
        <CustomListRow
          key={list.name}
          list={list}
          index={index}
          options={listOptions}
          markedForRemoval={listsToRemoveFromAllEntries.includes(list.name)}
          onUndoRemoveAll={handleUndoRemoveAll}
          onClearCondition={handleClearCondition}
          onValueChange={handleValueChange}
          onOpenRename={openRenameModal}
          onDelete={handleDeleteList}
          onRemoveAll={handleRemoveAllClick}
        />
      )),
    [
      handleClearCondition,
      handleDeleteList,
      handleRemoveAllClick,
      handleUndoRemoveAll,
      handleValueChange,
      listOptions,
      lists,
      listsToRemoveFromAllEntries,
      openRenameModal,
    ],
  );

  function renderEmptyContent() {
    if (!dataLoaded) {
      return (
        <motion.div
          key={activeTab + "-empty"}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div
            className="mb-4 rounded-full p-4"
            style={{
              backgroundColor: "var(--z-amber-dim)",
              color: "var(--z-amber)",
            }}
          >
            <motion.div
              animate={{ rotateY: [0, 180, 360] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
            >
              <FaArrowDown className="size-8" />
            </motion.div>
          </div>
          <h3
            className="mb-2 text-lg font-bold"
            style={{ color: "var(--z-text)" }}
          >
            No Lists Loaded
          </h3>
          <p
            className="mb-6 max-w-md text-sm"
            style={{ color: "var(--z-muted)" }}
          >
            Click{" "}
            <span className="font-semibold" style={{ color: "var(--z-amber)" }}>
              Fetch Lists
            </span>{" "}
            to load your {activeTab.toLowerCase()} lists from AniList.
          </p>
          <button
            onClick={() => fetchLists(activeTab)}
            aria-label="Fetch lists"
            className="
              flex items-center gap-2 rounded-lg px-6 py-3 font-bold transition-all duration-200
              hover:brightness-110
              active:scale-95
            "
            style={{ backgroundColor: "var(--z-amber)", color: "#07060f" }}
          >
            <FaArrowDown className="size-4" />
            Fetch Lists
          </button>
        </motion.div>
      );
    }
    return (
      <motion.div
        key={activeTab + "-no-lists"}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <div
          className="mb-4 rounded-full p-4"
          style={{
            backgroundColor: "var(--z-amber-dim)",
            color: "var(--z-amber)",
          }}
        >
          <FaExclamationTriangle className="size-8" />
        </div>
        <h3
          className="mb-2 text-lg font-bold"
          style={{ color: "var(--z-text)" }}
        >
          No Lists Found
        </h3>
        <p
          className="mb-6 max-w-md text-sm"
          style={{ color: "var(--z-muted)" }}
        >
          You don&apos;t have any custom lists yet. Start by fetching your lists
          from AniList.
        </p>
        <button
          onClick={() => fetchLists(activeTab)}
          aria-label="Fetch lists"
          className="
            flex items-center gap-2 rounded-lg px-6 py-3 font-bold transition-all duration-200
            hover:brightness-110
            active:scale-95
          "
          style={{ backgroundColor: "var(--z-amber)", color: "#07060f" }}
        >
          <FaArrowDown className="size-4" />
          Fetch Lists
        </button>
      </motion.div>
    );
  }

  function renderListContent() {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <LoadingIndicator size="lg" />
          <p className="mt-4 text-sm" style={{ color: "var(--z-muted)" }}>
            Loading your custom lists...
          </p>
        </div>
      );
    }
    if (isListEmpty) {
      return renderEmptyContent();
    }
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
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
              <div className="space-y-3">{renderedListRows}</div>
            </SortableContext>
          </DndContext>
        </motion.div>
      </AnimatePresence>
    );
  }

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
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <p
            className="mb-2 text-xs font-semibold tracking-widest uppercase"
            style={{ color: "var(--z-amber)" }}
          >
            Step 2 of 3 — Custom Lists
          </p>
          <div className="flex items-start justify-between gap-4">
            <h1
              className="text-3xl font-black"
              style={{
                fontFamily: "var(--font-syne-var)",
                color: "var(--z-text)",
              }}
            >
              Your Custom Lists
            </h1>
            <Sheet>
              <SheetTrigger asChild>
                <button
                  aria-label="Open help panel"
                  className="
                    flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium
                    transition-all duration-200
                    hover:bg-z-card-up hover:text-z-text
                    active:scale-95
                  "
                  style={{
                    border: "1px solid var(--z-border-mid)",
                    color: "var(--z-muted)",
                  }}
                >
                  <FaInfoCircle className="size-4" />
                  Help
                </button>
              </SheetTrigger>
              <SheetContent
                style={{
                  backgroundColor: "var(--z-surface)",
                  borderLeft: "1px solid var(--z-border)",
                }}
              >
                <SheetHeader>
                  <div className="mb-2 flex items-center gap-2">
                    <FaInfoCircle
                      className="size-5"
                      style={{ color: "var(--z-amber)" }}
                    />
                    <SheetTitle
                      className="text-lg font-bold"
                      style={{
                        color: "var(--z-text)",
                        fontFamily: "var(--font-syne-var)",
                      }}
                    >
                      How to Use the Custom List Manager
                    </SheetTitle>
                  </div>
                  <SheetDescription style={{ color: "var(--z-muted)" }}>
                    Easily organize and manage your AniList custom lists with
                    these steps:
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-8 space-y-6">
                  <ol className="space-y-5">
                    {[
                      {
                        step: "1",
                        title: "Select Anime or Manga",
                        desc: "Switch between Anime and Manga lists using the tabs at the top.",
                      },
                      {
                        step: "2",
                        title: "Fetch Your Lists",
                        desc: "Click Fetch Lists to load your custom lists from AniList.",
                      },
                      {
                        step: "3",
                        title: "Drag to Reorder",
                        desc: "Drag and drop lists to change their order. The new order is saved automatically.",
                      },
                      {
                        step: "4",
                        title: "Set Conditions",
                        desc: "Choose conditions for each list to control how entries are sorted and filtered.",
                      },
                      {
                        step: "5",
                        title: "Add, Rename, or Delete Lists",
                        desc: "Use the buttons to add new lists, rename, or delete existing ones.",
                      },
                    ].map(({ step, title, desc }) => (
                      <li key={step} className="flex items-start gap-3">
                        <span
                          className="
                            flex size-8 shrink-0 items-center justify-center rounded-full text-sm
                            font-bold
                          "
                          style={{
                            backgroundColor: "var(--z-amber-dim)",
                            color: "var(--z-amber)",
                          }}
                        >
                          {step}
                        </span>
                        <div>
                          <span
                            className="font-semibold"
                            style={{ color: "var(--z-text)" }}
                          >
                            {title}
                          </span>
                          <p
                            className="text-sm"
                            style={{ color: "var(--z-muted)" }}
                          >
                            {desc}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div
                    className="rounded-lg p-4"
                    style={{
                      backgroundColor: "var(--z-amber-dim)",
                      border: "1px solid var(--z-border)",
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <FaInfoCircle
                        className="mt-0.5 size-5 shrink-0"
                        style={{ color: "var(--z-amber)" }}
                      />
                      <div>
                        <span
                          className="font-semibold"
                          style={{ color: "var(--z-amber)" }}
                        >
                          Tips:
                        </span>
                        <ul
                          className="mt-1 list-disc space-y-1 pl-5 text-sm"
                          style={{ color: "var(--z-text)" }}
                        >
                          <li>
                            You can hide default status lists using the checkbox
                            below the toolbar.
                          </li>
                          <li>
                            Click <span className="font-medium">Next</span> to
                            proceed to updating your lists after setting
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
        </motion.div>

        {/* Anime / Manga Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-6"
        >
          <Tabs
            defaultValue="ANIME"
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "ANIME" | "MANGA")}
            className="w-full"
          >
            <TabsList
              className="grid w-full grid-cols-2"
              style={{
                backgroundColor: "var(--z-card)",
                border: "1px solid var(--z-border)",
              }}
            >
              <TabsTrigger
                value="ANIME"
                className="rounded-md font-semibold data-[state=active]:font-bold"
                style={{ color: "var(--z-muted)" }}
              >
                Anime Lists
              </TabsTrigger>
              <TabsTrigger
                value="MANGA"
                className="rounded-md font-semibold data-[state=active]:font-bold"
                style={{ color: "var(--z-muted)" }}
              >
                Manga Lists
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </motion.div>

        {/* Toolbar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6 space-y-4"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => fetchLists(activeTab)}
                aria-label="Fetch lists from AniList"
                className="
                  flex items-center gap-2 rounded-lg px-5 py-2.5 font-bold transition-all
                  duration-200
                  hover:brightness-110
                  active:scale-95
                "
                style={{ backgroundColor: "var(--z-amber)", color: "#07060f" }}
              >
                <FaArrowDown className="size-4" />
                {dataLoaded ? "Fetch Lists" : "Click to Fetch Lists"}
              </button>
              {!isListEmpty && (
                <button
                  onClick={addNewList}
                  aria-label="Add new list"
                  className="
                    flex cursor-pointer items-center gap-2 rounded-lg px-5 py-2.5 font-semibold
                    transition-all duration-200
                    hover:bg-z-card-high
                    active:scale-95
                  "
                  style={{
                    backgroundColor: "var(--z-card)",
                    border: "1px solid var(--z-border-mid)",
                    color: "var(--z-text)",
                  }}
                >
                  <FaPlus
                    className="size-4"
                    style={{ color: "var(--z-amber)" }}
                  />
                  Add New List
                </button>
              )}
            </div>
          </div>
          {!isListEmpty && (
            <div
              className="flex items-center gap-3 rounded-lg p-3"
              style={{
                backgroundColor: "var(--z-card)",
                border: "1px solid var(--z-border)",
              }}
            >
              <Checkbox
                id="hideDefaultStatusLists"
                checked={hideDefaultStatusLists}
                onCheckedChange={(checked: boolean) =>
                  setHideDefaultStatusLists(checked)
                }
                className="size-5"
              />
              <label
                htmlFor="hideDefaultStatusLists"
                className="cursor-pointer text-sm font-medium"
                style={{ color: "var(--z-text)" }}
              >
                Hide Default Status Lists
              </label>
            </div>
          )}
        </motion.div>

        {/* Separator */}
        <div
          className="mb-6"
          style={{ borderTop: "1px solid var(--z-border)" }}
        />

        {/* List Content */}
        {renderListContent()}

        {/* List count */}
        {!isListEmpty && lists.length > 0 && (
          <div className="mt-6 flex justify-center">
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                backgroundColor: "var(--z-card)",
                border: "1px solid var(--z-border)",
                color: "var(--z-muted)",
              }}
            >
              {lists.length} {lists.length === 1 ? "list" : "lists"}
            </span>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-10 flex justify-between">
          <button
            aria-label="Back to login page"
            onClick={() => router.push("/anilist-login")}
            className="
              cursor-pointer rounded-lg px-4 py-2 font-medium transition-all duration-200
              hover:bg-z-card-up hover:text-z-text
              active:scale-95
            "
            style={{
              border: "1px solid var(--z-border-mid)",
              color: "var(--z-muted)",
            }}
          >
            Back
          </button>
          <button
            aria-label="Proceed to update step"
            onClick={confirmAndNavigate}
            disabled={
              !dataLoaded ||
              isListEmpty ||
              lists.filter((list) => list.selectedOption).length === 0
            }
            className="
              rounded-lg px-6 py-3 font-bold transition-all duration-200
              hover:brightness-110
              active:scale-95
              disabled:cursor-not-allowed disabled:opacity-40
            "
            style={{ backgroundColor: "var(--z-amber)", color: "#07060f" }}
          >
            Next
          </button>
        </div>
      </div>

      {/* Confirm Popup Modal */}
      <Modal
        isOpen={showPopup}
        onClose={() => setShowPopup(false)}
        onConfirm={proceedToNextStep}
        title="Confirm Selected Lists"
        confirmButtonText="Continue to Update"
      >
        <div className="space-y-4">
          <div
            className="rounded-lg p-3"
            style={{
              backgroundColor: "var(--z-amber-dim)",
              border: "1px solid var(--z-border)",
            }}
          >
            <p
              className="text-sm font-medium"
              style={{ color: "var(--z-amber)" }}
            >
              You&apos;re about to update{" "}
              {lists.filter((list) => list.selectedOption).length} custom lists
            </p>
          </div>
          {listsToRemoveFromAllEntries.length > 0 && (
            <div
              className="rounded-lg p-3"
              style={{
                backgroundColor: "var(--z-card)",
                border: "1px solid var(--z-border)",
              }}
            >
              <p
                className="mb-2 text-sm font-semibold"
                style={{ color: "var(--z-frost)" }}
              >
                The following lists will be removed from all entries:
              </p>
              <ul className="ml-4 list-disc space-y-1">
                {listsToRemoveFromAllEntries.map((name) => {
                  const selected = lists.find(
                    (l) => l.name === name && l.selectedOption,
                  );
                  return (
                    <li
                      key={name}
                      className="text-sm"
                      style={{ color: "var(--z-text)" }}
                    >
                      <span className="font-bold">{name}</span>
                      {!selected && (
                        <span
                          className="ml-2 italic"
                          style={{ color: "var(--z-muted)" }}
                        >
                          All entries will be removed from this list.
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="overflow-visible pr-1">
            <motion.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-2"
            >
              {lists
                .filter((list) => list.selectedOption)
                .map((list) => (
                  <motion.li
                    key={list.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg p-3"
                    style={{
                      backgroundColor: "var(--z-card-up)",
                      border: "1px solid var(--z-border)",
                    }}
                  >
                    <div className="flex flex-col space-y-1">
                      <span
                        className="font-semibold"
                        style={{ color: "var(--z-text)" }}
                      >
                        {list.name}
                        {listsToRemoveFromAllEntries.includes(list.name) && (
                          <span
                            className="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold"
                            style={{
                              backgroundColor: "var(--z-amber-dim)",
                              color: "var(--z-amber)",
                            }}
                          >
                            Will be removed from all entries
                          </span>
                        )}
                      </span>
                      <span
                        className="text-sm"
                        style={{ color: "var(--z-muted)" }}
                      >
                        {list.selectedOption}
                      </span>
                    </div>
                  </motion.li>
                ))}
            </motion.ul>
          </div>
          <div
            className="rounded-lg p-3"
            style={{
              backgroundColor: "var(--z-amber-dim)",
              border: "1px solid var(--z-border)",
            }}
          >
            <div className="flex items-start gap-2">
              <FaInfoCircle
                className="mt-0.5 size-4 shrink-0"
                style={{ color: "var(--z-amber)" }}
              />
              <span className="text-sm" style={{ color: "var(--z-text)" }}>
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
        currentListName={currentEditList?.name ?? ""}
        onRename={async (newName: string) => {
          if (currentEditList) {
            await handleRenameList(currentEditList, newName);
          }
        }}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={async () => {
          if (pendingDeleteList) {
            await handleDelete(pendingDeleteList.name);
            setPendingDeleteList(null);
            setShowDeleteModal(false);
          }
        }}
        title="Delete Custom List?"
        confirmButtonText="Delete"
        variant="danger"
      >
        <div className="space-y-4">
          <div
            className="rounded-lg p-3"
            style={{
              backgroundColor: "rgba(248,113,113,0.1)",
              border: "1px solid rgba(248,113,113,0.2)",
            }}
          >
            <p
              className="text-sm font-medium"
              style={{ color: "var(--z-red)" }}
            >
              Are you sure you want to delete the custom list{" "}
              <span className="font-bold">{pendingDeleteList?.name}</span>?
            </p>
          </div>
          <div
            className="rounded-lg p-3"
            style={{
              backgroundColor: "var(--z-card)",
              border: "1px solid var(--z-border)",
            }}
          >
            <p className="text-sm" style={{ color: "var(--z-muted)" }}>
              Note: Deleting a custom list only removes it from your list
              structure. Any entries previously associated with this list will
              still retain the association. If you add a new list with the same
              name, those entries will reappear in the list.
            </p>
          </div>
        </div>
      </Modal>

      {/* Add List Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onConfirm={handleAddListConfirm}
        title="Add New Custom List"
        confirmButtonText="Add"
      >
        <div className="space-y-4">
          <input
            type="text"
            className="w-full rounded-lg px-3 py-2 focus:outline-none"
            style={{
              backgroundColor: "var(--z-surface)",
              border: "1px solid var(--z-border)",
              color: "var(--z-text)",
            }}
            placeholder="Enter new list name"
            value={newListName}
            onChange={(e) => {
              setNewListName(e.target.value);
              setAddListError("");
            }}
            autoFocus
            maxLength={50}
            aria-label="New list name"
          />
          {addListError && (
            <div
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                backgroundColor: "rgba(248,113,113,0.1)",
                color: "var(--z-red)",
              }}
            >
              {addListError}
            </div>
          )}
        </div>
      </Modal>

      {/* Remove from All Entries Modal */}
      <Modal
        isOpen={showRemoveAllModal}
        onClose={handleRemoveAllCancel}
        onConfirm={handleRemoveAllConfirm}
        title="Remove List from All Entries?"
        confirmButtonText="Remove"
        variant="danger"
      >
        <div className="space-y-4">
          <div
            className="rounded-lg p-3"
            style={{
              backgroundColor: "var(--z-card)",
              border: "1px solid var(--z-border)",
            }}
          >
            <p className="text-sm" style={{ color: "var(--z-muted)" }}>
              Are you sure you want to remove the list{" "}
              <span className="font-bold" style={{ color: "var(--z-text)" }}>
                {pendingRemoveAllList?.name}
              </span>{" "}
              from all entries? This will not delete the list itself, but will
              remove it from every entry that currently has it during the next
              update.
            </p>
          </div>
        </div>
      </Modal>
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
