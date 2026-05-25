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
        <div className="space-y-5">
          {/* From → To visual */}
          <div
            className="flex items-center gap-3 rounded-2xl p-4"
            style={{
              backgroundColor: "var(--z-card-up)",
              border: "1px solid var(--z-border)",
            }}
          >
            <div className="min-w-0 flex-1">
              <p
                className="text-[10px] font-bold tracking-[0.15em] uppercase"
                style={{ color: "var(--z-subtle)" }}
              >
                Current name
              </p>
              <p
                className="mt-0.5 truncate text-sm font-semibold"
                style={{ color: "var(--z-muted)" }}
              >
                {currentListName}
              </p>
            </div>
            <span
              className="shrink-0 text-base font-bold"
              style={{ color: "var(--z-border-mid)" }}
            >
              →
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="text-[10px] font-bold tracking-[0.15em] uppercase"
                style={{ color: "var(--z-amber)" }}
              >
                New name
              </p>
              <p
                className="mt-0.5 truncate text-sm font-semibold"
                style={{
                  color: newListName.trim()
                    ? "var(--z-text)"
                    : "var(--z-subtle)",
                }}
              >
                {newListName.trim() || "…"}
              </p>
            </div>
          </div>

          {/* Input */}
          <div className="space-y-2">
            <label
              htmlFor="newListName"
              className="text-[11px] font-bold tracking-[0.15em] uppercase"
              style={{ color: "var(--z-subtle)" }}
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
                w-full rounded-xl px-4 py-3 text-sm transition-colors
                placeholder:text-z-subtle
                focus:outline-none
              "
              style={{
                backgroundColor: "var(--z-card-up)",
                border: "1px solid var(--z-border-mid)",
                color: "var(--z-text)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--z-amber)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--z-border-mid)";
              }}
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
