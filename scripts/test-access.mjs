import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCESS_MODULE_KEYS,
  firstModule,
  hasModule,
  modulesForUser,
  parseModules,
  parseReportForms,
  canAccessReportForm,
  serializeModules,
  staffRoleFromKind,
} from '../api/_lib/access.js';
import { normalizeUserInput } from '../api/_lib/admin-users.js';

describe('módulos de acesso', () => {
  it('aceita só chaves conhecidas', () => {
    assert.deepEqual(parseModules('dashboard,telao,foo'), ['dashboard', 'telao']);
    assert.equal(serializeModules(['forms', 'forms', 'hr']), 'forms,hr');
  });

  it('super admin abre tudo e parceiro não entra no admin', () => {
    assert.deepEqual(modulesForUser({ role: 'super_admin' }), ACCESS_MODULE_KEYS);
    assert.deepEqual(modulesForUser({ role: 'parceiro', modules: 'dashboard' }), []);
    assert.equal(hasModule({ role: 'super_admin' }, 'equipe'), true);
    assert.equal(hasModule({ role: 'parceiro' }, 'dashboard'), false);
  });

  it('equipe antiga sem coluna ganha as áreas operacionais', () => {
    const modules = modulesForUser({ role: 'admin_antonov' });
    assert.equal(modules.includes('dashboard'), true);
    assert.equal(modules.includes('equipe'), false);
    assert.equal(firstModule({ role: 'admin_antonov', modules: ['telao', 'hr'] }), 'telao');
  });

  it('define o papel a partir do tipo de conta', () => {
    assert.equal(staffRoleFromKind({ kind: 'super_admin' }), 'super_admin');
    assert.equal(staffRoleFromKind({ kind: 'parceiro' }), 'parceiro');
    assert.equal(staffRoleFromKind({ kind: 'equipe', partnerRole: 'marketing' }), 'marketing');
    assert.equal(staffRoleFromKind({ kind: 'equipe' }), 'admin_antonov');
  });

  it('somente super admin concede Equipe ou outro super admin', () => {
    const denied = normalizeUserInput({ kind: 'super_admin', modules: ['dashboard'] }, null, { role: 'admin_antonov' });
    assert.equal(denied.error, 'Somente um super admin define outro super admin.');
    const staff = normalizeUserInput({ kind: 'equipe', modules: ['telao', 'equipe'] }, null, { role: 'admin_antonov' });
    assert.deepEqual(staff.modules, ['telao']);
    const ok = normalizeUserInput({ kind: 'equipe', modules: ['telao'] }, null, { role: 'super_admin' });
    assert.equal(ok.role, 'admin_antonov');
    assert.deepEqual(ok.modules, ['telao']);
  });

  it('escolhe quais relatórios a conta abre', () => {
    assert.deepEqual(parseReportForms('1, 2, foo, 2'), [1, 2]);
    assert.equal(parseReportForms(null), null);
    const missing = normalizeUserInput({ kind: 'equipe', modules: ['reports'], report_forms: [] }, null, { role: 'super_admin' });
    assert.equal(missing.error, 'Marque ao menos um relatório.');
    const picked = normalizeUserInput({ kind: 'equipe', modules: ['reports'], report_forms: [3] }, null, { role: 'super_admin' });
    assert.deepEqual(picked.reportForms, [3]);
    assert.equal(canAccessReportForm({ role: 'admin_antonov', modules: ['reports'], reportForms: [3] }, 3), true);
    assert.equal(canAccessReportForm({ role: 'admin_antonov', modules: ['reports'], reportForms: [3] }, 9), false);
  });
});
