import { encodeVoiceState, EMPTY_VOICE_STATE } from "@/lib/voice/state";
import { gatherTwiml, hangupTwiml } from "@/lib/voice/twiml";
import { loadVoiceVenue, readVoiceRequest } from "@/lib/voice/webhook";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * AI phone ordering — the number's Voice webhook (Twilio → here on every
 * inbound call). Signature-verified. Greets the caller and starts listening;
 * each spoken turn is then POSTed to /api/voice/turn with the call state in
 * the URL. No audio streaming, no realtime model: Twilio does speech-to-text
 * and text-to-speech, and the agent answers between turns.
 */

function twiml(xml: string, status = 200): Response {
  return new Response(xml, { status, headers: { "content-type": "text/xml; charset=utf-8" } });
}

export async function POST(request: Request): Promise<Response> {
  const read = await readVoiceRequest(request, "/api/voice/incoming");
  if (!read.ok) return new Response(read.reason, { status: read.status });
  const { voice } = read;

  const limit = await checkRateLimit("voiceCaller", voice.from || "unknown");
  if (!limit.success) {
    return twiml(hangupTwiml(["Sorry, please try again a little later."]));
  }

  const loaded = await loadVoiceVenue(voice.to);
  if (!loaded) {
    return twiml(
      hangupTwiml(["Sorry, this number isn't set up for phone ordering yet. Goodbye."]),
    );
  }
  const { venue } = loaded;
  const greeting = venue.acceptsOrders
    ? `Hi, you've reached ${venue.name}. I can answer questions or take a pickup order. How can I help?`
    : `Hi, you've reached ${venue.name}. I can answer questions about the menu and opening hours. How can I help?`;
  return twiml(
    gatherTwiml([greeting], `/api/voice/turn?state=${encodeVoiceState(EMPTY_VOICE_STATE)}`),
  );
}
