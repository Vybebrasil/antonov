(function () {
  'use strict';

  const SESSION_KEY = 'antonov_partner_sid';
  const IMPRESSION_KEY = 'antonov_partner_impressions';

  function sessionId() {
    try {
      let sid = sessionStorage.getItem(SESSION_KEY);
      if (!sid) {
        sid = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem(SESSION_KEY, sid);
      }
      return sid;
    } catch {
      return `p_${Date.now()}`;
    }
  }

  function gtagEvent(name, params) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, params || {});
    }
  }

  function mapGa(name) {
    const map = {
      partner_impression: 'partner_impression',
      partner_card_click: 'partner_card_click',
      partner_profile_view: 'partner_profile_view',
      whatsapp_click: 'whatsapp_click',
      instagram_click: 'instagram_click',
      maps_click: 'maps_click',
      website_click: 'website_click',
      category_view: 'category_view',
      service_click: 'service_click',
    };
    return map[name] || name;
  }

  function postEvents(events) {
    const payload = events.map((e) => ({
      ...e,
      session_id: sessionId(),
      page: e.page || location.pathname + location.search,
      referrer: document.referrer || null,
    }));
    const body = payload.length === 1 ? payload[0] : { events: payload };
    fetch('/api/partners/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  }

  function track(name, data = {}) {
    postEvents([{ event_type: name, ...data }]);
    gtagEvent(mapGa(name), {
      partner_id: data.partner_id,
      partner_slug: data.metadata?.slug,
      category_slug: data.metadata?.category_slug,
    });
  }

  function impressionKey(partnerId, context) {
    return `${partnerId}:${context || 'default'}`;
  }

  function hasImpression(partnerId, context) {
    try {
      const raw = sessionStorage.getItem(IMPRESSION_KEY);
      const set = raw ? JSON.parse(raw) : {};
      return Boolean(set[impressionKey(partnerId, context)]);
    } catch {
      return false;
    }
  }

  function markImpression(partnerId, context) {
    try {
      const raw = sessionStorage.getItem(IMPRESSION_KEY);
      const set = raw ? JSON.parse(raw) : {};
      set[impressionKey(partnerId, context)] = 1;
      sessionStorage.setItem(IMPRESSION_KEY, JSON.stringify(set));
    } catch { /* ignore */ }
  }

  function observeImpressions(root, selector, context, getMeta) {
    if (!root || !('IntersectionObserver' in window)) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const threshold = reduced ? 0.2 : 0.4;
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < threshold) continue;
        const el = entry.target;
        const id = Number(el.dataset.partnerId);
        if (!id || seen.has(id) || hasImpression(id, context)) continue;
        seen.add(id);
        markImpression(id, context);
        const meta = typeof getMeta === 'function' ? getMeta(el) : {};
        track('partner_impression', {
          partner_id: id,
          category_id: meta.category_id || null,
          metadata: meta,
        });
        io.unobserve(el);
      }
    }, { threshold: [threshold, 0.6] });

    root.querySelectorAll(selector).forEach((el) => io.observe(el));
    return io;
  }

  function goUrl(slug, channel) {
    return `/go/${encodeURIComponent(slug)}/${channel}?sid=${encodeURIComponent(sessionId())}`;
  }

  window.AntonovPartners = {
    sessionId,
    track,
    observeImpressions,
    goUrl,
  };
})();
