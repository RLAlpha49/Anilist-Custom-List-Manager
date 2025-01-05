"use client";

import Layout from "@/components/layout";
import ToastContainer from "@/components/ui/toast-container";
import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { FaSignInAlt, FaTimesCircle, FaHome } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { fetchAniList } from "@/lib/api";
import { motion } from "framer-motion";

const ANILIST_AUTH_URL = "https://anilist.co/api/v2/oauth/authorize";
const CLIENT_ID = process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID || process.env.ANILIST_CLIENT_ID;

export default function Page() {
	const { isLoggedIn, login, logout } = useAuth();
	const router = useRouter();
	const { toast } = useToast();
	const [isProcessing, setIsProcessing] = useState<boolean>(false);

	const fetchViewerId = useCallback(
		async (token: string): Promise<void> => {
			const query = `
				query {
					Viewer {
						id
					}
				}
			`;
			try {
				const response = await fetchAniList(query, {}, token);
				const newUserId: number = response.data.Viewer.id;
				login(token, newUserId.toString());
			} catch (error: any) {
				toast({
					title: "Error",
					description: error.message || "Failed to fetch viewer ID.",
					variant: "error",
				});
			}
		},
		[login, toast]
	);

	useEffect(() => {
		const accessToken: string | null = localStorage.getItem("anilistToken");
		const expirationTime: string | null = localStorage.getItem("anilistTokenExpiration");

		if (accessToken && expirationTime && Date.now() <= Number(expirationTime)) {
			setIsProcessing(true);
			fetchViewerId(accessToken).finally(() => setIsProcessing(false));
		} else {
			localStorage.removeItem("anilistToken");
			localStorage.removeItem("anilistTokenExpiration");
			logout();
		}
	}, [fetchViewerId, logout]);

	const handleLogin = (): void => {
		if (!CLIENT_ID) {
			console.error("AniList Client ID is not defined.");
			return;
		}
		const responseType: string = "token";
		const authUrl: string = `${ANILIST_AUTH_URL}?client_id=${CLIENT_ID}&response_type=${responseType}`;
		window.location.href = authUrl;
	};

	const handleNext = (): void => {
		if (isLoggedIn) {
			router.push("/custom-list-manager");
		}
	};

	const handleHome = (): void => {
		router.push("/");
	};

	return (
		<Layout>
			<div className="flex items-center justify-center px-4">
				<Card className="w-full max-w-4xl bg-gray-800 text-gray-100 shadow-2xl flex flex-col md:flex-row overflow-hidden rounded-lg">
					{/* Left Side - Animated Illustration */}
					<motion.div
						initial={{ opacity: 0, x: -50 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ duration: 1 }}
						className="md:w-1/2 bg-indigo-700 flex items-center justify-center p-8"
					>
						<motion.img
							src="/images/anilist-illustration.png"
							alt="AniList Illustration"
							className="w-full h-auto object-contain"
						/>
					</motion.div>

					{/* Right Side - Login Form */}
					<motion.div
						initial={{ opacity: 0, x: 50 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ duration: 1 }}
						className="md:w-1/2 p-8 flex flex-col justify-center"
					>
						<CardHeader>
							<CardTitle className="text-3xl font-bold flex items-center">
								<FaSignInAlt className="mr-2 text-blue-400" />
								AniList Login
							</CardTitle>
							<CardDescription className="text-gray-300 mt-2">
								Connect your AniList account to manage your custom lists
								effortlessly.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="flex flex-col space-y-6 mt-4">
								<motion.div
									whileHover={{ scale: 1.05 }}
									whileTap={{ scale: 0.95 }}
									className="w-full"
								>
									<Button
										onClick={handleLogin}
										className="bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center w-full py-3 rounded-md shadow-md transition-transform"
										aria-label="Login with AniList"
									>
										<FaSignInAlt className="mr-2" />
										Login with AniList
									</Button>
								</motion.div>
								{isLoggedIn && (
									<motion.div
										whileHover={{ scale: 1.05 }}
										whileTap={{ scale: 0.95 }}
										className="w-full"
									>
										<Button
											variant="outline"
											onClick={logout}
											className="text-black hover:text-white border-gray-600 hover:bg-gray-700 transition-colors flex items-center justify-center w-full py-3 rounded-md shadow-md"
											aria-label="Clear Cached Token"
										>
											<FaTimesCircle className="mr-2" />
											Clear Cached Token
										</Button>
									</motion.div>
								)}
								<p className="text-center text-gray-200">
									{isLoggedIn ? "You are logged in." : "You are not logged in."}
								</p>
								<div className="flex justify-between">
									<motion.div
										whileHover={{ scale: 1.05 }}
										whileTap={{ scale: 0.95 }}
									>
										<Button
											variant="outline"
											onClick={handleHome}
											className="text-black hover:text-white border-gray-600 hover:bg-gray-700 transition-colors flex items-center"
											aria-label="Navigate to Home"
										>
											<FaHome className="mr-2" />
											Home
										</Button>
									</motion.div>
									<motion.div
										whileHover={{ scale: 1.05 }}
										whileTap={{ scale: 0.95 }}
									>
										<Button
											onClick={handleNext}
											disabled={!isLoggedIn}
											className={`bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center ${
												!isLoggedIn && "opacity-50 cursor-not-allowed"
											} w-full py-3 rounded-md shadow-md transition-transform`}
											aria-label="Proceed to Next Step"
										>
											Next
										</Button>
									</motion.div>
								</div>
								<div className="flex items-center justify-center space-x-2 mt-4 h-6">
									{isProcessing && (
										<>
											<svg
												className="animate-spin h-5 w-5 text-white"
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
											>
												<circle
													className="opacity-25"
													cx="12"
													cy="12"
													r="10"
													stroke="currentColor"
													strokeWidth="4"
												></circle>
												<path
													className="opacity-75"
													fill="currentColor"
													d="M4 12a8 8 0 018-8v8H4z"
												></path>
											</svg>
											<span className="text-gray-300">Processing...</span>
										</>
									)}
								</div>
							</div>
						</CardContent>
					</motion.div>
				</Card>
			</div>
			<ToastContainer />
		</Layout>
	);
}
