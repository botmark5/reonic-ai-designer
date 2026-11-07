import { Suspense } from "react";
import { connection } from "next/server";
import { EXAMPLE_DESIGN_REQUEST, engine } from "@/lib/engine";
import { ServedBadge } from "@/components/ui/served-badge";

/** Placeholder planner page. The real planner screen lands in milestone 2. */
export default function Home() {
  return (
    <Suspense fallback={<main className="flex-1" />}>
      <Placeholder />
    </Suspense>
  );
}

async function Placeholder() {
  await connection();
  const res = await engine.design({ ...EXAMPLE_DESIGN_REQUEST, home: { ...EXAMPLE_DESIGN_REQUEST.home, annual_kwh: 4800, has_ev: true, ev_km_year: 15000, inhabitants: 4 } });
  const d = res.design;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 md:px-6">
      <p className="flex items-center gap-2 text-label uppercase text-ink-muted">
        {res.served?.source === "engine" ? `Engine ${res.model_version}` : <ServedBadge served={res.served} />}
      </p>
      <h1 className="mt-3 text-h1">Familie Weber, Augsburg</h1>
      <p className="mt-2 text-body text-ink-body">4,800 kWh a year, gas heating, buying an EV.</p>
      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Solar", d.pv.include ? `${d.pv.kwp?.toFixed(1)} kWp` : "none", "bg-comp-pv"],
          ["Battery", d.battery.include ? `${d.battery.kwh} kWh` : "none", "bg-comp-battery"],
          ["Wallbox", d.wallbox.include ? `${d.wallbox.kw ?? 11} kW` : "none", "bg-comp-wallbox"],
          ["Heat pump", d.heatpump.include ? `${d.heatpump.kw} kW` : "none", "bg-comp-heatpump"],
        ].map(([label, value, dot]) => (
          <div key={label} className="rounded-md border border-border bg-surface-1 p-4">
            <dt className="flex items-center gap-2 text-label uppercase text-ink-muted">
              <span className={`size-2 rounded-full ${dot}`} aria-hidden />
              {label}
            </dt>
            <dd className="mt-3 font-mono text-h3 font-medium tabular">{value}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
