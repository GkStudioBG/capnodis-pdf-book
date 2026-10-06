(() => {
  // Dedicated Payment Link for frutales only; the almond product is unchanged.
  const checkoutUrl = 'https://buy.stripe.com/6oU7sLbcb7Xqbq89t7d7q01';
  const stickyBuy = document.querySelector('[data-sticky-buy]');
  const checkoutLinks = document.querySelectorAll('[data-checkout]');
  const trackedLinks = document.querySelectorAll('[data-track]');

  const hasRealCheckout = !checkoutUrl.includes('REPLACE_WITH_REAL_CHECKOUT_URL');

  // ── Visitor / session identity ────────────────────────────────────
  // Namespaced separately from capnodis-pdf-book's keys so the two
  // products never collide if a visitor lands on both (see doc 08 §8).
  const VISITOR_ID_KEY = 'capnodis_frutales_visitor_id';
  const SESSION_ID_KEY = 'capnodis_frutales_session_id';
  const SESSION_TTL_MS = 30 * 60 * 1000;

  // Same first-party sinks as the almond page; rows are told apart by `page`
  // (/frutales/...), and the admin panel splits traffic per product on that.
  const TRACK_EVENT_URL = 'https://je8fwbkk.eu-central.insforge.app/functions/track-event';
  const TRACK_VISIT_URL = 'https://je8fwbkk.eu-central.insforge.app/functions/track-visit';

  function uuid() {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
    return 'x_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  }

  function getOrCreateVisitorId() {
    try {
      let id = localStorage.getItem(VISITOR_ID_KEY);
      if (!id) { id = uuid(); localStorage.setItem(VISITOR_ID_KEY, id); }
      return id;
    } catch (_) { return null; }
  }

  function getOrCreateSessionId() {
    try {
      const now = Date.now();
      const raw = sessionStorage.getItem(SESSION_ID_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && p.id && p.expires > now) {
          sessionStorage.setItem(SESSION_ID_KEY, JSON.stringify({ id: p.id, expires: now + SESSION_TTL_MS }));
          return p.id;
        }
      }
      const id = uuid();
      sessionStorage.setItem(SESSION_ID_KEY, JSON.stringify({ id, expires: now + SESSION_TTL_MS }));
      return id;
    } catch (_) { return null; }
  }

  function emitEvent(name, params = {}) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, ...params });

    if (typeof window.fbq === 'function') {
      window.fbq('track', 'ViewContent', params);
    }

    if (!TRACK_EVENT_URL) return; // no backend wired up yet
    try {
      fetch(TRACK_EVENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: name,
          visitor_id: getOrCreateVisitorId(),
          session_id: getOrCreateSessionId(),
          page: window.location.pathname || '/',
          payload: params,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }

  function persistUtms() {
    const url = new URL(window.location.href);
    const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
    const stored = JSON.parse(localStorage.getItem('capnodis_frutales_attribution') || '{}');
    let changed = false;

    keys.forEach((key) => {
      const value = url.searchParams.get(key);
      if (value) {
        stored[key] = value;
        changed = true;
      }
    });

    if (changed) {
      stored.landing_time = new Date().toISOString();
      localStorage.setItem('capnodis_frutales_attribution', JSON.stringify(stored));
    }

    trackVisit(stored);
  }

  function trackVisit(attribution) {
    if (!TRACK_VISIT_URL) return; // no backend wired up yet
    try {
      const payload = {
        page: window.location.pathname || '/',
        utm_source:   attribution.utm_source   || null,
        utm_medium:   attribution.utm_medium   || null,
        utm_campaign: attribution.utm_campaign || null,
        utm_content:  attribution.utm_content  || null,
        utm_term:     attribution.utm_term     || null,
        fbclid:       attribution.fbclid       || null,
        gclid:        attribution.gclid        || null,
        referrer:     document.referrer        || null,
        visitor_id:   getOrCreateVisitorId(),
        session_id:   getOrCreateSessionId(),
      };
      fetch(TRACK_VISIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }

  function decorateCheckoutUrl(url) {
    try {
      const decorated = new URL(url);
      const visitorId = getOrCreateVisitorId();
      if (visitorId) decorated.searchParams.set('client_reference_id', visitorId);
      return decorated.toString();
    } catch (error) {
      return url;
    }
  }

  function updateScrollState() {
    stickyBuy?.classList.toggle('visible', window.scrollY > 720);
  }

  function setupReveal() {
    const elements = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      elements.forEach((el) => el.classList.add('in-view'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    elements.forEach((el) => observer.observe(el));
  }

  function setupCheckoutLinks() {
    const CHECKOUT_PARAMS = {
      content_name: 'Guía Práctica contra el Gusano Cabezudo en Frutales de Hueso',
      content_category: 'Digital PDF Guide',
      content_type: 'product',
      content_ids: ['capnodis_frutales_pdf_guide'],
      num_items: 1,
      value: 19.90,
      currency: 'EUR'
    };

    checkoutLinks.forEach((link) => {
      if (hasRealCheckout) link.href = checkoutUrl;
      link.addEventListener('click', (event) => {
        if (!hasRealCheckout) {
          event.preventDefault();
          alert('Stripe checkout todavía no está conectado para este producto.');
          return;
        }

        event.preventDefault();
        emitEvent('checkout_click', CHECKOUT_PARAMS);

        if (typeof window.fbq === 'function') {
          window.fbq('track', 'InitiateCheckout', CHECKOUT_PARAMS);
        }

        const destination = decorateCheckoutUrl(checkoutUrl);
        setTimeout(() => { window.location.href = destination; }, 300);
      });
    });
  }

  function setupTracking() {
    trackedLinks.forEach((link) => {
      link.addEventListener('click', () => {
        const name = link.getAttribute('data-track');
        if (name) emitEvent(name, { location: link.closest('section')?.id || 'page' });
      });
    });
  }

  function setupFaqTracking() {
    document.querySelectorAll('details').forEach((detail) => {
      detail.addEventListener('toggle', () => {
        if (detail.open) {
          emitEvent('faq_open', { question: detail.querySelector('summary')?.textContent?.trim() || '' });
        }
      });
    });
  }

  function setupScrollMilestones() {
    const fired = {};
    const milestones = [50, 75, 90];
    function check() {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      if (scrollable <= 0) return;
      const pct = (window.scrollY / scrollable) * 100;
      milestones.forEach((m) => {
        if (pct >= m && !fired[m]) {
          fired[m] = true;
          emitEvent('scroll_' + m, {});
        }
      });
    }
    window.addEventListener('scroll', check, { passive: true });
    check();
  }

  // Browsers that block storage must still be able to open checkout.
  try { persistUtms(); } catch (_) {}
  setupReveal();
  setupCheckoutLinks();
  setupTracking();
  setupFaqTracking();
  setupScrollMilestones();
  updateScrollState();

  window.addEventListener('scroll', updateScrollState, { passive: true });
})();
