/**
 * POST /api/intake: the typed twin of the voice agent's create_design. The answers (voice-agent field names) go
 * through the SAME normaliseFacts and Google-roof step as a call, then the engine designs. Nothing is stored here:
 * the page saves the draft through /api/designs once the planner finishes, so /live never mistakes a typed intake
 * for an incoming call. No LLM is involved; the engine picks every size.
 */
import { DEFAULT_INSTALLER } from "./engine";
import type { SolarResult } from "./solar";
import { EMPTY_LOCKS, type DesignResponse, type Home } from "./types";
import { applyGoogleRoof, hasUsageFacts, normaliseFacts, withTimeout, type VoiceDeps, type VoiceFacts } from "./voice";

const SOLAR_MS = 4000; // the roof is looked up once per address (lookupSolar caches it), so the first answer may wait
const ENGINE_MS = 8000;
const MAX_BODY_FIELDS = 30;

export interface IntakeReply {
  facts: VoiceFacts;
  home: Home;
  assumptions: string[];
  /** Enough to draft without inventing the household's use (use, bill or household size given). */
  ready: boolean;
  design: DesignResponse | null;
  /** Set when `ready` but the engine failed or took longer than 8 s. */
  design_error?: string;
  solar: SolarResult | null;
}

export async function intakePreview(answers: Record<string, unknown>, deps: Pick<VoiceDeps, "design" | "solar" | "installer">): Promise<IntakeReply> {
  const { facts, home, assumptions } = normaliseFacts(answers);
  const solar = facts.address ? await withTimeout(deps.solar(facts.address), SOLAR_MS, "intake solar") : null;
  applyGoogleRoof(home, solar, assumptions);
  const ready = hasUsageFacts(answers);
  if (!ready) return { facts, home, assumptions, ready, design: null, solar };
  // withTimeout turns a failure or a timeout into null (logged); the page then says the planner drafts it
  const design = await withTimeout(deps.design({ installer: deps.installer || DEFAULT_INSTALLER, home, locks: EMPTY_LOCKS }), ENGINE_MS, "intake engine");
  const design_error = design ? undefined : "engine_unavailable";
  return { facts, home, assumptions, ready, design, ...(design_error ? { design_error } : {}), solar };
}

export async function handleIntake(req: Request, deps: Pick<VoiceDeps, "design" | "solar" | "installer">): Promise<Response> {
  let body: { answers?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const answers = body?.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers) || Object.keys(answers).length > MAX_BODY_FIELDS) {
    return Response.json({ error: "answers must be an object of facts" }, { status: 400 });
  }
  return Response.json(await intakePreview(answers as Record<string, unknown>, deps));
}
