"use client";

import React, { useEffect } from "react";

export interface MediaCardProps {
  readonly image: string;
  readonly romajiTitle: string;
  readonly englishTitle: string;
  readonly status: string;
  readonly score: number | null;
  readonly repeatCount: number;
  readonly customListChanges: string[];
  readonly anilistLink: string;
  readonly isUpdated: boolean;
  readonly onAnimationEnd: () => void;
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
        return "bg-(--z-amber-dim) text-z-amber border border-[rgba(245,166,35,0.2)]";
      case "CURRENT":
        return "bg-[rgba(34,211,238,0.1)] text-z-frost border border-[rgba(34,211,238,0.2)]";
      case "PLANNING":
        return "bg-[rgba(232,121,249,0.12)] text-z-pink border border-[rgba(232,121,249,0.2)]";
      case "PAUSED":
        return "bg-[rgba(248,113,113,0.1)] text-z-red border border-[rgba(248,113,113,0.2)]";
      case "DROPPED":
        return "bg-[rgba(248,113,113,0.1)] text-z-red border border-[rgba(248,113,113,0.2)]";
      case "REPEATING":
        return "bg-[rgba(52,211,153,0.1)] text-z-green border border-[rgba(52,211,153,0.2)]";
      default:
        return "bg-z-card-up text-z-muted border border-(--z-border)";
    }
  };

  return (
    <div
      className="transition-[opacity,transform] duration-200 ease-out"
      style={{
        opacity: 1,
        transform: isUpdated ? "scale(1.01)" : "scale(1)",
      }}
    >
      <div className="
        group flex gap-3 rounded-lg border border-(--z-border) bg-z-card p-3 transition-all
        duration-200
        hover:border-(--z-border-mid)
      ">
        {/* Cover image — small, left side */}
        <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-sm">
          <img
            src={image}
            alt={romajiTitle}
            className="size-full object-cover"
          />
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
          {/* Title + status row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3
                className="truncate text-sm/tight font-bold text-z-text"
                style={{ fontFamily: "var(--font-syne)" }}
              >
                {romajiTitle}
              </h3>
              {englishTitle && englishTitle !== romajiTitle && (
                <p className="mt-0.5 truncate text-xs text-z-muted">
                  {englishTitle}
                </p>
              )}
            </div>
            {/* Status badge */}
            <span
              className={`
                shrink-0 rounded-sm px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase
                ${getStatusColor(status)}
              `}
            >
              {status}
            </span>
          </div>

          {/* Score + repeats row */}
          <div className="flex items-center gap-3 text-xs text-z-muted">
            {score !== null && (
              <span className="flex items-center gap-1">
                <span className="text-sm font-bold text-z-amber">{score}</span>
                <span className="text-z-subtle">/10</span>
              </span>
            )}
            {repeatCount > 0 && <span>{repeatCount}× repeat</span>}
            <a
              href={anilistLink}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-z-subtle transition-colors hover:text-z-amber"
            >
              ↗
            </a>
          </div>

          {/* Custom list changes */}
          {customListChanges.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {customListChanges.map((change) => (
                <span
                  key={change}
                  className="
                    rounded-sm border border-[rgba(245,166,35,0.3)] bg-(--z-amber-dim) px-1.5 py-0.5
                    text-[10px] text-z-amber
                  "
                >
                  {change}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
