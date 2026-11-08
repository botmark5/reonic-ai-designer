/** Planner display text: pure helpers, tested in text.test.ts. */

const norm = (clause: string) => clause.trim().replace(/[.\s]+$/, "").toLowerCase();

/**
 * Engine reasons as the card shows them: "[mock]" tag removed, clauses repeated within or across reasons dropped
 * (the engine can say "the installer's catalogue speaks for 10 kWh" three times), at most `max` shown by default.
 */
export function cardReasons(reasons: string[], max = 2): { shown: string[]; more: string[] } {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of reasons) {
    const text = raw.replace(/^\[mock\]\s*/, "").trim();
    if (!text) continue;
    const kept = text.split(/;\s+/).filter((c) => {
      const k = norm(c);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (!kept.length) continue;
    let joined = kept.map((c) => c.trim()).join("; ");
    if (/[.!?]$/.test(text) && !/[.!?]$/.test(joined)) joined += ".";
    out.push(joined);
  }
  return { shown: out.slice(0, max), more: out.slice(max) };
}

/** Header and inbox title: the call's name, else its address; "Unnamed home" only for a blank manual home. */
export function homeTitle(row: { customer_name: string | null; address: string | null; source: string }): string {
  const name = row.customer_name?.trim();
  if (name) return name;
  const address = row.address?.trim();
  if (address) return address;
  return row.source === "voice" ? "Draft from a call" : "Unnamed home";
}
