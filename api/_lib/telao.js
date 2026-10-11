import { getSql } from './db.js';
import {
  addDays,
  addMonths,
  asDate,
  parseWeekDays,
  playlistHash,
  programSchedule,
  selectOnAir,
  todayInBahia,
  uptimePct,
  whatsappHref,
} from './telao-playlist.js';

const KNOWN_PLAYER = '15a8cf02165316f9985afa918e935489';

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapCliente(row) {
  if (!row) return null;
  return {
    id: num(row.id),
    name: row.name,
    document: row.document || '',
    contact_name: row.contact_name || '',
    email: row.email || '',
    whatsapp: row.whatsapp || '',
    notes: row.notes || '',
    partner_id: num(row.partner_id),
    partner_name: row.partner_name || null,
    status: row.status,
    created_at: row.created_at,
  };
}

function mapContrato(row) {
  if (!row) return null;
  const ends = asDate(row.ends_on);
  const today = todayInBahia();
  return {
    id: num(row.id),
    cliente_id: num(row.cliente_id),
    cliente_name: row.cliente_name || null,
    cliente_whatsapp: row.cliente_whatsapp || '',
    title: row.title || '',
    starts_on: asDate(row.starts_on),
    ends_on: ends,
    price: num(row.price) || 0,
    payment_method: row.payment_method || '',
    insercoes_por_ciclo: num(row.insercoes_por_ciclo) || 1,
    auto_renew: Boolean(row.auto_renew),
    cycle_months: num(row.cycle_months) || 1,
    status: row.status,
    notes: row.notes || '',
    ending_soon: row.status === 'ativo' && ends >= today && ends <= addDays(today, 7),
    whatsapp_url: whatsappHref(row.cliente_whatsapp, `Olá, o contrato de telão da Antonov encerra em ${ends}.`),
  };
}

function mapPagamento(row) {
  if (!row) return null;
  return {
    id: num(row.id),
    contrato_id: num(row.contrato_id),
    due_on: asDate(row.due_on),
    amount: num(row.amount) || 0,
    paid_on: asDate(row.paid_on),
    method: row.method || '',
    status: row.status,
    notes: row.notes || '',
  };
}

function mapCriativo(row) {
  if (!row) return null;
  return {
    id: row.id,
    contrato_id: num(row.contrato_id),
    cliente_id: num(row.cliente_id),
    cliente_name: row.cliente_name || null,
    contrato_status: row.contrato_status || null,
    contrato_starts: asDate(row.contrato_starts),
    contrato_ends: asDate(row.contrato_ends),
    contrato_deleted: row.contrato_deleted || null,
    insercoes_por_ciclo: num(row.insercoes_por_ciclo) || 1,
    name: row.name,
    kind: row.kind,
    storage_path: row.storage_path,
    public_url: row.public_url,
    size_bytes: num(row.size_bytes) || 0,
    md5: row.md5,
    width: num(row.width),
    height: num(row.height),
    duration_ms: num(row.duration_ms) || 0,
    position: num(row.position) || 0,
    starts_on: asDate(row.starts_on),
    ends_on: asDate(row.ends_on),
    active: Boolean(row.active),
    approved: Boolean(row.approved),
    institutional: Boolean(row.institutional),
    deleted_at: row.deleted_at || null,
  };
}

export async function getPlayer() {
  const sql = getSql();
  const preferred = String(process.env.NOVACLOUD_PLAYER_ID || '').trim();
  const rows = preferred
    ? await sql`SELECT * FROM telao_players WHERE player_id = ${preferred} LIMIT 1`
    : await sql`SELECT * FROM telao_players ORDER BY id LIMIT 1`;
  const row = rows[0] || (await sql`SELECT * FROM telao_players WHERE player_id = ${KNOWN_PLAYER} LIMIT 1`)[0];
  if (!row && !preferred) return null;
  return {
    player_id: row?.player_id || preferred,
    name: row?.name || 'Telão',
    sn: row?.sn || null,
    width: num(row?.width) || 400,
    height: num(row?.height) || 400,
    online: row?.online == null ? null : Boolean(row.online),
    last_seen_at: row?.last_seen_at || null,
    ip: row?.ip || null,
    firmware: row?.firmware || null,
    product_name: row?.product_name || null,
  };
}

export async function listClientes() {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT c.*, p.name AS partner_name
      FROM telao_clientes c
      LEFT JOIN partners p ON p.id = c.partner_id AND p.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
      ORDER BY c.name
    `;
    return rows.map(mapCliente);
  } catch {
    const rows = await sql`SELECT * FROM telao_clientes WHERE deleted_at IS NULL ORDER BY name`;
    return rows.map(mapCliente);
  }
}

export async function listPartnerOptions() {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT id, name FROM partners
      WHERE deleted_at IS NULL
      ORDER BY name
    `;
    return rows.map((row) => ({ id: num(row.id), name: row.name }));
  } catch {
    return [];
  }
}

export async function createCliente(input) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO telao_clientes (name, document, contact_name, email, whatsapp, notes, partner_id, status)
    VALUES (
      ${input.name}, ${input.document}, ${input.contact_name}, ${input.email},
      ${input.whatsapp}, ${input.notes}, ${input.partner_id}, ${input.status}
    )
    RETURNING *
  `;
  return mapCliente(rows[0]);
}

export async function updateCliente(id, input) {
  const sql = getSql();
  const rows = await sql`
    UPDATE telao_clientes SET
      name = ${input.name},
      document = ${input.document},
      contact_name = ${input.contact_name},
      email = ${input.email},
      whatsapp = ${input.whatsapp},
      notes = ${input.notes},
      partner_id = ${input.partner_id},
      status = ${input.status},
      updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `;
  return mapCliente(rows[0]);
}

export async function deleteCliente(id) {
  const sql = getSql();
  const [{ n }] = await sql`
    SELECT COUNT(*)::int AS n FROM telao_contratos
    WHERE cliente_id = ${id} AND deleted_at IS NULL AND status IN ('rascunho', 'ativo', 'pausado')
  `;
  if (n > 0) {
    const error = new Error('Encerre ou cancele os contratos deste cliente antes de excluir.');
    error.status = 409;
    throw error;
  }
  const rows = await sql`
    UPDATE telao_clientes SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;
  return rows[0] || null;
}

export async function listContratos(clienteId) {
  const sql = getSql();
  const rows = clienteId
    ? await sql`
      SELECT ct.*, c.name AS cliente_name, c.whatsapp AS cliente_whatsapp
      FROM telao_contratos ct
      JOIN telao_clientes c ON c.id = ct.cliente_id
      WHERE ct.deleted_at IS NULL AND ct.cliente_id = ${clienteId}
      ORDER BY ct.starts_on DESC
    `
    : await sql`
      SELECT ct.*, c.name AS cliente_name, c.whatsapp AS cliente_whatsapp
      FROM telao_contratos ct
      JOIN telao_clientes c ON c.id = ct.cliente_id
      WHERE ct.deleted_at IS NULL
      ORDER BY ct.starts_on DESC
    `;
  return rows.map(mapContrato);
}

export async function createContrato(input) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO telao_contratos (
      cliente_id, title, starts_on, ends_on, price, payment_method,
      insercoes_por_ciclo, auto_renew, cycle_months, status, notes
    ) VALUES (
      ${input.cliente_id}, ${input.title}, ${input.starts_on}, ${input.ends_on}, ${input.price},
      ${input.payment_method}, ${input.insercoes_por_ciclo}, ${input.auto_renew},
      ${input.cycle_months}, ${input.status}, ${input.notes}
    )
    RETURNING *
  `;
  const contrato = rows[0];
  if (input.parcelas > 0) {
    const amount = Math.round((input.price / input.parcelas) * 100) / 100;
    for (let i = 0; i < input.parcelas; i += 1) {
      const value = i === input.parcelas - 1
        ? Math.round((input.price - amount * (input.parcelas - 1)) * 100) / 100
        : amount;
      await sql`
        INSERT INTO telao_pagamentos (contrato_id, due_on, amount, method, status)
        VALUES (${contrato.id}, ${addMonths(input.starts_on, i)}, ${value}, ${input.payment_method}, 'pendente')
      `;
    }
  }
  const full = await listContratos(input.cliente_id);
  return full.find((item) => item.id === num(contrato.id)) || mapContrato(contrato);
}

export async function updateContrato(id, input) {
  const sql = getSql();
  const rows = await sql`
    UPDATE telao_contratos SET
      title = ${input.title},
      starts_on = ${input.starts_on},
      ends_on = ${input.ends_on},
      price = ${input.price},
      payment_method = ${input.payment_method},
      insercoes_por_ciclo = ${input.insercoes_por_ciclo},
      auto_renew = ${input.auto_renew},
      cycle_months = ${input.cycle_months},
      status = ${input.status},
      notes = ${input.notes},
      updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `;
  return rows[0] ? (await listContratos(num(rows[0].cliente_id))).find((item) => item.id === num(id)) : null;
}

export async function deleteContrato(id) {
  const sql = getSql();
  const rows = await sql`
    UPDATE telao_contratos SET deleted_at = NOW(), status = 'cancelado', updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;
  return rows[0] || null;
}

export async function listPagamentos(contratoId) {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM telao_pagamentos
    WHERE contrato_id = ${contratoId}
    ORDER BY due_on
  `;
  return rows.map(mapPagamento);
}

export async function createPagamento(input) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO telao_pagamentos (contrato_id, due_on, amount, paid_on, method, status, notes)
    VALUES (${input.contrato_id}, ${input.due_on}, ${input.amount}, ${input.paid_on}, ${input.method}, ${input.status}, ${input.notes})
    RETURNING *
  `;
  return mapPagamento(rows[0]);
}

export async function updatePagamento(id, input) {
  const sql = getSql();
  const rows = await sql`
    UPDATE telao_pagamentos SET
      due_on = ${input.due_on},
      amount = ${input.amount},
      paid_on = ${input.paid_on},
      method = ${input.method},
      status = ${input.status},
      notes = ${input.notes},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return mapPagamento(rows[0]);
}

export async function deletePagamento(id) {
  const sql = getSql();
  const rows = await sql`DELETE FROM telao_pagamentos WHERE id = ${id} RETURNING id`;
  return rows[0] || null;
}

export async function listCriativos() {
  const sql = getSql();
  const rows = await sql`
    SELECT cr.*, ct.status AS contrato_status, ct.starts_on AS contrato_starts, ct.ends_on AS contrato_ends,
           ct.deleted_at AS contrato_deleted, ct.insercoes_por_ciclo, cl.id AS cliente_id, cl.name AS cliente_name
    FROM telao_criativos cr
    LEFT JOIN telao_contratos ct ON ct.id = cr.contrato_id
    LEFT JOIN telao_clientes cl ON cl.id = ct.cliente_id
    WHERE cr.deleted_at IS NULL
    ORDER BY cr.position, cr.created_at
  `;
  return rows.map(mapCriativo);
}

export async function nextCreativePosition() {
  const sql = getSql();
  const [{ n }] = await sql`SELECT COALESCE(MAX(position), -1)::int AS n FROM telao_criativos WHERE deleted_at IS NULL`;
  return n + 1;
}

export async function createCriativo(input) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO telao_criativos (
      id, contrato_id, name, kind, storage_path, public_url, size_bytes, md5, width, height,
      duration_ms, position, starts_on, ends_on, active, approved, institutional
    ) VALUES (
      ${input.id}, ${input.contrato_id}, ${input.name}, ${input.kind}, ${input.storage_path},
      ${input.public_url}, ${input.size_bytes}, ${input.md5}, ${input.width}, ${input.height},
      ${input.duration_ms}, ${input.position}, ${input.starts_on}, ${input.ends_on},
      ${input.active}, ${input.approved}, ${input.institutional}
    )
    RETURNING id
  `;
  const all = await listCriativos();
  return all.find((item) => item.id === rows[0].id) || null;
}

export async function updateCriativo(id, input) {
  const sql = getSql();
  const rows = await sql`
    UPDATE telao_criativos SET
      contrato_id = ${input.contrato_id},
      name = ${input.name},
      duration_ms = ${input.duration_ms},
      starts_on = ${input.starts_on},
      ends_on = ${input.ends_on},
      active = ${input.active},
      approved = ${input.approved},
      institutional = ${input.institutional},
      updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;
  if (!rows[0]) return null;
  const all = await listCriativos();
  return all.find((item) => item.id === id) || null;
}

export async function deleteCriativo(id) {
  const sql = getSql();
  const rows = await sql`
    UPDATE telao_criativos SET deleted_at = NOW(), active = FALSE, updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;
  return rows[0] || null;
}

export async function reorderCriativos(ids) {
  const sql = getSql();
  for (let i = 0; i < ids.length; i += 1) {
    await sql`UPDATE telao_criativos SET position = ${i}, updated_at = NOW() WHERE id = ${ids[i]} AND deleted_at IS NULL`;
  }
}

export async function playlistFor(today = todayInBahia()) {
  const [creatives, settings] = await Promise.all([listCriativos(), getSettings()]);
  const selected = selectOnAir(creatives, today, { institutionalFallback: settings.institutional_fallback });
  return { today, creatives, settings, ...selected };
}

let settingsShapeReady = false;

async function ensureSettingsShape() {
  if (settingsShapeReady) return;
  const sql = getSql();
  await sql`ALTER TABLE telao_settings ADD COLUMN IF NOT EXISTS default_duration_ms INT NOT NULL DEFAULT 10000`;
  await sql`ALTER TABLE telao_settings ADD COLUMN IF NOT EXISTS institutional_fallback BOOLEAN NOT NULL DEFAULT TRUE`;
  await sql`ALTER TABLE telao_settings ADD COLUMN IF NOT EXISTS week_days TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6'`;
  await sql`ALTER TABLE telao_settings ADD COLUMN IF NOT EXISTS contract_notices BOOLEAN NOT NULL DEFAULT TRUE`;
  await sql`ALTER TABLE telao_settings ADD COLUMN IF NOT EXISTS auto_publish BOOLEAN NOT NULL DEFAULT TRUE`;
  settingsShapeReady = true;
}

export async function getSettings() {
  await ensureSettingsShape();
  const sql = getSql();
  const rows = await sql`SELECT * FROM telao_settings WHERE id = 1`;
  const row = rows[0] || {};
  return {
    open_time: String(row.open_time || '06:00:00').slice(0, 8),
    close_time: String(row.close_time || '23:00:00').slice(0, 8),
    alert_after_minutes: num(row.alert_after_minutes) || 15,
    alert_emails: row.alert_emails || '',
    default_duration_ms: num(row.default_duration_ms) || 10000,
    institutional_fallback: row.institutional_fallback !== false,
    week_days: parseWeekDays(row.week_days).join(','),
    contract_notices: row.contract_notices !== false,
    auto_publish: row.auto_publish !== false,
  };
}

export async function updateSettings(input) {
  await ensureSettingsShape();
  const sql = getSql();
  await sql`
    UPDATE telao_settings SET
      open_time = ${input.open_time},
      close_time = ${input.close_time},
      alert_after_minutes = ${input.alert_after_minutes},
      alert_emails = ${input.alert_emails},
      default_duration_ms = ${input.default_duration_ms},
      institutional_fallback = ${input.institutional_fallback},
      week_days = ${input.week_days},
      contract_notices = ${input.contract_notices},
      auto_publish = ${input.auto_publish},
      updated_at = NOW()
    WHERE id = 1
  `;
  return getSettings();
}

export async function updatePlayerDisplay({ name, width, height }) {
  const sql = getSql();
  const current = await getPlayer();
  if (!current?.player_id) {
    const error = new Error('Player do telão não configurado.');
    error.status = 409;
    throw error;
  }
  const rows = await sql`SELECT id FROM telao_players WHERE player_id = ${current.player_id} LIMIT 1`;
  if (rows[0]) {
    await sql`
      UPDATE telao_players SET name = ${name}, width = ${width}, height = ${height}
      WHERE player_id = ${current.player_id}
    `;
  } else {
    await sql`
      INSERT INTO telao_players (player_id, name, width, height)
      VALUES (${current.player_id}, ${name}, ${width}, ${height})
    `;
  }
  return getPlayer();
}

export async function insertPublicacao(entry) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO telao_publicacoes (
      trigger, user_id, creatives_count, program_hash, request, response, http_status, ok, error
    ) VALUES (
      ${entry.trigger}, ${entry.user_id}, ${entry.creatives_count}, ${entry.program_hash},
      ${JSON.stringify(entry.request)}::jsonb, ${entry.response ? JSON.stringify(entry.response) : null}::jsonb,
      ${entry.http_status}, ${entry.ok}, ${entry.error}
    )
    RETURNING id, created_at
  `;
  return rows[0];
}

export async function listPublicacoes(limit = 30) {
  const sql = getSql();
  const rows = await sql`
    SELECT id, created_at, trigger, user_id, creatives_count, program_hash, ok, http_status,
           confirmado_em, error, request
    FROM telao_publicacoes
    ORDER BY id DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: num(row.id),
    created_at: row.created_at,
    trigger: row.trigger,
    creatives_count: num(row.creatives_count) || 0,
    program_hash: row.program_hash,
    ok: Boolean(row.ok),
    http_status: num(row.http_status),
    confirmado_em: row.confirmado_em,
    error: row.error || null,
    labels: row.request?.labels || [],
  }));
}

export async function lastOkPublicacao() {
  const sql = getSql();
  const rows = await sql`
    SELECT id, program_hash, request, created_at, confirmado_em
    FROM telao_publicacoes
    WHERE ok = TRUE
    ORDER BY id DESC
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function noteLatestDownload(message) {
  const sql = getSql();
  const rows = await sql`
    UPDATE telao_publicacoes SET error = ${String(message || '').slice(0, 500)}
    WHERE id = (
      SELECT id FROM telao_publicacoes WHERE ok = TRUE ORDER BY id DESC LIMIT 1
    )
    RETURNING id
  `;
  return rows[0] || null;
}

export async function confirmLatestPublicacao() {
  const sql = getSql();
  const rows = await sql`
    UPDATE telao_publicacoes SET confirmado_em = NOW()
    WHERE id = (
      SELECT id FROM telao_publicacoes WHERE ok = TRUE AND confirmado_em IS NULL ORDER BY id DESC LIMIT 1
    )
    RETURNING id
  `;
  return rows[0] || null;
}

export async function listPublicacoesForReport(from, to) {
  const sql = getSql();
  const rows = await sql`
    SELECT created_at, request
    FROM telao_publicacoes
    WHERE ok = TRUE AND created_at < (${to}::date + INTERVAL '1 day')
    ORDER BY created_at
  `;
  return rows
    .filter((row) => row.request?.labels?.length)
    .map((row) => ({ created_at: row.created_at, labels: row.request.labels }));
}

export async function insertCallback(kind, payload) {
  const sql = getSql();
  await sql`
    INSERT INTO telao_callbacks (kind, payload)
    VALUES (${kind}, ${JSON.stringify(payload || {})}::jsonb)
  `;
}

export async function listCallbacks(limit = 30) {
  const sql = getSql();
  return sql`
    SELECT id, kind, payload, created_at FROM telao_callbacks
    ORDER BY id DESC LIMIT ${limit}
  `;
}

export async function lastPublicacaoDetail() {
  const sql = getSql();
  const rows = await sql`
    SELECT id, created_at, ok, http_status, error, confirmado_em, request, response
    FROM telao_publicacoes ORDER BY id DESC LIMIT 1
  `;
  return rows[0] || null;
}

export async function insertCaptura({ playerId, url, playerTime, payload }) {
  const sql = getSql();
  await sql`
    INSERT INTO telao_capturas (player_id, url, player_time, payload)
    VALUES (${playerId}, ${url}, ${playerTime}, ${JSON.stringify(payload || {})}::jsonb)
  `;
}

export async function latestCaptura() {
  const sql = getSql();
  const rows = await sql`SELECT * FROM telao_capturas ORDER BY id DESC LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  return { created_at: row.created_at, url: row.url, player_time: row.player_time };
}

export async function insertComando(entry) {
  const sql = getSql();
  await sql`
    INSERT INTO telao_comandos (user_id, action, request, response, ok)
    VALUES (
      ${entry.user_id}, ${entry.action},
      ${JSON.stringify(entry.request || {})}::jsonb,
      ${entry.response ? JSON.stringify(entry.response) : null}::jsonb,
      ${entry.ok}
    )
  `;
}

export async function listStatusLog(sinceIso) {
  const sql = getSql();
  return sql`SELECT online, checked_at FROM telao_status_log WHERE checked_at >= ${sinceIso} ORDER BY checked_at`;
}

export async function recordCheck(check) {
  const sql = getSql();
  await sql`
    INSERT INTO telao_status_log (player_id, online, ip, last_online_time, raw)
    VALUES (${check.playerId}, ${check.online}, ${check.ip}, ${check.lastOnlineTime}, ${JSON.stringify(check.raw || {})}::jsonb)
  `;
  await sql`
    UPDATE telao_players SET
      online = ${check.online},
      last_seen_at = NOW(),
      ip = ${check.ip},
      firmware = ${check.firmware},
      product_name = ${check.productName},
      width = COALESCE(${check.width}, width),
      height = COALESCE(${check.height}, height),
      name = COALESCE(${check.name}, name)
    WHERE player_id = ${check.playerId}
  `;
  const open = await sql`
    SELECT * FROM telao_incidentes
    WHERE player_id = ${check.playerId} AND ended_at IS NULL
    ORDER BY id DESC LIMIT 1
  `;
  if (!check.online && !open[0]) {
    const created = await sql`
      INSERT INTO telao_incidentes (player_id) VALUES (${check.playerId}) RETURNING *
    `;
    return { online: false, incident: created[0], justOpened: true, justClosed: false };
  }
  if (check.online && open[0]) {
    const closed = await sql`
      UPDATE telao_incidentes SET ended_at = NOW() WHERE id = ${open[0].id} RETURNING *
    `;
    return { online: true, incident: closed[0], justOpened: false, justClosed: true };
  }
  return { online: check.online, incident: open[0] || null, justOpened: false, justClosed: false };
}

export async function markIncidentAlert(id, field) {
  const sql = getSql();
  if (field === 'resolved') {
    await sql`UPDATE telao_incidentes SET resolved_alerted_at = NOW() WHERE id = ${id}`;
  } else {
    await sql`UPDATE telao_incidentes SET alerted_at = NOW() WHERE id = ${id}`;
  }
}

export async function listIncidentes(limit = 20) {
  const sql = getSql();
  const rows = await sql`SELECT * FROM telao_incidentes ORDER BY id DESC LIMIT ${limit}`;
  return rows.map((row) => ({
    id: num(row.id),
    started_at: row.started_at,
    ended_at: row.ended_at,
    alerted_at: row.alerted_at,
  }));
}

export async function pruneStatusLog() {
  const sql = getSql();
  await sql`DELETE FROM telao_status_log WHERE checked_at < NOW() - INTERVAL '90 days'`;
}

export async function refreshOperational() {
  const sql = getSql();
  const today = todayInBahia();
  const renewed = [];
  const due = await sql`
    SELECT * FROM telao_contratos
    WHERE deleted_at IS NULL AND auto_renew = TRUE AND status = 'ativo' AND ends_on < ${today}
  `;
  for (const row of due) {
    const nextEnd = addMonths(asDate(row.ends_on), num(row.cycle_months) || 1);
    const dueOn = addDays(asDate(row.ends_on), 1);
    await sql`UPDATE telao_contratos SET ends_on = ${nextEnd}, updated_at = NOW() WHERE id = ${row.id}`;
    await sql`
      INSERT INTO telao_pagamentos (contrato_id, due_on, amount, method, status)
      VALUES (${row.id}, ${dueOn}, ${row.price}, ${row.payment_method}, 'pendente')
    `;
    renewed.push(num(row.id));
  }
  const expired = await sql`
    UPDATE telao_contratos SET status = 'vencido', updated_at = NOW()
    WHERE deleted_at IS NULL AND status = 'ativo' AND ends_on < ${today}
    RETURNING id
  `;
  await sql`
    UPDATE telao_contratos SET status = 'ativo', updated_at = NOW()
    WHERE deleted_at IS NULL AND status = 'vencido' AND starts_on <= ${today} AND ends_on >= ${today}
  `;
  const late = await sql`
    UPDATE telao_pagamentos SET status = 'atrasado', updated_at = NOW()
    WHERE status = 'pendente' AND due_on < ${today}
    RETURNING id
  `;
  return { renewed, expired: expired.map((row) => num(row.id)), late: late.map((row) => num(row.id)) };
}

export async function contractsEndingOn(date) {
  const sql = getSql();
  const rows = await sql`
    SELECT ct.*, c.name AS cliente_name, c.email AS cliente_email, c.whatsapp AS cliente_whatsapp
    FROM telao_contratos ct
    JOIN telao_clientes c ON c.id = ct.cliente_id
    WHERE ct.deleted_at IS NULL AND ct.status = 'ativo' AND ct.ends_on = ${date}
  `;
  return rows;
}

export async function paymentsDueOn(date) {
  const sql = getSql();
  return sql`
    SELECT pg.*, c.name AS cliente_name, c.email AS cliente_email, c.whatsapp AS cliente_whatsapp
    FROM telao_pagamentos pg
    JOIN telao_contratos ct ON ct.id = pg.contrato_id
    JOIN telao_clientes c ON c.id = ct.cliente_id
    WHERE pg.status = 'pendente' AND pg.due_on = ${date} AND ct.deleted_at IS NULL
  `;
}

export async function paymentsNewlyLate() {
  const sql = getSql();
  return sql`
    SELECT pg.*, c.name AS cliente_name, c.email AS cliente_email
    FROM telao_pagamentos pg
    JOIN telao_contratos ct ON ct.id = pg.contrato_id
    JOIN telao_clientes c ON c.id = ct.cliente_id
    WHERE pg.status = 'atrasado' AND ct.deleted_at IS NULL
  `;
}

export async function avisoExists(kind, refId) {
  const sql = getSql();
  const rows = await sql`SELECT id FROM telao_avisos WHERE kind = ${kind} AND ref_id = ${refId} LIMIT 1`;
  return Boolean(rows[0]);
}

export async function markAviso(kind, refId, sentOn) {
  const sql = getSql();
  await sql`
    INSERT INTO telao_avisos (kind, ref_id, sent_on)
    VALUES (${kind}, ${refId}, ${sentOn})
    ON CONFLICT (kind, ref_id, channel) DO NOTHING
  `;
}

export async function getVisao() {
  const today = todayInBahia();
  const [player, settings, playlist, publicacoes, incidentes, contratos] = await Promise.all([
    getPlayer(),
    getSettings(),
    playlistFor(today),
    listPublicacoes(1),
    listIncidentes(1),
    listContratos(),
  ]);
  const sql = getSql();
  const late = await sql`
    SELECT COUNT(*)::int AS n FROM telao_pagamentos pg
    JOIN telao_contratos ct ON ct.id = pg.contrato_id
    WHERE pg.status = 'atrasado' AND ct.deleted_at IS NULL
  `;
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const checks = await listStatusLog(since7);
  const now = Date.now();
  return {
    today,
    player,
    settings,
    playlist: {
      count: playlist.pages.length,
      fallback: playlist.fallback,
      note: playlist.note || '',
      hash: playlistHash(playlist.pages, programSchedule(settings)),
      pages: playlist.pages.map((page) => ({
        id: page.id,
        name: page.name,
        kind: page.kind,
        cliente_name: page.cliente_name,
        institutional: page.institutional,
      })),
    },
    lastPublish: publicacoes[0] || null,
    openIncident: incidentes[0] && !incidentes[0].ended_at ? incidentes[0] : null,
    ending: contratos.filter((item) => item.ending_soon),
    latePayments: late[0]?.n || 0,
    uptime24h: uptimePct(checks, now - 86400000),
    uptime7d: uptimePct(checks, now - 7 * 86400000),
  };
}
