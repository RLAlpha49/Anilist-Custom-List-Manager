import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "AniList Login",
  description:
    "Authentication step for connecting your AniList account to the custom list workflow.",
  alternates: {
    canonical: "/anilist-login",
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

export default function AniListLoginLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
