"use client";

import React, { ReactNode } from "react";
import DarkModeToggle from "@/components/dark-mode-toggle";
import { Toaster } from "@/components/ui/sonner";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-100 text-gray-900 transition-colors duration-300 dark:bg-gray-900 dark:text-gray-100">
      <header
        className="flex items-center justify-between bg-white px-4 py-6 transition-colors duration-300 dark:bg-gray-800"
        role="banner"
      >
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Anilist Custom List Manager
        </h1>
        <div className="flex items-center space-x-4">
          <DarkModeToggle />
        </div>
      </header>
      <main
        className="container mx-auto flex flex-grow items-center justify-center bg-gray-100 px-4 py-8 transition-colors duration-300 dark:bg-gray-900"
        role="main"
      >
        {children}
      </main>
      <footer
        className="bg-white px-4 py-4 text-center text-gray-700 shadow-inner transition-colors duration-300 dark:bg-gray-800 dark:text-gray-300"
        role="contentinfo"
      >
        <p>&copy; {new Date().getFullYear()} Anilist Custom List Manager</p>
      </footer>
      <Toaster />
    </div>
  );
}
