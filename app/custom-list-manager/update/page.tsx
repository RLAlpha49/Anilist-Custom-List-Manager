"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  FaCheckCircle,
  FaChevronLeft,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaList,
  FaPause,
  FaPlay,
  FaRedo,
  FaSpinner,
  FaStop,
  FaTimes,
} from "react-icons/fa";
import { toast } from "sonner";

import Breadcrumbs from "@/components/breadcrumbs";
import Layout from "@/components/layout";
import LoadingIndicator from "@/components/loading-indicator";
import { useAuth } from "@/context/auth-context";
import { AniListRetryContext, fetchAniList } from "@/lib/api";
import {
  getBooleanItemWithExpiry,
  getItemWithExpiry,
  getJsonItemWithExpiry,
  setItemWithExpiry,
} from "@/lib/local-storage";
import { MediaEntry, MediaListResponse, RateLimitInfo } from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CustomListConfig {
  name: string;
  selectedOption: string;
}

type Phase =
  | "scanning"
  | "ready"
  | "processing"
  | "paused"
  | "stopped"
  | "complete"
  | "error";
type EntryState = "pending" | "updating" | "done" | "error";

interface EntryUpdate {
  entry: MediaEntry;
  newCustomLists: string[];
  prevCustomLists: string[];
  shouldHide: boolean;
}

interface TrackedEntry extends EntryUpdate {
  state: EntryState;
  errorMessage?: string;
}

interface EntryChangeSummary {
  added: string[];
  removed: string[];
  kept: string[];
  hideChanged: boolean;
  willHideFromStatusLists: boolean;
}

interface RetryStatus extends AniListRetryContext {
  startedAt: number;
}

type QueueListGroup = NonNullable<
  MediaListResponse["data"]["MediaListCollection"]
>["lists"][number];

type PendingAction = "pause" | "stop" | "complete" | null;

const PRE_REQUEST_RENDER_DELAY_MS = 120;
const REQUEST_INTERVAL_MS = 2000;
const LOW_RATE_LIMIT_THRESHOLD = 5;

const STATUS_REGEX = /^Status set to (.+)$/;
const SCORE_REGEX = /^Score set to (\d+)$/;
const GENRE_REGEX = /^Genres contain (.+)$/;
const TAG_REGEX = /^Tags contain (.+)$/;
const TAG_CATEGORY_REGEX = /^Tag Categories contain (.+)$/;
const FORMAT_REGEX = /^Format set to (.+)$/;

// ─── Condition Matching ───────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  Watching: "CURRENT",
  Reading: "CURRENT",
  Completed: "COMPLETED",
  Paused: "PAUSED",
  Planning: "PLANNING",
  Dropped: "DROPPED",
  Repeating: "REPEATING",
};

const FORMAT_MAP: Record<string, string> = {
  TV: "TV",
  TV_Short: "TV_SHORT",
  Movie: "MOVIE",
  Special: "SPECIAL",
  OVA: "OVA",
  ONA: "ONA",
  Music: "MUSIC",
  "Manga (Japan)": "MANGA",
  "Manga (South Korean)": "MANHWA",
  "Manga (Chinese)": "MANHUA",
  "One shot": "ONE_SHOT",
  Novel: "NOVEL",
};

const MANGA_REGION_COUNTRY_MAP: Record<string, string> = {
  "Manga (South Korean)": "KR",
  "Manga (Chinese)": "CN",
};

function matchesMangaRegion(label: string, entry: MediaEntry): boolean {
  if (entry.media.format !== "MANGA" && entry.media.format !== "ONE_SHOT") {
    return false;
  }

  const countryOfOrigin = entry.media.countryOfOrigin?.toUpperCase() ?? null;
  const expectedCountry = MANGA_REGION_COUNTRY_MAP[label];

  if (expectedCountry) {
    return countryOfOrigin === expectedCountry;
  }

  if (label === "Manga (Japan)") {
    return countryOfOrigin !== "KR" && countryOfOrigin !== "CN";
  }

  return false;
}

function matchCondition(condition: string, entry: MediaEntry): boolean {
  const statusMatch = STATUS_REGEX.exec(condition);
  if (statusMatch) {
    return (
      entry.status ===
      (STATUS_MAP[statusMatch[1]] ?? statusMatch[1].toUpperCase())
    );
  }
  if (condition === "Score set to below 5") {
    return entry.score > 0 && entry.score < 5;
  }
  const scoreMatch = SCORE_REGEX.exec(condition);
  if (scoreMatch) return entry.score === Number.parseInt(scoreMatch[1], 10);
  const genreMatch = GENRE_REGEX.exec(condition);
  if (genreMatch) return (entry.genres ?? []).includes(genreMatch[1]);
  const tagMatch = TAG_REGEX.exec(condition);
  if (tagMatch) return (entry.tags ?? []).includes(tagMatch[1]);
  const tagCatMatch = TAG_CATEGORY_REGEX.exec(condition);
  if (tagCatMatch) return (entry.tagCategories ?? []).includes(tagCatMatch[1]);
  const formatMatch = FORMAT_REGEX.exec(condition);
  if (formatMatch) {
    if (formatMatch[1].startsWith("Manga (")) {
      return matchesMangaRegion(formatMatch[1], entry);
    }

    return (
      entry.media.format === (FORMAT_MAP[formatMatch[1]] ?? formatMatch[1])
    );
  }
  if (condition === "Rewatched" || condition === "Reread") {
    return (entry.repeat ?? 0) > 0;
  }
  if (condition === "Adult (18+)") {
    return !!(entry.isAdult ?? entry.media.isAdult);
  }
  return false;
}

function computeNewCustomLists(
  entry: MediaEntry,
  listConfigs: CustomListConfig[],
  listsToRemove: string[],
  hideFromStatus: boolean,
): { newLists: string[]; changed: boolean; shouldHide: boolean } {
  const currentLists = new Set<string>(
    Object.entries(entry.customLists)
      .filter(([, v]) => v)
      .map(([k]) => k),
  );
  const newLists = new Set<string>(currentLists);

  for (const cfg of listConfigs) {
    if (!cfg.selectedOption) continue;
    if (matchCondition(cfg.selectedOption, entry)) {
      newLists.add(cfg.name);
    } else {
      newLists.delete(cfg.name);
    }
  }

  for (const name of listsToRemove) {
    newLists.delete(name);
  }

  const shouldHide = hideFromStatus && newLists.size > 0;
  const hideChanged = shouldHide !== entry.hiddenFromStatusLists;

  const changed =
    currentLists.size !== newLists.size ||
    [...newLists].some((n) => !currentLists.has(n)) ||
    [...currentLists].some((n) => !newLists.has(n)) ||
    hideChanged;

  return { newLists: [...newLists], changed, shouldHide };
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const waitForUiCommit = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

const getEntryTitle = (entry: MediaEntry): string =>
  entry.media.title.userPreferred ||
  entry.media.title.romaji ||
  entry.media.title.english ||
  "Unknown";

const TITLE_CLAMP_STYLE: CSSProperties = {
  display: "-webkit-box",
  overflow: "hidden",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
};

const getEntryChangeSummary = (entry: TrackedEntry): EntryChangeSummary => {
  const added = entry.newCustomLists.filter(
    (listName) => !entry.prevCustomLists.includes(listName),
  );
  const removed = entry.prevCustomLists.filter(
    (listName) => !entry.newCustomLists.includes(listName),
  );

  return {
    added,
    removed,
    kept: entry.newCustomLists.filter((listName) =>
      entry.prevCustomLists.includes(listName),
    ),
    hideChanged: entry.shouldHide !== entry.entry.hiddenFromStatusLists,
    willHideFromStatusLists: entry.shouldHide,
  };
};

const formatLabel = (value: string | null | undefined): string => {
  if (!value) {
    return "Unknown format";
  }

  return value.replaceAll("_", " ");
};

const formatStatusLabel = (value: string | null | undefined): string => {
  if (!value) {
    return "Unknown status";
  }

  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

type MetaTone = "neutral" | "pink" | "amber" | "frost" | "green" | "red";

const getStatusTone = (status: string | null | undefined): MetaTone => {
  switch (status) {
    case "COMPLETED":
      return "amber";
    case "CURRENT":
      return "frost";
    case "PLANNING":
      return "pink";
    case "PAUSED":
    case "DROPPED":
      return "red";
    case "REPEATING":
      return "green";
    default:
      return "neutral";
  }
};

const formatDurationLabel = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return remainingSeconds > 0
    ? `${minutes}m ${remainingSeconds}s`
    : `${minutes}m`;
};

const formatResetLabel = (
  resetAt: number | null | undefined,
): string | null => {
  if (!resetAt) {
    return null;
  }

  return new Date(resetAt * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
};

const getAniListEntryUrl = (entry: MediaEntry): string => {
  const mediaType =
    entry.media.type?.toLowerCase() === "manga" ? "manga" : "anime";

  return `https://anilist.co/${mediaType}/${entry.media.id}`;
};

function MetaPill({
  label,
  tone = "neutral",
}: Readonly<{
  label: string;
  tone?: MetaTone;
}>) {
  const styles = {
    neutral: {
      backgroundColor: "rgba(255,255,255,0.04)",
      border: "1px solid var(--z-border)",
      color: "var(--z-muted)",
    },
    pink: {
      backgroundColor: "rgba(232,121,249,0.12)",
      border: "1px solid rgba(232,121,249,0.2)",
      color: "var(--z-pink)",
    },
    amber: {
      backgroundColor: "var(--z-amber-dim)",
      border: "1px solid rgba(245,166,35,0.2)",
      color: "var(--z-amber)",
    },
    frost: {
      backgroundColor: "rgba(103,232,249,0.1)",
      border: "1px solid rgba(103,232,249,0.18)",
      color: "var(--z-frost)",
    },
    green: {
      backgroundColor: "rgba(34,197,94,0.1)",
      border: "1px solid rgba(34,197,94,0.18)",
      color: "var(--z-green)",
    },
    red: {
      backgroundColor: "rgba(248,113,113,0.1)",
      border: "1px solid rgba(248,113,113,0.18)",
      color: "var(--z-red)",
    },
  };

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={styles[tone]}
    >
      {label}
    </span>
  );
}

function buildTrackedEntries(
  lists: QueueListGroup[],
  listConfigs: CustomListConfig[],
  listsToRemove: string[],
  hideDefaultStatusLists: boolean,
): TrackedEntry[] {
  const entryMap = new Map<number, MediaEntry>();

  for (const list of lists) {
    for (const rawEntry of list.entries) {
      if (entryMap.has(rawEntry.id)) {
        continue;
      }

      const mediaTags = rawEntry.media.tags ?? [];

      entryMap.set(rawEntry.id, {
        ...rawEntry,
        genres: rawEntry.media.genres ?? [],
        tags: mediaTags.map((tag) => tag.name),
        tagCategories: [...new Set(mediaTags.map((tag) => tag.category))],
        isAdult: rawEntry.media.isAdult ?? false,
      });
    }
  }

  const updates: TrackedEntry[] = [];
  const selectedConfigs = listConfigs.filter((config) => config.selectedOption);

  for (const entry of entryMap.values()) {
    const { newLists, changed, shouldHide } = computeNewCustomLists(
      entry,
      selectedConfigs,
      listsToRemove,
      hideDefaultStatusLists,
    );

    if (!changed) {
      continue;
    }

    const prevCustomLists = Object.entries(entry.customLists)
      .filter(([, value]) => value)
      .map(([key]) => key);

    updates.push({
      entry,
      newCustomLists: newLists,
      prevCustomLists,
      shouldHide,
      state: "pending",
    });
  }

  return updates;
}

// ─── GraphQL ──────────────────────────────────────────────────────────────────

const MEDIA_LIST_QUERY = `
  query ($userId: Int, $type: MediaType) {
    MediaListCollection(userId: $userId, type: $type) {
      lists {
        name
        status
        isCustomList
        entries {
          id
          status
          score
          progress
          repeat
          hiddenFromStatusLists
          customLists
          media {
            id
            type
            title { romaji english native userPreferred }
            coverImage { extraLarge large medium }
            format
            countryOfOrigin
            isAdult
            genres
            tags { name category }
          }
        }
      }
    }
  }
`;

const SAVE_ENTRY_MUTATION = `
  mutation ($id: Int, $customLists: [String], $hiddenFromStatusLists: Boolean) {
    SaveMediaListEntry(
      id: $id
      customLists: $customLists
      hiddenFromStatusLists: $hiddenFromStatusLists
    ) {
      id
      mediaId
      customLists
      hiddenFromStatusLists
    }
  }
`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function CoverImage({
  src,
  alt,
  width,
  height,
}: Readonly<{
  src: string | null | undefined;
  alt: string;
  width: number;
  height: number;
}>) {
  return (
    <div
      className="shrink-0 overflow-hidden rounded-md"
      style={{ width, height }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          className="size-full object-cover"
        />
      ) : (
        <div
          className="size-full"
          style={{ backgroundColor: "var(--z-card-up)" }}
        />
      )}
    </div>
  );
}

function ListPill({
  name,
  variant,
}: Readonly<{
  name: string;
  variant: "added" | "removed" | "kept";
}>) {
  const styles = {
    added: {
      backgroundColor: "var(--z-amber-dim)",
      color: "var(--z-amber)",
      border: "1px solid rgba(245,166,35,0.3)",
    },
    removed: {
      backgroundColor: "rgba(248,113,113,0.1)",
      color: "var(--z-red)",
      border: "1px solid rgba(248,113,113,0.25)",
      textDecoration: "line-through",
    },
    kept: {
      backgroundColor: "var(--z-card-up)",
      color: "var(--z-muted)",
      border: "1px solid var(--z-border)",
    },
  };

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={styles[variant]}
    >
      {variant === "added" && (
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: "var(--z-amber)" }}
        />
      )}
      {name}
    </span>
  );
}

function AniListEntryLink({
  entry,
  compact = false,
}: Readonly<{
  entry: MediaEntry;
  compact?: boolean;
}>) {
  return (
    <a
      href={getAniListEntryUrl(entry)}
      target="_blank"
      rel="noreferrer"
      className={
        compact
          ? `
            inline-flex items-center justify-center rounded-full p-2 transition-all
            hover:bg-white/8
          `
          : `
            inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold
            transition-all
            hover:bg-white/8
          `
      }
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        color: "var(--z-frost)",
      }}
    >
      <FaExternalLinkAlt size={compact ? 11 : 10} />
      {compact ? (
        <span className="sr-only">Open on AniList</span>
      ) : (
        <span>Open on AniList</span>
      )}
    </a>
  );
}

function PendingCard({ entry }: Readonly<{ entry: TrackedEntry }>) {
  const title = getEntryTitle(entry.entry);
  const changeSummary = getEntryChangeSummary(entry);
  const cover =
    entry.entry.media.coverImage.extraLarge ??
    entry.entry.media.coverImage.large ??
    entry.entry.media.coverImage.medium;
  const changeCount =
    changeSummary.added.length +
    changeSummary.removed.length +
    (changeSummary.hideChanged ? 1 : 0);
  let visibilitySummary = "";

  if (changeSummary.hideChanged) {
    visibilitySummary = changeSummary.willHideFromStatusLists
      ? " • will hide from status lists"
      : " • will stay visible in status lists";
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, x: 24, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 280, damping: 28 }}
      className="relative overflow-hidden rounded-xl"
      style={{
        backgroundColor: "var(--z-card)",
        border: "1px solid rgba(245,166,35,0.18)",
        boxShadow: "0 10px 28px rgba(0,0,0,0.25)",
      }}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-xl"
        animate={{ opacity: [0.08, 0.18, 0.08] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        style={{ boxShadow: "0 0 0 1px rgba(245,166,35,0.18) inset" }}
      />
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
        <CoverImage src={cover} alt={title} width={118} height={168} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <FaList
              className="shrink-0"
              size={12}
              style={{ color: "var(--z-amber)" }}
            />
            <span
              className="text-[10px] font-bold tracking-widest uppercase"
              style={{ color: "var(--z-amber)" }}
            >
              Queued Next
            </span>
          </div>

          <p
            className="mb-3 text-xl/snug font-bold"
            style={{
              color: "var(--z-text)",
              fontFamily: "var(--font-syne)",
              ...TITLE_CLAMP_STYLE,
            }}
          >
            {title}
          </p>

          <div className="mb-3 flex flex-wrap gap-2">
            <MetaPill
              label={formatStatusLabel(entry.entry.status)}
              tone={getStatusTone(entry.entry.status)}
            />
            <MetaPill
              label={formatLabel(entry.entry.media.format)}
              tone="frost"
            />
            {changeSummary.hideChanged ? (
              <MetaPill
                label={
                  changeSummary.willHideFromStatusLists
                    ? "Will hide from status lists"
                    : "Will stay visible in status lists"
                }
                tone={changeSummary.willHideFromStatusLists ? "pink" : "green"}
              />
            ) : (
              <MetaPill label={`${changeCount} queued changes`} tone="amber" />
            )}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <AniListEntryLink entry={entry.entry} />
          </div>

          <p className="mb-3 text-sm" style={{ color: "var(--z-muted)" }}>
            {changeSummary.added.length} to add • {changeSummary.removed.length}{" "}
            to remove
            {visibilitySummary}
          </p>

          {changeSummary.added.length > 0 && (
            <div className="mb-2.5">
              <p
                className="mb-1 text-[9px] font-black tracking-widest uppercase"
                style={{ color: "var(--z-amber)" }}
              >
                Will add to
              </p>
              <div className="flex flex-wrap gap-1">
                {changeSummary.added.map((l) => (
                  <ListPill key={l} name={l} variant="added" />
                ))}
              </div>
            </div>
          )}

          {changeSummary.removed.length > 0 && (
            <div className="mb-2.5">
              <p
                className="mb-1 text-[9px] font-black tracking-widest uppercase"
                style={{ color: "var(--z-red)" }}
              >
                Will remove from
              </p>
              <div className="flex flex-wrap gap-1">
                {changeSummary.removed.map((l) => (
                  <ListPill key={l} name={l} variant="removed" />
                ))}
              </div>
            </div>
          )}

          {changeSummary.kept.length > 0 && (
            <div>
              <p
                className="mb-1 text-[9px] font-black tracking-widest uppercase"
                style={{ color: "var(--z-subtle)" }}
              >
                Staying in
              </p>
              <div className="flex flex-wrap gap-1">
                {changeSummary.kept.map((l) => (
                  <ListPill key={l} name={l} variant="kept" />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function UpdatingCard({ entry }: Readonly<{ entry: TrackedEntry }>) {
  const title = getEntryTitle(entry.entry);
  const changeSummary = getEntryChangeSummary(entry);
  const cover =
    entry.entry.media.coverImage.extraLarge ??
    entry.entry.media.coverImage.large ??
    entry.entry.media.coverImage.medium;
  let visibilitySummary = "";
  if (changeSummary.hideChanged) {
    visibilitySummary = changeSummary.willHideFromStatusLists
      ? " • hiding from status lists"
      : " • showing in status lists";
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -8 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="relative overflow-hidden rounded-xl"
      style={{
        backgroundColor: "var(--z-card)",
        border: "1px solid var(--z-pink)",
        boxShadow:
          "0 0 28px rgba(232,121,249,0.18), 0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      {/* Animated glow ring */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-xl"
        animate={{ opacity: [0.15, 0.5, 0.15] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        style={{ boxShadow: "0 0 0 2px rgba(232,121,249,0.55) inset" }}
      />

      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
        <CoverImage src={cover} alt={title} width={118} height={168} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <FaSpinner
              className="shrink-0 animate-spin"
              size={13}
              style={{ color: "var(--z-pink)" }}
            />
            <span
              className="text-[10px] font-bold tracking-widest uppercase"
              style={{ color: "var(--z-pink)" }}
            >
              Updating
            </span>
          </div>

          <p
            className="mb-3 text-xl/snug font-bold"
            style={{
              color: "var(--z-text)",
              fontFamily: "var(--font-syne)",
              ...TITLE_CLAMP_STYLE,
            }}
          >
            {title}
          </p>

          <div className="mb-3 flex flex-wrap gap-2">
            <MetaPill
              label={formatStatusLabel(entry.entry.status)}
              tone={getStatusTone(entry.entry.status)}
            />
            <MetaPill
              label={formatLabel(entry.entry.media.format)}
              tone="frost"
            />
            {changeSummary.hideChanged ? (
              <MetaPill
                label={
                  changeSummary.willHideFromStatusLists
                    ? "Will hide from status lists"
                    : "Will stay visible in status lists"
                }
                tone={changeSummary.willHideFromStatusLists ? "pink" : "green"}
              />
            ) : (
              <MetaPill
                label={`${
                  changeSummary.added.length + changeSummary.removed.length
                } changes applying`}
                tone="pink"
              />
            )}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <AniListEntryLink entry={entry.entry} />
          </div>

          <p className="mb-3 text-sm" style={{ color: "var(--z-muted)" }}>
            {changeSummary.added.length} to add • {changeSummary.removed.length}{" "}
            to remove
            {visibilitySummary}
          </p>

          {changeSummary.added.length > 0 && (
            <div className="mb-2.5">
              <p
                className="mb-1 text-[9px] font-black tracking-widest uppercase"
                style={{ color: "var(--z-amber)" }}
              >
                Adding to
              </p>
              <div className="flex flex-wrap gap-1">
                {changeSummary.added.map((l) => (
                  <ListPill key={l} name={l} variant="added" />
                ))}
              </div>
            </div>
          )}

          {changeSummary.removed.length > 0 && (
            <div className="mb-2.5">
              <p
                className="mb-1 text-[9px] font-black tracking-widest uppercase"
                style={{ color: "var(--z-red)" }}
              >
                Removing from
              </p>
              <div className="flex flex-wrap gap-1">
                {changeSummary.removed.map((l) => (
                  <ListPill key={l} name={l} variant="removed" />
                ))}
              </div>
            </div>
          )}

          {changeSummary.kept.length > 0 && (
            <div>
              <p
                className="mb-1 text-[9px] font-black tracking-widest uppercase"
                style={{ color: "var(--z-subtle)" }}
              >
                Staying in
              </p>
              <div className="flex flex-wrap gap-1">
                {changeSummary.kept.map((l) => (
                  <ListPill key={l} name={l} variant="kept" />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function DoneCard({ entry }: Readonly<{ entry: TrackedEntry }>) {
  const title = getEntryTitle(entry.entry);
  const changeSummary = getEntryChangeSummary(entry);
  const cover =
    entry.entry.media.coverImage.extraLarge ??
    entry.entry.media.coverImage.large ??
    entry.entry.media.coverImage.medium;
  let visibilitySummary = "";

  if (changeSummary.hideChanged) {
    visibilitySummary = changeSummary.willHideFromStatusLists
      ? " • hidden from status lists"
      : " • visible in status lists";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.96 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className="relative overflow-hidden rounded-xl"
      style={{
        backgroundColor: "var(--z-card)",
        border: "1px solid rgba(34,197,94,0.24)",
        boxShadow: "0 10px 28px rgba(0,0,0,0.24)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-xl"
        style={{ boxShadow: "0 0 0 1px rgba(34,197,94,0.18) inset" }}
      />
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
        <CoverImage src={cover} alt={title} width={118} height={168} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <FaCheckCircle
              className="shrink-0"
              size={12}
              style={{ color: "var(--z-green)" }}
            />
            <span
              className="text-[10px] font-bold tracking-widest uppercase"
              style={{ color: "var(--z-green)" }}
            >
              Done
            </span>
          </div>

          <p
            className="mb-3 text-xl/snug font-bold"
            style={{
              color: "var(--z-text)",
              fontFamily: "var(--font-syne)",
              ...TITLE_CLAMP_STYLE,
            }}
          >
            {title}
          </p>

          <div className="mb-3 flex flex-wrap gap-2">
            <MetaPill
              label={formatStatusLabel(entry.entry.status)}
              tone={getStatusTone(entry.entry.status)}
            />
            <MetaPill
              label={formatLabel(entry.entry.media.format)}
              tone="frost"
            />
            {changeSummary.hideChanged ? (
              <MetaPill
                label={
                  changeSummary.willHideFromStatusLists
                    ? "Hidden from status lists"
                    : "Visible in status lists"
                }
                tone={changeSummary.willHideFromStatusLists ? "pink" : "green"}
              />
            ) : (
              <MetaPill
                label={`${
                  changeSummary.added.length +
                  changeSummary.removed.length +
                  (changeSummary.hideChanged ? 1 : 0)
                } changes applied`}
                tone="green"
              />
            )}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <AniListEntryLink entry={entry.entry} />
          </div>

          <p className="mb-3 text-sm" style={{ color: "var(--z-muted)" }}>
            {changeSummary.added.length} added • {changeSummary.removed.length}{" "}
            removed
            {visibilitySummary}
          </p>

          {changeSummary.added.length > 0 && (
            <div className="mb-2.5">
              <p
                className="mb-1 text-[9px] font-black tracking-widest uppercase"
                style={{ color: "var(--z-amber)" }}
              >
                Added to
              </p>
              <div className="flex flex-wrap gap-1">
                {changeSummary.added.map((listName) => (
                  <ListPill key={listName} name={listName} variant="added" />
                ))}
              </div>
            </div>
          )}

          {changeSummary.removed.length > 0 && (
            <div className="mb-2.5">
              <p
                className="mb-1 text-[9px] font-black tracking-widest uppercase"
                style={{ color: "var(--z-red)" }}
              >
                Removed from
              </p>
              <div className="flex flex-wrap gap-1">
                {changeSummary.removed.map((listName) => (
                  <ListPill key={listName} name={listName} variant="removed" />
                ))}
              </div>
            </div>
          )}

          {changeSummary.kept.length > 0 && (
            <div>
              <p
                className="mb-1 text-[9px] font-black tracking-widest uppercase"
                style={{ color: "var(--z-subtle)" }}
              >
                Staying in
              </p>
              <div className="flex flex-wrap gap-1">
                {changeSummary.kept.map((listName) => (
                  <ListPill key={listName} name={listName} variant="kept" />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UpdatePage() {
  const router = useRouter();
  const { token } = useAuth();

  const [phase, setPhase] = useState<Phase>("scanning");
  const [pendingEntries, setPendingEntries] = useState<TrackedEntry[]>([]);
  const [erroredEntries, setErroredEntries] = useState<TrackedEntry[]>([]);
  const [currentUpdating, setCurrentUpdating] = useState<TrackedEntry | null>(
    null,
  );
  const [doneEntries, setDoneEntries] = useState<TrackedEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [queuedAction, setQueuedAction] = useState<PendingAction>(null);
  const [prepareRunId, setPrepareRunId] = useState(0);
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(
    null,
  );
  const [retryStatus, setRetryStatus] = useState<RetryStatus | null>(null);
  const [retryClock, setRetryClock] = useState(Date.now());
  const startTimeRef = useRef(0);
  const pendingQueueRef = useRef<TrackedEntry[]>([]);
  const updatedCountRef = useRef(0);
  const errorCountRef = useRef(0);
  const isProcessingRef = useRef(false);
  const pauseRequestedRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const completeRequestedRef = useRef(false);
  const navigationStopRequestedRef = useRef(false);

  const getAuthToken = (): string | null =>
    token ?? getItemWithExpiry<string>("anilistToken");

  const handleRetryState = (retryContext: AniListRetryContext) => {
    setRetryStatus({ ...retryContext, startedAt: Date.now() });
  };

  const updateRateLimitState = (nextRateLimit: RateLimitInfo | undefined) => {
    setRateLimitInfo(nextRateLimit ?? null);
    setRetryStatus(null);
  };

  useEffect(() => {
    return () => {
      navigationStopRequestedRef.current = true;
      stopRequestedRef.current = true;
      pauseRequestedRef.current = false;
      completeRequestedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!retryStatus) {
      return undefined;
    }

    setRetryClock(Date.now());
    const intervalId = globalThis.setInterval(() => {
      setRetryClock(Date.now());
    }, 1000);

    return () => globalThis.clearInterval(intervalId);
  }, [retryStatus]);

  useEffect(() => {
    const authToken = getAuthToken();
    let cancelled = false;
    navigationStopRequestedRef.current = false;

    pauseRequestedRef.current = false;
    stopRequestedRef.current = false;
    isProcessingRef.current = false;
    pendingQueueRef.current = [];
    updatedCountRef.current = 0;
    errorCountRef.current = 0;
    startTimeRef.current = 0;
    completeRequestedRef.current = false;

    setPendingEntries([]);
    setErroredEntries([]);
    setCurrentUpdating(null);
    setDoneEntries([]);
    setTotalCount(0);
    setProcessedCount(0);
    setFetchError(null);
    setQueuedAction(null);
    setRateLimitInfo(null);
    setRetryStatus(null);
    setPhase("scanning");

    if (!authToken) {
      setFetchError("Missing AniList token. Please log in again.");
      setPhase("error");
      return undefined;
    }

    const prepareQueue = async () => {
      const listConfigs = getJsonItemWithExpiry<CustomListConfig[]>(
        "lists",
        [],
      );
      const listsToRemove = getJsonItemWithExpiry<string[]>(
        "listsToRemoveFromAllEntries",
        [],
      );
      const listType = getItemWithExpiry<string>("listType") ?? "ANIME";
      const rawUserId = getItemWithExpiry<string>("userId");
      const userId = Number.parseInt(rawUserId ?? "0", 10);
      const hideDefaultStatusLists = getBooleanItemWithExpiry(
        "hideDefaultStatusLists",
        false,
      );

      if (!userId) {
        setFetchError("Missing user ID. Please log in again.");
        setPhase("error");
        return;
      }

      try {
        const response = await fetchAniList(
          MEDIA_LIST_QUERY,
          { userId, type: listType },
          authToken,
          handleRetryState,
        );

        updateRateLimitState(response.rateLimit);

        if (cancelled) {
          return;
        }
        const mediaListCollection = response.data.MediaListCollection as
          | MediaListResponse["data"]["MediaListCollection"]
          | undefined;
        const lists = mediaListCollection?.lists ?? [];
        const trackedEntries = buildTrackedEntries(
          lists,
          listConfigs,
          listsToRemove,
          hideDefaultStatusLists,
        );

        if (trackedEntries.length === 0) {
          setItemWithExpiry(
            "updateStats",
            JSON.stringify({ totalUpdated: 0, errorCount: 0, timeTaken: 0 }),
            60 * 60 * 1000,
          );
          setPhase("complete");
          return;
        }

        pendingQueueRef.current = trackedEntries;
        setPendingEntries(trackedEntries);
        setTotalCount(trackedEntries.length);
        setPhase("ready");
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error("Fatal fetch error:", err);
        setFetchError(
          err instanceof Error ? err.message : "Failed to fetch entries.",
        );
        setPhase("error");
      }
    };

    void prepareQueue();

    return () => {
      cancelled = true;
    };
  }, [prepareRunId, token]);

  const completeRun = (navigateToCompleted = false) => {
    const timeTaken =
      startTimeRef.current > 0
        ? Math.round((Date.now() - startTimeRef.current) / 1000)
        : 0;

    setItemWithExpiry(
      "updateStats",
      JSON.stringify({
        totalUpdated: updatedCountRef.current,
        errorCount: errorCountRef.current,
        timeTaken,
      }),
      60 * 60 * 1000,
    );
    setQueuedAction(null);
    setPhase("complete");

    if (navigateToCompleted) {
      router.push("/completed");
    }
  };

  const startProcessing = async () => {
    if (isProcessingRef.current) {
      return;
    }

    const authToken = getAuthToken();

    if (!authToken) {
      setFetchError("Missing AniList token. Please log in again.");
      setPhase("error");
      return;
    }

    if (pendingQueueRef.current.length === 0) {
      completeRun();
      return;
    }

    if (startTimeRef.current === 0) {
      startTimeRef.current = Date.now();
    }

    pauseRequestedRef.current = false;
    stopRequestedRef.current = false;
    completeRequestedRef.current = false;
    navigationStopRequestedRef.current = false;
    isProcessingRef.current = true;
    setQueuedAction(null);
    setPhase("processing");

    try {
      while (pendingQueueRef.current.length > 0) {
        const [nextEntry, ...rest] = pendingQueueRef.current;
        pendingQueueRef.current = rest;
        setPendingEntries(rest);
        setCurrentUpdating({ ...nextEntry, state: "updating" });

        const visibleAt = Date.now();
        await waitForUiCommit();
        await wait(PRE_REQUEST_RENDER_DELAY_MS);

        if (navigationStopRequestedRef.current || stopRequestedRef.current) {
          setCurrentUpdating(null);

          if (!navigationStopRequestedRef.current) {
            setQueuedAction(null);
            setPhase("stopped");
          }

          return;
        }

        try {
          const response = await fetchAniList(
            SAVE_ENTRY_MUTATION,
            {
              id: nextEntry.entry.id,
              customLists: nextEntry.newCustomLists,
              hiddenFromStatusLists: nextEntry.shouldHide,
            },
            authToken,
            handleRetryState,
          );
          updateRateLimitState(response.rateLimit);
          updatedCountRef.current += 1;

          const doneEntry: TrackedEntry = { ...nextEntry, state: "done" };
          setDoneEntries((prev) => [doneEntry, ...prev]);
        } catch (err) {
          console.error("Failed to update entry", nextEntry.entry.id, err);
          errorCountRef.current += 1;

          toast.error("Update Failed", {
            description: `Skipping "${getEntryTitle(nextEntry.entry)}".`,
          });

          setErroredEntries((prev) => [
            ...prev,
            {
              ...nextEntry,
              state: "error",
              errorMessage:
                err instanceof Error ? err.message : "Unknown error",
            },
          ]);
        } finally {
          const elapsedVisibleMs = Date.now() - visibleAt;
          if (elapsedVisibleMs < REQUEST_INTERVAL_MS) {
            await wait(REQUEST_INTERVAL_MS - elapsedVisibleMs);
          }

          setCurrentUpdating(null);
          setProcessedCount(updatedCountRef.current + errorCountRef.current);
        }

        if (stopRequestedRef.current) {
          if (navigationStopRequestedRef.current) {
            return;
          }

          setQueuedAction(null);
          setPhase("stopped");
          return;
        }

        if (completeRequestedRef.current) {
          completeRun(true);
          return;
        }

        if (pauseRequestedRef.current) {
          setQueuedAction(null);
          setPhase("paused");
          return;
        }
      }

      completeRun(completeRequestedRef.current);
    } finally {
      isProcessingRef.current = false;
    }
  };

  const handlePause = () => {
    pauseRequestedRef.current = true;
    stopRequestedRef.current = false;
    completeRequestedRef.current = false;
    setQueuedAction("pause");
  };

  const handleStop = () => {
    stopRequestedRef.current = true;
    pauseRequestedRef.current = false;
    completeRequestedRef.current = false;
    setQueuedAction("stop");

    if (!isProcessingRef.current) {
      setPhase("stopped");
    }
  };

  const handleComplete = () => {
    if (!isProcessingRef.current) {
      completeRun(true);
      return;
    }

    completeRequestedRef.current = true;
    pauseRequestedRef.current = false;
    stopRequestedRef.current = false;
    setQueuedAction("complete");
  };

  const handleRetryPreparation = () => {
    setPrepareRunId((prev) => prev + 1);
  };

  const remainingRetrySeconds = retryStatus
    ? Math.max(
        0,
        retryStatus.retryAfterSeconds -
          Math.floor((retryClock - retryStatus.startedAt) / 1000),
      )
    : null;
  const rateLimitResetLabel = formatResetLabel(rateLimitInfo?.resetAt);
  const rateLimitRemaining = rateLimitInfo?.remaining ?? null;
  const rateLimitLimit = rateLimitInfo?.limit ?? null;
  const hasRateLimitCard = Boolean(retryStatus || rateLimitInfo);
  const isRateLimitWarning =
    retryStatus?.reason === "rateLimit" ||
    (rateLimitRemaining ?? Number.POSITIVE_INFINITY) <=
      LOW_RATE_LIMIT_THRESHOLD;

  const progress = totalCount > 0 ? (processedCount / totalCount) * 100 : 0;
  const queuedCount = pendingEntries.length;
  let progressWidth = progress;
  if (phase === "complete") {
    progressWidth = 100;
  } else if (phase === "scanning") {
    progressWidth = 6;
  }
  const queueVisible =
    phase === "ready" ||
    phase === "processing" ||
    phase === "paused" ||
    phase === "stopped";
  const phaseLabel =
    phase === "ready"
      ? "Queue ready"
      : phase === "processing"
        ? queuedAction === "pause"
          ? "Pause queued"
          : queuedAction === "complete"
            ? "Complete queued"
            : queuedAction === "stop"
              ? "Stop queued"
              : "Updating now"
        : phase === "paused"
          ? "Paused"
          : phase === "stopped"
            ? "Stopped"
            : "Scanning library";
  const phaseDescription =
    phase === "ready"
      ? "Review the queue, then start when you are ready."
      : phase === "processing"
        ? queuedAction === "pause"
          ? "The current entry will finish, then the run will pause."
          : queuedAction === "complete"
            ? "The current entry will finish, then you will be taken to the completion summary."
            : queuedAction === "stop"
              ? "The current entry will finish, then the run will stop."
              : "Entries are currently being updated."
        : phase === "paused"
          ? "Your place is saved. Resume when you want to continue."
          : phase === "stopped"
            ? "The run was stopped. You can go back or continue the remaining queue."
            : "We are calculating the queue before anything changes on AniList.";
  let donePlaceholderMessage =
    "Completed entries will appear here once the run begins.";
  if (phase === "processing") {
    donePlaceholderMessage =
      "The next completed entry will slide in here as soon as this request finishes.";
  } else if (phase === "paused") {
    donePlaceholderMessage =
      "No new entries will appear here until you resume the run.";
  } else if (phase === "stopped") {
    donePlaceholderMessage =
      "The run is stopped, so no new completed entries will be added here.";
  }
  const breadcrumbs = [
    { name: "Home", href: "/" },
    { name: "Custom List Manager", href: "/custom-list-manager" },
    { name: "Update" },
  ];

  return (
    <Layout>
      <Breadcrumbs breadcrumbs={breadcrumbs} />
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <p
            className="mb-2 text-xs font-semibold tracking-widest uppercase"
            style={{ color: "var(--z-amber)" }}
          >
            Step 3 of 3 — Update
          </p>
          <h1
            className="text-3xl font-black"
            style={{
              fontFamily: "var(--font-syne-var)",
              color: "var(--z-text)",
            }}
          >
            Updating Your Lists
          </h1>
          <p
            className="mt-2 max-w-2xl text-sm"
            style={{ color: "var(--z-muted)" }}
          >
            Review the queue, track progress, and let the updater handle your
            AniList changes.
          </p>
        </motion.div>

        {phase === "error" && (
          <div className="flex min-h-[60vh] flex-col items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-md"
            >
              <div
                className="rounded-2xl p-8 text-center"
                style={{
                  backgroundColor: "var(--z-card)",
                  border: "1px solid rgba(248,113,113,0.35)",
                  boxShadow: "0 0 40px rgba(248,113,113,0.1)",
                }}
              >
                <div
                  className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: "rgba(248,113,113,0.12)",
                    border: "2px solid rgba(248,113,113,0.35)",
                  }}
                >
                  <FaExclamationTriangle
                    size={22}
                    style={{ color: "var(--z-red)" }}
                  />
                </div>
                <h2
                  className="mb-2 text-xl font-black"
                  style={{
                    fontFamily: "var(--font-syne)",
                    color: "var(--z-text)",
                  }}
                >
                  Something went wrong
                </h2>
                <p className="mb-7 text-sm" style={{ color: "var(--z-muted)" }}>
                  {fetchError}
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => router.push("/custom-list-manager")}
                    className="
                      cursor-pointer rounded-lg px-4 py-2.5 text-sm font-medium transition-all
                      hover:bg-z-card-up
                      active:scale-95
                    "
                    style={{
                      border: "1px solid var(--z-border-mid)",
                      color: "var(--z-muted)",
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaChevronLeft size={9} />
                      Go Back
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      handleRetryPreparation();
                    }}
                    className="
                      cursor-pointer rounded-lg px-5 py-2.5 text-sm font-bold transition-all
                      hover:brightness-110
                      active:scale-95
                    "
                    style={{
                      backgroundColor: "var(--z-amber)",
                      color: "#07060f",
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaRedo size={9} />
                      Retry
                    </span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {phase === "scanning" && (
          <div className="flex flex-col items-center justify-center py-28">
            <LoadingIndicator size="lg" />
            <p className="mt-4 text-sm" style={{ color: "var(--z-muted)" }}>
              This may take a moment for large libraries.
            </p>
          </div>
        )}

        {phase === "complete" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-28"
          >
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 20 }}
              className="mb-5 flex size-20 items-center justify-center rounded-full"
              style={{
                backgroundColor: "rgba(34,197,94,0.1)",
                border: "2px solid rgba(34,197,94,0.4)",
                boxShadow: "0 0 40px rgba(34,197,94,0.2)",
              }}
            >
              <FaCheckCircle size={34} style={{ color: "var(--z-green)" }} />
            </motion.div>
            <h2
              className="text-2xl font-black"
              style={{
                fontFamily: "var(--font-syne)",
                color: "var(--z-text)",
              }}
            >
              All done!
            </h2>
            <p className="mt-2 text-sm" style={{ color: "var(--z-muted)" }}>
              Review the final tally, then continue to your completion summary
              when you are ready.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => router.push("/completed")}
                className="
                  rounded-lg px-6 py-3 text-sm font-bold transition-all
                  hover:brightness-110
                  active:scale-95
                "
                style={{
                  background:
                    "linear-gradient(135deg, var(--z-amber) 0%, #ef8d2f 100%)",
                  color: "#07060f",
                }}
              >
                Complete & View Summary
              </button>
              <button
                type="button"
                onClick={() => router.push("/custom-list-manager")}
                className="
                  rounded-lg px-6 py-3 text-sm font-medium transition-all
                  hover:bg-z-card-up
                  active:scale-95
                "
                style={{
                  border: "1px solid var(--z-border-mid)",
                  color: "var(--z-muted)",
                }}
              >
                Back to Manager
              </button>
            </div>
          </motion.div>
        )}

        {queueVisible && (
          <div className="space-y-6">
            {/* Phase Status */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p
                    className="mb-2 text-[10px] font-bold tracking-widest uppercase"
                    style={{ color: "var(--z-amber)" }}
                  >
                    {phaseLabel}
                  </p>
                  <h2
                    className="text-2xl font-black"
                    style={{
                      color: "var(--z-text)",
                      fontFamily: "var(--font-syne)",
                    }}
                  >
                    {queuedCount} queued change{queuedCount === 1 ? "" : "s"}
                  </h2>
                  <p
                    className="mt-1 text-sm"
                    style={{ color: "var(--z-muted)" }}
                  >
                    {phaseDescription}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <MetaPill label={`${queuedCount} queued`} tone="amber" />
                    <MetaPill
                      label={`${doneEntries.length} done`}
                      tone="green"
                    />
                    {erroredEntries.length > 0 && (
                      <MetaPill
                        label={`${erroredEntries.length} skipped`}
                        tone="red"
                      />
                    )}
                  </div>
                </div>

                {hasRateLimitCard && (
                  <div
                    className="w-full shrink-0 rounded-xl p-3 sm:max-w-sm"
                    style={{
                      backgroundColor: retryStatus
                        ? "rgba(245,166,35,0.1)"
                        : isRateLimitWarning
                          ? "rgba(245,166,35,0.08)"
                          : "rgba(103,232,249,0.08)",
                      border:
                        retryStatus || isRateLimitWarning
                          ? "1px solid rgba(245,166,35,0.2)"
                          : "1px solid rgba(103,232,249,0.16)",
                    }}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                        {retryStatus ? (
                          <FaSpinner
                            className="mt-0.5 shrink-0 animate-spin"
                            size={13}
                            style={{ color: "var(--z-amber)" }}
                          />
                        ) : (
                          <FaExclamationTriangle
                            className="mt-0.5 shrink-0"
                            size={13}
                            style={{
                              color: isRateLimitWarning
                                ? "var(--z-amber)"
                                : "var(--z-frost)",
                            }}
                          />
                        )}
                        <div>
                          <p
                            className="text-[10px] font-black tracking-widest uppercase"
                            style={{
                              color:
                                retryStatus || isRateLimitWarning
                                  ? "var(--z-amber)"
                                  : "var(--z-frost)",
                            }}
                          >
                            {retryStatus
                              ? "AniList retry in progress"
                              : "AniList request budget"}
                          </p>
                          <p
                            className="mt-1 text-sm"
                            style={{ color: "var(--z-text)" }}
                          >
                            {retryStatus
                              ? retryStatus.reason === "serverError"
                                ? `AniList returned a server error, so the next retry starts in ${formatDurationLabel(remainingRetrySeconds ?? retryStatus.retryAfterSeconds)}.`
                                : `AniList is rate limiting requests, so updates are paused for ${formatDurationLabel(remainingRetrySeconds ?? retryStatus.retryAfterSeconds)} before retry ${retryStatus.retryAttempt}.`
                              : rateLimitRemaining !== null &&
                                  rateLimitLimit !== null
                                ? `Requests remaining: ${rateLimitRemaining} of ${rateLimitLimit}.`
                                : "Watching AniList rate-limit headers for the next update window."}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {rateLimitRemaining !== null &&
                          rateLimitLimit !== null && (
                            <MetaPill
                              label={`${rateLimitRemaining} / ${rateLimitLimit} remaining`}
                              tone={isRateLimitWarning ? "amber" : "frost"}
                            />
                          )}
                        {rateLimitResetLabel && (
                          <MetaPill
                            label={`Reset around ${rateLimitResetLabel}`}
                            tone="neutral"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Separator */}
            <div style={{ borderTop: "1px solid var(--z-border)" }} />

            {/* Control Toolbar */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="flex flex-wrap items-center gap-3"
            >
              {phase === "ready" && (
                <>
                  <button
                    onClick={() => void startProcessing()}
                    className="
                      flex cursor-pointer items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold
                      transition-all
                      hover:brightness-110
                      active:scale-[0.97]
                    "
                    style={{
                      background:
                        "linear-gradient(135deg, var(--z-amber) 0%, #ef8d2f 100%)",
                      color: "#07060f",
                    }}
                  >
                    <FaPlay size={10} />
                    Start Update
                  </button>
                  <button
                    onClick={handleComplete}
                    className="
                      flex cursor-pointer items-center gap-2 rounded-lg px-5 py-3 text-sm
                      font-semibold transition-all
                      hover:bg-z-card-up
                      active:scale-[0.97]
                    "
                    style={{
                      border: "1px solid rgba(34,197,94,0.28)",
                      color: "var(--z-green)",
                    }}
                  >
                    <FaCheckCircle size={10} />
                    Complete
                  </button>
                  <button
                    onClick={() => router.push("/custom-list-manager")}
                    className="
                      flex cursor-pointer items-center gap-2 rounded-lg px-5 py-3 text-sm
                      font-medium transition-all
                      hover:bg-z-card-up
                      active:scale-[0.97]
                    "
                    style={{
                      border: "1px solid var(--z-border-mid)",
                      color: "var(--z-muted)",
                    }}
                  >
                    <FaChevronLeft size={10} />
                    Back
                  </button>
                </>
              )}

              {phase === "processing" && (
                <>
                  <button
                    onClick={handlePause}
                    disabled={queuedAction !== null}
                    className="
                      flex cursor-pointer items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold
                      transition-all
                      hover:bg-z-card-up
                      active:scale-[0.97]
                      disabled:cursor-not-allowed disabled:opacity-45
                    "
                    style={{
                      border: "1px solid rgba(232,121,249,0.28)",
                      color: "var(--z-pink)",
                    }}
                  >
                    <FaPause size={10} />
                    Pause
                  </button>
                  <button
                    onClick={handleComplete}
                    disabled={queuedAction !== null}
                    className="
                      flex cursor-pointer items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold
                      transition-all
                      hover:bg-z-card-up
                      active:scale-[0.97]
                      disabled:cursor-not-allowed disabled:opacity-45
                    "
                    style={{
                      border: "1px solid rgba(34,197,94,0.28)",
                      color: "var(--z-green)",
                    }}
                  >
                    <FaCheckCircle size={10} />
                    Complete
                  </button>
                  <button
                    onClick={handleStop}
                    disabled={queuedAction !== null}
                    className="
                      flex cursor-pointer items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold
                      transition-all
                      hover:bg-z-card-up
                      active:scale-[0.97]
                      disabled:cursor-not-allowed disabled:opacity-45
                    "
                    style={{
                      border: "1px solid rgba(248,113,113,0.28)",
                      color: "var(--z-red)",
                    }}
                  >
                    <FaStop size={10} />
                    Stop
                  </button>
                </>
              )}

              {phase === "paused" && (
                <>
                  <button
                    onClick={() => void startProcessing()}
                    className="
                      flex cursor-pointer items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold
                      transition-all
                      hover:brightness-110
                      active:scale-[0.97]
                    "
                    style={{
                      background:
                        "linear-gradient(135deg, var(--z-amber) 0%, #ef8d2f 100%)",
                      color: "#07060f",
                    }}
                  >
                    <FaPlay size={10} />
                    Resume
                  </button>
                  <button
                    onClick={handleComplete}
                    className="
                      flex cursor-pointer items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold
                      transition-all
                      hover:bg-z-card-up
                      active:scale-[0.97]
                    "
                    style={{
                      border: "1px solid rgba(34,197,94,0.28)",
                      color: "var(--z-green)",
                    }}
                  >
                    <FaCheckCircle size={10} />
                    Complete
                  </button>
                  <button
                    onClick={handleStop}
                    className="
                      flex cursor-pointer items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold
                      transition-all
                      hover:bg-z-card-up
                      active:scale-[0.97]
                    "
                    style={{
                      border: "1px solid rgba(248,113,113,0.28)",
                      color: "var(--z-red)",
                    }}
                  >
                    <FaStop size={10} />
                    Stop
                  </button>
                </>
              )}

              {phase === "stopped" && (
                <>
                  {pendingEntries.length > 0 && (
                    <button
                      onClick={() => void startProcessing()}
                      className="
                        flex cursor-pointer items-center gap-2 rounded-lg px-5 py-3 text-sm
                        font-bold transition-all
                        hover:brightness-110
                        active:scale-[0.97]
                      "
                      style={{
                        background:
                          "linear-gradient(135deg, var(--z-amber) 0%, #ef8d2f 100%)",
                        color: "#07060f",
                      }}
                    >
                      <FaPlay size={10} />
                      Start Remaining
                    </button>
                  )}
                  <button
                    onClick={handleComplete}
                    className="
                      flex cursor-pointer items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold
                      transition-all
                      hover:bg-z-card-up
                      active:scale-[0.97]
                    "
                    style={{
                      border: "1px solid rgba(34,197,94,0.28)",
                      color: "var(--z-green)",
                    }}
                  >
                    <FaCheckCircle size={10} />
                    Complete
                  </button>
                  <button
                    onClick={() => router.push("/custom-list-manager")}
                    className="
                      flex cursor-pointer items-center gap-2 rounded-lg px-5 py-3 text-sm
                      font-medium transition-all
                      hover:bg-z-card-up
                      active:scale-[0.97]
                    "
                    style={{
                      border: "1px solid var(--z-border-mid)",
                      color: "var(--z-muted)",
                    }}
                  >
                    <FaChevronLeft size={10} />
                    Back
                  </button>
                </>
              )}
            </motion.div>

            {/* Progress */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-xl p-4"
              style={{
                backgroundColor: "var(--z-card)",
                border: "1px solid var(--z-border)",
              }}
            >
              <div className="
                mb-3 flex flex-col gap-3
                sm:flex-row sm:items-start sm:justify-between
              ">
                <div>
                  <p
                    className="text-[10px] font-black tracking-widest uppercase"
                    style={{ color: "var(--z-pink)" }}
                  >
                    Update progress
                  </p>
                  <p
                    className="mt-1 text-sm"
                    style={{ color: "var(--z-muted)" }}
                  >
                    {processedCount} completed • {queuedCount} still queued
                  </p>
                </div>
                <p
                  className="text-lg font-black tabular-nums"
                  style={{ color: "var(--z-text)" }}
                >
                  {processedCount}
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--z-muted)" }}
                  >
                    {" "}
                    / {totalCount}
                  </span>
                </p>
              </div>

              <div
                className="h-2.5 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: "var(--z-card-up)" }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, var(--z-amber) 0%, var(--z-pink) 100%)",
                  }}
                  initial={{ width: "0%" }}
                  animate={{ width: `${progressWidth}%` }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                />
              </div>

              {erroredEntries.length > 0 && (
                <p className="mt-3 text-xs" style={{ color: "var(--z-red)" }}>
                  {erroredEntries.length} entr
                  {erroredEntries.length === 1 ? "y" : "ies"} skipped so far.
                </p>
              )}
            </motion.div>

            {/* Updating Now */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <motion.span
                  animate={{ opacity: [1, 0.25, 1] }}
                  transition={{ duration: 1.3, repeat: Infinity }}
                  className="size-2 rounded-full"
                  style={{ backgroundColor: "var(--z-pink)" }}
                />
                <h2
                  className="text-xs font-black tracking-widest uppercase"
                  style={{ color: "var(--z-pink)" }}
                >
                  Updating Now
                </h2>
              </div>

              <AnimatePresence mode="wait">
                {currentUpdating ? (
                  <UpdatingCard
                    key={currentUpdating.entry.id}
                    entry={currentUpdating}
                  />
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="
                      flex min-h-40 items-center justify-center rounded-xl p-6 text-center text-sm
                    "
                    style={{
                      color: "var(--z-muted)",
                      border: "1px dashed var(--z-border)",
                    }}
                  >
                    {phase === "ready"
                      ? "Everything is queued. Press Start when you want to begin."
                      : phase === "paused"
                        ? "Paused right here. Resume when you are ready for the next entry."
                        : phase === "stopped"
                          ? "The run was stopped before the next request."
                          : "Waiting for next entry…"}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Queue + Done */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {/* Queue */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <FaList size={11} style={{ color: "var(--z-amber)" }} />
                  <h2
                    className="text-xs font-black tracking-widest uppercase"
                    style={{ color: "var(--z-amber)" }}
                  >
                    In Queue
                  </h2>
                  <span
                    className="ml-auto rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                    style={{
                      backgroundColor: "var(--z-amber-dim)",
                      color: "var(--z-amber)",
                    }}
                  >
                    {pendingEntries.length}
                  </span>
                </div>

                <div
                  className="rounded-xl p-3"
                  style={{
                    backgroundColor: "var(--z-surface)",
                    border: "1px solid var(--z-border)",
                  }}
                >
                  <div className="max-h-168 overflow-y-auto pr-1 sm:pr-2">
                    <div className="space-y-3">
                      <AnimatePresence>
                        {pendingEntries.map((entry) => (
                          <PendingCard key={entry.entry.id} entry={entry} />
                        ))}
                      </AnimatePresence>

                      {pendingEntries.length === 0 && (
                        <div
                          className="
                            flex min-h-40 items-center justify-center rounded-xl py-12 text-sm
                          "
                          style={{
                            color: "var(--z-muted)",
                            border: "1px dashed var(--z-border)",
                          }}
                        >
                          Queue empty
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Done + Skipped */}
              <div className="space-y-5">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="mb-3 flex items-center gap-2">
                    <FaCheckCircle
                      size={11}
                      style={{ color: "var(--z-green)" }}
                    />
                    <h2
                      className="text-xs font-black tracking-widest uppercase"
                      style={{ color: "var(--z-green)" }}
                    >
                      Done
                    </h2>
                    <span
                      className="ml-auto rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                      style={{
                        backgroundColor: "rgba(34,197,94,0.12)",
                        color: "var(--z-green)",
                      }}
                    >
                      {doneEntries.length}
                    </span>
                  </div>

                  <div
                    className="rounded-xl p-3"
                    style={{
                      backgroundColor: "var(--z-surface)",
                      border: "1px solid var(--z-border)",
                    }}
                  >
                    <div className="max-h-168 overflow-y-auto pr-1 sm:pr-2">
                      {doneEntries.length > 0 ? (
                        <div className="space-y-3">
                          <AnimatePresence>
                            {doneEntries.map((entry) => (
                              <DoneCard
                                key={`done-${entry.entry.id}`}
                                entry={entry}
                              />
                            ))}
                          </AnimatePresence>
                        </div>
                      ) : (
                        <div
                          className="rounded-xl border border-dashed px-4 py-5 text-sm"
                          style={{
                            color: "var(--z-muted)",
                            borderColor: "var(--z-border)",
                          }}
                        >
                          {donePlaceholderMessage}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>

                {erroredEntries.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="mb-3 flex items-center gap-2">
                      <FaTimes size={11} style={{ color: "var(--z-red)" }} />
                      <h2
                        className="text-xs font-black tracking-widest uppercase"
                        style={{ color: "var(--z-red)" }}
                      >
                        Skipped
                      </h2>
                    </div>
                    <div className="space-y-2">
                      {erroredEntries.map((entry) => (
                        <motion.div
                          key={`err-${entry.entry.id}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex items-start gap-3 rounded-xl p-4"
                          style={{
                            backgroundColor: "rgba(248,113,113,0.07)",
                            border: "1px solid rgba(248,113,113,0.22)",
                          }}
                        >
                          <FaTimes
                            size={12}
                            style={{ color: "var(--z-red)", flexShrink: 0 }}
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-sm font-medium"
                              style={{ color: "var(--z-text)" }}
                            >
                              {getEntryTitle(entry.entry)}
                            </p>
                            <p
                              className="mt-1 text-xs"
                              style={{ color: "var(--z-red)" }}
                            >
                              {entry.errorMessage ?? "Update failed — skipped"}
                            </p>
                            <div className="mt-2">
                              <AniListEntryLink entry={entry.entry} />
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
