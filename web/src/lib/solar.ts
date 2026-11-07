/**
 * Google Geocoding + Solar API (buildingInsights:findClosest) → a small roof summary.
 * Server-only (uses GOOGLE_MAPS_API_KEY). Never throws: every failure is a status the caller can show or ignore.
 * Results are cached in memory per server instance (24 h; failures 10 min).
 */
import "server-only";

export interface RoofSegment {
  pitch_deg: number;
  azimuth_deg: number; // compass: 180 = south
  area_m2: number;
}

export type SolarResult =
  | {
      status: "ok";
      address: string;
      lat: number;
      lng: number;
      segments: RoofSegment[];
      max_panels: number;
      panel_watts: number;
      sunshine_hours_year: number;
      imagery_quality: string;
      imagery_date: string | null;
    }
  | { status: "not_covered" | "not_found" | "no_key" | "error"; reason: string; lat?: number; lng?: number };

export interface SolarOptions {
  key?: string; // defaults to process.env.GOOGLE_MAPS_API_KEY
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

const DAY_MS = 24 * 3600 * 1000;
const FAIL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; ttl: number; value: SolarResult }>();

export function clearSolarCache() {
  cache.clear();
}

const cacheKey = (address: string) => address.trim().toLowerCase().replace(/\s+/g, " ").replace(/\s*,\s*/g, ",");

export async function lookupSolar(address: string, opts: SolarOptions = {}): Promise<SolarResult> {
  const key = opts.key ?? process.env.GOOGLE_MAPS_API_KEY ?? "";
  if (!key) return { status: "no_key", reason: "GOOGLE_MAPS_API_KEY is not set." };
  const k = cacheKey(address);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value;

  let value: SolarResult;
  try {
    value = await fetchSolar(address, key, opts.fetch ?? fetch, opts.signal);
  } catch (e) {
    if (opts.signal?.aborted) return { status: "error", reason: "Timed out." };
    value = { status: "error", reason: e instanceof Error ? e.message : "Solar lookup failed." };
  }
  cache.set(k, { at: Date.now(), ttl: value.status === "ok" ? DAY_MS : FAIL_MS, value });
  return value;
}

async function fetchSolar(address: string, key: string, f: typeof fetch, signal?: AbortSignal): Promise<SolarResult> {
  const geoUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  geoUrl.searchParams.set("address", address);
  geoUrl.searchParams.set("region", "de");
  geoUrl.searchParams.set("key", key);
  const geo = await (await f(geoUrl, { signal })).json();
  if (geo?.status === "ZERO_RESULTS") return { status: "not_found", reason: "Address not found." };
  if (geo?.status !== "OK" || !geo.results?.length)
    return { status: "error", reason: `Geocoding failed (${geo?.status ?? "no status"}).` };
  const { lat, lng } = geo.results[0].geometry.location as { lat: number; lng: number };

  const solarUrl = new URL("https://solar.googleapis.com/v1/buildingInsights:findClosest");
  solarUrl.searchParams.set("location.latitude", String(lat));
  solarUrl.searchParams.set("location.longitude", String(lng));
  solarUrl.searchParams.set("requiredQuality", "LOW");
  solarUrl.searchParams.set("key", key);
  const res = await f(solarUrl, { signal });
  if (res.status === 404) return { status: "not_covered", reason: "Google Solar has no data for this building.", lat, lng };
  if (!res.ok) return { status: "error", reason: `Solar API failed (${res.status}).`, lat, lng };
  const b = await res.json();
  const p = b.solarPotential ?? {};
  const d = b.imageryDate;
  return {
    status: "ok",
    address: geo.results[0].formatted_address ?? address,
    lat: b.center?.latitude ?? lat,
    lng: b.center?.longitude ?? lng,
    segments: (p.roofSegmentStats ?? []).map((s: { pitchDegrees?: number; azimuthDegrees?: number; stats?: { areaMeters2?: number } }) => ({
      pitch_deg: s.pitchDegrees ?? 0,
      azimuth_deg: s.azimuthDegrees ?? 0,
      area_m2: s.stats?.areaMeters2 ?? 0,
    })),
    max_panels: p.maxArrayPanelsCount ?? 0,
    panel_watts: p.panelCapacityWatts ?? 0,
    sunshine_hours_year: Math.round(p.maxSunshineHoursPerYear ?? 0),
    imagery_quality: b.imageryQuality ?? "UNKNOWN",
    imagery_date: d ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}` : null,
  };
}

/** Orientation and tilt of the largest roof face (whole degrees), or null. */
export function roofFromSolar(s: SolarResult): { orientation_deg: number; tilt_deg: number } | null {
  if (s.status !== "ok" || !s.segments.length) return null;
  const big = s.segments.reduce((a, b) => (b.area_m2 > a.area_m2 ? b : a));
  return { orientation_deg: Math.round(big.azimuth_deg) % 360, tilt_deg: Math.round(big.pitch_deg) };
}

/** GET /api/solar?address=… — always 200 with a SolarResult, 400 only without an address. */
export async function handleSolarRequest(req: Request, opts: SolarOptions = {}): Promise<Response> {
  const address = new URL(req.url).searchParams.get("address")?.trim();
  if (!address) return Response.json({ error: "address is required" }, { status: 400 });
  return Response.json(await lookupSolar(address, opts));
}
