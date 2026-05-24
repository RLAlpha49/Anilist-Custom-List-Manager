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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${syne.variable} ${dmSans.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
