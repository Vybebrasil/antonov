import {
  getSql, createEnsure, getColaboradorAtivo, listColaboradoresAtivos, str, int, dateOnly,
} from './common.js';

/**
 * Cadência (metodologia one-on-one-template):
 * - A 1:1 padrão é semanal (30 min, operacional) → a próxima data sugerida é data + 7 dias.
 * - A tolerância máxima é quinzenal: sem 1:1 realizada há mais de 14 dias = atrasado.
 * - Também fica atrasado quem tinha próxima data combinada (ou 1:1 agendada) já vencida
 *   sem nenhuma 1:1 realizada a partir dela.
 * As 1:1 mensal (carreira) e trimestral (review) são aprofundamentos e não substituem a cadência.
 */
export const CADENCIA_DIAS = 7;
export const LIMITE_ATRASO_DIAS = 14;

export const STATUS = ['agendada', 'realizada', 'cancelada'];
export const TIPOS = ['operacional', 'carreira', 'trimestral'];

const TEXT_FIELDS = [
  'checkin', 'follow_up', 'vitorias', 'bloqueios', 'prioridades', 'desenvolvimento',
  'feedback_lider', 'feedback_colaborador', 'sinais_atencao', 'proximos_passos',
  'motivo_cancelamento',
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class OneOnOneError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const ensureOneOnOneSchema = createEnsure(async (sql) => {
  await sql`
    CREATE TABLE IF NOT EXISTS rh_one_on_ones (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      colaborador_id UUID NOT NULL REFERENCES colaboradores_perfis(id) ON DELETE CASCADE,
      lider_id BIGINT,
      data DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada','realizada','cancelada')),
      tipo TEXT NOT NULL DEFAULT 'operacional' CHECK (tipo IN ('operacional','carreira','trimestral')),
      humor INTEGER CHECK (humor BETWEEN 1 AND 5),
      checkin TEXT,
      follow_up TEXT,
      vitorias TEXT,
      bloqueios TEXT,
      prioridades TEXT,
      desenvolvimento TEXT,
      feedback_lider TEXT,
      feedback_colaborador TEXT,
      sinais_atencao TEXT,
      proximos_passos TEXT,
      proxima_data DATE,
      motivo_cancelamento TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS rh_one_on_ones_colab_data_idx ON rh_one_on_ones (colaborador_id, data)`;
});

/** Data de hoje (America/Sao_Paulo) em 'YYYY-MM-DD'. */
export function hojeISO(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function d10(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function addDias(iso, n) {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function diffDias(a, b) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

function validDate(v) {
  const s = dateOnly(v);
  if (!s) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== s) return null;
  return s;
}

function normalize(row) {
  if (!row) return null;
  return {
    ...row,
    lider_id: row.lider_id == null ? null : Number(row.lider_id),
    humor: row.humor == null ? null : Number(row.humor),
    data: d10(row.data),
    proxima_data: d10(row.proxima_data),
  };
}

/** Valida e monta os campos. `current` = registro existente (PATCH) ou null (POST). */
async function buildFields(body, current) {
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const out = {};

  if (!current || has('colaborador_id')) {
    const colab = await getColaboradorAtivo(UUID_RE.test(String(body.colaborador_id || '')) ? body.colaborador_id : null);
    if (!colab) throw new OneOnOneError(400, 'Selecione um colaborador ativo.');
    out.colaborador_id = colab.id;
  }

  if (!current || has('data')) {
    const data = validDate(body.data);
    if (!data) throw new OneOnOneError(400, 'Informe uma data válida (AAAA-MM-DD).');
    out.data = data;
  }

  if (has('status') || !current) {
    if (has('status') && body.status) {
      if (!STATUS.includes(body.status)) throw new OneOnOneError(400, 'Status inválido. Use agendada, realizada ou cancelada.');
      out.status = body.status;
    } else if (!current) {
      out.status = out.data > hojeISO() ? 'agendada' : 'realizada';
    }
  }

  if (has('tipo') || !current) {
    const tipo = body.tipo || 'operacional';
    if (!TIPOS.includes(tipo)) throw new OneOnOneError(400, 'Tipo inválido. Use operacional, carreira ou trimestral.');
    out.tipo = tipo;
  }

  if (has('humor')) {
    if (body.humor === null || body.humor === '') {
      out.humor = null;
    } else {
      const n = Number(body.humor);
      if (!Number.isInteger(n) || n < 1 || n > 5) throw new OneOnOneError(400, 'O humor deve ser um número inteiro de 1 a 5.');
      out.humor = n;
    }
  }

  if (has('proxima_data')) {
    if (body.proxima_data === null || body.proxima_data === '') {
      out.proxima_data = null;
    } else {
      const pd = validDate(body.proxima_data);
      if (!pd) throw new OneOnOneError(400, 'Próxima data inválida.');
      out.proxima_data = pd;
    }
  }

  for (const k of TEXT_FIELDS) {
    if (has(k)) out[k] = str(body[k], 10000);
  }

  const merged = { ...(current || {}), ...out };
  if (merged.status === 'realizada' && merged.data > hojeISO()) {
    throw new OneOnOneError(400, 'Uma 1:1 realizada não pode ter data futura.');
  }
  if (merged.proxima_data && merged.proxima_data <= merged.data) {
    throw new OneOnOneError(400, 'A próxima data deve ser depois da data da 1:1.');
  }
  if (merged.status === 'cancelada' && !merged.motivo_cancelamento) {
    throw new OneOnOneError(400, 'Informe o motivo do cancelamento.');
  }
  if (merged.status !== 'cancelada' && merged.motivo_cancelamento) {
    out.motivo_cancelamento = null;
  }
  return out;
}

export async function listOneOnOnes({ colaboradorId, status, limit } = {}) {
  await ensureOneOnOneSchema();
  const sql = getSql();
  const colab = colaboradorId && UUID_RE.test(String(colaboradorId)) ? String(colaboradorId) : null;
  if (colaboradorId && !colab) return [];
  const st = status && STATUS.includes(status) ? status : null;
  if (status && !st) throw new OneOnOneError(400, 'Status inválido.');
  const lim = int(limit, { min: 1, max: 200 }) || 50;
  const rows = await sql`
    SELECT o.*, c.nome AS colaborador_nome, c.cargo_atual AS colaborador_cargo, u.name AS lider_nome
    FROM rh_one_on_ones o
    JOIN colaboradores_perfis c ON c.id = o.colaborador_id AND c.deleted_at IS NULL
    LEFT JOIN admin_users u ON u.id = o.lider_id
    WHERE (${colab}::uuid IS NULL OR o.colaborador_id = ${colab}::uuid)
      AND (${st}::text IS NULL OR o.status = ${st}::text)
    ORDER BY o.data DESC, o.created_at DESC
    LIMIT ${lim}
  `;
  return rows.map(normalize);
}

export async function getOneOnOne(id) {
  if (!UUID_RE.test(String(id || ''))) return null;
  await ensureOneOnOneSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT o.*, c.nome AS colaborador_nome, c.cargo_atual AS colaborador_cargo, u.name AS lider_nome
    FROM rh_one_on_ones o
    JOIN colaboradores_perfis c ON c.id = o.colaborador_id AND c.deleted_at IS NULL
    LEFT JOIN admin_users u ON u.id = o.lider_id
    WHERE o.id = ${String(id)}
    LIMIT 1
  `;
  return normalize(rows[0]);
}

export async function createOneOnOne(body, session) {
  await ensureOneOnOneSchema();
  const f = await buildFields(body || {}, null);
  const sql = getSql();
  const liderId = Number(session?.userId) || null;
  const rows = await sql`
    INSERT INTO rh_one_on_ones (
      colaborador_id, lider_id, data, status, tipo, humor,
      checkin, follow_up, vitorias, bloqueios, prioridades, desenvolvimento,
      feedback_lider, feedback_colaborador, sinais_atencao, proximos_passos,
      proxima_data, motivo_cancelamento
    ) VALUES (
      ${f.colaborador_id}, ${liderId}, ${f.data}, ${f.status}, ${f.tipo}, ${f.humor ?? null},
      ${f.checkin ?? null}, ${f.follow_up ?? null}, ${f.vitorias ?? null}, ${f.bloqueios ?? null},
      ${f.prioridades ?? null}, ${f.desenvolvimento ?? null},
      ${f.feedback_lider ?? null}, ${f.feedback_colaborador ?? null}, ${f.sinais_atencao ?? null},
      ${f.proximos_passos ?? null}, ${f.proxima_data ?? null}, ${f.motivo_cancelamento ?? null}
    )
    RETURNING id
  `;
  return getOneOnOne(rows[0].id);
}

export async function updateOneOnOne(id, body) {
  const current = await getOneOnOne(id);
  if (!current) return null;
  const f = await buildFields(body || {}, current);
  const m = { ...current, ...f };
  const sql = getSql();
  await sql`
    UPDATE rh_one_on_ones SET
      colaborador_id = ${m.colaborador_id}, data = ${m.data}, status = ${m.status}, tipo = ${m.tipo},
      humor = ${m.humor ?? null},
      checkin = ${m.checkin ?? null}, follow_up = ${m.follow_up ?? null},
      vitorias = ${m.vitorias ?? null}, bloqueios = ${m.bloqueios ?? null},
      prioridades = ${m.prioridades ?? null}, desenvolvimento = ${m.desenvolvimento ?? null},
      feedback_lider = ${m.feedback_lider ?? null}, feedback_colaborador = ${m.feedback_colaborador ?? null},
      sinais_atencao = ${m.sinais_atencao ?? null}, proximos_passos = ${m.proximos_passos ?? null},
      proxima_data = ${m.proxima_data ?? null}, motivo_cancelamento = ${m.motivo_cancelamento ?? null},
      updated_at = NOW()
    WHERE id = ${current.id}
  `;
  return getOneOnOne(current.id);
}

export async function deleteOneOnOne(id) {
  if (!UUID_RE.test(String(id || ''))) return false;
  await ensureOneOnOneSchema();
  const sql = getSql();
  const rows = await sql`DELETE FROM rh_one_on_ones WHERE id = ${String(id)} RETURNING id`;
  return rows.length > 0;
}

/**
 * Calcula a situação de um colaborador a partir das suas 1:1 (puro, testável).
 * `rows`: [{ data, status, proxima_data }], `hoje`: 'YYYY-MM-DD', `desde`: data de cadastro.
 */
export function calcSituacao(rows, hoje, desde = null) {
  const list = rows.map((r) => ({ data: d10(r.data), status: r.status, proxima_data: d10(r.proxima_data) }));
  const realizadas = list.filter((r) => r.status === 'realizada' && r.data <= hoje)
    .sort((a, b) => (a.data < b.data ? 1 : -1));
  const ultima = realizadas[0] || null;
  const agendadasFuturas = list.filter((r) => r.status === 'agendada' && r.data >= hoje)
    .sort((a, b) => (a.data < b.data ? -1 : 1));
  const limite30 = addDias(hoje, -30);
  const canceladas30 = list.filter((r) => r.status === 'cancelada' && r.data >= limite30 && r.data <= hoje).length;

  const prazos = [];
  if (ultima) {
    prazos.push(addDias(ultima.data, LIMITE_ATRASO_DIAS));
    if (ultima.proxima_data) prazos.push(ultima.proxima_data);
  } else if (desde) {
    prazos.push(addDias(d10(desde), LIMITE_ATRASO_DIAS));
  }
  // Agendada vencida (ainda não marcada como realizada) depois da última realizada.
  list
    .filter((r) => r.status === 'agendada' && r.data < hoje && (!ultima || r.data > ultima.data))
    .forEach((r) => prazos.push(r.data));

  const prazo = prazos.length ? prazos.sort()[0] : null;
  const atrasado = prazo ? prazo < hoje : true;
  const proximaPrevista = ultima?.proxima_data && ultima.proxima_data >= hoje ? ultima.proxima_data : null;

  return {
    ultima_realizada: ultima?.data || null,
    proxima_agendada: agendadasFuturas[0]?.data || proximaPrevista,
    canceladas_30d: canceladas30,
    dias_desde_ultima: ultima ? diffDias(hoje, ultima.data) : null,
    prazo,
    dias_atraso: atrasado && prazo ? diffDias(hoje, prazo) : 0,
    atrasado,
  };
}

export async function resumoOneOnOnes() {
  await ensureOneOnOneSchema();
  const sql = getSql();
  const hoje = hojeISO();
  const colaboradores = await listColaboradoresAtivos();
  const rows = colaboradores.length
    ? await sql`
        SELECT o.colaborador_id, o.data, o.status, o.proxima_data
        FROM rh_one_on_ones o
        JOIN colaboradores_perfis c ON c.id = o.colaborador_id AND c.deleted_at IS NULL
      `
    : [];
  const byColab = new Map();
  rows.forEach((r) => {
    const k = String(r.colaborador_id);
    if (!byColab.has(k)) byColab.set(k, []);
    byColab.get(k).push(r);
  });
  const lista = colaboradores.map((c) => ({
    colaborador_id: c.id,
    nome: c.nome,
    cargo_atual: c.cargo_atual,
    ...calcSituacao(byColab.get(String(c.id)) || [], hoje, c.created_at),
  }));
  return {
    hoje,
    cadencia_dias: CADENCIA_DIAS,
    limite_atraso_dias: LIMITE_ATRASO_DIAS,
    total: lista.length,
    atrasados: lista.filter((x) => x.atrasado).length,
    canceladas_30d: lista.reduce((s, x) => s + x.canceladas_30d, 0),
    colaboradores: lista,
  };
}
