# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Landing page for a Spanish-language PDF guide on managing *Capnodis tenebrionis* (gusano cabezudo) in almond orchards. Sells a digital PDF for 19,90 € via Stripe. No framework, no build step — plain HTML/CSS/JS.

## Running locally

Open `index.html` directly in a browser, or serve with any static server:

```powershell
npx serve .
# or
python -m http.server 8080
```

There is no build process, no package.json, no transpilation.

## Stripe checkout

Checkout is a hosted **Stripe Payment Link**: `https://buy.stripe.com/8x2fZh3Hz3YzgPH2fm6AM0J` (Payment Link id `plink_1TclzCFFeNuMzqHFDiHv42sM`). It is referenced in two places — keep both in sync:

- `script.js` line 2: `const checkoutUrl = 'https://buy.stripe.com/8x2fZh3Hz3YzgPH2fm6AM0J';`
- `index.html` (the `href` on the main `.button-primary` buy button)

(Legacy fallback: if `checkoutUrl` ever contains `REPLACE_WITH_REAL_CHECKOUT_URL`, the buy button shows an alert instead of redirecting — see `hasRealCheckout` in `script.js`.)

> **CRITICAL — the Payment Link's success URL MUST be `https://capnodis.com/gracias?session_id={CHECKOUT_SESSION_ID}`.** The `{CHECKOUT_SESSION_ID}` template is what lets `gracias.html` read `session_id` and fetch the download token. Without it, the thank-you page can never show the download buttons. This is configured in the Stripe Payment Link settings, not in code.

**Promo codes:** a 100%-off promotion code (e.g. `TEST100C`) completes with `amount_total: 0` and `payment_status: paid`. Delivery is **functionally identical** to a real paid order — same webhook, same order/token/email path. Only the stored `amount` differs (0.00 vs 19.90). 100%-off codes are the easiest end-to-end delivery test (they don't exercise real card charging, which is Stripe's concern, not ours).

## Deployment

Frontend: **Cloudflare Pages** (static files — `index.html`, `gracias.html`, legal pages, assets).
Production domain: `capnodis.com` / `capnodis.eu`.

Backend: **InsForge** (project `capnodis-pdf-book`, appkey `je8fwbkk`, API base `https://je8fwbkk.eu-central.insforge.app`). The `webhook.php` mentioned in older notes is obsolete — all server logic now lives in InsForge edge functions under `functions/`.

## Product delivery flow (READ THIS before touching checkout)

The whole post-purchase delivery depends on ONE Stripe webhook reaching ONE InsForge function. The chain:

```
Stripe Checkout → redirect to gracias.html?session_id=XXX
                → Stripe webhook → functions/stripe-order-handler
                       1. inserts row in `orders`
                       2. creates token in `download_tokens`
                       3. sends email via Resend
gracias.html → polls functions/session-to-token (5×, 2.5s) for the token → renders download buttons
email link   → functions/verify-download → page with functions/download-file links
```

If `orders` has no row for a session, the buttons never appear AND no email is sent — both symptoms point to **the webhook failing**, not the frontend.

### ⚠️ Stripe webhook identity — DO NOT confuse these

The Stripe account (**Infinity Creative LTD**) is shared across multiple projects. In Stripe → Workbench → Webhooks there are several endpoints. **Only ONE belongs to this project:**

| Endpoint | Belongs to | Action |
|----------|-----------|--------|
| `je8fwbkk…/functions/stripe-order-handler` | ✅ **THIS project** — the live delivery webhook | Keep. Listens to `checkout.session.completed`. |
| `je8fwbkk…/api/webhooks/stripe/live` | ⚠️ InsForge "Payments" auto-created duplicate — NOT used by our flow (writes to InsForge payment tables, not our `orders`) | Safe to disable/ignore. |
| `Invoice Infinity`, `IC Subscriptions`, `elegant-legacy` (supabase.co / invoice.infinitycreative.eu) | ❌ **OTHER projects** on the same Stripe account | **NEVER touch.** |

### How the webhook verifies events (IMPORTANT)

`functions/stripe-order-handler.ts` does **NOT** verify the Stripe signature / `STRIPE_WEBHOOK_SECRET` anymore. HMAC-secret verification proved too fragile here (wrong secret copied from the wrong endpoint → 100% `400 Invalid signature`, no orders, no emails — a full day lost to it).

Instead, on `checkout.session.completed` the function **re-fetches the session directly from the Stripe API** using `STRIPE_LIVE_SECRET_KEY` and trusts that authoritative response:

```
fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
      { headers: { Authorization: `Bearer ${STRIPE_LIVE_SECRET_KEY}` } })
→ require livemode === true && payment_status in ('paid','no_payment_required')
→ require session.payment_link ∈ CAPNODIS_PAYMENT_LINKS   ← shared-account guard (see below)
→ processOrder(session)
```

Why this is safe: an attacker would need a real, paid `cs_live_…` session id (not public/guessable); replays are idempotent (order skipped if `stripe_session_id` exists) and the download link only ever emails the genuine customer.

### ⛔ Shared-account guard - why we filter `payment_link` (fix 2026-06-08)

Stripe delivers `checkout.session.completed` to **every** endpoint on the account, regardless of which project's link was paid. So this webhook receives events for ALL 20+ payment links on the shared **Infinity Creative LTD** account (invoices, other products), not just ours. Re-fetching the session and checking `livemode`/`paid` is **not enough** - a real paid invoice passes all three checks.

**What happened:** a 48,00 € invoice payment ("Фактура № 1000000080", BG customer, via `plink_1TeZaN…`) became a fake capnodis order AND triggered a Spanish-PDF Resend email to that unrelated customer.

**The guard:** the handler now ignores any session whose `payment_link` is not ours:

```ts
const CAPNODIS_PAYMENT_LINKS = ['plink_1TclzCFFeNuMzqHFDiHv42sM']
if (!CAPNODIS_PAYMENT_LINKS.includes(session.payment_link)) {
  return Response.json({ received: true, ignored: `foreign payment_link=${session.payment_link}` })
}
```

- Genuine capnodis checkouts (incl. 100%-off promo codes) always carry `payment_link = plink_1TclzC…` → still processed, no regression.
- If a NEW capnodis payment link is ever created, append its `plink_…` id to `CAPNODIS_PAYMENT_LINKS` or deliveries silently stop.

**Consequence:** the webhook signing secret no longer matters. The Stripe endpoint just has to POINT at `.../functions/stripe-order-handler` and send `checkout.session.completed`. `STRIPE_WEBHOOK_SECRET` / `STRIPE_LIVE_WEBHOOK_SECRET` are now unused by this function and can be ignored.

The only secret this function needs is **`STRIPE_LIVE_SECRET_KEY`** (a valid `sk_live_…` key) plus the InsForge/Resend keys (`API_KEY`, `INSFORGE_BASE_URL`, `RESEND_API_KEY`).

### InsForge edge functions (`functions/`)

- `stripe-order-handler` — Stripe webhook; creates order + token + sends Resend email.
- `session-to-token` — gracias.html exchanges `session_id` → download token.
- `verify-download` — validates emailed token, renders the download page.
- `download-file` — streams a single PDF from bucket `capnodis-files-spain` for a valid token.
- `track-visit` — first-party pageview/visit sink → `visits` table. Computes `is_bot` from UA; stores `visitor_id` + `session_id`.
- `track-event` — funnel-event sink → `events` table (whitelisted events only: `checkout_click`, `scroll_50/75/90`, `faq_open`, CTA clicks). Called by `emitEvent()` in `script.js`.
- `admin-api` — powers `admin.html`. Returns revenue/orders, unique visitors, per-source & per-creative conversion, and the view→checkout→purchase funnel.

### Marketing attribution (source → sale)

`script.js` mints a stable `visitor_id` (localStorage `capnodis_visitor_id`) and appends it to the Stripe checkout URL as **`client_reference_id`** (`decorateCheckoutUrl()`). On purchase, `stripe-order-handler` reads `session.client_reference_id`, finds the latest non-bot `visits` row for that visitor, and snapshots its UTM/fbclid/referrer onto the `orders` row. So attribution lives on `orders.utm_*` / `orders.visitor_id`. Conversion-by-source and the funnel are computed from `visits` + `events` + `orders`, all keyed by `visitor_id`. Full context: `MARKETING-TRACKING.md`; implementation history: `CAPNODIS-TRACKING-UPGRADE-REPORT.md`.

### Operating the backend (CLI cheat-sheet)

All commands use `npx @insforge/cli` (never install globally). Credentials come from `.insforge/project.json`.

```powershell
# Deploy / update a function after editing it (REQUIRED — editing the .ts file does nothing until deployed)
npx @insforge/cli functions deploy stripe-order-handler --file functions/stripe-order-handler.ts

# Inspect data (source of truth for "did the order go through?")
npx @insforge/cli db query "SELECT id, customer_email, amount, created_at FROM orders ORDER BY created_at DESC LIMIT 10"
npx @insforge/cli db query "SELECT count(*) FROM download_tokens"

# Secrets + logs + function list
npx @insforge/cli secrets list
npx @insforge/cli secrets get STRIPE_LIVE_SECRET_KEY
npx @insforge/cli logs function.logs --limit 50
npx @insforge/cli metadata --json   # shows deployed functions + status
```

### Recovering a missed/failed order

If a real purchase happened but no `orders` row exists (e.g. webhook was down), re-trigger delivery by POSTing the session id to the handler — it re-verifies with Stripe, is idempotent, and sends the email:

```powershell
curl -X POST "https://je8fwbkk.eu-central.insforge.app/functions/stripe-order-handler" `
  -H "Content-Type: application/json" `
  -d '{"type":"checkout.session.completed","data":{"object":{"id":"cs_live_THE_SESSION_ID"}}}'
```

Alternatively, in Stripe → Webhooks → the `stripe-order-handler` endpoint → Recent deliveries → **Resend** the `checkout.session.completed` event. Find a session id in Stripe → Payments, or in the `orders` table.

### Quick end-to-end delivery check

After any change to the delivery functions, verify the whole chain (replace TOKEN/SESSION):

```powershell
# 1. session-to-token (what gracias.html calls) → expect {"token":"..."}
curl "https://je8fwbkk.eu-central.insforge.app/functions/session-to-token?session_id=cs_live_..."
# 2. download-file → expect HTTP 200, application/pdf, ~4 MB
curl -I "https://je8fwbkk.eu-central.insforge.app/functions/download-file?token=TOKEN&file=guia-principal.pdf"
# 3. verify-download (email link) → expect HTTP 200 text/html
curl -I "https://je8fwbkk.eu-central.insforge.app/functions/verify-download?token=TOKEN"
```

The 4 valid `file` keys are: `guia-principal.pdf`, `bono1-calendario.pdf`, `bono2-checklist.pdf`, `bono3-decision.pdf` (allow-listed in `download-file.ts`).

## Architecture

All JS is a single IIFE in `script.js`. It handles:

- **Reveal animations** — `.reveal` elements gain `.in-view` via `IntersectionObserver`
- **Sticky buy bar** — `[data-sticky-buy]` becomes `.visible` after 720px scroll
- **UTM attribution** — URL params saved to `localStorage` key `capnodis_attribution` on first visit; appended to checkout URL on click
- **Analytics** — `emitEvent()` pushes to `window.dataLayer` (GTM) and calls `window.fbq` (Meta Pixel) when available
- **FAQ tracking** — `faq_open` event fires on `<details>` toggle

## Design system

CSS custom properties are defined in `:root` in `styles.css`. Key tokens:

- Colors: `--green-900` (#1d3522) primary dark, `--gold` (#cfb035) accent, `--clay` (#a66d42) warning
- `--bg` (#fbf7ed) warm parchment background
- `--container: 1180px` max content width
- Font: Inter (loaded from Google Fonts)

## Legal pages

Four standalone HTML files share no CSS or JS with the main page — they are self-contained:
`aviso-legal.html`, `politica-privacidad.html`, `politica-cookies.html`, `terminos-condiciones.html`
