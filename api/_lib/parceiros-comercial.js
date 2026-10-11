import { getSql } from './db.js';
import { parseFilePayload } from './forms.js';
import {
  CAMPAIGN_STATUSES,
  CONTRACT_STATUSES,
  PAYMENT_STATUSES,
  PLAN_STATUSES,
  addDays,
  addMonths,
  buildContractExpiryMessage,
  computeCampaignStatus,
  computeContractStatus,
  computePaymentStatus,
  computeProrataAdjustment,
  isValidSlug,
  mailtoExpiryUrl,
  parseWarnDays,
  pendingAmount,
  roundMoney,
  slugify,
  toDateInput,
  whatsappMessageUrl,
} from './parceiros-logic.js';

export async function listPlans() {
  const sql = getSql();
  const plans = await sql`
    SELECT * FROM partner_plans
    WHERE deleted_at IS NULL
    ORDER BY sort_order ASC, priority DESC, name ASC
  `;
  const ids = plans.map((p) => p.id);
  const benefits = ids.length
    ? await sql`
        SELECT * FROM partner_plan_benefits
        WHERE plan_id = ANY(${ids})
        ORDER BY sort_order ASC, id ASC
      `
    : [];
  const byPlan = new Map();
  for (const b of benefits) {
    const list = byPlan.get(b.plan_id) || [];
    list.push(b);
    byPlan.set(b.plan_id, list);
  }
  return plans.map((p) => ({ ...p, benefits: byPlan.get(p.id) || [] }));
}

export async function savePlan(body, id = null) {
  const sql = getSql();
  const name = String(body?.name || '').trim();
  if (!name) return { error: 'Nome é obrigatório.' };
  const slug = slugify(body?.slug || name);
  if (!isValidSlug(slug)) return { error: 'Slug inválido.' };
  const status = PLAN_STATUSES.includes(body?.status) ? body.status : 'ativo';
  const description = String(body?.description || '').trim() || null;
  const sortOrder = Number(body?.sort_order) || 0;
  const priority = Number(body?.priority) || 0;
  let price;
  if (typeof body?.price === 'number') {
    price = body.price;
  } else {
    const s = String(body?.price ?? '').trim().replace(/\s/g, '');
    price = s.includes(',')
      ? Number(s.replace(/\./g, '').replace(',', '.'))
      : Number(s);
  }
  if (!Number.isFinite(price) || price < 0) return { error: 'Valor inválido.' };
  const benefits = Array.isArray(body?.benefits)
    ? body.benefits.map((b, i) => ({
        name: String(b?.name || b || '').trim(),
        description: String(b?.description || '').trim() || null,
        sort_order: Number(b?.sort_order) || i,
      })).filter((b) => b.name)
    : null;

  const clash = await sql`SELECT id FROM partner_plans WHERE slug = ${slug} AND deleted_at IS NULL LIMIT 1`;
  if (clash[0] && Number(clash[0].id) !== Number(id)) return { error: 'Slug já utilizado.' };

  let plan;
  if (id) {
    const rows = await sql`
      UPDATE partner_plans SET
        name = ${name}, slug = ${slug}, description = ${description},
        sort_order = ${sortOrder}, status = ${status}, priority = ${priority},
        price = ${price}, updated_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (!rows[0]) return { error: 'Plano não encontrado.' };
    plan = rows[0];
  } else {
    const rows = await sql`
      INSERT INTO partner_plans (name, slug, description, sort_order, status, priority, price)
      VALUES (${name}, ${slug}, ${description}, ${sortOrder}, ${status}, ${priority}, ${price})
      RETURNING *
    `;
    plan = rows[0];
  }

  if (benefits) {
    await sql`DELETE FROM partner_plan_benefits WHERE plan_id = ${plan.id}`;
    for (const [i, b] of benefits.entries()) {
      await sql`
        INSERT INTO partner_plan_benefits (plan_id, name, description, sort_order)
        VALUES (${plan.id}, ${b.name}, ${b.description}, ${b.sort_order ?? i})
      `;
    }
  }

  const all = await listPlans();
  return { plan: all.find((p) => Number(p.id) === Number(plan.id)) };
}

export async function softDeletePlan(id) {
  const sql = getSql();
  const rows = await sql`
    UPDATE partner_plans SET deleted_at = NOW(), status = 'arquivado', updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;
  return Boolean(rows[0]);
}

export async function listContracts({ partner_id, status } = {}) {
  const sql = getSql();
  const pid = partner_id ? Number(partner_id) : null;
  const st = CONTRACT_STATUSES.includes(status) ? status : '';
  return sql`
    SELECT
      ct.*,
      p.name AS partner_name,
      p.slug AS partner_slug,
      p.status AS partner_status,
      p.show_on_home AS partner_show_on_home,
      pl.name AS plan_name,
      (ct.ends_on - CURRENT_DATE)::int AS days_left,
      cu.email AS created_by_email,
      uu.email AS updated_by_email
    FROM partner_contracts ct
    JOIN partners p ON p.id = ct.partner_id
    LEFT JOIN partner_plans pl ON pl.id = ct.plan_id
    LEFT JOIN admin_users cu ON cu.id = ct.created_by
    LEFT JOIN admin_users uu ON uu.id = ct.updated_by
    WHERE ct.deleted_at IS NULL
      AND (${pid}::bigint IS NULL OR ct.partner_id = ${pid})
      AND (${st} = '' OR ct.status = ${st})
    ORDER BY ct.ends_on ASC, ct.id DESC
  `;
}

export async function logContractEvent(contractId, eventType, message, adminUserId = null) {
  const sql = getSql();
  if (!contractId || !eventType) return null;
  const rows = await sql`
    INSERT INTO partner_contract_events (contract_id, event_type, message, admin_user_id)
    VALUES (${contractId}, ${String(eventType)}, ${message || null}, ${adminUserId || null})
    RETURNING *
  `;
  return rows[0] || null;
}

export async function listContractEvents(contractId) {
  const sql = getSql();
  return sql`
    SELECT
      e.*,
      u.email AS admin_email,
      u.name AS admin_name
    FROM partner_contract_events e
    LEFT JOIN admin_users u ON u.id = e.admin_user_id
    WHERE e.contract_id = ${contractId}
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 100
  `;
}

export async function pausePartnerExposure(partnerId, { adminUserId = null, contractId = null, reason = null } = {}) {
  const sql = getSql();
  const pid = Number(partnerId);
  if (!pid) return { error: 'Parceiro inválido.' };
  const rows = await sql`
    UPDATE partners SET
      show_on_home = FALSE,
      status = CASE WHEN status = 'ativo' THEN 'pausado' ELSE status END,
      updated_at = NOW()
    WHERE id = ${pid} AND deleted_at IS NULL
    RETURNING id, name, status, show_on_home
  `;
  if (!rows[0]) return { error: 'Parceiro não encontrado.' };
  if (contractId) {
    await logContractEvent(
      contractId,
      'partner_paused',
      reason || `Exposição do parceiro pausada (${rows[0].name}).`,
      adminUserId,
    );
  }
  return { partner: rows[0] };
}

export async function saveContract(body, id = null, { userId = null } = {}) {
  const sql = getSql();
  const partnerId = Number(body?.partner_id);
  if (!partnerId) return { error: 'Parceiro é obrigatório.' };
  const planId = body?.plan_id ? Number(body.plan_id) : null;
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount < 0) return { error: 'Valor inválido.' };
  const startsOn = String(body?.starts_on || '').slice(0, 10);
  const endsOn = String(body?.ends_on || '').slice(0, 10);
  if (!startsOn || !endsOn) return { error: 'Datas são obrigatórias.' };
  if (new Date(endsOn) < new Date(startsOn)) return { error: 'Data final anterior à inicial.' };
  const paymentMethod = String(body?.payment_method || '').trim() || null;
  const notes = String(body?.notes || '').trim() || null;
  const computed = computeContractStatus({
    starts_on: startsOn,
    ends_on: endsOn,
    status: body?.status === 'cancelado' ? 'cancelado' : 'ativo',
  });
  const status = body?.status === 'cancelado' ? 'cancelado' : computed;
  const pausePartner = Boolean(body?.pause_partner);
  const adminId = userId ? Number(userId) : null;
  const autoRenew = body?.auto_renew === undefined ? undefined : Boolean(body.auto_renew);
  let cycleMonths = body?.cycle_months !== undefined ? Number(body.cycle_months) : undefined;
  if (cycleMonths !== undefined) {
    if (![1, 3, 6, 12, 24].includes(cycleMonths)) cycleMonths = 12;
  }

  let plan;
  if (id) {
    const prev = await sql`SELECT * FROM partner_contracts WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`;
    if (!prev[0]) return { error: 'Contrato não encontrado.' };
    const nextAuto = autoRenew === undefined ? Boolean(prev[0].auto_renew) : autoRenew;
    const nextCycle = cycleMonths === undefined ? (Number(prev[0].cycle_months) || 12) : cycleMonths;
    const rows = await sql`
      UPDATE partner_contracts SET
        partner_id = ${partnerId}, plan_id = ${planId}, amount = ${amount},
        starts_on = ${startsOn}, ends_on = ${endsOn}, status = ${status},
        payment_method = ${paymentMethod}, notes = ${notes},
        auto_renew = ${nextAuto}, cycle_months = ${nextCycle},
        updated_by = ${adminId}, updated_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (!rows[0]) return { error: 'Contrato não encontrado.' };
    plan = rows[0];
    const prevStatus = prev[0]?.status;
    if (status === 'cancelado' && prevStatus !== 'cancelado') {
      await logContractEvent(plan.id, 'cancelled', 'Contrato cancelado.', adminId);
    } else {
      await logContractEvent(plan.id, 'updated', `Contrato atualizado (${status}).`, adminId);
    }
  } else {
    const nextAuto = autoRenew === undefined ? false : autoRenew;
    const nextCycle = cycleMonths === undefined ? 12 : cycleMonths;
    const rows = await sql`
      INSERT INTO partner_contracts (
        partner_id, plan_id, amount, starts_on, ends_on, status, payment_method, notes,
        auto_renew, cycle_months, created_by, updated_by
      ) VALUES (
        ${partnerId}, ${planId}, ${amount}, ${startsOn}, ${endsOn}, ${status}, ${paymentMethod}, ${notes},
        ${nextAuto}, ${nextCycle}, ${adminId}, ${adminId}
      )
      RETURNING *
    `;
    plan = rows[0];
    const isRenewal = String(notes || '').toLowerCase().includes('renovação');
    await logContractEvent(
      plan.id,
      isRenewal ? 'renewed' : 'created',
      isRenewal ? 'Contrato renovado.' : 'Contrato criado.',
      adminId,
    );
  }

  let partnerPaused = null;
  if (pausePartner && (status === 'cancelado' || status === 'vencido')) {
    const paused = await pausePartnerExposure(partnerId, {
      adminUserId: adminId,
      contractId: plan.id,
      reason: 'Exposição pausada após encerramento do contrato.',
    });
    if (!paused.error) partnerPaused = paused.partner;
  }

  const match = (await listContracts()).find((c) => Number(c.id) === Number(plan.id));
  return { contract: match || plan, partner_paused: partnerPaused };
}

export async function softDeleteContract(id, { userId = null } = {}) {
  const sql = getSql();
  const rows = await sql`
    UPDATE partner_contracts SET
      deleted_at = NOW(), status = 'cancelado',
      updated_by = ${userId ? Number(userId) : null}, updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;
  if (rows[0]) {
    await logContractEvent(rows[0].id, 'cancelled', 'Contrato excluído/cancelado.', userId ? Number(userId) : null);
  }
  return Boolean(rows[0]);
}

export async function listPlacements() {
  const sql = getSql();
  return sql`
    SELECT * FROM partner_placements
    WHERE deleted_at IS NULL
    ORDER BY name ASC
  `;
}

export async function savePlacement(body, id = null) {
  const sql = getSql();
  const name = String(body?.name || '').trim();
  const code = String(body?.code || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  if (!name || !code) return { error: 'Nome e código são obrigatórios.' };
  const description = String(body?.description || '').trim() || null;
  const status = body?.status === 'arquivado' ? 'arquivado' : 'ativo';
  const clash = await sql`SELECT id FROM partner_placements WHERE code = ${code} AND deleted_at IS NULL LIMIT 1`;
  if (clash[0] && Number(clash[0].id) !== Number(id)) return { error: 'Código já utilizado.' };

  if (id) {
    const rows = await sql`
      UPDATE partner_placements SET
        name = ${name}, code = ${code}, description = ${description}, status = ${status}, updated_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (!rows[0]) return { error: 'Placement não encontrado.' };
    return { placement: rows[0] };
  }
  const rows = await sql`
    INSERT INTO partner_placements (code, name, description, status)
    VALUES (${code}, ${name}, ${description}, ${status})
    RETURNING *
  `;
  return { placement: rows[0] };
}

export async function listCreatives({ partner_id } = {}) {
  const sql = getSql();
  const pid = partner_id ? Number(partner_id) : null;
  return sql`
    SELECT cr.*, p.name AS partner_name
    FROM partner_creatives cr
    LEFT JOIN partners p ON p.id = cr.partner_id
    WHERE cr.deleted_at IS NULL
      AND (${pid}::bigint IS NULL OR cr.partner_id = ${pid})
    ORDER BY cr.created_at DESC
  `;
}

export async function saveCreative(body, id = null) {
  const sql = getSql();
  const kind = ['image', 'logo', 'banner', 'text'].includes(body?.kind) ? body.kind : 'image';
  const partnerId = body?.partner_id ? Number(body.partner_id) : null;
  const mediaId = body?.media_id ? Number(body.media_id) : null;
  const headline = String(body?.headline || '').trim() || null;
  const ctaLabel = String(body?.cta_label || '').trim() || null;
  const ctaUrl = String(body?.cta_url || '').trim() || null;
  const textBody = String(body?.body || '').trim() || null;

  if (id) {
    const rows = await sql`
      UPDATE partner_creatives SET
        partner_id = ${partnerId}, kind = ${kind}, media_id = ${mediaId},
        headline = ${headline}, body = ${textBody}, cta_label = ${ctaLabel}, cta_url = ${ctaUrl},
        updated_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (!rows[0]) return { error: 'Criativo não encontrado.' };
    return { creative: rows[0] };
  }
  const rows = await sql`
    INSERT INTO partner_creatives (partner_id, kind, media_id, headline, body, cta_label, cta_url)
    VALUES (${partnerId}, ${kind}, ${mediaId}, ${headline}, ${textBody}, ${ctaLabel}, ${ctaUrl})
    RETURNING *
  `;
  return { creative: rows[0] };
}

export async function listCampaigns({ partner_id, status } = {}) {
  const sql = getSql();
  const pid = partner_id ? Number(partner_id) : null;
  const st = CAMPAIGN_STATUSES.includes(status) ? status : '';
  return sql`
    SELECT
      cam.*,
      p.name AS partner_name,
      pl.code AS placement_code,
      pl.name AS placement_name
    FROM partner_campaigns cam
    LEFT JOIN partners p ON p.id = cam.partner_id
    LEFT JOIN partner_placements pl ON pl.id = cam.placement_id
    WHERE cam.deleted_at IS NULL
      AND (${pid}::bigint IS NULL OR cam.partner_id = ${pid})
      AND (${st} = '' OR cam.status = ${st})
    ORDER BY cam.priority DESC, cam.starts_on DESC NULLS LAST, cam.id DESC
  `;
}

export async function saveCampaign(body, id = null) {
  const sql = getSql();
  const name = String(body?.name || '').trim();
  if (!name) return { error: 'Nome é obrigatório.' };
  const partnerId = body?.partner_id ? Number(body.partner_id) : null;
  const placementId = body?.placement_id ? Number(body.placement_id) : null;
  const creativeId = body?.creative_id ? Number(body.creative_id) : null;
  const startsOn = body?.starts_on ? String(body.starts_on).slice(0, 10) : null;
  const endsOn = body?.ends_on ? String(body.ends_on).slice(0, 10) : null;
  if (startsOn && endsOn && new Date(endsOn) < new Date(startsOn)) {
    return { error: 'Data final anterior à inicial.' };
  }
  const linkUrl = String(body?.link_url || '').trim() || null;
  const notes = String(body?.notes || '').trim() || null;
  const priority = Number(body?.priority) || 0;
  let status = CAMPAIGN_STATUSES.includes(body?.status) ? body.status : 'rascunho';
  if (status !== 'pausada' && status !== 'rascunho') {
    status = computeCampaignStatus({ status, starts_on: startsOn, ends_on: endsOn });
  }

  if (id) {
    const rows = await sql`
      UPDATE partner_campaigns SET
        name = ${name}, partner_id = ${partnerId}, starts_on = ${startsOn}, ends_on = ${endsOn},
        status = ${status}, placement_id = ${placementId}, creative_id = ${creativeId},
        link_url = ${linkUrl}, priority = ${priority}, notes = ${notes}, updated_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (!rows[0]) return { error: 'Campanha não encontrada.' };
    if (placementId) {
      await sql`DELETE FROM partner_campaign_placements WHERE campaign_id = ${id}`;
      await sql`
        INSERT INTO partner_campaign_placements (campaign_id, placement_id)
        VALUES (${id}, ${placementId})
        ON CONFLICT (campaign_id, placement_id) DO NOTHING
      `;
    }
    return { campaign: rows[0] };
  }

  const rows = await sql`
    INSERT INTO partner_campaigns (
      name, partner_id, starts_on, ends_on, status, placement_id, creative_id, link_url, priority, notes
    ) VALUES (
      ${name}, ${partnerId}, ${startsOn}, ${endsOn}, ${status}, ${placementId}, ${creativeId},
      ${linkUrl}, ${priority}, ${notes}
    )
    RETURNING *
  `;
  const campaign = rows[0];
  if (placementId) {
    await sql`
      INSERT INTO partner_campaign_placements (campaign_id, placement_id)
      VALUES (${campaign.id}, ${placementId})
      ON CONFLICT (campaign_id, placement_id) DO NOTHING
    `;
  }
  return { campaign };
}

export async function listPayments({ partner_id, contract_id, status } = {}) {
  const sql = getSql();
  const pid = partner_id ? Number(partner_id) : null;
  const cid = contract_id ? Number(contract_id) : null;
  const st = PAYMENT_STATUSES.includes(status) ? status : '';
  const rows = await sql`
    SELECT
      pay.*,
      p.name AS partner_name,
      ct.amount AS contract_amount,
      ct.ends_on AS contract_ends_on
    FROM partner_payments pay
    LEFT JOIN partners p ON p.id = pay.partner_id
    LEFT JOIN partner_contracts ct ON ct.id = pay.contract_id
    WHERE pay.deleted_at IS NULL
      AND (${pid}::bigint IS NULL OR pay.partner_id = ${pid})
      AND (${cid}::bigint IS NULL OR pay.contract_id = ${cid})
      AND (${st} = '' OR pay.status = ${st})
    ORDER BY pay.due_on ASC NULLS LAST, pay.id DESC
  `;
  return rows.map((r) => ({
    ...r,
    pending_amount: pendingAmount(r.contracted_amount, r.received_amount),
    status: computePaymentStatus(r),
  }));
}

export async function savePayment(body, id = null) {
  const sql = getSql();
  const partnerId = body?.partner_id ? Number(body.partner_id) : null;
  const contractId = body?.contract_id ? Number(body.contract_id) : null;
  const contracted = Number(body?.contracted_amount);
  const received = Number(body?.received_amount) || 0;
  if (!Number.isFinite(contracted) || contracted < 0) return { error: 'Valor contratado inválido.' };
  const dueOn = body?.due_on ? String(body.due_on).slice(0, 10) : null;
  const notes = String(body?.notes || '').trim() || null;
  let status = PAYMENT_STATUSES.includes(body?.status) ? body.status : 'pendente';
  if (status !== 'cancelado') {
    status = computePaymentStatus({
      status,
      contracted_amount: contracted,
      received_amount: received,
      due_on: dueOn,
    });
  }

  if (id) {
    const rows = await sql`
      UPDATE partner_payments SET
        contract_id = ${contractId}, partner_id = ${partnerId},
        contracted_amount = ${contracted}, received_amount = ${received},
        due_on = ${dueOn}, status = ${status}, notes = ${notes}, updated_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (!rows[0]) return { error: 'Lançamento não encontrado.' };
    return { payment: rows[0] };
  }
  const rows = await sql`
    INSERT INTO partner_payments (
      contract_id, partner_id, contracted_amount, received_amount, due_on, status, notes
    ) VALUES (
      ${contractId}, ${partnerId}, ${contracted}, ${received}, ${dueOn}, ${status}, ${notes}
    )
    RETURNING *
  `;
  return { payment: rows[0] };
}

export async function financeSummary() {
  const sql = getSql();
  const rows = await sql`
    SELECT
      COALESCE(SUM(contracted_amount), 0)::float AS contracted,
      COALESCE(SUM(received_amount), 0)::float AS received,
      COALESCE(SUM(CASE WHEN status IN ('pendente', 'atrasado') THEN GREATEST(contracted_amount - received_amount, 0) ELSE 0 END), 0)::float AS pending
    FROM partner_payments
    WHERE deleted_at IS NULL AND status <> 'cancelado'
  `;
  const contracts = await sql`
    SELECT
      COALESCE(SUM(amount), 0)::float AS contracted
    FROM partner_contracts
    WHERE deleted_at IS NULL AND status <> 'cancelado'
  `;
  return {
    contracted_payments: rows[0]?.contracted || 0,
    received: rows[0]?.received || 0,
    pending: rows[0]?.pending || 0,
    contracted_contracts: contracts[0]?.contracted || 0,
  };
}

export async function occupancyStats() {
  const sql = getSql();
  const partners = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'ativo')::int AS active,
      COUNT(*) FILTER (WHERE status <> 'ativo')::int AS inactive
    FROM partners
    WHERE deleted_at IS NULL
  `;
  const contracts = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'vencendo')::int AS expiring,
      COUNT(*) FILTER (WHERE status = 'vencido')::int AS expired,
      COUNT(*) FILTER (WHERE status IN ('ativo', 'pendente', 'vencendo'))::int AS active_contracts
    FROM partner_contracts
    WHERE deleted_at IS NULL
  `;
  const setting = await sql`SELECT value FROM partner_settings WHERE key = 'contract_warn_days' LIMIT 1`;
  return {
    active: partners[0]?.active || 0,
    inactive: partners[0]?.inactive || 0,
    slots: Math.max(0, 40 - (partners[0]?.active || 0)),
    expiring: contracts[0]?.expiring || 0,
    expired: contracts[0]?.expired || 0,
    active_contracts: contracts[0]?.active_contracts || 0,
    warn_days: parseWarnDays(setting[0]?.value || '30,15,7'),
  };
}

/** Dados de agenda comercial para o Painel (Fase 2). */
export async function dashboardAttention({ contractLimit = 8, paymentLimit = 8 } = {}) {
  const sql = getSql();
  const contracts = await sql`
    SELECT
      ct.id, ct.partner_id, ct.plan_id, ct.amount, ct.starts_on, ct.ends_on, ct.status,
      ct.auto_renew, ct.cycle_months,
      p.name AS partner_name, p.slug AS partner_slug, p.whatsapp,
      pl.name AS plan_name,
      (ct.ends_on - CURRENT_DATE)::int AS days_left
    FROM partner_contracts ct
    JOIN partners p ON p.id = ct.partner_id
    LEFT JOIN partner_plans pl ON pl.id = ct.plan_id
    WHERE ct.deleted_at IS NULL
      AND ct.status IN ('vencendo', 'vencido')
    ORDER BY
      CASE ct.status WHEN 'vencendo' THEN 0 ELSE 1 END,
      ct.ends_on ASC,
      ct.id DESC
    LIMIT ${Math.max(1, Math.min(Number(contractLimit) || 8, 30))}
  `;

  const overduePayments = await sql`
    SELECT
      pay.id, pay.partner_id, pay.contract_id, pay.contracted_amount, pay.received_amount,
      pay.due_on, pay.status, pay.notes,
      p.name AS partner_name,
      GREATEST(pay.contracted_amount - pay.received_amount, 0)::float AS pending_amount
    FROM partner_payments pay
    LEFT JOIN partners p ON p.id = pay.partner_id
    WHERE pay.deleted_at IS NULL
      AND pay.status = 'atrasado'
    ORDER BY pay.due_on ASC NULLS LAST, pay.id DESC
    LIMIT ${Math.max(1, Math.min(Number(paymentLimit) || 8, 30))}
  `;

  const byPlan = await sql`
    SELECT
      pl.id, pl.name, pl.slug, pl.priority, pl.price,
      COUNT(DISTINCT ct.partner_id)::int AS partners,
      COUNT(ct.id)::int AS contracts,
      COALESCE(SUM(ct.amount), 0)::float AS revenue
    FROM partner_plans pl
    LEFT JOIN partner_contracts ct
      ON ct.plan_id = pl.id
      AND ct.deleted_at IS NULL
      AND ct.status IN ('ativo', 'pendente', 'vencendo')
    WHERE pl.deleted_at IS NULL AND pl.status = 'ativo'
    GROUP BY pl.id, pl.name, pl.slug, pl.priority, pl.price
    ORDER BY pl.priority DESC, pl.name ASC
  `;

  const withoutContract = await sql`
    SELECT COUNT(*)::int AS total
    FROM partners p
    WHERE p.deleted_at IS NULL
      AND p.status = 'ativo'
      AND NOT EXISTS (
        SELECT 1 FROM partner_contracts ct
        WHERE ct.partner_id = p.id
          AND ct.deleted_at IS NULL
          AND ct.status IN ('ativo', 'pendente', 'vencendo')
      )
  `;

  return {
    contracts: contracts.map((c) => ({
      ...c,
      id: Number(c.id),
      partner_id: Number(c.partner_id),
      days_left: c.days_left == null ? null : Number(c.days_left),
    })),
    overdue_payments: overduePayments.map((p) => ({
      ...p,
      id: Number(p.id),
      partner_id: p.partner_id ? Number(p.partner_id) : null,
      pending_amount: Number(p.pending_amount) || 0,
    })),
    by_plan: byPlan.map((r) => ({
      id: Number(r.id),
      name: r.name,
      slug: r.slug,
      priority: Number(r.priority) || 0,
      price: Number(r.price) || 0,
      partners: Number(r.partners) || 0,
      contracts: Number(r.contracts) || 0,
      revenue: Number(r.revenue) || 0,
    })),
    partners_without_contract: Number(withoutContract[0]?.total) || 0,
  };
}

/** Saúde do ecossistema para o Painel (Fase 4). */
export async function dashboardHealth({ limit = 8 } = {}) {
  const sql = getSql();
  const lim = Math.max(1, Math.min(Number(limit) || 8, 40));

  const withoutContract = await sql`
    SELECT p.id, p.name, p.slug, p.status, p.whatsapp, p.photo_media_id, p.logo_media_id
    FROM partners p
    WHERE p.deleted_at IS NULL
      AND p.status = 'ativo'
      AND NOT EXISTS (
        SELECT 1 FROM partner_contracts ct
        WHERE ct.partner_id = p.id
          AND ct.deleted_at IS NULL
          AND ct.status IN ('ativo', 'pendente', 'vencendo')
      )
    ORDER BY p.name ASC
    LIMIT ${lim}
  `;

  const incomplete = await sql`
    SELECT
      p.id, p.name, p.slug, p.status, p.whatsapp,
      p.photo_media_id, p.logo_media_id, p.show_on_home,
      (p.photo_media_id IS NULL AND p.logo_media_id IS NULL) AS missing_photo,
      (p.whatsapp IS NULL OR TRIM(p.whatsapp) = '') AS missing_whatsapp,
      (p.logo_media_id IS NULL) AS missing_logo
    FROM partners p
    WHERE p.deleted_at IS NULL
      AND p.status = 'ativo'
      AND (
        (p.photo_media_id IS NULL AND p.logo_media_id IS NULL)
        OR p.whatsapp IS NULL OR TRIM(p.whatsapp) = ''
        OR p.logo_media_id IS NULL
      )
    ORDER BY p.name ASC
    LIMIT ${lim}
  `;

  const completenessCounts = await sql`
    SELECT
      COUNT(*) FILTER (
        WHERE status = 'ativo'
          AND photo_media_id IS NULL AND logo_media_id IS NULL
      )::int AS missing_photo,
      COUNT(*) FILTER (
        WHERE status = 'ativo'
          AND (whatsapp IS NULL OR TRIM(whatsapp) = '')
      )::int AS missing_whatsapp,
      COUNT(*) FILTER (
        WHERE status = 'ativo' AND logo_media_id IS NULL
      )::int AS missing_logo,
      COUNT(*) FILTER (
        WHERE status = 'ativo'
          AND (
            (photo_media_id IS NULL AND logo_media_id IS NULL)
            OR whatsapp IS NULL OR TRIM(whatsapp) = ''
            OR logo_media_id IS NULL
          )
      )::int AS incomplete
    FROM partners
    WHERE deleted_at IS NULL
  `;

  const placements = await sql`
    SELECT
      pl.id, pl.code, pl.name, pl.status,
      COUNT(cam.id) FILTER (
        WHERE cam.deleted_at IS NULL AND cam.status = 'ativa'
      )::int AS active_campaigns,
      COUNT(cam.id) FILTER (
        WHERE cam.deleted_at IS NULL AND cam.status IN ('ativa', 'agendada')
      )::int AS scheduled_or_active
    FROM partner_placements pl
    LEFT JOIN partner_campaigns cam ON cam.placement_id = pl.id
    WHERE pl.deleted_at IS NULL
    GROUP BY pl.id, pl.code, pl.name, pl.status
    ORDER BY pl.name ASC
  `;

  let notifications = [];
  try {
    notifications = await sql`
      SELECT
        n.id, n.contract_id, n.warn_days, n.channel, n.status, n.created_at, n.sent_at,
        ct.ends_on, ct.partner_id,
        p.name AS partner_name
      FROM partner_contract_notifications n
      JOIN partner_contracts ct ON ct.id = n.contract_id
      JOIN partners p ON p.id = ct.partner_id
      WHERE n.status IN ('pending', 'sent')
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ${lim}
    `;
  } catch {
    notifications = [];
  }

  const thisMonth = await sql`
    SELECT
      COALESCE(SUM(received_amount), 0)::float AS received,
      COALESCE(SUM(CASE WHEN status IN ('pendente', 'atrasado')
        THEN GREATEST(contracted_amount - received_amount, 0) ELSE 0 END), 0)::float AS pending,
      COALESCE(SUM(contracted_amount), 0)::float AS contracted
    FROM partner_payments
    WHERE deleted_at IS NULL
      AND status <> 'cancelado'
      AND (
        (due_on IS NOT NULL AND date_trunc('month', due_on) = date_trunc('month', CURRENT_DATE))
        OR (due_on IS NULL AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE))
      )
  `;

  const lastMonth = await sql`
    SELECT
      COALESCE(SUM(received_amount), 0)::float AS received,
      COALESCE(SUM(CASE WHEN status IN ('pendente', 'atrasado')
        THEN GREATEST(contracted_amount - received_amount, 0) ELSE 0 END), 0)::float AS pending,
      COALESCE(SUM(contracted_amount), 0)::float AS contracted
    FROM partner_payments
    WHERE deleted_at IS NULL
      AND status <> 'cancelado'
      AND (
        (due_on IS NOT NULL AND date_trunc('month', due_on) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))
        OR (due_on IS NULL AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))
      )
  `;

  const goalSetting = await sql`SELECT value FROM partner_settings WHERE key = 'finance_monthly_goal' LIMIT 1`;
  const goalRaw = Number(String(goalSetting[0]?.value || '').replace(',', '.'));
  const goal = Number.isFinite(goalRaw) && goalRaw > 0 ? goalRaw : null;

  const tm = {
    received: Number(thisMonth[0]?.received) || 0,
    pending: Number(thisMonth[0]?.pending) || 0,
    contracted: Number(thisMonth[0]?.contracted) || 0,
  };
  const lm = {
    received: Number(lastMonth[0]?.received) || 0,
    pending: Number(lastMonth[0]?.pending) || 0,
    contracted: Number(lastMonth[0]?.contracted) || 0,
  };

  return {
    without_contract: withoutContract.map((p) => ({
      id: Number(p.id),
      name: p.name,
      slug: p.slug,
      status: p.status,
    })),
    completeness: {
      counts: {
        missing_photo: Number(completenessCounts[0]?.missing_photo) || 0,
        missing_whatsapp: Number(completenessCounts[0]?.missing_whatsapp) || 0,
        missing_logo: Number(completenessCounts[0]?.missing_logo) || 0,
        incomplete: Number(completenessCounts[0]?.incomplete) || 0,
      },
      partners: incomplete.map((p) => ({
        id: Number(p.id),
        name: p.name,
        slug: p.slug,
        missing_photo: Boolean(p.missing_photo),
        missing_whatsapp: Boolean(p.missing_whatsapp),
        missing_logo: Boolean(p.missing_logo),
        show_on_home: Boolean(p.show_on_home),
      })),
    },
    placements: placements.map((pl) => ({
      id: Number(pl.id),
      code: pl.code,
      name: pl.name,
      status: pl.status,
      active_campaigns: Number(pl.active_campaigns) || 0,
      scheduled_or_active: Number(pl.scheduled_or_active) || 0,
    })),
    notifications: notifications.map((n) => ({
      id: Number(n.id),
      contract_id: Number(n.contract_id),
      partner_id: n.partner_id ? Number(n.partner_id) : null,
      partner_name: n.partner_name,
      warn_days: Number(n.warn_days),
      channel: n.channel,
      status: n.status,
      ends_on: n.ends_on,
      created_at: n.created_at,
    })),
    finance_month: {
      this_month: tm,
      last_month: lm,
      variation: {
        received: lm.received === 0 ? (tm.received === 0 ? 0 : 100) : Math.round(((tm.received - lm.received) / lm.received) * 1000) / 10,
        pending: lm.pending === 0 ? (tm.pending === 0 ? 0 : 100) : Math.round(((tm.pending - lm.pending) / lm.pending) * 1000) / 10,
      },
      goal,
      goal_progress: goal ? Math.min(100, Math.round((tm.received / goal) * 1000) / 10) : null,
    },
  };
}

export async function changeContractPlan(contractId, body = {}, { userId = null } = {}) {
  const sql = getSql();
  const id = Number(contractId);
  const planId = Number(body?.plan_id);
  if (!id || !planId) return { error: 'Contrato e plano são obrigatórios.' };
  const applyProrata = body?.apply_prorata !== false;
  const createPayment = body?.create_payment !== false;
  const adminId = userId ? Number(userId) : null;

  const contracts = await sql`
    SELECT ct.*, p.name AS partner_name, pl.name AS plan_name, pl.price AS plan_price
    FROM partner_contracts ct
    JOIN partners p ON p.id = ct.partner_id
    LEFT JOIN partner_plans pl ON pl.id = ct.plan_id
    WHERE ct.id = ${id} AND ct.deleted_at IS NULL
    LIMIT 1
  `;
  const current = contracts[0];
  if (!current) return { error: 'Contrato não encontrado.' };
  if (current.status === 'cancelado') return { error: 'Contrato cancelado não pode mudar de plano.' };

  const plans = await sql`
    SELECT * FROM partner_plans WHERE id = ${planId} AND deleted_at IS NULL LIMIT 1
  `;
  const nextPlan = plans[0];
  if (!nextPlan) return { error: 'Plano não encontrado.' };
  if (Number(current.plan_id) === Number(nextPlan.id)) {
    return { error: 'O contrato já está neste plano.' };
  }

  const newAmount = Number.isFinite(Number(body?.amount))
    ? Number(body.amount)
    : Number(nextPlan.price) || 0;
  const prorata = computeProrataAdjustment({
    oldAmount: current.amount,
    newAmount,
    startsOn: current.starts_on,
    endsOn: current.ends_on,
    changeOn: new Date(),
  });

  const rows = await sql`
    UPDATE partner_contracts SET
      plan_id = ${nextPlan.id},
      amount = ${newAmount},
      updated_by = ${adminId},
      updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `;
  const updated = rows[0];
  const directionLabel = prorata.direction === 'upgrade'
    ? 'Upgrade'
    : prorata.direction === 'downgrade'
      ? 'Downgrade'
      : 'Troca';
  await logContractEvent(
    id,
    'plan_changed',
    `${directionLabel}: ${current.plan_name || '—'} → ${nextPlan.name}. Valor R$ ${roundMoney(current.amount)} → R$ ${roundMoney(newAmount)}.${applyProrata ? ` Pró-rata: R$ ${prorata.adjustment} (${prorata.remaining_days} dias restantes).` : ''}`,
    adminId,
  );

  let payment = null;
  if (applyProrata && createPayment && Math.abs(prorata.adjustment) >= 0.01) {
    const dueOn = toDateInput(new Date());
    const pay = await savePayment({
      contract_id: id,
      partner_id: current.partner_id,
      contracted_amount: Math.abs(prorata.adjustment),
      received_amount: prorata.adjustment < 0 ? Math.abs(prorata.adjustment) : 0,
      due_on: dueOn,
      status: prorata.adjustment < 0 ? 'pago' : 'pendente',
      notes: prorata.adjustment >= 0
        ? `Ajuste pró-rata (upgrade) — ${prorata.remaining_days} dias restantes`
        : `Crédito pró-rata (downgrade) — ${prorata.remaining_days} dias restantes`,
    });
    payment = pay.payment || null;
  }

  const match = (await listContracts()).find((c) => Number(c.id) === Number(id));
  return {
    contract: match || updated,
    prorata,
    payment,
    previous_plan: { id: current.plan_id, name: current.plan_name, amount: current.amount },
    next_plan: { id: nextPlan.id, name: nextPlan.name, amount: newAmount },
  };
}

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export async function listContractAttachments(contractId, { includeData = false } = {}) {
  const sql = getSql();
  if (includeData) {
    return sql`
      SELECT a.*, u.email AS uploaded_by_email
      FROM partner_contract_attachments a
      LEFT JOIN admin_users u ON u.id = a.uploaded_by
      WHERE a.contract_id = ${Number(contractId)}
      ORDER BY a.created_at DESC, a.id DESC
    `;
  }
  return sql`
    SELECT
      a.id, a.contract_id, a.file_name, a.file_type, a.file_size,
      a.uploaded_by, a.created_at, u.email AS uploaded_by_email
    FROM partner_contract_attachments a
    LEFT JOIN admin_users u ON u.id = a.uploaded_by
    WHERE a.contract_id = ${Number(contractId)}
    ORDER BY a.created_at DESC, a.id DESC
  `;
}

export async function getContractAttachment(contractId, attachmentId) {
  const sql = getSql();
  const rows = await sql`
    SELECT *
    FROM partner_contract_attachments
    WHERE id = ${Number(attachmentId)} AND contract_id = ${Number(contractId)}
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function saveContractAttachment(contractId, filePayload, { userId = null } = {}) {
  const sql = getSql();
  const cid = Number(contractId);
  if (!cid) return { error: 'Contrato inválido.' };
  const exists = await sql`SELECT id FROM partner_contracts WHERE id = ${cid} AND deleted_at IS NULL LIMIT 1`;
  if (!exists[0]) return { error: 'Contrato não encontrado.' };

  const parsed = parseFilePayload(filePayload, 'Anexo');
  if (parsed.error) return parsed;
  if (!parsed.value) return { error: 'Arquivo inválido.' };

  const type = parsed.value.type || 'application/pdf';
  const name = parsed.value.name.toLowerCase();
  const isPdf = type === 'application/pdf' || name.endsWith('.pdf');
  const isImage = ALLOWED_ATTACHMENT_TYPES.has(type) && type.startsWith('image/');
  if (!isPdf && !isImage) {
    return { error: 'Formato não permitido. Use PDF, JPG, PNG ou WebP.' };
  }
  const normalizedType = isPdf ? 'application/pdf' : type;

  const rows = await sql`
    INSERT INTO partner_contract_attachments (
      contract_id, file_name, file_type, file_data, file_size, uploaded_by
    ) VALUES (
      ${cid}, ${parsed.value.name}, ${normalizedType}, ${parsed.value.data},
      ${parsed.value.size || 0}, ${userId ? Number(userId) : null}
    )
    RETURNING id, contract_id, file_name, file_type, file_size, uploaded_by, created_at
  `;
  await logContractEvent(
    cid,
    'attachment_added',
    `Anexo adicionado: ${parsed.value.name}`,
    userId ? Number(userId) : null,
  );
  return { attachment: rows[0] };
}

export async function deleteContractAttachment(contractId, attachmentId, { userId = null } = {}) {
  const sql = getSql();
  const rows = await sql`
    DELETE FROM partner_contract_attachments
    WHERE id = ${Number(attachmentId)} AND contract_id = ${Number(contractId)}
    RETURNING id, file_name
  `;
  if (!rows[0]) return false;
  await logContractEvent(
    contractId,
    'attachment_removed',
    `Anexo removido: ${rows[0].file_name}`,
    userId ? Number(userId) : null,
  );
  return true;
}

export async function buildContractNotifyLinks(contractId) {
  const sql = getSql();
  const rows = await sql`
    SELECT
      ct.*,
      p.name AS partner_name,
      p.whatsapp,
      p.email AS partner_email,
      pl.name AS plan_name,
      (ct.ends_on - CURRENT_DATE)::int AS days_left
    FROM partner_contracts ct
    JOIN partners p ON p.id = ct.partner_id
    LEFT JOIN partner_plans pl ON pl.id = ct.plan_id
    WHERE ct.id = ${Number(contractId)} AND ct.deleted_at IS NULL
    LIMIT 1
  `;
  const c = rows[0];
  if (!c) return { error: 'Contrato não encontrado.' };
  const message = buildContractExpiryMessage({
    partnerName: c.partner_name,
    planName: c.plan_name,
    endsOn: c.ends_on,
    daysLeft: c.days_left,
    amount: c.amount,
  });
  return {
    contract_id: c.id,
    partner_name: c.partner_name,
    days_left: c.days_left,
    ends_on: c.ends_on,
    message,
    whatsapp_url: whatsappMessageUrl(c.whatsapp, message),
    email_url: mailtoExpiryUrl({
      email: c.partner_email,
      subject: `Contrato Antonov — vencimento ${String(c.ends_on).slice(0, 10)}`,
      body: message,
    }),
    has_whatsapp: Boolean(c.whatsapp),
    has_email: Boolean(c.partner_email),
  };
}

export async function queueContractExpiryNotifications() {
  const sql = getSql();
  const enabled = await sql`SELECT value FROM partner_settings WHERE key = 'contract_notify_enabled' LIMIT 1`;
  if (String(enabled[0]?.value || 'true').toLowerCase() === 'false') {
    return { queued: 0, skipped: true };
  }
  const warnSetting = await sql`SELECT value FROM partner_settings WHERE key = 'contract_warn_days' LIMIT 1`;
  const channelSetting = await sql`SELECT value FROM partner_settings WHERE key = 'contract_notify_channels' LIMIT 1`;
  const warnDays = parseWarnDays(warnSetting[0]?.value || '30,15,7');
  const channels = String(channelSetting[0]?.value || 'admin,whatsapp,email')
    .split(/[,\s]+/)
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  const contracts = await sql`
    SELECT
      ct.id, ct.amount, ct.ends_on,
      p.name AS partner_name, p.whatsapp, p.email AS partner_email,
      pl.name AS plan_name,
      (ct.ends_on - CURRENT_DATE)::int AS days_left
    FROM partner_contracts ct
    JOIN partners p ON p.id = ct.partner_id
    LEFT JOIN partner_plans pl ON pl.id = ct.plan_id
    WHERE ct.deleted_at IS NULL
      AND ct.status IN ('ativo', 'vencendo', 'pendente')
      AND (ct.ends_on - CURRENT_DATE)::int = ANY(${warnDays})
  `;

  let queued = 0;
  for (const c of contracts) {
    const message = buildContractExpiryMessage({
      partnerName: c.partner_name,
      planName: c.plan_name,
      endsOn: c.ends_on,
      daysLeft: c.days_left,
      amount: c.amount,
    });
    for (const channel of channels) {
      let status = 'pending';
      let payload = message;
      if (channel === 'whatsapp') {
        const url = whatsappMessageUrl(c.whatsapp, message);
        if (!url) status = 'skipped';
        else payload = JSON.stringify({ url, message });
      } else if (channel === 'email') {
        const url = mailtoExpiryUrl({
          email: c.partner_email,
          subject: `Contrato Antonov — vencimento ${String(c.ends_on).slice(0, 10)}`,
          body: message,
        });
        if (!url) status = 'skipped';
        else payload = JSON.stringify({ url, message, email: c.partner_email });
      } else if (channel === 'admin') {
        status = 'sent';
        payload = JSON.stringify({ message, days_left: c.days_left });
      }
      try {
        let sentAt = null;
        if (status === 'sent') sentAt = new Date().toISOString();
        const inserted = await sql`
          INSERT INTO partner_contract_notifications (contract_id, warn_days, channel, status, payload, sent_at)
          VALUES (
            ${c.id}, ${c.days_left}, ${channel}, ${status}, ${payload}, ${sentAt}
          )
          ON CONFLICT (contract_id, warn_days, channel) DO NOTHING
          RETURNING id
        `;
        if (inserted[0]) {
          queued += 1;
          if (status !== 'skipped') {
            await logContractEvent(
              c.id,
              'expiry_notified',
              `Aviso de vencimento (${c.days_left}d) via ${channel}.`,
              null,
            );
          }
        }
      } catch {
        /* tabela pode não existir ainda em ambientes antigos */
      }
    }
  }
  return { queued, warnDays, channels };
}

export async function processAutoRenewals({ userId = null } = {}) {
  const sql = getSql();
  const due = await sql`
    SELECT *
    FROM partner_contracts
    WHERE deleted_at IS NULL
      AND auto_renew = TRUE
      AND status = 'vencido'
      AND ends_on < CURRENT_DATE
    ORDER BY ends_on ASC
    LIMIT 50
  `;
  const created = [];
  for (const old of due) {
    const already = await sql`
      SELECT id FROM partner_contracts
      WHERE partner_id = ${old.partner_id}
        AND deleted_at IS NULL
        AND status IN ('ativo', 'pendente', 'vencendo')
        AND notes ILIKE ${`%Renovação automática #${old.id}%`}
      LIMIT 1
    `;
    if (already[0]) continue;

    const cycle = Number(old.cycle_months) || 12;
    const startsOn = toDateInput(addDays(old.ends_on, 1));
    const endsOn = toDateInput(addDays(addMonths(startsOn, cycle), -1));
    const result = await saveContract({
      partner_id: old.partner_id,
      plan_id: old.plan_id,
      amount: old.amount,
      starts_on: startsOn,
      ends_on: endsOn,
      payment_method: old.payment_method,
      notes: `Renovação automática #${old.id}`,
      auto_renew: true,
      cycle_months: cycle,
      status: 'ativo',
    }, null, { userId });
    if (result.error || !result.contract) continue;

    await sql`
      UPDATE partner_contracts SET
        auto_renew = FALSE,
        updated_at = NOW()
      WHERE id = ${old.id}
    `;
    await logContractEvent(
      old.id,
      'auto_renewed',
      `Renovação automática gerou contrato #${result.contract.id} (${startsOn} → ${endsOn}).`,
      userId,
    );
    await savePayment({
      contract_id: result.contract.id,
      partner_id: old.partner_id,
      contracted_amount: old.amount,
      received_amount: 0,
      due_on: startsOn,
      notes: `Cobrança da renovação automática #${old.id}`,
    });
    created.push(result.contract);
  }
  return { renewed: created.length, contracts: created };
}

export async function getPartnerPortal(partnerId) {
  const sql = getSql();
  const pid = Number(partnerId);
  if (!pid) return { error: 'Parceiro não vinculado à conta.' };
  const partners = await sql`
    SELECT
      id, name, slug, status, short_description, whatsapp, instagram, website, email,
      show_on_home, category_id
    FROM partners
    WHERE id = ${pid} AND deleted_at IS NULL
    LIMIT 1
  `;
  if (!partners[0]) return { error: 'Parceiro não encontrado.' };
  const contracts = await listContracts({ partner_id: pid });
  const payments = await listPayments({ partner_id: pid });
  const current = contracts.find((c) => ['ativo', 'pendente', 'vencendo'].includes(c.status))
    || contracts[0]
    || null;
  let attachments = [];
  if (current?.id) {
    attachments = await listContractAttachments(current.id);
  }
  return {
    partner: partners[0],
    contracts,
    current_contract: current,
    payments,
    attachments,
    finance: {
      pending: payments
        .filter((p) => ['pendente', 'atrasado'].includes(p.status))
        .reduce((sum, p) => sum + (Number(p.pending_amount) || 0), 0),
      received: payments
        .filter((p) => p.status === 'pago')
        .reduce((sum, p) => sum + (Number(p.received_amount) || 0), 0),
    },
  };
}
