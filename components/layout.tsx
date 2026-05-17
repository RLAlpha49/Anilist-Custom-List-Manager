"use client";

import Link from "next/link";
import React, { ReactNode } from "react";

import DarkModeToggle from "@/components/dark-mode-toggle";
import { Toaster } from "@/components/ui/sonner";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="
      flex min-h-screen flex-col bg-gray-100 text-gray-900 transition-colors duration-300
      dark:bg-gray-900 dark:text-gray-100
    ">
      <header
        className="
          flex items-center justify-between bg-white px-4 py-6 transition-colors duration-300
          dark:bg-gray-800
        "
        role="banner"
      >
        <Link
          href="/"
          aria-label="Go to homepage"
          className="
            flex items-center space-x-3 rounded-sm
            focus:ring-2 focus:ring-blue-500 focus:outline-none
          "
          tabIndex={0}
        >
          <span aria-hidden="true" className="inline-block">
            <img
              src="/images/logo.png"
              alt="AniList Custom List Manager Logo"
              width="64"
              height="64"
              className="size-12 object-contain"
            />
          </span>
          <span className="text-2xl font-bold text-gray-900 select-none dark:text-gray-100">
            Anilist Custom List Manager
          </span>
        </Link>
        <div className="flex items-center space-x-4">
          <DarkModeToggle />
        </div>
      </header>
      <main
        className="
          container mx-auto flex grow items-center justify-center bg-gray-100 px-4 py-8
          transition-colors duration-300
          dark:bg-gray-900
        "
        role="main"
      >
        {children}
      </main>
      <footer
        className="
          bg-white p-4 text-center text-gray-700 shadow-inner transition-colors duration-300
          dark:bg-gray-800 dark:text-gray-300
        "
        role="contentinfo"
      >
        <p>&copy; {new Date().getFullYear()} Anilist Custom List Manager</p>
      </footer>
      <Toaster />
    </div>
  );
}
