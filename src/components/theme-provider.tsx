"use client";
import { usePathname } from "next/navigation";
import { isPublicUiRoute } from "@/lib/theme";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme";
let preference: ThemePreference | undefined;
const listeners = new Set<() => void>();
function getSnapshot() {
  if (!preference) {
    try {
      preference = readThemePreference(window.localStorage);
    } catch {
      preference = "system";
    }
  }
  return preference;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function applyTheme() {
  const theme = isPublicUiRoute(window.location.pathname) ? "light" : resolveTheme(
    getSnapshot(),
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}
function setPreference(next: ThemePreference) {
  preference = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* In-memory preference still works. */
  }
  applyTheme();
  listeners.forEach((listener) => listener());
}
const ThemeContext = createContext({
  preference: "system" as ThemePreference,
  setPreference,
});
export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const selected = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => "system" as ThemePreference,
  );
  useEffect(() => {
    applyTheme();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = (event: StorageEvent) => {
      if (event.key && event.key !== THEME_STORAGE_KEY) return;
      preference = undefined;
      applyTheme();
      listeners.forEach((listener) => listener());
    };
    media.addEventListener("change", applyTheme);
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", applyTheme);
      window.removeEventListener("storage", sync);
    };
  }, [pathname]);
  return (
    <ThemeContext.Provider value={{ preference: selected, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}
export const useTheme = () => useContext(ThemeContext);
