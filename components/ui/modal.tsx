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
      <div className="relative mx-auto w-11/12 max-w-md rounded-lg bg-white p-6 text-gray-900 shadow-2xl transition-colors duration-300 dark:bg-gray-800 dark:text-gray-100">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-500 transition-colors duration-300 hover:text-gray-700 focus:outline-none dark:text-gray-400 dark:hover:text-gray-200"
          aria-label="Close Modal"
        >
          <FaTimes size={20} />
        </button>
        {/* Modal Title */}
        <h2
          id="modal-title"
          className="mb-4 text-2xl font-bold text-gray-900 dark:text-gray-100"
        >
          {title}
        </h2>
        {/* Modal Content */}
        <div
          id="modal-description"
          className="scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent max-h-[calc(80vh-12rem)] overflow-y-auto"
        >
          {children}
        </div>
        {/* Action Buttons */}
        <div className="mt-6 flex justify-end space-x-4">
          <button
            onClick={onClose}
            className="rounded bg-gray-200 px-4 py-2 text-gray-900 transition-colors duration-300 hover:bg-gray-300 focus:outline-none dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
            aria-label="Cancel"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="rounded bg-blue-600 px-4 py-2 text-white transition-colors duration-300 hover:bg-blue-700 focus:outline-none dark:bg-blue-500 dark:hover:bg-blue-600"
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
