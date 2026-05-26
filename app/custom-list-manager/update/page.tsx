"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
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
import { useAuth } from "@/context/auth-context";
import { AniListRetryContext, fetchAniList } from "@/lib/api";
import {
  computeEntryWorkflowUpdate,
  fetchAllWorkflowMediaEntries,
  getMediaEntryTitle,
  WORKFLOW_MEDIA_LIST_QUERY,
  type WorkflowMediaListQueryVariables,
} from "@/lib/custom-list-workflow";
import { classifyFallbackFailure, getFallbackCopy } from "@/lib/fallback-ux";
import {
  getBooleanItemWithExpiry,
  getItemWithExpiry,
  getJsonItemWithExpiry,
  isStorageFallbackResult,
  normalizeUserId,
  setItemWithExpiry,
  STORAGE_KEYS,
  STORAGE_TTLS,
} from "@/lib/local-storage";
import {
  AniListRequestVariables,
  type CustomListRuleConfig,
  MediaEntry,
  MediaListResponse,
  MutationResponse,
  RateLimitInfo,
} from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface SaveEntryMutationVariables extends AniListRequestVariables {
  id: number;
  customLists: string[];
  hiddenFromStatusLists: boolean;
}

type BatchedSaveEntryMutationData = Record<string, { id: number }>;

type PendingAction = "pause" | "stop" | "complete" | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const LOW_RATE_LIMIT_THRESHOLD = 5;
const REQUEST_INTERVAL_MS = 3000;
const REQUEST_DELAY_POLL_INTERVAL_MS = 60;
const DEFAULT_MUTATION_BATCH_SIZE = 9;
const MAX_MUTATION_BATCH_SIZE = 15;
const MIN_MUTATION_BATCH_SIZE = 3;
const RATE_LIMIT_SAFETY_RESERVE = 2;
const VIRTUAL_ROW_GAP_PX = 6;
const CARD_ANIMATION_DURATION_SECONDS = 0.28;
const DEFAULT_CONSECUTIVE_FAILURE_THRESHOLD = 5;

const resolveConsecutiveFailureThreshold = (): number => {
  const rawThreshold = process.env.NEXT_PUBLIC_UPDATER_FAIL_FAST_THRESHOLD;
  if (!rawThreshold) return DEFAULT_CONSECUTIVE_FAILURE_THRESHOLD;
  const parsedThreshold = Number.parseInt(rawThreshold, 10);
  if (!Number.isFinite(parsedThreshold) || parsedThreshold <= 0)
    return DEFAULT_CONSECUTIVE_FAILURE_THRESHOLD;
  return parsedThreshold;
};

const CONSECUTIVE_FAILURE_THRESHOLD = resolveConsecutiveFailureThreshold();

// ─── Utilities ────────────────────────────────────────────────────────────────

const waitForUiCommit = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getProcessingBatchSize = (
  rateLimitInfo: RateLimitInfo | null,
  pendingCount: number,
): number => {
  if (pendingCount <= 0) return 0;
  if (!rateLimitInfo?.remaining || rateLimitInfo.remaining <= 0) {
    return Math.min(DEFAULT_MUTATION_BATCH_SIZE, pendingCount);
  }
  const availableRequestBudget = Math.max(
    MIN_MUTATION_BATCH_SIZE,
    rateLimitInfo.remaining - RATE_LIMIT_SAFETY_RESERVE,
  );
  return Math.min(
    Math.max(MIN_MUTATION_BATCH_SIZE, availableRequestBudget),
    MAX_MUTATION_BATCH_SIZE,
    pendingCount,
  );
};

const buildBatchedSaveEntryMutation = (
  entries: TrackedEntry[],
): {
  mutation: string;
  variables: AniListRequestVariables;
  aliases: string[];
} => {
  const variableDefinitions: string[] = [];
  const mutationFields: string[] = [];
  const variables: AniListRequestVariables = {};
  const aliases: string[] = [];

  for (const [index, entry] of entries.entries()) {
    const idVar = `id${index}`;
    const clVar = `customLists${index}`;
    const hiddenVar = `hiddenFromStatusLists${index}`;
    const alias = `entry${index}`;
    aliases.push(alias);
    variableDefinitions.push(
      `$${idVar}: Int`,
      `$${clVar}: [String]`,
      `$${hiddenVar}: Boolean`,
    );
    mutationFields.push(
      `${alias}: SaveMediaListEntry(id: $${idVar}, customLists: $${clVar}, hiddenFromStatusLists: $${hiddenVar}) { id }`,
    );
    variables[idVar] = entry.entry.id;
    variables[clVar] = entry.newCustomLists;
    variables[hiddenVar] = entry.shouldHide;
  }

  return {
    mutation: `mutation (${variableDefinitions.join(", ")}) { ${mutationFields.join(" ")} }`,
    variables,
    aliases,
  };
};

const hasSuccessfulBatchedSaveResponse = (
  data: unknown,
  aliases: string[],
): data is BatchedSaveEntryMutationData => {
  if (!isRecord(data)) return false;
  return aliases.every((alias) => {
    const r = data[alias];
    return isRecord(r) && typeof r.id === "number";
  });
};

const getEntryTitle = getMediaEntryTitle;

const TITLE_CLAMP_STYLE: CSSProperties = {
  display: "block",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
};

const getEntryChangeSummary = (entry: TrackedEntry): EntryChangeSummary => {
  const added = entry.newCustomLists.filter(
    (n) => !entry.prevCustomLists.includes(n),
  );
  const removed = entry.prevCustomLists.filter(
    (n) => !entry.newCustomLists.includes(n),
  );
  return {
    added,
    removed,
    kept: entry.newCustomLists.filter((n) => entry.prevCustomLists.includes(n)),
    hideChanged: entry.shouldHide !== entry.entry.hiddenFromStatusLists,
    willHideFromStatusLists: entry.shouldHide,
  };
};

const formatStatusLabel = (value: string | null | undefined): string => {
  if (!value) return "Unknown";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
};

const formatResetLabel = (
  resetAt: number | null | undefined,
): string | null => {
  if (!resetAt) return null;
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

function buildTrackedEntries(
  entries: MediaEntry[],
  listConfigs: CustomListRuleConfig[],
  listsToRemove: string[],
  hideDefaultStatusLists: boolean,
): TrackedEntry[] {
  const updates: TrackedEntry[] = [];
  for (const entry of entries) {
    const { newLists, changed, shouldHide } = computeEntryWorkflowUpdate(
      entry,
      listConfigs,
      listsToRemove,
      hideDefaultStatusLists,
    );
    if (!changed) continue;
    const prevCustomLists = Object.entries(entry.customLists)
      .filter(([, v]) => v)
      .map(([k]) => k);
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

// ─── Design Primitives ────────────────────────────────────────────────────────

function MetaPill({
  label,
  tone = "neutral",
}: Readonly<{ label: string; tone?: MetaTone }>) {
  const styles: Record<MetaTone, React.CSSProperties> = {
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

// ─── Orbital Progress Ring ────────────────────────────────────────────────────

function OrbitalProgress({
  progress,
  processedCount,
  totalCount,
  phase,
}: Readonly<{
  progress: number;
  processedCount: number;
  totalCount: number;
  phase: Phase;
}>) {
  const size = 148;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 58;
  const innerR = 44;
  const circ = 2 * Math.PI * outerR;
  const clamped = Math.min(100, Math.max(0, progress));
  const dashOffset = circ - (clamped / 100) * circ;
  const isScanning = phase === "scanning";

  return (
    <div
      className="relative mx-auto flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="orb-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--z-amber)" />
            <stop offset="100%" stopColor="var(--z-pink)" />
          </linearGradient>
        </defs>
        {/* Tick marks */}
        {Array.from({ length: 24 }, (_, i) => i * 15).map((deg) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          const x1 = cx + (outerR + 5) * Math.cos(rad);
          const y1 = cy + (outerR + 5) * Math.sin(rad);
          const x2 = cx + (outerR + 8) * Math.cos(rad);
          const y2 = cy + (outerR + 8) * Math.sin(rad);
          return (
            <line
              key={deg}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--z-border)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}
        {/* Inner decorative ring */}
        <circle
          cx={cx}
          cy={cy}
          r={innerR}
          fill="none"
          stroke="var(--z-border)"
          strokeWidth="1"
          strokeDasharray="2 6"
        />
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={outerR}
          fill="none"
          stroke="var(--z-card-high)"
          strokeWidth="7"
        />
        {/* Progress arc */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={outerR}
          fill="none"
          stroke="url(#orb-grad)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: isScanning ? circ * 0.88 : dashOffset }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          style={{
            transform: `rotate(-90deg)`,
            transformOrigin: `${cx}px ${cy}px`,
          }}
        />
      </svg>
      <div className="absolute flex flex-col items-center gap-0.5">
        {isScanning ? (
          <FaSpinner
            className="animate-spin"
            size={24}
            style={{ color: "var(--z-amber)" }}
          />
        ) : (
          <>
            <span
              className="text-[26px] leading-none font-black tabular-nums"
              style={{ fontFamily: "var(--font-syne)", color: "var(--z-text)" }}
            >
              {Math.round(clamped)}%
            </span>
            <span
              className="text-[10px] font-bold tabular-nums"
              style={{ color: "var(--z-muted)" }}
            >
              {processedCount}&thinsp;/&thinsp;{totalCount}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Control Button ───────────────────────────────────────────────────────────

function ControlButton({
  onClick,
  disabled,
  variant,
  children,
}: Readonly<{
  onClick?: () => void;
  disabled?: boolean;
  variant: "primary" | "green" | "pink" | "red" | "ghost";
  children: React.ReactNode;
}>) {
  const styles: Record<string, React.CSSProperties> = {
    primary: {
      background: "linear-gradient(135deg, var(--z-amber) 0%, #ef8d2f 100%)",
      color: "#07060f",
    },
    green: {
      backgroundColor: "rgba(34,197,94,0.08)",
      border: "1px solid rgba(34,197,94,0.28)",
      color: "var(--z-green)",
    },
    pink: {
      backgroundColor: "rgba(232,121,249,0.08)",
      border: "1px solid rgba(232,121,249,0.28)",
      color: "var(--z-pink)",
    },
    red: {
      backgroundColor: "rgba(248,113,113,0.08)",
      border: "1px solid rgba(248,113,113,0.28)",
      color: "var(--z-red)",
    },
    ghost: {
      backgroundColor: "transparent",
      border: "1px solid var(--z-border-mid)",
      color: "var(--z-muted)",
    },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="
        flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold
        transition-all
        hover:brightness-110
        active:scale-[0.97]
        disabled:cursor-not-allowed disabled:opacity-40
      "
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

// ─── Mini Cover ───────────────────────────────────────────────────────────────

function MiniCover({
  src,
  alt,
}: Readonly<{ src: string | null | undefined; alt: string }>) {
  return (
    <div
      className="shrink-0 overflow-hidden rounded-sm"
      style={{ width: 68, height: 96 }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          width={68}
          height={96}
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

// ─── Change Chips ─────────────────────────────────────────────────────────────

function ChangeChips({
  changeSummary,
  variant,
}: Readonly<{
  changeSummary: EntryChangeSummary;
  variant: "pending" | "updating" | "done";
}>) {
  const addColor =
    variant === "done" ? "rgba(34,197,94,0.85)" : "var(--z-green)";
  const removeColor =
    variant === "done" ? "rgba(248,113,113,0.85)" : "var(--z-red)";
  const hideColor =
    variant === "done" ? "rgba(103,232,249,0.85)" : "var(--z-frost)";

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {changeSummary.added.map((list) => (
        <span
          key={`add-${list}`}
          className="
            inline-flex max-w-36 items-center gap-1 overflow-hidden rounded-sm px-2 py-0.5 text-xs
            font-bold
          "
          style={{
            backgroundColor: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.2)",
            color: addColor,
          }}
          title={`Add to: ${list}`}
        >
          <span className="shrink-0">+</span>
          <span
            style={{
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {list}
          </span>
        </span>
      ))}
      {changeSummary.removed.map((list) => (
        <span
          key={`rem-${list}`}
          className="
            inline-flex max-w-36 items-center gap-1 overflow-hidden rounded-sm px-2 py-0.5 text-xs
            font-bold
          "
          style={{
            backgroundColor: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.2)",
            color: removeColor,
          }}
          title={`Remove from: ${list}`}
        >
          <span className="shrink-0">−</span>
          <span
            style={{
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {list}
          </span>
        </span>
      ))}
      {changeSummary.hideChanged && (
        <span
          className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-bold"
          style={{
            backgroundColor: "rgba(103,232,249,0.1)",
            border: "1px solid rgba(103,232,249,0.18)",
            color: hideColor,
          }}
          title={
            changeSummary.willHideFromStatusLists
              ? "Hide from status lists"
              : "Show in status lists"
          }
        >
          {changeSummary.willHideFromStatusLists ? "hide" : "unhide"}
        </span>
      )}
    </div>
  );
}

// ─── Pending Row ─────────────────────────────────────────────────────────────

function PendingRow({ entry }: Readonly<{ entry: TrackedEntry }>) {
  const title = getEntryTitle(entry.entry);
  const changeSummary = getEntryChangeSummary(entry);
  const cover =
    entry.entry.media.coverImage.medium ??
    entry.entry.media.coverImage.large ??
    entry.entry.media.coverImage.extraLarge;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{
        duration: CARD_ANIMATION_DURATION_SECONDS,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="flex items-stretch overflow-hidden rounded-lg"
      style={{
        backgroundColor: "var(--z-card)",
        border: "1px solid var(--z-border)",
      }}
    >
      <div
        className="w-1 shrink-0"
        style={{ backgroundColor: "rgba(245,166,35,0.5)" }}
      />
      <div className="flex min-w-0 flex-1 items-center gap-4 p-4">
        <MiniCover src={cover} alt={title} />
        <div className="min-w-0 flex-1">
          <p
            className="text-base font-semibold"
            style={{ color: "var(--z-text)", ...TITLE_CLAMP_STYLE }}
          >
            {title}
          </p>
          <div className="mt-2 mb-1.5 flex flex-wrap items-center gap-1.5">
            <MetaPill
              label={formatStatusLabel(entry.entry.status)}
              tone={getStatusTone(entry.entry.status)}
            />
          </div>
          <ChangeChips changeSummary={changeSummary} variant="pending" />
        </div>
        <a
          href={getAniListEntryUrl(entry.entry)}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-full p-2 transition-opacity"
          style={{ color: "var(--z-frost)" }}
          aria-label={`Open ${title} on AniList`}
        >
          <FaExternalLinkAlt size={16} />
        </a>
      </div>
    </motion.div>
  );
}

// ─── Updating Row ─────────────────────────────────────────────────────────────

function UpdatingRow({ entry }: Readonly<{ entry: TrackedEntry }>) {
  const title = getEntryTitle(entry.entry);
  const changeSummary = getEntryChangeSummary(entry);
  const cover =
    entry.entry.media.coverImage.medium ??
    entry.entry.media.coverImage.large ??
    entry.entry.media.coverImage.extraLarge;

  return (
    <motion.div
      layout
      initial={{ opacity: 0.6, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="flex items-stretch overflow-hidden rounded-lg"
      style={{
        backgroundColor: "var(--z-card)",
        border: "1px solid rgba(232,121,249,0.35)",
        boxShadow: "0 0 18px rgba(232,121,249,0.1)",
      }}
    >
      <div
        className="w-1 shrink-0"
        style={{ backgroundColor: "var(--z-pink)" }}
      />
      <div className="flex min-w-0 flex-1 items-center gap-4 p-4">
        <MiniCover src={cover} alt={title} />
        <div className="min-w-0 flex-1">
          <p
            className="text-base font-semibold"
            style={{ color: "var(--z-text)", ...TITLE_CLAMP_STYLE }}
          >
            {title}
          </p>
          <div className="mt-2 mb-1.5 flex items-center gap-1.5">
            <FaSpinner
              className="shrink-0 animate-spin"
              size={11}
              style={{ color: "var(--z-pink)" }}
            />
            <span
              className="text-xs font-bold"
              style={{ color: "var(--z-pink)" }}
            >
              Applying
            </span>
          </div>
          <ChangeChips changeSummary={changeSummary} variant="updating" />
        </div>
        <a
          href={getAniListEntryUrl(entry.entry)}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-full p-2"
          style={{ color: "var(--z-frost)" }}
          aria-label={`Open ${title} on AniList`}
        >
          <FaExternalLinkAlt size={16} />
        </a>
      </div>
    </motion.div>
  );
}

// ─── Done Row ─────────────────────────────────────────────────────────────────

function DoneRow({ entry }: Readonly<{ entry: TrackedEntry }>) {
  const title = getEntryTitle(entry.entry);
  const changeSummary = getEntryChangeSummary(entry);
  const cover =
    entry.entry.media.coverImage.medium ??
    entry.entry.media.coverImage.large ??
    entry.entry.media.coverImage.extraLarge;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 5 }}
      transition={{
        duration: CARD_ANIMATION_DURATION_SECONDS,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="flex items-stretch overflow-hidden rounded-lg"
      style={{
        backgroundColor: "var(--z-card)",
        border: "1px solid var(--z-border)",
      }}
    >
      <div
        className="w-1 shrink-0"
        style={{ backgroundColor: "rgba(34,197,94,0.55)" }}
      />
      <div className="flex min-w-0 flex-1 items-center gap-4 p-4">
        <MiniCover src={cover} alt={title} />
        <div className="min-w-0 flex-1">
          <p
            className="text-base font-semibold"
            style={{ color: "var(--z-text)", ...TITLE_CLAMP_STYLE }}
          >
            {title}
          </p>
          <div className="mt-2 mb-1.5 flex items-center gap-1.5">
            <FaCheckCircle
              className="shrink-0"
              size={11}
              style={{ color: "var(--z-green)" }}
            />
            <span
              className="text-xs font-bold"
              style={{ color: "var(--z-green)" }}
            >
              Applied
            </span>
          </div>
          <ChangeChips changeSummary={changeSummary} variant="done" />
        </div>
        <a
          href={getAniListEntryUrl(entry.entry)}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-full p-2"
          style={{ color: "var(--z-frost)" }}
          aria-label={`Open ${title} on AniList`}
        >
          <FaExternalLinkAlt size={16} />
        </a>
      </div>
    </motion.div>
  );
}

// ─── Phase: Scanning ──────────────────────────────────────────────────────────

function ScanningState() {
  return (
    <div className="flex flex-col items-center justify-center py-36">
      <div className="relative mb-12 flex items-center justify-center">
        {([52, 88, 124] as const).map((size, i) => (
          <motion.div
            key={size}
            className="absolute rounded-full"
            style={{
              width: size,
              height: size,
              border: `1px solid rgba(245,166,35,${0.55 - i * 0.16})`,
            }}
            animate={{ opacity: [0.9, 0.2, 0.9], scale: [1, 1.05, 1] }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              delay: i * 0.38,
              ease: "easeInOut",
            }}
          />
        ))}
        <div
          className="relative z-10 flex items-center justify-center rounded-full"
          style={{
            width: 52,
            height: 52,
            backgroundColor: "rgba(245,166,35,0.1)",
          }}
        >
          <FaSpinner
            className="animate-spin"
            size={22}
            style={{ color: "var(--z-amber)" }}
          />
        </div>
      </div>
      <p
        className="mb-2 text-[10px] font-black tracking-widest uppercase"
        style={{ color: "var(--z-amber)" }}
      >
        Scanning Library
      </p>
      <h2
        className="mb-3 text-center text-2xl font-black"
        style={{ fontFamily: "var(--font-syne)", color: "var(--z-text)" }}
      >
        Calculating changes…
      </h2>
      <p
        className="max-w-sm text-center text-sm"
        style={{ color: "var(--z-muted)" }}
      >
        Reviewing your entries against the configured rules. Large libraries may
        take a moment.
      </p>
    </div>
  );
}

// ─── Phase: Error ─────────────────────────────────────────────────────────────

function ErrorState({
  fetchError,
  updateFallbackCopy,
  onRetry,
  onBack,
}: Readonly<{
  fetchError: string | null;
  updateFallbackCopy: { title: string; description: string };
  onRetry: () => void;
  onBack: () => void;
}>) {
  return (
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
            boxShadow: "0 0 48px rgba(248,113,113,0.08)",
          }}
        >
          <div
            className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full"
            style={{
              backgroundColor: "rgba(248,113,113,0.1)",
              border: "2px solid rgba(248,113,113,0.35)",
            }}
          >
            <FaExclamationTriangle
              size={24}
              style={{ color: "var(--z-red)" }}
            />
          </div>
          <h2
            className="mb-2 text-xl font-black"
            style={{ fontFamily: "var(--font-syne)", color: "var(--z-text)" }}
          >
            {updateFallbackCopy.title}
          </h2>
          <p className="mb-5 text-sm" style={{ color: "var(--z-muted)" }}>
            {updateFallbackCopy.description}
          </p>
          {fetchError && (
            <p
              className="mb-6 rounded-lg px-4 py-2.5 text-left text-sm"
              style={{
                color: "var(--z-text)",
                backgroundColor: "rgba(248,113,113,0.07)",
                border: "1px solid rgba(248,113,113,0.18)",
              }}
            >
              {fetchError}
            </p>
          )}
          <div className="flex justify-center gap-3">
            <button
              onClick={onBack}
              className="
                cursor-pointer rounded-xl px-4 py-2.5 text-sm font-medium transition-all
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
                Back to Manager
              </span>
            </button>
            <button
              onClick={onRetry}
              className="
                cursor-pointer rounded-xl px-5 py-2.5 text-sm font-bold transition-all
                hover:brightness-110
                active:scale-95
              "
              style={{ backgroundColor: "var(--z-amber)", color: "#07060f" }}
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
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UpdatePage() {
  const router = useRouter();
  const { token, userId: authUserId } = useAuth();

  const [phase, setPhase] = useState<Phase>("scanning");
  const [pendingEntries, setPendingEntries] = useState<TrackedEntry[]>([]);
  const [erroredEntries, setErroredEntries] = useState<TrackedEntry[]>([]);
  const [currentUpdating, setCurrentUpdating] = useState<TrackedEntry[]>([]);
  const [updatingBatchVersion, setUpdatingBatchVersion] = useState(0);
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
  const [circuitBreakerMessage, setCircuitBreakerMessage] = useState<
    string | null
  >(null);

  const startTimeRef = useRef(0);
  const pendingQueueRef = useRef<TrackedEntry[]>([]);
  const updatedCountRef = useRef(0);
  const errorCountRef = useRef(0);
  const consecutiveFailureCountRef = useRef(0);
  const isProcessingRef = useRef(false);
  const pauseRequestedRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const completeRequestedRef = useRef(false);
  const navigationStopRequestedRef = useRef(false);
  const rateLimitInfoRef = useRef<RateLimitInfo | null>(null);
  const storageFallbackWarnedRef = useRef(false);
  const queueScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const doneScrollContainerRef = useRef<HTMLDivElement | null>(null);

  const queueVirtualizer = useVirtualizer({
    count: pendingEntries.length,
    getScrollElement: () => queueScrollContainerRef.current,
    estimateSize: () => 100,
    overscan: 8,
  });

  const doneVirtualizer = useVirtualizer({
    count: doneEntries.length,
    getScrollElement: () => doneScrollContainerRef.current,
    estimateSize: () => 100,
    overscan: 8,
  });

  const getAuthToken = (): string | null =>
    token ?? getItemWithExpiry<string>(STORAGE_KEYS.authToken);

  const setUpdatingEntries = (entries: TrackedEntry[]) => {
    setCurrentUpdating(entries);
    if (entries.length > 0) setUpdatingBatchVersion((prev) => prev + 1);
  };

  const persistUpdateStats = (stats: {
    totalUpdated: number;
    errorCount: number;
    timeTaken: number;
  }) => {
    const result = setItemWithExpiry(
      STORAGE_KEYS.updateStats,
      stats,
      STORAGE_TTLS.updateSummary,
    );
    if (isStorageFallbackResult(result) && !storageFallbackWarnedRef.current) {
      storageFallbackWarnedRef.current = true;
      toast.warning("Using temporary storage fallback", {
        description:
          "Update summary is stored in-memory for this tab because browser storage is constrained.",
      });
    }
  };

  const handleRetryState = (retryContext: AniListRetryContext) => {
    setRetryStatus({ ...retryContext, startedAt: Date.now() });
  };

  const updateRateLimitState = (nextRateLimit: RateLimitInfo | null = null) => {
    rateLimitInfoRef.current = nextRateLimit;
    setRateLimitInfo(nextRateLimit);
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
    if (!retryStatus) return undefined;
    setRetryClock(Date.now());
    const id = globalThis.setInterval(() => setRetryClock(Date.now()), 1000);
    return () => globalThis.clearInterval(id);
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
    consecutiveFailureCountRef.current = 0;
    startTimeRef.current = 0;
    completeRequestedRef.current = false;

    setPendingEntries([]);
    setErroredEntries([]);
    setUpdatingEntries([]);
    setDoneEntries([]);
    setTotalCount(0);
    setProcessedCount(0);
    setFetchError(null);
    setCircuitBreakerMessage(null);
    setQueuedAction(null);
    rateLimitInfoRef.current = null;
    setRateLimitInfo(null);
    setRetryStatus(null);
    setPhase("scanning");

    if (!authToken) {
      setFetchError("Missing AniList token. Please log in again.");
      setPhase("error");
      return undefined;
    }

    const prepareQueue = async () => {
      const listConfigs = getJsonItemWithExpiry<CustomListRuleConfig[]>(
        STORAGE_KEYS.workflowLists,
        [],
      );
      const listsToRemove = getJsonItemWithExpiry<string[]>(
        STORAGE_KEYS.workflowListsToRemoveFromAllEntries,
        [],
      );
      const listType =
        getItemWithExpiry<string>(STORAGE_KEYS.workflowListType) === "MANGA"
          ? "MANGA"
          : "ANIME";
      const userId =
        authUserId ??
        normalizeUserId(
          getItemWithExpiry<number | string>(STORAGE_KEYS.authUserId),
        );
      const hideDefaultStatusLists = getBooleanItemWithExpiry(
        STORAGE_KEYS.workflowHideDefaultStatusLists,
        false,
      );

      if (!userId) {
        setFetchError("Missing user ID. Please log in again.");
        setPhase("error");
        return;
      }

      try {
        const entries = await fetchAllWorkflowMediaEntries({
          userId,
          type: listType,
          fetchPage: async (variables: WorkflowMediaListQueryVariables) =>
            await fetchAniList<
              MediaListResponse["data"],
              WorkflowMediaListQueryVariables
            >(
              WORKFLOW_MEDIA_LIST_QUERY,
              variables,
              authToken,
              handleRetryState,
            ),
          onRateLimit: updateRateLimitState,
          shouldCancel: () => cancelled,
        });

        if (cancelled) return;

        const trackedEntries = buildTrackedEntries(
          entries,
          listConfigs,
          listsToRemove,
          hideDefaultStatusLists,
        );

        if (trackedEntries.length === 0) {
          persistUpdateStats({ totalUpdated: 0, errorCount: 0, timeTaken: 0 });
          setPhase("complete");
          return;
        }

        pendingQueueRef.current = trackedEntries;
        setPendingEntries(trackedEntries);
        setTotalCount(trackedEntries.length);
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
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
  }, [authUserId, prepareRunId, token]);

  const completeRun = (navigateToCompleted = false) => {
    const timeTaken =
      startTimeRef.current > 0
        ? Math.round((Date.now() - startTimeRef.current) / 1000)
        : 0;
    persistUpdateStats({
      totalUpdated: updatedCountRef.current,
      errorCount: errorCountRef.current,
      timeTaken,
    });
    setQueuedAction(null);
    setPhase("complete");
    if (navigateToCompleted) router.push("/completed");
  };

  const startProcessing = async () => {
    if (isProcessingRef.current) return;
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
    if (startTimeRef.current === 0) startTimeRef.current = Date.now();
    pauseRequestedRef.current = false;
    stopRequestedRef.current = false;
    completeRequestedRef.current = false;
    navigationStopRequestedRef.current = false;
    consecutiveFailureCountRef.current = 0;
    isProcessingRef.current = true;
    setQueuedAction(null);
    setCircuitBreakerMessage(null);
    setPhase("processing");

    const runSingleEntryMutation = async (
      entry: TrackedEntry,
    ): Promise<TrackedEntry> => {
      const response = await fetchAniList<
        MutationResponse["data"],
        SaveEntryMutationVariables
      >(
        SAVE_ENTRY_MUTATION,
        {
          id: entry.entry.id,
          customLists: entry.newCustomLists,
          hiddenFromStatusLists: entry.shouldHide,
        },
        authToken,
        handleRetryState,
      );
      updateRateLimitState(response.rateLimit ?? null);
      return { ...entry, state: "done" };
    };

    const runMutationBatch = async (
      entries: TrackedEntry[],
    ): Promise<{
      doneEntriesBatch: TrackedEntry[];
      erroredEntriesBatch: TrackedEntry[];
    }> => {
      const doneEntriesBatch: TrackedEntry[] = [];
      const erroredEntriesBatch: TrackedEntry[] = [];

      try {
        const { mutation, variables, aliases } =
          buildBatchedSaveEntryMutation(entries);
        const response = await fetchAniList<
          BatchedSaveEntryMutationData,
          AniListRequestVariables
        >(mutation, variables, authToken, handleRetryState);
        updateRateLimitState(response.rateLimit ?? null);
        if (!hasSuccessfulBatchedSaveResponse(response.data, aliases)) {
          throw new Error(
            "AniList batch mutation response was missing one or more updated entries.",
          );
        }
        doneEntriesBatch.push(
          ...entries.map((e) => ({ ...e, state: "done" as const })),
        );
      } catch (batchError) {
        console.warn(
          "Batch update failed, falling back to single-entry updates.",
          batchError,
        );
        for (const [index, entry] of entries.entries()) {
          if (index > 0) {
            setUpdatingEntries([{ ...entry, state: "updating" }]);
            await waitForUiCommit();
          }
          if (navigationStopRequestedRef.current || stopRequestedRef.current)
            break;
          try {
            const doneEntry = await runSingleEntryMutation(entry);
            doneEntriesBatch.push(doneEntry);
          } catch (err) {
            console.error("Failed to update entry", entry.entry.id, err);
            toast.error("Update Failed", {
              description: `Skipping "${getEntryTitle(entry.entry)}".`,
            });
            erroredEntriesBatch.push({
              ...entry,
              state: "error",
              errorMessage:
                err instanceof Error ? err.message : "Unknown error",
            });
          }
        }
      }

      return { doneEntriesBatch, erroredEntriesBatch };
    };

    const waitForCooldownWindow = async (): Promise<
      "ready" | "paused" | "stopped" | "navigated"
    > => {
      const cooldownEndAt = Date.now() + REQUEST_INTERVAL_MS;
      while (Date.now() < cooldownEndAt) {
        if (navigationStopRequestedRef.current) return "navigated";
        if (stopRequestedRef.current) return "stopped";
        if (pauseRequestedRef.current) return "paused";
        const remainingMs = cooldownEndAt - Date.now();
        await wait(Math.min(REQUEST_DELAY_POLL_INTERVAL_MS, remainingMs));
      }
      return "ready";
    };

    try {
      while (pendingQueueRef.current.length > 0) {
        const batchSize = getProcessingBatchSize(
          rateLimitInfoRef.current,
          pendingQueueRef.current.length,
        );
        const entriesToProcess = pendingQueueRef.current.slice(0, batchSize);
        const rest = pendingQueueRef.current.slice(entriesToProcess.length);

        if (entriesToProcess.length === 0) break;

        pendingQueueRef.current = rest;
        setPendingEntries(rest);
        setUpdatingEntries(
          entriesToProcess.map((e) => ({ ...e, state: "updating" })),
        );

        await waitForUiCommit();

        if (navigationStopRequestedRef.current || stopRequestedRef.current) {
          setUpdatingEntries([]);
          if (!navigationStopRequestedRef.current) {
            setQueuedAction(null);
            setPhase("stopped");
          }
          return;
        }

        const cooldownState = await waitForCooldownWindow();

        if (cooldownState === "navigated" || cooldownState === "stopped") {
          setUpdatingEntries([]);
          if (cooldownState !== "navigated") {
            setQueuedAction(null);
            setPhase("stopped");
          }
          return;
        }

        if (cooldownState === "paused") {
          setUpdatingEntries([]);
          setQueuedAction(null);
          setPhase("paused");
          return;
        }

        const { doneEntriesBatch, erroredEntriesBatch } =
          await runMutationBatch(entriesToProcess);

        if (doneEntriesBatch.length > 0) consecutiveFailureCountRef.current = 0;
        if (erroredEntriesBatch.length > 0)
          consecutiveFailureCountRef.current += erroredEntriesBatch.length;

        updatedCountRef.current += doneEntriesBatch.length;
        errorCountRef.current += erroredEntriesBatch.length;

        if (doneEntriesBatch.length > 0) {
          setDoneEntries((prev) => [...doneEntriesBatch.toReversed(), ...prev]);
        }
        if (erroredEntriesBatch.length > 0) {
          setErroredEntries((prev) => [...prev, ...erroredEntriesBatch]);
        }
        setProcessedCount(updatedCountRef.current + errorCountRef.current);

        if (
          consecutiveFailureCountRef.current >= CONSECUTIVE_FAILURE_THRESHOLD &&
          pendingQueueRef.current.length > 0
        ) {
          const notice =
            `${consecutiveFailureCountRef.current} consecutive updates failed. ` +
            "The updater is paused to avoid repeated failed requests. " +
            "Resume when AniList stabilizes; your queue and progress are preserved.";
          pauseRequestedRef.current = true;
          setUpdatingEntries([]);
          setQueuedAction(null);
          setCircuitBreakerMessage(notice);
          setPhase("paused");
          toast.warning("Updater paused after repeated failures", {
            description: notice,
          });
          return;
        }

        if (stopRequestedRef.current) {
          if (navigationStopRequestedRef.current) return;
          setUpdatingEntries([]);
          setQueuedAction(null);
          setPhase("stopped");
          return;
        }

        if (completeRequestedRef.current) {
          setUpdatingEntries([]);
          completeRun(true);
          return;
        }

        if (pauseRequestedRef.current) {
          setUpdatingEntries([]);
          setQueuedAction(null);
          setPhase("paused");
          return;
        }
      }

      setUpdatingEntries([]);
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
    if (!isProcessingRef.current) setPhase("stopped");
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

  const handleRetryPreparation = () => setPrepareRunId((prev) => prev + 1);

  // ── Derived state ──────────────────────────────────────────────────────────

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

  const updateFailureKind = classifyFallbackFailure({
    message: fetchError,
    retryReason: retryStatus?.reason,
  });
  const updateFallbackCopy = getFallbackCopy(updateFailureKind);

  const progress = totalCount > 0 ? (processedCount / totalCount) * 100 : 0;
  let progressWidth = progress;
  if (phase === "complete") progressWidth = 100;
  else if (phase === "scanning") progressWidth = 6;

  const queuedCount = pendingEntries.length;

  const queueVisible =
    phase === "ready" ||
    phase === "processing" ||
    phase === "paused" ||
    phase === "stopped";

  const phaseLabel =
    phase === "ready"
      ? "Queue Ready"
      : phase === "processing"
        ? queuedAction === "pause"
          ? "Pausing…"
          : queuedAction === "complete"
            ? "Completing…"
            : queuedAction === "stop"
              ? "Stopping…"
              : "Processing"
        : phase === "paused"
          ? "Paused"
          : phase === "stopped"
            ? "Stopped"
            : "Scanning";

  const phaseDescription =
    phase === "ready"
      ? "Review the queue, then start when you are ready."
      : phase === "processing"
        ? queuedAction === "pause"
          ? "Finishing current batch, then pausing."
          : queuedAction === "complete"
            ? "Finishing current batch, then completing."
            : queuedAction === "stop"
              ? "Finishing current batch, then stopping."
              : "Entries are being updated in batches."
        : phase === "paused"
          ? (circuitBreakerMessage ?? "Your place is saved. Resume when ready.")
          : phase === "stopped"
            ? "Stopped. Resume the remaining queue or go back."
            : "Calculating what needs to change.";

  const phaseColor: string =
    phase === "processing"
      ? "var(--z-pink)"
      : phase === "stopped"
        ? "var(--z-red)"
        : phase === "ready" || phase === "paused"
          ? "var(--z-amber)"
          : "var(--z-muted)";

  const queueVirtualItems = queueVirtualizer.getVirtualItems();

  const breadcrumbs = [
    { name: "Home", href: "/" },
    { name: "Custom List Manager", href: "/custom-list-manager" },
    { name: "Update" },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <Breadcrumbs breadcrumbs={breadcrumbs} />
      <div className="mx-auto w-full px-4 py-8 sm:px-6 md:max-w-7xl xl:max-w-[90%]">
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="mb-3 flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className="rounded-full transition-all"
                  style={{
                    width: step === 3 ? 22 : 8,
                    height: 8,
                    backgroundColor:
                      step === 3 ? "var(--z-amber)" : "var(--z-card-high)",
                  }}
                />
              ))}
            </div>
            <span
              className="text-[10px] font-black tracking-widest uppercase"
              style={{ color: "var(--z-amber)" }}
            >
              Step 3 of 3
            </span>
          </div>
          <h1
            className="text-[2rem] leading-tight font-black"
            style={{ fontFamily: "var(--font-syne)", color: "var(--z-text)" }}
          >
            Updating Your Lists
          </h1>
          <p
            className="mt-1.5 max-w-lg text-sm"
            style={{ color: "var(--z-muted)" }}
          >
            Review the queue, track live progress, and let the updater handle
            your AniList changes.
          </p>
        </motion.div>

        {/* Phase States */}
        {phase === "scanning" && <ScanningState />}

        {phase === "error" && (
          <ErrorState
            fetchError={fetchError}
            updateFallbackCopy={updateFallbackCopy}
            onRetry={handleRetryPreparation}
            onBack={() => router.push("/custom-list-manager")}
          />
        )}

        {/* Main Operation Layout */}
        {queueVisible && (
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[270px_1fr]">
            {/* LEFT: Sidebar */}
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="lg:sticky lg:top-6 lg:self-start"
            >
              <div
                className="space-y-5 rounded-2xl p-5"
                style={{
                  backgroundColor: "var(--z-card)",
                  border: "1px solid var(--z-border)",
                }}
              >
                {/* Phase indicator */}
                <div>
                  <p
                    className="mb-1 text-[9px] font-black tracking-widest uppercase"
                    style={{ color: "var(--z-subtle)" }}
                  >
                    Controls
                  </p>
                  <div className="flex items-center gap-2">
                    <motion.span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: phaseColor }}
                      animate={
                        phase === "processing"
                          ? { opacity: [1, 0.2, 1] }
                          : { opacity: 1 }
                      }
                      transition={{ duration: 1.2, repeat: Infinity }}
                    />
                    <span
                      className="text-sm font-black"
                      style={{
                        fontFamily: "var(--font-syne)",
                        color: "var(--z-text)",
                      }}
                    >
                      {phaseLabel}
                    </span>
                  </div>
                  <p
                    className="mt-1.5 text-xs/relaxed"
                    style={{ color: "var(--z-muted)" }}
                  >
                    {phaseDescription}
                  </p>
                </div>

                {/* Orbital progress ring */}
                <OrbitalProgress
                  progress={progressWidth}
                  processedCount={processedCount}
                  totalCount={totalCount}
                  phase={phase}
                />

                {/* Stats pills */}
                <div className="flex flex-wrap gap-1.5">
                  <MetaPill label={`${queuedCount} queued`} tone="amber" />
                  <MetaPill label={`${doneEntries.length} done`} tone="green" />
                  {erroredEntries.length > 0 && (
                    <MetaPill
                      label={`${erroredEntries.length} skipped`}
                      tone="red"
                    />
                  )}
                </div>

                {/* Divider */}
                <div style={{ borderTop: "1px solid var(--z-border)" }} />

                {/* Control buttons */}
                <div className="space-y-2">
                  {phase === "ready" && (
                    <>
                      <ControlButton
                        variant="primary"
                        onClick={() => {
                          void startProcessing();
                        }}
                      >
                        <FaPlay size={9} />
                        Start Update
                      </ControlButton>
                      <ControlButton variant="green" onClick={handleComplete}>
                        <FaCheckCircle size={9} />
                        Mark Complete
                      </ControlButton>
                      <ControlButton
                        variant="ghost"
                        onClick={() => router.push("/custom-list-manager")}
                      >
                        <FaChevronLeft size={9} />
                        Back
                      </ControlButton>
                    </>
                  )}

                  {phase === "processing" && (
                    <>
                      <ControlButton
                        variant="pink"
                        onClick={handlePause}
                        disabled={queuedAction !== null}
                      >
                        <FaPause size={9} />
                        Pause
                      </ControlButton>
                      <ControlButton
                        variant="green"
                        onClick={handleComplete}
                        disabled={queuedAction !== null}
                      >
                        <FaCheckCircle size={9} />
                        Complete
                      </ControlButton>
                      <ControlButton
                        variant="red"
                        onClick={handleStop}
                        disabled={queuedAction !== null}
                      >
                        <FaStop size={9} />
                        Stop
                      </ControlButton>
                    </>
                  )}

                  {phase === "paused" && (
                    <>
                      <ControlButton
                        variant="primary"
                        onClick={() => {
                          void startProcessing();
                        }}
                      >
                        <FaPlay size={9} />
                        Resume
                      </ControlButton>
                      <ControlButton variant="green" onClick={handleComplete}>
                        <FaCheckCircle size={9} />
                        Complete
                      </ControlButton>
                      <ControlButton variant="red" onClick={handleStop}>
                        <FaStop size={9} />
                        Stop
                      </ControlButton>
                    </>
                  )}

                  {phase === "stopped" && (
                    <>
                      {pendingEntries.length > 0 && (
                        <ControlButton
                          variant="primary"
                          onClick={() => {
                            void startProcessing();
                          }}
                        >
                          <FaPlay size={9} />
                          Resume Remaining
                        </ControlButton>
                      )}
                      <ControlButton variant="green" onClick={handleComplete}>
                        <FaCheckCircle size={9} />
                        Complete
                      </ControlButton>
                      <ControlButton
                        variant="ghost"
                        onClick={() => router.push("/custom-list-manager")}
                      >
                        <FaChevronLeft size={9} />
                        Back
                      </ControlButton>
                    </>
                  )}
                </div>

                {/* Rate limit panel */}
                {hasRateLimitCard && (
                  <>
                    <div style={{ borderTop: "1px solid var(--z-border)" }} />
                    <div
                      className="rounded-xl p-3"
                      style={{
                        backgroundColor:
                          retryStatus || isRateLimitWarning
                            ? "rgba(245,166,35,0.07)"
                            : "rgba(103,232,249,0.07)",
                        border:
                          retryStatus || isRateLimitWarning
                            ? "1px solid rgba(245,166,35,0.2)"
                            : "1px solid rgba(103,232,249,0.18)",
                      }}
                    >
                      <div className="flex items-start gap-2.5">
                        {retryStatus ? (
                          <FaSpinner
                            className="mt-0.5 shrink-0 animate-spin"
                            size={11}
                            style={{ color: "var(--z-amber)" }}
                          />
                        ) : (
                          <FaExclamationTriangle
                            className="mt-0.5 shrink-0"
                            size={11}
                            style={{
                              color: isRateLimitWarning
                                ? "var(--z-amber)"
                                : "var(--z-frost)",
                            }}
                          />
                        )}
                        <div className="min-w-0">
                          <p
                            className="mb-1 text-[10px] font-black tracking-widest uppercase"
                            style={{
                              color:
                                retryStatus || isRateLimitWarning
                                  ? "var(--z-amber)"
                                  : "var(--z-frost)",
                            }}
                          >
                            {retryStatus ? "Retrying" : "Rate Limit"}
                          </p>
                          <p
                            className="text-xs/relaxed"
                            style={{ color: "var(--z-muted)" }}
                          >
                            {retryStatus
                              ? `Retry in ${formatDurationLabel(remainingRetrySeconds ?? retryStatus.retryAfterSeconds)} (attempt ${retryStatus.retryAttempt})`
                              : rateLimitRemaining !== null &&
                                  rateLimitLimit !== null
                                ? `${rateLimitRemaining} / ${rateLimitLimit} requests remaining`
                                : "Watching rate-limit headers."}
                          </p>
                          {rateLimitResetLabel && (
                            <p
                              className="mt-1 text-[11px]"
                              style={{ color: "var(--z-subtle)" }}
                            >
                              Resets around {rateLimitResetLabel}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>

            {/* RIGHT: Content Area */}
            <div className="min-w-0 space-y-5">
              {/* Live — Updating Now */}
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 }}
              >
                <div className="mb-2.5 flex items-center gap-2">
                  <motion.span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: "var(--z-pink)" }}
                    animate={{ opacity: [1, 0.2, 1] }}
                    transition={{ duration: 1.3, repeat: Infinity }}
                  />
                  <h2
                    className="text-[11px] font-black tracking-widest uppercase"
                    style={{ color: "var(--z-pink)" }}
                  >
                    Live — Updating Now
                  </h2>
                  {currentUpdating.length > 0 && (
                    <span
                      className="ml-auto rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                      style={{
                        backgroundColor: "rgba(232,121,249,0.12)",
                        color: "var(--z-pink)",
                      }}
                    >
                      {currentUpdating.length}
                    </span>
                  )}
                </div>

                <div
                  className="relative overflow-hidden rounded-xl"
                  style={{
                    backgroundColor: "var(--z-surface)",
                    border: "1px solid rgba(232,121,249,0.15)",
                    minHeight: 108,
                  }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {currentUpdating.length > 0 ? (
                      <motion.div
                        key={`batch-${updatingBatchVersion}`}
                        initial={{ opacity: 0.8 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0.65 }}
                        transition={{ duration: 0.2 }}
                        className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2 xl:grid-cols-3"
                      >
                        {currentUpdating.map((entry) => (
                          <UpdatingRow key={entry.entry.id} entry={entry} />
                        ))}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="idle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="
                          flex min-h-27 items-center justify-center rounded-xl p-6 text-center
                          text-sm
                        "
                        style={{
                          color: "var(--z-muted)",
                          border: "1px dashed var(--z-border)",
                          margin: "0.25rem",
                        }}
                      >
                        {phase === "ready"
                          ? "Press Start to begin processing entries."
                          : phase === "paused"
                            ? "Paused. Resume when you are ready."
                            : phase === "stopped"
                              ? "Stopped before the next batch."
                              : "Waiting for next batch…"}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.section>

              {/* Queue + Done */}
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                {/* In Queue */}
                <motion.section
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="mb-2.5 flex items-center gap-2">
                    <FaList size={10} style={{ color: "var(--z-amber)" }} />
                    <h2
                      className="text-[11px] font-black tracking-widest uppercase"
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
                    className="rounded-xl p-2"
                    style={{
                      backgroundColor: "var(--z-surface)",
                      border: "1px solid var(--z-border)",
                    }}
                  >
                    <div
                      ref={queueScrollContainerRef}
                      className="scroll-stable max-h-110 overflow-y-scroll pr-3.5"
                    >
                      {pendingEntries.length > 0 ? (
                        <div
                          style={{
                            height: `${queueVirtualizer.getTotalSize()}px`,
                            position: "relative",
                            width: "100%",
                          }}
                        >
                          {queueVirtualItems.map((virtualItem) => {
                            const entry = pendingEntries[virtualItem.index];
                            if (!entry) return null;
                            return (
                              <div
                                key={`queue-${entry.entry.id}`}
                                ref={queueVirtualizer.measureElement}
                                data-index={virtualItem.index}
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  left: 0,
                                  width: "100%",
                                  transform: `translateY(${virtualItem.start}px)`,
                                  paddingBottom:
                                    virtualItem.index <
                                    pendingEntries.length - 1
                                      ? `${VIRTUAL_ROW_GAP_PX}px`
                                      : undefined,
                                }}
                              >
                                <PendingRow entry={entry} />
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div
                          className="
                            flex min-h-40 items-center justify-center rounded-xl py-10 text-sm
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
                </motion.section>

                {/* Done */}
                <motion.section
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.14 }}
                >
                  <div className="mb-2.5 flex items-center gap-2">
                    <FaCheckCircle
                      size={10}
                      style={{ color: "var(--z-green)" }}
                    />
                    <h2
                      className="text-[11px] font-black tracking-widest uppercase"
                      style={{ color: "var(--z-green)" }}
                    >
                      Done
                    </h2>
                    <span
                      className="ml-auto rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                      style={{
                        backgroundColor: "rgba(34,197,94,0.1)",
                        color: "var(--z-green)",
                      }}
                    >
                      {doneEntries.length}
                    </span>
                  </div>

                  <div
                    className="rounded-xl p-2"
                    style={{
                      backgroundColor: "var(--z-surface)",
                      border: "1px solid var(--z-border)",
                    }}
                  >
                    <div
                      ref={doneScrollContainerRef}
                      className="scroll-stable max-h-110 overflow-y-scroll pr-3.5"
                    >
                      {doneEntries.length > 0 ? (
                        <div
                          style={{
                            height: `${doneVirtualizer.getTotalSize()}px`,
                            position: "relative",
                            width: "100%",
                          }}
                        >
                          {doneVirtualizer
                            .getVirtualItems()
                            .map((virtualItem) => {
                              const entry = doneEntries[virtualItem.index];
                              if (!entry) return null;
                              return (
                                <div
                                  key={`done-${entry.entry.id}`}
                                  ref={doneVirtualizer.measureElement}
                                  data-index={virtualItem.index}
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    transform: `translateY(${virtualItem.start}px)`,
                                    paddingBottom:
                                      virtualItem.index < doneEntries.length - 1
                                        ? `${VIRTUAL_ROW_GAP_PX}px`
                                        : undefined,
                                  }}
                                >
                                  <DoneRow entry={entry} />
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                        <div
                          className="rounded-xl border border-dashed px-4 py-5 text-sm"
                          style={{
                            color: "var(--z-muted)",
                            borderColor: "var(--z-border)",
                          }}
                        >
                          {phase === "processing"
                            ? "Completed entries will appear here as each batch finishes."
                            : phase === "paused"
                              ? "No new entries will appear until you resume."
                              : phase === "stopped"
                                ? "No new entries — run is stopped."
                                : "Completed entries will appear here once the run begins."}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.section>
              </div>

              {/* Skipped */}
              {erroredEntries.length > 0 && (
                <motion.section
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="mb-2.5 flex items-center gap-2">
                    <FaTimes size={10} style={{ color: "var(--z-red)" }} />
                    <h2
                      className="text-[11px] font-black tracking-widest uppercase"
                      style={{ color: "var(--z-red)" }}
                    >
                      Skipped
                    </h2>
                    <span
                      className="ml-auto rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                      style={{
                        backgroundColor: "rgba(248,113,113,0.1)",
                        color: "var(--z-red)",
                      }}
                    >
                      {erroredEntries.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {erroredEntries.map((entry) => (
                      <motion.div
                        key={`err-${entry.entry.id}`}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-stretch overflow-hidden rounded-lg"
                        style={{
                          backgroundColor: "rgba(248,113,113,0.06)",
                          border: "1px solid rgba(248,113,113,0.22)",
                        }}
                      >
                        <div
                          className="w-0.75 shrink-0"
                          style={{ backgroundColor: "rgba(248,113,113,0.6)" }}
                        />
                        <div className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5">
                          <FaTimes
                            size={11}
                            className="mt-0.5 shrink-0"
                            style={{ color: "var(--z-red)" }}
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className="text-sm font-semibold"
                              style={{
                                color: "var(--z-text)",
                                ...TITLE_CLAMP_STYLE,
                              }}
                            >
                              {getEntryTitle(entry.entry)}
                            </p>
                            <p
                              className="mt-0.5 text-xs"
                              style={{ color: "var(--z-red)" }}
                            >
                              {entry.errorMessage ?? "Update failed — skipped"}
                            </p>
                          </div>
                          <a
                            href={getAniListEntryUrl(entry.entry)}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 rounded-full p-1.5"
                            style={{ color: "var(--z-frost)" }}
                            aria-label="Open on AniList"
                          >
                            <FaExternalLinkAlt size={9} />
                          </a>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.section>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
