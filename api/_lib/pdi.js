import { getSql } from './db.js';

export const PDI_STATUS = new Set(['rascunho', 'ativo', 'concluido', 'cancelado']);
export const ACAO_STATUS = new Set(['nao_iniciado', 'em_andamento', 'concluido']);
export const DIMENSAO_702010 = new Set(['pratico_70', 'social_20', 'formal_10']);

const MIN_CICLO_DAYS = 90;
const MAX_CICLO_DAYS = 183;

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
  const start = new Date(`${ciclo.data_inicio}T12:00:00`);
  const end = new Date(`${ciclo.data_fim}T12:00:00`);
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
  const idealInterval = days <= 120 ? 14 : 30;
  const expected = Math.max(1, Math.floor(days / idealInterval));
  const last = checkpoints[0]?.data_reuniao || null;
  const today = new Date();
  let overdue = false;
  if (last) {
    const lastDate = new Date(`${last}T12:00:00`);
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

export async function listColaboradores() {
  const sql = getSql();
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
    ORDER BY c.nome ASC
  `;
}

export async function getColaboradorById(id) {
  const sql = getSql();
  const rows = await sql`SELECT * FROM colaboradores_perfis WHERE id = ${id} LIMIT 1`;
  return rows[0] || null;
}

export async function getCicloFull(cicloId) {
  const sql = getSql();
  const ciclos = await sql`
    SELECT pc.*, c.nome AS colaborador_nome, c.email AS colaborador_email,
      c.cargo_atual, c.cargo_almejado, c.pontos_fortes, c.budget_anual
    FROM pdis_ciclos pc
    JOIN colaboradores_perfis c ON c.id = pc.colaborador_id
    WHERE pc.id = ${cicloId}
    LIMIT 1
  `;
  const ciclo = ciclos[0];
  if (!ciclo) return null;

  const acoes = await sql`
    SELECT pa.*, u.email AS mentor_email
    FROM pdis_planos_acao pa
    LEFT JOIN admin_users u ON u.id = pa.mentor_id
    WHERE pa.ciclo_id = ${cicloId}
    ORDER BY pa.prazo_limite ASC NULLS LAST, pa.created_at ASC
  `;
  const checkpoints = await sql`
    SELECT * FROM pdis_checkpoints WHERE ciclo_id = ${cicloId}
    ORDER BY data_reuniao DESC
  `;

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

  return {
    ciclo,
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
    },
  };
}

export async function getDashboardGestor(liderId = null) {
  const colaboradores = await listColaboradores();
  const sql = getSql();

  const ciclosAtivos = liderId
    ? await sql`
        SELECT pc.*, c.nome AS colaborador_nome, c.budget_anual
        FROM pdis_ciclos pc
        JOIN colaboradores_perfis c ON c.id = pc.colaborador_id
        WHERE pc.status = 'ativo' AND pc.lider_id = ${liderId}
        ORDER BY pc.data_fim ASC
      `
    : await sql`
        SELECT pc.*, c.nome AS colaborador_nome, c.budget_anual
        FROM pdis_ciclos pc
        JOIN colaboradores_perfis c ON c.id = pc.colaborador_id
        WHERE pc.status = 'ativo'
        ORDER BY pc.data_fim ASC
      `;

  const enriched = [];
  for (const ciclo of ciclosAtivos) {
    const full = await getCicloFull(ciclo.id);
    enriched.push({
      ...ciclo,
      metricas: full?.metricas,
      progresso: full?.metricas?.progresso ?? 0,
    });
  }

  const alertas = enriched.filter((c) =>
    c.metricas?.acoesAtrasadas > 0
    || c.metricas?.checkpoints?.overdue
    || c.metricas?.equilibrio?.onlyGaps
    || c.metricas?.dist702010?.desbalanceado,
  );

  const budgetTotal = enriched.reduce((s, c) => s + (c.metricas?.budget?.gasto || 0), 0);

  return {
    colaboradores,
    ciclosAtivos: enriched,
    alertas,
    resumo: {
      totalColaboradores: colaboradores.length,
      pdisAtivos: enriched.length,
      alertas: alertas.length,
      budgetGasto: budgetTotal,
    },
  };
}
