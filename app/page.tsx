"use client";

import React from "react";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import Link from "next/link";
import { FaGithub } from "react-icons/fa";
import { HiOutlineSparkles } from "react-icons/hi";
import Breadcrumbs from "@/components/breadcrumbs";
import { toast } from "sonner";
import LoadingIndicator from "@/components/loading-indicator";
import { Suspense } from "react";
import { motion } from "framer-motion";
import { Separator } from "@/components/ui/separator";

// Animation variants
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6 } },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
    },
  },
};

function PageData() {
  const clearCache = () => {
    localStorage.clear();
    toast.success("Cache cleared!", {
      description: "Your cache has been cleared.",
    });
  };

  const breadcrumbs = [{ name: "Home", href: "/" }];

  return (
    <Layout>
      <Breadcrumbs breadcrumbs={breadcrumbs} />
      <div className="flex flex-col items-center justify-center px-4 text-gray-900 dark:text-gray-100">
        {/* Hero Section */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="relative mb-16 w-full max-w-5xl overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 p-8 shadow-xl transition-all duration-300 dark:from-gray-800 dark:to-gray-900"
        >
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.2, 0.3, 0.2],
            }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-400 opacity-20 blur-3xl filter dark:bg-blue-600"
          ></motion.div>
          <motion.div
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.2, 0.3, 0.2],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1,
            }}
            className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-indigo-400 opacity-20 blur-3xl filter dark:bg-indigo-600"
          ></motion.div>

          <CardHeader className="p-0 pb-6">
            <motion.div variants={fadeInUp}>
              <CardTitle className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text pb-2 text-5xl font-bold text-transparent dark:from-blue-400 dark:to-indigo-400">
                Anilist Custom List Manager
              </CardTitle>
            </motion.div>
            <motion.div variants={fadeInUp}>
              <CardDescription className="mt-4 text-xl text-gray-600 dark:text-gray-300">
                Manage your anime and manga lists with ease
              </CardDescription>
            </motion.div>
          </CardHeader>
          <CardContent className="p-0">
            <motion.div variants={fadeInUp}>
              <p className="mb-8 max-w-3xl text-lg text-gray-700 dark:text-gray-200">
                Take full control of your Anilist experience by organizing your
                entries into customized lists. Whether you&apos;re tracking
                anime, manga, or both, our tool offers advanced features to suit
                your needs.
              </p>
            </motion.div>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="flex flex-wrap gap-4"
            >
              <motion.div
                variants={fadeInUp}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  asChild
                  size="lg"
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 text-lg font-medium text-white transition-all duration-300 hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg dark:from-blue-500 dark:to-indigo-500 dark:hover:from-blue-600 dark:hover:to-indigo-600"
                  aria-label="Get Started with Anilist"
                >
                  <Link href="/anilist-login">
                    <HiOutlineSparkles className="mr-2 h-5 w-5" />
                    Get Started
                  </Link>
                </Button>
              </motion.div>
              <motion.div
                variants={fadeInUp}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  variant="outline"
                  asChild
                  size="lg"
                  className="border-gray-300 bg-white/80 text-lg font-medium text-gray-700 backdrop-blur-sm transition-all duration-300 hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
                  aria-label="Frequently Asked Questions about Anilist Custom List Manager"
                >
                  <Link href="/faq">FAQ</Link>
                </Button>
              </motion.div>
              <motion.div
                variants={fadeInUp}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  variant="outline"
                  asChild
                  size="lg"
                  className="border-gray-300 bg-white/80 text-lg font-medium text-gray-700 backdrop-blur-sm transition-all duration-300 hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
                  aria-label="View on GitHub"
                >
                  <Link
                    href="https://github.com/RLAlpha49/Anilist-Custom-List-Manager"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <FaGithub className="mr-2 h-5 w-5" />
                    GitHub
                  </Link>
                </Button>
              </motion.div>
            </motion.div>
          </CardContent>
        </motion.div>

        {/* Features Carousel */}

        {/* How It Works */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={fadeInUp}
          className="mb-16 w-full max-w-5xl"
        >
          <div className="mb-8 text-center">
            <motion.h2
              variants={fadeInUp}
              className="mb-2 text-3xl font-bold text-gray-900 dark:text-white"
            >
              How It Works
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="mx-auto max-w-2xl text-gray-600 dark:text-gray-300"
            >
              Get started with Anilist Custom List Manager in three simple steps
            </motion.p>
            <motion.div variants={fadeInUp}>
              <Separator className="mx-auto mt-6 w-24 bg-blue-200 dark:bg-blue-800" />
            </motion.div>
          </div>

          <motion.div
            variants={staggerContainer}
            className="grid gap-8 md:grid-cols-3"
          >
            <motion.div
              whileHover={{
                y: -5,
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
              }}
              transition={{ duration: 0.3 }}
              className="relative rounded-xl bg-white p-6 text-center shadow-md transition-all duration-300 dark:bg-gray-800"
            >
              <div className="absolute -top-4 left-0 right-0 mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white dark:bg-blue-500">
                1
              </div>
              <h3 className="mt-6 text-xl font-semibold text-gray-900 dark:text-white">
                Connect with Anilist
              </h3>
              <p className="mt-3 text-gray-700 dark:text-gray-300">
                Log in with your Anilist account to grant access to your lists
                and entries.
              </p>
            </motion.div>

            <motion.div
              whileHover={{
                y: -5,
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
              }}
              transition={{ duration: 0.3 }}
              className="relative rounded-xl bg-white p-6 text-center shadow-md transition-all duration-300 hover:shadow-lg dark:bg-gray-800"
            >
              <div className="absolute -top-4 left-0 right-0 mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-xl font-bold text-white dark:bg-indigo-500">
                2
              </div>
              <h3 className="mt-6 text-xl font-semibold text-gray-900 dark:text-white">
                Customize Your View
              </h3>
              <p className="mt-3 text-gray-700 dark:text-gray-300">
                Apply filters, sort options, and criteria to view entries
                exactly how you want.
              </p>
            </motion.div>

            <motion.div
              whileHover={{
                y: -5,
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
              }}
              transition={{ duration: 0.3 }}
              className="relative rounded-xl bg-white p-6 text-center shadow-md transition-all duration-300 hover:shadow-lg dark:bg-gray-800"
            >
              <div className="absolute -top-4 left-0 right-0 mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-purple-600 text-xl font-bold text-white dark:bg-purple-500">
                3
              </div>
              <h3 className="mt-6 text-xl font-semibold text-gray-900 dark:text-white">
                Organize with Ease
              </h3>
              <p className="mt-3 text-gray-700 dark:text-gray-300">
                Move entries between lists, update them in bulk, and keep
                everything perfectly organized.
              </p>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Clear Cache Button */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={fadeInUp}
          className="mb-12 w-full max-w-5xl rounded-xl bg-white p-6 shadow-md dark:bg-gray-800"
        >
          <div className="flex flex-col items-center justify-between space-y-4 sm:flex-row sm:space-y-0">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                Cache Management
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Clear your local storage to refresh data and fix potential
                issues.
              </p>
            </div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                onClick={clearCache}
                className="bg-red-500 text-white transition-all duration-300 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                aria-label="Clear Cache"
              >
                Clear Cache
              </Button>
            </motion.div>
          </div>
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
