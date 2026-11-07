import Link from "next/link";
import { AppNav, ThemeToggle } from "./app-nav";

/** Reonic logo + "AI Designer" + main nav. Both logo variants are rendered; CSS picks the one for the theme. */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface-0/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-4 md:gap-6 md:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-sm" aria-label="Reonic AI Designer, designs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/reonic-logo.svg" alt="" width={107} height={22} className="h-[22px] w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/reonic-logo-light.svg" alt="" width={107} height={22} className="hidden h-[22px] w-auto dark:block" />
          <span className="hidden text-body-sm font-medium text-ink-muted sm:inline">AI Designer</span>
        </Link>
        <AppNav />
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
