import { after } from "next/server";
import { handlePostCall, voiceDeps } from "../../../../lib/voice";

/** ElevenLabs post-call webhook (HMAC on the raw body): stores transcript, summary and collected facts. */
export const maxDuration = 30; // room for after() work (late engine answer)

export async function POST(req: Request) {
  return handlePostCall(req, voiceDeps(after));
}
