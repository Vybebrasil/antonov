/* RH · Bem-estar — alerta precoce de risco de esgotamento (sinais observáveis, não diagnóstico) */

(() => {
  const NIVEL = {
    baixo: { label: 'Baixo', cls: 'rh-level--ok', acao: 'Monitorar' },
    medio: { label: 'Médio', cls: 'rh-level--warn', acao: 'Ação do gestor' },
    alto: { label: 'Alto', cls: 'rh-level--high', acao: 'Ação do RH + gestor' },
    critico: { label: 'Crítico', cls: 'rh-level--crit', acao: 'Intervenção imediata + apoio profissional' },
  };
  const state = {
    defs: null,
    moduleContainer: null,
    colabHosts: [],
    widgetHosts: [],
  };

  const esc = (s) => pdiEsc(s).replace(/"/g, '&quot;');
  const fmt = (d) => pdiFmtDate(d);

  function hoje() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  }

  function addDias(iso, n) {
    const dt = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(dt.getTime())) return '';
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  }

  function nivelPorScore(score) {
    if (score >= 9) return 'critico';
    if (score >= 6) return 'alto';
    if (score >= 3) return 'medio';
    return 'baixo';
  }

  function badge(nivel) {
    const n = NIVEL[nivel] || NIVEL.baixo;
    return `<span class="rh-level ${n.cls}">${n.label}</span>`;
  }

  function trendHtml(item) {
    if (!item || item.tendencia == null) return '<span class="rh-be-trend rh-be-trend--none" title="Sem checagem anterior">—</span>';
    if (item.tendencia === 'subiu') return `<span class="rh-be-trend rh-be-trend--up" title="Piorou em relação à checagem anterior">↑ +${item.delta}</span>`;
    if (item.tendencia === 'desceu') return `<span class="rh-be-trend rh-be-trend--down" title="Melhorou em relação à checagem anterior">↓ ${item.delta}</span>`;
    return '<span class="rh-be-trend rh-be-trend--flat" title="Igual à checagem anterior">= 0</span>';
  }

  async function loadDefs() {
    if (!state.defs) state.defs = await rhApi('/bemestar/indicadores');
    return state.defs;
  }

  /** Mesma regra do servidor, só para pré-visualização (o servidor recalcula ao salvar). */
  function sugestao(defs, marcadas) {
    const score = marcadas.size;
    const nivel = nivelPorScore(score);
    const grupos = defs.grupos.map((g) => g.chave)
      .filter((g) => defs.indicadores.some((i) => i.grupo === g && marcadas.has(i.chave)));
    const base = defs.planos.nivel[nivel];
    const ind = [...base.individual, ...grupos.map((g) => defs.planos.grupo[g].individual)];
    const est = [...base.estrutural, ...grupos.map((g) => defs.planos.grupo[g].estrutural)];
    return {
      score,
      nivel,
      plano_individual: ind.map((t) => `- ${t}`).join('\n'),
      plano_estrutural: est.map((t) => `- ${t}`).join('\n'),
      dias: defs.acompanhamento_dias[nivel],
    };
  }

  function prune(list) {
    return list.filter((h) => h.host.isConnected);
  }

  async function refreshAll() {
    if (state.moduleContainer?.isConnected) await renderModule(state.moduleContainer);
    state.colabHosts = prune(state.colabHosts);
    state.colabHosts.forEach(({ host, colaborador }) => renderColab(host, colaborador).catch(() => {}));
    state.widgetHosts = prune(state.widgetHosts);
    state.widgetHosts.forEach(({ host }) => renderWidget(host).catch(() => {}));
  }

  const AVISO_CONF = `
    <div class="rh-be-notice" role="note">
      <strong>Confidencial.</strong> Dados sensíveis de bem-estar, de uso restrito do RH e da gestão.
      Não compartilhe com a equipe sem consentimento do colaborador. Esta ferramenta registra
      <em>sinais observáveis</em> e um nível de <em>risco</em>; não é diagnóstico médico.
    </div>`;

  /* ---------- Aba do módulo ---------- */

  async function renderModule(container) {
    state.moduleContainer = container;
    container.innerHTML = '<div class="card"><p class="pdi-muted">Carregando…</p></div>';
    const [data] = await Promise.all([rhApi('/bemestar'), loadDefs()]);

    const stat = (val, lbl, cls = '') => `
      <div class="pdi-stat ${cls}"><span class="pdi-stat__val">${val}</span><span class="pdi-stat__lbl">${lbl}</span></div>`;

    const itens = data.colaboradores.map((c) => `
      <li class="rh-be-item rh-be-item--${esc(c.nivel)}">
        <div class="rh-be-item__who">
          <strong>${pdiEsc(c.nome)}</strong>
          <span class="pdi-muted">${pdiEsc(c.cargo_atual || '')}</span>
        </div>
        <div class="rh-be-item__risk">
          ${badge(c.nivel)}
          <span class="rh-be-score" title="Indicadores marcados">${c.score}/12</span>
          ${trendHtml(c)}
        </div>
        <div class="rh-be-item__dates">
          <span>Última: ${fmt(c.data)}</span>
          ${c.acompanhamento_vencido
            ? `<span class="pdi-badge pdi-badge--danger">Acompanhamento vencido há ${c.dias_vencido} dia${c.dias_vencido === 1 ? '' : 's'}</span>`
            : `<span class="pdi-muted">Próximo: ${fmt(c.acompanhamento_em)}</span>`}
        </div>
        <div class="rh-be-item__actions">
          <button type="button" class="btn btn-ghost btn-sm" data-be-hist="${esc(c.colaborador_id)}">Histórico</button>
          <button type="button" class="btn btn-secondary btn-sm" data-be-new="${esc(c.colaborador_id)}">Nova checagem</button>
        </div>
      </li>`).join('');

    const sem = data.sem_checagem.map((c) => `
      <li class="rh-be-pending">
        <span>${pdiEsc(c.nome)} <span class="pdi-muted">${pdiEsc(c.cargo_atual || '')}</span></span>
        <button type="button" class="btn btn-ghost btn-sm" data-be-new="${esc(c.colaborador_id)}">Fazer checagem</button>
      </li>`).join('');

    container.innerHTML = `
      <div class="rh-view-head">
        <div>
          <h3>Bem-estar</h3>
          <p>Alerta precoce de risco de esgotamento a partir de 12 sinais observáveis.</p>
        </div>
        <div class="rh-view-head__actions">
          <button type="button" class="btn btn-primary" data-be-new="">Nova checagem</button>
        </div>
      </div>
      ${AVISO_CONF}
      <div class="pdi-stats rh-be-stats">
        ${stat(data.por_nivel.critico, 'Crítico', data.por_nivel.critico ? 'pdi-stat--warn rh-be-stat--crit' : '')}
        ${stat(data.por_nivel.alto, 'Alto', data.por_nivel.alto ? 'pdi-stat--warn' : '')}
        ${stat(data.por_nivel.medio, 'Médio')}
        ${stat(data.por_nivel.baixo, 'Baixo')}
        ${stat(data.vencidos, 'Acompanhamentos vencidos', data.vencidos ? 'pdi-stat--warn' : '')}
        ${stat(data.sem_checagem_total, 'Sem checagem')}
      </div>
      <div class="card">
        <h4 class="pdi-section-title">Colaboradores por risco</h4>
        ${itens ? `<ul class="rh-be-list">${itens}</ul>` : '<p class="rh-empty">Nenhuma checagem registrada ainda.</p>'}
      </div>
      ${sem ? `
        <div class="card">
          <h4 class="pdi-section-title">Sem checagem (${data.sem_checagem_total})</h4>
          <ul class="rh-be-pending-list">${sem}</ul>
        </div>` : ''}
    `;
    bindActions(container);
  }

  function bindActions(root) {
    root.querySelectorAll('[data-be-new]').forEach((btn) => btn.addEventListener('click', () => {
      openForm({ colaboradorId: btn.dataset.beNew || null }).catch((err) => alert(err.message));
    }));
    root.querySelectorAll('[data-be-hist]').forEach((btn) => btn.addEventListener('click', () => {
      openHistory(btn.dataset.beHist).catch((err) => alert(err.message));
    }));
  }

  /* ---------- Formulário (modal) ---------- */

  async function openForm({ colaboradorId = null, check = null } = {}) {
    const [defs, colaboradores] = await Promise.all([loadDefs(), rhColaboradores()]);
    const editing = !!check;
    const marcadas = new Set(editing ? Object.keys(check.indicadores).filter((k) => check.indicadores[k]) : []);
    const selColab = editing ? check.colaborador_id : colaboradorId;
    const data0 = editing ? check.data : hoje();
    const sug0 = sugestao(defs, marcadas);

    const opts = colaboradores.map((c) => `
      <option value="${esc(c.id)}" ${String(c.id) === String(selColab) ? 'selected' : ''}>${pdiEsc(c.nome)}</option>`).join('');
    const periodos = [];
    for (let n = defs.periodo.min; n <= defs.periodo.max; n++) {
      const cur = editing ? check.periodo_semanas : defs.periodo.padrao;
      periodos.push(`<option value="${n}" ${n === cur ? 'selected' : ''}>${n} semanas</option>`);
    }

    const blocos = defs.grupos.map((g) => `
      <fieldset class="rh-be-group">
        <legend>${pdiEsc(g.titulo)} <span class="rh-be-group__count" data-be-count="${esc(g.chave)}"></span></legend>
        <p class="pdi-muted rh-be-group__desc">${pdiEsc(g.descricao)}</p>
        ${defs.indicadores.filter((i) => i.grupo === g.chave).map((i) => `
          <label class="rh-be-check">
            <input type="checkbox" name="ind" value="${esc(i.chave)}" ${marcadas.has(i.chave) ? 'checked' : ''}>
            <span class="rh-be-check__text">
              <strong>${pdiEsc(i.titulo)}</strong>
              <small>${pdiEsc(i.descricao)}</small>
            </span>
          </label>`).join('')}
      </fieldset>`).join('');

    const box = rhOpenModal(`
      <h3>${editing ? 'Editar checagem de bem-estar' : 'Nova checagem de bem-estar'}</h3>
      <p class="pdi-muted rh-be-modal-sub">Marque apenas o que foi <strong>observado</strong> no período. Sinais isolados podem ter outras causas; considere o contexto.</p>
      <form class="pdi-form rh-be-form" novalidate>
        <div class="rh-be-row">
          <label><span>Colaborador</span>
            <select name="colaborador_id" required>
              <option value="">Selecione…</option>${opts}
            </select>
          </label>
          <label><span>Data da checagem</span><input type="date" name="data" value="${esc(data0)}" max="${esc(hoje())}" required></label>
          <label><span>Período observado</span><select name="periodo_semanas">${periodos.join('')}</select></label>
        </div>

        ${blocos}

        <div class="rh-be-live" data-be-live aria-live="polite"></div>

        <div class="rh-be-plan-head">
          <h4 class="pdi-section-title">Plano de mitigação</h4>
          <button type="button" class="btn btn-ghost btn-sm" data-be-sug>Usar sugestão</button>
        </div>
        <label><span>Plano individual (colaborador e gestor)</span>
          <textarea name="plano_individual" rows="6">${pdiEsc(editing ? check.plano_individual || '' : sug0.plano_individual)}</textarea>
        </label>
        <label><span>Plano estrutural (equipe / grade / escala)</span>
          <textarea name="plano_estrutural" rows="4">${pdiEsc(editing ? check.plano_estrutural || '' : sug0.plano_estrutural)}</textarea>
        </label>
        <div class="rh-be-row">
          <label><span>Próximo acompanhamento</span>
            <input type="date" name="acompanhamento_em" value="${esc(editing ? check.acompanhamento_em || '' : addDias(data0, sug0.dias))}">
          </label>
        </div>
        <label><span>Observações (fatos concretos, sem julgamentos)</span>
          <textarea name="observacoes" rows="3">${pdiEsc(editing ? check.observacoes || '' : '')}</textarea>
        </label>
        <p class="pdi-muted rh-be-disclaimer">${pdiEsc(defs.aviso)}</p>
        <p class="form-error" data-be-err hidden></p>
        <div class="modal-actions">
          ${editing ? '<button type="button" class="btn btn-danger" data-be-del>Excluir</button>' : ''}
          <button type="button" class="btn btn-secondary" data-rh-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">${editing ? 'Salvar alterações' : 'Registrar checagem'}</button>
        </div>
      </form>
    `);
    if (!box) return;

    const form = box.querySelector('form');
    const live = box.querySelector('[data-be-live]');
    const taInd = form.elements.plano_individual;
    const taEst = form.elements.plano_estrutural;
    const acomp = form.elements.acompanhamento_em;
    const dirty = { ind: editing, est: editing, acomp: editing };
    taInd.addEventListener('input', () => { dirty.ind = true; });
    taEst.addEventListener('input', () => { dirty.est = true; });
    acomp.addEventListener('input', () => { dirty.acomp = true; });

    function update() {
      const set = new Set([...form.querySelectorAll('input[name="ind"]:checked')].map((i) => i.value));
      const s = sugestao(defs, set);
      const n = NIVEL[s.nivel];
      defs.grupos.forEach((g) => {
        const qtd = defs.indicadores.filter((i) => i.grupo === g.chave && set.has(i.chave)).length;
        const el = box.querySelector(`[data-be-count="${g.chave}"]`);
        if (el) el.textContent = `${qtd}/4`;
      });
      live.className = `rh-be-live rh-be-live--${s.nivel}`;
      live.innerHTML = `
        <div class="rh-be-live__score"><span>${s.score}</span><small>/12</small></div>
        <div class="rh-be-live__info">
          <div>Risco ${badge(s.nivel)}</div>
          <div class="rh-be-live__acao">${pdiEsc(n.acao)} · acompanhar em ${s.dias} dia${s.dias === 1 ? '' : 's'}</div>
          <small class="pdi-muted">Prévia. O nível oficial é calculado pelo sistema ao salvar.</small>
        </div>
        ${s.nivel === 'critico' ? `
          <div class="rh-be-live__alert">
            Recomende com cuidado <strong>apoio profissional</strong> (psicólogo e/ou médico do trabalho).
            Se houver sofrimento extremo ou menção a se machucar, acione imediatamente o <strong>CVV 188</strong> (24h) e o RH.
          </div>` : ''}`;
      if (!dirty.ind) taInd.value = s.plano_individual;
      if (!dirty.est) taEst.value = s.plano_estrutural;
      if (!dirty.acomp && form.elements.data.value) acomp.value = addDias(form.elements.data.value, s.dias);
      return s;
    }

    form.querySelectorAll('input[name="ind"]').forEach((cb) => cb.addEventListener('change', update));
    form.elements.data.addEventListener('change', update);
    box.querySelector('[data-be-sug]').addEventListener('click', () => {
      dirty.ind = false; dirty.est = false; dirty.acomp = false;
      update();
    });
    update();

    const errEl = box.querySelector('[data-be-err]');
    const showErr = (msg) => { errEl.textContent = msg; errEl.hidden = !msg; };

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      showErr('');
      const f = form.elements;
      if (!f.colaborador_id.value) return showErr('Selecione o colaborador.');
      if (!f.data.value) return showErr('Informe a data da checagem.');
      const indicadores = Object.fromEntries(defs.indicadores.map((i) => [i.chave, false]));
      form.querySelectorAll('input[name="ind"]:checked').forEach((cb) => { indicadores[cb.value] = true; });
      const payload = {
        colaborador_id: f.colaborador_id.value,
        data: f.data.value,
        periodo_semanas: Number(f.periodo_semanas.value),
        indicadores,
        plano_individual: f.plano_individual.value,
        plano_estrutural: f.plano_estrutural.value,
        acompanhamento_em: f.acompanhamento_em.value || null,
        observacoes: f.observacoes.value,
      };
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        if (editing) {
          await rhApi(`/bemestar/${check.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        } else {
          await rhApi('/bemestar', { method: 'POST', body: JSON.stringify(payload) });
        }
        rhCloseModal();
        await refreshAll();
      } catch (err) {
        showErr(err.message);
      } finally {
        submit.disabled = false;
      }
    });

    box.querySelector('[data-be-del]')?.addEventListener('click', async () => {
      if (!confirm('Excluir esta checagem de bem-estar? Esta ação não pode ser desfeita.')) return;
      try {
        await rhApi(`/bemestar/${check.id}`, { method: 'DELETE' });
        rhCloseModal();
        await refreshAll();
      } catch (err) {
        showErr(err.message);
      }
    });
  }

  /* ---------- Histórico (modal) ---------- */

  async function openHistory(colaboradorId) {
    const [data, defs] = await Promise.all([rhApi(`/bemestar/colaborador/${colaboradorId}`), loadDefs()]);
    const titulo = Object.fromEntries(defs.indicadores.map((i) => [i.chave, i.titulo]));
    const itens = data.checks.map((c) => {
      const marcados = Object.keys(c.indicadores).filter((k) => c.indicadores[k]);
      return `
        <li class="rh-be-hist">
          <div class="rh-be-hist__head">
            <strong>${fmt(c.data)}</strong>
            ${badge(c.nivel)}
            <span class="rh-be-score">${c.score}/12</span>
            ${trendHtml(c)}
            <span class="pdi-muted">${c.periodo_semanas} semanas observadas</span>
          </div>
          <div class="pdi-muted rh-be-hist__meta">
            Próximo acompanhamento: ${fmt(c.acompanhamento_em)}${c.registrado_por_nome ? ` · registrado por ${pdiEsc(c.registrado_por_nome)}` : ''}
          </div>
          ${marcados.length
            ? `<ul class="rh-be-hist__ind">${marcados.map((k) => `<li>${pdiEsc(titulo[k] || k)}</li>`).join('')}</ul>`
            : '<p class="pdi-muted">Nenhum sinal marcado.</p>'}
          <details class="rh-be-hist__details">
            <summary>Planos e observações</summary>
            ${c.plano_individual ? `<p><strong>Individual</strong></p><pre class="rh-be-pre">${pdiEsc(c.plano_individual)}</pre>` : ''}
            ${c.plano_estrutural ? `<p><strong>Estrutural</strong></p><pre class="rh-be-pre">${pdiEsc(c.plano_estrutural)}</pre>` : ''}
            ${c.observacoes ? `<p><strong>Observações</strong></p><pre class="rh-be-pre">${pdiEsc(c.observacoes)}</pre>` : ''}
          </details>
          <div class="rh-be-hist__actions">
            <button type="button" class="btn btn-ghost btn-sm" data-be-edit="${esc(c.id)}">Editar</button>
          </div>
        </li>`;
    }).join('');

    const box = rhOpenModal(`
      <h3>Bem-estar · ${pdiEsc(data.colaborador.nome)}</h3>
      ${AVISO_CONF}
      ${data.acompanhamento_vencido ? '<p class="pdi-badge pdi-badge--danger">Acompanhamento vencido</p>' : ''}
      ${itens ? `<ul class="rh-be-hist-list">${itens}</ul>` : '<p class="rh-empty">Nenhuma checagem registrada.</p>'}
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" data-rh-close>Fechar</button>
        <button type="button" class="btn btn-primary" data-be-new-hist>Nova checagem</button>
      </div>
    `);
    if (!box) return;
    box.querySelector('[data-be-new-hist]').addEventListener('click', () => {
      openForm({ colaboradorId }).catch((err) => alert(err.message));
    });
    box.querySelectorAll('[data-be-edit]').forEach((btn) => btn.addEventListener('click', () => {
      const check = data.checks.find((c) => String(c.id) === btn.dataset.beEdit);
      if (check) openForm({ check: { ...check, colaborador_id: data.colaborador.id } }).catch((err) => alert(err.message));
    }));
  }

  /* ---------- Quadro do gestor ---------- */

  async function renderWidget(container) {
    const data = await rhApi('/bemestar');
    const atencao = data.colaboradores.filter((c) => c.nivel === 'alto' || c.nivel === 'critico' || c.acompanhamento_vencido);
    if (!atencao.length) {
      container.innerHTML = '';
      return;
    }
    const max = 6;
    container.innerHTML = `
      <article class="card rh-be-widget">
        <h4 class="pdi-section-title">Bem-estar · atenção</h4>
        <ul class="rh-be-widget__list">
          ${atencao.slice(0, max).map((c) => `
            <li>
              <button type="button" class="rh-be-widget__name" data-be-hist="${esc(c.colaborador_id)}">${pdiEsc(c.nome)}</button>
              <span class="rh-be-widget__tags">
                ${badge(c.nivel)}
                ${c.acompanhamento_vencido ? '<span class="pdi-badge pdi-badge--danger">Vencido</span>' : ''}
              </span>
            </li>`).join('')}
        </ul>
        ${atencao.length > max ? `<p class="pdi-muted">+${atencao.length - max} colaborador(es)</p>` : ''}
        ${typeof rhGoTo === 'function' ? '<button type="button" class="btn btn-ghost btn-sm" data-be-goto>Abrir Bem-estar</button>' : ''}
      </article>`;
    bindActions(container);
    container.querySelector('[data-be-goto]')?.addEventListener('click', () => rhGoTo('bemestar'));
  }

  /* ---------- Bloco na ficha do colaborador ---------- */

  async function renderColab(container, colaborador) {
    const data = await rhApi(`/bemestar/colaborador/${colaborador.id}`);
    const u = data.ultima;
    container.innerHTML = `
      <div class="card rh-be-colab">
        <h4 class="pdi-section-title">Bem-estar <small class="pdi-muted">(confidencial)</small></h4>
        ${u ? `
          <div class="rh-be-colab__row">
            ${badge(u.nivel)}
            <span class="rh-be-score">${u.score}/12</span>
            ${trendHtml(u)}
            <span class="pdi-muted">Última checagem: ${fmt(u.data)}</span>
          </div>
          <p class="rh-be-colab__next">
            Próximo acompanhamento: <strong>${fmt(u.acompanhamento_em)}</strong>
            ${data.acompanhamento_vencido ? '<span class="pdi-badge pdi-badge--danger">Vencido</span>' : ''}
          </p>
          ${u.nivel === 'critico' ? '<p class="rh-be-colab__alert">Risco crítico: recomendar apoio profissional (psicólogo e/ou médico do trabalho).</p>' : ''}
        ` : '<p class="pdi-muted">Nenhuma checagem de bem-estar registrada.</p>'}
        <div class="rh-be-colab__actions">
          ${u ? `<button type="button" class="btn btn-ghost btn-sm" data-be-hist="${esc(colaborador.id)}">Histórico</button>` : ''}
          <button type="button" class="btn btn-secondary btn-sm" data-be-new="${esc(colaborador.id)}">Nova checagem</button>
        </div>
      </div>`;
    bindActions(container);
  }

  /* ---------- Registro ---------- */

  rhRegisterModule('bemestar', {
    label: 'Bem-estar',
    async onOpen(container) {
      state.defs = null;
      await renderModule(container);
    },
  });

  rhRegisterGestorWidget({
    id: 'bemestar',
    order: 15,
    async render(container) {
      state.widgetHosts = prune(state.widgetHosts).filter((h) => h.host !== container);
      state.widgetHosts.push({ host: container });
      await renderWidget(container);
    },
  });

  rhRegisterColabSection({
    id: 'bemestar',
    order: 40,
    async render(container, colaborador) {
      state.colabHosts = prune(state.colabHosts).filter((h) => h.host !== container);
      state.colabHosts.push({ host: container, colaborador });
      await renderColab(container, colaborador);
    },
  });
})();
