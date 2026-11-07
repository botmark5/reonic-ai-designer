import { errorResponse } from "@/lib/api-route";
import { defaultAllowed } from "@/lib/offer";
import { getStore } from "@/lib/store";

/**
 * POST /api/shares { design_id } → { token, path } for /offer/[token]. Marks the design as sent.
 * Allowed variants are computed here from the engine's alternatives (client values are ignored).
 */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { design_id?: string };
    if (!b.design_id) return Response.json({ error: "design_id is required." }, { status: 400 });
    const store = getStore();
    const row = await store.getDesign(b.design_id);
    if (!row?.design) return Response.json({ error: "Design not found." }, { status: 404 });
    const share = await store.createShare(b.design_id, defaultAllowed(row.design));
    await store.updateDesign(b.design_id, { status: "sent" });
    return Response.json({ ...share, path: `/offer/${share.token}` }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
