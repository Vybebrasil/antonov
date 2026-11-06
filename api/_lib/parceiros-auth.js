import { getSql } from './db.js';
import { json } from './admin-http.js';
import { getSession as getBaseSession, requireAdmin as requireBaseAdmin } from './admin-auth.js';
import { USER_ROLES } from './parceiros-logic.js';
import { ACCESS_MODULE_KEYS, canAccessReportForm, hasModule, modulesForUser, reportFormsForUser } from './access.js';

export const PERMISSIONS = {
  'partners.read': ['super_admin', 'admin_antonov', 'marketing'],
  'partners.write': ['super_admin', 'admin_antonov', 'marketing'],
  'categories.read': ['super_admin', 'admin_antonov', 'marketing'],
  'categories.write': ['super_admin', 'admin_antonov', 'marketing'],
  'plans.read': ['super_admin', 'admin_antonov', 'financeiro'],
  'plans.write': ['super_admin', 'admin_antonov'],
  'contracts.read': ['super_admin', 'admin_antonov', 'financeiro'],
  'contracts.write': ['super_admin', 'admin_antonov', 'financeiro'],
  'campaigns.read': ['super_admin', 'admin_antonov', 'marketing'],
  'campaigns.write': ['super_admin', 'admin_antonov', 'marketing'],
  'ads.read': ['super_admin', 'admin_antonov', 'marketing'],
  'ads.write': ['super_admin', 'admin_antonov', 'marketing'],
  'analytics.read': ['super_admin', 'admin_antonov', 'marketing', 'financeiro'],
  'finance.read': ['super_admin', 'admin_antonov', 'financeiro'],
  'finance.write': ['super_admin', 'admin_antonov', 'financeiro'],
  'users.read': ['super_admin'],
  'users.write': ['super_admin'],
  'portal.read': ['super_admin', 'parceiro'],
};

export function roleOf(session) {
  return session?.role || 'admin_antonov';
}

export function hasPermission(session, permission) {
  if (!session) return false;
  const role = roleOf(session);
  if (role === 'super_admin') return true;
  const allowed = PERMISSIONS[permission];
  if (!allowed) return false;
  return allowed.includes(role);
}

let accessReady = false;

export async function ensureAccessShape() {
  if (accessReady) return;
  const sql = getSql();
  await sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS modules TEXT`;
  await sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS report_forms TEXT`;
  await sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE`;
  const staff = ACCESS_MODULE_KEYS.filter((key) => key !== 'equipe').join(',');
  const all = ACCESS_MODULE_KEYS.join(',');
  await sql`
    UPDATE admin_users SET modules = ${all}
    WHERE modules IS NULL AND role IN ('super_admin', 'admin_antonov')
  `;
  await sql`
    UPDATE admin_users SET modules = ${staff}
    WHERE modules IS NULL AND role IN ('marketing', 'financeiro')
  `;
  accessReady = true;
}

export async function getParceirosSession(req) {
  const session = await getBaseSession(req);
  if (!session) return null;
  try {
    await ensureAccessShape();
    const sql = getSql();
    const rows = await sql`
      SELECT id, email, name, role, partner_id, deleted_at, modules, report_forms, must_change_password
      FROM admin_users
      WHERE id = ${session.userId}
    LIMIT 1
    `;
    const user = rows[0];
    if (!user || user.deleted_at) return null;
    const role = USER_ROLES.includes(user.role) ? user.role : 'admin_antonov';
    const full = { ...user, role };
    return {
      userId: Number(user.id),
      email: user.email,
      name: user.name || null,
      role,
      partnerId: user.partner_id ? Number(user.partner_id) : null,
      modules: modulesForUser(full),
      reportForms: reportFormsForUser(full),
      mustChangePassword: Boolean(user.must_change_password),
    };
  } catch {
    return {
      ...session,
      name: null,
      role: 'super_admin',
      partnerId: null,
      modules: [...ACCESS_MODULE_KEYS],
      reportForms: null,
      mustChangePassword: false,
    };
  }
}

export function denyIfPasswordChange(res, session) {
  if (!session?.mustChangePassword) return false;
  json(res, 403, { error: 'Troque a senha para continuar.', code: 'password_change_required' });
  return true;
}

export async function requireParceirosAdmin(req, res) {
  const session = await getParceirosSession(req);
  if (!session) {
    json(res, 401, { error: 'Não autenticado.' });
    return null;
  }
  if (denyIfPasswordChange(res, session)) return null;
  return session;
}

export async function requirePermission(req, res, permission) {
  const session = await requireParceirosAdmin(req, res);
  if (!session) return null;
  if (!hasPermission(session, permission)) {
    json(res, 403, { error: 'Sem permissão para esta ação.' });
    return null;
  }
  return session;
}

export async function requireModule(req, res, moduleKey) {
  const session = await requireParceirosAdmin(req, res);
  if (!session) return null;
  if (!hasModule(session, moduleKey)) {
    json(res, 403, { error: 'Sem permissão para esta área.' });
    return null;
  }
  return session;
}

export async function requireAnyModule(req, res, moduleKeys) {
  const session = await requireParceirosAdmin(req, res);
  if (!session) return null;
  if (!moduleKeys.some((key) => hasModule(session, key))) {
    json(res, 403, { error: 'Sem permissão para esta área.' });
    return null;
  }
  return session;
}

export function denyUnlessReportForm(res, session, formId) {
  if (canAccessReportForm(session, formId)) return false;
  json(res, 403, { error: 'Sem permissão para este relatório.' });
  return true;
}

export { requireBaseAdmin };
