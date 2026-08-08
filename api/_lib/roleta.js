import { getSql } from './db.js';

function normalizeWhatsapp(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function currentPityChance(prize) {
  const every = prize.pity_every;
  if (every == null || every <= 0) return 0;
  return Math.min(1, (Math.max(0, Number(prize.pity_counter) || 0) + 1) / every);
}

function effectiveWeight(prize) {
  if (prize.pity_every != null && prize.pity_every > 0) {
    return currentPityChance(prize);
  }
  return Math.max(0, Number(prize.weight) || 0);
}

function isEligible(prize) {
  const hasDrop =
    Number(prize.weight) > 0 || (prize.pity_every != null && prize.pity_every > 0);
  return prize.active && hasDrop && (prize.stock === null || prize.stock > 0);
}

function pickPrize(prizes) {
  const eligible = prizes.filter(isEligible);
  if (!eligible.length) return null;

  const guaranteed = eligible.filter((p) => currentPityChance(p) >= 1);
  const pool = guaranteed.length ? guaranteed : eligible;
  const weights = pool.map(effectiveWeight);
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return pool[0];

  let roll = Math.random() * total;
  for (let i = 0; i < pool.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export function mapPrize(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    weight: Number(row.weight),
    stock: row.stock == null ? null : Number(row.stock),
    active: Boolean(row.active),
    sort_order: Number(row.sort_order),
    color: row.color,
    instruction: row.instruction,
    pity_every: row.pity_every == null ? null : Number(row.pity_every),
    pity_counter: Number(row.pity_counter) || 0,
    created_at: row.created_at,
  };
}

function slugifyPrizeName(name) {
  const base = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'premio';
}

export async function createPrize(input = {}) {
  const sql = getSql();
  const name = String(input.name || '').trim();
  if (name.length < 2) return { error: 'Informe o nome do prêmio (mín. 2 caracteres).' };

  let slug = slugifyPrizeName(name);
  const slugClash = await sql`SELECT id FROM roleta_premios WHERE slug = ${slug} LIMIT 1`;
  if (slugClash[0]) {
    slug = `${slug}-${Date.now().toString(36).slice(-5)}`;
  }

  const countRows = await sql`SELECT COUNT(*)::int AS n FROM roleta_premios`;
  const n = Number(countRows[0]?.n) || 0;
  const sortOrder =
    input.sort_order != null ? Number(input.sort_order) : n + 1;

  const pityEvery =
    input.pity_every === null || input.pity_every === '' || input.pity_every === undefined
      ? 10
      : Math.max(1, Math.round(Number(input.pity_every)));

  const weight =
    input.weight != null
      ? Number(input.weight)
      : Math.round((100 / pityEvery) * 10) / 10;

  const stock =
    input.stock === null || input.stock === undefined || input.stock === ''
      ? null
      : Math.max(0, Math.round(Number(input.stock)));

  const palette = ['#FFC20E', '#009CDE'];
  const color = String(input.color || palette[n % 2] || '#FFC20E');
  const instruction = String(
    input.instruction || 'Retire seu prêmio no balcão da Antonov.',
  ).trim();
  const active = input.active == null ? true : Boolean(input.active);

  const rows = await sql`
    INSERT INTO roleta_premios (
      name, slug, weight, stock, active, sort_order, color, instruction, pity_every, pity_counter
    )
    VALUES (
      ${name},
      ${slug},
      ${weight},
      ${stock},
      ${active},
      ${sortOrder},
      ${color},
      ${instruction},
      ${pityEvery},
      0
    )
    RETURNING *
  `;
  return { prize: mapPrize(rows[0]) };
}

export async function deletePrize(id) {
  const sql = getSql();
  try {
    const rows = await sql`
      DELETE FROM roleta_premios
      WHERE id = ${id}
      RETURNING id
    `;
    if (!rows[0]) return { error: 'Prêmio não encontrado.' };
    return { ok: true };
  } catch (err) {
    const msg = String(err?.message || '');
    if (err?.code === '23503' || msg.includes('foreign key') || msg.includes('roleta_spins')) {
      return {
        error:
          'Não é possível excluir: já existem giros com este prêmio. Desative-o em vez de excluir.',
      };
    }
    throw err;
  }
}

export async function listActivePrizesPublic() {
  const sql = getSql();
  const rows = await sql`
    SELECT id, name, slug, weight, stock, active, sort_order, color, instruction, pity_every
    FROM roleta_premios
    WHERE active = TRUE
    ORDER BY sort_order ASC, name ASC
  `;
  /* A slice that pickPrize can never draw would be a lie on the wheel. */
  return rows
    .map((r) => mapPrize({ ...r, pity_counter: 0 }))
    .filter(isEligible)
    .map((p) => ({ ...p, pity_counter: undefined }));
}

export async function listAllPrizesAdmin() {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM roleta_premios
    ORDER BY sort_order ASC, name ASC
  `;
  return rows.map(mapPrize);
}

export async function getSettings() {
  const sql = getSql();
  const rows = await sql`
    SELECT
      id,
      whatsapp_cooldown_hours,
      result_timeout_seconds,
      allow_repeat_spin,
      layout_name,
      layout_type,
      COALESCE(length(layout_data), 0) AS layout_bytes
    FROM roleta_settings
    WHERE id = 1
  `;
  const row = rows[0];
  if (!row) {
    return {
      id: 1,
      whatsapp_cooldown_hours: 24,
      result_timeout_seconds: 15,
      allow_repeat_spin: false,
      has_layout: false,
      layout_name: null,
      layout_bytes: 0,
    };
  }
  const layoutBytes = Number(row.layout_bytes) || 0;
  return {
    id: 1,
    whatsapp_cooldown_hours: Number(row.whatsapp_cooldown_hours),
    result_timeout_seconds: Number(row.result_timeout_seconds),
    allow_repeat_spin: Boolean(row.allow_repeat_spin),
    has_layout: layoutBytes > 0,
    layout_name: row.layout_name || null,
    layout_bytes: layoutBytes,
  };
}

export async function getLayoutPublic() {
  const sql = getSql();
  const rows = await sql`
    SELECT layout_name, layout_type, layout_data
    FROM roleta_settings
    WHERE id = 1
  `;
  const row = rows[0];
  if (!row?.layout_data) return { layout_url: null };
  const type = row.layout_type || 'image/png';
  return {
    layout_url: `data:${type};base64,${row.layout_data}`,
    layout_name: row.layout_name || null,
  };
}

export async function updateSettings(patch) {
  const sql = getSql();
  const current = await getSettings();
  const next = {
    whatsapp_cooldown_hours:
      patch.whatsapp_cooldown_hours != null
        ? Number(patch.whatsapp_cooldown_hours)
        : current.whatsapp_cooldown_hours,
    result_timeout_seconds:
      patch.result_timeout_seconds != null
        ? Number(patch.result_timeout_seconds)
        : current.result_timeout_seconds,
    allow_repeat_spin:
      patch.allow_repeat_spin != null
        ? Boolean(patch.allow_repeat_spin)
        : current.allow_repeat_spin,
  };

  await sql`
    INSERT INTO roleta_settings (id, whatsapp_cooldown_hours, result_timeout_seconds, allow_repeat_spin)
    VALUES (1, ${next.whatsapp_cooldown_hours}, ${next.result_timeout_seconds}, ${next.allow_repeat_spin})
    ON CONFLICT (id) DO UPDATE SET
      whatsapp_cooldown_hours = EXCLUDED.whatsapp_cooldown_hours,
      result_timeout_seconds = EXCLUDED.result_timeout_seconds,
      allow_repeat_spin = EXCLUDED.allow_repeat_spin
  `;

  if (patch.layout !== undefined) {
    if (patch.layout === null) {
      await sql`
        UPDATE roleta_settings
        SET layout_name = NULL, layout_type = NULL, layout_data = NULL
        WHERE id = 1
      `;
    } else if (patch.layout?.data) {
      await sql`
        UPDATE roleta_settings
        SET
          layout_name = ${patch.layout.name || 'layout.png'},
          layout_type = ${patch.layout.type || 'image/png'},
          layout_data = ${patch.layout.data}
        WHERE id = 1
      `;
    }
  }

  return getSettings();
}

export async function updatePrize(id, patch) {
  const sql = getSql();
  const existingRows = await sql`SELECT * FROM roleta_premios WHERE id = ${id}`;
  const existing = existingRows[0];
  if (!existing) return { error: 'Prêmio não encontrado.' };

  const next = {
    name: patch.name != null ? String(patch.name).trim() : existing.name,
    weight: patch.weight != null ? Number(patch.weight) : Number(existing.weight),
    stock:
      patch.stock === undefined
        ? existing.stock
        : patch.stock === null || patch.stock === ''
          ? null
          : Number(patch.stock),
    active: patch.active != null ? Boolean(patch.active) : Boolean(existing.active),
    sort_order:
      patch.sort_order != null ? Number(patch.sort_order) : Number(existing.sort_order),
    color: patch.color != null ? String(patch.color) : existing.color,
    instruction:
      patch.instruction != null ? String(patch.instruction).trim() : existing.instruction,
    pity_every:
      patch.pity_every === undefined
        ? existing.pity_every
        : patch.pity_every === null || patch.pity_every === ''
          ? null
          : Math.max(1, Math.round(Number(patch.pity_every))),
    pity_counter:
      patch.pity_counter != null
        ? Math.max(0, Math.round(Number(patch.pity_counter)))
        : Number(existing.pity_counter) || 0,
  };

  if (!next.name || next.name.length < 2) return { error: 'Nome inválido.' };

  const rows = await sql`
    UPDATE roleta_premios SET
      name = ${next.name},
      weight = ${next.weight},
      stock = ${next.stock},
      active = ${next.active},
      sort_order = ${next.sort_order},
      color = ${next.color},
      instruction = ${next.instruction},
      pity_every = ${next.pity_every},
      pity_counter = ${next.pity_counter}
    WHERE id = ${id}
    RETURNING *
  `;
  return { prize: mapPrize(rows[0]) };
}

export async function createLead(name, whatsappRaw) {
  const sql = getSql();
  const nameClean = String(name || '').trim();
  const whatsapp = normalizeWhatsapp(whatsappRaw);

  if (nameClean.length < 2) return { error: 'Informe seu nome completo.' };
  if (whatsapp.length < 10 || whatsapp.length > 13) {
    return { error: 'Informe um WhatsApp válido com DDD.' };
  }

  const existing = await sql`
    SELECT id FROM roleta_leads
    WHERE whatsapp = ${whatsapp}
    LIMIT 1
  `;
  if (existing[0]) {
    return { error: 'Este WhatsApp já está cadastrado. Cada número pode participar apenas uma vez.' };
  }

  try {
    const rows = await sql`
      INSERT INTO roleta_leads (name, whatsapp)
      VALUES (${nameClean}, ${whatsapp})
      RETURNING *
    `;
    return {
      lead: {
        id: rows[0].id,
        name: rows[0].name,
        whatsapp: rows[0].whatsapp,
        cpf: rows[0].cpf || null,
        created_at: rows[0].created_at,
      },
    };
  } catch (err) {
    if (String(err?.message || '').includes('roleta_leads_whatsapp')) {
      return { error: 'Este WhatsApp já está cadastrado. Cada número pode participar apenas uma vez.' };
    }
    throw err;
  }
}

function normalizeCpf(input) {
  return String(input || '').replace(/\D/g, '');
}

export function isValidCpf(input) {
  const cpf = normalizeCpf(input);
  if (!/^\d{11}$/.test(cpf)) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let dig = (sum * 10) % 11;
  if (dig === 10) dig = 0;
  if (dig !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  dig = (sum * 10) % 11;
  if (dig === 10) dig = 0;
  return dig === Number(cpf[10]);
}

export async function spinPrize(leadId, deviceId = null) {
  const sql = getSql();
  const leads = await sql`SELECT * FROM roleta_leads WHERE id = ${leadId}`;
  const lead = leads[0];
  if (!lead) return { error: 'Lead não encontrado.' };

  if (lead.cpf) {
    return { error: 'Este participante já confirmou um prêmio com CPF.' };
  }

  const prior = await sql`
    SELECT id, status, prize_id
    FROM roleta_spins
    WHERE lead_id = ${leadId}
      AND status IN ('pending_cpf', 'confirmed')
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (prior[0]?.status === 'confirmed') {
    return { error: 'Este WhatsApp já participou.' };
  }
  if (prior[0]?.status === 'pending_cpf') {
    const prizeRows = await sql`SELECT * FROM roleta_premios WHERE id = ${prior[0].prize_id}`;
    return {
      prize: mapPrize(prizeRows[0]),
      spin_id: prior[0].id,
      needs_cpf: true,
    };
  }

  const all = (await sql`SELECT * FROM roleta_premios ORDER BY sort_order, name`).map(mapPrize);
  const winner = pickPrize(all);
  if (!winner) return { error: 'Nenhum prêmio disponível no momento.' };

  if (winner.stock != null) {
    const stockUpdate = await sql`
      UPDATE roleta_premios
      SET stock = stock - 1
      WHERE id = ${winner.id} AND stock > 0
      RETURNING id
    `;
    if (!stockUpdate[0]) {
      return { error: 'Estoque esgotado durante o sorteio. Tente novamente.' };
    }
  }

  const eligibleIds = new Set(all.filter(isEligible).map((p) => p.id));
  for (const p of all) {
    if (p.id === winner.id) {
      await sql`UPDATE roleta_premios SET pity_counter = 0 WHERE id = ${p.id}`;
    } else if (
      eligibleIds.has(p.id) &&
      p.pity_every != null &&
      p.pity_every > 0
    ) {
      await sql`
        UPDATE roleta_premios
        SET pity_counter = pity_counter + 1
        WHERE id = ${p.id}
      `;
    }
  }

  const spinRows = await sql`
    INSERT INTO roleta_spins (lead_id, prize_id, device_id, status)
    VALUES (${leadId}, ${winner.id}, ${deviceId}, 'pending_cpf')
    RETURNING id
  `;

  const refreshed = await sql`SELECT * FROM roleta_premios WHERE id = ${winner.id}`;
  return {
    prize: mapPrize(refreshed[0]),
    spin_id: spinRows[0].id,
    needs_cpf: true,
  };
}

export async function confirmSpinCpf(spinId, cpfRaw) {
  const sql = getSql();
  const cpf = normalizeCpf(cpfRaw);
  if (!isValidCpf(cpf)) {
    return { error: 'CPF inválido. Confira os dígitos e tente novamente.' };
  }

  const spins = await sql`
    SELECT s.*, l.cpf AS lead_cpf
    FROM roleta_spins s
    JOIN roleta_leads l ON l.id = s.lead_id
    WHERE s.id = ${spinId}
  `;
  const spin = spins[0];
  if (!spin) return { error: 'Giro não encontrado.' };
  if (spin.status === 'confirmed') {
    return { ok: true, already: true };
  }
  if (spin.status === 'cancelled') {
    return { error: 'Este giro foi cancelado. Tente novamente com outro cadastro.' };
  }
  if (spin.status !== 'pending_cpf') {
    return { error: 'Este giro não está aguardando CPF.' };
  }

  const cpfTaken = await sql`
    SELECT id FROM roleta_leads
    WHERE cpf = ${cpf}
      AND id <> ${spin.lead_id}
    LIMIT 1
  `;
  if (cpfTaken[0]) {
    await cancelPendingSpin(spin);
    return {
      error: 'Este CPF já resgatou um prêmio. Cada CPF pode girar a roleta apenas uma vez.',
      cancelled: true,
    };
  }

  try {
    await sql`
      UPDATE roleta_leads
      SET cpf = ${cpf}
      WHERE id = ${spin.lead_id}
    `;
    await sql`
      UPDATE roleta_spins
      SET status = 'confirmed', confirmed_at = NOW()
      WHERE id = ${spinId}
    `;
  } catch (err) {
    if (String(err?.message || '').includes('roleta_leads_cpf')) {
      await cancelPendingSpin(spin);
      return {
        error: 'Este CPF já resgatou um prêmio. Cada CPF pode girar a roleta apenas uma vez.',
        cancelled: true,
      };
    }
    throw err;
  }

  const prizeRows = await sql`SELECT * FROM roleta_premios WHERE id = ${spin.prize_id}`;
  return { ok: true, prize: mapPrize(prizeRows[0]), cpf };
}

async function cancelPendingSpin(spin) {
  const sql = getSql();
  await sql`
    UPDATE roleta_spins
    SET status = 'cancelled'
    WHERE id = ${spin.id} AND status = 'pending_cpf'
  `;
  const prizes = await sql`SELECT stock FROM roleta_premios WHERE id = ${spin.prize_id}`;
  if (prizes[0] && prizes[0].stock != null) {
    await sql`
      UPDATE roleta_premios
      SET stock = stock + 1
      WHERE id = ${spin.prize_id}
    `;
  }
}

export async function listSpins(limit = 200) {
  const sql = getSql();
  const rows = await sql`
    SELECT
      s.id,
      s.lead_id,
      s.prize_id,
      s.device_id,
      s.created_at,
      s.status,
      s.confirmed_at,
      l.name AS lead_name,
      l.whatsapp AS lead_whatsapp,
      l.cpf AS lead_cpf,
      p.name AS prize_name
    FROM roleta_spins s
    JOIN roleta_leads l ON l.id = s.lead_id
    JOIN roleta_premios p ON p.id = s.prize_id
    ORDER BY s.created_at DESC
    LIMIT ${Math.min(Math.max(Number(limit) || 200, 1), 1000)}
  `;
  return rows.map((r) => ({
    id: r.id,
    lead_id: r.lead_id,
    prize_id: r.prize_id,
    device_id: r.device_id,
    created_at: r.created_at,
    status: r.status,
    confirmed_at: r.confirmed_at,
    lead: { name: r.lead_name, whatsapp: r.lead_whatsapp, cpf: r.lead_cpf },
    prize: { name: r.prize_name },
  }));
}

export function suggestPityFromStock(prizes) {
  const active = prizes.filter((p) => p.active);
  const physical = active.filter((p) => p.stock != null && p.stock > 0);
  const totalStock = physical.reduce((sum, p) => sum + (p.stock ?? 0), 0);
  const avgStock = physical.length > 0 ? totalStock / physical.length : 0;
  const BASE_EVERY = 10;

  return prizes.map((p) => {
    if (!p.active) return { ...p, pity_every: null, weight: 0 };
    if (p.stock != null && p.stock > 0 && avgStock > 0) {
      const every = Math.min(60, Math.max(3, Math.round((BASE_EVERY * avgStock) / p.stock)));
      return { ...p, pity_every: every, weight: Math.round((100 / every) * 10) / 10 };
    }
    const digitalEvery =
      physical.length > 0
        ? Math.min(40, Math.max(8, Math.round(BASE_EVERY * 1.2)))
        : Math.max(6, active.length * 2);
    return { ...p, pity_every: digitalEvery, weight: Math.round((100 / digitalEvery) * 10) / 10 };
  });
}

export function equalizePity(prizes, every = 10) {
  return prizes.map((p) =>
    p.active
      ? { ...p, pity_every: every, weight: Math.round((100 / every) * 10) / 10 }
      : { ...p, pity_every: null, weight: 0 },
  );
}

export { currentPityChance, normalizeWhatsapp };
