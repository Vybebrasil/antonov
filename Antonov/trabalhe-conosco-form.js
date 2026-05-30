/* Formulário de currículo — trabalhe-conosco.html */
(function () {
  'use strict';

  const form = document.getElementById('trabalhe-curriculo-form');
  if (!form) return;

  const cfg = () =>
    window.ANTONOV_LEADS || {
      provider: 'neon',
      apiUrls: { curriculos: '/api/leads/curriculos' },
    };
  const errorEl = document.getElementById('trabalhe-form-error');
  const submitBtn = form.querySelector('.cform__submit');

  async function sendLead(lead) {
    const c = cfg();
    const neonUrl = c.apiUrls?.curriculos || c.apiUrl;
    if (c.provider === 'neon' && neonUrl) {
      const res = await fetch(neonUrl, {
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
      if (!res.ok) throw new Error(data.error || 'Não foi possível enviar. Tente novamente.');
      return;
    }
    if (c.provider === 'local') return;
    throw new Error('Destino de candidaturas não configurado.');
  }

  function showSuccess() {
    const label = submitBtn.querySelector('span:first-child');
    const meta = submitBtn.querySelector('.meta');
    if (label) label.textContent = '✓ Candidatura enviada';
    if (meta) meta.textContent = 'SALVO NO SISTEMA';
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
    const area = String(fd.get('area') || '').trim();
    if (!area) {
      if (errorEl) {
        errorEl.textContent = 'Selecione a área de interesse.';
        errorEl.hidden = false;
      }
      return;
    }

    const mensagem = String(fd.get('mensagem') || '').trim() || null;
    const portfolio = String(fd.get('portfolio') || '').trim() || null;

    const lead = {
      nome: String(fd.get('nome') || '').trim(),
      telefone: String(fd.get('telefone') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      area,
      disponibilidade: String(fd.get('disponibilidade') || '').trim() || null,
      mensagem,
      portfolio,
      page: location.pathname,
    };

    const label = submitBtn.querySelector('span:first-child');
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
