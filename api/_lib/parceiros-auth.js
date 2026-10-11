import { getSql } from './db.js';
import { json } from './admin-http.js';
import { getSession as getBaseSession, requireAdmin as requireBaseAdmin } from './admin-auth.js';
import { USER_ROLES } from './parceiros-logic.js';

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

export async function getParceirosSession(req) {
  const session = await getBaseSession(req);
  if (!session) return null;
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, email, name, role, partner_id, deleted_at
      FROM admin_users
      WHERE id = ${session.userId}
      LIMIT 1
    `;
    const user = rows[0];
    if (!user || user.deleted_at) return null;
    const role = USER_ROLES.includes(user.role) ? user.role : 'admin_antonov';
    return {
      userId: Number(user.id),
      email: user.email,
      name: user.name || null,
      role,
      partnerId: user.partner_id ? Number(user.partner_id) : null,
    };
  } catch {
    return {
      ...session,
      name: null,
      role: 'super_admin',
      partnerId: null,
    };
  }
}

export async function requireParceirosAdmin(req, res) {
  const session = await getParceirosSession(req);
  if (!session) {
    json(res, 401, { error: 'Não autenticado.' });
    return null;
  }
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

export { requireBaseAdmin };
