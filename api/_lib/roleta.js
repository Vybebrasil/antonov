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

export async function listActivePrizesPublic() {
  const sql = getSql();
  const rows = await sql`
    SELECT id, name, slug, weight, stock, active, sort_order, color, instruction, pity_every
    FROM roleta_premios
    WHERE active = TRUE
    ORDER BY sort_order ASC, name ASC
  `;
  return rows.map((r) => ({
    ...mapPrize({ ...r, pity_counter: 0 }),
    pity_counter: undefined,
  }));
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
  const rows = await sql`SELECT * FROM roleta_settings WHERE id = 1`;
  const row = rows[0];
  if (!row) {
    return {
      id: 1,
      whatsapp_cooldown_hours: 24,
      result_timeout_seconds: 15,
      allow_repeat_spin: false,
    };
  }
  return {
    id: 1,
    whatsapp_cooldown_hours: Number(row.whatsapp_cooldown_hours),
    result_timeout_seconds: Number(row.result_timeout_seconds),
    allow_repeat_spin: Boolean(row.allow_repeat_spin),
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

  const settings = await getSettings();
  const existing = await sql`
    SELECT * FROM roleta_leads
    WHERE whatsapp = ${whatsapp}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (existing[0]) {
    const lastSpin = await sql`
      SELECT MAX(s.created_at) AS last_at
      FROM roleta_spins s
      JOIN roleta_leads l ON l.id = s.lead_id
      WHERE l.whatsapp = ${whatsapp}
    `;
    const lastAt = lastSpin[0]?.last_at;
    if (lastAt) {
      if (!settings.allow_repeat_spin) {
        return { error: 'Este WhatsApp já participou. Aguarde para girar novamente.' };
      }
      const hours =
        (Date.now() - new Date(lastAt).getTime()) / (1000 * 60 * 60);
      if (hours < settings.whatsapp_cooldown_hours) {
        return {
          error: `Este WhatsApp já girou recentemente. Tente em ${Math.ceil(settings.whatsapp_cooldown_hours - hours)}h.`,
        };
      }
    } else {
      return {
        lead: {
          id: existing[0].id,
          name: existing[0].name,
          whatsapp: existing[0].whatsapp,
          created_at: existing[0].created_at,
        },
      };
    }
  }

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
      created_at: rows[0].created_at,
    },
  };
}

export async function spinPrize(leadId, deviceId = null) {
  const sql = getSql();
  const leads = await sql`SELECT * FROM roleta_leads WHERE id = ${leadId}`;
  const lead = leads[0];
  if (!lead) return { error: 'Lead não encontrado.' };

  const settings = await getSettings();
  const lastSpin = await sql`
    SELECT MAX(s.created_at) AS last_at
    FROM roleta_spins s
    JOIN roleta_leads l ON l.id = s.lead_id
    WHERE l.whatsapp = ${lead.whatsapp}
  `;
  const lastAt = lastSpin[0]?.last_at;
  if (lastAt) {
    if (!settings.allow_repeat_spin) {
      return { error: 'Este WhatsApp já participou.' };
    }
    const hours = (Date.now() - new Date(lastAt).getTime()) / (1000 * 60 * 60);
    if (hours < settings.whatsapp_cooldown_hours) {
      return { error: 'Cooldown ativo para este WhatsApp.' };
    }
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

  await sql`
    INSERT INTO roleta_spins (lead_id, prize_id, device_id)
    VALUES (${leadId}, ${winner.id}, ${deviceId})
  `;

  const refreshed = await sql`SELECT * FROM roleta_premios WHERE id = ${winner.id}`;
  return { prize: mapPrize(refreshed[0]) };
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
      l.name AS lead_name,
      l.whatsapp AS lead_whatsapp,
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
    lead: { name: r.lead_name, whatsapp: r.lead_whatsapp },
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
