import { useEffect, useState } from "react";

export type ThemeName = "tokenviewer-light" | "tokenviewer-dark";

export function useTheme(): ThemeName {
  const [theme, setTheme] = useState<ThemeName>(() => currentTheme());

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setTheme(currentTheme());
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme === "tokenviewer-dark" ? "dark" : "light";
  }, [theme]);

  return theme;
}

function currentTheme(): ThemeName {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "tokenviewer-dark"
    : "tokenviewer-light";
}

