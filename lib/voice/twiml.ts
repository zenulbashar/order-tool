/**
 * TwiML rendering for the phone agent. One voice, one language, and the only
 * two shapes the flow needs: "say something and listen" (Gather with speech
 * input) and "say something and hang up". Everything spoken is escaped, so a
 * menu item called "Fish & chips" or a model reply containing "<" can never
 * break the XML or inject a verb. Pure.
 */

export const VOICE_NAME = "Polly.Olivia-Neural";
export const VOICE_LANGUAGE = "en-AU";

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function say(text: string): string {
  return `<Say voice="${VOICE_NAME}" language="${VOICE_LANGUAGE}">${escapeXml(text)}</Say>`;
}

/** Say the lines, then listen for speech and POST the transcript to `action`. */
export function gatherTwiml(lines: string[], action: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    `<Gather input="speech" language="${VOICE_LANGUAGE}" speechTimeout="auto" actionOnEmptyResult="true" action="${escapeXml(action)}" method="POST">` +
    lines.map(say).join("") +
    `</Gather>` +
    say("Sorry, I didn't catch that. Goodbye.") +
    `<Hangup/></Response>`
  );
}

/** Say the lines and end the call. */
export function hangupTwiml(lines: string[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    lines.map(say).join("") +
    `<Hangup/></Response>`
  );
}
