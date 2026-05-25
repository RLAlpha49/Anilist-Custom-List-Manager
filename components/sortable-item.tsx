"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import React from "react";

interface SortableItemProps {
  readonly id: string;
  readonly children: React.ReactNode;
}

function SortableItemComponent({ id, children }: Readonly<SortableItemProps>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  const childrenArray = React.Children.toArray(children);
  const nameElement = childrenArray[0];
  const actionsElement = childrenArray.slice(1);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="group/card relative list-none"
    >
      <div
        className="flex flex-col overflow-hidden rounded-2xl border transition-all duration-200"
        style={{
          backgroundColor: isDragging ? "var(--z-card-up)" : "var(--z-card)",
          borderColor: isDragging ? "rgba(245,166,35,0.55)" : "var(--z-border)",
          boxShadow: isDragging
            ? "0 28px 72px rgba(0,0,0,0.55), 0 0 0 1px rgba(245,166,35,0.25)"
            : "none",
        }}
      >
        {/* Header row: drag grip + name element */}
        <div
          className="flex items-stretch border-b"
          style={{ borderColor: "var(--z-border)" }}
        >
          {/* Drag handle */}
          <button
            type="button"
            aria-label="Drag to reorder"
            className="
              flex w-10 shrink-0 cursor-grab items-center justify-center self-stretch border-r
              transition-colors
              hover:bg-white/4
              active:cursor-grabbing
            "
            style={{ borderColor: "var(--z-border)" }}
            {...attributes}
            {...listeners}
          >
            <div className="
              grid grid-cols-2 gap-[3.5px] opacity-20 transition-opacity
              group-hover/card:opacity-55
            ">
              {(["a", "b", "c", "d", "e", "f"] as const).map((k) => (
                <div
                  key={k}
                  className="size-0.75 rounded-full"
                  style={{ backgroundColor: "var(--z-muted)" }}
                />
              ))}
            </div>
          </button>

          {/* Name element */}
          <div className="flex min-w-0 flex-1 items-center px-4 py-2.5">
            {nameElement}
          </div>
        </div>

        {/* Content area */}
        <div>{actionsElement}</div>
      </div>
    </li>
  );
}

export const SortableItem = React.memo(SortableItemComponent);

SortableItem.displayName = "SortableItem";
