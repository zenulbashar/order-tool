import "server-only";

import { randomUUID } from "node:crypto";

import type { SupportChatPayload } from "./client";

/**
 * Local mock of the Foundry support API's /v1/chat stream, enabled by setting
 * SUPPORT_API_URL=mock. Emits the SAME wire format the real service will
 * (AI SDK UI Message Stream v1 — docs/ai-support-contract.md §3), so the
 * widget, the proxy route, and their parsing are fully exercisable before the
 * Foundry side exists. Deterministic canned replies; a message containing
 * "human" or "ticket" exercises the escalation event path.
 */

const DEPARTMENT_LABEL: Record<SupportChatPayload["department"], string> = {
  tech: "Tech Support",
  sales: "Sales",
  billing: "Billing",
};

function sseEvent(part: Record<string, unknown>): string {
  return `data: ${JSON.stringify(part)}\n\n`;
}

/** Split a reply into word-ish chunks so the client's delta handling is real. */
function chunks(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text];
}

export function mockChatStream(payload: SupportChatPayload): Response {
  const conversationId = payload.conversationId ?? `conv_mock_${randomUUID()}`;
  const wantsEscalation = /human|ticket|representative/i.test(payload.message);

  const reply = wantsEscalation
    ? "I've raised this with the team — one of our representatives will be with you shortly, and you'll get a reply by email."
    : `(Mock ${DEPARTMENT_LABEL[payload.department]}) Thanks — this is the built-in mock stream, so the wiring works end-to-end. Once the Foundry support service is live, real answers appear here. You asked: “${payload.message.slice(0, 140)}”`;

  const encoder = new TextEncoder();
  const textId = `txt_${randomUUID()}`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (part: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(sseEvent(part)));
      const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      send({ type: "start" });
      // First event of a (possibly new) conversation — the client stores this.
      send({ type: "data-meta", data: { conversationId } });
      send({ type: "text-start", id: textId });
      for (const piece of chunks(reply)) {
        send({ type: "text-delta", id: textId, delta: piece });
        await sleep(24);
      }
      send({ type: "text-end", id: textId });
      if (wantsEscalation) {
        send({
          type: "data-escalation",
          data: {
            ticketId: `tick_mock_${randomUUID()}`,
            summary: `Mock escalation from ${DEPARTMENT_LABEL[payload.department]}: ${payload.message.slice(0, 120)}`,
          },
        });
      }
      send({ type: "finish" });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-vercel-ai-ui-message-stream": "v1",
      "x-accel-buffering": "no",
    },
  });
}
