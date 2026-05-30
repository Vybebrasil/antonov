/* Formulário de tour — contato.html */
(function () {
  'use strict';

  const form = document.getElementById('contato-tour-form');
  if (!form) return;

  const cfg = () => window.ANTONOV_LEADS || { provider: 'neon', apiUrl: '/api/leads' };
  const chips = form.querySelectorAll('.cform__chip');
  const interesseInput = document.getElementById('contato-interesse');
  const errorEl = document.getElementById('cform-error');
  const submitBtn = form.querySelector('.cform__submit');

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      if (interesseInput) interesseInput.value = chip.textContent.trim();
    });
  });

  async function sendLead(lead) {
    const c = cfg();
    if (c.provider === 'neon' && c.apiUrl) {
      const res = await fetch(c.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(lead),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        /* resposta não-JSON */
      }
      if (!res.ok) throw new Error(data.error || 'Não foi possível agendar. Tente novamente.');
      return;
    }
    if (c.provider === 'local') return;
    throw new Error('Destino de leads não configurado.');
  }

  function showSuccess() {
    const label = submitBtn.querySelector('span');
    if (label) label.textContent = '✓ Tour agendado';
    submitBtn.style.background = '#1F8A5B';
    submitBtn.style.color = '#fff';
    submitBtn.disabled = true;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.hidden = true;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const fd = new FormData(form);
    const interesse = String(fd.get('interesse') || '').trim();
    if (!interesse) {
      if (errorEl) {
        errorEl.textContent = 'Selecione seu interesse principal.';
        errorEl.hidden = false;
      }
      return;
    }

    const mensagem = String(fd.get('mensagem') || '').trim();
    const lead = {
      nome: String(fd.get('nome') || '').trim(),
      telefone: String(fd.get('telefone') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      interesse,
      mensagem: mensagem || null,
      melhor_dia: String(fd.get('melhor_dia') || '').trim() || null,
      melhor_turno: String(fd.get('melhor_turno') || '').trim() || null,
      origem: 'contato-tour',
      page: location.pathname,
    };

    const label = submitBtn.querySelector('span');
    const prevLabel = label ? label.textContent : '';
    submitBtn.disabled = true;
    if (label) label.textContent = 'Enviando…';
    try {
      await sendLead(lead);
      showSuccess();
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || 'Erro ao enviar.';
        errorEl.hidden = false;
      }
      submitBtn.disabled = false;
      if (label) label.textContent = prevLabel;
    }
  });
})();
