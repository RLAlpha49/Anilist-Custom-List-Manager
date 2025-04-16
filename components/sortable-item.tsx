"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FaSort } from "react-icons/fa";
import { motion } from "framer-motion";

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
}

// Animation variants
const itemVariants = {
  hidden: { opacity: 0, y: -10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
  hover: { scale: 1.02, transition: { duration: 0.2 } },
};

function SortableItemComponent({ id, children }: SortableItemProps) {
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
    <li
      ref={setNodeRef}
      style={style}
      className="relative list-none"
      role="listitem"
    >
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        whileHover="hover"
        className="flex flex-col justify-between gap-3 rounded-lg border border-gray-100 bg-white p-5 shadow-md transition-all duration-300 hover:border-blue-200 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-800 sm:flex-row sm:items-center"
      >
        <div className="flex items-center space-x-3">
          <div
            className="flex h-10 w-10 cursor-grab items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md active:cursor-grabbing dark:from-blue-700 dark:to-indigo-900"
            {...attributes}
            {...listeners}
          >
            <FaSort className="h-5 w-5 text-white" />
          </div>
          {nameElement}
        </div>

        <div className="flex items-center sm:ml-auto">{actionsElement}</div>
      </motion.div>
    </li>
  );
}

export const SortableItem = React.memo(SortableItemComponent);

SortableItem.displayName = "SortableItem";
