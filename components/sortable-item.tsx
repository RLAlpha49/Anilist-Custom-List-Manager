"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import React from "react";
import { FaSort } from "react-icons/fa";

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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  // Split children into an array
  const childrenArray = React.Children.toArray(children);
  const nameElement = childrenArray[0]; // First child - typically the name span
  const actionsElement = childrenArray.slice(1); // Rest of children - typically actions

  return (
    <li ref={setNodeRef} style={style} className="relative list-none">
      <div className="
        flex flex-col justify-between gap-3 rounded-lg border border-(--z-border) bg-z-card p-4
        transition-all duration-200
        hover:border-(--z-border-mid) hover:bg-z-card-up
        sm:flex-row sm:items-center
      ">
        <div className="flex items-center gap-3">
          <div
            className="
              flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md border
              border-[rgba(245,166,35,0.2)] bg-(--z-amber-dim) text-z-amber
              active:cursor-grabbing
            "
            {...attributes}
            {...listeners}
          >
            <FaSort size={14} />
          </div>
          {nameElement}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actionsElement}
        </div>
      </div>
    </li>
  );
}

export const SortableItem = React.memo(SortableItemComponent);

SortableItem.displayName = "SortableItem";
