import "./globals.css";

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

export const metadata = {
  title: "Anilist Custom List Manager",
  description: "Manage your anime and manga lists with ease",
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
