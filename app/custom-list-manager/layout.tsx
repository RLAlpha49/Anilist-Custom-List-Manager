import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Custom List Manager",
  description:
    "Workflow route for configuring and updating AniList custom lists.",
  alternates: {
    canonical: "/custom-list-manager",
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

export default function CustomListManagerLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
