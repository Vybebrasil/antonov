const eqState = {
  users: [],
  partners: [],
  modules: [],
  forms: [],
  q: '',
};

const EQ_KIND = {
  super_admin: 'Super admin',
  equipe: 'Equipe',
  parceiro: 'Parceiro',
};

function eqEsc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function eqKindOf(user) {
  if (user?.role === 'super_admin') return 'super_admin';
  if (user?.role === 'parceiro') return 'parceiro';
  return 'equipe';
}

function eqKindLabel(user) {
  const kind = eqKindOf(user);
  if (kind === 'equipe' && (user.role === 'marketing' || user.role === 'financeiro')) {
    return `Equipe · ${user.role === 'marketing' ? 'Marketing' : 'Financeiro'}`;
  }
  return EQ_KIND[kind];
}

async function loadEquipe() {
  const el = document.getElementById('eq-content');
  const err = document.getElementById('eq-error');
  if (!el) return;
  if (err) { err.hidden = true; err.textContent = ''; }
  el.innerHTML = '<p class="empty-msg">Carregando equipe…</p>';
  try {
    const data = await api('/equipe');
    eqState.users = data.users || [];
    eqState.partners = data.partners || [];
    eqState.modules = data.modules || [];
    eqState.forms = data.forms || [];
    renderEquipe();
  } catch (error) {
    el.innerHTML = '';
    if (err) {
      err.hidden = false;
      err.textContent = error.message;
    }
  }
}

function renderEquipe() {
  const el = document.getElementById('eq-content');
  if (!el) return;
  const q = eqState.q.trim().toLowerCase();
  const partnerName = new Map(eqState.partners.map((item) => [Number(item.id), item.name]));
  const rows = eqState.users.filter((user) => {
    if (!q) return true;
    return `${user.email} ${user.name || ''} ${eqKindLabel(user)}`.toLowerCase().includes(q);
  });
  el.innerHTML = `
    <div class="eq-legend">
      <div class="eq-legend__item"><span class="eq-kind-badge eq-kind-badge--super_admin">Super admin</span><span>Abre tudo e gerencia o acesso</span></div>
      <div class="eq-legend__item"><span class="eq-kind-badge eq-kind-badge--equipe">Equipe</span><span>Entra só nas áreas marcadas</span></div>
      <div class="eq-legend__item"><span class="eq-kind-badge eq-kind-badge--parceiro">Parceiro</span><span>Vai direto para o portal do parceiro</span></div>
    </div>
    <div class="eq-toolbar">
      <input type="search" id="eq-q" class="eq-search" placeholder="Buscar por nome, e-mail ou tipo" value="${eqEsc(eqState.q)}" aria-label="Buscar usuários">
      <span class="eq-count">${rows.length} ${rows.length === 1 ? 'pessoa' : 'pessoas'}</span>
    </div>
    <div class="card eq-table-wrap">
      <table class="data-table eq-table">
        <thead><tr>
          <th>Pessoa</th><th>Tipo</th><th>Acesso</th><th><span class="sr-only">Ações</span></th>
        </tr></thead>
        <tbody>
          ${rows.map((user) => `
            <tr>
              <td data-label="Pessoa">
                <div class="eq-person">
                  <span class="eq-avatar" aria-hidden="true">${eqEsc(eqInitials(user))}</span>
                  <div>
                    <strong>${eqEsc(user.name || user.email)}</strong>
                    ${user.name ? `<div class="eq-email">${eqEsc(user.email)}</div>` : ''}
                    ${user.must_change_password ? '<span class="eq-pending">Aguardando primeiro acesso</span>' : ''}
                  </div>
                </div>
              </td>
              <td data-label="Tipo">
                <span class="eq-kind-badge eq-kind-badge--${eqKindOf(user)}">${eqEsc(eqKindLabel(user))}</span>
                ${user.partner_id ? `<div class="eq-email">${eqEsc(partnerName.get(Number(user.partner_id)) || 'Parceiro')}</div>` : ''}
              </td>
              <td data-label="Acesso"><div class="eq-chips">${eqModulesHtml(user)}</div></td>
              <td class="eq-actions">
                <button type="button" class="btn btn-sm btn-secondary" data-eq-edit="${user.id}">Editar</button>
                ${Number(user.id) === Number(state.user?.userId) ? '' : `<button type="button" class="btn btn-sm btn-ghost eq-btn-off" data-eq-off="${user.id}">Desativar</button>`}
              </td>
            </tr>`).join('') || '<tr><td colspan="4" class="empty-msg">Nenhum usuário encontrado.</td></tr>'}
        </tbody>
      </table>
    </div>`;
  el.querySelector('#eq-q')?.addEventListener('input', (event) => {
    eqState.q = event.target.value;
    renderEquipe();
    const input = document.getElementById('eq-q');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
  el.querySelectorAll('[data-eq-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const user = eqState.users.find((item) => String(item.id) === button.dataset.eqEdit);
      openEquipeForm(user);
    });
  });
  el.querySelectorAll('[data-eq-off]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Desativar este usuário? O login deixa de funcionar.')) return;
      try {
        await api(`/equipe/users/${button.dataset.eqOff}`, { method: 'DELETE' });
        loadEquipe();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function eqInitials(user) {
  const base = String(user.name || user.email || '?').trim();
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

const EQ_KIND_HINT = {
  super_admin: 'Abre tudo e gerencia o acesso',
  equipe: 'Escolha as áreas que pode abrir',
  parceiro: 'Só o portal do parceiro',
};

const EQ_MODULE_HINT = {
  dashboard: 'Visão geral e leads',
  reports: 'Respostas dos formulários',
  forms: 'Criar e editar formulários',
  hr: 'PDI da equipe',
  achados: 'Itens da recepção',
  parceiros: 'Contratos e publicidade',
  telao: 'Programação do LED',
  equipe: 'Usuários e permissões',
};

function eqReportLabel(user) {
  if (user.report_forms == null) return 'todos';
  if (!user.report_forms.length) return 'nenhum';
  const names = new Map(eqState.forms.map((item) => [Number(item.id), item.name]));
  return user.report_forms.map((id) => names.get(Number(id)) || `#${id}`).join(', ');
}

function eqModulesHtml(user) {
  if (user.role === 'super_admin') return '<span class="eq-chip eq-chip--all">Tudo</span>';
  if (user.role === 'parceiro') return '<span class="eq-chip">Portal do parceiro</span>';
  const labels = new Map(eqState.modules.map((item) => [item.key, item.label]));
  if (!user.modules?.length) return '—';
  return user.modules.map((key) => {
    const extra = key === 'reports' ? ` · ${eqReportLabel(user)}` : '';
    return `<span class="eq-chip">${eqEsc((labels.get(key) || key) + extra)}</span>`;
  }).join(' ');
}

function openEquipeForm(user) {
  const modal = document.getElementById('eq-modal');
  const box = document.getElementById('eq-modal-body');
  if (!modal || !box) return;
  const editing = Boolean(user);
  const kind = eqKindOf(user);
  const selected = new Set(user?.modules || []);
  const reportSelected = user?.report_forms == null
    ? new Set(eqState.forms.map((item) => String(item.id)))
    : new Set((user.report_forms || []).map(String));
  const canGrant = state.user?.role === 'super_admin';
  const kinds = canGrant ? EQ_KIND : { equipe: EQ_KIND.equipe, parceiro: EQ_KIND.parceiro };
  const modules = eqState.modules.filter((item) => item.key !== 'equipe' || canGrant);
  const moduleTile = (item) => {
    const checked = selected.has(item.key) || (!editing && item.key !== 'equipe');
    return `
      <label class="eq-tile">
        <input type="checkbox" name="modules" value="${eqEsc(item.key)}" ${checked ? 'checked' : ''} />
        <span class="eq-tile__box" aria-hidden="true"></span>
        <span class="eq-tile__text">
          <span class="eq-tile__title">${eqEsc(item.label)}</span>
          <span class="eq-tile__hint">${eqEsc(EQ_MODULE_HINT[item.key] || '')}</span>
        </span>
      </label>`;
  };
  box.innerHTML = `
    <form id="eq-form" class="eq-form" novalidate>
      <header class="eq-form__head">
        <div>
          <h3 id="eq-modal-title">${editing ? 'Editar usuário' : 'Novo usuário'}</h3>
          ${editing ? `<p class="eq-form__sub">${eqEsc(user.email)}</p>` : '<p class="eq-form__sub">Cadastre a pessoa e defina o que ela pode abrir</p>'}
        </div>
        <button type="button" class="eq-close" id="eq-close" aria-label="Fechar">×</button>
      </header>

      <div class="eq-form__body">
        <section class="eq-section">
          <h4 class="eq-section__title">Dados de acesso</h4>
          <div class="eq-fields">
            ${editing ? '' : `
            <label class="eq-field">
              <span>E-mail</span>
              <input type="email" name="email" required autocomplete="off" inputmode="email" placeholder="nome@antonovcenter.com.br">
            </label>`}
            <label class="eq-field${editing ? ' eq-field--full' : ''}">
              <span>Nome</span>
              <input name="name" value="${eqEsc(user?.name || '')}" autocomplete="off" placeholder="Como aparece na lista">
            </label>
            <label class="eq-field eq-field--full">
              <span>${editing ? 'Nova senha temporária <em>em branco mantém a atual</em>' : 'Senha temporária <em>a pessoa troca no primeiro acesso</em>'}</span>
              <input type="password" name="password" minlength="8" ${editing ? '' : 'required'} autocomplete="new-password">
            </label>
          </div>
        </section>

        <section class="eq-section">
          <h4 class="eq-section__title">Tipo de conta</h4>
          <div class="eq-kinds" role="radiogroup" aria-label="Tipo de conta">
            ${Object.entries(kinds).map(([value, label]) => `
              <label class="eq-kind-card">
                <input type="radio" name="kind" value="${value}" ${kind === value ? 'checked' : ''} />
                <span class="eq-kind-card__dot" aria-hidden="true"></span>
                <span class="eq-kind-card__title">${eqEsc(label)}</span>
                <span class="eq-kind-card__hint">${eqEsc(EQ_KIND_HINT[value])}</span>
              </label>`).join('')}
          </div>
        </section>

        <section class="eq-section" id="eq-modules-wrap">
          <div class="eq-section__row">
            <h4 class="eq-section__title">Áreas do painel</h4>
            <div class="eq-quick">
              <button type="button" class="eq-link" data-eq-all="modules">Marcar todas</button>
              <button type="button" class="eq-link" data-eq-none="modules">Limpar</button>
            </div>
          </div>
          <div class="eq-tiles">
            ${modules.map(moduleTile).join('')}
          </div>

          <div class="eq-sub" id="eq-report-forms-wrap">
            <div class="eq-section__row">
              <p class="eq-sub__title">Relatórios que pode abrir <span class="eq-counter" id="eq-report-count"></span></p>
              <div class="eq-quick">
                <button type="button" class="eq-link" data-eq-all="report_forms">Todos</button>
                <button type="button" class="eq-link" data-eq-none="report_forms">Nenhum</button>
              </div>
            </div>
            ${eqState.forms.length ? `
            <div class="eq-pills">
              ${eqState.forms.map((form) => `
                <label class="eq-pill">
                  <input type="checkbox" name="report_forms" value="${form.id}" ${reportSelected.has(String(form.id)) ? 'checked' : ''} />
                  <span>${eqEsc(form.name)}${form.status === 'archived' ? ' <em>arquivado</em>' : ''}</span>
                </label>`).join('')}
            </div>` : '<p class="eq-empty">Nenhum formulário cadastrado.</p>'}
          </div>

          <div class="eq-sub" id="eq-partner-role-wrap">
            <label class="eq-field">
              <span>Dentro de Parceiros</span>
              <select name="partner_role">
                <option value="admin_antonov" ${!user || user.role === 'admin_antonov' ? 'selected' : ''}>Acesso completo</option>
                <option value="marketing" ${user?.role === 'marketing' ? 'selected' : ''}>Marketing: parceiros, campanhas e analytics</option>
                <option value="financeiro" ${user?.role === 'financeiro' ? 'selected' : ''}>Financeiro: planos, contratos e pagamentos</option>
              </select>
            </label>
          </div>
        </section>

        <section class="eq-section" id="eq-partner-wrap">
          <h4 class="eq-section__title">Parceiro vinculado</h4>
          <label class="eq-field">
            <span>Empresa</span>
            <select name="partner_id">
              <option value="">Selecione</option>
              ${eqState.partners.map((item) => `<option value="${item.id}" ${Number(user?.partner_id) === Number(item.id) ? 'selected' : ''}>${eqEsc(item.name)}</option>`).join('')}
            </select>
          </label>
        </section>
      </div>

      <footer class="eq-form__foot">
        <p class="form-error" id="eq-form-error" hidden role="alert"></p>
        <div class="eq-form__buttons">
          <button type="button" class="btn btn-ghost" id="eq-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary" id="eq-save">${editing ? 'Salvar alterações' : 'Criar usuário'}</button>
        </div>
      </footer>
    </form>`;
  modal.hidden = false;
  document.body.classList.add('eq-modal-open');
  const close = () => {
    modal.hidden = true;
    document.body.classList.remove('eq-modal-open');
  };
  const sync = () => {
    const current = box.querySelector('[name="kind"]:checked')?.value;
    box.querySelector('#eq-modules-wrap').hidden = current !== 'equipe';
    const reportsOn = box.querySelector('[name="modules"][value="reports"]')?.checked;
    const reportWrap = box.querySelector('#eq-report-forms-wrap');
    if (reportWrap) reportWrap.hidden = !reportsOn;
    box.querySelector('#eq-partner-role-wrap').hidden = !box.querySelector('[name="modules"][value="parceiros"]')?.checked;
    box.querySelector('#eq-partner-wrap').hidden = current !== 'parceiro';
    const total = box.querySelectorAll('[name="report_forms"]').length;
    const on = box.querySelectorAll('[name="report_forms"]:checked').length;
    const counter = box.querySelector('#eq-report-count');
    if (counter) counter.textContent = total ? `${on} de ${total}` : '';
  };
  box.querySelectorAll('[name="kind"], [name="modules"], [name="report_forms"]').forEach((input) => input.addEventListener('change', sync));
  box.querySelectorAll('[data-eq-all], [data-eq-none]').forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.dataset.eqAll || button.dataset.eqNone;
      const value = Boolean(button.dataset.eqAll);
      box.querySelectorAll(`[name="${name}"]`).forEach((input) => { input.checked = value; });
      sync();
    });
  });
  box.querySelector('#eq-cancel')?.addEventListener('click', close);
  box.querySelector('#eq-close')?.addEventListener('click', close);
  sync();
  requestAnimationFrame(() => box.querySelector(editing ? '[name="name"]' : '[name="email"]')?.focus());
  box.querySelector('#eq-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const errEl = document.getElementById('eq-form-error');
    const data = new FormData(form);
    const payload = {
      kind: data.get('kind'),
      name: data.get('name'),
      partner_role: data.get('partner_role'),
      partner_id: data.get('partner_id') || null,
      modules: [...form.querySelectorAll('[name="modules"]:checked')].map((input) => input.value),
      report_forms: [...form.querySelectorAll('[name="report_forms"]:checked')].map((input) => Number(input.value)),
    };
    if (!editing) payload.email = data.get('email');
    const password = String(data.get('password') || '');
    if (password) payload.password = password;
    const fail = (message) => {
      if (!errEl) return;
      errEl.hidden = false;
      errEl.textContent = message;
    };
    if (!editing && !String(payload.email || '').includes('@')) return fail('Informe um e-mail válido.');
    if (!editing && password.length < 8) return fail('A senha precisa de pelo menos 8 caracteres.');
    if (editing && password && password.length < 8) return fail('A senha precisa de pelo menos 8 caracteres.');
    if (payload.kind === 'equipe' && !payload.modules.length) return fail('Marque ao menos uma área do painel.');
    if (payload.kind === 'equipe' && payload.modules.includes('reports') && !payload.report_forms.length) {
      return fail('Marque ao menos um relatório.');
    }
    if (payload.kind === 'parceiro' && !payload.partner_id) return fail('Escolha o parceiro vinculado.');
    const saveBtn = form.querySelector('#eq-save');
    const label = saveBtn?.textContent;
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando…'; }
    try {
      await api(editing ? `/equipe/users/${user.id}` : '/equipe/users', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      close();
      loadEquipe();
    } catch (error) {
      fail(error.message);
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = label; }
    }
  });
}

function showCfgView(name) {
  const acesso = document.getElementById('cfg-view-acesso');
  const actions = document.getElementById('cfg-acesso-actions');
  document.querySelectorAll('#cfg-subtabs [data-cfg-view]').forEach((button) => {
    const active = button.dataset.cfgView === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  if (acesso) acesso.hidden = name !== 'acesso';
  if (actions) actions.hidden = name !== 'acesso';
  if (name === 'acesso') loadEquipe();
}

function initEquipeAdmin() {
  document.getElementById('eq-refresh')?.addEventListener('click', loadEquipe);
  document.getElementById('eq-new')?.addEventListener('click', () => openEquipeForm(null));
  const closeModal = () => {
    const modal = document.getElementById('eq-modal');
    if (modal) modal.hidden = true;
    document.body.classList.remove('eq-modal-open');
  };
  document.querySelector('#eq-modal .modal-backdrop')?.addEventListener('click', closeModal);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.getElementById('eq-modal')?.hidden) closeModal();
  });
  document.getElementById('cfg-subtabs')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cfg-view]');
    if (button) showCfgView(button.dataset.cfgView);
  });
}

function onEquipeTabOpen() {
  showCfgView('acesso');
}
