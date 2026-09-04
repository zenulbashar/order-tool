import type { HandoffLine } from "@/lib/agent-commerce/cart-handoff";
import { decodeCartHandoff, encodeCartHandoff } from "@/lib/agent-commerce/cart-handoff";

/**
 * Per-call conversation state, carried in the Gather action URL between
 * turns so the webhook stays stateless (no session store, nothing to leak
 * between calls). Bounded: a few recent turns and the working basket. It holds
 * no secrets and grants nothing — a tampered token can only change what the
 * model is reminded of. Pure.
 */

export type VoiceTurn = { role: "user" | "assistant"; content: string };
export type VoiceState = { turns: VoiceTurn[]; basket: HandoffLine[] };

export const MAX_TURNS = 8;
export const MAX_TURN_CHARS = 400;

export const EMPTY_VOICE_STATE: VoiceState = { turns: [], basket: [] };

function toBase64Url(json: string): string {
  return Buffer.from(json, "utf8").toString("base64url");
}

function fromBase64Url(token: string): string | null {
  try {
    return Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function encodeVoiceState(state: VoiceState): string {
  const turns = state.turns.slice(-MAX_TURNS).map((turn) => ({
    r: turn.role === "user" ? "u" : "a",
    c: turn.content.slice(0, MAX_TURN_CHARS),
  }));
  return toBase64Url(
    JSON.stringify({ t: turns, b: encodeCartHandoff(state.basket) }),
  );
}

export function decodeVoiceState(token: string | null): VoiceState {
  if (!token || token.length > 12_000) return EMPTY_VOICE_STATE;
  const json = fromBase64Url(token);
  if (json === null) return EMPTY_VOICE_STATE;
  try {
    const parsed = JSON.parse(json) as { t?: unknown; b?: unknown };
    const turns: VoiceTurn[] = Array.isArray(parsed.t)
      ? parsed.t
          .filter(
            (t): t is { r: string; c: string } =>
              !!t && typeof t === "object" && typeof (t as { c?: unknown }).c === "string",
          )
          .slice(-MAX_TURNS)
          .map((t) => ({
            role: t.r === "u" ? "user" : "assistant",
            content: t.c.slice(0, MAX_TURN_CHARS),
          }))
      : [];
    const basket = typeof parsed.b === "string" ? (decodeCartHandoff(parsed.b) ?? []) : [];
    return { turns, basket };
  } catch {
    return EMPTY_VOICE_STATE;
  }
}
