/* RH · Trilhas de aprendizagem (4 camadas: fundamentos, especialização, stretch, mentoria) */

(() => {
  const CAMADAS = {
    1: { nome: 'Fundamentos', desc: 'Obrigatórios para todos da trilha' },
    2: { nome: 'Especialização', desc: 'Domínio do nível atual' },
    3: { nome: 'Stretch', desc: 'Sinais do próximo nível' },
    4: { nome: 'Mentoria', desc: '1:1 quinzenal com mentor designado' },
  };
  const TIPOS = {
    curso: 'Curso',
    livro: 'Livro',
    workshop: 'Workshop',
    video: 'Vídeo',
    mentoria: 'Mentoria',
    pratica: 'Prática',
    certificacao: 'Certificação',
  };
  const STATUS = {
    ativa: { label: 'Ativa', cls: 'ativo' },
    concluida: { label: 'Concluída', cls: 'muted' },
    pausada: { label: 'Pausada', cls: 'pending' },
  };
  const KPI_STATUS = {
    atingido: { label: 'Meta atingida', cls: 'ativo' },
    no_ritmo: { label: 'No ritmo', cls: 'ativo' },
    fora_ritmo: { label: 'Fora do ritmo', cls: 'warn' },
    nao_atingido: { label: 'Meta não atingida', cls: 'danger' },
    sem_itens: { label: 'Sem itens', cls: 'muted' },
  };

  const state = { container: null, trilhaId: null, trilha: null };

  const esc = (s) => pdiEsc(s);
  const attr = (s) => pdiEsc(s ?? '').replace(/"/g, '&quot;');
  const fmtH = (n) => `${Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h`;
  const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const badge = (txt, cls) => `<span class="pdi-badge pdi-badge--${cls}">${esc(txt)}</span>`;
  const bar = (pct, cls = '') => `<div class="pdi-progress rh-tr-bar ${cls}"><span style="width:${Math.max(0, Math.min(100, Number(pct) || 0))}%"></span></div>`;
  const safeLink = (url) => (/^https?:\/\//i.test(url || '') ? url : null);

  function niveis(t) {
    if (t.nivel_inicial && t.nivel_alvo) return `${t.nivel_inicial} → ${t.nivel_alvo}`;
    return t.nivel_inicial || t.nivel_alvo || '';
  }

  function subtitulo(t) {
    return [t.cargo_titulo, niveis(t), t.area].filter(Boolean).map(esc).join(' · ');
  }

  function showErr(box, sel, err) {
    const el = box?.querySelector(sel);
    if (!el) return alert(err.message || err);
    el.textContent = err.message || String(err);
    el.hidden = false;
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  /* ---------------- lista ---------------- */

  async function renderLista() {
    const el = state.container;
    el.innerHTML = '<p class="pdi-muted">Carregando trilhas…</p>';
    const { trilhas, resumo } = await rhApi('/trilhas');
    el.innerHTML = `
      <div class="rh-tr">
        <div class="rh-view-head">
          <div>
            <h3>Trilhas de aprendizagem</h3>
            <p>Planos de capacitação em 4 camadas (fundamentos, especialização, stretch e mentoria), com tempo protegido, orçamento e metas de conclusão.</p>
          </div>
          <div class="rh-view-head__actions">
            <button type="button" class="btn btn-secondary" data-tr-modelos>Criar a partir de modelo</button>
            <button type="button" class="btn btn-primary" data-tr-nova>Nova trilha</button>
          </div>
        </div>
        <div class="pdi-stats rh-tr-stats">
          <div class="pdi-stat"><span class="pdi-stat__val">${resumo.trilhas_ativas}</span><span class="pdi-stat__lbl">Trilhas ativas</span></div>
          <div class="pdi-stat"><span class="pdi-stat__val">${resumo.atribuicoes}</span><span class="pdi-stat__lbl">Colaboradores em trilha</span></div>
          <div class="pdi-stat"><span class="pdi-stat__val">${resumo.conclusao_media == null ? '—' : `${resumo.conclusao_media}%`}</span><span class="pdi-stat__lbl">Conclusão média</span></div>
          <div class="pdi-stat ${resumo.atrasadas ? 'pdi-stat--warn' : ''}"><span class="pdi-stat__val">${resumo.atrasadas}</span><span class="pdi-stat__lbl">Prazos vencidos</span></div>
          <div class="pdi-stat ${resumo.fora_ritmo ? 'pdi-stat--warn' : ''}"><span class="pdi-stat__val">${resumo.fora_ritmo}</span><span class="pdi-stat__lbl">Fora do ritmo</span></div>
        </div>
        ${trilhas.length ? `<div class="rh-tr-grid">${trilhas.map(cardTrilha).join('')}</div>` : `
          <div class="card rh-empty">
            <p>Nenhuma trilha cadastrada.</p>
            <p class="pdi-muted">Comece por um modelo (professor de musculação, recepção ou liderança) e ajuste à realidade da academia.</p>
          </div>`}
      </div>`;
    el.querySelector('[data-tr-nova]')?.addEventListener('click', () => abrirFormTrilha(null));
    el.querySelector('[data-tr-modelos]')?.addEventListener('click', abrirModelos);
    el.querySelectorAll('[data-tr-open]').forEach((card) => {
      const open = () => abrirTrilha(card.dataset.trOpen);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      });
    });
  }

  function cardTrilha(t) {
    const camadas = [1, 2, 3, 4].map((c) => `<span class="rh-tr-chip ${t.camadas[c].itens ? '' : 'rh-tr-chip--vazia'}" title="${attr(CAMADAS[c].nome)}">C${c}·${t.camadas[c].itens}</span>`).join('');
    return `
      <article class="card rh-tr-card ${t.ativa ? '' : 'rh-tr-card--inativa'}" data-tr-open="${attr(t.id)}" tabindex="0" role="button" aria-label="Abrir trilha ${attr(t.titulo)}">
        <div class="rh-tr-card__head">
          <h4>${esc(t.titulo)}</h4>
          ${t.ativa ? '' : badge('Inativa', 'muted')}
        </div>
        <p class="pdi-muted rh-tr-card__sub">${subtitulo(t) || 'Sem cargo/nível definido'}</p>
        <div class="rh-tr-chips">${camadas}</div>
        <dl class="rh-tr-meta">
          <div><dt>Tempo/mês</dt><dd>${t.horas_mes ? fmtH(t.horas_mes) : '—'}</dd></div>
          <div><dt>Carga total</dt><dd>${fmtH(t.horas_total)}</dd></div>
          <div><dt>Custo</dt><dd>${pdiFmtMoney(t.custo_total)}</dd></div>
          <div><dt>Atribuídos</dt><dd>${t.atribuidos}</dd></div>
        </dl>
        <div class="rh-tr-card__prog">
          <span>Conclusão média</span>
          <strong>${t.conclusao_media == null ? '—' : `${t.conclusao_media}%`}</strong>
        </div>
        ${bar(t.conclusao_media || 0)}
        <div class="rh-tr-card__flags">
          ${t.atrasadas ? badge(`${t.atrasadas} com prazo vencido`, 'danger') : ''}
          ${t.fora_ritmo ? badge(`${t.fora_ritmo} fora do ritmo`, 'warn') : ''}
          ${t.sem_mentor ? badge(`${t.sem_mentor} sem mentor`, 'warn') : ''}
          ${t.dicas_count ? badge(`${t.dicas_count} ${t.dicas_count === 1 ? 'dica' : 'dicas'}`, 'pending') : ''}
        </div>
      </article>`;
  }

  /* ---------------- modelos ---------------- */

  async function abrirModelos() {
    const box = rhOpenModal('<h3>Criar a partir de modelo</h3><p class="pdi-muted">Carregando…</p>');
    try {
      const { modelos } = await rhApi('/trilhas/modelos');
      box.innerHTML = `
        <h3>Criar a partir de modelo</h3>
        <p class="pdi-muted">O modelo é copiado como uma nova trilha para você editar. Custos e links ficam em branco para preencher com os fornecedores escolhidos.</p>
        <div class="rh-tr-modelos">
          ${modelos.map((m) => `
            <div class="rh-tr-modelo">
              <div class="rh-tr-modelo__head">
                <div>
                  <strong>${esc(m.titulo)}</strong>
                  <p class="pdi-muted">${esc([m.cargo_titulo, `${m.nivel_inicial} → ${m.nivel_alvo}`].join(' · '))}</p>
                </div>
                <button type="button" class="btn btn-primary btn-sm" data-tr-usar="${attr(m.chave)}">Criar</button>
              </div>
              <p>${esc(m.descricao)}</p>
              <p class="pdi-muted">${m.itens} itens · ${fmtH(m.horas_total)} · ${m.duracao_meses} meses · ${m.horas_mes}h/mês</p>
              <details>
                <summary>Ver itens</summary>
                ${[1, 2, 3, 4].map((c) => `
                  <p class="rh-tr-modelo__camada">Camada ${c} · ${esc(CAMADAS[c].nome)}</p>
                  <ul>${m.lista.filter((i) => i.camada === c).map((i) => `<li>[${esc(TIPOS[i.tipo])}] ${esc(i.titulo)} (${fmtH(i.horas)})</li>`).join('')}</ul>`).join('')}
              </details>
            </div>`).join('')}
        </div>
        <p class="form-error" data-tr-err hidden></p>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-rh-close>Cancelar</button></div>`;
      box.querySelector('[data-rh-close]')?.addEventListener('click', rhCloseModal);
      box.querySelectorAll('[data-tr-usar]').forEach((btn) => btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const { trilha } = await rhApi(`/trilhas/modelos/${encodeURIComponent(btn.dataset.trUsar)}`, { method: 'POST' });
          rhCloseModal();
          await abrirTrilha(trilha.id);
        } catch (err) {
          btn.disabled = false;
          showErr(box, '[data-tr-err]', err);
        }
      }));
    } catch (err) {
      box.innerHTML = `<p class="form-error">${esc(err.message)}</p><div class="modal-actions"><button type="button" class="btn btn-ghost" data-rh-close>Fechar</button></div>`;
      box.querySelector('[data-rh-close]')?.addEventListener('click', rhCloseModal);
    }
  }

  /* ---------------- formulário de trilha ---------------- */

  function abrirFormTrilha(t) {
    const box = rhOpenModal(`
      <h3>${t ? 'Editar trilha' : 'Nova trilha'}</h3>
      <form class="pdi-form rh-tr-form" novalidate>
        <label><span>Título *</span><input name="titulo" required maxlength="200" value="${attr(t?.titulo)}" placeholder="Ex.: Professor de musculação: júnior → pleno"></label>
        <div class="rh-tr-form__grid">
          <label><span>Cargo</span><input name="cargo_titulo" maxlength="200" value="${attr(t?.cargo_titulo)}" placeholder="Ex.: Personal trainer"></label>
          <label><span>Área</span><input name="area" maxlength="120" value="${attr(t?.area)}" placeholder="Ex.: Musculação, Recepção"></label>
          <label><span>Nível inicial</span><input name="nivel_inicial" maxlength="80" value="${attr(t?.nivel_inicial)}" placeholder="Ex.: Júnior"></label>
          <label><span>Nível alvo</span><input name="nivel_alvo" maxlength="80" value="${attr(t?.nivel_alvo)}" placeholder="Ex.: Pleno"></label>
          <label><span>Duração (meses)</span><input type="number" name="duracao_meses" min="1" max="60" value="${attr(t?.duracao_meses)}"></label>
          <label><span>Tempo protegido (h/mês)</span><input type="number" name="horas_mes" min="0" max="300" value="${attr(t?.horas_mes)}" placeholder="Referência: 18"></label>
          <label><span>Orçamento por colaborador (R$)</span><input type="number" name="orcamento_colaborador" min="0" step="0.01" value="${attr(t?.orcamento_colaborador)}"></label>
          <label class="rh-tr-check"><input type="checkbox" name="ativa" ${!t || t.ativa ? 'checked' : ''}><span>Trilha ativa</span></label>
        </div>
        <label><span>Descrição / objetivo</span><textarea name="descricao" rows="3" maxlength="5000">${esc(t?.descricao || '')}</textarea></label>
        <p class="pdi-muted rh-tr-note">Referência da metodologia: 18h/mês (4h fundamentos + 8h especialização + 4h stretch + 2h mentoria). Sem tempo protegido na agenda, ninguém termina a trilha.</p>
        <p class="form-error" data-tr-err hidden></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-rh-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">${t ? 'Salvar' : 'Criar trilha'}</button>
        </div>
      </form>`);
    const form = box?.querySelector('form');
    form?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = formData(form);
      if (!String(d.titulo || '').trim()) return showErr(box, '[data-tr-err]', new Error('Informe o título da trilha.'));
      d.ativa = form.elements.ativa.checked;
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        if (t) {
          await rhApi(`/trilhas/${t.id}`, { method: 'PATCH', body: JSON.stringify(d) });
          rhCloseModal();
          await renderDetalhe();
        } else {
          const { trilha } = await rhApi('/trilhas', { method: 'POST', body: JSON.stringify(d) });
          rhCloseModal();
          await abrirTrilha(trilha.id);
        }
      } catch (err) {
        btn.disabled = false;
        showErr(box, '[data-tr-err]', err);
      }
    });
  }

  /* ---------------- detalhe ---------------- */

  async function abrirTrilha(id) {
    state.trilhaId = id;
    await renderDetalhe();
    state.container?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }

  function voltarLista() {
    state.trilhaId = null;
    state.trilha = null;
    renderLista().catch((err) => alert(err.message));
  }

  async function renderDetalhe() {
    const el = state.container;
    if (!el || !state.trilhaId) return;
    let trilha;
    try {
      ({ trilha } = await rhApi(`/trilhas/${state.trilhaId}`));
    } catch (err) {
      state.trilhaId = null;
      alert(err.message);
      return renderLista();
    }
    state.trilha = trilha;
    const t = trilha;
    const o = t.orcamento;
    const ind = t.indicadores;
    el.innerHTML = `
      <div class="rh-tr">
        <div class="rh-view-head">
          <div>
            <button type="button" class="btn btn-ghost btn-sm rh-tr-back" data-tr-back>← Trilhas</button>
            <h3>${esc(t.titulo)} ${t.ativa ? '' : badge('Inativa', 'muted')}</h3>
            <p>${[subtitulo(t), t.duracao_meses ? `${t.duracao_meses} meses` : '', t.horas_mes ? `${t.horas_mes}h/mês protegidas` : ''].filter(Boolean).join(' · ') || 'Defina cargo, níveis e tempo protegido em “Editar”.'}</p>
          </div>
          <div class="rh-view-head__actions">
            <button type="button" class="btn btn-primary" data-tr-atribuir>Atribuir colaborador</button>
            <button type="button" class="btn btn-secondary" data-tr-editar>Editar</button>
            <button type="button" class="btn btn-danger" data-tr-excluir>Excluir</button>
          </div>
        </div>
        ${t.descricao ? `<p class="rh-tr-desc">${esc(t.descricao)}</p>` : ''}

        <div class="pdi-stats rh-tr-stats">
          <div class="pdi-stat"><span class="pdi-stat__val">${fmtH(o.horas_total)}</span><span class="pdi-stat__lbl">Carga total${o.tempo_disponivel ? ` · ${fmtH(o.tempo_disponivel)} disponíveis` : ''}</span></div>
          <div class="pdi-stat ${o.saldo != null && o.saldo < 0 ? 'pdi-stat--warn' : ''}"><span class="pdi-stat__val">${pdiFmtMoney(o.custo_total)}</span><span class="pdi-stat__lbl">Custo por colaborador${o.orcamento_colaborador != null ? ` · orçamento ${pdiFmtMoney(o.orcamento_colaborador)}` : ''}</span></div>
          <div class="pdi-stat"><span class="pdi-stat__val">${ind.atribuidos}</span><span class="pdi-stat__lbl">Atribuídos</span></div>
          <div class="pdi-stat"><span class="pdi-stat__val">${ind.conclusao_media == null ? '—' : `${ind.conclusao_media}%`}</span><span class="pdi-stat__lbl">Conclusão média</span></div>
          <div class="pdi-stat"><span class="pdi-stat__val">${ind.camada1_media == null ? '—' : `${ind.camada1_media}%`}</span><span class="pdi-stat__lbl">Camada 1 (meta &gt; 80% em 90 dias)</span></div>
          <div class="pdi-stat"><span class="pdi-stat__val">${ind.camada2_media == null ? '—' : `${ind.camada2_media}%`}</span><span class="pdi-stat__lbl">Camada 2 (meta &gt; 60% em 180 dias)</span></div>
        </div>

        ${t.dicas.length ? `
          <div class="card rh-tr-tips">
            <h4 class="pdi-section-title">Dicas para esta trilha</h4>
            <ul>${t.dicas.map((d) => `<li class="rh-tr-tip rh-tr-tip--${d.nivel === 'warn' ? 'warn' : 'info'}">${esc(d.texto)}</li>`).join('')}</ul>
          </div>` : ''}

        <h4 class="pdi-section-title">Camadas</h4>
        <div class="rh-tr-layers">${t.camadas.map(camadaHtml).join('')}</div>

        <div class="rh-tr-cols">
          <div class="card rh-tr-budget">
            <h4 class="pdi-section-title">Resumo de orçamento</h4>
            ${o.por_tipo.length ? `
              <ul class="rh-tr-budget__list">
                ${o.por_tipo.map((x) => `<li><span>${esc(TIPOS[x.tipo] || x.tipo)}</span><span>${fmtH(x.horas)}</span><strong>${pdiFmtMoney(x.custo)}</strong></li>`).join('')}
                <li class="rh-tr-budget__total"><span>Total por colaborador</span><span>${fmtH(o.horas_total)}</span><strong>${pdiFmtMoney(o.custo_total)}</strong></li>
                ${o.orcamento_colaborador != null ? `<li class="${o.saldo < 0 ? 'rh-tr-neg' : ''}"><span>Saldo do orçamento</span><span></span><strong>${pdiFmtMoney(o.saldo)}</strong></li>` : ''}
                ${ind.atribuidos ? `<li><span>Investimento com ${ind.atribuidos} atribuído(s)</span><span></span><strong>${pdiFmtMoney(o.custo_total * ind.atribuidos)}</strong></li>` : ''}
              </ul>` : '<p class="pdi-muted">Adicione itens com horas e custo para ver o orçamento.</p>'}
          </div>
          <div class="card rh-tr-risks">
            <h4 class="pdi-section-title">Riscos comuns</h4>
            <ul>${t.riscos.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          </div>
        </div>

        <h4 class="pdi-section-title">Atribuições</h4>
        ${t.atribuicoes.length ? `<div class="rh-tr-atribs">${t.atribuicoes.map(atribHtml).join('')}</div>`
          : '<div class="card rh-empty"><p>Nenhum colaborador nesta trilha ainda.</p></div>'}
      </div>`;
    bindDetalhe(el, t);
  }

  function camadaHtml(c) {
    const ref = c.horas_ref_periodo ? ` · referência ${fmtH(c.horas_ref_periodo)} no período` : ` · referência ${c.horas_mes_ref}h/mês`;
    return `
      <section class="card rh-tr-layer rh-tr-layer--${c.camada}">
        <header class="rh-tr-layer__head">
          <div>
            <h5>Camada ${c.camada} · ${esc(c.nome)}</h5>
            <p class="pdi-muted">${esc(CAMADAS[c.camada].desc)}</p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-tr-add-item="${c.camada}">+ Item</button>
        </header>
        <p class="rh-tr-layer__sum">${c.itens.length} ${c.itens.length === 1 ? 'item' : 'itens'} · ${fmtH(c.horas)} · ${pdiFmtMoney(c.custo)}<span class="pdi-muted">${ref}</span></p>
        ${c.itens.length ? `<ol class="rh-tr-items">${c.itens.map((it, i) => itemHtml(it, i, c.itens.length)).join('')}</ol>`
          : '<p class="pdi-muted rh-tr-layer__empty">Nenhum item nesta camada.</p>'}
      </section>`;
  }

  function itemHtml(it, i, n) {
    const link = safeLink(it.link);
    return `
      <li class="rh-tr-item">
        <div class="rh-tr-item__main">
          <span class="rh-tr-tipo rh-tr-tipo--${attr(it.tipo)}">${esc(TIPOS[it.tipo] || it.tipo)}</span>
          ${link ? `<a href="${attr(link)}" target="_blank" rel="noopener noreferrer">${esc(it.titulo)}</a>` : `<span>${esc(it.titulo)}</span>`}
          <span class="rh-tr-item__meta">${it.horas != null ? fmtH(it.horas) : '—'} · ${pdiFmtMoney(it.custo)}${it.obrigatorio ? ' · obrigatório' : ''}</span>
        </div>
        <div class="rh-tr-item__actions">
          <button type="button" class="btn btn-ghost btn-sm" data-tr-move="cima" data-item="${attr(it.id)}" ${i === 0 ? 'disabled' : ''} aria-label="Mover para cima">↑</button>
          <button type="button" class="btn btn-ghost btn-sm" data-tr-move="baixo" data-item="${attr(it.id)}" ${i === n - 1 ? 'disabled' : ''} aria-label="Mover para baixo">↓</button>
          <button type="button" class="btn btn-ghost btn-sm" data-tr-edit-item="${attr(it.id)}" aria-label="Editar item">Editar</button>
          <button type="button" class="btn btn-ghost btn-sm rh-tr-del" data-tr-del-item="${attr(it.id)}" aria-label="Remover item">Remover</button>
        </div>
      </li>`;
  }

  function camadasMini(p) {
    return [1, 2, 3, 4].map((c) => `
      <div class="rh-tr-mini" title="Camada ${c} · ${attr(CAMADAS[c].nome)}">
        <span>C${c}</span>${bar(p.camadas[c].pct)}<span>${p.camadas[c].total ? `${p.camadas[c].pct}%` : '—'}</span>
      </div>`).join('');
  }

  function kpisHtml(a) {
    if (a.status === 'concluida') return '';
    return a.progresso.kpis.map((k) => {
      const s = KPI_STATUS[k.status] || KPI_STATUS.sem_itens;
      return `<span class="rh-tr-kpi">Camada ${k.camada}: ${badge(s.label, s.cls)}</span>`;
    }).join('');
  }

  function atribHtml(a) {
    const p = a.progresso;
    const st = STATUS[a.status] || STATUS.ativa;
    return `
      <article class="card rh-tr-atrib">
        <div class="rh-tr-atrib__head">
          <div>
            <strong>${esc(a.colaborador_nome)}</strong>
            <p class="pdi-muted">${a.colaborador_cargo ? `${esc(a.colaborador_cargo)} · ` : ''}Mentor: ${a.mentor_nome ? esc(a.mentor_nome) : '<em>não designado</em>'}</p>
            <p class="pdi-muted">Início ${pdiFmtDate(a.inicio)} · Prazo ${pdiFmtDate(a.prazo)}${p.dias_decorridos != null && p.dias_decorridos >= 0 ? ` · ${p.dias_decorridos} dias de trilha` : ''}</p>
          </div>
          <div class="rh-tr-atrib__badges">
            ${badge(st.label, st.cls)}
            ${p.prazo_vencido ? badge('Prazo vencido', 'danger') : ''}
          </div>
        </div>
        <div class="rh-tr-atrib__prog">
          <span>${p.concluidos}/${p.total} itens · ${fmtH(p.horas_concluidas)} de ${fmtH(p.horas_total)}</span>
          <strong>${p.pct}%</strong>
        </div>
        ${bar(p.pct, p.prazo_vencido ? 'rh-tr-bar--late' : '')}
        <div class="rh-tr-minis">${camadasMini(p)}</div>
        <div class="rh-tr-kpis">${kpisHtml(a)}</div>
        ${a.alertas.length ? `<ul class="rh-tr-alerts">${a.alertas.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <div class="rh-tr-atrib__actions">
          <button type="button" class="btn btn-primary btn-sm" data-tr-check="${attr(a.id)}">Checklist</button>
          <button type="button" class="btn btn-secondary btn-sm" data-tr-edit-atrib="${attr(a.id)}">Editar</button>
          <button type="button" class="btn btn-ghost btn-sm" data-tr-colab="${attr(a.colaborador_id)}">Ficha</button>
          <button type="button" class="btn btn-ghost btn-sm rh-tr-del" data-tr-del-atrib="${attr(a.id)}">Remover</button>
        </div>
      </article>`;
  }

  function itensDaTrilha(t) {
    return t.camadas.flatMap((c) => c.itens);
  }

  function bindDetalhe(el, t) {
    el.querySelector('[data-tr-back]')?.addEventListener('click', voltarLista);
    el.querySelector('[data-tr-editar]')?.addEventListener('click', () => abrirFormTrilha(t));
    el.querySelector('[data-tr-excluir]')?.addEventListener('click', async () => {
      const msg = t.atribuicoes.length
        ? `Excluir a trilha "${t.titulo}"? ${t.atribuicoes.length} atribuição(ões) e todo o progresso registrado também serão excluídos.`
        : `Excluir a trilha "${t.titulo}"?`;
      if (!confirm(msg)) return;
      try {
        await rhApi(`/trilhas/${t.id}`, { method: 'DELETE' });
        voltarLista();
      } catch (err) { alert(err.message); }
    });
    el.querySelector('[data-tr-atribuir]')?.addEventListener('click', () => abrirAtribuir({ trilha: t, onDone: renderDetalhe }));
    el.querySelectorAll('[data-tr-add-item]').forEach((b) => b.addEventListener('click', () => abrirFormItem(t, null, Number(b.dataset.trAddItem))));
    el.querySelectorAll('[data-tr-edit-item]').forEach((b) => b.addEventListener('click', () => {
      const it = itensDaTrilha(t).find((x) => x.id === b.dataset.trEditItem);
      if (it) abrirFormItem(t, it, it.camada);
    }));
    el.querySelectorAll('[data-tr-del-item]').forEach((b) => b.addEventListener('click', async () => {
      const it = itensDaTrilha(t).find((x) => x.id === b.dataset.trDelItem);
      if (!it || !confirm(`Remover "${it.titulo}"? O progresso dos colaboradores neste item também será removido.`)) return;
      try {
        await rhApi(`/trilhas/itens/${it.id}`, { method: 'DELETE' });
        await renderDetalhe();
      } catch (err) { alert(err.message); }
    }));
    el.querySelectorAll('[data-tr-move]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await rhApi(`/trilhas/itens/${b.dataset.item}`, { method: 'PATCH', body: JSON.stringify({ mover: b.dataset.trMove }) });
        await renderDetalhe();
      } catch (err) { b.disabled = false; alert(err.message); }
    }));
    el.querySelectorAll('[data-tr-check]').forEach((b) => b.addEventListener('click', () => {
      const a = t.atribuicoes.find((x) => x.id === b.dataset.trCheck);
      if (a) abrirChecklist({ atribuicao: a, itens: itensDaTrilha(t), titulo: t.titulo, onChange: renderDetalhe });
    }));
    el.querySelectorAll('[data-tr-edit-atrib]').forEach((b) => b.addEventListener('click', () => {
      const a = t.atribuicoes.find((x) => x.id === b.dataset.trEditAtrib);
      if (a) abrirEditarAtribuicao(a, renderDetalhe);
    }));
    el.querySelectorAll('[data-tr-del-atrib]').forEach((b) => b.addEventListener('click', async () => {
      const a = t.atribuicoes.find((x) => x.id === b.dataset.trDelAtrib);
      if (!a || !confirm(`Remover ${a.colaborador_nome} desta trilha? O progresso registrado será perdido.`)) return;
      try {
        await rhApi(`/trilhas/atribuicoes/${a.id}`, { method: 'DELETE' });
        await renderDetalhe();
      } catch (err) { alert(err.message); }
    }));
    el.querySelectorAll('[data-tr-colab]').forEach((b) => b.addEventListener('click', () => {
      if (typeof openColaboradorWorkspace === 'function') openColaboradorWorkspace(b.dataset.trColab);
    }));
  }

  /* ---------------- itens ---------------- */

  function abrirFormItem(t, it, camada) {
    const box = rhOpenModal(`
      <h3>${it ? 'Editar item' : 'Novo item'}</h3>
      <form class="pdi-form rh-tr-form" novalidate>
        <div class="rh-tr-form__grid">
          <label><span>Camada</span>
            <select name="camada">${[1, 2, 3, 4].map((c) => `<option value="${c}" ${c === camada ? 'selected' : ''}>${c} · ${esc(CAMADAS[c].nome)}</option>`).join('')}</select>
          </label>
          <label><span>Tipo</span>
            <select name="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${(it?.tipo || (camada === 4 ? 'mentoria' : 'curso')) === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
          </label>
        </div>
        <label><span>Título *</span><input name="titulo" required maxlength="300" value="${attr(it?.titulo)}" placeholder="Ex.: Curso de primeiros socorros"></label>
        <label><span>Link (opcional)</span><input type="url" name="link" maxlength="1000" value="${attr(it?.link)}" placeholder="https://"></label>
        <div class="rh-tr-form__grid">
          <label><span>Horas</span><input type="number" name="horas" min="0" step="0.5" value="${attr(it?.horas)}"></label>
          <label><span>Custo (R$)</span><input type="number" name="custo" min="0" step="0.01" value="${attr(it?.custo)}"></label>
        </div>
        <label class="rh-tr-check"><input type="checkbox" name="obrigatorio" ${(it ? it.obrigatorio : camada === 1) ? 'checked' : ''}><span>Obrigatório</span></label>
        <p class="pdi-muted rh-tr-note">Fundamentos (camada 1) são sempre obrigatórios. Inclua práticas e workshops: conteúdo sem aplicação em 30 dias é esquecido.</p>
        <p class="form-error" data-tr-err hidden></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-rh-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">${it ? 'Salvar' : 'Adicionar'}</button>
        </div>
      </form>`);
    const form = box?.querySelector('form');
    form?.elements.camada.addEventListener('change', () => {
      if (!it && form.elements.camada.value === '1') form.elements.obrigatorio.checked = true;
    });
    form?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = formData(form);
      if (!String(d.titulo || '').trim()) return showErr(box, '[data-tr-err]', new Error('Informe o título do item.'));
      d.camada = Number(d.camada);
      d.obrigatorio = form.elements.obrigatorio.checked;
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        if (it) await rhApi(`/trilhas/itens/${it.id}`, { method: 'PATCH', body: JSON.stringify(d) });
        else await rhApi(`/trilhas/${t.id}/itens`, { method: 'POST', body: JSON.stringify(d) });
        rhCloseModal();
        await renderDetalhe();
      } catch (err) {
        btn.disabled = false;
        showErr(box, '[data-tr-err]', err);
      }
    });
  }

  /* ---------------- atribuições ---------------- */

  /** Atribui a partir da trilha (escolhe colaborador) ou da ficha (escolhe trilha). */
  async function abrirAtribuir({ trilha = null, colaborador = null, jaAtribuidas = [], onDone }) {
    const box = rhOpenModal('<h3>Atribuir trilha</h3><p class="pdi-muted">Carregando…</p>');
    try {
      let seletor;
      if (trilha) {
        const usados = new Set(trilha.atribuicoes.map((a) => a.colaborador_id));
        const livres = (await rhColaboradores({ refresh: true })).filter((c) => !usados.has(c.id));
        if (!livres.length) {
          box.innerHTML = `<h3>Atribuir colaborador</h3><p class="rh-empty">Todos os colaboradores ativos já estão nesta trilha.</p>
            <div class="modal-actions"><button type="button" class="btn btn-primary" data-rh-close>Fechar</button></div>`;
          box.querySelector('[data-rh-close]')?.addEventListener('click', rhCloseModal);
          return;
        }
        seletor = `<label><span>Colaborador *</span><select name="colaborador_id" required>
          <option value="">Selecione…</option>
          ${livres.map((c) => `<option value="${attr(c.id)}">${esc(c.nome)}${c.cargo_atual ? ` · ${esc(c.cargo_atual)}` : ''}</option>`).join('')}
        </select></label>`;
      } else {
        const { trilhas } = await rhApi('/trilhas');
        const usadas = new Set(jaAtribuidas);
        const livres = trilhas.filter((t) => t.ativa && !usadas.has(t.id));
        if (!livres.length) {
          box.innerHTML = `<h3>Atribuir trilha</h3><p class="rh-empty">${trilhas.length ? 'Não há outras trilhas ativas para atribuir.' : 'Nenhuma trilha cadastrada. Crie uma na aba Trilhas.'}</p>
            <div class="modal-actions"><button type="button" class="btn btn-primary" data-rh-close>Fechar</button></div>`;
          box.querySelector('[data-rh-close]')?.addEventListener('click', rhCloseModal);
          return;
        }
        seletor = `<label><span>Trilha *</span><select name="trilha_id" required>
          <option value="">Selecione…</option>
          ${livres.map((t) => `<option value="${attr(t.id)}">${esc(t.titulo)}${niveis(t) ? ` (${esc(niveis(t))})` : ''}</option>`).join('')}
        </select></label>`;
      }
      box.innerHTML = `
        <h3>${trilha ? 'Atribuir colaborador' : 'Atribuir trilha'}</h3>
        <p class="pdi-muted">${trilha ? esc(trilha.titulo) : esc(colaborador.nome)}</p>
        <form class="pdi-form rh-tr-form" novalidate>
          ${seletor}
          <label><span>Mentor designado</span><input name="mentor_nome" maxlength="200" placeholder="Ex.: Coordenador técnico"></label>
          <div class="rh-tr-form__grid">
            <label><span>Início</span><input type="date" name="inicio" value="${hoje()}"></label>
            <label><span>Prazo</span><input type="date" name="prazo"></label>
          </div>
          <p class="pdi-muted rh-tr-note">Sem prazo, ele é calculado pela duração da trilha. Mentoria não é bônus: sem mentor designado não há accountability.</p>
          <p class="form-error" data-tr-err hidden></p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-rh-close>Cancelar</button>
            <button type="submit" class="btn btn-primary">Atribuir</button>
          </div>
        </form>`;
      box.querySelector('[data-rh-close]')?.addEventListener('click', rhCloseModal);
      const form = box.querySelector('form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const d = formData(form);
        const trilhaId = trilha ? trilha.id : d.trilha_id;
        const colaboradorId = trilha ? d.colaborador_id : colaborador.id;
        if (!trilhaId || !colaboradorId) return showErr(box, '[data-tr-err]', new Error(trilha ? 'Selecione o colaborador.' : 'Selecione a trilha.'));
        const btn = form.querySelector('[type=submit]');
        btn.disabled = true;
        try {
          await rhApi(`/trilhas/${trilhaId}/atribuicoes`, {
            method: 'POST',
            body: JSON.stringify({ colaborador_id: colaboradorId, mentor_nome: d.mentor_nome, inicio: d.inicio, prazo: d.prazo }),
          });
          rhCloseModal();
          await onDone?.();
        } catch (err) {
          btn.disabled = false;
          showErr(box, '[data-tr-err]', err);
        }
      });
    } catch (err) {
      box.innerHTML = `<p class="form-error">${esc(err.message)}</p><div class="modal-actions"><button type="button" class="btn btn-ghost" data-rh-close>Fechar</button></div>`;
      box.querySelector('[data-rh-close]')?.addEventListener('click', rhCloseModal);
    }
  }

  function abrirEditarAtribuicao(a, onDone) {
    const box = rhOpenModal(`
      <h3>Editar atribuição</h3>
      <p class="pdi-muted">${esc(a.colaborador_nome)}</p>
      <form class="pdi-form rh-tr-form" novalidate>
        <label><span>Mentor designado</span><input name="mentor_nome" maxlength="200" value="${attr(a.mentor_nome)}"></label>
        <div class="rh-tr-form__grid">
          <label><span>Início</span><input type="date" name="inicio" value="${attr(a.inicio)}"></label>
          <label><span>Prazo</span><input type="date" name="prazo" value="${attr(a.prazo)}"></label>
        </div>
        <label><span>Status</span>
          <select name="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${a.status === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
        </label>
        <p class="form-error" data-tr-err hidden></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-rh-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>`);
    const form = box?.querySelector('form');
    form?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        await rhApi(`/trilhas/atribuicoes/${a.id}`, { method: 'PATCH', body: JSON.stringify(formData(form)) });
        rhCloseModal();
        await onDone?.();
      } catch (err) {
        btn.disabled = false;
        showErr(box, '[data-tr-err]', err);
      }
    });
  }

  function checklistResumo(a) {
    const p = a.progresso;
    return `
      <div class="rh-tr-atrib__prog"><span>${p.concluidos}/${p.total} itens · ${fmtH(p.horas_concluidas)} de ${fmtH(p.horas_total)}</span><strong>${p.pct}%</strong></div>
      ${bar(p.pct)}
      <div class="rh-tr-minis">${camadasMini(p)}</div>
      <div class="rh-tr-kpis">${kpisHtml(a)}</div>`;
  }

  function abrirChecklist({ atribuicao, itens, titulo, onChange }) {
    let a = atribuicao;
    const estado = () => new Map(a.progresso.checklist.map((c) => [c.item_id, c]));
    let mapa = estado();
    const box = rhOpenModal(`
      <h3>Checklist · ${esc(a.colaborador_nome || '')}</h3>
      <p class="pdi-muted">${esc(titulo || '')}</p>
      <div class="rh-tr-check-sum" data-tr-sum>${checklistResumo(a)}</div>
      ${[1, 2, 3, 4].map((c) => {
        const its = itens.filter((i) => i.camada === c);
        if (!its.length) return '';
        return `
          <h4 class="pdi-section-title">Camada ${c} · ${esc(CAMADAS[c].nome)}</h4>
          <ul class="rh-tr-checklist">
            ${its.map((it) => {
              const s = mapa.get(it.id) || {};
              return `
                <li class="rh-tr-check-row ${s.concluido ? 'is-done' : ''}" data-row="${attr(it.id)}">
                  <label class="rh-tr-check-row__main">
                    <input type="checkbox" data-tr-done="${attr(it.id)}" ${s.concluido ? 'checked' : ''}>
                    <span><strong>${esc(it.titulo)}</strong>
                      <small class="pdi-muted">${esc(TIPOS[it.tipo] || it.tipo)}${it.horas != null ? ` · ${fmtH(it.horas)}` : ''}${it.obrigatorio ? ' · obrigatório' : ''}${s.concluido_em ? ` · concluído em ${pdiFmtDate(s.concluido_em)}` : ''}</small>
                    </span>
                  </label>
                  <input type="text" class="rh-tr-evid" data-tr-evid="${attr(it.id)}" maxlength="2000" placeholder="Evidência (certificado, link, observação)" value="${attr(s.evidencia)}">
                </li>`;
            }).join('')}
          </ul>`;
      }).join('') || '<p class="rh-empty">Esta trilha ainda não tem itens.</p>'}
      <p class="form-error" data-tr-err hidden></p>
      <div class="modal-actions"><button type="button" class="btn btn-primary" data-rh-close>Fechar</button></div>`);
    if (!box) return;

    async function salvar(itemId, concluido) {
      const evid = box.querySelector(`[data-tr-evid="${CSS.escape(itemId)}"]`)?.value || '';
      const { atribuicao: novo } = await rhApi(`/trilhas/atribuicoes/${a.id}/itens/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ concluido, evidencia: evid }),
      });
      a = { ...a, ...novo };
      mapa = estado();
      box.querySelector('[data-tr-sum]').innerHTML = checklistResumo(a);
      box.querySelector(`[data-row="${CSS.escape(itemId)}"]`)?.classList.toggle('is-done', concluido);
      Promise.resolve(onChange?.()).catch(() => {});
    }

    box.querySelectorAll('[data-tr-done]').forEach((cb) => cb.addEventListener('change', async () => {
      cb.disabled = true;
      try {
        await salvar(cb.dataset.trDone, cb.checked);
      } catch (err) {
        cb.checked = !cb.checked;
        showErr(box, '[data-tr-err]', err);
      } finally { cb.disabled = false; }
    }));
    box.querySelectorAll('[data-tr-evid]').forEach((inp) => inp.addEventListener('change', async () => {
      const id = inp.dataset.trEvid;
      const cb = box.querySelector(`[data-tr-done="${CSS.escape(id)}"]`);
      if (!inp.value.trim() && !cb.checked) return;
      if (!cb.checked) cb.checked = true;
      try {
        await salvar(id, true);
      } catch (err) { showErr(box, '[data-tr-err]', err); }
    }));
  }

  /* ---------------- registro ---------------- */

  rhRegisterModule('trilhas', {
    label: 'Trilhas',
    async onOpen(container) {
      state.container = container;
      if (state.trilhaId) await renderDetalhe();
      else await renderLista();
    },
  });

  rhRegisterGestorWidget({
    id: 'trilhas',
    order: 50,
    async render(container) {
      const { resumo } = await rhApi('/trilhas');
      if (!resumo.atribuicoes) {
        container.innerHTML = '';
        return;
      }
      container.innerHTML = `
        <article class="card rh-tr-widget">
          <h4 class="pdi-section-title">Trilhas de aprendizagem</h4>
          <div class="rh-tr-widget__row">
            <div><span class="rh-tr-widget__val">${resumo.conclusao_media}%</span><span class="pdi-muted">conclusão média · ${resumo.atribuicoes} em trilha</span></div>
            ${resumo.atrasadas ? badge(`${resumo.atrasadas} atrasada(s)`, 'danger') : badge('Sem atrasos', 'ativo')}
            ${resumo.fora_ritmo ? badge(`${resumo.fora_ritmo} fora do ritmo`, 'warn') : ''}
          </div>
          ${bar(resumo.conclusao_media)}
          ${resumo.atrasadas_lista.length ? `
            <ul class="rh-tr-widget__list">
              ${resumo.atrasadas_lista.map((x) => `<li><button type="button" class="rh-tr-linkbtn" data-tr-w-colab="${attr(x.colaborador_id)}">${esc(x.colaborador_nome)}</button> · ${esc(x.trilha_titulo || '')} · prazo ${pdiFmtDate(x.prazo)} · ${x.pct}%</li>`).join('')}
            </ul>` : ''}
          <button type="button" class="btn btn-ghost btn-sm" data-tr-w-open>Abrir trilhas</button>
        </article>`;
      container.querySelector('[data-tr-w-open]')?.addEventListener('click', () => {
        state.trilhaId = null;
        if (typeof rhGoTo === 'function') rhGoTo('trilhas');
      });
      container.querySelectorAll('[data-tr-w-colab]').forEach((b) => b.addEventListener('click', () => {
        if (typeof openColaboradorWorkspace === 'function') openColaboradorWorkspace(b.dataset.trWColab);
      }));
    },
  });

  rhRegisterColabSection({
    id: 'trilhas',
    order: 25,
    render: renderColab,
  });

  async function renderColab(container, colaborador) {
    const recarregar = () => renderColab(container, colaborador);
    const { atribuicoes } = await rhApi(`/trilhas/colaborador/${colaborador.id}`);
    container.innerHTML = `
      <div class="card rh-tr-colab">
        <div class="rh-tr-colab__head">
          <h4 class="pdi-section-title">Trilhas de aprendizagem</h4>
          <button type="button" class="btn btn-secondary btn-sm" data-tr-c-atribuir>Atribuir trilha</button>
        </div>
        ${atribuicoes.length ? atribuicoes.map((a) => {
          const p = a.progresso;
          const st = STATUS[a.status] || STATUS.ativa;
          return `
            <div class="rh-tr-colab__item">
              <div class="rh-tr-colab__top">
                <strong>${esc(a.trilha?.titulo || 'Trilha')}</strong>
                <span>${badge(st.label, st.cls)} ${p.prazo_vencido ? badge('Prazo vencido', 'danger') : ''}</span>
              </div>
              <p class="pdi-muted">${[a.trilha && niveis(a.trilha), a.mentor_nome ? `Mentor: ${a.mentor_nome}` : 'Sem mentor designado', a.prazo ? `Prazo ${pdiFmtDate(a.prazo)}` : ''].filter(Boolean).map(esc).join(' · ')}</p>
              <div class="rh-tr-atrib__prog"><span>${p.concluidos}/${p.total} itens · ${fmtH(p.horas_concluidas)} de ${fmtH(p.horas_total)}</span><strong>${p.pct}%</strong></div>
              ${bar(p.pct, p.prazo_vencido ? 'rh-tr-bar--late' : '')}
              ${p.proximos.length && a.status !== 'concluida' ? `
                <p class="rh-tr-colab__next">Próximos itens:</p>
                <ul class="rh-tr-colab__list">${p.proximos.map((i) => `<li><span class="rh-tr-tipo rh-tr-tipo--${attr(i.tipo)}">C${i.camada}</span> ${esc(i.titulo)}</li>`).join('')}</ul>` : ''}
              <div class="rh-tr-atrib__actions">
                <button type="button" class="btn btn-primary btn-sm" data-tr-c-check="${attr(a.id)}">Checklist</button>
                <button type="button" class="btn btn-ghost btn-sm" data-tr-c-edit="${attr(a.id)}">Editar</button>
                <button type="button" class="btn btn-ghost btn-sm" data-tr-c-trilha="${attr(a.trilha_id)}">Ver trilha</button>
              </div>
            </div>`;
        }).join('') : '<p class="pdi-muted">Nenhuma trilha atribuída a este colaborador.</p>'}
      </div>`;
    container.querySelector('[data-tr-c-atribuir]')?.addEventListener('click', () => abrirAtribuir({
      colaborador,
      jaAtribuidas: atribuicoes.map((a) => a.trilha_id),
      onDone: recarregar,
    }));
    container.querySelectorAll('[data-tr-c-check]').forEach((b) => b.addEventListener('click', () => {
      const a = atribuicoes.find((x) => x.id === b.dataset.trCCheck);
      if (a) abrirChecklist({ atribuicao: a, itens: a.itens, titulo: a.trilha?.titulo, onChange: recarregar });
    }));
    container.querySelectorAll('[data-tr-c-edit]').forEach((b) => b.addEventListener('click', () => {
      const a = atribuicoes.find((x) => x.id === b.dataset.trCEdit);
      if (a) abrirEditarAtribuicao(a, recarregar);
    }));
    container.querySelectorAll('[data-tr-c-trilha]').forEach((b) => b.addEventListener('click', () => {
      state.trilhaId = b.dataset.trCTrilha;
      if (typeof rhGoTo === 'function') rhGoTo('trilhas');
    }));
  }
})();
