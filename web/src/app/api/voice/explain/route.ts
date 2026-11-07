import { after } from "next/server";
import { handleExplain, voiceDeps } from "../../../../lib/voice";

/** Homeowner offer summary (~45 s); audio only when VOICE_TTS_ENABLED=true. */
export const maxDuration = 30; // room for after() work (late engine answer)

export async function POST(req: Request) {
  return handleExplain(req, voiceDeps(after));
}
