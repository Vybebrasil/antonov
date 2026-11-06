/* RH · Matriz 9-Box (desempenho × potencial) */

(() => {
  const PERIODO_RE = /^\d{4}-(S[12]|Q[1-4])$/;
  const NIVEIS = { 1: 'Baixo', 2: 'Médio', 3: 'Alto' };
  const DESEMPENHO_DESC = {
    1: 'Abaixo do esperado: entregas e metas ficam aquém do combinado para o cargo.',
    2: 'Dentro do esperado: entrega o que o cargo pede com consistência.',
    3: 'Acima do esperado: supera metas e é referência no que faz.',
  };
  const POTENCIAL_DESC = {
    1: 'Baixo: bem encaixado no papel atual, pouca vontade ou espaço para crescer agora.',
    2: 'Médio: pode crescer um nível ou ampliar escopo com desenvolvimento.',
    3: 'Alto: aprende rápido, tem ambição e pode assumir papéis maiores (ex.: liderança).',
  };
  const RISCOS = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' };
  const RISCO_BADGE = { baixo: 'ativo', medio: 'warn', alto: 'danger' };

  const state = {
    periodo: null,
    data: null,
    extraPeriodos: [],
    selecionado: null,
    container: null,
    quadrantes: null,
  };

  const esc = (s) => pdiEsc(s ?? '');
  const attr = (s) => esc(s).replace(/"/g, '&quot;');

  async function getQuadrantes() {
    if (state.quadrantes) return state.quadrantes;
    const data = await rhApi('/ninebox/quadrantes');
    state.quadrantes = data.quadrantes;
    return state.quadrantes;
  }

  function cacheQuadrantes(lista) {
    if (!lista?.length) return;
    state.quadrantes = {};
    lista.forEach((q) => {
      state.quadrantes[q.key] = { nome: q.nome, cor: q.cor, acao: q.acao, investimento: q.investimento, grupo: q.grupo };
    });
  }

  function periodoLabel(p) {
    const m = /^(\d{4})-(S|Q)(\d)$/.exec(p || '');
    if (!m) return p || '';
    return m[2] === 'S' ? `${m[3]}º semestre de ${m[1]}` : `${m[3]}º trimestre de ${m[1]}`;
  }

  function quadBadge(q) {
    if (!q) return '';
    return `<span class="rh-nb-tag" style="--nb-cor:${attr(q.cor)}">${esc(q.nome)}</span>`;
  }

  function riscoBadge(r) {
    if (!r) return '';
    return `<span class="pdi-badge pdi-badge--${RISCO_BADGE[r] || 'muted'}">Risco ${esc(RISCOS[r] || r)}</span>`;
  }

  /* ---------- Aba ---------- */

  async function load(container) {
    state.container = container;
    container.innerHTML = '<p class="pdi-muted">Carregando 9-Box…</p>';
    const qs = state.periodo ? `?periodo=${encodeURIComponent(state.periodo)}` : '';
    const data = await rhApi(`/ninebox${qs}`);
    state.data = data;
    state.periodo = data.periodo;
    cacheQuadrantes(data.quadrantes);
    render();
  }

  function periodoOptions(data) {
    const set = new Map(data.periodos.map((p) => [p.periodo, p.total]));
    state.extraPeriodos.forEach((p) => { if (!set.has(p)) set.set(p, 0); });
    return [...set.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([p, total]) => {
        const sufixo = p === data.periodo_atual ? ' (atual)' : '';
        return `<option value="${attr(p)}"${p === data.periodo ? ' selected' : ''}>${esc(p)}${sufixo} · ${total} posicionado(s)</option>`;
      })
      .join('');
  }

  function cellHtml(q) {
    const chips = q.colaboradores
      .map((c) => `<button type="button" class="rh-nb-chip" data-nb-colab="${attr(c.id)}" title="${attr(c.cargo_atual || '')}">${esc(c.nome)}${c.risco_saida === 'alto' ? ' <span class="rh-nb-chip__risk" aria-label="Risco alto de saída">!</span>' : ''}</button>`)
      .join('');
    const sel = state.selecionado === q.key ? ' rh-nb-cell--sel' : '';
    return `
      <div class="rh-nb-cell${sel}${q.count ? '' : ' rh-nb-cell--empty'}" style="--nb-cor:${attr(q.cor)}">
        <button type="button" class="rh-nb-cell__head" data-nb-quad="${attr(q.key)}" aria-label="${attr(`${q.nome}: ${q.count} colaborador(es)`)}">
          <span class="rh-nb-cell__name">${esc(q.nome)}</span>
          <span class="rh-nb-cell__count">${q.count}</span>
        </button>
        <div class="rh-nb-cell__chips">${chips || '<span class="rh-nb-cell__none">—</span>'}</div>
      </div>`;
  }

  function gridHtml(data) {
    const byKey = new Map(data.quadrantes.map((q) => [q.key, q]));
    let cells = '';
    for (const pot of [3, 2, 1]) {
      cells += `<div class="rh-nb-ylabel">${NIVEIS[pot]}</div>`;
      for (const des of [1, 2, 3]) cells += cellHtml(byKey.get(`${des}-${pot}`));
    }
    cells += '<div></div>';
    for (const des of [1, 2, 3]) cells += `<div class="rh-nb-xlabel">${NIVEIS[des]}</div>`;
    return `
      <div class="rh-nb-board">
        <div class="rh-nb-axis-y"><span>Potencial ↑</span></div>
        <div class="rh-nb-grid">${cells}</div>
        <div class="rh-nb-axis-x">Desempenho →</div>
      </div>`;
  }

  function detailHtml(data) {
    const q = data.quadrantes.find((x) => x.key === state.selecionado);
    if (!q) {
      return '<p class="pdi-muted rh-nb-hint">Toque num quadrante para ver a recomendação e as pessoas dele.</p>';
    }
    const lista = q.colaboradores.length
      ? `<ul class="rh-nb-list">${q.colaboradores.map((c) => `
          <li><button type="button" class="rh-nb-list__item" data-nb-colab="${attr(c.id)}">
            <strong>${esc(c.nome)}</strong>
            <span class="pdi-muted">${esc(c.cargo_atual || 'Sem cargo')}</span>
            ${riscoBadge(c.risco_saida)}
          </button></li>`).join('')}</ul>`
      : '<p class="pdi-muted">Ninguém neste quadrante.</p>';
    return `
      <div class="rh-nb-detail__box" style="--nb-cor:${attr(q.cor)}">
        <div class="rh-nb-detail__head">
          <h4>${esc(q.nome)} <span class="pdi-muted">(desempenho ${NIVEIS[q.desempenho].toLowerCase()}, potencial ${NIVEIS[q.potencial].toLowerCase()})</span></h4>
          <button type="button" class="btn btn-ghost btn-sm" data-nb-quad-close>Fechar</button>
        </div>
        <p><strong>Ação recomendada:</strong> ${esc(q.acao)}</p>
        <p><strong>Investimento de RH:</strong> ${esc(q.investimento)}</p>
        ${lista}
      </div>`;
  }

  function naoPosicionadosHtml(data) {
    if (!data.nao_posicionados.length) {
      return data.total_colaboradores
        ? '<p class="pdi-muted">Todos os colaboradores ativos já estão posicionados neste período.</p>'
        : '<p class="rh-empty">Nenhum colaborador ativo cadastrado.</p>';
    }
    return `<ul class="rh-nb-list rh-nb-list--grid">${data.nao_posicionados.map((c) => `
      <li><button type="button" class="rh-nb-list__item" data-nb-colab="${attr(c.id)}">
        <strong>${esc(c.nome)}</strong>
        <span class="pdi-muted">${esc(c.cargo_atual || 'Sem cargo')}</span>
        ${c.sugestao ? `<span class="pdi-badge pdi-badge--pending">Sugestão: desempenho ${NIVEIS[c.sugestao.desempenho].toLowerCase()}</span>` : ''}
      </button></li>`).join('')}</ul>`;
  }

  function sucessaoHtml(data) {
    const s = data.sucessao;
    const talentos = s.talentos.length
      ? `<ul class="rh-nb-list">${s.talentos.map((t) => `
          <li><button type="button" class="rh-nb-list__item" data-nb-colab="${attr(t.id)}">
            <strong>${esc(t.nome)}</strong>
            ${quadBadge(t.quadrante)}
            <span class="pdi-muted">${t.sucessor_de ? `Sucessor(a) de: ${esc(t.sucessor_de)}` : 'Sem sucessão definida'}</span>
            ${riscoBadge(t.risco_saida)}
          </button></li>`).join('')}</ul>`
      : '<p class="pdi-muted">Nenhum talento de alto potencial identificado neste período.</p>';
    const alertas = [];
    if (s.estrelas_sem_sucessao) {
      alertas.push(`<li><span class="rh-level rh-level--warn">${s.estrelas_sem_sucessao}</span> estrela(s) sem papel de sucessão definido — estrela sem plano de retenção tende a sair em 12 meses.</li>`);
    }
    s.riscos.forEach((r) => {
      alertas.push(`<li><span class="rh-level rh-level--${r.risco_saida === 'alto' ? 'crit' : 'high'}">Risco ${esc(RISCOS[r.risco_saida])}</span> <button type="button" class="rh-nb-link" data-nb-colab="${attr(r.id)}">${esc(r.nome)}</button> ${quadBadge(r.quadrante)}</li>`);
    });
    const sucessores = s.sucessores.length
      ? `<ul class="rh-nb-succ">${s.sucessores.map((x) => `<li><strong>${esc(x.sucessor_de)}</strong> ← <button type="button" class="rh-nb-link" data-nb-colab="${attr(x.id)}">${esc(x.nome)}</button> ${quadBadge(x.quadrante)}</li>`).join('')}</ul>`
      : '<p class="pdi-muted">Nenhum sucessor indicado. Preencha "Sucessor(a) de" ao posicionar talentos.</p>';
    return `
      <div class="rh-nb-succ-grid">
        <div>
          <h4 class="pdi-section-title">Talentos de alto potencial</h4>
          ${talentos}
        </div>
        <div>
          <h4 class="pdi-section-title">Pipeline de sucessão</h4>
          ${sucessores}
          <h4 class="pdi-section-title">Riscos</h4>
          ${alertas.length ? `<ul class="rh-nb-alerts">${alertas.join('')}</ul>` : '<p class="pdi-muted">Nenhum risco de saída relevante registrado.</p>'}
        </div>
      </div>`;
  }

  function render() {
    const container = state.container;
    const data = state.data;
    if (!container || !data) return;
    const talentos = data.sucessao.talentos.length;
    const riscos = data.sucessao.riscos.length;
    container.innerHTML = `
      <div class="rh-nb">
        <div class="rh-view-head">
          <div>
            <h3>Matriz 9-Box</h3>
            <p>Desempenho × potencial — ${esc(periodoLabel(data.periodo))}. Clique num nome para posicionar.</p>
          </div>
          <div class="rh-view-head__actions rh-nb-period">
            <select class="rh-nb-period__sel" data-nb-periodo aria-label="Período">${periodoOptions(data)}</select>
            <button type="button" class="btn btn-secondary btn-sm" data-nb-novo>+ Novo período</button>
          </div>
        </div>

        <div class="pdi-stats">
          <div class="pdi-stat"><span class="pdi-stat__val">${data.total_posicionados}</span><span class="pdi-stat__lbl">Posicionados</span></div>
          <div class="pdi-stat${data.nao_posicionados.length ? ' pdi-stat--warn' : ''}"><span class="pdi-stat__val">${data.nao_posicionados.length}</span><span class="pdi-stat__lbl">Não posicionados</span></div>
          <div class="pdi-stat"><span class="pdi-stat__val">${talentos}</span><span class="pdi-stat__lbl">Alto potencial</span></div>
          <div class="pdi-stat${riscos ? ' pdi-stat--warn' : ''}"><span class="pdi-stat__val">${riscos}</span><span class="pdi-stat__lbl">Riscos de saída</span></div>
        </div>

        <article class="card rh-nb-card">
          ${gridHtml(data)}
          <div class="rh-nb-detail">${detailHtml(data)}</div>
        </article>

        <article class="card rh-nb-card">
          <h4 class="pdi-section-title">Não posicionados (${data.nao_posicionados.length})</h4>
          ${naoPosicionadosHtml(data)}
        </article>

        <article class="card rh-nb-card">
          <h4 class="pdi-section-title">Plano de sucessão</h4>
          ${sucessaoHtml(data)}
        </article>
      </div>`;
    bind(container);
  }

  function bind(container) {
    container.querySelector('[data-nb-periodo]')?.addEventListener('change', (e) => {
      state.periodo = e.target.value;
      state.selecionado = null;
      load(container).catch((err) => alert(err.message));
    });
    container.querySelector('[data-nb-novo]')?.addEventListener('click', () => {
      const valor = prompt('Novo período (ex.: 2027-S1 para semestre ou 2027-Q1 para trimestre):', '');
      if (valor == null) return;
      const p = valor.trim().toUpperCase();
      if (!PERIODO_RE.test(p)) {
        alert('Formato inválido. Use AAAA-S1, AAAA-S2 ou AAAA-Q1 a AAAA-Q4.');
        return;
      }
      if (!state.extraPeriodos.includes(p)) state.extraPeriodos.push(p);
      state.periodo = p;
      state.selecionado = null;
      load(container).catch((err) => alert(err.message));
    });
    container.querySelectorAll('[data-nb-quad]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selecionado = state.selecionado === btn.dataset.nbQuad ? null : btn.dataset.nbQuad;
        render();
        if (state.selecionado) container.querySelector('.rh-nb-detail')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      });
    });
    container.querySelector('[data-nb-quad-close]')?.addEventListener('click', () => {
      state.selecionado = null;
      render();
    });
    container.querySelectorAll('[data-nb-colab]').forEach((btn) => {
      btn.addEventListener('click', () => abrirDaGrade(btn.dataset.nbColab));
    });
  }

  function abrirDaGrade(id) {
    const data = state.data;
    const pos = data.posicionados.find((c) => String(c.id) === String(id));
    const nao = data.nao_posicionados.find((c) => String(c.id) === String(id));
    const c = pos || nao;
    if (!c) return;
    abrirModal({
      colab: c,
      periodo: data.periodo,
      posicao: pos?.posicao || null,
      sugestao: c.sugestao,
      onSaved: () => load(state.container),
    }).catch((err) => alert(err.message));
  }

  /* ---------- Modal de posicionamento ---------- */

  function optsHtml(name, desc, atual, sugerido) {
    return [3, 2, 1].map((n) => `
      <label class="rh-nb-opt">
        <input type="radio" name="${name}" value="${n}"${atual === n ? ' checked' : ''} required>
        <span class="rh-nb-opt__body">
          <strong>${n} · ${NIVEIS[n]}${sugerido === n ? ' <span class="pdi-badge pdi-badge--pending">sugerido</span>' : ''}</strong>
          <small>${esc(desc[n])}</small>
        </span>
      </label>`).join('');
  }

  async function abrirModal({ colab, periodo, posicao, sugestao, onSaved }) {
    const quadrantes = await getQuadrantes();
    const sugDes = sugestao?.desempenho || null;
    const desAtual = posicao?.desempenho || null;
    const potAtual = posicao?.potencial || null;
    const sugHtml = sugestao
      ? `<div class="rh-nb-sug">
          <span>Última avaliação de desempenho concluída: nota <strong>${Number(sugestao.nota).toFixed(2).replace('.', ',')}</strong> (1–5)${sugestao.concluida_em ? ` em ${esc(pdiFmtDate(String(sugestao.concluida_em)))}` : ''} → sugestão: desempenho <strong>${NIVEIS[sugDes].toLowerCase()}</strong>.</span>
          ${desAtual !== sugDes ? '<button type="button" class="btn btn-ghost btn-sm" data-nb-usar-sug>Usar sugestão</button>' : ''}
        </div>`
      : '<p class="pdi-muted rh-nb-sug-none">Sem avaliação de desempenho concluída para sugerir a nota — defina pelo seu julgamento.</p>';

    const box = rhOpenModal(`
      <h3>Posicionar no 9-Box</h3>
      <p class="pdi-muted">${esc(colab.nome)}${colab.cargo_atual ? ` · ${esc(colab.cargo_atual)}` : ''} · Período <strong>${esc(periodo)}</strong></p>
      <form class="pdi-form rh-nb-form" data-nb-form>
        ${sugHtml}
        <fieldset class="rh-nb-fs">
          <legend>Desempenho (entregas atuais)</legend>
          <div class="rh-nb-opts">${optsHtml('desempenho', DESEMPENHO_DESC, desAtual, sugDes)}</div>
        </fieldset>
        <fieldset class="rh-nb-fs">
          <legend>Potencial (capacidade de crescer)</legend>
          <div class="rh-nb-opts">${optsHtml('potencial', POTENCIAL_DESC, potAtual, null)}</div>
        </fieldset>
        <div class="rh-nb-preview" data-nb-preview></div>
        <label><span>Justificativa (fatos e exemplos)</span>
          <textarea name="justificativa" rows="3" maxlength="5000" placeholder="Por que este posicionamento? Cite entregas e comportamentos observados.">${esc(posicao?.justificativa || '')}</textarea>
        </label>
        <label><span>Ação combinada</span>
          <textarea name="acao" rows="3" maxlength="5000">${esc(posicao?.acao || '')}</textarea>
        </label>
        <div class="rh-nb-row">
          <label><span>Risco de saída</span>
            <select name="risco_saida">
              <option value="">Não avaliado</option>
              ${Object.entries(RISCOS).map(([k, v]) => `<option value="${k}"${posicao?.risco_saida === k ? ' selected' : ''}>${v}</option>`).join('')}
            </select>
          </label>
          <label><span>Sucessor(a) de (cargo ou pessoa)</span>
            <input name="sucessor_de" maxlength="200" value="${attr(posicao?.sucessor_de || '')}" placeholder="Ex.: Coordenação de musculação">
          </label>
        </div>
        <p class="form-error" data-nb-err hidden></p>
        <div class="modal-actions">
          ${posicao ? '<button type="button" class="btn btn-danger btn-sm" data-nb-del>Remover do período</button>' : ''}
          <button type="button" class="btn btn-secondary" data-rh-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>`);
    if (!box) return;

    const form = box.querySelector('[data-nb-form]');
    const acaoEl = form.elements.acao;
    const preview = box.querySelector('[data-nb-preview]');
    const errEl = box.querySelector('[data-nb-err]');
    let ultimaRecomendacao = null;

    const valor = (name) => Number(form.querySelector(`input[name="${name}"]:checked`)?.value) || null;

    function atualizarPreview() {
      const d = valor('desempenho');
      const p = valor('potencial');
      const q = d && p ? quadrantes[`${d}-${p}`] : null;
      if (!q) {
        preview.innerHTML = '<p class="pdi-muted">Escolha desempenho e potencial para ver o quadrante.</p>';
        return;
      }
      preview.innerHTML = `
        <div class="rh-nb-preview__box" style="--nb-cor:${attr(q.cor)}">
          <strong>${esc(q.nome)}</strong>
          <span>Recomendação: ${esc(q.acao)}</span>
          <span class="pdi-muted">Investimento de RH: ${esc(q.investimento)}</span>
        </div>`;
      const atual = acaoEl.value.trim();
      if (!atual || atual === ultimaRecomendacao) acaoEl.value = q.acao;
      ultimaRecomendacao = q.acao;
    }

    if (posicao) {
      const q = quadrantes[`${posicao.desempenho}-${posicao.potencial}`];
      ultimaRecomendacao = q?.acao || null;
    }
    atualizarPreview();
    form.querySelectorAll('input[type="radio"]').forEach((r) => r.addEventListener('change', atualizarPreview));

    box.querySelector('[data-nb-usar-sug]')?.addEventListener('click', (e) => {
      const radio = form.querySelector(`input[name="desempenho"][value="${sugDes}"]`);
      if (radio) radio.checked = true;
      e.currentTarget.remove();
      atualizarPreview();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.hidden = true;
      const desempenho = valor('desempenho');
      const potencial = valor('potencial');
      if (!desempenho || !potencial) {
        errEl.textContent = 'Escolha o desempenho e o potencial.';
        errEl.hidden = false;
        return;
      }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await rhApi('/ninebox', {
          method: 'PUT',
          body: JSON.stringify({
            colaborador_id: colab.id,
            periodo,
            desempenho,
            potencial,
            justificativa: form.elements.justificativa.value,
            acao: acaoEl.value,
            risco_saida: form.elements.risco_saida.value || null,
            sucessor_de: form.elements.sucessor_de.value,
          }),
        });
        rhCloseModal();
        await onSaved?.();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
        btn.disabled = false;
      }
    });

    box.querySelector('[data-nb-del]')?.addEventListener('click', async () => {
      if (!confirm(`Remover ${colab.nome} do 9-Box no período ${periodo}?`)) return;
      try {
        await rhApi(`/ninebox/${encodeURIComponent(posicao.id)}`, { method: 'DELETE' });
        rhCloseModal();
        await onSaved?.();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  rhRegisterModule('ninebox', {
    label: '9-Box',
    async onOpen(container) {
      await load(container);
    },
  });

  /* ---------- Quadro do gestor ---------- */

  rhRegisterGestorWidget({
    id: 'ninebox',
    order: 40,
    async render(container) {
      const data = await rhApi('/ninebox');
      cacheQuadrantes(data.quadrantes);
      if (!data.total_posicionados && !data.total_colaboradores) {
        container.innerHTML = '';
        return;
      }
      const byKey = new Map(data.quadrantes.map((q) => [q.key, q]));
      let cells = '';
      for (const pot of [3, 2, 1]) {
        for (const des of [1, 2, 3]) {
          const q = byKey.get(`${des}-${pot}`);
          cells += `<div class="rh-nb-mini__cell${q.count ? '' : ' rh-nb-mini__cell--empty'}" style="--nb-cor:${attr(q.cor)}" title="${attr(q.nome)}"><span>${q.count}</span></div>`;
        }
      }
      const pend = data.nao_posicionados.length;
      container.innerHTML = `
        <article class="card rh-nb-widget">
          <h4 class="pdi-section-title">9-Box · ${esc(data.periodo)}</h4>
          <div class="rh-nb-widget__body">
            <div class="rh-nb-mini" aria-label="Contagem por quadrante (potencial no eixo vertical, desempenho no horizontal)">${cells}</div>
            <div class="rh-nb-widget__info">
              <p><strong>${data.total_posicionados}</strong> posicionado(s)</p>
              <p>${pend ? `<span class="pdi-badge pdi-badge--warn">${pend} não posicionado(s)</span>` : '<span class="pdi-badge pdi-badge--ativo">Todos posicionados</span>'}</p>
              ${data.sucessao.riscos.length ? `<p><span class="pdi-badge pdi-badge--danger">${data.sucessao.riscos.length} risco(s) de saída</span></p>` : ''}
              ${typeof rhGoTo === 'function' ? '<button type="button" class="btn btn-ghost btn-sm" data-nb-goto>Abrir 9-Box</button>' : ''}
            </div>
          </div>
        </article>`;
      container.querySelector('[data-nb-goto]')?.addEventListener('click', () => rhGoTo('ninebox'));
    },
  });

  /* ---------- Bloco na ficha do colaborador ---------- */

  async function renderColab(container, colaborador) {
    const data = await rhApi(`/ninebox/colaborador/${encodeURIComponent(colaborador.id)}`);
    const atual = data.historico.find((h) => h.periodo === data.periodo_atual) || null;
    const ultimo = atual || data.historico[0] || null;
    const posicaoHtml = ultimo
      ? `<div class="rh-nb-pos" style="--nb-cor:${attr(ultimo.quadrante?.cor)}">
          <div class="rh-nb-pos__head">
            ${quadBadge(ultimo.quadrante)}
            <span class="pdi-muted">${esc(ultimo.periodo)}${atual ? '' : ' (último período avaliado)'} · desempenho ${NIVEIS[ultimo.desempenho].toLowerCase()}, potencial ${NIVEIS[ultimo.potencial].toLowerCase()}</span>
            ${riscoBadge(ultimo.risco_saida)}
          </div>
          <p><strong>Ação:</strong> ${esc(ultimo.acao || ultimo.quadrante?.acao || '—')}</p>
          ${ultimo.sucessor_de ? `<p><strong>Sucessor(a) de:</strong> ${esc(ultimo.sucessor_de)}</p>` : ''}
          ${ultimo.justificativa ? `<p class="pdi-muted">${esc(ultimo.justificativa)}</p>` : ''}
        </div>`
      : '<p class="pdi-muted">Ainda não posicionado no 9-Box.</p>';
    const hist = data.historico.length > 1
      ? `<h5 class="rh-nb-sub">Histórico</h5>
         <ul class="rh-nb-hist">${data.historico.map((h) => `
           <li><span class="rh-nb-hist__per">${esc(h.periodo)}</span> ${quadBadge(h.quadrante)} <span class="pdi-muted">D${h.desempenho} · P${h.potencial}</span></li>`).join('')}</ul>`
      : '';
    container.innerHTML = `
      <div class="card rh-nb-colab">
        <div class="rh-nb-colab__head">
          <h4 class="pdi-section-title">9-Box</h4>
          <button type="button" class="btn btn-secondary btn-sm" data-nb-pos>${atual ? 'Editar' : 'Posicionar'} em ${esc(data.periodo_atual)}</button>
        </div>
        ${posicaoHtml}
        ${hist}
      </div>`;
    container.querySelector('[data-nb-pos]')?.addEventListener('click', () => {
      abrirModal({
        colab: data.colaborador,
        periodo: data.periodo_atual,
        posicao: atual,
        sugestao: data.sugestao,
        onSaved: () => renderColab(container, colaborador),
      }).catch((err) => alert(err.message));
    });
  }

  rhRegisterColabSection({
    id: 'ninebox',
    order: 30,
    render: renderColab,
  });
})();
