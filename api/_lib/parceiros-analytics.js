import { getSql } from './db.js';
import {
  CLICK_EVENTS,
  EVENT_TYPES,
  LEAD_EVENTS,
  computeMetrics,
  parsePeriod,
  variationPct,
} from './parceiros-logic.js';

const DEDUPE_WINDOW_MS = 20_000;

export function normalizeEvent(body, reqMeta = {}) {
  const eventType = String(body?.event_type || '').trim();
  if (!EVENT_TYPES.includes(eventType)) return { error: 'Tipo de evento inválido.' };

  const sessionId = String(body?.session_id || '').trim().slice(0, 64);
  if (!sessionId || sessionId.length < 8) return { error: 'Sessão inválida.' };

  const partnerId = body?.partner_id != null && body.partner_id !== '' ? Number(body.partner_id) : null;
  if (partnerId != null && !Number.isFinite(partnerId)) return { error: 'Parceiro inválido.' };

  const page = String(body?.page || reqMeta.page || '').trim().slice(0, 240) || null;
  const referrer = String(body?.referrer || reqMeta.referrer || '').trim().slice(0, 500) || null;

  const metadata = body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
    ? body.metadata
    : {};

  delete metadata.ip;
  delete metadata.email;
  delete metadata.phone;
  delete metadata.cpf;

  return {
    value: {
      event_type: eventType,
      partner_id: partnerId,
      campaign_id: body?.campaign_id ? Number(body.campaign_id) : null,
      placement_id: body?.placement_id ? Number(body.placement_id) : null,
      category_id: body?.category_id ? Number(body.category_id) : null,
      session_id: sessionId,
      page,
      referrer,
      metadata,
    },
  };
}

export async function insertEvent(event) {
  const sql = getSql();
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  const dup = await sql`
    SELECT id FROM partner_analytics_events
    WHERE session_id = ${event.session_id}
      AND event_type = ${event.event_type}
      AND COALESCE(partner_id, 0) = COALESCE(${event.partner_id}, 0)
      AND created_at >= ${since}
    LIMIT 1
  `;
  if (dup[0]) return { id: dup[0].id, deduped: true };

  const rows = await sql`
    INSERT INTO partner_analytics_events (
      event_type, partner_id, campaign_id, placement_id, category_id,
      session_id, page, referrer, metadata
    ) VALUES (
      ${event.event_type},
      ${event.partner_id},
      ${event.campaign_id},
      ${event.placement_id},
      ${event.category_id},
      ${event.session_id},
      ${event.page},
      ${event.referrer},
      ${JSON.stringify(event.metadata || {})}
    )
    RETURNING id, created_at
  `;
  return { id: rows[0].id, created_at: rows[0].created_at, deduped: false };
}

function filtersSql(f) {
  return {
    partnerId: f.partner_id ? Number(f.partner_id) : null,
    categoryId: f.category_id ? Number(f.category_id) : null,
    campaignId: f.campaign_id ? Number(f.campaign_id) : null,
    placementId: f.placement_id ? Number(f.placement_id) : null,
    planId: f.plan_id ? Number(f.plan_id) : null,
  };
}

export async function countEvents({ from, to, eventTypes, ...rest }) {
  const sql = getSql();
  const f = filtersSql(rest);
  const types = eventTypes?.length ? eventTypes : null;
  const rows = await sql`
    SELECT COUNT(*)::int AS n
    FROM partner_analytics_events e
    LEFT JOIN partners p ON p.id = e.partner_id
    WHERE e.created_at >= ${from.toISOString()}
      AND e.created_at <= ${to.toISOString()}
      AND (${types}::text[] IS NULL OR e.event_type = ANY(${types}))
      AND (${f.partnerId}::bigint IS NULL OR e.partner_id = ${f.partnerId})
      AND (${f.categoryId}::bigint IS NULL OR e.category_id = ${f.categoryId} OR p.category_id = ${f.categoryId})
      AND (${f.campaignId}::bigint IS NULL OR e.campaign_id = ${f.campaignId})
      AND (${f.placementId}::bigint IS NULL OR e.placement_id = ${f.placementId})
      AND (${f.planId}::bigint IS NULL OR EXISTS (
        SELECT 1 FROM partner_contracts ct
        WHERE ct.partner_id = e.partner_id AND ct.plan_id = ${f.planId} AND ct.deleted_at IS NULL
      ))
  `;
  return rows[0]?.n || 0;
}

export async function totalsForPeriod(period, filters = {}) {
  const [impressions, profileViews, whatsapp, instagram, maps, website, cardClicks, serviceClicks] = await Promise.all([
    countEvents({ ...period, ...filters, eventTypes: ['partner_impression'] }),
    countEvents({ ...period, ...filters, eventTypes: ['partner_profile_view'] }),
    countEvents({ ...period, ...filters, eventTypes: ['whatsapp_click'] }),
    countEvents({ ...period, ...filters, eventTypes: ['instagram_click'] }),
    countEvents({ ...period, ...filters, eventTypes: ['maps_click'] }),
    countEvents({ ...period, ...filters, eventTypes: ['website_click'] }),
    countEvents({ ...period, ...filters, eventTypes: ['partner_card_click'] }),
    countEvents({ ...period, ...filters, eventTypes: ['service_click'] }),
  ]);
  const clicks = whatsapp + instagram + maps + website + cardClicks + serviceClicks;
  return computeMetrics({
    impressions,
    clicks,
    profile_views: profileViews,
    leads: whatsapp,
    whatsapp,
    instagram,
    maps,
    website,
  });
}

export async function rankingForPeriod(period, filters = {}) {
  const sql = getSql();
  const f = filtersSql(filters);
  const rows = await sql`
    SELECT
      p.id,
      p.name,
      p.slug,
      c.name AS category_name,
      COUNT(*) FILTER (WHERE e.event_type = 'partner_impression')::int AS impressions,
      COUNT(*) FILTER (WHERE e.event_type = 'partner_profile_view')::int AS profile_views,
      COUNT(*) FILTER (WHERE e.event_type = 'whatsapp_click')::int AS whatsapp,
      COUNT(*) FILTER (WHERE e.event_type = 'instagram_click')::int AS instagram,
      COUNT(*) FILTER (WHERE e.event_type = 'maps_click')::int AS maps,
      COUNT(*) FILTER (WHERE e.event_type = 'website_click')::int AS website,
      COUNT(*) FILTER (WHERE e.event_type = ANY(${[...CLICK_EVENTS]}))::int AS clicks,
      COUNT(*) FILTER (WHERE e.event_type = ANY(${[...LEAD_EVENTS]}))::int AS leads
    FROM partners p
    LEFT JOIN partner_categories c ON c.id = p.category_id
    LEFT JOIN partner_analytics_events e
      ON e.partner_id = p.id
      AND e.created_at >= ${period.from.toISOString()}
      AND e.created_at <= ${period.to.toISOString()}
      AND (${f.campaignId}::bigint IS NULL OR e.campaign_id = ${f.campaignId})
      AND (${f.placementId}::bigint IS NULL OR e.placement_id = ${f.placementId})
    WHERE p.deleted_at IS NULL
      AND (${f.partnerId}::bigint IS NULL OR p.id = ${f.partnerId})
      AND (${f.categoryId}::bigint IS NULL OR p.category_id = ${f.categoryId})
      AND (${f.planId}::bigint IS NULL OR EXISTS (
        SELECT 1 FROM partner_contracts ct
        WHERE ct.partner_id = p.id
          AND ct.plan_id = ${f.planId}
          AND ct.deleted_at IS NULL
          AND ct.status IN ('ativo', 'pendente', 'vencendo')
      ))
    GROUP BY p.id, c.name
    HAVING
      COUNT(*) FILTER (WHERE e.event_type IS NOT NULL) > 0
    ORDER BY leads DESC, profile_views DESC, impressions DESC
  `;

  return rows.map((r) => {
    const metrics = computeMetrics(r);
    return {
      id: Number(r.id),
      name: r.name,
      slug: r.slug,
      category: r.category_name,
      impressions: metrics.impressions,
      profile_views: metrics.profile_views,
      whatsapp: metrics.whatsapp,
      instagram: metrics.instagram,
      maps: metrics.maps,
      website: Number(r.website) || 0,
      clicks: metrics.clicks,
      ctr: metrics.ctr,
      leads: metrics.leads,
    };
  });
}

export async function dailySeriesForPeriod(period, filters = {}) {
  const sql = getSql();
  const f = filtersSql(filters);
  const clickTypes = [...CLICK_EVENTS];
  const rows = await sql`
    SELECT
      (e.created_at AT TIME ZONE 'America/Bahia')::date AS day,
      COUNT(*) FILTER (WHERE e.event_type = 'partner_impression')::int AS impressions,
      COUNT(*) FILTER (WHERE e.event_type = 'partner_profile_view')::int AS profile_views,
      COUNT(*) FILTER (WHERE e.event_type = 'whatsapp_click')::int AS leads,
      COUNT(*) FILTER (WHERE e.event_type = ANY(${clickTypes}))::int AS clicks
    FROM partner_analytics_events e
    LEFT JOIN partners p ON p.id = e.partner_id
    WHERE e.created_at >= ${period.from.toISOString()}
      AND e.created_at <= ${period.to.toISOString()}
      AND (${f.partnerId}::bigint IS NULL OR e.partner_id = ${f.partnerId})
      AND (${f.categoryId}::bigint IS NULL OR e.category_id = ${f.categoryId} OR p.category_id = ${f.categoryId})
      AND (${f.campaignId}::bigint IS NULL OR e.campaign_id = ${f.campaignId})
      AND (${f.placementId}::bigint IS NULL OR e.placement_id = ${f.placementId})
      AND (${f.planId}::bigint IS NULL OR EXISTS (
        SELECT 1 FROM partner_contracts ct
        WHERE ct.partner_id = e.partner_id AND ct.plan_id = ${f.planId} AND ct.deleted_at IS NULL
      ))
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const byDay = new Map();
  for (const r of rows) {
    const key = String(r.day).slice(0, 10);
    byDay.set(key, {
      day: key,
      impressions: Number(r.impressions) || 0,
      profile_views: Number(r.profile_views) || 0,
      leads: Number(r.leads) || 0,
      clicks: Number(r.clicks) || 0,
    });
  }

  const series = [];
  const cursor = new Date(period.from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(period.to);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${d}`;
    series.push(byDay.get(key) || {
      day: key,
      impressions: 0,
      profile_views: 0,
      leads: 0,
      clicks: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return series;
}

export async function partnerReport(partnerId, query) {
  const period = parsePeriod(query);
  if (period.error) return period;
  const filters = { partner_id: partnerId };
  const [current, previous] = await Promise.all([
    totalsForPeriod(period, filters),
    totalsForPeriod({ from: period.prevFrom, to: period.prevTo }, filters),
  ]);
  return {
    period: { from: period.from, to: period.to, label: period.label, days: period.days },
    current,
    previous,
    variation: {
      impressions: variationPct(current.impressions, previous.impressions),
      profile_views: variationPct(current.profile_views, previous.profile_views),
      clicks: variationPct(current.clicks, previous.clicks),
      leads: variationPct(current.leads, previous.leads),
      ctr: variationPct(current.ctr, previous.ctr),
    },
  };
}

export async function dashboardAnalytics(query) {
  const period = parsePeriod(query);
  if (period.error) return period;
  const filters = {
    partner_id: query.partner_id,
    category_id: query.category_id,
    campaign_id: query.campaign_id,
    placement_id: query.placement_id,
    plan_id: query.plan_id,
  };
  const [current, previous, ranking, series] = await Promise.all([
    totalsForPeriod(period, filters),
    totalsForPeriod({ from: period.prevFrom, to: period.prevTo }, filters),
    rankingForPeriod(period, filters),
    dailySeriesForPeriod(period, filters),
  ]);
  const channelTotal = (current.whatsapp || 0) + (current.instagram || 0)
    + (current.maps || 0) + (current.website || 0);
  return {
    period: { from: period.from, to: period.to, label: period.label, days: period.days },
    filters: {
      category_id: filters.category_id ? Number(filters.category_id) : null,
      plan_id: filters.plan_id ? Number(filters.plan_id) : null,
    },
    current,
    previous,
    variation: {
      impressions: variationPct(current.impressions, previous.impressions),
      profile_views: variationPct(current.profile_views, previous.profile_views),
      clicks: variationPct(current.clicks, previous.clicks),
      leads: variationPct(current.leads, previous.leads),
      ctr: variationPct(current.ctr, previous.ctr),
    },
    channels: {
      whatsapp: current.whatsapp || 0,
      instagram: current.instagram || 0,
      maps: current.maps || 0,
      website: current.website || 0,
      total: channelTotal,
    },
    series,
    ranking,
  };
}

export { parsePeriod, CLICK_EVENTS, LEAD_EVENTS };
