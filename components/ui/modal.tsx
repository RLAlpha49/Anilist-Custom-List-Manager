import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useId, useRef } from "react";
import { FaTimes } from "react-icons/fa";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  confirmButtonText?: string;
  children: React.ReactNode;
  variant?: "default" | "danger";
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  confirmButtonText = "Confirm",
  children,
  variant = "default",
}) => {
  const confirmBg = variant === "danger" ? "var(--z-red)" : "var(--z-amber)";
  const confirmTextColor = variant === "danger" ? "#fff" : "#07060f";
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElementRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      document.body.style.overflow = "hidden";
      return;
    }

    document.body.style.overflow = "";
    previouslyFocusedElementRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <AnimatePresence>
        {isOpen && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-50"
                style={{
                  backgroundColor: "rgba(7,6,15,0.88)",
                  backdropFilter: "blur(14px)",
                }}
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content
              asChild
              aria-labelledby={titleId}
              aria-describedby={descriptionId}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                cancelButtonRef.current?.focus();
              }}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                initial={{ opacity: 0, scale: 0.94, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 20 }}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
                className="
                  fixed inset-0 z-50 flex items-center justify-center p-4
                  focus:outline-none
                "
              >
                <div
                  className="relative w-full max-w-lg overflow-hidden"
                  style={{
                    backgroundColor: "var(--z-card)",
                    border: "1px solid var(--z-border-mid)",
                    borderRadius: "1rem",
                    boxShadow: "0 40px 100px rgba(0,0,0,0.7)",
                  }}
                >
                  {/* Header */}
                  <div
                    className="relative pt-5 pr-14 pb-4 pl-7"
                    style={{
                      borderBottom: "1px solid var(--z-border)",
                      backgroundColor: "rgba(255,255,255,0.015)",
                    }}
                  >
                    <h2
                      id={titleId}
                      className="text-xl/tight font-black"
                      style={{
                        fontFamily: "var(--font-syne)",
                        color: "var(--z-text)",
                      }}
                    >
                      {title}
                    </h2>

                    {/* Close button */}
                    <button
                      onClick={onClose}
                      className="
                        absolute top-4 right-4 flex size-8 cursor-pointer items-center
                        justify-center rounded-lg transition-all duration-200
                        hover:bg-z-card-high
                        active:scale-90
                      "
                      style={{ color: "var(--z-muted)" }}
                      aria-label="Close Modal"
                    >
                      <FaTimes size={13} />
                    </button>
                  </div>

                  {/* Content */}
                  <div
                    id={descriptionId}
                    className="max-h-[60vh] overflow-y-auto py-5 pr-6 pl-7"
                  >
                    {children}
                  </div>

                  {/* Footer */}
                  <div
                    className="flex items-center justify-end gap-3 py-4 pr-6 pl-7"
                    style={{ borderTop: "1px solid var(--z-border)" }}
                  >
                    <button
                      ref={cancelButtonRef}
                      onClick={onClose}
                      className="
                        cursor-pointer rounded-lg px-4 py-2.5 text-sm font-medium transition-all
                        duration-200
                        hover:bg-z-card-high
                        active:scale-95
                      "
                      style={{
                        border: "1px solid var(--z-border-mid)",
                        color: "var(--z-muted)",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        onConfirm();
                        onClose();
                      }}
                      className="
                        cursor-pointer rounded-lg px-5 py-2.5 text-sm font-bold transition-all
                        duration-200
                        hover:brightness-110
                        active:scale-95
                      "
                      style={{
                        backgroundColor: confirmBg,
                        color: confirmTextColor,
                      }}
                    >
                      {confirmButtonText}
                    </button>
                  </div>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
};

export default Modal;
