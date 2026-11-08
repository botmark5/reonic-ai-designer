"use client";

import { useRef, useState } from "react";
import { BatteryMedium, Check, Pause, Play, PlugZap, SunMedium } from "lucide-react";
import { toast } from "sonner";
import { House3D } from "@/components/house3d";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/field";
import { ServedBadge } from "@/components/ui/served-badge";
import { sizeOf } from "@/lib/diff";
import { fmtEur, fmtInt, fmtKwp, fmtPct } from "@/lib/format";
import type { Offer } from "@/lib/offer";
import type { DesignResponse, Home } from "@/lib/types";
import { stripVoiceTags } from "@/lib/display-text";
import { cn } from "@/lib/utils";

function household(h: Home) {
  const who = h.inhabitants ? (h.inhabitants === 1 ? "one person" : h.inhabitants === 4 ? "a family of four" : `${h.inhabitants} people`) : "your home";
  const car = h.has_ev ? ", with an electric car" : "";
  return `Designed for ${who} using about ${fmtInt(h.annual_kwh)} kWh a year${car}.`;
}

function Row({ icon, title, sub, children }: { icon: React.ReactNode; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2" aria-hidden>
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[16px] font-semibold">{title}</span>
        <span className="text-[14px] leading-5 text-ink-muted">{sub}</span>
      </span>
      <div className="w-full sm:w-auto">{children}</div>
    </div>
  );
}

export function OfferView({ offer }: { offer: Offer }) {
  const base = offer.design;
  const [design, setDesign] = useState<DesignResponse>(base);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const reqId = useRef(0);
  const batteryAllowed = (offer.allowed.find((a) => a.component === "battery")?.values ?? []) as number[];
  const wallboxAllowed = offer.allowed.find((a) => a.component === "wallbox")?.values ?? [];
  const [battery, setBattery] = useState<number>(sizeOf(base.design, "battery") ?? 0);
  const [wallbox, setWallbox] = useState<boolean>(base.design.wallbox.include);

  async function choose(next: { battery_kwh: number; wallbox: boolean }) {
    const id = ++reqId.current; // only the latest choice may update the page
    setBusy(true);
    try {
      const res = await fetch(`/api/offer/${offer.token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "variant", ...next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Please try again.");
      const d = (await res.json()) as DesignResponse;
      if (id === reqId.current) setDesign(d);
    } catch (e) {
      toast.error("Could not update your offer", { description: (e as Error).message });
    } finally {
      if (id === reqId.current) setBusy(false);
    }
  }

  const pv = sizeOf(design.design, "pv");
  const panels = pv ? Math.round(pv / 0.45) : 0;
  const p = design.physics;
  const e = design.economics;
  const be = base.economics;
  const recommendedBattery = sizeOf(base.design, "battery") ?? 0;
  const changed = battery !== recommendedBattery || wallbox !== base.design.wallbox.include;

  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-4 py-8 md:py-12">
      <header className="flex flex-col gap-3">
        <p className="m-0 text-body-sm text-ink-muted">{offer.customer ? `Offer for ${offer.customer.split(",")[0]}` : "Your offer"} · from your installer</p>
        <h1 className="m-0 text-[clamp(32px,7vw,40px)] leading-[1.05] font-normal tracking-[-0.02em]">Your energy system, explained</h1>
        <p className="m-0 text-body text-ink-body">{household(offer.home)}</p>
        <ServedBadge served={design.served} className="self-start" />
      </header>

      <ListenButton offer={offer} />

      <div id="house3d-slot">
        <House3D design={design} home={offer.home} mode="homeowner" />
      </div>

      <fieldset disabled={busy} aria-label="Your system" className={cn("m-0 flex min-w-0 flex-col divide-y divide-border rounded-lg border border-border bg-surface-1 px-4 py-0", busy && "opacity-70 transition-opacity")}>
        <Row
          icon={<SunMedium className="size-5 text-comp-pv" strokeWidth={1.5} />}
          title="Solar panels"
          sub={pv ? `${panels} panels on your roof · chosen by your installer` : "No new panels: you already have solar"}
        >
          <span className="font-mono text-[22px] font-medium tabular">
            {pv ? <>{fmtKwp(pv)} <span className="text-[14px] text-ink-muted">kWp</span></> : "–"}
          </span>
        </Row>
        {batteryAllowed.length > 1 && (
          <Row icon={<BatteryMedium className="size-5 text-comp-battery" strokeWidth={1.5} />} title="Battery" sub="Stores midday sun for the evening">
            <Segmented
              label="Battery size"
              value={battery}
              onChange={(v) => {
                setBattery(v);
                choose({ battery_kwh: v, wallbox });
              }}
              options={batteryAllowed.map((v) => ({ value: v, label: v === 0 ? "None" : `${v} kWh${v === recommendedBattery ? " ★" : ""}` }))}
            />
          </Row>
        )}
        {wallboxAllowed.length > 1 && (
          <Row icon={<PlugZap className="size-5 text-comp-wallbox" strokeWidth={1.5} />} title="Car charger" sub={offer.home.has_ev ? "Charges your car from your own solar" : "Ready for an electric car later"}>
            <label className="inline-flex cursor-pointer items-center gap-2 text-[15px]">
              <input
                type="checkbox"
                className="size-5 cursor-pointer accent-[var(--primary)]"
                checked={wallbox}
                onChange={(ev) => {
                  setWallbox(ev.target.checked);
                  choose({ battery_kwh: battery, wallbox: ev.target.checked });
                }}
              />
              Included
            </label>
          </Row>
        )}
      </fieldset>
      {batteryAllowed.length > 1 && <p className="-mt-6 m-0 text-[13px] text-ink-muted">★ what your installer recommends</p>}

      <section aria-label="What it means for you" className="grid grid-cols-2 gap-3">
        {[
          ["Solar power per year", p.yield_kwh ? <>≈ {fmtInt(p.yield_kwh)} <span className="text-[14px] text-ink-muted">kWh</span></> : "–"],
          ["Power you make yourself", <>{fmtPct(p.autarky)} <span className="text-[14px] text-ink-muted">%</span></>],
          ["Savings per year", e ? fmtEur(e.savings_first_year_eur) : "–"],
          ["Pays for itself in", e?.payback_years ? <>{e.payback_years} <span className="text-[14px] text-ink-muted">years</span></> : "–"],
        ].map(([label, value], i) => (
          <div key={i} className="flex flex-col gap-1 rounded-lg border border-border bg-surface-1 p-4">
            <span className="text-[13px] text-ink-muted">{label}</span>
            <span className="font-mono text-[20px] leading-7 font-medium tabular sm:text-[22px]">{value}</span>
          </div>
        ))}
      </section>

      {changed && e && be && (
        <p className="-mt-4 m-0 text-body-sm text-ink-body" aria-live="polite">
          Compared with your installer&apos;s suggestion, this {e.capex_total_eur >= be.capex_total_eur ? "adds" : "saves"} about{" "}
          <b className="font-mono tabular">{fmtEur(Math.abs(e.capex_total_eur - be.capex_total_eur))}</b> and{" "}
          {p.autarky >= base.physics.autarky ? "raises" : "lowers"} the power you make yourself by{" "}
          <b className="font-mono tabular">{Math.abs(Math.round((p.autarky - base.physics.autarky) * 100))}</b> points.
        </p>
      )}
      <p className="-mt-4 m-0 text-[12px] leading-4 text-ink-muted">Prices and savings are estimates. Your installer confirms the final price.</p>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          size="lg"
          onClick={() => toast("Your installer will call you back", { description: "We have passed on your question." })}
        >
          Ask your installer
        </Button>
        <Button
          size="lg"
          disabled={accepted || busy}
          onClick={async () => {
            const res = await fetch(`/api/offer/${offer.token}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "accept", battery_kwh: battery, wallbox }),
            });
            if (!res.ok) return toast.error("Could not send your answer. Please try again.");
            setAccepted(true);
            toast.success("Thank you! Your installer will be in touch to book the visit.");
          }}
        >
          {accepted ? (
            <>
              <Check data-icon="inline-start" strokeWidth={2} /> Accepted
            </>
          ) : (
            "Accept this offer"
          )}
        </Button>
      </div>
    </main>
  );
}

/** "Listen to your offer": session D's /api/voice/explain (text + audio when enabled); falls back to the engine's
 *  homeowner explanation as text. */
function ListenButton({ offer }: { offer: Offer }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "text">("idle");
  const [text, setText] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);

  async function listen() {
    if (state === "playing") {
      audio.current?.pause();
      setState("text");
      return;
    }
    setState("loading");
    try {
      const res = await fetch(`/api/offer/${offer.token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "listen" }),
      });
      if (!res.ok) throw new Error();
      const r = (await res.json()) as { text: string; audio_base64: string | null };
      setText(stripVoiceTags(r.text));
      if (r.audio_base64) {
        const a = new Audio(`data:audio/mpeg;base64,${r.audio_base64}`);
        audio.current = a;
        a.onended = () => setState("text");
        await a.play();
        setState("playing");
      } else setState("text");
    } catch {
      // Fallback: the engine's plain-language explanation, streamed as text.
      try {
        const res = await fetch(`/api/offer/${offer.token}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "explain" }),
        });
        if (!res.ok) throw new Error();
        setText(stripVoiceTags(await res.text()));
        setState("text");
      } catch {
        setState("idle");
        toast.error("The explanation is not available right now.");
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={listen}
        disabled={state === "loading"}
        className="flex cursor-pointer items-center gap-4 rounded-pill bg-primary py-3 pr-6 pl-3 text-left text-primary-ink transition-transform duration-150 active:scale-[0.98] disabled:opacity-80 motion-reduce:active:scale-100"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ai" aria-hidden>
          {state === "playing" ? <Pause className="size-4 text-[#1b1d20]" fill="currentColor" /> : <Play className="size-4 translate-x-px text-[#1b1d20]" fill="currentColor" />}
        </span>
        <span className="flex flex-col">
          <span className="text-[16px] font-semibold">{state === "loading" ? "Preparing your offer…" : state === "playing" ? "Pause" : "Listen to your offer"}</span>
          <span className="text-[13px] opacity-75">About 45 seconds, in plain words</span>
        </span>
      </button>
      {text && (state === "text" || state === "playing") && (
        <p className="m-0 rounded-lg bg-ai-tint px-4 py-3 text-[15px] leading-6 text-ink" aria-live="polite">
          {text}
        </p>
      )}
    </div>
  );
}
