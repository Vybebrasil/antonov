/* RH · Integração 30/60/90 (onboarding) */

(() => {
  const FASES = ['pre', 'dia1', 'd30', 'd60', 'd90'];
  const FASE_LABELS = {
    pre: 'Antes do 1º dia',
    dia1: 'Dia 1',
    d30: 'Marco 30 dias',
    d60: 'Marco 60 dias',
    d90: 'Marco 90 dias',
    pos: 'Pós-integração',
  };
  const STATUS_LABELS = {
    em_andamento: 'Em andamento',
    concluido: 'Concluída',
    cancelado: 'Cancelada',
  };
  const STATUS_BADGE = {
    em_andamento: 'pdi-badge--ativo',
    concluido: 'pdi-badge--muted',
    cancelado: 'pdi-badge--danger',
  };

  const SINAIS_VERMELHOS = [
    { auto: null, txt: 'Faltas ou atrasos sem explicação nas primeiras 2 semanas' },
    { auto: 'one_on_one', txt: 'Reunião 1:1 com o gestor cancelada mais de 2 vezes em 30 dias' },
    { auto: 'nps_baixo', txt: 'NPS abaixo de 50 em qualquer checkpoint' },
    { auto: 'sem_padrinho', txt: 'Sem padrinho definido, ou padrinho sem contato há 1 semana' },
    { auto: 'vencidos', txt: 'Itens do checklist vencidos e não concluídos' },
    { auto: null, txt: 'Reclamações de alunos ou turmas esvaziando sem conversa de apoio' },
  ];

  const RESP_PADRINHO = [
    'Integrar socialmente à equipe e ao grupo de WhatsApp do time',
    'Levar para acompanhar suas aulas/atendimentos (ou o turno da recepção) na primeira semana',
    'Apresentar na prática os protocolos de anamnese, avaliação física e treino inicial',
    'Supervisionar a primeira aula ou atendimento conduzido sozinho',
    'Tirar dúvidas sem julgamento e conversar 15 min por semana nas 4 primeiras semanas',
    'Avisar o gestor se algo não estiver bem',
  ];

  const state = { container: null, filtro: 'em_andamento', data: null };

  const esc = (s) => pdiEsc(s);
  const attr = (s) => pdiEsc(s).replace(/"/g, '&quot;');

  function hojeISO() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  }

  function diasTexto(d) {
    if (d < 0) return `Entra em ${-d} dia${d === -1 ? '' : 's'}`;
    if (d === 0) return 'Primeiro dia hoje';
    return `${d} dia${d === 1 ? '' : 's'} desde a entrada`;
  }

  function alertBadges(alertas) {
    return (alertas || [])
      .map((a) => `<span class="pdi-badge ${a.nivel === 'danger' ? 'pdi-badge--danger' : 'pdi-badge--warn'}">${esc(a.msg)}</span>`)
      .join('');
  }

  function progressBar(p) {
    return `<div class="pdi-progress rh-onb-progress" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p}%"></span></div>`;
  }

  async function fetchList(colaboradorId) {
    const qs = colaboradorId ? `?colaborador_id=${encodeURIComponent(colaboradorId)}` : '';
    return rhApi(`/onboarding${qs}`);
  }

  /* ---------- aba ---------- */

  function cardHtml(o) {
    const fase = o.status === 'em_andamento'
      ? `<span class="pdi-badge pdi-badge--pending">${esc(o.fase_label)}</span>`
      : `<span class="pdi-badge ${STATUS_BADGE[o.status]}">${esc(STATUS_LABELS[o.status])}</span>`;
    return `
      <button type="button" class="card rh-onb-card${o.alertas.length ? ' rh-onb-card--alert' : ''}" data-onb-open="${attr(o.id)}">
        <div class="rh-onb-card__head">
          <div class="rh-onb-card__who">
            <strong>${esc(o.colaborador_nome)}</strong>
            ${o.colaborador_cargo ? `<span class="pdi-muted">${esc(o.colaborador_cargo)}</span>` : ''}
          </div>
          ${fase}
        </div>
        <div class="rh-onb-card__meta">
          <span>${esc(diasTexto(o.dias_desde_entrada))}</span>
          <span class="pdi-muted">Entrada ${esc(pdiFmtDate(o.data_entrada))}</span>
        </div>
        <div class="rh-onb-card__prog">
          ${progressBar(o.progresso)}
          <span class="rh-onb-card__pct">${o.progresso}%</span>
        </div>
        <div class="rh-onb-card__meta">
          <span>Padrinho: ${o.padrinho_nome ? esc(o.padrinho_nome) : '<em class="pdi-muted">não definido</em>'}</span>
          <span class="pdi-muted">${o.concluidos}/${o.total} itens</span>
        </div>
        ${o.alertas.length ? `<div class="rh-onb-badges">${alertBadges(o.alertas)}</div>` : ''}
      </button>`;
  }

  function renderModule() {
    const c = state.container;
    if (!c || !state.data) return;
    const all = state.data.onboardings;
    const ativos = all.filter((o) => o.status === 'em_andamento');
    const comAlerta = ativos.filter((o) => o.alertas.length);
    const nps = all.flatMap((o) => [o.nps_30, o.nps_90]).filter((n) => n !== null && n !== undefined);
    const npsMedio = nps.length ? Math.round(nps.reduce((a, b) => a + b, 0) / nps.length) : null;
    const lista = state.filtro === 'todas' ? all : all.filter((o) => o.status === state.filtro);

    c.innerHTML = `
      <div class="rh-view-head">
        <div>
          <h3>Integração 30/60/90</h3>
          <p>Checklist de chegada de cada novo membro da equipe: antes do 1º dia, dia 1 e marcos de 30, 60 e 90 dias, com padrinho e NPS.</p>
        </div>
        <div class="rh-view-head__actions">
          <button type="button" class="btn btn-primary btn-sm" data-onb-start>Iniciar integração</button>
        </div>
      </div>
      <div class="pdi-stats">
        <div class="pdi-stat"><span class="pdi-stat__val">${ativos.length}</span><span class="pdi-stat__lbl">Em andamento</span></div>
        <div class="pdi-stat${comAlerta.length ? ' pdi-stat--warn' : ''}"><span class="pdi-stat__val">${comAlerta.length}</span><span class="pdi-stat__lbl">Com sinal de alerta</span></div>
        <div class="pdi-stat"><span class="pdi-stat__val">${all.filter((o) => o.status === 'concluido').length}</span><span class="pdi-stat__lbl">Concluídas</span></div>
        <div class="pdi-stat${npsMedio !== null && npsMedio < 50 ? ' pdi-stat--warn' : ''}"><span class="pdi-stat__val">${npsMedio === null ? '—' : npsMedio}</span><span class="pdi-stat__lbl">NPS médio (alvo &gt; 70)</span></div>
      </div>
      <div class="rh-onb-toolbar">
        <label class="rh-onb-filter">
          <span>Mostrar</span>
          <select data-onb-filter>
            <option value="em_andamento">Em andamento</option>
            <option value="concluido">Concluídas</option>
            <option value="cancelado">Canceladas</option>
            <option value="todas">Todas</option>
          </select>
        </label>
        ${state.data.criados_automaticamente ? `<span class="pdi-muted">${state.data.criados_automaticamente} integração(ões) criada(s) automaticamente para novos colaboradores.</span>` : ''}
      </div>
      ${lista.length
        ? `<div class="rh-onb-grid">${lista.map(cardHtml).join('')}</div>`
        : `<div class="card rh-empty"><p class="empty-msg">${all.length ? 'Nenhuma integração neste filtro.' : 'Nenhuma integração ainda. Novos colaboradores ganham a integração automaticamente; para quem já está na equipe, use "Iniciar integração".'}</p></div>`}
    `;
    const sel = c.querySelector('[data-onb-filter]');
    sel.value = state.filtro;
    sel.addEventListener('change', () => { state.filtro = sel.value; renderModule(); });
    c.querySelector('[data-onb-start]').addEventListener('click', () => openStartModal({ onDone: reloadModule }));
    c.querySelectorAll('[data-onb-open]').forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.onbOpen, { onChange: reloadModule })));
  }

  async function reloadModule() {
    if (!state.container || !state.container.isConnected) return;
    try {
      state.data = await fetchList();
      renderModule();
    } catch (err) {
      console.error('rh onboarding', err);
    }
  }

  rhRegisterModule('onboarding', {
    label: 'Integração',
    async onOpen(container) {
      state.container = container;
      container.innerHTML = '<p class="pdi-muted">Carregando integrações…</p>';
      state.data = await fetchList();
      renderModule();
    },
  });

  /* ---------- modal: iniciar ---------- */

  async function openStartModal({ colaboradorId = null, onDone } = {}) {
    let colaboradores;
    let existentes;
    try {
      [colaboradores, existentes] = await Promise.all([rhColaboradores(), fetchList()]);
    } catch (err) {
      alert(err.message);
      return;
    }
    const com = new Set(existentes.onboardings.map((o) => String(o.colaborador_id)));
    const livres = colaboradores.filter((c) => !com.has(String(c.id)));
    const opt = (c, sel) => `<option value="${attr(c.id)}"${sel ? ' selected' : ''}>${esc(c.nome)}${c.cargo_atual ? ` — ${esc(c.cargo_atual)}` : ''}</option>`;

    if (!livres.length) {
      rhOpenModal(`
        <h3>Iniciar integração</h3>
        <p class="empty-msg">Todos os colaboradores ativos já têm uma integração.</p>
        <div class="modal-actions"><button type="button" class="btn btn-secondary" data-rh-close>Fechar</button></div>`);
      return;
    }

    const box = rhOpenModal(`
      <h3>Iniciar integração</h3>
      <p class="pdi-muted">O checklist padrão (antes do 1º dia, dia 1, 30/60/90 dias) é gerado com prazos calculados a partir da data de entrada.</p>
      <form class="pdi-form rh-onb-form" data-onb-start-form>
        <label><span>Colaborador</span>
          <select name="colaborador_id" required>
            <option value="">Selecione…</option>
            ${livres.map((c) => opt(c, String(c.id) === String(colaboradorId))).join('')}
          </select>
        </label>
        <label><span>Data de entrada</span><input type="date" name="data_entrada" value="${hojeISO()}" required></label>
        <label><span>Padrinho (colega experiente que acompanha a chegada)</span>
          <select name="padrinho_id"></select>
        </label>
        <p class="form-error" data-onb-err hidden></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-rh-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">Iniciar</button>
        </div>
      </form>`);
    if (!box) return;
    const form = box.querySelector('[data-onb-start-form]');
    const selCol = form.elements.colaborador_id;
    const selPad = form.elements.padrinho_id;
    const fillPad = () => {
      const cur = selPad.value;
      selPad.innerHTML = `<option value="">Sem padrinho por enquanto</option>${colaboradores
        .filter((c) => String(c.id) !== selCol.value)
        .map((c) => opt(c, String(c.id) === cur)).join('')}`;
    };
    fillPad();
    selCol.addEventListener('change', fillPad);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = form.querySelector('[data-onb-err]');
      errEl.hidden = true;
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        const created = await rhApi('/onboarding', {
          method: 'POST',
          body: JSON.stringify({
            colaborador_id: selCol.value,
            data_entrada: form.elements.data_entrada.value,
            padrinho_id: selPad.value || null,
          }),
        });
        if (onDone) await onDone(created);
        openDetail(created.id, { onChange: onDone, preload: created });
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
        btn.disabled = false;
      }
    });
  }

  /* ---------- modal: detalhe ---------- */

  function itemHtml(i) {
    return `
      <li class="rh-onb-item${i.concluido ? ' is-done' : ''}${i.vencido ? ' is-late' : ''}" data-item="${attr(i.id)}">
        <label class="rh-onb-item__check">
          <input type="checkbox" data-item-check${i.concluido ? ' checked' : ''}>
          <span class="rh-onb-item__title">${esc(i.titulo)}</span>
        </label>
        <span class="rh-onb-item__prazo">${i.prazo ? `${i.vencido ? 'Vencido · ' : ''}${esc(pdiFmtDate(i.prazo))}` : 'Sem prazo'}</span>
        <button type="button" class="btn btn-ghost btn-sm rh-onb-item__del" data-item-del title="Remover item" aria-label="Remover item">×</button>
      </li>`;
  }

  function faseHtml(f, faseAtual) {
    const done = f.itens.filter((i) => i.concluido).length;
    return `
      <section class="rh-onb-phase${f.fase === faseAtual ? ' is-current' : ''}" data-fase="${f.fase}">
        <header class="rh-onb-phase__head">
          <h4>${esc(f.label)}${f.fase === faseAtual ? ' <span class="pdi-badge pdi-badge--pending">fase atual</span>' : ''}</h4>
          <span class="pdi-muted">${done}/${f.itens.length}</span>
        </header>
        <ul class="rh-onb-items">${f.itens.map(itemHtml).join('') || '<li class="pdi-muted rh-onb-item--empty">Nenhum item.</li>'}</ul>
        <form class="rh-onb-add" data-add-form>
          <input type="text" name="titulo" placeholder="Adicionar item…" maxlength="500" required>
          <input type="date" name="prazo" aria-label="Prazo">
          <button type="submit" class="btn btn-secondary btn-sm">Adicionar</button>
        </form>
      </section>`;
  }

  async function openDetail(id, { onChange, preload } = {}) {
    let o = preload && preload.fases ? preload : null;
    let colaboradores = [];
    try {
      [o, colaboradores] = await Promise.all([o || rhApi(`/onboarding/${id}`), rhColaboradores()]);
    } catch (err) {
      alert(err.message);
      return;
    }
    const notify = () => { if (onChange) Promise.resolve(onChange()).catch(() => {}); };
    renderDetail(o, colaboradores, notify);
  }

  function renderDetail(o, colaboradores, notify) {
    const tipos = new Set(o.alertas.map((a) => a.tipo));
    const padOpts = colaboradores
      .filter((c) => String(c.id) !== String(o.colaborador_id))
      .map((c) => `<option value="${attr(c.id)}"${String(c.id) === String(o.padrinho_id) ? ' selected' : ''}>${esc(c.nome)}</option>`)
      .join('');

    const box = rhOpenModal(`
      <div class="rh-onb-detail">
        <div class="rh-onb-detail__head">
          <div>
            <h3>Integração · ${esc(o.colaborador_nome)}</h3>
            <p class="pdi-muted">${esc(diasTexto(o.dias_desde_entrada))} · ${esc(o.fase_label)} · <span class="pdi-badge ${STATUS_BADGE[o.status]}">${esc(STATUS_LABELS[o.status])}</span></p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-rh-close aria-label="Fechar">Fechar</button>
        </div>
        <div class="rh-onb-card__prog rh-onb-detail__prog">
          ${progressBar(o.progresso)}
          <span class="rh-onb-card__pct" data-onb-pct>${o.progresso}%</span>
        </div>
        ${o.alertas.length ? `<div class="rh-onb-badges">${alertBadges(o.alertas)}</div>` : ''}

        <div class="rh-onb-detail__grid">
          <div class="rh-onb-detail__main">
            <h4 class="pdi-section-title">Checklist</h4>
            ${o.fases.map((f) => faseHtml(f, o.fase)).join('')}
          </div>
          <aside class="rh-onb-detail__side">
            <form class="pdi-form rh-onb-form" data-onb-edit>
              <h4 class="pdi-section-title">Dados</h4>
              <label><span>Padrinho</span>
                <select name="padrinho_id"><option value="">Sem padrinho</option>${padOpts}</select>
              </label>
              <label><span>Data de entrada</span><input type="date" name="data_entrada" value="${attr(o.data_entrada)}" required></label>
              <label><span>Status</span>
                <select name="status">
                  ${Object.entries(STATUS_LABELS).map(([k, l]) => `<option value="${k}"${k === o.status ? ' selected' : ''}>${l}</option>`).join('')}
                </select>
              </label>
              <div class="rh-onb-nps">
                <label><span>NPS 30 dias</span><input type="number" name="nps_30" min="0" max="100" step="1" value="${o.nps_30 ?? ''}" placeholder="0–100"></label>
                <label><span>NPS 90 dias</span><input type="number" name="nps_90" min="0" max="100" step="1" value="${o.nps_90 ?? ''}" placeholder="0–100"></label>
              </div>
              <label><span>Observações</span><textarea name="observacoes" rows="4">${esc(o.observacoes)}</textarea></label>
              <p class="pdi-muted rh-onb-hint">Mudar a data de entrada desloca todos os prazos do checklist.</p>
              <p class="form-error" data-onb-err hidden></p>
              <button type="submit" class="btn btn-primary btn-sm">Salvar dados</button>
            </form>

            <div class="rh-onb-box rh-onb-box--red">
              <h4>Sinal vermelho — puxe o alarme se:</h4>
              <ul>
                ${SINAIS_VERMELHOS.map((s) => `<li class="${s.auto && tipos.has(s.auto) ? 'is-on' : ''}">${esc(s.txt)}${s.auto && tipos.has(s.auto) ? ' <strong>(detectado)</strong>' : ''}</li>`).join('')}
              </ul>
            </div>

            <div class="rh-onb-box">
              <h4>Padrinho: ${o.padrinho_nome ? esc(o.padrinho_nome) : 'não definido'}</h4>
              ${o.padrinho_nome ? '' : '<p class="pdi-muted">Sem padrinho não há integração de verdade. Escolha um colega experiente.</p>'}
              <ul>${RESP_PADRINHO.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
            </div>

            <button type="button" class="btn btn-danger btn-sm rh-onb-del" data-onb-del>Excluir integração</button>
          </aside>
        </div>
      </div>`);
    if (!box) return;

    const reopen = async () => {
      try {
        const fresh = await rhApi(`/onboarding/${o.id}`);
        renderDetail(fresh, colaboradores, notify);
      } catch (err) {
        alert(err.message);
      }
    };

    const updatePct = () => {
      const all = box.querySelectorAll('[data-item-check]');
      const done = box.querySelectorAll('[data-item-check]:checked').length;
      const p = all.length ? Math.round((done / all.length) * 100) : 0;
      const bar = box.querySelector('.rh-onb-detail__prog .pdi-progress span');
      if (bar) bar.style.width = `${p}%`;
      const pct = box.querySelector('[data-onb-pct]');
      if (pct) pct.textContent = `${p}%`;
      box.querySelectorAll('.rh-onb-phase').forEach((sec) => {
        const n = sec.querySelectorAll('[data-item-check]').length;
        const d = sec.querySelectorAll('[data-item-check]:checked').length;
        const lbl = sec.querySelector('.rh-onb-phase__head > .pdi-muted');
        if (lbl) lbl.textContent = `${d}/${n}`;
      });
    };

    box.querySelectorAll('[data-item-check]').forEach((cb) => {
      cb.addEventListener('change', async () => {
        const li = cb.closest('[data-item]');
        cb.disabled = true;
        try {
          const r = await rhApi(`/onboarding/itens/${li.dataset.item}`, {
            method: 'PATCH',
            body: JSON.stringify({ concluido: cb.checked }),
          });
          li.classList.toggle('is-done', r.concluido);
          const vencido = !r.concluido && r.prazo && r.prazo < hojeISO();
          li.classList.toggle('is-late', !!vencido);
          li.querySelector('.rh-onb-item__prazo').textContent = r.prazo
            ? `${vencido ? 'Vencido · ' : ''}${pdiFmtDate(r.prazo)}`
            : 'Sem prazo';
          updatePct();
          notify();
        } catch (err) {
          cb.checked = !cb.checked;
          alert(err.message);
        } finally {
          cb.disabled = false;
        }
      });
    });

    box.querySelectorAll('[data-item-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const li = btn.closest('[data-item]');
        if (!confirm('Remover este item do checklist?')) return;
        try {
          await rhApi(`/onboarding/itens/${li.dataset.item}`, { method: 'DELETE' });
          notify();
          await reopen();
        } catch (err) {
          alert(err.message);
        }
      });
    });

    box.querySelectorAll('[data-add-form]').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fase = form.closest('[data-fase]').dataset.fase;
        try {
          await rhApi(`/onboarding/${o.id}/itens`, {
            method: 'POST',
            body: JSON.stringify({ fase, titulo: form.elements.titulo.value, prazo: form.elements.prazo.value || null }),
          });
          notify();
          await reopen();
        } catch (err) {
          alert(err.message);
        }
      });
    });

    const edit = box.querySelector('[data-onb-edit]');
    edit.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = edit.querySelector('[data-onb-err]');
      errEl.hidden = true;
      const f = edit.elements;
      try {
        await rhApi(`/onboarding/${o.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            padrinho_id: f.padrinho_id.value || null,
            data_entrada: f.data_entrada.value,
            status: f.status.value,
            nps_30: f.nps_30.value === '' ? null : Number(f.nps_30.value),
            nps_90: f.nps_90.value === '' ? null : Number(f.nps_90.value),
            observacoes: f.observacoes.value,
          }),
        });
        notify();
        await reopen();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    });

    box.querySelector('[data-onb-del]').addEventListener('click', async () => {
      if (!confirm(`Excluir a integração de ${o.colaborador_nome}? O checklist será apagado.`)) return;
      try {
        await rhApi(`/onboarding/${o.id}`, { method: 'DELETE' });
        rhCloseModal();
        notify();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  /* ---------- quadro do gestor ---------- */

  async function renderWidget(container) {
    const data = await fetchList();
    const ativos = data.onboardings.filter((o) => o.status === 'em_andamento');
    if (!ativos.length) {
      container.innerHTML = '';
      return;
    }
    const alerta = ativos.filter((o) => o.alertas.length);
    const draw = () => renderWidget(container).catch((err) => console.error(err));
    container.innerHTML = `
      <article class="card rh-onb-widget">
        <div class="rh-onb-widget__head">
          <h4>Integração 30/60/90</h4>
          <span class="pdi-muted">${ativos.length} em andamento</span>
        </div>
        ${alerta.length
          ? `<ul class="rh-onb-widget__list">${alerta.map((o) => `
              <li><button type="button" class="rh-onb-widget__row" data-onb-open="${attr(o.id)}">
                <span><strong>${esc(o.colaborador_nome)}</strong> <span class="pdi-muted">· ${esc(o.fase_label)} · ${o.progresso}%</span></span>
                <span class="rh-onb-badges">${alertBadges(o.alertas)}</span>
              </button></li>`).join('')}</ul>`
          : '<p class="pdi-muted">Nenhuma integração com sinal de alerta.</p>'}
        ${typeof rhGoTo === 'function' ? '<button type="button" class="btn btn-ghost btn-sm" data-onb-goto>Ver integrações</button>' : ''}
      </article>`;
    container.querySelectorAll('[data-onb-open]').forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.onbOpen, { onChange: draw })));
    container.querySelector('[data-onb-goto]')?.addEventListener('click', () => rhGoTo('onboarding'));
  }

  rhRegisterGestorWidget({ id: 'onboarding', order: 20, render: renderWidget });

  /* ---------- bloco na ficha do colaborador ---------- */

  async function renderColab(container, colaborador) {
    const data = await fetchList(colaborador.id);
    const o = data.onboardings[0];
    const redraw = () => renderColab(container, colaborador).catch((err) => console.error(err));

    if (!o) {
      container.innerHTML = `
        <div class="card rh-onb-colab">
          <div class="rh-onb-widget__head">
            <h4>Integração 30/60/90</h4>
          </div>
          <p class="pdi-muted">Sem integração registrada para ${esc(colaborador.nome)}.</p>
          <button type="button" class="btn btn-secondary btn-sm" data-onb-start>Iniciar integração</button>
        </div>`;
      container.querySelector('[data-onb-start]').addEventListener('click', () => openStartModal({ colaboradorId: colaborador.id, onDone: redraw }));
      return;
    }

    if (o.status === 'concluido' && o.concluido_em) {
      const dias = (Date.now() - new Date(o.concluido_em).getTime()) / 86400000;
      if (dias > 30) {
        container.innerHTML = '';
        return;
      }
    }

    container.innerHTML = `
      <div class="card rh-onb-colab">
        <div class="rh-onb-widget__head">
          <h4>Integração 30/60/90</h4>
          ${o.status === 'em_andamento'
            ? `<span class="pdi-badge pdi-badge--pending">${esc(o.fase_label)}</span>`
            : `<span class="pdi-badge ${STATUS_BADGE[o.status]}">${esc(STATUS_LABELS[o.status])}</span>`}
        </div>
        <p class="pdi-muted">${esc(diasTexto(o.dias_desde_entrada))} · Padrinho: ${o.padrinho_nome ? esc(o.padrinho_nome) : 'não definido'}</p>
        <div class="rh-onb-card__prog">
          ${progressBar(o.progresso)}
          <span class="rh-onb-card__pct">${o.progresso}%</span>
        </div>
        ${o.alertas.length ? `<div class="rh-onb-badges">${alertBadges(o.alertas)}</div>` : ''}
        ${o.status === 'em_andamento' && o.proximos.length ? `
          <h5 class="rh-onb-colab__sub">Próximos itens</h5>
          <ul class="rh-onb-next">
            ${o.proximos.map((i) => {
              const late = i.prazo && i.prazo < data.hoje;
              return `<li class="${late ? 'is-late' : ''}"><span>${esc(i.titulo)}</span><span class="rh-onb-item__prazo">${i.prazo ? `${late ? 'Vencido · ' : ''}${esc(pdiFmtDate(i.prazo))}` : 'Sem prazo'}</span></li>`;
            }).join('')}
          </ul>` : ''}
        <button type="button" class="btn btn-secondary btn-sm" data-onb-open="${attr(o.id)}">Abrir checklist</button>
      </div>`;
    container.querySelector('[data-onb-open]').addEventListener('click', () => openDetail(o.id, { onChange: redraw }));
  }

  rhRegisterColabSection({
    id: 'onboarding',
    order: 5,
    render: renderColab,
  });
})();
