import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers to common questions about AniList login, custom list conditions, updates, and data handling.",
  alternates: {
    canonical: "/faq",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: "FAQ | AniList Custom List Manager",
    description:
      "Read answers about AniList authentication, custom list conditions, syncing behavior, and troubleshooting.",
    url: "/faq",
  },
  twitter: {
    title: "FAQ | AniList Custom List Manager",
    description:
      "Answers about AniList authentication, list conditions, syncing behavior, and troubleshooting.",
  },
};

const faqPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is AniList Custom List Manager?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AniList Custom List Manager helps you organize anime and manga entries by creating custom lists and applying rule-based conditions.",
      },
    },
    {
      "@type": "Question",
      name: "How do I connect my AniList account?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Use the AniList login step to authorize access through AniList OAuth and then continue to custom list configuration.",
      },
    },
    {
      "@type": "Question",
      name: "What conditions can I set for my lists?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You can configure conditions based on status, score, genres, tags, tag categories, formats, and additional misc options.",
      },
    },
    {
      "@type": "Question",
      name: "Is my AniList token stored securely?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The app stores AniList session data in your browser storage and does not persist AniList credentials on a separate backend service.",
      },
    },
  ],
};

export default function FAQLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageJsonLd) }}
      />
      {children}
    </>
  );
}
