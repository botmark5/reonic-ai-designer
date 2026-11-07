"use client";

import { useCallback, useEffect, useState } from "react";
import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServedBadge } from "@/components/ui/served-badge";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { COMPONENTS, sizeOf } from "@/lib/diff";
import { fmtInt, fmtKwp, fmtSize, LABEL } from "@/lib/format";
import type { DemoProject } from "@/lib/heldout";
import { ADDON_HEADLINES, headlines, headlineSource, trustedCoverage, verdicts, type VerdictKind } from "@/lib/reality";
import type { ComponentKey, EvalResponse, ExpertVariant, MetricSet, ProjectResponse } from "@/lib/types";
import { PREDICTORS } from "@/lib/types";
import { cn } from "@/lib/utils";

const DOT: Record<ComponentKey, string> = { pv: "bg-comp-pv", battery: "bg-comp-battery", wallbox: "bg-comp-wallbox", heatpump: "bg-comp-heatpump" };
const TONE: Record<VerdictKind, Tone> = { match: "success", range: "success", close: "success", option: "success", off: "warning", missing: "critical", extra: "critical" };
const ROLE_LABEL: Record<string, string> = {
  typical_pv_battery: "Typical home",
  ev_wallbox: "EV owner",
  heatpump_option: "Heat pump case",
  battery_retrofit: "Battery retrofit",
  experts_disagree: "Experts disagree",
};

const n = (m: MetricSet | undefined, k: string) => (m && typeof m[k] === "number" ? (m[k] as number) : null);
const pct = (x: number | null) => (x == null ? "–" : `${Math.round(x)}`);
const kwp = (x: number | null) => (x == null ? "–" : x.toFixed(1));

function expertCell(c: ComponentKey, variants: ExpertVariant[]) {
  const val = (v: ExpertVariant) =>
    c === "pv" ? v.pv_kwp : c === "battery" ? v.battery_kwh : c === "heatpump" ? v.heatpump_kw : v.has_wallbox ? 11 : 0;
  const vals = Array.from(new Set(variants.map((v) => val(v) ?? 0))).sort((a, b) => a - b);
  if (c === "wallbox") return vals.some((x) => x > 0) ? (vals.length > 1 ? "Yes or no" : "Wallbox") : "None";
  const shown = vals.filter((x) => x > 0);
  if (!shown.length) return "None";
  if (shown.length === 1) return fmtSize(c, shown[0]);
  return (
    <>
      {shown.map((x) => (c === "pv" ? fmtKwp(x) : x)).join(" · ")} {c === "pv" ? "kWp" : c === "battery" ? "kWh" : "kW"}{" "}
      <span className="text-ink-muted">({variants.length} options)</span>
    </>
  );
}

function describeHome(p: ProjectResponse) {
  const h = p.home;
  return [
    `${fmtInt(h.annual_kwh)} kWh`,
    h.has_ev ? "EV" : "no EV",
    h.heating ? h.heating.toLowerCase() : null,
    h.existing_pv_kwp ? `${h.existing_pv_kwp} kWp existing PV` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function RealityView({ evalRes, ids, demos }: { evalRes: EvalResponse; ids: string[]; demos: DemoProject[] }) {
  const [projectId, setProjectId] = useState<string | null>(demos[0]?.project_id ?? ids[0] ?? null);
  const [history, setHistory] = useState<string[]>([]);
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!projectId) return;
    const ctrl = new AbortController();
    fetch(`/api/engine/project/${encodeURIComponent(projectId)}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setProject({ ...(await r.json()), project_id: projectId });
      })
      .catch(() => !ctrl.signal.aborted && setErrorId(projectId));
    return () => ctrl.abort();
  }, [projectId]);

  const go = useCallback(
    (id: string) => {
      if (projectId) setHistory((h) => [...h.slice(-20), projectId]);
      setErrorId(null);
      setProjectId(id);
    },
    [projectId],
  );

  const random = () => {
    if (!ids.length) return;
    let id = ids[Math.floor(Math.random() * ids.length)];
    if (id === projectId && ids.length > 1) id = ids[(ids.indexOf(id) + 1) % ids.length];
    go(id);
  };

  const state: "idle" | "loading" | "error" =
    projectId && errorId === projectId ? "error" : projectId && project?.project_id !== projectId ? "loading" : "idle";
  const demo = demos.find((d) => d.project_id === projectId);
  // engine #47: /project designs without the existing-PV answer. Label the retrofit case until the engine returns
  // a battery retrofit for it (then this disappears by itself).
  const unanswered =
    demo?.role === "battery_retrofit" && project?.project_id === projectId && project?.ours?.facts_for_explanation?.offer_type !== "battery_retrofit";
  const catalogue = ((evalRes.protocol?.catalogue as Record<string, number[]> | undefined) ?? {})[project?.installer ?? ""] ?? [];
  const ours = project?.ours?.design ?? null;
  const v =
    project && ours
      ? verdicts(
          {
            pv: sizeOf(ours, "pv"),
            battery: sizeOf(ours, "battery"),
            wallbox: ours.wallbox.include,
            heatpump: sizeOf(ours, "heatpump"),
            heatpumpOption: project.ours?.options?.heatpump?.available ? project.ours.options.heatpump.kw : null,
          },
          project.variants,
          catalogue,
        )
      : null;

  const M = evalRes.metrics[PREDICTORS.model];
  const offline = evalRes.served?.source === "offline";
  // Headline = new full systems when the engine reports that slice (else all projects); add-on sales separately.
  const src = headlineSource(evalRes as Parameters<typeof headlineSource>[0]);
  const HM = src.metrics[PREDICTORS.model] as MetricSet | undefined;
  const heads = headlines(src.metrics);
  const addOns = src.addOns ? headlines(src.addOns, PREDICTORS.model, ADDON_HEADLINES) : [];
  const nAddOns = src.addOns ? n(src.addOns[PREDICTORS.model] as MetricSet, "n_projects") : null;
  // Shown only when /eval reports coverage (engine #43). 80 % is not an engine number: a P10–P90 range should hold 90 − 10 = 80 % by definition.
  const cov = trustedCoverage(HM) ?? trustedCoverage(src.overall[PREDICTORS.model]);
  const addOnCov = src.addOns ? trustedCoverage(src.addOns[PREDICTORS.model]) : null; // null or < 20 homes: no row
  const answered = evalRes.with_existing_pv_answer?.metrics?.[PREDICTORS.model];
  const fmt = (x: number | null, unit: "kWp" | "%") => (x == null ? "–" : unit === "kWp" ? x.toFixed(2) : `${Math.round(x)}`);
  const nTest = n(HM, "n_projects") ?? (src.fullOnly ? null : ((evalRes.protocol?.n_test as number | undefined) ?? null));
  const nAll = n(M, "n_projects") ?? (evalRes.protocol?.n_test as number | undefined) ?? null;
  const transfer = Object.entries(evalRes.transfer ?? {});

  return (
    <main id="main" className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-8 px-4 py-8 md:px-6 md:py-12">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ServedBadge served={evalRes.served} />
          {offline && <span className="text-body-sm text-ink-muted">Engine offline: no numbers are shown until it is reachable again.</span>}
        </div>
        <h1 className="m-0 text-[clamp(32px,4vw,48px)] leading-none font-normal tracking-[-0.02em]">Does it design like your experts?</h1>
        <p className="m-0 max-w-2xl text-body text-ink-body">Every number on this page comes from homes the engine never saw while learning.</p>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section aria-labelledby="one-home" className="flex flex-col gap-4 self-start rounded-lg border border-border bg-surface-1 p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id="one-home" className="m-0 text-label uppercase text-ink-muted">One held-out home</h2>
              <p className="m-0 font-mono text-data text-ink-body tabular" aria-live="polite">
                {project ? `Project ${project.project_id?.slice(0, 8)} · ${describeHome(project)}` : projectId ? "Loading…" : "No held-out projects available"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={!history.length} onClick={() => setHistory((h) => (setErrorId(null), setProjectId(h[h.length - 1]), h.slice(0, -1)))}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={!ids.length} onClick={random}>
                <Shuffle data-icon="inline-start" strokeWidth={1.5} /> Random home
              </Button>
            </div>
          </div>

          {demos.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Example cases">
              {demos.map((d) => (
                <button
                  key={d.project_id}
                  type="button"
                  onClick={() => go(d.project_id)}
                  aria-pressed={d.project_id === projectId}
                  title={d.why}
                  className={cn(
                    "cursor-pointer rounded-pill border px-2.5 py-1 text-[12px] transition-colors",
                    d.project_id === projectId ? "border-ink bg-ink text-surface-0" : "border-border text-ink-body hover:border-border-strong hover:text-ink",
                  )}
                >
                  {ROLE_LABEL[d.role] ?? d.role}
                </button>
              ))}
            </div>
          )}

          {state === "error" ? (
            <p className="m-0 text-body-sm text-critical-text">
              This project could not be loaded: the engine is offline or does not know this id. No example values are shown in its place.
            </p>
          ) : (
            <div className={cn("overflow-x-auto", state === "loading" && "opacity-60 transition-opacity")} aria-busy={state === "loading"}>
              <table className="w-full min-w-[520px] border-collapse text-[14px]">
                <thead>
                  <tr className="text-left text-[12px] text-ink-muted">
                    <th scope="col" className="border-b border-border py-2 font-medium">Component</th>
                    <th scope="col" className="border-b border-border py-2 font-medium">Our design</th>
                    <th scope="col" className="border-b border-border py-2 font-medium">Expert offered</th>
                    <th scope="col" className="border-b border-border py-2 font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPONENTS.map((c) => (
                    <tr key={c} className="border-b border-surface-2 last:border-0">
                      <td className="py-3">
                        <span className="flex items-center gap-2">
                          <span className={cn("size-2 rounded-full", DOT[c])} aria-hidden />
                          {LABEL[c]}
                        </span>
                      </td>
                      <td className="py-3 font-mono tabular">
                        {ours ? (c === "heatpump" && !ours.heatpump.include && project?.ours?.options?.heatpump?.available ? <span className="font-sans">Option {project.ours.options.heatpump.kw} kW</span> : fmtSize(c, sizeOf(ours, c))) : "–"}
                      </td>
                      <td className="py-3 font-mono tabular">{project ? expertCell(c, project.variants) : "–"}</td>
                      <td className="py-3">{v ? <StatusBadge tone={TONE[v[c].kind]}>{v[c].label}</StatusBadge> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {unanswered && (
            <p className="m-0 rounded-md bg-warning-tint px-3 py-2 text-[13px] leading-5 text-warning-text">
              Unanswered mode: this design was made without the answer to “Solar already on the roof?”, so the engine cannot know
              the expert only added a battery. The held-out numbers count add-ons like this with the answer given (engine #47 fixes this case).
            </p>
          )}
          <p className="m-0 text-[13px] leading-5 text-ink-muted">
            {demo ? `${demo.why}. ` : ""}
            {project && project.variants.length > 1
              ? `The expert offered ${project.variants.length} variants for this home; any proposal inside that range counts as a hit.`
              : "PV counts as a match within 1 kWp, a battery within one catalogue size step."}
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) go(manual.trim());
            }}
          >
            <label htmlFor="pid" className="sr-only">Project ID</label>
            <input
              id="pid"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Open a project by ID"
              className="h-8 min-w-0 flex-1 rounded-sm border border-border bg-surface-0 px-2.5 font-mono text-[13px] outline-none focus-visible:border-focus"
            />
            <Button type="submit" size="sm" variant="ghost">Open</Button>
          </form>
        </section>

        <section aria-labelledby="across" className="flex flex-col gap-4">
          <h2 id="across" className="m-0 text-label uppercase text-ink-muted">
            Across {nTest ? fmtInt(nTest) : "all"} held-out {src.fullOnly ? "new systems" : "homes"}
          </h2>
          {src.answered && !offline && (
            <p className="m-0 -mt-2 text-[12px] leading-4 text-ink-muted">With “Solar already on the roof?” answered, as the planner does. The card below shows what the answer adds.</p>
          )}
          {offline ? (
            <div className="rounded-lg border border-dashed border-border bg-surface-1 p-6 text-body-sm text-ink-muted">
              Engine offline: the held-out metrics appear here as soon as it is reachable again. No numbers are shown in the meantime.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {heads.map((t, i) => (
                <div key={t.key} className={cn("flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4", i === 0 && "sm:col-span-2")}>
                  <div className="flex flex-wrap-reverse items-start justify-between gap-2">
                    <span className="min-w-[12ch] flex-1 text-[13px] leading-[18px] text-ink-body">{t.label}</span>
                    {t.wins != null && (
                      <StatusBadge tone={t.wins ? "success" : "warning"}>{t.wins ? "Better than rules" : "Below simple rule"}</StatusBadge>
                    )}
                    {t.tie && <StatusBadge tone="neutral">Same as rule</StatusBadge>}
                  </div>
                  <span className="font-mono text-metric font-medium tabular">
                    {fmt(t.ours, t.unit)} <small className="text-[15px] text-ink-muted">{t.unit}</small>
                  </span>
                  <span className="text-[12px] leading-4 text-ink-muted">
                    Best simple rule: <span className="font-mono tabular">{fmt(t.base, t.unit)} {t.unit}</span>
                    {t.baseName ? ` (${t.baseName})` : ""}
                    {t.note ? `. ${t.note}` : ""}
                  </span>
                </div>
              ))}
              {cov != null && (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4">
                  <div className="flex flex-wrap-reverse items-start justify-between gap-2">
                    <span className="min-w-[12ch] flex-1 text-[13px] leading-[18px] text-ink-body">Expert solar inside our P10–P90 range</span>
                    <StatusBadge tone={Math.abs(cov - 80) <= 5 ? "success" : "warning"}>
                      {Math.abs(cov - 80) <= 5 ? "Calibrated" : cov < 80 ? "Range too narrow" : "Range too wide"}
                    </StatusBadge>
                  </div>
                  <span className="font-mono text-metric font-medium tabular">
                    {Math.round(cov)} <small className="text-[15px] text-ink-muted">%</small>
                  </span>
                  <span className="text-[12px] leading-4 text-ink-muted">Target 80 %: an honest range holds about 8 in 10 expert choices.</span>
                </div>
              )}
            </div>
          )}
          {!offline && addOns.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4">
              <span className="text-[13px] text-ink-body">
                Add-on sales{nAddOns ? ` (${fmtInt(nAddOns)} homes)` : ""}: battery retrofits, extensions, wallbox only. Scored separately.
              </span>
              {addOns.map((t) => (
                <div key={t.key} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span className="text-ink-muted">{t.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono tabular">{fmt(t.ours, t.unit)} %</span>
                    <span className="text-ink-muted">vs {fmt(t.base, t.unit)} % best rule</span>
                    {t.wins != null && <StatusBadge tone={t.wins ? "success" : "warning"}>{t.wins ? "Better" : "Below"}</StatusBadge>}
                    {t.tie && <StatusBadge tone="neutral">Same</StatusBadge>}
                  </span>
                </div>
              ))}
              {addOnCov != null && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span className="text-ink-muted">Expert solar inside our P10–P90 range, where both chose solar</span>
                  <span className="font-mono tabular">{Math.round(addOnCov)} %</span>
                </div>
              )}
            </div>
          )}
          {!offline && answered && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-ai-tint/50 p-4">
              <span className="text-[13px] font-medium text-ink">When the planner answers “Solar already on the roof?”</span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-4">
                {[
                  ["Solar size error", "pv_kwp_mae_all_projects", "kWp"],
                  ["Solar yes/no", "has_pv_accuracy", "%"],
                  ["Battery yes/no", "has_battery_accuracy", "%"],
                  ["Offer type", "offer_type_accuracy", "%"],
                ].map(([label, key, unit]) => (
                  <div key={key} className="flex flex-col">
                    <span className="text-[12px] text-ink-muted">{label}</span>
                    <span className="font-mono tabular">
                      {fmt(n(M, key), unit as "kWp" | "%")} → <b>{fmt(n(answered, key), unit as "kWp" | "%")}</b> {unit}
                    </span>
                  </div>
                ))}
              </div>
              <span className="text-[12px] text-ink-muted">All {nAll ? fmtInt(nAll) : ""} held-out homes, add-ons included; assumes the answer is right. One question is worth more than any model tweak.</span>
            </div>
          )}
          {!offline && transfer.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4">
              <span className="text-[13px] text-ink-body">Learned on one installer, tested on the other (solar size error where both chose PV)</span>
              {transfer.map(([name, preds]) => {
                const ours = n(preds[PREDICTORS.model], "pv_kwp_mae_when_both_pv");
                const base = n(preds[PREDICTORS.bandMedian], "pv_kwp_mae_when_both_pv");
                const better = ours != null && base != null && ours < base;
                return (
                  <div key={name} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                    <span className="font-mono text-ink-muted tabular">{name.replace("->", " → ")}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono tabular">{kwp(ours)} kWp</span>
                      <span className="text-ink-muted">vs {kwp(base)} band median</span>
                      <StatusBadge tone={better ? "success" : "warning"}>{better ? "Transfers" : "Weaker"}</StatusBadge>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {!offline && <details className="rounded-lg border border-border bg-surface-1 p-4">
            <summary className="cursor-pointer text-[13px] font-medium text-ink-body">All baselines</summary>
            <table className="mt-3 w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-left text-ink-muted">
                  <th scope="col" className="py-1 font-medium">Method</th>
                  <th scope="col" className="py-1 text-right font-medium">PV error</th>
                  <th scope="col" className="py-1 text-right font-medium">PV in range</th>
                  <th scope="col" className="py-1 text-right font-medium">Battery ±1 step</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular">
                {Object.entries(src.metrics as Record<string, MetricSet>).map(([name, m]) => (
                  <tr key={name} className={cn("border-t border-surface-2", name === PREDICTORS.model && "font-semibold text-ink")}>
                    <td className="py-1.5 font-sans">{name === PREDICTORS.model ? "Our engine" : name.replace("baseline_", "").replace(/_/g, " ")}</td>
                    <td className="py-1.5 text-right">{kwp(n(m, "pv_kwp_mae_all_projects"))}</td>
                    <td className="py-1.5 text-right">{pct(n(m, "pv_variant_hit_tolerant_pct"))} %</td>
                    <td className="py-1.5 text-right">{pct(n(m, "battery_within_one_step_pct"))} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>}
          <p className="m-0 text-[12px] leading-4 text-ink-muted">
            Test set: {nAll ? fmtInt(nAll) : "20 %"} homes ({Math.round(((evalRes.protocol?.test_size as number) ?? 0.2) * 100)} %), split{" "}
            {String(evalRes.protocol?.split ?? "by customer").replace(/\s*\(.*\)/, "").replace("grouped by customer_contact_id", "by customer")}, seed{" "}
            {String(evalRes.protocol?.seed ?? 42)}, locked before training. Labels: {evalRes.labels_source ?? "engine"}.
          </p>
        </section>
      </div>
    </main>
  );
}
