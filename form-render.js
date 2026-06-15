const SUBMIT_BTN_HTML = `
  <span class="form-submit__label">Enviar resposta</span>
  <span class="form-submit__meta">Enviar <span class="arrow" aria-hidden="true"></span></span>
`;

const MAX_FILE_BYTES = 4 * 1024 * 1024;

function fileAcceptFromOptions(field) {
  if (!Array.isArray(field?.options) || !field.options.length) return '';
  return field.options
    .map((item) => String(item).trim())
    .filter(Boolean)
    .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`))
    .join(',');
}

async function readFilePayload(input, label) {
  const file = input?.files?.[0];
  if (!file) return null;
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${label}: arquivo excede ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB.`);
  }
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error(`${label}: não foi possível ler o arquivo.`));
    reader.readAsDataURL(file);
  });
  return { name: file.name, type: file.type, size: file.size, data };
}

function getSlug() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('slug')) return params.get('slug');
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] === 'form' && parts[1]) return parts[1];
  return null;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatPlainText(text) {
  const safe = escapeHtml(String(text ?? '').trim());
  if (!safe) return '';

  return safe
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n/g, '<br>'))
    .map((block) => `<p>${block}</p>`)
    .join('');
}

function requiredMark(required) {
  return required ? ' <span class="req" aria-hidden="true">*</span>' : '';
}

function normCondValue(v) {
  return String(v ?? '').trim().toLowerCase();
}

function checkboxOptions(field) {
  if (field?.field_type !== 'checkbox' || !Array.isArray(field.options)) return [];
  return field.options.map(String).filter(Boolean);
}

function isCheckboxGroup(field) {
  return checkboxOptions(field).length > 0;
}

function getCheckboxFieldValue(form, field) {
  const wrap = form.querySelector(`.form-field[data-field-key="${CSS.escape(field.field_key)}"]`);
  if (!wrap) return isCheckboxGroup(field) ? [] : false;

  const inputs = wrap.querySelectorAll('input[type="checkbox"]');
  if (isCheckboxGroup(field)) {
    return [...inputs].filter((input) => input.checked).map((input) => input.value);
  }
  return inputs[0]?.checked || false;
}

function fieldIsVisible(field, values) {
  const cond = field.show_when;
  if (!cond?.field_key) return true;

  const parentVal = values[cond.field_key];
  const op = cond.operator || 'equals';

  if (op === 'checked') {
    if (Array.isArray(parentVal)) return parentVal.length > 0;
    return Boolean(parentVal);
  }
  if (op === 'not_checked') {
    if (Array.isArray(parentVal)) return parentVal.length === 0;
    return !Boolean(parentVal);
  }

  if (Array.isArray(parentVal)) {
    const normalized = parentVal.map(normCondValue);
    const expected = normCondValue(cond.value);
    if (op === 'equals') return normalized.includes(expected);
    if (op === 'not_equals') return !normalized.includes(expected);
    if (op === 'contains') return normalized.some((v) => v.includes(expected));
    return true;
  }

  const str = normCondValue(parentVal);
  const expected = normCondValue(cond.value);

  if (op === 'equals') return str === expected;
  if (op === 'not_equals') return str !== expected;
  if (op === 'contains') return str.includes(expected);
  return true;
}

function getFormValues(form, fields) {
  const values = {};
  for (const f of fields) {
    if (f.field_type === 'checkbox') values[f.field_key] = getCheckboxFieldValue(form, f);
    else if (f.field_type === 'radio') {
      const checked = form.querySelector(`input[type="radio"][name="${CSS.escape(f.field_key)}"]:checked`);
      values[f.field_key] = checked?.value ?? '';
    } else if (f.field_type === 'file') {
      const input = form.elements[f.field_key];
      values[f.field_key] = input?.files?.length ? input.files[0].name : '';
    } else values[f.field_key] = form.elements[f.field_key]?.value ?? '';
  }
  return values;
}

function fieldWidthClass(w) {
  const width = w || 'full';
  if (width === 'half') return ' form-field--width-half';
  if (width === 'third') return ' form-field--width-third';
  return ' form-field--width-full';
}

function renderField(f) {
  const req = f.required ? ' required' : '';
  const name = escapeHtml(f.field_key);
  const label = escapeHtml(f.label);
  const widthCls = fieldWidthClass(f.field_width);
  const desc = f.description
    ? `<p class="field-desc">${escapeHtml(f.description)}</p>`
    : '';
  const ph = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : '';
  const showWhen = f.show_when ? ` data-show-when='${escapeHtml(JSON.stringify(f.show_when))}'` : '';
  const hidden = f.show_when ? ' hidden' : '';
  const reqHtml = requiredMark(f.required);

  if (f.field_type === 'checkbox') {
    const opts = checkboxOptions(f);
    if (opts.length) {
      const boxes = opts.map((o) => {
        const val = escapeHtml(o);
        return `<label class="form-check">
          <input type="checkbox" name="${name}" value="${val}" />
          <span class="form-check__text">${val}</span>
        </label>`;
      }).join('');
      return `<div class="form-field form-field--check form-field--check-group${widthCls}"${showWhen}${hidden} data-field-key="${name}">
        <span class="form-field__name">${label}${reqHtml}</span>
        ${desc}
        <div class="form-check-group">${boxes}</div>
      </div>`;
    }

    return `<div class="form-field form-field--check${widthCls}"${showWhen}${hidden} data-field-key="${name}">
      <label class="form-check">
        <input type="checkbox" name="${name}" value="1"${req}${f.default_value && ['1', 'true', 'sim', 'yes'].includes(String(f.default_value).toLowerCase()) ? ' checked' : ''} />
        <span class="form-check__text">${label}${reqHtml}</span>
      </label>
      ${desc}
    </div>`;
  }

  let inner = '';

  if (f.field_type === 'textarea') {
    inner = `<textarea name="${name}" rows="4"${ph}${req}>${f.default_value ? escapeHtml(f.default_value) : ''}</textarea>`;
  } else if (f.field_type === 'select') {
    const opts = (f.options || []).map((o) => {
      const sel = f.default_value && String(f.default_value) === String(o) ? ' selected' : '';
      return `<option value="${escapeHtml(o)}"${sel}>${escapeHtml(o)}</option>`;
    }).join('');
    inner = `<select name="${name}"${req}><option value="">Selecione…</option>${opts}</select>`;
  } else if (f.field_type === 'radio') {
    const opts = (f.options || []).filter(Boolean);
    const radios = opts.map((o) => {
      const checked = f.default_value && String(f.default_value) === String(o) ? ' checked' : '';
      return `<label class="form-check">
        <input type="radio" name="${name}" value="${escapeHtml(o)}"${checked}${req && opts[0] === o ? '' : ''} />
        <span class="form-check__text">${escapeHtml(o)}</span>
      </label>`;
    }).join('');
    return `<div class="form-field form-field--radio form-field--check-group${widthCls}"${showWhen}${hidden} data-field-key="${name}">
      <span class="form-field__name">${label}${reqHtml}</span>
      ${desc}
      <div class="form-check-group form-radio-group">${radios}</div>
    </div>`;
  } else if (f.field_type === 'file') {
    const accept = fileAcceptFromOptions(f);
    const acceptAttr = accept ? ` accept="${escapeHtml(accept)}"` : '';
    inner = `<input type="file" name="${name}" class="form-file-input"${acceptAttr}${req} />`;
    return `<div class="form-field form-field--file${widthCls}" data-field-key="${name}"${showWhen}${hidden}>
      <label class="form-field__label">
        <span class="form-field__name">${label}${reqHtml}</span>
        ${desc}
        ${inner}
      </label>
    </div>`;
  } else {
    const type = ['email', 'tel', 'date', 'number'].includes(f.field_type) ? f.field_type : 'text';
    const extra = f.field_type === 'number' ? ' inputmode="decimal" step="any"' : '';
    const defVal = f.default_value ? ` value="${escapeHtml(f.default_value)}"` : '';
    inner = `<input type="${type}" name="${name}"${ph}${extra}${defVal}${req} />`;
  }

  return `<div class="form-field${widthCls}" data-field-key="${name}"${showWhen}${hidden}>
    <label class="form-field__label">
      <span class="form-field__name">${label}${reqHtml}</span>
      ${desc}
      ${inner}
    </label>
  </div>`;
}

function syncConditionalFields(form, fields) {
  const values = getFormValues(form, fields);

  for (const f of fields) {
    const wrap = form.querySelector(`.form-field[data-field-key="${CSS.escape(f.field_key)}"]`);
    if (!wrap) continue;

    const visible = fieldIsVisible(f, values);
    if (visible) wrap.removeAttribute('hidden');
    else wrap.setAttribute('hidden', '');

    const inputs = wrap.querySelectorAll('input[type="checkbox"], input:not([type="checkbox"]), select, textarea');
    if (!inputs.length) continue;

    if (!visible) {
      inputs.forEach((input) => {
        if (input.type === 'checkbox') input.checked = false;
        else if (input.type === 'file') input.value = '';
        else input.value = '';
        input.removeAttribute('required');
      });
      continue;
    }

    if (f.required) {
      if (isCheckboxGroup(f)) continue;
      if (f.field_type === 'checkbox' || f.field_type === 'file') inputs[0]?.setAttribute('required', '');
      else inputs[0]?.setAttribute('required', '');
    }
  }
}

function validateRequiredFields(fields, values) {
  for (const f of fields) {
    if (!f.required || !fieldIsVisible(f, values)) continue;
    const val = values[f.field_key];
    if (isCheckboxGroup(f) && (!Array.isArray(val) || !val.length)) {
      return `Campo obrigatório: ${f.label}`;
    }
    if (f.field_type === 'radio' && !String(val || '').trim()) {
      return `Campo obrigatório: ${f.label}`;
    }
    if (f.field_type === 'file') {
      const input = form.querySelector(`input[type="file"][name="${CSS.escape(f.field_key)}"]`);
      if (!input?.files?.length) return `Campo obrigatório: ${f.label}`;
    }
  }
  return null;
}

function resetSubmitButton(btn) {
  if (!btn) return;
  btn.disabled = false;
  btn.innerHTML = SUBMIT_BTN_HTML;
}

function hideEl(el) {
  if (el) el.setAttribute('hidden', '');
}

function showEl(el) {
  if (el) el.removeAttribute('hidden');
}

async function init() {
  const slug = getSlug();
  const loading = document.getElementById('form-loading');
  const errorEl = document.getElementById('form-error');
  const wrap = document.getElementById('form-wrap');

  if (!slug) {
    hideEl(loading);
    errorEl.textContent = 'Formulário não encontrado.';
    showEl(errorEl);
    return;
  }

  try {
    const res = await fetch(`/api/forms/${slug}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Formulário não encontrado.');

    hideEl(loading);
    showEl(wrap);

    document.getElementById('form-title').textContent = data.form.name;
    document.title = `${data.form.name} | Antonov Center`;

    const desc = document.getElementById('form-desc');
    if (data.form.description) {
      desc.innerHTML = formatPlainText(data.form.description);
      desc.removeAttribute('hidden');
    } else {
      desc.innerHTML = '';
      desc.setAttribute('hidden', '');
    }

    const form = document.getElementById('dynamic-form');
    const fields = [...data.fields].sort((a, b) => a.sort_order - b.sort_order);
    form.innerHTML = fields.map(renderField).join('') +
      `<button type="submit" class="form-submit">${SUBMIT_BTN_HTML}</button>`;

    form.addEventListener('input', () => syncConditionalFields(form, fields));
    form.addEventListener('change', () => syncConditionalFields(form, fields));
    syncConditionalFields(form, fields);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      syncConditionalFields(form, fields);

      const btn = form.querySelector('[type="submit"]');
      const values = getFormValues(form, fields);
      const requiredError = validateRequiredFields(fields, values);
      if (requiredError) {
        alert(requiredError);
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="form-submit__label">Enviando…</span>';

      const body = {};
      try {
        for (const f of fields) {
          if (!fieldIsVisible(f, values)) {
            body[f.field_key] = isCheckboxGroup(f)
              ? []
              : (f.field_type === 'checkbox' ? false : (f.field_type === 'file' ? null : ''));
            continue;
          }
          if (f.field_type === 'file') {
            body[f.field_key] = await readFilePayload(form.elements[f.field_key], f.label);
          } else {
            body[f.field_key] = values[f.field_key];
          }
        }
      } catch (fileErr) {
        resetSubmitButton(btn);
        alert(fileErr.message);
        return;
      }
      body.page = window.location.pathname;

      try {
        const r = await fetch(`/api/forms/${slug}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const result = await r.json();
        if (!r.ok) throw new Error(result.error || 'Erro ao enviar.');

        form.setAttribute('hidden', '');
        document.querySelector('.form-card__head')?.setAttribute('hidden', '');
        document.getElementById('form-success').removeAttribute('hidden');
      } catch (err) {
        resetSubmitButton(btn);
        alert(err.message);
      }
    });
  } catch (err) {
    hideEl(loading);
    errorEl.textContent = err.message;
    showEl(errorEl);
  }
}

init();
