import { Trans } from "@lingui/react";
import { getI18n } from "@/lib/i18n";
import { I18nProvider } from "@lingui/react";
import { useEffect, useState } from "react";

export default function LoadingIndicator() {
	const [locale, setLocale] = useState("en");

	useEffect(() => {
		if (typeof window !== "undefined") {
			setLocale(localStorage.getItem("locale") || "en");
		}
	}, []);

	return (
		<I18nProvider i18n={getI18n(locale)}>
			<div
				className="flex justify-center items-center"
				role="status"
				aria-live="polite"
				aria-label="Loading"
			>
				<svg
					className="animate-spin h-10 w-10 dark:text-blue-500 text-blue-400 transition-colors duration-300"
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
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
				<span className="ml-3 text-lg font-semibold dark:text-blue-500 text-blue-400 transition-colors duration-300">
					<Trans id="text.loading" message="Loading..." />
				</span>
			</div>
		</I18nProvider>
	);
}
