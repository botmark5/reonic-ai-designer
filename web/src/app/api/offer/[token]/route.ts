import { DEFAULT_INSTALLER, engine } from "@/lib/engine";
import { errorResponse } from "@/lib/api-route";
import { choiceAllowed, getOffer } from "@/lib/offer";
import { getStore } from "@/lib/store";

/**
 * POST /api/offer/:token
 *   { action: "variant", battery_kwh?, wallbox? } → the engine's design for that choice (only allowed values)
 *   { action: "accept", battery_kwh?, wallbox? }  → logs the homeowner's choice (overrides row, by "homeowner")
 */
export async function POST(req: Request, ctx: RouteContext<"/api/offer/[token]">) {
  try {
    const { token } = await ctx.params;
    const body = (await req.json()) as { action?: string; battery_kwh?: number; wallbox?: boolean };
    const offer = await getOffer(token);
    if (!offer) return Response.json({ error: "This offer link is not valid." }, { status: 404 });
    const choice = { battery_kwh: body.battery_kwh, wallbox: body.wallbox };
    if (!choiceAllowed(offer.allowed, choice)) return Response.json({ error: "Your installer did not offer this option." }, { status: 400 });

    if (body.action === "accept") {
      if (offer.designId)
        await getStore().addOverride({
          design_id: offer.designId, component: "homeowner.accept", from_value: null, to_value: choice,
          reason: "Homeowner accepted the offer", by: "homeowner",
        });
      return Response.json({ ok: true });
    }
    const locks = {
      ...offer.locks,
      ...(choice.battery_kwh !== undefined ? { battery_kwh: choice.battery_kwh } : {}),
      ...(choice.wallbox !== undefined ? { wallbox: choice.wallbox } : {}),
    };
    return Response.json(await engine.design({ installer: DEFAULT_INSTALLER, home: offer.home, locks }));
  } catch (e) {
    return errorResponse(e);
  }
}
