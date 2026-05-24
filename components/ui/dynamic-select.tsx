"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { FaCheck, FaChevronDown, FaSearch, FaTimes } from "react-icons/fa";

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
  (
    {
      value,
      onValueChange,
      options,
      placeholder = "Select an option",
      className = "",
    },
    ref,
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const [mounted, setMounted] = useState(false);

    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      setMounted(true);
    }, []);

    const setTriggerRef = useCallback(
      (node: HTMLButtonElement | null) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (triggerRef as any).current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (ref as any).current = node;
        }
      },
      [ref],
    );

    const filteredOptions = useMemo(() => {
      if (searchQuery.trim() === "") {
        return options;
      }

      const query = searchQuery.toLowerCase();
      return options
        .map((group) => ({
          label: group.label,
          items: group.items.filter((item) =>
            item.label.toLowerCase().includes(query),
          ),
        }))
        .filter((group) => group.items.length > 0);
    }, [options, searchQuery]);

    const allFlatItems = useMemo(
      () => filteredOptions.flatMap((group) => group.items),
      [filteredOptions],
    );

    const itemIndexByValue = useMemo(() => {
      const map = new Map<string, number>();
      allFlatItems.forEach((item, idx) => {
        map.set(item.value, idx);
      });
      return map;
    }, [allFlatItems]);

    const getItemBg = (isSelected: boolean, isHighlighted: boolean) => {
      if (isSelected) return "var(--z-amber-dim)";
      if (isHighlighted) return "var(--z-card-up)";
      return "transparent";
    };

    const labelByValue = useMemo(() => {
      const map = new Map<string, string>();
      options.forEach((group) => {
        group.items.forEach((item) => {
          map.set(item.value, item.label);
        });
      });
      return map;
    }, [options]);

    const selectedLabel = useMemo(
      () => (value ? (labelByValue.get(value) ?? "") : ""),
      [labelByValue, value],
    );

    const computePosition = useCallback(() => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const panelHeight = Math.min(380, viewportHeight * 0.45);
      const spaceBelow = viewportHeight - rect.bottom;

      const nextStyle: React.CSSProperties =
        spaceBelow >= panelHeight || spaceBelow >= rect.top
          ? {
              position: "absolute",
              top: rect.bottom + window.scrollY + 4,
              left: rect.left + window.scrollX,
              width: Math.max(rect.width, 280),
              maxHeight: Math.min(panelHeight, spaceBelow - 8),
            }
          : {
              position: "absolute",
              top: rect.top + window.scrollY - panelHeight - 4,
              left: rect.left + window.scrollX,
              width: Math.max(rect.width, 280),
              maxHeight: Math.min(panelHeight, rect.top - 8),
            };

      setDropdownStyle((prev) => {
        if (
          prev.position === nextStyle.position &&
          prev.top === nextStyle.top &&
          prev.left === nextStyle.left &&
          prev.width === nextStyle.width &&
          prev.maxHeight === nextStyle.maxHeight
        ) {
          return prev;
        }
        return nextStyle;
      });
    }, []);

    const openDropdown = useCallback(() => {
      computePosition();
      setIsOpen(true);
      setSearchQuery("");
      setHighlightedIndex(-1);
      setTimeout(() => searchRef.current?.focus(), 60);
    }, [computePosition]);

    const closeDropdown = useCallback(() => {
      setIsOpen(false);
      setSearchQuery("");
    }, []);

    const handleSelect = useCallback(
      (val: string) => {
        onValueChange(val);
        closeDropdown();
        triggerRef.current?.focus();
      },
      [onValueChange, closeDropdown],
    );

    // Click-outside dismissal
    useEffect(() => {
      if (!isOpen) return;
      const handle = (e: MouseEvent) => {
        if (
          panelRef.current &&
          !panelRef.current.contains(e.target as Node) &&
          triggerRef.current &&
          !triggerRef.current.contains(e.target as Node)
        ) {
          closeDropdown();
        }
      };
      document.addEventListener("mousedown", handle);
      return () => document.removeEventListener("mousedown", handle);
    }, [isOpen, closeDropdown]);

    // Scroll position tracking
    useEffect(() => {
      if (!isOpen) return;
      let rafId: number | null = null;

      const scheduleUpdate = () => {
        if (rafId !== null) return;
        rafId = globalThis.requestAnimationFrame(() => {
          rafId = null;
          computePosition();
        });
      };

      scheduleUpdate();
      window.addEventListener("scroll", scheduleUpdate, {
        capture: true,
        passive: true,
      });
      window.addEventListener("resize", scheduleUpdate);

      return () => {
        if (rafId !== null) {
          globalThis.cancelAnimationFrame(rafId);
        }
        window.removeEventListener("scroll", scheduleUpdate, true);
        window.removeEventListener("resize", scheduleUpdate);
      };
    }, [isOpen, computePosition]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (
          e.key === "Enter" ||
          e.key === " " ||
          e.key === "ArrowDown" ||
          e.key === "ArrowUp"
        ) {
          e.preventDefault();
          openDropdown();
        }
        return;
      }
      switch (e.key) {
        case "Escape":
          closeDropdown();
          triggerRef.current?.focus();
          break;
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            Math.min(prev + 1, allFlatItems.length - 1),
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (highlightedIndex >= 0 && allFlatItems[highlightedIndex]) {
            handleSelect(allFlatItems[highlightedIndex].value);
          }
          break;
        case "Tab":
          closeDropdown();
          break;
      }
    };

    return (
      <>
        <div
          className={`
            relative flex min-w-40 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium
            transition-all duration-200
            focus-within:outline-none
            ${className}
          `}
          style={{
            border: isOpen
              ? "1px solid var(--z-amber)"
              : "1px solid var(--z-border-mid)",
            backgroundColor: isOpen ? "var(--z-card-up)" : "var(--z-card)",
            color: value ? "var(--z-text)" : "var(--z-muted)",
            boxShadow: isOpen ? "0 0 0 3px var(--z-amber-dim)" : undefined,
          }}
        >
          <button
            ref={setTriggerRef}
            type="button"
            onClick={() => (isOpen ? closeDropdown() : openDropdown())}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 cursor-pointer text-left focus:outline-none"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
          >
            <span className="block min-w-0 truncate">
              {selectedLabel || placeholder}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            {value && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onValueChange("");
                  closeDropdown();
                  triggerRef.current?.focus();
                }}
                className="
                  flex size-4 cursor-pointer items-center justify-center rounded-full
                  transition-colors
                  hover:text-z-text
                "
                style={{ color: "var(--z-subtle)" }}
                aria-label="Clear selection"
              >
                <FaTimes size={9} />
              </button>
            )}
            <FaChevronDown
              size={11}
              aria-hidden="true"
              style={{
                color: "var(--z-subtle)",
                transition: "transform 0.2s",
                transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </div>
        </div>

        {mounted &&
          createPortal(
            isOpen ? (
              <div
                ref={panelRef}
                style={{
                  ...dropdownStyle,
                  zIndex: 9999,
                  backgroundColor: "var(--z-card)",
                  border: "1px solid var(--z-border-mid)",
                  borderRadius: "0.875rem",
                  boxShadow:
                    "0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(245,166,35,0.1)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  opacity: 1,
                  transform: "translateY(0)",
                  transition:
                    "opacity 120ms ease-out, transform 120ms ease-out",
                }}
              >
                {/* Search bar */}
                <div
                  style={{
                    padding: "10px 10px 6px",
                    borderBottom: "1px solid var(--z-border)",
                  }}
                >
                  <div
                    className="flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{
                      backgroundColor: "var(--z-surface)",
                      border: "1px solid var(--z-border)",
                    }}
                  >
                    <FaSearch
                      size={11}
                      style={{ color: "var(--z-muted)", flexShrink: 0 }}
                    />
                    <input
                      ref={searchRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setHighlightedIndex(-1);
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="Search..."
                      className="w-full bg-transparent text-sm outline-none"
                      style={{
                        color: "var(--z-text)",
                      }}
                      aria-label="Search options"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery("");
                          setHighlightedIndex(-1);
                          searchRef.current?.focus();
                        }}
                        style={{ color: "var(--z-subtle)", flexShrink: 0 }}
                      >
                        <FaTimes size={10} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Options list */}
                <div
                  style={{
                    overflowY: "auto",
                    flex: 1,
                    padding: "6px 6px 8px",
                  }}
                >
                  {filteredOptions.length === 0 ? (
                    <div
                      className="py-8 text-center text-sm"
                      style={{ color: "var(--z-muted)" }}
                    >
                      No results found
                    </div>
                  ) : (
                    filteredOptions.map((group) => (
                      <div key={group.label}>
                        <div
                          className="px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase"
                          style={{ color: "var(--z-subtle)" }}
                        >
                          {group.label}
                        </div>
                        {group.items.map((item) => {
                          const globalIdx =
                            itemIndexByValue.get(item.value) ?? -1;
                          const isHighlighted = globalIdx === highlightedIndex;
                          const isSelected = item.value === value;
                          return (
                            <button
                              key={item.value}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => handleSelect(item.value)}
                              onMouseEnter={
                                globalIdx === highlightedIndex
                                  ? undefined
                                  : () => setHighlightedIndex(globalIdx)
                              }
                              className="
                                flex w-full cursor-pointer items-center justify-between rounded-md
                                px-3 py-1.5 text-left text-sm transition-colors duration-100
                              "
                              style={{
                                backgroundColor: getItemBg(
                                  isSelected,
                                  isHighlighted,
                                ),
                                color: isSelected
                                  ? "var(--z-amber)"
                                  : "var(--z-text)",
                              }}
                            >
                              <span>{item.label}</span>
                              {isSelected && (
                                <FaCheck
                                  size={9}
                                  style={{
                                    color: "var(--z-amber)",
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null,
            document.body,
          )}
      </>
    );
  },
);

DynamicSelect.displayName = "DynamicSelect";
