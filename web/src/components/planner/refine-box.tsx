"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Home, Locks, RefineResponse } from "@/lib/types";
import { INSTALLER } from "./use-planner";

const EXAMPLES = ["They are buying an EV next year", "Customer wants no battery", "They want to be as independent as possible"];

/** Planner text → input changes → new design. The engine still decides every size. */
export function RefineBox({
  home,
  locks,
  onResult,
  onStart,
  showExamples = true,
}: {
  home: Home;
  locks: Locks;
  onResult: (r: RefineResponse) => void;
  onStart?: () => void;
  showExamples?: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(value = text) {
    const t = value.trim();
    if (!t || busy) return;
    setBusy(true);
    onStart?.();
    try {
      const res = await fetch("/api/engine/refine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: t, home, locks, installer: INSTALLER }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "The designer could not read that.");
      const r = (await res.json()) as RefineResponse;
      onResult(r);
      setText("");
    } catch (e) {
      toast.error("Could not update the design", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        aria-label="Refine the design"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2 rounded-pill border border-border-strong/60 bg-surface-1 py-1.5 pr-1.5 pl-4 transition-[border-color,box-shadow] focus-within:border-focus focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--focus),transparent_75%)]"
      >
        <Sparkles className="size-4 shrink-0 text-ai-orange" strokeWidth={1.5} aria-hidden />
        <label htmlFor="refine" className="sr-only">
          Tell the designer what changed
        </label>
        <input
          id="refine"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tell the designer what changed, e.g. “they're buying an EV next year”"
          className="min-w-0 flex-1 bg-transparent text-body-sm text-ink outline-none placeholder:text-ink-muted"
          disabled={busy}
        />
        <Button type="submit" size="sm" disabled={busy || !text.trim()}>
          {busy ? "Updating…" : "Update design"}
        </Button>
      </form>
      {showExamples && !text && !busy && (
        <div className="flex flex-wrap gap-1.5" aria-label="Examples">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => submit(ex)}
              className="cursor-pointer rounded-pill border border-border px-2.5 py-1 text-[12px] text-ink-body transition-colors hover:border-border-strong hover:text-ink"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
