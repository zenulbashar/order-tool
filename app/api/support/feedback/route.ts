import { z } from "zod";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  MOCK_SENTINEL,
  getSupportApiUrl,
  postSupportFeedback,
} from "@/lib/support/client";
import { getCurrentVenue } from "@/lib/tenant";

export const runtime = "nodejs";

/**
 * End-of-chat feedback proxy (docs/ai-support-contract.md §8) — same auth +
 * tenancy discipline as /api/support/chat; Foundry stores the CSAT record
 * against the conversation. Best-effort from the widget's point of view: in
 * mock mode it simply acknowledges, and a Foundry failure is reported without
 * blocking the "chat ended" flow.
 */
const feedbackInputSchema = z.object({
  conversationId: z.string().min(1).max(128),
  rating: z.enum(["good", "bad"]),
  reason: z.string().trim().max(120).optional(),
  comment: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const venue = await getCurrentVenue();
  if (!venue) {
    return Response.json({ error: "no_venue" }, { status: 403 });
  }

  let input: z.infer<typeof feedbackInputSchema>;
  try {
    input = feedbackInputSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  // Shares the chat bucket — feedback is one cheap call per conversation.
  const limit = await checkRateLimit(
    "aiSupport",
    `${venue.id}:${session.user.id}`,
  );
  if (!limit.success) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const base = getSupportApiUrl();
  if (!base) {
    return Response.json({ error: "support_offline" }, { status: 503 });
  }
  if (base === MOCK_SENTINEL) {
    return Response.json({ ok: true });
  }

  try {
    await postSupportFeedback(
      venue.id,
      {
        role: "owner",
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      {
        conversationId: input.conversationId,
        rating: input.rating,
        reason: input.reason || undefined,
        comment: input.comment || undefined,
      },
    );
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "support_unavailable" }, { status: 502 });
  }
}
