import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "AniList Redirect",
  description:
    "OAuth callback route used to process AniList authentication responses.",
  alternates: {
    canonical: "/anilist-redirect",
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

export default function AniListRedirectLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
