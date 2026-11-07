import { runAgent, type AgentEvent, type AgentInput } from "@/lib/agent";

/**
 * POST /api/agent { text, home, locks, response } → NDJSON stream of AgentEvent:
 * text deltas, tool steps, intermediate designs, then { type: "done", summary, home, locks, response }.
 */
export async function POST(req: Request) {
  let input: AgentInput;
  try {
    input = (await req.json()) as AgentInput;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!input?.text?.trim() || !input.home) return Response.json({ error: "text and home are required." }, { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        await runAgent({ ...input, text: input.text.slice(0, 2000) }, emit, req.signal);
      } catch (e) {
        emit({ type: "error", message: (e as Error).message || "The designer could not update the design." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
