# Capnodis — Marketing & Traffic Tracking System (Full Context)

> **Purpose of this document:** a complete, self-contained description of the custom analytics/attribution/tracking stack currently running on the Capnodis landing page. Hand this to a marketing-savvy AI to audit it and produce a roadmap of what to add or improve. Everything below reflects the **actual implementation in the codebase** as of 2026-05-31, not aspirations.

---

## 1. Business & funnel context

- **Product:** a single Spanish-language digital PDF guide (+3 printable bonuses) on managing *Capnodis tenebrionis* ("gusano cabezudo") in almond orchards. Target audience: Spanish almond growers / agronomists.
- **Price:** 19,90 € one-time. Digital delivery only.
- **Funnel:** single long-form landing page (`index.html`) → Stripe hosted **Payment Link** checkout → thank-you page (`gracias.html`) with instant download buttons + delivery email.
- **Tech stack:** static HTML/CSS/JS frontend on **Cloudflare Pages**; backend on **InsForge** (Postgres + edge functions). No framework, no build step. Production domain: `capnodis.com`.
- **Maturity:** the tracking system is **brand new** — first visit row recorded 2026-05-31. Numbers below are essentially pre-launch test data.

### Conversion funnel stages (as currently instrumented)

```
Ad / source ──► Landing page view ──► Engagement (scroll, FAQ, CTA clicks)
            ──► InitiateCheckout (buy click) ──► Stripe Checkout
            ──► Purchase (thank-you page) ──► Download / email delivery
```

---

## 2. The tracking stack — overview

There are **four parallel tracking layers**, each independent:

| Layer | Tool | Owner | Data lands in | Primary use |
|-------|------|-------|---------------|-------------|
| 1. Pixel / ads | **Meta (Facebook) Pixel** `27089569284015382` | Meta | Meta Ads Manager | Ad optimization, retargeting, conversion attribution |
| 2. Tag layer | **`window.dataLayer`** (GTM-ready) | self | Nothing yet (no GTM container loaded) | Future GTM/GA4 wiring |
| 3. First-party visits | **Custom `track-visit` endpoint** → `visits` table | self (InsForge) | Own Postgres DB | First-party traffic + UTM source analytics |
| 4. Orders / revenue | **Stripe webhook** → `orders` table | self (InsForge) | Own Postgres DB | Revenue, conversion rate, customer records |

A lightweight **custom admin dashboard** (`admin.html`) reads layers 3 + 4 and renders revenue, conversion rate, daily orders chart, and UTM source breakdown.

---

## 3. Layer 1 — Meta Pixel (client-side)

Pixel ID **`27089569284015382`**, loaded inline in the `<head>`.

### Events fired

| Event | Where | Trigger | Parameters |
|-------|-------|---------|------------|
| `PageView` | `index.html` head | Every landing-page load | — |
| `ViewContent` | `index.html` head | On page load (fires immediately) | `content_name`, `content_category='Digital PDF Guide'`, `content_type='product'`, `content_ids=['capnodis_pdf_guide']`, `value=19.90`, `currency='EUR'` |
| `ViewContent` | `script.js` `emitEvent()` | On CTA clicks mapped as `hero_buy_click` / `sticky_buy` / `final_cta` | same checkout params |
| `InitiateCheckout` | `script.js` `setupCheckoutLinks()` | Click on any `[data-checkout]` buy button | `content_name`, `content_ids`, `num_items=1`, `value=19.90`, `currency='EUR'` |
| `Purchase` | `gracias.html` `trackMetaPurchase()` | Thank-you page load with `session_id` | `value=19.90`, `currency='EUR'`, `content_ids=['capnodis_pdf_guide']`, `order_id=session_id`, `num_items=1` |
| `PageView` | `gracias.html` head | Thank-you page load | — |

**Important nuances / caveats:**
- `Purchase` `value` is now **dynamic**: `gracias.html` reads the real order `amount` from the `session-to-token` endpoint and reports that to Meta, falling back to the catalog price (19.90) only if the backend doesn't respond. (Promo/discount codes have been **disabled** on the Stripe Payment Link, so in production every order is 19,90 € — the value is accurate.)
- `Purchase` is de-duplicated client-side via `localStorage` key `meta_purchase_tracked_<sessionId>` — prevents double-firing on page refresh, but only per-browser.
- The thank-you page `ViewContent`/`Purchase` runs **client-side only** — no Meta **Conversions API (CAPI)** server-side backup. iOS/ad-blocker/cookie loss means an unknown share of purchases never reach Meta.
- `fbclid` is captured into attribution (see Layer 3) but is **not** sent back to Meta via CAPI, so click-level server matching is not happening.

---

## 4. Layer 2 — dataLayer / GTM hooks

`script.js` `emitEvent(name, params)` pushes every event to `window.dataLayer`. This is **GTM-ready but inert**: there is currently **no GTM container script loaded** and **no GA4** on the site. So these pushes go nowhere today.

### dataLayer events pushed

| Event name | Trigger |
|------------|---------|
| `checkout_click` | Buy button click (also fires Meta `InitiateCheckout`) |
| `hero_buy_click`, `hero_content_click`, `sticky_buy`, `final_cta` (and any other `data-track` value) | Any element with a `data-track` attribute is clicked; payload includes `location` = nearest `section` id |
| `faq_open` | A FAQ `<details>` is opened; payload includes the `question` text |

**Gap:** Without a GTM container or GA4, there is no session/engagement analytics, no bounce rate, no scroll depth, no page-time, no path analysis. The only first-party data captured server-side is the single `track-visit` ping (Layer 3).

---

## 5. Layer 3 — Custom first-party visit tracking

This is the **custom system** the team built. Flow:

```
script.js persistUtms() → trackVisit(attribution)
   → POST https://je8fwbkk.eu-central.insforge.app/functions/track-visit
   → INSERT into `visits` table
```

- Fires **once per page load** (on every page that includes `script.js`), via `fetch(..., { keepalive: true })`, fire-and-forget.
- Sends: `page` (pathname), the 5 UTM params, `fbclid`, `referrer`. The edge function additionally records `user_agent` (from request header) and `created_at` (server timestamp).
- **No cookies, no user id, no IP stored, no dedupe** — every page load = one row. So "visits" ≈ pageviews, **not** unique visitors or sessions.

### `visits` table schema

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `page` | text | pathname, e.g. `/` |
| `utm_source` | text | nullable |
| `utm_medium` | text | nullable |
| `utm_campaign` | text | nullable |
| `utm_content` | text | nullable |
| `utm_term` | text | nullable |
| `fbclid` | text | Meta click id, nullable |
| `referrer` | text | `document.referrer`, nullable |
| `user_agent` | text | from request header |
| `created_at` | timestamptz | server time |

### UTM attribution & persistence (in `script.js`)

- On first visit, UTM params (`utm_source/medium/campaign/content/term`) + `fbclid` are read from the URL and saved to `localStorage` key **`capnodis_attribution`** (with a `landing_time`). Subsequent visits keep the first-touch values unless new UTMs appear.
- On buy-button click, `decorateCheckoutUrl()` **appends the stored attribution params to the Stripe checkout URL** — so attribution rides along to Stripe. (Note: Stripe Payment Links don't natively persist arbitrary query params into the session object, so this attribution is **not currently joined back to the `orders` table** — see gaps.)

---

## 6. Layer 4 — Orders / revenue (server-side, source of truth)

Populated by the Stripe webhook (`functions/stripe-order-handler`). Verified by re-fetching the session from the Stripe API. See `CLAUDE.md` for the full delivery architecture.

### `orders` table (relevant columns)

| Column | Notes |
|--------|-------|
| `id` | uuid PK |
| `customer_email` | from Stripe `customer_details.email` |
| `customer_name` | often null (Payment Link doesn't always collect name) |
| `customer_phone` | collected by Payment Link |
| `billing_country` | from Stripe address, often null |
| `stripe_session_id` | Stripe checkout session id |
| `stripe_payment_status` | stored as `'paid'` |
| `amount` | euros; 19.90 for all production orders (promo codes disabled; test 0 € orders were purged) |
| `created_at` | timestamptz |

**Critical gap:** the `orders` table has **no marketing attribution columns** (no utm_source, no fbclid, no referrer). There is **no join key** between a `visit` row and an `order` row. So today you can see *how many* visits and *how many* orders, but **not which traffic source produced which sale** at the row level. Conversion-by-source is impossible with the current schema.

---

## 7. The admin dashboard (`admin.html` + `admin-api`)

A self-built mobile-first dashboard (Bulgarian UI), password-protected via `x-admin-password` header against the `ADMIN_PASSWORD` secret. Three tabs:

### Tab 1 — Dashboard ("Табло")
- **Total revenue** (sum of `orders.amount`).
- **Total orders**, **total visits (last 30 days)**, **conversion rate** = `totalOrders / totalVisits × 100`.
- Revenue + order counts for **today / this week / this month**.
- **Bar chart of daily orders, last 14 days**.
- Last 5 orders.

### Tab 2 — Orders ("Поръчки")
- Full list (last 50) of orders with email, amount, time-ago, country, session id.
- Tap an order → detail sheet (email, name, phone, country, amount, status, date, session id, id).
- Promo/free orders (amount < 1) are badged "Безплатно" (free).

### Tab 3 — Traffic ("Трафик")
- **Total visits (30 days)** and **conversion rate**.
- **UTM source breakdown** (last 30 days): top 8 sources by count + %, where missing utm_source is bucketed as `direct`. Recognized/iconned sources: facebook, instagram, google, direct, organic, email, twitter, tiktok.

### Dashboard limitations
- Conversion rate is a **blended site-wide ratio** (orders ÷ pageviews), not per-source, not unique-visitor based.
- "Visits" = raw pageviews (no de-dup), inflating the denominator and understating true conversion.
- No funnel/step metrics (no view→checkout→purchase drop-off), because intermediate events (InitiateCheckout, scroll, FAQ) are not persisted server-side.
- No date-range picker; windows are fixed (today / 7d / 30d / 14d chart).
- No cohort, LTV, refund, or repeat-purchase view (product is single one-time SKU, so limited relevance).

---

## 8. Current data snapshot (2026-05-31, pre-launch)

The database was **reset to a clean baseline** after testing — all test orders, tokens, and visit rows were purged.

| Metric | Value |
|--------|-------|
| Total visit rows | 0 (clean) |
| Total orders | 0 (clean) |
| Promo / discount codes | **Disabled** on the Stripe Payment Link |
| Tracking live since | 2026-05-31 |

> Interpretation: the system is verified working end-to-end but has **no real campaign data yet**. No paid campaign with UTMs has run, so the UTM/attribution layer is untested with live traffic. Treat this as a pre-launch instrumentation review.

---

## 9. Privacy / consent context

- The site has a **cookie policy** (`politica-cookies.html`), privacy policy, legal notice, and T&C (Spanish, GDPR-oriented).
- **There is no cookie consent banner / Consent Mode gating** in the code. Meta Pixel and the custom `track-visit` ping fire **unconditionally on load**, before any consent. The custom tracker uses `localStorage` (not cookies) and stores `user_agent` + UTM + referrer server-side. For an EU/Spain audience this is a **GDPR/ePrivacy exposure** worth flagging.
- No IP address is stored; no persistent user identifier beyond first-party `localStorage` attribution.

---

## 10. Known gaps & open questions (for the analyst to weigh)

A candid list of what is **missing or weak** today:

1. **No source→sale attribution join.** `orders` has no UTM/fbclid/referrer columns; no visitor id ties a visit to an order. → Cannot compute ROAS, CPA-by-source, or true per-channel conversion.
2. **No Meta Conversions API (CAPI).** Purchases/leads are client-side pixel only → signal loss on iOS/ad-blockers; Meta optimization is degraded; no server dedup with `event_id`.
3. ~~`Purchase` value hard-coded to 19.90~~ **RESOLVED** — value is now read dynamically from the real order amount (and promo codes are disabled). Listed here only for history.
4. **GTM/GA4 not deployed.** `dataLayer` is populated but unused → no session analytics, bounce, scroll depth, time-on-page, path, audience reports.
5. **No funnel events persisted.** InitiateCheckout, CTA clicks, FAQ opens, scroll milestones are not stored server-side → no drop-off funnel in the dashboard.
6. **"Visits" = pageviews, not unique users/sessions.** Conversion denominator is inflated; no returning-vs-new split.
7. **No consent management** (banner / Consent Mode v2) despite EU audience and cookie policy.
8. **Single-page tracking only.** All visits recorded so far are `/`; thank-you/legal pages mostly not in the visit funnel analytics.
9. **No bot/internal-traffic filtering** on `visits` → test/dev/bot loads pollute conversion math.
10. **No email engagement tracking** (Resend delivery email has no open/click tracking wired into analytics).
11. **No A/B testing / experiment framework.**
12. **No UTM round-trip into Stripe metadata** → even though checkout URL is decorated with attribution, it isn't captured back from Stripe into `orders`.

---

## 11. Assets the analyst can assume exist / are easy to add

- Full control of a Postgres DB (can add columns/tables to `orders`/`visits`, add a `visitor_id`, etc.).
- InsForge edge functions (Deno/TypeScript) — can add server-side endpoints (e.g., a CAPI relay) easily.
- Stripe Payment Link + webhook already wired; can switch to Checkout Sessions API or add `metadata`/`client_reference_id` if needed for attribution.
- Meta Pixel already installed and firing standard events with rich product params.
- A working admin dashboard that can render any new metric the API exposes.
- Resend for transactional email (could be extended to lifecycle/marketing email).

---

## 12. What we want back from you (the analyst)

Please produce a prioritized roadmap covering:

1. **Attribution:** the cleanest way to tie traffic source → sale with this stack (visitor id? Stripe `client_reference_id`/`metadata`? server-side stitch?), and what schema changes that implies.
2. **Measurement integrity:** fixing the hard-coded Purchase value, unique-visitor counting, bot filtering, and a real funnel (view → IC → purchase) with drop-off.
3. **Signal quality for ads:** whether/how to add Meta CAPI (with event dedup), and GA4/GTM — and whether GA4 is worth it for a single-SKU one-page funnel.
4. **Compliance:** minimum viable consent setup for an EU/Spain audience without crippling measurement.
5. **Growth instrumentation:** what additional events/dashboards would most improve decision-making for a paid-social-led single-product funnel.
6. **Prioritization:** rank everything by impact vs effort, and tell us what to do **first** before spending on ads.

Be specific and pragmatic — this is a lean, no-framework, single-product operation. Favor high-leverage, low-maintenance solutions over enterprise tooling.
