/* RH · Cargos e CBO */

(() => {
  const CBO_URL = 'https://cbo.mte.gov.br';
  const NIVEIS = ['estagiário', 'júnior', 'pleno', 'sênior', 'especialista', 'coordenação', 'gerência'];
  const NIVEL_PERFIL = {
    'estagiário': { foco: 'Aprendizado', autonomia: 'Supervisão constante', frase: 'Executa com orientação' },
    'júnior': { foco: 'Aprendizado', autonomia: 'Supervisão constante', frase: 'Executa com orientação' },
    pleno: { foco: 'Entrega', autonomia: 'Supervisão pontual', frase: 'Entrega com qualidade' },
    'sênior': { foco: 'Liderança técnica', autonomia: 'Autonomia técnica', frase: 'Define como fazer' },
    especialista: { foco: 'Profundidade', autonomia: 'Autonomia técnica plena', frase: 'Cria o estado da arte' },
    'coordenação': { foco: 'Pessoas + entregas', autonomia: 'Autonomia plena', frase: 'Define o que fazer' },
    'gerência': { foco: 'Pessoas + entregas', autonomia: 'Autonomia plena', frase: 'Define o que fazer' },
  };
  const LIST_FIELDS = [
    ['responsabilidades', 'Responsabilidades'],
    ['requisitos_obrigatorios', 'Requisitos obrigatórios'],
    ['requisitos_desejaveis', 'Requisitos desejáveis'],
    ['competencias_hard', 'Competências técnicas (hard)'],
    ['competencias_soft', 'Competências comportamentais (soft)'],
    ['indicadores', 'Indicadores (KPIs)'],
  ];

  const state = {
    cargos: null,
    semDescricao: [],
    cbo: null,
    modelos: null,
    loading: null,
    container: null,
    busca: '',
    inativos: false,
  };

  const esc = (s) => pdiEsc(s).replace(/"/g, '&quot;');
  const key = (s) => String(s ?? '').trim().toLowerCase();
  const lines = (arr) => (Array.isArray(arr) ? arr : []).join('\n');

  function ensureDatalist() {
    let dl = document.getElementById('rh-cargos-list');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'rh-cargos-list';
      document.body.appendChild(dl);
    }
    return dl;
  }

  function fillDatalist() {
    const dl = ensureDatalist();
    const seen = new Set();
    const titulos = [];
    for (const c of state.cargos || []) {
      if (!c.ativo || seen.has(key(c.titulo))) continue;
      seen.add(key(c.titulo));
      titulos.push(c.titulo);
    }
    dl.innerHTML = titulos.map((t) => `<option value="${esc(t)}"></option>`).join('');
  }

  async function loadCargos({ refresh = false } = {}) {
    if (state.cargos && !refresh) return state.cargos;
    if (!state.loading) {
      state.loading = rhApi('/cargos')
        .then((data) => {
          state.cargos = data.cargos || [];
          state.semDescricao = data.sem_descricao || [];
          fillDatalist();
          return state.cargos;
        })
        .finally(() => { state.loading = null; });
    }
    return state.loading;
  }

  /** Atualiza a lista sem propagar erro (ex.: usuário sem acesso ao RH). */
  async function loadCargosSilently(opts) {
    try {
      return await loadCargos(opts);
    } catch {
      ensureDatalist();
      return state.cargos || [];
    }
  }

  async function loadCbo() {
    if (state.cbo) return state.cbo;
    const data = await rhApi('/cargos/cbo');
    state.cbo = data.cbo || [];
    return state.cbo;
  }

  async function loadModelos() {
    if (state.modelos) return state.modelos;
    const data = await rhApi('/cargos/modelos');
    state.modelos = data.modelos || [];
    return state.modelos;
  }

  function findCargoByTitulo(titulo) {
    const k = key(titulo);
    if (!k) return [];
    return (state.cargos || [])
      .filter((c) => key(c.titulo) === k)
      .sort((a, b) => Number(b.ativo) - Number(a.ativo));
  }

  function cargoLabel(c) {
    return c.nivel ? `${c.titulo} · ${c.nivel}` : c.titulo;
  }

  function fmtFaixa(c) {
    const { faixa_salarial_min: min, faixa_salarial_max: max } = c;
    if (min == null && max == null) return null;
    if (min != null && max != null) return `${pdiFmtMoney(min)} a ${pdiFmtMoney(max)}`;
    return min != null ? `a partir de ${pdiFmtMoney(min)}` : `até ${pdiFmtMoney(max)}`;
  }

  /* ---------- Descrição de cargo (texto para cópia) ---------- */

  function descricaoTexto(c) {
    const out = [];
    const bullets = (title, arr) => {
      if (!arr?.length) return;
      out.push('', `## ${title}`, ...arr.map((s) => `- ${s}`));
    };
    out.push(`# Descrição de Cargo — ${cargoLabel(c)}`);
    const meta = [
      c.cbo_codigo ? `CBO: ${c.cbo_codigo}${c.cbo_titulo ? ` - ${c.cbo_titulo}` : ''}` : 'CBO: a definir',
      c.area ? `Área: ${c.area}` : null,
      c.reporta_a ? `Reporta a: ${c.reporta_a}` : null,
    ].filter(Boolean);
    out.push(meta.join(' · '));
    const extra = [c.jornada ? `Jornada: ${c.jornada}` : null, fmtFaixa(c) ? `Faixa salarial: ${fmtFaixa(c)}` : null].filter(Boolean);
    if (extra.length) out.push(extra.join(' · '));
    if (c.missao) out.push('', '## Missão', c.missao);
    const perfil = NIVEL_PERFIL[c.nivel];
    if (perfil) out.push('', `## Nível: ${c.nivel}`, `Foco: ${perfil.foco} · Autonomia: ${perfil.autonomia} · "${perfil.frase}"`);
    bullets('Responsabilidades', c.responsabilidades);
    bullets('Requisitos obrigatórios', c.requisitos_obrigatorios);
    bullets('Requisitos desejáveis', c.requisitos_desejaveis);
    if (c.competencias_hard?.length || c.competencias_soft?.length) {
      out.push('', '## Competências');
      if (c.competencias_hard?.length) out.push(`- Hard: ${c.competencias_hard.join(', ')}`);
      if (c.competencias_soft?.length) out.push(`- Soft: ${c.competencias_soft.join(', ')}`);
    }
    bullets('Indicadores', c.indicadores);
    out.push('', '## Relação com CBO');
    out.push(c.cbo_codigo ? `Código: ${c.cbo_codigo}${c.cbo_titulo ? ` (${c.cbo_titulo})` : ''}` : 'Código: a definir');
    out.push(`Conferência oficial: ${CBO_URL}`);
    return out.join('\n');
  }

  function descricaoHtml(c) {
    const list = (title, arr) => (arr?.length
      ? `<h4 class="pdi-section-title">${pdiEsc(title)}</h4><ul class="rh-cg-doc__list">${arr.map((s) => `<li>${pdiEsc(s)}</li>`).join('')}</ul>`
      : '');
    const chips = (arr) => arr.map((s) => `<span class="rh-cg-chip">${pdiEsc(s)}</span>`).join('');
    const perfil = NIVEL_PERFIL[c.nivel];
    const faixa = fmtFaixa(c);
    return `
      <article class="rh-cg-doc">
        <header class="rh-cg-doc__head">
          <h3>Descrição de cargo — ${pdiEsc(cargoLabel(c))}</h3>
          <p class="pdi-muted">
            <strong>CBO:</strong> ${c.cbo_codigo ? `${pdiEsc(c.cbo_codigo)}${c.cbo_titulo ? ` - ${pdiEsc(c.cbo_titulo)}` : ''}` : 'a definir'}
            ${c.area ? ` · <strong>Área:</strong> ${pdiEsc(c.area)}` : ''}
            ${c.reporta_a ? ` · <strong>Reporta a:</strong> ${pdiEsc(c.reporta_a)}` : ''}
          </p>
          ${c.jornada || faixa ? `<p class="pdi-muted">${c.jornada ? `<strong>Jornada:</strong> ${pdiEsc(c.jornada)}` : ''}${c.jornada && faixa ? ' · ' : ''}${faixa ? `<strong>Faixa salarial:</strong> ${pdiEsc(faixa)}` : ''}</p>` : ''}
          ${c.ativo === false ? '<span class="pdi-badge pdi-badge--muted">Inativo</span>' : ''}
        </header>
        ${c.missao ? `<h4 class="pdi-section-title">Missão</h4><p>${pdiEsc(c.missao)}</p>` : ''}
        ${perfil ? `<div class="rh-cg-nivel"><strong>Nível ${pdiEsc(c.nivel)}</strong> · Foco: ${pdiEsc(perfil.foco)} · Autonomia: ${pdiEsc(perfil.autonomia)} · <em>"${pdiEsc(perfil.frase)}"</em></div>` : ''}
        ${list('Responsabilidades', c.responsabilidades)}
        ${list('Requisitos obrigatórios', c.requisitos_obrigatorios)}
        ${list('Requisitos desejáveis', c.requisitos_desejaveis)}
        ${c.competencias_hard?.length || c.competencias_soft?.length ? `
          <h4 class="pdi-section-title">Competências</h4>
          ${c.competencias_hard?.length ? `<p class="rh-cg-chips"><span class="pdi-muted">Hard:</span> ${chips(c.competencias_hard)}</p>` : ''}
          ${c.competencias_soft?.length ? `<p class="rh-cg-chips"><span class="pdi-muted">Soft:</span> ${chips(c.competencias_soft)}</p>` : ''}` : ''}
        ${list('Indicadores (KPIs)', c.indicadores)}
        <p class="pdi-muted rh-cg-doc__foot">Confira o código na <a href="${CBO_URL}" target="_blank" rel="noopener">CBO oficial (cbo.mte.gov.br)</a>.</p>
      </article>`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function openDescricao(c, { onChanged } = {}) {
    const box = rhOpenModal(`
      <div class="rh-cg-modal">
        ${descricaoHtml(c)}
        <p class="rh-cg-copy-msg pdi-muted" hidden></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-rh-close>Fechar</button>
          <button type="button" class="btn btn-secondary" data-cg-edit>Editar</button>
          <button type="button" class="btn btn-primary" data-cg-copy>Copiar texto</button>
        </div>
      </div>`);
    if (!box) return;
    box.querySelector('[data-cg-copy]').addEventListener('click', async () => {
      const ok = await copyText(descricaoTexto(c));
      const msg = box.querySelector('.rh-cg-copy-msg');
      msg.textContent = ok ? 'Texto copiado para a área de transferência.' : 'Não foi possível copiar automaticamente.';
      msg.hidden = false;
    });
    box.querySelector('[data-cg-edit]').addEventListener('click', () => openEditor(c, { onSaved: onChanged }));
  }

  /* ---------- Editor ---------- */

  async function openEditor(cargo = {}, { onSaved } = {}) {
    const isEdit = Boolean(cargo.id);
    let catalogo = [];
    try { catalogo = await loadCbo(); } catch { catalogo = []; }
    const nivelOpts = ['<option value="">— sem nível —</option>']
      .concat(NIVEIS.map((n) => `<option value="${esc(n)}"${cargo.nivel === n ? ' selected' : ''}>${pdiEsc(n)}</option>`))
      .join('');
    const area = (name, label, rows = 4) => `
      <label class="rh-cg-span2"><span>${pdiEsc(label)} <small class="pdi-muted">(um item por linha)</small></span>
        <textarea name="${name}" rows="${rows}">${pdiEsc(lines(cargo[name]))}</textarea></label>`;
    const box = rhOpenModal(`
      <div class="rh-cg-modal">
        <h3>${isEdit ? 'Editar cargo' : 'Novo cargo'}</h3>
        <form class="pdi-form rh-cg-form" novalidate>
          <div class="rh-cg-form__grid">
            <label class="rh-cg-span2"><span>Título do cargo *</span>
              <input name="titulo" required maxlength="160" value="${esc(cargo.titulo)}" placeholder="Ex.: Professor de musculação"></label>
            <label><span>Nível</span><select name="nivel">${nivelOpts}</select></label>
            <label><span>Área</span><input name="area" maxlength="120" value="${esc(cargo.area)}" placeholder="Técnica, Atendimento..."></label>
            <label><span>Código CBO</span>
              <input name="cbo_codigo" list="rh-cg-cbo-codes" inputmode="numeric" maxlength="7" placeholder="0000-00" value="${esc(cargo.cbo_codigo)}"></label>
            <label><span>Ocupação CBO</span>
              <input name="cbo_titulo" list="rh-cg-cbo-titles" maxlength="200" placeholder="Digite para buscar no catálogo" value="${esc(cargo.cbo_titulo)}"></label>
            <p class="rh-cg-span2 pdi-muted rh-cg-hint">Sugestões vêm de um catálogo com ocupações comuns em academias. Confira sempre na <a href="${CBO_URL}" target="_blank" rel="noopener">CBO oficial (cbo.mte.gov.br)</a>.</p>
            <label><span>Reporta a</span><input name="reporta_a" maxlength="160" value="${esc(cargo.reporta_a)}" list="rh-cargos-list"></label>
            <label><span>Jornada</span><input name="jornada" maxlength="300" value="${esc(cargo.jornada)}" placeholder="Ex.: 44h semanais em escala"></label>
            <label><span>Faixa salarial mínima (R$)</span><input name="faixa_salarial_min" type="number" min="0" step="0.01" value="${esc(cargo.faixa_salarial_min ?? '')}"></label>
            <label><span>Faixa salarial máxima (R$)</span><input name="faixa_salarial_max" type="number" min="0" step="0.01" value="${esc(cargo.faixa_salarial_max ?? '')}"></label>
            <label class="rh-cg-span2"><span>Missão do cargo</span>
              <textarea name="missao" rows="3" placeholder="O que o cargo entrega para a academia">${pdiEsc(cargo.missao)}</textarea></label>
            ${LIST_FIELDS.map(([name, label]) => area(name, label)).join('')}
            ${isEdit ? `<label class="rh-cg-check rh-cg-span2"><input type="checkbox" name="ativo"${cargo.ativo !== false ? ' checked' : ''}> <span>Cargo ativo</span></label>` : ''}
          </div>
          <datalist id="rh-cg-cbo-codes">${catalogo.map((c) => `<option value="${esc(c.codigo)}">${pdiEsc(c.titulo)}</option>`).join('')}</datalist>
          <datalist id="rh-cg-cbo-titles">${catalogo.map((c) => `<option value="${esc(c.titulo)}">${pdiEsc(c.codigo)} · ${pdiEsc(c.familia)}</option>`).join('')}</datalist>
          <p class="form-error" hidden></p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-rh-close>Cancelar</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar alterações' : 'Criar cargo'}</button>
          </div>
        </form>
      </div>`);
    if (!box) return;
    const form = box.querySelector('form');
    const errEl = form.querySelector('.form-error');
    const codeIn = form.elements.cbo_codigo;
    const titleIn = form.elements.cbo_titulo;

    codeIn.addEventListener('input', () => {
      const digits = codeIn.value.replace(/\D/g, '').slice(0, 6);
      if (digits.length > 4) codeIn.value = `${digits.slice(0, 4)}-${digits.slice(4)}`;
      const hit = catalogo.find((c) => c.codigo === codeIn.value);
      if (hit) {
        titleIn.value = hit.titulo;
        if (!form.elements.area.value) form.elements.area.value = hit.area;
      }
    });
    titleIn.addEventListener('input', () => {
      const hit = catalogo.find((c) => key(c.titulo) === key(titleIn.value));
      if (hit) {
        codeIn.value = hit.codigo;
        if (!form.elements.area.value) form.elements.area.value = hit.area;
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.hidden = true;
      const f = form.elements;
      const cbo = f.cbo_codigo.value.trim();
      if (!f.titulo.value.trim()) {
        errEl.textContent = 'Informe o título do cargo.';
        errEl.hidden = false;
        f.titulo.focus();
        return;
      }
      if (cbo && !/^\d{4}-\d{2}$/.test(cbo)) {
        errEl.textContent = 'Código CBO deve ter o formato 0000-00 (ex.: 2241-20).';
        errEl.hidden = false;
        f.cbo_codigo.focus();
        return;
      }
      const payload = {
        titulo: f.titulo.value,
        nivel: f.nivel.value,
        area: f.area.value,
        cbo_codigo: cbo,
        cbo_titulo: f.cbo_titulo.value,
        reporta_a: f.reporta_a.value,
        jornada: f.jornada.value,
        faixa_salarial_min: f.faixa_salarial_min.value,
        faixa_salarial_max: f.faixa_salarial_max.value,
        missao: f.missao.value,
      };
      for (const [name] of LIST_FIELDS) payload[name] = pdiLines(f[name].value);
      if (isEdit) payload.ativo = f.ativo.checked;
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        const data = await rhApi(isEdit ? `/cargos/${cargo.id}` : '/cargos', {
          method: isEdit ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        });
        rhCloseModal();
        await loadCargosSilently({ refresh: true });
        rerenderModule();
        onSaved?.(data.cargo);
      } catch (err) {
        errEl.textContent = err.message || 'Erro ao salvar.';
        errEl.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
    form.elements.titulo.focus();
  }

  async function openModelos({ onSaved } = {}) {
    let modelos;
    try {
      modelos = await loadModelos();
    } catch (err) {
      alert(err.message);
      return;
    }
    const box = rhOpenModal(`
      <div class="rh-cg-modal">
        <h3>Criar a partir de modelo</h3>
        <p class="pdi-muted">Escolha um modelo. Você poderá revisar e editar tudo antes de salvar.</p>
        <div class="rh-cg-modelos">
          ${modelos.map((m) => `
            <button type="button" class="rh-cg-modelo" data-cg-modelo="${esc(m.id)}">
              <strong>${pdiEsc(m.titulo)}</strong>
              <span class="pdi-muted">${pdiEsc([m.nivel, m.area, m.cbo_codigo ? `CBO ${m.cbo_codigo}` : 'CBO a definir'].filter(Boolean).join(' · '))}</span>
              <span class="rh-cg-modelo__missao">${pdiEsc(m.missao)}</span>
            </button>`).join('')}
        </div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-rh-close>Cancelar</button></div>
      </div>`);
    box?.querySelectorAll('[data-cg-modelo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = modelos.find((x) => x.id === btn.dataset.cgModelo);
        if (!m) return;
        const { id, ...dados } = m;
        openEditor(dados, { onSaved });
      });
    });
  }

  async function removeCargo(c) {
    const msg = c.colaboradores > 0
      ? `"${cargoLabel(c)}" tem ${c.colaboradores} colaborador(es). Ele será marcado como inativo em vez de excluído. Continuar?`
      : `Excluir o cargo "${cargoLabel(c)}"?`;
    if (!confirm(msg)) return;
    try {
      const r = await rhApi(`/cargos/${c.id}`, { method: 'DELETE' });
      if (r.inativado) alert(r.message);
      await loadCargosSilently({ refresh: true });
      rerenderModule();
    } catch (err) {
      alert(err.message);
    }
  }

  /* ---------- Aba ---------- */

  function cardHtml(c) {
    const n = Number(c.colaboradores) || 0;
    return `
      <article class="rh-cg-card${c.ativo ? '' : ' rh-cg-card--off'}" data-cg-id="${esc(c.id)}">
        <div class="rh-cg-card__top">
          <h4 class="rh-cg-card__title">${pdiEsc(c.titulo)}</h4>
          ${c.nivel ? `<span class="pdi-badge pdi-badge--ativo">${pdiEsc(c.nivel)}</span>` : ''}
          ${c.ativo ? '' : '<span class="pdi-badge pdi-badge--muted">Inativo</span>'}
        </div>
        <p class="rh-cg-card__meta">
          <span>${c.cbo_codigo ? `CBO ${pdiEsc(c.cbo_codigo)}${c.cbo_titulo ? ` · ${pdiEsc(c.cbo_titulo)}` : ''}` : '<span class="pdi-muted">CBO a definir</span>'}</span>
          ${c.area ? `<span>${pdiEsc(c.area)}</span>` : ''}
        </p>
        <p class="rh-cg-card__count"><strong>${n}</strong> ${n === 1 ? 'colaborador' : 'colaboradores'}</p>
        <div class="rh-cg-card__actions">
          <button type="button" class="btn btn-secondary btn-sm" data-cg-action="ver">Descrição</button>
          <button type="button" class="btn btn-ghost btn-sm" data-cg-action="editar">Editar</button>
          <button type="button" class="btn btn-ghost btn-sm" data-cg-action="excluir">Excluir</button>
        </div>
      </article>`;
  }

  function filteredCargos() {
    const q = key(state.busca);
    return (state.cargos || []).filter((c) => {
      if (!state.inativos && !c.ativo) return false;
      if (!q) return true;
      return [c.titulo, c.nivel, c.area, c.cbo_codigo, c.cbo_titulo].some((v) => key(v).includes(q));
    });
  }

  function renderList() {
    const host = state.container?.querySelector('.rh-cg-grid');
    if (!host) return;
    const list = filteredCargos();
    host.innerHTML = list.length
      ? list.map(cardHtml).join('')
      : `<p class="rh-empty">${(state.cargos || []).length ? 'Nenhum cargo encontrado com esse filtro.' : 'Nenhum cargo cadastrado ainda. Comece por um modelo pronto.'}</p>`;
  }

  function renderModule(container) {
    state.container = container;
    const cargos = state.cargos || [];
    const ativos = cargos.filter((c) => c.ativo);
    const comColab = ativos.reduce((s, c) => s + (Number(c.colaboradores) || 0), 0);
    const sem = state.semDescricao || [];
    container.innerHTML = `
      <div class="rh-cg">
        <div class="rh-view-head">
          <div>
            <h3>Cargos e CBO</h3>
            <p>Descrições de cargo com código CBO, responsabilidades, competências e indicadores. Confira os códigos na <a href="${CBO_URL}" target="_blank" rel="noopener">CBO oficial</a>.</p>
          </div>
          <div class="rh-view-head__actions">
            <button type="button" class="btn btn-secondary" data-cg-top="modelo">Criar a partir de modelo</button>
            <button type="button" class="btn btn-primary" data-cg-top="novo">Novo cargo</button>
          </div>
        </div>
        <div class="pdi-stats">
          <div class="pdi-stat"><span class="pdi-stat__val">${ativos.length}</span><span class="pdi-stat__lbl">Cargos ativos</span></div>
          <div class="pdi-stat"><span class="pdi-stat__val">${comColab}</span><span class="pdi-stat__lbl">Colaboradores em cargos descritos</span></div>
          <div class="pdi-stat${sem.length ? ' pdi-stat--warn' : ''}"><span class="pdi-stat__val">${sem.length}</span><span class="pdi-stat__lbl">Cargos sem descrição</span></div>
        </div>
        ${sem.length ? `
          <div class="card rh-cg-sem">
            <h4 class="pdi-section-title">Cargos usados por colaboradores, sem descrição</h4>
            <div class="rh-cg-sem__list">
              ${sem.map((s) => `
                <button type="button" class="rh-cg-sem__item" data-cg-sem="${esc(s.cargo)}" title="Cadastrar este cargo">
                  <span>${pdiEsc(s.cargo)}</span><small>${s.colaboradores}</small><b>+ Cadastrar</b>
                </button>`).join('')}
            </div>
          </div>` : ''}
        <div class="rh-cg-toolbar">
          <input type="search" class="rh-cg-search" placeholder="Buscar por título, nível, área ou CBO" value="${esc(state.busca)}" aria-label="Buscar cargos">
          <label class="rh-cg-check"><input type="checkbox" class="rh-cg-inativos"${state.inativos ? ' checked' : ''}> <span>Mostrar inativos</span></label>
        </div>
        <div class="rh-cg-grid"></div>
      </div>`;
    renderList();

    container.querySelector('[data-cg-top="novo"]').addEventListener('click', () => openEditor({}));
    container.querySelector('[data-cg-top="modelo"]').addEventListener('click', () => openModelos());
    container.querySelector('.rh-cg-search').addEventListener('input', (e) => {
      state.busca = e.target.value;
      renderList();
    });
    container.querySelector('.rh-cg-inativos').addEventListener('change', (e) => {
      state.inativos = e.target.checked;
      renderList();
    });
    container.querySelectorAll('[data-cg-sem]').forEach((btn) => {
      btn.addEventListener('click', () => openEditor({ titulo: btn.dataset.cgSem }));
    });
    container.querySelector('.rh-cg-grid').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cg-action]');
      if (!btn) return;
      const c = (state.cargos || []).find((x) => x.id === btn.closest('[data-cg-id]')?.dataset.cgId);
      if (!c) return;
      if (btn.dataset.cgAction === 'ver') openDescricao(c);
      else if (btn.dataset.cgAction === 'editar') openEditor(c);
      else if (btn.dataset.cgAction === 'excluir') removeCargo(c);
    });
  }

  function rerenderModule() {
    if (state.container?.isConnected && state.container.querySelector('.rh-cg')) renderModule(state.container);
  }

  if (document.body) ensureDatalist();
  else document.addEventListener('DOMContentLoaded', ensureDatalist, { once: true });

  rhRegisterModule('cargos', {
    label: 'Cargos',
    async onOpen(container) {
      if (!state.cargos) container.innerHTML = '<p class="pdi-muted">Carregando cargos…</p>';
      await loadCargos({ refresh: true });
      renderModule(container);
    },
  });

  /* ---------- Quadro do gestor ---------- */

  rhRegisterGestorWidget({
    id: 'cargos',
    order: 80,
    async render(container) {
      await loadCargosSilently({ refresh: true });
      const sem = state.semDescricao || [];
      if (!sem.length) {
        container.innerHTML = '';
        return;
      }
      const top = sem.slice(0, 6);
      container.innerHTML = `
        <article class="card rh-cg-widget">
          <h4 class="pdi-section-title">Cargos sem descrição</h4>
          <p class="pdi-muted">${sem.length} cargo(s) usado(s) por colaboradores ainda sem descrição e CBO.</p>
          <ul class="rh-cg-widget__list">
            ${top.map((s) => `<li><span>${pdiEsc(s.cargo)}</span><small class="pdi-muted">${s.colaboradores} colab.</small><button type="button" class="btn btn-ghost btn-sm" data-cg-sem="${esc(s.cargo)}">Cadastrar</button></li>`).join('')}
          </ul>
          ${sem.length > top.length ? `<p class="pdi-muted">e mais ${sem.length - top.length}…</p>` : ''}
          <button type="button" class="btn btn-secondary btn-sm" data-cg-goto>Ver cargos</button>
        </article>`;
      container.querySelectorAll('[data-cg-sem]').forEach((btn) => {
        btn.addEventListener('click', () => openEditor({ titulo: btn.dataset.cgSem }, {
          onSaved: () => this.render(container),
        }));
      });
      container.querySelector('[data-cg-goto]')?.addEventListener('click', () => {
        if (typeof rhGoTo === 'function') rhGoTo('cargos');
      });
    },
  });

  /* ---------- Bloco na ficha do colaborador ---------- */

  rhRegisterColabSection({
    id: 'cargos',
    order: 50,
    async render(container, colaborador) {
      const titulo = String(colaborador?.cargo_atual || '').trim();
      if (!titulo) {
        container.innerHTML = '';
        return;
      }
      await loadCargos();
      const rerender = () => this.render(container, colaborador);
      const matches = findCargoByTitulo(titulo);
      if (!matches.length) {
        container.innerHTML = `
          <div class="card rh-cg-colab">
            <h4 class="pdi-section-title">Cargo: ${pdiEsc(titulo)}</h4>
            <p class="pdi-muted">Este cargo ainda não tem descrição nem código CBO cadastrados.</p>
            <button type="button" class="btn btn-secondary btn-sm" data-cg-new>Cadastrar este cargo</button>
          </div>`;
        container.querySelector('[data-cg-new]').addEventListener('click', () => {
          openEditor({ titulo }, { onSaved: rerender });
        });
        return;
      }
      const c = matches[0];
      const outros = matches.slice(1).map((m) => m.nivel || 'sem nível');
      const comps = [...(c.competencias_hard || []), ...(c.competencias_soft || [])].slice(0, 8);
      container.innerHTML = `
        <div class="card rh-cg-colab">
          <h4 class="pdi-section-title">Cargo: ${pdiEsc(cargoLabel(c))}</h4>
          <p class="rh-cg-card__meta">
            <span>${c.cbo_codigo ? `CBO ${pdiEsc(c.cbo_codigo)}${c.cbo_titulo ? ` · ${pdiEsc(c.cbo_titulo)}` : ''}` : '<span class="pdi-muted">CBO a definir</span>'}</span>
            ${c.ativo ? '' : '<span class="pdi-badge pdi-badge--muted">Inativo</span>'}
          </p>
          ${c.missao ? `<p>${pdiEsc(c.missao)}</p>` : '<p class="pdi-muted">Missão não preenchida.</p>'}
          ${comps.length ? `<p class="rh-cg-chips">${comps.map((s) => `<span class="rh-cg-chip">${pdiEsc(s)}</span>`).join('')}</p>` : ''}
          ${outros.length ? `<p class="pdi-muted">Também cadastrado nos níveis: ${pdiEsc(outros.join(', '))}.</p>` : ''}
          <button type="button" class="btn btn-secondary btn-sm" data-cg-ver>Ver descrição completa</button>
        </div>`;
      container.querySelector('[data-cg-ver]').addEventListener('click', () => openDescricao(c, { onChanged: rerender }));
    },
  });
})();
