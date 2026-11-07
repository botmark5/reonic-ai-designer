"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { House3D } from "@/components/house3d";
import { Button } from "@/components/ui/button";
import { ServedBadge } from "@/components/ui/served-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { COMPONENTS } from "@/lib/diff";
import type { DesignRow } from "@/lib/supabase";
import { OFFER_TYPE_LABEL, type OfferType } from "@/lib/types";
import { HomeForm } from "./home-form";
import { Inbox } from "./inbox";
import { PhysicsTiles, SimilarHomes, WhyThisDesign } from "./evidence";
import { RefineBox } from "./refine-box";
import { SystemCard } from "./system-card";
import { usePlanner } from "./use-planner";

export function PlannerApp({ designs, initial }: { designs: DesignRow[]; initial: DesignRow }) {
  const [rows, setRows] = useState(designs);
  const [current, setCurrent] = useState(initial);

  const select = useCallback(async (row: DesignRow) => {
    window.history.replaceState(null, "", `/?d=${row.id}`);
    const res = await fetch(`/api/designs/${row.id}`);
    setCurrent(res.ok ? ((await res.json()) as DesignRow) : row);
  }, []);

  const createNew = useCallback(async (name: string) => {
    const res = await fetch("/api/designs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customer_name: name }) });
    if (!res.ok) return toast.error("Could not create the design");
    const row = (await res.json()) as DesignRow;
    setRows((r) => [row, ...r]);
    window.history.replaceState(null, "", `/?d=${row.id}`);
    setCurrent(row);
  }, []);

  return (
    <div className="mx-auto grid w-full max-w-[1600px] grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 md:px-6 lg:grid-cols-[264px_minmax(0,1fr)] xl:grid-cols-[272px_minmax(0,1fr)_336px]">
      {/* key: a fresh planner state per selected design */}
      <Workspace key={current.id} row={current} rows={rows} onSelect={select} onNew={createNew} />
    </div>
  );
}

function Workspace({
  row,
  rows,
  onSelect,
  onNew,
}: {
  row: DesignRow;
  rows: DesignRow[];
  onSelect: (r: DesignRow) => void;
  onNew: (name: string) => void;
}) {
  const p = usePlanner(row);
  const { s } = p;
  const r = s.response;
  const changed = new Set(s.change?.diff.changed ?? []);
  const offerType = r?.facts_for_explanation?.offer_type as OfferType | undefined;
  const lockedCount = Object.values(s.locks).filter((v) => v !== null && v !== undefined).length;

  async function send() {
    const res = await p.share();
    if (!res) return;
    const url = `${window.location.origin}${res.path}`;
    await navigator.clipboard?.writeText(url).catch(() => {});
    toast.success("Homeowner link copied", { description: url, action: { label: "Open", onClick: () => window.open(res.path, "_blank") } });
  }

  return (
    <>
      <aside className="order-3 flex min-w-0 flex-col gap-5 lg:order-1 lg:row-span-2" aria-label="Inbox and inputs">
        <Inbox initial={rows} selectedId={row.id} onSelect={onSelect} onNew={onNew} />
        <HomeForm home={s.home} onChange={p.setHome} />
      </aside>

      <main id="main" className="order-1 flex min-w-0 flex-col gap-4 lg:order-2">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="ai">{row.source === "voice" ? "Drafted by AI from a call" : "Drafted by AI"}</StatusBadge>
              {lockedCount > 0 && <StatusBadge tone="neutral">{lockedCount === 1 ? "1 choice by you" : `${lockedCount} choices by you`}</StatusBadge>}
              <ServedBadge served={r?.served} />
            </div>
            <h1 className="m-0 truncate text-h1">{row.customer_name ?? "Unnamed home"}</h1>
            <p className="m-0 text-body-sm text-ink-muted">
              {offerType && OFFER_TYPE_LABEL[offerType] ? <span className="font-medium text-ink-body">{OFFER_TYPE_LABEL[offerType]} · </span> : null}
              Proposed from this installer&apos;s past offers
              {r?.model_version && r.served?.source !== "offline" ? ` · model ${r.model_version.split(" ")[0]}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" render={<Link href="/reality" />} nativeButton={false}>
              Compare with expert
            </Button>
            <Button variant="secondary" onClick={send} disabled={!r}>
              Send to homeowner
            </Button>
            <Button
              onClick={() => {
                p.setStatus("review");
                toast.success("Design saved as the offer", { description: `${row.customer_name ?? "This home"} is ready to send.` });
              }}
              disabled={!r || s.row.status !== "draft"}
            >
              {s.row.status === "draft" ? "Use this design" : s.row.status === "review" ? "Ready to send" : "Sent"}
            </Button>
          </div>
        </div>

        <RefineBox home={s.home} locks={s.locks} response={r} onResult={p.applyRefine} showExamples={!s.change} />

        <div aria-live="polite" className="empty:hidden">
          {!s.busy && s.change && (s.change.diff.lines.length > 0 || s.change.note) && (
            <p key={s.change.id} className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-ink-body animate-in fade-in slide-in-from-top-1 duration-300">
              <span className="rounded-sm bg-highlight px-2 py-0.5 font-medium text-[#1b1d20]">Changed</span>
              {s.change.diff.lines.length > 0 && <span className="font-mono tabular">{s.change.diff.lines.join(" · ")}</span>}
              {s.change.note && <span>{s.change.diff.lines.length > 0 ? "· " : ""}{s.change.note}</span>}
            </p>
          )}
          {s.busy && r && (
            <p className="m-0 flex items-center gap-2 text-[13px] text-ink-muted">
              <span className="size-1.5 animate-pulse rounded-full bg-ai-orange motion-reduce:animate-none" aria-hidden />
              Recalculating with the engine…
            </p>
          )}
          {!s.busy && s.error && <p className="m-0 text-[13px] text-critical-text">{s.error} Your last design is still shown.</p>}
        </div>

        {r ? (
          <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${s.busy ? "opacity-70 transition-opacity" : ""}`}>
            {COMPONENTS.map((c) => (
              <SystemCard
                key={c}
                component={c}
                response={r}
                locks={s.locks}
                flags={s.flags}
                changed={changed.has(c)}
                changeId={s.change?.id ?? 0}
                busy={s.busy}
                onLock={(v, reason) => p.setLock(c, v, reason)}
              />
            ))}
          </div>
        ) : null}
        {r && (
          <section aria-label="The system on the house" className="mt-2">
            <House3D design={r} home={s.home} mode="planner" />
          </section>
        )}
        {!r && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Designing">
            {COMPONENTS.map((c) => (
              <div key={c} className="h-64 animate-pulse rounded-md border border-border bg-surface-1 motion-reduce:animate-none" />
            ))}
          </div>
        )}
      </main>

      <aside className="order-2 flex min-w-0 flex-col gap-4 lg:order-3 lg:col-start-2 xl:col-start-3 xl:row-start-1" aria-label="Evidence">
        <WhyThisDesign response={r} />
        {r && <SimilarHomes response={r} />}
        {r && <PhysicsTiles response={r} flags={s.flags} />}
      </aside>
    </>
  );
}
