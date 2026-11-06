import { getSql } from './db.js';

export const PDI_STATUS = new Set(['rascunho', 'ativo', 'concluido', 'cancelado']);
export const ACAO_STATUS = new Set(['nao_iniciado', 'em_andamento', 'concluido']);
export const DIMENSAO_702010 = new Set(['pratico_70', 'social_20', 'formal_10']);
export const OBJETIVO_STATUS = new Set(['nao_iniciado', 'em_andamento', 'concluido']);
export const TRIMESTRES = ['Q1', 'Q2', 'Q3', 'Q4'];
export const CHECKPOINT_TIPOS = new Set(['checkpoint', 'trimestral']);
export const MAX_OBJETIVOS = 3;

const MIN_CICLO_DAYS = 90;
const MAX_CICLO_DAYS = 183;
const REVISAO_TRIMESTRAL_DIAS = 90;
const REVISAO_TRIMESTRAL_TOLERANCIA = 100;
const DAY_MS = 1000 * 60 * 60 * 24;

let pdiSchemaReady = null;

export function ensurePdiSchema() {
  if (!pdiSchemaReady) {
    const sql = getSql();
    pdiSchemaReady = (async () => {
      await ensureColaboradoresSchema();
      await sql`ALTER TABLE pdis_ciclos ADD COLUMN IF NOT EXISTS aspiracao_12m TEXT`;
      await sql`ALTER TABLE pdis_ciclos ADD COLUMN IF NOT EXISTS horas_mes INTEGER`;
      await sql`
        ALTER TABLE pdis_ciclos ADD COLUMN IF NOT EXISTS mentor_id BIGINT
          REFERENCES admin_users(id) ON DELETE SET NULL
      `;
      await sql`ALTER TABLE pdis_ciclos ADD COLUMN IF NOT EXISTS kpis TEXT[]`;
      await sql`
        CREATE TABLE IF NOT EXISTS pdis_objetivos (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          ciclo_id UUID NOT NULL REFERENCES pdis_ciclos(id) ON DELETE CASCADE,
          ordem INT NOT NULL DEFAULT 1,
          titulo TEXT NOT NULL,
          especifico TEXT,
          mensuravel TEXT,
          atingivel TEXT,
          relevante TEXT,
          trimestre TEXT CHECK (trimestre IS NULL OR trimestre IN ('Q1', 'Q2', 'Q3', 'Q4')),
          status TEXT NOT NULL DEFAULT 'nao_iniciado'
            CHECK (status IN ('nao_iniciado', 'em_andamento', 'concluido')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS pdis_objetivos_ciclo_idx ON pdis_objetivos (ciclo_id, ordem)`;
      await sql`
        ALTER TABLE pdis_checkpoints ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'checkpoint'
          CHECK (tipo IN ('checkpoint', 'trimestral'))
      `;
    })().catch((err) => {
      pdiSchemaReady = null;
      throw err;
    });
  }
  return pdiSchemaReady;
}

/** Normaliza DATE (string ou Date do driver) para 'YYYY-MM-DD'. */
export function toDateStr(v) {
  if (!v) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  return String(v).slice(0, 10);
}

function dateAt(v) {
  const s = toDateStr(v);
  return s ? new Date(`${s}T12:00:00`) : null;
}

function addDays(dateStr, days) {
  const d = dateAt(dateStr);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/** Capacidade do PDI pelo tempo disponível (skill pdi-builder). */
export function evaluateCapacidade(horasMes, totalObjetivos = 0) {
  if (horasMes == null || horasMes === '' || Number.isNaN(Number(horasMes))) {
    return { horasMes: null, nivel: null, maxObjetivos: MAX_OBJETIVOS, alerta: null, recomendacao: null };
  }
  const h = Number(horasMes);
  if (h < 2) {
    return {
      horasMes: h,
      nivel: 'insuficiente',
      maxObjetivos: 0,
      alerta: `Com ${h}h/mês o PDI não decola, prefira uma conversa de carreira.`,
      recomendacao: null,
    };
  }
  if (h <= 8) {
    return {
      horasMes: h,
      nivel: 'realista',
      maxObjetivos: 2,
      alerta: totalObjetivos > 2
        ? `Com ${h}h/mês recomendamos até 2 objetivos. Este PDI tem ${totalObjetivos}: considere priorizar.`
        : null,
      recomendacao: 'PDI realista: até 2 objetivos.',
    };
  }
  if (h < 16) {
    return {
      horasMes: h,
      nivel: 'moderado',
      maxObjetivos: MAX_OBJETIVOS,
      alerta: null,
      recomendacao: 'Até 3 objetivos; com 16h+/mês cabe também um projeto estruturador.',
    };
  }
  return {
    horasMes: h,
    nivel: 'ambicioso',
    maxObjetivos: MAX_OBJETIVOS,
    alerta: null,
    recomendacao: 'PDI ambicioso: 3 objetivos + projeto estruturador (experiência on-the-job).',
  };
}

/** Revisão trimestral: atrasada se passaram 100+ dias da última (ou do início). */
export function revisaoTrimestralInfo(ciclo, checkpoints = []) {
  const trimestrais = checkpoints
    .filter((ch) => ch.tipo === 'trimestral')
    .map((ch) => toDateStr(ch.data_reuniao))
    .filter(Boolean)
    .sort();
  const ultima = trimestrais.length ? trimestrais[trimestrais.length - 1] : null;
  const base = ultima || toDateStr(ciclo?.data_inicio);
  if (!base) return { ultima, proxima: null, atrasada: false, diasDesde: null, total: trimestrais.length, message: null };
  const diasDesde = Math.floor((Date.now() - dateAt(base).getTime()) / DAY_MS);
  const atrasada = ciclo?.status === 'ativo' && diasDesde > REVISAO_TRIMESTRAL_TOLERANCIA;
  return {
    ultima,
    proxima: addDays(base, REVISAO_TRIMESTRAL_DIAS),
    atrasada,
    diasDesde,
    total: trimestrais.length,
    message: atrasada
      ? `Revisão trimestral atrasada: ${diasDesde} dias desde ${ultima ? 'a última revisão' : 'o início do ciclo'}. Checkpoint trimestral não é negociável.`
      : null,
  };
}

export function buildTrimestres(objetivos = [], checkpoints = []) {
  const revisoes = checkpoints
    .filter((ch) => ch.tipo === 'trimestral')
    .map((ch) => toDateStr(ch.data_reuniao))
    .filter(Boolean)
    .sort();
  return TRIMESTRES.map((q, i) => {
    const doTrimestre = objetivos.filter((o) => o.trimestre === q);
    return {
      trimestre: q,
      foco: q === 'Q4' ? 'Avaliação + replanejamento' : null,
      objetivos: doTrimestre.map((o) => ({ id: o.id, titulo: o.titulo, status: o.status })),
      concluidos: doTrimestre.filter((o) => o.status === 'concluido').length,
      revisao: revisoes[i] || null,
    };
  });
}

function textOrNull(v, max = 2000) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

/** Valida/normaliza um objetivo SMART. Retorna { error } ou { value }. */
export function normalizeObjetivo(raw = {}, { partial = false, current = null } = {}) {
  const pick = (k) => (raw[k] !== undefined ? raw[k] : current?.[k]);
  const titulo = textOrNull(pick('titulo'), 300);
  if (!titulo && (!partial || raw.titulo !== undefined)) {
    return { error: 'Título do objetivo SMART é obrigatório.' };
  }
  const trimestreRaw = pick('trimestre');
  const trimestre = trimestreRaw ? String(trimestreRaw).trim().toUpperCase() : null;
  if (trimestre && !TRIMESTRES.includes(trimestre)) {
    return { error: 'Trimestre inválido (use Q1, Q2, Q3 ou Q4).' };
  }
  const statusRaw = pick('status');
  if (statusRaw && !OBJETIVO_STATUS.has(statusRaw)) {
    return { error: 'Status do objetivo inválido.' };
  }
  return {
    value: {
      titulo: titulo || current?.titulo,
      especifico: textOrNull(pick('especifico')),
      mensuravel: textOrNull(pick('mensuravel')),
      atingivel: textOrNull(pick('atingivel')),
      relevante: textOrNull(pick('relevante')),
      trimestre,
      status: statusRaw || 'nao_iniciado',
    },
  };
}

export async function insertObjetivo(cicloId, obj, ordem) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO pdis_objetivos (
      ciclo_id, ordem, titulo, especifico, mensuravel, atingivel, relevante, trimestre, status
    ) VALUES (
      ${cicloId}, ${ordem}, ${obj.titulo}, ${obj.especifico}, ${obj.mensuravel},
      ${obj.atingivel}, ${obj.relevante}, ${obj.trimestre}, ${obj.status}
    )
    RETURNING *
  `;
  return rows[0];
}

export async function getMentorById(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT id, email, name FROM admin_users WHERE id = ${n} AND deleted_at IS NULL LIMIT 1
  `;
  return rows[0] || null;
}

export function parseHorasMes(v) {
  if (v == null || v === '') return { value: null };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 744) return { error: 'Horas por mês inválidas (0 a 744).' };
  return { value: Math.round(n) };
}

export function evaluateEstrutura(ciclo, objetivos = []) {
  const alertas = [];
  if (!String(ciclo?.aspiracao_12m || '').trim()) {
    alertas.push('PDI sem aspiração clara em 12 meses vira lista de cursos. Defina a aspiração.');
  }
  if (!ciclo?.mentor_id) {
    alertas.push('Sem mentor designado o PDI não tem accountability. Designe um mentor.');
  }
  if (objetivos.length > MAX_OBJETIVOS) {
    alertas.push(`Mais de ${MAX_OBJETIVOS} objetivos = nenhum entregue. Foque em até ${MAX_OBJETIVOS}.`);
  }
  return { alertas };
}

export function parseStringList(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw.split('\n').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function validateCicloDates(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return { error: 'Data de início e fim são obrigatórias.' };
  const start = new Date(`${dataInicio}T12:00:00`);
  const end = new Date(`${dataFim}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: 'Datas inválidas.' };
  }
  if (end <= start) return { error: 'A data fim deve ser posterior à data de início.' };
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
  if (days < MIN_CICLO_DAYS || days > MAX_CICLO_DAYS) {
    return {
      error: `O ciclo deve durar entre 3 e 6 meses (${MIN_CICLO_DAYS}–${MAX_CICLO_DAYS} dias). Atual: ${days} dias.`,
      days,
    };
  }
  return { days };
}

export function calc702010(acoes = []) {
  const total = acoes.length;
  if (!total) {
    return {
      total: 0,
      pratico_70: 0,
      social_20: 0,
      formal_10: 0,
      pct: { pratico_70: 0, social_20: 0, formal_10: 0 },
    };
  }
  const counts = { pratico_70: 0, social_20: 0, formal_10: 0 };
  for (const a of acoes) {
    if (counts[a.dimensao_70_20_10] != null) counts[a.dimensao_70_20_10] += 1;
  }
  return {
    total,
    ...counts,
    pct: {
      pratico_70: Math.round((counts.pratico_70 / total) * 100),
      social_20: Math.round((counts.social_20 / total) * 100),
      formal_10: Math.round((counts.formal_10 / total) * 100),
    },
  };
}

const IDEAL_702010 = { pratico_70: 70, social_20: 20, formal_10: 10 };
const TOLERANCE_702010 = 15;

export function evaluate702010(acoes = []) {
  const distribuicao = calc702010(acoes);
  if (!distribuicao.total) {
    return { desbalanceado: false, alerta: null, distribuicao };
  }

  if (distribuicao.total < 3) {
    return {
      desbalanceado: true,
      alerta: 'Recomendamos pelo menos 3 ações no plano para uma distribuição 70·20·10 equilibrada.',
      distribuicao,
    };
  }

  const deviations = [
    Math.abs(distribuicao.pct.pratico_70 - IDEAL_702010.pratico_70),
    Math.abs(distribuicao.pct.social_20 - IDEAL_702010.social_20),
    Math.abs(distribuicao.pct.formal_10 - IDEAL_702010.formal_10),
  ];
  const maxDev = Math.max(...deviations);

  if (maxDev > TOLERANCE_702010) {
    const { pct } = distribuicao;
    return {
      desbalanceado: true,
      alerta: `Distribuição ${pct.pratico_70}/${pct.social_20}/${pct.formal_10} difere do ideal 70/20/10. Considere reequilibrar as dimensões.`,
      distribuicao,
    };
  }

  return { desbalanceado: false, alerta: null, distribuicao };
}

export function calcBudget(acoes = [], budgetLimite = 0) {
  const gasto = acoes.reduce((sum, a) => sum + (Number(a.investimento_estimado) || 0), 0);
  const limite = Number(budgetLimite) || 0;
  return {
    gasto,
    limite,
    restante: limite > 0 ? Math.max(0, limite - gasto) : null,
    pct: limite > 0 ? Math.min(100, Math.round((gasto / limite) * 100)) : null,
  };
}

export function analyzeEquilibrio(ciclo, acoes = []) {
  const gaps = [
    ...parseStringList(ciclo?.gaps_tecnicos),
    ...parseStringList(ciclo?.gaps_comportamentais),
  ];
  const forcas = parseStringList(ciclo?.pontos_fortes_colaborador);
  const gapTerms = gaps.map((g) => g.toLowerCase());
  const acoesGap = acoes.filter((a) => {
    const desc = String(a.acao_descricao || '').toLowerCase();
    return gapTerms.some((g) => g && desc.includes(g));
  });
  const acoesForca = acoes.filter((a) => {
    const desc = String(a.acao_descricao || '').toLowerCase();
    return forcas.some((f) => f && desc.includes(f.toLowerCase()));
  });

  const onlyGaps = acoes.length > 0 && acoesForca.length === 0 && gaps.length > 0;
  return {
    onlyGaps,
    alerta: onlyGaps
      ? 'O PDI está focado apenas em correção de gaps. Inclua ações que potencializem os pontos fortes do colaborador (Liderança Positiva).'
      : null,
    acoesForca: acoesForca.length,
    acoesGap: acoesGap.length,
  };
}

export function checkpointRecommendation(ciclo, checkpoints = []) {
  if (!ciclo?.data_inicio || !ciclo?.data_fim) return null;
  const start = dateAt(ciclo.data_inicio);
  const end = dateAt(ciclo.data_fim);
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
  const idealInterval = days <= 120 ? 14 : 30;
  const expected = Math.max(1, Math.floor(days / idealInterval));
  const last = toDateStr(checkpoints[0]?.data_reuniao) || null;
  const today = new Date();
  let overdue = false;
  if (last) {
    const lastDate = dateAt(last);
    const since = Math.round((today - lastDate) / (1000 * 60 * 60 * 24));
    overdue = since > idealInterval + 3;
  } else if (ciclo.status === 'ativo') {
    overdue = true;
  }
  return {
    idealIntervalDays: idealInterval,
    expectedCheckpoints: expected,
    actualCheckpoints: checkpoints.length,
    lastCheckpoint: last,
    overdue,
    message: overdue
      ? `Recomendado agendar 1:1 a cada ${idealInterval} dias. Último checkpoint ${last ? `em ${last}` : 'ainda não registrado'}.`
      : null,
  };
}

export function progressFromAcoes(acoes = []) {
  if (!acoes.length) return 0;
  const done = acoes.filter((a) => a.status === 'concluido').length;
  return Math.round((done / acoes.length) * 100);
}

const STAFF_ROLES = ['admin_antonov', 'marketing', 'financeiro'];

let colaboradoresSchemaReady = null;

export function ensureColaboradoresSchema() {
  if (!colaboradoresSchemaReady) {
    const sql = getSql();
    colaboradoresSchemaReady = sql`
      ALTER TABLE colaboradores_perfis ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
    `.catch((err) => {
      colaboradoresSchemaReady = null;
      throw err;
    });
  }
  return colaboradoresSchemaReady;
}

export async function syncStaffColaboradores() {
  const sql = getSql();
  await sql`
    UPDATE colaboradores_perfis c
    SET admin_user_id = u.id, updated_at = NOW()
    FROM admin_users u
    WHERE c.admin_user_id IS NULL
      AND LOWER(c.email) = LOWER(u.email)
      AND u.deleted_at IS NULL
      AND u.role = ANY(${STAFF_ROLES})
  `;
  await sql`
    INSERT INTO colaboradores_perfis (nome, email, admin_user_id)
    SELECT
      COALESCE(NULLIF(TRIM(u.name), ''), SPLIT_PART(u.email, '@', 1)),
      LOWER(u.email),
      u.id
    FROM admin_users u
    WHERE u.deleted_at IS NULL
      AND u.role = ANY(${STAFF_ROLES})
      AND NOT EXISTS (
        SELECT 1 FROM colaboradores_perfis c
        WHERE c.admin_user_id = u.id OR LOWER(c.email) = LOWER(u.email)
      )
  `;
}

export async function listColaboradores() {
  const sql = getSql();
  await ensureColaboradoresSchema();
  try {
    await syncStaffColaboradores();
  } catch (err) {
    console.error('pdi sync equipe', err);
  }
  return sql`
    SELECT c.*,
      (
        SELECT pc.status FROM pdis_ciclos pc
        WHERE pc.colaborador_id = c.id AND pc.status = 'ativo'
        ORDER BY pc.data_inicio DESC LIMIT 1
      ) AS pdi_status_ativo,
      (
        SELECT pc.id FROM pdis_ciclos pc
        WHERE pc.colaborador_id = c.id AND pc.status = 'ativo'
        ORDER BY pc.data_inicio DESC LIMIT 1
      ) AS ciclo_ativo_id,
      (
        SELECT MAX(ch.data_reuniao) FROM pdis_checkpoints ch
        JOIN pdis_ciclos pc ON pc.id = ch.ciclo_id
        WHERE pc.colaborador_id = c.id
      ) AS ultimo_checkpoint
    FROM colaboradores_perfis c
    WHERE c.deleted_at IS NULL
    ORDER BY c.nome ASC
  `;
}

export async function getColaboradorById(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id ?? ''))) return null;
  const sql = getSql();
  await ensureColaboradoresSchema();
  const rows = await sql`
    SELECT * FROM colaboradores_perfis WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
  `;
  return rows[0] || null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v) {
  return UUID_RE.test(String(v || ''));
}

export async function getCicloFull(cicloId) {
  if (!isUuid(cicloId)) return null;
  await ensurePdiSchema();
  const sql = getSql();
  const ciclos = await sql`
    SELECT pc.*, c.nome AS colaborador_nome, c.email AS colaborador_email,
      c.cargo_atual, c.cargo_almejado, c.pontos_fortes, c.budget_anual,
      m.email AS mentor_email, m.name AS mentor_nome
    FROM pdis_ciclos pc
    JOIN colaboradores_perfis c ON c.id = pc.colaborador_id
    LEFT JOIN admin_users m ON m.id = pc.mentor_id
    WHERE pc.id = ${cicloId}
    LIMIT 1
  `;
  const ciclo = ciclos[0];
  if (!ciclo) return null;
  ciclo.data_inicio = toDateStr(ciclo.data_inicio);
  ciclo.data_fim = toDateStr(ciclo.data_fim);

  const objetivos = await sql`
    SELECT * FROM pdis_objetivos WHERE ciclo_id = ${cicloId}
    ORDER BY ordem ASC, created_at ASC
  `;

  const acoes = await sql`
    SELECT pa.*, u.email AS mentor_email
    FROM pdis_planos_acao pa
    LEFT JOIN admin_users u ON u.id = pa.mentor_id
    WHERE pa.ciclo_id = ${cicloId}
    ORDER BY pa.prazo_limite ASC NULLS LAST, pa.created_at ASC
  `;
  const checkpoints = await sql`
    SELECT * FROM pdis_checkpoints WHERE ciclo_id = ${cicloId}
    ORDER BY data_reuniao DESC, created_at DESC
  `;
  for (const ch of checkpoints) ch.data_reuniao = toDateStr(ch.data_reuniao);
  for (const a of acoes) a.prazo_limite = toDateStr(a.prazo_limite);

  const distribuicao = calc702010(acoes);
  const dist702010 = evaluate702010(acoes);
  const budget = calcBudget(acoes, ciclo.budget_limite ?? ciclo.budget_anual);
  const equilibrio = analyzeEquilibrio(
    { ...ciclo, pontos_fortes_colaborador: ciclo.pontos_fortes },
    acoes,
  );
  const checkpointsInfo = checkpointRecommendation(ciclo, checkpoints);
  const progresso = progressFromAcoes(acoes);
  const acoesAtrasadas = acoes.filter((a) => {
    if (a.status === 'concluido' || !a.prazo_limite) return false;
    return new Date(`${a.prazo_limite}T23:59:59`) < new Date();
  });

  const horasMes = ciclo.horas_mes != null ? Number(ciclo.horas_mes) : null;
  ciclo.horas_mes = horasMes;

  return {
    ciclo,
    objetivos,
    acoes,
    checkpoints,
    metricas: {
      distribuicao,
      dist702010,
      budget,
      equilibrio,
      checkpoints: checkpointsInfo,
      progresso,
      acoesAtrasadas: acoesAtrasadas.length,
      objetivos: {
        total: objetivos.length,
        concluidos: objetivos.filter((o) => o.status === 'concluido').length,
        max: MAX_OBJETIVOS,
      },
      capacidade: evaluateCapacidade(horasMes, objetivos.length),
      revisaoTrimestral: revisaoTrimestralInfo(ciclo, checkpoints),
      trimestres: buildTrimestres(objetivos, checkpoints),
      estrutura: evaluateEstrutura(ciclo, objetivos),
    },
  };
}

export async function getDashboardGestor(liderId = null) {
  await ensurePdiSchema();
  const colaboradores = await listColaboradores();
  const sql = getSql();

  const ciclosAtivos = liderId
    ? await sql`
        SELECT pc.*, c.nome AS colaborador_nome, c.budget_anual
        FROM pdis_ciclos pc
        JOIN colaboradores_perfis c ON c.id = pc.colaborador_id
        WHERE pc.status = 'ativo' AND pc.lider_id = ${liderId} AND c.deleted_at IS NULL
        ORDER BY pc.data_fim ASC
      `
    : await sql`
        SELECT pc.*, c.nome AS colaborador_nome, c.budget_anual
        FROM pdis_ciclos pc
        JOIN colaboradores_perfis c ON c.id = pc.colaborador_id
        WHERE pc.status = 'ativo' AND c.deleted_at IS NULL
        ORDER BY pc.data_fim ASC
      `;

  const enriched = [];
  for (const ciclo of ciclosAtivos) {
    const full = await getCicloFull(ciclo.id);
    enriched.push({
      ...(full?.ciclo || ciclo),
      objetivos: full?.objetivos || [],
      metricas: full?.metricas,
      progresso: full?.metricas?.progresso ?? 0,
    });
  }

  const alertas = enriched.filter((c) =>
    c.metricas?.acoesAtrasadas > 0
    || c.metricas?.checkpoints?.overdue
    || c.metricas?.equilibrio?.onlyGaps
    || c.metricas?.dist702010?.desbalanceado
    || c.metricas?.revisaoTrimestral?.atrasada
    || c.metricas?.capacidade?.alerta,
  );
  const revisoesAtrasadas = enriched.filter((c) => c.metricas?.revisaoTrimestral?.atrasada).length;

  const budgetTotal = enriched.reduce((s, c) => s + (c.metricas?.budget?.gasto || 0), 0);

  return {
    colaboradores,
    ciclosAtivos: enriched,
    alertas,
    resumo: {
      totalColaboradores: colaboradores.length,
      pdisAtivos: enriched.length,
      alertas: alertas.length,
      revisoesAtrasadas,
      budgetGasto: budgetTotal,
    },
  };
}
