import React from "react";

interface LoadingIndicatorProps {
  size?: "sm" | "md" | "lg";
}

export default function LoadingIndicator({
  size = "md",
}: LoadingIndicatorProps = {}) {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-10 w-10",
    lg: "h-16 w-16",
  };

  return (
    <div
      className="flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <svg
        className={`${sizeClasses[size]} animate-spin text-blue-400 transition-colors duration-300 dark:text-blue-500`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        ></circle>
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
      <span className="ml-3 text-lg font-semibold text-blue-400 transition-colors duration-300 dark:text-blue-500">
        Loading...
      </span>
    </div>
  );
}
