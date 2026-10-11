import { getSql } from './db.js';
import { parseFilePayload } from './forms.js';
import {
  ALLOWED_IMAGE_TYPES,
  PARTNER_STATUSES,
  CATEGORY_STATUSES,
  comparePartnerPriority,
  computeCampaignStatus,
  computeContractStatus,
  hasPhysicalLocation,
  isPublicPartnerStatus,
  isValidSlug,
  mapsUrl,
  parseWarnDays,
  rotationSeedFromDate,
  sanitizeServices,
  slugify,
} from './parceiros-logic.js';

export function mediaUrl(id) {
  if (!id) return null;
  return `/api/partners/media/${id}`;
}

export function mapPublicPartner(row, { services = [], includePrivate = false } = {}) {
  if (!row) return null;
  const location = hasPhysicalLocation(row)
    ? {
        venue_name: row.venue_name || null,
        address: row.address || null,
        address_complement: row.address_complement || null,
        neighborhood: row.neighborhood || null,
        city: row.city || null,
        state: row.state || null,
        postal_code: row.postal_code || null,
      }
    : null;

  const out = {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    trade_name: row.trade_name || null,
    specialty: row.specialty || null,
    profession: row.profession || null,
    registry: row.registry || null,
    short_description: row.short_description || null,
    full_description: row.full_description || null,
    photo_url: mediaUrl(row.photo_media_id),
    logo_url: mediaUrl(row.logo_media_id),
    cover_url: mediaUrl(row.cover_media_id),
    category: row.category_id
      ? {
          id: Number(row.category_id),
          name: row.category_name,
          slug: row.category_slug,
        }
      : null,
    services: services.map((s) => ({ id: Number(s.id), name: s.name, sort_order: s.sort_order })),
    featured: Boolean(row.featured),
    has_whatsapp: Boolean(row.whatsapp),
    has_instagram: Boolean(row.instagram),
    has_website: Boolean(row.website),
    has_maps: Boolean(location || row.maps_url),
    location,
  };

  if (includePrivate) {
    out.status = row.status;
    out.show_on_home = Boolean(row.show_on_home);
    out.priority = row.priority;
    out.sort_order = row.sort_order;
    out.whatsapp = row.whatsapp;
    out.instagram = row.instagram;
    out.website = row.website;
    out.email = row.email;
    out.maps_url = row.maps_url;
    out.published_at = row.published_at;
    out.photo_media_id = row.photo_media_id;
    out.logo_media_id = row.logo_media_id;
    out.cover_media_id = row.cover_media_id;
  }

  return out;
}

export function mapAdminPartner(row, extras = {}) {
  return {
    ...mapPublicPartner(row, { ...extras, includePrivate: true }),
    venue_name: row.venue_name,
    address: row.address,
    address_complement: row.address_complement,
    neighborhood: row.neighborhood,
    city: row.city,
    state: row.state,
    postal_code: row.postal_code,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    plan_name: row.plan_name || null,
    contract_status: row.contract_status || null,
    contract_ends_on: row.contract_ends_on || null,
  };
}

export async function getSetting(key, fallback = null) {
  const sql = getSql();
  const rows = await sql`SELECT value FROM partner_settings WHERE key = ${key} LIMIT 1`;
  return rows[0]?.value ?? fallback;
}

export async function setSetting(key, value) {
  const sql = getSql();
  await sql`
    INSERT INTO partner_settings (key, value, updated_at)
    VALUES (${key}, ${String(value)}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

export async function refreshOperationalStatuses(sql = getSql()) {
  const warnRaw = await getSetting('contract_warn_days', '30,15,7');
  const warnDays = parseWarnDays(warnRaw);
  const maxWarn = Math.max(...warnDays);

  await sql`
    UPDATE partner_contracts
    SET status = CASE
      WHEN status = 'cancelado' THEN 'cancelado'
      WHEN ends_on < CURRENT_DATE THEN 'vencido'
      WHEN starts_on > CURRENT_DATE THEN 'pendente'
      WHEN ends_on <= CURRENT_DATE + ${maxWarn}::int THEN 'vencendo'
      ELSE 'ativo'
    END,
    updated_at = NOW()
    WHERE deleted_at IS NULL
      AND status <> 'cancelado'
  `;

  await sql`
    UPDATE partner_campaigns
    SET status = CASE
      WHEN status IN ('pausada', 'rascunho') THEN status
      WHEN ends_on IS NOT NULL AND ends_on < CURRENT_DATE THEN 'finalizada'
      WHEN starts_on IS NOT NULL AND starts_on > CURRENT_DATE THEN 'agendada'
      ELSE 'ativa'
    END,
    updated_at = NOW()
    WHERE deleted_at IS NULL
      AND status NOT IN ('pausada', 'rascunho')
  `;

  await sql`
    UPDATE partner_payments
    SET status = CASE
      WHEN status IN ('cancelado', 'pago') THEN status
      WHEN received_amount >= contracted_amount AND contracted_amount > 0 THEN 'pago'
      WHEN due_on IS NOT NULL AND due_on < CURRENT_DATE AND received_amount < contracted_amount THEN 'atrasado'
      ELSE 'pendente'
    END,
    updated_at = NOW()
    WHERE deleted_at IS NULL
  `;

  let notifications = { queued: 0 };
  let renewals = { renewed: 0 };
  try {
    const { queueContractExpiryNotifications, processAutoRenewals } = await import('./parceiros-comercial.js');
    notifications = await queueContractExpiryNotifications();
    renewals = await processAutoRenewals();
  } catch (err) {
    console.error('partners tick extras', err);
  }

  return { warnDays, notifications, renewals };
}

export async function listPublicCategories() {
  const sql = getSql();
  return sql`
    SELECT
      c.id, c.name, c.slug, c.description, c.sort_order,
      COUNT(p.id)::int AS partner_count
    FROM partner_categories c
    LEFT JOIN partners p
      ON p.category_id = c.id
      AND p.deleted_at IS NULL
      AND p.status = 'ativo'
    WHERE c.deleted_at IS NULL AND c.status = 'ativa'
    GROUP BY c.id
    ORDER BY c.sort_order ASC, c.name ASC
  `;
}

export async function listPublicPartners({ categoria, q } = {}) {
  const sql = getSql();
  const seed = rotationSeedFromDate();
  const cat = String(categoria || '').trim();
  const query = String(q || '').trim();
  const like = query ? `%${query}%` : null;

  const rows = await sql`
    SELECT
      p.*,
      c.name AS category_name,
      c.slug AS category_slug,
      COALESCE(pl.priority, 0)::int AS plan_priority,
      COALESCE(camp.max_priority, 0)::int AS campaign_priority,
      CASE WHEN camp.max_priority IS NOT NULL THEN TRUE ELSE FALSE END AS has_active_campaign
    FROM partners p
    LEFT JOIN partner_categories c ON c.id = p.category_id
    LEFT JOIN LATERAL (
      SELECT pln.priority
      FROM partner_contracts ct
      JOIN partner_plans pln ON pln.id = ct.plan_id
      WHERE ct.partner_id = p.id
        AND ct.deleted_at IS NULL
        AND ct.status IN ('ativo', 'vencendo')
      ORDER BY pln.priority DESC
      LIMIT 1
    ) pl ON TRUE
    LEFT JOIN LATERAL (
      SELECT MAX(cam.priority) AS max_priority
      FROM partner_campaigns cam
      LEFT JOIN partner_placements pl ON pl.id = cam.placement_id
      WHERE cam.partner_id = p.id
        AND cam.deleted_at IS NULL
        AND cam.status = 'ativa'
        AND (
          pl.code = ANY(${['PARTNER_GRID_PRIORITY', 'PARTNERS_FEATURED']})
          OR EXISTS (
            SELECT 1 FROM partner_campaign_placements pcp
            JOIN partner_placements pl2 ON pl2.id = pcp.placement_id
            WHERE pcp.campaign_id = cam.id
              AND pl2.code = ANY(${['PARTNER_GRID_PRIORITY', 'PARTNERS_FEATURED']})
          )
        )
    ) camp ON TRUE
    WHERE p.deleted_at IS NULL
      AND p.status = 'ativo'
      AND (${cat} = '' OR c.slug = ${cat})
      AND (
        ${like}::text IS NULL
        OR p.name ILIKE ${like}
        OR COALESCE(p.trade_name, '') ILIKE ${like}
        OR COALESCE(p.specialty, '') ILIKE ${like}
        OR EXISTS (
          SELECT 1 FROM partner_services s
          WHERE s.partner_id = p.id AND s.name ILIKE ${like}
        )
      )
  `;

  rows.sort((a, b) => comparePartnerPriority(a, b, seed));

  const ids = rows.map((r) => r.id);
  const services = ids.length
    ? await sql`
        SELECT id, partner_id, name, sort_order
        FROM partner_services
        WHERE partner_id = ANY(${ids})
        ORDER BY sort_order ASC, id ASC
      `
    : [];
  const byPartner = new Map();
  for (const s of services) {
    const list = byPartner.get(s.partner_id) || [];
    list.push(s);
    byPartner.set(s.partner_id, list);
  }

  return rows.map((row) => mapPublicPartner(row, { services: byPartner.get(row.id) || [] }));
}

export async function getPublicPartnerBySlug(slug) {
  const sql = getSql();
  const rows = await sql`
    SELECT p.*, c.name AS category_name, c.slug AS category_slug
    FROM partners p
    LEFT JOIN partner_categories c ON c.id = p.category_id
    WHERE p.slug = ${slug} AND p.deleted_at IS NULL
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || !isPublicPartnerStatus(row.status)) return null;
  const services = await sql`
    SELECT id, name, sort_order FROM partner_services
    WHERE partner_id = ${row.id}
    ORDER BY sort_order ASC, id ASC
  `;
  return mapPublicPartner(row, { services });
}

export async function getPartnerRowBySlug(slug) {
  const sql = getSql();
  const rows = await sql`
    SELECT p.*, c.name AS category_name, c.slug AS category_slug
    FROM partners p
    LEFT JOIN partner_categories c ON c.id = p.category_id
    WHERE p.slug = ${slug} AND p.deleted_at IS NULL
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function getHomeCarousels() {
  const sql = getSql();
  const seed = rotationSeedFromDate();
  const limitRaw = await getSetting('home_carousel_limit', '12');
  const limit = Math.min(24, Math.max(4, parseInt(limitRaw, 10) || 12));

  const categories = await listPublicCategories();
  const rows = await sql`
    SELECT
      p.*,
      c.name AS category_name,
      c.slug AS category_slug,
      COALESCE(pl.priority, 0)::int AS plan_priority,
      COALESCE(camp.max_priority, 0)::int AS campaign_priority,
      CASE WHEN camp.max_priority IS NOT NULL THEN TRUE ELSE FALSE END AS has_active_campaign
    FROM partners p
    LEFT JOIN partner_categories c ON c.id = p.category_id
    LEFT JOIN LATERAL (
      SELECT pln.priority
      FROM partner_contracts ct
      JOIN partner_plans pln ON pln.id = ct.plan_id
      WHERE ct.partner_id = p.id
        AND ct.deleted_at IS NULL
        AND ct.status IN ('ativo', 'vencendo')
      ORDER BY pln.priority DESC
      LIMIT 1
    ) pl ON TRUE
    LEFT JOIN LATERAL (
      SELECT MAX(cam.priority) AS max_priority
      FROM partner_campaigns cam
      LEFT JOIN partner_placements pl ON pl.id = cam.placement_id
      WHERE cam.partner_id = p.id
        AND cam.deleted_at IS NULL
        AND cam.status = 'ativa'
        AND (
          pl.code = ANY(${['HOME_PARTNERS_CAROUSEL', 'HOME_PARTNERS_FEATURED']})
          OR EXISTS (
            SELECT 1 FROM partner_campaign_placements pcp
            JOIN partner_placements pl2 ON pl2.id = pcp.placement_id
            WHERE pcp.campaign_id = cam.id
              AND pl2.code = ANY(${['HOME_PARTNERS_CAROUSEL', 'HOME_PARTNERS_FEATURED']})
          )
        )
    ) camp ON TRUE
    WHERE p.deleted_at IS NULL
      AND p.status = 'ativo'
      AND p.show_on_home = TRUE
  `;

  rows.sort((a, b) => comparePartnerPriority(a, b, seed));

  return categories.map((cat) => {
    const partners = rows
      .filter((p) => Number(p.category_id) === Number(cat.id))
      .slice(0, limit)
      .map((p) => ({
        id: Number(p.id),
        slug: p.slug,
        name: p.name,
        specialty: p.specialty,
        logo_url: mediaUrl(p.logo_media_id),
        photo_url: mediaUrl(p.photo_media_id),
      }));
    return {
      id: Number(cat.id),
      name: cat.name,
      slug: cat.slug,
      partner_count: Number(cat.partner_count) || partners.length,
      partners,
    };
  });
}

export async function listAdminPartners({ q, categoria, status, page = 1, limit = 25 } = {}) {
  const sql = getSql();
  const query = String(q || '').trim();
  const like = query ? `%${query}%` : null;
  const cat = String(categoria || '').trim();
  const rawStatus = String(status || '').trim();
  const st = rawStatus === 'nao_ativo' || PARTNER_STATUSES.includes(rawStatus) ? rawStatus : '';
  const offset = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
  const take = Math.min(100, Math.max(1, limit));

  const rows = await sql`
    SELECT
      p.*,
      c.name AS category_name,
      c.slug AS category_slug,
      pln.name AS plan_name,
      ct.status AS contract_status,
      ct.ends_on AS contract_ends_on,
      COUNT(*) OVER()::int AS total_count
    FROM partners p
    LEFT JOIN partner_categories c ON c.id = p.category_id
    LEFT JOIN LATERAL (
      SELECT ct2.status, ct2.ends_on, ct2.plan_id
      FROM partner_contracts ct2
      WHERE ct2.partner_id = p.id AND ct2.deleted_at IS NULL
      ORDER BY ct2.ends_on DESC
      LIMIT 1
    ) ct ON TRUE
    LEFT JOIN partner_plans pln ON pln.id = ct.plan_id
    WHERE p.deleted_at IS NULL
      AND (
        ${st} = ''
        OR (${st} = 'nao_ativo' AND p.status <> 'ativo')
        OR (${st} <> 'nao_ativo' AND p.status = ${st})
      )
      AND (${cat} = '' OR c.slug = ${cat})
      AND (
        ${like}::text IS NULL
        OR p.name ILIKE ${like}
        OR p.slug ILIKE ${like}
        OR COALESCE(p.trade_name, '') ILIKE ${like}
      )
    ORDER BY p.sort_order ASC, p.name ASC
    LIMIT ${take} OFFSET ${offset}
  `;

  return {
    total: rows[0]?.total_count || 0,
    page: Math.max(1, page),
    limit: take,
    partners: rows.map((r) => mapAdminPartner(r)),
  };
}

export async function getAdminPartner(id) {
  const sql = getSql();
  const rows = await sql`
    SELECT p.*, c.name AS category_name, c.slug AS category_slug
    FROM partners p
    LEFT JOIN partner_categories c ON c.id = p.category_id
    WHERE p.id = ${id} AND p.deleted_at IS NULL
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const services = await sql`
    SELECT id, name, sort_order FROM partner_services
    WHERE partner_id = ${row.id}
    ORDER BY sort_order ASC, id ASC
  `;
  return mapAdminPartner(row, { services });
}

function cleanText(v, max = 500) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return s.slice(0, max);
}

export function parsePartnerBody(body, { partial = false } = {}) {
  const name = cleanText(body?.name, 120);
  if (!partial && !name) return { error: 'Nome é obrigatório.' };

  const slugRaw = cleanText(body?.slug, 80);
  const slug = slugRaw ? slugify(slugRaw, slugRaw) : name ? slugify(name) : undefined;
  if (slug && !isValidSlug(slug)) return { error: 'Slug inválido.' };

  const status = body?.status != null ? String(body.status) : undefined;
  if (status && !PARTNER_STATUSES.includes(status)) return { error: 'Status inválido.' };

  const services = body?.services != null ? sanitizeServices(body.services) : undefined;
  if (services && services.length > 6) return { error: 'No máximo 6 serviços.' };

  return {
    value: {
      name,
      slug,
      trade_name: body?.trade_name !== undefined ? cleanText(body.trade_name, 160) : undefined,
      category_id: body?.category_id != null && body.category_id !== '' ? Number(body.category_id) : body?.category_id === '' ? null : undefined,
      specialty: body?.specialty !== undefined ? cleanText(body.specialty, 160) : undefined,
      profession: body?.profession !== undefined ? cleanText(body.profession, 120) : undefined,
      registry: body?.registry !== undefined ? cleanText(body.registry, 80) : undefined,
      short_description: body?.short_description !== undefined ? cleanText(body.short_description, 280) : undefined,
      full_description: body?.full_description !== undefined ? cleanText(body.full_description, 4000) : undefined,
      whatsapp: body?.whatsapp !== undefined ? cleanText(body.whatsapp, 40) : undefined,
      instagram: body?.instagram !== undefined ? cleanText(body.instagram, 160) : undefined,
      website: body?.website !== undefined ? cleanText(body.website, 240) : undefined,
      email: body?.email !== undefined ? cleanText(String(body.email || '').toLowerCase(), 160) : undefined,
      venue_name: body?.venue_name !== undefined ? cleanText(body.venue_name, 160) : undefined,
      address: body?.address !== undefined ? cleanText(body.address, 200) : undefined,
      address_complement: body?.address_complement !== undefined ? cleanText(body.address_complement, 120) : undefined,
      neighborhood: body?.neighborhood !== undefined ? cleanText(body.neighborhood, 80) : undefined,
      city: body?.city !== undefined ? cleanText(body.city, 80) : undefined,
      state: body?.state !== undefined ? cleanText(body.state, 2)?.toUpperCase() : undefined,
      postal_code: body?.postal_code !== undefined ? cleanText(body.postal_code, 16) : undefined,
      maps_url: body?.maps_url !== undefined ? cleanText(body.maps_url, 500) : undefined,
      status,
      featured: body?.featured != null ? Boolean(body.featured) : undefined,
      show_on_home: body?.show_on_home != null ? Boolean(body.show_on_home) : undefined,
      priority: body?.priority != null ? Number(body.priority) || 0 : undefined,
      sort_order: body?.sort_order != null ? Number(body.sort_order) || 0 : undefined,
      published_at: body?.published_at !== undefined ? (body.published_at || null) : undefined,
      services,
    },
  };
}

export async function savePartner(body, id = null) {
  const sql = getSql();
  const parsed = parsePartnerBody(body, { partial: Boolean(id) });
  if (parsed.error) return parsed;
  const v = parsed.value;

  if (v.slug) {
    const existing = await sql`
      SELECT id FROM partners WHERE slug = ${v.slug} AND deleted_at IS NULL LIMIT 1
    `;
    if (existing[0] && Number(existing[0].id) !== Number(id)) {
      return { error: 'Slug já utilizado.' };
    }
  }

  let row;
  if (id) {
    const current = await sql`SELECT * FROM partners WHERE id = ${id} AND deleted_at IS NULL`;
    if (!current[0]) return { error: 'Parceiro não encontrado.' };
    const next = { ...current[0], ...Object.fromEntries(Object.entries(v).filter(([, val]) => val !== undefined)) };
    const publishedAt = next.status === 'ativo' && !next.published_at ? new Date().toISOString() : next.published_at;
    const updated = await sql`
      UPDATE partners SET
        name = ${next.name},
        slug = ${next.slug},
        trade_name = ${next.trade_name},
        category_id = ${next.category_id || null},
        specialty = ${next.specialty},
        profession = ${next.profession},
        registry = ${next.registry},
        short_description = ${next.short_description},
        full_description = ${next.full_description},
        whatsapp = ${next.whatsapp},
        instagram = ${next.instagram},
        website = ${next.website},
        email = ${next.email},
        venue_name = ${next.venue_name},
        address = ${next.address},
        address_complement = ${next.address_complement},
        neighborhood = ${next.neighborhood},
        city = ${next.city},
        state = ${next.state},
        postal_code = ${next.postal_code},
        maps_url = ${next.maps_url},
        status = ${next.status},
        featured = ${Boolean(next.featured)},
        show_on_home = ${next.show_on_home !== false},
        priority = ${Number(next.priority) || 0},
        sort_order = ${Number(next.sort_order) || 0},
        published_at = ${publishedAt},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    row = updated[0];
  } else {
    const publishedAt = v.status === 'ativo' ? new Date().toISOString() : v.published_at || null;
    const inserted = await sql`
      INSERT INTO partners (
        name, slug, trade_name, category_id, specialty, profession, registry,
        short_description, full_description, whatsapp, instagram, website, email,
        venue_name, address, address_complement, neighborhood, city, state, postal_code, maps_url,
        status, featured, show_on_home, priority, sort_order, published_at
      ) VALUES (
        ${v.name}, ${v.slug}, ${v.trade_name || null}, ${v.category_id || null},
        ${v.specialty || null}, ${v.profession || null}, ${v.registry || null},
        ${v.short_description || null}, ${v.full_description || null},
        ${v.whatsapp || null}, ${v.instagram || null}, ${v.website || null}, ${v.email || null},
        ${v.venue_name || null}, ${v.address || null}, ${v.address_complement || null},
        ${v.neighborhood || null}, ${v.city || null}, ${v.state || null}, ${v.postal_code || null},
        ${v.maps_url || null}, ${v.status || 'rascunho'}, ${Boolean(v.featured)},
        ${v.show_on_home !== false}, ${Number(v.priority) || 0}, ${Number(v.sort_order) || 0},
        ${publishedAt}
      )
      RETURNING *
    `;
    row = inserted[0];
  }

  if (v.services) {
    await sql`DELETE FROM partner_services WHERE partner_id = ${row.id}`;
    for (const [i, s] of v.services.entries()) {
      await sql`
        INSERT INTO partner_services (partner_id, name, sort_order)
        VALUES (${row.id}, ${s.name}, ${s.sort_order ?? i})
      `;
    }
  }

  return { partner: await getAdminPartner(row.id) };
}

export async function softDeletePartner(id) {
  const sql = getSql();
  const rows = await sql`
    UPDATE partners SET deleted_at = NOW(), status = 'arquivado', updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;
  return Boolean(rows[0]);
}

export async function savePartnerMedia(partnerId, kind, filePayload) {
  const parsed = parseFilePayload(filePayload, 'Imagem');
  if (parsed.error) return parsed;
  if (!parsed.value) return { error: 'Arquivo inválido.' };
  const type = parsed.value.type || 'image/jpeg';
  if (!ALLOWED_IMAGE_TYPES.has(type) && !type.startsWith('image/')) {
    return { error: 'Formato de imagem não permitido. Use JPG, PNG ou WebP.' };
  }
  const normalizedType = ALLOWED_IMAGE_TYPES.has(type) ? type : 'image/jpeg';
  const sql = getSql();
  const rows = await sql`
    INSERT INTO partner_media (partner_id, kind, file_name, file_type, file_data)
    VALUES (${partnerId}, ${kind}, ${parsed.value.name}, ${normalizedType}, ${parsed.value.data})
    RETURNING id, kind, file_name, file_type
  `;
  const media = rows[0];
  const column = kind === 'logo' ? 'logo_media_id' : kind === 'cover' ? 'cover_media_id' : 'photo_media_id';
  if (column === 'photo_media_id') {
    await sql`UPDATE partners SET photo_media_id = ${media.id}, updated_at = NOW() WHERE id = ${partnerId}`;
  } else if (column === 'logo_media_id') {
    await sql`UPDATE partners SET logo_media_id = ${media.id}, updated_at = NOW() WHERE id = ${partnerId}`;
  } else {
    await sql`UPDATE partners SET cover_media_id = ${media.id}, updated_at = NOW() WHERE id = ${partnerId}`;
  }
  return { media: { ...media, url: mediaUrl(media.id) } };
}

export async function getMedia(id) {
  const sql = getSql();
  const rows = await sql`
    SELECT m.*, p.status AS partner_status, p.deleted_at AS partner_deleted
    FROM partner_media m
    LEFT JOIN partners p ON p.id = m.partner_id
    WHERE m.id = ${id}
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function listCategories({ includeArchived = false } = {}) {
  const sql = getSql();
  if (includeArchived) {
    return sql`
      SELECT c.*, COUNT(p.id)::int AS partner_count
      FROM partner_categories c
      LEFT JOIN partners p ON p.category_id = c.id AND p.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.name ASC
    `;
  }
  return sql`
    SELECT c.*, COUNT(p.id)::int AS partner_count
    FROM partner_categories c
    LEFT JOIN partners p ON p.category_id = c.id AND p.deleted_at IS NULL
    WHERE c.deleted_at IS NULL AND c.status = 'ativa'
    GROUP BY c.id
    ORDER BY c.sort_order ASC, c.name ASC
  `;
}

export async function saveCategory(body, id = null) {
  const sql = getSql();
  const name = String(body?.name || '').trim();
  if (!name) return { error: 'Nome é obrigatório.' };
  const slug = slugify(body?.slug || name);
  if (!isValidSlug(slug)) return { error: 'Slug inválido.' };
  const status = CATEGORY_STATUSES.includes(body?.status) ? body.status : 'ativa';
  const description = String(body?.description || '').trim() || null;
  const sortOrder = Number(body?.sort_order) || 0;
  const icon = String(body?.icon || '').trim() || null;
  const imageUrl = String(body?.image_url || '').trim() || null;

  const clash = await sql`
    SELECT id FROM partner_categories WHERE slug = ${slug} AND deleted_at IS NULL LIMIT 1
  `;
  if (clash[0] && Number(clash[0].id) !== Number(id)) return { error: 'Slug já utilizado.' };

  if (id) {
    const rows = await sql`
      UPDATE partner_categories SET
        name = ${name}, slug = ${slug}, description = ${description},
        sort_order = ${sortOrder}, status = ${status}, icon = ${icon},
        image_url = ${imageUrl}, updated_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (!rows[0]) return { error: 'Categoria não encontrada.' };
    return { category: rows[0] };
  }

  const rows = await sql`
    INSERT INTO partner_categories (name, slug, description, sort_order, status, icon, image_url)
    VALUES (${name}, ${slug}, ${description}, ${sortOrder}, ${status}, ${icon}, ${imageUrl})
    RETURNING *
  `;
  return { category: rows[0] };
}

export async function softDeleteCategory(id) {
  const sql = getSql();
  const rows = await sql`
    UPDATE partner_categories SET deleted_at = NOW(), status = 'arquivada', updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;
  return Boolean(rows[0]);
}

export { mapsUrl, computeContractStatus, computeCampaignStatus };
