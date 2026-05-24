"use client";

import { toast } from "sonner";

import { clearAppStorage } from "@/lib/local-storage";

export function HomeCacheResetButton() {
  const clearCache = () => {
    clearAppStorage();
    toast.success("Cache cleared!", {
      description:
        "Saved AniList session data, fetched lists, and local setup were cleared from this browser.",
    });
  };

  return (
    <button
      onClick={clearCache}
      className="
        rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200
        active:scale-95
      "
      style={{
        border: "1px solid rgba(248,113,113,0.24)",
        color: "var(--z-red)",
        backgroundColor: "rgba(248,113,113,0.06)",
      }}
      aria-label="Clear Cache"
    >
      Clear Cache
    </button>
  );
}
