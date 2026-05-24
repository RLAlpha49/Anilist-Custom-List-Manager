"use client";

import "./globals.css";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

interface GlobalErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({
  error,
  reset,
}: Readonly<GlobalErrorBoundaryProps>) {
  useEffect(() => {
    console.error("Global error boundary caught an error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="
        flex min-h-screen items-center justify-center bg-z-surface px-6 py-16 text-z-text
      ">
        <div
          className="w-full max-w-xl rounded-2xl p-8 text-center"
          style={{
            backgroundColor: "var(--z-card)",
            border: "1px solid rgba(248,113,113,0.35)",
            boxShadow: "0 0 40px rgba(248,113,113,0.1)",
          }}
        >
          <p
            className="mb-3 text-xs font-semibold tracking-widest uppercase"
            style={{ color: "var(--z-red)" }}
          >
            App error
          </p>
          <h1
            className="mb-3 text-3xl font-black"
            style={{
              fontFamily: "var(--font-syne-var)",
              color: "var(--z-text)",
            }}
          >
            We hit a serious issue
          </h1>
          <p
            className="mb-8 text-sm/relaxed"
            style={{ color: "var(--z-muted)" }}
          >
            The app ran into an unexpected problem. Please try a reset first. If
            this keeps happening, return home and try again shortly.
          </p>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              type="button"
              onClick={reset}
              className="font-semibold"
              style={{ backgroundColor: "var(--z-amber)", color: "#07060f" }}
            >
              Reset app
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
      </body>
    </html>
  );
}
