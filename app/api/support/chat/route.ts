import { z } from "zod";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  MOCK_SENTINEL,
  SupportApiError,
  getSupportApiUrl,
  postSupportChat,
} from "@/lib/support/client";
import { mockChatStream } from "@/lib/support/mock";
import { getCurrentVenue } from "@/lib/tenant";

// node:crypto (identity signing) + the Neon pool — keep off the Edge runtime.
export const runtime = "nodejs";
// Room for a long streamed reply; the connect phase is separately bounded in
// the client (15s), and Vercel requires first bytes well inside 25s.
export const maxDuration = 120;

/**
 * Owner support chat — the thin BFF proxy to the Foundry support API
 * (docs/ai-support-chat-plan.md §4 P1). This route owns auth, tenancy, and
 * rate limiting, then PIPES the SSE stream through untouched:
 *
 *  - identity: the Auth.js session + getCurrentVenue() (the IDOR gate); the
 *    verified identity is minted into a short-lived Ed25519 token per request
 *    — the client can never name its own tenant;
 *  - rate limit: `aiSupport`, keyed venue+user (fail-open house contract);
 *  - transport: fetch POST in, `text/event-stream` out (AI SDK UI Message
 *    Stream v1). Consumers read it with fetch + ReadableStream, NOT
 *    EventSource (GET-only, no auth headers).
 *
 * When SUPPORT_API_URL is unset the route answers 503 (the widget renders a
 * "support is offline" state); the literal value "mock" serves the built-in
 * mock stream so the whole path works before Foundry exists.
 */

const chatInputSchema = z.object({
  conversationId: z.string().min(1).max(128).nullable().optional(),
  department: z.enum(["tech", "sales", "billing"]),
  message: z.string().trim().min(1).max(2000),
});

const STREAM_HEADERS: Record<string, string> = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  "x-vercel-ai-ui-message-stream": "v1",
  "x-accel-buffering": "no",
};

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const venue = await getCurrentVenue();
  if (!venue) {
    return Response.json({ error: "no_venue" }, { status: 403 });
  }

  let input: z.infer<typeof chatInputSchema>;
  try {
    input = chatInputSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  const limit = await checkRateLimit(
    "aiSupport",
    `${venue.id}:${session.user.id}`,
  );
  if (!limit.success) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const payload = {
    conversationId: input.conversationId ?? null,
    department: input.department,
    message: input.message,
  };

  const base = getSupportApiUrl();
  if (!base) {
    // Not configured — the widget shows its "support is offline" state.
    return Response.json({ error: "support_offline" }, { status: 503 });
  }
  if (base === MOCK_SENTINEL) {
    return mockChatStream(payload);
  }

  try {
    const upstream = await postSupportChat(
      venue.id,
      {
        role: "owner",
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      payload,
    );
    // Pipe the SSE body through untouched; our headers re-assert no-buffering
    // at this hop. The upstream connect timeout was already cleared.
    return new Response(upstream.body, { status: 200, headers: STREAM_HEADERS });
  } catch (error) {
    // Scrubbed: status only, never upstream bodies/tokens.
    const status =
      error instanceof SupportApiError && error.status === 429 ? 429 : 502;
    return Response.json({ error: "support_unavailable" }, { status });
  }
}
