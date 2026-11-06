import { randomUUID } from 'crypto';
import { json, adminCors, parseBody } from '../../api/_lib/admin-http.js';
import { getParceirosSession } from '../../api/_lib/parceiros-auth.js';
import { hasModule } from '../../api/_lib/access.js';
import { airBlockReason, aspectWarning, parseWeekDays, pictureOverSpec, todayInBahia } from '../../api/_lib/telao-playlist.js';
import { novacloudConfigured } from '../../api/_lib/telao-novacloud.js';
import { createSignedUpload, MAX_UPLOAD_BYTES, storageConfigured } from '../../api/_lib/telao-storage.js';
import {
  createCliente,
  createContrato,
  createCriativo,
  createPagamento,
  deleteCliente,
  deleteContrato,
  deleteCriativo,
  deletePagamento,
  getPlayer,
  getSettings,
  getVisao,
  lastPublicacaoDetail,
  latestCaptura,
  listCallbacks,
  listClientes,
  listContratos,
  listCriativos,
  listIncidentes,
  listPagamentos,
  listPartnerOptions,
  listPublicacoes,
  listStatusLog,
  nextCreativePosition,
  reorderCriativos,
  updateCliente,
  updateContrato,
  updateCriativo,
  updatePagamento,
  updatePlayerDisplay,
  updateSettings,
} from '../../api/_lib/telao.js';
import { previewPlaylist, publishNow, reportExhibitions, runControl, runTick } from '../../api/_lib/telao-jobs.js';
import { uptimePct } from '../../api/_lib/telao-playlist.js';

const CLIENTE_STATUS = new Set(['ativo', 'pausado', 'arquivado']);
const CONTRATO_STATUS = new Set(['rascunho', 'ativo', 'pausado', 'vencido', 'cancelado']);
const PAGAMENTO_STATUS = new Set(['pendente', 'pago', 'atrasado', 'cancelado']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function segments(req) {
  const raw = req.query?.path;
  if (typeof raw === 'string') return raw.split('/').filter(Boolean);
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return [];
}

async function settingsPayload() {
  const [settings, player] = await Promise.all([getSettings(), getPlayer()]);
  return {
    ...settings,
    player,
    novacloud: novacloudConfigured(),
    storage: storageConfigured(),
    callback: Boolean(String(process.env.SITE_URL || '').trim() && process.env.TELAO_CALLBACK_TOKEN),
    cron: Boolean(process.env.TELAO_CRON_SECRET || process.env.CRON_SECRET),
  };
}

function text(value, max) {
  const out = String(value || '').trim();
  return out.slice(0, max);
}

function optionalEmail(value) {
  const email = text(value, 160).toLowerCase();
  if (!email) return '';
  if (!EMAIL.test(email)) return { error: 'E-mail inválido.' };
  return email;
}

function dateOrEmpty(value, label, required = false) {
  const date = text(value, 10);
  if (!date) return required ? { error: `${label} é obrigatória.` } : '';
  if (!DATE.test(date)) return { error: `${label} inválida.` };
  return date;
}

function money(value) {
  const n = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return { error: 'Valor inválido.' };
  return Math.round(n * 100) / 100;
}

function fail(result) {
  return result && typeof result === 'object' && result.error;
}

async function requireStaff(req, res) {
  const session = await getParceirosSession(req);
  if (!session) {
    json(res, 401, { error: 'Não autenticado.' });
    return null;
  }
  if (session.mustChangePassword) {
    json(res, 403, { error: 'Troque a senha para continuar.', code: 'password_change_required' });
    return null;
  }
  if (session.role === 'parceiro' || !hasModule(session, 'telao')) {
    json(res, 403, { error: 'Sem permissão para o telão.' });
    return null;
  }
  return session;
}

function clienteInput(body, current = {}) {
  const name = text(body.name ?? current.name, 160);
  if (!name) return { error: 'Nome do cliente é obrigatório.' };
  const email = optionalEmail(body.email ?? current.email);
  if (fail(email)) return email;
  const status = body.status ?? current.status ?? 'ativo';
  if (!CLIENTE_STATUS.has(status)) return { error: 'Status de cliente inválido.' };
  const partner = body.partner_id === '' || body.partner_id == null
    ? (body.partner_id === '' ? null : (current.partner_id ?? null))
    : Number(body.partner_id);
  return {
    name,
    document: text(body.document ?? current.document, 40),
    contact_name: text(body.contact_name ?? current.contact_name, 160),
    email,
    whatsapp: text(body.whatsapp ?? current.whatsapp, 40),
    notes: text(body.notes ?? current.notes, 2000),
    partner_id: partner || null,
    status,
  };
}

function contratoInput(body, current = {}) {
  const clienteId = Number(body.cliente_id ?? current.cliente_id);
  if (!clienteId) return { error: 'Selecione o cliente.' };
  const starts = dateOrEmpty(body.starts_on ?? current.starts_on, 'Data de início', true);
  if (fail(starts)) return starts;
  const ends = dateOrEmpty(body.ends_on ?? current.ends_on, 'Data de fim', true);
  if (fail(ends)) return ends;
  if (ends < starts) return { error: 'A data de fim precisa ser igual ou posterior ao início.' };
  const price = money(body.price ?? current.price ?? 0);
  if (fail(price)) return price;
  const status = body.status ?? current.status ?? 'rascunho';
  if (!CONTRATO_STATUS.has(status)) return { error: 'Status de contrato inválido.' };
  const insercoes = Number(body.insercoes_por_ciclo ?? current.insercoes_por_ciclo ?? 1);
  if (!Number.isInteger(insercoes) || insercoes < 1 || insercoes > 120) {
    return { error: 'Vezes por hora: de 1 a 120.' };
  }
  const cycle = Number(body.cycle_months ?? current.cycle_months ?? 1);
  if (!Number.isInteger(cycle) || cycle < 1 || cycle > 36) return { error: 'Ciclo de renovação inválido.' };
  const parcelas = body.parcelas == null || body.parcelas === '' ? 0 : Number(body.parcelas);
  if (!Number.isInteger(parcelas) || parcelas < 0 || parcelas > 36) return { error: 'Número de parcelas inválido.' };
  return {
    cliente_id: clienteId,
    title: text(body.title ?? current.title, 160),
    starts_on: starts,
    ends_on: ends,
    price,
    payment_method: text(body.payment_method ?? current.payment_method, 40),
    insercoes_por_ciclo: insercoes,
    auto_renew: Boolean(body.auto_renew ?? current.auto_renew),
    cycle_months: cycle,
    status,
    notes: text(body.notes ?? current.notes, 2000),
    parcelas,
  };
}

function pagamentoInput(body, contratoId, current = {}) {
  const due = dateOrEmpty(body.due_on ?? current.due_on, 'Vencimento', true);
  if (fail(due)) return due;
  const amount = money(body.amount ?? current.amount);
  if (fail(amount)) return amount;
  const status = body.status ?? current.status ?? 'pendente';
  if (!PAGAMENTO_STATUS.has(status)) return { error: 'Status de pagamento inválido.' };
  let paid = dateOrEmpty(body.paid_on ?? current.paid_on, 'Data de pagamento');
  if (fail(paid)) return paid;
  if (status === 'pago' && !paid) paid = todayInBahia();
  if (status !== 'pago') paid = paid || null;
  return {
    contrato_id: contratoId || current.contrato_id,
    due_on: due,
    amount,
    paid_on: paid || null,
    method: text(body.method ?? current.method, 40),
    status,
    notes: text(body.notes ?? current.notes, 1000),
  };
}

function criativoPatch(body, current = {}) {
  const institutional = Boolean(body.institutional ?? current.institutional);
  const name = text(body.name ?? current.name, 80);
  if (!name) return { error: 'Nome do criativo é obrigatório.' };
  const starts = dateOrEmpty(body.starts_on ?? current.starts_on, 'Início');
  if (fail(starts)) return starts;
  const ends = dateOrEmpty(body.ends_on ?? current.ends_on, 'Fim');
  if (fail(ends)) return ends;
  if (starts && ends && ends < starts) return { error: 'O fim do criativo é anterior ao início.' };
  const duration = Number(body.duration_ms ?? current.duration_ms ?? 10000);
  if (!Number.isInteger(duration) || duration < 0 || duration > 600000) return { error: 'Duração inválida.' };
  const contratoId = institutional ? null : Number(body.contrato_id ?? current.contrato_id);
  if (!institutional && !contratoId) return { error: 'Vincule o criativo a um contrato ou marque como institucional.' };
  return {
    contrato_id: contratoId || null,
    name,
    duration_ms: duration,
    starts_on: starts || null,
    ends_on: ends || null,
    active: body.active == null ? current.active !== false : Boolean(body.active),
    approved: body.approved == null ? Boolean(current.approved) : Boolean(body.approved),
    institutional,
  };
}

export default async function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  const session = await requireStaff(req, res);
  if (!session) return;
  const parts = segments(req);
  const body = parseBody(req) || {};

  try {
    if (parts.length === 0 && req.method === 'GET') {
      const visao = await getVisao();
      return json(res, 200, { ...visao, novacloud: novacloudConfigured(), storage: storageConfigured() });
    }
    if (parts[0] === 'status' && (req.method === 'GET' || req.method === 'POST')) {
      const result = await runTick();
      const player = await getPlayer();
      return json(res, 200, { ...result, player });
    }
    if (parts[0] === 'parceiros' && req.method === 'GET') {
      return json(res, 200, { parceiros: await listPartnerOptions() });
    }
    if (parts[0] === 'settings' && req.method === 'GET') return json(res, 200, await settingsPayload());
    if (parts[0] === 'settings' && req.method === 'PATCH') {
      const current = await getSettings();
      const player = await getPlayer();
      const open = text(body.open_time ?? current.open_time, 8);
      const close = text(body.close_time ?? current.close_time, 8);
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(open) || !/^\d{2}:\d{2}(:\d{2})?$/.test(close) || close <= open) {
        return json(res, 400, { error: 'Horário de funcionamento inválido.' });
      }
      const minutes = Number(body.alert_after_minutes ?? current.alert_after_minutes);
      if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) {
        return json(res, 400, { error: 'O alerta offline precisa ficar entre 5 e 240 minutos.' });
      }
      const seconds = Number(body.default_duration_seconds ?? Math.round((current.default_duration_ms || 10000) / 1000));
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 300) {
        return json(res, 400, { error: 'A duração padrão da imagem precisa ficar entre 1 e 300 segundos.' });
      }
      const weekDays = parseWeekDays(body.week_days ?? current.week_days);
      if (!weekDays.length) return json(res, 400, { error: 'Escolha ao menos um dia da semana.' });
      const name = text(body.player_name ?? player?.name, 80);
      const width = Number(body.width ?? player?.width);
      const height = Number(body.height ?? player?.height);
      if (!name) return json(res, 400, { error: 'Dê um nome ao telão.' });
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8000 || height > 8000) {
        return json(res, 400, { error: 'A resolução esperada é inválida.' });
      }
      await updatePlayerDisplay({ name, width, height });
      await updateSettings({
        open_time: open.length === 5 ? `${open}:00` : open,
        close_time: close.length === 5 ? `${close}:00` : close,
        alert_after_minutes: minutes,
        alert_emails: text(body.alert_emails ?? current.alert_emails, 500),
        default_duration_ms: seconds * 1000,
        institutional_fallback: Boolean(body.institutional_fallback ?? current.institutional_fallback),
        week_days: weekDays.join(','),
        contract_notices: Boolean(body.contract_notices ?? current.contract_notices),
        auto_publish: Boolean(body.auto_publish ?? current.auto_publish),
      });
      return json(res, 200, await settingsPayload());
    }
    if (parts[0] === 'clientes' && parts.length === 1 && req.method === 'GET') {
      return json(res, 200, { clientes: await listClientes() });
    }
    if (parts[0] === 'clientes' && parts.length === 1 && req.method === 'POST') {
      const input = clienteInput(body);
      if (fail(input)) return json(res, 400, input);
      return json(res, 201, { cliente: await createCliente(input) });
    }
    if (parts[0] === 'clientes' && parts.length === 2 && req.method === 'PATCH') {
      const current = (await listClientes()).find((item) => String(item.id) === parts[1]);
      if (!current) return json(res, 404, { error: 'Cliente não encontrado.' });
      const input = clienteInput(body, current);
      if (fail(input)) return json(res, 400, input);
      return json(res, 200, { cliente: await updateCliente(current.id, input) });
    }
    if (parts[0] === 'clientes' && parts.length === 2 && req.method === 'DELETE') {
      const deleted = await deleteCliente(Number(parts[1]));
      if (!deleted) return json(res, 404, { error: 'Cliente não encontrado.' });
      return json(res, 200, { ok: true });
    }
    if (parts[0] === 'contratos' && parts.length === 1 && req.method === 'GET') {
      return json(res, 200, { contratos: await listContratos(req.query?.cliente_id || null) });
    }
    if (parts[0] === 'contratos' && parts.length === 1 && req.method === 'POST') {
      const input = contratoInput(body);
      if (fail(input)) return json(res, 400, input);
      return json(res, 201, { contrato: await createContrato(input) });
    }
    if (parts[0] === 'contratos' && parts.length === 2 && req.method === 'PATCH') {
      const current = (await listContratos()).find((item) => String(item.id) === parts[1]);
      if (!current) return json(res, 404, { error: 'Contrato não encontrado.' });
      const input = contratoInput(body, current);
      if (fail(input)) return json(res, 400, input);
      return json(res, 200, { contrato: await updateContrato(current.id, input) });
    }
    if (parts[0] === 'contratos' && parts.length === 2 && req.method === 'DELETE') {
      const deleted = await deleteContrato(Number(parts[1]));
      if (!deleted) return json(res, 404, { error: 'Contrato não encontrado.' });
      return json(res, 200, { ok: true });
    }
    if (parts[0] === 'contratos' && parts[2] === 'pagamentos' && req.method === 'GET') {
      return json(res, 200, { pagamentos: await listPagamentos(Number(parts[1])) });
    }
    if (parts[0] === 'contratos' && parts[2] === 'pagamentos' && req.method === 'POST') {
      const input = pagamentoInput(body, Number(parts[1]));
      if (fail(input)) return json(res, 400, input);
      return json(res, 201, { pagamento: await createPagamento(input) });
    }
    if (parts[0] === 'pagamentos' && parts.length === 2 && req.method === 'PATCH') {
      const contratos = await listContratos();
      let current = null;
      for (const contrato of contratos) {
        const items = await listPagamentos(contrato.id);
        current = items.find((item) => String(item.id) === parts[1]);
        if (current) break;
      }
      if (!current) return json(res, 404, { error: 'Pagamento não encontrado.' });
      const input = pagamentoInput(body, current.contrato_id, current);
      if (fail(input)) return json(res, 400, input);
      return json(res, 200, { pagamento: await updatePagamento(current.id, input) });
    }
    if (parts[0] === 'pagamentos' && parts.length === 2 && req.method === 'DELETE') {
      const deleted = await deletePagamento(Number(parts[1]));
      if (!deleted) return json(res, 404, { error: 'Pagamento não encontrado.' });
      return json(res, 200, { ok: true });
    }
    if (parts[0] === 'criativos' && parts.length === 1 && req.method === 'GET') {
      const today = todayInBahia();
      const player = await getPlayer();
      const criativos = (await listCriativos()).map((item) => ({
        ...item,
        block_reason: airBlockReason(item, today),
        aspect_warning: [pictureOverSpec(item.width, item.height), aspectWarning(item.width, item.height, player?.width, player?.height)].filter(Boolean).join(' '),
      }));
      return json(res, 200, { criativos, contratos: await listContratos() });
    }
    if (parts[0] === 'criativos' && parts.length === 1 && req.method === 'POST') {
      const id = UUID.test(body.id || '') ? body.id : randomUUID();
      const kind = body.kind === 'VIDEO' ? 'VIDEO' : 'PICTURE';
      const md5 = text(body.md5, 32).toLowerCase();
      if (!/^[a-f0-9]{32}$/.test(md5)) return json(res, 400, { error: 'MD5 inválido.' });
      const size = Number(body.size_bytes);
      if (!Number.isInteger(size) || size <= 0) return json(res, 400, { error: 'Tamanho do arquivo inválido.' });
      const settings = await getSettings();
      const patch = criativoPatch({ ...body, duration_ms: body.duration_ms ?? (kind === 'VIDEO' ? 0 : settings.default_duration_ms) }, { active: true, approved: false });
      if (fail(patch)) return json(res, 400, patch);
      if (!text(body.storage_path, 300) || !text(body.public_url, 500).startsWith('https://')) {
        return json(res, 400, { error: 'Arquivo do criativo inválido.' });
      }
      const criativo = await createCriativo({
        ...patch,
        id,
        kind,
        storage_path: text(body.storage_path, 300),
        public_url: text(body.public_url, 500),
        size_bytes: size,
        md5,
        width: Number(body.width) || null,
        height: Number(body.height) || null,
        position: await nextCreativePosition(),
      });
      return json(res, 201, { criativo });
    }
    if (parts[0] === 'criativos' && parts[1] === 'ordem' && req.method === 'POST') {
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      if (!ids.length || ids.some((id) => !UUID.test(id))) return json(res, 400, { error: 'Ordem inválida.' });
      await reorderCriativos(ids);
      return json(res, 200, { ok: true });
    }
    if (parts[0] === 'criativos' && parts.length === 2 && req.method === 'PATCH') {
      const current = (await listCriativos()).find((item) => item.id === parts[1]);
      if (!current) return json(res, 404, { error: 'Criativo não encontrado.' });
      const patch = criativoPatch(body, current);
      if (fail(patch)) return json(res, 400, patch);
      return json(res, 200, { criativo: await updateCriativo(current.id, patch) });
    }
    if (parts[0] === 'criativos' && parts.length === 2 && req.method === 'DELETE') {
      const deleted = await deleteCriativo(parts[1]);
      if (!deleted) return json(res, 404, { error: 'Criativo não encontrado.' });
      return json(res, 200, { ok: true });
    }
    if (parts[0] === 'uploads' && req.method === 'POST') {
      const size = Number(body.size);
      if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
        return json(res, 400, { error: 'Arquivo acima de 80 MB ou vazio.' });
      }
      const signed = await createSignedUpload({ id: randomUUID(), contentType: body.contentType });
      return json(res, 200, signed);
    }
    if (parts[0] === 'playlist' && req.method === 'GET') return json(res, 200, await previewPlaylist());
    if (parts[0] === 'publicar' && req.method === 'POST') {
      const result = await publishNow({ trigger: 'manual', userId: session.userId, req, force: true });
      return json(res, result.ok ? 200 : 502, result);
    }
    if (parts[0] === 'publicacoes' && req.method === 'GET') {
      return json(res, 200, { publicacoes: await listPublicacoes(40) });
    }
    if (parts[0] === 'diagnostico' && req.method === 'GET') {
      const last = await lastPublicacaoDetail();
      return json(res, 200, {
        publicacao: last ? {
          ...last,
          request: last.request?.program
            ? { ...last.request.program, noticeUrl: Boolean(last.request.program.noticeUrl) }
            : null,
        } : null,
        callbacks: await listCallbacks(30),
      });
    }
    if (parts[0] === 'monitor' && req.method === 'GET') {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const checks = await listStatusLog(since);
      return json(res, 200, {
        player: await getPlayer(),
        incidentes: await listIncidentes(30),
        captura: await latestCaptura(),
        settings: await getSettings(),
        uptime24h: uptimePct(checks, Date.now() - 86400000),
        uptime7d: uptimePct(checks, Date.now() - 7 * 86400000),
        novacloud: novacloudConfigured(),
      });
    }
    if (parts[0] === 'controle' && req.method === 'POST') {
      const result = await runControl({ action: body.action, value: body.value, userId: session.userId, req });
      return json(res, 200, result);
    }
    if (parts[0] === 'relatorio' && req.method === 'GET') {
      const from = dateOrEmpty(req.query?.from, 'Início', true);
      const to = dateOrEmpty(req.query?.to, 'Fim', true);
      if (fail(from)) return json(res, 400, from);
      if (fail(to)) return json(res, 400, to);
      return json(res, 200, await reportExhibitions({ clienteId: req.query?.cliente_id || null, from, to }));
    }
    return json(res, 404, { error: 'Rota Telão não encontrada.' });
  } catch (err) {
    console.error('telao handler', err);
    return json(res, err.status || 500, { error: err.status ? err.message : 'Erro interno no módulo Telão.' });
  }
}
