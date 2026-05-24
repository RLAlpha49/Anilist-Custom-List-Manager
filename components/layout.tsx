"use client";

import { Analytics } from "@vercel/analytics/next";
import Link from "next/link";
import Script from "next/script";
import React, { ReactNode } from "react";

import DarkModeToggle from "@/components/dark-mode-toggle";
import { Toaster } from "@/components/ui/sonner";

interface LayoutProps {
  readonly children: ReactNode;
}

export default function Layout({ children }: Readonly<LayoutProps>) {
  return (
    <div className="flex min-h-screen flex-col bg-z-surface text-z-text">
      <header
        className="sticky top-0 z-50 border-b border-(--z-border) bg-(--z-card)"
        role="banner"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link
            href="/"
            aria-label="Go to homepage"
            className="flex items-center rounded-sm focus:outline-none"
            tabIndex={0}
          >
            <span className="text-xl font-bold text-z-amber select-none">
              Anilist Custom List Manager
            </span>
          </Link>
          <div className="flex items-center space-x-4">
            <Link
              href="/"
              className="
                text-sm text-z-muted transition-colors duration-200
                hover:text-z-text
                active:opacity-70
              "
            >
              Home
            </Link>
            <Link
              href="/faq"
              className="
                text-sm text-z-muted transition-colors duration-200
                hover:text-z-text
                active:opacity-70
              "
            >
              FAQ
            </Link>
            <DarkModeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1 bg-z-surface" role="main">
        {children}
      </main>
      <footer
        className="border-t border-(--z-border) bg-z-card px-6 py-5"
        role="contentinfo"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <span className="text-sm text-z-subtle">
            &copy; 2025 Anilist Custom List Manager
          </span>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-z-subtle">Public pages:</span>
              <Link
                href="/"
                className="text-z-muted transition-colors duration-200 hover:text-z-text"
                aria-label="Visit home page"
              >
                Home
              </Link>
              <Link
                href="/faq"
                className="text-z-muted transition-colors duration-200 hover:text-z-text"
                aria-label="Visit FAQ page"
              >
                FAQ
              </Link>
            </div>
            <Link
              href="https://github.com/RLAlpha49/Anilist-Custom-List-Manager"
              target="_blank"
              rel="noopener noreferrer"
              className="text-z-muted transition-colors duration-200 hover:text-z-text"
              aria-label="View project on GitHub"
            >
              GitHub
            </Link>
          </div>
        </div>
      </footer>
      <Toaster />
      <Script src="/googleAnalytics.js" strategy="lazyOnload" />
      <Analytics />
    </div>
  );
}
