import { connection } from "next/server";
import { engine } from "@/lib/engine";
import { errorResponse } from "@/lib/api-route";

/** GET /api/engine/project/:id → one held-out project: home, expert variants, our design. */
export async function GET(_req: Request, ctx: RouteContext<"/api/engine/project/[id]">) {
  await connection();
  try {
    const { id } = await ctx.params;
    return Response.json(await engine.project(id));
  } catch (e) {
    return errorResponse(e);
  }
}
