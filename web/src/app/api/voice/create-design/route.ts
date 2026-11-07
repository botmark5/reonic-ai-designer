import { after } from "next/server";
import { handleCreateDesign, voiceDeps } from "../../../../lib/voice";

/** ElevenLabs agent server tool create_design (header x-agent-token). Answers within ~3 s with { instruction }. */
export const maxDuration = 60; // room for after() work (late engine answer + one retry)

export async function POST(req: Request) {
  return handleCreateDesign(req, voiceDeps(after));
}
