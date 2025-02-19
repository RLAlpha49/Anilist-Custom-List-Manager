"use client";

import Layout from "@/components/layout";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, Suspense, JSX } from "react";
import { motion } from "framer-motion";
import { FaCheckCircle, FaHome, FaList, FaGithub } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import ToastContainer from "@/components/ui/toast-container";
import { toast } from "@/hooks/use-toast";
import Breadcrumbs from "@/components/breadcrumbs";
import { getItemWithExpiry, removeItemWithExpiry } from "@/lib/local-storage";
import { Trans } from "@lingui/react";
import LoadingIndicator from "@/components/loading-indicator";

interface Summary {
	totalListsUpdated: number;
	totalEntriesUpdated: number;
}

interface CompletedPageProps {
	summary?: Summary;
}

function PageData({ summary }: CompletedPageProps): JSX.Element {
	const router = useRouter();
	const [localSummary, setLocalSummary] = useState<Summary>({
		totalListsUpdated: 0,
		totalEntriesUpdated: 0,
	});

	const hasFetchedSummary = useRef(false);

	useEffect(() => {
		if (hasFetchedSummary.current) return;
		hasFetchedSummary.current = true;

		const storedSummary = getItemWithExpiry("updateSummary");
		let summaryData: Summary = { totalListsUpdated: 0, totalEntriesUpdated: 0 };

		if (storedSummary) {
			summaryData = JSON.parse(storedSummary);
			removeItemWithExpiry("updateSummary");
		} else if (summary) {
			summaryData = summary;
		} else {
			toast({
				title: <Trans id="toast.no_update_information" message="No Update Information" />,
				description: (
					<Trans
						id="toast.no_summary_found"
						message="No summary data was found for your recent update."
					/>
				),
				variant: "warning",
			});
		}

		setLocalSummary(summaryData);
	}, [summary]);

	const handleGoHome = () => {
		router.push("/");
	};

	const handleManageLists = () => {
		router.push("/custom-list-manager");
	};

	const breadcrumbs = [
		{ name: "Home", href: "/" },
		{ name: "Completed", href: "/completed" },
	];

	return (
		<Layout>
			<Breadcrumbs breadcrumbs={breadcrumbs} />
			<div className="flex items-center justify-center px-4 py-12 bg-gray-100 dark:bg-gray-900">
				<Card className="w-full max-w-lg bg-white dark:bg-gray-800 shadow-xl rounded-lg overflow-hidden transition-colors duration-300">
					<CardHeader className="text-center">
						<motion.div
							initial={{ scale: 0 }}
							animate={{ scale: 1 }}
							transition={{ duration: 0.5 }}
							className="flex justify-center"
						>
							<FaCheckCircle
								className="text-green-500 dark:text-green-400 w-16 h-16"
								aria-hidden="true"
							/>
						</motion.div>
						<CardTitle className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">
							<Trans id="status.update_completed_title" message="Update Completed!" />
						</CardTitle>
						<CardDescription className="mt-2 text-gray-600 dark:text-gray-300">
							<Trans
								id="description.update_completed"
								message="Your custom lists have been successfully updated."
							/>
						</CardDescription>
					</CardHeader>
					<CardContent>
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.3, duration: 0.5 }}
							className="mt-4 space-y-2"
						>
							{localSummary.totalListsUpdated === 0 &&
							localSummary.totalEntriesUpdated === 0 ? (
								<div className="text-yellow-400 text-center">
									<p>
										<Trans
											id="status.no_update_info"
											message="No update information was found for your recent update."
										/>
									</p>
								</div>
							) : (
								<>
									<div className="flex justify-between">
										<span className="text-gray-900 dark:text-gray-100">
											<Trans id="text.total_lists" message="Total Lists:" />
										</span>
										<span className="font-semibold text-gray-900 dark:text-gray-100">
											{localSummary.totalListsUpdated}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-gray-900 dark:text-gray-100">
											<Trans
												id="text.total_entries_updated"
												message="Total Entries Updated:"
											/>
										</span>
										<span className="font-semibold text-gray-900 dark:text-gray-100">
											{localSummary.totalEntriesUpdated}
										</span>
									</div>
								</>
							)}
						</motion.div>
						<div className="mt-6 flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
							<motion.div
								whileHover={{ scale: 1.05 }}
								whileTap={{ scale: 0.95 }}
								className="w-full sm:w-auto"
							>
								<Button
									onClick={handleManageLists}
									className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white w-full sm:w-auto transition-colors duration-300"
									aria-label="Manage Lists Again"
								>
									<FaList
										className="mr-2 text-white dark:text-white"
										aria-hidden="true"
									/>
									<Trans id="button.manage_lists" message="Manage Lists" />
								</Button>
							</motion.div>
							<motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
								<Button
									variant="outline"
									onClick={handleGoHome}
									className="bg-gray-700 dark:bg-white text-white dark:text-black hover:text-white hover:bg-gray-600 dark:hover:text-gray-800 dark:hover:bg-gray-200 transition-colors flex items-center"
									aria-label="Navigate to Home"
								>
									<FaHome className="mr-2" aria-hidden="true" />
									<Trans id="button.home" message="Home" />
								</Button>
							</motion.div>
						</div>
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.6, duration: 0.5 }}
							className="mt-8 text-center"
						>
							<h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
								<Trans
									id="header.check_out_projects"
									message="Check Out My Other Projects"
								/>
							</h2>
							<div className="flex flex-wrap justify-center items-center space-x-2 space-y-2 overflow-auto max-h-40">
								<motion.a
									href="https://github.com/RLAlpha49/AniCards"
									target="_blank"
									rel="noopener noreferrer"
									whileHover={{ scale: 1.05 }}
									whileTap={{ scale: 0.95 }}
									className="w-full sm:w-auto mt-2 ml-2"
									aria-label="View AniCards project on GitHub"
								>
									<Button className="flex items-center justify-center bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 text-white transition-colors duration-300">
										<FaGithub className="mr-2" aria-hidden="true" />
										<Trans id="button.anicards" message="AniCards" />
									</Button>
								</motion.a>
								<motion.a
									href="https://github.com/RLAlpha49/AniSearchModel"
									target="_blank"
									rel="noopener noreferrer"
									whileHover={{ scale: 1.05 }}
									whileTap={{ scale: 0.95 }}
									className="w-full sm:w-auto"
									aria-label="View AniSearchModel project on GitHub"
								>
									<Button className="flex items-center justify-center bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white transition-colors duration-300">
										<FaGithub className="mr-2" aria-hidden="true" />
										<Trans
											id="button.anisearchmodel"
											message="AniSearchModel"
										/>
									</Button>
								</motion.a>
								<motion.a
									href="https://github.com/RLAlpha49/AniSearch"
									target="_blank"
									rel="noopener noreferrer"
									whileHover={{ scale: 1.05 }}
									whileTap={{ scale: 0.95 }}
									className="w-full sm:w-auto"
									aria-label="View AniSearch project on GitHub"
								>
									<Button className="flex items-center justify-center bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-500 dark:hover:bg-yellow-600 text-white transition-colors duration-300">
										<FaGithub className="mr-2" aria-hidden="true" />
										<Trans id="button.anisearch" message="AniSearch" />
									</Button>
								</motion.a>
								<motion.a
									href="https://github.com/RLAlpha49/SpotifySkipTracker"
									target="_blank"
									rel="noopener noreferrer"
									whileHover={{ scale: 1.05 }}
									whileTap={{ scale: 0.95 }}
									className="w-full sm:w-auto"
									aria-label="View SpotifySkipTracker project on GitHub"
								>
									<Button className="flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white transition-colors duration-300">
										<FaGithub className="mr-2" aria-hidden="true" />
										<Trans
											id="button.spotifyskiptracker"
											message="SpotifySkipTracker"
										/>
									</Button>
								</motion.a>
								<motion.a
									href="https://github.com/RLAlpha49/Anilist-Manga-Updater"
									target="_blank"
									rel="noopener noreferrer"
									whileHover={{ scale: 1.05 }}
									whileTap={{ scale: 0.95 }}
									className="w-full sm:w-auto"
									aria-label="View Anilist-Manga-Updater project on GitHub"
								>
									<Button className="flex items-center justify-center bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white transition-colors duration-300">
										<FaGithub className="mr-2" aria-hidden="true" />
										<Trans
											id="button.anilistmangaupdater"
											message="Anilist-Manga-Updater"
										/>
									</Button>
								</motion.a>
							</div>
						</motion.div>
					</CardContent>
				</Card>
			</div>
			<ToastContainer />
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
