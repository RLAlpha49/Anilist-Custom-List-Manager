import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Update Complete",
  description: "Completion summary route for AniList custom list updates.",
  alternates: {
    canonical: "/completed",
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

export default function CompletedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
