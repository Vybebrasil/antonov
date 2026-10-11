/* Admin — Parceiros Antonov */

const pxState = {
  view: 'dashboard',
  partners: [],
  categories: [],
  plans: [],
  contracts: [],
  campaigns: [],
  placements: [],
  payments: [],
  users: [],
  role: '',
  userId: null,
  dashboard: null,
  editingPartner: null,
  editingPlan: null,
  editingCategory: null,
  editingContract: null,
  contractsFilters: { q: '', status: '', plan_id: '', sort: 'ends_on' },
  categoriesFilters: { q: '', status: '', sort: 'sort_order' },
  financeFilters: { partner_id: '', q: '' },
  partnersQuery: { q: '', status: '', categoria: '', page: 1 },
  partnersTotal: 0,
  contractPayments: [],
  contractWarnDays: [30, 15, 7],
  dashboardDays: 30,
  dashboardFilters: { category_id: '', plan_id: '', sort: 'leads' },
  categoryDetailId: null,
};

const PX_ROLE_LABEL = {
  super_admin: 'Super admin',
  admin_antonov: 'Admin Antonov',
  marketing: 'Marketing',
  financeiro: 'Financeiro',
  parceiro: 'Parceiro',
};

const PX_ROLE_CAN = {
  super_admin: 'Acesso total, inclusive usuários e o portal de qualquer parceiro.',
  admin_antonov: 'Parceiros, categorias, planos, contratos, campanhas, analytics e financeiro. Sem gestão de usuários.',
  marketing: 'Parceiros, categorias, publicidade, campanhas e analytics. Sem contratos, financeiro nem usuários.',
  financeiro: 'Planos em leitura, contratos, financeiro e analytics. Sem cadastro de parceiros nem campanhas.',
  parceiro: 'Somente o portal do parceiro vinculado. Não entra no admin.',
};

function pxEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function pxApi(path, opts = {}) {
  return api(`/parceiros${path}`, opts);
}

function pxBadge(status) {
  const map = {
    ativo: 'pdi-badge--ativo',
    ativa: 'pdi-badge--ativo',
    pago: 'pdi-badge--ativo',
    vencendo: 'pdi-badge--warn',
    pendente: 'pdi-badge--pending',
    atrasado: 'pdi-badge--danger',
    vencido: 'pdi-badge--danger',
    cancelado: 'pdi-badge--muted',
    arquivado: 'pdi-badge--muted',
    arquivada: 'pdi-badge--muted',
  };
  const cls = map[status] || '';
  return `<span class="pdi-badge ${cls}">${pxEsc(status)}</span>`;
}

async function loadPxDashboard() {
  const el = document.getElementById('px-content');
  if (!el) return;
  el.innerHTML = '<p class="dash-loading">Carregando…</p>';
  const days = [7, 30, 90].includes(Number(pxState.dashboardDays)) ? Number(pxState.dashboardDays) : 30;
  pxState.dashboardDays = days;
  if (!pxState.dashboardFilters) {
    pxState.dashboardFilters = { category_id: '', plan_id: '', sort: 'leads' };
  }
  const f = pxState.dashboardFilters;
  try {
    const qs = new URLSearchParams({ days: String(days) });
    if (f.category_id) qs.set('category_id', f.category_id);
    if (f.plan_id) qs.set('plan_id', f.plan_id);

    const [data, catsRes, plansRes] = await Promise.all([
      pxApi(`/dashboard?${qs.toString()}`),
      pxState.categories?.length ? Promise.resolve({ categories: pxState.categories }) : pxApi('/categories').catch(() => ({ categories: [] })),
      pxState.plans?.length ? Promise.resolve({ plans: pxState.plans }) : pxApi('/plans').catch(() => ({ plans: [] })),
    ]);
    if (catsRes.categories) pxState.categories = catsRes.categories;
    if (plansRes.plans) pxState.plans = plansRes.plans;

    pxState.dashboard = data;
    const o = data.occupancy || {};
    const cur = data.analytics?.current || {};
    const varn = data.analytics?.variation || {};
    const fin = data.finance || {};
    const period = data.analytics?.period || {};
    const channels = data.analytics?.channels || {
      whatsapp: cur.whatsapp || 0,
      instagram: cur.instagram || 0,
      maps: cur.maps || 0,
      website: cur.website || 0,
    };
    const series = data.analytics?.series || [];
    const warnLabel = Array.isArray(o.warn_days) && o.warn_days.length
      ? `alerta ${o.warn_days.join('/')} dias`
      : 'alerta 30/15/7';
    const periodLabel = pxPeriodLabel(period, days);
    const attention = data.attention || {};
    const attentionContracts = attention.contracts || [];
    const overduePayments = attention.overdue_payments || [];
    const byPlan = attention.by_plan || [];
    const withoutContract = Number(attention.partners_without_contract) || 0;
    const health = data.health || null;
    const categories = (pxState.categories || []).filter((c) => c.status !== 'arquivada');
    const plans = (pxState.plans || []).filter((p) => p.status === 'ativo');
    const ranking = pxSortedRanking(data.analytics?.ranking || [], f.sort);

    el.innerHTML = `
      <div class="pdi-toolbar px-dash-toolbar">
        <div class="px-period-group" role="group" aria-label="Período do painel">
          ${[7, 30, 90].map((d) => `
            <button type="button" class="px-chip${days === d ? ' is-active' : ''}" data-px-dash-days="${d}">${d} dias</button>
          `).join('')}
        </div>
        <span class="pdi-muted px-dash-period-label">${pxEsc(periodLabel)}</span>
        <div class="px-dash-actions">
          <button type="button" class="btn btn-sm btn-primary" id="px-dash-new-partner">+ Parceiro</button>
          <button type="button" class="btn btn-sm btn-secondary" id="px-dash-new-contract">+ Contrato</button>
          <button type="button" class="btn btn-sm btn-ghost" id="px-dash-tick" title="Recalcular status de contratos, campanhas e avisos">Rodar tick</button>
        </div>
      </div>
      <div class="px-dash-filters">
        <label class="px-filter-field">
          <span>Categoria</span>
          <select id="px-dash-filter-cat">
            <option value="">Todas</option>
            ${categories.map((c) => `<option value="${c.id}"${String(f.category_id) === String(c.id) ? ' selected' : ''}>${pxEsc(c.name)}</option>`).join('')}
          </select>
        </label>
        <label class="px-filter-field">
          <span>Plano</span>
          <select id="px-dash-filter-plan">
            <option value="">Todos</option>
            ${plans.map((p) => `<option value="${p.id}"${String(f.plan_id) === String(p.id) ? ' selected' : ''}>${pxEsc(p.name)}</option>`).join('')}
          </select>
        </label>
        ${(f.category_id || f.plan_id) ? `<button type="button" class="btn btn-sm btn-ghost" id="px-dash-clear-filters">Limpar filtros</button>` : ''}
      </div>
      <div class="pdi-stats">
        <button type="button" class="pdi-stat pdi-stat--clickable" data-px-jump-view="partners" title="Ver parceiros">
          <span class="pdi-stat__val">${o.active || 0}</span>
          <span class="pdi-stat__lbl">Parceiros ativos</span>
        </button>
        <button type="button" class="pdi-stat pdi-stat--clickable" data-px-jump-view="partners" data-px-partners-filter="inactive" title="Ver inativos">
          <span class="pdi-stat__val">${o.inactive || 0}</span>
          <span class="pdi-stat__lbl">Inativos</span>
        </button>
        <article class="pdi-stat" title="Capacidade estimada (40 − ativos)">
          <span class="pdi-stat__val">${o.slots || 0}</span>
          <span class="pdi-stat__lbl">Vagas</span>
        </article>
        <button type="button" class="pdi-stat pdi-stat--clickable pdi-stat--warn" data-px-jump-contracts="vencendo" title="${pxEsc(warnLabel)}">
          <span class="pdi-stat__val">${o.expiring || 0}</span>
          <span class="pdi-stat__lbl">Contratos vencendo</span>
        </button>
        <button type="button" class="pdi-stat pdi-stat--clickable" data-px-jump-contracts="vencido">
          <span class="pdi-stat__val">${o.expired || 0}</span>
          <span class="pdi-stat__lbl">Contratos vencidos</span>
        </button>
        <article class="pdi-stat" title="Vs período anterior">
          <span class="pdi-stat__val">${cur.impressions || 0}</span>
          <span class="pdi-stat__lbl">Impressões ${pxVarChip(varn.impressions)}</span>
        </article>
        <article class="pdi-stat" title="Vs período anterior">
          <span class="pdi-stat__val">${cur.profile_views || 0}</span>
          <span class="pdi-stat__lbl">Perfis ${pxVarChip(varn.profile_views)}</span>
        </article>
        <button type="button" class="pdi-stat pdi-stat--clickable" data-px-jump-view="analytics" title="Ver analytics">
          <span class="pdi-stat__val">${cur.leads || 0}</span>
          <span class="pdi-stat__lbl">Leads ${pxVarChip(varn.leads)}</span>
        </button>
        <article class="pdi-stat" title="Vs período anterior">
          <span class="pdi-stat__val">${cur.ctr || 0}%</span>
          <span class="pdi-stat__lbl">CTR ${pxVarChip(varn.ctr)}</span>
        </article>
        <button type="button" class="pdi-stat pdi-stat--clickable" data-px-jump-view="finance" title="Ver financeiro">
          <span class="pdi-stat__val">R$ ${Number(fin.contracted_contracts || 0).toLocaleString('pt-BR')}</span>
          <span class="pdi-stat__lbl">Receita contratada</span>
        </button>
        <button type="button" class="pdi-stat pdi-stat--clickable" data-px-jump-view="finance" title="Ver financeiro">
          <span class="pdi-stat__val">R$ ${Number(fin.received || 0).toLocaleString('pt-BR')}</span>
          <span class="pdi-stat__lbl">Recebida</span>
        </button>
        <button type="button" class="pdi-stat pdi-stat--clickable pdi-stat--warn" data-px-jump-view="finance" data-px-finance-focus="pending" title="Ver a receber">
          <span class="pdi-stat__val">R$ ${Number(fin.pending || 0).toLocaleString('pt-BR')}</span>
          <span class="pdi-stat__lbl">A receber</span>
        </button>
      </div>
      ${renderPxPlanOccupancy(byPlan, withoutContract)}
      ${renderPxInsights(series, channels)}
      ${renderPxHealthBlock(health, withoutContract)}
      ${(o.expiring || o.expired) ? `
        <div class="px-alert-banner${o.expired ? ' px-alert-banner--danger' : ''}">
          <strong>Atenção comercial:</strong>
          ${o.expiring || 0} contrato(s) vencendo (${warnLabel})
          ${o.expired ? ` · ${o.expired} já vencido(s)` : ''}.
          <button type="button" class="btn btn-sm btn-secondary" data-px-jump-contracts="vencendo">Ver vencendo</button>
          ${o.expired ? `<button type="button" class="btn btn-sm btn-ghost" data-px-jump-contracts="vencido">Ver vencidos</button>` : ''}
        </div>
      ` : ''}
      ${renderPxAttentionBlock(attentionContracts, overduePayments)}
      ${renderPxRanking(ranking, f.sort)}
    `;
    el.querySelectorAll('[data-px-dash-days]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pxState.dashboardDays = Number(btn.dataset.pxDashDays) || 30;
        loadPxDashboard();
      });
    });
    const applyDashFilters = () => {
      pxState.dashboardFilters.category_id = el.querySelector('#px-dash-filter-cat')?.value || '';
      pxState.dashboardFilters.plan_id = el.querySelector('#px-dash-filter-plan')?.value || '';
      loadPxDashboard();
    };
    el.querySelector('#px-dash-filter-cat')?.addEventListener('change', applyDashFilters);
    el.querySelector('#px-dash-filter-plan')?.addEventListener('change', applyDashFilters);
    el.querySelector('#px-dash-clear-filters')?.addEventListener('click', () => {
      pxState.dashboardFilters.category_id = '';
      pxState.dashboardFilters.plan_id = '';
      loadPxDashboard();
    });
    el.querySelectorAll('[data-px-jump-contracts]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pxState.contractsFilters = {
          ...(pxState.contractsFilters || {}),
          status: btn.dataset.pxJumpContracts || '',
          q: '',
          plan_id: '',
          sort: 'ends_on',
        };
        switchPxView('contracts');
      });
    });
    el.querySelectorAll('[data-px-jump-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.pxJumpView;
        if (view === 'finance') {
          pxState.financeFilters = { ...(pxState.financeFilters || {}), partner_id: '', q: '' };
        }
        if (view === 'partners' && btn.dataset.pxPartnersFilter === 'inactive') {
          pxState.partnersFilter = 'inactive';
        } else if (view === 'partners') {
          pxState.partnersFilter = '';
        }
        switchPxView(view);
      });
    });
    el.querySelector('#px-rank-sort')?.addEventListener('change', (ev) => {
      pxState.dashboardFilters.sort = ev.target.value || 'leads';
      loadPxDashboard();
    });
    el.querySelector('#px-export-ranking')?.addEventListener('click', () => pxExportRankingCsv(ranking));
    bindPxRankingActions(el);
    bindPxDashboardPhase2(el, attentionContracts, overduePayments);
    bindPxDashboardHealth(el, health);
  } catch (err) {
    el.innerHTML = `<p class="section-error">${pxEsc(err.message)}</p>`;
  }
}

function pxPeriodLabel(period, days) {
  const from = period?.from ? String(period.from).slice(0, 10) : '';
  const to = period?.to ? String(period.to).slice(0, 10) : '';
  if (from && to) {
    const a = from.split('-').reverse().join('/');
    const b = to.split('-').reverse().join('/');
    return `Últimos ${days} dias · ${a} → ${b}`;
  }
  return `Últimos ${days} dias`;
}

function pxVarChip(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const rounded = Math.round(n * 10) / 10;
  if (rounded === 0) return `<span class="px-var px-var--flat">0%</span>`;
  const cls = rounded > 0 ? 'px-var--up' : 'px-var--down';
  const sign = rounded > 0 ? '+' : '';
  return `<span class="px-var ${cls}">${sign}${rounded}%</span>`;
}

function renderPxPlanOccupancy(byPlan, withoutContract) {
  if (!byPlan.length && !withoutContract) return '';
  return `
    <div class="px-plan-occ">
      <h3 class="pdi-section-title">Ocupação por plano</h3>
      <div class="px-plan-occ__grid">
        ${byPlan.map((p) => `
          <button type="button" class="px-plan-occ__card" data-px-jump-contracts-plan="${p.id}" title="Ver contratos deste plano">
            <strong>${pxEsc(p.name)}</strong>
            <span class="px-plan-occ__val">${p.partners}</span>
            <span class="pdi-muted">${p.contracts} contrato(s) · R$ ${pxMoney(p.revenue)}</span>
          </button>
        `).join('')}
        ${withoutContract ? `
          <button type="button" class="px-plan-occ__card px-plan-occ__card--warn" data-px-scroll-health="without-contract" title="Ver lista sem contrato">
            <strong>Sem contrato ativo</strong>
            <span class="px-plan-occ__val">${withoutContract}</span>
            <span class="pdi-muted">Parceiros ativos sem vigência</span>
          </button>
        ` : ''}
      </div>
    </div>`;
}

function renderPxHealthBlock(health, withoutContractTotal) {
  if (!health) return '';
  const without = health.without_contract || [];
  const complete = health.completeness || {};
  const counts = complete.counts || {};
  const incompletePartners = complete.partners || [];
  const placements = health.placements || [];
  const notifications = health.notifications || [];
  const finM = health.finance_month || {};
  const tm = finM.this_month || {};
  const lm = finM.last_month || {};
  const varn = finM.variation || {};
  const totalWithout = withoutContractTotal || without.length;

  return `
    <div class="px-health" id="px-health">
      <h3 class="pdi-section-title">Saúde do ecossistema</h3>
      <div class="px-health__grid">
        <div class="card px-health__card" id="px-health-without-contract">
          <div class="px-attention__head">
            <h4>Sem contrato ativo <span class="pdi-muted">(${totalWithout})</span></h4>
            <button type="button" class="btn btn-sm btn-ghost" data-px-jump-view="partners">Parceiros</button>
          </div>
          <ul class="px-health-list">
            ${without.map((p) => `
              <li>
                <button type="button" class="px-rank-name" data-px-health-edit="${p.id}"><strong>${pxEsc(p.name)}</strong></button>
                ${p.slug ? `<a class="btn btn-sm btn-ghost" href="/parceiros/${pxEsc(p.slug)}" target="_blank" rel="noopener">Ver</a>` : ''}
                <button type="button" class="btn btn-sm btn-secondary" data-px-health-new-contract="${p.id}">+ Contrato</button>
              </li>
            `).join('') || '<li class="pdi-muted">Todos os ativos têm contrato em vigor.</li>'}
          </ul>
          ${totalWithout > without.length ? `<p class="pdi-muted">Mostrando ${without.length} de ${totalWithout}.</p>` : ''}
        </div>

        <div class="card px-health__card">
          <div class="px-attention__head">
            <h4>Completude do perfil <span class="pdi-muted">(${counts.incomplete || 0})</span></h4>
          </div>
          <div class="px-health-checks">
            <span class="px-chip${counts.missing_photo ? ' is-active' : ''}">Sem foto: ${counts.missing_photo || 0}</span>
            <span class="px-chip${counts.missing_whatsapp ? ' is-active' : ''}">Sem WhatsApp: ${counts.missing_whatsapp || 0}</span>
            <span class="px-chip${counts.missing_logo ? '' : ''}">Sem logo: ${counts.missing_logo || 0}</span>
          </div>
          <ul class="px-health-list">
            ${incompletePartners.map((p) => {
              const tags = [
                p.missing_photo ? 'foto' : null,
                p.missing_whatsapp ? 'whatsapp' : null,
                p.missing_logo ? 'logo' : null,
              ].filter(Boolean).join(', ');
              return `
                <li>
                  <button type="button" class="px-rank-name" data-px-health-edit="${p.id}"><strong>${pxEsc(p.name)}</strong></button>
                  <span class="pdi-muted">${pxEsc(tags)}</span>
                </li>`;
            }).join('') || '<li class="pdi-muted">Perfis ativos completos.</li>'}
          </ul>
        </div>

        <div class="card px-health__card">
          <div class="px-attention__head">
            <h4>Placements / campanhas</h4>
            <button type="button" class="btn btn-sm btn-ghost" data-px-jump-view="placements">Publicidade</button>
          </div>
          <ul class="px-health-list">
            ${placements.map((pl) => `
              <li>
                <div>
                  <strong>${pxEsc(pl.name)}</strong>
                  <div class="pdi-muted">${pxEsc(pl.code)}</div>
                </div>
                <span class="px-chip${pl.active_campaigns ? ' is-active' : ''}">${pl.active_campaigns} ativa(s)</span>
              </li>
            `).join('') || '<li class="pdi-muted">Nenhum placement cadastrado.</li>'}
          </ul>
        </div>

        <div class="card px-health__card">
          <div class="px-attention__head">
            <h4>Avisos recentes <span class="pdi-muted">(${notifications.length})</span></h4>
          </div>
          <ul class="px-health-list">
            ${notifications.map((n) => `
              <li>
                <div>
                  <strong>${pxEsc(n.partner_name)}</strong>
                  <div class="pdi-muted">${pxEsc(n.channel)} · ${n.warn_days}d · ${pxEsc(String(n.created_at || '').replace('T', ' ').slice(0, 16))}</div>
                </div>
                <button type="button" class="btn btn-sm btn-ghost" data-px-attn-notify="${n.contract_id}">Abrir</button>
              </li>
            `).join('') || '<li class="pdi-muted">Nenhum aviso registrado ainda. Use “Rodar tick”.</li>'}
          </ul>
        </div>

        <div class="card px-health__card px-health__card--finance">
          <div class="px-attention__head">
            <h4>Financeiro do mês</h4>
            <button type="button" class="btn btn-sm btn-ghost" data-px-jump-view="finance">Financeiro</button>
          </div>
          <div class="pdi-stats px-health-fin-stats">
            <article class="pdi-stat">
              <span class="pdi-stat__val">R$ ${pxMoney(tm.received)}</span>
              <span class="pdi-stat__lbl">Recebido ${pxVarChip(varn.received)}</span>
            </article>
            <article class="pdi-stat pdi-stat--warn">
              <span class="pdi-stat__val">R$ ${pxMoney(tm.pending)}</span>
              <span class="pdi-stat__lbl">Em aberto ${pxVarChip(varn.pending)}</span>
            </article>
            <article class="pdi-stat">
              <span class="pdi-stat__val">R$ ${pxMoney(tm.contracted)}</span>
              <span class="pdi-stat__lbl">Contratado no mês</span>
            </article>
          </div>
          <p class="pdi-muted">Mês anterior: recebido R$ ${pxMoney(lm.received)} · aberto R$ ${pxMoney(lm.pending)}</p>
          ${finM.goal != null ? `
            <div class="px-goal">
              <div class="px-channel-list__meta"><strong>Meta mensal</strong><span>R$ ${pxMoney(finM.goal)} · ${finM.goal_progress ?? 0}%</span></div>
              <div class="pdi-progress pdi-progress--lg"><span style="width:${Math.min(100, finM.goal_progress || 0)}%"></span></div>
            </div>
          ` : '<p class="pdi-muted">Defina <code>finance_monthly_goal</code> em partner_settings para meta.</p>'}
        </div>
      </div>
    </div>`;
}

function bindPxDashboardHealth(el, health) {
  el.querySelectorAll('[data-px-scroll-health]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('px-health-without-contract')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  el.querySelectorAll('[data-px-health-edit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await pxEnsurePartnersCache();
        if (!pxState.categories?.length) {
          const cats = await pxApi('/categories');
          pxState.categories = cats.categories || [];
        }
        const cached = (pxState.partners || []).find((p) => String(p.id) === String(btn.dataset.pxHealthEdit));
        if (cached) {
          openPxPartnerForm(cached);
          return;
        }
        const res = await pxApi(`/partners/${btn.dataset.pxHealthEdit}`);
        if (res.partner) openPxPartnerForm(res.partner);
      } catch (err) {
        alert(err.message || 'Falha ao abrir parceiro.');
      }
    });
  });
  el.querySelectorAll('[data-px-health-new-contract]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await Promise.all([pxEnsurePartnersCache(), pxEnsurePlansCache(), pxEnsureContractsCache()]);
      const partnerId = Number(btn.dataset.pxHealthNewContract);
      openPxContractForm({ partner_id: partnerId });
    });
  });
  // Reuse notify from attention contracts seed
  const notifySeed = (health?.notifications || []).map((n) => ({
    id: n.contract_id,
    partner_name: n.partner_name,
    ends_on: n.ends_on,
    status: 'vencendo',
    days_left: n.warn_days,
  }));
  el.querySelectorAll('#px-health [data-px-attn-notify]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await pxEnsureContractsCache(notifySeed);
      openPxNotifyContract(btn.dataset.pxAttnNotify);
    });
  });
}

function renderPxAttentionBlock(contracts, overduePayments) {
  if (!contracts.length && !overduePayments.length) {
    return `
      <div class="card px-attention" style="margin-top:1rem;">
        <h3>Precisa de atenção</h3>
        <p class="empty-msg">Nada pendente: sem contratos vencendo/vencidos nem pagamentos atrasados.</p>
      </div>`;
  }
  return `
    <div class="px-attention-grid">
      <div class="card px-attention">
        <div class="px-attention__head">
          <h3>Precisa de atenção <span class="pdi-muted">(${contracts.length})</span></h3>
          <button type="button" class="btn btn-sm btn-ghost" data-px-jump-contracts="vencendo">Ver todos</button>
        </div>
        <div class="card pdi-table-wrap px-attention__table">
          <table class="data-table pdi-table">
            <thead><tr><th>Parceiro</th><th>Plano</th><th>Fim</th><th>Dias</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${contracts.map((c) => `
                <tr class="${c.status === 'vencido' ? 'pdi-row--alert' : ''}">
                  <td><strong>${pxEsc(c.partner_name)}</strong></td>
                  <td>${pxEsc(c.plan_name || '—')}</td>
                  <td>${pxEsc(String(c.ends_on || '').slice(0, 10))}</td>
                  <td><span class="px-days px-days--warn">${pxEsc(pxDaysLeftLabel(c.days_left, c.status))}</span></td>
                  <td>${pxBadge(c.status)}</td>
                  <td class="pdi-actions">
                    ${c.status !== 'cancelado' ? `<button type="button" class="btn btn-sm btn-secondary" data-px-attn-renew="${c.id}">Renovar</button>` : ''}
                    <button type="button" class="btn btn-sm btn-ghost" data-px-attn-notify="${c.id}">Avisar</button>
                    <button type="button" class="btn btn-sm btn-ghost" data-px-attn-edit="${c.id}">Abrir</button>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="6" class="empty-msg">Nenhum contrato em alerta.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card px-attention">
        <div class="px-attention__head">
          <h3>Pagamentos atrasados <span class="pdi-muted">(${overduePayments.length})</span></h3>
          <button type="button" class="btn btn-sm btn-ghost" data-px-jump-view="finance">Financeiro</button>
        </div>
        <div class="card pdi-table-wrap px-attention__table">
          <table class="data-table pdi-table">
            <thead><tr><th>Parceiro</th><th>Vencimento</th><th>Pendente</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${overduePayments.map((p) => `
                <tr class="pdi-row--alert">
                  <td><strong>${pxEsc(p.partner_name || '—')}</strong></td>
                  <td>${pxEsc(String(p.due_on || '—').slice(0, 10))}</td>
                  <td>R$ ${pxMoney(p.pending_amount)}</td>
                  <td>${pxBadge(p.status)}</td>
                  <td class="pdi-actions">
                    <button type="button" class="btn btn-sm btn-secondary" data-px-attn-payment="${p.id}" data-partner="${p.partner_id || ''}">Abrir</button>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="5" class="empty-msg">Nenhum pagamento atrasado.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

async function pxEnsureContractsCache(seed = []) {
  if (!Array.isArray(pxState.contracts)) pxState.contracts = [];
  for (const c of seed) {
    if (!pxState.contracts.some((x) => String(x.id) === String(c.id))) {
      pxState.contracts.push(c);
    }
  }
  if (pxState.contracts.length) return;
  try {
    const res = await pxApi('/contracts');
    pxState.contracts = res.contracts || [];
    if (Array.isArray(res.warn_days)) pxState.contractWarnDays = res.warn_days;
  } catch {
    /* ignore */
  }
}

async function pxEnsurePlansCache() {
  if (pxState.plans?.length) return;
  try {
    const res = await pxApi('/plans');
    pxState.plans = res.plans || [];
  } catch {
    /* ignore */
  }
}

async function pxEnsurePartnersCache() {
  if (pxState.partners?.length) return;
  try {
    const res = await pxApi('/partners?limit=100');
    pxState.partners = res.partners || [];
  } catch {
    /* ignore */
  }
}

function bindPxDashboardPhase2(el, attentionContracts, overduePayments) {
  el.querySelector('#px-dash-new-partner')?.addEventListener('click', async () => {
    await pxEnsurePartnersCache();
    if (!pxState.categories?.length) {
      try {
        const cats = await pxApi('/categories');
        pxState.categories = cats.categories || [];
      } catch { /* ignore */ }
    }
    openPxPartnerForm();
  });
  el.querySelector('#px-dash-new-contract')?.addEventListener('click', async () => {
    await Promise.all([pxEnsurePartnersCache(), pxEnsurePlansCache(), pxEnsureContractsCache()]);
    openPxContractForm();
  });
  el.querySelector('#px-dash-tick')?.addEventListener('click', async () => {
    const btn = el.querySelector('#px-dash-tick');
    if (btn) { btn.disabled = true; btn.textContent = 'Atualizando…'; }
    try {
      const res = await pxApi('/tick', { method: 'POST', body: '{}' });
      const renewed = res.renewals?.renewed || 0;
      const queued = res.notifications?.queued || 0;
      alert(`Tick ok.${renewed ? ` ${renewed} renovação(ões).` : ''}${queued ? ` ${queued} aviso(s).` : ''}`);
      await loadPxDashboard();
    } catch (err) {
      alert(err.message || 'Falha ao rodar o tick.');
      if (btn) { btn.disabled = false; btn.textContent = 'Rodar tick'; }
    }
  });

  el.querySelectorAll('[data-px-jump-contracts-plan]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pxState.contractsFilters = {
        ...(pxState.contractsFilters || {}),
        status: '',
        q: '',
        plan_id: String(btn.dataset.pxJumpContractsPlan || ''),
        sort: 'ends_on',
      };
      switchPxView('contracts');
    });
  });

  el.querySelectorAll('[data-px-attn-renew]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await Promise.all([
        pxEnsureContractsCache(attentionContracts),
        pxEnsurePlansCache(),
        pxEnsurePartnersCache(),
      ]);
      openPxRenewContract(btn.dataset.pxAttnRenew);
    });
  });
  el.querySelectorAll('[data-px-attn-notify]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await pxEnsureContractsCache(attentionContracts);
      openPxNotifyContract(btn.dataset.pxAttnNotify);
    });
  });
  el.querySelectorAll('[data-px-attn-edit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await Promise.all([
        pxEnsureContractsCache(attentionContracts),
        pxEnsurePlansCache(),
        pxEnsurePartnersCache(),
      ]);
      const contract = pxState.contracts.find((c) => String(c.id) === String(btn.dataset.pxAttnEdit));
      openPxContractForm(contract || null);
    });
  });
  el.querySelectorAll('[data-px-attn-payment]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const payment = overduePayments.find((p) => String(p.id) === String(btn.dataset.pxAttnPayment));
      if (payment) {
        goPxFinanceForPartner(payment.partner_id);
        return;
      }
      const partnerId = btn.dataset.partner;
      if (partnerId) goPxFinanceForPartner(partnerId);
      else switchPxView('finance');
    });
  });
}

function pxSortedRanking(rows, sortKey = 'leads') {
  const key = ['impressions', 'ctr', 'leads', 'whatsapp', 'profile_views', 'name'].includes(sortKey)
    ? sortKey
    : 'leads';
  const list = [...(rows || [])];
  list.sort((a, b) => {
    if (key === 'name') return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    return (Number(b[key]) || 0) - (Number(a[key]) || 0);
  });
  return list;
}

function pxExportRankingCsv(rows) {
  const header = ['Parceiro', 'Categoria', 'Impressoes', 'Perfis', 'WhatsApp', 'Instagram', 'Maps', 'Website', 'CTR', 'Leads'];
  const lines = [header.join(';')];
  for (const r of rows) {
    const cells = [
      r.name,
      r.category || '',
      r.impressions,
      r.profile_views,
      r.whatsapp,
      r.instagram || 0,
      r.maps || 0,
      r.website || 0,
      String(r.ctr ?? 0).replace('.', ','),
      r.leads,
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`);
    lines.push(cells.join(';'));
  }
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ranking-parceiros-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderPxInsights(series, channels) {
  const ch = channels || {};
  const channelRows = [
    ['WhatsApp', ch.whatsapp || 0],
    ['Instagram', ch.instagram || 0],
    ['Maps', ch.maps || 0],
    ['Website', ch.website || 0],
  ];
  const maxCh = Math.max(1, ...channelRows.map(([, n]) => n));
  const maxImp = Math.max(1, ...(series || []).map((d) => Number(d.impressions) || 0));
  const maxLeads = Math.max(1, ...(series || []).map((d) => Number(d.leads) || 0));
  const compact = (series || []).length > 45;

  return `
    <div class="px-insights">
      <div class="card px-insight-card">
        <h3 class="pdi-section-title">Série do período</h3>
        <p class="pdi-muted px-insight-legend"><span class="px-dot px-dot--imp"></span> Impressões · <span class="px-dot px-dot--lead"></span> Leads</p>
        <div class="px-spark" role="img" aria-label="Gráfico de impressões e leads por dia">
          ${(series || []).map((d) => {
            const impH = Math.round(((Number(d.impressions) || 0) / maxImp) * 100);
            const leadH = Math.round(((Number(d.leads) || 0) / maxLeads) * 100);
            const label = String(d.day || '').slice(5).replace('-', '/');
            return `
              <div class="px-spark__col${compact ? ' px-spark__col--compact' : ''}" title="${pxEsc(d.day)}: ${d.impressions} impressões, ${d.leads} leads">
                <div class="px-spark__bars">
                  <span class="px-spark__bar px-spark__bar--imp" style="height:${impH}%"></span>
                  <span class="px-spark__bar px-spark__bar--lead" style="height:${leadH}%"></span>
                </div>
                ${compact ? '' : `<span class="px-spark__lbl">${pxEsc(label)}</span>`}
              </div>`;
          }).join('') || '<p class="empty-msg">Sem série no período.</p>'}
        </div>
      </div>
      <div class="card px-insight-card">
        <h3 class="pdi-section-title">Canais</h3>
        <ul class="px-channel-list">
          ${channelRows.map(([name, n]) => `
            <li>
              <div class="px-channel-list__meta">
                <strong>${pxEsc(name)}</strong>
                <span>${n}</span>
              </div>
              <div class="pdi-progress pdi-progress--lg"><span style="width:${Math.round((n / maxCh) * 100)}%"></span></div>
            </li>
          `).join('')}
        </ul>
      </div>
    </div>`;
}

function renderPxRanking(rows, sortKey = 'leads') {
  const sort = sortKey || 'leads';
  return `
    <div class="card pdi-table-wrap" style="margin-top:1rem;">
      <div class="px-rank-head">
        <h3>Ranking de parceiros <span class="pdi-muted">(${rows.length})</span></h3>
        <div class="px-rank-tools">
          <label class="px-filter-field">
            <span>Ordenar</span>
            <select id="px-rank-sort">
              <option value="leads"${sort === 'leads' ? ' selected' : ''}>Leads</option>
              <option value="impressions"${sort === 'impressions' ? ' selected' : ''}>Impressões</option>
              <option value="ctr"${sort === 'ctr' ? ' selected' : ''}>CTR</option>
              <option value="whatsapp"${sort === 'whatsapp' ? ' selected' : ''}>WhatsApp</option>
              <option value="profile_views"${sort === 'profile_views' ? ' selected' : ''}>Perfis</option>
              <option value="name"${sort === 'name' ? ' selected' : ''}>Nome</option>
            </select>
          </label>
          <button type="button" class="btn btn-sm btn-secondary" id="px-export-ranking"${rows.length ? '' : ' disabled'}>Exportar CSV</button>
        </div>
      </div>
      ${rows.length ? `
      <table class="data-table pdi-table">
        <thead><tr>
          <th>Parceiro</th><th>Categoria</th><th>Impressões</th><th>Perfis</th><th>WhatsApp</th><th>CTR</th><th>Leads</th><th></th>
        </tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td>
              <button type="button" class="px-rank-name" data-px-rank-edit="${r.id}">
                <strong>${pxEsc(r.name)}</strong>
              </button>
            </td>
            <td>${pxEsc(r.category || '—')}</td>
            <td>${r.impressions}</td>
            <td>${r.profile_views}</td>
            <td>${r.whatsapp}</td>
            <td>${r.ctr}%</td>
            <td>${r.leads}</td>
            <td class="pdi-actions">
              <button type="button" class="btn btn-sm btn-secondary" data-px-rank-edit="${r.id}">Editar</button>
              ${r.slug ? `<a class="btn btn-sm btn-ghost" href="/parceiros/${pxEsc(r.slug)}" target="_blank" rel="noopener">Ver</a>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<p class="empty-msg">Sem eventos no período/filtro selecionado.</p>'}
    </div>`;
}

function bindPxRankingActions(el) {
  el.querySelectorAll('[data-px-rank-edit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.pxRankEdit;
      try {
        const cached = (pxState.partners || []).find((p) => String(p.id) === String(id));
        if (cached) {
          openPxPartnerForm(cached);
          return;
        }
        const res = await pxApi(`/partners/${id}`);
        if (res.partner) openPxPartnerForm(res.partner);
      } catch (err) {
        alert(err.message || 'Não foi possível abrir o parceiro.');
      }
    });
  });
}

async function loadPxPartners() {
  const el = document.getElementById('px-content');
  if (!el) return;
  el.innerHTML = '<p class="dash-loading">Carregando parceiros…</p>';
  const qState = pxState.partnersQuery || { q: '', status: '', categoria: '', page: 1 };
  try {
    const cats = await pxApi('/categories');
    pxState.categories = cats.categories || [];
    if (pxState.partnersFilter === 'inactive') {
      qState.status = 'nao_ativo';
      qState.page = 1;
      pxState.partnersFilter = '';
    } else if (String(pxState.partnersFilter || '').startsWith('category:')) {
      const catId = String(pxState.partnersFilter).slice('category:'.length);
      const cat = pxState.categories.find((c) => String(c.id) === catId);
      qState.categoria = cat?.slug || '';
      qState.page = 1;
      pxState.partnersFilter = '';
    }
    const params = new URLSearchParams({
      q: qState.q || '',
      status: qState.status || '',
      categoria: qState.categoria || '',
      page: String(qState.page || 1),
      limit: '20',
    });
    const list = await pxApi(`/partners?${params}`);
    pxState.partners = list.partners || [];
    pxState.partnersTotal = list.total || 0;
    const page = list.page || 1;
    const pages = Math.max(1, Math.ceil((list.total || 0) / (list.limit || 20)));
    const filterChip = qState.status === 'nao_ativo' ? 'Somente inativos' : '';
    el.innerHTML = `
      <div class="pdi-toolbar">
        <button type="button" class="btn btn-primary btn-sm" id="px-new-partner">+ Novo parceiro</button>
        <a class="btn btn-ghost btn-sm" href="/parceiros" target="_blank" rel="noopener">Ver página pública</a>
        <input type="search" id="px-partner-q" placeholder="Nome, slug ou fantasia" value="${pxEsc(qState.q || '')}">
        <select id="px-partner-status">
          <option value="">Todos os status</option>
          ${['ativo', 'rascunho', 'pausado', 'expirado', 'arquivado', 'nao_ativo'].map((s) => `
            <option value="${s}"${qState.status === s ? ' selected' : ''}>${s === 'nao_ativo' ? 'Não ativos' : s}</option>`).join('')}
        </select>
        <select id="px-partner-cat">
          <option value="">Todas as categorias</option>
          ${pxState.categories.map((c) => `
            <option value="${pxEsc(c.slug)}"${qState.categoria === c.slug ? ' selected' : ''}>${pxEsc(c.name)}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-secondary btn-sm" id="px-partner-search">Buscar</button>
        ${filterChip ? `<span class="px-chip is-active">${pxEsc(filterChip)}</span>` : ''}
      </div>
      <div class="card pdi-table-wrap">
        <table class="data-table pdi-table">
          <thead><tr>
            <th>Nome</th><th>Categoria</th><th>Status</th><th>Contrato</th><th>Destaque</th><th>Home</th><th></th>
          </tr></thead>
          <tbody>${pxState.partners.map((p) => `
            <tr>
              <td><strong>${pxEsc(p.name)}</strong><div class="pdi-muted">/${pxEsc(p.slug)}</div></td>
              <td>${pxEsc(p.category?.name || '—')}</td>
              <td>${pxBadge(p.status)}</td>
              <td>${p.contract_status ? pxBadge(p.contract_status) : '—'}<div class="pdi-muted">${p.contract_ends_on ? String(p.contract_ends_on).slice(0, 10) : ''}</div></td>
              <td>${p.featured ? 'Sim' : '—'}</td>
              <td>${p.show_on_home ? 'Sim' : '—'}</td>
              <td class="admin-row-actions">
                <button type="button" class="btn btn-sm btn-secondary" data-px-edit="${p.id}">Editar</button>
                <button type="button" class="btn btn-sm btn-secondary" data-px-report="${p.id}">Relatório</button>
                <a class="btn btn-sm btn-ghost" href="/parceiros/${pxEsc(p.slug)}" target="_blank" rel="noopener">Ver</a>
                <button type="button" class="btn btn-sm btn-danger" data-px-archive="${p.id}">Arquivar</button>
              </td>
            </tr>`).join('') || '<tr><td colspan="7" class="empty-msg">Nenhum parceiro neste filtro.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="pdi-toolbar">
        <span class="pdi-muted">${pxState.partnersTotal} parceiro(s) · página ${page} de ${pages}</span>
        <button type="button" class="btn btn-sm btn-secondary" id="px-partner-prev" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
        <button type="button" class="btn btn-sm btn-secondary" id="px-partner-next" ${page >= pages ? 'disabled' : ''}>Próxima</button>
      </div>`;
    const applyQuery = (patch) => {
      Object.assign(pxState.partnersQuery, patch);
      loadPxPartners();
    };
    el.querySelector('#px-new-partner')?.addEventListener('click', () => openPxPartnerForm());
    el.querySelector('#px-partner-search')?.addEventListener('click', () => {
      applyQuery({
        q: el.querySelector('#px-partner-q').value.trim(),
        status: el.querySelector('#px-partner-status').value,
        categoria: el.querySelector('#px-partner-cat').value,
        page: 1,
      });
    });
    el.querySelector('#px-partner-q')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') el.querySelector('#px-partner-search')?.click();
    });
    el.querySelector('#px-partner-status')?.addEventListener('change', () => el.querySelector('#px-partner-search')?.click());
    el.querySelector('#px-partner-cat')?.addEventListener('change', () => el.querySelector('#px-partner-search')?.click());
    el.querySelector('#px-partner-prev')?.addEventListener('click', () => applyQuery({ page: page - 1 }));
    el.querySelector('#px-partner-next')?.addEventListener('click', () => applyQuery({ page: page + 1 }));
    el.querySelectorAll('[data-px-edit]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const data = await pxApi(`/partners/${btn.dataset.pxEdit}`);
        openPxPartnerForm(data.partner);
      });
    });
    el.querySelectorAll('[data-px-report]').forEach((btn) => {
      btn.addEventListener('click', () => openPxPartnerReport(btn.dataset.pxReport));
    });
    el.querySelectorAll('[data-px-archive]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Arquivar este parceiro? Ele sai da lista pública e do admin.')) return;
        try {
          await pxApi(`/partners/${btn.dataset.pxArchive}`, { method: 'DELETE' });
          loadPxPartners();
        } catch (err) { alert(err.message); }
      });
    });
  } catch (err) {
    el.innerHTML = `<p class="section-error">${pxEsc(err.message)}</p>`;
  }
}

async function openPxPartnerReport(partnerId, days = 30) {
  const modal = document.getElementById('px-modal');
  const box = document.getElementById('px-modal-body');
  if (!modal || !box) return;
  modal.hidden = false;
  box.innerHTML = '<p class="dash-loading">Carregando relatório…</p>';
  try {
    const data = await pxApi(`/partners/${partnerId}/report?days=${days}`);
    const cur = data.report?.current || {};
    const partner = data.partner || {};
    box.innerHTML = `
      <h3 id="px-modal-title">Relatório · ${pxEsc(partner.name || '')}</h3>
      <div class="pdi-toolbar">
        ${[7, 30, 90].map((d) => `
          <button type="button" class="btn btn-sm ${d === Number(days) ? 'btn-primary' : 'btn-secondary'}" data-px-report-days="${d}">${d} dias</button>`).join('')}
      </div>
      <div class="pdi-stats">
        <div class="pdi-stat"><span>Impressões</span><strong>${cur.impressions || 0}</strong></div>
        <div class="pdi-stat"><span>Visitas ao perfil</span><strong>${cur.profile_views || 0}</strong></div>
        <div class="pdi-stat"><span>Cliques</span><strong>${cur.clicks || 0}</strong></div>
        <div class="pdi-stat"><span>Leads</span><strong>${cur.leads || 0}</strong></div>
        <div class="pdi-stat"><span>CTR</span><strong>${Number(cur.ctr || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</strong></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="px-report-close">Fechar</button>
      </div>`;
    box.querySelector('#px-report-close')?.addEventListener('click', () => { modal.hidden = true; });
    box.querySelectorAll('[data-px-report-days]').forEach((btn) => {
      btn.addEventListener('click', () => openPxPartnerReport(partnerId, btn.dataset.pxReportDays));
    });
  } catch (err) {
    box.innerHTML = `<p class="section-error">${pxEsc(err.message)}</p>`;
  }
}

function openPxPartnerForm(partner = null) {
  const modal = document.getElementById('px-modal');
  const box = document.getElementById('px-modal-body');
  if (!modal || !box) return;
  pxState.editingPartner = partner;
  const cats = pxState.categories.length ? pxState.categories : [];
  const services = (partner?.services || []).map((s) => s.name).join('\n');
  box.innerHTML = `
    <h3 id="px-modal-title">${partner ? 'Editar parceiro' : 'Novo parceiro'}</h3>
    <form id="px-partner-form" class="pdi-form">
      <div class="field-row">
        <label><span>Nome</span><input name="name" required value="${pxEsc(partner?.name || '')}" /></label>
        <label><span>Slug</span><input name="slug" value="${pxEsc(partner?.slug || '')}" placeholder="auto" /></label>
      </div>
      <div class="field-row">
        <label><span>Categoria</span>
          <select name="category_id">
            <option value="">—</option>
            ${cats.map((c) => `<option value="${c.id}"${Number(partner?.category?.id) === Number(c.id) ? ' selected' : ''}>${pxEsc(c.name)}</option>`).join('')}
          </select>
        </label>
        <label><span>Status</span>
          <select name="status">
            ${['rascunho', 'ativo', 'pausado', 'expirado', 'arquivado'].map((s) => `<option value="${s}"${partner?.status === s ? ' selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="field-row">
        <label><span>Especialidade</span><input name="specialty" value="${pxEsc(partner?.specialty || '')}" /></label>
        <label><span>Profissão</span><input name="profession" value="${pxEsc(partner?.profession || '')}" /></label>
      </div>
      <label><span>Descrição curta</span><textarea name="short_description" rows="2">${pxEsc(partner?.short_description || '')}</textarea></label>
      <label><span>Descrição completa</span><textarea name="full_description" rows="4">${pxEsc(partner?.full_description || '')}</textarea></label>
      <label><span>Serviços (até 6, um por linha)</span><textarea name="services" rows="4">${pxEsc(services)}</textarea></label>
      <div class="field-row">
        <label><span>WhatsApp</span><input name="whatsapp" value="${pxEsc(partner?.whatsapp || '')}" /></label>
        <label><span>Instagram</span><input name="instagram" value="${pxEsc(partner?.instagram || '')}" /></label>
      </div>
      <div class="field-row">
        <label><span>Site</span><input name="website" value="${pxEsc(partner?.website || '')}" /></label>
        <label><span>E-mail</span><input name="email" type="email" value="${pxEsc(partner?.email || '')}" /></label>
      </div>
      <div class="field-row">
        <label><span>Nome fantasia</span><input name="trade_name" value="${pxEsc(partner?.trade_name || '')}" /></label>
        <label><span>Local</span><input name="venue_name" value="${pxEsc(partner?.venue_name || '')}" /></label>
      </div>
      <label><span>Endereço</span><input name="address" value="${pxEsc(partner?.address || '')}" /></label>
      <div class="field-row">
        <label><span>Complemento</span><input name="address_complement" value="${pxEsc(partner?.address_complement || '')}" /></label>
        <label><span>Bairro</span><input name="neighborhood" value="${pxEsc(partner?.neighborhood || '')}" /></label>
      </div>
      <div class="field-row">
        <label><span>Cidade</span><input name="city" value="${pxEsc(partner?.city || '')}" /></label>
        <label><span>UF</span><input name="state" maxlength="2" value="${pxEsc(partner?.state || '')}" /></label>
        <label><span>CEP</span><input name="postal_code" value="${pxEsc(partner?.postal_code || '')}" /></label>
      </div>
      <label><span>Link do mapa</span><input name="maps_url" value="${pxEsc(partner?.maps_url || '')}" placeholder="https://maps.google.com/..." /></label>
      <div class="field-row">
        <label class="check-label"><input type="checkbox" name="featured"${partner?.featured ? ' checked' : ''} /> Destaque</label>
        <label class="check-label"><input type="checkbox" name="show_on_home"${partner?.show_on_home !== false ? ' checked' : ''} /> Mostrar na Home</label>
      </div>
      <div class="field-row px-media-row">
        ${pxMediaField('Foto', 'photo_file', partner?.photo_url)}
        ${pxMediaField('Logo', 'logo_file', partner?.logo_url)}
        ${pxMediaField('Capa', 'cover_file', partner?.cover_url)}
      </div>
      <p id="px-form-error" class="form-error" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="px-form-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>`;
  modal.hidden = false;
  box.querySelector('#px-form-cancel')?.addEventListener('click', () => { modal.hidden = true; });
  box.querySelector('#px-partner-form')?.addEventListener('submit', savePxPartnerForm);
}

function pxMediaField(label, name, url) {
  return `<label><span>${label}</span>
    ${url ? `<img class="px-media-preview" src="${pxEsc(url)}" alt="">` : ''}
    <input type="file" name="${name}" accept="image/jpeg,image/png,image/webp" />
  </label>`;
}

async function fileToPayload(input) {
  const file = input?.files?.[0];
  if (!file) return null;
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(file);
  });
  return { name: file.name, type: file.type, size: file.size, data };
}

async function savePxPartnerForm(e) {
  e.preventDefault();
  const form = e.target;
  const err = document.getElementById('px-form-error');
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.featured = Boolean(form.featured?.checked);
  payload.show_on_home = Boolean(form.show_on_home?.checked);
    payload.services = String(payload.services || '').split('\n').map((s) => s.trim()).filter(Boolean).map((name, sort_order) => ({ name, sort_order }));
    delete payload.photo_file;
    delete payload.logo_file;
    delete payload.cover_file;
    try {
    const partner = pxState.editingPartner;
    const res = partner
      ? await pxApi(`/partners/${partner.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await pxApi('/partners', { method: 'POST', body: JSON.stringify(payload) });
    const saved = res.partner;
    if (saved?.id) {
      for (const [inputName, kind] of [['photo_file', 'photo'], ['logo_file', 'logo'], ['cover_file', 'cover']]) {
        const file = await fileToPayload(form[inputName]);
        if (file) {
          await pxApi(`/partners/${saved.id}/media`, { method: 'POST', body: JSON.stringify({ kind, file }) });
        }
      }
    }
    document.getElementById('px-modal').hidden = true;
    if (pxState.view === 'categories') {
      const detailId = pxState.categoryDetailId;
      await loadPxCategories();
      if (detailId) {
        const cat = (pxState.categories || []).find((c) => String(c.id) === String(detailId));
        if (cat) await openPxCategoryDetail(cat);
      }
    } else {
      await loadPxPartners();
    }
  } catch (error) {
    if (err) { err.textContent = error.message; err.hidden = false; }
  }
}

function pxMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pxFilteredCategories() {
  const f = pxState.categoriesFilters || {};
  const q = String(f.q || '').trim().toLowerCase();
  let rows = [...(pxState.categories || [])];
  if (f.status) rows = rows.filter((c) => c.status === f.status);
  if (q) {
    rows = rows.filter((c) => (
      String(c.name || '').toLowerCase().includes(q)
      || String(c.slug || '').toLowerCase().includes(q)
    ));
  }
  const sort = f.sort || 'sort_order';
  rows.sort((a, b) => {
    if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    if (sort === 'partner_count') return Number(b.partner_count || 0) - Number(a.partner_count || 0);
    const orderDiff = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
  });
  return rows;
}

function pxCategoriesSummary(all) {
  const summary = { total: all.length, ativas: 0, arquivadas: 0, partners: 0 };
  for (const c of all) {
    if (c.status === 'ativa') summary.ativas += 1;
    if (c.status === 'arquivada') summary.arquivadas += 1;
    summary.partners += Number(c.partner_count) || 0;
  }
  return summary;
}

function pxCategoryPublicUrl(slug) {
  return `/parceiros?categoria=${encodeURIComponent(slug || '')}`;
}

function pxSlugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function pxIsValidSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug || ''));
}

function pxCategoryDescSnippet(text, max = 90) {
  const s = String(text || '').trim().replace(/\s+/g, ' ');
  if (!s) return 'Sem descrição';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function pxSetCategoryFormError(form, message, { field = null } = {}) {
  const slugInput = form?.querySelector('[name="slug"]');
  const err = document.getElementById('px-category-error');
  if (slugInput) {
    const markSlug = Boolean(message) && field === 'slug';
    slugInput.classList.toggle('is-invalid', markSlug);
    slugInput.setAttribute('aria-invalid', markSlug ? 'true' : 'false');
  }
  if (err) {
    if (message) {
      err.textContent = message;
      err.hidden = false;
    } else {
      err.textContent = '';
      err.hidden = true;
    }
  }
}

function pxCategoryPayload(cat, overrides = {}) {
  return {
    name: cat.name,
    slug: cat.slug,
    description: cat.description || '',
    sort_order: Number(cat.sort_order) || 0,
    status: cat.status || 'ativa',
    icon: cat.icon || '',
    image_url: cat.image_url || '',
    ...overrides,
  };
}

function pxUniqueCategorySlug(base) {
  let slug = pxSlugify(base);
  if (!slug) slug = 'categoria';
  const existing = new Set((pxState.categories || []).map((c) => String(c.slug || '')));
  if (!existing.has(slug)) return slug;
  let i = 2;
  while (existing.has(`${slug}-${i}`)) i += 1;
  return `${slug}-${i}`;
}

function pxCategoryRowActions(c) {
  const isArchived = c.status === 'arquivada';
  return `
    <button type="button" class="btn btn-sm btn-secondary" data-px-cat-detail="${c.id}">Parceiros</button>
    <button type="button" class="btn btn-sm btn-secondary" data-px-edit-cat="${c.id}">Editar</button>
    <button type="button" class="btn btn-sm btn-secondary" data-px-duplicate-cat="${c.id}">Duplicar</button>
    ${isArchived
      ? `<button type="button" class="btn btn-sm btn-secondary" data-px-reactivate-cat="${c.id}">Reativar</button>`
      : `<button type="button" class="btn btn-sm btn-secondary" data-px-archive-cat="${c.id}">Arquivar</button>`}
    <a class="btn btn-sm btn-ghost" href="${pxEsc(pxCategoryPublicUrl(c.slug))}" target="_blank" rel="noopener">Link público</a>
  `;
}

function pxRenderCategoryRow(c, index, total) {
  const empty = Number(c.partner_count) === 0;
  return `
    <tr class="${empty ? 'px-cat-row--empty' : ''}">
      <td>
        <strong>${pxEsc(c.name)}</strong>
        ${empty ? ' <span class="pdi-badge pdi-badge--warn">vazia</span>' : ''}
      </td>
      <td>${pxEsc(c.slug)}</td>
      <td>
        <div class="px-cat-order">
          <button type="button" class="btn btn-ghost btn-xs field-move-btn" data-px-cat-move="${c.id}" data-dir="up" aria-label="Mover para cima"${index === 0 ? ' disabled' : ''}>↑</button>
          <span class="px-cat-order__val">${c.sort_order ?? 0}</span>
          <button type="button" class="btn btn-ghost btn-xs field-move-btn" data-px-cat-move="${c.id}" data-dir="down" aria-label="Mover para baixo"${index >= total - 1 ? ' disabled' : ''}>↓</button>
        </div>
      </td>
      <td>${pxBadge(c.status)}</td>
      <td>
        <button type="button" class="btn btn-sm btn-ghost" data-px-cat-detail="${c.id}" title="Ver parceiros">
          ${c.partner_count || 0}
        </button>
      </td>
      <td class="pdi-actions">${pxCategoryRowActions(c)}</td>
    </tr>`;
}

function pxExportCategoriesCsv(rows) {
  const header = ['Nome', 'Slug', 'Status', 'Ordem', 'Parceiros', 'Descricao'];
  const lines = [header.join(';')];
  for (const c of rows || []) {
    const cells = [
      c.name,
      c.slug || '',
      c.status || '',
      c.sort_order ?? 0,
      c.partner_count || 0,
      String(c.description || '').replace(/[\r\n;]+/g, ' '),
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`);
    lines.push(cells.join(';'));
  }
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `categorias-parceiros-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function openPxCategoryDetail(category) {
  const modal = document.getElementById('px-modal');
  const box = document.getElementById('px-modal-body');
  if (!modal || !box || !category) return;
  pxState.categoryDetailId = category.id;
  box.innerHTML = `
    <h3 id="px-modal-title">Parceiros · ${pxEsc(category.name)}</h3>
    <p class="dash-loading">Carregando parceiros…</p>`;
  modal.hidden = false;
  try {
    const slug = category.slug || '';
    const [data, dash] = await Promise.all([
      pxApi(`/partners?limit=100&categoria=${encodeURIComponent(slug)}`),
      pxApi(`/dashboard?days=30&category_id=${encodeURIComponent(category.id)}`).catch(() => null),
    ]);
    const partners = data.partners || [];
    const analytics = dash?.analytics?.current || null;
    renderPxCategoryDetail(box, category, partners, analytics);
  } catch (error) {
    box.innerHTML = `
      <h3 id="px-modal-title">Parceiros · ${pxEsc(category.name)}</h3>
      <p class="section-error">${pxEsc(error.message || 'Falha ao carregar parceiros.')}</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="px-cat-detail-close">Fechar</button>
      </div>`;
    box.querySelector('#px-cat-detail-close')?.addEventListener('click', () => {
      pxState.categoryDetailId = null;
      modal.hidden = true;
    });
  }
}

function renderPxCategoryDetail(box, category, partners, analytics = null) {
  const modal = document.getElementById('px-modal');
  const cats = (pxState.categories || []).filter((c) => c.status !== 'arquivada' || String(c.id) === String(category.id));
  const rows = partners || [];
  const analyticsHtml = analytics
    ? `<div class="px-cat-detail-analytics pdi-stats" aria-label="Últimos 30 dias">
        <article class="pdi-stat">
          <span class="pdi-stat__val">${Number(analytics.impressions) || 0}</span>
          <span class="pdi-stat__lbl">Impressões (30d)</span>
        </article>
        <article class="pdi-stat">
          <span class="pdi-stat__val">${Number(analytics.leads) || 0}</span>
          <span class="pdi-stat__lbl">Leads (30d)</span>
        </article>
      </div>`
    : '';

  box.innerHTML = `
    <h3 id="px-modal-title">Parceiros · ${pxEsc(category.name)}</h3>
    <p class="pdi-muted px-cat-detail-meta">
      /${pxEsc(category.slug)} · ${rows.length} parceiro(s)
      ${category.status ? ` · ${pxBadge(category.status)}` : ''}
    </p>
    ${analyticsHtml}
    <div class="px-cat-detail-toolbar">
      <button type="button" class="btn btn-sm btn-secondary" id="px-cat-detail-to-partners">Abrir na aba Parceiros</button>
      <a class="btn btn-sm btn-ghost" href="${pxEsc(pxCategoryPublicUrl(category.slug))}" target="_blank" rel="noopener">Link público</a>
    </div>
    <div class="px-cat-detail-table card pdi-table-wrap">
      <table class="data-table pdi-table">
        <thead><tr>
          <th>Nome</th><th>Status</th><th>Categoria</th><th></th>
        </tr></thead>
        <tbody>${rows.map((p) => `
          <tr>
            <td>
              <strong>${pxEsc(p.name)}</strong>
              <div class="pdi-muted">/${pxEsc(p.slug)}</div>
            </td>
            <td>${pxBadge(p.status)}</td>
            <td>
              <select class="px-cat-detail-reassign" data-px-reassign-partner="${p.id}" aria-label="Categoria de ${pxEsc(p.name)}">
                <option value="">— Sem categoria —</option>
                ${cats.map((c) => `
                  <option value="${c.id}"${Number(p.category?.id) === Number(c.id) ? ' selected' : ''}>${pxEsc(c.name)}</option>
                `).join('')}
              </select>
            </td>
            <td class="pdi-actions">
              <button type="button" class="btn btn-sm btn-secondary" data-px-cat-edit-partner="${p.id}">Editar</button>
              <a class="btn btn-sm btn-ghost" href="/parceiros/${pxEsc(p.slug)}" target="_blank" rel="noopener">Ver</a>
            </td>
          </tr>`).join('') || '<tr><td colspan="4" class="empty-msg">Nenhum parceiro nesta categoria.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="px-cat-detail-close">Fechar</button>
    </div>`;

  box.querySelector('#px-cat-detail-close')?.addEventListener('click', () => {
    pxState.categoryDetailId = null;
    if (modal) modal.hidden = true;
  });

  box.querySelector('#px-cat-detail-to-partners')?.addEventListener('click', () => {
    pxState.partnersFilter = `category:${category.id}`;
    pxState.categoryDetailId = null;
    if (modal) modal.hidden = true;
    switchPxView('partners');
  });

  box.querySelectorAll('[data-px-cat-edit-partner]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.pxCatEditPartner;
      try {
        const cached = rows.find((p) => String(p.id) === String(id));
        if (cached) {
          openPxPartnerForm(cached);
          return;
        }
        const res = await pxApi(`/partners/${id}`);
        if (res.partner) openPxPartnerForm(res.partner);
      } catch (err) {
        window.alert(err.message || 'Não foi possível abrir o parceiro.');
      }
    });
  });

  box.querySelectorAll('[data-px-reassign-partner]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const partnerId = sel.dataset.pxReassignPartner;
      const nextCatId = sel.value === '' ? '' : sel.value;
      const prev = rows.find((p) => String(p.id) === String(partnerId));
      const prevVal = prev?.category?.id != null ? String(prev.category.id) : '';
      sel.disabled = true;
      try {
        await pxApi(`/partners/${partnerId}`, {
          method: 'PATCH',
          body: JSON.stringify({ category_id: nextCatId }),
        });
        await loadPxCategories();
        const cat = (pxState.categories || []).find((c) => String(c.id) === String(category.id));
        if (cat) await openPxCategoryDetail(cat);
        else if (modal) modal.hidden = true;
      } catch (err) {
        sel.value = prevVal;
        window.alert(err.message || 'Falha ao alterar a categoria.');
        sel.disabled = false;
      }
    });
  });
}

async function pxPatchCategoryStatus(cat, status) {
  const res = await pxApi(`/categories/${cat.id}`, {
    method: 'PATCH',
    body: JSON.stringify(pxCategoryPayload(cat, { status })),
  });
  if (!res?.category) throw new Error('Resposta inválida do servidor.');
  return res.category;
}

async function pxMoveCategory(catId, direction) {
  const rows = pxFilteredCategories();
  const idx = rows.findIndex((c) => String(c.id) === String(catId));
  if (idx < 0) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) return;
  const a = rows[idx];
  const b = rows[swapIdx];
  let orderA = Number(b.sort_order) || 0;
  let orderB = Number(a.sort_order) || 0;
  if (orderA === orderB) {
    orderA = swapIdx;
    orderB = idx;
  }
  await Promise.all([
    pxApi(`/categories/${a.id}`, {
      method: 'PATCH',
      body: JSON.stringify(pxCategoryPayload(a, { sort_order: orderA })),
    }),
    pxApi(`/categories/${b.id}`, {
      method: 'PATCH',
      body: JSON.stringify(pxCategoryPayload(b, { sort_order: orderB })),
    }),
  ]);
  await loadPxCategories();
}

async function pxDuplicateCategory(cat) {
  const name = `${cat.name} (cópia)`;
  const payload = pxCategoryPayload(cat, {
    name,
    slug: pxUniqueCategorySlug(`${cat.slug || cat.name}-copia`),
    sort_order: (Number(cat.sort_order) || 0) + 1,
    status: 'ativa',
  });
  const res = await pxApi('/categories', { method: 'POST', body: JSON.stringify(payload) });
  if (!res?.category) throw new Error('Resposta inválida do servidor.');
  return res.category;
}

async function loadPxCategories() {
  const el = document.getElementById('px-content');
  if (!el) return;
  el.innerHTML = '<p class="dash-loading">Carregando categorias…</p>';
  try {
    const data = await pxApi('/categories');
    pxState.categories = data.categories || [];
    if (!pxState.categoriesFilters) {
      pxState.categoriesFilters = { q: '', status: '', sort: 'sort_order' };
    }
    renderPxCategoriesView();
  } catch (err) {
    el.innerHTML = `<p class="section-error">${pxEsc(err.message)}</p>`;
  }
}

function renderPxCategoriesView() {
  const el = document.getElementById('px-content');
  if (!el) return;
  const f = pxState.categoriesFilters || { q: '', status: '', sort: 'sort_order' };
  const rows = pxFilteredCategories();
  const summary = pxCategoriesSummary(pxState.categories || []);

  el.innerHTML = `
    <div class="pdi-toolbar">
      <button type="button" class="btn btn-primary btn-sm" id="px-new-category">+ Nova categoria</button>
      <button type="button" class="btn btn-ghost btn-sm" id="px-export-categories">Exportar CSV</button>
    </div>
    <div class="pdi-stats">
      <article class="pdi-stat"><span class="pdi-stat__val">${summary.total}</span><span class="pdi-stat__lbl">Total</span></article>
      <article class="pdi-stat"><span class="pdi-stat__val">${summary.ativas}</span><span class="pdi-stat__lbl">Ativas</span></article>
      <article class="pdi-stat"><span class="pdi-stat__val">${summary.arquivadas}</span><span class="pdi-stat__lbl">Arquivadas</span></article>
      <article class="pdi-stat"><span class="pdi-stat__val">${summary.partners}</span><span class="pdi-stat__lbl">Parceiros vinculados</span></article>
    </div>
    <div class="px-contract-filters card">
      <div class="px-contract-chips" role="group" aria-label="Filtro de status">
        ${[
          ['', 'Todas'],
          ['ativa', 'Ativas'],
          ['arquivada', 'Arquivadas'],
        ].map(([value, label]) => `
          <button type="button" class="px-chip${f.status === value ? ' is-active' : ''}" data-px-cat-status-chip="${value}">${label}</button>
        `).join('')}
      </div>
      <div class="px-contract-filters__row">
        <label class="px-filter-field">
          <span>Buscar</span>
          <input type="search" id="px-category-q" value="${pxEsc(f.q)}" placeholder="Nome ou slug…" />
        </label>
        <label class="px-filter-field">
          <span>Status</span>
          <select id="px-category-filter-status">
            <option value=""${!f.status ? ' selected' : ''}>Todas</option>
            <option value="ativa"${f.status === 'ativa' ? ' selected' : ''}>ativa</option>
            <option value="arquivada"${f.status === 'arquivada' ? ' selected' : ''}>arquivada</option>
          </select>
        </label>
        <label class="px-filter-field">
          <span>Ordenar</span>
          <select id="px-category-sort">
            <option value="sort_order"${f.sort === 'sort_order' ? ' selected' : ''}>Ordem</option>
            <option value="name"${f.sort === 'name' ? ' selected' : ''}>Nome</option>
            <option value="partner_count"${f.sort === 'partner_count' ? ' selected' : ''}>Parceiros</option>
          </select>
        </label>
      </div>
    </div>
    <div class="card pdi-table-wrap">
      <h3>Categorias <span class="pdi-muted">(${rows.length})</span></h3>
      <table class="data-table pdi-table">
        <thead><tr>
          <th>Nome</th><th>Slug</th><th>Ordem</th><th>Status</th><th>Parceiros</th><th></th>
        </tr></thead>
        <tbody>${rows.map((c, i) => pxRenderCategoryRow(c, i, rows.length)).join('') || '<tr><td colspan="6" class="empty-msg">Nenhuma categoria neste filtro.</td></tr>'}
        </tbody>
      </table>
    </div>`;

  el.querySelector('#px-new-category')?.addEventListener('click', () => openPxCategoryForm());
  el.querySelector('#px-export-categories')?.addEventListener('click', () => {
    pxExportCategoriesCsv(pxFilteredCategories());
  });
  el.querySelectorAll('[data-px-cat-status-chip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pxState.categoriesFilters.status = btn.dataset.pxCatStatusChip || '';
      renderPxCategoriesView();
    });
  });
  const applyFilters = () => {
    pxState.categoriesFilters.q = el.querySelector('#px-category-q')?.value || '';
    pxState.categoriesFilters.status = el.querySelector('#px-category-filter-status')?.value || '';
    pxState.categoriesFilters.sort = el.querySelector('#px-category-sort')?.value || 'sort_order';
    renderPxCategoriesView();
  };
  el.querySelector('#px-category-filter-status')?.addEventListener('change', applyFilters);
  el.querySelector('#px-category-sort')?.addEventListener('change', applyFilters);
  const qInput = el.querySelector('#px-category-q');
  qInput?.addEventListener('input', () => {
    pxState.categoriesFilters.q = qInput.value || '';
    const filtered = pxFilteredCategories();
    const tbody = el.querySelector('tbody');
    if (tbody) {
      tbody.innerHTML = filtered.map((c, i) => pxRenderCategoryRow(c, i, filtered.length)).join('')
        || '<tr><td colspan="6" class="empty-msg">Nenhuma categoria neste filtro.</td></tr>';
      bindPxCategoryRowActions(el);
    }
    const titleCount = el.querySelector('.pdi-table-wrap h3 .pdi-muted');
    if (titleCount) titleCount.textContent = `(${filtered.length})`;
  });
  bindPxCategoryRowActions(el);
}

function bindPxCategoryRowActions(el) {
  el.querySelectorAll('[data-px-cat-detail]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = pxState.categories.find((c) => String(c.id) === String(btn.dataset.pxCatDetail));
      if (cat) openPxCategoryDetail(cat);
    });
  });
  el.querySelectorAll('[data-px-edit-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = pxState.categories.find((c) => String(c.id) === String(btn.dataset.pxEditCat));
      openPxCategoryForm(cat || null);
    });
  });
  el.querySelectorAll('[data-px-duplicate-cat]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cat = pxState.categories.find((c) => String(c.id) === String(btn.dataset.pxDuplicateCat));
      if (!cat) return;
      btn.disabled = true;
      try {
        await pxDuplicateCategory(cat);
        await loadPxCategories();
      } catch (error) {
        window.alert(error.message || 'Falha ao duplicar a categoria.');
        btn.disabled = false;
      }
    });
  });
  el.querySelectorAll('[data-px-cat-move]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.pxCatMove;
      const dir = btn.dataset.dir === 'up' ? 'up' : 'down';
      btn.disabled = true;
      try {
        await pxMoveCategory(id, dir);
      } catch (error) {
        window.alert(error.message || 'Falha ao reordenar a categoria.');
        btn.disabled = false;
      }
    });
  });
  el.querySelectorAll('[data-px-archive-cat]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cat = pxState.categories.find((c) => String(c.id) === String(btn.dataset.pxArchiveCat));
      if (!cat) return;
      const count = Number(cat.partner_count) || 0;
      const msg = count > 0
        ? `Arquivar "${cat.name}"? Há ${count} parceiro(s) vinculado(s).`
        : `Arquivar a categoria "${cat.name}"?`;
      if (!window.confirm(msg)) return;
      btn.disabled = true;
      try {
        await pxPatchCategoryStatus(cat, 'arquivada');
        await loadPxCategories();
      } catch (error) {
        window.alert(error.message || 'Falha ao arquivar a categoria.');
        btn.disabled = false;
      }
    });
  });
  el.querySelectorAll('[data-px-reactivate-cat]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cat = pxState.categories.find((c) => String(c.id) === String(btn.dataset.pxReactivateCat));
      if (!cat) return;
      btn.disabled = true;
      try {
        await pxPatchCategoryStatus(cat, 'ativa');
        await loadPxCategories();
      } catch (error) {
        window.alert(error.message || 'Falha ao reativar a categoria.');
        btn.disabled = false;
      }
    });
  });
}

function openPxCategoryForm(category = null) {
  const modal = document.getElementById('px-modal');
  const box = document.getElementById('px-modal-body');
  if (!modal || !box) return;
  pxState.editingCategory = category;
  const initialName = category?.name || '';
  const initialSlug = category?.slug || (initialName ? pxSlugify(initialName) : '');
  let lastAutoSlug = initialName ? pxSlugify(initialName) : '';
  if (category?.slug && category.slug !== lastAutoSlug) lastAutoSlug = '';

  box.innerHTML = `
    <h3 id="px-modal-title">${category ? 'Editar categoria' : 'Nova categoria'}</h3>
    <form id="px-category-form" class="pdi-form">
      <div class="field-row">
        <label><span>Nome</span><input name="name" required value="${pxEsc(category?.name || '')}" autocomplete="off" /></label>
        <label><span>Slug</span><input name="slug" value="${pxEsc(initialSlug)}" placeholder="auto" autocomplete="off" /></label>
      </div>
      <div class="field-row">
        <label><span>Ordem</span><input name="sort_order" type="number" step="1" value="${pxEsc(category?.sort_order ?? 0)}" /></label>
        <label><span>Status</span>
          <select name="status">
            ${['ativa', 'arquivada'].map((s) => `<option value="${s}"${category?.status === s ? ' selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
      </div>
      <label><span>Descrição</span><textarea name="description" rows="3">${pxEsc(category?.description || '')}</textarea></label>
      <div class="field-row">
        <label><span>Ícone</span><input name="icon" value="${pxEsc(category?.icon || '')}" placeholder="Emoji ou código" maxlength="80" autocomplete="off" /></label>
        <label><span>Imagem (URL)</span><input name="image_url" value="${pxEsc(category?.image_url || '')}" placeholder="https://…" autocomplete="off" /></label>
      </div>
      <div class="px-category-preview" id="px-category-preview" aria-live="polite">
        <div class="px-category-preview__media" data-preview-media></div>
        <div class="px-category-preview__body">
          <strong data-preview-name>${pxEsc(category?.name || 'Nome da categoria')}</strong>
          <p data-preview-desc>${pxEsc(pxCategoryDescSnippet(category?.description))}</p>
        </div>
      </div>
      <p id="px-category-error" class="form-error" hidden role="alert"></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="px-category-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>`;
  modal.hidden = false;

  const form = box.querySelector('#px-category-form');
  const nameInput = form?.querySelector('[name="name"]');
  const slugInput = form?.querySelector('[name="slug"]');
  const descInput = form?.querySelector('[name="description"]');
  const iconInput = form?.querySelector('[name="icon"]');
  const imageInput = form?.querySelector('[name="image_url"]');
  const preview = box.querySelector('#px-category-preview');

  const updatePreview = () => {
    if (!preview) return;
    const name = (nameInput?.value || '').trim() || 'Nome da categoria';
    const desc = pxCategoryDescSnippet(descInput?.value);
    const icon = (iconInput?.value || '').trim();
    const imageUrl = (imageInput?.value || '').trim();
    const media = preview.querySelector('[data-preview-media]');
    const nameEl = preview.querySelector('[data-preview-name]');
    const descEl = preview.querySelector('[data-preview-desc]');
    if (nameEl) nameEl.textContent = name;
    if (descEl) descEl.textContent = desc;
    if (media) {
      const fallback = icon || name.charAt(0) || '?';
      if (imageUrl) {
        media.innerHTML = `<img src="${pxEsc(imageUrl)}" alt="" loading="lazy" />`;
        const img = media.querySelector('img');
        img?.addEventListener('error', () => {
          media.innerHTML = `<span class="px-category-preview__fallback">${pxEsc(fallback)}</span>`;
        }, { once: true });
      } else {
        media.innerHTML = `<span class="px-category-preview__fallback">${pxEsc(fallback)}</span>`;
      }
    }
  };

  nameInput?.addEventListener('input', () => {
    const auto = pxSlugify(nameInput.value);
    const current = (slugInput?.value || '').trim();
    if (slugInput && (!current || current === lastAutoSlug)) {
      slugInput.value = auto;
      lastAutoSlug = auto;
      pxSetCategoryFormError(form, null);
    }
    updatePreview();
  });
  slugInput?.addEventListener('input', () => {
    const current = (slugInput.value || '').trim();
    if (current && current !== lastAutoSlug) lastAutoSlug = '';
    else if (!current) lastAutoSlug = pxSlugify(nameInput?.value || '');
    pxSetCategoryFormError(form, null);
  });
  [descInput, iconInput, imageInput].forEach((el) => {
    el?.addEventListener('input', updatePreview);
  });
  updatePreview();

  box.querySelector('#px-category-cancel')?.addEventListener('click', () => { modal.hidden = true; });
  form?.addEventListener('submit', savePxCategoryForm);
}

async function savePxCategoryForm(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.name = String(payload.name || '').trim();
  payload.description = String(payload.description || '').trim();
  payload.icon = String(payload.icon || '').trim();
  payload.image_url = String(payload.image_url || '').trim();
  payload.sort_order = Number(payload.sort_order) || 0;
  const slugRaw = String(payload.slug || '').trim();
  payload.slug = slugRaw || pxSlugify(payload.name);

  pxSetCategoryFormError(form, null);

  if (!payload.name) {
    pxSetCategoryFormError(form, 'Nome é obrigatório.');
    form.querySelector('[name="name"]')?.focus();
    return;
  }
  if (!payload.slug || !pxIsValidSlug(payload.slug)) {
    pxSetCategoryFormError(form, 'Slug inválido. Use apenas letras minúsculas, números e hífens.', { field: 'slug' });
    form.querySelector('[name="slug"]')?.focus();
    return;
  }
  const editing = pxState.editingCategory;
  const duplicate = (pxState.categories || []).find(
    (c) => c.slug === payload.slug && Number(c.id) !== Number(editing?.id),
  );
  if (duplicate) {
    pxSetCategoryFormError(form, 'Slug já utilizado.', { field: 'slug' });
    form.querySelector('[name="slug"]')?.focus();
    return;
  }

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Salvando…'; }
  try {
    const res = editing
      ? await pxApi(`/categories/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await pxApi('/categories', { method: 'POST', body: JSON.stringify(payload) });
    if (!res?.category) throw new Error('Resposta inválida do servidor.');
    document.getElementById('px-modal').hidden = true;
    await loadPxCategories();
  } catch (error) {
    const msg = error.message || 'Falha ao salvar a categoria.';
    const isSlugErr = /slug/i.test(msg);
    pxSetCategoryFormError(form, msg, { field: isSlugErr ? 'slug' : null });
    if (isSlugErr) form.querySelector('[name="slug"]')?.focus();
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Salvar'; }
  }
}

async function loadPxPlans() {
  const el = document.getElementById('px-content');
  if (!el) return;
  el.innerHTML = '<p class="dash-loading">Carregando planos…</p>';
  try {
    const data = await pxApi('/plans');
    pxState.plans = data.plans || [];
    el.innerHTML = `
      <div class="pdi-toolbar">
        <button type="button" class="btn btn-primary btn-sm" id="px-new-plan">+ Novo plano</button>
      </div>
      <div class="card pdi-table-wrap">
        <h3>Planos</h3>
        <table class="data-table pdi-table">
          <thead><tr>
            <th>Nome</th><th>Slug</th><th>Valor</th><th>Prioridade</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${pxState.plans.map((p) => `
            <tr>
              <td><strong>${pxEsc(p.name)}</strong></td>
              <td>${pxEsc(p.slug)}</td>
              <td>R$ ${pxMoney(p.price)}</td>
              <td>${p.priority}</td>
              <td>${pxBadge(p.status)}</td>
              <td><button type="button" class="btn btn-sm btn-secondary" data-px-edit-plan="${p.id}">Editar</button></td>
            </tr>`).join('') || '<tr><td colspan="6" class="empty-msg">Nenhum plano cadastrado.</td></tr>'}
          </tbody>
        </table>
      </div>`;
    el.querySelector('#px-new-plan')?.addEventListener('click', () => openPxPlanForm());
    el.querySelectorAll('[data-px-edit-plan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const plan = pxState.plans.find((p) => String(p.id) === String(btn.dataset.pxEditPlan));
        openPxPlanForm(plan || null);
      });
    });
  } catch (err) {
    el.innerHTML = `<p class="section-error">${pxEsc(err.message)}</p>`;
  }
}

function openPxPlanForm(plan = null) {
  const modal = document.getElementById('px-modal');
  const box = document.getElementById('px-modal-body');
  if (!modal || !box) return;
  pxState.editingPlan = plan;
  const benefits = (plan?.benefits || []).map((b) => b.name || b).join('\n');
  const priceVal = plan?.price != null ? Number(plan.price) : '';
  box.innerHTML = `
    <h3 id="px-modal-title">${plan ? 'Editar plano' : 'Novo plano'}</h3>
    <form id="px-plan-form" class="pdi-form">
      <div class="field-row">
        <label><span>Nome</span><input name="name" required value="${pxEsc(plan?.name || '')}" /></label>
        <label><span>Slug</span><input name="slug" value="${pxEsc(plan?.slug || '')}" placeholder="auto" /></label>
      </div>
      <div class="field-row">
        <label><span>Valor (R$)</span><input name="price" type="number" min="0" step="0.01" required value="${pxEsc(priceVal)}" /></label>
        <label><span>Prioridade</span><input name="priority" type="number" step="1" value="${pxEsc(plan?.priority ?? 0)}" /></label>
      </div>
      <div class="field-row">
        <label><span>Ordem</span><input name="sort_order" type="number" step="1" value="${pxEsc(plan?.sort_order ?? 0)}" /></label>
        <label><span>Status</span>
          <select name="status">
            ${['ativo', 'arquivado'].map((s) => `<option value="${s}"${plan?.status === s ? ' selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
      </div>
      <label><span>Descrição</span><textarea name="description" rows="2">${pxEsc(plan?.description || '')}</textarea></label>
      <label><span>Benefícios (um por linha)</span><textarea name="benefits" rows="5">${pxEsc(benefits)}</textarea></label>
      <p id="px-plan-error" class="form-error" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="px-plan-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>`;
  modal.hidden = false;
  box.querySelector('#px-plan-cancel')?.addEventListener('click', () => { modal.hidden = true; });
  box.querySelector('#px-plan-form')?.addEventListener('submit', savePxPlanForm);
}

async function savePxPlanForm(e) {
  e.preventDefault();
  const form = e.target;
  const err = document.getElementById('px-plan-error');
  const submitBtn = form.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.price = Number(payload.price);
  payload.priority = Number(payload.priority) || 0;
  payload.sort_order = Number(payload.sort_order) || 0;
  payload.benefits = String(payload.benefits || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name, sort_order) => ({ name, sort_order }));
  if (!Number.isFinite(payload.price) || payload.price < 0) {
    if (err) { err.textContent = 'Informe um valor válido.'; err.hidden = false; }
    return;
  }
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Salvando…'; }
  if (err) err.hidden = true;
  try {
    const plan = pxState.editingPlan;
    const res = plan
      ? await pxApi(`/plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await pxApi('/plans', { method: 'POST', body: JSON.stringify(payload) });
    if (!res?.plan) throw new Error('Resposta inválida do servidor.');
    document.getElementById('px-modal').hidden = true;
    await loadPxPlans();
  } catch (error) {
    if (err) { err.textContent = error.message || 'Falha ao salvar o plano.'; err.hidden = false; }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Salvar'; }
  }
}

function pxDateInput(value, fallback = '') {
  const raw = value ? String(value).slice(0, 10) : fallback;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

function pxAddYears(isoDate, years) {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function pxAddDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function pxAddMonths(isoDate, months) {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const PX_CONTRACT_ACTIVE = ['ativo', 'pendente', 'vencendo'];

function pxActiveContractsForPartner(partnerId, excludeId = null) {
  return (pxState.contracts || []).filter((c) => (
    Number(c.partner_id) === Number(partnerId)
    && PX_CONTRACT_ACTIVE.includes(c.status)
    && String(c.id) !== String(excludeId || '')
  ));
}

function pxContractPayload(contract, overrides = {}) {
  return {
    partner_id: contract.partner_id,
    plan_id: contract.plan_id,
    amount: Number(contract.amount),
    starts_on: String(contract.starts_on).slice(0, 10),
    ends_on: String(contract.ends_on).slice(0, 10),
    payment_method: contract.payment_method || '',
    notes: contract.notes || '',
    auto_renew: Boolean(contract.auto_renew),
    cycle_months: Number(contract.cycle_months) || 12,
    ...overrides,
  };
}

function pxFilteredContracts() {
  const f = pxState.contractsFilters || {};
  const q = String(f.q || '').trim().toLowerCase();
  let rows = [...(pxState.contracts || [])];
  if (f.status) rows = rows.filter((c) => c.status === f.status);
  if (f.plan_id) rows = rows.filter((c) => String(c.plan_id) === String(f.plan_id));
  if (q) {
    rows = rows.filter((c) => (
      String(c.partner_name || '').toLowerCase().includes(q)
      || String(c.plan_name || '').toLowerCase().includes(q)
      || String(c.notes || '').toLowerCase().includes(q)
    ));
  }
  const sort = f.sort || 'ends_on';
  rows.sort((a, b) => {
    if (sort === 'amount') return Number(b.amount) - Number(a.amount);
    if (sort === 'partner') return String(a.partner_name || '').localeCompare(String(b.partner_name || ''), 'pt-BR');
    if (sort === 'starts_on') return String(a.starts_on || '').localeCompare(String(b.starts_on || ''));
    return String(a.ends_on || '').localeCompare(String(b.ends_on || ''));
  });
  return rows;
}

function pxContractsSummary(rows) {
  const summary = { total: rows.length, ativos: 0, vencendo: 0, vencidos: 0, receita: 0 };
  for (const c of rows) {
    if (c.status === 'ativo' || c.status === 'pendente') summary.ativos += 1;
    if (c.status === 'vencendo') summary.vencendo += 1;
    if (c.status === 'vencido') summary.vencidos += 1;
    if (c.status !== 'cancelado') summary.receita += Number(c.amount) || 0;
  }
  return summary;
}

function pxDaysLeftLabel(daysLeft, status) {
  if (status === 'cancelado') return '—';
  if (daysLeft == null || Number.isNaN(Number(daysLeft))) return '—';
  const d = Number(daysLeft);
  if (d < 0) return `${Math.abs(d)}d atrasado`;
  if (d === 0) return 'vence hoje';
  return `${d}d`;
}

function pxEventLabel(type) {
  const map = {
    created: 'Criado',
    updated: 'Atualizado',
    renewed: 'Renovado',
    cancelled: 'Cancelado',
    partner_paused: 'Parceiro pausado',
    payment_created: 'Cobrança gerada',
    plan_changed: 'Plano alterado',
    attachment_added: 'Anexo adicionado',
    attachment_removed: 'Anexo removido',
    expiry_notified: 'Aviso de vencimento',
    auto_renewed: 'Renovação automática',
  };
  return map[type] || type;
}

function pxExportContractsCsv(rows) {
  const header = ['Parceiro', 'Plano', 'Valor', 'Inicio', 'Fim', 'Dias', 'Status', 'Pagamento', 'Criado_por', 'Atualizado_por', 'Notas'];
  const lines = [header.join(';')];
  for (const c of rows) {
    const cells = [
      c.partner_name,
      c.plan_name || '',
      Number(c.amount || 0).toFixed(2).replace('.', ','),
      String(c.starts_on || '').slice(0, 10),
      String(c.ends_on || '').slice(0, 10),
      c.days_left,
      c.status,
      c.payment_method || '',
      c.created_by_email || '',
      c.updated_by_email || '',
      String(c.notes || '').replace(/[\r\n;]+/g, ' '),
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`);
    lines.push(cells.join(';'));
  }
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contratos-antonov-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadPxContracts() {
  const el = document.getElementById('px-content');
  if (!el) return;
  el.innerHTML = '<p class="dash-loading">Carregando contratos…</p>';
  try {
    const [contractsRes, partnersRes, plansRes] = await Promise.all([
      pxApi('/contracts'),
      pxApi('/partners?limit=100'),
      pxApi('/plans'),
    ]);
    pxState.contracts = contractsRes.contracts || [];
    pxState.partners = partnersRes.partners || [];
    pxState.plans = plansRes.plans || [];
    if (Array.isArray(contractsRes.warn_days)) pxState.contractWarnDays = contractsRes.warn_days;
    if (!pxState.contractsFilters) {
      pxState.contractsFilters = { q: '', status: '', plan_id: '', sort: 'ends_on' };
    }
    renderPxContractsView();
  } catch (err) {
    el.innerHTML = `<p class="section-error">${pxEsc(err.message)}</p>`;
  }
}

function renderPxContractsView() {
  const el = document.getElementById('px-content');
  if (!el) return;
  const f = pxState.contractsFilters;
  const rows = pxFilteredContracts();
  const summary = pxContractsSummary(rows);
  const plans = pxState.plans || [];
  const warnDays = pxState.contractWarnDays || [30, 15, 7];
  const maxWarn = Math.max(...warnDays);
  const expiringAll = (pxState.contracts || []).filter((c) => c.status === 'vencendo').length;
  const expiredAll = (pxState.contracts || []).filter((c) => c.status === 'vencido').length;

  el.innerHTML = `
    <div class="pdi-toolbar">
      <button type="button" class="btn btn-primary btn-sm" id="px-new-contract">+ Novo contrato</button>
      <button type="button" class="btn btn-secondary btn-sm" id="px-export-contracts">Exportar CSV</button>
    </div>
    ${(expiringAll || expiredAll) ? `
      <div class="px-alert-banner${expiredAll ? ' px-alert-banner--danger' : ''}">
        <strong>Alertas (${warnDays.join('/')} dias):</strong>
        ${expiringAll} vencendo · ${expiredAll} vencidos.
        <button type="button" class="btn btn-sm btn-secondary" data-px-status-chip="vencendo">Filtrar vencendo</button>
        <button type="button" class="btn btn-sm btn-ghost" data-px-status-chip="vencido">Filtrar vencidos</button>
      </div>
    ` : ''}
    <div class="pdi-stats">
      <article class="pdi-stat"><span class="pdi-stat__val">${summary.total}</span><span class="pdi-stat__lbl">No filtro</span></article>
      <article class="pdi-stat"><span class="pdi-stat__val">${summary.ativos}</span><span class="pdi-stat__lbl">Ativos / pendentes</span></article>
      <article class="pdi-stat pdi-stat--warn"><span class="pdi-stat__val">${summary.vencendo}</span><span class="pdi-stat__lbl">Vencendo (≤${maxWarn}d)</span></article>
      <article class="pdi-stat"><span class="pdi-stat__val">${summary.vencidos}</span><span class="pdi-stat__lbl">Vencidos</span></article>
      <article class="pdi-stat"><span class="pdi-stat__val">R$ ${pxMoney(summary.receita)}</span><span class="pdi-stat__lbl">Receita filtrada</span></article>
    </div>
    <div class="px-contract-filters card">
      <div class="px-contract-chips" role="group" aria-label="Atalhos de status">
        ${[
          ['', 'Todos'],
          ['vencendo', 'Vencendo'],
          ['vencido', 'Vencidos'],
          ['ativo', 'Ativos'],
          ['cancelado', 'Cancelados'],
        ].map(([value, label]) => `
          <button type="button" class="px-chip${f.status === value ? ' is-active' : ''}" data-px-status-chip="${value}">${label}</button>
        `).join('')}
      </div>
      <div class="px-contract-filters__row">
        <label class="px-filter-field">
          <span>Buscar</span>
          <input type="search" id="px-contract-q" value="${pxEsc(f.q)}" placeholder="Parceiro, plano ou nota…" />
        </label>
        <label class="px-filter-field">
          <span>Plano</span>
          <select id="px-contract-filter-plan">
            <option value="">Todos</option>
            ${plans.map((p) => `<option value="${p.id}"${String(f.plan_id) === String(p.id) ? ' selected' : ''}>${pxEsc(p.name)}</option>`).join('')}
          </select>
        </label>
        <label class="px-filter-field">
          <span>Status</span>
          <select id="px-contract-filter-status">
            <option value="">Todos</option>
            ${['ativo', 'pendente', 'vencendo', 'vencido', 'cancelado'].map((s) => `
              <option value="${s}"${f.status === s ? ' selected' : ''}>${s}</option>
            `).join('')}
          </select>
        </label>
        <label class="px-filter-field">
          <span>Ordenar</span>
          <select id="px-contract-sort">
            <option value="ends_on"${f.sort === 'ends_on' ? ' selected' : ''}>Fim (mais próximo)</option>
            <option value="starts_on"${f.sort === 'starts_on' ? ' selected' : ''}>Início</option>
            <option value="amount"${f.sort === 'amount' ? ' selected' : ''}>Valor</option>
            <option value="partner"${f.sort === 'partner' ? ' selected' : ''}>Parceiro</option>
          </select>
        </label>
      </div>
    </div>
    <div class="card pdi-table-wrap">
      <h3>Contratos <span class="pdi-muted">(${rows.length})</span></h3>
      <table class="data-table pdi-table">
        <thead><tr>
          <th>Parceiro</th><th>Plano</th><th>Valor</th><th>Início</th><th>Fim</th><th>Dias</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${rows.map((c) => `
          <tr class="${c.status === 'vencendo' || c.status === 'vencido' ? 'pdi-row--alert' : ''}">
            <td><strong>${pxEsc(c.partner_name)}</strong></td>
            <td>${pxEsc(c.plan_name || '—')}</td>
            <td>R$ ${pxMoney(c.amount)}</td>
            <td>${pxEsc(String(c.starts_on || '').slice(0, 10) || '—')}</td>
            <td>${pxEsc(String(c.ends_on || '').slice(0, 10) || '—')}</td>
            <td><span class="px-days ${Number(c.days_left) <= maxWarn && c.status !== 'cancelado' ? 'px-days--warn' : ''}">${pxEsc(pxDaysLeftLabel(c.days_left, c.status))}</span></td>
            <td>${pxBadge(c.status)}</td>
            <td class="pdi-actions">${pxContractRowActions(c)}</td>
          </tr>`).join('') || '<tr><td colspan="8" class="empty-msg">Nenhum contrato neste filtro.</td></tr>'}
        </tbody>
      </table>
    </div>`;

  el.querySelector('#px-new-contract')?.addEventListener('click', () => openPxContractForm());
  el.querySelector('#px-export-contracts')?.addEventListener('click', () => pxExportContractsCsv(rows));
  el.querySelectorAll('[data-px-status-chip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pxState.contractsFilters.status = btn.dataset.pxStatusChip || '';
      renderPxContractsView();
    });
  });
  const applyFilters = () => {
    pxState.contractsFilters.q = el.querySelector('#px-contract-q')?.value || '';
    pxState.contractsFilters.plan_id = el.querySelector('#px-contract-filter-plan')?.value || '';
    pxState.contractsFilters.status = el.querySelector('#px-contract-filter-status')?.value || '';
    pxState.contractsFilters.sort = el.querySelector('#px-contract-sort')?.value || 'ends_on';
    renderPxContractsView();
  };
  el.querySelector('#px-contract-filter-plan')?.addEventListener('change', applyFilters);
  el.querySelector('#px-contract-filter-status')?.addEventListener('change', applyFilters);
  el.querySelector('#px-contract-sort')?.addEventListener('change', applyFilters);
  const qInput = el.querySelector('#px-contract-q');
  qInput?.addEventListener('input', () => {
    pxState.contractsFilters.q = qInput.value || '';
    const tbody = el.querySelector('tbody');
    const summaryHost = el.querySelector('.pdi-stats');
    const filtered = pxFilteredContracts();
    const summary = pxContractsSummary(filtered);
    if (summaryHost) {
      summaryHost.innerHTML = `
        <article class="pdi-stat"><span class="pdi-stat__val">${summary.total}</span><span class="pdi-stat__lbl">No filtro</span></article>
        <article class="pdi-stat"><span class="pdi-stat__val">${summary.ativos}</span><span class="pdi-stat__lbl">Ativos / pendentes</span></article>
        <article class="pdi-stat pdi-stat--warn"><span class="pdi-stat__val">${summary.vencendo}</span><span class="pdi-stat__lbl">Vencendo (≤${maxWarn}d)</span></article>
        <article class="pdi-stat"><span class="pdi-stat__val">${summary.vencidos}</span><span class="pdi-stat__lbl">Vencidos</span></article>
        <article class="pdi-stat"><span class="pdi-stat__val">R$ ${pxMoney(summary.receita)}</span><span class="pdi-stat__lbl">Receita filtrada</span></article>`;
    }
    if (tbody) {
      tbody.innerHTML = filtered.map((c) => `
        <tr class="${c.status === 'vencendo' || c.status === 'vencido' ? 'pdi-row--alert' : ''}">
          <td><strong>${pxEsc(c.partner_name)}</strong></td>
          <td>${pxEsc(c.plan_name || '—')}</td>
          <td>R$ ${pxMoney(c.amount)}</td>
          <td>${pxEsc(String(c.starts_on || '').slice(0, 10) || '—')}</td>
          <td>${pxEsc(String(c.ends_on || '').slice(0, 10) || '—')}</td>
          <td><span class="px-days ${Number(c.days_left) <= maxWarn && c.status !== 'cancelado' ? 'px-days--warn' : ''}">${pxEsc(pxDaysLeftLabel(c.days_left, c.status))}</span></td>
          <td>${pxBadge(c.status)}</td>
          <td class="pdi-actions">${pxContractRowActions(c)}</td>
        </tr>`).join('') || '<tr><td colspan="8" class="empty-msg">Nenhum contrato neste filtro.</td></tr>';
      bindPxContractRowActions(el);
    }
    const titleCount = el.querySelector('.pdi-table-wrap h3 .pdi-muted');
    if (titleCount) titleCount.textContent = `(${filtered.length})`;
  });
  bindPxContractRowActions(el);
}

function pxContractRowActions(c) {
  return `
    <button type="button" class="btn btn-sm btn-secondary" data-px-edit-contract="${c.id}">Editar</button>
    ${c.status !== 'cancelado' ? `<button type="button" class="btn btn-sm btn-secondary" data-px-change-plan="${c.id}">Trocar plano</button>` : ''}
    ${c.status !== 'cancelado' ? `<button type="button" class="btn btn-sm btn-secondary" data-px-renew-contract="${c.id}">Renovar</button>` : ''}
    <button type="button" class="btn btn-sm btn-ghost" data-px-notify-contract="${c.id}">Avisar</button>
    <button type="button" class="btn btn-sm btn-ghost" data-px-finance-partner="${c.partner_id}">Financeiro</button>
    ${c.status !== 'cancelado' ? `<button type="button" class="btn btn-sm btn-ghost" data-px-cancel-contract="${c.id}">Cancelar</button>` : ''}
  `;
}

function switchPxView(view) {
  pxState.view = view;
  const host = document.getElementById('tab-parceiros');
  host?.querySelectorAll('[data-px-view]').forEach((b) => {
    b.classList.toggle('active', b.dataset.pxView === view);
  });
  onPxTabOpen();
}

function goPxFinanceForPartner(partnerId) {
  pxState.financeFilters = {
    partner_id: String(partnerId || ''),
    q: '',
  };
  switchPxView('finance');
}

function pxPaymentsBalance(contractAmount, payments) {
  const active = (payments || []).filter((p) => p.status !== 'cancelado');
  const received = active.reduce((sum, p) => sum + (Number(p.received_amount) || 0), 0);
  const contractedLines = active.reduce((sum, p) => sum + (Number(p.contracted_amount) || 0), 0);
  const contracted = Number(contractAmount) || contractedLines;
  const pending = Math.max(contracted - received, 0);
  return { contracted, received, pending, lines: active.length };
}

function bindPxContractRowActions(el) {
  el.querySelectorAll('[data-px-edit-contract]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const contract = pxState.contracts.find((c) => String(c.id) === String(btn.dataset.pxEditContract));
      openPxContractForm(contract || null);
    });
  });
  el.querySelectorAll('[data-px-renew-contract]').forEach((btn) => {
    btn.addEventListener('click', () => openPxRenewContract(btn.dataset.pxRenewContract));
  });
  el.querySelectorAll('[data-px-change-plan]').forEach((btn) => {
    btn.addEventListener('click', () => openPxChangePlan(btn.dataset.pxChangePlan));
  });
  el.querySelectorAll('[data-px-notify-contract]').forEach((btn) => {
    btn.addEventListener('click', () => openPxNotifyContract(btn.dataset.pxNotifyContract));
  });
  el.querySelectorAll('[data-px-cancel-contract]').forEach((btn) => {
    btn.addEventListener('click', () => cancelPxContract(btn.dataset.pxCancelContract));
  });
  el.querySelectorAll('[data-px-finance-partner]').forEach((btn) => {
    btn.addEventListener('click', () => goPxFinanceForPartner(btn.dataset.pxFinancePartner));
  });
}

function updatePxContractConflictHint(form) {
  const hint = form?.querySelector('#px-contract-conflict');
  const replaceWrap = form?.querySelector('#px-contract-replace-wrap');
  const pauseReplaced = form?.querySelector('#px-replace-pause-wrap');
  if (!hint || !replaceWrap) return;
  const partnerId = form.partner_id?.value;
  const excludeId = pxState.editingContract?.id;
  const conflicts = partnerId ? pxActiveContractsForPartner(partnerId, excludeId) : [];
  if (!conflicts.length) {
    hint.hidden = true;
    replaceWrap.hidden = true;
    if (pauseReplaced) pauseReplaced.hidden = true;
    return;
  }
  const names = conflicts.map((c) => `${c.plan_name || 'plano'} · ${c.status} · fim ${String(c.ends_on).slice(0, 10)}`).join('; ');
  hint.textContent = `Já existe contrato em vigor para este parceiro (${names}).`;
  hint.hidden = false;
  replaceWrap.hidden = false;
  if (pauseReplaced) pauseReplaced.hidden = false;
}

async function openPxContractForm(contract = null) {
  const modal = document.getElementById('px-modal');
  const box = document.getElementById('px-modal-body');
  if (!modal || !box) return;
  pxState.editingContract = contract;
  const today = new Date().toISOString().slice(0, 10);
  const starts = pxDateInput(contract?.starts_on, today);
  const ends = pxDateInput(contract?.ends_on, pxAddYears(starts, 1));
  const partners = pxState.partners || [];
  const plans = (pxState.plans || []).filter((p) => p.status === 'ativo' || String(p.id) === String(contract?.plan_id));

  let payments = [];
  let events = [];
  let attachments = [];
  if (contract?.id) {
    try {
      const detail = await pxApi(`/contracts/${contract.id}`);
      payments = detail.payments || [];
      events = detail.events || [];
      attachments = detail.attachments || [];
      if (!payments.length) {
        const payRes = await pxApi(`/payments?contract_id=${contract.id}`);
        payments = payRes.payments || [];
      }
    } catch {
      try {
        const [payRes, evRes] = await Promise.all([
          pxApi(`/payments?contract_id=${contract.id}`),
          pxApi(`/contracts/${contract.id}/events`),
        ]);
        payments = payRes.payments || [];
        events = evRes.events || [];
      } catch {
        payments = [];
        events = [];
      }
    }
  }
  pxState.contractPayments = payments;
  pxState.contractAttachments = attachments;
  const balance = pxPaymentsBalance(contract?.amount, payments);
  const cycleMonths = Number(contract?.cycle_months) || 12;

  box.innerHTML = `
    <h3 id="px-modal-title">${contract ? 'Editar contrato' : 'Novo contrato'}</h3>
    <form id="px-contract-form" class="pdi-form">
      <div class="field-row">
        <label><span>Parceiro</span>
          <select name="partner_id" required>
            <option value="">Selecione…</option>
            ${partners.map((p) => `<option value="${p.id}"${Number(contract?.partner_id) === Number(p.id) ? ' selected' : ''}>${pxEsc(p.name)}</option>`).join('')}
          </select>
        </label>
        <label><span>Plano</span>
          <select name="plan_id" id="px-contract-plan">
            <option value="">—</option>
            ${plans.map((p) => `<option value="${p.id}" data-price="${pxEsc(p.price ?? 0)}"${Number(contract?.plan_id) === Number(p.id) ? ' selected' : ''}>${pxEsc(p.name)} (R$ ${pxMoney(p.price)})</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="field-row">
        <label><span>Valor (R$)</span><input name="amount" id="px-contract-amount" type="number" min="0" step="0.01" required value="${pxEsc(contract?.amount != null ? Number(contract.amount) : '')}" /></label>
        <label><span>Forma de pagamento</span><input name="payment_method" value="${pxEsc(contract?.payment_method || '')}" placeholder="PIX, boleto, cartão…" /></label>
      </div>
      <div class="field-row">
        <label><span>Início</span><input name="starts_on" type="date" required value="${pxEsc(starts)}" /></label>
        <label><span>Fim</span><input name="ends_on" type="date" required value="${pxEsc(ends)}" /></label>
      </div>
      <div class="field-row">
        <label><span>Ciclo (meses)</span>
          <select name="cycle_months">
            ${[1, 3, 6, 12, 24].map((m) => `<option value="${m}"${cycleMonths === m ? ' selected' : ''}>${m} ${m === 1 ? 'mês' : 'meses'}</option>`).join('')}
          </select>
        </label>
        <label class="check-label px-check-inline">
          <input type="checkbox" name="auto_renew"${contract?.auto_renew ? ' checked' : ''} /> Renovação automática ao vencer
        </label>
      </div>
      ${contract ? `
      <label><span>Status</span>
        <select name="status" id="px-contract-status">
          ${['ativo', 'pendente', 'vencendo', 'vencido', 'cancelado'].map((s) => `<option value="${s}"${contract.status === s ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
      </label>
      <p class="pdi-muted">O status é recalculado automaticamente pelas datas, salvo se estiver cancelado.</p>
      <label id="px-pause-partner-wrap" class="check-label"${['cancelado', 'vencido'].includes(contract.status) ? '' : ' hidden'}>
        <input type="checkbox" name="pause_partner" /> Pausar exposição do parceiro (Home + status pausado)
      </label>
      <p class="pdi-muted">Auditoria: criado por ${pxEsc(contract.created_by_email || '—')} · atualizado por ${pxEsc(contract.updated_by_email || '—')}</p>
      ` : ''}
      <p id="px-contract-conflict" class="form-error" hidden></p>
      <label id="px-contract-replace-wrap" class="check-label" hidden>
        <input type="checkbox" name="replace_active" /> Cancelar o(s) contrato(s) ativo(s) anterior(es) deste parceiro
      </label>
      <label class="check-label" id="px-replace-pause-wrap" hidden>
        <input type="checkbox" name="pause_replaced" /> Ao substituir, pausar exposição do(s) contrato(s) anterior(es)
      </label>
      <label><span>Notas</span><textarea name="notes" rows="3">${pxEsc(contract?.notes || '')}</textarea></label>

      <div class="px-payment-block">
        <h4 class="pdi-section-title">Financeiro</h4>
        ${contract ? `
        <div class="pdi-stats px-payment-stats">
          <article class="pdi-stat"><span class="pdi-stat__val">R$ ${pxMoney(balance.contracted)}</span><span class="pdi-stat__lbl">Contratado</span></article>
          <article class="pdi-stat"><span class="pdi-stat__val">R$ ${pxMoney(balance.received)}</span><span class="pdi-stat__lbl">Recebido</span></article>
          <article class="pdi-stat pdi-stat--warn"><span class="pdi-stat__val">R$ ${pxMoney(balance.pending)}</span><span class="pdi-stat__lbl">Pendente</span></article>
        </div>
        <div class="pdi-toolbar">
          <button type="button" class="btn btn-sm btn-secondary" id="px-add-payment">+ Registrar pagamento</button>
          <button type="button" class="btn btn-sm btn-ghost" id="px-jump-finance">Ver no Financeiro</button>
          ${contract.status !== 'cancelado' ? `<button type="button" class="btn btn-sm btn-secondary" id="px-open-change-plan">Trocar plano</button>` : ''}
          <button type="button" class="btn btn-sm btn-ghost" id="px-open-notify">Avisar vencimento</button>
        </div>
        <div class="card pdi-table-wrap px-payment-table">
          <table class="data-table pdi-table">
            <thead><tr><th>Vencimento</th><th>Contratado</th><th>Recebido</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${payments.map((p) => `
                <tr>
                  <td>${pxEsc(String(p.due_on || '—').slice(0, 10))}</td>
                  <td>R$ ${pxMoney(p.contracted_amount)}</td>
                  <td>R$ ${pxMoney(p.received_amount)}</td>
                  <td>${pxBadge(p.status)}</td>
                  <td><button type="button" class="btn btn-sm btn-ghost" data-px-edit-payment="${p.id}">Editar</button></td>
                </tr>
              `).join('') || '<tr><td colspan="5" class="empty-msg">Nenhum lançamento neste contrato.</td></tr>'}
            </tbody>
          </table>
        </div>
        ` : `
        <label class="check-label">
          <input type="checkbox" name="create_payment" id="px-create-payment" checked /> Gerar cobrança ao salvar
        </label>
        <label id="px-payment-due-wrap"><span>Vencimento da cobrança</span>
          <input name="payment_due_on" type="date" value="${pxEsc(starts)}" />
        </label>
        `}
      </div>

      ${contract ? `
      <div class="px-attach-block">
        <h4 class="pdi-section-title">Anexos (PDF)</h4>
        <div class="field-row">
          <label><span>Enviar arquivo</span>
            <input type="file" id="px-contract-attach-file" accept=".pdf,application/pdf,image/jpeg,image/png,image/webp" />
          </label>
          <div class="modal-actions" style="align-self:end">
            <button type="button" class="btn btn-sm btn-secondary" id="px-upload-attach">Enviar</button>
          </div>
        </div>
        <ul class="px-attach-list" id="px-attach-list">
          ${attachments.map((a) => `
            <li>
              <button type="button" class="btn btn-sm btn-ghost" data-px-download-attach="${a.id}">${pxEsc(a.file_name)}</button>
              <span class="pdi-muted">${pxEsc(String(a.created_at || '').slice(0, 10))}${a.uploaded_by_email ? ` · ${pxEsc(a.uploaded_by_email)}` : ''}</span>
              <button type="button" class="btn btn-sm btn-ghost" data-px-del-attach="${a.id}">Remover</button>
            </li>
          `).join('') || '<li class="pdi-muted">Nenhum anexo.</li>'}
        </ul>
      </div>
      <div class="px-history-block">
        <h4 class="pdi-section-title">Histórico</h4>
        <ol class="px-timeline">
          ${events.map((ev) => `
            <li>
              <strong>${pxEsc(pxEventLabel(ev.event_type))}</strong>
              <span class="pdi-muted">${pxEsc(String(ev.created_at || '').replace('T', ' ').slice(0, 16))}${ev.admin_email ? ` · ${pxEsc(ev.admin_email)}` : ''}</span>
              ${ev.message ? `<div>${pxEsc(ev.message)}</div>` : ''}
            </li>
          `).join('') || '<li class="pdi-muted">Sem eventos registrados ainda.</li>'}
        </ol>
      </div>
      ` : ''}

      <p id="px-contract-error" class="form-error" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="px-contract-dismiss">Fechar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>`;
  modal.hidden = false;
  const form = box.querySelector('#px-contract-form');
  box.querySelector('#px-contract-dismiss')?.addEventListener('click', () => { modal.hidden = true; });
  const planSelect = box.querySelector('#px-contract-plan');
  const amountInput = box.querySelector('#px-contract-amount');
  planSelect?.addEventListener('change', () => {
    const opt = planSelect.selectedOptions[0];
    if (!opt || !opt.value || !amountInput) return;
    const price = Number(opt.dataset.price);
    if (Number.isFinite(price)) amountInput.value = String(price);
  });
  form?.partner_id?.addEventListener('change', () => updatePxContractConflictHint(form));
  form?.querySelector('#px-contract-status')?.addEventListener('change', (ev) => {
    const wrap = box.querySelector('#px-pause-partner-wrap');
    if (wrap) wrap.hidden = !['cancelado', 'vencido'].includes(ev.target.value);
  });
  if (!contract && planSelect?.value) planSelect.dispatchEvent(new Event('change'));
  updatePxContractConflictHint(form);
  form?.addEventListener('submit', savePxContractForm);

  const createPay = box.querySelector('#px-create-payment');
  const dueWrap = box.querySelector('#px-payment-due-wrap');
  createPay?.addEventListener('change', () => {
    if (dueWrap) dueWrap.hidden = !createPay.checked;
  });

  box.querySelector('#px-add-payment')?.addEventListener('click', () => {
    openPxPaymentForm({
      contract_id: contract.id,
      partner_id: contract.partner_id,
      contracted_amount: balance.pending > 0 ? balance.pending : Number(contract.amount) || 0,
      due_on: today,
    });
  });
  box.querySelector('#px-jump-finance')?.addEventListener('click', () => {
    modal.hidden = true;
    goPxFinanceForPartner(contract.partner_id);
  });
  box.querySelector('#px-open-change-plan')?.addEventListener('click', () => openPxChangePlan(contract.id));
  box.querySelector('#px-open-notify')?.addEventListener('click', () => openPxNotifyContract(contract.id));
  box.querySelectorAll('[data-px-edit-payment]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const payment = payments.find((p) => String(p.id) === String(btn.dataset.pxEditPayment));
      if (payment) openPxPaymentForm(payment);
    });
  });

  box.querySelector('#px-upload-attach')?.addEventListener('click', async () => {
    const input = box.querySelector('#px-contract-attach-file');
    const err = document.getElementById('px-contract-error');
    try {
      const file = await fileToPayload(input);
      if (!file) {
        if (err) { err.textContent = 'Selecione um arquivo PDF ou imagem.'; err.hidden = false; }
        return;
      }
      await pxApi(`/contracts/${contract.id}/attachments`, {
        method: 'POST',
        body: JSON.stringify({ file }),
      });
      openPxContractForm(pxState.contracts.find((c) => String(c.id) === String(contract.id)) || contract);
    } catch (error) {
      if (err) { err.textContent = error.message || 'Falha ao enviar anexo.'; err.hidden = false; }
    }
  });
  box.querySelectorAll('[data-px-del-attach]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remover este anexo?')) return;
      try {
        await pxApi(`/contracts/${contract.id}/attachments/${btn.dataset.pxDelAttach}`, { method: 'DELETE' });
        openPxContractForm(pxState.contracts.find((c) => String(c.id) === String(contract.id)) || contract);
      } catch (error) {
        alert(error.message || 'Falha ao remover anexo.');
      }
    });
  });
  box.querySelectorAll('[data-px-download-attach]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const res = await pxApi(`/contracts/${contract.id}/attachments/${btn.dataset.pxDownloadAttach}`);
        const a = res.attachment;
        if (!a?.file_data) throw new Error('Anexo sem dados.');
        const mime = a.file_type || 'application/octet-stream';
        const link = document.createElement('a');
        link.href = `data:${mime};base64,${a.file_data}`;
        link.download = a.file_name || 'anexo';
        link.click();
      } catch (error) {
        alert(error.message || 'Falha ao baixar anexo.');
      }
    });
  });
}

async function savePxContractForm(e) {
  e.preventDefault();
  const form = e.target;
  const err = document.getElementById('px-contract-error');
  const submitBtn = form.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(form).entries());
  const replaceActive = Boolean(form.replace_active?.checked);
  const pauseReplaced = Boolean(form.pause_replaced?.checked);
  const createPayment = Boolean(form.create_payment?.checked);
  const pausePartner = Boolean(form.pause_partner?.checked);
  const paymentDueOn = payload.payment_due_on || payload.starts_on;
  payload.partner_id = Number(payload.partner_id);
  payload.plan_id = payload.plan_id ? Number(payload.plan_id) : null;
  payload.amount = Number(payload.amount);
  payload.pause_partner = pausePartner;
  payload.auto_renew = Boolean(form.auto_renew?.checked);
  payload.cycle_months = Number(payload.cycle_months) || 12;
  delete payload.replace_active;
  delete payload.pause_replaced;
  delete payload.create_payment;
  delete payload.payment_due_on;
  if (!payload.partner_id) {
    if (err) { err.textContent = 'Selecione o parceiro.'; err.hidden = false; }
    return;
  }
  if (!Number.isFinite(payload.amount) || payload.amount < 0) {
    if (err) { err.textContent = 'Informe um valor válido.'; err.hidden = false; }
    return;
  }
  if (!payload.starts_on || !payload.ends_on) {
    if (err) { err.textContent = 'Informe as datas de início e fim.'; err.hidden = false; }
    return;
  }
  if (payload.ends_on < payload.starts_on) {
    if (err) { err.textContent = 'A data final não pode ser anterior à data inicial.'; err.hidden = false; }
    return;
  }
  const conflicts = pxActiveContractsForPartner(payload.partner_id, pxState.editingContract?.id);
  if (conflicts.length && !replaceActive && payload.status !== 'cancelado') {
    if (err) {
      err.textContent = 'Há contrato ativo para este parceiro. Marque a opção de substituir ou cancele o anterior.';
      err.hidden = false;
    }
    updatePxContractConflictHint(form);
    return;
  }
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Salvando…'; }
  if (err) err.hidden = true;
  try {
    if (replaceActive && conflicts.length) {
      for (const old of conflicts) {
        await pxApi(`/contracts/${old.id}`, {
          method: 'PATCH',
          body: JSON.stringify(pxContractPayload(old, {
            status: 'cancelado',
            pause_partner: pauseReplaced,
          })),
        });
      }
    }
    const contract = pxState.editingContract;
    const res = contract
      ? await pxApi(`/contracts/${contract.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await pxApi('/contracts', { method: 'POST', body: JSON.stringify(payload) });
    if (!res?.contract) throw new Error('Resposta inválida do servidor.');
    if (!contract && createPayment) {
      await pxApi('/payments', {
        method: 'POST',
        body: JSON.stringify({
          contract_id: res.contract.id,
          partner_id: payload.partner_id,
          contracted_amount: payload.amount,
          received_amount: 0,
          due_on: paymentDueOn,
          notes: 'Cobrança gerada com o contrato',
        }),
      });
    }
    document.getElementById('px-modal').hidden = true;
    await loadPxContracts();
  } catch (error) {
    if (err) { err.textContent = error.message || 'Falha ao salvar o contrato.'; err.hidden = false; }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Salvar'; }
  }
}

function openPxPaymentForm(paymentOrSeed = {}) {
  const modal = document.getElementById('px-modal');
  const box = document.getElementById('px-modal-body');
  if (!modal || !box) return;
  const editing = Boolean(paymentOrSeed.id);
  const today = new Date().toISOString().slice(0, 10);
  const backContractId = paymentOrSeed.contract_id || pxState.editingContract?.id;
  box.innerHTML = `
    <h3 id="px-modal-title">${editing ? 'Editar pagamento' : 'Registrar pagamento'}</h3>
    <form id="px-payment-form" class="pdi-form">
      <input type="hidden" name="contract_id" value="${pxEsc(paymentOrSeed.contract_id || '')}" />
      <input type="hidden" name="partner_id" value="${pxEsc(paymentOrSeed.partner_id || '')}" />
      <div class="field-row">
        <label><span>Valor contratado (R$)</span>
          <input name="contracted_amount" type="number" min="0" step="0.01" required value="${pxEsc(paymentOrSeed.contracted_amount != null ? Number(paymentOrSeed.contracted_amount) : '')}" />
        </label>
        <label><span>Valor recebido (R$)</span>
          <input name="received_amount" type="number" min="0" step="0.01" value="${pxEsc(paymentOrSeed.received_amount != null ? Number(paymentOrSeed.received_amount) : 0)}" />
        </label>
      </div>
      <div class="field-row">
        <label><span>Vencimento</span>
          <input name="due_on" type="date" value="${pxEsc(pxDateInput(paymentOrSeed.due_on, today))}" />
        </label>
        <label><span>Status</span>
          <select name="status">
            ${['pendente', 'pago', 'atrasado', 'cancelado'].map((s) => `
              <option value="${s}"${(paymentOrSeed.status || 'pendente') === s ? ' selected' : ''}>${s}</option>
            `).join('')}
          </select>
        </label>
      </div>
      <label><span>Notas</span><textarea name="notes" rows="2">${pxEsc(paymentOrSeed.notes || '')}</textarea></label>
      <p id="px-payment-error" class="form-error" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="px-payment-back">Voltar</button>
        <button type="submit" class="btn btn-primary">Salvar pagamento</button>
      </div>
    </form>`;
  modal.hidden = false;
  box.querySelector('#px-payment-back')?.addEventListener('click', async () => {
    if (backContractId) {
      const contract = pxState.contracts.find((c) => String(c.id) === String(backContractId));
      if (contract) await openPxContractForm(contract);
      else modal.hidden = true;
    } else {
      modal.hidden = true;
    }
  });
  box.querySelector('#px-payment-form')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const err = document.getElementById('px-payment-error');
    const submitBtn = form.querySelector('button[type="submit"]');
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.contract_id = payload.contract_id ? Number(payload.contract_id) : null;
    payload.partner_id = payload.partner_id ? Number(payload.partner_id) : null;
    payload.contracted_amount = Number(payload.contracted_amount);
    payload.received_amount = Number(payload.received_amount) || 0;
    if (!Number.isFinite(payload.contracted_amount) || payload.contracted_amount < 0) {
      if (err) { err.textContent = 'Valor contratado inválido.'; err.hidden = false; }
      return;
    }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Salvando…'; }
    if (err) err.hidden = true;
    try {
      if (editing) {
        await pxApi(`/payments/${paymentOrSeed.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await pxApi('/payments', { method: 'POST', body: JSON.stringify(payload) });
      }
      if (backContractId) {
        const contract = pxState.contracts.find((c) => String(c.id) === String(backContractId));
        if (contract) await openPxContractForm(contract);
        else modal.hidden = true;
      } else {
        modal.hidden = true;
        if (pxState.view === 'finance') await loadPxFinance();
      }
    } catch (error) {
      if (err) { err.textContent = error.message || 'Falha ao salvar pagamento.'; err.hidden = false; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Salvar pagamento'; }
    }
  });
}

function openPxChangePlan(id) {
  const contract = pxState.contracts.find((c) => String(c.id) === String(id));
  if (!contract || contract.status === 'cancelado') return;
  const modal = document.getElementById('px-modal');
  const box = document.getElementById('px-modal-body');
  if (!modal || !box) return;
  const plans = (pxState.plans || []).filter((p) => p.status === 'ativo' || String(p.id) === String(contract.plan_id));
  box.innerHTML = `
    <h3 id="px-modal-title">Trocar plano</h3>
    <form id="px-change-plan-form" class="pdi-form">
      <p class="pdi-muted">${pxEsc(contract.partner_name)} · plano atual: <strong>${pxEsc(contract.plan_name || '—')}</strong> · R$ ${pxMoney(contract.amount)}</p>
      <p class="pdi-muted">Período: ${pxEsc(String(contract.starts_on).slice(0, 10))} → ${pxEsc(String(contract.ends_on).slice(0, 10))} · ${pxEsc(pxDaysLeftLabel(contract.days_left, contract.status))}</p>
      <label><span>Novo plano</span>
        <select name="plan_id" id="px-change-plan-select" required>
          <option value="">Selecione…</option>
          ${plans.filter((p) => String(p.id) !== String(contract.plan_id)).map((p) => `
            <option value="${p.id}" data-price="${pxEsc(p.price ?? 0)}">${pxEsc(p.name)} (R$ ${pxMoney(p.price)})</option>
          `).join('')}
        </select>
      </label>
      <label><span>Novo valor (R$)</span>
        <input name="amount" id="px-change-plan-amount" type="number" min="0" step="0.01" required />
      </label>
      <label class="check-label">
        <input type="checkbox" name="apply_prorata" checked /> Aplicar pró-rata no período restante
      </label>
      <label class="check-label">
        <input type="checkbox" name="create_payment" checked /> Gerar lançamento financeiro do ajuste
      </label>
      <div id="px-prorata-preview" class="px-prorata-preview pdi-muted" hidden></div>
      <p id="px-change-plan-error" class="form-error" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="px-change-plan-back">Voltar</button>
        <button type="submit" class="btn btn-primary">Confirmar troca</button>
      </div>
    </form>`;
  modal.hidden = false;
  const form = box.querySelector('#px-change-plan-form');
  const planSelect = box.querySelector('#px-change-plan-select');
  const amountInput = box.querySelector('#px-change-plan-amount');
  const preview = box.querySelector('#px-prorata-preview');

  const updatePreview = () => {
    const newAmount = Number(amountInput?.value);
    if (!Number.isFinite(newAmount) || !preview) {
      if (preview) preview.hidden = true;
      return;
    }
    const total = Math.max(1, Math.round((new Date(contract.ends_on) - new Date(contract.starts_on)) / 86400000));
    const remaining = Math.max(0, Number(contract.days_left) || 0);
    const oldCredit = Math.round(((Number(contract.amount) || 0) / total) * remaining * 100) / 100;
    const newCharge = Math.round((newAmount / total) * remaining * 100) / 100;
    const adj = Math.round((newCharge - oldCredit) * 100) / 100;
    const dir = adj > 0 ? 'cobrar' : adj < 0 ? 'crédito' : 'sem ajuste';
    preview.hidden = false;
    preview.innerHTML = `Pró-rata estimado (${remaining} dias restantes): crédito atual R$ ${pxMoney(oldCredit)} · novo período R$ ${pxMoney(newCharge)} · <strong>${dir} R$ ${pxMoney(Math.abs(adj))}</strong>`;
  };

  planSelect?.addEventListener('change', () => {
    const opt = planSelect.selectedOptions[0];
    if (opt?.value && amountInput) amountInput.value = String(opt.dataset.price || '');
    updatePreview();
  });
  amountInput?.addEventListener('input', updatePreview);
  box.querySelector('#px-change-plan-back')?.addEventListener('click', () => openPxContractForm(contract));
  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = document.getElementById('px-change-plan-error');
    const submitBtn = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.plan_id) {
      if (err) { err.textContent = 'Selecione o novo plano.'; err.hidden = false; }
      return;
    }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Aplicando…'; }
    if (err) err.hidden = true;
    try {
      const res = await pxApi(`/contracts/${contract.id}/change-plan`, {
        method: 'POST',
        body: JSON.stringify({
          plan_id: Number(data.plan_id),
          amount: Number(data.amount),
          apply_prorata: Boolean(form.apply_prorata?.checked),
          create_payment: Boolean(form.create_payment?.checked),
        }),
      });
      await loadPxContracts();
      const updated = pxState.contracts.find((c) => String(c.id) === String(contract.id));
      openPxContractForm(updated || res.contract);
    } catch (error) {
      if (err) { err.textContent = error.message || 'Falha ao trocar plano.'; err.hidden = false; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Confirmar troca'; }
    }
  });
}

async function openPxNotifyContract(id) {
  const contract = pxState.contracts.find((c) => String(c.id) === String(id));
  const modal = document.getElementById('px-modal');
  const box = document.getElementById('px-modal-body');
  if (!modal || !box) return;
  box.innerHTML = '<p class="dash-loading">Carregando avisos…</p>';
  modal.hidden = false;
  try {
    const links = await pxApi(`/contracts/${id}/notify`);
    box.innerHTML = `
      <h3 id="px-modal-title">Avisar vencimento</h3>
      <div class="pdi-form">
        <p class="pdi-muted">${pxEsc(links.partner_name)} · fim ${pxEsc(String(links.ends_on || '').slice(0, 10))} · ${pxEsc(pxDaysLeftLabel(links.days_left, contract?.status))}</p>
        <label><span>Mensagem</span>
          <textarea id="px-notify-message" rows="5" readonly>${pxEsc(links.message || '')}</textarea>
        </label>
        <div class="pdi-toolbar">
          ${links.whatsapp_url
            ? `<a class="btn btn-sm btn-secondary" href="${pxEsc(links.whatsapp_url)}" target="_blank" rel="noopener">Abrir WhatsApp</a>`
            : '<span class="pdi-muted">WhatsApp não cadastrado no parceiro</span>'}
          ${links.email_url
            ? `<a class="btn btn-sm btn-secondary" href="${pxEsc(links.email_url)}">Abrir e-mail</a>`
            : '<span class="pdi-muted">E-mail não cadastrado no parceiro</span>'}
          <button type="button" class="btn btn-sm btn-ghost" id="px-notify-copy">Copiar mensagem</button>
        </div>
        <p class="pdi-muted">O job diário também registra avisos automáticos nos dias de alerta (30/15/7).</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="px-notify-dismiss">Fechar</button>
          ${contract ? `<button type="button" class="btn btn-secondary" id="px-notify-back">Voltar ao contrato</button>` : ''}
        </div>
      </div>`;
    box.querySelector('#px-notify-dismiss')?.addEventListener('click', () => { modal.hidden = true; });
    box.querySelector('#px-notify-back')?.addEventListener('click', () => openPxContractForm(contract));
    box.querySelector('#px-notify-copy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(links.message || '');
        alert('Mensagem copiada.');
      } catch {
        alert('Não foi possível copiar.');
      }
    });
  } catch (error) {
    box.innerHTML = `
      <h3>Avisar vencimento</h3>
      <p class="form-error">${pxEsc(error.message || 'Falha ao carregar.')}</p>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" id="px-notify-dismiss">Fechar</button></div>`;
    box.querySelector('#px-notify-dismiss')?.addEventListener('click', () => { modal.hidden = true; });
  }
}

function openPxRenewContract(id) {
  const contract = pxState.contracts.find((c) => String(c.id) === String(id));
  if (!contract || contract.status === 'cancelado') return;
  const modal = document.getElementById('px-modal');
  const box = document.getElementById('px-modal-body');
  if (!modal || !box) return;
  const today = new Date().toISOString().slice(0, 10);
  const oldEnd = pxDateInput(contract.ends_on, today);
  const starts = oldEnd >= today ? pxAddDays(oldEnd, 1) : today;
  const ends = pxAddMonths(starts, 12);
  box.innerHTML = `
    <h3 id="px-modal-title">Renovar contrato</h3>
    <form id="px-renew-form" class="pdi-form">
      <p class="pdi-muted">${pxEsc(contract.partner_name)} · ${pxEsc(contract.plan_name || 'Sem plano')} · R$ ${pxMoney(contract.amount)}</p>
      <div class="field-row">
        <label><span>Novo início</span><input name="starts_on" type="date" required value="${pxEsc(starts)}" /></label>
        <label><span>Novo fim</span><input name="ends_on" type="date" required value="${pxEsc(ends)}" /></label>
      </div>
      <div class="field-row">
        <label><span>Meses (atalho)</span>
          <select id="px-renew-months">
            <option value="6">6 meses</option>
            <option value="12" selected>12 meses</option>
            <option value="24">24 meses</option>
          </select>
        </label>
        <label><span>Valor (R$)</span><input name="amount" type="number" min="0" step="0.01" required value="${pxEsc(Number(contract.amount))}" /></label>
      </div>
      <label class="check-label">
        <input type="checkbox" name="cancel_previous" checked /> Cancelar o contrato atual após renovar
      </label>
      <label class="check-label">
        <input type="checkbox" name="create_payment" checked /> Gerar cobrança da renovação
      </label>
      <label id="px-renew-due-wrap"><span>Vencimento da cobrança</span>
        <input name="payment_due_on" type="date" value="${pxEsc(starts)}" />
      </label>
      <p id="px-renew-error" class="form-error" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="px-renew-dismiss">Fechar</button>
        <button type="submit" class="btn btn-primary">Renovar</button>
      </div>
    </form>`;
  modal.hidden = false;
  const form = box.querySelector('#px-renew-form');
  box.querySelector('#px-renew-dismiss')?.addEventListener('click', () => { modal.hidden = true; });
  const monthsSelect = box.querySelector('#px-renew-months');
  monthsSelect?.addEventListener('change', () => {
    const startInput = form.starts_on;
    const endInput = form.ends_on;
    if (!startInput?.value || !endInput) return;
    endInput.value = pxAddMonths(startInput.value, Number(monthsSelect.value) || 12);
  });
  const createPay = form?.create_payment;
  const dueWrap = box.querySelector('#px-renew-due-wrap');
  createPay?.addEventListener('change', () => {
    if (dueWrap) dueWrap.hidden = !createPay.checked;
  });
  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = document.getElementById('px-renew-error');
    const submitBtn = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    if (data.ends_on < data.starts_on) {
      if (err) { err.textContent = 'A data final não pode ser anterior à data inicial.'; err.hidden = false; }
      return;
    }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Renovando…'; }
    if (err) err.hidden = true;
    try {
      const res = await pxApi('/contracts', {
        method: 'POST',
        body: JSON.stringify({
          partner_id: contract.partner_id,
          plan_id: contract.plan_id,
          amount: Number(data.amount),
          starts_on: data.starts_on,
          ends_on: data.ends_on,
          payment_method: contract.payment_method || '',
          notes: `Renovação do contrato #${contract.id}${contract.notes ? ` — ${contract.notes}` : ''}`,
        }),
      });
      if (!res?.contract) throw new Error('Falha ao criar renovação.');
      if (form.cancel_previous?.checked) {
        await pxApi(`/contracts/${contract.id}`, {
          method: 'PATCH',
          body: JSON.stringify(pxContractPayload(contract, { status: 'cancelado' })),
        });
      }
      if (form.create_payment?.checked) {
        await pxApi('/payments', {
          method: 'POST',
          body: JSON.stringify({
            contract_id: res.contract.id,
            partner_id: contract.partner_id,
            contracted_amount: Number(data.amount),
            received_amount: 0,
            due_on: data.payment_due_on || data.starts_on,
            notes: `Cobrança da renovação #${res.contract.id}`,
          }),
        });
      }
      modal.hidden = true;
      await loadPxContracts();
    } catch (error) {
      if (err) { err.textContent = error.message || 'Falha ao renovar.'; err.hidden = false; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Renovar'; }
    }
  });
}

async function cancelPxContract(id) {
  const contract = pxState.contracts.find((c) => String(c.id) === String(id));
  if (!contract) return;
  if (!window.confirm(`Cancelar o contrato de ${contract.partner_name}?`)) return;
  const pausePartner = window.confirm('Também pausar a exposição do parceiro na Home / status público?');
  try {
    await pxApi(`/contracts/${contract.id}`, {
      method: 'PATCH',
      body: JSON.stringify(pxContractPayload(contract, {
        status: 'cancelado',
        pause_partner: pausePartner,
      })),
    });
    await loadPxContracts();
  } catch (error) {
    window.alert(error.message || 'Não foi possível cancelar o contrato.');
  }
}

async function loadPxFinance() {
  const el = document.getElementById('px-content');
  if (!el) return;
  el.innerHTML = '<p class="dash-loading">Carregando financeiro…</p>';
  try {
    if (!pxState.financeFilters) pxState.financeFilters = { partner_id: '', q: '' };
    const f = pxState.financeFilters;
    const qs = new URLSearchParams();
    if (f.partner_id) qs.set('partner_id', f.partner_id);
    const data = await pxApi(`/payments${qs.toString() ? `?${qs}` : ''}`);
    let payments = data.payments || [];
    pxState.payments = payments;
    const q = String(f.q || '').trim().toLowerCase();
    if (q) {
      payments = payments.filter((p) => (
        String(p.partner_name || '').toLowerCase().includes(q)
        || String(p.notes || '').toLowerCase().includes(q)
      ));
    }
    const partnerName = f.partner_id
      ? (payments[0]?.partner_name || pxState.partners.find((p) => String(p.id) === String(f.partner_id))?.name || 'Parceiro')
      : null;
    const received = payments.filter((p) => p.status !== 'cancelado').reduce((s, p) => s + (Number(p.received_amount) || 0), 0);
    const contracted = payments.filter((p) => p.status !== 'cancelado').reduce((s, p) => s + (Number(p.contracted_amount) || 0), 0);
    const pending = payments.filter((p) => p.status !== 'cancelado').reduce((s, p) => s + (Number(p.pending_amount) || Math.max((Number(p.contracted_amount) || 0) - (Number(p.received_amount) || 0), 0)), 0);

    el.innerHTML = `
      <div class="pdi-toolbar">
        <button type="button" class="btn btn-primary btn-sm" id="px-new-payment">+ Lançamento</button>
        ${f.partner_id ? `<button type="button" class="btn btn-ghost btn-sm" id="px-finance-clear">Limpar filtro de parceiro</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" id="px-finance-to-contracts">Ir para Contratos</button>
      </div>
      ${partnerName ? `<p class="pdi-muted">Filtrado por: <strong>${pxEsc(partnerName)}</strong></p>` : ''}
      <div class="pdi-stats">
        <article class="pdi-stat"><span class="pdi-stat__val">R$ ${pxMoney(contracted)}</span><span class="pdi-stat__lbl">Contratado</span></article>
        <article class="pdi-stat"><span class="pdi-stat__val">R$ ${pxMoney(received)}</span><span class="pdi-stat__lbl">Recebido</span></article>
        <article class="pdi-stat pdi-stat--warn"><span class="pdi-stat__val">R$ ${pxMoney(pending)}</span><span class="pdi-stat__lbl">Pendente</span></article>
        <article class="pdi-stat"><span class="pdi-stat__val">${payments.length}</span><span class="pdi-stat__lbl">Lançamentos</span></article>
      </div>
      <div class="px-contract-filters card">
        <label class="px-filter-field">
          <span>Buscar</span>
          <input type="search" id="px-finance-q" value="${pxEsc(f.q)}" placeholder="Parceiro ou nota…" />
        </label>
      </div>
      <div class="card pdi-table-wrap">
        <h3>Financeiro</h3>
        <table class="data-table pdi-table">
          <thead><tr>
            <th>Parceiro</th><th>Contratado</th><th>Recebido</th><th>Pendente</th><th>Vencimento</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${payments.map((p) => `
            <tr class="${p.status === 'atrasado' ? 'pdi-row--alert' : ''}">
              <td><strong>${pxEsc(p.partner_name || '—')}</strong></td>
              <td>R$ ${pxMoney(p.contracted_amount)}</td>
              <td>R$ ${pxMoney(p.received_amount)}</td>
              <td>R$ ${pxMoney(p.pending_amount)}</td>
              <td>${pxEsc(String(p.due_on || '—').slice(0, 10))}</td>
              <td>${pxBadge(p.status)}</td>
              <td class="pdi-actions">
                <button type="button" class="btn btn-sm btn-secondary" data-px-edit-payment="${p.id}">Editar</button>
              </td>
            </tr>
          `).join('') || '<tr><td colspan="7" class="empty-msg">Nenhum lançamento.</td></tr>'}
          </tbody>
        </table>
      </div>`;

    el.querySelector('#px-new-payment')?.addEventListener('click', () => {
      openPxPaymentForm({
        partner_id: f.partner_id || '',
        contracted_amount: 0,
        received_amount: 0,
        due_on: new Date().toISOString().slice(0, 10),
      });
    });
    el.querySelector('#px-finance-clear')?.addEventListener('click', () => {
      pxState.financeFilters = { partner_id: '', q: '' };
      loadPxFinance();
    });
    el.querySelector('#px-finance-to-contracts')?.addEventListener('click', () => switchPxView('contracts'));
    el.querySelector('#px-finance-q')?.addEventListener('change', (ev) => {
      pxState.financeFilters.q = ev.target.value || '';
      loadPxFinance();
    });
    el.querySelectorAll('[data-px-edit-payment]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const payment = pxState.payments.find((p) => String(p.id) === String(btn.dataset.pxEditPayment));
        if (payment) openPxPaymentForm(payment);
      });
    });
  } catch (err) {
    el.innerHTML = `<p class="section-error">${pxEsc(err.message)}</p>`;
  }
}

async function loadPxUsers() {
  const el = document.getElementById('px-content');
  if (!el) return;
  if (pxState.role !== 'super_admin') {
    el.innerHTML = '<p class="section-error">Somente super admin gerencia usuários.</p>';
    return;
  }
  const q = (pxState.userQ || '').trim().toLowerCase();
  el.innerHTML = '<p class="empty-msg">Carregando usuários…</p>';
  try {
    const [data, partners] = await Promise.all([
      pxApi('/users'),
      pxApi('/partners?limit=200'),
    ]);
    pxState.users = data.users || [];
    const partnerName = new Map((partners.partners || []).map((p) => [Number(p.id), p.name]));
    const rows = pxState.users.filter((u) => {
      if (!q) return true;
      return `${u.email} ${u.name || ''} ${u.role}`.toLowerCase().includes(q);
    });
    el.innerHTML = `
      <div class="pdi-toolbar">
        <input type="search" id="px-user-q" placeholder="Buscar e-mail ou nome" value="${pxEsc(pxState.userQ || '')}">
        <button type="button" class="btn btn-primary btn-sm" id="px-user-new">Novo usuário</button>
      </div>
      <div class="px-role-preview">
        ${Object.entries(PX_ROLE_CAN).map(([role, text]) => `
          <p><strong>${pxEsc(PX_ROLE_LABEL[role] || role)}.</strong> ${pxEsc(text)}</p>`).join('')}
      </div>
      <div class="card pdi-table-wrap"><table class="data-table pdi-table"><thead><tr>
        <th>E-mail</th><th>Nome</th><th>Perfil</th><th>Parceiro</th><th></th>
      </tr></thead><tbody>
          ${rows.map((u) => `<tr data-px-user-row data-search="${pxEsc(`${u.email} ${u.name || ''} ${u.role}`.toLowerCase())}">
          <td>${pxEsc(u.email)}</td>
          <td>${pxEsc(u.name || '—')}</td>
          <td>${pxEsc(PX_ROLE_LABEL[u.role] || u.role)}</td>
          <td>${pxEsc(partnerName.get(Number(u.partner_id)) || (u.partner_id ? `#${u.partner_id}` : '—'))}</td>
          <td class="admin-row-actions">
            <button type="button" class="btn btn-sm btn-secondary" data-px-user-edit="${u.id}">Editar</button>
            ${u.role === 'parceiro' && u.partner_id ? `<button type="button" class="btn btn-sm btn-secondary" data-px-user-portal="${u.partner_id}">Abrir portal</button>` : ''}
            ${Number(u.id) === Number(pxState.userId) ? '' : `<button type="button" class="btn btn-sm btn-danger" data-px-user-off="${u.id}">Desativar</button>`}
          </td>
        </tr>`).join('') || '<tr><td colspan="5" class="empty-msg">Nenhum usuário.</td></tr>'}
      </tbody></table></div>`;
    el.querySelector('#px-user-q')?.addEventListener('input', (e) => {
      pxState.userQ = e.target.value;
      const needle = pxState.userQ.trim().toLowerCase();
      el.querySelectorAll('[data-px-user-row]').forEach((row) => {
        row.hidden = needle ? !row.dataset.search.includes(needle) : false;
      });
    });
    el.querySelector('#px-user-new')?.addEventListener('click', () => openPxUserForm(null, partners.partners || []));
    el.querySelectorAll('[data-px-user-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const user = pxState.users.find((u) => String(u.id) === btn.dataset.pxUserEdit);
        openPxUserForm(user, partners.partners || []);
      });
    });
    el.querySelectorAll('[data-px-user-portal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sessionStorage.setItem('pxPortalAs', btn.dataset.pxUserPortal);
        window.open('/partner', '_blank', 'noopener');
      });
    });
    el.querySelectorAll('[data-px-user-off]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Desativar este usuário? O login deixa de funcionar.')) return;
        try {
          await pxApi(`/users/${btn.dataset.pxUserOff}`, { method: 'DELETE' });
          loadPxUsers();
        } catch (err) { alert(err.message); }
      });
    });
  } catch (err) {
    el.innerHTML = `<p class="section-error">${pxEsc(err.message)}</p>`;
  }
}

function openPxUserForm(user, partners) {
  const modal = document.getElementById('px-modal');
  const box = document.getElementById('px-modal-body');
  if (!modal || !box) return;
  const isEdit = Boolean(user);
  box.innerHTML = `
    <h3 id="px-modal-title">${isEdit ? 'Editar usuário' : 'Novo usuário'}</h3>
    <form id="px-user-form" class="pdi-form">
      ${isEdit ? `<p class="dash-sub">${pxEsc(user.email)}</p>` : `
        <label><span>E-mail</span><input type="email" name="email" required></label>`}
      <label><span>Nome</span><input name="name" value="${pxEsc(user?.name || '')}"></label>
      <label><span>Senha ${isEdit ? '(em branco mantém a atual)' : ''}</span>
        <input type="password" name="password" minlength="8" ${isEdit ? '' : 'required'} autocomplete="new-password"></label>
      <label><span>Perfil</span>
        <select name="role" id="px-user-role">
          ${['super_admin', 'admin_antonov', 'marketing', 'financeiro', 'parceiro'].map((r) => `
            <option value="${r}" ${user?.role === r ? 'selected' : ''}>${pxEsc(PX_ROLE_LABEL[r])}</option>`).join('')}
        </select>
      </label>
      <p class="dash-sub" id="px-user-role-hint"></p>
      <label><span>Parceiro vinculado</span>
        <select name="partner_id" id="px-user-partner">
          <option value="">Nenhum</option>
          ${partners.map((p) => `<option value="${p.id}" ${Number(user?.partner_id) === Number(p.id) ? 'selected' : ''}>${pxEsc(p.name)}</option>`).join('')}
        </select>
      </label>
      <p class="form-error" id="px-user-error" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="px-user-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>`;
  modal.hidden = false;
  box.querySelector('#px-user-cancel')?.addEventListener('click', () => { modal.hidden = true; });
  const form = document.getElementById('px-user-form');
  const roleEl = document.getElementById('px-user-role');
  const hint = document.getElementById('px-user-role-hint');
  const partnerEl = document.getElementById('px-user-partner');
  const syncRole = () => {
    const role = roleEl.value;
    hint.textContent = PX_ROLE_CAN[role] || '';
    partnerEl.required = role === 'parceiro';
  };
  roleEl.addEventListener('change', syncRole);
  syncRole();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const errEl = document.getElementById('px-user-error');
    const payload = {
      name: fd.get('name'),
      role: fd.get('role'),
      partner_id: fd.get('partner_id') || null,
    };
    if (!isEdit) payload.email = fd.get('email');
    const password = String(fd.get('password') || '');
    if (password) payload.password = password;
    if (!isEdit && !password) payload.password = '';
    try {
      await pxApi(isEdit ? `/users/${user.id}` : '/users', {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      modal.hidden = true;
      loadPxUsers();
    } catch (err) {
      errEl.hidden = false;
      errEl.textContent = err.message;
    }
  });
}

async function loadPxSimpleTable(view, title, columns, fetchPath, mapRow) {
  const el = document.getElementById('px-content');
  if (!el) return;
  el.innerHTML = `<p class="dash-loading">Carregando ${pxEsc(title)}…</p>`;
  try {
    const data = await pxApi(fetchPath);
    const key = Object.keys(data).find((k) => Array.isArray(data[k]));
    const rows = key ? data[key] : [];
    el.innerHTML = `
      <div class="card pdi-table-wrap"><h3>${pxEsc(title)}</h3>
      <table class="data-table pdi-table"><thead><tr>${columns.map((c) => `<th>${pxEsc(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(mapRow).join('') || `<tr><td colspan="${columns.length}" class="empty-msg">Sem registros.</td></tr>`}</tbody></table></div>`;
  } catch (err) {
    el.innerHTML = `<p class="section-error">${pxEsc(err.message)}</p>`;
  }
}

function renderPxShell() {
  const host = document.getElementById('tab-parceiros');
  if (!host || host.dataset.ready) return;
  host.dataset.ready = '1';
  host.innerHTML = `
    <header class="dash-head">
      <div class="dash-head__main">
        <p class="dash-kicker">Ecossistema</p>
        <h2 tabindex="-1" id="tab-heading-parceiros">Parceiros Antonov</h2>
        <p class="dash-sub">Gestão comercial, exposição e analytics</p>
      </div>
      <div class="dash-toolbar">
        <div class="pdi-subtabs" id="px-subtabs" role="tablist">
          ${[
            ['dashboard', 'Painel'],
            ['partners', 'Parceiros'],
            ['categories', 'Categorias'],
            ['plans', 'Planos'],
            ['contracts', 'Contratos'],
            ['placements', 'Publicidade'],
            ['campaigns', 'Campanhas'],
            ['analytics', 'Analytics'],
            ['finance', 'Financeiro'],
            ['users', 'Usuários'],
          ].filter(([v]) => v !== 'users' || pxState.role === 'super_admin').map(([v, label]) => `
            <button type="button" class="btn btn-sm btn-secondary${v === pxState.view ? ' active' : ''}" data-px-view="${v}">${label}</button>`).join('')}
        </div>
        <button type="button" id="px-refresh" class="btn btn-secondary btn-sm">Atualizar</button>
      </div>
    </header>
    <div id="px-content"></div>`;
  host.querySelector('#px-subtabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-px-view]');
    if (!btn) return;
    pxState.view = btn.dataset.pxView;
    host.querySelectorAll('[data-px-view]').forEach((b) => b.classList.toggle('active', b === btn));
    onPxTabOpen();
  });
  host.querySelector('#px-refresh')?.addEventListener('click', onPxTabOpen);
}

async function loadPxAnalytics() {
  const el = document.getElementById('px-content');
  if (!el) return;
  const f = pxState.analyticsFilters || (pxState.analyticsFilters = { days: 30, category_id: '', plan_id: '' });
  el.innerHTML = '<p class="dash-loading">Carregando analytics…</p>';
  try {
    const params = new URLSearchParams({ days: String(f.days || 30) });
    if (f.category_id) params.set('category_id', f.category_id);
    if (f.plan_id) params.set('plan_id', f.plan_id);
    const [data, cats, plans] = await Promise.all([
      pxApi(`/analytics?${params}`),
      pxState.categories.length ? Promise.resolve({ categories: pxState.categories }) : pxApi('/categories'),
      pxState.plans.length ? Promise.resolve({ plans: pxState.plans }) : pxApi('/plans'),
    ]);
    pxState.categories = cats.categories || pxState.categories;
    pxState.plans = plans.plans || pxState.plans;
    const cur = data.current || {};
    const maxImp = Math.max(1, cur.impressions || 0);
    const steps = [
      ['Impressões', cur.impressions || 0, 100],
      ['Visitas ao perfil', cur.profile_views || 0, cur.interest_rate || 0],
      ['Cliques', cur.clicks || 0, cur.ctr || 0],
      ['Leads', cur.leads || 0, cur.lead_rate || 0],
    ];
    const channels = data.channels || {};
    const ranking = data.ranking || [];
    el.innerHTML = `
      <div class="pdi-toolbar">
        ${[7, 30, 90].map((d) => `
          <button type="button" class="btn btn-sm ${Number(f.days) === d ? 'btn-primary' : 'btn-secondary'}" data-px-an-days="${d}">${d} dias</button>`).join('')}
        <select id="px-an-cat">
          <option value="">Todas as categorias</option>
          ${(pxState.categories || []).map((c) => `<option value="${c.id}"${String(f.category_id) === String(c.id) ? ' selected' : ''}>${pxEsc(c.name)}</option>`).join('')}
        </select>
        <select id="px-an-plan">
          <option value="">Todos os planos</option>
          ${(pxState.plans || []).map((p) => `<option value="${p.id}"${String(f.plan_id) === String(p.id) ? ' selected' : ''}>${pxEsc(p.name)}</option>`).join('')}
        </select>
        <span class="pdi-muted">${pxEsc(data.period?.label || '')}</span>
      </div>
      <div class="px-funnel">
        ${steps.map(([label, value, rate]) => `
          <div class="px-funnel__step">
            <div class="px-funnel__bar" style="width:${Math.max(8, Math.round((Number(value) / maxImp) * 100))}%"></div>
            <strong>${value}</strong>
            <span>${pxEsc(label)}</span>
            <em>${label === 'Impressões' ? '' : `${rate}%`}</em>
          </div>`).join('')}
      </div>
      <div class="pdi-stats">
        <div class="pdi-stat"><span>WhatsApp</span><strong>${channels.whatsapp || 0}</strong></div>
        <div class="pdi-stat"><span>Instagram</span><strong>${channels.instagram || 0}</strong></div>
        <div class="pdi-stat"><span>Mapa</span><strong>${channels.maps || 0}</strong></div>
        <div class="pdi-stat"><span>Site</span><strong>${channels.website || 0}</strong></div>
        <div class="pdi-stat"><span>vs período anterior</span><strong>${pxVarChip(data.variation?.leads)}</strong></div>
      </div>
      <h3 class="pdi-section-title">Ranking</h3>
      <div class="card pdi-table-wrap">
        <table class="data-table pdi-table">
          <thead><tr><th>Parceiro</th><th>Impressões</th><th>Perfil</th><th>Cliques</th><th>Leads</th><th>CTR</th></tr></thead>
          <tbody>${ranking.map((r) => `
            <tr>
              <td><button type="button" class="btn btn-sm btn-ghost" data-px-an-partner="${r.id}">${pxEsc(r.name)}</button></td>
              <td>${r.impressions}</td><td>${r.profile_views}</td><td>${r.clicks}</td><td>${r.leads}</td><td>${r.ctr}%</td>
            </tr>`).join('') || '<tr><td colspan="6" class="empty-msg">Sem eventos neste período.</td></tr>'}
          </tbody>
        </table>
      </div>`;
    const reload = (patch) => {
      Object.assign(pxState.analyticsFilters, patch);
      loadPxAnalytics();
    };
    el.querySelectorAll('[data-px-an-days]').forEach((btn) => {
      btn.addEventListener('click', () => reload({ days: Number(btn.dataset.pxAnDays) }));
    });
    el.querySelector('#px-an-cat')?.addEventListener('change', (e) => reload({ category_id: e.target.value }));
    el.querySelector('#px-an-plan')?.addEventListener('change', (e) => reload({ plan_id: e.target.value }));
    el.querySelectorAll('[data-px-an-partner]').forEach((btn) => {
      btn.addEventListener('click', () => openPxPartnerReport(btn.dataset.pxAnPartner, f.days || 30));
    });
  } catch (err) {
    el.innerHTML = `<p class="section-error">${pxEsc(err.message)}</p>`;
  }
}

async function loadPxPlacements() {
  const el = document.getElementById('px-content');
  if (!el) return;
  el.innerHTML = '<p class="dash-loading">Carregando publicidade…</p>';
  try {
    const [placements, creatives, partners] = await Promise.all([
      pxApi('/placements'),
      pxApi('/creatives'),
      pxApi('/partners?limit=100'),
    ]);
    pxState.placements = placements.placements || [];
    const creativeRows = creatives.creatives || [];
    el.innerHTML = `
      <div class="pdi-toolbar">
        <button type="button" class="btn btn-primary btn-sm" id="px-new-placement">+ Placement</button>
        <button type="button" class="btn btn-secondary btn-sm" id="px-new-creative">+ Criativo</button>
      </div>
      <h3 class="pdi-section-title">Placements</h3>
      <div class="card pdi-table-wrap">
        <table class="data-table pdi-table">
          <thead><tr><th>Código</th><th>Nome</th><th>Status</th><th></th></tr></thead>
          <tbody>${pxState.placements.map((p) => `
            <tr>
              <td>${pxEsc(p.code)}</td>
              <td>${pxEsc(p.name)}<div class="pdi-muted">${pxEsc(p.description || '')}</div></td>
              <td>${pxBadge(p.status)}</td>
              <td><button type="button" class="btn btn-sm btn-secondary" data-px-edit-placement="${p.id}">Editar</button></td>
            </tr>`).join('') || '<tr><td colspan="4" class="empty-msg">Nenhum placement.</td></tr>'}
          </tbody>
        </table>
      </div>
      <h3 class="pdi-section-title">Criativos</h3>
      <div class="card pdi-table-wrap">
        <table class="data-table pdi-table">
          <thead><tr><th>Parceiro</th><th>Tipo</th><th>Título</th><th>CTA</th><th></th></tr></thead>
          <tbody>${creativeRows.map((c) => `
            <tr>
              <td>${pxEsc(c.partner_name || '—')}</td>
              <td>${pxEsc(c.kind)}</td>
              <td>${pxEsc(c.headline || c.body || '—')}</td>
              <td>${pxEsc(c.cta_label || '—')}</td>
              <td><button type="button" class="btn btn-sm btn-secondary" data-px-edit-creative="${c.id}">Editar</button></td>
            </tr>`).join('') || '<tr><td colspan="5" class="empty-msg">Nenhum criativo.</td></tr>'}
          </tbody>
        </table>
      </div>`;
    el.querySelector('#px-new-placement')?.addEventListener('click', () => openPxPlacementForm(null));
    el.querySelector('#px-new-creative')?.addEventListener('click', () => openPxCreativeForm(null, partners.partners || []));
    el.querySelectorAll('[data-px-edit-placement]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = pxState.placements.find((p) => String(p.id) === btn.dataset.pxEditPlacement);
        openPxPlacementForm(row);
      });
    });
    el.querySelectorAll('[data-px-edit-creative]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = creativeRows.find((c) => String(c.id) === btn.dataset.pxEditCreative);
        openPxCreativeForm(row, partners.partners || []);
      });
    });
  } catch (err) {
    el.innerHTML = `<p class="section-error">${pxEsc(err.message)}</p>`;
  }
}

function openPxPlacementForm(placement) {
  const modal = document.getElementById('px-modal');
  const box = document.getElementById('px-modal-body');
  if (!modal || !box) return;
  box.innerHTML = `
    <h3 id="px-modal-title">${placement ? 'Editar placement' : 'Novo placement'}</h3>
    <form id="px-placement-form" class="pdi-form">
      <label><span>Nome</span><input name="name" required value="${pxEsc(placement?.name || '')}"></label>
      <label><span>Código</span><input name="code" required value="${pxEsc(placement?.code || '')}" placeholder="HOME_BANNER"></label>
      <label><span>Descrição</span><textarea name="description" rows="2">${pxEsc(placement?.description || '')}</textarea></label>
      <label><span>Status</span>
        <select name="status">
          <option value="ativo"${placement?.status !== 'arquivado' ? ' selected' : ''}>ativo</option>
          <option value="arquivado"${placement?.status === 'arquivado' ? ' selected' : ''}>arquivado</option>
        </select>
      </label>
      <p class="form-error" id="px-placement-error" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="px-placement-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>`;
  modal.hidden = false;
  box.querySelector('#px-placement-cancel')?.addEventListener('click', () => { modal.hidden = true; });
  box.querySelector('#px-placement-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errEl = document.getElementById('px-placement-error');
    try {
      await pxApi(placement ? `/placements/${placement.id}` : '/placements', {
        method: placement ? 'PATCH' : 'POST',
        body: JSON.stringify(Object.fromEntries(fd.entries())),
      });
      modal.hidden = true;
      loadPxPlacements();
    } catch (err) {
      errEl.hidden = false;
      errEl.textContent = err.message;
    }
  });
}

function openPxCreativeForm(creative, partners) {
  const modal = document.getElementById('px-modal');
  const box = document.getElementById('px-modal-body');
  if (!modal || !box) return;
  box.innerHTML = `
    <h3 id="px-modal-title">${creative ? 'Editar criativo' : 'Novo criativo'}</h3>
    <form id="px-creative-form" class="pdi-form">
      <label><span>Parceiro</span>
        <select name="partner_id">
          <option value="">—</option>
          ${partners.map((p) => `<option value="${p.id}"${Number(creative?.partner_id) === Number(p.id) ? ' selected' : ''}>${pxEsc(p.name)}</option>`).join('')}
        </select>
      </label>
      <label><span>Tipo</span>
        <select name="kind">
          ${['image', 'logo', 'banner', 'text'].map((k) => `<option value="${k}"${creative?.kind === k ? ' selected' : ''}>${k}</option>`).join('')}
        </select>
      </label>
      <label><span>Título</span><input name="headline" value="${pxEsc(creative?.headline || '')}"></label>
      <label><span>Texto</span><textarea name="body" rows="3">${pxEsc(creative?.body || '')}</textarea></label>
      <div class="field-row">
        <label><span>Rótulo do CTA</span><input name="cta_label" value="${pxEsc(creative?.cta_label || '')}"></label>
        <label><span>URL do CTA</span><input name="cta_url" value="${pxEsc(creative?.cta_url || '')}"></label>
      </div>
      <p class="form-error" id="px-creative-error" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="px-creative-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>`;
  modal.hidden = false;
  box.querySelector('#px-creative-cancel')?.addEventListener('click', () => { modal.hidden = true; });
  box.querySelector('#px-creative-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errEl = document.getElementById('px-creative-error');
    try {
      await pxApi(creative ? `/creatives/${creative.id}` : '/creatives', {
        method: creative ? 'PATCH' : 'POST',
        body: JSON.stringify(Object.fromEntries(fd.entries())),
      });
      modal.hidden = true;
      loadPxPlacements();
    } catch (err) {
      errEl.hidden = false;
      errEl.textContent = err.message;
    }
  });
}

async function loadPxCampaigns() {
  const el = document.getElementById('px-content');
  if (!el) return;
  const f = pxState.campaignFilters || (pxState.campaignFilters = { status: '', partner_id: '' });
  el.innerHTML = '<p class="dash-loading">Carregando campanhas…</p>';
  try {
    const params = new URLSearchParams();
    if (f.status) params.set('status', f.status);
    if (f.partner_id) params.set('partner_id', f.partner_id);
    const [data, partners, placements, creatives] = await Promise.all([
      pxApi(`/campaigns?${params}`),
      pxApi('/partners?limit=100'),
      pxApi('/placements'),
      pxApi('/creatives'),
    ]);
    const rows = data.campaigns || [];
    pxState.campaigns = rows;
    pxState.placements = placements.placements || [];
    el.innerHTML = `
      <div class="pdi-toolbar">
        <button type="button" class="btn btn-primary btn-sm" id="px-new-campaign">+ Campanha</button>
        <select id="px-camp-status">
          <option value="">Todos os status</option>
          ${['rascunho', 'agendada', 'ativa', 'pausada', 'finalizada'].map((s) => `
            <option value="${s}"${f.status === s ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
        <select id="px-camp-partner">
          <option value="">Todos os parceiros</option>
          ${(partners.partners || []).map((p) => `<option value="${p.id}"${String(f.partner_id) === String(p.id) ? ' selected' : ''}>${pxEsc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="card pdi-table-wrap">
        <table class="data-table pdi-table">
          <thead><tr><th>Nome</th><th>Parceiro</th><th>Placement</th><th>Prioridade</th><th>Período</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows.map((c) => `
            <tr>
              <td>${pxEsc(c.name)}</td>
              <td>${pxEsc(c.partner_name || '—')}</td>
              <td>${pxEsc(c.placement_code || c.placement_name || '—')}</td>
              <td>${c.priority ?? 0}</td>
              <td>${String(c.starts_on || '—').slice(0, 10)} → ${String(c.ends_on || '—').slice(0, 10)}</td>
              <td>${pxBadge(c.status)}</td>
              <td>
                <button type="button" class="btn btn-sm btn-secondary" data-px-edit-camp="${c.id}">Editar</button>
                ${c.status === 'pausada' ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-px-pause-camp="${c.id}">Pausar</button>`}
              </td>
            </tr>`).join('') || '<tr><td colspan="7" class="empty-msg">Nenhuma campanha.</td></tr>'}
          </tbody>
        </table>
      </div>`;
    const apply = (patch) => {
      Object.assign(pxState.campaignFilters, patch);
      loadPxCampaigns();
    };
    el.querySelector('#px-camp-status')?.addEventListener('change', (e) => apply({ status: e.target.value }));
    el.querySelector('#px-camp-partner')?.addEventListener('change', (e) => apply({ partner_id: e.target.value }));
    el.querySelector('#px-new-campaign')?.addEventListener('click', () => {
      openPxCampaignForm(null, partners.partners || [], pxState.placements, creatives.creatives || []);
    });
    el.querySelectorAll('[data-px-edit-camp]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = rows.find((c) => String(c.id) === btn.dataset.pxEditCamp);
        openPxCampaignForm(row, partners.partners || [], pxState.placements, creatives.creatives || []);
      });
    });
    el.querySelectorAll('[data-px-pause-camp]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = rows.find((c) => String(c.id) === btn.dataset.pxPauseCamp);
        if (!row) return;
        try {
          await pxApi(`/campaigns/${row.id}`, { method: 'PATCH', body: JSON.stringify({ ...row, status: 'pausada' }) });
          loadPxCampaigns();
        } catch (err) { alert(err.message); }
      });
    });
  } catch (err) {
    el.innerHTML = `<p class="section-error">${pxEsc(err.message)}</p>`;
  }
}

function openPxCampaignForm(campaign, partners, placements, creatives) {
  const modal = document.getElementById('px-modal');
  const box = document.getElementById('px-modal-body');
  if (!modal || !box) return;
  const dateVal = (v) => (v ? String(v).slice(0, 10) : '');
  box.innerHTML = `
    <h3 id="px-modal-title">${campaign ? 'Editar campanha' : 'Nova campanha'}</h3>
    <form id="px-campaign-form" class="pdi-form">
      <label><span>Nome</span><input name="name" required value="${pxEsc(campaign?.name || '')}"></label>
      <label><span>Parceiro</span>
        <select name="partner_id">
          <option value="">—</option>
          ${partners.map((p) => `<option value="${p.id}"${Number(campaign?.partner_id) === Number(p.id) ? ' selected' : ''}>${pxEsc(p.name)}</option>`).join('')}
        </select>
      </label>
      <label><span>Placement</span>
        <select name="placement_id">
          <option value="">—</option>
          ${placements.map((p) => `<option value="${p.id}"${Number(campaign?.placement_id) === Number(p.id) ? ' selected' : ''}>${pxEsc(p.code)} · ${pxEsc(p.name)}</option>`).join('')}
        </select>
      </label>
      <label><span>Criativo</span>
        <select name="creative_id">
          <option value="">—</option>
          ${creatives.map((c) => `<option value="${c.id}"${Number(campaign?.creative_id) === Number(c.id) ? ' selected' : ''}>${pxEsc(c.headline || c.kind)} · ${pxEsc(c.partner_name || '')}</option>`).join('')}
        </select>
      </label>
      <div class="field-row">
        <label><span>Início</span><input type="date" name="starts_on" value="${dateVal(campaign?.starts_on)}"></label>
        <label><span>Fim</span><input type="date" name="ends_on" value="${dateVal(campaign?.ends_on)}"></label>
        <label><span>Prioridade</span><input type="number" name="priority" min="0" value="${campaign?.priority ?? 0}"></label>
      </div>
      <label><span>Status</span>
        <select name="status">
          ${['rascunho', 'agendada', 'ativa', 'pausada', 'finalizada'].map((s) => `
            <option value="${s}"${(campaign?.status || 'rascunho') === s ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
      </label>
      <label><span>Link</span><input name="link_url" value="${pxEsc(campaign?.link_url || '')}"></label>
      <label><span>Notas</span><textarea name="notes" rows="2">${pxEsc(campaign?.notes || '')}</textarea></label>
      <p class="form-error" id="px-campaign-error" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="px-campaign-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>`;
  modal.hidden = false;
  box.querySelector('#px-campaign-cancel')?.addEventListener('click', () => { modal.hidden = true; });
  box.querySelector('#px-campaign-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errEl = document.getElementById('px-campaign-error');
    try {
      await pxApi(campaign ? `/campaigns/${campaign.id}` : '/campaigns', {
        method: campaign ? 'PATCH' : 'POST',
        body: JSON.stringify(Object.fromEntries(fd.entries())),
      });
      modal.hidden = true;
      loadPxCampaigns();
    } catch (err) {
      errEl.hidden = false;
      errEl.textContent = err.message;
    }
  });
}

function onPxTabOpen() {
  renderPxShell();
  if (pxState.view === 'dashboard') return loadPxDashboard();
  if (pxState.view === 'partners') return loadPxPartners();
  if (pxState.view === 'categories') {
    return loadPxCategories();
  }
  if (pxState.view === 'plans') {
    return loadPxPlans();
  }
  if (pxState.view === 'contracts') {
    return loadPxContracts();
  }
  if (pxState.view === 'placements') return loadPxPlacements();
  if (pxState.view === 'campaigns') return loadPxCampaigns();
  if (pxState.view === 'analytics') return loadPxAnalytics();
  if (pxState.view === 'finance') {
    return loadPxFinance();
  }
  if (pxState.view === 'users') {
    return loadPxUsers();
  }
}

async function initParceirosAdmin() {
  try {
    const me = await api('/me');
    pxState.role = me.role || '';
    pxState.userId = me.userId ?? null;
  } catch { /* sessão já conferida pelo admin */ }
  if (pxState.view === 'users' && pxState.role !== 'super_admin') pxState.view = 'dashboard';
  renderPxShell();
  onPxTabOpen();
}
