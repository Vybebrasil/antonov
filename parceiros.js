(function () {
  'use strict';

  const state = {
    categories: [],
    partners: [],
    category: '',
    query: '',
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function readQuery() {
    const params = new URLSearchParams(location.search);
    state.category = params.get('categoria') || '';
    state.query = params.get('q') || '';
  }

  function syncQuery() {
    const params = new URLSearchParams();
    if (state.category) params.set('categoria', state.category);
    if (state.query.trim()) params.set('q', state.query.trim());
    const next = params.toString();
    const url = next ? `/parceiros?${next}` : '/parceiros';
    history.replaceState(null, '', url);
  }

  function renderFilters() {
    const host = $('#partners-filters');
    if (!host) return;
    const items = [{ slug: '', name: 'Todos' }, ...state.categories.map((c) => ({ slug: c.slug, name: c.name }))];
    host.innerHTML = items.map((item) => `
      <button type="button" class="partners-filter${(!state.category && !item.slug) || state.category === item.slug ? ' is-active' : ''}" data-cat="${esc(item.slug)}">${esc(item.name)}</button>
    `).join('');
    host.querySelectorAll('[data-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.category = btn.dataset.cat || '';
        syncQuery();
        filterLocal();
        renderFilters();
        if (state.category) {
          const cat = state.categories.find((c) => c.slug === state.category);
          window.AntonovPartners?.track('category_view', {
            category_id: cat?.id || null,
            metadata: { category_slug: state.category },
          });
        }
      });
    });
  }

  function partnerCard(partner) {
    const services = (partner.services || []).slice(0, 3).map((s) => s.name);
    const photo = partner.photo_url;
    const img = photo || partner.logo_url;
    return `
      <a href="/parceiros/${esc(partner.slug)}" class="partner-card" data-partner-id="${partner.id}" data-partner-slug="${esc(partner.slug)}">
        <div class="partner-card__media${photo ? ' partner-card__media--photo' : ''}">
          ${img
            ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async" />`
            : `<span class="partner-card__placeholder" aria-hidden="true">${esc(partner.name.slice(0, 1))}</span>`}
        </div>
        <div class="partner-card__body">
          <div class="partner-card__cat">${esc(partner.category?.name || 'Parceiro')}</div>
          <h3 class="partner-card__name">${esc(partner.name)}</h3>
          <p class="partner-card__spec">${esc(partner.specialty || partner.profession || '')}</p>
          <p class="partner-card__mobile-extra">${esc(partner.short_description || '')}</p>
        </div>
        <div class="partner-card__overlay" aria-hidden="true">
          <div class="partner-card__cat">${esc(partner.category?.name || '')}</div>
          <h3 class="partner-card__name">${esc(partner.name)}</h3>
          <p class="partner-card__summary">${esc(partner.short_description || '')}</p>
          <div class="partner-card__tags">${services.map((s) => `<span class="partner-card__tag">${esc(s)}</span>`).join('')}</div>
          <span class="btn btn--yellow partner-card__cta">Ver perfil <span class="arrow"></span></span>
        </div>
      </a>
    `;
  }

  function renderGrid(list) {
    const grid = $('#partners-grid');
    const empty = $('#partners-empty');
    if (!grid) return;
    if (!list.length) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    grid.innerHTML = list.map(partnerCard).join('');
    grid.querySelectorAll('.partner-card').forEach((card) => {
      card.addEventListener('click', () => {
        window.AntonovPartners?.track('partner_card_click', {
          partner_id: Number(card.dataset.partnerId),
          category_id: state.categories.find((c) => c.slug === state.category)?.id || null,
          metadata: { slug: card.dataset.partnerSlug, category_slug: state.category || null },
        });
      });
    });
    window.AntonovPartners?.observeImpressions(grid, '.partner-card', 'grid', (el) => ({
      slug: el.dataset.partnerSlug,
      category_slug: state.category || null,
      category_id: state.categories.find((c) => c.slug === state.category)?.id || null,
    }));
  }

  function filterLocal() {
    const q = state.query.trim().toLowerCase();
    const list = state.partners.filter((p) => {
      if (state.category && p.category?.slug !== state.category) return false;
      if (!q) return true;
      const hay = [
        p.name,
        p.trade_name,
        p.specialty,
        p.profession,
        ...(p.services || []).map((s) => s.name),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
    renderGrid(list);
  }

  async function load() {
    const loading = $('#partners-loading');
    const search = $('#partners-search');
    try {
      readQuery();
      if (search) search.value = state.query;
      const res = await fetch('/api/partners');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      state.categories = data.categories || [];
      state.partners = data.partners || [];
      renderFilters();
      filterLocal();
    } catch {
      const grid = $('#partners-grid');
      if (grid) grid.innerHTML = '';
      const empty = $('#partners-empty');
      if (empty) {
        empty.hidden = false;
        empty.querySelector('p').textContent = 'Não foi possível carregar os parceiros agora. Tente novamente em instantes.';
      }
    } finally {
      if (loading) loading.hidden = true;
    }
  }

  let searchTimer;
  $('#partners-search')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = e.target.value;
      syncQuery();
      filterLocal();
    }, 180);
  });

  if (document.body.dataset.page === 'parceiros') load();
})();
