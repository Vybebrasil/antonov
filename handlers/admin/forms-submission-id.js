import { json, adminCors } from '../../api/lib/admin-http.js';
import { requireAdmin } from '../../api/lib/admin-auth.js';
import {
  getFormById,
  deleteDynamicSubmission,
  deleteLegacySubmission,
  LEGACY_TABLES,
} from '../../api/lib/forms.js';

export default async function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'DELETE') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const formId = Number(req.query?.id);
  const submissionId = Number(req.query?.submissionId);
  if (!formId || !submissionId) return json(res, 400, { error: 'ID inválido.' });

  const form = await getFormById(formId);
  if (!form) return json(res, 404, { error: 'Formulário não encontrado.' });

  try {
    let deleted = false;
    if (form.source_type === 'legacy' && LEGACY_TABLES[form.legacy_table]) {
      deleted = await deleteLegacySubmission(form.legacy_table, submissionId);
    } else {
      deleted = await deleteDynamicSubmission(formId, submissionId);
    }

    if (!deleted) return json(res, 404, { error: 'Resposta não encontrada.' });
    return json(res, 200, { ok: true, id: submissionId });
  } catch (err) {
    console.error('delete submission', err);
    return json(res, 500, { error: 'Erro ao excluir resposta.' });
  }
}
