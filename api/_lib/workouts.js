import { getSql } from './db.js';

let ensured = false;

export async function ensureWorkoutsTable() {
  if (ensured) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS workout_checks (
      id SERIAL PRIMARY KEY,
      form_id INTEGER NOT NULL,
      submission_id INTEGER NOT NULL,
      done_by INTEGER NOT NULL,
      done_by_name TEXT,
      done_by_email TEXT,
      done_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (form_id, submission_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS workout_checks_done_at_idx ON workout_checks (done_at)`;
  ensured = true;
}

function mapCheck(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    form_id: Number(row.form_id),
    submission_id: Number(row.submission_id),
    done_by: Number(row.done_by),
    done_by_name: row.done_by_name || row.done_by_email || 'Profissional',
    done_at: row.done_at,
  };
}

export async function workoutsForSubmissions(formId, submissionIds) {
  const ids = submissionIds.map(Number).filter(Boolean);
  if (!ids.length) return new Map();
  await ensureWorkoutsTable();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM workout_checks
    WHERE form_id = ${formId} AND submission_id = ANY(${ids})
  `;
  return new Map(rows.map((row) => [Number(row.submission_id), mapCheck(row)]));
}

export async function markWorkout(formId, submissionId, session) {
  await ensureWorkoutsTable();
  const sql = getSql();
  const inserted = await sql`
    INSERT INTO workout_checks (form_id, submission_id, done_by, done_by_name, done_by_email)
    VALUES (${formId}, ${submissionId}, ${session.userId}, ${session.name || null}, ${session.email || null})
    ON CONFLICT (form_id, submission_id) DO NOTHING
    RETURNING *
  `;
  if (inserted[0]) return { check: mapCheck(inserted[0]), created: true };
  const existing = await sql`
    SELECT * FROM workout_checks WHERE form_id = ${formId} AND submission_id = ${submissionId}
  `;
  return { check: mapCheck(existing[0]), created: false };
}

export async function unmarkWorkout(formId, submissionId, session) {
  await ensureWorkoutsTable();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM workout_checks WHERE form_id = ${formId} AND submission_id = ${submissionId}
  `;
  if (!rows[0]) return { error: 'Treino não estava marcado.', status: 404 };
  if (Number(rows[0].done_by) !== Number(session.userId) && session.role !== 'super_admin') {
    return { error: 'Só quem marcou ou um super admin pode desmarcar.', status: 403 };
  }
  await sql`DELETE FROM workout_checks WHERE id = ${rows[0].id}`;
  return { ok: true };
}

export const OPEN_INITIAL_SINCE = '2026-10-27T03:00:00.000Z';

export async function openInitialWorkouts() {
  await ensureWorkoutsTable();
  const sql = getSql();
  const rows = await sql`
    SELECT COUNT(*)::int AS total, MIN(s.created_at) AS oldest_at
    FROM form_submissions s
    JOIN forms f ON f.id = s.form_id
    WHERE (f.slug = 'anamnese' OR f.name ILIKE '%anamnese%')
      AND s.created_at >= ${OPEN_INITIAL_SINCE}::timestamptz
      AND NOT EXISTS (
        SELECT 1 FROM workout_checks w
        WHERE w.form_id = s.form_id AND w.submission_id = s.id
      )
  `;
  return {
    total: Number(rows[0]?.total || 0),
    oldest_at: rows[0]?.oldest_at || null,
    since: OPEN_INITIAL_SINCE,
  };
}

export async function workoutRanking({ from = null, to = null } = {}) {
  await ensureWorkoutsTable();
  const sql = getSql();
  const rows = await sql`
    SELECT
      w.done_by,
      COALESCE(u.name, MAX(w.done_by_name), u.email, MAX(w.done_by_email)) AS name,
      COALESCE(u.email, MAX(w.done_by_email)) AS email,
      COUNT(*)::int AS total,
      MAX(w.done_at) AS last_at
    FROM workout_checks w
    LEFT JOIN admin_users u ON u.id = w.done_by
    WHERE (${from}::timestamptz IS NULL OR w.done_at >= ${from}::timestamptz)
      AND (${to}::timestamptz IS NULL OR w.done_at <= ${to}::timestamptz)
    GROUP BY w.done_by, u.name, u.email
    ORDER BY total DESC, last_at DESC
  `;
  return rows.map((row) => ({
    user_id: Number(row.done_by),
    name: row.name || 'Profissional',
    email: row.email || '',
    total: Number(row.total),
    last_at: row.last_at,
  }));
}
