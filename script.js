(() => {
  const checkoutUrl = 'https://checkout.stripe.com/REPLACE_WITH_REAL_CHECKOUT_URL';
  const header = document.querySelector('[data-header]');
  const stickyBuy = document.querySelector('[data-sticky-buy]');
  const navToggle = document.querySelector('[data-nav-toggle]');
  const mobileNav = document.querySelector('[data-mobile-nav]');
  const checkoutLinks = document.querySelectorAll('[data-checkout]');
  const trackedLinks = document.querySelectorAll('[data-track]');

  const hasRealCheckout = !checkoutUrl.includes('REPLACE_WITH_REAL_CHECKOUT_URL');

  function emitEvent(name, params = {}) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, ...params });

    if (typeof window.fbq === 'function') {
      const fbEvents = {
        checkout_click: 'InitiateCheckout',
        hero_buy_click: 'ViewContent',
        sticky_buy: 'ViewContent',
        final_cta: 'ViewContent'
      };
      const fbEventName = fbEvents[name];
      if (fbEventName) window.fbq('track', fbEventName, params);
    }
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
  }

  function decorateCheckoutUrl(url) {
    try {
      const decorated = new URL(url);
      const attribution = JSON.parse(localStorage.getItem('capnodis_attribution') || '{}');
      Object.entries(attribution).forEach(([key, value]) => {
        if (value && key !== 'landing_time') decorated.searchParams.set(key, value);
      });
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
    checkoutLinks.forEach((link) => {
      link.href = checkoutUrl;
      link.addEventListener('click', (event) => {
        emitEvent('checkout_click', { value: 19.9, currency: 'EUR' });
        if (!hasRealCheckout) {
          event.preventDefault();
          alert('Stripe checkout todavía no está conectado. Sustituye REPLACE_WITH_REAL_CHECKOUT_URL en script.js e index.html por el enlace real de Stripe.');
          return;
        }
        link.href = decorateCheckoutUrl(checkoutUrl);
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

  persistUtms();
  setupReveal();
  setupMobileNav();
  setupCheckoutLinks();
  setupTracking();
  setupFaqTracking();
  updateScrollState();

  window.addEventListener('scroll', updateScrollState, { passive: true });
})();
