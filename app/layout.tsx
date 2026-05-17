import "./globals.css";

import { Analytics } from "@vercel/analytics/next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import React from "react";

import { AuthProvider } from "@/context/auth-context";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Anilist Custom List Manager",
  description: "Manage your anime and manga lists with ease",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class">
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
        <Script src="/googleAnalytics.js" strategy="afterInteractive" />
        <Analytics />
      </body>
    </html>
  );
}
