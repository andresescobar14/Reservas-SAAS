"use client";

import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export type Theme = "dark" | "light";
const STORAGE_KEY = "reserva-theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** Tema actual, leído de la clase de <html> (el valor inicial lo fija el script del layout). */
export function useTheme(): Theme {
  return useSyncExternalStore<Theme>(
    subscribe,
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "dark",
  );
}

export function setTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.style.colorScheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* almacenamiento no disponible: el cambio sigue valiendo para esta sesión */
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={next === "light" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={next === "light" ? "Modo claro" : "Modo oscuro"}
      className={cn(
        "relative flex size-9 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-emerald-300 hover:text-primary",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ opacity: 0, rotate: -80, scale: 0.5 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 80, scale: 0.5 }}
          transition={{ duration: 0.2 }}
          className="flex"
        >
          {theme === "dark" ? (
            <Sun size={17} strokeWidth={1.7} />
          ) : (
            <Moon size={17} strokeWidth={1.7} />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
