# Foundry Support API — Contract v1

> **Audience: the Agents repo ("Foundry", `zenulbashar/Agents`).** This is the
> complete spec for the new **`services/support_api`** service that Foundry
> implements. prompt2eat (and later Roster / Zale IT) consume it as clients.
> Paste this doc into a Claude session in the Agents repo as the build brief.
> The prompt2eat-side design is `docs/ai-support-chat-plan.md` (same repo as
> this file); the two docs share decision numbering (D1–D6).

## 0. Summary

A **FastAPI** service exposing a versioned support-chat API:

- `POST /v1/chat` — streamed AI replies (SSE, AI SDK "UI Message Stream" shape)
- `GET  /v1/conversations/{id}` — transcript re-fetch (widget reopen/resume)
- `POST /v1/feedback` — end-of-chat CSAT
- Outbound webhook → each client app (`ticket.created`, `ticket.replied`)

Foundry is the **system of record for conversations** (D2), serving multiple
apps with hard `app_id` + `tenant_id` isolation. There are **no live human
agents** (D5): the agent answers, and anything it can't handle becomes a
**ticket** delivered to the operator via Foundry's existing `services/telegram`.

## 1. Service shape & deployment (D3)

- **Stack (all free OSS):** FastAPI + uvicorn, Postgres, Caddy (TLS),
  Docker Compose (the repo already has `docker/`). Runs on a small VPS;
  interim $0 = Mac Mini behind a Cloudflare Tunnel.
- **Streaming config:** responses `text/event-stream`, `Cache-Control:
  no-cache`; disable proxy buffering end-to-end (Caddy: `flush_interval -1`;
  if nginx ever fronts it: `proxy_buffering off`, `X-Accel-Buffering: no`).
  Send first bytes fast (< a few seconds) — the calling app pipes the stream
  through a Vercel function with a 25s first-byte ceiling.
- **Agent runtime:** wrap the Claude Agent SDK loop per request — the SDK
  streams in-process; this service is the HTTP layer around it (the standard
  pattern for every agent framework without a built-in server). Use a
  department-specific system prompt + KB context as a **cached prompt prefix**
  (`cache_control`), and prefer a Haiku-class model for routine turns.

## 2. Authentication (D6)

Two layers on every inbound request; both must pass.

### 2.1 Ed25519 identity token (who is chatting)

`Authorization: Bearer <compact JWS>` minted by the client app per request.
Foundry pins **one public key per `app_id`** (config), never holds private keys.

Claims (all required unless noted):

```json
{
  "iss": "prompt2eat",            // must equal the app_id the key is pinned to
  "aud": "foundry-support",
  "iat": 1752570000,
  "exp": 1752570060,              // ≤ 60s TTL
  "jti": "uuid",                  // single-use
  "app_id": "prompt2eat",
  "tenant_id": "venue_abc123",    // the venue/org — TENANCY COMES ONLY FROM HERE
  "subject": {
    "role": "owner",              // "owner" | "diner" | "anon"
    "id": "user_xyz",             // stable per-app subject id
    "email": "o@example.com",     // VERIFIED email (optional for anon)
    "name": "Alex"                // optional, display only
  }
}
```

Verification duties (mirror of `docs/roster-sso-contract.md`):
1. Verify EdDSA signature against the pinned key for `app_id`; **pin the
   algorithm** (reject anything but EdDSA — no `alg` trust).
2. Exact-match `iss`/`aud`; `exp`/`iat` with ≤30s clock skew.
3. **Replay**: insert `jti` into a unique-indexed consumed-tokens table;
   unique violation ⇒ reject. GC rows after ~10 minutes.
4. Derive tenant context **only** from the token — never from a body field
   or header.

### 2.2 HMAC body signature (integrity)

`X-Signature: hex(HMAC-SHA256(shared_secret, raw_body))`, one shared secret
per app. Verify with a timing-safe compare over the **raw** body before
parsing. Missing/invalid ⇒ 401. (Outbound webhooks sign the same way with a
separate per-app webhook secret — §5.)

## 3. `POST /v1/chat`

Request:

```json
{
  "conversationId": "conv_… | null",   // null ⇒ create a new conversation
  "department": "tech" | "sales" | "billing",
  "message": "user text",
  "locale": "en-AU"                     // optional
}
```

Rules:
- `conversationId` must belong to (`app_id`, `tenant_id`, `subject.id`) —
  anything else is 404 (no existence leaks).
- Persist the user message, run the department agent grounded on the KB,
  persist the assistant reply (with citations), stream it out.

Response: **SSE** in the AI SDK **UI Message Stream v1** shape so every
client's reader is turnkey:

- Headers: `content-type: text/event-stream`,
  `x-vercel-ai-ui-message-stream: v1`
- Events: `data: {"type":"start", ...}` →
  `text-start` / repeated `text-delta` / `text-end` →
  optional `data` parts (see below) → `finish` → `data: [DONE]`
- Custom data parts (AI SDK `data-*` extension):
  - `{"type":"data-meta","data":{"conversationId":"conv_…"}}` — first event of
    a new conversation, so the client can store the id.
  - `{"type":"data-sources","data":[{"title":"…","url":"…"}]}` — KB citations.
  - `{"type":"data-escalation","data":{"ticketId":"tick_…","summary":"…"}}` —
    emitted when the agent escalates (§4); the widget switches to the
    "a representative will be with you shortly" state after the text ends.
- Errors mid-stream: `{"type":"error","errorText":"…"}` then `[DONE]`.

## 4. Escalation → tickets (D5)

Triggers (all built-in, no per-app config):
1. Explicit — the user asks for a human (widget button sends
   `message: "__human__"` or natural language; detect both).
2. **Low confidence** — the agent cannot ground an answer in the KB.
3. **Frustration/negative sentiment**, or a **repetitive loop** (same
   question ≥3 turns without resolution).

On escalation:
1. Create a ticket: `{ id, app_id, tenant_id, conversationId, department,
   summary (agent-written handoff brief), subject, status: "open" }`.
2. **Notify the operator via `services/telegram`** (existing channel):
   department, tenant, summary, deep link.
3. Emit the `data-escalation` part in the live stream (§3) with a final
   holding message ("One of our representatives will be with you shortly —
   we've raised ticket #N and you'll get a reply by email.").
4. Fire the `ticket.created` webhook to the owning app (§5).

Operator replies (via Telegram or a Foundry surface) append an
`operator` message to the conversation, set the ticket `replied`, and fire
`ticket.replied` — the client app relays it (in-app on next open + email).

## 5. Outbound webhooks (Foundry → client app)

`POST {app.webhook_url}` with `X-Signature: HMAC-SHA256(webhook_secret,
raw_body)`; retry with backoff on non-2xx (the client ACKs unknown types 200).

```json
{ "type": "ticket.created" | "ticket.replied",
  "ticket": { "id", "conversationId", "tenantId", "department",
              "summary", "status", "reply": "…?" },
  "ts": 1752570000 }
```

Idempotent by `ticket.id` + `type` — receivers upsert.

## 6. Agent behaviour requirements (safety — non-negotiable)

- **Grounded answers only**: RAG over the per-app KB with **citations**
  (Anthropic `document` blocks + `citations: enabled`); the agent must never
  invent pricing, policy, or commercial terms. No groundable answer ⇒ say so
  and escalate (§4) — never guess.
- **Prompt-injection defenses**: retrieved/untrusted content only in
  `tool_result` blocks (JSON-encoded, source-labelled), never in the system
  prompt; a system-prompt policy that retrieved content can never override
  instructions; a lightweight harmlessness pre-screen (Haiku, structured
  `{is_harmful}`) on user input; explicit refusal string; least-privilege
  tools (the support agent gets **no** write tools against any business
  system in v1).
- **Cost ceilings**: per-conversation and per-day token budgets per
  (`app_id`, `tenant_id`); cap `max_tokens` per reply; prompt-cache the
  static prefix; rate-limit per subject on top of the client app's own limit.

## 7. Data model & tenancy (D2)

Foundry Postgres owns:

- `support_conversations` — `id`, `app_id`, `tenant_id`, `subject_id`,
  `subject_email`, `department`, `status (active|escalated|closed)`,
  `created_at`, `closed_at`, `last_message_at`
- `support_messages` — `id`, `conversation_id`, `sender
  (user|assistant|operator|system)`, `body`, `sources jsonb`, `created_at`
- `support_tickets` — §4 shape
- `support_feedback` — `conversation_id` (unique), `rating`, `reason?`,
  `comment?`, `created_at`
- `consumed_jtis` — replay table (§2.1)

Isolation: **every table carries `app_id` + `tenant_id`; enable Postgres
row-level security keyed on both** (session variables set per request from
the verified token). Retention: purge/anonymize conversations after a
configurable window (default 90 days) via a scheduled job; support per-subject
erasure on request (GDPR/CCPA — erasure must cascade here because this is
where transcripts live).

## 8. `GET /v1/conversations/{id}` and `POST /v1/feedback`

- `GET /v1/conversations/{id}` → `{ conversation, messages[] }`, scoped to the
  token's (`app_id`, `tenant_id`, `subject.id`); powers widget reopen/resume.
- `POST /v1/feedback` → `{ conversationId, rating: "good"|"bad"|1-5,
  reason?, comment? }`; one per conversation (upsert). A `bad` rating on an
  un-escalated conversation SHOULD auto-open a ticket (recovery — §4).

## 9. Versioning & evolution

- All routes under `/v1/`; additive changes only within v1 (new event
  `data-*` parts, new optional fields). Breaking changes ⇒ `/v2/`.
- **v2 watch item:** the AG-UI protocol (transport-agnostic agent↔UI event
  schema, ~16 standard event types). Because v1 already streams typed SSE
  events, adopting AG-UI's schema later is an encoding change, not a
  transport change.
- Reserved: WebSocket upgrade for future bidirectional needs (free on the
  VPS); additional `app_id`s (roster, zale-it) are config + a pinned key each.

## 10. Acceptance checklist (for the Foundry build)

- [ ] `POST /v1/chat` streams UI-Message-Stream v1 events end-to-end through
      Caddy with no buffering; first bytes < 3s on a warm model
- [ ] Ed25519 verify (pinned alg/key per app) + `jti` replay rejection +
      HMAC body verify — bad/missing ⇒ 401/503, never a soft pass
- [ ] Tenancy: a token for tenant A can never read/write tenant B (RLS test)
- [ ] Escalation triggers 1–3 create a ticket + Telegram notification +
      `data-escalation` stream part + `ticket.created` webhook
- [ ] Operator reply → `ticket.replied` webhook (retries on failure)
- [ ] Feedback stored; `bad` auto-opens a ticket
- [ ] Ungroundable question ⇒ refusal + escalation, never a fabricated answer
- [ ] Retention sweep + per-subject erasure endpoint/job
- [ ] Docker Compose up on a clean VPS with only `.env` set
