import Link from "next/link";

/** Reonic logo + "AI Designer". Both logo variants are rendered; CSS picks the one for the theme. */
export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface-0/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-4 md:px-6">
        <Link href="/" className="flex items-center gap-3 rounded-sm" aria-label="Reonic AI Designer, home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/reonic-logo.svg" alt="" width={97} height={20} className="h-5 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/reonic-logo-light.svg" alt="" width={97} height={20} className="hidden h-5 w-auto dark:block" />
          <span className="h-4 w-px bg-border" aria-hidden />
          <span className="text-body-sm font-medium tracking-tight text-ink">
            <span className="bg-ai bg-clip-text font-semibold text-transparent">AI</span> Designer
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-2">{children}</div>
      </div>
    </header>
  );
}
