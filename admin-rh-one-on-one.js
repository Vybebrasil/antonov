/* RH · Reuniões 1:1 (metodologia one-on-one-template) */

(() => {
  const CADENCIA_DIAS = 7;

  const STATUS = {
    agendada: { label: 'Agendada', badge: 'pdi-badge--pending' },
    realizada: { label: 'Realizada', badge: 'pdi-badge--ativo' },
    cancelada: { label: 'Cancelada', badge: 'pdi-badge--danger' },
  };

  const TIPOS = {
    operacional: {
      label: 'Semanal · operacional (30 min)',
      curto: 'Operacional',
      roteiro: '5 min check-in · 10 min follow-up · 10 min bloqueios · 5 min 1 ação concreta',
    },
    carreira: {
      label: 'Mensal · carreira (60 min)',
      curto: 'Carreira',
      roteiro: '5 min check-in · 15 min OKR/PDI · 20 min aspiração e gaps · 15 min feedback bilateral · 5 min 2-3 ações',
    },
    trimestral: {
      label: 'Trimestral · review profundo (90 min)',
      curto: 'Trimestral',
      roteiro: '10 min check-in · 30 min review do trimestre · 30 min planejamento · 20 min carreira e PDI',
    },
  };

  const HUMOR = [
    { v: 1, emoji: '😞', label: 'Muito mal' },
    { v: 2, emoji: '😕', label: 'Mal' },
    { v: 3, emoji: '😐', label: 'Neutro' },
    { v: 4, emoji: '🙂', label: 'Bem' },
    { v: 5, emoji: '😄', label: 'Muito bem' },
  ];

  const ROTEIRO = [
    {
      key: 'checkin',
      label: 'Check-in emocional',
      help: 'Abra sempre por aqui (5 min).',
      ph: 'Como está a semana? O que tem te dado energia? O que tem custado?',
    },
    {
      key: 'follow_up',
      label: 'Follow-up das ações da última 1:1',
      help: '1:1 sem follow-up vira papo de corredor.',
      ph: 'Ação 1 — status:\nAção 2 — status:',
    },
    {
      key: 'vitorias',
      label: 'Vitórias',
      ph: 'O que está te deixando orgulhoso esta semana? Quem te ajudou?',
    },
    {
      key: 'bloqueios',
      label: 'Bloqueios e desafios',
      ph: 'Onde você está gastando energia que não deveria? Que decisão precisaria de ajuda pra tomar? Quem te atrapalhou?',
    },
    {
      key: 'prioridades',
      label: 'Prioridades',
      ph: 'Se você pudesse mudar 1 coisa do seu trabalho amanhã, qual seria? O que é mais importante até a próxima?',
    },
    {
      key: 'desenvolvimento',
      label: 'Desenvolvimento e carreira',
      help: 'Foco nas 1:1 mensais e trimestrais (OKR/PDI, aspiração, gaps).',
      ph: 'Em 6 meses, o que você gostaria de estar fazendo diferente? Como está o PDI?',
    },
    {
      key: 'feedback_lider',
      label: 'Feedback do líder para o colaborador',
      ph: 'Comportamento observado, impacto e o que manter/ajustar.',
    },
    {
      key: 'feedback_colaborador',
      label: 'Feedback do colaborador para o líder',
      ph: 'Que feedback você não está me dando porque acha que vou ficar mal?',
    },
    {
      key: 'sinais_atencao',
      label: 'Sinais de atenção',
      help: 'Registre se observou algo: motivação, energia, ruído.',
      ph: 'Opcional',
    },
    {
      key: 'proximos_passos',
      label: 'Próximos passos',
      help: 'Uma ação concreta por linha, com responsável e prazo.',
      ph: 'Ação — responsável — prazo',
    },
  ];

  const state = { colaboradorId: '', status: '', container: null };

  const esc = (s) => pdiEsc(s);
  const attr = (s) => pdiEsc(s).replace(/"/g, '&quot;');

  function hoje() {
    return new Date().toLocaleDateString('en-CA');
  }

  function addDias(iso, n) {
    const dt = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(dt.getTime())) return '';
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  }

  function humorHtml(v) {
    const h = HUMOR.find((x) => x.v === Number(v));
    if (!h) return '<span class="rh-oo-humor rh-oo-humor--none" title="Humor não registrado">—</span>';
    return `<span class="rh-oo-humor" title="Humor: ${attr(h.label)} (${h.v}/5)">${h.emoji}<small>${h.v}/5</small></span>`;
  }

  function statusBadge(s) {
    const st = STATUS[s] || { label: s, badge: 'pdi-badge--muted' };
    return `<span class="pdi-badge ${st.badge}">${esc(st.label)}</span>`;
  }

  function linhas(txt) {
    return String(txt || '').split(/\r?\n/).map((l) => l.replace(/^[-*•\s[\]x]+/i, '').trim()).filter(Boolean);
  }

  function resumoTexto(r) {
    if (r.status === 'cancelada') return r.motivo_cancelamento ? `Motivo: ${r.motivo_cancelamento}` : '';
    const passos = linhas(r.proximos_passos);
    return passos.length ? passos.slice(0, 2).join(' · ') + (passos.length > 2 ? ` (+${passos.length - 2})` : '') : '';
  }

  function cardHtml(r, { showNome = true } = {}) {
    const resumo = resumoTexto(r);
    return `
      <button type="button" class="rh-oo-card rh-oo-card--${attr(r.status)}" data-oo-open="${attr(r.id)}">
        <span class="rh-oo-card__top">
          <span class="rh-oo-card__date">${esc(pdiFmtDate(r.data))}</span>
          ${statusBadge(r.status)}
          ${humorHtml(r.humor)}
        </span>
        ${showNome ? `<strong class="rh-oo-card__nome">${esc(r.colaborador_nome || '')}</strong>` : ''}
        <span class="rh-oo-card__meta">${esc(TIPOS[r.tipo]?.curto || r.tipo || '')}${r.proxima_data && r.status !== 'cancelada' ? ` · próxima: ${esc(pdiFmtDate(r.proxima_data))}` : ''}</span>
        ${resumo ? `<span class="rh-oo-card__passos">${r.status === 'cancelada' ? '' : '<b>Próximos passos:</b> '}${esc(resumo)}</span>` : ''}
      </button>`;
  }

  function bindCards(root, onSaved) {
    root.querySelectorAll('[data-oo-open]').forEach((el) => {
      el.addEventListener('click', () => openForm({ id: el.dataset.ooOpen }, onSaved));
    });
  }

  /* ---------- Formulário ---------- */

  async function openForm({ id = null, colaboradorId = '' } = {}, onSaved) {
    let r = null;
    let colaboradores = [];
    try {
      [colaboradores, r] = await Promise.all([
        rhColaboradores(),
        id ? rhApi(`/one-on-one/${encodeURIComponent(id)}`).then((d) => d.reuniao) : null,
      ]);
    } catch (err) {
      alert(err.message);
      return;
    }

    const colabSel = r?.colaborador_id || colaboradorId || '';
    if (r && !colaboradores.some((c) => c.id === r.colaborador_id)) {
      colaboradores = [{ id: r.colaborador_id, nome: r.colaborador_nome }, ...colaboradores];
    }
    const data = r?.data || hoje();
    const status = r?.status || 'realizada';
    const tipo = r?.tipo || 'operacional';
    const humor = r?.humor ?? '';

    const html = `
      <h3>${r ? 'Reunião 1:1' : 'Nova 1:1'}</h3>
      ${r ? `<p class="pdi-muted">${esc(r.colaborador_nome || '')}${r.lider_nome ? ` · registrada por ${esc(r.lider_nome)}` : ''}</p>` : ''}
      <form class="pdi-form rh-oo-form" novalidate>
        <div class="rh-oo-grid">
          <label class="rh-oo-span2"><span>Colaborador</span>
            <select name="colaborador_id" required>
              <option value="">Selecione…</option>
              ${colaboradores.map((c) => `<option value="${attr(c.id)}"${c.id === colabSel ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}
            </select>
          </label>
          <label><span>Data</span><input type="date" name="data" value="${attr(data)}" required></label>
          <label><span>Status</span>
            <select name="status">
              ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${k === status ? ' selected' : ''}>${v.label}</option>`).join('')}
            </select>
          </label>
          <label class="rh-oo-span2"><span>Tipo de 1:1</span>
            <select name="tipo">
              ${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}"${k === tipo ? ' selected' : ''}>${v.label}</option>`).join('')}
            </select>
            <small class="pdi-muted rh-oo-tipo-hint">${esc(TIPOS[tipo].roteiro)}</small>
          </label>
        </div>

        <label class="rh-oo-motivo"><span>Motivo do cancelamento</span>
          <textarea name="motivo_cancelamento" rows="2" placeholder="Por que a 1:1 não aconteceu? Já remarcou?">${esc(r?.motivo_cancelamento || '')}</textarea>
        </label>

        <div class="rh-oo-roteiro">
          <fieldset class="rh-oo-humor-pick">
            <legend>Humor no check-in (1 a 5)</legend>
            <div class="rh-oo-humor-opts">
              <label class="rh-oo-humor-opt"><input type="radio" name="humor" value=""${humor === '' ? ' checked' : ''}><span title="Sem registro">—</span></label>
              ${HUMOR.map((h) => `<label class="rh-oo-humor-opt"><input type="radio" name="humor" value="${h.v}"${Number(humor) === h.v ? ' checked' : ''}><span title="${attr(h.label)}">${h.emoji}<small>${h.v}</small></span></label>`).join('')}
            </div>
          </fieldset>
          ${ROTEIRO.map((f) => `
            <label class="rh-oo-field"><span>${esc(f.label)}</span>
              ${f.help ? `<small class="pdi-muted">${esc(f.help)}</small>` : ''}
              <textarea name="${f.key}" rows="${f.key === 'proximos_passos' || f.key === 'follow_up' ? 3 : 2}" placeholder="${attr(f.ph)}">${esc(r?.[f.key] || '')}</textarea>
            </label>`).join('')}
        </div>

        <label class="rh-oo-proxima"><span>Próxima 1:1</span>
          <input type="date" name="proxima_data" value="${attr(r?.proxima_data || '')}">
          <small class="pdi-muted">Sugestão automática: data + ${CADENCIA_DIAS} dias (cadência semanal). Mais de 14 dias sem 1:1 conta como atraso.</small>
        </label>

        <p class="form-error" data-oo-error hidden></p>
        <div class="modal-actions rh-oo-actions">
          ${r ? '<button type="button" class="btn btn-danger btn-sm" data-oo-delete>Excluir</button>' : ''}
          <span class="rh-oo-actions__spacer"></span>
          <button type="button" class="btn btn-ghost" data-rh-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>`;

    const box = rhOpenModal(html);
    if (!box) return;
    const form = box.querySelector('form');
    const errEl = box.querySelector('[data-oo-error]');
    const proxInput = form.elements.proxima_data;
    let proxManual = Boolean(r?.proxima_data);

    const syncStatus = () => {
      const st = form.elements.status.value;
      form.classList.toggle('rh-oo-form--cancelada', st === 'cancelada');
      form.classList.toggle('rh-oo-form--agendada', st === 'agendada');
    };
    const suggestProxima = () => {
      if (proxManual || form.elements.status.value === 'cancelada') return;
      const d = form.elements.data.value;
      proxInput.value = d ? addDias(d, CADENCIA_DIAS) : '';
    };

    form.elements.status.addEventListener('change', () => { syncStatus(); suggestProxima(); });
    form.elements.data.addEventListener('change', suggestProxima);
    form.elements.tipo.addEventListener('change', () => {
      box.querySelector('.rh-oo-tipo-hint').textContent = TIPOS[form.elements.tipo.value]?.roteiro || '';
    });
    proxInput.addEventListener('input', () => { proxManual = Boolean(proxInput.value); });

    const prefillFollowUp = async () => {
      if (r) return;
      const cid = form.elements.colaborador_id.value;
      const fu = form.elements.follow_up;
      if (!cid || fu.value.trim()) return;
      try {
        const { reunioes } = await rhApi(`/one-on-one?colaborador_id=${encodeURIComponent(cid)}&status=realizada&limit=1`);
        const passos = linhas(reunioes?.[0]?.proximos_passos);
        if (passos.length && !fu.value.trim() && form.elements.colaborador_id.value === cid) {
          fu.value = passos.map((p) => `${p} — status: `).join('\n');
        }
      } catch { /* sugestão opcional */ }
    };
    form.elements.colaborador_id.addEventListener('change', prefillFollowUp);

    syncStatus();
    suggestProxima();
    prefillFollowUp();

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      errEl.hidden = true;
      const fd = new FormData(form);
      const payload = {
        colaborador_id: fd.get('colaborador_id'),
        data: fd.get('data'),
        status: fd.get('status'),
        tipo: fd.get('tipo'),
        humor: fd.get('humor') ? Number(fd.get('humor')) : null,
        proxima_data: fd.get('proxima_data') || null,
        motivo_cancelamento: fd.get('status') === 'cancelada' ? fd.get('motivo_cancelamento') : null,
      };
      ROTEIRO.forEach((f) => { payload[f.key] = fd.get(f.key) || null; });

      if (!payload.colaborador_id) { showErr('Selecione o colaborador.'); return; }
      if (!payload.data) { showErr('Informe a data.'); return; }
      if (payload.status === 'cancelada' && !String(payload.motivo_cancelamento || '').trim()) {
        showErr('Informe o motivo do cancelamento.');
        return;
      }

      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        await rhApi(r ? `/one-on-one/${encodeURIComponent(r.id)}` : '/one-on-one', {
          method: r ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        });
        rhCloseModal();
        onSaved?.();
      } catch (err) {
        showErr(err.message);
      } finally {
        btn.disabled = false;
      }
    });

    box.querySelector('[data-oo-delete]')?.addEventListener('click', async () => {
      if (!confirm('Excluir esta reunião 1:1? Esta ação não pode ser desfeita.')) return;
      try {
        await rhApi(`/one-on-one/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
        rhCloseModal();
        onSaved?.();
      } catch (err) {
        alert(err.message);
      }
    });

    function showErr(msg) {
      errEl.textContent = msg;
      errEl.hidden = false;
      errEl.scrollIntoView?.({ block: 'nearest' });
    }
  }

  /* ---------- Aba do módulo ---------- */

  async function renderList(container) {
    const listEl = container.querySelector('[data-oo-list]');
    if (!listEl) return;
    listEl.innerHTML = '<p class="pdi-muted">Carregando…</p>';
    const qs = new URLSearchParams({ limit: '100' });
    if (state.colaboradorId) qs.set('colaborador_id', state.colaboradorId);
    if (state.status) qs.set('status', state.status);
    try {
      const { reunioes } = await rhApi(`/one-on-one?${qs}`);
      listEl.innerHTML = reunioes.length
        ? `<div class="rh-oo-cards">${reunioes.map((r) => cardHtml(r)).join('')}</div>`
        : '<div class="rh-empty"><p>Nenhuma reunião 1:1 encontrada.</p><p class="pdi-muted">Sem registro escrito, não tem 1:1. Registre a primeira em "Nova 1:1".</p></div>';
      bindCards(listEl, () => openModule(container));
    } catch (err) {
      listEl.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
    }
  }

  async function renderStats(container) {
    const el = container.querySelector('[data-oo-stats]');
    if (!el) return;
    try {
      const r = await rhApi('/one-on-one/resumo');
      el.innerHTML = r.total ? `
        <div class="pdi-stats rh-oo-stats">
          <div class="pdi-stat"><span class="pdi-stat__val">${r.total - r.atrasados}</span><span class="pdi-stat__lbl">Em dia</span></div>
          <div class="pdi-stat${r.atrasados ? ' pdi-stat--warn' : ''}"><span class="pdi-stat__val">${r.atrasados}</span><span class="pdi-stat__lbl">Atrasados (+${r.limite_atraso_dias} dias)</span></div>
          <div class="pdi-stat${r.canceladas_30d ? ' pdi-stat--warn' : ''}"><span class="pdi-stat__val">${r.canceladas_30d}</span><span class="pdi-stat__lbl">Canceladas (30 dias)</span></div>
        </div>` : '';
    } catch {
      el.innerHTML = '';
    }
  }

  async function openModule(container) {
    state.container = container;
    const colaboradores = await rhColaboradores();
    if (state.colaboradorId && !colaboradores.some((c) => c.id === state.colaboradorId)) state.colaboradorId = '';
    container.innerHTML = `
      <div class="rh-view-head">
        <div>
          <h3>Reuniões 1:1</h3>
          <p>Check-in, follow-up, bloqueios e próximos passos. Cadência semanal; mais de 14 dias sem 1:1 é atraso.</p>
        </div>
        <div class="rh-view-head__actions">
          <button type="button" class="btn btn-primary" data-oo-new>Nova 1:1</button>
        </div>
      </div>
      <div data-oo-stats></div>
      <div class="card pdi-form rh-oo-filters">
        <label><span>Colaborador</span>
          <select data-oo-filter="colaboradorId">
            <option value="">Todos</option>
            ${colaboradores.map((c) => `<option value="${attr(c.id)}"${c.id === state.colaboradorId ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}
          </select>
        </label>
        <label><span>Status</span>
          <select data-oo-filter="status">
            <option value="">Todos</option>
            ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${k === state.status ? ' selected' : ''}>${v.label}</option>`).join('')}
          </select>
        </label>
      </div>
      <div data-oo-list></div>`;

    container.querySelector('[data-oo-new]').addEventListener('click', () => {
      openForm({ colaboradorId: state.colaboradorId }, () => openModule(container));
    });
    container.querySelectorAll('[data-oo-filter]').forEach((sel) => {
      sel.addEventListener('change', () => {
        state[sel.dataset.ooFilter] = sel.value;
        renderList(container);
      });
    });
    await Promise.all([renderStats(container), renderList(container)]);
  }

  rhRegisterModule('one-on-one', {
    label: 'Reuniões 1:1',
    onOpen: openModule,
  });

  /* ---------- Quadro do gestor ---------- */

  async function renderWidget(container) {
    const r = await rhApi('/one-on-one/resumo');
    if (!r.total) {
      container.innerHTML = '';
      return;
    }
    const atrasados = r.colaboradores.filter((c) => c.atrasado)
      .sort((a, b) => (b.dias_desde_ultima ?? Infinity) - (a.dias_desde_ultima ?? Infinity));
    const level = !atrasados.length ? 'ok' : atrasados.length / r.total > 0.5 ? 'high' : 'warn';
    const shown = atrasados.slice(0, 5);
    container.innerHTML = `
      <article class="card rh-oo-widget">
        <div class="rh-oo-widget__head">
          <h4 class="pdi-section-title">1:1 em dia</h4>
          <span class="rh-level rh-level--${level}">${r.total - atrasados.length}/${r.total}</span>
        </div>
        <p class="pdi-muted">${atrasados.length
          ? `${atrasados.length} colaborador(es) sem 1:1 em dia${r.canceladas_30d ? ` · ${r.canceladas_30d} cancelada(s) em 30 dias` : ''}.`
          : `Todos com 1:1 em dia${r.canceladas_30d ? ` · ${r.canceladas_30d} cancelada(s) em 30 dias` : ''}.`}</p>
        ${shown.length ? `
          <ul class="rh-oo-late">
            ${shown.map((c) => `
              <li>
                <span class="rh-oo-late__nome">${esc(c.nome)}</span>
                <span class="rh-oo-late__dias">${c.dias_desde_ultima == null ? 'nunca teve' : `há ${c.dias_desde_ultima} dias`}</span>
                <button type="button" class="btn btn-secondary btn-sm" data-oo-reg="${attr(c.colaborador_id)}">Registrar</button>
              </li>`).join('')}
          </ul>
          ${atrasados.length > shown.length ? `<p class="pdi-muted">+${atrasados.length - shown.length} outro(s).</p>` : ''}` : ''}
        <div class="rh-oo-widget__actions">
          <button type="button" class="btn btn-primary btn-sm" data-oo-reg="">Registrar 1:1</button>
          <button type="button" class="btn btn-ghost btn-sm" data-oo-all>Ver todas</button>
        </div>
      </article>`;
    container.querySelectorAll('[data-oo-reg]').forEach((btn) => {
      btn.addEventListener('click', () => openForm({ colaboradorId: btn.dataset.ooReg }, () => renderWidget(container)));
    });
    container.querySelector('[data-oo-all]')?.addEventListener('click', () => {
      if (typeof rhGoTo === 'function') rhGoTo('one-on-one');
    });
  }

  rhRegisterGestorWidget({ id: 'one-on-one', order: 10, render: renderWidget });

  /* ---------- Bloco na ficha do colaborador ---------- */

  async function renderColab(container, colaborador) {
    if (!colaborador?.id) {
      container.innerHTML = '';
      return;
    }
    const { reunioes } = await rhApi(`/one-on-one?colaborador_id=${encodeURIComponent(colaborador.id)}&limit=30`);
    const hojeIso = hoje();
    const ultima = reunioes.find((r) => r.status === 'realizada' && r.data <= hojeIso);
    const proxima = reunioes.filter((r) => r.status === 'agendada' && r.data >= hojeIso)
      .sort((a, b) => (a.data < b.data ? -1 : 1))[0];
    const dias = ultima ? Math.round((Date.parse(`${hojeIso}T00:00:00Z`) - Date.parse(`${ultima.data}T00:00:00Z`)) / 86400000) : null;
    const passos = linhas(ultima?.proximos_passos);
    const desde = colaborador.created_at ? String(colaborador.created_at).slice(0, 10) : null;
    const agendadaVencida = reunioes.some((r) => r.status === 'agendada' && r.data < hojeIso && (!ultima || r.data > ultima.data));
    const atrasado = agendadaVencida
      || (ultima ? dias > 14 || Boolean(ultima.proxima_data && ultima.proxima_data < hojeIso) : !desde || desde < addDias(hojeIso, -14));
    const reload = () => renderColab(container, colaborador);

    container.innerHTML = `
      <div class="card rh-oo-colab">
        <div class="rh-oo-widget__head">
          <h4 class="pdi-section-title">Reuniões 1:1</h4>
          <button type="button" class="btn btn-primary btn-sm" data-oo-new>Nova 1:1</button>
        </div>
        <p class="rh-oo-colab__status">
          <span class="rh-level rh-level--${atrasado ? 'warn' : 'ok'}">${atrasado ? 'Atrasada' : 'Em dia'}</span>
          ${ultima ? `Última realizada em ${esc(pdiFmtDate(ultima.data))} (há ${dias} dias)` : 'Nenhuma 1:1 realizada ainda'}
          ${proxima ? ` · próxima agendada: ${esc(pdiFmtDate(proxima.data))}` : (ultima?.proxima_data ? ` · próxima prevista: ${esc(pdiFmtDate(ultima.proxima_data))}` : '')}
        </p>
        ${passos.length ? `
          <div class="rh-oo-pending">
            <strong>Próximos passos pendentes da última 1:1</strong>
            <ul>${passos.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
          </div>` : ''}
        ${reunioes.length
          ? `<div class="rh-oo-cards rh-oo-cards--compact">${reunioes.slice(0, 5).map((r) => cardHtml(r, { showNome: false })).join('')}</div>`
          : '<p class="empty-msg">Nenhuma 1:1 registrada.</p>'}
      </div>`;
    container.querySelector('[data-oo-new]').addEventListener('click', () => openForm({ colaboradorId: colaborador.id }, reload));
    bindCards(container, reload);
  }

  rhRegisterColabSection({ id: 'one-on-one', order: 10, render: renderColab });
})();
