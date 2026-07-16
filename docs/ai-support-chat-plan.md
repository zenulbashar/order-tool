# AI Support Chat — Plan (prompt2eat side)

> Status: **APPROVED DESIGN — build pending.** Decisions D1–D6 locked by the owner
> (2026-07-15). The AI brains live in the separate **Agents repo ("Foundry")** —
> see `docs/ai-support-contract.md` for the API that repo implements. This doc
> owns everything prompt2eat builds.

## 1. What this is

An owner-facing support chat in the dashboard, modeled on the Synergy
Wholesale / LiveChat experience the owner liked:

1. Open widget → greeting + **department chips** (Tech Support / Sales / Billing)
2. Ask → **streamed AI replies** in realtime (the AI *is* the live agent)
3. Complex / low-confidence / explicit request → **raise a ticket** ("One of
   our representatives will be with you shortly") — no live human takeover
4. End of chat → **feedback** (rating + optional comment)
5. **"Start the chat again"** → fresh conversation

The widget + a thin proxy live here; **all AI reasoning, conversation storage,
and ticket logic live in Foundry** (`services/support_api`), which serves
prompt2eat, Roster, and Zale IT as one shared support brain.

## 2. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Who chats | **Venue owners** (dashboard). Diner/marketing surfaces are a later phase. |
| D2 | System of record | **Foundry owns conversations/transcripts** (multi-app brain, keyed `app_id` + `tenant_id`). prompt2eat keeps only a `conversationId` reference + mirrored ticket rows. |
| D3 | Hosting | Foundry's support service runs on a **VPS with a free OSS stack** (FastAPI + uvicorn + Postgres + Caddy, Docker Compose). Interim $0: Mac Mini behind a Cloudflare Tunnel. |
| D4 | Realtime | **SSE-streamed AI replies** (fetch POST → ReadableStream). Feels live; no WebSocket needed because no second human ever joins the socket (see D5). WS stays a reserved upgrade path. |
| D5 | Escalation | **AI-only, no human agents.** Complex → Foundry raises a **ticket**, notifies the operator via Foundry's existing **Telegram** service, and mirrors the ticket to prompt2eat (visible in `/admin`). Operator replies async; reply relays back into the conversation/email. |
| D6 | Contract | **Versioned REST + SSE** emitting the **Vercel AI SDK "UI Message Stream" v1** event shape. **Ed25519-signed identity** per request (each client app holds a private key; Foundry pins public keys per `app_id`). AG-UI protocol = v2 watch item (transport-agnostic, so its schema can be adopted later without changing transport). |

## 3. Architecture

```
Owner (dashboard) ──► Widget (forest-dark, amber AI accents)      [order-tool]
      │ fetch POST → SSE (ReadableStream reader — NOT EventSource)
      ▼
/api/support/chat   thin BFF proxy: requireUser + requireVenue,   [order-tool]
      │             checkRateLimit("aiSupport"), mint Ed25519
      │             identity token, pipe the SSE stream through
      ▼
services/support_api  (FastAPI on VPS)                            [Foundry]
  • POST /v1/chat — SSE, AI SDK UI Message Stream shape
  • conversations + messages in Foundry Postgres (app_id, tenant_id)
  • Claude Agent SDK support agent, KB-grounded (citations)
  • escalation → ticket → services/telegram → operator
      │ HMAC-signed webhook
      ▼
/api/support/webhook  ticket mirror + async reply relay          [order-tool]
      → /admin/support ticket list (operator view)
```

Why this boundary: it mirrors the two cross-service patterns this repo already
trusts — the **Roster SSO** Ed25519 handoff (`lib/sso/roster.ts`, no shared
session/secret; a Foundry compromise cannot forge prompt2eat identities) and
the **Square webhook** inbound discipline (raw-body HMAC + `timingSafeEqual`,
fail-safe reject). Research confirmed the "wrap the agent SDK's in-process
stream iterator in your own HTTP layer" pattern is how every serverless-hosted
agent framework is served (verified for the OpenAI Agents SDK; the Claude
Agent SDK is the same shape).

## 4. What prompt2eat builds (this repo)

### P1 — BFF + contract plumbing (mockable, no Foundry dependency)
- `lib/support/client.ts` — server-only signed client to Foundry:
  - `mintSupportIdentity()` — Ed25519 JWS (reuse the `lib/sso/roster.ts` idiom):
    `iss:"prompt2eat"`, `aud:"foundry-support"`, `iat`, `exp ≤ 60s`, `jti`,
    `app_id:"prompt2eat"`, `tenant_id: venue.id`, `subject: { role:"owner",
    email (verified), name }`. Private key env `SUPPORT_SSO_PRIVATE_KEY`
    (lazy-read, base64 PKCS8 — same contract as `ROSTER_SSO_PRIVATE_KEY`).
  - fetch with explicit `AbortSignal` timeout; typed error with
    `retryable = status === 429 || status >= 500`.
  - `SUPPORT_API_URL` env; absent ⇒ the widget renders a friendly
    "support is offline" state (lazy-env, fail-safe — build passes with no env).
- `app/api/support/chat/route.ts` — `runtime="nodejs"`, `maxDuration` set;
  auth (`requireUser` + venue), `checkRateLimit("aiSupport", userId+ip)`
  (one new bucket in `lib/rate-limit.ts` CONFIG), then POST to Foundry
  `/v1/chat` and **pipe the SSE body through** (`text/event-stream`,
  `Cache-Control: no-cache`, `X-Accel-Buffering: no`). First bytes < 25s.
- `app/api/support/webhook/route.ts` — inbound from Foundry
  (`ticket.created`, `ticket.replied`): raw-body **HMAC-SHA256 verify +
  `timingSafeEqual`** over `SUPPORT_WEBHOOK_SECRET`; secret absent ⇒ 503
  fail-safe; idempotent upsert; 200-ack unknown types.
- Schema (additive migration): **`support_tickets` mirror only** —
  `id`, `venueId`, `foundryTicketId` (unique), `conversationId`, `department`,
  `summary`, `status (open|replied|closed)`, `createdAt`, `repliedAt`.
  No conversation/message tables here (D2: Foundry owns transcripts).

### P2 — the widget (dashboard)
- Clone the concierge idiom (`app/[slug]/concierge/concierge-panel.tsx`):
  forest-dark radial surface, amber user bubbles, `AI` pill, `✦` sparkle,
  `ThinkingDots` typing indicator, launcher FAB per `concierge-launcher.tsx`.
  **AI accents hardcoded amber (`bg-accent`/`text-accent`), never `--action`**
  (the `globals.css` firewall rule).
- Mount in `app/dashboard/layout.tsx` (identity + venue already resolved).
- Flow: greeting + department chips → streamed replies (fetch POST +
  `response.body.getReader()`, parsing UI-Message-Stream events) →
  "Talk to a human" always visible → escalation shows the
  "a representative will be with you shortly" holding card →
  end-of-chat **feedback** (Good/Bad + reason picklist on Bad + comment,
  POSTed to Foundry `/v1/feedback` via the BFF) → **"Start the chat again"**
  (new conversation, greeting re-shown).
- Client keeps only the opaque `conversationId` (localStorage, time-boxed
  resume window); transcripts re-fetched from Foundry via the BFF on reopen.

### P3 — ticket surface + reply relay
- `/admin/support` (or a dashboard notification for venue-scoped tickets):
  list mirrored tickets, mark replied/closed. Operator's actual reply happens
  in Foundry (Telegram) — this surface is visibility + audit.
- Optional: email the owner when their ticket gets a reply (reuse the
  best-effort Resend pattern from `lib/customer/notify.ts`).

### P4 (later, separately gated) — diner + marketing surfaces
- Diner: mount inside `app/[slug]/storefront.tsx`; **negotiate the
  bottom-right slot with the concierge FAB**. Identity = `getCustomer(venueId)`.
- Marketing/anon: signed anon nonce + origin allowlist + proof-of-work
  challenge (ALTCHA-style) before any public unauthenticated endpoint ships.

## 5. Invariants (bind every phase)

- **Money path untouched** — `placeOrder` + Stripe webhooks never in the diff.
- **Identity firewall intact** — owner Auth.js / diner customer-cookie /
  anon are never crossed; the signed token carries exactly one identity.
- **Lazy env everywhere**; `runtime="nodejs"` on crypto routes; fail-safe
  reject on missing secrets; additive migrations only; scrubbed short errors.
- **Grounding**: Foundry must answer only from its KB (citations), never
  invent pricing/policy; low confidence ⇒ ticket, not a guess (contract §6).
- **Rate/cost**: `aiSupport` bucket here; per-conversation + per-day token
  ceilings on the Foundry side; prompt caching for the static system prompt.
- **PII/retention**: transcripts live in Foundry under `app_id`+`tenant_id`
  isolation with a retention sweep + per-user erasure path (contract §7);
  prompt2eat discloses transcript logging in the widget footer.

## 6. Research grounding (summary)

Seven research threads (codebase mapping + external) plus a deep-research
verification workflow informed this design. Key verified findings:

- **No agent framework auto-serves HTTP**: the OpenAI Agents SDK streams via
  an in-process iterator and any REST/SSE endpoint is built by the integrator
  (verified 3-0); LangGraph is the exception with a built-in server whose
  default transport is **SSE**. Foundry (Claude Agent SDK) therefore wraps its
  agent loop in FastAPI + SSE — the standard pattern.
- **SSE is the LLM-chat default** (OpenAI/Anthropic/Gemini all stream SSE);
  transport latency is model-dominated; the client must use **fetch POST +
  ReadableStream, not `EventSource`** (GET-only, no auth headers).
- **AI SDK "UI Message Stream" v1** (`x-vercel-ai-ui-message-stream: v1`,
  `text-start/delta/end`, `[DONE]`) is the front-end consumption standard;
  emitting it keeps every client app's reader turnkey.
- **Handoff/interrupt events are typed stream events** in modern agent SDKs;
  a tool-approval interrupt *ends the stream* and requires persisted, resumable
  run state — which maps directly onto D5's raise-a-ticket escalation.
- Industry handoff UX (Intercom Fin / Zendesk / LiveChat): explicit
  "talk to a human" affordance + frustration/loop/low-confidence auto-triggers;
  ticket + async email is the universal no-agent-online fallback — i.e. D5 is
  a validated operating mode, not an invention.
- Synergy Wholesale's chat is **LiveChat™** (SaaS) with ChatBot department
  routing; what we copy is the UX loop (chips → answer → holding state →
  feedback → start again), not their human-agent infrastructure.

## 7. Sequencing

| PR | Contents | Gate |
|----|----------|------|
| 1 | `lib/support/*`, `/api/support/chat` + `/webhook`, `aiSupport` bucket, `support_tickets` mirror migration, mock Foundry mode | Contract doc merged; buildable before Foundry exists |
| 2 | Widget (panel, chips, streaming, feedback, restart) + dashboard FAB | P1 merged |
| 3 | `/admin/support` ticket surface + reply relay/email | P1 merged |
| 4 | Diner/marketing surfaces + public-endpoint hardening | Owner opt-in, own plan gate |

Foundry's `services/support_api` is built in the Agents repo against
`docs/ai-support-contract.md` — hand that doc to a Claude session there.
