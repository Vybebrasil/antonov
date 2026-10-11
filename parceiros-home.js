(function () {
  'use strict';

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function partnerItem(p, categorySlug, categoryName) {
    const photo = p.photo_url;
    const logo = p.logo_url;
    const img = photo || logo;
    const kind = photo ? 'photo' : (logo ? 'logo' : 'fallback');
    const href = `/parceiros?categoria=${esc(categorySlug)}`;
    return `
      <a class="partner-marquee__item partner-marquee__item--${kind}" href="${href}" data-partner-id="${p.id}" data-partner-slug="${esc(p.slug)}" data-category-slug="${esc(categorySlug)}" aria-label="Ver categoria ${esc(categoryName)}">
        ${img
          ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async" />`
          : `<span class="partner-marquee__fallback">${esc(p.name.split(' ')[0])}</span>`}
      </a>
    `;
  }

  /** Repete parceiros até a faixa ultrapassar a viewport e o loop -50% ficar contínuo. */
  function fillPartners(partners, minCount) {
    if (!partners.length) return [];
    const out = [];
    while (out.length < minCount) out.push(...partners);
    return out;
  }

  function marqueeItems(partners, categorySlug, categoryName) {
    if (!partners.length) {
      return `<div class="partner-marquee__group"><span class="partner-marquee__item"><span class="partner-marquee__fallback">Em breve</span></span></div>`;
    }
    // ~12 itens × ~128px ≈ 1500px — cobre containers largos; 2 grupos = loop seamless
    const set = fillPartners(partners, 12);
    const group = `<div class="partner-marquee__group">${set.map((p) => partnerItem(p, categorySlug, categoryName)).join('')}</div>`;
    return group + group;
  }

  function renderHome(data) {
    const host = document.getElementById('ecosystem-rows');
    if (!host) return;
    const blocks = (data.home || []).filter((cat) => cat.partners?.length || cat.partner_count);
    if (!blocks.length) {
      host.innerHTML = `<p class="partners-loading">Ecossistema em atualização.</p>`;
      return;
    }

    host.innerHTML = blocks.map((cat, index) => `
      <article class="ecosystem__block">
        <div class="ecosystem__block-head">
          <div>
            <div class="ecosystem__block-title">${esc(cat.name)}</div>
            <div class="ecosystem__block-meta">${cat.partner_count || cat.partners.length} parceiros ativos</div>
          </div>
          <a class="ecosystem__link" href="/parceiros?categoria=${esc(cat.slug)}">Ver todos</a>
        </div>
        <div class="partner-marquee${index % 2 ? ' partner-marquee--reverse' : ''}" aria-label="Parceiros de ${esc(cat.name)}">
          <div class="partner-marquee__track">${marqueeItems(cat.partners || [], cat.slug, cat.name)}</div>
        </div>
      </article>
    `).join('');

    host.querySelectorAll('[data-partner-id]').forEach((link) => {
      link.addEventListener('click', () => {
        window.AntonovPartners?.track('partner_category_click', {
          partner_id: Number(link.dataset.partnerId),
          metadata: {
            slug: link.dataset.partnerSlug,
            category_slug: link.dataset.categorySlug,
            source: 'home_carousel',
          },
        });
      });
    });

    window.AntonovPartners?.observeImpressions(host, '[data-partner-id]', 'home_carousel', (el) => ({
      slug: el.dataset.partnerSlug,
      source: 'home_carousel',
    }));
  }

  async function load() {
    if (!document.getElementById('ecosystem-rows')) return;
    try {
      const res = await fetch('/api/partners?view=home');
      const data = await res.json();
      if (!res.ok) throw new Error();
      renderHome(data);
    } catch {
      const host = document.getElementById('ecosystem-rows');
      if (host) host.innerHTML = '';
    }
  }

  load();
})();
