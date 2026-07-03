# Roster SSO — the Roster-side contract (Track C)

prompt2eat hands a signed, single-use token to Roster so an owner can open Roster
without a second password. **Identity stores stay separate** (decision D5,
email-level linking): no shared cookie, no shared user table, no shared secret.
prompt2eat holds the Ed25519 **private** key; Roster holds only the **public**
key. This document is the exact contract the Roster app (`zenulbashar/roster-tool`,
roster.zaleit.com.au) must implement. prompt2eat's side ships in this PR.

## 1. Keys (one-time setup)

Generate an Ed25519 keypair:

```
openssl genpkey -algorithm ed25519 -out roster-sso-priv.pem
openssl pkey -in roster-sso-priv.pem -pubout -out roster-sso-pub.pem
```

- **prompt2eat** env `ROSTER_SSO_PRIVATE_KEY` = base64 of the PRIVATE PEM:
  `base64 -w0 roster-sso-priv.pem`
- **Roster** env `PROMPT2EAT_SSO_PUBLIC_KEY` = the PUBLIC PEM (or its base64).

Rotation is one-sided: replace the keypair, update both envs. A Roster
compromise cannot mint prompt2eat-trusted tokens (it never holds the private
key).

## 2. The token (what prompt2eat sends)

A compact JWS, `header.payload.signature` (all base64url), **EdDSA / Ed25519**.

- Header: `{ "alg": "EdDSA", "typ": "JWT" }`
- Payload claims:
  | claim | value |
  |---|---|
  | `iss` | `"prompt2eat"` (verify exact) |
  | `aud` | `"roster"` (verify exact) |
  | `iat` | issued-at (unix seconds) |
  | `exp` | `iat + 60` — **≤60s lifetime** |
  | `jti` | random UUID — **single-use**, for replay protection |
  | `email` | the owner's **verified** email (Auth.js magic-link) — the match key |
  | `name` | display name, best-effort (greeting only) |
  | `venue` | `{ id, slug, name }` — **CONTEXT ONLY** (display/prefill). Per D5, Roster must NOT treat this as an org key. |
  | `entitlements` | `{ roster: boolean }` — whether the venue holds the paid Roster add-on. Roster decides what `false` means (trial / read-only / prompt to subscribe). Build 5 sets this true on purchase. |

## 3. Delivery (how it arrives)

The browser submits a cross-origin **POST** (target `_blank`) to
`POST https://roster.zaleit.com.au/api/sso/prompt2eat` with a single form field
`token=<JWS>`. The token is in the **body, never a query string**, so it never
lands in a URL, referrer, or access log. (prompt2eat's endpoint is configurable
via its `ROSTER_SSO_URL` env; default is the URL above.)

## 4. What Roster must implement — `POST /api/sso/prompt2eat`

1. Read `token` from the POST body.
2. **Verify the EdDSA signature** against the pinned public key. Reject on failure.
3. **Verify `iss === "prompt2eat"` and `aud === "roster"`** (exact match).
4. **Verify `exp`** with a small clock-skew allowance (≤30s), and that `iat` is
   not in the future beyond that skew. Reject expired tokens.
5. **Replay protection:** insert `jti` into a `sso_consumed_tokens` table with a
   unique constraint (`jti` unique, `seen_at` timestamp). A unique-violation ⇒
   **reject** (already used). Garbage-collect rows older than ~10 minutes.
6. **Match-or-provision the user BY VERIFIED EMAIL** in Roster's OWN user table
   (case-insensitive). Never read or write any prompt2eat cookie/table.
7. **Create Roster's OWN Auth.js session** (its own cookie, its own store) and
   **303-redirect to a FIXED path** (`/dashboard`). There is no redirect
   parameter — so there is no open-redirect surface.
8. On ANY verification failure, redirect to `/signin?error=sso` with a generic
   message (never echo token contents).

Optionally use `entitlements.roster` and the `venue` context for Roster's own
onboarding/greeting — but membership/tenancy remain entirely Roster's concern.

## 5. Security properties (why this is safe)

- **Replay** — `jti` single-use (step 5).
- **Leakage** — POST body + ≤60s TTL + single-use; never logged by either app.
- **Forgery** — asymmetric signature; Roster can verify but not mint.
- **Clock skew** — ±30s allowance on `exp`/`iat`.
- **Open redirect** — fixed landing path, no redirect param.
- **Downgrade / audience confusion** — `iss`/`aud` pinned.
- **Cross-app firewall** — no shared session, cookie, user table, or secret in
  either direction.

## 6. prompt2eat side (already implemented — this PR)

- `lib/sso/roster.ts` — `mintRosterHandoffToken(claims)` (Ed25519 via
  `node:crypto`, lazy key load), `getRosterSSOUrl()`.
- `app/dashboard/apps/actions.ts` — `createRosterHandoff()` server action mints
  the token from the verified session + venue.
- `app/dashboard/apps/launch-roster.tsx` — POSTs the token to Roster in a new
  tab (body, not URL).
- `venues.roster_entitled` (migration 0020) feeds `entitlements.roster`; Build 5
  (consolidated billing) sets it true on purchase.
