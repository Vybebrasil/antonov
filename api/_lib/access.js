export const ACCESS_MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'reports', label: 'Relatórios' },
  { key: 'forms', label: 'Formulários' },
  { key: 'hr', label: 'RH / PDI' },
  { key: 'achados', label: 'Achados' },
  { key: 'parceiros', label: 'Parceiros' },
  { key: 'telao', label: 'Telão' },
  { key: 'equipe', label: 'Configurações de acesso' },
];

export const ACCESS_MODULE_KEYS = ACCESS_MODULES.map((item) => item.key);

const STAFF_DEFAULT = ACCESS_MODULE_KEYS.filter((key) => key !== 'equipe');

export function parseModules(value) {
  if (Array.isArray(value)) {
    return ACCESS_MODULE_KEYS.filter((key) => value.includes(key));
  }
  return ACCESS_MODULE_KEYS.filter((key) => String(value || '')
    .split(/[,\s]+/)
    .filter(Boolean)
    .includes(key));
}

export function serializeModules(value) {
  return parseModules(value).join(',');
}

export function modulesForUser(user) {
  const role = user?.role || 'admin_antonov';
  if (role === 'parceiro') return [];
  if (role === 'super_admin') return [...ACCESS_MODULE_KEYS];
  if (user?.modules == null) return [...STAFF_DEFAULT];
  return parseModules(user.modules);
}

export function hasModule(session, key) {
  if (!session || session.role === 'parceiro') return false;
  if (session.role === 'super_admin') return ACCESS_MODULE_KEYS.includes(key);
  const list = Array.isArray(session.modules) ? session.modules : modulesForUser(session);
  return list.includes(key);
}

export function firstModule(session) {
  const list = Array.isArray(session?.modules) ? session.modules : modulesForUser(session);
  return list[0] || null;
}

export function staffRoleFromKind({ kind, partnerRole }) {
  if (kind === 'super_admin') return 'super_admin';
  if (kind === 'parceiro') return 'parceiro';
  if (partnerRole === 'marketing' || partnerRole === 'financeiro') return partnerRole;
  return 'admin_antonov';
}

export function parseReportForms(value) {
  if (value == null) return null;
  const raw = Array.isArray(value) ? value : String(value).split(/[,\s]+/).filter(Boolean);
  const ids = [...new Set(raw.map((item) => Number(item)).filter((id) => Number.isInteger(id) && id > 0))];
  return ids;
}

export function serializeReportForms(value) {
  const ids = parseReportForms(value);
  return ids == null ? null : ids.join(',');
}

export function reportFormsForUser(user) {
  if (user?.role === 'super_admin') return null;
  if (user?.role === 'parceiro') return [];
  return parseReportForms(user?.report_forms ?? user?.reportForms);
}

export function canAccessReportForm(session, formId) {
  if (!session || session.role === 'parceiro') return false;
  if (session.role === 'super_admin') return true;
  if (hasModule(session, 'reports')) {
    const list = reportFormsForUser(session);
    if (list == null) return true;
    return list.includes(Number(formId));
  }
  return hasModule(session, 'forms');
}
