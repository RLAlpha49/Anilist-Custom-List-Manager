"use client";

import { useTheme } from "next-themes";
import { FC, useEffect, useState } from "react";
import { FaMoon, FaSun } from "react-icons/fa";

const DarkModeToggle: FC = () => {
  const [mounted, setMounted] = useState<boolean>(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  const toggleDarkMode = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <button
      onClick={toggleDarkMode}
      disabled={!mounted}
      className="
        rounded-md border border-(--z-border-mid) bg-z-card-up p-2 text-z-muted transition-all
        duration-150
        hover:border-(--z-amber) hover:bg-z-card-up hover:text-z-amber
        active:scale-95
      "
      aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      {isDark ? <FaSun size={16} /> : <FaMoon size={16} />}
    </button>
  );
};

export default DarkModeToggle;
