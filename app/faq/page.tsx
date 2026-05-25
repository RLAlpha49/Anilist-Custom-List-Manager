"use client";

import { AnimatePresence, motion } from "framer-motion";
import React, { Suspense, useEffect, useState } from "react";
import {
  FaListAlt,
  FaLock,
  FaQuestionCircle,
  FaRocket,
  FaSearch,
  FaTools,
  FaUserCog,
} from "react-icons/fa";

import Breadcrumbs from "@/components/breadcrumbs";
import Layout from "@/components/layout";
import LoadingIndicator from "@/components/loading-indicator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface FAQItem {
  question: string;
  answer: string;
  category: string;
  categoryId: string;
}

// Get category icon
const getCategoryIcon = (categoryId: string) => {
  switch (categoryId) {
    case "category.getting_started":
      return <FaRocket className="size-5" />;
    case "category.account":
      return <FaUserCog className="size-5" />;
    case "category.managing_lists":
      return <FaListAlt className="size-5" />;
    case "category.technical":
      return <FaTools className="size-5" />;
    case "category.security":
      return <FaLock className="size-5" />;
    default:
      return <FaQuestionCircle className="size-5" />;
  }
};

const faqData: FAQItem[] = [
  // Getting Started
  {
    categoryId: "category.getting_started",
    category: "Getting Started",
    question: "What is AniList Custom List Manager?",
    answer:
      "AniList Custom List Manager is a browser-based tool for organizing your anime and manga lists on AniList. It lets you create rule-based custom lists, bulk-assign entries by status, score, format, genre, tag, and more, and apply those changes back to your AniList account in a single guided workflow — all without touching AniList's interface directly.",
  },
  {
    categoryId: "category.getting_started",
    category: "Getting Started",
    question: "What is the basic workflow?",
    answer:
      "The app follows a three-step process: (1) Connect your AniList account via the login page. (2) Configure your custom lists on the Custom List Manager page — add, rename, reorder, and set matching rules for each list. (3) Review the computed changes and apply them in bulk on the Update page. A Completed page then summarizes what was updated.",
  },
  {
    categoryId: "category.getting_started",
    category: "Getting Started",
    question: "Should I back up my AniList data before running an update?",
    answer:
      "Yes. The app displays a prominent backup warning before you proceed to configuration. It is strongly recommended that you export your AniList data first using AniList's own export feature. The app modifies your custom list assignments in bulk, and while it only changes which custom lists an entry belongs to, having a backup lets you recover if anything goes wrong.",
  },
  // Account
  {
    categoryId: "category.account",
    category: "Account",
    question: "How do I connect my AniList account?",
    answer:
      "On the AniList Login page, click 'Login with AniList'. You will be redirected to AniList's authorization page to grant access. After you approve, AniList sends your access token directly to the redirect page in the URL hash. The app reads it, verifies it against AniList's API, and stores it in your browser — no server ever sees your token. Once verified you are returned to the login page, now showing your AniList username and avatar.",
  },
  {
    categoryId: "category.account",
    category: "Account",
    question: "How long does my session last?",
    answer:
      "Sessions have a 24-hour absolute lifetime from the moment you log in. While you are actively using the app your session is refreshed on activity (keypresses, scrolls, pointer events, tab focus changes) — up to once per minute — which resets a 1-hour inactivity timer. If you leave the tab idle for more than an hour, or if 24 hours pass since login, the app will sign you out automatically.",
  },
  {
    categoryId: "category.account",
    category: "Account",
    question: "Why was I logged out automatically?",
    answer:
      "Automatic sign-out happens for one of three reasons: (1) Your session exceeded the 24-hour absolute lifetime. (2) Your browser storage was cleared externally. (3) The app detected that the stored token or user ID was invalid or corrupted. To resume, simply log in again from the AniList Login page.",
  },
  {
    categoryId: "category.account",
    category: "Account",
    question: "How do I disconnect my AniList account?",
    answer:
      "On the AniList Login page, click the 'Disconnect' button while a session is active. This removes your token and user ID from browser storage and signs you out immediately. You can also use the 'Reset Cache' button on the home page, which clears all app-managed browser data including your session — it does not affect your AniList account or lists.",
  },
  // Managing Lists
  {
    categoryId: "category.managing_lists",
    category: "Managing Lists",
    question: "How can I create a new custom list?",
    answer:
      "On the Custom List Manager page, click 'Add New List' and enter a name. The list is added to your local configuration immediately. If the name matches a known keyword (such as a status name, score shorthand like '<5', or a manga region like 'manhwa'), the app will automatically suggest a starter rule for that list. You can then add or edit rules as needed.",
  },
  {
    categoryId: "category.managing_lists",
    category: "Managing Lists",
    question: "Can I reorder my lists?",
    answer:
      "Yes. Each list card has a drag handle you can use to drag and drop lists into your preferred order. The order you set here is the order in which lists will be evaluated and presented. Separate anime and manga list orders are maintained independently.",
  },
  {
    categoryId: "category.managing_lists",
    category: "Managing Lists",
    question: "What conditions can I set for a list?",
    answer:
      "Each list can have one or more rules, and each rule targets one condition. Available condition categories are: Status (Watching, Completed, Paused, Planning, Dropped, Repeating), Score (individual scores 1–10, or 'below 5' meaning scores 1–4), Format (anime: TV, TV Short, Movie, Special, OVA, ONA, Music; manga: Japanese Manga, South Korean Manga/Manhwa, Chinese Manga/Manhua, One Shot, Novel), Genres, Tags, Tag Categories, and Misc (Rewatched, Reread, Adult/18+). Rules can be set as include (entry must match) or exclude (entry must not match). A list also chooses between 'Match All' (entry must satisfy every include rule) or 'Match Any' (entry satisfies at least one).",
  },
  {
    categoryId: "category.managing_lists",
    category: "Managing Lists",
    question: "What does 'remove from all entries' do?",
    answer:
      "Marking a list with 'remove from all entries' tells the updater to strip that list from every entry in your library, regardless of whether any rules match. This is useful for retiring a custom list you no longer want: rather than deleting the list on AniList first, you can let the app clear all its memberships in the same update pass.",
  },
  {
    categoryId: "category.managing_lists",
    category: "Managing Lists",
    question: "What does 'hide default status lists' do?",
    answer:
      "When enabled, this option removes the default AniList status list (Watching, Completed, etc.) from an entry if that entry has been assigned to at least one of your custom lists. The goal is to keep your library view uncluttered by showing entries only in your custom lists. Entries with no matching custom list are left in their default status list unchanged.",
  },
  {
    categoryId: "category.managing_lists",
    category: "Managing Lists",
    question: "What are presets and how do I use them?",
    answer:
      "Presets are named snapshots of your entire list configuration — including all lists, their rules, and settings — saved to your browser's local storage. You can save a preset at any time from the Custom List Manager, and load, duplicate, or delete it later. The app also ships with a built-in default template preset containing common lists like Watching, Completed, Movies, and '<5' that you can load as a starting point from the help modal.",
  },
  {
    categoryId: "category.managing_lists",
    category: "Managing Lists",
    question: "How do Estimate Matches and Preview Entry work?",
    answer:
      "Estimate Matches scans your full AniList library against your current rule configuration and shows how many entries each list would claim, along with up to three sample titles per list. Preview Entry lets you search for a specific title or AniList entry ID and shows exactly which custom lists that single entry would be added to or removed from under your current rules. Both tools run locally against your rules without making any changes to AniList.",
  },
  {
    categoryId: "category.managing_lists",
    category: "Managing Lists",
    question: "Do anime and manga lists work separately?",
    answer:
      "Yes. The Custom List Manager has separate Anime and Manga tabs, and each side keeps its own fetched lists, rules, order, and workflow state. When you click Next, the app queues only the currently active media type for the Update page.",
  },
  {
    categoryId: "category.managing_lists",
    category: "Managing Lists",
    question: "Can I update anime and manga at the same time?",
    answer:
      "Not in a single run. The updater works on one media type at a time based on whichever tab is active when you leave the Custom List Manager. If you want to process both anime and manga, run the workflow once for Anime and again for Manga.",
  },
  {
    categoryId: "category.managing_lists",
    category: "Managing Lists",
    question: "What do the manga format conditions (Manhwa, Manhua) mean?",
    answer:
      "AniList stores all manga-format entries under a single 'Manga' format, but differentiates origin by country of origin. The app maps this as follows: 'Manga (South Korean)' matches entries with a Korean country of origin (manhwa), 'Manga (Chinese)' matches entries with a Chinese country of origin (manhua), and 'Manga (Japan)' matches entries that are neither Korean nor Chinese in origin. When you type a list name containing 'manhwa', 'manwha', or 'manhua', the app will auto-suggest the appropriate format condition.",
  },
  // Technical
  {
    categoryId: "category.technical",
    category: "Technical",
    question: "How does the bulk updater work?",
    answer:
      "After you continue from the Custom List Manager, the Update page loads the saved workflow for the currently selected media type, fetches that part of your AniList library, computes which entries need changes, and builds a review queue. When you start the run, the app sends AniList save-entry mutations in batches, adapts batch size based on AniList rate-limit data, retries transient failures, and can fall back to single-entry updates if a batch fails. You can pause, resume, stop, or manually complete the run, and the Completed page summarizes the result.",
  },
  {
    categoryId: "category.technical",
    category: "Technical",
    question: "Where does the app store my data?",
    answer:
      "All app data is stored in your browser's localStorage under keys prefixed with 'aclm:'. This includes your auth token, workflow configuration, list rules, presets, and update summary. Stored values include an expiry timestamp so stale data is ignored automatically. If localStorage is unavailable or over its quota, the app transparently falls back to an in-memory store for the current session — your data will be present while the tab is open but will not persist across page loads.",
  },
  {
    categoryId: "category.technical",
    category: "Technical",
    question: "What does the 'Reset Cache' button on the home page do?",
    answer:
      "The Reset Cache button clears all app-managed browser storage entries (tokens, workflow config, presets, cached update results, etc.). It does not affect your AniList account or any changes already applied. Use it if the app is behaving unexpectedly or if you want a completely fresh start. You will need to log in again afterwards.",
  },
  // Security
  {
    categoryId: "category.security",
    category: "Security",
    question: "Is my data safe?",
    answer:
      "Your AniList access token is stored in browser-managed storage for this app and is used for direct client-to-AniList API requests. The app does not maintain its own token database or server-side session for your AniList account.",
  },
  {
    categoryId: "category.security",
    category: "Security",
    question:
      "Does the app have a server or backend that stores my information?",
    answer:
      "No. The app has no backend of its own. There is no database, no server-side session, and no account system. All state (token, lists, rules, presets) lives in your browser. The only external service the app communicates with is AniList's official API, which is the same API AniList's own website uses.",
  },
];

function PageData() {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filteredFAQ, setFilteredFAQ] = useState<FAQItem[]>(faqData);
  const [activeTab, setActiveTab] = useState<string>("all");

  // Get unique categories
  const uniqueCategories = Array.from(
    new Set(faqData.map((item) => item.categoryId)),
  );

  // Filter FAQs based on search term and active tab
  useEffect(() => {
    let result = faqData;

    // Apply search filter
    if (searchTerm.trim()) {
      result = result.filter((item) => {
        return (
          item.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.answer.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.category.toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
    }

    // Apply category filter if not "all"
    if (activeTab !== "all") {
      result = result.filter((item) => item.categoryId === activeTab);
    }

    setFilteredFAQ(result);
  }, [searchTerm, activeTab]);

  return (
    <Layout>
      <Breadcrumbs
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "FAQ", href: "/faq" },
        ]}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mx-auto w-full max-w-4xl px-6 py-12"
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <p className="mb-3 text-xs font-semibold tracking-widest text-z-amber uppercase">
            Help &amp; Documentation
          </p>
          <h1 className="mb-4 text-5xl font-black text-z-text">
            Frequently Asked
            <br />
            <span className="text-z-amber">Questions</span>
          </h1>
          <p className="max-w-xl text-z-muted">
            Everything you need to know about managing your anime and manga
            lists.
          </p>
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <div className="relative">
            <FaSearch
              className="absolute top-1/2 left-4 -translate-y-1/2 text-z-subtle"
              size={14}
            />
            <input
              type="text"
              name="faqSearch"
              placeholder="Search questions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoComplete="off"
              className="
                w-full rounded-xl border border-(--z-border-mid) bg-z-card py-3.5 pr-4 pl-10
                text-z-text transition-colors
                placeholder:text-z-subtle
                focus:border-(--z-amber) focus:outline-none
              "
            />
          </div>
        </motion.div>

        {/* Category Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-8"
        >
          <Tabs
            defaultValue="all"
            value={activeTab}
            onValueChange={setActiveTab}
          >
            <TabsList className="
              h-auto flex-wrap rounded-xl border border-(--z-border) bg-z-card p-1
            ">
              <TabsTrigger
                value="all"
                className="
                  rounded-lg px-4 py-2 text-sm text-z-muted transition-all
                  data-[state=active]:bg-(--z-amber-dim) data-[state=active]:text-z-amber
                "
              >
                <FaQuestionCircle className="mr-2 size-4" />
                All
              </TabsTrigger>
              {uniqueCategories.map((categoryId) => (
                <TabsTrigger
                  key={categoryId}
                  value={categoryId}
                  className="
                    rounded-lg px-4 py-2 text-sm text-z-muted transition-all
                    data-[state=active]:bg-(--z-amber-dim) data-[state=active]:text-z-amber
                  "
                >
                  <span className="mr-2">{getCategoryIcon(categoryId)}</span>
                  {
                    faqData.find((item) => item.categoryId === categoryId)
                      ?.category
                  }
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </motion.div>

        {/* FAQ Items */}
        {filteredFAQ.length > 0 ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab + searchTerm}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              {filteredFAQ.map((item) => (
                <div
                  key={item.question}
                  className="
                    overflow-hidden rounded-xl border border-(--z-border) bg-z-card transition-all
                    duration-200
                    hover:border-(--z-border-mid)
                  "
                >
                  <Accordion type="single" collapsible>
                    <AccordionItem value={item.question} className="border-0">
                      <AccordionTrigger className="
                        px-5 py-4 text-left font-semibold text-z-text
                        hover:no-underline
                      ">
                        <div className="flex flex-col items-start gap-1.5">
                          <span>{item.question}</span>
                          <span className="
                            text-xs font-semibold tracking-widest text-z-amber uppercase
                          ">
                            {item.category}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-5 pb-5 text-sm/relaxed text-z-muted">
                        {item.answer}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="py-16 text-center">
            <p className="mb-2 text-z-muted">
              No questions found for &ldquo;{searchTerm}&rdquo;
            </p>
            <button
              onClick={() => {
                setSearchTerm("");
                setActiveTab("all");
              }}
              className="text-sm text-z-amber hover:underline"
            >
              Clear search
            </button>
          </div>
        )}
      </motion.div>
    </Layout>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingIndicator />}>
      <PageData />
    </Suspense>
  );
}
