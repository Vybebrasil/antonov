/* Módulo Roleta de Premiação */

const roletaState = {
  premios: [],
  settings: null,
  spins: [],
  stats: null,
  layoutUrl: null,
  layoutPreviewUrl: null,
  pendingLayout: null,
  showGuides: true,
};

function roletaEsc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function roletaPityChance(p) {
  const every = p.pity_every;
  if (every == null || every <= 0) return 0;
  return Math.min(1, (Math.max(0, Number(p.pity_counter) || 0) + 1) / every);
}

function roletaFmtChance(c) {
  const pct = c * 100;
  if (pct <= 0) return '0%';
  if (pct >= 100) return '100%';
  return pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

async function roletaApi(path = '', opts = {}) {
  return api(`/roleta${path}`, opts);
}

function roletaPreviewWheelBg(premios) {
  const colors = (premios || []).slice(0, 8).map((p) => p.color || '#FFC20E');
  if (!colors.length) colors.push('#FFC20E', '#009CDE');
  const step = 100 / colors.length;
  const stops = colors
    .map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`)
    .join(', ');
  return `conic-gradient(from -90deg, ${stops})`;
}

function roletaCompressLayout(file, { maxW = 1080, maxH = 1920, quality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, maxW / width, maxH / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Não foi possível processar a imagem.'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Falha ao compactar PNG.'));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const result = String(reader.result || '');
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve({
              name: (file.name || 'layout.png').replace(/\.\w+$/, '') + '.png',
              type: 'image/png',
              size: blob.size,
              data: base64,
            });
          };
          reader.onerror = () => reject(new Error('Falha ao ler layout.'));
          reader.readAsDataURL(blob);
        },
        'image/png',
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Arquivo de imagem inválido.'));
    };
    img.src = url;
  });
}

function roletaShowError(msg) {
  const el = document.getElementById('roleta-error');
  const ok = document.getElementById('roleta-success');
  if (ok) {
    ok.hidden = true;
    ok.textContent = '';
  }
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function roletaShowSuccess(msg) {
  const el = document.getElementById('roleta-success');
  const err = document.getElementById('roleta-error');
  if (err) {
    err.hidden = true;
    err.textContent = '';
  }
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function renderRoletaAdmin() {
  const root = document.getElementById('roleta-content');
  if (!root) return;
  const { premios, settings, spins, stats } = roletaState;

  root.innerHTML = `
    <div class="stats-grid roleta-stats">
      <article class="card"><span class="stat-label">Giros (últimos)</span><strong class="stat-value">${roletaEsc(stats?.spins ?? spins.length)}</strong></article>
      <article class="card"><span class="stat-label">Prêmios ativos</span><strong class="stat-value">${roletaEsc(stats?.active_prizes ?? premios.filter((p) => p.active).length)}</strong></article>
      <article class="card"><span class="stat-label">Cooldown WhatsApp</span><strong class="stat-value">${roletaEsc(settings?.whatsapp_cooldown_hours ?? '—')}h</strong></article>
    </div>

    <div class="card roleta-card" style="margin-top:1rem">
      <header class="dash-card__head" style="display:flex;flex-wrap:wrap;gap:0.75rem;justify-content:space-between;align-items:center">
        <div>
          <h3>Prêmios da roleta</h3>
          <p class="dash-card__meta">Cadastre os itens que aparecem na roleta. Ex.: 1 a cada 10 → chance sobe até 100% no 10º giro</p>
        </div>
        <div class="dash-toolbar">
          <button type="button" class="btn btn-secondary btn-sm" id="roleta-preset">Preset por estoque</button>
          <button type="button" class="btn btn-secondary btn-sm" id="roleta-equalizar">Equalizar (1/10)</button>
          <button type="button" class="btn btn-primary btn-sm" id="roleta-save-all">Salvar todas as taxas</button>
        </div>
      </header>

      <div class="roleta-add-form" id="roleta-add-form">
        <h4 class="roleta-add-title">Adicionar prêmio</h4>
        <div class="roleta-add-grid">
          <label>Nome
            <input type="text" id="roleta-new-name" placeholder="Ex.: Copo Antonov" maxlength="120" />
          </label>
          <label>Cor
            <input type="color" id="roleta-new-color" value="${premios.length % 2 === 0 ? '#FFC20E' : '#009CDE'}" />
          </label>
          <label>1 a cada
            <input type="number" id="roleta-new-pity" min="1" step="1" value="10" />
          </label>
          <label>Estoque
            <input type="number" id="roleta-new-stock" min="0" placeholder="∞" />
          </label>
          <label class="roleta-add-instruction">Instrução
            <input type="text" id="roleta-new-instruction" placeholder="Retire seu prêmio no balcão da Antonov." />
          </label>
          <button type="button" class="btn btn-primary btn-sm" id="roleta-add-prize">Adicionar</button>
        </div>
      </div>

      <div class="roleta-drop-bars" aria-hidden="true">
        ${premios
          .map((p) => {
            const c = roletaPityChance(p) * 100;
            return `<span style="width:${Math.max(p.active ? c : 0, 0)}%;background:${roletaEsc(p.color)};opacity:${p.active ? 1 : 0.25}"></span>`;
          })
          .join('')}
      </div>
      <div class="roleta-prize-list">
        ${
          premios.length
            ? premios
                .map((p) => {
                  const chance = roletaPityChance(p);
                  return `
            <article class="roleta-prize-row" data-id="${roletaEsc(p.id)}">
              <div class="roleta-prize-name">
                <span class="roleta-swatch" style="background:${roletaEsc(p.color)}"></span>
                <div>
                  <strong>${roletaEsc(p.name)}</strong>
                  <small>estoque ${p.stock == null ? '∞' : roletaEsc(p.stock)} · progresso ${roletaEsc(p.pity_counter)}/${p.pity_every ?? '—'}</small>
                </div>
              </div>
              <label class="roleta-field">1 a cada
                <input type="number" min="1" step="1" data-field="pity_every" value="${p.pity_every ?? ''}" ${p.active ? '' : 'disabled'} />
              </label>
              <label class="roleta-field">Estoque
                <input type="number" min="0" data-field="stock" value="${p.stock ?? ''}" placeholder="∞" />
              </label>
              <div class="roleta-chance">${roletaFmtChance(chance)}</div>
              <button type="button" class="btn btn-ghost btn-sm" data-action="zerar">Zerar</button>
              <label class="roleta-check"><input type="checkbox" data-field="active" ${p.active ? 'checked' : ''}/> Ativo</label>
              <button type="button" class="btn btn-ghost btn-sm roleta-btn-danger" data-action="delete" title="Excluir prêmio">Excluir</button>
            </article>`;
                })
                .join('')
            : '<p class="dash-card__meta">Nenhum prêmio cadastrado. Use o formulário acima para adicionar os itens da roleta.</p>'
        }
      </div>
    </div>

    <div class="card roleta-card" style="margin-top:1rem">
      <h3>Detalhes dos prêmios</h3>
      <div class="roleta-detail-list">
        ${
          premios.length
            ? premios
                .map(
                  (p) => `
          <article class="roleta-detail" data-id="${roletaEsc(p.id)}">
            <label>Nome <input data-field="name" value="${roletaEsc(p.name)}" /></label>
            <label>Cor <input type="color" data-field="color" value="${roletaEsc(p.color)}" /></label>
            <label>Instrução <textarea rows="2" data-field="instruction">${roletaEsc(p.instruction)}</textarea></label>
            <div class="roleta-detail-actions">
              <button type="button" class="btn btn-secondary btn-sm" data-action="save-one">Salvar prêmio</button>
              <button type="button" class="btn btn-ghost btn-sm roleta-btn-danger" data-action="delete">Excluir</button>
            </div>
          </article>`,
                )
                .join('')
            : '<p class="dash-card__meta">Cadastre pelo menos um prêmio para editar detalhes.</p>'
        }
      </div>
    </div>

    <div class="card roleta-card" style="margin-top:1rem">
      <h3>Layout do totem (1080×1920)</h3>
      <p class="dash-card__meta">Envie um PNG de fundo/design. Use as guias para alinhar arte com a roleta e a área de botões.</p>
      <div class="roleta-layout-grid">
        <div class="roleta-layout-controls">
          <div class="roleta-layout-upload">
            <label class="btn btn-secondary btn-sm" style="display:inline-flex;cursor:pointer">
              Escolher PNG
              <input type="file" id="roleta-layout-file" accept="image/png,image/*" hidden />
            </label>
            <button type="button" class="btn btn-primary btn-sm" id="roleta-layout-save" ${roletaState.pendingLayout ? '' : 'disabled'}>Salvar layout</button>
            <button type="button" class="btn btn-ghost btn-sm" id="roleta-layout-clear">Remover</button>
            <button type="button" class="btn btn-secondary btn-sm" id="roleta-layout-guide-dl">Baixar gabarito PNG</button>
          </div>
          <p class="dash-card__meta" id="roleta-layout-filename">${roletaEsc(roletaState.pendingLayout?.name || settings?.layout_name || 'Nenhum layout')}</p>
          <label class="roleta-check roleta-guides-toggle">
            <input type="checkbox" id="roleta-show-guides" ${roletaState.showGuides ? 'checked' : ''}/>
            Mostrar guias de design na prévia
          </label>
          <ul class="roleta-guide-legend">
            <li><span class="roleta-guide-swatch roleta-guide-swatch--wheel"></span> <strong>A</strong> Roleta · 720×720 · x180 y96 · reservada</li>
            <li><span class="roleta-guide-swatch roleta-guide-swatch--cta"></span> <strong>B</strong> UI/CTA · 800×280 · y840 · logo abaixo da roleta</li>
            <li><span class="roleta-guide-swatch roleta-guide-swatch--free"></span> <strong>C</strong> Arte livre · 840×640 · inferior (y1200)</li>
            <li><span class="roleta-guide-swatch roleta-guide-swatch--safe"></span> Margem segura · 40 px + terços + eixo</li>
          </ul>
          <p class="dash-card__meta">Baixe o gabarito, importe como camada no Figma/Photoshop e exporte só o layout final em 1080×1920.</p>
        </div>
        <div class="roleta-totem-preview" aria-label="Prévia 1080x1920">
          <div class="roleta-totem-preview__frame ${roletaState.showGuides ? 'is-guides' : ''}">
            <div class="roleta-totem-preview__bg" id="roleta-preview-bg" style="${roletaState.layoutPreviewUrl ? `background-image:url('${roletaState.layoutPreviewUrl}')` : ''}"></div>
            <div class="roleta-totem-preview__guides" id="roleta-preview-guides" ${roletaState.showGuides ? '' : 'hidden'} aria-hidden="true">
              <div class="roleta-guide-safe"></div>
              <div class="roleta-guide-thirds"></div>
              <div class="roleta-guide-center"></div>
              <div class="roleta-guide-wheel-ring"><span>A · Roleta</span></div>
              <div class="roleta-guide-cta"><span>B · Girar / CTA</span></div>
              <div class="roleta-guide-free"><span>C · Arte livre</span></div>
            </div>
            <div class="roleta-totem-preview__wheel" aria-hidden="true" style="background:${roletaPreviewWheelBg(premios)}"></div>
            <p class="roleta-totem-preview__label">Prévia · 1080×1920</p>
          </div>
        </div>
      </div>
    </div>

    <div class="card roleta-card" style="margin-top:1rem">
      <h3>Configurações</h3>
      <div class="roleta-settings-row">
        <label>Cooldown WhatsApp (h)
          <input type="number" min="0" id="roleta-cooldown" value="${roletaEsc(settings?.whatsapp_cooldown_hours ?? 24)}" />
        </label>
        <label>Timeout resultado (s)
          <input type="number" min="5" id="roleta-timeout" value="${roletaEsc(settings?.result_timeout_seconds ?? 15)}" />
        </label>
        <label class="roleta-check">
          <input type="checkbox" id="roleta-allow-repeat" ${settings?.allow_repeat_spin ? 'checked' : ''}/>
          Permitir novo giro após cooldown
        </label>
        <button type="button" class="btn btn-primary btn-sm" id="roleta-save-settings">Salvar configurações</button>
      </div>
    </div>

    <div class="card roleta-card" style="margin-top:1rem">
      <header class="dash-card__head" style="display:flex;justify-content:space-between;align-items:center;gap:0.75rem;flex-wrap:wrap">
        <h3>Histórico de giros</h3>
        <button type="button" class="btn btn-secondary btn-sm" id="roleta-export">Exportar CSV</button>
      </header>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Data</th><th>Nome</th><th>WhatsApp</th><th>CPF</th><th>Status</th><th>Prêmio</th></tr>
          </thead>
          <tbody>
            ${
              spins.length
                ? spins
                    .map(
                      (s) => `
              <tr>
                <td>${roletaEsc(new Date(s.created_at).toLocaleString('pt-BR'))}</td>
                <td>${roletaEsc(s.lead?.name)}</td>
                <td>${roletaEsc(s.lead?.whatsapp)}</td>
                <td>${roletaEsc(s.lead?.cpf || '—')}</td>
                <td>${roletaEsc(s.status || 'confirmed')}</td>
                <td>${roletaEsc(s.prize?.name)}</td>
              </tr>`,
                    )
                    .join('')
                : '<tr><td colspan="6">Nenhum giro registrado ainda.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </div>
  `;

  bindRoletaEvents();
}

function readPrizePatchFromRow(row) {
  const id = row.dataset.id;
  const base = roletaState.premios.find((p) => p.id === id);
  if (!base) return null;
  const get = (field) => row.querySelector(`[data-field="${field}"]`);
  const pityInput = get('pity_every');
  const stockInput = get('stock');
  const activeInput = get('active');
  const nameInput = get('name');
  const colorInput = get('color');
  const instructionInput = get('instruction');

  return {
    id,
    name: nameInput ? nameInput.value : base.name,
    color: colorInput ? colorInput.value : base.color,
    instruction: instructionInput ? instructionInput.value : base.instruction,
    pity_every:
      pityInput && pityInput.value !== ''
        ? Number(pityInput.value)
        : pityInput
          ? null
          : base.pity_every,
    stock:
      stockInput && stockInput.value !== ''
        ? Number(stockInput.value)
        : stockInput
          ? null
          : base.stock,
    active: activeInput ? activeInput.checked : base.active,
    weight:
      pityInput && pityInput.value !== ''
        ? Math.round((100 / Math.max(1, Number(pityInput.value))) * 10) / 10
        : base.weight,
    pity_counter: base.pity_counter,
  };
}

function syncRoletaStateFromDom() {
  document.querySelectorAll('.roleta-prize-row, .roleta-detail').forEach((row) => {
    const patch = readPrizePatchFromRow(row);
    if (!patch) return;
    roletaState.premios = roletaState.premios.map((p) =>
      p.id === patch.id ? { ...p, ...patch } : p,
    );
  });
}

function bindRoletaEvents() {
  document.getElementById('roleta-add-prize')?.addEventListener('click', async () => {
    const name = String(document.getElementById('roleta-new-name')?.value || '').trim();
    const color = document.getElementById('roleta-new-color')?.value || '#FFC20E';
    const pityRaw = document.getElementById('roleta-new-pity')?.value;
    const stockRaw = document.getElementById('roleta-new-stock')?.value;
    const instruction = String(
      document.getElementById('roleta-new-instruction')?.value || '',
    ).trim();
    if (name.length < 2) {
      roletaShowError('Informe o nome do prêmio.');
      return;
    }
    try {
      roletaShowError('');
      const result = await roletaApi('/premios', {
        method: 'POST',
        body: JSON.stringify({
          name,
          color,
          pity_every: pityRaw === '' ? 10 : Number(pityRaw),
          stock: stockRaw === '' ? null : Number(stockRaw),
          instruction: instruction || 'Retire seu prêmio no balcão da Antonov.',
          active: true,
        }),
      });
      roletaState.premios = [...roletaState.premios, result.prize];
      roletaState.stats = {
        ...roletaState.stats,
        active_prizes: roletaState.premios.filter((p) => p.active).length,
      };
      renderRoletaAdmin();
      roletaShowSuccess(`Prêmio adicionado: ${result.prize.name}`);
    } catch (err) {
      roletaShowError(err.message || 'Falha ao adicionar prêmio.');
    }
  });

  document.getElementById('roleta-new-name')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('roleta-add-prize')?.click();
    }
  });

  document.getElementById('roleta-preset')?.addEventListener('click', async () => {
    try {
      roletaShowError('');
      const data = await roletaApi('/preset-estoque', { method: 'POST', body: '{}' });
      roletaState.premios = data.premios || [];
      renderRoletaAdmin();
      roletaShowSuccess('Preset por estoque aplicado e salvo.');
    } catch (err) {
      roletaShowError(err.message || 'Falha no preset.');
    }
  });

  document.getElementById('roleta-equalizar')?.addEventListener('click', async () => {
    try {
      roletaShowError('');
      const data = await roletaApi('/equalizar', {
        method: 'POST',
        body: JSON.stringify({ every: 10 }),
      });
      roletaState.premios = data.premios || [];
      renderRoletaAdmin();
      roletaShowSuccess('Equalizado em 1 a cada 10 e salvo.');
    } catch (err) {
      roletaShowError(err.message || 'Falha ao equalizar.');
    }
  });

  document.getElementById('roleta-save-all')?.addEventListener('click', async () => {
    try {
      syncRoletaStateFromDom();
      const data = await roletaApi('/premios', {
        method: 'PUT',
        body: JSON.stringify({ premios: roletaState.premios }),
      });
      roletaState.premios = data.premios?.length
        ? data.premios
        : roletaState.premios;
      // reload full list to keep order
      const full = await roletaApi('/premios');
      if (full.premios) roletaState.premios = full.premios;
      renderRoletaAdmin();
      roletaShowSuccess('Todas as taxas foram salvas.');
    } catch (err) {
      roletaShowError(err.message || 'Falha ao salvar taxas.');
    }
  });

  document.getElementById('roleta-save-settings')?.addEventListener('click', async () => {
    try {
      const settings = await roletaApi('/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          whatsapp_cooldown_hours: Number(document.getElementById('roleta-cooldown')?.value || 24),
          result_timeout_seconds: Number(document.getElementById('roleta-timeout')?.value || 15),
          allow_repeat_spin: Boolean(document.getElementById('roleta-allow-repeat')?.checked),
        }),
      });
      roletaState.settings = settings.settings;
      roletaShowSuccess('Configurações salvas.');
    } catch (err) {
      roletaShowError(err.message || 'Falha ao salvar configurações.');
    }
  });

  document.getElementById('roleta-layout-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      roletaShowError('');
      const compressed = await roletaCompressLayout(file);
      roletaState.pendingLayout = compressed;
      roletaState.layoutPreviewUrl = `data:${compressed.type};base64,${compressed.data}`;
      const bg = document.getElementById('roleta-preview-bg');
      if (bg) bg.style.backgroundImage = `url('${roletaState.layoutPreviewUrl}')`;
      const nameEl = document.getElementById('roleta-layout-filename');
      if (nameEl) nameEl.textContent = compressed.name;
      const saveBtn = document.getElementById('roleta-layout-save');
      if (saveBtn) saveBtn.disabled = false;
      roletaShowSuccess('Prévia atualizada. Clique em “Salvar layout” para aplicar no totem.');
    } catch (err) {
      roletaShowError(err.message || 'Falha ao ler o PNG.');
    }
  });

  document.getElementById('roleta-show-guides')?.addEventListener('change', (e) => {
    roletaState.showGuides = Boolean(e.target.checked);
    const frame = document.querySelector('.roleta-totem-preview__frame');
    const guides = document.getElementById('roleta-preview-guides');
    if (frame) frame.classList.toggle('is-guides', roletaState.showGuides);
    if (guides) guides.hidden = !roletaState.showGuides;
  });

  document.getElementById('roleta-layout-guide-dl')?.addEventListener('click', () => {
    try {
      roletaDownloadGuidePng();
      roletaShowSuccess('Gabarito 1080×1920 baixado. Importe como camada no Figma/Photoshop.');
    } catch (err) {
      roletaShowError(err.message || 'Falha ao gerar guia.');
    }
  });

  document.getElementById('roleta-layout-save')?.addEventListener('click', async () => {
    if (!roletaState.pendingLayout) {
      roletaShowError('Selecione um PNG antes de salvar.');
      return;
    }
    try {
      const data = await roletaApi('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ layout: roletaState.pendingLayout }),
      });
      roletaState.settings = data.settings;
      roletaState.layoutUrl = data.layout_url || roletaState.layoutPreviewUrl;
      roletaState.pendingLayout = null;
      roletaShowSuccess('Layout salvo no totem.');
    } catch (err) {
      roletaShowError(err.message || 'Falha ao salvar layout.');
    }
  });

  document.getElementById('roleta-layout-clear')?.addEventListener('click', async () => {
    try {
      const data = await roletaApi('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ layout: null }),
      });
      roletaState.settings = data.settings;
      roletaState.layoutUrl = null;
      roletaState.layoutPreviewUrl = null;
      roletaState.pendingLayout = null;
      const bg = document.getElementById('roleta-preview-bg');
      if (bg) bg.style.backgroundImage = '';
      const nameEl = document.getElementById('roleta-layout-filename');
      if (nameEl) nameEl.textContent = 'Nenhum layout';
      roletaShowSuccess('Layout removido.');
    } catch (err) {
      roletaShowError(err.message || 'Falha ao remover layout.');
    }
  });

  document.getElementById('roleta-export')?.addEventListener('click', () => {
    const rows = [
      ['data', 'nome', 'whatsapp', 'cpf', 'status', 'premio'],
      ...roletaState.spins.map((s) => [
        s.created_at,
        s.lead?.name || '',
        s.lead?.whatsapp || '',
        s.lead?.cpf || '',
        s.status || '',
        s.prize?.name || '',
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roleta-antonov-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('[data-id]');
      const id = row?.dataset.id;
      if (!id) return;
      const prize = roletaState.premios.find((p) => p.id === id);
      const label = prize?.name || 'este prêmio';
      if (!window.confirm(`Excluir “${label}” da roleta?`)) return;
      try {
        await roletaApi(`/premios/${id}`, { method: 'DELETE' });
        roletaState.premios = roletaState.premios.filter((p) => p.id !== id);
        roletaState.stats = {
          ...roletaState.stats,
          active_prizes: roletaState.premios.filter((p) => p.active).length,
        };
        renderRoletaAdmin();
        roletaShowSuccess('Prêmio excluído.');
      } catch (err) {
        roletaShowError(err.message || 'Falha ao excluir prêmio.');
      }
    });
  });

  document.querySelectorAll('[data-action="zerar"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('[data-id]');
      const id = row?.dataset.id;
      if (!id) return;
      try {
        const result = await roletaApi(`/premios/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ pity_counter: 0 }),
        });
        roletaState.premios = roletaState.premios.map((p) =>
          p.id === id ? result.prize : p,
        );
        renderRoletaAdmin();
        roletaShowSuccess('Contador zerado.');
      } catch (err) {
        roletaShowError(err.message || 'Falha ao zerar.');
      }
    });
  });

  document.querySelectorAll('[data-action="save-one"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const detail = btn.closest('.roleta-detail');
      const rateRow = document.querySelector(`.roleta-prize-row[data-id="${detail.dataset.id}"]`);
      const patch = {
        ...readPrizePatchFromRow(rateRow || detail),
        ...readPrizePatchFromRow(detail),
      };
      try {
        const result = await roletaApi(`/premios/${patch.id}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        roletaState.premios = roletaState.premios.map((p) =>
          p.id === patch.id ? result.prize : p,
        );
        renderRoletaAdmin();
        roletaShowSuccess(`Salvo: ${result.prize.name}`);
      } catch (err) {
        roletaShowError(err.message || 'Falha ao salvar prêmio.');
      }
    });
  });

  document.querySelectorAll('.roleta-prize-row [data-field]').forEach((input) => {
    input.addEventListener('change', () => {
      syncRoletaStateFromDom();
      // live chance preview without full re-render of inputs focus loss — soft update badges
      document.querySelectorAll('.roleta-prize-row').forEach((row) => {
        const p = roletaState.premios.find((x) => x.id === row.dataset.id);
        if (!p) return;
        const badge = row.querySelector('.roleta-chance');
        if (badge) badge.textContent = roletaFmtChance(roletaPityChance(p));
      });
    });
  });
}

async function loadRoletaAdmin() {
  const loading = document.getElementById('roleta-loading');
  if (loading) loading.hidden = false;
  roletaShowError('');
  try {
    const [dash, spinsData, layoutData] = await Promise.all([
      roletaApi(''),
      roletaApi('/spins?limit=200'),
      roletaApi('/layout'),
    ]);
    roletaState.premios = dash.premios || [];
    roletaState.settings = dash.settings || null;
    roletaState.stats = dash.stats || null;
    roletaState.spins = spinsData.spins || [];
    roletaState.layoutUrl = layoutData.layout_url || null;
    roletaState.layoutPreviewUrl = layoutData.layout_url || null;
    roletaState.pendingLayout = null;
    renderRoletaAdmin();
  } catch (err) {
    roletaShowError(err.message || 'Erro ao carregar roleta.');
  } finally {
    if (loading) loading.hidden = true;
  }
}

function initRoletaAdmin() {
  document.getElementById('roleta-refresh')?.addEventListener('click', () => {
    void loadRoletaAdmin();
  });
}

function onRoletaTabOpen() {
  void loadRoletaAdmin();
}
