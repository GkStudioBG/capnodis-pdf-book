(() => {
  const checkoutUrl = 'https://buy.stripe.com/8x2fZh3Hz3YzgPH2fm6AM0J';
  const header = document.querySelector('[data-header]');
  const stickyBuy = document.querySelector('[data-sticky-buy]');
  const navToggle = document.querySelector('[data-nav-toggle]');
  const mobileNav = document.querySelector('[data-mobile-nav]');
  const checkoutLinks = document.querySelectorAll('[data-checkout]');
  const trackedLinks = document.querySelectorAll('[data-track]');

  const hasRealCheckout = !checkoutUrl.includes('REPLACE_WITH_REAL_CHECKOUT_URL');

  // ── Visitor / session identity ────────────────────────────────────
  const VISITOR_ID_KEY = 'capnodis_visitor_id';
  const SESSION_ID_KEY = 'capnodis_session_id';
  const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min inactivity window
  const TRACK_EVENT_URL = 'https://je8fwbkk.eu-central.insforge.app/functions/track-event';

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
      const fbEvents = {
        hero_buy_click: 'ViewContent',
        sticky_buy: 'ViewContent',
        final_cta: 'ViewContent'
      };
      const fbEventName = fbEvents[name];
      if (fbEventName) window.fbq('track', fbEventName, params);
    }

    // Persist the funnel event server-side (fire-and-forget). The endpoint
    // whitelists which names it stores, so harmless to call for any event.
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
    const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
    const stored = JSON.parse(localStorage.getItem('capnodis_attribution') || '{}');
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
      localStorage.setItem('capnodis_attribution', JSON.stringify(stored));
    }

    trackVisit(stored);
  }

  function trackVisit(attribution) {
    try {
      const payload = {
        page: window.location.pathname || '/',
        utm_source:   attribution.utm_source   || null,
        utm_medium:   attribution.utm_medium   || null,
        utm_campaign: attribution.utm_campaign || null,
        utm_content:  attribution.utm_content  || null,
        utm_term:     attribution.utm_term     || null,
        fbclid:       attribution.fbclid       || null,
        referrer:     document.referrer        || null,
        visitor_id:   getOrCreateVisitorId(),
        session_id:   getOrCreateSessionId(),
      };
      fetch('https://je8fwbkk.eu-central.insforge.app/functions/track-visit', {
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
      // Round-trip the visitor_id through Stripe's client_reference_id so the
      // webhook can join this checkout back to its originating visit (and thus
      // its traffic source). Stripe Payment Links surface this param on the
      // resulting checkout session. UTM params are NOT appended — Stripe drops
      // arbitrary query params, and we snapshot attribution server-side instead.
      const visitorId = getOrCreateVisitorId();
      if (visitorId) decorated.searchParams.set('client_reference_id', visitorId);
      return decorated.toString();
    } catch (error) {
      return url;
    }
  }

  function updateScrollState() {
    const scrolled = window.scrollY > 12;
    header?.classList.toggle('scrolled', scrolled);
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

  function setupMobileNav() {
    if (!navToggle || !mobileNav) return;
    navToggle.addEventListener('click', () => {
      const isOpen = mobileNav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
      document.body.classList.toggle('nav-open', isOpen);
    });

    mobileNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mobileNav.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('nav-open');
      });
    });
  }

  function setupCheckoutLinks() {
    const FBQ_CHECKOUT_PARAMS = {
      content_name: 'Guía Práctica contra el Gusano Cabezudo en Almendro',
      content_category: 'Digital PDF Guide',
      content_type: 'product',
      content_ids: ['capnodis_pdf_guide'],
      num_items: 1,
      value: 19.90,
      currency: 'EUR'
    };

    checkoutLinks.forEach((link) => {
      link.href = checkoutUrl;
      link.addEventListener('click', (event) => {
        if (!hasRealCheckout) {
          event.preventDefault();
          alert('Stripe checkout todavía no está conectado.');
          return;
        }

        event.preventDefault();
        emitEvent('checkout_click', FBQ_CHECKOUT_PARAMS);

        if (typeof window.fbq === 'function') {
          window.fbq('track', 'InitiateCheckout', FBQ_CHECKOUT_PARAMS);
        }

        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: 'checkout_click', ...FBQ_CHECKOUT_PARAMS });

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

  persistUtms();
  setupReveal();
  setupMobileNav();
  setupCheckoutLinks();
  setupTracking();
  setupFaqTracking();
  setupScrollMilestones();
  updateScrollState();

  window.addEventListener('scroll', updateScrollState, { passive: true });
})();
