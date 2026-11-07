import { getEngine } from "@/lib/engine";

/** Placeholder planner page (milestone 1). The real planner screen lands in milestone 2. */
export default async function Home() {
  const engine = getEngine();
  const res = await engine.design({
    installer: "2a8ba8e2",
    home: {
      annual_kwh: 4500, price_eur_kwh: 0.32, load_profile: "H0", has_ev: true, ev_km_year: 15000,
      existing_pv_kwp: null, existing_battery_kwh: null, heating: "Gas", heating_demand_kwh: null,
      roof_type: null, house_sqm: null, inhabitants: null,
    },
    locks: { pv_kwp: null, battery_kwh: null, wallbox: null, heatpump_kw: null },
  });
  const d = res.design;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 md:px-6">
      <p className="text-label uppercase text-ink-muted">Engine: {engine.mode === "mock" ? "mock (ENGINE_URL unset)" : "live"}</p>
      <h1 className="mt-3 text-h1">Familie Weber, Augsburg</h1>
      <p className="mt-2 text-body text-ink-body">4,500 kWh a year, gas heating, buying an EV.</p>
      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Solar", d.pv.include ? `${d.pv.kwp?.toFixed(1)} kWp` : "none", "bg-comp-pv"],
          ["Battery", d.battery.include ? `${d.battery.kwh} kWh` : "none", "bg-comp-battery"],
          ["Wallbox", d.wallbox.include ? `${d.wallbox.kw} kW` : "none", "bg-comp-wallbox"],
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
