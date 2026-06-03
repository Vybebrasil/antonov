/* Formulário de contato — contato.html */
(function () {
  'use strict';

  const form = document.getElementById('contato-tour-form');
  if (!form) return;

  const cfg = () =>
    window.ANTONOV_LEADS || {
      provider: 'neon',
      apiUrls: { tour: '/api/leads/tour' },
    };
  const chips = form.querySelectorAll('.cform__chip');
  const interesseInput = document.getElementById('contato-interesse');
  const errorEl = document.getElementById('cform-error');
  const submitBtn = form.querySelector('.cform__submit');

  const TZ = 'America/Bahia';
  const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  function todayInBahia() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  function addCalendarDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  function weekdayFromDateStr(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const noonUtc = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
    const en = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(noonUtc);
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return WEEKDAYS[map[en] ?? 0];
  }

  function formatShortDate(dateStr) {
    const [, month, day] = dateStr.split('-').map(Number);
    return `${day}/${MONTHS[month - 1]}`;
  }

  function populateMelhorDiaSelect() {
    const select = document.getElementById('contato-dia');
    if (!select) return;

    const today = todayInBahia();
    const labels = [
      `Hoje · ${formatShortDate(today)}`,
      `Amanhã · ${formatShortDate(addCalendarDays(today, 1))}`,
    ];

    for (let offset = 2; offset <= 3; offset += 1) {
      const dateStr = addCalendarDays(today, offset);
      labels.push(`${weekdayFromDateStr(dateStr)} · ${formatShortDate(dateStr)}`);
    }

    labels.push('Próxima semana');

    select.replaceChildren(
      ...labels.map((label) => {
        const opt = document.createElement('option');
        opt.textContent = label;
        return opt;
      })
    );
  }

  populateMelhorDiaSelect();

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      if (interesseInput) interesseInput.value = chip.textContent.trim();
    });
  });

  async function sendLead(lead) {
    const c = cfg();
    const neonUrl = c.apiUrls?.tour || c.apiUrl;
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
    throw new Error('Destino de leads não configurado.');
  }

  function showSuccess() {
    const label = submitBtn.querySelector('span');
    if (label) label.textContent = '✓ Mensagem enviada';
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
