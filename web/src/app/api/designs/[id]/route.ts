import { connection } from "next/server";
import { engine, DEFAULT_INSTALLER } from "@/lib/engine";
import { errorResponse } from "@/lib/api-route";
import { getStore, type DesignPatch } from "@/lib/store";

/** GET /api/designs/:id → the row; runs the engine first if the row has no design yet (e.g. fresh from a call). */
export async function GET(_req: Request, ctx: RouteContext<"/api/designs/[id]">) {
  await connection();
  try {
    const { id } = await ctx.params;
    const store = getStore();
    const row = await store.getDesign(id);
    if (!row) return Response.json({ error: "Design not found." }, { status: 404 });
    if (!row.design || row.design.served?.source === "offline") {
      const design = await engine.design({ installer: DEFAULT_INSTALLER, home: row.home, locks: row.locks });
      return Response.json((await store.updateDesign(id, { design })) ?? { ...row, design });
    }
    return Response.json(row);
  } catch (e) {
    return errorResponse(e);
  }
}

const EDITABLE = ["home", "locks", "design", "status", "explanation", "customer_name", "address"] as const;

/** PATCH /api/designs/:id → saves the planner's current state. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/designs/[id]">) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as Record<string, unknown>;
    const patch = Object.fromEntries(EDITABLE.filter((k) => k in body).map((k) => [k, body[k]])) as DesignPatch;
    const row = await getStore().updateDesign(id, patch);
    return row ? Response.json(row) : Response.json({ error: "Design not found." }, { status: 404 });
  } catch (e) {
    return errorResponse(e);
  }
}
