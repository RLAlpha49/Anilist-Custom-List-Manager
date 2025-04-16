import React from "react";
import LoadingIndicator from "@/components/loading-indicator";

const LoadingFallback: React.FC = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 text-gray-900 transition-colors duration-300 dark:bg-gray-900 dark:text-gray-100">
      <LoadingIndicator />
    </div>
  );
};

export default LoadingFallback;
