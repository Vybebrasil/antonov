import { json } from '../../api/_lib/admin-http.js';
import { getFormBySlug, getFormFields } from '../../api/_lib/forms.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.end();
  }
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  const slug = String(req.query?.slug || '').trim();
  if (!slug) return json(res, 400, { error: 'Slug inválido.' });

  try {
    const form = await getFormBySlug(slug);
    if (!form || form.source_type !== 'dynamic') {
      return json(res, 404, { error: 'Formulário não encontrado.' });
    }

    const fields = await getFormFields(form.id);
    const publicFields = fields.map((f) => ({
      id: f.id,
      field_key: f.field_key,
      label: f.label,
      description: f.description,
      placeholder: f.placeholder,
      field_type: f.field_type,
      required: f.required,
      options: f.options,
      show_when: f.show_when,
      field_width: f.field_width || 'full',
      sort_order: f.sort_order,
    }));

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return json(res, 200, {
      form: {
        slug: form.slug,
        name: form.name,
        description: form.description,
      },
      fields: publicFields,
    });
  } catch (err) {
    console.error('form get', err);
    return json(res, 500, { error: 'Erro ao carregar formulário.' });
  }
}
