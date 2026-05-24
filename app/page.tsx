import type { Metadata } from "next";
import Link from "next/link";
import { FaExclamationTriangle, FaGithub } from "react-icons/fa";
import { HiOutlineSparkles } from "react-icons/hi";

import Breadcrumbs from "@/components/breadcrumbs";
import { HomeCacheResetButton } from "@/components/home-cache-reset-button";
import Layout from "@/components/layout";

export const metadata: Metadata = {
  title: "Home",
  description:
    "Manage AniList custom lists with rule-based conditions and a guided update workflow.",
  alternates: {
    canonical: "/",
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
    title: "AniList Custom List Manager",
    description:
      "Create and manage AniList custom lists with rule-based conditions and safer updates.",
    url: "/",
  },
  twitter: {
    title: "AniList Custom List Manager",
    description:
      "Create and manage AniList custom lists with rule-based conditions and safer updates.",
  },
};

const webApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AniList Custom List Manager",
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Web",
  description:
    "A web app to create and manage AniList custom lists with rule-based conditions and guided updates.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function Page() {
  const breadcrumbs = [{ name: "Home", href: "/" }];

  return (
    <Layout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webApplicationJsonLd),
        }}
      />
      <Breadcrumbs breadcrumbs={breadcrumbs} />
      <div className="mx-auto w-full max-w-5xl px-6 py-16">
        <p
          className="mb-4 text-xs font-semibold tracking-widest uppercase"
          style={{ color: "var(--z-amber)" }}
        >
          Powered by AniList API
        </p>

        <h1
          className="mb-6 text-6xl/tight font-black md:text-7xl"
          style={{ fontFamily: "var(--font-syne-var)", color: "var(--z-text)" }}
        >
          Manage Your
          <br />
          <span style={{ color: "var(--z-amber)" }}>Lists.</span>{" "}
          <span style={{ color: "var(--z-pink)" }}>Your Way.</span>
        </h1>

        <p
          className="mb-10 max-w-2xl text-lg/relaxed"
          style={{ color: "var(--z-muted)" }}
        >
          Take full control of your AniList experience. Create custom lists, set
          smart conditions, and automate how your anime and manga entries are
          organized.
        </p>

        <div className="mb-20 flex flex-wrap gap-4">
          <Link
            href="/anilist-login"
            className="
              inline-flex items-center gap-2 rounded-lg px-8 py-4 text-base font-bold transition-all
              duration-200
              hover:brightness-110
              active:scale-95
            "
            style={{ backgroundColor: "var(--z-amber)", color: "#07060f" }}
            aria-label="Get Started with Anilist"
          >
            <HiOutlineSparkles size={18} />
            Get Started
          </Link>
          <Link
            href="/faq"
            className="
              inline-flex items-center gap-2 rounded-lg px-8 py-4 text-base transition-all
              duration-200
              hover:bg-(--z-card-up)
              active:scale-95
            "
            style={{
              border: "1px solid var(--z-border-mid)",
              color: "var(--z-text)",
            }}
            aria-label="Frequently Asked Questions"
          >
            Learn More
          </Link>
          <Link
            href="https://github.com/RLAlpha49/Anilist-Custom-List-Manager"
            target="_blank"
            rel="noopener noreferrer"
            className="
              group inline-flex items-center gap-2 rounded-lg px-8 py-4 text-base
              transition-[transform,color,background-color,border-color,box-shadow] duration-200
              ease-out
              hover:border-(--z-border-mid) hover:bg-(--z-card-up) hover:text-(--z-text)
              hover:shadow-[0_8px_18px_rgba(0,0,0,0.28)]
              focus-visible:ring-2 focus-visible:ring-(--z-amber)/60 focus-visible:ring-offset-2
              focus-visible:ring-offset-(--z-bg) focus-visible:outline-none
              active:translate-y-px active:scale-95
            "
            style={{
              border: "1px solid var(--z-border)",
              color: "var(--z-muted)",
            }}
            aria-label="View on GitHub"
          >
            <FaGithub size={18} className="group-active:scale-95" />
            GitHub
          </Link>
        </div>

        <div className="mb-16 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Connect AniList",
              desc: "Link your AniList account securely with OAuth in one click.",
              accent: "var(--z-amber)",
            },
            {
              step: "02",
              title: "Configure Lists",
              desc: "Create unlimited custom lists and set smart sorting conditions.",
              accent: "var(--z-pink)",
            },
            {
              step: "03",
              title: "Sync & Update",
              desc: "Apply changes to all your anime and manga entries automatically.",
              accent: "var(--z-frost)",
            },
          ].map((feat) => (
            <div
              key={feat.step}
              className="rounded-xl p-5 transition-all duration-200"
              style={{
                backgroundColor: "var(--z-card)",
                border: "1px solid var(--z-border)",
              }}
            >
              <div
                className="mb-3 text-3xl font-bold tracking-tight opacity-20"
                style={{
                  fontFamily: "var(--font-syne-var)",
                  color: feat.accent,
                }}
              >
                {feat.step}
              </div>
              <h3
                className="mb-2 font-bold"
                style={{
                  fontFamily: "var(--font-syne-var)",
                  color: "var(--z-text)",
                }}
              >
                {feat.title}
              </h3>
              <p
                className="text-sm/relaxed"
                style={{ color: "var(--z-muted)" }}
              >
                {feat.desc}
              </p>
            </div>
          ))}
        </div>

        <div
          className="space-y-4 pt-8"
          style={{ borderTop: "1px solid var(--z-border)" }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--z-subtle)" }}
              >
                Issues? Try clearing your local cache.
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--z-muted)" }}>
                This signs you out locally and removes saved lists, fetched
                results, and setup data from this browser.
              </p>
            </div>
            <HomeCacheResetButton />
          </div>
          <div
            className="flex items-start gap-3 rounded-xl p-3"
            style={{
              backgroundColor: "rgba(245,166,35,0.08)",
              border: "1px solid rgba(245,166,35,0.18)",
            }}
          >
            <FaExclamationTriangle
              className="mt-0.5 shrink-0"
              style={{ color: "var(--z-amber)" }}
            />
            <p className="text-xs/relaxed" style={{ color: "var(--z-text)" }}>
              Use this only if the app is acting weird. It does{" "}
              <span className="font-semibold">not</span> change AniList itself —
              it only wipes cached data stored in this browser.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
