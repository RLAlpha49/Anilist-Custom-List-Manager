import React from "react";

interface LoadingIndicatorProps {
  size?: "sm" | "md" | "lg";
}

export default function LoadingIndicator({
  size = "md",
}: LoadingIndicatorProps = {}) {
  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-10 h-10",
    lg: "w-14 h-14",
  };

  return (
    <div
      className="flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div
        className={`${sizeClasses[size]}
          animate-spin rounded-full border-2 border-(--z-border-mid) border-t-z-amber
        `}
      />
      <span className="ml-3 text-sm font-medium text-z-muted">Loading...</span>
    </div>
  );
}
