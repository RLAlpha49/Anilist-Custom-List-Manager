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
  {
    categoryId: "category.getting_started",
    category: "Getting Started",
    question: "What is AniList Custom List Manager?",
    answer:
      "AniList Custom List Manager is a tool that allows you to organize and manage your anime and manga lists on AniList with ease. It offers advanced features such as creating custom lists, sorting entries, and setting conditions to automate list updates.",
  },
  {
    categoryId: "category.account",
    category: "Account",
    question: "How do I connect my AniList account?",
    answer:
      "To connect your AniList account, click on the 'Login with AniList' button on the AniList Login page. You'll be redirected to AniList's authorization page where you can grant access. Once authorized, you'll be redirected back to the application.",
  },
  {
    categoryId: "category.managing_lists",
    category: "Managing Lists",
    question: "How can I create a new custom list?",
    answer:
      "Navigate to the Custom List Manager page and click on the 'Add New List' button. Enter the desired name for your new list and it will be added to your collection. You can then set conditions and organize your entries accordingly.",
  },
  {
    categoryId: "category.managing_lists",
    category: "Managing Lists",
    question: "Can I sort and organize my lists?",
    answer:
      "Yes, the tool allows you to sort your lists based on various criteria such as status, score, rereads, genres, tags, and type. You can also drag and drop lists to reorder them according to your preferences.",
  },
  {
    categoryId: "category.managing_lists",
    category: "Managing Lists",
    question: "What conditions can I set for my lists?",
    answer:
      "You can set conditions based on status (e.g., Watching, Completed), score ranges, genres, tags, formats, and more. These conditions help automate the organization of your entries into the appropriate custom lists.",
  },
  {
    categoryId: "category.technical",
    category: "Technical",
    question: "How does the application handle rate limiting?",
    answer:
      "The application includes mechanisms to handle rate limiting by AniList's API. If rate limiting is encountered, the process will pause and retry after a specified cooldown period.",
  },
  {
    categoryId: "category.security",
    category: "Security",
    question: "Is my data safe?",
    answer:
      "Yes, your data is handled securely. The application stores your AniList access token locally on your device and it is never stored elsewhere. This ensures that only you have access to it. All data transactions are performed through AniList's official API.",
  },
  {
    categoryId: "category.technical",
    category: "Technical",
    question: "How do I clear cached tokens?",
    answer:
      "To clear cached tokens, navigate to the AniList Login page and click on the 'Clear Cached Token' button. This will remove your access token from local storage, and you'll need to log in again to reconnect your AniList account.",
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
              placeholder="Search questions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
