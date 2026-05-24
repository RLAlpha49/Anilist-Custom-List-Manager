import React, { useEffect, useState } from "react";
import { toast } from "sonner";

import Modal from "@/components/ui/modal";

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentListName: string;
  onRename: (newName: string) => void;
}

function useDesktopAutoFocus(isOpen: boolean): boolean {
  const [shouldAutoFocus, setShouldAutoFocus] = useState(false);

  useEffect(() => {
    if (!isOpen || globalThis.window === undefined) {
      setShouldAutoFocus(false);
      return;
    }

    const mediaQuery = globalThis.window.matchMedia(
      "(min-width: 768px) and (pointer: fine)",
    );

    const updateShouldAutoFocus = () => {
      setShouldAutoFocus(mediaQuery.matches);
    };

    updateShouldAutoFocus();
    mediaQuery.addEventListener("change", updateShouldAutoFocus);

    return () => {
      mediaQuery.removeEventListener("change", updateShouldAutoFocus);
    };
  }, [isOpen]);

  return shouldAutoFocus;
}

const RenameModal = React.memo(
  ({ isOpen, onClose, currentListName, onRename }: RenameModalProps) => {
    const [newListName, setNewListName] = useState<string>(currentListName);
    const shouldAutoFocus = useDesktopAutoFocus(isOpen);

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
        title="Rename List"
        confirmButtonText="Save Changes"
      >
        <div className="space-y-4">
          <p className="text-sm text-z-muted">
            Renaming:{" "}
            <span className="font-semibold text-z-amber">
              &quot;{currentListName}&quot;
            </span>
          </p>
          <div className="space-y-2">
            <label
              htmlFor="newListName"
              className="text-xs font-semibold tracking-widest text-z-muted uppercase"
            >
              New Name
            </label>
            <input
              type="text"
              id="newListName"
              name="renameCustomListName"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              className="
                w-full rounded-md border border-(--z-border-mid) bg-z-card-up px-4 py-3 text-z-text
                transition-colors
                placeholder:text-z-subtle
                focus:border-(--z-amber) focus:outline-none
              "
              placeholder="Enter new list name"
              aria-label="New list name"
              autoComplete="off"
              autoFocus={shouldAutoFocus}
            />
          </div>
        </div>
      </Modal>
    );
  },
);

RenameModal.displayName = "RenameModal";

export { RenameModal };
