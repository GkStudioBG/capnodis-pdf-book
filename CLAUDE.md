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

The checkout URL is a placeholder in two places:

- `script.js` line 2: `const checkoutUrl = 'https://checkout.stripe.com/REPLACE_WITH_REAL_CHECKOUT_URL';`
- `index.html` line 239: the `href` on the `.button-primary` inside `.price-card`

Replace both with the real Stripe Payment Link. When `REPLACE_WITH_REAL_CHECKOUT_URL` is still present, clicking the buy button shows an alert instead of redirecting.

## Deployment

Production: `infinitycreative.eu/Clients/pdfbook/`  
Future domain: `capnodis.com` / `capnodis.eu`

Deploy by uploading the static files. No server-side code except for the Stripe webhook (`webhook.php`, not in this repo).

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
