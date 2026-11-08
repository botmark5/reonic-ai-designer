import { after } from "next/server";
import { handleUpdateFacts, voiceDeps } from "../../../../lib/voice";

export const maxDuration = 30; // after(): Google roof lookup for a new address

export async function POST(req: Request) {
  return handleUpdateFacts(req, voiceDeps(after));
}
