/* ANTONOV CENTER — shared interactions */
(function () {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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

  // ---------- page transition (covering -> hovering -> takeoff) ----------
  const mask = document.querySelector('.page-mask');
  const NAV_KEY = 'antonov-nav';
  const maskCoverMs = () => (reducedMotion.matches ? 60 : 380);
  const maskRevealMs = () => (reducedMotion.matches ? 60 : 520);
  const flightTakeoffMs = () => (reducedMotion.matches ? 0 : 1150);
  let transitionBusy = false;

  const clearTransitionState = () => {
    if (!mask) return;
    mask.classList.remove('is-visible', 'is-loading', 'is-covering', 'is-hovering', 'is-takeoff', 'is-exiting');
    mask.setAttribute('aria-hidden', 'true');
  };

  const showTransitionMask = () => {
    if (!mask) return;
    mask.setAttribute('aria-hidden', 'false');
    mask.classList.add('is-visible', 'is-loading');
    mask.classList.remove('is-exiting');
    document.body.classList.add('page-is-loading');
    document.documentElement.classList.remove('antonov-loading-pending');
  };

  const setTransitionPhase = (phase) => {
    if (!mask) return;
    mask.classList.remove('is-covering', 'is-hovering', 'is-takeoff');
    if (phase) mask.classList.add(`is-${phase}`);
  };

  const restartFlightAnimation = () => {
    const flight = mask?.querySelector('.page-mask__flight');
    if (!flight) return;
    flight.style.animation = 'none';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        flight.style.animation = '';
      });
    });
  };

  const closeTransitionMask = (onDone) => {
    if (!mask) {
      document.body.classList.remove('page-is-loading');
      transitionBusy = false;
      onDone?.();
      return;
    }
    mask.classList.remove('is-loading', 'is-covering', 'is-hovering', 'is-takeoff');
    mask.classList.add('is-exiting');
    setTimeout(() => {
      clearTransitionState();
      document.body.classList.remove('page-is-loading');
      transitionBusy = false;
      onDone?.();
    }, maskRevealMs());
  };

  const runTakeoffAndReveal = () => {
    if (!mask) return closeTransitionMask();
    if (!reducedMotion.matches && flightTakeoffMs() > 0) {
      setTransitionPhase('takeoff');
      restartFlightAnimation();
      setTimeout(() => closeTransitionMask(), flightTakeoffMs());
      return;
    }
    closeTransitionMask();
  };

  const runDestinationLoadSequence = () => {
    if (!mask || transitionBusy) return;
    transitionBusy = true;
    showTransitionMask();
    setTransitionPhase('hovering');
    restartFlightAnimation();

    let finalized = false;
    const done = () => {
      if (finalized) return;
      finalized = true;
      setTimeout(runTakeoffAndReveal, reducedMotion.matches ? 20 : 140);
    };

    if (document.readyState === 'complete') {
      setTimeout(done, reducedMotion.matches ? 20 : 120);
    } else {
      window.addEventListener('load', done, { once: true });
      setTimeout(done, reducedMotion.matches ? 350 : 4500);
    }
  };

  const navigateWithTransition = (href) => {
    if (transitionBusy) return;
    transitionBusy = true;
    try {
      sessionStorage.setItem(NAV_KEY, '1');
    } catch (err) { /* noop */ }

    showTransitionMask();
    setTransitionPhase('covering');
    setTimeout(() => setTransitionPhase('hovering'), reducedMotion.matches ? 20 : 120);
    setTimeout(() => { window.location.href = href; }, maskCoverMs());
  };

  if (mask) {
    let pendingNav = false;
    try {
      pendingNav = sessionStorage.getItem(NAV_KEY) === '1';
      if (pendingNav) sessionStorage.removeItem(NAV_KEY);
    } catch (err) { /* noop */ }

    if (pendingNav) runDestinationLoadSequence();
    else clearTransitionState();
  }

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      try { sessionStorage.removeItem(NAV_KEY); } catch (err) { /* noop */ }
      clearTransitionState();
      document.body.classList.remove('page-is-loading');
      transitionBusy = false;
    }
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
    if (mask) navigateWithTransition(href);
    else window.location.href = href;
  });

  // ---------- home: decoração do hero após LCP (evita CLS) ----------
  if (document.body.dataset.seoPage === 'home') {
    const hero = document.querySelector('.hero');
    const wire = hero?.querySelector('.hero__wireframe__img');
    const enableDecor = () => hero?.classList.add('hero--decor-ready');
    const enableBg = () => hero?.classList.add('hero--bg-ready');
    const loadFonts = () => {
      if (document.querySelector('link[data-antonov-fonts]')) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.dataset.antonovFonts = '1';
      link.href =
        'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=optional';
      document.head.appendChild(link);
    };
    const kick = () => {
      enableBg();
      loadFonts();
      if (!wire) {
        enableDecor();
        return;
      }
      if (wire.complete) enableDecor();
      else wire.addEventListener('load', enableDecor, { once: true });
    };
    const schedule =
      typeof requestIdleCallback === 'function'
        ? (fn) => requestIdleCallback(fn, { timeout: 2500 })
        : (fn) => window.addEventListener('load', fn, { once: true });
    schedule(kick);
  }

  // ---------- counter animation ----------
  const counters = document.querySelectorAll('[data-count]');
  const setCounterText = (el, value) => {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    const n = Number.isInteger(target) ? Math.round(value) : parseFloat(value);
    el.textContent = (Number.isInteger(target) ? n : n.toFixed(1)) + suffix;
  };
  const setCounterFinal = (el) => {
    setCounterText(el, parseFloat(el.dataset.count));
    el.dataset.counted = '1';
  };
  const animateCount = (el) => {
    if (el.dataset.counted) return;
    if (el.hasAttribute('data-count-static') || reducedMotion.matches) {
      setCounterFinal(el);
      return;
    }
    el.dataset.counted = '1';
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    const finalDigits = (Number.isInteger(target) ? String(target) : target.toFixed(1)) + suffix;
    el.style.fontVariantNumeric = 'tabular-nums';
    el.style.minWidth = `${finalDigits.length}ch`;
    const dur = 1600;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = target * eased;
      setCounterText(el, v);
      if (t < 1) requestAnimationFrame(tick);
    };
    setCounterText(el, 0);
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
      const parts = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Bahia',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(d);
      const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
      const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
      return `${hh}:${mm} BRT`;
    };
    const tick = () => clockEls.forEach((el) => (el.textContent = fmt()));
    const startClock = () => requestAnimationFrame(() => requestAnimationFrame(tick));
    if (document.readyState === 'complete') startClock();
    else window.addEventListener('load', startClock, { once: true });
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

  // ---------- modalidades modal + galeria ----------
  const discModal = document.getElementById('disc-modal');
  if (discModal) {
    const modalEyebrow = document.getElementById('disc-modal-eyebrow');
    const modalTitle = document.getElementById('disc-modal-title');
    const modalSummary = document.getElementById('disc-modal-summary');
    const modalDetails = document.getElementById('disc-modal-details');
    const modalCarousel = document.getElementById('disc-modal-carousel');
    const modalTrack = document.getElementById('disc-modal-track');
    const modalDots = document.getElementById('disc-modal-dots');
    const btnPrev = discModal.querySelector('[data-disc-prev]');
    const btnNext = discModal.querySelector('[data-disc-next]');

    const DISC_DETAILS = {
      POWERLIFTING: 'Área com barras olímpicas, anilhas, racks e plataformas para progressão de força com técnica e segurança.',
      FLEXIBILIDADE: 'Sessões focadas em mobilidade ativa, estabilidade e amplitude de movimento para melhorar postura e performance.',
      CARDIO: 'Esteiras, bikes e escada com monitoramento de ritmo para treinos intervalados e de resistência com progressão controlada.',
      CONDICIONAMENTO: 'Circuitos híbridos inspirados em provas funcionais para elevar condicionamento e potência no dia a dia.',
      FLOW: 'Blocos de mobilidade, respiração e controle corporal para reduzir tensão, ganhar fluidez e recuperar melhor.',
      RECOVERY: 'Recuperação estruturada com protocolos pós-treino para acelerar adaptação e manter constância sem sobrecarga.',
      'SMALL GROUP': 'Turmas reduzidas com coaching próximo, correções técnicas e evolução individual dentro de uma rotina dinâmica.',
    };

    const DISC_IMAGES = {
      POWERLIFTING: [
        'assets/disc-01-barbells.png',
        'assets/disc-01-plates.png',
        'assets/disc-01-dumbbells-rack.png',
        'assets/disc-01-dumbbells-pro.png',
      ],
      FLEXIBILIDADE: ['assets/disc-02.png'],
      CARDIO: [
        'assets/disc-03-treadmills.png',
        'assets/disc-03-cardio-wide.png',
        'assets/disc-03-bikes.png',
        'assets/disc-03-treadmills-bikes.png',
      ],
      CONDICIONAMENTO: ['assets/foto-hero.png', 'assets/fotogeral.png', 'assets/disc-02.png'],
      FLOW: ['assets/disc-02.png', 'assets/space-s01.png', 'assets/purpose-bg.png'],
      RECOVERY: ['assets/purpose-bg.png', 'assets/fotogeral.png', 'assets/space-hightech.png'],
      'SMALL GROUP': ['assets/fotogeral.png', 'assets/disc-01.png', 'assets/space-hightech.png'],
    };

    const DEFAULT_IMAGES = ['assets/fotogeral.png', 'assets/foto-hero.png', 'assets/space-hightech.png'];
    let slideIndex = 0;
    let slideCount = 0;

    const imagesFromCard = (card) => {
      const ph = card.querySelector('.ph');
      const fromPh = [];
      if (ph?.classList.contains('ph--disc-01')) {
        fromPh.push(
          'assets/disc-01-barbells.png',
          'assets/disc-01-plates.png',
          'assets/disc-01-dumbbells-rack.png',
          'assets/disc-01-dumbbells-pro.png'
        );
      }
      if (ph?.classList.contains('ph--disc-02')) fromPh.push('assets/disc-02.png');
      if (ph?.classList.contains('ph--disc-03')) {
        fromPh.push(
          'assets/disc-03-treadmills.png',
          'assets/disc-03-cardio-wide.png',
          'assets/disc-03-bikes.png',
          'assets/disc-03-treadmills-bikes.png'
        );
      }
      return fromPh;
    };

    const getCardInfo = (card) => {
      const rawCode = card.querySelector('.disc__no')?.textContent || '';
      const code = rawCode.replace(/\s+/g, ' ').replace(/^\d+\s*\/\s*/u, '').trim().toUpperCase();
      const titleEl = card.querySelector('.disc__name');
      const title = (titleEl?.innerText || titleEl?.textContent || '').replace(/\s+/g, ' ').trim();
      const summary = (card.querySelector('.disc__desc')?.textContent || '').replace(/\s+/g, ' ').trim();
      const details = (card.dataset.discDetails || DISC_DETAILS[code] || 'Treino estruturado com metodologia Antonov, foco em evolução e suporte técnico durante toda a jornada.').trim();
      let images = [];
      const hasCustomGallery = Boolean(card.dataset.discImages);
      if (hasCustomGallery) {
        try {
          images = JSON.parse(card.dataset.discImages);
        } catch (err) { /* noop */ }
        images = [...new Set(images.filter(Boolean))];
      } else {
        images = DISC_IMAGES[code] || [];
        const cardPh = imagesFromCard(card);
        images = [...new Set([...cardPh, ...images, ...DEFAULT_IMAGES])].slice(0, 5);
      }
      return { code, title, summary, details, images };
    };

    const updateCarousel = () => {
      if (!modalTrack) return;
      modalTrack.style.transform = `translate3d(-${slideIndex * 100}%, 0, 0)`;
      if (btnPrev) btnPrev.disabled = slideIndex <= 0;
      if (btnNext) btnNext.disabled = slideIndex >= slideCount - 1;
      modalDots?.querySelectorAll('.disc-modal__dot').forEach((dot, i) => {
        dot.classList.toggle('is-active', i === slideIndex);
        dot.setAttribute('aria-selected', i === slideIndex ? 'true' : 'false');
      });
    };

    const goToSlide = (index) => {
      if (!slideCount) return;
      slideIndex = Math.max(0, Math.min(slideCount - 1, index));
      updateCarousel();
    };

    const buildGallery = (images, title) => {
      if (!modalTrack || !modalDots) return;
      const list = images.length ? images : DEFAULT_IMAGES;
      slideCount = list.length;
      slideIndex = 0;
      if (modalCarousel) {
        modalCarousel.classList.toggle('is-single', slideCount <= 1);
      }
      modalTrack.innerHTML = list.map((src, i) => `
        <figure class="disc-modal__slide">
          <img src="${src}" alt="${title} — imagem ${i + 1}" width="720" height="450" loading="lazy" decoding="async" />
        </figure>`).join('');
      modalDots.innerHTML = list.map((_, i) =>
        `<button type="button" class="disc-modal__dot${i === 0 ? ' is-active' : ''}" data-disc-dot="${i}" role="tab" aria-label="Imagem ${i + 1}" aria-selected="${i === 0 ? 'true' : 'false'}"></button>`
      ).join('');
      modalDots.querySelectorAll('[data-disc-dot]').forEach((dot) => {
        dot.addEventListener('click', () => goToSlide(Number(dot.dataset.discDot)));
      });
      if (btnPrev) btnPrev.disabled = slideCount <= 1;
      if (btnNext) btnNext.disabled = slideCount <= 1;
      updateCarousel();
    };

    const openDiscModal = (card) => {
      const info = getCardInfo(card);
      if (modalEyebrow) modalEyebrow.textContent = info.code ? `/ ${info.code}` : '/ MODALIDADE';
      if (modalTitle) modalTitle.textContent = info.title;
      if (modalSummary) modalSummary.textContent = info.summary;
      if (modalDetails) modalDetails.textContent = info.details;
      buildGallery(info.images, info.title);
      discModal.hidden = false;
      discModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('no-scroll');
      discModal.querySelector('.disc-modal__close')?.focus();
    };

    const closeDiscModal = () => {
      discModal.hidden = true;
      discModal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('no-scroll');
    };

    btnPrev?.addEventListener('click', () => goToSlide(slideIndex - 1));
    btnNext?.addEventListener('click', () => goToSlide(slideIndex + 1));

    document.querySelectorAll('.disc-grid .disc').forEach((card) => {
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.addEventListener('click', () => openDiscModal(card));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDiscModal(card);
        }
      });
    });

    discModal.querySelectorAll('[data-disc-close]').forEach((el) => {
      el.addEventListener('click', closeDiscModal);
    });

    document.addEventListener('keydown', (e) => {
      if (discModal.hidden) return;
      if (e.key === 'Escape') closeDiscModal();
      if (e.key === 'ArrowLeft') goToSlide(slideIndex - 1);
      if (e.key === 'ArrowRight') goToSlide(slideIndex + 1);
    });
  }

  // ---------- horizontal scroll-snap class indicator ----------
  document.querySelectorAll('[data-snap]').forEach((track) => {
    const dotsHost = document.querySelector(track.dataset.snap);
    if (!dotsHost) return;
    const cards = track.querySelectorAll(':scope > *');
    let slideWidth = 0;
    const measureSlideWidth = () => {
      slideWidth = track.clientWidth || 1;
    };
    measureSlideWidth();
    window.addEventListener('resize', measureSlideWidth, { passive: true });

    cards.forEach((_, i) => {
      const d = document.createElement('button');
      d.className = 'snap-dot' + (i === 0 ? ' active' : '');
      d.addEventListener('click', () => {
        cards[i].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
      });
      dotsHost.appendChild(d);
    });

    let snapTicking = false;
    track.addEventListener(
      'scroll',
      () => {
        if (snapTicking) return;
        snapTicking = true;
        requestAnimationFrame(() => {
          snapTicking = false;
          const i = Math.round(track.scrollLeft / slideWidth);
          dotsHost.querySelectorAll('.snap-dot').forEach((d, idx) => {
            d.classList.toggle('active', idx === i);
          });
        });
      },
      { passive: true }
    );
  });
})();
