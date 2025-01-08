"use client";

import React, { forwardRef, useState, useEffect, useRef } from "react";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
	SelectScrollUpButton,
	SelectScrollDownButton,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FaSearch } from "react-icons/fa";
import { useTextWidth } from "@/hooks/use-text-width";

interface SelectOption {
	label: string;
	value: string;
}

interface SelectOptionGroup {
	label: string;
	items: SelectOption[];
}

interface DynamicSelectProps {
	value: string;
	onValueChange: (value: string) => void;
	options: SelectOptionGroup[];
	placeholder?: string;
	className?: string;
}

export const DynamicSelect = forwardRef<HTMLButtonElement, DynamicSelectProps>(
	({ value, onValueChange, options, placeholder = "Select an option", className = "" }, ref) => {
		const allOptionsFlat = options.flatMap((group) => group.items);
		const currentLabel =
			allOptionsFlat.find((item) => item.value === value)?.label || placeholder;

		const currentWidth = useTextWidth(currentLabel);

		const [isOpen, setIsOpen] = useState(false);
		const [searchQuery, setSearchQuery] = useState("");
		const [filteredOptions, setFilteredOptions] = useState<SelectOptionGroup[]>(options);

		const inputRef = useRef<HTMLInputElement>(null);

		useEffect(() => {
			if (isOpen) {
				setSearchQuery("");
				setFilteredOptions(options);
				setTimeout(() => {
					inputRef.current?.focus();
				}, 100);
			}
		}, [isOpen, options]);

		useEffect(() => {
			if (searchQuery.trim() === "") {
				setFilteredOptions(options);
			} else {
				const lowerQuery = searchQuery.toLowerCase();
				const newFiltered = options
					.map((group) => ({
						label: group.label,
						items: group.items.filter((item) =>
							item.label.toLowerCase().includes(lowerQuery)
						),
					}))
					.filter((group) => group.items.length > 0);
				setFilteredOptions(newFiltered);
			}
		}, [searchQuery, options]);

		const handleSelectChange = (selectedValue: string) => {
			onValueChange(selectedValue);
			setSearchQuery("");
		};

		return (
			<Select value={value} onValueChange={handleSelectChange} onOpenChange={setIsOpen}>
				<SelectTrigger
					ref={ref}
					className={`bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 ${className} transition-colors duration-300`}
					style={{ width: `${currentWidth + 32}px` }}
					aria-haspopup="listbox"
					aria-expanded={isOpen}
				>
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent
					className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 shadow-lg rounded-md"
					role="listbox"
				>
					<div className="px-4 py-3">
						<div className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-600 rounded-md">
							<FaSearch className="text-gray-500 dark:text-gray-300 mr-2" />
							<Input
								ref={inputRef}
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="Search..."
								className="bg-gray-100 dark:bg-gray-600 text-gray-900 dark:text-gray-200 border-none focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors duration-300"
								aria-label="Search options"
								onMouseDown={(e) => e.stopPropagation()}
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
							/>
						</div>
					</div>
					<div className="px-4 py-2">
						{filteredOptions.length > 0 ? (
							filteredOptions.map((group) => (
								<SelectGroup key={group.label}>
									<SelectLabel className="text-gray-700 dark:text-gray-300">
										{group.label}
									</SelectLabel>
									{group.items.map((item) => (
										<SelectItem
											key={item.value}
											value={item.value}
											className="text-gray-900 dark:text-gray-200 hover:bg-blue-100 dark:hover:bg-blue-600"
											role="option"
										>
											{item.label}
										</SelectItem>
									))}
								</SelectGroup>
							))
						) : (
							<div className="px-4 py-2 text-gray-500 dark:text-gray-400">
								No results found.
							</div>
						)}
					</div>
					<SelectScrollUpButton className="bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300" />
					<SelectScrollDownButton className="bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300" />
				</SelectContent>
			</Select>
		);
	}
);

DynamicSelect.displayName = "DynamicSelect";
