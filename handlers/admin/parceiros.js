import { json, adminCors, parseBody } from '../../api/_lib/admin-http.js';
import { getSql } from '../../api/_lib/db.js';
import { hasPermission, requireParceirosAdmin } from '../../api/_lib/parceiros-auth.js';
import { hasModule } from '../../api/_lib/access.js';
import {
  createAdminUser,
  deactivateAdminUser,
  listAdminUsers,
  updateAdminUser,
} from '../../api/_lib/admin-users.js';
import {
  getAdminPartner,
  listAdminPartners,
  listCategories,
  refreshOperationalStatuses,
  saveCategory,
  savePartner,
  savePartnerMedia,
  softDeleteCategory,
  softDeletePartner,
} from '../../api/_lib/parceiros.js';
import {
  dashboardAnalytics,
  partnerReport,
} from '../../api/_lib/parceiros-analytics.js';
import {
  buildContractNotifyLinks,
  changeContractPlan,
  deleteContractAttachment,
  financeSummary,
  getContractAttachment,
  getPartnerPortal,
  listCampaigns,
  listContractAttachments,
  listContracts,
  listContractEvents,
  listCreatives,
  listPayments,
  listPlans,
  listPlacements,
  occupancyStats,
  dashboardAttention,
  dashboardHealth,
  pausePartnerExposure,
  saveCampaign,
  saveContract,
  saveContractAttachment,
  saveCreative,
  savePayment,
  savePlacement,
  savePlan,
  softDeleteContract,
  softDeletePlan,
} from '../../api/_lib/parceiros-comercial.js';

function segments(req) {
  const raw = req.query?.path;
  if (typeof raw === 'string') return raw.split('/').filter(Boolean);
  if (Array.isArray(raw)) return raw.filter(Boolean);
  const pathname = String(req.url || '').split('?')[0];
  const prefix = '/api/admin/parceiros/';
  if (pathname.startsWith(prefix)) return pathname.slice(prefix.length).split('/').filter(Boolean);
  if (pathname.endsWith('/api/admin/parceiros') || pathname.endsWith('/api/admin/parceiros/')) return [];
  return [];
}

function q(req, key) {
  const v = req.query?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const session = await requireParceirosAdmin(req, res);
  if (!session) return;

  const parts = segments(req);
  const body = parseBody(req) || {};
  const sql = getSql();

  try {
    if (parts[0] !== 'portal' && parts[0] !== 'users' && !hasModule(session, 'parceiros')) {
      return json(res, 403, { error: 'Sem permissão para esta área.' });
    }
    await refreshOperationalStatuses(sql);

    if ((parts.length === 0 || parts[0] === 'dashboard') && req.method === 'GET') {
      if (!hasPermission(session, 'analytics.read') && !hasPermission(session, 'partners.read')) {
        return json(res, 403, { error: 'Sem permissão.' });
      }
      const [occupancy, analytics, finance, attention, health] = await Promise.all([
        occupancyStats(),
        hasPermission(session, 'analytics.read')
          ? dashboardAnalytics(req.query || {})
          : { current: {}, previous: {}, variation: {}, ranking: [], period: {} },
        hasPermission(session, 'finance.read') ? financeSummary() : {},
        hasPermission(session, 'contracts.read') || hasPermission(session, 'finance.read')
          ? dashboardAttention()
          : { contracts: [], overdue_payments: [], by_plan: [], partners_without_contract: 0 },
        hasPermission(session, 'partners.read') || hasPermission(session, 'contracts.read') || hasPermission(session, 'finance.read')
          ? dashboardHealth()
          : null,
      ]);
      return json(res, 200, { occupancy, analytics, finance, attention, health, role: session.role });
    }

    if (parts[0] === 'tick' && req.method === 'POST') {
      if (!hasPermission(session, 'contracts.write') && !hasPermission(session, 'partners.write')) {
        return json(res, 403, { error: 'Sem permissão.' });
      }
      const result = await refreshOperationalStatuses(sql);
      return json(res, 200, { ok: true, ...result });
    }

    if (parts[0] === 'portal' && req.method === 'GET') {
      if (!hasPermission(session, 'portal.read')) {
        return json(res, 403, { error: 'Sem permissão para o portal.' });
      }
      let partnerId = session.partnerId;
      if (session.role === 'super_admin' && (body?.partner_id || q(req, 'partner_id'))) {
        partnerId = Number(body?.partner_id || q(req, 'partner_id'));
      }
      if (!partnerId) {
        return json(res, 400, { error: 'Conta sem parceiro vinculado.' });
      }
      const result = await getPartnerPortal(partnerId);
      if (result.error) return json(res, 404, { error: result.error });
      return json(res, 200, { ...result, role: session.role, email: session.email, name: session.name });
    }

    if (parts[0] === 'partners') {
      const need = req.method === 'GET' ? 'partners.read' : 'partners.write';
      const ok = await gate(req, res, session, need);
      if (!ok) return;

      if (parts.length === 1 && req.method === 'GET') {
        const data = await listAdminPartners({
          q: q(req, 'q'),
          categoria: q(req, 'categoria'),
          status: q(req, 'status'),
          page: Number(q(req, 'page') || 1),
          limit: Number(q(req, 'limit') || 25),
        });
        return json(res, 200, data);
      }
      if (parts.length === 1 && req.method === 'POST') {
        const result = await savePartner(body);
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 201, result);
      }
      if (parts.length === 2 && req.method === 'GET') {
        const partner = await getAdminPartner(parts[1]);
        if (!partner) return json(res, 404, { error: 'Parceiro não encontrado.' });
        return json(res, 200, { partner });
      }
      if (parts.length === 2 && (req.method === 'PATCH' || req.method === 'PUT')) {
        const result = await savePartner(body, parts[1]);
        if (result.error) return json(res, result.error.includes('não encontrado') ? 404 : 400, { error: result.error });
        return json(res, 200, result);
      }
      if (parts.length === 2 && req.method === 'DELETE') {
        const okDel = await softDeletePartner(parts[1]);
        if (!okDel) return json(res, 404, { error: 'Parceiro não encontrado.' });
        return json(res, 200, { ok: true });
      }
      if (parts.length === 3 && parts[2] === 'media' && req.method === 'POST') {
        const kind = ['logo', 'cover', 'photo', 'banner', 'creative'].includes(body.kind) ? body.kind : 'photo';
        const result = await savePartnerMedia(parts[1], kind, body.file || body.foto);
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 201, result);
      }
      if (parts.length === 3 && parts[2] === 'report' && req.method === 'GET') {
        if (!hasPermission(session, 'analytics.read')) return json(res, 403, { error: 'Sem permissão.' });
        const report = await partnerReport(parts[1], req.query || {});
        if (report.error) return json(res, 400, { error: report.error });
        const partner = await getAdminPartner(parts[1]);
        return json(res, 200, { partner, report });
      }
    }

    if (parts[0] === 'categories') {
      const need = req.method === 'GET' ? 'categories.read' : 'categories.write';
      const ok = await gate(req, res, session, need);
      if (!ok) return;
      if (parts.length === 1 && req.method === 'GET') {
        const categories = await listCategories({ includeArchived: true });
        return json(res, 200, { categories });
      }
      if (parts.length === 1 && req.method === 'POST') {
        const result = await saveCategory(body);
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 201, result);
      }
      if (parts.length === 2 && (req.method === 'PATCH' || req.method === 'PUT')) {
        const result = await saveCategory(body, parts[1]);
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 200, result);
      }
      if (parts.length === 2 && req.method === 'DELETE') {
        const okDel = await softDeleteCategory(parts[1]);
        if (!okDel) return json(res, 404, { error: 'Categoria não encontrada.' });
        return json(res, 200, { ok: true });
      }
    }

    if (parts[0] === 'plans') {
      const need = req.method === 'GET' ? 'plans.read' : 'plans.write';
      const ok = await gate(req, res, session, need);
      if (!ok) return;
      if (parts.length === 1 && req.method === 'GET') {
        return json(res, 200, { plans: await listPlans() });
      }
      if (parts.length === 1 && req.method === 'POST') {
        const result = await savePlan(body);
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 201, result);
      }
      if (parts.length === 2 && (req.method === 'PATCH' || req.method === 'PUT')) {
        const result = await savePlan(body, parts[1]);
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 200, result);
      }
      if (parts.length === 2 && req.method === 'DELETE') {
        const okDel = await softDeletePlan(parts[1]);
        if (!okDel) return json(res, 404, { error: 'Plano não encontrado.' });
        return json(res, 200, { ok: true });
      }
    }

    if (parts[0] === 'contracts') {
      const isPartnerPortalRead =
        session.role === 'parceiro'
        && req.method === 'GET'
        && parts.length === 4
        && parts[2] === 'attachments'
        && /^\d+$/.test(parts[1])
        && /^\d+$/.test(parts[3]);

      if (isPartnerPortalRead) {
        if (!hasPermission(session, 'portal.read') || !session.partnerId) {
          return json(res, 403, { error: 'Sem permissão.' });
        }
        const owned = await listContracts({ partner_id: session.partnerId });
        if (!owned.some((c) => String(c.id) === String(parts[1]))) {
          return json(res, 403, { error: 'Contrato fora do seu escopo.' });
        }
        const att = await getContractAttachment(parts[1], parts[3]);
        if (!att) return json(res, 404, { error: 'Anexo não encontrado.' });
        return json(res, 200, { attachment: att });
      }

      const need = req.method === 'GET' ? 'contracts.read' : 'contracts.write';
      const ok = await gate(req, res, session, need);
      if (!ok) return;
      if (parts.length === 1 && req.method === 'GET') {
        return json(res, 200, {
          contracts: await listContracts(req.query || {}),
          warn_days: (await occupancyStats()).warn_days,
        });
      }
      if (parts.length === 1 && req.method === 'POST') {
        const result = await saveContract(body, null, { userId: session.userId });
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 201, result);
      }
      if (parts.length === 2 && parts[1] && /^\d+$/.test(parts[1]) && req.method === 'GET') {
        const contracts = await listContracts();
        const contract = contracts.find((c) => String(c.id) === String(parts[1]));
        if (!contract) return json(res, 404, { error: 'Contrato não encontrado.' });
        const [events, attachments, payments] = await Promise.all([
          listContractEvents(parts[1]),
          listContractAttachments(parts[1]),
          listPayments({ contract_id: parts[1] }),
        ]);
        return json(res, 200, { contract, events, attachments, payments });
      }
      if (parts.length === 3 && parts[2] === 'events' && req.method === 'GET') {
        return json(res, 200, { events: await listContractEvents(parts[1]) });
      }
      if (parts.length === 3 && parts[2] === 'notify' && req.method === 'GET') {
        const links = await buildContractNotifyLinks(parts[1]);
        if (links.error) return json(res, 404, { error: links.error });
        return json(res, 200, links);
      }
      if (parts.length === 3 && parts[2] === 'change-plan' && req.method === 'POST') {
        const result = await changeContractPlan(parts[1], body, { userId: session.userId });
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 200, result);
      }
      if (parts.length === 3 && parts[2] === 'attachments' && req.method === 'GET') {
        return json(res, 200, { attachments: await listContractAttachments(parts[1]) });
      }
      if (parts.length === 3 && parts[2] === 'attachments' && req.method === 'POST') {
        const result = await saveContractAttachment(parts[1], body.file || body.attachment, {
          userId: session.userId,
        });
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 201, result);
      }
      if (parts.length === 4 && parts[2] === 'attachments' && /^\d+$/.test(parts[3]) && req.method === 'GET') {
        const att = await getContractAttachment(parts[1], parts[3]);
        if (!att) return json(res, 404, { error: 'Anexo não encontrado.' });
        return json(res, 200, { attachment: att });
      }
      if (parts.length === 4 && parts[2] === 'attachments' && /^\d+$/.test(parts[3]) && req.method === 'DELETE') {
        const okDel = await deleteContractAttachment(parts[1], parts[3], { userId: session.userId });
        if (!okDel) return json(res, 404, { error: 'Anexo não encontrado.' });
        return json(res, 200, { ok: true });
      }
      if (parts.length === 3 && parts[2] === 'pause-partner' && req.method === 'POST') {
        let partnerId = body?.partner_id || body?.partnerId;
        if (!partnerId) {
          const all = await listContracts();
          const found = all.find((c) => String(c.id) === String(parts[1]));
          partnerId = found?.partner_id;
        }
        const result = await pausePartnerExposure(partnerId, {
          adminUserId: session.userId,
          contractId: parts[1],
          reason: body?.reason || 'Exposição pausada manualmente.',
        });
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 200, result);
      }
      if (parts.length === 2 && (req.method === 'PATCH' || req.method === 'PUT')) {
        const result = await saveContract(body, parts[1], { userId: session.userId });
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 200, result);
      }
      if (parts.length === 2 && req.method === 'DELETE') {
        const okDel = await softDeleteContract(parts[1], { userId: session.userId });
        if (!okDel) return json(res, 404, { error: 'Contrato não encontrado.' });
        return json(res, 200, { ok: true });
      }
    }

    if (parts[0] === 'placements') {
      const need = req.method === 'GET' ? 'ads.read' : 'ads.write';
      const ok = await gate(req, res, session, need);
      if (!ok) return;
      if (parts.length === 1 && req.method === 'GET') {
        return json(res, 200, { placements: await listPlacements() });
      }
      if (parts.length === 1 && req.method === 'POST') {
        const result = await savePlacement(body);
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 201, result);
      }
      if (parts.length === 2 && (req.method === 'PATCH' || req.method === 'PUT')) {
        const result = await savePlacement(body, parts[1]);
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 200, result);
      }
    }

    if (parts[0] === 'creatives') {
      const need = req.method === 'GET' ? 'ads.read' : 'ads.write';
      const ok = await gate(req, res, session, need);
      if (!ok) return;
      if (parts.length === 1 && req.method === 'GET') {
        return json(res, 200, { creatives: await listCreatives(req.query || {}) });
      }
      if (parts.length === 1 && req.method === 'POST') {
        const result = await saveCreative(body);
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 201, result);
      }
      if (parts.length === 2 && (req.method === 'PATCH' || req.method === 'PUT')) {
        const result = await saveCreative(body, parts[1]);
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 200, result);
      }
    }

    if (parts[0] === 'campaigns') {
      const need = req.method === 'GET' ? 'campaigns.read' : 'campaigns.write';
      const ok = await gate(req, res, session, need);
      if (!ok) return;
      if (parts.length === 1 && req.method === 'GET') {
        return json(res, 200, { campaigns: await listCampaigns(req.query || {}) });
      }
      if (parts.length === 1 && req.method === 'POST') {
        const result = await saveCampaign(body);
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 201, result);
      }
      if (parts.length === 2 && (req.method === 'PATCH' || req.method === 'PUT')) {
        const result = await saveCampaign(body, parts[1]);
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 200, result);
      }
    }

    if (parts[0] === 'payments' || parts[0] === 'finance') {
      const need = req.method === 'GET' ? 'finance.read' : 'finance.write';
      const ok = await gate(req, res, session, need);
      if (!ok) return;
      if (parts[0] === 'finance' && parts.length === 1 && req.method === 'GET') {
        return json(res, 200, { finance: await financeSummary(), payments: await listPayments(req.query || {}) });
      }
      if (parts[0] === 'payments' && parts.length === 1 && req.method === 'GET') {
        return json(res, 200, { payments: await listPayments(req.query || {}) });
      }
      if (parts[0] === 'payments' && parts.length === 1 && req.method === 'POST') {
        const result = await savePayment(body);
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 201, result);
      }
      if (parts[0] === 'payments' && parts.length === 2 && (req.method === 'PATCH' || req.method === 'PUT')) {
        const result = await savePayment(body, parts[1]);
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 200, result);
      }
    }

    if (parts[0] === 'analytics' && req.method === 'GET') {
      const ok = await gate(req, res, session, 'analytics.read');
      if (!ok) return;
      const data = await dashboardAnalytics(req.query || {});
      if (data.error) return json(res, 400, { error: data.error });
      return json(res, 200, data);
    }

    if (parts[0] === 'users') {
      if (!hasModule(session, 'equipe')) {
        return json(res, 403, { error: 'Sem permissão para esta área.' });
      }
      if (parts.length === 1 && req.method === 'GET') {
        return json(res, 200, { users: await listAdminUsers() });
      }
      if (parts.length === 1 && req.method === 'POST') {
        const result = await createAdminUser(body, session);
        if (result.error) return json(res, 400, { error: result.error });
        return json(res, 201, result);
      }
      if (parts.length === 2 && (req.method === 'PATCH' || req.method === 'PUT')) {
        const result = await updateAdminUser(parts[1], body, session);
        if (result.error) return json(res, result.status || 400, { error: result.error });
        return json(res, 200, result);
      }
      if (parts.length === 2 && req.method === 'DELETE') {
        const result = await deactivateAdminUser(parts[1], session.userId);
        if (result.error) return json(res, result.status || 400, { error: result.error });
        return json(res, 200, result);
      }
    }

    return json(res, 404, { error: 'Rota não encontrada.' });
  } catch (err) {
    console.error('admin parceiros', err);
    return json(res, 500, { error: 'Erro interno.' });
  }
}

function gate(_req, res, session, permission) {
  if (hasPermission(session, permission)) return true;
  json(res, 403, { error: 'Sem permissão para esta ação.' });
  return false;
}
