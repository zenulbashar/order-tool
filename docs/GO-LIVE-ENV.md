# Go-live runbook for the September 2026 feature set

Every feature below shipped **switched off**: each one gates on an environment
variable (or a one-time setup step) and is a silent no-op until it is set. This
is the checklist for turning them on, one feature at a time. All variables are
also documented in `.env.example` and the README's environment table.

| Feature | Where it shows | What to set | Notes |
|---|---|---|---|
| AI-visibility probes (Gemini grounded search) | `/dashboard/seo` "Ask AI search" panel + weekly cron | `GEMINI_API_KEY` (Google AI Studio). Optional `GEMINI_MODEL`, default `gemini-2.5-flash`. | Scale plan. The weekly probes ride the existing `/api/jobs/seo-stats` cron, so `CRON_SECRET` must be set (it already is for the crons). |
| Agent commerce (MCP) | `POST /api/mcp`, advertised in `public/llms.txt` | Nothing. | Live as soon as it deploys. Public read-only tools plus a `?cart=` handoff link; nothing is charged or placed by an agent. |
| AI phone ordering (Twilio Voice) | Any venue with a voice number on `/admin/venues/<id>` | Existing `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`. Then: buy a Twilio voice number, point its Voice webhook at `POST https://<host>/api/voice/incoming`, and assign the number to the venue in admin ("Voice number"). | The venue's plan must include the diner concierge. Signature verification needs the public URL to match the request URL, so set the webhook to the canonical host. |
| Installable web app + web push | `/dashboard/settings/notifications` ("Enable on this device") and a paid order's confirmation page ("Notify me when it's ready") | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` from `npx web-push generate-vapid-keys`. Optional `VAPID_SUBJECT` (`mailto:` or https). | Buttons are hidden until the keys exist. Migrations 0069 (`order_push_subscriptions`) apply on deploy. iPhone needs the site added to the Home Screen first. |
| Weekly scheduled SEO/AEO re-audits + score-drop email | `/dashboard/seo` run history ("weekly check"); owner email on a drop | Nothing new. Uses `CRON_SECRET` and the existing `RESEND_API_KEY` / `EMAIL_FROM` for the nudge. | Migration 0070 adds `seo_audits.trigger` and `venues.gmb_checklist`. Without Resend the audit still runs; only the email is skipped. |
| Google Business Profile checklist | `/dashboard/seo` | Nothing. | Scale plan. |
| Ask your data (owner insights) | `/dashboard/reports` | Existing `ANTHROPIC_API_KEY`. | Pro/Scale/trial. Per-venue `aiInsights` limit; needs `UPSTASH_*` for the limit to bite (fail-open otherwise, as everywhere). |
| AI marketing generator | `/dashboard/marketing` | Existing `ANTHROPIC_API_KEY` for copy. For "draft an image too": `GEMINI_API_KEY` **and** the R2 variables; optional `GEMINI_IMAGE_MODEL`, default `gemini-2.5-flash-image`. | Pro/Scale/trial. Image option is hidden until both the key and R2 are set. |

## Suggested order

1. Set `VAPID_*` and `GEMINI_API_KEY` in Vercel and redeploy — both are pure env switches with no external setup.
2. Confirm `RESEND_API_KEY` / `EMAIL_FROM` and `CRON_SECRET` are present (they should already be) so the weekly nudge and the cron work.
3. Buy the Twilio voice number, set its webhook, assign it to a venue in admin, and place a test call.
4. Run `/dashboard/seo` → "Ask AI search" and `/dashboard/marketing` once on a real venue to confirm spend and output before telling owners.

## Still open (not built)

- **Custom-domain Search Console properties** for Scale venues on their own domains (`docs/seo/DEPLOYMENT_PLAN.md`, Phase 5 item 3): needs per-domain verification and credentials that only the domain owner can supply.
- **Posting marketing drafts directly** to Instagram/Facebook: needs Meta app review and per-venue OAuth; the generator stops at copy-and-paste by design.
