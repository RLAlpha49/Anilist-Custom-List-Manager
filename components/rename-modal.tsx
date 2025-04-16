import React, { useState, useEffect } from "react";
import Modal from "@/components/ui/modal";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentListName: string;
  onRename: (newName: string) => void;
}

const RenameModal = React.memo(
  ({ isOpen, onClose, currentListName, onRename }: RenameModalProps) => {
    const [newListName, setNewListName] = useState<string>(currentListName);

    useEffect(() => {
      setNewListName(currentListName);
    }, [currentListName]);

    const handleRename = () => {
      const trimmedName = newListName.trim();
      if (trimmedName === "") {
        toast.error("Error", {
          description: "List name cannot be empty.",
        });
        return;
      }
      onRename(trimmedName);
    };

    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        onConfirm={handleRename}
        title={`Rename "${currentListName}"`}
        confirmButtonText="Save"
      >
        <div className="flex flex-col space-y-4">
          <label
            htmlFor="newListName"
            className="text-base font-medium text-gray-900 dark:text-gray-200"
          >
            New List Name:
          </label>
          <motion.div
            initial={{ y: 5, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <input
              type="text"
              id="newListName"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-colors duration-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400/50"
              placeholder="Enter new list name"
              aria-label="New list name"
              autoFocus
            />
          </motion.div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Choose a unique name for your list
          </p>
        </div>
      </Modal>
    );
  },
);

RenameModal.displayName = "RenameModal";

export { RenameModal };
