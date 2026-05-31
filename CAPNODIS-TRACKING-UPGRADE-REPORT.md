# Capnodis Tracking Upgrade — Implementation Report (Phases 1 & 2)

**Date:** 2026-06-01
**Scope executed:** Phase 1 (P0-1 attribution, P0-2 bot filtering, P0-3 unique visitors, P2-1 per-source dashboard) + Phase 2 (P1-2 persisted funnel events).
**Out of scope (by owner decision):** Phase 3 (Meta CAPI), Phase 4 (GDPR consent banner). Not started.

---

## Section 1 — Summary

Added first-party attribution that ties **traffic source → sale**, server-side **bot filtering**, **unique-visitor** counting, a **per-source / per-creative** breakdown, and a persisted **conversion funnel** (view → checkout → purchase) — all surfaced in the existing admin dashboard. Everything is additive and backwards-compatible: the existing Meta Pixel events and the existing dashboard widgets keep working unchanged.

**Files changed / created**
- `migrations/20260531213210_phase1-attribution.sql` (new)
- `migrations/20260531213213_phase2-events.sql` (new)
- `functions/track-visit.ts` (changed — visitor/session ids + bot flag)
- `functions/track-event.ts` (new — funnel event sink)
- `functions/stripe-order-handler.ts` (changed — attribution join onto orders)
- `functions/admin-api.ts` (changed — unique visitors, per-source conv, creatives, funnel)
- `script.js` (changed — visitor_id/session_id, client_reference_id, track-event, scroll milestones)
- `admin.html` (changed — funnel widget, unique visitors, per-source conv/revenue, top creatives)

**New DB objects**
- `orders`: +9 columns (`visitor_id`, `utm_source/medium/campaign/content/term`, `fbclid`, `referrer`, `landing_time`) + 4 indexes
- `visits`: +3 columns (`visitor_id`, `session_id`, `is_bot`) + 3 indexes
- `events`: new table (10 columns) + 4 indexes

**Approx LOC:** ~350 added/changed.

---

## Section 2 — Per-task status

| Task | Status | Notes |
|------|--------|-------|
| **P0-1 Attribution join** | ✅ Completed | `visitor_id` round-trips via Stripe `client_reference_id`; webhook snapshots the latest non-bot visit onto the order. *Keystone (Stripe Payment Link preserving `client_reference_id`) must be confirmed with one live purchase — see Section 6.* |
| **P0-2 Bot filtering** | ✅ Completed | UA-based `isBot()` in `track-visit` + `track-event`. Verified: Googlebot UA → `is_bot=true`, Chrome UA → `false`. |
| **P0-3 Unique visitors** | ✅ Completed | `count(distinct visitor_id)` (bots excluded). Conversion rate now uses unique visitors as denominator. Verified: 3 pageviews / 1 unique. |
| **P2-1 Per-source dashboard** | ✅ Completed | Traffic tab shows visitors/orders/conv/revenue per source + Top creatives (utm_content). |
| **P1-2 Funnel events** | ✅ Completed | `events` table + `track-event`; `emitEvent()` persists funnel events; scroll 50/75/90 added; dashboard funnel widget with drop-off. Verified end-to-end via API. |
| P1-1 Meta CAPI | ⏭ Skipped | Owner decision — not a current priority. |
| P1-3 Consent banner | ⏭ Skipped | Owner decision — deferred. |
| P2-2 Resend email tracking | ⏭ Skipped | Low value (transactional email). |

---

## Section 3 — Schema diff

```sql
-- orders (attribution snapshot)
ALTER TABLE orders ADD COLUMN visitor_id, utm_source, utm_medium, utm_campaign,
  utm_content, utm_term, fbclid, referrer (text), landing_time (timestamptz);
CREATE INDEX idx_orders_visitor_id, idx_orders_utm_source,
  idx_orders_utm_campaign, idx_orders_utm_content;

-- visits (identity + bot flag)
ALTER TABLE visits ADD COLUMN visitor_id text, session_id text, is_bot boolean DEFAULT false;
CREATE INDEX idx_visits_visitor_id, idx_visits_created_at, idx_visits_is_bot;

-- events (new)
CREATE TABLE events (id uuid PK, event_name text, event_id text, visitor_id text,
  session_id text, page text, payload jsonb, is_bot boolean, user_agent text, created_at timestamptz);
CREATE INDEX idx_events_visitor_id, idx_events_event_name, idx_events_created_at, idx_events_is_bot;
-- RLS: ENABLE + NO FORCE (service-role-only, same as visits)
```

Full SQL is in the two migration files. Applied via `npx @insforge/cli db migrations up --all`.

---

## Section 4 — Endpoints

### `POST /functions/track-visit` (changed)
- Body: `{ page, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, referrer, visitor_id, session_id }`
- Stores a visit row; computes `is_bot` from the UA header. Returns `200 ok`.

### `POST /functions/track-event` (new)
- Body: `{ event_name, event_id?, visitor_id, session_id, page, payload }`
- Whitelist-only (`checkout_click`, `InitiateCheckout`, `hero_buy_click`, `hero_content_click`, `sticky_buy`, `final_cta`, `faq_open`, `scroll_50/75/90`). Unknown names are accepted-and-dropped (always `200`). Computes `is_bot`.

### `POST /functions/stripe-order-handler` (changed)
- Now reads `session.client_reference_id` (= visitor_id), looks up the latest `is_bot=false` visit for it, and writes the attribution snapshot onto the order. Unchanged: Stripe-API verification, idempotency, token + Resend email.

### `GET /functions/admin-api?section=dashboard` (changed)
- Response `stats` now also returns: `pageviews`, `uniqueVisitors`, `pageviewsPerVisitor`; `convRate` is orders(30d)/uniqueVisitors(30d). New top-level keys: `sources[]` (visitors/orders/conv/revenue/pct), `creatives[]` (utm_content orders/revenue), `funnel{view,initiate,purchase}`. All previous keys retained.
- Required secret: `ADMIN_PASSWORD` (unchanged).

---

## Section 5 — Frontend integration points (`script.js`)

| Function | Signature | Purpose |
|----------|-----------|---------|
| `getOrCreateVisitorId()` | `() => string\|null` | Stable per-browser id in `localStorage` (`capnodis_visitor_id`). |
| `getOrCreateSessionId()` | `() => string\|null` | 30-min rolling session id in `sessionStorage` (`capnodis_session_id`). |
| `emitEvent(name, params)` | unchanged signature | Now ALSO fire-and-forget POSTs to `track-event`. |
| `decorateCheckoutUrl(url)` | `(string) => string` | Appends `client_reference_id=<visitor_id>` to the Stripe URL (replaces old UTM decoration). |
| `setupScrollMilestones()` | `() => void` | Fires `scroll_50/75/90` once each. |

---

## Section 6 — Configuration / manual steps required

1. **Deploy the frontend** (`script.js`, `admin.html`) to Cloudflare Pages. Backend functions are already deployed to InsForge. (`gracias.html` was already deployed in the prior session.)
2. **Disable promo codes** on the Stripe Payment Link (still pending from the prior session) so production orders are a clean 19,90 €.
3. **Confirm the keystone with one live test purchase** (see Section 10) — this is the only piece not verifiable without a real Stripe checkout.

No new InsForge secrets are required for Phases 1–2.

---

## Section 7 — Tests run

| Test | Result |
|------|--------|
| Migrations apply (`db migrations up --all`) | ✅ 3 applied, schema verified |
| `track-visit` real Chrome UA | ✅ `is_bot=false`, visitor_id + UTM stored |
| `track-visit` Googlebot UA | ✅ `is_bot=true` |
| `track-event` whitelisted event | ✅ stored |
| `track-event` junk event | ✅ dropped silently (200) |
| `admin-api` dashboard shape | ✅ uniqueVisitors=1, pageviews=3, funnel `{view:1,initiate:1,purchase:0}`, sources populated |
| `script.js` syntax (`node --check`) | ✅ pass |
| All 7 edge functions | ✅ active |
| Test data purged after verification | ✅ visits/events/orders = 0 |

---

## Section 8 — Known issues / TODO

- **Keystone unverified in production:** Stripe Payment Link must preserve `client_reference_id` into the session (documented Stripe behaviour; confirm with the live test in Section 10). If it ever arrives empty, the order keeps `visitor_id=null` and null attribution (handled gracefully, logged).
- **Last-touch attribution:** the snapshot is the most-recent visit for the visitor (last-touch). Multi-touch is intentionally out of scope.
- **admin-api aggregates in JS** over all orders + 30-day visits/events. Fine at current volume; revisit with SQL-side aggregation if `visits` grows into the 100k+ range.
- **localStorage reset** (user clears storage / different device) creates a new `visitor_id` → that purchase shows as `direct`/unattributed. Expected for first-party tracking.

---

## Section 9 — Suggested next steps

- When ready for paid scale, revisit **Phase 3 (Meta CAPI)** — biggest remaining lever for ad signal recovery.
- **Phase 4 (consent banner)** before/at EU paid-ads launch for GDPR/ePrivacy.

---

## Section 10 — Verification commands (run after the first real campaign traffic)

```sql
-- Attribution join working (orders carry their source)
SELECT customer_email, visitor_id, utm_source, utm_campaign, utm_content, amount, landing_time
FROM orders WHERE created_at > now() - interval '7 days' ORDER BY created_at DESC LIMIT 10;

-- Bot filtering
SELECT is_bot, COUNT(*) FROM visits WHERE created_at > now() - interval '7 days' GROUP BY is_bot;

-- Unique visitors vs pageviews
SELECT COUNT(*) AS pageviews, COUNT(DISTINCT visitor_id) AS unique_visitors
FROM visits WHERE is_bot = false AND created_at > now() - interval '30 days';

-- Funnel events captured
SELECT event_name, COUNT(*) FROM events WHERE is_bot = false
  AND created_at > now() - interval '7 days' GROUP BY event_name ORDER BY 2 DESC;
```

### Live attribution test (the keystone)
1. Open `https://capnodis.com/?utm_source=test&utm_medium=cpc&utm_campaign=manual&utm_content=reel_test` in a clean browser.
2. Complete a purchase (with promo 100% off, or a real €19.90 you refund after).
3. Run the first query above — the new order row must show `utm_source='test'`, `utm_campaign='manual'`, `utm_content='reel_test'`, and a non-null `visitor_id`.
4. In Stripe → the checkout session, confirm `client_reference_id` is populated.
