"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import clsx from "clsx";
import { THEME_KEY } from "@/lib/theme";


// o tema vive no <html data-theme>; o botão só observa esse valor
const subscribe = (cb: () => void) => {
  window.addEventListener("docdo-theme", cb);
  return () => window.removeEventListener("docdo-theme", cb);
};
const readTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light" as const);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    window.dispatchEvent(new CustomEvent("docdo-theme", { detail: next }));
  };

  const label = theme === "dark" ? "Usar tema claro" : "Usar tema escuro";
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 text-ink-200 transition hover:border-white/20 hover:text-ink-50",
        withLabel ? "w-full px-3 py-2 text-xs font-semibold" : "size-10",
        className,
      )}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {withLabel && (theme === "dark" ? "Tema claro" : "Tema escuro")}
    </button>
  );
}
