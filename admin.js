const API = '/api/admin';
const state = {
  user: null,
  forms: [],
  dashboard: null,
  dashboardDays: 30,
  pendingReportFormId: null,
  reportPage: 1,
  editingFormId: null,
  editingFormSlug: null,
  editingFormName: null,
  editorFields: [],
  editingFieldId: null,
  previewFields: [],
};

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro na requisição');
    return data;
  }
  if (!res.ok) throw new Error('Erro na requisição');
  return res;
}

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return [...document.querySelectorAll(sel)]; }

function bind(sel, event, fn) {
  const el = document.querySelector(sel);
  if (!el) return;
  el.addEventListener(event, fn);
}

function showError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.removeAttribute('hidden');
}

function hideError(el) {
  if (!el) return;
  el.textContent = '';
  el.setAttribute('hidden', '');
}

function showFieldSaveNotice(message) {
  const el = $('#field-save-notice');
  if (!el) return;
  el.textContent = message;
  el.removeAttribute('hidden');
  clearTimeout(showFieldSaveNotice._t);
  showFieldSaveNotice._t = setTimeout(() => el.setAttribute('hidden', ''), 3000);
}

function showLogin() {
  const login = $('#login-view');
  const panel = $('#panel-view');
  if (login) login.removeAttribute('hidden');
  if (panel) panel.setAttribute('hidden', '');
}

function showPanel(email) {
  const login = $('#login-view');
  const panel = $('#panel-view');
  if (login) login.setAttribute('hidden', '');
  if (panel) panel.removeAttribute('hidden');
  const userEl = $('#user-email');
  if (userEl) userEl.textContent = email;
}

function switchTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'dashboard') loadDashboard();
  if (name === 'reports') initReports();
  if (name === 'forms') loadForms();
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Bahia' });
}

function dateInput(d) {
  return d.toISOString().slice(0, 10);
}

function defaultReportRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: dateInput(from), to: dateInput(to) };
}

/* ---- Auth ---- */
async function checkSession() {
  try {
    const data = await api('/me');
    state.user = data;
    showPanel(data.email);
    switchTab('dashboard');
  } catch {
    showLogin();
  }
}

function initAdmin() {
  bind('#login-form', 'submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const errEl = $('#login-error');
    const btn = form.querySelector('[type="submit"]');
    hideError(errEl);

    const email = form.querySelector('[name="email"]')?.value?.trim() || '';
    const password = form.querySelector('[name="password"]')?.value || '';

    if (!email || !password) {
      showError(errEl, 'Preencha e-mail e senha.');
      return;
    }

    const prevLabel = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Entrando…';
    }

    try {
      const data = await api('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      state.user = data;
      showPanel(data.email);
      switchTab('dashboard');
    } catch (err) {
      showError(errEl, err.message || 'Não foi possível entrar.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevLabel || 'Entrar';
      }
    }
  });

  bind('#logout-btn', 'click', async () => {
    try { await api('/logout', { method: 'POST' }); } catch { /* ignore */ }
    state.user = null;
    showLogin();
  });

  $$('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  bind('#dash-period', 'click', (e) => {
    const btn = e.target.closest('[data-days]');
    if (!btn) return;
    state.dashboardDays = Number(btn.dataset.days);
    $$('#dash-period [data-days]').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
    loadDashboard();
  });

  bind('#dash-view-reports', 'click', () => switchTab('reports'));

  bind('#report-filter-btn', 'click', () => loadReport(1));
  bind('#export-xlsx', 'click', () => exportReport('xlsx'));
  bind('#export-pdf', 'click', () => exportReport('pdf'));
  bind('#editor-close', 'click', () => {
    const editor = $('#form-editor');
    if (editor) editor.setAttribute('hidden', '');
    state.editingFormId = null;
    state.editingFormSlug = null;
    state.editingFormName = null;
  });
  bind('#preview-form-btn', 'click', openFormPreview);
  bind('#preview-close', 'click', closeFormPreview);
  bind('#preview-save', 'click', savePreviewLayout);
  bind('#form-preview .form-preview-backdrop', 'click', closeFormPreview);
  bind('select[name="field_type"]', 'change', (e) => {
    const wrap = $('#options-wrap');
    const phWrap = $('#placeholder-wrap');
    const type = e.target.value;
    if (wrap) {
      if (type === 'select' || type === 'checkbox') wrap.removeAttribute('hidden');
      else wrap.setAttribute('hidden', '');
    }
    if (phWrap) {
      if (type === 'checkbox') phWrap.setAttribute('hidden', '');
      else phWrap.removeAttribute('hidden');
    }
    updateCondUi();
  });
  bind('select[name="cond_field"]', 'change', () => updateCondUi());
  bind('select[name="cond_operator"]', 'change', () => updateCondUi());
  bind('#cancel-field-edit', 'click', () => resetFieldForm());
  bind('#add-field-form', 'submit', onAddField);
  bind('#form-meta-form', 'submit', onFormMetaSubmit);
  bind('#new-form-btn', 'click', () => {
    const modal = $('#modal');
    if (modal) modal.removeAttribute('hidden');
    const title = $('#modal-title');
    if (title) title.textContent = 'Novo formulário';
    $('#modal-form')?.reset();
    hideError($('#modal-error'));
  });
  bind('#modal-cancel', 'click', () => $('#modal')?.setAttribute('hidden', ''));
  bind('.modal-backdrop', 'click', () => $('#modal')?.setAttribute('hidden', ''));
  bind('#modal-form', 'submit', onModalSubmit);

  checkSession();
}

/* ---- Dashboard ---- */
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatChartDay(day) {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Bahia' });
}

function formatChartDayShort(day) {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Bahia' });
}

function formatChartDayFull(day) {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bahia',
  });
}

function chartLabelStep(length) {
  if (length <= 10) return 1;
  if (length <= 31) return Math.max(1, Math.ceil(length / 7));
  return Math.max(1, Math.ceil(length / 6));
}

function chartSummaryHtml({ total, avg, peak }) {
  const peakTxt = peak?.count > 0
    ? `${peak.count} · ${formatChartDayShort(peak.day)}`
    : '—';

  return `
    <div class="chart-summary__item">
      <span class="chart-summary__lbl">Total</span>
      <strong class="chart-summary__val">${total}</strong>
    </div>
    <div class="chart-summary__item">
      <span class="chart-summary__lbl">Média/dia</span>
      <strong class="chart-summary__val">${avg}</strong>
    </div>
    <div class="chart-summary__item">
      <span class="chart-summary__lbl">Pico</span>
      <strong class="chart-summary__val">${peakTxt}</strong>
    </div>
  `;
}

function renderChartEmpty(kind) {
  if (kind === 'zero') {
    return `
      <div class="chart-empty">
        <div class="chart-empty__icon" aria-hidden="true">0</div>
        <p class="chart-empty__title">Nenhum lead no período</p>
        <p class="chart-empty__text">Quando houver respostas nos formulários, o gráfico será preenchido dia a dia.</p>
      </div>
    `;
  }

  return `
    <div class="chart-empty">
      <div class="chart-empty__icon" aria-hidden="true">?</div>
      <p class="chart-empty__title">Sem dados para exibir</p>
      <p class="chart-empty__text">Não foi possível carregar o histórico do período selecionado.</p>
    </div>
  `;
}

function positionChartTooltip(btn, panel, tooltip) {
  const stage = panel?.querySelector('.chart-stage');
  if (!stage || !tooltip) return;

  const btnRect = btn.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const left = btnRect.left - stageRect.left + btnRect.width / 2;
  tooltip.style.left = `${Math.max(12, Math.min(left, stageRect.width - 12))}px`;
}

function bindChartInteractions() {
  const tooltip = $('#chart-tooltip');
  const panel = $('#chart-panel');
  const barsEl = $('#chart-bars');
  const btns = $$('#chart-bars .chart-bar-btn');
  if (!panel || !barsEl) return;

  let activeBtn = null;

  function showTip(btn) {
    if (!tooltip || !btn) return;
    activeBtn = btn;
    btns.forEach((b) => b.classList.toggle('is-active', b === btn));

    const count = Number(btn.dataset.count || 0);
    const share = Number(btn.dataset.share || 0);
    tooltip.innerHTML = `
      <span class="chart-tooltip__date">${escapeHtml(btn.dataset.label || '')}</span>
      <span class="chart-tooltip__count">${count} lead${count === 1 ? '' : 's'}</span>
      ${count > 0 ? `<span class="chart-tooltip__share">${share}% do total no período</span>` : '<span class="chart-tooltip__share">Sem leads neste dia</span>'}
    `;
    tooltip.removeAttribute('hidden');
    positionChartTooltip(btn, panel, tooltip);
  }

  function hideTip() {
    activeBtn = null;
    btns.forEach((b) => b.classList.remove('is-active'));
    tooltip?.setAttribute('hidden', '');
  }

  btns.forEach((btn) => {
    btn.addEventListener('mouseenter', () => showTip(btn));
    btn.addEventListener('focus', () => showTip(btn));
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (activeBtn === btn) hideTip();
      else showTip(btn);
    });
  });

  barsEl.addEventListener('mouseleave', hideTip);
  barsEl.addEventListener('focusout', (e) => {
    if (!barsEl.contains(e.relatedTarget)) hideTip();
  });

  window.addEventListener('resize', () => {
    if (activeBtn) positionChartTooltip(activeBtn, panel, tooltip);
  });
}

function normalizeDayKey(value) {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.slice(0, 10);
}

function mountChart(daily) {
  const barsEl = $('#chart-bars');
  const summaryEl = $('#chart-summary');
  const yAxis = $('#chart-y-axis');
  const totalEl = $('#chart-total');
  const panel = $('#chart-panel');
  const scrollEl = panel?.querySelector('.chart-scroll');
  const CHART_PLOT_H = 168;

  if (!barsEl) return;

  if (!daily?.length) {
    barsEl.innerHTML = renderChartEmpty('nodata');
    barsEl.removeAttribute('role');
    if (summaryEl) summaryEl.innerHTML = chartSummaryHtml({ total: 0, avg: 0, peak: null });
    yAxis?.setAttribute('hidden', '');
    if (barsEl) barsEl.style.minWidth = '';
    if (totalEl) totalEl.textContent = '0 leads';
    return;
  }

  daily = daily.map((d) => ({
    day: normalizeDayKey(d.day),
    count: Number(d.count) || 0,
  }));

  const total = daily.reduce((sum, d) => sum + d.count, 0);
  const max = Math.max(...daily.map((d) => d.count), 1);
  const avg = daily.length ? Math.round((total / daily.length) * 10) / 10 : 0;
  const peak = daily.reduce((best, d) => (d.count > best.count ? d : best), daily[0]);
  const step = chartLabelStep(daily.length);
  const peakDay = peak?.day;

  if (summaryEl) summaryEl.innerHTML = chartSummaryHtml({ total, avg, peak });
  if (totalEl) totalEl.textContent = `${total} lead${total === 1 ? '' : 's'}`;

  if (total === 0) {
    barsEl.innerHTML = renderChartEmpty('zero');
    barsEl.removeAttribute('role');
    yAxis?.setAttribute('hidden', '');
    if (barsEl) barsEl.style.minWidth = '';
    return;
  }

  const mid = Math.round(max / 2);
  if (yAxis) {
    yAxis.innerHTML = `<span>${max}</span><span>${mid}</span><span>0</span>`;
    yAxis.removeAttribute('hidden');
  }

  if (scrollEl && barsEl) {
    barsEl.style.minWidth = daily.length > 35 ? `${daily.length * 13}px` : '';
  }

  barsEl.setAttribute('role', 'list');
  barsEl.innerHTML = daily.map((d, i) => {
    const showLabel = i % step === 0 || i === daily.length - 1;
    const share = total > 0 ? Math.round((d.count / total) * 100) : 0;
    const isPeak = d.day === peakDay && d.count > 0;
    const fullLabel = formatChartDayFull(d.day);
    const barH = d.count > 0
      ? Math.max(4, Math.round((d.count / max) * CHART_PLOT_H))
      : 2;

    return `<div class="chart-col" role="listitem">
      <button type="button" class="chart-bar-btn${isPeak ? ' is-peak' : ''}"
        data-day="${escapeHtml(d.day)}"
        data-count="${d.count}"
        data-label="${escapeHtml(fullLabel)}"
        data-share="${share}"
        aria-label="${escapeHtml(fullLabel)}: ${d.count} lead${d.count === 1 ? '' : 's'}">
        <span class="chart-bar__val">${d.count > 0 ? d.count : ''}</span>
        <span class="chart-bar" style="height:${barH}px" aria-hidden="true"></span>
      </button>
      <span class="chart-lbl${showLabel ? '' : ' chart-lbl--ghost'}" aria-hidden="true">${showLabel ? formatChartDayShort(d.day) : ''}</span>
    </div>`;
  }).join('');

  bindChartInteractions();
}

function formatRelativeTime(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days}d`;
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'America/Bahia',
  });
}

function formatDeltaBadge(comparison) {
  const { delta, deltaPct } = comparison || {};
  if (delta === 0) {
    return '<span class="stat-delta stat-delta--neutral">= período anterior</span>';
  }
  const dir = delta > 0 ? 'up' : 'down';
  const sign = delta > 0 ? '+' : '';
  return `<span class="stat-delta stat-delta--${dir}">${sign}${deltaPct}% vs anterior</span>`;
}

function renderStatCards(data) {
  const { counts, comparison, period } = data;
  const cards = [
    {
      key: 'total',
      label: 'Total no período',
      hint: period?.label || 'Período selecionado',
      accent: 'yellow',
      value: counts.total ?? 0,
      extra: formatDeltaBadge(comparison),
    },
    {
      key: 'previous',
      label: 'Período anterior',
      hint: 'Mesmo intervalo imediatamente antes',
      accent: 'blue',
      value: comparison?.previousTotal ?? 0,
      extra: '',
    },
    {
      key: 'today',
      label: 'Hoje',
      hint: `Média ${counts.avgPerDay ?? 0}/dia no período`,
      accent: 'ink',
      value: counts.today ?? 0,
      extra: '',
    },
  ];

  return cards.map(({ label, hint, accent, value, extra }) => `
    <article class="stat-card stat-card--${accent}">
      <div class="stat-card__head">
        <span class="stat-card__dot" aria-hidden="true"></span>
        <span class="stat-card__lbl">${label}</span>
      </div>
      <div class="stat-card__num">${value}</div>
      ${extra ? `<div class="stat-card__delta">${extra}</div>` : ''}
      <p class="stat-card__hint">${hint}</p>
    </article>
  `).join('');
}

function renderTopForms(forms) {
  if (!forms.length) {
    return '<li class="empty-msg">Sem dados no período</li>';
  }

  const max = Math.max(...forms.map((f) => f.count), 1);

  return forms.map((f, i) => {
    const pct = Math.round((f.count / max) * 100);
    return `<li class="top-item">
      <div class="top-item__rank">${i + 1}</div>
      <div class="top-item__body">
        <div class="top-item__row">
          <span class="top-item__name">${escapeHtml(f.name)}</span>
          <strong class="top-item__count">${f.count}</strong>
        </div>
        <div class="top-item__bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
      </div>
    </li>`;
  }).join('');
}

function formatGaDelta(metric) {
  if (!metric || metric.deltaPct === 0) return '';
  const up = metric.deltaPct > 0;
  const cls = up ? 'ga-delta--up' : 'ga-delta--down';
  const sign = up ? '+' : '';
  return `<span class="ga-delta ${cls}">${sign}${metric.deltaPct}%</span>`;
}

function renderGaSparkShell() {
  return `
    <header class="ga-section__head">
      <h4 class="ga-section__title">Sessões por dia</h4>
      <span class="ga-section__badge" id="ga-spark-total"></span>
    </header>
    <div class="ga-spark-panel" id="ga-spark-panel">
      <div class="ga-spark-stage">
        <div class="ga-spark-y-axis" id="ga-spark-y-axis" aria-hidden="true"></div>
        <div class="ga-spark-scroll">
          <div id="ga-spark-bars" class="ga-spark-bars" aria-label="Sessões por dia"></div>
        </div>
        <div class="ga-spark-tooltip" id="ga-spark-tooltip" role="status" hidden></div>
      </div>
      <div class="ga-spark-summary" id="ga-spark-summary"></div>
    </div>
  `;
}

function renderGaSparkEmpty(kind) {
  if (kind === 'zero') {
    return `
      <div class="ga-spark-empty">
        <div class="ga-spark-empty__icon" aria-hidden="true">0</div>
        <p class="ga-spark-empty__title">Nenhuma sessão no período</p>
        <p class="ga-spark-empty__text">Quando houver tráfego no site, o gráfico será preenchido dia a dia.</p>
      </div>
    `;
  }

  return `
    <div class="ga-spark-empty">
      <div class="ga-spark-empty__icon" aria-hidden="true">?</div>
      <p class="ga-spark-empty__title">Sem dados para exibir</p>
      <p class="ga-spark-empty__text">Não foi possível carregar o histórico de sessões do período.</p>
    </div>
  `;
}

function gaSparkSummaryHtml({ total, avg, peak }) {
  const peakTxt = peak?.count > 0
    ? `${peak.count} · ${formatChartDayShort(peak.day)}`
    : '—';

  return `
    <div class="ga-spark-summary__item">
      <span class="ga-spark-summary__lbl">Total sessões</span>
      <strong class="ga-spark-summary__val">${total}</strong>
    </div>
    <div class="ga-spark-summary__item">
      <span class="ga-spark-summary__lbl">Média/dia</span>
      <strong class="ga-spark-summary__val">${avg}</strong>
    </div>
    <div class="ga-spark-summary__item">
      <span class="ga-spark-summary__lbl">Pico</span>
      <strong class="ga-spark-summary__val">${peakTxt}</strong>
    </div>
  `;
}

function positionGaSparkTooltip(btn, panel, tooltip) {
  const stage = panel?.querySelector('.ga-spark-stage');
  if (!stage || !tooltip) return;

  const btnRect = btn.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const left = btnRect.left - stageRect.left + btnRect.width / 2;
  tooltip.style.left = `${Math.max(12, Math.min(left, stageRect.width - 12))}px`;
}

function bindGaSparkInteractions() {
  const tooltip = $('#ga-spark-tooltip');
  const panel = $('#ga-spark-panel');
  const barsEl = $('#ga-spark-bars');
  const btns = $$('#ga-spark-bars .ga-spark-bar-btn');
  if (!panel || !barsEl) return;

  let activeBtn = null;

  function showTip(btn) {
    if (!tooltip || !btn) return;
    activeBtn = btn;
    btns.forEach((b) => b.classList.toggle('is-active', b === btn));

    const count = Number(btn.dataset.count || 0);
    const share = Number(btn.dataset.share || 0);
    tooltip.innerHTML = `
      <span class="ga-spark-tooltip__date">${escapeHtml(btn.dataset.label || '')}</span>
      <span class="ga-spark-tooltip__count">${count} sess${count === 1 ? 'ão' : 'ões'}</span>
      ${count > 0 ? `<span class="ga-spark-tooltip__share">${share}% do total no período</span>` : '<span class="ga-spark-tooltip__share">Sem sessões neste dia</span>'}
    `;
    tooltip.removeAttribute('hidden');
    positionGaSparkTooltip(btn, panel, tooltip);
  }

  function hideTip() {
    activeBtn = null;
    btns.forEach((b) => b.classList.remove('is-active'));
    tooltip?.setAttribute('hidden', '');
  }

  btns.forEach((btn) => {
    btn.addEventListener('mouseenter', () => showTip(btn));
    btn.addEventListener('focus', () => showTip(btn));
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (activeBtn === btn) hideTip();
      else showTip(btn);
    });
  });

  barsEl.addEventListener('mouseleave', hideTip);
  barsEl.addEventListener('focusout', (e) => {
    if (!barsEl.contains(e.relatedTarget)) hideTip();
  });

  window.addEventListener('resize', () => {
    if (activeBtn) positionGaSparkTooltip(activeBtn, panel, tooltip);
  });
}

function mountGaSparkline(daily) {
  const barsEl = $('#ga-spark-bars');
  const summaryEl = $('#ga-spark-summary');
  const yAxis = $('#ga-spark-y-axis');
  const totalEl = $('#ga-spark-total');
  const panel = $('#ga-spark-panel');
  const scrollEl = panel?.querySelector('.ga-spark-scroll');
  const GA_SPARK_PLOT_H = 120;

  if (!barsEl) return;

  if (!daily?.length) {
    barsEl.innerHTML = renderGaSparkEmpty('nodata');
    barsEl.removeAttribute('role');
    if (summaryEl) summaryEl.innerHTML = gaSparkSummaryHtml({ total: 0, avg: 0, peak: null });
    yAxis?.setAttribute('hidden', '');
    barsEl.style.minWidth = '';
    if (totalEl) totalEl.textContent = '0 sessões';
    return;
  }

  daily = daily.map((d) => ({
    day: normalizeDayKey(d.day),
    count: Number(d.count) || 0,
  }));

  const total = daily.reduce((sum, d) => sum + d.count, 0);
  const max = Math.max(...daily.map((d) => d.count), 1);
  const avg = daily.length ? Math.round((total / daily.length) * 10) / 10 : 0;
  const peak = daily.reduce((best, d) => (d.count > best.count ? d : best), daily[0]);
  const step = chartLabelStep(daily.length);
  const peakDay = peak?.day;

  if (summaryEl) summaryEl.innerHTML = gaSparkSummaryHtml({ total, avg, peak });
  if (totalEl) totalEl.textContent = `${total} sess${total === 1 ? 'ão' : 'ões'}`;

  if (total === 0) {
    barsEl.innerHTML = renderGaSparkEmpty('zero');
    barsEl.removeAttribute('role');
    yAxis?.setAttribute('hidden', '');
    barsEl.style.minWidth = '';
    return;
  }

  const mid = Math.round(max / 2);
  if (yAxis) {
    yAxis.innerHTML = `<span>${max}</span><span>${mid}</span><span>0</span>`;
    yAxis.removeAttribute('hidden');
  }

  if (scrollEl && barsEl) {
    barsEl.style.minWidth = daily.length > 35 ? `${daily.length * 11}px` : '';
  }

  barsEl.setAttribute('role', 'list');
  barsEl.innerHTML = daily.map((d, i) => {
    const showLabel = i % step === 0 || i === daily.length - 1;
    const share = total > 0 ? Math.round((d.count / total) * 100) : 0;
    const isPeak = d.day === peakDay && d.count > 0;
    const fullLabel = formatChartDayFull(d.day);
    const barH = d.count > 0
      ? Math.max(4, Math.round((d.count / max) * GA_SPARK_PLOT_H))
      : 2;

    return `<div class="ga-spark-col" role="listitem">
      <button type="button" class="ga-spark-bar-btn${isPeak ? ' is-peak' : ''}"
        data-day="${escapeHtml(d.day)}"
        data-count="${d.count}"
        data-label="${escapeHtml(fullLabel)}"
        data-share="${share}"
        aria-label="${escapeHtml(fullLabel)}: ${d.count} sess${d.count === 1 ? 'ão' : 'ões'}">
        <span class="ga-spark-bar__val">${d.count > 0 ? d.count : ''}</span>
        <span class="ga-spark-bar" style="height:${barH}px" aria-hidden="true"></span>
      </button>
      <span class="ga-spark-lbl${showLabel ? '' : ' ga-spark-lbl--ghost'}" aria-hidden="true">${showLabel ? formatChartDayShort(d.day) : ''}</span>
    </div>`;
  }).join('');

  bindGaSparkInteractions();
}

function renderGaPanel(ga4, periodLabel) {
  const panel = $('#ga-panel');
  const meta = $('#ga-period-meta');
  if (meta) meta.textContent = ga4?.configured && !ga4?.error
    ? `Tráfego no site · ${periodLabel || 'período selecionado'}`
    : 'Tráfego e conversões no site';

  if (!panel) return;

  if (!ga4) {
    panel.innerHTML = '<p class="empty-msg">Carregando métricas…</p>';
    return;
  }

  if (!ga4.configured) {
    const missing = (ga4.missingEnv || []).map(
      (k) => `<code class="ga-env-miss">${escapeHtml(k)}</code>`
    ).join(', ');
    panel.innerHTML = `
      ${missing
        ? `<p class="ga-env-alert">Variáveis ausentes no servidor: ${missing}. Configure no Vercel e faça redeploy.</p>`
        : ''}
      <p class="ga-hint">${escapeHtml(ga4.hint || '')}</p>
      <ol class="ga-setup">
        ${(ga4.setupSteps || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
      </ol>
      <div class="ga-events">
        <span class="ga-events__lbl">Eventos já tagueados no site</span>
        <div class="ga-events__tags">
          ${(ga4.trackedEvents || []).map((ev) =>
            `<span class="ga-tag" title="${escapeHtml(ev.description || '')}">${escapeHtml(ev.label || ev.key)}</span>`
          ).join('')}
        </div>
      </div>`;
    return;
  }

  if (ga4.error) {
    panel.innerHTML = `
      <p class="ga-error">${escapeHtml(ga4.error)}</p>
      <p class="ga-hint">Verifique as credenciais GA4 no Vercel e se a service account tem acesso à propriedade.</p>`;
    return;
  }

  const o = ga4.overview || {};
  panel.innerHTML = `
    <div class="ga-metrics">
      <article class="ga-metric">
        <span class="ga-metric__lbl">Usuários</span>
        <strong class="ga-metric__val">${o.activeUsers?.value ?? 0}</strong>
        ${formatGaDelta(o.activeUsers)}
      </article>
      <article class="ga-metric">
        <span class="ga-metric__lbl">Sessões</span>
        <strong class="ga-metric__val">${o.sessions?.value ?? 0}</strong>
        ${formatGaDelta(o.sessions)}
      </article>
      <article class="ga-metric">
        <span class="ga-metric__lbl">Pageviews</span>
        <strong class="ga-metric__val">${o.pageViews?.value ?? 0}</strong>
        ${formatGaDelta(o.pageViews)}
      </article>
      <article class="ga-metric ga-metric--accent">
        <span class="ga-metric__lbl">Cliques checkout</span>
        <strong class="ga-metric__val">${o.checkoutClicks ?? 0}</strong>
        <span class="ga-metric__sub">${o.conversionRate ?? 0}% das sessões</span>
      </article>
    </div>
    <div class="ga-grid">
      <section class="ga-section ga-section--chart">
        ${renderGaSparkShell()}
      </section>
      <section class="ga-section">
        <h4 class="ga-section__title">Eventos de plano</h4>
        <ul class="ga-event-list">
          ${(ga4.events || []).map((ev) => `
            <li class="ga-event-item">
              <div class="ga-event-item__body">
                <strong>${escapeHtml(ev.label || ev.key)}</strong>
                <span class="ga-event-item__key">${escapeHtml(ev.key)}</span>
              </div>
              <span class="ga-event-item__count">${ev.count ?? 0}</span>
            </li>
          `).join('')}
        </ul>
      </section>
      <section class="ga-section ga-section--wide">
        <h4 class="ga-section__title">Páginas mais visitadas</h4>
        ${(ga4.topPages || []).length
          ? `<ul class="ga-pages">${ga4.topPages.map((p) => `
              <li class="ga-page-item">
                <span class="ga-page-item__path">${escapeHtml(p.path)}</span>
                <span class="ga-page-item__stats">${p.views} views · ${p.users} usuários</span>
              </li>
            `).join('')}</ul>`
          : '<p class="empty-msg ga-empty">Sem dados de páginas</p>'}
      </section>
    </div>
    ${ga4.lookerEmbedUrl
      ? `<div class="ga-embed-wrap">
          <h4 class="ga-section__title">Relatório Looker Studio</h4>
          <iframe class="ga-embed" src="${escapeHtml(ga4.lookerEmbedUrl)}" title="Looker Studio" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        </div>`
      : ''}
    <p class="ga-hint ga-hint--foot">${escapeHtml(ga4.hint || '')}</p>`;

  mountGaSparkline(ga4.dailySessions);
}

function renderRecentList(items) {
  if (!items?.length) {
    return '<li class="empty-msg">Nenhuma resposta no período</li>';
  }

  return items.map((item) => `
    <li class="recent-item">
      <button type="button" class="recent-item__btn" data-form-id="${item.form_id || ''}">
        <span class="recent-item__main">
          <strong class="recent-item__form">${escapeHtml(item.form_name)}</strong>
          <span class="recent-item__preview">${escapeHtml(item.preview)}</span>
        </span>
        <time class="recent-item__time" datetime="${escapeHtml(item.created_at)}">${formatRelativeTime(item.created_at)}</time>
      </button>
    </li>
  `).join('');
}

function bindRecentListClicks() {
  $$('#recent-list [data-form-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.pendingReportFormId = btn.dataset.formId || null;
      switchTab('reports');
    });
  });
}

async function loadDashboard() {
  const loading = $('#dash-loading');
  const content = $('#dash-content');
  const errorEl = $('#dash-error');
  const days = state.dashboardDays || 30;

  try {
    errorEl?.setAttribute('hidden', '');
    loading?.removeAttribute('hidden');
    content?.setAttribute('hidden', '');

    const data = await api(`/dashboard?days=${days}`);
    state.dashboard = data;

    $$('#dash-period [data-days]').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.days) === data.period?.days);
    });

    const periodLabel = $('#dash-period-label');
    if (periodLabel) periodLabel.textContent = data.period?.label || 'Leads e respostas dos formulários';

    const chartMeta = $('#chart-period-meta');
    if (chartMeta) chartMeta.textContent = data.period?.label || 'Período selecionado';

    $('#stats-grid').innerHTML = renderStatCards(data);
    mountChart(data.daily);
    $('#top-forms').innerHTML = renderTopForms(data.topForms);
    $('#recent-list').innerHTML = renderRecentList(data.recent);
    bindRecentListClicks();

    if ($('#ga-link') && data.ga4?.url) $('#ga-link').href = data.ga4.url;
    renderGaPanel(data.ga4, data.period?.label);

    loading?.setAttribute('hidden', '');
    content?.removeAttribute('hidden');
  } catch (err) {
    console.error(err);
    loading?.setAttribute('hidden', '');
    content?.setAttribute('hidden', '');
    if (errorEl) {
      errorEl.textContent = err.message || 'Não foi possível carregar o dashboard.';
      errorEl.removeAttribute('hidden');
    }
  }
}

/* ---- Reports ---- */
async function initReports() {
  if (!state.forms.length) {
    try {
      const data = await api('/forms?archived=1');
      state.forms = data.forms;
    } catch { /* ignore */ }
  }

  const sel = $('#report-form');
  if (!sel.options.length) {
    sel.innerHTML = state.forms.map((f) =>
      `<option value="${f.id}">${f.name}${f.status === 'archived' ? ' (arquivado)' : ''}</option>`
    ).join('');
  }

  const range = defaultReportRange();
  if (!$('#report-from').value) $('#report-from').value = range.from;
  if (!$('#report-to').value) $('#report-to').value = range.to;

  if (state.pendingReportFormId && sel) {
    sel.value = String(state.pendingReportFormId);
    state.pendingReportFormId = null;
  }

  await loadReport(1);
}

async function loadReport(page) {
  state.reportPage = page;
  const formId = $('#report-form').value;
  if (!formId) return;

  const params = new URLSearchParams({
    from: new Date($('#report-from').value).toISOString(),
    to: new Date($('#report-to').value + 'T23:59:59').toISOString(),
    page: String(page),
    limit: '25',
  });
  const search = $('#report-search').value.trim();
  if (search) params.set('search', search);

  try {
    const data = await api(`/forms/${formId}/submissions?${params}`);
    renderReportTable(data);
  } catch (err) {
    alert(err.message);
  }
}

function formatSubmissionValue(v) {
  if (Array.isArray(v)) return v.map(formatSubmissionValue).filter(Boolean).join(', ');
  if (v === true) return 'Sim';
  if (v === false) return 'Não';
  if (v == null) return '';
  const s = String(v).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return '';
  return s;
}

function fieldUsesOptions(type) {
  return type === 'select' || type === 'checkbox';
}

function readOptionsFromForm(form, fieldType) {
  if (!fieldUsesOptions(fieldType)) return null;
  const raw = form.querySelector('[name=options]')?.value;
  if (!raw) return null;
  const list = String(raw).split('\n').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : null;
}

function renderReportTable(data) {
  const thead = $('#report-table thead');
  const tbody = $('#report-table tbody');
  const cols = ['ID', 'Data', ...data.columns.map((c) => data.labels[c] || c)];

  thead.innerHTML = `<tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>`;

  if (!data.submissions.length) {
    tbody.innerHTML = `<tr><td colspan="${cols.length}" class="empty-msg">Nenhuma resposta</td></tr>`;
  } else {
    tbody.innerHTML = data.submissions.map((s) => {
      const cells = [
        s.id,
        formatDate(s.created_at),
        ...data.columns.map((c) => formatSubmissionValue(s.payload[c])),
      ];
      return `<tr>${cells.map((c) => `<td>${escapeHtml(String(c))}</td>`).join('')}</tr>`;
    }).join('');
  }

  const pg = data.pagination;
  $('#report-pagination').innerHTML = `
    <span>${pg.total} registro(s)</span>
    ${pg.page > 1 ? `<button type="button" class="btn btn-sm btn-secondary" data-page="${pg.page - 1}">← Anterior</button>` : ''}
    <span>Página ${pg.page} de ${pg.pages}</span>
    ${pg.page < pg.pages ? `<button type="button" class="btn btn-sm btn-secondary" data-page="${pg.page + 1}">Próxima →</button>` : ''}
  `;

  $$('#report-pagination [data-page]').forEach((btn) => {
    btn.addEventListener('click', () => loadReport(Number(btn.dataset.page)));
  });
}

async function exportReport(format) {
  const formId = $('#report-form').value;
  if (!formId) return;
  const params = new URLSearchParams({
    format,
    from: new Date($('#report-from').value).toISOString(),
    to: new Date($('#report-to').value + 'T23:59:59').toISOString(),
  });
  const search = $('#report-search').value.trim();
  if (search) params.set('search', search);

  try {
    const res = await fetch(`${API}/forms/${formId}/export?${params}`, { credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao exportar');
    }
    const blob = await res.blob();
    const ext = format === 'pdf' ? 'pdf' : 'xlsx';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-${formId}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert(err.message);
  }
}

/* ---- Forms ---- */
async function loadForms() {
  try {
    const data = await api('/forms?archived=1');
    state.forms = data.forms;
    renderFormsList();
  } catch (err) {
    console.error(err);
  }
}

function renderFormsList() {
  const el = $('#forms-list');
  if (!state.forms.length) {
    el.innerHTML = '<p class="empty-msg">Nenhum formulário</p>';
    return;
  }

  el.innerHTML = state.forms.map((f) => {
    const typeBadge = f.source_type === 'legacy'
      ? '<span class="badge badge-legacy">Legado</span>'
      : '<span class="badge badge-dynamic">Dinâmico</span>';
    const statusBadge = f.status === 'archived' ? '<span class="badge badge-archived">Arquivado</span>' : '';
    const publicLink = f.source_type === 'dynamic' && f.status === 'active'
      ? `<a href="/form/${f.slug}" target="_blank">/form/${f.slug}</a>`
      : '';

    return `
      <div class="form-item" data-id="${f.id}">
        <div class="form-item-info">
          <h4>${escapeHtml(f.name)} ${typeBadge} ${statusBadge}</h4>
          <p>${escapeHtml(f.description || f.slug)} ${publicLink ? '· ' + publicLink : ''}</p>
        </div>
        <div class="form-item-actions">
          <button type="button" class="btn btn-sm btn-secondary" data-action="report" data-id="${f.id}">Relatório</button>
          ${f.source_type === 'dynamic' ? `<button type="button" class="btn btn-sm btn-primary" data-action="edit" data-id="${f.id}">Editar</button>` : ''}
          ${f.status === 'active'
            ? `<button type="button" class="btn btn-sm btn-ghost" data-action="archive" data-id="${f.id}">Arquivar</button>`
            : `<button type="button" class="btn btn-sm btn-ghost" data-action="activate" data-id="${f.id}">Ativar</button>`}
          ${f.source_type === 'dynamic' ? `<button type="button" class="btn btn-sm btn-danger" data-action="delete" data-id="${f.id}">Excluir</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleFormAction(btn.dataset.action, Number(btn.dataset.id)));
  });
}

async function handleFormAction(action, id) {
  if (action === 'report') {
    switchTab('reports');
    $('#report-form').value = String(id);
    await initReports();
    return;
  }
  if (action === 'edit') {
    await openEditor(id);
    return;
  }
  if (action === 'archive' || action === 'activate') {
    const status = action === 'archive' ? 'archived' : 'active';
    try {
      await api(`/forms/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadForms();
    } catch (err) { alert(err.message); }
    return;
  }
  if (action === 'delete') {
    if (!confirm('Excluir este formulário e todas as respostas?')) return;
    try {
      await api(`/forms/${id}`, { method: 'DELETE' });
      $('#form-editor')?.setAttribute('hidden', '');
      await loadForms();
    } catch (err) { alert(err.message); }
  }
}

async function openEditor(id) {
  state.editingFormId = id;
  state.editingFieldId = null;
  try {
    const data = await api(`/forms/${id}`);
    const f = data.form;
    state.editorFields = data.fields || [];
    state.editingFormSlug = f.slug;
    state.editingFormName = f.name;
    resetFieldForm(false);
    const editor = $('#form-editor');
    if (editor) editor.removeAttribute('hidden');
    $('#editor-title').textContent = f.name;
    const metaForm = $('#form-meta-form');
    if (metaForm) {
      metaForm.querySelector('[name=name]').value = f.name || '';
      metaForm.querySelector('[name=description]').value = f.description || '';
      const slugEl = $('#editor-slug');
      if (slugEl) slugEl.textContent = f.slug;
      const link = $('#editor-public-link');
      if (link) {
        link.href = `/form/${f.slug}`;
        link.textContent = `/form/${f.slug}`;
      }
      hideError($('#form-meta-error'));
      $('#form-meta-notice')?.setAttribute('hidden', '');
    }
    refreshCondFieldOptions();
    renderFields(state.editorFields);
  } catch (err) {
    alert(err.message);
  }
}

function formatConditionalSummary(showWhen, allFields) {
  if (!showWhen?.field_key) return '';
  const parent = allFields.find((f) => f.field_key === showWhen.field_key);
  const parentLabel = parent?.label || showWhen.field_key;
  const opLabels = {
    equals: 'é igual a',
    not_equals: 'é diferente de',
    contains: 'contém',
    checked: 'está marcado',
    not_checked: 'não está marcado',
  };
  const op = opLabels[showWhen.operator] || showWhen.operator;
  if (showWhen.operator === 'checked' || showWhen.operator === 'not_checked') {
    return ` · se "${parentLabel}" ${op}`;
  }
  return ` · se "${parentLabel}" ${op} "${showWhen.value}"`;
}

function refreshCondFieldOptions(excludeFieldId) {
  const sel = document.querySelector('#add-field-form [name=cond_field]');
  if (!sel) return;
  const current = sel.value;
  const fields = state.editorFields.filter((f) => Number(f.id) !== Number(excludeFieldId));
  sel.innerHTML = '<option value="">Sempre visível</option>' +
    fields.map((f) => `<option value="${escapeHtml(f.field_key)}">${escapeHtml(f.label)} (${escapeHtml(f.field_key)})</option>`).join('');
  if (current && [...sel.options].some((o) => o.value === current)) sel.value = current;
  updateCondUi();
}

function updateCondUi() {
  const form = $('#add-field-form');
  if (!form) return;
  const condField = form.querySelector('[name=cond_field]')?.value || '';
  const condOp = form.querySelector('[name=cond_operator]')?.value || 'equals';
  const parent = state.editorFields.find((f) => f.field_key === condField);

  const opWrap = $('#cond-op-wrap');
  const valWrap = $('#cond-val-wrap');
  const opSel = form.querySelector('[name=cond_operator]');

  if (!condField) {
    opWrap?.setAttribute('hidden', '');
    valWrap?.setAttribute('hidden', '');
    return;
  }

  opWrap?.removeAttribute('hidden');

  if (parent?.field_type === 'checkbox') {
    const hasOpts = Array.isArray(parent.options) && parent.options.length > 0;
    if (opSel) {
      [...opSel.options].forEach((o) => {
        o.hidden = hasOpts ? false : !['checked', 'not_checked'].includes(o.value);
      });
      if (!hasOpts && !['checked', 'not_checked'].includes(opSel.value)) opSel.value = 'checked';
    }
    if (hasOpts && (condOp === 'checked' || condOp === 'not_checked')) {
      valWrap?.setAttribute('hidden', '');
    } else if (hasOpts) {
      valWrap?.removeAttribute('hidden');
    } else {
      valWrap?.setAttribute('hidden', '');
    }
    return;
  }

  if (opSel) {
    [...opSel.options].forEach((o) => {
      o.hidden = ['checked', 'not_checked'].includes(o.value);
    });
    if (['checked', 'not_checked'].includes(opSel.value)) opSel.value = 'equals';
  }

  if (condOp === 'checked' || condOp === 'not_checked') {
    valWrap?.setAttribute('hidden', '');
  } else {
    valWrap?.removeAttribute('hidden');
  }
}

function resetFieldForm(clearFields = true) {
  const form = $('#add-field-form');
  if (!form) return;
  form.reset();
  form.querySelector('[name=field_id]').value = '';
  state.editingFieldId = null;
  $('#add-field-title').textContent = 'Adicionar campo';
  $('#add-field-submit').textContent = 'Adicionar campo';
  $('#cancel-field-edit')?.setAttribute('hidden', '');
  $('#options-wrap')?.setAttribute('hidden', '');
  $('#placeholder-wrap')?.removeAttribute('hidden');
  refreshCondFieldOptions();
}

function fillFieldForm(field) {
  const form = $('#add-field-form');
  if (!form) return;
  state.editingFieldId = field.id;
  form.querySelector('[name=field_id]').value = String(field.id);
  form.querySelector('[name=label]').value = field.label || '';
  form.querySelector('[name=field_key]').value = field.field_key || '';
  form.querySelector('[name=field_type]').value = field.field_type || 'text';
  form.querySelector('[name=required]').checked = Boolean(field.required);
  form.querySelector('[name=description]').value = field.description || '';
  form.querySelector('[name=placeholder]').value = field.placeholder || '';
  form.querySelector('[name=options]').value = Array.isArray(field.options) ? field.options.join('\n') : '';

  refreshCondFieldOptions(field.id);
  const cond = field.show_when;
  if (cond?.field_key) {
    form.querySelector('[name=cond_field]').value = cond.field_key;
    form.querySelector('[name=cond_operator]').value = cond.operator || 'equals';
    form.querySelector('[name=cond_value]').value = cond.value || '';
  }
  updateCondUi();

  if (field.field_type === 'select' || field.field_type === 'checkbox') {
    $('#options-wrap')?.removeAttribute('hidden');
  }
  if (field.field_type === 'checkbox') $('#placeholder-wrap')?.setAttribute('hidden', '');

  $('#add-field-title').textContent = 'Editar campo';
  $('#add-field-submit').textContent = 'Salvar alterações';
  $('#cancel-field-edit')?.removeAttribute('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function readShowWhenFromForm(form) {
  const fieldKey = form.querySelector('[name=cond_field]')?.value?.trim();
  if (!fieldKey) return null;
  const operator = form.querySelector('[name=cond_operator]')?.value || 'equals';
  const value = form.querySelector('[name=cond_value]')?.value?.trim() || '';
  if (operator === 'checked' || operator === 'not_checked') {
    return { field_key: fieldKey, operator };
  }
  if (!value) return null;
  return { field_key: fieldKey, operator, value };
}

function renderFields(fields) {
  const el = $('#fields-list');
  if (!fields.length) {
    el.innerHTML = '<p class="empty-msg">Nenhum campo. Adicione abaixo.</p>';
    return;
  }
  el.innerHTML = fields.map((f) => {
    const cond = formatConditionalSummary(f.show_when, fields);
    const desc = f.description ? `<small class="field-meta">${escapeHtml(f.description)}</small>` : '';
    const ph = f.placeholder ? `<small class="field-meta">Placeholder: ${escapeHtml(f.placeholder)}</small>` : '';
    return `
    <div class="field-item" data-field-id="${f.id}">
      <div class="field-info">
        <strong>${escapeHtml(f.label)}</strong>
        <small>${f.field_key} · ${f.field_type}${f.required ? ' · obrigatório' : ''}${cond}</small>
        ${desc}${ph}
      </div>
      <div class="field-item-actions">
        <button type="button" class="btn btn-sm btn-secondary" data-edit-field="${f.id}">Editar</button>
        <button type="button" class="btn btn-sm btn-danger" data-delete-field="${f.id}">Remover</button>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('[data-edit-field]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const field = fields.find((f) => Number(f.id) === Number(btn.dataset.editField));
      if (field) fillFieldForm(field);
    });
  });

  el.querySelectorAll('[data-delete-field]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remover este campo?')) return;
      try {
        await api(`/form-fields?formId=${state.editingFormId}&fieldId=${btn.dataset.deleteField}`, { method: 'DELETE' });
        if (String(state.editingFieldId) === btn.dataset.deleteField) resetFieldForm();
        await openEditor(state.editingFormId);
      } catch (err) { alert(err.message); }
    });
  });
}

const PREVIEW_WIDTHS = [
  { key: 'full', label: '100%' },
  { key: 'half', label: '50%' },
  { key: 'third', label: '33%' },
];

function previewWidthClass(w) {
  if (w === 'half') return 'preview-field--half';
  if (w === 'third') return 'preview-field--third';
  return '';
}

function previewFieldBody(f) {
  const label = escapeHtml(f.label);
  const ph = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : '';
  const desc = f.description
    ? `<p class="preview-field-desc">${escapeHtml(f.description)}</p>`
    : '';

  if (f.field_type === 'textarea') {
    return `<label><span>${label}${f.required ? ' *' : ''}</span>${desc}<textarea rows="3"${ph} disabled></textarea></label>`;
  }
  if (f.field_type === 'select') {
    const opts = (f.options || []).map((o) => `<option>${escapeHtml(o)}</option>`).join('');
    return `<label><span>${label}${f.required ? ' *' : ''}</span>${desc}<select disabled><option>Selecione…</option>${opts}</select></label>`;
  }
  if (f.field_type === 'checkbox') {
    const opts = (f.options || []).filter(Boolean);
    if (opts.length) {
      const boxes = opts.map((o) =>
        `<label class="check-row"><input type="checkbox" disabled /><span>${escapeHtml(o)}</span></label>`
      ).join('');
      return `<div><span>${label}${f.required ? ' *' : ''}</span>${desc}<div class="preview-check-group">${boxes}</div></div>`;
    }
    return `<label class="check-row"><input type="checkbox" disabled /><span>${label}${f.required ? ' *' : ''}</span></label>${desc}`;
  }
  const type = ['email', 'tel', 'date', 'number'].includes(f.field_type) ? f.field_type : 'text';
  return `<label><span>${label}${f.required ? ' *' : ''}</span>${desc}<input type="${type}"${ph} disabled /></label>`;
}

function previewFieldHtml(f) {
  const w = f.field_width || 'full';
  const widthBtns = PREVIEW_WIDTHS.map(({ key, label }) =>
    `<button type="button" data-width="${key}" class="${w === key ? 'active' : ''}" title="Largura ${label}">${label}</button>`
  ).join('');

  return `
    <div class="preview-field ${previewWidthClass(w)}" data-id="${f.id}">
      <div class="preview-field-toolbar">
        <span class="preview-drag-handle" draggable="true" title="Arrastar para reordenar">⋮⋮</span>
        <span class="preview-field-label">${escapeHtml(f.field_key)} · ${f.field_type}</span>
        <div class="preview-width-btns" role="group" aria-label="Largura do campo">${widthBtns}</div>
      </div>
      <div class="preview-field-body">${previewFieldBody(f)}</div>
    </div>`;
}

let previewDragBound = false;

function getPreviewInsertBefore(canvas, y) {
  const items = [...canvas.querySelectorAll('.preview-field:not(.is-dragging)')];
  return items.find((el) => {
    const box = el.getBoundingClientRect();
    return y < box.top + box.height / 2;
  }) || null;
}

function syncPreviewOrderFromDom(canvas) {
  const map = new Map(state.previewFields.map((f) => [String(f.id), f]));
  state.previewFields = [...canvas.querySelectorAll('.preview-field')]
    .map((el) => map.get(String(el.dataset.id)))
    .filter(Boolean);
}

function renderFormPreview() {
  const canvas = $('#preview-canvas');
  if (!canvas) return;
  canvas.innerHTML = state.previewFields.map(previewFieldHtml).join('');
  bindPreviewDragDrop(canvas);
}

function bindPreviewDragDrop(canvas) {
  if (previewDragBound) return;
  previewDragBound = true;

  canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

    const dragging = canvas.querySelector('.preview-field.is-dragging');
    if (!dragging) return;

    const insertBefore = getPreviewInsertBefore(canvas, e.clientY);
    if (insertBefore && insertBefore !== dragging) {
      canvas.insertBefore(dragging, insertBefore);
    } else if (!insertBefore && dragging.parentElement === canvas) {
      canvas.appendChild(dragging);
    }
  });

  canvas.addEventListener('dragstart', (e) => {
    const handle = e.target.closest?.('.preview-drag-handle');
    if (!handle) {
      e.preventDefault();
      return;
    }
    const item = handle.closest('.preview-field');
    if (!item) return;

    e.dataTransfer.setData('text/plain', item.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    item.classList.add('is-dragging');
  });

  canvas.addEventListener('dragend', (e) => {
    const handle = e.target.closest?.('.preview-drag-handle');
    if (!handle) return;
    const item = handle.closest('.preview-field');
    item?.classList.remove('is-dragging');
    syncPreviewOrderFromDom(canvas);
    canvas.querySelectorAll('.preview-field').forEach((el) => el.classList.remove('drag-over'));
  });

  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    syncPreviewOrderFromDom(canvas);
  });

  canvas.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.preview-width-btns button');
    if (!btn) return;
    const fieldEl = btn.closest('.preview-field');
    const id = fieldEl?.dataset.id;
    const width = btn.dataset.width;
    if (!id || !width) return;
    state.previewFields = state.previewFields.map((f) =>
      String(f.id) === String(id) ? { ...f, field_width: width } : f
    );
    renderFormPreview();
  });
}

function openFormPreview() {
  if (!state.editingFormId) return;
  if (!state.editorFields.length) {
    alert('Adicione pelo menos um campo para visualizar.');
    return;
  }
  state.previewFields = [...state.editorFields]
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((f) => ({ ...f, field_width: f.field_width || 'full' }));

  const title = $('#preview-title');
  if (title) title.textContent = `Visualizar: ${state.editingFormName || 'Formulário'}`;

  const link = $('#preview-open-public');
  if (link && state.editingFormSlug) link.href = `/form/${state.editingFormSlug}`;

  renderFormPreview();
  $('#form-preview')?.removeAttribute('hidden');
}

function closeFormPreview() {
  $('#form-preview')?.setAttribute('hidden', '');
}

async function savePreviewLayout() {
  if (!state.editingFormId || !state.previewFields.length) return;
  const btn = $('#preview-save');
  const prev = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Salvando…';
  }
  try {
    const layout = state.previewFields.map((f, i) => ({
      id: f.id,
      sort_order: i,
      field_width: f.field_width || 'full',
    }));
    const data = await api(`/form-fields?formId=${state.editingFormId}`, {
      method: 'PATCH',
      body: JSON.stringify({ form_id: state.editingFormId, layout }),
    });
    state.editorFields = data.fields || state.previewFields;
    state.previewFields = [...state.editorFields]
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    renderFields(state.editorFields);
    renderFormPreview();
    showFieldSaveNotice('Layout salvo com sucesso.');
  } catch (err) {
    alert(err.message || 'Erro ao salvar layout.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prev || 'Salvar layout';
    }
  }
}

async function onFormMetaSubmit(e) {
  e.preventDefault();
  if (!state.editingFormId) return;

  const form = e.target;
  const errEl = $('#form-meta-error');
  const noticeEl = $('#form-meta-notice');
  hideError(errEl);
  noticeEl?.setAttribute('hidden', '');

  const name = form.querySelector('[name=name]')?.value?.trim();
  if (!name) {
    showError(errEl, 'Nome é obrigatório.');
    return;
  }

  const description = form.querySelector('[name=description]')?.value?.trim() || null;
  const btn = form.querySelector('[type="submit"]');
  const prevLabel = btn?.textContent;

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Salvando…';
  }

  try {
    const data = await api(`/forms/${state.editingFormId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, description }),
    });
    state.editingFormName = data.form.name;
    $('#editor-title').textContent = data.form.name;
    await loadForms();
    if (noticeEl) {
      noticeEl.textContent = 'Informações salvas com sucesso.';
      noticeEl.removeAttribute('hidden');
      clearTimeout(onFormMetaSubmit._t);
      onFormMetaSubmit._t = setTimeout(() => noticeEl.setAttribute('hidden', ''), 3000);
    }
  } catch (err) {
    showError(errEl, err.message || 'Não foi possível salvar.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevLabel || 'Salvar informações';
    }
  }
}

async function onAddField(e) {
  e.preventDefault();
  if (!state.editingFormId) return;
  const form = e.target;
  const fieldId = form.querySelector('[name=field_id]')?.value;
  const label = form.querySelector('[name=label]')?.value?.trim();
  let fieldKey = form.querySelector('[name=field_key]')?.value?.trim();
  if (!fieldKey && label) {
    fieldKey = String(label).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }
  const fieldType = form.querySelector('[name=field_type]')?.value || 'text';
  const options = readOptionsFromForm(form, fieldType);

  const payload = {
    label,
    field_key: fieldKey,
    field_type: fieldType,
    required: form.querySelector('[name=required]')?.checked || false,
    description: form.querySelector('[name=description]')?.value?.trim() || '',
    placeholder: form.querySelector('[name=placeholder]')?.value?.trim() || '',
    options,
    show_when: readShowWhenFromForm(form),
  };

  try {
    const btn = form.querySelector('#add-field-submit');
    const prevLabel = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = fieldId ? 'Salvando…' : 'Adicionando…';
    }

    if (fieldId) {
      await api(`/form-fields?formId=${state.editingFormId}&fieldId=${fieldId}`, {
        method: 'PATCH',
        body: JSON.stringify({ id: Number(fieldId), form_id: state.editingFormId, ...payload }),
      });
    } else {
      await api(`/form-fields?formId=${state.editingFormId}`, {
        method: 'POST',
        body: JSON.stringify({ form_id: state.editingFormId, ...payload }),
      });
    }
    resetFieldForm();
    await openEditor(state.editingFormId);
    showFieldSaveNotice('Campo salvo com sucesso.');
  } catch (err) {
    alert(err.message || 'Não foi possível salvar o campo.');
  } finally {
    const btn = form.querySelector('#add-field-submit');
    if (btn) {
      btn.disabled = false;
      btn.textContent = fieldId ? 'Salvar alterações' : 'Adicionar campo';
    }
  }
}

async function onModalSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const errEl = $('#modal-error');
  hideError(errEl);
  try {
    const data = await api('/forms', {
      method: 'POST',
      body: JSON.stringify({
        name: form.querySelector('[name=name]')?.value?.trim(),
        slug: form.querySelector('[name=slug]')?.value?.trim() || undefined,
        description: form.querySelector('[name=description]')?.value?.trim() || undefined,
      }),
    });
    $('#modal')?.setAttribute('hidden', '');
    await loadForms();
    await openEditor(data.form.id);
  } catch (err) {
    showError(errEl, err.message);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdmin);
} else {
  initAdmin();
}
