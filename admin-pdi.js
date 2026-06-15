/* Módulo RH / PDI — Gestão de Plano de Desenvolvimento Individual */

const pdiState = {
  view: 'gestor',
  dashboard: null,
  colaboradorId: null,
  cicloId: null,
  detail: null,
};

const DIM_LABELS = {
  pratico_70: 'Prático (70%)',
  social_20: 'Social (20%)',
  formal_10: 'Formal (10%)',
};

const STATUS_CICLO = {
  rascunho: 'Rascunho',
  ativo: 'Ativo',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const STATUS_ACAO = {
  nao_iniciado: 'Não iniciado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
};

function pdiEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pdiFmtDate(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${day}/${m}/${y}`;
}

function pdiFmtMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pdiLines(raw) {
  if (Array.isArray(raw)) return raw;
  return String(raw || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

function pdiReadLines(name) {
  const el = document.querySelector(`[name="${name}"]`);
  return pdiLines(el?.value);
}

async function pdiApi(path, opts = {}) {
  return api(`/pdi${path}`, opts);
}

function render702010Bar(metricas) {
  const d = metricas?.distribuicao;
  if (!d?.total) {
    return '<p class="pdi-muted">Cadastre ações para ver a distribuição 70·20·10.</p>';
  }
  return `
    <div class="pdi-702010">
      <div class="pdi-702010__bar" role="img" aria-label="Distribuição 70-20-10">
        <span class="pdi-702010__seg pdi-702010__seg--70" style="width:${d.pct.pratico_70}%"></span>
        <span class="pdi-702010__seg pdi-702010__seg--20" style="width:${d.pct.social_20}%"></span>
        <span class="pdi-702010__seg pdi-702010__seg--10" style="width:${d.pct.formal_10}%"></span>
      </div>
      <ul class="pdi-702010__legend">
        <li><span class="swatch swatch--70"></span> Prático ${d.pct.pratico_70}% (${d.pratico_70})</li>
        <li><span class="swatch swatch--20"></span> Social ${d.pct.social_20}% (${d.social_20})</li>
        <li><span class="swatch swatch--10"></span> Formal ${d.pct.formal_10}% (${d.formal_10})</li>
      </ul>
    </div>`;
}

function renderAlertas(metricas) {
  const alerts = [];
  if (metricas?.equilibrio?.alerta) alerts.push(metricas.equilibrio.alerta);
  if (metricas?.checkpoints?.message) alerts.push(metricas.checkpoints.message);
  if (metricas?.acoesAtrasadas > 0) {
    alerts.push(`${metricas.acoesAtrasadas} ação(ões) com prazo vencido.`);
  }
  if (!alerts.length) return '';
  return `<div class="pdi-alerts">${alerts.map((a) => `<p class="pdi-alert">${pdiEsc(a)}</p>`).join('')}</div>`;
}

function renderGestorDashboard(data) {
  const resumo = data.resumo || {};
  const el = document.getElementById('pdi-gestor-content');
  if (!el) return;

  el.innerHTML = `
    <div class="pdi-stats">
      <article class="pdi-stat"><span class="pdi-stat__val">${resumo.totalColaboradores || 0}</span><span class="pdi-stat__lbl">Colaboradores</span></article>
      <article class="pdi-stat"><span class="pdi-stat__val">${resumo.pdisAtivos || 0}</span><span class="pdi-stat__lbl">PDIs ativos</span></article>
      <article class="pdi-stat pdi-stat--warn"><span class="pdi-stat__val">${resumo.alertas || 0}</span><span class="pdi-stat__lbl">Alertas</span></article>
      <article class="pdi-stat"><span class="pdi-stat__val">${pdiFmtMoney(resumo.budgetGasto)}</span><span class="pdi-stat__lbl">Investimento em PDIs</span></article>
    </div>
    <div class="pdi-toolbar">
      <button type="button" class="btn btn-primary btn-sm" id="pdi-new-colaborador">+ Colaborador</button>
      <button type="button" class="btn btn-secondary btn-sm" id="pdi-new-ciclo">+ Novo PDI</button>
    </div>
    <div class="card pdi-table-wrap">
      <h3 class="pdi-section-title">Equipe e PDIs</h3>
      <table class="data-table pdi-table">
        <thead>
          <tr>
            <th>Colaborador</th>
            <th>Cargo → Almejado</th>
            <th>PDI</th>
            <th>Progresso</th>
            <th>Último 1:1</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${(data.colaboradores || []).map((c) => {
            const ciclo = (data.ciclosAtivos || []).find((x) => x.colaborador_id === c.id);
            const prog = ciclo?.progresso ?? 0;
            const alert = ciclo?.metricas?.acoesAtrasadas > 0 || ciclo?.metricas?.checkpoints?.overdue;
            return `<tr class="${alert ? 'pdi-row--alert' : ''}">
              <td><strong>${pdiEsc(c.nome)}</strong><br><small>${pdiEsc(c.email)}</small></td>
              <td>${pdiEsc(c.cargo_atual || '—')} → ${pdiEsc(c.cargo_almejado || '—')}</td>
              <td>${c.pdi_status_ativo ? `<span class="pdi-badge pdi-badge--ativo">Ativo</span>` : '<span class="pdi-muted">Sem PDI ativo</span>'}</td>
              <td><div class="pdi-progress"><span style="width:${prog}%"></span></div> ${prog}%</td>
              <td>${pdiFmtDate(c.ultimo_checkpoint)}</td>
              <td><button type="button" class="btn btn-sm btn-secondary" data-pdi-open="${c.id}">Abrir</button></td>
            </tr>`;
          }).join('') || '<tr><td colspan="6" class="empty-msg">Nenhum colaborador cadastrado.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="pdi-ciclos-grid">
      ${(data.ciclosAtivos || []).map((c) => `
        <article class="card pdi-ciclo-card">
          <header>
            <h4>${pdiEsc(c.colaborador_nome)}</h4>
            <span class="pdi-badge">${pdiFmtDate(c.data_fim)}</span>
          </header>
          <p class="pdi-smart">${pdiEsc(c.objetivo_principal_smart)}</p>
          ${renderAlertas(c.metricas)}
          ${render702010Bar(c.metricas)}
          <p class="pdi-budget">Budget: ${pdiFmtMoney(c.metricas?.budget?.gasto)} / ${pdiFmtMoney(c.metricas?.budget?.limite)}</p>
          <button type="button" class="btn btn-sm btn-secondary" data-pdi-ciclo="${c.id}">Gerenciar ciclo</button>
        </article>
      `).join('')}
    </div>`;

  el.querySelector('#pdi-new-colaborador')?.addEventListener('click', () => openColaboradorForm());
  el.querySelector('#pdi-new-ciclo')?.addEventListener('click', () => openCocriacaoForm());
  el.querySelectorAll('[data-pdi-open]').forEach((btn) => {
    btn.addEventListener('click', () => openColaboradorWorkspace(btn.dataset.pdiOpen));
  });
  el.querySelectorAll('[data-pdi-ciclo]').forEach((btn) => {
    btn.addEventListener('click', () => openCicloDetail(btn.dataset.pdiCiclo));
  });
}

function renderColaboradorWorkspace(data) {
  const el = document.getElementById('pdi-colab-content');
  if (!el) return;
  const c = data.colaborador;
  const ciclo = data.cicloAtivo;

  if (!ciclo) {
    el.innerHTML = `
      <div class="card">
        <h3>${pdiEsc(c.nome)}</h3>
        <p class="pdi-muted">Nenhum PDI ativo. O gestor pode iniciar um plano de cocriação.</p>
        <p><strong>Cargo atual:</strong> ${pdiEsc(c.cargo_atual || '—')}</p>
        <p><strong>Cargo almejado:</strong> ${pdiEsc(c.cargo_almejado || '—')}</p>
      </div>`;
    return;
  }

  const m = ciclo.metricas;
  el.innerHTML = `
    <div class="card pdi-workspace">
      <header class="pdi-workspace__head">
        <div>
          <p class="pdi-kicker">Meu desenvolvimento</p>
          <h3>${pdiEsc(c.nome)}</h3>
        </div>
        <span class="pdi-badge pdi-badge--ativo">${STATUS_CICLO[ciclo.ciclo.status] || ciclo.ciclo.status}</span>
      </header>
      <section class="pdi-block">
        <h4>Objetivo SMART</h4>
        <p class="pdi-smart">${pdiEsc(ciclo.ciclo.objetivo_principal_smart)}</p>
        <p class="pdi-muted">${pdiFmtDate(ciclo.ciclo.data_inicio)} → ${pdiFmtDate(ciclo.ciclo.data_fim)}</p>
        <div class="pdi-progress pdi-progress--lg"><span style="width:${m.progresso}%"></span></div>
        <p>${m.progresso}% concluído</p>
      </section>
      ${renderAlertas(m)}
      ${render702010Bar(m)}
      <section class="pdi-block">
        <h4>Plano de ação</h4>
        <div class="pdi-acoes-list">
          ${(ciclo.acoes || []).map((a) => `
            <article class="pdi-acao-card" data-acao-id="${a.id}">
              <div class="pdi-acao-card__head">
                <span class="pdi-badge pdi-badge--dim">${DIM_LABELS[a.dimensao_70_20_10] || a.dimensao_70_20_10}</span>
                <span class="pdi-badge">${STATUS_ACAO[a.status]}</span>
              </div>
              <p>${pdiEsc(a.acao_descricao)}</p>
              <p class="pdi-muted">Prazo: ${pdiFmtDate(a.prazo_limite)} · ${pdiFmtMoney(a.investimento_estimado)}</p>
              <label class="pdi-evidencia">
                <span>Evidência de aprendizado</span>
                <textarea rows="2" data-evidencia="${a.id}" placeholder="Link, certificado, dashboard criado…">${pdiEsc(a.evidencia_aprendizado || '')}</textarea>
              </label>
              <label class="pdi-evidencia">
                <span>Insights / anotações</span>
                <textarea rows="2" data-anotacao="${a.id}" placeholder="O que aprendi neste curso ou mentoria…">${pdiEsc(a.anotacoes_colaborador || '')}</textarea>
              </label>
              <button type="button" class="btn btn-sm btn-secondary" data-save-acao="${a.id}">Salvar evidência</button>
            </article>
          `).join('') || '<p class="pdi-muted">Nenhuma ação cadastrada.</p>'}
        </div>
      </section>
      <section class="pdi-block">
        <h4>Checkpoints (1:1)</h4>
        <ul class="pdi-checkpoints">
          ${(ciclo.checkpoints || []).map((ch) => `
            <li>
              <strong>${pdiFmtDate(ch.data_reuniao)}</strong>
              ${ch.anotacoes_liderado ? `<p>${pdiEsc(ch.anotacoes_liderado)}</p>` : ''}
              ${ch.proximos_passos ? `<p class="pdi-muted">Próximos passos: ${pdiEsc(ch.proximos_passos)}</p>` : ''}
            </li>
          `).join('') || '<li class="pdi-muted">Nenhum checkpoint registrado.</li>'}
        </ul>
      </section>
    </div>`;

  el.querySelectorAll('[data-save-acao]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.saveAcao;
      const evidencia = el.querySelector(`[data-evidencia="${id}"]`)?.value?.trim() || '';
      const anotacao = el.querySelector(`[data-anotacao="${id}"]`)?.value?.trim() || '';
      try {
        btn.disabled = true;
        await pdiApi(`/acoes/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            evidencia_aprendizado: evidencia,
            anotacoes_colaborador: anotacao,
            status: evidencia ? 'concluido' : undefined,
          }),
        });
        await openColaboradorWorkspace(pdiState.colaboradorId);
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function openColaboradorForm(existing = null) {
  const modal = document.getElementById('pdi-modal');
  const box = document.getElementById('pdi-modal-body');
  if (!modal || !box) return;
  box.innerHTML = `
    <h3>${existing ? 'Editar colaborador' : 'Novo colaborador'}</h3>
    <form id="pdi-colab-form" class="pdi-form">
      <label><span>Nome</span><input name="nome" required value="${pdiEsc(existing?.nome || '')}" /></label>
      <label><span>E-mail</span><input type="email" name="email" required value="${pdiEsc(existing?.email || '')}" /></label>
      <label><span>Cargo atual</span><input name="cargo_atual" value="${pdiEsc(existing?.cargo_atual || '')}" /></label>
      <label><span>Cargo almejado</span><input name="cargo_almejado" value="${pdiEsc(existing?.cargo_almejado || '')}" /></label>
      <label><span>Pontos fortes (um por linha)</span><textarea name="pontos_fortes" rows="3" placeholder="Comunicação, liderança, organização…">${pdiEsc((existing?.pontos_fortes || []).join('\n'))}</textarea></label>
      <label><span>Budget anual (R$)</span><input type="number" name="budget_anual" min="0" step="0.01" value="${existing?.budget_anual ?? 0}" /></label>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="pdi-modal-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>`;
  modal.removeAttribute('hidden');
  box.querySelector('#pdi-modal-cancel')?.addEventListener('click', () => modal.setAttribute('hidden', ''));
  box.querySelector('#pdi-colab-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const payload = {
      nome: f.nome.value.trim(),
      email: f.email.value.trim(),
      cargo_atual: f.cargo_atual.value.trim(),
      cargo_almejado: f.cargo_almejado.value.trim(),
      pontos_fortes: pdiReadLines('pontos_fortes'),
      budget_anual: f.budget_anual.value,
    };
    try {
      if (existing?.id) {
        await pdiApi(`/colaboradores/${existing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await pdiApi('/colaboradores', { method: 'POST', body: JSON.stringify(payload) });
      }
      modal.setAttribute('hidden', '');
      await loadPdiHr();
    } catch (err) {
      alert(err.message);
    }
  });
}

function openCocriacaoForm(colaboradorId = null) {
  const modal = document.getElementById('pdi-modal');
  const box = document.getElementById('pdi-modal-body');
  const cols = pdiState.dashboard?.colaboradores || [];
  if (!modal || !box) return;

  box.innerHTML = `
    <h3>Cocriação do PDI</h3>
    <form id="pdi-cocriacao-form" class="pdi-form pdi-cocriacao">
      <fieldset class="pdi-fieldset pdi-fieldset--diag">
        <legend>Bloco 1 · Diagnóstico</legend>
        <label><span>Colaborador</span>
          <select name="colaborador_id" required>
            <option value="">Selecione…</option>
            ${cols.map((c) => `<option value="${c.id}" ${c.id === colaboradorId ? 'selected' : ''}>${pdiEsc(c.nome)}</option>`).join('')}
          </select>
        </label>
        <label><span>Pontos fortes a potencializar (um por linha)</span>
          <textarea name="pontos_fortes" rows="2" placeholder="Quais habilidades você gostaria de priorizar?"></textarea>
        </label>
      </fieldset>
      <fieldset class="pdi-fieldset pdi-fieldset--estrategia">
        <legend>Bloco 2 · Estratégia</legend>
        <label><span>Objetivo SMART principal</span>
          <textarea name="objetivo_principal_smart" rows="3" required placeholder="Meta específica, mensurável, atingível, relevante e temporal…"></textarea>
        </label>
        <div class="field-row">
          <label><span>Início</span><input type="date" name="data_inicio" required /></label>
          <label><span>Fim (3–6 meses)</span><input type="date" name="data_fim" required /></label>
        </div>
        <label><span>Gaps técnicos (um por linha)</span><textarea name="gaps_tecnicos" rows="2"></textarea></label>
        <label><span>Gaps comportamentais (um por linha)</span><textarea name="gaps_comportamentais" rows="2"></textarea></label>
        <label><span>Limite de budget do ciclo (R$)</span><input type="number" name="budget_limite" min="0" step="0.01" /></label>
      </fieldset>
      <fieldset class="pdi-fieldset pdi-fieldset--acao">
        <legend>Bloco 3 · Ação (70·20·10)</legend>
        <div id="pdi-acoes-builder">
          <div class="pdi-acao-row">
            <label><span>Dimensão</span>
              <select name="dim_0">
                <option value="pratico_70">Prático 70%</option>
                <option value="social_20">Social 20%</option>
                <option value="formal_10">Formal 10%</option>
              </select>
            </label>
            <label class="pdi-grow"><span>Ação</span><input name="acao_0" placeholder="Qual formato de aprendizado prefere?" /></label>
            <label><span>Prazo</span><input type="date" name="prazo_0" /></label>
            <label><span>Investimento R$</span><input type="number" name="inv_0" min="0" step="0.01" /></label>
          </div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="pdi-add-acao-row">+ Ação</button>
      </fieldset>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="pdi-modal-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">Criar PDI ativo</button>
      </div>
    </form>`;

  modal.removeAttribute('hidden');
  let acaoRows = 1;
  box.querySelector('#pdi-add-acao-row')?.addEventListener('click', () => {
    const wrap = box.querySelector('#pdi-acoes-builder');
    const i = acaoRows++;
    wrap.insertAdjacentHTML('beforeend', `
      <div class="pdi-acao-row">
        <label><span>Dimensão</span>
          <select name="dim_${i}">
            <option value="pratico_70">Prático 70%</option>
            <option value="social_20">Social 20%</option>
            <option value="formal_10">Formal 10%</option>
          </select>
        </label>
        <label class="pdi-grow"><span>Ação</span><input name="acao_${i}" /></label>
        <label><span>Prazo</span><input type="date" name="prazo_${i}" /></label>
        <label><span>Investimento R$</span><input type="number" name="inv_${i}" min="0" step="0.01" /></label>
      </div>`);
  });
  box.querySelector('#pdi-modal-cancel')?.addEventListener('click', () => modal.setAttribute('hidden', ''));
  box.querySelector('#pdi-cocriacao-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const acoes = [];
    for (let i = 0; i < acaoRows; i++) {
      const desc = f[`acao_${i}`]?.value?.trim();
      if (!desc) continue;
      acoes.push({
        dimensao_70_20_10: f[`dim_${i}`]?.value || 'pratico_70',
        acao_descricao: desc,
        prazo_limite: f[`prazo_${i}`]?.value || null,
        investimento_estimado: f[`inv_${i}`]?.value || 0,
      });
    }
    const colId = f.colaborador_id.value;
    const pontos = pdiReadLines('pontos_fortes');
    if (pontos.length) {
      await pdiApi(`/colaboradores/${colId}`, {
        method: 'PATCH',
        body: JSON.stringify({ pontos_fortes: pontos }),
      });
    }
    try {
      await pdiApi('/ciclos', {
        method: 'POST',
        body: JSON.stringify({
          colaborador_id: colId,
          objetivo_principal_smart: f.objetivo_principal_smart.value.trim(),
          data_inicio: f.data_inicio.value,
          data_fim: f.data_fim.value,
          gaps_tecnicos: pdiReadLines('gaps_tecnicos'),
          gaps_comportamentais: pdiReadLines('gaps_comportamentais'),
          budget_limite: f.budget_limite.value,
          status: 'ativo',
          acoes,
        }),
      });
      modal.setAttribute('hidden', '');
      await loadPdiHr();
    } catch (err) {
      alert(err.message);
    }
  });
}

async function openColaboradorWorkspace(id) {
  pdiState.colaboradorId = id;
  pdiState.view = 'colaborador';
  document.getElementById('pdi-view-gestor')?.setAttribute('hidden', '');
  document.getElementById('pdi-view-colaborador')?.removeAttribute('hidden');
  document.querySelectorAll('[data-pdi-subview]').forEach((b) => {
    b.classList.toggle('active', b.dataset.pdiSubview === 'colaborador');
  });
  const data = await pdiApi(`/colaboradores/${id}`);
  renderColaboradorWorkspace(data);
}

async function openCicloDetail(cicloId) {
  const modal = document.getElementById('pdi-modal');
  const box = document.getElementById('pdi-modal-body');
  const full = await pdiApi(`/ciclos/${cicloId}`);
  pdiState.cicloId = cicloId;
  if (!modal || !box) return;

  box.innerHTML = `
    <h3>PDI · ${pdiEsc(full.ciclo.colaborador_nome)}</h3>
    ${renderAlertas(full.metricas)}
    ${render702010Bar(full.metricas)}
    <p class="pdi-budget">Budget: ${pdiFmtMoney(full.metricas.budget.gasto)} / ${pdiFmtMoney(full.metricas.budget.limite)}</p>
    <form id="pdi-checkpoint-form" class="pdi-form">
      <h4>Registrar checkpoint (1:1)</h4>
      <label><span>Data</span><input type="date" name="data_reuniao" required /></label>
      <label><span>Anotações do líder</span><textarea name="anotacoes_lider" rows="2"></textarea></label>
      <label><span>Anotações do liderado</span><textarea name="anotacoes_liderado" rows="2"></textarea></label>
      <label><span>Próximos passos</span><textarea name="proximos_passos" rows="2"></textarea></label>
      <button type="submit" class="btn btn-secondary btn-sm">Salvar checkpoint</button>
    </form>
    <button type="button" class="btn btn-ghost" id="pdi-modal-close">Fechar</button>`;
  modal.removeAttribute('hidden');
  box.querySelector('#pdi-modal-close')?.addEventListener('click', () => modal.setAttribute('hidden', ''));
  box.querySelector('#pdi-checkpoint-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await pdiApi(`/ciclos/${cicloId}/checkpoints`, {
        method: 'POST',
        body: JSON.stringify({
          data_reuniao: f.data_reuniao.value,
          anotacoes_lider: f.anotacoes_lider.value,
          anotacoes_liderado: f.anotacoes_liderado.value,
          proximos_passos: f.proximos_passos.value,
        }),
      });
      modal.setAttribute('hidden', '');
      await loadPdiHr();
    } catch (err) {
      alert(err.message);
    }
  });
}

async function loadPdiHr() {
  const loading = document.getElementById('pdi-loading');
  const errEl = document.getElementById('pdi-error');
  loading?.removeAttribute('hidden');
  errEl?.setAttribute('hidden', '');
  try {
    pdiState.dashboard = await pdiApi('');
    if (pdiState.view === 'gestor') {
      renderGestorDashboard(pdiState.dashboard);
    } else if (pdiState.colaboradorId) {
      await openColaboradorWorkspace(pdiState.colaboradorId);
    }
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || 'Erro ao carregar RH/PDI.';
      errEl.removeAttribute('hidden');
    }
  } finally {
    loading?.setAttribute('hidden', '');
  }
}

function initPdiAdmin() {
  document.querySelectorAll('[data-pdi-subview]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.pdiSubview;
      pdiState.view = view;
      document.querySelectorAll('[data-pdi-subview]').forEach((b) => b.classList.toggle('active', b === btn));
      if (view === 'gestor') {
        document.getElementById('pdi-view-gestor')?.removeAttribute('hidden');
        document.getElementById('pdi-view-colaborador')?.setAttribute('hidden', '');
        renderGestorDashboard(pdiState.dashboard || { colaboradores: [], ciclosAtivos: [], resumo: {} });
      }
    });
  });
  document.getElementById('pdi-refresh')?.addEventListener('click', () => loadPdiHr());
  document.getElementById('pdi-modal')?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
    document.getElementById('pdi-modal')?.setAttribute('hidden', '');
  });
}

function onPdiTabOpen() {
  loadPdiHr();
}
