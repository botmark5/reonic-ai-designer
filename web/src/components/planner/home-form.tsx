"use client";

import { useId, useState } from "react";
import { Field, Segmented, Select, TextInput } from "@/components/ui/field";
import type { Home } from "@/lib/types";

const HEATING = ["Gas", "Oil", "Heat pump", "Electric", "District", "Wood"] as const;
const ROOF = ["Concrete tile", "Clay tile", "Metal", "Flat", "Slate"] as const;

const parseNum = (s: string) => {
  const n = Number(s.replace(/[\s,]/g, "").replace(/€|kwh|km/gi, ""));
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};
const show = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("en-US"));

/** Number input that commits on blur / Enter (not on every keystroke), so each commit is one engine run. */
function NumberField({
  label,
  value,
  onCommit,
  hint,
  min = 0,
  max,
  step,
  required,
}: {
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(show(value));
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(show(value));
  }
  const commit = () => {
    const n = parseNum(draft);
    if (n == null && required) return setError("Needed for a design.");
    if (n != null && (n < min || (max != null && n > max))) return setError(`Between ${show(min)} and ${show(max ?? null)}.`);
    setError(null);
    if (n !== value) onCommit(n == null ? null : step ? Math.round(n / step) * step : n);
    setDraft(show(n));
  };
  return (
    <Field label={label} htmlFor={id} hint={error ? <span className="text-critical-text">{error}</span> : hint}>
      <TextInput
        id={id}
        inputMode="decimal"
        value={draft}
        aria-invalid={!!error}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      />
    </Field>
  );
}

export function HomeForm({ home, onChange }: { home: Home; onChange: (patch: Partial<Home>) => void }) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4">
      <h2 id={`${id}-t`} className="text-label uppercase text-ink-muted">
        The home
      </h2>
      <NumberField
        label="Annual consumption (kWh)"
        value={home.annual_kwh}
        required
        max={100000}
        hint={home.annual_kwh === 4500 ? "4,500 is Reonic's default: confirm the real figure." : undefined}
        onCommit={(v) => onChange({ annual_kwh: v ?? 0 })}
      />
      <NumberField label="Electricity price (€/kWh)" value={home.price_eur_kwh} max={2} onCommit={(v) => onChange({ price_eur_kwh: v })} />
      <Field label="Household" htmlFor={`${id}-hh`}>
        <Select
          id={`${id}-hh`}
          value={home.inhabitants ?? ""}
          onChange={(e) => onChange({ inhabitants: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Not asked yet</option>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "1 person" : `${n} people`}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-col gap-1">
        <span className="text-label text-ink-muted" id={`${id}-ev`}>
          Electric car
        </span>
        <Segmented
          label="Electric car"
          value={home.has_ev ? "yes" : "no"}
          onChange={(v) => onChange(v === "yes" ? { has_ev: true, ev_km_year: home.ev_km_year ?? 15000 } : { has_ev: false })}
          options={[
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ]}
          className="self-start"
        />
      </div>
      {home.has_ev && (
        <NumberField label="Car: km per year" value={home.ev_km_year} max={100000} step={500} onCommit={(v) => onChange({ ev_km_year: v })} />
      )}
      <Field label="Heating" htmlFor={`${id}-heat`}>
        <Select id={`${id}-heat`} value={home.heating ?? ""} onChange={(e) => onChange({ heating: e.target.value || null })}>
          <option value="">Unknown</option>
          {HEATING.map((h) => (
            <option key={h}>{h}</option>
          ))}
        </Select>
      </Field>
      {(home.heating === "Gas" || home.heating === "Oil") && (
        <NumberField
          label="Heating demand (kWh / year)"
          value={home.heating_demand_kwh}
          max={200000}
          hint="Yearly gas or oil use. Sizes the heat pump option."
          onCommit={(v) => onChange({ heating_demand_kwh: v })}
        />
      )}
      <Field label="Roof" htmlFor={`${id}-roof`}>
        <Select id={`${id}-roof`} value={home.roof_type ?? ""} onChange={(e) => onChange({ roof_type: e.target.value || null })}>
          <option value="">Unknown</option>
          {ROOF.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
      </Field>
      <details className="group">
        <summary className="cursor-pointer list-none text-[13px] font-medium text-ink-body hover:text-ink">
          <span className="inline-block transition-transform duration-150 group-open:rotate-90" aria-hidden>
            ›
          </span>{" "}
          Already installed
          {(home.existing_pv_kwp || home.existing_battery_kwh) && <span className="ml-1 text-ink-muted">· set</span>}
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <NumberField label="Existing solar (kWp)" value={home.existing_pv_kwp} max={100} onCommit={(v) => onChange({ existing_pv_kwp: v })} />
          <NumberField label="Existing battery (kWh)" value={home.existing_battery_kwh} max={100} onCommit={(v) => onChange({ existing_battery_kwh: v })} />
        </div>
      </details>
    </section>
  );
}
