import bcrypt from 'bcryptjs';
import { getSql } from './db.js';
import { ACCESS_MODULE_KEYS, parseModules, parseReportForms, serializeModules, serializeReportForms, staffRoleFromKind } from './access.js';
import { USER_ROLES } from './parceiros-logic.js';

function mapUser(row) {
  return {
    id: Number(row.id),
    email: row.email,
    name: row.name || null,
    role: row.role,
    partner_id: row.partner_id ? Number(row.partner_id) : null,
    modules: row.role === 'super_admin'
      ? [...ACCESS_MODULE_KEYS]
      : row.role === 'parceiro'
        ? []
        : parseModules(row.modules),
    report_forms: row.role === 'super_admin'
      ? null
      : parseReportForms(row.report_forms),
    must_change_password: Boolean(row.must_change_password),
    created_at: row.created_at,
  };
}

export async function listAdminUsers() {
  const sql = getSql();
  const rows = await sql`
    SELECT id, email, name, role, partner_id, modules, report_forms, must_change_password, created_at
    FROM admin_users
    WHERE deleted_at IS NULL
    ORDER BY email ASC
  `;
  return rows.map(mapUser);
}

export function normalizeUserInput(body, current = null, actor = null) {
  let kind = ['super_admin', 'equipe', 'parceiro'].includes(body.kind)
    ? body.kind
    : current?.role === 'super_admin'
      ? 'super_admin'
      : current?.role === 'parceiro'
        ? 'parceiro'
        : 'equipe';
  if (kind === 'super_admin' && actor?.role !== 'super_admin') {
    return { error: 'Somente um super admin define outro super admin.' };
  }
  const role = USER_ROLES.includes(body.role)
    ? body.role
    : staffRoleFromKind({ kind, partnerRole: body.partner_role });
  const name = body.name !== undefined ? String(body.name || '').trim() || null : current?.name || null;
  const partnerId = body.partner_id !== undefined
    ? (body.partner_id ? Number(body.partner_id) : null)
    : (current?.partner_id ? Number(current.partner_id) : null);
  let modules = role === 'super_admin'
    ? ACCESS_MODULE_KEYS
    : role === 'parceiro'
      ? []
      : body.modules !== undefined
        ? parseModules(body.modules)
        : ACCESS_MODULE_KEYS.filter((key) => key !== 'equipe');
  if (actor?.role !== 'super_admin') {
    modules = modules.filter((key) => key !== 'equipe');
    if (role === 'super_admin') {
      return { error: 'Somente um super admin define outro super admin.' };
    }
  }
  if (role === 'parceiro' && !partnerId) {
    return { error: 'Vincule um parceiro a contas com papel parceiro.' };
  }
  if (role !== 'parceiro' && role !== 'super_admin' && !modules.length) {
    return { error: 'Marque ao menos uma área de acesso.' };
  }
  let reportForms = null;
  if (role === 'super_admin') {
    reportForms = null;
  } else if (role === 'parceiro' || !modules.includes('reports')) {
    reportForms = [];
  } else if (body.report_forms !== undefined) {
    reportForms = parseReportForms(body.report_forms) || [];
    if (!reportForms.length) {
      return { error: 'Marque ao menos um relatório.' };
    }
  } else {
    reportForms = parseReportForms(current?.report_forms);
  }
  return { kind, role, name, partnerId, modules, reportForms };
}

export async function createAdminUser(body, actor = null) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password || password.length < 8) {
    return { error: 'E-mail e senha (mín. 8 caracteres) são obrigatórios.' };
  }
  const patch = normalizeUserInput(body, null, actor);
  if (patch.error) return patch;
  const sql = getSql();
  const hash = await bcrypt.hash(password, 12);
  try {
    const rows = await sql`
      INSERT INTO admin_users (email, password_hash, name, role, partner_id, modules, report_forms, must_change_password)
      VALUES (${email}, ${hash}, ${patch.name}, ${patch.role}, ${patch.partnerId}, ${serializeModules(patch.modules)}, ${serializeReportForms(patch.reportForms)}, ${patch.role !== 'parceiro'})
      RETURNING id, email, name, role, partner_id, modules, report_forms, must_change_password, created_at
    `;
    return { user: mapUser(rows[0]) };
  } catch (err) {
    const code = err?.code || err?.cause?.code;
    if (code === '23503') return { error: 'Parceiro não encontrado.' };
    return { error: 'E-mail já cadastrado.' };
  }
}

export async function updateAdminUser(id, body, actorId) {
  const sql = getSql();
  const current = await sql`SELECT * FROM admin_users WHERE id = ${id} AND deleted_at IS NULL`;
  if (!current[0]) return { error: 'Usuário não encontrado.', status: 404 };
  const patch = normalizeUserInput(body, current[0], actorId && typeof actorId === 'object' ? actorId : null);
  if (patch.error) return patch;
  if (current[0].role === 'super_admin' && patch.role !== 'super_admin') {
    const remaining = await sql`
      SELECT COUNT(*)::int AS n FROM admin_users
      WHERE role = 'super_admin' AND deleted_at IS NULL AND id <> ${id}
    `;
    if (!(remaining[0]?.n > 0)) {
      return { error: 'Precisa ficar ao menos um super admin.' };
    }
  }
  const password = body.password ? String(body.password) : '';
  if (password && password.length < 8) return { error: 'Senha muito curta.' };
  const hash = password ? await bcrypt.hash(password, 12) : current[0].password_hash;
  const actorUserId = actorId && typeof actorId === 'object' ? actorId.userId : actorId;
  const mustChange = password && Number(actorUserId) !== Number(id) && patch.role !== 'parceiro'
    ? true
    : Boolean(current[0].must_change_password);
  try {
    const rows = await sql`
      UPDATE admin_users SET
        name = ${patch.name},
        role = ${patch.role},
        partner_id = ${patch.partnerId},
        modules = ${serializeModules(patch.modules)},
        report_forms = ${serializeReportForms(patch.reportForms)},
        password_hash = ${hash},
        must_change_password = ${mustChange}
      WHERE id = ${id}
      RETURNING id, email, name, role, partner_id, modules, report_forms, must_change_password, created_at
    `;
    return { user: mapUser(rows[0]) };
  } catch (err) {
    const code = err?.code || err?.cause?.code;
    if (code === '23503') return { error: 'Parceiro não encontrado.' };
    return { error: 'Não foi possível atualizar o usuário.' };
  }
}

export async function deactivateAdminUser(id, actorId) {
  if (Number(id) === Number(actorId)) {
    return { error: 'Não é possível excluir o próprio usuário.' };
  }
  const sql = getSql();
  const current = await sql`SELECT role FROM admin_users WHERE id = ${id} AND deleted_at IS NULL`;
  if (!current[0]) return { error: 'Usuário não encontrado.', status: 404 };
  if (current[0].role === 'super_admin') {
    const remaining = await sql`
      SELECT COUNT(*)::int AS n FROM admin_users
      WHERE role = 'super_admin' AND deleted_at IS NULL AND id <> ${id}
    `;
    if (!(remaining[0]?.n > 0)) {
      return { error: 'Precisa ficar ao menos um super admin.' };
    }
  }
  await sql`UPDATE admin_users SET deleted_at = NOW() WHERE id = ${id} AND deleted_at IS NULL`;
  return { ok: true };
}
