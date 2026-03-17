import { useState, useEffect } from "react";

export const useTheme = () => {
  const getInitialTheme = () => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "dark" || saved === "white") return saved;
    } catch {
      // ignore
    }
    return "dark";
  };

  const [theme, setTheme] = useState<"dark" | "white">(getInitialTheme);

  useEffect(() => {
    document.documentElement.className = `theme-${theme}`;
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = (newTheme: "dark" | "white") => {
    if (newTheme === theme) return;

    setTheme(newTheme);
    document.documentElement.className = `theme-${newTheme}`;

    try {
      localStorage.setItem("theme", newTheme);
    } catch (error) {
      console.error("Failed to save theme:", error);
    }
  };

  return { theme, toggleTheme };
};
