/* RH · Avaliação de desempenho (ciclos 90°: gestor + autoavaliação, escala 1-5, calibração e devolutiva) */

(() => {
  const BASE = '/avaliacao';

  const ESCALA = [
    { nota: 1, nome: 'Abaixo do esperado', desc: 'Abaixo do esperado, plano de melhoria necessário.' },
    { nota: 2, nome: 'Em desenvolvimento', desc: 'Em desenvolvimento, atingiu parcialmente.' },
    { nota: 3, nome: 'Atende', desc: 'Atende às expectativas.' },
    { nota: 4, nome: 'Excede', desc: 'Excede as expectativas.' },
    { nota: 5, nome: 'Excepcional', desc: 'Excepcional, referência para a equipe.' },
  ];

  const STATUS_CICLO = { aberto: 'Aberto', calibracao: 'Calibração', encerrado: 'Encerrado' };
  const STATUS_CICLO_BADGE = { aberto: 'ativo', calibracao: 'warn', encerrado: 'muted' };
  const TIPO_CICLO = { 90: '90° (gestor + autoavaliação)', gestor: 'Somente gestor' };

  const ROTEIRO_DEVOLUTIVA = [
    'Reserve uma conversa individual de cerca de 60 minutos, sem interrupções.',
    'Comece SEMPRE pelas forças: cite exemplos concretos do dia a dia com alunos e equipe.',
    'Compare a autoavaliação com a sua nota e converse sobre as maiores diferenças.',
    'Apresente só 2 a 3 pontos prioritários a desenvolver — não uma lista de defeitos.',
    'Construa junto o plano de ação de 90 dias (o que, como, quando) e combine o próximo acompanhamento.',
    'Feche perguntando como a pessoa se sentiu e o que ela precisa de você.',
  ];

  const state = {
    container: null,
    cicloId: null,
    lista: null,
    detail: null,
  };

  const esc = (s) => pdiEsc(s ?? '');
  const attr = (s) => esc(s).replace(/"/g, '&quot;');
  const fmtNota = (n) => (n == null || n === '' ? '—' : Number(n).toFixed(2).replace('.', ','));
  const notaEfetiva = (a) => (a.nota_calibrada ?? a.nota_final);
  const periodo = (c) => `${pdiFmtDate(c.periodo_inicio)} a ${pdiFmtDate(c.periodo_fim)}`;

  function notaLevel(n) {
    if (n == null) return 'rh-level--warn';
    const r = Math.round(Number(n));
    if (r >= 4) return 'rh-level--ok';
    if (r === 3) return 'rh-level--ok';
    if (r === 2) return 'rh-level--high';
    return 'rh-level--crit';
  }

  function statusBadge(status) {
    return status === 'concluida'
      ? '<span class="pdi-badge pdi-badge--ativo">Concluída</span>'
      : '<span class="pdi-badge pdi-badge--pending">Rascunho</span>';
  }

  function cicloBadge(status) {
    return `<span class="pdi-badge pdi-badge--${STATUS_CICLO_BADGE[status] || 'muted'}">${esc(STATUS_CICLO[status] || status)}</span>`;
  }

  function alertasHtml(dist) {
    if (!dist) return '';
    if (!dist.amostra_suficiente) {
      return `<p class="pdi-muted rh-av-note">Alerta de viés aparece a partir de 3 avaliações concluídas (${dist.total} até agora).</p>`;
    }
    if (!dist.alertas.length) {
      return `<p class="rh-av-alert rh-av-alert--ok">Distribuição sem viés forte (desvio do alvo: ${String(dist.desvio_alvo).replace('.', ',')}%).</p>`;
    }
    return dist.alertas.map((a) => `<p class="rh-av-alert rh-av-alert--warn">⚠ ${esc(a.mensagem)}</p>`).join('');
  }

  /* ---------- carregamento ---------- */

  async function loadLista() {
    state.lista = await rhApi(`${BASE}/ciclos`);
    return state.lista;
  }

  async function loadDetail(id) {
    state.detail = await rhApi(`${BASE}/ciclos/${encodeURIComponent(id)}`);
    return state.detail;
  }

  async function refresh() {
    if (!state.container) return;
    if (state.cicloId) {
      try {
        await loadDetail(state.cicloId);
        renderDetail();
        return;
      } catch (err) {
        state.cicloId = null;
      }
    }
    state.container.innerHTML = '<p class="pdi-muted rh-empty">Carregando ciclos…</p>';
    await loadLista();
    renderLista();
  }

  /* ---------- lista de ciclos ---------- */

  function renderLista() {
    const el = state.container;
    const { ciclos = [], total_colaboradores: totalColab = 0 } = state.lista || {};
    const cards = ciclos.map((c) => {
      const pct = totalColab ? Math.min(100, Math.round((c.concluidas / totalColab) * 100)) : 0;
      return `
        <article class="card rh-av-ciclo" data-id="${attr(c.id)}">
          <div class="rh-av-ciclo__top">
            <div>
              <h4 class="rh-av-ciclo__nome">${esc(c.nome)}</h4>
              <p class="pdi-muted">${esc(periodo(c))} · ${esc(TIPO_CICLO[c.tipo] || c.tipo)}</p>
            </div>
            ${cicloBadge(c.status)}
          </div>
          <div class="rh-av-progress">
            <div class="pdi-progress"><span style="width:${pct}%"></span></div>
            <span class="pdi-muted">${c.concluidas}/${totalColab} concluídas · ${c.total_avaliacoes} iniciadas</span>
          </div>
          <div class="rh-av-ciclo__actions">
            <button type="button" class="btn btn-primary btn-sm" data-av-open="${attr(c.id)}">Abrir</button>
            <button type="button" class="btn btn-secondary btn-sm" data-av-edit="${attr(c.id)}">Editar</button>
            <button type="button" class="btn btn-ghost btn-sm" data-av-del="${attr(c.id)}">Excluir</button>
          </div>
        </article>`;
    }).join('');

    el.innerHTML = `
      <div class="rh-view-head">
        <div>
          <h3>Avaliação de desempenho</h3>
          <p>Ciclos 90° (gestor + autoavaliação), escala 1-5, calibração e devolutiva com plano de 90 dias.</p>
        </div>
        <div class="rh-view-head__actions">
          <button type="button" class="btn btn-primary" data-av-new>Novo ciclo</button>
        </div>
      </div>
      ${ciclos.length
        ? `<div class="rh-av-ciclos">${cards}</div>`
        : `<div class="card rh-empty">Nenhum ciclo de avaliação ainda. Crie o primeiro (ex.: “1º semestre ${new Date().getFullYear()}”) — as 10 competências padrão já vêm prontas.</div>`}
    `;

    el.querySelector('[data-av-new]')?.addEventListener('click', () => openCicloModal(null));
    el.querySelectorAll('[data-av-open]').forEach((b) => b.addEventListener('click', () => openCiclo(b.dataset.avOpen)));
    el.querySelectorAll('[data-av-edit]').forEach((b) => b.addEventListener('click', () => {
      const c = ciclos.find((x) => x.id === b.dataset.avEdit);
      if (c) openCicloModal(c);
    }));
    el.querySelectorAll('[data-av-del]').forEach((b) => b.addEventListener('click', () => removeCiclo(b.dataset.avDel)));
  }

  async function openCiclo(id) {
    state.cicloId = id;
    state.container.innerHTML = '<p class="pdi-muted rh-empty">Carregando ciclo…</p>';
    try {
      await loadDetail(id);
      renderDetail();
    } catch (err) {
      state.cicloId = null;
      alert(err.message);
      await refresh();
    }
  }

  async function removeCiclo(id) {
    if (!confirm('Excluir este ciclo e TODAS as avaliações dele? Essa ação não pode ser desfeita.')) return;
    try {
      await rhApi(`${BASE}/ciclos/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (state.cicloId === id) state.cicloId = null;
      await refresh();
    } catch (err) {
      alert(err.message);
    }
  }

  /* ---------- modal de ciclo ---------- */

  function compRowHtml(c) {
    return `
      <div class="rh-av-comp-row" data-chave="${attr(c.chave || '')}">
        <input type="text" class="rh-av-comp-nome" placeholder="Nome da competência" value="${attr(c.nome || '')}" maxlength="120" aria-label="Nome da competência">
        <select class="rh-av-comp-tipo" aria-label="Tipo">
          <option value="hard"${c.tipo !== 'soft' ? ' selected' : ''}>Técnica (hard)</option>
          <option value="soft"${c.tipo === 'soft' ? ' selected' : ''}>Comportamental (soft)</option>
        </select>
        <input type="text" class="rh-av-comp-desc" placeholder="O que se observa (opcional)" value="${attr(c.descricao || '')}" maxlength="500" aria-label="Descrição">
        <button type="button" class="btn btn-ghost btn-sm rh-av-comp-del" title="Remover" aria-label="Remover competência">✕</button>
      </div>`;
  }

  async function openCicloModal(ciclo) {
    let padrao = state.lista?.competencias_padrao;
    if (!padrao) {
      try { padrao = (await loadLista()).competencias_padrao; } catch { padrao = []; }
    }
    const comps = ciclo?.competencias?.length ? ciclo.competencias : padrao;
    const year = new Date().getFullYear();
    const box = rhOpenModal(`
      <h3>${ciclo ? 'Editar ciclo' : 'Novo ciclo de avaliação'}</h3>
      <form class="pdi-form rh-av-form" data-av-ciclo-form>
        <label><span>Nome</span><input name="nome" required maxlength="160" value="${attr(ciclo?.nome || '')}" placeholder="Ex.: 1º semestre ${year}"></label>
        <div class="rh-av-grid2">
          <label><span>Início do período</span><input type="date" name="periodo_inicio" required value="${attr(ciclo?.periodo_inicio || `${year}-01-01`)}"></label>
          <label><span>Fim do período</span><input type="date" name="periodo_fim" required value="${attr(ciclo?.periodo_fim || `${year}-06-30`)}"></label>
        </div>
        <div class="rh-av-grid2">
          <label><span>Tipo</span>
            <select name="tipo">
              <option value="90"${ciclo?.tipo !== 'gestor' ? ' selected' : ''}>90° — gestor + autoavaliação</option>
              <option value="gestor"${ciclo?.tipo === 'gestor' ? ' selected' : ''}>Somente gestor</option>
            </select>
          </label>
          <label><span>Etapa</span>
            <select name="status">
              ${Object.entries(STATUS_CICLO).map(([k, v]) => `<option value="${k}"${(ciclo?.status || 'aberto') === k ? ' selected' : ''}>${v}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="pdi-section-title">Competências avaliadas</div>
        <p class="pdi-muted rh-av-note">Competências variam por cargo/nível, não por pessoa. Padrão: 5 técnicas + 5 comportamentais adaptadas à academia.</p>
        <div class="rh-av-comp-list" data-av-comps>${comps.map(compRowHtml).join('')}</div>
        <div class="rh-av-comp-tools">
          <button type="button" class="btn btn-secondary btn-sm" data-av-comp-add>+ Competência</button>
          <button type="button" class="btn btn-ghost btn-sm" data-av-comp-reset>Restaurar padrão</button>
        </div>
        ${ciclo ? '<p class="pdi-muted rh-av-note">Ao mudar competências, as notas finais das avaliações do ciclo são recalculadas.</p>' : ''}
        <p class="form-error" data-av-err hidden></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-rh-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">${ciclo ? 'Salvar' : 'Criar ciclo'}</button>
        </div>
      </form>
    `);
    if (!box) return;
    const list = box.querySelector('[data-av-comps]');
    const bindDel = () => list.querySelectorAll('.rh-av-comp-del').forEach((b) => {
      b.onclick = () => b.closest('.rh-av-comp-row')?.remove();
    });
    bindDel();
    box.querySelector('[data-av-comp-add]').addEventListener('click', () => {
      list.insertAdjacentHTML('beforeend', compRowHtml({ tipo: 'hard' }));
      bindDel();
      list.lastElementChild?.querySelector('input')?.focus();
    });
    box.querySelector('[data-av-comp-reset]').addEventListener('click', () => {
      if (!confirm('Substituir a lista pelas competências padrão?')) return;
      list.innerHTML = padrao.map(compRowHtml).join('');
      bindDel();
    });
    box.querySelector('[data-av-ciclo-form]').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.currentTarget;
      const errEl = box.querySelector('[data-av-err]');
      errEl.hidden = true;
      const competencias = [...list.querySelectorAll('.rh-av-comp-row')].map((row) => ({
        chave: row.dataset.chave || undefined,
        nome: row.querySelector('.rh-av-comp-nome').value,
        tipo: row.querySelector('.rh-av-comp-tipo').value,
        descricao: row.querySelector('.rh-av-comp-desc').value,
      })).filter((c) => c.nome.trim());
      const payload = {
        nome: f.nome.value,
        periodo_inicio: f.periodo_inicio.value,
        periodo_fim: f.periodo_fim.value,
        tipo: f.tipo.value,
        status: f.status.value,
        competencias,
      };
      const btn = f.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        const data = ciclo
          ? await rhApi(`${BASE}/ciclos/${encodeURIComponent(ciclo.id)}`, { method: 'PATCH', body: JSON.stringify(payload) })
          : await rhApi(`${BASE}/ciclos`, { method: 'POST', body: JSON.stringify(payload) });
        rhCloseModal();
        if (!ciclo) state.cicloId = data.ciclo.id;
        await refresh();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---------- detalhe do ciclo ---------- */

  function distribuicaoHtml(dist) {
    const max = Math.max(60, ...dist.faixas.map((f) => f.pct));
    const rows = dist.faixas.map((f) => {
      const e = ESCALA[f.nota - 1];
      return `
        <div class="rh-av-dist__row">
          <div class="rh-av-dist__lbl"><strong>${f.nota}</strong> <span>${esc(e.nome)}</span></div>
          <div class="rh-av-dist__bars">
            <div class="rh-av-dist__bar rh-av-dist__bar--real" style="width:${(f.pct / max) * 100}%"></div>
            <div class="rh-av-dist__bar rh-av-dist__bar--alvo" style="width:${(f.alvo / max) * 100}%"></div>
          </div>
          <div class="rh-av-dist__val">${f.qtd} · ${String(f.pct).replace('.', ',')}% <span class="pdi-muted">/ ${f.alvo}%</span></div>
        </div>`;
    }).join('');
    return `
      <div class="rh-av-dist">
        <div class="rh-av-dist__legend">
          <span><i class="rh-av-sw rh-av-sw--real"></i>Real (${dist.total} concluídas)</span>
          <span><i class="rh-av-sw rh-av-sw--alvo"></i>Alvo 5/15/60/15/5</span>
        </div>
        ${rows}
      </div>`;
  }

  function gapHtml(dist, tipo) {
    if (tipo === 'gestor') return '';
    const items = dist.gap_competencias.filter((g) => g.n > 0);
    if (!items.length) return '<p class="pdi-muted rh-av-note">Sem autoavaliações registradas ainda para comparar.</p>';
    return `
      <div class="rh-av-gap">
        ${items.map((g) => {
          const d = g.diferenca;
          const cls = Math.abs(d) >= 1 ? 'rh-av-gap__diff--big' : '';
          const txt = d > 0 ? `+${String(d).replace('.', ',')}` : String(d).replace('.', ',');
          return `
            <div class="rh-av-gap__row">
              <span class="rh-av-gap__nome">${esc(g.nome)}</span>
              <span class="rh-av-gap__nums">Gestor ${fmtNota(g.media_gestor)} · Auto ${fmtNota(g.media_auto)}</span>
              <span class="rh-av-gap__diff ${cls}" title="Auto − gestor">${txt}</span>
            </div>`;
        }).join('')}
      </div>
      <p class="pdi-muted rh-av-note">Diferença = auto − gestor (média). Positivo: a pessoa se vê melhor do que o gestor a vê. Use as maiores diferenças na devolutiva.</p>`;
  }

  function avaliacaoRowHtml(a, ciclo) {
    const podeCalibrar = a.status === 'concluida' && ciclo.status !== 'encerrado';
    const pts = a.pontos_desenvolver?.length ? a.pontos_desenvolver.map(esc).join(' · ') : '';
    return `
      <div class="rh-av-row" data-id="${attr(a.id)}">
        <div class="rh-av-row__main">
          <div class="rh-av-row__nome">${esc(a.colaborador_nome)}</div>
          <div class="pdi-muted">${esc(a.colaborador_cargo || 'Sem cargo')}${a.devolutiva_em ? ` · devolutiva ${pdiFmtDate(a.devolutiva_em)}` : ''}</div>
          ${pts ? `<div class="rh-av-row__pts">A desenvolver: ${pts}</div>` : ''}
        </div>
        <div class="rh-av-row__meta">
          ${statusBadge(a.status)}
          <span class="rh-level ${notaLevel(a.nota_final)}" title="Média das notas do gestor">Nota ${fmtNota(a.nota_final)}</span>
        </div>
        <label class="rh-av-row__cal">
          <span>Calibrada</span>
          <input type="number" min="1" max="5" step="0.1" inputmode="decimal" value="${a.nota_calibrada ?? ''}" placeholder="—" data-av-cal="${attr(a.id)}" ${podeCalibrar ? '' : 'disabled'} title="${podeCalibrar ? 'Nota após a calibração (vazio = usa a nota final)' : 'Disponível para avaliações concluídas em ciclos não encerrados'}">
        </label>
        <div class="rh-av-row__actions">
          <button type="button" class="btn btn-primary btn-sm" data-av-form="${attr(a.id)}">${a.status === 'concluida' ? 'Ver' : 'Avaliar'}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-av-del-av="${attr(a.id)}" ${ciclo.status === 'encerrado' ? 'disabled' : ''}>Excluir</button>
        </div>
      </div>`;
  }

  function renderDetail() {
    const el = state.container;
    const { ciclo, avaliacoes, progresso, distribuicao: dist } = state.detail;
    const rascunhos = avaliacoes.filter((a) => a.status !== 'concluida').length;
    const semAv = Math.max(0, progresso.colaboradores - progresso.avaliacoes);
    const efetivas = avaliacoes.filter((a) => a.status === 'concluida').map(notaEfetiva).filter((n) => n != null);
    const media = efetivas.length ? efetivas.reduce((s, n) => s + Number(n), 0) / efetivas.length : null;
    const encerrado = ciclo.status === 'encerrado';
    const proxStatus = ciclo.status === 'aberto'
      ? { s: 'calibracao', l: 'Ir para calibração' }
      : ciclo.status === 'calibracao'
        ? { s: 'encerrado', l: 'Encerrar ciclo' }
        : { s: 'aberto', l: 'Reabrir ciclo' };

    el.innerHTML = `
      <div class="rh-view-head">
        <div>
          <button type="button" class="btn btn-ghost btn-sm rh-av-back" data-av-back>← Ciclos</button>
          <h3>${esc(ciclo.nome)} ${cicloBadge(ciclo.status)}</h3>
          <p>${esc(periodo(ciclo))} · ${esc(TIPO_CICLO[ciclo.tipo] || ciclo.tipo)} · ${ciclo.competencias.length} competências</p>
        </div>
        <div class="rh-view-head__actions">
          ${encerrado ? '' : '<button type="button" class="btn btn-primary" data-av-new-av>Avaliar colaborador</button>'}
          <button type="button" class="btn btn-secondary" data-av-status="${proxStatus.s}">${proxStatus.l}</button>
          <button type="button" class="btn btn-ghost" data-av-edit-ciclo>Editar ciclo</button>
        </div>
      </div>

      <div class="pdi-stats rh-av-stats">
        <div class="pdi-stat"><div class="pdi-stat__val">${progresso.concluidas}/${progresso.colaboradores}</div><div class="pdi-stat__lbl">Concluídas</div></div>
        <div class="pdi-stat${rascunhos ? ' pdi-stat--warn' : ''}"><div class="pdi-stat__val">${rascunhos}</div><div class="pdi-stat__lbl">Em rascunho</div></div>
        <div class="pdi-stat${semAv && !encerrado ? ' pdi-stat--warn' : ''}"><div class="pdi-stat__val">${semAv}</div><div class="pdi-stat__lbl">Sem avaliação</div></div>
        <div class="pdi-stat"><div class="pdi-stat__val">${fmtNota(media)}</div><div class="pdi-stat__lbl">Média (calibrada)</div></div>
      </div>
      <div class="rh-av-progress rh-av-progress--big">
        <div class="pdi-progress"><span style="width:${progresso.pct}%"></span></div>
        <span class="pdi-muted">${progresso.pct}% da equipe avaliada · meta: 100% no prazo</span>
      </div>

      <div class="rh-av-cols">
        <section class="card rh-av-panel">
          <div class="pdi-section-title">Distribuição das notas</div>
          ${alertasHtml(dist)}
          ${distribuicaoHtml(dist)}
          <p class="pdi-muted rh-av-note">Faixa = nota calibrada (ou final) arredondada. Sem calibração, a tendência é quase todos ficarem com 4-5 (leniência).</p>
        </section>
        <section class="card rh-av-panel">
          <div class="pdi-section-title">Gestor × autoavaliação por competência</div>
          ${gapHtml(dist, ciclo.tipo)}
        </section>
      </div>

      <section class="card rh-av-panel">
        <div class="pdi-section-title">Avaliações ${ciclo.status === 'calibracao' ? '<span class="pdi-badge pdi-badge--warn">Etapa de calibração: ajuste a nota calibrada</span>' : ''}</div>
        ${avaliacoes.length
          ? `<div class="rh-av-rows">${avaliacoes.map((a) => avaliacaoRowHtml(a, ciclo)).join('')}</div>`
          : '<p class="rh-empty">Nenhuma avaliação neste ciclo ainda. Clique em “Avaliar colaborador”.</p>'}
      </section>
    `;

    el.querySelector('[data-av-back]').addEventListener('click', async () => {
      state.cicloId = null;
      state.detail = null;
      await refresh();
    });
    el.querySelector('[data-av-new-av]')?.addEventListener('click', () => openNovaAvaliacao());
    el.querySelector('[data-av-edit-ciclo]').addEventListener('click', () => openCicloModal(ciclo));
    el.querySelector('[data-av-status]').addEventListener('click', async (ev) => {
      const s = ev.currentTarget.dataset.avStatus;
      if (s === 'encerrado' && !confirm('Encerrar o ciclo? As avaliações ficam somente leitura (dá para reabrir depois).')) return;
      try {
        await rhApi(`${BASE}/ciclos/${encodeURIComponent(ciclo.id)}`, { method: 'PATCH', body: JSON.stringify({ status: s }) });
        await refresh();
      } catch (err) { alert(err.message); }
    });
    el.querySelectorAll('[data-av-form]').forEach((b) => b.addEventListener('click', () => openAvaliacaoForm(b.dataset.avForm)));
    el.querySelectorAll('[data-av-del-av]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Excluir esta avaliação?')) return;
      try {
        await rhApi(`${BASE}/avaliacoes/${encodeURIComponent(b.dataset.avDelAv)}`, { method: 'DELETE' });
        await refresh();
      } catch (err) { alert(err.message); }
    }));
    el.querySelectorAll('[data-av-cal]').forEach((input) => input.addEventListener('change', async () => {
      const raw = input.value.trim().replace(',', '.');
      input.disabled = true;
      try {
        await rhApi(`${BASE}/avaliacoes/${encodeURIComponent(input.dataset.avCal)}`, {
          method: 'PATCH',
          body: JSON.stringify({ nota_calibrada: raw === '' ? null : Number(raw) }),
        });
        await refresh();
      } catch (err) {
        alert(err.message);
        input.disabled = false;
      }
    }));
  }

  async function openNovaAvaliacao() {
    const { ciclo, avaliacoes } = state.detail;
    let colabs = [];
    try { colabs = await rhColaboradores({ refresh: true }); } catch (err) { alert(err.message); return; }
    const jaTem = new Set(avaliacoes.map((a) => a.colaborador_id));
    const livres = colabs.filter((c) => !jaTem.has(c.id));
    const box = rhOpenModal(`
      <h3>Avaliar colaborador</h3>
      ${livres.length ? `
        <form class="pdi-form" data-av-new-form>
          <label><span>Colaborador</span>
            <select name="colaborador_id" required>
              ${livres.map((c) => `<option value="${attr(c.id)}">${esc(c.nome)}${c.cargo_atual ? ` — ${esc(c.cargo_atual)}` : ''}</option>`).join('')}
            </select>
          </label>
          <p class="pdi-muted rh-av-note">Ciclo: ${esc(ciclo.nome)}. A avaliação começa como rascunho.</p>
          <p class="form-error" data-av-err hidden></p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-rh-close>Cancelar</button>
            <button type="submit" class="btn btn-primary">Começar avaliação</button>
          </div>
        </form>` : `
        <p class="rh-empty">Todos os colaboradores ativos já têm avaliação neste ciclo.</p>
        <div class="modal-actions"><button type="button" class="btn btn-primary" data-rh-close>Fechar</button></div>`}
    `);
    box?.querySelector('[data-av-new-form]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const errEl = box.querySelector('[data-av-err]');
      try {
        const data = await rhApi(`${BASE}/ciclos/${encodeURIComponent(ciclo.id)}/avaliacoes`, {
          method: 'POST',
          body: JSON.stringify({ colaborador_id: ev.currentTarget.colaborador_id.value }),
        });
        await refresh();
        openAvaliacaoForm(data.avaliacao.id, data.avaliacao);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    });
  }

  /* ---------- formulário de avaliação ---------- */

  function segHtml(chave, quem, valor, disabled) {
    return `
      <div class="rh-av-seg" role="radiogroup" data-av-seg="${quem}" data-chave="${attr(chave)}">
        ${ESCALA.map((e) => `
          <button type="button" role="radio" class="rh-av-seg__btn${valor === e.nota ? ' is-on' : ''}" data-nota="${e.nota}"
            aria-checked="${valor === e.nota ? 'true' : 'false'}" title="${e.nota} — ${attr(e.desc)}" ${disabled ? 'disabled' : ''}>${e.nota}</button>`).join('')}
      </div>`;
  }

  function scaleHint(n) {
    const e = ESCALA[n - 1];
    return e ? `${e.nota} · ${e.desc}` : 'Sem nota';
  }

  async function openAvaliacaoForm(id, preloaded) {
    let av = preloaded && preloaded.competencias ? preloaded : null;
    if (!av) {
      try { av = (await rhApi(`${BASE}/avaliacoes/${encodeURIComponent(id)}`)).avaliacao; } catch (err) { alert(err.message); return; }
    }
    const comps = av.competencias || [];
    const com90 = av.ciclo_tipo !== 'gestor';
    const readOnly = av.ciclo_status === 'encerrado';
    const notas = { gestor: { ...av.notas_gestor }, auto: { ...av.notas_auto } };
    const pts = [...(av.pontos_desenvolver || []), '', '', ''].slice(0, 3);
    const dis = readOnly ? 'disabled' : '';

    const compBlocks = (tipo, titulo) => {
      const list = comps.filter((c) => c.tipo === tipo);
      if (!list.length) return '';
      return `
        <div class="pdi-section-title">${titulo}</div>
        ${list.map((c) => `
          <div class="rh-av-comp" data-comp="${attr(c.chave)}">
            <div class="rh-av-comp__head">
              <strong>${esc(c.nome)}</strong>
              ${c.descricao ? `<span class="pdi-muted">${esc(c.descricao)}</span>` : ''}
            </div>
            <div class="rh-av-comp__line">
              <span class="rh-av-comp__who">Gestor</span>
              ${segHtml(c.chave, 'gestor', notas.gestor[c.chave], readOnly)}
              <span class="rh-av-comp__hint" data-av-hint="gestor">${esc(scaleHint(notas.gestor[c.chave]))}</span>
            </div>
            ${com90 ? `
            <div class="rh-av-comp__line">
              <span class="rh-av-comp__who">Auto</span>
              ${segHtml(c.chave, 'auto', notas.auto[c.chave], readOnly)}
              <span class="rh-av-comp__hint" data-av-hint="auto">${esc(scaleHint(notas.auto[c.chave]))}</span>
            </div>` : ''}
          </div>`).join('')}`;
    };

    const box = rhOpenModal(`
      <div class="rh-av-formwrap">
        <h3>Avaliação · ${esc(av.colaborador_nome)}</h3>
        <p class="pdi-muted">${esc(av.ciclo_nome)} · ${pdiFmtDate(av.periodo_inicio)} a ${pdiFmtDate(av.periodo_fim)} · ${statusBadge(av.status)}${readOnly ? ' · <span class="pdi-badge pdi-badge--muted">Ciclo encerrado (somente leitura)</span>' : ''}</p>

        <details class="rh-av-guide">
          <summary>Escala 1-5 e roteiro da devolutiva</summary>
          <div class="rh-av-guide__body">
            <ul class="rh-av-scale">
              ${ESCALA.map((e, i) => `<li><strong>${e.nota}</strong> ${esc(e.desc)} <span class="pdi-muted">(esperado ≈ ${[5, 15, 60, 15, 5][i]}% da equipe)</span></li>`).join('')}
            </ul>
            <p class="pdi-muted">${com90 ? 'Registre na linha “Auto” o que o colaborador respondeu na conversa de autoavaliação. ' : ''}Avalie o período todo, não só as últimas semanas (viés de recência), e cada competência separadamente (efeito halo).</p>
            <ol class="rh-av-roteiro">${ROTEIRO_DEVOLUTIVA.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
          </div>
        </details>

        <form class="pdi-form rh-av-form" data-av-form-el>
          <div class="rh-av-media">Média do gestor: <strong data-av-media>${fmtNota(av.nota_final)}</strong>
            <span class="pdi-muted" data-av-count></span></div>
          ${compBlocks('hard', 'Competências técnicas')}
          ${compBlocks('soft', 'Competências comportamentais')}

          <div class="pdi-section-title">Devolutiva</div>
          <label><span>Pontos fortes (comece por aqui na conversa)</span>
            <textarea name="pontos_fortes" rows="3" maxlength="4000" ${dis} placeholder="Ex.: alunos elogiam a atenção nas correções; nunca falta ao turno.">${esc(av.pontos_fortes || '')}</textarea></label>
          <fieldset class="rh-av-pts">
            <legend>Pontos a desenvolver (2 a 3, prioritários)</legend>
            ${pts.map((p, i) => `<input type="text" name="pd${i}" maxlength="500" value="${attr(p)}" placeholder="${i < 2 ? 'Obrigatório para concluir' : 'Opcional'}" ${dis}>`).join('')}
          </fieldset>
          <label><span>Plano de ação de 90 dias</span>
            <textarea name="plano_90_dias" rows="4" maxlength="6000" ${dis} placeholder="O quê, como e até quando — ex.: acompanhar 2 aulas de colega sênior por mês; curso de avaliação física até 30/09.">${esc(av.plano_90_dias || '')}</textarea></label>
          <label class="rh-av-date"><span>Data da devolutiva</span>
            <input type="date" name="devolutiva_em" value="${attr(av.devolutiva_em || '')}" ${dis}></label>

          <p class="form-error" data-av-err hidden></p>
          <div class="modal-actions rh-av-actions">
            <button type="button" class="btn btn-ghost" data-rh-close>${readOnly ? 'Fechar' : 'Cancelar'}</button>
            ${readOnly ? '' : av.status === 'concluida'
              ? `<button type="button" class="btn btn-secondary" data-av-save="rascunho">Reabrir como rascunho</button>
                 <button type="button" class="btn btn-primary" data-av-save="concluida">Salvar</button>`
              : `<button type="button" class="btn btn-secondary" data-av-save="rascunho">Salvar rascunho</button>
                 <button type="button" class="btn btn-primary" data-av-save="concluida">Concluir avaliação</button>`}
          </div>
        </form>
      </div>
    `);
    if (!box) return;

    const mediaEl = box.querySelector('[data-av-media]');
    const countEl = box.querySelector('[data-av-count]');
    const updateMedia = () => {
      const vals = comps.map((c) => notas.gestor[c.chave]).filter((n) => Number.isFinite(n));
      mediaEl.textContent = vals.length ? fmtNota(vals.reduce((a, b) => a + b, 0) / vals.length) : '—';
      countEl.textContent = `(${vals.length}/${comps.length} notas)`;
    };
    updateMedia();

    if (!readOnly) {
      box.querySelectorAll('[data-av-seg]').forEach((seg) => {
        seg.addEventListener('click', (ev) => {
          const btn = ev.target.closest('.rh-av-seg__btn');
          if (!btn) return;
          const quem = seg.dataset.avSeg;
          const chave = seg.dataset.chave;
          const n = Number(btn.dataset.nota);
          if (notas[quem][chave] === n) delete notas[quem][chave];
          else notas[quem][chave] = n;
          seg.querySelectorAll('.rh-av-seg__btn').forEach((b) => {
            const on = Number(b.dataset.nota) === notas[quem][chave];
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-checked', on ? 'true' : 'false');
          });
          const hint = seg.parentElement.querySelector(`[data-av-hint="${quem}"]`);
          if (hint) hint.textContent = scaleHint(notas[quem][chave]);
          if (quem === 'gestor') updateMedia();
        });
      });
    }

    const form = box.querySelector('[data-av-form-el]');
    const errEl = box.querySelector('[data-av-err]');
    box.querySelectorAll('[data-av-save]').forEach((btn) => btn.addEventListener('click', async () => {
      const status = btn.dataset.avSave;
      errEl.hidden = true;
      const payload = {
        notas_gestor: notas.gestor,
        notas_auto: notas.auto,
        pontos_fortes: form.pontos_fortes.value,
        pontos_desenvolver: [form.pd0.value, form.pd1.value, form.pd2.value].map((s) => s.trim()).filter(Boolean),
        plano_90_dias: form.plano_90_dias.value,
        devolutiva_em: form.devolutiva_em.value || null,
        status,
      };
      if (status === 'concluida') {
        const faltam = comps.filter((c) => !Number.isFinite(notas.gestor[c.chave]));
        if (faltam.length) {
          errEl.textContent = `Dê a nota do gestor em todas as competências (faltam ${faltam.length}).`;
          errEl.hidden = false;
          box.querySelector(`[data-comp="${faltam[0].chave}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if (payload.pontos_desenvolver.length < 2) {
          errEl.textContent = 'Informe pelo menos 2 pontos a desenvolver para concluir.';
          errEl.hidden = false;
          return;
        }
        if (com90 && comps.some((c) => !Number.isFinite(notas.auto[c.chave]))
          && !confirm('Algumas notas da autoavaliação estão em branco. Concluir assim mesmo?')) return;
      }
      box.querySelectorAll('[data-av-save]').forEach((b) => { b.disabled = true; });
      try {
        await rhApi(`${BASE}/avaliacoes/${encodeURIComponent(av.id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
        rhCloseModal();
        await refresh();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      } finally {
        box.querySelectorAll('[data-av-save]').forEach((b) => { b.disabled = false; });
      }
    }));
  }

  /* ---------- registros ---------- */

  rhRegisterModule('avaliacao', {
    label: 'Avaliação',
    async onOpen(container) {
      state.container = container;
      await refresh();
    },
  });

  rhRegisterGestorWidget({
    id: 'avaliacao',
    order: 30,
    async render(container) {
      const data = await rhApi(`${BASE}/ciclos`);
      const ativos = (data.ciclos || []).filter((c) => c.status !== 'encerrado');
      const ciclo = ativos.find((c) => c.status === 'aberto') || ativos[0];
      if (!ciclo) { container.innerHTML = ''; return; }
      const det = await rhApi(`${BASE}/ciclos/${encodeURIComponent(ciclo.id)}`);
      const p = det.progresso;
      const alertas = det.distribuicao.alertas;
      container.innerHTML = `
        <article class="card rh-av-widget">
          <div class="rh-av-widget__head">
            <h4>Avaliação de desempenho</h4>
            ${cicloBadge(ciclo.status)}
          </div>
          <p class="pdi-muted">${esc(ciclo.nome)} · até ${pdiFmtDate(ciclo.periodo_fim)}</p>
          <div class="rh-av-progress">
            <div class="pdi-progress"><span style="width:${p.pct}%"></span></div>
            <span class="pdi-muted">${p.concluidas}/${p.colaboradores} concluídas${p.avaliacoes - p.concluidas ? ` · ${p.avaliacoes - p.concluidas} em rascunho` : ''}</span>
          </div>
          ${alertas.length ? alertas.map((a) => `<p class="rh-av-alert rh-av-alert--warn">⚠ ${esc(a.tipo === 'leniencia' ? `Viés de leniência: ${det.distribuicao.pct_altas}% com nota 4-5` : `Viés de severidade: ${det.distribuicao.pct_baixas}% com nota 1-2`)}</p>`).join('') : ''}
          <button type="button" class="btn btn-secondary btn-sm" data-av-widget-open>Abrir ciclo</button>
        </article>`;
      container.querySelector('[data-av-widget-open]').addEventListener('click', () => {
        state.cicloId = ciclo.id;
        rhGoTo('avaliacao');
      });
    },
  });

  rhRegisterColabSection({
    id: 'avaliacao',
    order: 20,
    async render(container, colaborador) {
      if (!colaborador?.id) { container.innerHTML = ''; return; }
      const data = await rhApi(`${BASE}/colaborador/${encodeURIComponent(colaborador.id)}`);
      const ult = data.ultima_concluida;
      const hist = (data.avaliacoes || []).slice(0, 5);
      const ultHtml = ult ? `
        <div class="rh-av-colab__last">
          <span class="rh-level ${notaLevel(notaEfetiva(ult))} rh-av-colab__nota">${fmtNota(notaEfetiva(ult))}</span>
          <div>
            <div><strong>${esc(ult.ciclo_nome)}</strong> <span class="pdi-muted">· concluída em ${pdiFmtDate(String(ult.concluida_em || '').slice(0, 10))}</span></div>
            ${ult.nota_calibrada != null ? `<div class="pdi-muted">Nota final ${fmtNota(ult.nota_final)} · calibrada ${fmtNota(ult.nota_calibrada)}</div>` : ''}
            ${ult.pontos_desenvolver.length ? `<div class="rh-av-colab__pts">A desenvolver: ${ult.pontos_desenvolver.map(esc).join(' · ')}</div>` : ''}
            ${ult.devolutiva_em ? `<div class="pdi-muted">Devolutiva: ${pdiFmtDate(ult.devolutiva_em)}</div>` : '<div class="pdi-muted">Devolutiva ainda sem data.</div>'}
          </div>
        </div>` : '<p class="pdi-muted">Nenhuma avaliação concluída ainda.</p>';
      container.innerHTML = `
        <div class="card rh-av-colab">
          <div class="pdi-section-title">Avaliação de desempenho</div>
          ${ultHtml}
          ${hist.length > 1 || (hist.length === 1 && !ult) ? `
            <ul class="rh-av-colab__hist">
              ${hist.map((a) => `<li><span>${esc(a.ciclo_nome)}</span> ${statusBadge(a.status)} <strong>${fmtNota(notaEfetiva(a))}</strong></li>`).join('')}
            </ul>` : ''}
        </div>`;
    },
  });
})();
