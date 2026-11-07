"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Phone, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ServedBadge } from "@/components/ui/served-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { COMPONENTS, sizeOf } from "@/lib/diff";
import { fmtInt, fmtSize, LABEL } from "@/lib/format";
import type { CallRow, DesignRow, TranscriptTurn } from "@/lib/supabase";
import type { DesignResponse, Home } from "@/lib/types";
import { EMPTY_LOCKS } from "@/lib/types";
import { cn } from "@/lib/utils";

const DOT: Record<string, string> = { pv: "bg-comp-pv", battery: "bg-comp-battery", wallbox: "bg-comp-wallbox", heatpump: "bg-comp-heatpump" };

/** Facts as the voice agent stores them (session D: lib/voice.ts VoiceFacts), all optional. */
interface Facts {
  customer_name?: string | null;
  annual_kwh?: number | null;
  monthly_bill_eur?: number | null;
  household?: number | null;
  has_ev?: boolean | null;
  ev_km_year?: number | null;
  heating?: string | null;
  heating_age_years?: number | null;
  roof_type?: string | null;
  roof_direction?: string | null;
  has_existing_pv?: boolean | null;
  existing_pv_kwp?: number | null;
  existing_battery_kwh?: number | null;
}

type Item = { done: boolean; text: React.ReactNode };

const pretty = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function checklist(f: Facts): Item[] {
  return [
    {
      done: f.annual_kwh != null || f.monthly_bill_eur != null,
      text:
        f.annual_kwh != null ? (
          <>Uses <b className="font-mono tabular">{fmtInt(f.annual_kwh)}</b> <span className="text-ink-muted">kWh / year</span></>
        ) : f.monthly_bill_eur != null ? (
          <>Pays <b className="font-mono tabular">€{fmtInt(f.monthly_bill_eur)}</b> <span className="text-ink-muted">a month</span></>
        ) : (
          "Yearly electricity use"
        ),
    },
    { done: f.household != null, text: f.household != null ? <><b>{f.household === 1 ? "1 person" : `${f.household} people`}</b> in the home</> : "Household size" },
    {
      done: f.has_ev != null,
      text:
        f.has_ev == null ? "Electric car" : f.has_ev ? (
          <><b>Electric car</b>{f.ev_km_year ? <>, about <span className="font-mono tabular">{fmtInt(f.ev_km_year)}</span> <span className="text-ink-muted">km / year</span></> : null}</>
        ) : (
          <><b>No electric car</b></>
        ),
    },
    {
      done: f.heating != null,
      text: f.heating ? <><b>{pretty(f.heating)}</b> heating{f.heating_age_years ? `, ${f.heating_age_years} years old` : ""}</> : "Heating",
    },
    {
      done: f.roof_type != null || f.roof_direction != null,
      text: f.roof_type || f.roof_direction ? <><b>{f.roof_type ? pretty(f.roof_type) : "Roof"}</b>{f.roof_direction ? `, facing ${pretty(f.roof_direction).toLowerCase()}` : ""}</> : "Roof type and direction",
    },
    {
      done: f.has_existing_pv != null || f.existing_pv_kwp != null,
      text:
        f.has_existing_pv === false || f.existing_pv_kwp === 0 ? <><b>No solar</b> on the roof yet</> : f.existing_pv_kwp ? <><b>{f.existing_pv_kwp} kWp</b> solar already installed</> : f.has_existing_pv ? <><b>Solar</b> already on the roof</> : "Existing solar or battery",
    },
  ];
}

function factsToHome(f: Facts): Home {
  return {
    annual_kwh: f.annual_kwh ?? (f.monthly_bill_eur ? Math.round((f.monthly_bill_eur * 12) / 0.35 / 100) * 100 : 4000),
    price_eur_kwh: 0.32, load_profile: "H0", has_ev: !!f.has_ev, ev_km_year: f.has_ev ? (f.ev_km_year ?? 15000) : null,
    existing_pv_kwp: f.existing_pv_kwp ?? null, existing_battery_kwh: f.existing_battery_kwh ?? null,
    heating: f.heating ? pretty(f.heating) : null, heating_demand_kwh: null,
    roof_type: f.roof_type ? pretty(f.roof_type) : null, house_sqm: null, inhabitants: f.household ?? null,
    has_existing_pv: f.has_existing_pv ?? (f.existing_pv_kwp != null ? f.existing_pv_kwp > 0 : null),
  };
}

// --- Scripted demo call (no phone needed on stage) --------------------------------------------------------------
const SCRIPT: { role: "agent" | "customer"; text: string; facts?: Facts }[] = [
  { role: "agent", text: "Hello, I'm the planning assistant for your installer. Who am I speaking with, and where is the house?" },
  { role: "customer", text: "Weber, in Augsburg.", facts: { customer_name: "Weber, Augsburg" } },
  { role: "agent", text: "Thanks. Roughly how much electricity do you use in a year?" },
  { role: "customer", text: "About 4,800 kilowatt hours. We're a family of four.", facts: { annual_kwh: 4800, household: 4 } },
  { role: "agent", text: "Is there an electric car, now or planned?" },
  { role: "customer", text: "We're getting one in spring, maybe 15,000 kilometres a year.", facts: { has_ev: true, ev_km_year: 15000 } },
  { role: "agent", text: "Got it, family of four with an EV from spring. What heats the house today?" },
  { role: "customer", text: "Gas boiler, about 15 years old. The roof is concrete tile, facing south.", facts: { heating: "gas", heating_age_years: 15, roof_type: "concrete_tile", roof_direction: "south" } },
  { role: "agent", text: "Thanks. Last one: do you already have solar or a battery?" },
  { role: "customer", text: "No, nothing yet.", facts: { has_existing_pv: false } },
  { role: "agent", text: "Perfect. I've drafted a design; your installer will check it and get back to you." },
];

function useClock(startIso: string | null, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!startIso) return "00:00";
  const s = Math.max(0, Math.floor((now - new Date(startIso).getTime()) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function LiveCall() {
  const [mode, setMode] = useState<"idle" | "real" | "demo">("idle");
  const [call, setCall] = useState<CallRow | null>(null);
  const [draft, setDraft] = useState<DesignResponse | null>(null);
  const [draftRowId, setDraftRowId] = useState<string | null>(null);
  // demo state
  const [demoStep, setDemoStep] = useState(0);
  const [demoStart, setDemoStart] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const designAbort = useRef<AbortController | null>(null);
  const router = useRouter();

  // Poll real calls (server route; calls are not readable from the browser).
  useEffect(() => {
    if (mode === "demo") return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/calls", { cache: "no-store" });
        if (!r.ok) return;
        const { calls, latestDesign } = (await r.json()) as { calls: CallRow[]; latestDesign: DesignRow | null };
        const latest = calls[0];
        const fresh = latest && Date.now() - new Date(latest.created_at).getTime() < 45 * 60_000;
        if (stop) return;
        if (fresh) {
          setMode("real");
          setCall(latest);
          setDraft(latestDesign?.design ?? null);
          setDraftRowId(latestDesign?.id ?? null);
        }
      } catch {}
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [mode]);

  const demoFacts: Facts = SCRIPT.slice(0, demoStep).reduce((acc, t) => ({ ...acc, ...(t.facts ?? {}) }), {});
  const demoTranscript: TranscriptTurn[] = SCRIPT.slice(0, demoStep).map((t) => ({ role: t.role, text: t.text }));
  const demoDone = demoStep >= SCRIPT.length;

  // Demo: advance the script.
  useEffect(() => {
    if (mode !== "demo" || demoDone) return;
    const prev = SCRIPT[demoStep - 1];
    const t = setTimeout(() => setDemoStep((s) => s + 1), demoStep === 0 ? 400 : Math.min(3200, 900 + (prev?.text.length ?? 40) * 28));
    return () => clearTimeout(t);
  }, [mode, demoStep, demoDone]);

  // Demo: draft as soon as consumption is known; re-draft whenever facts change.
  const factsKey = JSON.stringify(demoFacts);
  useEffect(() => {
    if (mode !== "demo" || demoFacts.annual_kwh == null) return;
    designAbort.current?.abort();
    const ctrl = new AbortController();
    designAbort.current = ctrl;
    fetch("/api/engine/design", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ installer: "2a8ba8e2", home: factsToHome(demoFacts), locks: EMPTY_LOCKS }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && !ctrl.signal.aborted && setDraft(d))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, factsKey]);

  const startDemo = useCallback(() => {
    setMode("demo");
    setCall(null);
    setDraft(null);
    setDraftRowId(null);
    setSent(null);
    setDemoStep(0);
    setDemoStart(new Date().toISOString());
  }, []);

  const sendDraft = useCallback(async () => {
    const facts = demoFacts;
    const res = await fetch("/api/designs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customer_name: facts.customer_name ?? "Caller", source: "voice", home: factsToHome(facts), locks: EMPTY_LOCKS }),
    });
    if (!res.ok) return toast.error("Could not send the draft");
    const row = (await res.json()) as DesignRow;
    setSent(row.id);
    setDemoStep(SCRIPT.length);
    toast.success("Draft is in the planner's inbox", { action: { label: "Open", onClick: () => router.push(`/?d=${row.id}`) } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factsKey, router]);

  const facts: Facts = mode === "demo" ? demoFacts : ((call?.facts ?? {}) as Facts);
  const transcript: TranscriptTurn[] = mode === "demo" ? demoTranscript : (call?.transcript ?? []);
  const live = mode === "demo" ? !demoDone && !sent : call?.status === "live";
  const clock = useClock(mode === "demo" ? demoStart : (call?.created_at ?? null), !!live);
  const title = facts.customer_name ?? call?.customer_name ?? (mode === "idle" ? "Waiting for a call" : "Incoming call");
  const items = checklist(facts);
  const pendingIdx = items.findIndex((i) => !i.done);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // braces matter: scrollIntoView returns a Promise in current Chrome, and an effect must not return one
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [transcript.length]);

  return (
    <main id="main" className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {live ? (
              <StatusBadge tone="ai" pulse>
                Listening · <span className="font-mono tabular">{clock}</span>
              </StatusBadge>
            ) : mode === "idle" ? (
              <StatusBadge tone="neutral">No call right now</StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Call ended · <span className="font-mono tabular">{clock}</span></StatusBadge>
            )}
            <span className="text-body-sm text-ink-muted">{mode === "demo" ? "Demo call" : "Site visit call"}</span>
          </div>
          <h1 className="m-0 text-[clamp(34px,4vw,48px)] leading-none font-normal tracking-[-0.02em]">{title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode !== "demo" ? (
            <Button variant="secondary" onClick={startDemo}>
              <Play data-icon="inline-start" strokeWidth={1.5} /> Play demo call
            </Button>
          ) : (
            <Button variant="secondary" onClick={startDemo}>
              <RotateCcw data-icon="inline-start" strokeWidth={1.5} /> Restart demo
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-label="Conversation" className="flex min-h-[320px] flex-col gap-3 rounded-lg border border-border bg-surface-1 p-5 md:p-6">
          {transcript.length === 0 ? (
            <div className="m-auto flex max-w-sm flex-col items-center gap-3 text-center text-body-sm text-ink-muted">
              <Phone className="size-6 text-ink-muted" strokeWidth={1.5} aria-hidden />
              {mode === "real"
                ? "The call is running. The transcript arrives when the caller hangs up; facts and the draft update as the agent collects them."
                : "When a homeowner calls the voice agent, the conversation, the facts and a draft design appear here."}
            </div>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-live="polite">
              {transcript.map((t, i) => {
                const customer = t.role !== "agent";
                return (
                  <li
                    key={i}
                    className={cn(
                      "max-w-[85%] rounded-lg px-4 py-3 text-[17px] leading-[26px] animate-in fade-in slide-in-from-bottom-1 duration-300",
                      customer ? "self-end bg-surface-2 text-ink" : "self-start bg-ai-tint text-ink",
                    )}
                  >
                    <span className="sr-only">{customer ? "Caller: " : "Agent: "}</span>
                    {customer ? <q className="font-serif not-italic before:content-none after:content-none">{t.text}</q> : t.text}
                  </li>
                );
              })}
              <div ref={transcriptEnd} />
            </ol>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="facts-t" className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-5 md:p-6">
            <h2 id="facts-t" className="m-0 text-h3">What I have so far</h2>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {items.map((it, i) => (
                <li key={i} className={cn("flex items-start gap-3 text-[15px] leading-6", it.done ? "text-ink" : "text-ink-muted")}>
                  {it.done ? (
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-tint text-success-text animate-in zoom-in-50 duration-200">
                      <Check className="size-3" strokeWidth={2} aria-hidden />
                    </span>
                  ) : (
                    <span className={cn("mt-0.5 size-5 shrink-0 rounded-full border-2 border-dashed", live && i === pendingIdx ? "animate-spin border-ai-orange [animation-duration:3s] motion-reduce:animate-none" : "border-border-strong/60")} aria-hidden />
                  )}
                  <span>
                    <span className="sr-only">{it.done ? "Collected: " : live && i === pendingIdx ? "Asking now: " : "Not yet: "}</span>
                    {it.text}
                    {!it.done && live && i === pendingIdx && <span className="text-ai-text">: asking now</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="draft-t"
            className={cn(
              "relative flex flex-col gap-4 rounded-lg border bg-surface-1 p-5 md:p-6",
              draft ? "border-transparent [background:linear-gradient(var(--surface-1),var(--surface-1))_padding-box,linear-gradient(90deg,var(--ai-amber),var(--ai-orange),var(--ai-salmon))_border-box] border-[1.5px]" : "border-border",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="draft-t" className="m-0 text-h3">Draft design</h2>
              <div className="flex items-center gap-2">
                <ServedBadge served={draft?.served} />
                {draft && <StatusBadge tone="ai">Drafted by AI</StatusBadge>}
              </div>
            </div>
            {draft ? (
              <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
                {COMPONENTS.map((c) => {
                  const v = sizeOf(draft.design, c);
                  const hpOption = c === "heatpump" && v == null && draft.options?.heatpump?.available;
                  return (
                    <div key={c} className="flex flex-col gap-1">
                      <dt className="flex items-center gap-2 text-[13px] text-ink-muted">
                        <span className={cn("size-2 rounded-full", DOT[c])} aria-hidden />
                        {LABEL[c]}
                      </dt>
                      <dd className={cn("m-0 font-mono text-[24px] leading-7 font-medium tabular", v == null && "text-ink-muted")}>
                        <span key={hpOption ? "option" : fmtSize(c, v)} className="-mx-1 px-1 animate-value-changed">
                          {hpOption ? <span className="font-sans text-[15px]">Customer option</span> : fmtSize(c, v)}
                        </span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <p className="m-0 text-body-sm text-ink-muted">Appears as soon as the yearly use is known.</p>
            )}
            <p className="m-0 text-[13px] text-ink-muted">
              {sent || draftRowId ? "In the planner's inbox for review." : "Lands in the planner's inbox when the call ends."}
            </p>
            {mode === "demo" && draft && !sent && (
              <Button onClick={sendDraft} size="lg" className="self-start">
                End call and send draft
              </Button>
            )}
            {(sent || draftRowId) && (
              <Button variant="secondary" render={<Link href={`/?d=${sent ?? draftRowId}`} />} nativeButton={false} className="self-start">
                Open in planner
              </Button>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
