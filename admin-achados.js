/* Módulo Achados e Perdidos */

const achadosState = {
  itens: [],
  pendingFoto: null,
};

function achEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function achFmtDate(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${day}/${m}/${y}`;
}

function achToday() {
  return new Date().toISOString().slice(0, 10);
}

async function achadosApi(path = '', opts = {}) {
  return api(`/achados-perdidos${path}`, opts);
}

function fileToBase64Payload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve({
        name: file.name,
        type: file.type || 'image/jpeg',
        size: file.size,
        data: base64,
      });
    };
    reader.onerror = () => reject(new Error('Falha ao ler a foto.'));
    reader.readAsDataURL(file);
  });
}

function renderAchadosList() {
  const el = document.getElementById('achados-content');
  if (!el) return;

  const itens = achadosState.itens || [];
  const pendentes = itens.filter((i) => i.status === 'pendente').length;
  const entregues = itens.filter((i) => i.status === 'entregue').length;

  el.innerHTML = `
    <div class="pdi-stats">
      <article class="pdi-stat"><span class="pdi-stat__val">${itens.length}</span><span class="pdi-stat__lbl">Total</span></article>
      <article class="pdi-stat"><span class="pdi-stat__val">${pendentes}</span><span class="pdi-stat__lbl">Pendentes</span></article>
      <article class="pdi-stat"><span class="pdi-stat__val">${entregues}</span><span class="pdi-stat__lbl">Entregues</span></article>
    </div>
    <div class="pdi-toolbar">
      <button type="button" class="btn btn-primary btn-sm" id="achados-new">+ Registrar item</button>
      <a class="btn btn-ghost btn-sm" href="/achados-e-perdidos" target="_blank" rel="noopener">Ver página pública</a>
    </div>
    <div class="card pdi-table-wrap">
      <table class="data-table pdi-table">
        <thead>
          <tr>
            <th>Foto</th>
            <th>Produto</th>
            <th>Cadastro</th>
            <th>Status</th>
            <th>Entrega</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${itens.map((item) => `
            <tr>
              <td>
                ${item.foto_url
                  ? `<img class="achados-thumb" src="${item.foto_url}" alt="" width="56" height="56" />`
                  : '<span class="pdi-muted">—</span>'}
              </td>
              <td><strong>${achEsc(item.nome_produto)}</strong></td>
              <td>${achFmtDate(item.data_cadastro)}</td>
              <td>
                <span class="pdi-badge ${item.status === 'pendente' ? 'pdi-badge--ativo' : ''}">
                  ${item.status === 'pendente' ? 'Pendente' : 'Entregue'}
                </span>
              </td>
              <td class="pdi-muted">
                ${item.status === 'entregue'
                  ? `${achFmtDate(item.data_entrega)} · ${achEsc(item.entregue_a || '—')}`
                  : '—'}
              </td>
              <td class="achados-row-actions">
                <button type="button" class="btn btn-sm btn-secondary" data-ach-edit="${item.id}">Editar</button>
                ${item.status === 'pendente'
                  ? `<button type="button" class="btn btn-sm btn-secondary" data-ach-found="${item.id}">Item encontrado</button>`
                  : ''}
                <button type="button" class="btn btn-sm btn-ghost pdi-btn-danger" data-ach-del="${item.id}">Excluir</button>
              </td>
            </tr>
          `).join('') || '<tr><td colspan="6" class="empty-msg">Nenhum item cadastrado.</td></tr>'}
        </tbody>
      </table>
    </div>`;

  el.querySelector('#achados-new')?.addEventListener('click', () => openAchadosForm());
  el.querySelectorAll('[data-ach-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = itens.find((i) => i.id === btn.dataset.achEdit);
      if (item) openAchadosForm(item);
    });
  });
  el.querySelectorAll('[data-ach-found]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = itens.find((i) => i.id === btn.dataset.achFound);
      if (item) openAchadosForm(item, { markFound: true });
    });
  });
  el.querySelectorAll('[data-ach-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este item permanentemente?')) return;
      try {
        await achadosApi(`/${btn.dataset.achDel}`, { method: 'DELETE' });
        await loadAchados();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function openAchadosForm(existing = null, opts = {}) {
  const modal = document.getElementById('achados-modal');
  const box = document.getElementById('achados-modal-body');
  if (!modal || !box) return;

  achadosState.pendingFoto = undefined;
  const markFound = Boolean(opts.markFound) || existing?.status === 'entregue';
  const title = existing
    ? (opts.markFound ? 'Marcar item como encontrado' : 'Editar item')
    : 'Registrar item';

  box.innerHTML = `
    <h3>${achEsc(title)}</h3>
    <form id="achados-form" class="pdi-form">
      <label><span>Nome do produto</span>
        <input name="nome_produto" required value="${achEsc(existing?.nome_produto || '')}" />
      </label>
      <label><span>Data de cadastro</span>
        <input type="date" name="data_cadastro" required value="${String(existing?.data_cadastro || achToday()).slice(0, 10)}" />
      </label>
      <div class="achados-foto-field">
        <span class="achados-foto-field__label">Foto ${existing?.has_foto ? '(deixe em branco para manter)' : ''}</span>
        <div class="achados-foto-actions">
          <label class="btn btn-secondary btn-sm achados-foto-btn">
            Tirar foto
            <input type="file" name="foto_camera" accept="image/*" capture="environment" hidden />
          </label>
          <label class="btn btn-ghost btn-sm achados-foto-btn">
            Galeria
            <input type="file" name="foto_galeria" accept="image/*" hidden />
          </label>
        </div>
      </div>
      <div id="achados-foto-preview" class="achados-foto-preview">
        ${existing?.foto_url ? `<img src="${existing.foto_url}" alt="Preview" />` : ''}
      </div>
      ${existing?.has_foto ? `
        <label class="achados-check">
          <input type="checkbox" name="remover_foto" />
          <span>Remover foto atual</span>
        </label>
      ` : ''}

      <div class="achados-found-block" id="achados-found-block" ${markFound ? '' : 'hidden'}>
        <h4>Entrega do item</h4>
        <label><span>Data de entrega</span>
          <input type="date" name="data_entrega" value="${String(existing?.data_entrega || achToday()).slice(0, 10)}" ${markFound ? 'required' : ''} />
        </label>
        <label><span>A quem foi entregue</span>
          <input name="entregue_a" value="${achEsc(existing?.entregue_a || '')}" placeholder="Nome do dono / responsável" ${markFound ? 'required' : ''} />
        </label>
        <label><span>Por quem foi entregue</span>
          <input name="entregue_por" value="${achEsc(existing?.entregue_por || '')}" placeholder="Nome do colaborador" ${markFound ? 'required' : ''} />
        </label>
      </div>

      <div class="modal-actions achados-modal-actions">
        ${existing && existing.status === 'pendente' && !opts.markFound
          ? '<button type="button" class="btn btn-secondary" id="achados-toggle-found">Item encontrado</button>'
          : ''}
        <button type="button" class="btn btn-ghost" id="achados-modal-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">${opts.markFound ? 'Confirmar entrega' : 'Salvar'}</button>
      </div>
    </form>`;

  modal.removeAttribute('hidden');

  const form = box.querySelector('#achados-form');
  const preview = box.querySelector('#achados-foto-preview');
  const foundBlock = box.querySelector('#achados-found-block');

  box.querySelector('#achados-modal-cancel')?.addEventListener('click', () => {
    modal.setAttribute('hidden', '');
  });

  box.querySelector('#achados-toggle-found')?.addEventListener('click', () => {
    foundBlock?.removeAttribute('hidden');
    ['data_entrega', 'entregue_a', 'entregue_por'].forEach((name) => {
      const input = form?.[name];
      if (input) input.required = true;
    });
    if (form?.data_entrega && !form.data_entrega.value) form.data_entrega.value = achToday();
    box.querySelector('#achados-toggle-found')?.setAttribute('hidden', '');
  });

  const onFotoChange = async (input) => {
    const file = input.files?.[0];
    if (!file) {
      achadosState.pendingFoto = undefined;
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      alert('A foto deve ter no máximo 4 MB.');
      input.value = '';
      return;
    }
    try {
      achadosState.pendingFoto = await fileToBase64Payload(file);
      if (preview) {
        preview.innerHTML = `<img src="data:${achadosState.pendingFoto.type};base64,${achadosState.pendingFoto.data}" alt="Preview" />`;
      }
      if (form.remover_foto) form.remover_foto.checked = false;
      // limpa o outro input para não haver conflito
      if (input.name === 'foto_camera' && form.foto_galeria) form.foto_galeria.value = '';
      if (input.name === 'foto_galeria' && form.foto_camera) form.foto_camera.value = '';
    } catch (err) {
      alert(err.message);
    }
  };

  form?.foto_camera?.addEventListener('change', () => onFotoChange(form.foto_camera));
  form?.foto_galeria?.addEventListener('change', () => onFotoChange(form.foto_galeria));

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const delivering = foundBlock && !foundBlock.hasAttribute('hidden');

    const payload = {
      nome_produto: f.nome_produto.value.trim(),
      data_cadastro: f.data_cadastro.value,
    };

    if (f.remover_foto?.checked) {
      payload.foto = null;
    } else if (achadosState.pendingFoto) {
      payload.foto = achadosState.pendingFoto;
    }

    if (delivering) {
      payload.status = 'entregue';
      payload.data_entrega = f.data_entrega.value;
      payload.entregue_a = f.entregue_a.value.trim();
      payload.entregue_por = f.entregue_por.value.trim();
      if (!payload.data_entrega || !payload.entregue_a || !payload.entregue_por) {
        alert('Preencha data de entrega, a quem e por quem foi entregue.');
        return;
      }
    }

    try {
      if (existing?.id) {
        await achadosApi(`/${existing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await achadosApi('', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      modal.setAttribute('hidden', '');
      await loadAchados();
    } catch (err) {
      alert(err.message);
    }
  });
}

async function loadAchados() {
  const loading = document.getElementById('achados-loading');
  const errEl = document.getElementById('achados-error');
  loading?.removeAttribute('hidden');
  errEl?.setAttribute('hidden', '');
  try {
    const data = await achadosApi('');
    achadosState.itens = data.itens || [];
    renderAchadosList();
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || 'Erro ao carregar Achados e Perdidos.';
      errEl.removeAttribute('hidden');
    }
  } finally {
    loading?.setAttribute('hidden', '');
  }
}

function initAchadosAdmin() {
  document.getElementById('achados-refresh')?.addEventListener('click', () => loadAchados());
  document.getElementById('achados-modal')?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
    document.getElementById('achados-modal')?.setAttribute('hidden', '');
  });
}

function onAchadosTabOpen() {
  loadAchados();
}
