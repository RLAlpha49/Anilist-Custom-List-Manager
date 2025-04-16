"use client";

import React from "react";
import Layout from "@/components/layout";
import { Suspense, useState, useEffect } from "react";
import {
  FaQuestionCircle,
  FaSearch,
  FaHome,
  FaListAlt,
  FaUserCog,
  FaLock,
  FaTools,
  FaRocket,
} from "react-icons/fa";
import Breadcrumbs from "@/components/breadcrumbs";
import { motion } from "framer-motion";
import Link from "next/link";
import LoadingIndicator from "@/components/loading-indicator";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      return <FaRocket className="h-5 w-5" />;
    case "category.account":
      return <FaUserCog className="h-5 w-5" />;
    case "category.managing_lists":
      return <FaListAlt className="h-5 w-5" />;
    case "category.technical":
      return <FaTools className="h-5 w-5" />;
    case "category.security":
      return <FaLock className="h-5 w-5" />;
    default:
      return <FaQuestionCircle className="h-5 w-5" />;
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

// Animation variants
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

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

  // Group FAQs by category for display
  const faqsByCategory = filteredFAQ.reduce(
    (acc, item) => {
      const categoryId = item.categoryId;
      if (!acc[categoryId]) {
        acc[categoryId] = [];
      }
      acc[categoryId].push(item);
      return acc;
    },
    {} as Record<string, FAQItem[]>,
  );

  return (
    <Layout>
      <Breadcrumbs
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "FAQ", href: "/faq" },
        ]}
      />
      <div className="flex min-h-screen flex-col items-center justify-start bg-gradient-to-b from-gray-50 to-white px-4 py-12 text-gray-900 dark:from-gray-900 dark:to-gray-800 dark:text-gray-100">
        <motion.div
          className="w-full max-w-4xl"
          initial="hidden"
          animate="visible"
          variants={fadeIn}
        >
          {/* Header Section */}
          <motion.div className="mb-12 text-center" variants={fadeInUp}>
            <div className="mb-6 inline-flex h-24 w-24 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <FaQuestionCircle className="h-12 w-12 text-blue-600 dark:text-blue-400" />
            </div>
            <motion.h1
              className="mb-4 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-4xl font-bold text-transparent dark:from-blue-400 dark:to-indigo-400"
              variants={fadeInUp}
            >
              Frequently Asked Questions
            </motion.h1>
            <motion.p
              className="mx-auto mt-2 max-w-2xl text-xl text-gray-600 dark:text-gray-300"
              variants={fadeInUp}
            >
              Find answers to the most common questions about AniList Custom
              List Manager.
            </motion.p>
          </motion.div>

          {/* Search Bar */}
          <motion.div className="relative mb-8" variants={fadeInUp}>
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search FAQs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-12 border-gray-200 bg-white pl-10 focus-visible:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:focus-visible:ring-blue-400"
              />
            </div>
          </motion.div>

          {/* Category Tabs */}
          <motion.div className="mb-8" variants={fadeInUp}>
            <Tabs
              defaultValue="all"
              value={activeTab}
              onValueChange={setActiveTab}
            >
              <TabsList className="mb-6 flex w-full flex-nowrap overflow-x-auto bg-gray-100 p-1 dark:bg-gray-800">
                <TabsTrigger
                  value="all"
                  className="flex-shrink-0 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700"
                >
                  <FaQuestionCircle className="mr-2 h-4 w-4" />
                  All Categories
                </TabsTrigger>
                {uniqueCategories.map((categoryId) => (
                  <TabsTrigger
                    key={categoryId}
                    value={categoryId}
                    className="flex-shrink-0 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700"
                  >
                    {getCategoryIcon(categoryId)}
                    <span className="ml-2">
                      {
                        faqData.find((item) => item.categoryId === categoryId)
                          ?.category
                      }
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </motion.div>

          {filteredFAQ.length > 0 ? (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="space-y-6"
            >
              {Object.entries(faqsByCategory).map(([categoryId, items]) => (
                <motion.div
                  key={categoryId}
                  variants={fadeInUp}
                  className="space-y-4"
                >
                  <Card className="overflow-hidden border-0 bg-white shadow-md dark:bg-gray-800">
                    <CardHeader className="dark:to-gray-750 bg-gradient-to-r from-blue-50 to-indigo-50 pb-2 dark:from-gray-800">
                      <div className="flex items-center">
                        <span className="text-blue-500 dark:text-blue-400">
                          {getCategoryIcon(categoryId)}
                        </span>
                        <CardTitle className="ml-2 text-xl font-semibold text-gray-900 dark:text-white">
                          {items[0].category}
                        </CardTitle>
                      </div>
                      <CardDescription>
                        <Badge
                          variant="outline"
                          className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                        >
                          {items.length}{" "}
                          {items.length === 1 ? "question" : "questions"}
                        </Badge>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-2 pt-4">
                      <Accordion type="single" collapsible className="w-full">
                        {items.map((item, itemIndex) => (
                          <AccordionItem
                            key={itemIndex}
                            value={`item-${categoryId}-${itemIndex}`}
                            className="border-b border-gray-200 last:border-0 dark:border-gray-700"
                          >
                            <AccordionTrigger className="py-4 text-left font-medium text-gray-900 hover:text-blue-600 hover:no-underline dark:text-white dark:hover:text-blue-400">
                              {item.question}
                            </AccordionTrigger>
                            <AccordionContent className="max-w-full break-words pb-4 text-gray-700 dark:text-gray-300">
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.3 }}
                                className="prose dark:prose-invert max-w-none"
                              >
                                {item.answer}
                              </motion.div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div variants={fadeInUp} className="py-12 text-center">
              <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                <FaSearch className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-medium text-gray-900 dark:text-white">
                No matching questions found
              </h3>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Try a different search term or category
              </p>
            </motion.div>
          )}

          {/* Back to Home Link */}
          <motion.div variants={fadeInUp} className="mt-12 text-center">
            <Link
              href="/"
              className="inline-flex items-center rounded-full bg-blue-100 px-6 py-3 text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-800/40 dark:text-blue-300 dark:hover:bg-blue-700/50"
            >
              <FaHome className="mr-2 h-4 w-4" />
              Back to Home
            </Link>
          </motion.div>
        </motion.div>
      </div>
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
