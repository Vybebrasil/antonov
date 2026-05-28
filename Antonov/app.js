/* ANTONOV CENTER — shared interactions */
(function () {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const maskInMs = () => (reducedMotion.matches ? 80 : 700);
  const flightMs = () => (reducedMotion.matches ? 80 : 1350);
  const maskOutMs = () => (reducedMotion.matches ? 80 : 700);
  const transitionMs = () => maskInMs() + flightMs() + maskOutMs();
  const revealFallbackMs = () => (reducedMotion.matches ? 400 : transitionMs() + 400);

  // ---------- nav scroll state + mobile drawer ----------
  const nav = document.querySelector('.nav');
  const burger = nav?.querySelector('.nav__burger');
  const drawer = document.getElementById('nav-drawer');
  const backdrop = nav?.querySelector('.nav__backdrop');
  const desktopLinks = nav?.querySelector('.nav__links');
  const closeNav = () => {
    if (!nav) return;
    nav.classList.remove('is-open');
    document.body.classList.remove('nav-open');
    burger?.setAttribute('aria-expanded', 'false');
    burger?.setAttribute('aria-label', 'Abrir menu');
    drawer?.setAttribute('aria-hidden', 'true');
    backdrop?.setAttribute('aria-hidden', 'true');
  };

  const openNav = () => {
    if (!nav) return;
    nav.classList.add('is-open');
    document.body.classList.add('nav-open');
    burger?.setAttribute('aria-expanded', 'true');
    burger?.setAttribute('aria-label', 'Fechar menu');
    drawer?.setAttribute('aria-hidden', 'false');
    backdrop?.setAttribute('aria-hidden', 'false');
    const first = drawer?.querySelector('.nav__drawer-links a');
    if (first) requestAnimationFrame(() => first.focus());
  };

  if (drawer && desktopLinks) {
    const host = drawer.querySelector('.nav__drawer-links');
    if (host && !host.querySelector('a')) {
      const clone = desktopLinks.cloneNode(true);
      clone.removeAttribute('id');
      clone.className = 'nav__drawer-links';
      host.replaceWith(clone);
    }
  }

  if (nav) {
    const onScroll = () => {
      if (window.scrollY > 20) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  burger?.addEventListener('click', () => {
    if (nav?.classList.contains('is-open')) closeNav();
    else openNav();
  });
  backdrop?.addEventListener('click', closeNav);
  drawer?.addEventListener('click', (e) => {
    if (e.target.closest('a')) closeNav();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav?.classList.contains('is-open')) closeNav();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 880 && nav?.classList.contains('is-open')) closeNav();
  });

  // ---------- reveal on scroll ----------
  const revealEls = document.querySelectorAll('.reveal, .reveal-up-stagger, .clip-reveal');
  const triggerReveal = (el) => { if (!el.classList.contains('in')) el.classList.add('in'); };
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          triggerReveal(e.target);
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0, rootMargin: '0px 0px -10% 0px' }
  );
  revealEls.forEach((el) => io.observe(el));

  setTimeout(() => {
    revealEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) {
        triggerReveal(el);
        io.unobserve(el);
      }
    });
  }, revealFallbackMs());

  // ---------- page transition (máscara → imagotipo → máscara) ----------
  const mask = document.querySelector('.page-mask');
  const TRANSITION_KEY = 'antonov-transition';
  let transitionActive = false;

  const resetFlightAnimation = (flight) => {
    if (!flight) return;
    flight.style.animation = 'none';
    void flight.offsetWidth;
    flight.style.animation = '';
  };

  const hideMask = () => {
    if (!mask) return;
    mask.classList.remove('in', 'out', 'flight');
  };

  const playPageTransition = (onDone) => {
    if (!mask) {
      onDone?.();
      return;
    }
    if (transitionActive) return;
    transitionActive = true;

    const flight = mask.querySelector('.page-mask__flight');
    hideMask();
    void mask.offsetWidth;
    mask.classList.add('in');

    setTimeout(() => {
      resetFlightAnimation(flight);
      mask.classList.add('flight');

      setTimeout(() => {
        mask.classList.remove('in', 'flight');
        mask.classList.add('out');

        setTimeout(() => {
          hideMask();
          transitionActive = false;
          onDone?.();
        }, maskOutMs());
      }, flightMs());
    }, maskInMs());
  };

  if (mask) {
    const skipIntro = sessionStorage.getItem(TRANSITION_KEY) === '1';
    sessionStorage.removeItem(TRANSITION_KEY);

    if (skipIntro) {
      hideMask();
    } else {
      requestAnimationFrame(() => playPageTransition());
    }
  }

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) sessionStorage.removeItem(TRANSITION_KEY);
  });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#')) return;
    if (href.startsWith('http')) return;
    if (a.target === '_blank') return;
    if (!href.endsWith('.html')) return;
    if (a.dataset.noTransition !== undefined) return;

    e.preventDefault();
    if (mask) {
      sessionStorage.setItem(TRANSITION_KEY, '1');
      playPageTransition(() => { window.location.href = href; });
    } else {
      window.location.href = href;
    }
  });

  // ---------- counter animation ----------
  const counters = document.querySelectorAll('[data-count]');
  counters.forEach((el) => {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    el.textContent = (Number.isInteger(target) ? target : target.toFixed(1)) + suffix;
  });
  const animateCount = (el) => {
    if (el.dataset.counted) return;
    el.dataset.counted = '1';
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    const dur = 1600;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = target * eased;
      el.textContent = (Number.isInteger(target) ? Math.round(v) : v.toFixed(1)) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    };
    el.textContent = '0' + suffix;
    requestAnimationFrame(tick);
  };
  try {
    const countIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { animateCount(e.target); countIO.unobserve(e.target); }
      });
    }, { threshold: 0.3 });
    counters.forEach((el) => countIO.observe(el));
  } catch (e) { /* noop */ }

  // ---------- live clock in nav for vibes ----------
  const clockEls = document.querySelectorAll('[data-clock]');
  if (clockEls.length) {
    const fmt = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm} BRT`;
    };
    const tick = () => clockEls.forEach((el) => (el.textContent = fmt()));
    tick();
    setInterval(tick, 30000);
  }

  // ---------- accordion (faq) ----------
  document.querySelectorAll('[data-accordion]').forEach((root) => {
    root.querySelectorAll('.acc__item').forEach((item) => {
      const head = item.querySelector('.acc__head');
      head.addEventListener('click', () => {
        const open = item.classList.contains('open');
        root.querySelectorAll('.acc__item.open').forEach((o) => o.classList.remove('open'));
        if (!open) item.classList.add('open');
      });
    });
  });

  // ---------- horizontal scroll-snap class indicator ----------
  document.querySelectorAll('[data-snap]').forEach((track) => {
    const dotsHost = document.querySelector(track.dataset.snap);
    if (!dotsHost) return;
    const cards = track.querySelectorAll(':scope > *');
    cards.forEach((_, i) => {
      const d = document.createElement('button');
      d.className = 'snap-dot' + (i === 0 ? ' active' : '');
      d.addEventListener('click', () => {
        cards[i].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
      });
      dotsHost.appendChild(d);
    });
    track.addEventListener('scroll', () => {
      const i = Math.round(track.scrollLeft / track.offsetWidth);
      dotsHost.querySelectorAll('.snap-dot').forEach((d, idx) => d.classList.toggle('active', idx === i));
    }, { passive: true });
  });
})();
