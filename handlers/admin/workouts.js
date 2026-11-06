import { json, adminCors, parseBody } from '../../api/_lib/admin-http.js';
import { denyUnlessReportForm, requireAnyModule, requireModule } from '../../api/_lib/parceiros-auth.js';
import { getFormById } from '../../api/_lib/forms.js';
import { markWorkout, openInitialWorkouts, unmarkWorkout, workoutRanking } from '../../api/_lib/workouts.js';

function segments(req) {
  const raw = req.query?.path;
  if (typeof raw === 'string') return raw.split('/').filter(Boolean);
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return [];
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default async function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const parts = segments(req);

  try {
    if (parts[0] === 'ranking' && req.method === 'GET') {
      const session = await requireModule(req, res, 'hr');
      if (!session) return;
      const [ranking, open] = await Promise.all([
        workoutRanking({
          from: parseDate(req.query?.from),
          to: parseDate(req.query?.to),
        }),
        openInitialWorkouts(),
      ]);
      const total = ranking.reduce((sum, row) => sum + row.total, 0);
      return json(res, 200, { ranking, total, open });
    }

    if (parts.length === 0 && (req.method === 'POST' || req.method === 'DELETE')) {
      const session = await requireAnyModule(req, res, ['reports', 'forms']);
      if (!session) return;
      const body = req.method === 'POST' ? (parseBody(req) || {}) : (req.query || {});
      const formId = Number(body.form_id);
      const submissionId = Number(body.submission_id);
      if (!formId || !submissionId) return json(res, 400, { error: 'Resposta inválida.' });
      const form = await getFormById(formId);
      if (!form) return json(res, 404, { error: 'Formulário não encontrado.' });
      if (denyUnlessReportForm(res, session, formId)) return;

      if (req.method === 'POST') {
        const { check, created } = await markWorkout(formId, submissionId, session);
        return json(res, created ? 201 : 200, { workout: check, already: !created });
      }
      const result = await unmarkWorkout(formId, submissionId, session);
      if (result.error) return json(res, result.status || 400, { error: result.error });
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: 'Rota não encontrada.' });
  } catch (err) {
    console.error('admin workouts', err);
    return json(res, 500, { error: 'Erro ao processar treino.' });
  }
}
