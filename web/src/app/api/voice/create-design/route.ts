import { after } from "next/server";
import { handleCreateDesign, voiceDeps } from "../../../../lib/voice";

/** ElevenLabs agent server tool create_design (header x-agent-token). Answers within ~3 s with { instruction }. */
export const maxDuration = 30; // room for after() work (late engine answer)

export async function POST(req: Request) {
  return handleCreateDesign(req, voiceDeps(after));
}
