"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RouteErrorBoundary({
  error,
  reset,
}: Readonly<ErrorBoundaryProps>) {
  useEffect(() => {
    console.error("Route error boundary caught an error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <div
        className="w-full max-w-xl rounded-2xl p-8 text-center"
        style={{
          backgroundColor: "var(--z-card)",
          border: "1px solid var(--z-border)",
        }}
      >
        <p
          className="mb-3 text-xs font-semibold tracking-widest uppercase"
          style={{ color: "var(--z-amber)" }}
        >
          Unexpected error
        </p>
        <h1
          className="mb-3 text-3xl font-black"
          style={{
            fontFamily: "var(--font-syne-var)",
            color: "var(--z-text)",
          }}
        >
          Something went wrong
        </h1>
        <p className="mb-8 text-sm/relaxed" style={{ color: "var(--z-muted)" }}>
          We couldn&apos;t complete that action right now. You can safely try
          again, or head back home.
        </p>

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            type="button"
            onClick={reset}
            className="font-semibold"
            style={{ backgroundColor: "var(--z-amber)", color: "#07060f" }}
          >
            Try again
          </Button>
          <Button
            asChild
            type="button"
            variant="outline"
            className="font-medium"
          >
            <Link href="/">Go to Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
