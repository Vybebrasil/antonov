/* Pré-cadastro de inauguração — modal + captura de leads */
(function () {
  'use strict';

  const cfg = () => window.ANTONOV_VIP_LEADS || { provider: 'local' };
  const STORAGE_KEY = 'antonov_vip_leads';
  const SEEN_KEY = 'antonov-vip-modal-seen';

  const INTERESSES = [
    'Hipertrofia',
    'Ganho de massa',
    'Condicionamento físico',
    'Perda de peso',
    'Aumento de força',
    'Mobilidade',
  ];

  const chipsHtml = INTERESSES.map(
    (label, i) =>
      `<button type="button" class="vip-form__chip${i === 0 ? ' is-active' : ''}" data-vip-chip data-value="${label}">${label}</button>`
  ).join('');

  const modalHtml = `
<div class="vip-modal" id="vip-modal" hidden aria-hidden="true">
  <div class="vip-modal__backdrop" data-vip-close tabindex="-1"></div>
  <div class="vip-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="vip-modal-title">
    <button type="button" class="vip-modal__close" data-vip-close aria-label="Fechar">×</button>
    <div class="vip-modal__badge">/ PRÉ-INAUGURAÇÃO</div>
    <h2 id="vip-modal-title" class="vip-modal__title">Pré-cadastro <span class="yel">inauguração</span></h2>
    <p class="vip-modal__sub">Garanta prioridade antes da abertura do hangar em Irecê. Usamos os mesmos dados do nosso formulário de contato para te avisar em primeira mão.</p>
    <form class="vip-form" id="vip-form" novalidate>
      <div class="vip-form__row">
        <div class="vip-form__field">
          <label for="vip-nome">Nome <span class="req">*</span></label>
          <input id="vip-nome" name="nome" type="text" required autocomplete="name" placeholder="Seu nome completo" />
        </div>
        <div class="vip-form__field">
          <label for="vip-tel">WhatsApp <span class="req">*</span></label>
          <input id="vip-tel" name="telefone" type="tel" required autocomplete="tel" placeholder="(74) 99999-9999" />
        </div>
        <div class="vip-form__field vip-form__field--full">
          <label for="vip-email">E-mail <span class="req">*</span></label>
          <input id="vip-email" name="email" type="email" required autocomplete="email" placeholder="seu@email.com" />
        </div>
        <div class="vip-form__field vip-form__field--full">
          <span class="vip-form__label">Principal interesse <span class="req">*</span></span>
          <input type="hidden" name="interesse" id="vip-interesse" value="${INTERESSES[0]}" required />
          <div class="vip-form__chips" role="group" aria-label="Principal interesse">
            ${chipsHtml}
          </div>
        </div>
        <div class="vip-form__field vip-form__field--full">
          <label for="vip-msg">Mensagem <span class="opt">(opcional)</span></label>
          <textarea id="vip-msg" name="mensagem" rows="3" placeholder="Conte um pouco sobre seu objetivo ou dúvida…"></textarea>
        </div>
      </div>
      <label class="vip-form__consent">
        <input type="checkbox" name="consent" required />
        <span>Autorizo o contato da Antonov Center sobre a inauguração e condições de abertura.</span>
      </label>
      <p class="vip-form__error" id="vip-form-error" hidden></p>
      <button type="submit" class="vip-form__submit">
        <span class="vip-form__submit-label">Confirmar pré-cadastro</span>
        <span class="vip-form__submit-meta">VAGAS LIMITADAS <span class="arrow"></span></span>
      </button>
    </form>
    <div class="vip-modal__success" id="vip-success" hidden>
      <div class="vip-modal__success-icon">✓</div>
      <h3>Pré-cadastro confirmado.</h3>
      <p>Em breve nossa equipe entra em contato com prioridade para a inauguração.</p>
      <button type="button" class="btn btn--yellow" data-vip-close>Fechar</button>
    </div>
  </div>
</div>`;

  let modal, form, success, errorEl, interesseInput, lastFocus;

  function saveLocal(lead) {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    list.push(lead);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  async function sendLead(lead) {
    const c = cfg();
    if (c.provider === 'webhook' && c.webhookUrl) {
      const res = await fetch(c.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(lead),
      });
      if (!res.ok) throw new Error('Falha ao enviar. Tente novamente.');
      return;
    }
    if (c.provider === 'supabase' && c.supabase?.url && c.supabase?.anonKey) {
      const res = await fetch(`${c.supabase.url}/rest/v1/${c.supabase.table}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: c.supabase.anonKey,
          Authorization: `Bearer ${c.supabase.anonKey}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          nome: lead.nome,
          email: lead.email,
          telefone: lead.telefone,
          interesse: lead.interesse,
          mensagem: lead.mensagem || null,
          origem: lead.origem,
          created_at: lead.created_at,
        }),
      });
      if (!res.ok) throw new Error('Falha ao registrar. Tente novamente.');
      return;
    }
  }

  function bindChips() {
    const chips = form.querySelectorAll('[data-vip-chip]');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        interesseInput.value = chip.dataset.value || '';
      });
    });
  }

  function openModal() {
    if (!modal) return;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    sessionStorage.setItem(SEEN_KEY, '1');
    const first = modal.querySelector('input:not([type="hidden"]), button, textarea');
    if (first) first.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    if (lastFocus) lastFocus.focus();
  }

  function showSuccess() {
    form.hidden = true;
    success.hidden = false;
    success.querySelector('button')?.focus();
  }

  function mount() {
    const wrap = document.createElement('div');
    wrap.innerHTML = modalHtml;
    document.body.appendChild(wrap.firstElementChild);

    modal = document.getElementById('vip-modal');
    form = document.getElementById('vip-form');
    success = document.getElementById('vip-success');
    errorEl = document.getElementById('vip-form-error');
    interesseInput = document.getElementById('vip-interesse');

    bindChips();

    modal.querySelectorAll('[data-vip-close]').forEach((el) => {
      el.addEventListener('click', closeModal);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && !modal.hidden) closeModal();
    });

    document.addEventListener('click', (e) => {
      const openBtn = e.target.closest('[data-vip-open]');
      if (openBtn) {
        e.preventDefault();
        lastFocus = openBtn;
        openModal();
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      if (!interesseInput.value.trim()) {
        errorEl.textContent = 'Selecione seu principal interesse.';
        errorEl.hidden = false;
        return;
      }
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      const fd = new FormData(form);
      const lead = {
        nome: String(fd.get('nome') || '').trim(),
        telefone: String(fd.get('telefone') || '').trim(),
        email: String(fd.get('email') || '').trim(),
        interesse: String(fd.get('interesse') || '').trim(),
        mensagem: String(fd.get('mensagem') || '').trim(),
        origem: 'pre-cadastro-inauguracao',
        created_at: new Date().toISOString(),
        page: location.pathname,
      };
      const btn = form.querySelector('.vip-form__submit');
      btn.disabled = true;
      try {
        await sendLead(lead);
        saveLocal(lead);
        showSuccess();
      } catch (err) {
        errorEl.textContent = err.message || 'Não foi possível enviar. Tente de novo.';
        errorEl.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });

    if (!sessionStorage.getItem(SEEN_KEY) && document.querySelector('.hero')) {
      window.setTimeout(openModal, 4500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
