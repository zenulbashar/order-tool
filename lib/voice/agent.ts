import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import type { PublicFaq, PublicMenu } from "@/app/[slug]/types";
import { buildMenuContext } from "@/lib/agent-commerce/menu-context";
import type { HoursSummary } from "@/lib/agent-commerce/hours";
import { getAnthropic, MENU_COPY_MODEL } from "@/lib/anthropic";

import {
  buildVenueContext,
  parseVoiceAgentOutput,
  VOICE_AGENT_PROMPT,
  VOICE_AGENT_SCHEMA,
  VOICE_FALLBACK,
  type VoiceAgentOutput,
} from "./agent-core";
import type { VoiceState } from "./state";

/**
 * One turn of the phone conversation: the caller's transcript plus the recent
 * turns and the working basket go to Haiku, grounded in the prompt-cached
 * venue + menu context, with a forced JSON reply. Any failure — network, key
 * missing, refusal, malformed output — becomes the spoken fallback, never a
 * dropped call.
 */
export async function runVoiceTurn(input: {
  venue: {
    name: string;
    description: string | null;
    address: string | null;
    acceptsOrders: boolean;
  };
  menu: PublicMenu;
  faqs: PublicFaq[];
  hours: HoursSummary;
  state: VoiceState;
  transcript: string;
}): Promise<VoiceAgentOutput> {
  const conversation: Anthropic.MessageParam[] = [];
  for (const turn of input.state.turns) {
    if (conversation.length === 0 && turn.role !== "user") continue;
    conversation.push({ role: turn.role, content: turn.content });
  }
  const basketNote =
    input.state.basket.length > 0
      ? `\n\n[Working basket so far: ${JSON.stringify(input.state.basket)}]`
      : "";
  conversation.push({ role: "user", content: input.transcript + basketNote });

  let message: Anthropic.Message;
  try {
    message = await getAnthropic().messages.create({
      model: MENU_COPY_MODEL,
      max_tokens: 600,
      system: [
        { type: "text", text: VOICE_AGENT_PROMPT },
        {
          type: "text",
          text: `${buildVenueContext({ ...input.venue, hours: input.hours, faqs: input.faqs })}\n\n${buildMenuContext(input.menu)}`,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      output_config: { format: { type: "json_schema", schema: VOICE_AGENT_SCHEMA } },
      messages: conversation,
    });
  } catch {
    return VOICE_FALLBACK;
  }
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") {
    return VOICE_FALLBACK;
  }
  const textBlock = message.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock) return VOICE_FALLBACK;
  let json: unknown;
  try {
    json = JSON.parse(textBlock.text);
  } catch {
    return VOICE_FALLBACK;
  }
  return parseVoiceAgentOutput(json) ?? VOICE_FALLBACK;
}
