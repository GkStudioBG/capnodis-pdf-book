/* ── Capnodis Consent Mode v2 + Compact Banner ───────────────
 * GDPR / LSSI compliant consent flow for Spain traffic.
 * - Default state: denied (analytics_storage, ad_storage, ad_user_data, ad_personalization)
 * - Compact bottom-bar UI on first visit
 * - Spanish copy
 * - Choice persisted in localStorage (12 months, GDPR max)
 * - Updates gtag consent before any tag fires
 * ─────────────────────────────────────────────────────────────── */
(() => {
  const STORAGE_KEY = 'capnodis_consent_v1';
  const CONSENT_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 12 months max
  const STORAGE_VERSION = 1;

  function readConsent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== STORAGE_VERSION) return null;
      if (!parsed.ts || (Date.now() - parsed.ts) > CONSENT_TTL_MS) return null;
      return parsed;
    } catch (_) { return null; }
  }

  function writeConsent(granted) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        v: STORAGE_VERSION,
        ts: Date.now(),
        granted: !!granted
      }));
    } catch (_) {}
  }

  function applyConsent(granted) {
    const state = granted ? 'granted' : 'denied';
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        'analytics_storage': state,
        'ad_storage': state,
        'ad_user_data': state,
        'ad_personalization': state
      });
    }
    // Dispatch event so other scripts (Meta Pixel etc.) can react if needed
    window.dispatchEvent(new CustomEvent('capnodis:consent', { detail: { granted: !!granted } }));
  }

  function ensureDefaultConsent() {
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'default', {
        'analytics_storage': 'denied',
        'ad_storage': 'denied',
        'ad_user_data': 'denied',
        'ad_personalization': 'denied',
        'wait_for_update': 500
      });
    }
  }

  function buildBanner(existing) {
    const banner = document.createElement('div');
    banner.id = 'consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-label', 'Aviso de cookies');
    banner.innerHTML = `
      <div class="consent-inner">
        <div class="consent-text">
          <p>Usamos cookies para medir el uso de la web y mostrar anuncios útiles. Puedes aceptar todas las cookies o rechazarlas. <a href="/politica-cookies.html" target="_blank" rel="noopener">Más info</a>.</p>
        </div>
        <div class="consent-actions">
          <button type="button" class="consent-btn consent-btn-secondary" data-consent="reject">Rechazar</button>
          <button type="button" class="consent-btn consent-btn-primary" data-consent="accept">Aceptar</button>
        </div>
      </div>
    `;
    return banner;
  }

  function showBanner() {
    if (document.getElementById('consent-banner')) return;
    const banner = buildBanner();
    document.body.appendChild(banner);
    banner.querySelectorAll('[data-consent]').forEach(btn => {
      btn.addEventListener('click', () => {
        const choice = btn.getAttribute('data-consent') === 'accept';
        writeConsent(choice);
        applyConsent(choice);
        banner.classList.add('consent-hide');
        setTimeout(() => banner.remove(), 200);
      });
    });
  }

  function init() {
    ensureDefaultConsent();
    const existing = readConsent();
    if (existing) {
      // User already chose — respect it without showing banner
      applyConsent(existing.granted);
    } else {
      // First visit or expired — show banner
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showBanner);
      } else {
        showBanner();
      }
    }
  }

  // Expose helper for manual reset / privacy settings link
  window.CapnodisConsent = {
    reset() {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      location.reload();
    },
    getStatus() {
      const c = readConsent();
      return c ? (c.granted ? 'granted' : 'denied') : 'unset';
    }
  };

  init();
})();