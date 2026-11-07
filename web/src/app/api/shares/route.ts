import { errorResponse } from "@/lib/api-route";
import { getStore } from "@/lib/store";

/** POST /api/shares { design_id, allowed_variants } → { token, path } for /offer/[token]. Marks the design as sent. */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { design_id?: string; allowed_variants?: unknown[] };
    if (!b.design_id) return Response.json({ error: "design_id is required." }, { status: 400 });
    const store = getStore();
    const share = await store.createShare(b.design_id, b.allowed_variants ?? []);
    await store.updateDesign(b.design_id, { status: "sent" });
    return Response.json({ ...share, path: `/offer/${share.token}` }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
