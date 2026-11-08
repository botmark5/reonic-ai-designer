"use client";

import { useState, useSyncExternalStore } from "react";
import { Plus } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { fmtRelative } from "@/lib/format";
import type { DesignRow } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { homeTitle } from "./text";

/** A clock that only runs in the browser (null on the server), so relative times never mismatch during hydration
 *  (server UTC vs the planner's time zone gave React error #418). Ticks every 30 s. */
const TICK = 30_000;
const subscribeClock = (cb: () => void) => {
  const t = setInterval(cb, TICK);
  return () => clearInterval(t);
};
const clientNow = () => Math.floor(Date.now() / TICK) * TICK;
const serverNow = () => null;

const STATUS: Record<DesignRow["status"], string> = { draft: "Draft", review: "Ready to send", sent: "Sent to homeowner" };

/** Designs newest first (the parent polls the server; the browser never reads Supabase directly). */
export function Inbox({
  rows,
  selectedId,
  onSelect,
  onNew,
}: {
  rows: DesignRow[];
  selectedId: string;
  onSelect: (row: DesignRow) => void;
  onNew: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const now = useSyncExternalStore(subscribeClock, clientNow, serverNow);

  return (
    <section aria-labelledby="inbox-title" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <h2 id="inbox-title" className="text-label uppercase text-ink-muted">
          Inbox
        </h2>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          aria-expanded={adding}
          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-pill px-2 text-[13px] font-medium text-ink-body transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Plus className="size-3.5" strokeWidth={1.5} aria-hidden /> New home
        </button>
      </div>
      {adding && (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            onNew(name.trim() || "New home");
            setName("");
            setAdding(false);
          }}
          onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
        >
          <label htmlFor="new-home" className="sr-only">
            Customer name and town
          </label>
          <input
            id="new-home"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Customer, town"
            className="h-8 min-w-0 flex-1 rounded-sm border border-border-strong/60 bg-surface-1 px-2.5 text-[13px] outline-none focus-visible:border-focus"
          />
          <button type="submit" className="h-8 cursor-pointer rounded-pill bg-primary px-3 text-[13px] font-medium text-primary-ink">
            Create
          </button>
        </form>
      )}
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-body-sm text-ink-muted">
          No designs yet. Calls from the voice agent and new homes land here.
        </p>
      ) : (
        <ul className="flex max-h-[300px] flex-col overflow-y-auto rounded-md border border-border bg-surface-1 p-1">
          {rows.map((r) => {
            const active = r.id === selectedId;
            const fresh = r.source === "voice" && r.status === "draft";
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full cursor-pointer flex-col items-start gap-1 rounded-[8px] px-3 py-2.5 text-left transition-colors duration-150",
                    active ? (fresh ? "bg-ai-tint" : "bg-surface-2") : "hover:bg-surface-2/60",
                  )}
                >
                  <span className="flex w-full items-baseline justify-between gap-2">
                    <span className={cn("truncate text-body-sm", active ? "font-semibold" : "font-medium")}>{homeTitle(r)}</span>
                    <span className="shrink-0 font-mono text-[12px] text-ink-muted tabular">{now == null ? "" : fmtRelative(r.created_at, now)}</span>
                  </span>
                  {fresh ? (
                    <StatusBadge tone="ai" className="bg-surface-1">
                      From call · new
                    </StatusBadge>
                  ) : (
                    <span className="text-[12px] leading-4 text-ink-muted">
                      {r.source === "voice" ? "From call · " : ""}
                      {STATUS[r.status]}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
