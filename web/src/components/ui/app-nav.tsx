"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Designs" },
  { href: "/live", label: "Live call" },
  { href: "/reality", label: "Reality check" },
] as const;

export function AppNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-pill px-3 py-1.5 text-body-sm whitespace-nowrap transition-colors duration-150",
              active ? "bg-surface-2 font-medium text-ink" : "text-ink-body hover:bg-surface-2/60 hover:text-ink",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

const subscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="grid size-9 cursor-pointer place-items-center rounded-pill text-ink-body transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {mounted ? dark ? <Sun className="size-4" strokeWidth={1.5} /> : <Moon className="size-4" strokeWidth={1.5} /> : <span className="size-4" />}
    </button>
  );
}
