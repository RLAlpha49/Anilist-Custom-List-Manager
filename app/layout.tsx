import "./globals.css";

import type { Metadata } from "next";
import { DM_Sans, Syne } from "next/font/google";
import React from "react";

import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/context/auth-context";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne-var",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans-var",
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const DEFAULT_SITE_URL = "https://anilist-custom-list-manager.vercel.app";
const configuredSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ??
  process.env.NEXT_PUBLIC_VERCEL_URL;
let normalizedSiteUrl = DEFAULT_SITE_URL;

if (configuredSiteUrl) {
  normalizedSiteUrl = configuredSiteUrl.startsWith("http")
    ? configuredSiteUrl
    : `https://${configuredSiteUrl}`;
}

export const metadata: Metadata = {
  metadataBase: new URL(normalizedSiteUrl),
  title: {
    default: "AniList Custom List Manager",
    template: "%s | AniList Custom List Manager",
  },
  description:
    "Create and manage AniList custom lists with rule-based conditions, safer updates, and a guided workflow.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "AniList Custom List Manager",
    title: "AniList Custom List Manager",
    description:
      "Create and manage AniList custom lists with rule-based conditions and guided updates.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "AniList Custom List Manager",
    description:
      "Manage AniList custom lists with flexible conditions and a step-by-step update flow.",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

const telemetryEnvironment =
  process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
const telemetryRelease =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "local";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${syne.variable} ${dmSans.variable}`}
        data-telemetry-env={telemetryEnvironment}
        data-telemetry-release={telemetryRelease}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
