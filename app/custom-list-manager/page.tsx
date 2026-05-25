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
import * as DialogPrimitive from "@radix-ui/react-dialog";
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
  FaCopy,
  FaEdit,
  FaExclamationTriangle,
  FaEye,
  FaFolderOpen,
  FaInfoCircle,
  FaPlus,
  FaSave,
  FaSearch,
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
  computeEntryWorkflowUpdate,
  createEmptyRule,
  createEmptyRuleSet,
  estimateMatchesForListConfig,
  fetchAllWorkflowMediaEntries,
  getCurrentCustomLists,
  getMediaEntryTitle,
  hasActiveIncludeRules,
  normalizeCustomListRuleConfig,
  normalizeRuleSet,
  summarizeRuleSet,
  WORKFLOW_MEDIA_LIST_QUERY,
  type WorkflowMediaListQueryVariables,
} from "@/lib/custom-list-workflow";
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
  type AniListMediaType,
  AniListRequestVariables,
  ApiError,
  ApiResponse,
  CustomList,
  CustomListApiResponse,
  hasCustomListOptionsData,
  ListCondition,
  MediaEntry,
  MediaListResponse,
  OptionGroup,
  type WorkflowPreset,
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

type MediaType = AniListMediaType;

type PresetDialogMode = "save" | "duplicate";

interface ListMatchEstimate {
  name: string;
  totalMatches: number;
  sampleTitles: string[];
  summary: string;
  markedForRemoval: boolean;
  hasActiveRules: boolean;
}

interface MatchPreviewState {
  open: boolean;
  loading: boolean;
  entryCount: number;
  estimates: ListMatchEstimate[];
  error: string | null;
}

interface EntryPreviewState {
  open: boolean;
  loading: boolean;
  entries: MediaEntry[];
  query: string;
  selectedEntryId: number | null;
  error: string | null;
}

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

const getApiErrorMessageWithRequestId = (
  error: ApiError,
  fallbackMessage: string,
): string => {
  const baseMessage = error.message || fallbackMessage;
  const requestId =
    typeof error.metadata?.requestId === "string"
      ? error.metadata.requestId
      : null;

  if (!requestId) {
    return baseMessage;
  }

  return `${baseMessage} (Request ID: ${requestId})`;
};

const DEFAULT_TEMPLATE_PRESET: WorkflowPreset = {
  id: "built-in-default-template",
  name: "Default Template (Example)",
  mediaType: "ANIME",
  hideDefaultStatusLists: false,
  lists: [
    {
      name: "Watching",
      ruleSet: {
        operator: "ALL",
        rules: [
          {
            id: "tmpl-watching",
            condition: "Status set to Watching",
            polarity: "include",
          },
        ],
      },
      selectedOption: "Status set to Watching",
    },
    {
      name: "Completed",
      ruleSet: {
        operator: "ALL",
        rules: [
          {
            id: "tmpl-completed",
            condition: "Status set to Completed",
            polarity: "include",
          },
        ],
      },
      selectedOption: "Status set to Completed",
    },
    {
      name: "Dropped",
      ruleSet: {
        operator: "ALL",
        rules: [
          {
            id: "tmpl-dropped",
            condition: "Status set to Dropped",
            polarity: "include",
          },
        ],
      },
      selectedOption: "Status set to Dropped",
    },
    {
      name: "Paused",
      ruleSet: {
        operator: "ALL",
        rules: [
          {
            id: "tmpl-paused",
            condition: "Status set to Paused",
            polarity: "include",
          },
        ],
      },
      selectedOption: "Status set to Paused",
    },
    {
      name: "Planning",
      ruleSet: {
        operator: "ALL",
        rules: [
          {
            id: "tmpl-planning",
            condition: "Status set to Planning",
            polarity: "include",
          },
        ],
      },
      selectedOption: "Status set to Planning",
    },
    {
      name: "Rewatched",
      ruleSet: {
        operator: "ALL",
        rules: [
          { id: "tmpl-rewatched", condition: "Rewatched", polarity: "include" },
        ],
      },
      selectedOption: "Rewatched",
    },
    {
      name: "Movies",
      ruleSet: {
        operator: "ALL",
        rules: [
          {
            id: "tmpl-movies",
            condition: "Format set to Movie",
            polarity: "include",
          },
        ],
      },
      selectedOption: "Format set to Movie",
    },
    {
      name: "<5",
      ruleSet: {
        operator: "ALL",
        rules: [
          {
            id: "tmpl-below5",
            condition: "Score set to below 5",
            polarity: "include",
          },
        ],
      },
      selectedOption: "Score set to below 5",
    },
  ],
  listsToRemoveFromAllEntries: [],
  createdAt: 0,
  updatedAt: 0,
};

const EMPTY_LIST_STATE: CachedListState = {
  lists: [],
  originalSectionOrder: [],
  dataLoaded: false,
  isListEmpty: true,
};

const normalizeListStateItem = (list: CustomList): CustomList => {
  const normalized = normalizeCustomListRuleConfig(list);

  return {
    ...list,
    ruleSet: normalized.ruleSet,
    selectedOption: normalized.selectedOption,
  };
};

const createPresetId = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `preset-${slug || "custom-list"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

function useDesktopAutoFocus(isOpen: boolean): boolean {
  const [shouldAutoFocus, setShouldAutoFocus] = useState(false);

  useEffect(() => {
    if (!isOpen || globalThis.window === undefined) {
      setShouldAutoFocus(false);
      return;
    }

    const mediaQuery = globalThis.window.matchMedia(
      "(min-width: 768px) and (pointer: fine)",
    );

    const updateShouldAutoFocus = () => {
      setShouldAutoFocus(mediaQuery.matches);
    };

    updateShouldAutoFocus();

    mediaQuery.addEventListener("change", updateShouldAutoFocus);

    return () => {
      mediaQuery.removeEventListener("change", updateShouldAutoFocus);
    };
  }, [isOpen]);

  return shouldAutoFocus;
}

function CustomListManagerHelpModal({
  isOpen,
  onClose,
  onLoadDefaultTemplate,
}: Readonly<{
  isOpen: boolean;
  onClose: () => void;
  onLoadDefaultTemplate: () => void;
}>) {
  const [section, setSection] = useState<"guide" | "conditions" | "tips">(
    "guide",
  );

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AnimatePresence>
        {isOpen && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-50"
                style={{
                  backgroundColor: "rgba(7,6,15,0.88)",
                  backdropFilter: "blur(14px)",
                }}
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                onClick={(e) => {
                  if (e.target === e.currentTarget) onClose();
                }}
              >
                <div
                  className="relative flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden"
                  style={{
                    backgroundColor: "var(--z-surface)",
                    border: "1px solid var(--z-border-mid)",
                    borderRadius: "1rem",
                    boxShadow: "0 40px 100px rgba(0,0,0,0.7)",
                  }}
                >
                  {/* Modal header */}
                  <div
                    className="flex shrink-0 items-center justify-between px-7 pt-5 pb-4"
                    style={{
                      borderBottom: "1px solid var(--z-border)",
                      backgroundColor: "rgba(255,255,255,0.015)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <FaInfoCircle
                        className="size-5"
                        style={{ color: "var(--z-amber)" }}
                      />
                      <DialogPrimitive.Title
                        className="text-xl font-black"
                        style={{
                          color: "var(--z-text)",
                          fontFamily: "var(--font-syne-var)",
                        }}
                      >
                        Custom List Manager Guide
                      </DialogPrimitive.Title>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close guide"
                      className="
                        flex size-8 cursor-pointer items-center justify-center rounded-lg
                        transition-all duration-200
                        hover:bg-z-card-high
                        active:scale-90
                      "
                      style={{ color: "var(--z-muted)" }}
                    >
                      <FaTimesCircle size={15} />
                    </button>
                  </div>

                  {/* Section nav */}
                  <div className="shrink-0 px-7 pt-5">
                    <div
                      className="grid grid-cols-3 gap-1 rounded-lg p-1"
                      style={{
                        backgroundColor: "var(--z-card)",
                        border: "1px solid var(--z-border)",
                      }}
                    >
                      {(
                        [
                          { id: "guide", label: "Guide" },
                          { id: "conditions", label: "Conditions" },
                          { id: "tips", label: "Tips" },
                        ] as const
                      ).map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setSection(id)}
                          className="rounded-md py-1.5 text-xs font-semibold transition-all"
                          style={{
                            backgroundColor:
                              section === id ? "var(--z-amber)" : "transparent",
                            color:
                              section === id ? "#07060f" : "var(--z-muted)",
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 space-y-5 overflow-y-auto px-7 py-5 pb-8">
                    {/* ── GUIDE ── */}
                    {section === "guide" && (
                      <>
                        {/* 3-step overview */}
                        <div
                          className="rounded-lg p-4"
                          style={{
                            backgroundColor: "var(--z-card)",
                            border: "1px solid var(--z-border)",
                          }}
                        >
                          <p
                            className="mb-2 text-xs font-bold tracking-wider uppercase"
                            style={{ color: "var(--z-amber)" }}
                          >
                            3-Step Workflow
                          </p>
                          {[
                            {
                              n: "1",
                              label: "Login",
                              desc: "Connect your AniList account via OAuth.",
                            },
                            {
                              n: "2",
                              label: "Configure Lists",
                              desc: "Fetch your lists, set rules, and define conditions.",
                            },
                            {
                              n: "3",
                              label: "Update",
                              desc: "Apply changes — entries are sorted automatically.",
                            },
                          ].map(({ n, label, desc }) => (
                            <div
                              key={n}
                              className="mt-2 flex items-start gap-2"
                            >
                              <span
                                className="
                                  flex size-5 shrink-0 items-center justify-center rounded-full
                                  text-[10px] font-bold
                                "
                                style={{
                                  backgroundColor: "var(--z-amber-dim)",
                                  color: "var(--z-amber)",
                                }}
                              >
                                {n}
                              </span>
                              <p
                                className="text-xs"
                                style={{ color: "var(--z-muted)" }}
                              >
                                <span
                                  className="font-semibold"
                                  style={{ color: "var(--z-text)" }}
                                >
                                  {label} —{" "}
                                </span>
                                {desc}
                              </p>
                            </div>
                          ))}
                        </div>

                        {/* Detailed steps */}
                        <p
                          className="text-xs font-bold tracking-wider uppercase"
                          style={{ color: "var(--z-subtle)" }}
                        >
                          Detailed Steps
                        </p>
                        {[
                          {
                            num: "1",
                            title: "Select Anime or Manga",
                            body: "Use the Anime Lists / Manga Lists tabs to switch between your two list libraries. Rules are configured independently for each media type.",
                            example: null,
                          },
                          {
                            num: "2",
                            title: "Fetch Your Lists",
                            body: 'Click "Fetch Lists" to load your custom lists from AniList. This reads your current list names and section order. Refetch if you rename or add lists directly on AniList.',
                            example: null,
                          },
                          {
                            num: "3",
                            title: "Drag to Reorder",
                            body: "Grab any list row and drag it up or down. The new order is saved to AniList automatically after a short delay.",
                            example: null,
                          },
                          {
                            num: "4",
                            title: "Set Rules for Each List",
                            body: 'Each list can have multiple rules. Choose "Include" to add entries that match a condition, "Exclude" to block entries that match. "Match all" (AND) requires every include rule to pass. "Match any" (OR) requires at least one.',
                            example:
                              'Example: "Completed Movies" list → include "Status set to Completed" + include "Format set to Movie" with Match all.',
                          },
                          {
                            num: "5",
                            title: "Estimate Matches",
                            body: "Click \"Estimate Matches\" to preview how many entries from your library would match each list's rules before committing to an update. Sample titles confirm you're targeting the right entries.",
                            example: null,
                          },
                          {
                            num: "6",
                            title: "Preview Entry",
                            body: 'Click "Preview Entry" to search for a specific title or ID and see exactly which lists it would be added to or removed from based on your current rules — useful for edge-case checking.',
                            example: null,
                          },
                          {
                            num: "7",
                            title: "Save a Preset",
                            body: 'Click "Save Preset" to store your current rule configuration locally. Presets remember the media type, all list rules, visibility preferences, and remove-from-all selections. They are browser-local and not synced to AniList.',
                            example: null,
                          },
                          {
                            num: "8",
                            title: "Mark Lists for Removal",
                            body: 'Use the trash icon on any list and select "Remove from all entries". During the next update, every entry that has this list will have it removed. Useful when cleaning up old or reorganised lists.',
                            example: null,
                          },
                          {
                            num: "9",
                            title: "Proceed to Update",
                            body: 'Click "Next" to review a summary of what will change. The update page then processes your library entry by entry, respecting AniList rate limits automatically.',
                            example: null,
                          },
                        ].map(({ num, title, body, example }) => (
                          <div
                            key={num}
                            className="rounded-lg p-4"
                            style={{
                              backgroundColor: "var(--z-card-up)",
                              border: "1px solid var(--z-border)",
                            }}
                          >
                            <div className="mb-2 flex items-center gap-2">
                              <span
                                className="
                                  flex size-6 shrink-0 items-center justify-center rounded-full
                                  text-xs font-bold
                                "
                                style={{
                                  backgroundColor: "var(--z-amber-dim)",
                                  color: "var(--z-amber)",
                                }}
                              >
                                {num}
                              </span>
                              <span
                                className="text-sm font-semibold"
                                style={{ color: "var(--z-text)" }}
                              >
                                {title}
                              </span>
                            </div>
                            <p
                              className="text-xs/relaxed"
                              style={{ color: "var(--z-muted)" }}
                            >
                              {body}
                            </p>
                            {example && (
                              <p
                                className="mt-2 rounded-sm px-2 py-1.5 text-xs italic"
                                style={{
                                  backgroundColor: "var(--z-amber-dim)",
                                  color: "var(--z-amber)",
                                }}
                              >
                                {example}
                              </p>
                            )}
                          </div>
                        ))}

                        {/* Default Template */}
                        <div
                          className="rounded-lg p-4"
                          style={{
                            backgroundColor: "var(--z-card)",
                            border: "1px solid var(--z-border)",
                          }}
                        >
                          <p
                            className="mb-1 text-sm font-semibold"
                            style={{ color: "var(--z-text)" }}
                          >
                            Load Default Template
                          </p>
                          <p
                            className="mb-3 text-xs/relaxed"
                            style={{ color: "var(--z-muted)" }}
                          >
                            Not sure where to start? Load a sample preset with
                            common list rules (Watching, Completed, Movies, and
                            more) as a starting point. This adds it to your
                            local presets — your AniList lists are not changed
                            until you run an update.
                          </p>
                          <button
                            type="button"
                            onClick={onLoadDefaultTemplate}
                            className="
                              inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm
                              font-semibold transition-all
                              hover:brightness-110
                              active:scale-95
                            "
                            style={{
                              backgroundColor: "var(--z-amber)",
                              color: "#07060f",
                            }}
                          >
                            <FaFolderOpen className="size-4" />
                            Load Default Template
                          </button>
                        </div>
                      </>
                    )}

                    {/* ── CONDITIONS ── */}
                    {section === "conditions" && (
                      <div className="space-y-5">
                        <p
                          className="text-xs/relaxed"
                          style={{ color: "var(--z-muted)" }}
                        >
                          All condition values available for include and exclude
                          rules. Conditions are matched against each library
                          entry at update time.
                        </p>
                        {[
                          {
                            category: "Status",
                            accent: "var(--z-frost)",
                            bg: "rgba(103,193,245,0.08)",
                            conditions: [
                              {
                                label: "Status set to Watching",
                                desc: "Currently watching / reading",
                              },
                              {
                                label: "Status set to Completed",
                                desc: "Finished",
                              },
                              {
                                label: "Status set to Planning",
                                desc: "Plan to watch / read",
                              },
                              {
                                label: "Status set to Dropped",
                                desc: "Dropped",
                              },
                              {
                                label: "Status set to Paused",
                                desc: "Paused / on hold",
                              },
                              {
                                label: "Status set to Repeating",
                                desc: "Rewatching / rereading",
                              },
                            ],
                          },
                          {
                            category: "Score",
                            accent: "var(--z-amber)",
                            bg: "var(--z-amber-dim)",
                            conditions: [
                              {
                                label: "Score set to 10",
                                desc: "Exactly 10 — repeat for 1–9",
                              },
                              {
                                label: "Score set to below 5",
                                desc: "Score 1–4 (unscored = 0 is excluded)",
                              },
                            ],
                          },
                          {
                            category: "Format (Anime)",
                            accent: "var(--z-pink)",
                            bg: "rgba(236,72,153,0.08)",
                            conditions: [
                              { label: "Format set to TV", desc: "TV series" },
                              {
                                label: "Format set to Movie",
                                desc: "Feature films",
                              },
                              {
                                label: "Format set to OVA",
                                desc: "Original Video Animations",
                              },
                              {
                                label: "Format set to ONA",
                                desc: "Original Net Animations",
                              },
                              {
                                label: "Format set to Special",
                                desc: "Specials & short films",
                              },
                            ],
                          },
                          {
                            category: "Format (Manga)",
                            accent: "var(--z-pink)",
                            bg: "rgba(236,72,153,0.08)",
                            conditions: [
                              {
                                label: "Format set to Manga (Japan)",
                                desc: "Japanese manga",
                              },
                              {
                                label: "Format set to Manga (South Korean)",
                                desc: "Korean manhwa",
                              },
                              {
                                label: "Format set to Manga (Chinese)",
                                desc: "Chinese manhua",
                              },
                              {
                                label: "Format set to Novel",
                                desc: "Light novels",
                              },
                              {
                                label: "Format set to One shot",
                                desc: "Single-chapter works",
                              },
                            ],
                          },
                          {
                            category: "Genres",
                            accent: "var(--z-frost)",
                            bg: "rgba(103,193,245,0.08)",
                            conditions: [
                              {
                                label: "Genres contain Action",
                                desc: "Has the Action genre — works for any AniList genre",
                              },
                              {
                                label: "Genres contain Romance",
                                desc: "Has the Romance genre",
                              },
                            ],
                          },
                          {
                            category: "Tags & Tag Categories",
                            accent: "var(--z-frost)",
                            bg: "rgba(103,193,245,0.08)",
                            conditions: [
                              {
                                label: "Tags contain Isekai",
                                desc: "Has the Isekai tag",
                              },
                              {
                                label: "Tag Categories contain Action",
                                desc: "Has any tag in the Action category",
                              },
                            ],
                          },
                          {
                            category: "Misc",
                            accent: "var(--z-muted)",
                            bg: "var(--z-card-up)",
                            conditions: [
                              {
                                label: "Rewatched",
                                desc: "Re-watched or re-read at least once (repeat > 0)",
                              },
                              {
                                label: "Adult (18+)",
                                desc: "Marked as adult content on AniList",
                              },
                            ],
                          },
                        ].map(({ category, accent, bg, conditions }) => (
                          <div
                            key={category}
                            className="overflow-hidden rounded-lg"
                            style={{ border: "1px solid var(--z-border)" }}
                          >
                            <div
                              className="px-4 py-2"
                              style={{ backgroundColor: bg }}
                            >
                              <span
                                className="text-xs font-bold tracking-wider uppercase"
                                style={{ color: accent }}
                              >
                                {category}
                              </span>
                            </div>
                            <div
                              className="divide-y"
                              style={{ borderColor: "var(--z-border)" }}
                            >
                              {conditions.map(({ label, desc }) => (
                                <div
                                  key={label}
                                  className="
                                    flex flex-col gap-1 px-4 py-2.5
                                    sm:flex-row sm:items-start sm:gap-3
                                  "
                                >
                                  <code
                                    className="
                                      shrink-0 self-start rounded-sm px-1.5 py-0.5 text-[11px]
                                    "
                                    style={{
                                      backgroundColor: "var(--z-card-up)",
                                      color: "var(--z-text)",
                                      border: "1px solid var(--z-border)",
                                    }}
                                  >
                                    {label}
                                  </code>
                                  <span
                                    className="text-xs"
                                    style={{ color: "var(--z-muted)" }}
                                  >
                                    {desc}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── TIPS & SAFETY ── */}
                    {section === "tips" && (
                      <div className="space-y-4">
                        <div
                          className="rounded-lg p-4"
                          style={{
                            backgroundColor: "var(--z-card)",
                            border: "1px solid var(--z-border)",
                          }}
                        >
                          <p
                            className="mb-3 text-xs font-bold tracking-wider uppercase"
                            style={{ color: "var(--z-frost)" }}
                          >
                            Best Practices
                          </p>
                          <ul className="space-y-2.5">
                            {[
                              'Use "Estimate Matches" before updating to confirm your rules target the right entries.',
                              'Use "Preview Entry" to check a specific title — especially helpful for edge cases.',
                              '"Match all" (AND) is strict: every include rule must pass. "Match any" (OR) is broad: one rule suffices.',
                              "Exclude rules always run after include rules. An entry passes include rules but is still blocked if any exclude rule matches.",
                              "Hide Default Status Lists once your custom lists cover all entries to keep your AniList view clean.",
                              "If an entry matches no configured include rules, it remains in its current custom lists unchanged.",
                              "Hover over toolbar icons for tooltips describing their actions.",
                            ].map((tip) => (
                              <li
                                key={tip}
                                className="flex gap-2 text-xs"
                                style={{ color: "var(--z-text)" }}
                              >
                                <span style={{ color: "var(--z-frost)" }}>
                                  •
                                </span>
                                {tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

const CustomListRow = memo(function CustomListRow({
  list,
  index,
  options,
  markedForRemoval,
  onUndoRemoveAll,
  onAddRule,
  onClearRules,
  onOpenRename,
  onDelete,
  onRemoveAll,
  onOperatorChange,
  onRemoveRule,
  onRuleConditionChange,
  onRulePolarityChange,
}: Readonly<{
  list: CustomList;
  index: number;
  options: OptionGroup[];
  markedForRemoval: boolean;
  onUndoRemoveAll: (listName: string) => void;
  onAddRule: (index: number) => void;
  onClearRules: (index: number) => void;
  onOpenRename: (list: CustomList) => void;
  onDelete: (name: string) => void;
  onRemoveAll: (list: CustomList) => void;
  onOperatorChange: (index: number, operator: "ALL" | "ANY") => void;
  onRemoveRule: (index: number, ruleId: string) => void;
  onRuleConditionChange: (index: number, ruleId: string, value: string) => void;
  onRulePolarityChange: (
    index: number,
    ruleId: string,
    polarity: "include" | "exclude",
  ) => void;
}>) {
  const ruleSet = normalizeRuleSet(list.ruleSet, list.selectedOption);
  const activeRuleCount = ruleSet.rules.filter(
    (rule) => rule.condition.trim().length > 0,
  ).length;
  const hasConfiguredRules = hasActiveIncludeRules(
    ruleSet,
    list.selectedOption,
  );
  let helperCopy =
    "No rules yet. Add include rules to decide which entries belong here.";

  if (hasConfiguredRules) {
    helperCopy = summarizeRuleSet(ruleSet, list.selectedOption);
  } else if (ruleSet.rules.length > 0) {
    helperCopy = "Add at least one include rule before updating this list.";
  }

  return (
    <SortableItem id={list.name}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold" style={{ color: "var(--z-text)" }}>
          {list.name}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{
            backgroundColor: hasConfiguredRules
              ? "var(--z-amber-dim)"
              : "var(--z-card-up)",
            color: hasConfiguredRules ? "var(--z-amber)" : "var(--z-muted)",
            border: "1px solid var(--z-border)",
          }}
        >
          {activeRuleCount} active rule{activeRuleCount === 1 ? "" : "s"}
        </span>
      </div>

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
        <div className="min-w-full sm:min-w-xl">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="inline-flex rounded-lg p-1"
                style={{
                  backgroundColor: "var(--z-card-up)",
                  border: "1px solid var(--z-border)",
                }}
              >
                {(["ALL", "ANY"] as const).map((operator) => {
                  const isActive = ruleSet.operator === operator;

                  return (
                    <button
                      key={operator}
                      type="button"
                      onClick={() => onOperatorChange(index, operator)}
                      className="
                        rounded-md px-3 py-1.5 text-xs font-bold tracking-wide transition-all
                      "
                      style={{
                        backgroundColor: isActive
                          ? "var(--z-amber)"
                          : "transparent",
                        color: isActive ? "#07060f" : "var(--z-muted)",
                      }}
                    >
                      {operator === "ALL" ? "Match all" : "Match any"}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => onAddRule(index)}
                className="
                  inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold
                  transition-all
                  hover:brightness-110
                  active:scale-95
                "
                style={{
                  backgroundColor: "var(--z-amber-dim)",
                  color: "var(--z-amber)",
                  border: "1px solid rgba(245,166,35,0.2)",
                }}
              >
                <FaPlus className="size-3" />
                Add rule
              </button>
            </div>

            <p className="text-xs" style={{ color: "var(--z-muted)" }}>
              {helperCopy}
            </p>

            {ruleSet.rules.length === 0 ? (
              <div
                className="rounded-lg border border-dashed p-3 text-sm"
                style={{
                  borderColor: "var(--z-border-mid)",
                  backgroundColor: "var(--z-card-up)",
                  color: "var(--z-muted)",
                }}
              >
                Add your first include or exclude rule to start building this
                custom list.
              </div>
            ) : (
              <div className="space-y-2">
                {ruleSet.rules.map((rule, ruleIndex) => (
                  <div
                    key={rule.id}
                    className="flex flex-col gap-2 rounded-lg p-3 sm:flex-row sm:items-center"
                    style={{
                      backgroundColor: "var(--z-card-up)",
                      border: "1px solid var(--z-border)",
                    }}
                  >
                    <div className="sm:w-32">
                      <label
                        className="sr-only"
                        htmlFor={`${list.name}-rule-${rule.id}-polarity`}
                      >
                        Rule polarity
                      </label>
                      <select
                        id={`${list.name}-rule-${rule.id}-polarity`}
                        value={rule.polarity}
                        onChange={(event) =>
                          onRulePolarityChange(
                            index,
                            rule.id,
                            event.target.value as "include" | "exclude",
                          )
                        }
                        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                        style={{
                          backgroundColor: "var(--z-card)",
                          border: "1px solid var(--z-border-mid)",
                          color: "var(--z-text)",
                        }}
                      >
                        <option value="include">Include</option>
                        <option value="exclude">Exclude</option>
                      </select>
                    </div>

                    <div className="min-w-0 flex-1">
                      <DynamicSelect
                        value={rule.condition}
                        onValueChange={(value: string) =>
                          onRuleConditionChange(index, rule.id, value)
                        }
                        options={options}
                        placeholder={`Select ${rule.polarity} condition`}
                        className="w-full min-w-0"
                      />
                    </div>

                    <button
                      type="button"
                      aria-label={`Remove rule ${ruleIndex + 1}`}
                      onClick={() => onRemoveRule(index, rule.id)}
                      className="
                        inline-flex size-10 items-center justify-center rounded-full transition-all
                        hover:bg-[rgba(248,113,113,0.12)]
                        active:scale-90
                      "
                      style={{ color: "var(--z-red)" }}
                    >
                      <FaTrash className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px]" style={{ color: "var(--z-subtle)" }}>
                Exclude rules always block matches, even when include rules
                pass.
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <ActionIconButton
                  ariaLabel="Clear rules"
                  tooltip="Clear rules"
                  onClick={() => onClearRules(index)}
                  className="
                    size-8 rounded-full p-0 transition-all duration-150
                    hover:bg-z-card-up
                    active:scale-90
                  "
                  style={{ color: "var(--z-muted)" }}
                >
                  <FaTimesCircle className="size-4" />
                </ActionIconButton>

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
            </div>
          </div>
        </div>
      )}
    </SortableItem>
  );
});

function renderMatchPreviewContent(
  matchPreview: MatchPreviewState,
  listType: MediaType,
): ReactNode {
  if (matchPreview.loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <LoadingIndicator size="lg" />
        <p className="mt-4 text-sm" style={{ color: "var(--z-muted)" }}>
          Scanning your {listType.toLowerCase()} library with the same matcher
          used by the updater...
        </p>
      </div>
    );
  }

  if (matchPreview.error) {
    return (
      <div
        className="rounded-lg p-4 text-sm"
        style={{
          backgroundColor: "rgba(248,113,113,0.1)",
          border: "1px solid rgba(248,113,113,0.2)",
          color: "var(--z-red)",
        }}
      >
        {matchPreview.error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-lg p-3"
        style={{
          backgroundColor: "var(--z-card-up)",
          border: "1px solid var(--z-border)",
        }}
      >
        <p className="text-sm font-medium" style={{ color: "var(--z-text)" }}>
          Scanned {matchPreview.entryCount} {listType.toLowerCase()} entr
          {matchPreview.entryCount === 1 ? "y" : "ies"}.
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--z-muted)" }}>
          Counts are read-only estimates based on your current rules. Samples
          show up to three matching titles per list.
        </p>
      </div>

      <div className="space-y-3">
        {matchPreview.estimates.map((estimate) => (
          <div
            key={estimate.name}
            className="rounded-lg p-3"
            style={{
              backgroundColor: "var(--z-card-up)",
              border: "1px solid var(--z-border)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold" style={{ color: "var(--z-text)" }}>
                  {estimate.name}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--z-muted)" }}>
                  {estimate.hasActiveRules
                    ? estimate.summary
                    : "Remove-from-all only"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {estimate.markedForRemoval && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{
                      backgroundColor: "var(--z-amber-dim)",
                      color: "var(--z-amber)",
                    }}
                  >
                    remove from all
                  </span>
                )}
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{
                    backgroundColor: "var(--z-card)",
                    border: "1px solid var(--z-border)",
                    color: "var(--z-text)",
                  }}
                >
                  {estimate.totalMatches} match
                  {estimate.totalMatches === 1 ? "" : "es"}
                </span>
              </div>
            </div>

            {estimate.sampleTitles.length > 0 ? (
              <ul
                className="mt-3 space-y-1 text-sm"
                style={{ color: "var(--z-subtle)" }}
              >
                {estimate.sampleTitles.map((title) => (
                  <li key={`${estimate.name}-${title}`}>• {title}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm" style={{ color: "var(--z-subtle)" }}>
                {estimate.hasActiveRules
                  ? "No current library entries matched this rule set."
                  : "This list is currently only queued for remove-from-all."}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildChangeSummary(
  changed: boolean,
  added: string[],
  removed: string[],
  shouldHide: boolean,
): string {
  if (!changed) {
    return "No changes would be made to this entry with the current rules.";
  }
  const parts: string[] = ["This entry would be modified."];
  if (added.length > 0) parts.push(`Added to: ${added.join(", ")}.`);
  if (removed.length > 0) parts.push(`Removed from: ${removed.join(", ")}.`);
  if (shouldHide) parts.push("Default status list will be hidden.");
  return parts.join(" ");
}

function renderEntryPreviewSelected(
  selectedEntry: MediaEntry,
  currentLists: string[],
  result: ReturnType<typeof computeEntryWorkflowUpdate>,
  added: string[],
  removed: string[],
  setEntryPreview: (
    updater: (prev: EntryPreviewState) => EntryPreviewState,
  ) => void,
): ReactNode {
  const summary = buildChangeSummary(
    result.changed,
    added,
    removed,
    result.shouldHide,
  );

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() =>
          setEntryPreview((prev) => ({ ...prev, selectedEntryId: null }))
        }
        className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
        style={{ color: "var(--z-muted)" }}
      >
        ← Back to search
      </button>

      <div
        className="rounded-lg p-3"
        style={{
          backgroundColor: "var(--z-card-up)",
          border: "1px solid var(--z-border)",
        }}
      >
        <p className="font-semibold" style={{ color: "var(--z-text)" }}>
          {getMediaEntryTitle(selectedEntry)}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--z-muted)" }}>
          ID: {selectedEntry.id}
          {selectedEntry.status ? ` · ${selectedEntry.status}` : ""}
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <p
            className="mb-1.5 text-xs font-semibold"
            style={{ color: "var(--z-muted)" }}
          >
            Current custom lists
          </p>
          <div className="flex flex-wrap gap-1.5">
            {currentLists.length > 0 ? (
              currentLists.map((name) => (
                <span
                  key={name}
                  className="rounded-sm px-2 py-0.5 text-xs"
                  style={{
                    backgroundColor: "var(--z-card-up)",
                    border: "1px solid var(--z-border)",
                    color: "var(--z-text)",
                  }}
                >
                  {name}
                </span>
              ))
            ) : (
              <span
                className="text-xs italic"
                style={{ color: "var(--z-muted)" }}
              >
                No custom lists
              </span>
            )}
          </div>
        </div>

        <div>
          <p
            className="mb-1.5 text-xs font-semibold"
            style={{ color: "var(--z-muted)" }}
          >
            After update
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.newLists.map((name) => {
              const isNew = added.includes(name);
              const addedPrefix = isNew ? "+ " : "";
              return (
                <span
                  key={name}
                  className="rounded-sm px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: isNew
                      ? "rgba(74,222,128,0.12)"
                      : "var(--z-card-up)",
                    border: isNew
                      ? "1px solid rgba(74,222,128,0.3)"
                      : "1px solid var(--z-border)",
                    color: isNew ? "#4ade80" : "var(--z-text)",
                  }}
                >
                  {addedPrefix}
                  {name}
                </span>
              );
            })}
            {removed.map((name) => (
              <span
                key={name}
                className="rounded-sm px-2 py-0.5 text-xs font-medium line-through"
                style={{
                  backgroundColor: "rgba(248,113,113,0.08)",
                  border: "1px solid rgba(248,113,113,0.2)",
                  color: "var(--z-red)",
                }}
              >
                {name}
              </span>
            ))}
            {result.newLists.length === 0 && removed.length === 0 && (
              <span
                className="text-xs italic"
                style={{ color: "var(--z-muted)" }}
              >
                No custom lists after update
              </span>
            )}
          </div>
        </div>

        <div
          className="rounded-lg p-3 text-xs"
          style={{
            backgroundColor: result.changed
              ? "rgba(74,222,128,0.07)"
              : "var(--z-card-up)",
            border: result.changed
              ? "1px solid rgba(74,222,128,0.2)"
              : "1px solid var(--z-border)",
            color: result.changed ? "#4ade80" : "var(--z-muted)",
          }}
        >
          {summary}
        </div>
      </div>
    </div>
  );
}

function renderEntryPreviewSearch(
  state: EntryPreviewState,
  filteredEntries: MediaEntry[],
  listType: MediaType,
  setEntryPreview: (
    updater: (prev: EntryPreviewState) => EntryPreviewState,
  ) => void,
): ReactNode {
  const resultWord = filteredEntries.length === 1 ? "result" : "results";
  const countLabel = state.query.trim()
    ? `${filteredEntries.length} ${resultWord}`
    : `Showing ${filteredEntries.length} of ${state.entries.length} ${listType.toLowerCase()} entries`;

  return (
    <div className="space-y-3">
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2"
        style={{
          backgroundColor: "var(--z-card-up)",
          border: "1px solid var(--z-border)",
        }}
      >
        <FaSearch
          className="size-3.5 shrink-0"
          style={{ color: "var(--z-muted)" }}
        />
        <input
          type="text"
          value={state.query}
          onChange={(e) =>
            setEntryPreview((prev) => ({ ...prev, query: e.target.value }))
          }
          placeholder="Search by title or ID…"
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: "var(--z-text)" }}
          autoFocus
        />
      </div>

      {filteredEntries.length > 0 ? (
        <div className="max-h-96 space-y-1.5 overflow-y-auto">
          {filteredEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() =>
                setEntryPreview((prev) => ({
                  ...prev,
                  selectedEntryId: entry.id,
                }))
              }
              className="
                w-full cursor-pointer rounded-lg px-3 py-2.5 text-left transition-all
                hover:bg-z-card-high
              "
              style={{
                backgroundColor: "var(--z-card-up)",
                border: "1px solid var(--z-border)",
              }}
            >
              <p
                className="text-sm font-medium"
                style={{ color: "var(--z-text)" }}
              >
                {getMediaEntryTitle(entry)}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--z-muted)" }}>
                ID: {entry.id}
                {entry.status ? ` · ${entry.status}` : ""}
              </p>
            </button>
          ))}
        </div>
      ) : (
        <p
          className="py-6 text-center text-sm"
          style={{ color: "var(--z-muted)" }}
        >
          {state.query ? "No entries match your search." : "No entries found."}
        </p>
      )}

      <p className="text-xs" style={{ color: "var(--z-subtle)" }}>
        {countLabel}
      </p>
    </div>
  );
}

function renderEntryPreviewContent(
  state: EntryPreviewState,
  lists: CustomList[],
  listsToRemoveFromAllEntries: string[],
  hideDefaultStatusLists: boolean,
  listType: MediaType,
  setEntryPreview: (
    updater: (prev: EntryPreviewState) => EntryPreviewState,
  ) => void,
): ReactNode {
  if (state.loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <LoadingIndicator size="lg" />
        <p className="mt-4 text-sm" style={{ color: "var(--z-muted)" }}>
          Loading your {listType.toLowerCase()} library...
        </p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div
        className="rounded-lg p-4 text-sm"
        style={{
          backgroundColor: "rgba(248,113,113,0.1)",
          border: "1px solid rgba(248,113,113,0.2)",
          color: "var(--z-red)",
        }}
      >
        {state.error}
      </div>
    );
  }

  const selectedEntry = state.selectedEntryId
    ? state.entries.find((e) => e.id === state.selectedEntryId)
    : undefined;

  const filteredEntries = state.query.trim()
    ? state.entries.filter((e) => {
        const q = state.query.trim().toLowerCase();
        return (
          getMediaEntryTitle(e).toLowerCase().includes(q) ||
          String(e.id).includes(q)
        );
      })
    : state.entries.slice(0, 50);

  if (selectedEntry) {
    const result = computeEntryWorkflowUpdate(
      selectedEntry,
      lists,
      listsToRemoveFromAllEntries,
      hideDefaultStatusLists,
    );
    const currentLists = getCurrentCustomLists(selectedEntry);
    const added = result.newLists.filter((n) => !currentLists.includes(n));
    const removed = currentLists.filter((n) => !result.newLists.includes(n));
    return renderEntryPreviewSelected(
      selectedEntry,
      currentLists,
      result,
      added,
      removed,
      setEntryPreview,
    );
  }

  return renderEntryPreviewSearch(
    state,
    filteredEntries,
    listType,
    setEntryPreview,
  );
}

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
  const [presets, setPresets] = useState<WorkflowPreset[]>(() =>
    getJsonItemWithExpiry<WorkflowPreset[]>(STORAGE_KEYS.workflowPresets, []),
  );
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetDialogMode, setPresetDialogMode] =
    useState<PresetDialogMode | null>(null);
  const [presetNameDraft, setPresetNameDraft] = useState("");
  const [showDeletePresetModal, setShowDeletePresetModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showBackupWarning, setShowBackupWarning] = useState(() => {
    if (globalThis.window === undefined) return true;
    return localStorage.getItem("aclm:ui:backup-warning-dismissed") !== "true";
  });
  const [matchPreview, setMatchPreview] = useState<MatchPreviewState>({
    open: false,
    loading: false,
    entryCount: 0,
    estimates: [],
    error: null,
  });
  const [entryPreview, setEntryPreview] = useState<EntryPreviewState>({
    open: false,
    loading: false,
    entries: [],
    query: "",
    selectedEntryId: null,
    error: null,
  });
  const shouldAutoFocusAddListInput = useDesktopAutoFocus(showAddModal);

  // Ref Hooks
  const updateSectionOrderRef =
    useRef<(newOrder: string[]) => Promise<void> | null>(null);
  const presetStorageFallbackWarnedRef = useRef(false);

  // Other Hooks
  const router = useRouter();
  const { token, userId } = useAuth();

  // Memoize handlers
  const updateListAtIndex = useCallback(
    (index: number, updater: (list: CustomList) => CustomList) => {
      setLists((prev) =>
        prev.map((list, listIndex) =>
          listIndex === index ? normalizeListStateItem(updater(list)) : list,
        ),
      );
    },
    [],
  );

  const handleClearRules = useCallback(
    (index: number) => {
      updateListAtIndex(index, (list) => ({
        ...list,
        ruleSet: createEmptyRuleSet(),
        selectedOption: "",
      }));
    },
    [updateListAtIndex],
  );

  const handleOperatorChange = useCallback(
    (index: number, operator: "ALL" | "ANY") => {
      updateListAtIndex(index, (list) => ({
        ...list,
        ruleSet: {
          ...normalizeRuleSet(list.ruleSet, list.selectedOption),
          operator,
        },
      }));
    },
    [updateListAtIndex],
  );

  const handleAddRule = useCallback(
    (index: number) => {
      updateListAtIndex(index, (list) => {
        const ruleSet = normalizeRuleSet(list.ruleSet, list.selectedOption);

        return {
          ...list,
          ruleSet: {
            ...ruleSet,
            rules: [...ruleSet.rules, createEmptyRule()],
          },
        };
      });
    },
    [updateListAtIndex],
  );

  const handleRemoveRule = useCallback(
    (index: number, ruleId: string) => {
      updateListAtIndex(index, (list) => {
        const ruleSet = normalizeRuleSet(list.ruleSet, list.selectedOption);

        return {
          ...list,
          ruleSet: {
            ...ruleSet,
            rules: ruleSet.rules.filter((rule) => rule.id !== ruleId),
          },
        };
      });
    },
    [updateListAtIndex],
  );

  const handleRuleConditionChange = useCallback(
    (index: number, ruleId: string, value: string) => {
      updateListAtIndex(index, (list) => {
        const ruleSet = normalizeRuleSet(list.ruleSet, list.selectedOption);

        return {
          ...list,
          ruleSet: {
            ...ruleSet,
            rules: ruleSet.rules.map((rule) =>
              rule.id === ruleId ? { ...rule, condition: value } : rule,
            ),
          },
        };
      });
    },
    [updateListAtIndex],
  );

  const handleRulePolarityChange = useCallback(
    (index: number, ruleId: string, polarity: "include" | "exclude") => {
      updateListAtIndex(index, (list) => {
        const ruleSet = normalizeRuleSet(list.ruleSet, list.selectedOption);

        return {
          ...list,
          ruleSet: {
            ...ruleSet,
            rules: ruleSet.rules.map((rule) =>
              rule.id === ruleId ? { ...rule, polarity } : rule,
            ),
          },
        };
      });
    },
    [updateListAtIndex],
  );

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
    setListsToRemoveFromAllEntries((prev) =>
      prev.filter((name) => name !== listName),
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
        description: getApiErrorMessageWithRequestId(
          apiError,
          "Failed to delete list.",
        ),
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
          description: getApiErrorMessageWithRequestId(
            apiError,
            "Failed to update list order.",
          ),
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
    const newConditions: ListCondition[] = lists.map((list) => {
      const normalized = normalizeCustomListRuleConfig(list);

      return {
        name: list.name,
        condition: normalized.selectedOption,
        selectedOption: normalized.selectedOption,
        ruleSet: normalized.ruleSet,
      };
    });

    setItemWithExpiry(
      listType === "ANIME"
        ? STORAGE_KEYS.workflowConditionsAnime
        : STORAGE_KEYS.workflowConditionsManga,
      newConditions,
      STORAGE_TTLS.workflowCache,
    );
  }, [lists, listType]);

  useEffect(() => {
    const result = setItemWithExpiry(
      STORAGE_KEYS.workflowPresets,
      presets,
      STORAGE_TTLS.workflowCache,
    );

    if (
      isStorageFallbackResult(result) &&
      !presetStorageFallbackWarnedRef.current
    ) {
      presetStorageFallbackWarnedRef.current = true;
      toast.warning("Using temporary storage fallback", {
        description:
          "Workflow presets are stored in-memory for this tab because browser storage is constrained.",
      });
    }
  }, [presets]);

  useEffect(() => {
    if (presets.length === 0) {
      if (selectedPresetId) {
        setSelectedPresetId("");
      }
      return;
    }

    if (!presets.some((preset) => preset.id === selectedPresetId)) {
      setSelectedPresetId(presets[0].id);
    }
  }, [presets, selectedPresetId]);

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
    async (
      type: MediaType,
    ): Promise<{
      lists: CustomList[];
      originalSectionOrder: string[];
    } | null> => {
      if (!userId) {
        toast.error("Error", {
          description: "User ID is not available.",
        });
        return null;
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
          .map((name) => {
            const defaultCondition = getDefaultOption(name);

            return normalizeListStateItem({
              name,
              isCustomList: true,
              ruleSet: normalizeRuleSet(undefined, defaultCondition),
              selectedOption: defaultCondition,
            });
          });

        setListType(type);
        setLists(orderedCustomLists);
        setDataLoaded(true);
        setIsListEmpty(orderedCustomLists.length === 0);
        setLoading(false);
        return {
          lists: orderedCustomLists,
          originalSectionOrder: updatedSectionOrder,
        };
      } catch (error) {
        const apiError = error as ApiError;
        console.error("Error in fetchLists:", apiError.message);
        toast.error("Error", {
          description: getApiErrorMessageWithRequestId(
            apiError,
            "Failed to fetch lists.",
          ),
        });
        setLoading(false);
        return null;
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

  const buildCurrentPreset = useCallback(
    (name: string): WorkflowPreset => {
      const timestamp = Date.now();

      return {
        id: createPresetId(name),
        name,
        mediaType: listType,
        hideDefaultStatusLists,
        lists: lists
          .map((list) => normalizeCustomListRuleConfig(list))
          .filter((list) =>
            list.ruleSet.rules.some((rule) => rule.condition.trim().length > 0),
          )
          .map((list) => ({
            name: list.name,
            ruleSet: list.ruleSet,
            selectedOption: list.selectedOption,
          })),
        listsToRemoveFromAllEntries: [...listsToRemoveFromAllEntries],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    },
    [hideDefaultStatusLists, listType, lists, listsToRemoveFromAllEntries],
  );

  const applyPresetToBaseLists = useCallback(
    (baseLists: CustomList[], preset: WorkflowPreset) => {
      const presetListsByName = new Map(
        preset.lists.map((list) => [
          list.name,
          normalizeCustomListRuleConfig(list),
        ]),
      );
      const availableListNames = new Set(baseLists.map((list) => list.name));

      return {
        nextLists: baseLists.map((list) => {
          const presetList = presetListsByName.get(list.name);

          if (!presetList) {
            return normalizeListStateItem({
              ...list,
              ruleSet: createEmptyRuleSet(),
              selectedOption: "",
            });
          }

          return normalizeListStateItem({
            ...list,
            ruleSet: presetList.ruleSet,
            selectedOption: presetList.selectedOption,
          });
        }),
        missingListNames: preset.lists
          .filter((list) => !availableListNames.has(list.name))
          .map((list) => list.name),
        resolvedRemoveNames: preset.listsToRemoveFromAllEntries.filter((name) =>
          availableListNames.has(name),
        ),
      };
    },
    [],
  );

  const proceedToNextStep = (): void => {
    setShowPopup(false);
    const writeResults = [
      setItemWithExpiry(
        STORAGE_KEYS.workflowLists,
        lists.map((list) => {
          const normalized = normalizeCustomListRuleConfig(list);

          return {
            name: list.name,
            ruleSet: normalized.ruleSet,
            selectedOption: normalized.selectedOption,
          };
        }),
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

  const openSavePresetDialog = useCallback(() => {
    setPresetDialogMode("save");
    setPresetNameDraft(
      `${listType === "ANIME" ? "Anime" : "Manga"} preset ${presets.length + 1}`,
    );
  }, [listType, presets.length]);

  const openDuplicatePresetDialog = useCallback(() => {
    const preset = presets.find((item) => item.id === selectedPresetId);
    if (!preset) {
      toast.error("Select a preset first", {
        description: "Choose a saved preset to duplicate.",
      });
      return;
    }

    setPresetDialogMode("duplicate");
    setPresetNameDraft(`${preset.name} Copy`);
  }, [presets, selectedPresetId]);

  const handlePresetDialogConfirm = useCallback(() => {
    const trimmedName = presetNameDraft.trim();
    if (!trimmedName) {
      toast.error("Preset name required", {
        description: "Give the preset a name before saving it.",
      });
      return;
    }

    const hasDuplicateName = presets.some(
      (preset) => preset.name.toLowerCase() === trimmedName.toLowerCase(),
    );

    if (hasDuplicateName) {
      toast.error("Preset name already exists", {
        description:
          "Pick a different name so presets stay easy to tell apart.",
      });
      return;
    }

    const sortByUpdatedAtDesc = (nextPresets: WorkflowPreset[]) =>
      [...nextPresets].sort((left, right) => right.updatedAt - left.updatedAt);

    if (presetDialogMode === "save") {
      const nextPreset = buildCurrentPreset(trimmedName);
      setPresets((prev) => sortByUpdatedAtDesc([nextPreset, ...prev]));
      setSelectedPresetId(nextPreset.id);
      toast.success("Preset saved", {
        description: `Saved "${trimmedName}" for ${listType.toLowerCase()} lists.`,
      });
    }

    if (presetDialogMode === "duplicate") {
      const sourcePreset = presets.find(
        (preset) => preset.id === selectedPresetId,
      );
      if (!sourcePreset) {
        toast.error("Preset not found", {
          description:
            "The preset you tried to duplicate is no longer available.",
        });
        return;
      }

      const timestamp = Date.now();
      const nextPreset: WorkflowPreset = {
        ...sourcePreset,
        id: createPresetId(trimmedName),
        name: trimmedName,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      setPresets((prev) => sortByUpdatedAtDesc([nextPreset, ...prev]));
      setSelectedPresetId(nextPreset.id);
      toast.success("Preset duplicated", {
        description: `Created "${trimmedName}" from "${sourcePreset.name}".`,
      });
    }

    setPresetDialogMode(null);
    setPresetNameDraft("");
  }, [
    buildCurrentPreset,
    listType,
    presetDialogMode,
    presetNameDraft,
    presets,
    selectedPresetId,
  ]);

  const handleLoadPreset = useCallback(async () => {
    const preset = presets.find((item) => item.id === selectedPresetId);
    if (!preset) {
      toast.error("Select a preset first", {
        description: "Choose a saved preset to load into the manager.",
      });
      return;
    }

    const targetType = preset.mediaType === "MANGA" ? "MANGA" : "ANIME";
    const cachedState = listCache[targetType];
    let sourceLists = cachedState.lists;
    let sourceSectionOrder = cachedState.originalSectionOrder;

    if (!cachedState.dataLoaded) {
      const fetched = await fetchLists(targetType);
      if (!fetched) {
        return;
      }

      sourceLists = fetched.lists;
      sourceSectionOrder = fetched.originalSectionOrder;
    }

    const { nextLists, missingListNames, resolvedRemoveNames } =
      applyPresetToBaseLists(sourceLists, preset);

    setListCache((prev) => ({
      ...prev,
      [targetType]: {
        lists: nextLists,
        originalSectionOrder: sourceSectionOrder,
        dataLoaded: true,
        isListEmpty: nextLists.length === 0,
      },
    }));

    setHideDefaultStatusLists(preset.hideDefaultStatusLists);
    setListsToRemoveFromAllEntries(resolvedRemoveNames);
    setActiveTab(targetType);
    setListType(targetType);
    setLists(nextLists);
    setOriginalSectionOrder(sourceSectionOrder);
    setDataLoaded(true);
    setIsListEmpty(nextLists.length === 0);
    setLoading(false);

    toast.success("Preset loaded", {
      description: `Loaded "${preset.name}" into ${targetType.toLowerCase()} lists.`,
    });

    if (missingListNames.length > 0) {
      toast.warning("Some preset lists were unavailable", {
        description: `${missingListNames.length} preset list${missingListNames.length === 1 ? " was" : "s were"} skipped because it no longer exists on AniList.`,
      });
    }
  }, [
    applyPresetToBaseLists,
    fetchLists,
    listCache,
    presets,
    selectedPresetId,
  ]);

  const handleDeletePreset = useCallback(() => {
    const preset = presets.find((item) => item.id === selectedPresetId);
    if (!preset) {
      setShowDeletePresetModal(false);
      return;
    }

    setPresets((prev) => prev.filter((item) => item.id !== preset.id));
    setShowDeletePresetModal(false);
    toast.success("Preset deleted", {
      description: `Deleted "${preset.name}" from local presets.`,
    });
  }, [presets, selectedPresetId]);

  const handleLoadDefaultTemplate = useCallback(() => {
    const timestamp = Date.now();
    const newPreset: WorkflowPreset = {
      ...DEFAULT_TEMPLATE_PRESET,
      id: `default-template-${timestamp}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setPresets((prev) => [newPreset, ...prev]);
    setSelectedPresetId(newPreset.id);
    toast.success("Default template loaded", {
      description:
        'The template preset has been added to your local presets. Load it with "Load Preset" to apply its rules.',
    });
  }, []);

  const handleEstimateMatches = useCallback(async () => {
    const relevantLists = lists.filter((list) =>
      hasActiveIncludeRules(list.ruleSet, list.selectedOption),
    );

    if (relevantLists.length === 0) {
      toast.error("Add an include rule first", {
        description:
          "At least one list needs an active include rule before match estimates can be calculated.",
      });
      return;
    }

    if (!userId) {
      toast.error("Error", {
        description: "User ID is not available.",
      });
      return;
    }

    setMatchPreview({
      open: true,
      loading: true,
      entryCount: 0,
      estimates: [],
      error: null,
    });

    try {
      const entries = await fetchAllWorkflowMediaEntries({
        userId,
        type: listType,
        fetchPage: async (variables: WorkflowMediaListQueryVariables) =>
          await fetchAniListData<
            MediaListResponse["data"],
            WorkflowMediaListQueryVariables
          >(WORKFLOW_MEDIA_LIST_QUERY, variables),
      });

      const estimates = lists
        .filter(
          (list) =>
            hasActiveIncludeRules(list.ruleSet, list.selectedOption) ||
            listsToRemoveFromAllEntries.includes(list.name),
        )
        .map((list) => {
          const normalized = normalizeCustomListRuleConfig(list);
          const { totalMatches, sampleTitles } = estimateMatchesForListConfig(
            entries,
            normalized,
          );

          return {
            name: list.name,
            totalMatches,
            sampleTitles,
            summary: summarizeRuleSet(
              normalized.ruleSet,
              normalized.selectedOption,
            ),
            markedForRemoval: listsToRemoveFromAllEntries.includes(list.name),
            hasActiveRules: hasActiveIncludeRules(
              normalized.ruleSet,
              normalized.selectedOption,
            ),
          } satisfies ListMatchEstimate;
        });

      setMatchPreview({
        open: true,
        loading: false,
        entryCount: entries.length,
        estimates,
        error: null,
      });
    } catch (error) {
      const apiError = error as ApiError;

      setMatchPreview({
        open: true,
        loading: false,
        entryCount: 0,
        estimates: [],
        error: getApiErrorMessageWithRequestId(
          apiError,
          "Failed to estimate matches.",
        ),
      });
    }
  }, [fetchAniListData, listType, lists, listsToRemoveFromAllEntries, userId]);

  const handleOpenEntryPreview = useCallback(async () => {
    if (!userId) {
      toast.error("Error", { description: "User ID is not available." });
      return;
    }

    setEntryPreview({
      open: true,
      loading: true,
      entries: [],
      query: "",
      selectedEntryId: null,
      error: null,
    });

    try {
      const entries = await fetchAllWorkflowMediaEntries({
        userId,
        type: listType,
        fetchPage: async (variables: WorkflowMediaListQueryVariables) =>
          await fetchAniListData<
            MediaListResponse["data"],
            WorkflowMediaListQueryVariables
          >(WORKFLOW_MEDIA_LIST_QUERY, variables),
      });

      setEntryPreview((prev) => ({ ...prev, loading: false, entries }));
    } catch (error) {
      const apiError = error as ApiError;
      setEntryPreview((prev) => ({
        ...prev,
        loading: false,
        error: getApiErrorMessageWithRequestId(
          apiError,
          "Failed to load library entries.",
        ),
      }));
    }
  }, [fetchAniListData, listType, userId]);

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
      setListsToRemoveFromAllEntries((prev) =>
        prev.map((name) => (name === list.name ? trimmedName : name)),
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
          description: getApiErrorMessageWithRequestId(
            apiError,
            "Failed to update list names.",
          ),
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
      normalizeListStateItem({
        name: trimmedName,
        isCustomList: true,
        ruleSet: createEmptyRuleSet(),
        selectedOption: "",
      }),
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

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedPresetId) ?? null,
    [presets, selectedPresetId],
  );

  const configuredLists = useMemo(
    () =>
      lists.filter((list) =>
        hasActiveIncludeRules(list.ruleSet, list.selectedOption),
      ),
    [lists],
  );

  const canEstimateMatches = configuredLists.length > 0;
  const canProceed =
    dataLoaded &&
    !isListEmpty &&
    (configuredLists.length > 0 || listsToRemoveFromAllEntries.length > 0);

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
          onAddRule={handleAddRule}
          onClearRules={handleClearRules}
          onOpenRename={openRenameModal}
          onDelete={handleDeleteList}
          onRemoveAll={handleRemoveAllClick}
          onOperatorChange={handleOperatorChange}
          onRemoveRule={handleRemoveRule}
          onRuleConditionChange={handleRuleConditionChange}
          onRulePolarityChange={handleRulePolarityChange}
        />
      )),
    [
      handleAddRule,
      handleClearRules,
      handleDeleteList,
      handleOperatorChange,
      handleRemoveAllClick,
      handleRemoveRule,
      handleRuleConditionChange,
      handleRulePolarityChange,
      handleUndoRemoveAll,
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
  const matchPreviewContent = renderMatchPreviewContent(matchPreview, listType);
  const entryPreviewContent = renderEntryPreviewContent(
    entryPreview,
    lists,
    listsToRemoveFromAllEntries,
    hideDefaultStatusLists,
    listType,
    setEntryPreview,
  );

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
            <button
              type="button"
              aria-label="Open help guide"
              onClick={() => setShowHelp(true)}
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
          </div>
        </motion.div>

        {/* Backup Warning Banner */}
        {showBackupWarning && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mb-6 rounded-xl p-4"
            style={{
              backgroundColor: "rgba(248,113,113,0.07)",
              border: "1px solid rgba(248,113,113,0.25)",
            }}
          >
            <div className="flex items-start gap-3">
              <FaExclamationTriangle
                className="mt-0.5 size-4 shrink-0"
                style={{ color: "var(--z-red)" }}
              />
              <div className="flex-1">
                <p
                  className="mb-1 text-sm font-bold"
                  style={{ color: "var(--z-red)" }}
                >
                  Backup your AniList data before using this tool
                </p>
                <p
                  className="text-xs/relaxed"
                  style={{ color: "var(--z-muted)" }}
                >
                  Export your lists via{" "}
                  <strong style={{ color: "var(--z-text)" }}>
                    AniList → Account Settings → Export
                  </strong>{" "}
                  before making any changes. In case of data loss, a backup is
                  the only way to recover. By using this tool,{" "}
                  <strong style={{ color: "var(--z-text)" }}>
                    you do so at your own risk.
                  </strong>{" "}
                  Contact{" "}
                  <a
                    href="https://anilist.co/user/Alpha49/"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--z-text)",
                      textDecoration: "underline",
                    }}
                  >
                    <strong>@Alpha49</strong>
                  </a>{" "}
                  for any issues/bugs, questions, or concerns, but understand
                  that{" "}
                  <strong style={{ color: "var(--z-text)" }}>
                    data recovery support cannot be given.
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem(
                    "aclm:ui:backup-warning-dismissed",
                    "true",
                  );
                  setShowBackupWarning(false);
                }}
                aria-label="Dismiss warning"
                className="
                  flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md
                  transition-all
                  hover:opacity-70
                "
                style={{ color: "var(--z-muted)" }}
              >
                <FaTimesCircle size={12} />
              </button>
            </div>
          </motion.div>
        )}

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
              {!isListEmpty && (
                <button
                  onClick={handleEstimateMatches}
                  aria-label="Estimate matching entries"
                  disabled={!canEstimateMatches || loading}
                  className="
                    flex cursor-pointer items-center gap-2 rounded-lg px-5 py-2.5 font-semibold
                    transition-all duration-200
                    hover:bg-z-card-high
                    active:scale-95
                    disabled:cursor-not-allowed disabled:opacity-40
                  "
                  style={{
                    backgroundColor: "var(--z-card)",
                    border: "1px solid var(--z-border-mid)",
                    color: "var(--z-text)",
                  }}
                >
                  <FaEye
                    className="size-4"
                    style={{ color: "var(--z-frost)" }}
                  />
                  Estimate Matches
                </button>
              )}
              {!isListEmpty && (
                <button
                  onClick={handleOpenEntryPreview}
                  aria-label="Preview changes for a specific entry"
                  disabled={loading}
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
                  <FaSearch
                    className="size-4"
                    style={{ color: "var(--z-frost)" }}
                  />
                  Preview Entry
                </button>
              )}
              {!isListEmpty && (
                <button
                  onClick={openSavePresetDialog}
                  aria-label="Save current preset"
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
                  <FaSave
                    className="size-4"
                    style={{ color: "var(--z-amber)" }}
                  />
                  Save Preset
                </button>
              )}
            </div>
          </div>
          <div
            className="rounded-lg p-4"
            style={{
              backgroundColor: "var(--z-card)",
              border: "1px solid var(--z-border)",
            }}
          >
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    className="text-sm font-bold"
                    style={{ color: "var(--z-text)" }}
                  >
                    Presets
                  </h2>
                </div>
              </div>

              <span
                className="text-xs font-semibold"
                style={{ color: "var(--z-subtle)" }}
              >
                {presets.length} preset{presets.length === 1 ? "" : "s"} saved
              </span>
            </div>

            <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="min-w-0 flex-1">
                <label className="sr-only" htmlFor="workflowPresetSelect">
                  Saved workflow presets
                </label>
                <select
                  id="workflowPresetSelect"
                  value={selectedPresetId}
                  onChange={(event) => setSelectedPresetId(event.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                  style={{
                    backgroundColor: "var(--z-surface)",
                    border: "1px solid var(--z-border-mid)",
                    color: "var(--z-text)",
                  }}
                >
                  {presets.length === 0 ? (
                    <option value="">No presets saved yet</option>
                  ) : (
                    presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name} · {preset.mediaType.toLowerCase()} ·{" "}
                        {preset.lists.length} configured list
                        {preset.lists.length === 1 ? "" : "s"}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleLoadPreset}
                  disabled={!selectedPreset}
                  className="
                    inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold
                    transition-all
                    hover:bg-z-card-high
                    active:scale-95
                    disabled:cursor-not-allowed disabled:opacity-40
                  "
                  style={{
                    backgroundColor: "var(--z-card-up)",
                    border: "1px solid var(--z-border-mid)",
                    color: "var(--z-text)",
                  }}
                >
                  <FaFolderOpen
                    className="size-4"
                    style={{ color: "var(--z-frost)" }}
                  />
                  Load
                </button>
                <button
                  type="button"
                  onClick={openDuplicatePresetDialog}
                  disabled={!selectedPreset}
                  className="
                    inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold
                    transition-all
                    hover:bg-z-card-high
                    active:scale-95
                    disabled:cursor-not-allowed disabled:opacity-40
                  "
                  style={{
                    backgroundColor: "var(--z-card-up)",
                    border: "1px solid var(--z-border-mid)",
                    color: "var(--z-text)",
                  }}
                >
                  <FaCopy
                    className="size-4"
                    style={{ color: "var(--z-amber)" }}
                  />
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeletePresetModal(true)}
                  disabled={!selectedPreset}
                  className="
                    inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold
                    transition-all
                    hover:bg-[rgba(248,113,113,0.12)]
                    active:scale-95
                    disabled:cursor-not-allowed disabled:opacity-40
                  "
                  style={{
                    backgroundColor: "var(--z-card-up)",
                    border: "1px solid rgba(248,113,113,0.18)",
                    color: "var(--z-red)",
                  }}
                >
                  <FaTrash className="size-4" />
                  Delete
                </button>
              </div>
            </div>

            {selectedPreset && (
              <p className="mt-3 text-xs" style={{ color: "var(--z-subtle)" }}>
                <span
                  className="font-semibold"
                  style={{ color: "var(--z-text)" }}
                >
                  {selectedPreset.name}
                </span>{" "}
                targets {selectedPreset.mediaType.toLowerCase()} lists, stores{" "}
                {selectedPreset.lists.length} configured list rule set
                {selectedPreset.lists.length === 1 ? "" : "s"}, and remembers{" "}
                {selectedPreset.listsToRemoveFromAllEntries.length}{" "}
                remove-from-all selection
                {selectedPreset.listsToRemoveFromAllEntries.length === 1
                  ? ""
                  : "s"}
                .
              </p>
            )}
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
            disabled={!canProceed}
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
              You&apos;re about to update {configuredLists.length} custom list
              {configuredLists.length === 1 ? "" : "s"}
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
                    (l) =>
                      l.name === name &&
                      hasActiveIncludeRules(l.ruleSet, l.selectedOption),
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
              {configuredLists.map((list) => {
                const normalized = normalizeCustomListRuleConfig(list);
                const activeRules = normalized.ruleSet.rules.filter(
                  (rule) => rule.condition.trim().length > 0,
                );

                return (
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
                        {summarizeRuleSet(
                          normalized.ruleSet,
                          normalized.selectedOption,
                        )}
                      </span>
                      <ul
                        className="mt-2 space-y-1 text-xs"
                        style={{ color: "var(--z-subtle)" }}
                      >
                        {activeRules.map((rule) => (
                          <li key={rule.id}>
                            {rule.polarity === "exclude"
                              ? "Exclude"
                              : "Include"}
                            : {rule.condition}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.li>
                );
              })}
            </motion.ul>
          </div>
          {/* Backup Warning */}
          <div
            className="rounded-lg p-3"
            style={{
              backgroundColor: "rgba(248,113,113,0.07)",
              border: "1px solid rgba(248,113,113,0.25)",
            }}
          >
            <div className="flex items-start gap-2">
              <FaExclamationTriangle
                className="mt-0.5 size-4 shrink-0"
                style={{ color: "var(--z-red)" }}
              />
              <div>
                <p
                  className="mb-1 text-sm font-semibold"
                  style={{ color: "var(--z-red)" }}
                >
                  Have you backed up your AniList data?
                </p>
                <p
                  className="text-xs/relaxed"
                  style={{ color: "var(--z-muted)" }}
                >
                  Export your lists via{" "}
                  <strong>AniList → Account Settings → Export</strong> before
                  proceeding. Changes cannot be automatically reversed. By
                  continuing, <strong>you accept the risk.</strong>
                </p>
              </div>
            </div>
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
            name="newCustomListName"
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
            autoComplete="off"
            autoFocus={shouldAutoFocusAddListInput}
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

      <Modal
        isOpen={presetDialogMode !== null}
        onClose={() => {
          setPresetDialogMode(null);
          setPresetNameDraft("");
        }}
        onConfirm={handlePresetDialogConfirm}
        title={
          presetDialogMode === "duplicate" ? "Duplicate Preset" : "Save Preset"
        }
        confirmButtonText={
          presetDialogMode === "duplicate" ? "Duplicate" : "Save"
        }
      >
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--z-muted)" }}>
            {presetDialogMode === "duplicate"
              ? "Create a new preset from the selected saved strategy."
              : "Save the current media type, rules, visibility preference, and remove-from-all selections as a reusable local preset."}
          </p>
          <input
            type="text"
            name="workflowPresetName"
            className="w-full rounded-lg px-3 py-2 focus:outline-none"
            style={{
              backgroundColor: "var(--z-surface)",
              border: "1px solid var(--z-border)",
              color: "var(--z-text)",
            }}
            placeholder="Enter preset name"
            value={presetNameDraft}
            onChange={(event) => setPresetNameDraft(event.target.value)}
            autoComplete="off"
            maxLength={60}
            aria-label="Preset name"
          />
        </div>
      </Modal>

      <Modal
        isOpen={showDeletePresetModal}
        onClose={() => setShowDeletePresetModal(false)}
        onConfirm={handleDeletePreset}
        title="Delete Preset?"
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
              Delete the local preset{" "}
              <span className="font-bold">{selectedPreset?.name}</span>?
            </p>
          </div>
          <p className="text-sm" style={{ color: "var(--z-muted)" }}>
            This only removes the saved preset from this browser. It does not
            affect AniList or your current in-page rules.
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={matchPreview.open}
        onClose={() =>
          setMatchPreview((prev) => ({
            ...prev,
            open: false,
          }))
        }
        onConfirm={() =>
          setMatchPreview((prev) => ({
            ...prev,
            open: false,
          }))
        }
        title="Estimated Matches"
        confirmButtonText="Close"
      >
        {matchPreviewContent}
      </Modal>

      {/* Entry Preview Modal */}
      <Modal
        isOpen={entryPreview.open}
        onClose={() => setEntryPreview((prev) => ({ ...prev, open: false }))}
        onConfirm={() => setEntryPreview((prev) => ({ ...prev, open: false }))}
        title="Preview Entry Changes"
        confirmButtonText="Close"
      >
        {entryPreviewContent}
      </Modal>

      {/* Help Guide Modal */}
      <CustomListManagerHelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        onLoadDefaultTemplate={handleLoadDefaultTemplate}
      />

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
