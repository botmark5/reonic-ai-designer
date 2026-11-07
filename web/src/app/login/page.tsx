import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Sign in · Reonic AI Designer", robots: { index: false } };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<main className="flex-1" />}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  return (
    <main id="main" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-h1">Planner sign-in</h1>
        <p className="m-0 text-body-sm text-ink-muted">Customer designs are only visible to the installer&apos;s planners.</p>
      </div>
      <form method="post" action="/api/login" className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <label htmlFor="passcode" className="text-label text-ink-muted">Passcode</label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          aria-invalid={sp.error ? true : undefined}
          aria-describedby={sp.error ? "pass-err" : undefined}
          className="h-11 rounded-sm border border-border-strong/60 bg-surface-1 px-3 text-body outline-none focus-visible:border-focus"
        />
        {sp.error && (
          <p id="pass-err" role="alert" className="m-0 text-body-sm text-critical-text">That passcode is not right. Try again.</p>
        )}
        <Button type="submit" size="lg">Sign in</Button>
      </form>
    </main>
  );
}
