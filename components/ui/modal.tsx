import React, { useEffect } from "react";
import { FaTimes } from "react-icons/fa";

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
	title: string;
	confirmButtonText?: string;
	children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({
	isOpen,
	onClose,
	onConfirm,
	title,
	confirmButtonText = "Confirm",
	children,
}) => {
	useEffect(() => {
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};
		if (isOpen) {
			document.addEventListener("keydown", handleEscape);
		}
		return () => {
			document.removeEventListener("keydown", handleEscape);
		};
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm transition-opacity duration-300"
			aria-modal="true"
			role="dialog"
			aria-labelledby="modal-title"
			aria-describedby="modal-description"
		>
			<div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg shadow-2xl w-11/12 max-w-md mx-auto p-6 relative transition-colors duration-300">
				{/* Close Button */}
				<button
					onClick={onClose}
					className="absolute top-4 right-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none transition-colors duration-300"
					aria-label="Close Modal"
				>
					<FaTimes size={20} />
				</button>
				{/* Modal Title */}
				<h2
					id="modal-title"
					className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100"
				>
					{title}
				</h2>
				{/* Modal Content */}
				<div id="modal-description" className="max-h-80 overflow-y-auto">
					{children}
				</div>
				{/* Action Buttons */}
				<div className="flex justify-end space-x-4 mt-6">
					<button
						onClick={onClose}
						className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded focus:outline-none transition-colors duration-300"
						aria-label="Cancel"
					>
						Cancel
					</button>
					<button
						onClick={() => {
							onConfirm();
							onClose();
						}}
						className="px-4 py-2 bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white rounded focus:outline-none transition-colors duration-300"
						aria-label={confirmButtonText}
					>
						{confirmButtonText}
					</button>
				</div>
			</div>
		</div>
	);
};

export default Modal;
