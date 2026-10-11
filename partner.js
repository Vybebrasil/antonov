/* Portal do Parceiro Antonov */

async function api(path, opts = {}) {
  const res = await fetch(`/api/admin${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha na requisição.');
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function money(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function badge(status) {
  const map = {
    ativo: 'pdi-badge--ativo',
    pago: 'pdi-badge--ativo',
    vencendo: 'pdi-badge--warn',
    pendente: 'pdi-badge--pending',
    atrasado: 'pdi-badge--danger',
    vencido: 'pdi-badge--danger',
    cancelado: 'pdi-badge--muted',
  };
  return `<span class="pdi-badge ${map[status] || ''}">${esc(status)}</span>`;
}

function showLogin() {
  document.getElementById('partner-login').hidden = false;
  document.getElementById('partner-panel').hidden = true;
}

function showPanel(email) {
  document.getElementById('partner-login').hidden = true;
  document.getElementById('partner-panel').hidden = false;
  const el = document.getElementById('partner-user-email');
  if (el) el.textContent = email || '';
}

async function loadPortal() {
  const el = document.getElementById('partner-content');
  if (!el) return;
  el.innerHTML = '<p class="dash-loading">Carregando…</p>';
  try {
    const asId = sessionStorage.getItem('pxPortalAs');
    const q = asId ? `?partner_id=${encodeURIComponent(asId)}` : '';
    const data = await api(`/parceiros/portal${q}`);
    const partner = data.partner || {};
    const current = data.current_contract;
    const payments = data.payments || [];
    const contracts = data.contracts || [];
    const attachments = data.attachments || [];
    const finance = data.finance || {};

    el.innerHTML = `
      <div class="partner-portal__head">
        <div>
          <p class="pdi-kicker">Portal do parceiro</p>
          <h1>${esc(partner.name)}</h1>
          <p class="pdi-muted">Status do perfil: ${badge(partner.status)} ${partner.show_on_home ? '· visível na Home' : ''}</p>
        </div>
        ${partner.slug ? `<a class="btn btn-sm btn-secondary" href="/parceiros/${esc(partner.slug)}" target="_blank" rel="noopener">Ver perfil público</a>` : ''}
      </div>

      <div class="pdi-stats">
        <article class="pdi-stat"><span class="pdi-stat__val">R$ ${money(finance.received)}</span><span class="pdi-stat__lbl">Pago</span></article>
        <article class="pdi-stat pdi-stat--warn"><span class="pdi-stat__val">R$ ${money(finance.pending)}</span><span class="pdi-stat__lbl">Em aberto</span></article>
        <article class="pdi-stat"><span class="pdi-stat__val">${contracts.length}</span><span class="pdi-stat__lbl">Contratos</span></article>
      </div>

      <section class="pdi-block">
        <h2>Contrato atual</h2>
        ${current ? `
          <div class="card pdi-table-wrap">
            <table class="data-table pdi-table">
              <tbody>
                <tr><th>Plano</th><td>${esc(current.plan_name || '—')}</td></tr>
                <tr><th>Valor</th><td>R$ ${money(current.amount)}</td></tr>
                <tr><th>Período</th><td>${esc(String(current.starts_on || '').slice(0, 10))} → ${esc(String(current.ends_on || '').slice(0, 10))}</td></tr>
                <tr><th>Status</th><td>${badge(current.status)}</td></tr>
                <tr><th>Renovação automática</th><td>${current.auto_renew ? `Sim (${Number(current.cycle_months) || 12} meses)` : 'Não'}</td></tr>
              </tbody>
            </table>
          </div>
        ` : '<p class="empty-msg">Nenhum contrato ativo no momento.</p>'}
      </section>

      <section class="pdi-block">
        <h2>Pagamentos</h2>
        <div class="card pdi-table-wrap">
          <table class="data-table pdi-table">
            <thead><tr><th>Vencimento</th><th>Contratado</th><th>Recebido</th><th>Status</th><th>Notas</th></tr></thead>
            <tbody>
              ${payments.map((p) => `
                <tr>
                  <td>${esc(String(p.due_on || '—').slice(0, 10))}</td>
                  <td>R$ ${money(p.contracted_amount)}</td>
                  <td>R$ ${money(p.received_amount)}</td>
                  <td>${badge(p.status)}</td>
                  <td>${esc(p.notes || '—')}</td>
                </tr>
              `).join('') || '<tr><td colspan="5" class="empty-msg">Sem lançamentos.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>

      <section class="pdi-block">
        <h2>Anexos do contrato</h2>
        <ul class="px-attach-list">
          ${attachments.map((a) => `
            <li>
              <button type="button" class="btn btn-sm btn-ghost" data-dl-attach="${a.id}" data-contract="${current?.id || ''}">${esc(a.file_name)}</button>
              <span class="pdi-muted">${esc(String(a.created_at || '').slice(0, 10))}</span>
            </li>
          `).join('') || '<li class="pdi-muted">Nenhum anexo disponível.</li>'}
        </ul>
      </section>

      <section class="pdi-block">
        <h2>Histórico de contratos</h2>
        <div class="card pdi-table-wrap">
          <table class="data-table pdi-table">
            <thead><tr><th>Plano</th><th>Valor</th><th>Início</th><th>Fim</th><th>Status</th></tr></thead>
            <tbody>
              ${contracts.map((c) => `
                <tr>
                  <td>${esc(c.plan_name || '—')}</td>
                  <td>R$ ${money(c.amount)}</td>
                  <td>${esc(String(c.starts_on || '').slice(0, 10))}</td>
                  <td>${esc(String(c.ends_on || '').slice(0, 10))}</td>
                  <td>${badge(c.status)}</td>
                </tr>
              `).join('') || '<tr><td colspan="5" class="empty-msg">Sem contratos.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    `;

    el.querySelectorAll('[data-dl-attach]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const contractId = btn.dataset.contract;
        const attId = btn.dataset.dlAttach;
        if (!contractId) return;
        try {
          const res = await api(`/parceiros/contracts/${contractId}/attachments/${attId}`);
          const a = res.attachment;
          if (!a?.file_data) throw new Error('Anexo sem dados.');
          const link = document.createElement('a');
          link.href = `data:${a.file_type || 'application/octet-stream'};base64,${a.file_data}`;
          link.download = a.file_name || 'anexo';
          link.click();
        } catch (err) {
          alert(err.message || 'Falha ao baixar.');
        }
      });
    });
  } catch (err) {
    el.innerHTML = `<p class="form-error">${esc(err.message || 'Não foi possível carregar o portal.')}</p>`;
  }
}

async function ensureSession() {
  try {
    const me = await api('/me');
    if (me.role && me.role !== 'parceiro' && me.role !== 'super_admin') {
      window.location.href = '/admin';
      return;
    }
    if (me.role === 'parceiro' && !me.partnerId) {
      showLogin();
      const err = document.getElementById('partner-login-error');
      if (err) {
        err.textContent = 'Conta sem parceiro vinculado. Peça ao admin Antonov.';
        err.hidden = false;
      }
      return;
    }
    showPanel(me.email);
    await loadPortal();
  } catch {
    showLogin();
  }
}

function init() {
  document.getElementById('partner-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const err = document.getElementById('partner-login-error');
    const btn = form.querySelector('[type="submit"]');
    if (err) err.hidden = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando…'; }
    try {
      await api('/login', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email.value.trim(),
          password: form.password.value,
        }),
      });
      const me = await api('/me');
      if (me.role !== 'parceiro' && me.role !== 'super_admin') {
        throw new Error('Esta conta não tem acesso ao portal do parceiro.');
      }
      showPanel(me.email);
      await loadPortal();
    } catch (error) {
      if (err) { err.textContent = error.message || 'Falha ao entrar.'; err.hidden = false; }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
    }
  });

  document.getElementById('partner-logout')?.addEventListener('click', async () => {
    try { await api('/logout', { method: 'POST' }); } catch { /* ignore */ }
    showLogin();
  });

  ensureSession();
}

init();
