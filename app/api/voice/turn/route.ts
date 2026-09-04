import { encodeCartHandoff } from "@/lib/agent-commerce/cart-handoff";
import { summariseHours } from "@/lib/agent-commerce/hours";
import { validateOrderRequest } from "@/lib/agent-commerce/order-request";
import { reportError } from "@/lib/observability";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendSms, smsConfigured } from "@/lib/sms";
import { getBaseUrl } from "@/lib/url";
import { runVoiceTurn } from "@/lib/voice/agent";
import { decodeVoiceState, encodeVoiceState, type VoiceState } from "@/lib/voice/state";
import { gatherTwiml, hangupTwiml } from "@/lib/voice/twiml";
import { loadVoiceVenue, readVoiceRequest } from "@/lib/voice/webhook";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * One spoken turn of a phone call (Twilio Gather → here). Signature-verified.
 * The agent answers from the venue's public data; when the caller finishes an
 * order, the basket is validated against the live menu exactly like the MCP
 * start_order tool and a checkout link is TEXTED to the caller — payment and
 * the order itself happen on the storefront, never on the call.
 */

function twiml(xml: string): Response {
  return new Response(xml, { headers: { "content-type": "text/xml; charset=utf-8" } });
}

export async function POST(request: Request): Promise<Response> {
  const read = await readVoiceRequest(request, "/api/voice/turn");
  if (!read.ok) return new Response(read.reason, { status: read.status });
  const { voice } = read;

  const limit = await checkRateLimit("voiceCaller", voice.from || "unknown");
  if (!limit.success) {
    return twiml(hangupTwiml(["Sorry, please try again a little later."]));
  }

  const loaded = await loadVoiceVenue(voice.to);
  if (!loaded) {
    return twiml(hangupTwiml(["Sorry, this number isn't set up for phone ordering. Goodbye."]));
  }
  const { venue, menu, faqs } = loaded;
  const state = decodeVoiceState(new URL(request.url).searchParams.get("state"));

  if (!voice.transcript) {
    return twiml(
      gatherTwiml(
        ["Sorry, I didn't catch that. What would you like?"],
        `/api/voice/turn?state=${encodeVoiceState(state)}`,
      ),
    );
  }

  const address = [venue.streetAddress, venue.suburb, venue.state, venue.postcode]
    .filter(Boolean)
    .join(", ");
  const output = await runVoiceTurn({
    venue: {
      name: venue.name,
      description: venue.storefrontDescription,
      address: address || null,
      acceptsOrders: venue.acceptsOrders,
    },
    menu,
    faqs,
    hours: summariseHours(venue.openingHours, venue.timezone, new Date()),
    state,
    transcript: voice.transcript,
  });

  const lines: string[] = [output.reply];
  let basket = output.basket.length > 0 ? output.basket : state.basket;
  let hangUp = output.hangUp;

  if (output.sendLink && venue.acceptsOrders) {
    // Validate exactly as start_order does; a basket the storefront would
    // refuse is never texted. Prices come from the live menu, never the model.
    const validated = validateOrderRequest(menu, basket);
    if (!validated.ok) {
      lines.push("Let me check that order once more. What would you like?");
      hangUp = false;
    } else if (!smsConfigured()) {
      lines.push(
        `I can't text right now. You can order online at ${new URL(await getBaseUrl()).host} slash ${venue.slug}.`,
      );
    } else {
      const url = `${await getBaseUrl()}/${venue.slug}/menu?cart=${encodeCartHandoff(validated.lines)}`;
      try {
        await sendSms(
          voice.from,
          `${venue.name}: review and pay for your pickup order here — ${url}`,
        );
        lines.push("I've texted a secure link to this number to review and pay. Nothing is placed until you pay.");
        basket = [];
      } catch (error) {
        await reportError(error, { context: "voice.checkout-sms", tags: { venue_id: venue.id } });
        lines.push("I couldn't send the text just now. Please try again in a moment.");
        hangUp = false;
      }
    }
  }

  const nextState: VoiceState = {
    turns: [
      ...state.turns,
      { role: "user", content: voice.transcript },
      { role: "assistant", content: output.reply },
    ],
    basket,
  };
  if (hangUp) return twiml(hangupTwiml([...lines, "Thanks for calling. Goodbye."]));
  return twiml(gatherTwiml(lines, `/api/voice/turn?state=${encodeVoiceState(nextState)}`));
}
