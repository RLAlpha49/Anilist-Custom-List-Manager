"use client";

import Layout from "@/components/layout";
import ToastContainer from "@/components/ui/toast-container";

// External Imports
import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	DragEndEvent,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { motion, AnimatePresence } from "framer-motion";
import { FaSort, FaArrowDown, FaPlus, FaTrash, FaEdit } from "react-icons/fa";

// Internal Imports
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import LoadingIndicator from "@/components/loading-indicator";
import { DynamicSelect } from "@/components/ui/dynamic-select";
import { SortableItem } from "@/components/sortable-item";
import {
	statusItems,
	scoreItems,
	miscItemsAnime,
	miscItemsManga,
	formatItemsAnime,
	formatItemsManga,
	hiddenFormatItemsManga,
	tagCategories,
	tags,
} from "@/lib/options";
import { fetchAniList } from "@/lib/api";
import { setItemWithExpiry, getItemWithExpiry } from "@/lib/local-storage";
import { useAuth } from "@/context/auth-context";
import Modal from "@/components/ui/modal";
import { RenameModal } from "@/components/rename-modal";
import Breadcrumbs from "@/components/breadcrumbs";
import { Trans } from "@lingui/react";

interface ListCondition {
	name: string;
	condition: string;
}

interface CustomList {
	id?: number;
	name: string;
	isCustomList: boolean;
	selectedOption?: string | null;
}

interface OptionGroup {
	label: string;
	items: { label: string; value: string }[];
}

function PageData() {
	// State Hooks
	const [lists, setLists] = useState<CustomList[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [listType, setListType] = useState<"ANIME" | "MANGA">("ANIME");
	const [hideDefaultStatusLists, setHideDefaultStatusLists] = useState<boolean>(true);
	const [showPopup, setShowPopup] = useState<boolean>(false);
	const [isListEmpty, setIsListEmpty] = useState<boolean>(true);
	const [dataLoaded, setDataLoaded] = useState<boolean>(false);
	const [showRenameModal, setShowRenameModal] = useState<boolean>(false);
	const [currentEditList, setCurrentEditList] = useState<CustomList | null>(null);
	const [originalSectionOrder, setOriginalSectionOrder] = useState<string[]>([]);

	// Ref Hooks
	const updateSectionOrderRef = useRef<(newOrder: string[]) => Promise<void> | null>(null);

	// Other Hooks
	const { toast } = useToast();
	const router = useRouter();
	const { token, userId } = useAuth();

	function debounce(func: Function, wait: number) {
		let timeout: NodeJS.Timeout;
		return function (...args: any[]) {
			const later = () => {
				clearTimeout(timeout);
				func(...args);
			};
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
		};
	}

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

	const fetchAniListData = useCallback(
		async (query: string, variables: any): Promise<any> => {
			const getAuthToken = (): string => {
				let authToken = token;
				if (!authToken) {
					authToken = getItemWithExpiry("anilistToken");
					if (!authToken) {
						throw new Error("Anilist token not found");
					}
				}
				return authToken;
			};

			const authToken = getAuthToken();
			return await fetchAniList(query, variables, authToken);
		},
		[token]
	);

	const updateSectionOrder = useCallback(
		async (newOrder: string[]): Promise<void> => {
			const query = `
				mutation ($${listType.toLowerCase()}ListOptions: MediaListOptionsInput) {
					UpdateUser(${listType.toLowerCase()}ListOptions: $${listType.toLowerCase()}ListOptions) {
						mediaListOptions {
							${listType.toLowerCase()}List {
								sectionOrder
							}
						}
					}
				}
			`;

			const allLists = lists.map((list) => list.name);
			const itemsInCustomLists = allLists.filter((item) =>
				originalSectionOrder.includes(item)
			);
			const itemsNotInCustomLists = originalSectionOrder.filter(
				(item) => !allLists.includes(item)
			);

			const completeOrder = [...itemsNotInCustomLists, ...itemsInCustomLists];

			const variables = {
				[`${listType.toLowerCase()}ListOptions`]: {
					sectionOrder: completeOrder,
				},
			};

			try {
				await fetchAniListData(query, variables);
				toast({
					title: <Trans id="toast.success_title" message="Success" />,
					description: (
						<Trans
							id="toast.success_description_order_updated"
							message="List order updated successfully."
						/>
					),
					variant: "success",
				});
			} catch (error: any) {
				console.error("Error updating sectionOrder:", error.message);
				toast({
					title: <Trans id="toast.error_title" message="Error" />,
					description: error.message || (
						<Trans
							id="toast.error_description_order_update_failed"
							message="Failed to update list order."
						/>
					),
					variant: "error",
				});
			}
		},
		[lists, originalSectionOrder, listType, fetchAniListData, toast]
	);

	useEffect(() => {
		updateSectionOrderRef.current = updateSectionOrder;
	}, [updateSectionOrder]);

	const debounceUpdateSectionOrder = useMemo(
		() =>
			debounce((newOrder: string[]) => {
				if (updateSectionOrderRef.current) {
					updateSectionOrderRef.current(newOrder);
				}
			}, 300),
		[]
	);

	useEffect(() => {
		if (lists.length > 0) {
			const newConditions: ListCondition[] = lists.map((list) => ({
				name: list.name,
				condition: list.selectedOption || "",
			}));
			setItemWithExpiry(
				listType === "ANIME" ? "conditionsAnime" : "conditionsManga",
				JSON.stringify(newConditions),
				60 * 60 * 24 * 1000
			);
		}
	}, [lists, listType]);

	useEffect(() => {
		setItemWithExpiry("hideDefaultStatusLists", hideDefaultStatusLists, 60 * 60 * 24 * 1000);
	}, [hideDefaultStatusLists]);

	const getDefaultOption = useCallback((listName: string): string | null => {
		const allItems: string[] = [
			...statusItems,
			...scoreItems,
			...miscItemsAnime,
			...miscItemsManga,
			...formatItemsAnime,
			...formatItemsManga,
			...hiddenFormatItemsManga,
			...tagCategories,
			...tags,
		];

		if (listName.includes("<5")) {
			return `Score set to below 5`;
		}

		for (const item of allItems) {
			if (listName.toLowerCase().includes(item.toLowerCase())) {
				if (statusItems.includes(item)) {
					return `Status set to ${item}`;
				} else if (scoreItems.includes(item)) {
					return `Score set to ${item}`;
				} else if (miscItemsAnime.concat(miscItemsManga).includes(item)) {
					return item.charAt(0).toUpperCase() + item.slice(1);
				} else if (
					formatItemsAnime.includes(item) ||
					formatItemsManga.includes(item) ||
					hiddenFormatItemsManga.includes(item)
				) {
					if (hiddenFormatItemsManga.includes(item.toLowerCase())) {
						const countryMap: Record<string, string> = {
							manga: "Manga (Japan)",
							manwha: "Manga (South Korean)",
							manhua: "Manga (Chinese)",
						};
						return `Format set to ${countryMap[item.toLowerCase()]}`;
					} else {
						return `Format set to ${item}`;
					}
				} else if (tagCategories.includes(item)) {
					return `Tag Categories contain ${item}`;
				} else if (tags.includes(item)) {
					return `Tags contain ${item}`;
				}
			}
		}
		return null;
	}, []);

	const getOptions = useCallback((type: "ANIME" | "MANGA"): OptionGroup[] => {
		const genres: string[] = [
			"Action",
			"Adventure",
			"Comedy",
			"Drama",
			"Ecchi",
			"Fantasy",
			"Horror",
			"Mahou Shoujo",
			"Mecha",
			"Music",
			"Mystery",
			"Psychological",
			"Romance",
			"Sci-Fi",
			"Slice Of Life",
			"Sports",
			"Supernatural",
			"Thriller",
			"Hentai",
		];

		const createOptionObjects = (items: string[]): { label: string; value: string }[] =>
			items.map((item) => ({ label: item, value: item }));

		let currentMiscItems: string[] = [];
		let currentFormatItems: string[] = [];

		if (type === "ANIME") {
			currentMiscItems = miscItemsAnime;
			currentFormatItems = formatItemsAnime;
		} else if (type === "MANGA") {
			currentMiscItems = miscItemsManga;
			currentFormatItems = formatItemsManga;
		}

		return [
			{
				label: "Status",
				items: createOptionObjects(statusItems.map((status) => `Status set to ${status}`)),
			},
			{
				label: "Score",
				items: createOptionObjects(scoreItems.map((score) => `Score set to ${score}`)),
			},
			{
				label: "Format",
				items: createOptionObjects(
					currentFormatItems.map((format) => `Format set to ${format}`)
				),
			},
			{
				label: "Genres",
				items: createOptionObjects(genres.map((genre) => `Genres contain ${genre}`)),
			},
			{
				label: "Tag Categories",
				items: createOptionObjects(
					tagCategories.map((tagCategory) => `Tag Categories contain ${tagCategory}`)
				),
			},
			{
				label: "Tags",
				items: createOptionObjects(tags.map((tag) => `Tags contain ${tag}`)),
			},
			{
				label: "Misc",
				items: createOptionObjects(currentMiscItems),
			},
		];
	}, []);

	const fetchLists = useCallback(
		async (type: "ANIME" | "MANGA"): Promise<void> => {
			if (!userId) {
				toast({
					title: <Trans id="toast.error_title" message="Error" />,
					description: (
						<Trans
							id="toast.error_description_user_id_unavailable"
							message="User ID is not available."
						/>
					),
					variant: "error",
				});
				return;
			}
			setLoading(true);
			setIsListEmpty(true);

			const query = `
				query ($userId: Int) {
					User(id: $userId) {
						mediaListOptions {
							${type.toLowerCase()}List {
								customLists
								sectionOrder
							}
						}
					}
				}
			`;
			const variables = { userId };

			try {
				let authToken = token;
				if (!authToken) {
					authToken = getItemWithExpiry("anilistToken");
					if (!authToken) {
						throw new Error("Anilist token not found");
					}
				}
				const response = await fetchAniList(query, variables, authToken);
				const listOptions =
					response.data.User.mediaListOptions[`${type.toLowerCase()}List`];
				const fetchedCustomLists = listOptions.customLists;
				const fetchedSectionOrder = listOptions.sectionOrder;

				const updatedSectionOrder = [
					...fetchedSectionOrder,
					...fetchedCustomLists.filter(
						(name: string) => !fetchedSectionOrder.includes(name)
					),
				];

				setOriginalSectionOrder(updatedSectionOrder);

				const orderedCustomLists = updatedSectionOrder
					.filter((name) => fetchedCustomLists.includes(name))
					.map((name) => ({
						name,
						isCustomList: true,
						selectedOption: getDefaultOption(name),
					}));

				setListType(type);
				setLists(orderedCustomLists);
				setDataLoaded(true);
				setIsListEmpty(orderedCustomLists.length === 0);
				setLoading(false);
			} catch (error: any) {
				console.error("Error in fetchLists:", error.message);
				toast({
					title: <Trans id="toast.error_title" message="Error" />,
					description: error.message || (
						<Trans
							id="toast.error_description_fetch_lists_failed"
							message="Failed to fetch lists."
						/>
					),
					variant: "error",
				});
				setLoading(false);
			}
		},
		[getDefaultOption, toast, token, userId]
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent): void => {
			const { active, over } = event;

			if (over && active.id !== over.id) {
				setLists((items) => {
					const oldIndex = items.findIndex((item) => item.name === active.id);
					const newIndex = items.findIndex((item) => item.name === over.id);

					const newOrder = arrayMove(items, oldIndex, newIndex);

					const updatedCustomLists = newOrder.map((item) => item.name);

					debounceUpdateSectionOrder(updatedCustomLists);

					return newOrder;
				});
			}
		},
		[debounceUpdateSectionOrder]
	);

	const confirmAndNavigate = (): void => {
		setShowPopup(true);
	};

	const proceedToNextStep = (): void => {
		setShowPopup(false);
		setItemWithExpiry(
			"lists",
			JSON.stringify(lists.filter((list) => list.selectedOption)),
			60 * 60 * 24 * 1000
		);
		setItemWithExpiry("listType", listType, 60 * 60 * 24 * 1000);
		setItemWithExpiry("userId", userId?.toString() || "", 60 * 60 * 24 * 1000);
		setItemWithExpiry(
			"hideDefaultStatusLists",
			JSON.stringify(hideDefaultStatusLists),
			60 * 60 * 24 * 1000
		);
		router.push("/custom-list-manager/update");
	};

	const openRenameModal = (list: CustomList): void => {
		setCurrentEditList(list);
		setShowRenameModal(true);
	};

	const handleRename = useCallback(
		async (trimmedName: string): Promise<void> => {
			if (!currentEditList) return;

			const duplicate = lists.some(
				(list) =>
					list.name.toLowerCase() === trimmedName.toLowerCase() &&
					list.name !== currentEditList.name
			);
			if (duplicate) {
				toast({
					title: <Trans id="toast.error_title" message="Error" />,
					description: (
						<Trans
							id="toast.error_description_duplicate_list"
							message="A list with this name already exists."
						/>
					),
					variant: "error",
				});
				return;
			}

			setLists((prevLists) =>
				prevLists.map((list) =>
					list.name === currentEditList.name ? { ...list, name: trimmedName } : list
				)
			);

			const query = `
			mutation ($${listType.toLowerCase()}ListOptions: MediaListOptionsInput) {
				UpdateUser(${listType.toLowerCase()}ListOptions: $${listType.toLowerCase()}ListOptions) {
					mediaListOptions {
						${listType.toLowerCase()}List {
							customLists
						}
					}
				}
			}
		`;

			const variables = {
				[`${listType.toLowerCase()}ListOptions`]: {
					customLists: lists.map((list) =>
						list.name === currentEditList.name ? trimmedName : list.name
					),
				},
			};

			try {
				await fetchAniListData(query, variables);
				toast({
					title: <Trans id="toast.success_title" message="Success" />,
					description:
						`${trimmedName}` +
						(
							<Trans
								id="toast.success_description_list_renamed"
								message=" has been renamed and updated successfully."
							/>
						),
					variant: "success",
				});
			} catch (error: any) {
				console.error("Error updating list names:", error.message);
				toast({
					title: <Trans id="toast.error_title" message="Error" />,
					description: error.message || (
						<Trans
							id="toast.error_description_rename_failed"
							message="Failed to update list names."
						/>
					),
					variant: "error",
				});
			}

			setShowRenameModal(false);
		},
		[currentEditList, lists, listType, fetchAniListData, toast]
	);

	const handleDelete = async (listName: string): Promise<void> => {
		const updatedLists = lists.filter((list) => list.name !== listName);
		setLists(updatedLists);

		const updatedSectionOrder = originalSectionOrder.filter((name) => name !== listName);
		setOriginalSectionOrder(updatedSectionOrder);

		const query = `
			mutation ($${listType.toLowerCase()}ListOptions: MediaListOptionsInput) {
				UpdateUser(${listType.toLowerCase()}ListOptions: $${listType.toLowerCase()}ListOptions) {
					mediaListOptions {
						${listType.toLowerCase()}List {
							customLists
							sectionOrder
						}
					}
				}
			}
		`;

		const variables = {
			[`${listType.toLowerCase()}ListOptions`]: {
				customLists: updatedLists.map((list) => list.name),
				sectionOrder: updatedSectionOrder,
			},
		};

		try {
			await fetchAniListData(query, variables);
			toast({
				title: <Trans id="toast.deleted_title" message="Deleted" />,
				description:
					`${listName}` +
					(
						<Trans
							id="toast.deleted_description"
							message="has been deleted and updated successfully."
						/>
					),
				variant: "success",
			});
		} catch (error: any) {
			console.error("Error deleting list:", error.message);
			toast({
				title: <Trans id="toast.error_title" message="Error" />,
				description: error.message || (
					<Trans
						id="toast.error_description_delete_failed"
						message="Failed to delete list."
					/>
				),
				variant: "error",
			});
		}
	};

	const addNewList = async (): Promise<void> => {
		const newListName = prompt("Enter the name of the new custom list:");
		if (newListName && newListName.trim() !== "") {
			const duplicate = lists.some(
				(list) => list.name.toLowerCase() === newListName.trim().toLowerCase()
			);
			if (duplicate) {
				toast({
					title: <Trans id="toast.error_title" message="Error" />,
					description: (
						<Trans
							id="toast.error_description_duplicate_list"
							message="A list with this name already exists."
						/>
					),
					variant: "error",
				});
				return;
			}

			const updatedLists = [
				...lists,
				{
					name: newListName.trim(),
					isCustomList: true,
					selectedOption: "",
				},
			];
			setLists(updatedLists);

			const query = `
				mutation ($${listType.toLowerCase()}ListOptions: MediaListOptionsInput) {
					UpdateUser(${listType.toLowerCase()}ListOptions: $${listType.toLowerCase()}ListOptions) {
						mediaListOptions {
							${listType.toLowerCase()}List {
								customLists
							}
						}
					}
				}
			`;

			const variables = {
				[`${listType.toLowerCase()}ListOptions`]: {
					customLists: updatedLists.map((list) => list.name),
				},
			};

			try {
				await fetchAniListData(query, variables);
				toast({
					title: <Trans id="toast.success_title" message="Success" />,
					description:
						`${newListName.trim()}` +
						(
							<Trans
								id="toast.success_description_list_added"
								message=" has been added and updated successfully."
							/>
						),
					variant: "success",
				});
			} catch (error: any) {
				console.error("Error adding new list:", error.message);
				toast({
					title: <Trans id="toast.error_title" message="Error" />,
					description: error.message || (
						<Trans
							id="toast.error_description_add_failed"
							message="Failed to add new list."
						/>
					),
					variant: "error",
				});
			}
		}
	};

	const breadcrumbs = [
		{ name: "Home", href: "/" },
		{
			name: "Custom List Manager",
			href: "/custom-list-manager",
		},
	];

	return (
		<Layout>
			<Breadcrumbs breadcrumbs={breadcrumbs} />
			<Card className="w-full max-w-5xl mx-auto bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-2xl p-6 rounded-lg transition-colors duration-300">
				<CardHeader>
					<CardTitle className="text-2xl font-bold flex items-center text-gray-900 dark:text-white">
						<FaSort
							className="mr-2 text-blue-400 dark:text-blue-300"
							aria-hidden="true"
						/>
						<Trans id="page.custom_list_manager.title" message="Custom List Manager" />
					</CardTitle>
					<CardDescription className="text-gray-600 dark:text-gray-300 mt-1">
						<Trans
							id="page.custom_list_manager.description"
							message="Organize and manage your AniList entries effortlessly."
						/>
					</CardDescription>
				</CardHeader>
				<CardContent>
					{/* Controls Section */}
					<div className="flex flex-col sm:flex-row justify-between items-center mb-6">
						{/* Fetch Buttons */}
						<div className="flex space-x-4 mb-4 sm:mb-0">
							<Button
								onClick={() => fetchLists("ANIME")}
								className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white flex items-center transition-colors duration-300"
								aria-label="Fetch Anime Lists"
							>
								<FaArrowDown
									className="mr-2 text-white dark:text-gray-100"
									aria-hidden="true"
								/>
								<Trans id="button.fetch_anime_lists" message="Fetch Anime Lists" />
							</Button>
							<Button
								onClick={() => fetchLists("MANGA")}
								className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white flex items-center transition-colors duration-300"
								aria-label="Fetch Manga Lists"
							>
								<FaArrowDown
									className="mr-2 text-white dark:text-gray-100"
									aria-hidden="true"
								/>
								<Trans id="button.fetch_manga_lists" message="Fetch Manga Lists" />
							</Button>
							{!isListEmpty && (
								<Button
									onClick={addNewList}
									className="bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white flex items-center transition-colors duration-300"
									aria-label="Add New List"
								>
									<FaPlus
										className="mr-2 text-white dark:text-gray-100"
										aria-hidden="true"
									/>
									<Trans id="button.add_new_list" message="Add New List" />
								</Button>
							)}
						</div>
					</div>

					{/* Hide Default Status Lists */}
					{!isListEmpty && (
						<div className="flex items-center space-x-2 mb-4">
							<Checkbox
								id="hideDefaultStatusLists"
								checked={hideDefaultStatusLists}
								onCheckedChange={(checked: boolean) =>
									setHideDefaultStatusLists(checked)
								}
								aria-label="Hide Default Status Lists"
							/>
							<label
								htmlFor="hideDefaultStatusLists"
								className="text-gray-800 dark:text-gray-200"
							>
								<Trans
									id="label.hide_default_status_lists"
									message="Hide Default Status Lists"
								/>
							</label>
						</div>
					)}

					{/* Loading Indicator */}
					{loading ? (
						<div className="flex justify-center space-x-2 mb-4">
							<LoadingIndicator />
						</div>
					) : (
						!isListEmpty && (
							<AnimatePresence>
								{/* Drag and Drop Lists */}
								<DndContext
									sensors={sensors}
									collisionDetection={closestCenter}
									onDragEnd={handleDragEnd}
								>
									<SortableContext
										items={lists.map((list) => list.name)}
										strategy={verticalListSortingStrategy}
									>
										<ul className="space-y-2">
											{lists.map((list, index) => (
												<SortableItem key={list.name} id={list.name}>
													<motion.div
														initial={{ opacity: 0, y: -10 }}
														animate={{ opacity: 1, y: 0 }}
														exit={{ opacity: 0, y: -10 }}
														className="flex items-center justify-between bg-gray-200 dark:bg-gray-700 p-4 rounded-lg shadow-md transition-colors duration-300"
													>
														<div className="flex items-center space-x-2">
															<span className="text-gray-900 dark:text-gray-100 font-semibold">
																{list.name}
															</span>
														</div>
														<div className="flex items-center space-x-2">
															<Button
																variant="ghost"
																className="text-gray-400 hover:text-gray-600 dark:text-gray-300 dark:hover:text-white"
																onClick={() => {
																	const newLists = [...lists];
																	newLists[index].selectedOption =
																		"";
																	setLists(newLists);
																}}
																aria-label="Clear Condition"
															>
																✕
															</Button>
															<DynamicSelect
																value={list.selectedOption || ""}
																onValueChange={(value: string) => {
																	const newLists = [...lists];
																	newLists[index].selectedOption =
																		value;
																	setLists(newLists);
																}}
																options={getOptions(listType)}
																placeholder={
																	(
																		<Trans
																			id="placeholder.select_condition"
																			message="Select a condition"
																		/>
																	) as unknown as string
																}
																className="w-48"
															/>
															<Button
																variant="ghost"
																className="text-yellow-400 hover:text-yellow-600 dark:text-yellow-300 dark:hover:text-yellow-500"
																onClick={() =>
																	openRenameModal(list)
																}
																aria-label="Rename List"
															>
																<FaEdit aria-hidden="true" />
															</Button>
															<Button
																variant="ghost"
																className="text-red-400 hover:text-red-600 dark:text-red-300 dark:hover:text-red-500"
																onClick={() =>
																	handleDelete(list.name)
																}
																aria-label="Delete List"
															>
																<FaTrash aria-hidden="true" />
															</Button>
														</div>
													</motion.div>
												</SortableItem>
											))}
										</ul>
									</SortableContext>
								</DndContext>
							</AnimatePresence>
						)
					)}

					{/* Navigation Buttons */}
					<div className="flex justify-between mt-6">
						<Button
							variant="outline"
							onClick={() => router.push("/anilist-login")}
							className="bg-gray-700 dark:bg-white text-white dark:text-black hover:text-white hover:bg-gray-600 dark:hover:text-gray-800 dark:hover:bg-gray-200 transition-colors flex items-center"
							aria-label="Back to Login"
						>
							<Trans id="button.back" message="Back" />
						</Button>
						<Button
							onClick={confirmAndNavigate}
							className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white flex items-center transition-colors duration-300"
							disabled={!dataLoaded}
							aria-label="Proceed to Update"
						>
							<Trans id="button.next" message="Next" />
						</Button>
					</div>
				</CardContent>

				{/* Confirmation Popup */}
				<Modal
					isOpen={showPopup}
					onClose={() => setShowPopup(false)}
					onConfirm={proceedToNextStep}
					title={
						(
							<Trans
								id="modal.confirm_conditions_title"
								message="Confirm Conditions"
							/>
						) as unknown as string
					}
				>
					<ul className="list-disc list-inside text-gray-800 dark:text-gray-200 mb-4">
						{lists
							.filter((list) => list.selectedOption)
							.map((list) => (
								<li key={list.name}>{`${list.name}: ${list.selectedOption}`}</li>
							))}
					</ul>
				</Modal>

				{/* Rename Modal */}
				<RenameModal
					isOpen={showRenameModal}
					onClose={() => setShowRenameModal(false)}
					currentListName={currentEditList?.name || ""}
					onRename={handleRename}
				/>
			</Card>
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
