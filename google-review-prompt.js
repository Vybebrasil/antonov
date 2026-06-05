/* Popup de avaliação no Google — após 12s no site */
(function () {
  'use strict';

  const REVIEW_URL = 'https://g.page/r/CStv0gw6jyUfEBM/review';
  const STORAGE_KEY = 'antonov-google-review';
  const DELAY_MS = 12000;
  const COOLDOWN_DAYS = 30;

  const modalHtml = `
<div class="review-prompt" id="review-prompt" hidden aria-hidden="true">
  <div class="review-prompt__backdrop" data-review-close tabindex="-1"></div>
  <div class="review-prompt__dialog" role="dialog" aria-modal="true" aria-labelledby="review-prompt-title">
    <button type="button" class="review-prompt__close" data-review-close aria-label="Fechar">×</button>
    <div class="review-prompt__accent" aria-hidden="true"></div>
    <p class="review-prompt__badge">/ SUA OPINIÃO</p>
    <div class="review-prompt__stars" aria-hidden="true">
      <span class="review-prompt__star"></span>
      <span class="review-prompt__star"></span>
      <span class="review-prompt__star"></span>
      <span class="review-prompt__star"></span>
      <span class="review-prompt__star"></span>
    </div>
    <h2 id="review-prompt-title" class="review-prompt__title">Ajude a Antonov a <span class="yel">decolar.</span></h2>
    <p class="review-prompt__sub">Sua avaliação no Google leva menos de um minuto e ajuda mais pessoas em Irecê a conhecer a melhor experiência de treino da região.</p>
    <div class="review-prompt__actions">
      <a class="btn btn--yellow review-prompt__cta" href="${REVIEW_URL}" target="_blank" rel="noopener noreferrer" data-review-go>
        <svg class="review-prompt__g" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Avaliar no Google
        <span class="arrow" aria-hidden="true"></span>
      </a>
      <button type="button" class="btn btn--ghost-light" data-review-close>Agora não</button>
    </div>
  </div>
</div>`;

  let modal;
  let timerId;
  let opened = false;

  function isDismissed() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const { until } = JSON.parse(raw);
      return typeof until === 'number' && Date.now() < until;
    } catch {
      return false;
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ until: Date.now() + COOLDOWN_DAYS * 864e5 }),
      );
    } catch {
      /* ignore */
    }
  }

  function otherModalOpen() {
    return document.querySelector('.disc-modal:not([hidden]), .vip-modal:not([hidden])');
  }

  function openModal() {
    if (!modal || opened || otherModalOpen()) return;
    opened = true;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('review-prompt-open');
    modal.querySelector('.review-prompt__cta')?.focus({ preventScroll: true });
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('review-prompt-open');
    dismiss();
    if (timerId) {
      window.clearTimeout(timerId);
      timerId = null;
    }
  }

  function track(eventName) {
    if (typeof gtag === 'function') {
      gtag('event', eventName, { event_category: 'google_review_prompt' });
    }
  }

  function init() {
    if (isDismissed()) return;

    const wrap = document.createElement('div');
    wrap.innerHTML = modalHtml.trim();
    modal = wrap.firstElementChild;
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-review-close]').forEach((el) => {
      el.addEventListener('click', () => {
        track('review_prompt_dismiss');
        closeModal();
      });
    });

    modal.querySelector('[data-review-go]')?.addEventListener('click', () => {
      track('review_prompt_click');
      dismiss();
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('review-prompt-open');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && !modal.hidden) {
        track('review_prompt_dismiss');
        closeModal();
      }
    });

    timerId = window.setTimeout(() => {
      if (document.visibilityState === 'hidden') {
        document.addEventListener(
          'visibilitychange',
          () => {
            if (document.visibilityState === 'visible' && !opened) {
              timerId = window.setTimeout(openModal, 2000);
            }
          },
          { once: true },
        );
        return;
      }
      openModal();
      track('review_prompt_show');
    }, DELAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
