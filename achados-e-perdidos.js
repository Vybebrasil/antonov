/* Página pública — Achados e Perdidos */

(function () {
  const listEl = document.getElementById('found-list');
  const countEl = document.getElementById('found-count');
  const errEl = document.getElementById('found-error');
  if (!listEl) return;

  let view = 'grid';
  let itens = [];

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(d) {
    if (!d) return '—';
    const s = String(d).slice(0, 10);
    const [y, m, day] = s.split('-');
    return `${day}/${m}/${y}`;
  }

  function render() {
    listEl.classList.toggle('found--list', view === 'list');
    listEl.classList.toggle('found__grid', true);

    if (!itens.length) {
      listEl.innerHTML = '<p class="found__empty">Nenhum item pendente no momento. Se perdeu algo, fale com a recepção.</p>';
      if (countEl) countEl.textContent = '0 itens disponíveis';
      return;
    }

    if (countEl) {
      countEl.textContent = `${itens.length} item${itens.length === 1 ? '' : 's'} disponível${itens.length === 1 ? '' : 'eis'}`;
    }

    listEl.innerHTML = itens.map((item) => `
      <article class="found-card" data-item-id="${esc(item.id)}">
        <div class="found-card__media ${item.has_foto ? '' : 'found-card__media--empty'}" data-media="${esc(item.id)}">
          ${item.has_foto
            ? '<span class="found-card__loading">Carregando…</span>'
            : '<span>Sem foto</span>'}
        </div>
        <div class="found-card__body">
          <h2 class="found-card__title">${esc(item.nome_produto)}</h2>
          <p class="found-card__meta">Cadastrado em ${fmtDate(item.data_cadastro)}</p>
        </div>
      </article>
    `).join('');

    loadFotosLazy();
  }

  async function loadFotosLazy() {
    const withFoto = itens.filter((i) => i.has_foto);
    const concurrency = 2;
    let i = 0;

    async function worker() {
      while (i < withFoto.length) {
        const item = withFoto[i++];
        try {
          const res = await fetch(`/api/achados-e-perdidos?foto=${encodeURIComponent(item.id)}`, {
            headers: { Accept: 'application/json' },
          });
          const data = await res.json().catch(() => ({}));
          const media = listEl.querySelector(`[data-media="${CSS.escape(item.id)}"]`);
          if (!media) continue;
          if (res.ok && data.foto_url) {
            media.classList.remove('found-card__media--empty');
            media.innerHTML = `<img src="${data.foto_url}" alt="${esc(item.nome_produto)}" loading="lazy" decoding="async" />`;
          } else {
            media.classList.add('found-card__media--empty');
            media.innerHTML = '<span>Sem foto</span>';
          }
        } catch {
          const media = listEl.querySelector(`[data-media="${CSS.escape(item.id)}"]`);
          if (media) {
            media.classList.add('found-card__media--empty');
            media.innerHTML = '<span>Sem foto</span>';
          }
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  }

  document.querySelectorAll('.found__view-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      view = btn.dataset.view || 'grid';
      document.querySelectorAll('.found__view-btn').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      render();
    });
  });

  async function load() {
    try {
      const res = await fetch('/api/achados-e-perdidos', { headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível carregar os itens.');
      itens = data.itens || [];
      if (errEl) errEl.setAttribute('hidden', '');
      render();
    } catch (err) {
      if (countEl) countEl.textContent = '';
      listEl.innerHTML = '';
      if (errEl) {
        errEl.textContent = err.message || 'Erro ao carregar.';
        errEl.removeAttribute('hidden');
      }
    }
  }

  load();
})();
