import {
  getSql, createEnsure, getColaboradorAtivo, listColaboradoresAtivos, str, dateOnly,
} from './common.js';

/**
 * Bem-estar — alerta precoce de risco de esgotamento (metodologia burnout-risk-early-warning).
 * Não é diagnóstico: registra sinais observáveis e calcula um nível de risco.
 * score = soma dos indicadores marcados (0–12).
 * 0–2 baixo · 3–5 médio · 6–8 alto · 9+ crítico.
 */

export const GRUPOS = [
  { chave: 'carga', titulo: 'Carga objetiva', descricao: 'Fatos de agenda e jornada, verificáveis na grade de aulas.' },
  { chave: 'comportamento', titulo: 'Comportamento observável', descricao: 'Mudanças que o gestor ou a equipe percebem no dia a dia.' },
  { chave: 'sentimento', titulo: 'Sentimento', descricao: 'O que a pessoa diz ou demonstra sobre como está se sentindo.' },
];

export const INDICADORES = [
  {
    chave: 'jornada_excessiva', grupo: 'carga',
    titulo: 'Jornada acima de 50h por semana',
    descricao: 'Somando aulas coletivas, personal, plantões e deslocamentos entre unidades.',
  },
  {
    chave: 'aulas_seguidas', grupo: 'carga',
    titulo: 'Muitas aulas seguidas sem intervalo',
    descricao: 'Blocos de 3 ou mais aulas consecutivas sem pausa para comer ou descansar, na maioria dos dias.',
  },
  {
    chave: 'folgas_canceladas', grupo: 'carga',
    titulo: 'Folgas, intervalos ou 1:1 cancelados',
    descricao: 'Cobriu aulas de colegas, perdeu folga ou teve conversa com o gestor cancelada mais de 2 vezes em 4 semanas; turno cedo e noite no mesmo dia.',
  },
  {
    chave: 'mensagens_fora_horario', grupo: 'carga',
    titulo: 'Mensagens de alunos fora do horário',
    descricao: 'Responde alunos, personal ou grupo da equipe com frequência à noite, de madrugada ou nas folgas.',
  },
  {
    chave: 'faltas_atrasos', grupo: 'comportamento',
    titulo: 'Faltas e atrasos',
    descricao: 'Mais de 2 faltas, atrasos ou trocas de última hora em 4 semanas.',
  },
  {
    chave: 'demora_resposta', grupo: 'comportamento',
    titulo: 'Demora para responder',
    descricao: 'Passou a demorar para responder alunos, recepção ou coordenação (mudança de padrão).',
  },
  {
    chave: 'menos_iniciativa', grupo: 'comportamento',
    titulo: 'Menos energia e iniciativa',
    descricao: 'Aulas "no automático", menos interação com alunos, deixou de propor ideias nas reuniões.',
  },
  {
    chave: 'erros_operacionais', grupo: 'comportamento',
    titulo: 'Aumento de erros e esquecimentos',
    descricao: 'Fichas de treino trocadas, horários esquecidos, menos atenção à execução e à segurança dos alunos.',
  },
  {
    chave: 'queda_satisfacao', grupo: 'sentimento',
    titulo: 'Queda de satisfação',
    descricao: 'Queda forte (20+ pontos) na pesquisa de satisfação/eNPS em relação à última medida.',
  },
  {
    chave: 'pesquisa_negativa', grupo: 'sentimento',
    titulo: 'Respostas negativas em pesquisas rápidas',
    descricao: 'Respostas negativas em check-ins ou pesquisas rápidas por 2 semanas seguidas.',
  },
  {
    chave: 'relato_cansaco', grupo: 'sentimento',
    titulo: 'Relata cansaço',
    descricao: 'Fala em conversas ou 1:1 coisas como "estou exausto", "não aguento mais", "é muita coisa".',
  },
  {
    chave: 'isolamento_social', grupo: 'sentimento',
    titulo: 'Mudança de tom social',
    descricao: 'Se afasta dos colegas, deixa de aparecer em treinos, confraternizações ou conversas da equipe.',
  },
];

const CHAVES = INDICADORES.map((i) => i.chave);

export const NIVEIS = ['baixo', 'medio', 'alto', 'critico'];

export const FAIXAS = [
  { nivel: 'baixo', min: 0, max: 2, label: 'Baixo', acao: 'Monitorar' },
  { nivel: 'medio', min: 3, max: 5, label: 'Médio', acao: 'Ação do gestor' },
  { nivel: 'alto', min: 6, max: 8, label: 'Alto', acao: 'Ação do RH + gestor' },
  { nivel: 'critico', min: 9, max: 12, label: 'Crítico', acao: 'Intervenção imediata + apoio profissional' },
];

export const ACOMPANHAMENTO_DIAS = { baixo: 30, medio: 14, alto: 7, critico: 2 };

export const PLANOS = {
  nivel: {
    baixo: {
      individual: [
        'Manter as conversas 1:1 de rotina e perguntar como a pessoa está com a grade atual.',
        'Reforçar o respeito aos intervalos entre aulas e às folgas.',
      ],
      estrutural: [
        'Seguir monitorando a distribuição de aulas da equipe.',
      ],
    },
    medio: {
      individual: [
        'Gestor conversa na próxima 1:1 oferecendo ajuda, sem culpar: "notei que a agenda está pesada, como posso ajudar?".',
        'Ajustar a carga das próximas semanas (tirar 1 ou 2 aulas ou horários de personal).',
        'Combinar check-in quinzenal específico sobre bem-estar.',
      ],
      estrutural: [
        'Revisar a grade da semana para evitar blocos longos de aulas seguidas.',
        'Verificar se há substitutos treinados para cobrir faltas sem sobrecarregar sempre as mesmas pessoas.',
      ],
    },
    alto: {
      individual: [
        'RH e gestor conversam juntos com a pessoa, com escuta e oferta de apoio.',
        'Redistribuir aulas e horários de personal imediatamente; garantir folgas e intervalos.',
        'Oferecer day off, banco de horas ou antecipação de férias.',
        'Check-in semanal de bem-estar por pelo menos 4 semanas.',
        'Apresentar os canais de apoio disponíveis (convênio, psicólogo, médico do trabalho).',
      ],
      estrutural: [
        'Revisar a escala de turnos (evitar turno cedo e noite no mesmo dia).',
        'Avaliar contratação ou freelancers para cobrir os horários de pico.',
        'Rever metas de vendas de planos/personal se estiverem pressionando a equipe.',
      ],
    },
    critico: {
      individual: [
        'Intervenção imediata: conversa ainda hoje ou amanhã, em local reservado, conduzida pelo RH com o gestor.',
        'Recomendar com cuidado apoio profissional: psicólogo e/ou médico do trabalho. Esta análise não substitui avaliação clínica.',
        'Retirar a pessoa da grade temporariamente ou reduzir fortemente a carga; oferecer day off ou férias antecipadas.',
        'Acompanhamento a cada 2 dias até a situação estabilizar.',
        'Em caso de sofrimento extremo ou menção a se machucar: acionar imediatamente o CVV (188, 24h) e o RH.',
      ],
      estrutural: [
        'Cobrir as aulas da pessoa com outros professores ou freelancers sem sobrecarregar a equipe.',
        'Investigar se outras pessoas da mesma equipe/turno apresentam sinais parecidos.',
        'Revisar com a direção a carga horária e o dimensionamento da equipe.',
      ],
    },
  },
  grupo: {
    carga: {
      individual: 'Carga: reduzir aulas seguidas, garantir intervalo mínimo entre aulas e combinar horário limite para responder alunos.',
      estrutural: 'Carga: rever a grade de aulas e a escala de turnos; criar regra de não responder alunos fora do expediente (usar a recepção).',
    },
    comportamento: {
      individual: 'Comportamento: conversar sobre as mudanças percebidas de forma acolhedora, sem tom de cobrança, e perguntar o que está pesando.',
      estrutural: 'Comportamento: verificar se processos (fichas, agendamentos, avisos) estão gerando retrabalho e simplificá-los.',
    },
    sentimento: {
      individual: 'Sentimento: abrir espaço de escuta regular e apresentar os canais de apoio (convênio, psicólogo, médico do trabalho).',
      estrutural: 'Sentimento: reforçar momentos de integração da equipe e reconhecimento do trabalho dos professores.',
    },
  },
};

export const AVISO_CLINICO = 'Esta análise registra sinais observáveis e não substitui diagnóstico clínico. Burnout deve ser avaliado por profissional de saúde.';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIVEL_RANK = { baixo: 0, medio: 1, alto: 2, critico: 3 };

export class BemEstarError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const ensureBemEstarSchema = createEnsure(async (sql) => {
  await sql`
    CREATE TABLE IF NOT EXISTS rh_bemestar_checks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      colaborador_id UUID NOT NULL REFERENCES colaboradores_perfis(id) ON DELETE CASCADE,
      data DATE NOT NULL,
      periodo_semanas INTEGER NOT NULL DEFAULT 4 CHECK (periodo_semanas BETWEEN 4 AND 12),
      indicadores JSONB NOT NULL DEFAULT '{}'::jsonb,
      score INTEGER NOT NULL DEFAULT 0,
      nivel TEXT NOT NULL DEFAULT 'baixo' CHECK (nivel IN ('baixo','medio','alto','critico')),
      observacoes TEXT,
      plano_individual TEXT,
      plano_estrutural TEXT,
      acompanhamento_em DATE,
      registrado_por BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS rh_bemestar_checks_colab_data_idx ON rh_bemestar_checks (colaborador_id, data DESC)`;
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

/** Normaliza para { chave: boolean } com as 12 chaves. Aceita objeto ou array de chaves marcadas. */
export function normalizarIndicadores(input) {
  const marcadas = new Set();
  if (Array.isArray(input)) {
    input.forEach((k) => { if (CHAVES.includes(k)) marcadas.add(k); });
  } else if (input && typeof input === 'object') {
    Object.entries(input).forEach(([k, v]) => {
      if (CHAVES.includes(k) && (v === true || v === 'true' || v === 1 || v === '1')) marcadas.add(k);
    });
  }
  return Object.fromEntries(CHAVES.map((k) => [k, marcadas.has(k)]));
}

export function calcScore(indicadores) {
  const ind = normalizarIndicadores(indicadores);
  return CHAVES.reduce((s, k) => s + (ind[k] ? 1 : 0), 0);
}

export function nivelPorScore(score) {
  if (score >= 9) return 'critico';
  if (score >= 6) return 'alto';
  if (score >= 3) return 'medio';
  return 'baixo';
}

/** Sugestão de plano por nível + grupos com indicador marcado. */
export function sugerirPlano(indicadores) {
  const ind = normalizarIndicadores(indicadores);
  const score = calcScore(ind);
  const nivel = nivelPorScore(score);
  const grupos = GRUPOS.map((g) => g.chave)
    .filter((g) => INDICADORES.some((i) => i.grupo === g && ind[i.chave]));
  const base = PLANOS.nivel[nivel];
  const individual = [...base.individual, ...grupos.map((g) => PLANOS.grupo[g].individual)];
  const estrutural = [...base.estrutural, ...grupos.map((g) => PLANOS.grupo[g].estrutural)];
  return {
    score,
    nivel,
    grupos,
    plano_individual: individual.map((t) => `- ${t}`).join('\n'),
    plano_estrutural: estrutural.map((t) => `- ${t}`).join('\n'),
    acompanhamento_dias: ACOMPANHAMENTO_DIAS[nivel],
  };
}

export function definicoes() {
  return {
    grupos: GRUPOS,
    indicadores: INDICADORES,
    faixas: FAIXAS,
    acompanhamento_dias: ACOMPANHAMENTO_DIAS,
    planos: PLANOS,
    aviso: AVISO_CLINICO,
    periodo: { min: 4, max: 12, padrao: 4 },
  };
}

function normalize(row) {
  if (!row) return null;
  const indicadores = normalizarIndicadores(typeof row.indicadores === 'string' ? JSON.parse(row.indicadores) : row.indicadores);
  return {
    ...row,
    indicadores,
    score: Number(row.score),
    periodo_semanas: Number(row.periodo_semanas),
    registrado_por: row.registrado_por == null ? null : Number(row.registrado_por),
    data: d10(row.data),
    acompanhamento_em: d10(row.acompanhamento_em),
  };
}

/** Valida e monta os campos. `current` = registro existente (PATCH) ou null (POST). */
async function buildFields(body, current) {
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const out = {};

  if (!current || has('colaborador_id')) {
    const id = UUID_RE.test(String(body.colaborador_id || '')) ? body.colaborador_id : null;
    if (!id) throw new BemEstarError(400, 'Selecione um colaborador.');
    const colab = await getColaboradorAtivo(id);
    if (!colab) throw new BemEstarError(404, 'Colaborador não encontrado.');
    out.colaborador_id = colab.id;
  }

  if (!current || has('data')) {
    if (!current && (body.data == null || body.data === '')) {
      out.data = hojeISO();
    } else {
      const data = validDate(body.data);
      if (!data) throw new BemEstarError(400, 'Informe uma data válida (AAAA-MM-DD).');
      if (data > hojeISO()) throw new BemEstarError(400, 'A data da checagem não pode ser futura.');
      out.data = data;
    }
  }

  if (!current || has('periodo_semanas')) {
    const raw = body.periodo_semanas;
    if (!current && (raw == null || raw === '')) {
      out.periodo_semanas = 4;
    } else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 4 || n > 12) {
        throw new BemEstarError(400, 'O período observado deve ser de 4 a 12 semanas.');
      }
      out.periodo_semanas = n;
    }
  }

  if (!current || has('indicadores')) {
    const raw = body.indicadores;
    if (raw != null && typeof raw !== 'object') throw new BemEstarError(400, 'Indicadores inválidos.');
    out.indicadores = normalizarIndicadores(raw);
  }

  for (const k of ['observacoes', 'plano_individual', 'plano_estrutural']) {
    if (has(k)) out[k] = str(body[k], 10000);
  }

  const merged = { ...(current || {}), ...out };
  // Score e nível sempre recalculados aqui; valores enviados pelo cliente são ignorados.
  merged.score = calcScore(merged.indicadores);
  merged.nivel = nivelPorScore(merged.score);
  out.score = merged.score;
  out.nivel = merged.nivel;

  const sugestao = sugerirPlano(merged.indicadores);
  if (!current) {
    if (!out.plano_individual) out.plano_individual = sugestao.plano_individual;
    if (!out.plano_estrutural) out.plano_estrutural = sugestao.plano_estrutural;
  }

  const nivelMudou = current && current.nivel !== merged.nivel;
  if (has('acompanhamento_em') && body.acompanhamento_em !== null && body.acompanhamento_em !== '') {
    const ac = validDate(body.acompanhamento_em);
    if (!ac) throw new BemEstarError(400, 'Data do próximo acompanhamento inválida.');
    out.acompanhamento_em = ac;
  } else if (!current || has('acompanhamento_em') || nivelMudou || has('data')) {
    out.acompanhamento_em = addDias(merged.data, ACOMPANHAMENTO_DIAS[merged.nivel]);
  }
  const acFinal = out.acompanhamento_em ?? merged.acompanhamento_em;
  if (acFinal && acFinal <= merged.data) {
    throw new BemEstarError(400, 'O próximo acompanhamento deve ser depois da data da checagem.');
  }
  return out;
}

export async function getCheck(id) {
  if (!UUID_RE.test(String(id || ''))) return null;
  await ensureBemEstarSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT b.*, c.nome AS colaborador_nome, c.cargo_atual AS colaborador_cargo, u.name AS registrado_por_nome
    FROM rh_bemestar_checks b
    JOIN colaboradores_perfis c ON c.id = b.colaborador_id AND c.deleted_at IS NULL
    LEFT JOIN admin_users u ON u.id = b.registrado_por
    WHERE b.id = ${String(id)}
    LIMIT 1
  `;
  return normalize(rows[0]);
}

export async function historicoColaborador(colaboradorId) {
  if (!UUID_RE.test(String(colaboradorId || ''))) return null;
  await ensureBemEstarSchema();
  const colab = await getColaboradorAtivo(colaboradorId);
  if (!colab) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT b.*, u.name AS registrado_por_nome
    FROM rh_bemestar_checks b
    LEFT JOIN admin_users u ON u.id = b.registrado_por
    WHERE b.colaborador_id = ${colab.id}
    ORDER BY b.data DESC, b.created_at DESC
  `;
  const hoje = hojeISO();
  const checks = rows.map(normalize).map((r, i, arr) => ({
    ...r,
    ...tendencia(r, arr[i + 1]),
  }));
  const ultima = checks[0] || null;
  return {
    hoje,
    colaborador: { id: colab.id, nome: colab.nome, email: colab.email, cargo_atual: colab.cargo_atual },
    ultima,
    acompanhamento_vencido: !!(ultima?.acompanhamento_em && ultima.acompanhamento_em < hoje),
    checks,
  };
}

function tendencia(atual, anterior) {
  if (!anterior) return { score_anterior: null, delta: null, tendencia: null };
  const delta = atual.score - anterior.score;
  return {
    score_anterior: anterior.score,
    delta,
    tendencia: delta > 0 ? 'subiu' : delta < 0 ? 'desceu' : 'estavel',
  };
}

export async function resumoBemEstar() {
  await ensureBemEstarSchema();
  const sql = getSql();
  const hoje = hojeISO();
  const colaboradores = await listColaboradoresAtivos();
  const rows = colaboradores.length
    ? await sql`
        SELECT * FROM (
          SELECT b.id, b.colaborador_id, b.data, b.periodo_semanas, b.score, b.nivel, b.acompanhamento_em,
                 b.indicadores, b.created_at,
                 ROW_NUMBER() OVER (PARTITION BY b.colaborador_id ORDER BY b.data DESC, b.created_at DESC) AS rn
          FROM rh_bemestar_checks b
          JOIN colaboradores_perfis c ON c.id = b.colaborador_id AND c.deleted_at IS NULL
        ) t
        WHERE t.rn <= 2
      `
    : [];
  const byColab = new Map();
  rows.forEach((r) => {
    const k = String(r.colaborador_id);
    if (!byColab.has(k)) byColab.set(k, []);
    byColab.get(k).push(normalize(r));
  });

  const lista = [];
  const semChecagem = [];
  colaboradores.forEach((c) => {
    const checks = (byColab.get(String(c.id)) || []).sort((a, b) => Number(a.rn) - Number(b.rn));
    if (!checks.length) {
      semChecagem.push({ colaborador_id: c.id, nome: c.nome, cargo_atual: c.cargo_atual });
      return;
    }
    const [ultima, anterior] = checks;
    const vencido = !!(ultima.acompanhamento_em && ultima.acompanhamento_em < hoje);
    lista.push({
      colaborador_id: c.id,
      nome: c.nome,
      cargo_atual: c.cargo_atual,
      check_id: ultima.id,
      data: ultima.data,
      periodo_semanas: ultima.periodo_semanas,
      score: ultima.score,
      nivel: ultima.nivel,
      acompanhamento_em: ultima.acompanhamento_em,
      acompanhamento_vencido: vencido,
      dias_vencido: vencido ? diffDias(hoje, ultima.acompanhamento_em) : 0,
      ...tendencia(ultima, anterior),
    });
  });

  lista.sort((a, b) => (NIVEL_RANK[b.nivel] - NIVEL_RANK[a.nivel])
    || (b.score - a.score)
    || (Number(b.acompanhamento_vencido) - Number(a.acompanhamento_vencido))
    || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

  const porNivel = Object.fromEntries(NIVEIS.map((n) => [n, lista.filter((x) => x.nivel === n).length]));
  return {
    hoje,
    total: colaboradores.length,
    por_nivel: porNivel,
    vencidos: lista.filter((x) => x.acompanhamento_vencido).length,
    sem_checagem_total: semChecagem.length,
    colaboradores: lista,
    sem_checagem: semChecagem,
  };
}

export async function createCheck(body, session) {
  await ensureBemEstarSchema();
  const f = await buildFields(body || {}, null);
  const sql = getSql();
  const userId = Number(session?.userId) || null;
  const rows = await sql`
    INSERT INTO rh_bemestar_checks (
      colaborador_id, data, periodo_semanas, indicadores, score, nivel,
      observacoes, plano_individual, plano_estrutural, acompanhamento_em, registrado_por
    ) VALUES (
      ${f.colaborador_id}, ${f.data}, ${f.periodo_semanas}, ${JSON.stringify(f.indicadores)}::jsonb,
      ${f.score}, ${f.nivel}, ${f.observacoes ?? null}, ${f.plano_individual ?? null},
      ${f.plano_estrutural ?? null}, ${f.acompanhamento_em ?? null}, ${userId}
    )
    RETURNING id
  `;
  return getCheck(rows[0].id);
}

export async function updateCheck(id, body) {
  const current = await getCheck(id);
  if (!current) return null;
  const f = await buildFields(body || {}, current);
  const m = { ...current, ...f };
  const sql = getSql();
  await sql`
    UPDATE rh_bemestar_checks SET
      colaborador_id = ${m.colaborador_id}, data = ${m.data}, periodo_semanas = ${m.periodo_semanas},
      indicadores = ${JSON.stringify(m.indicadores)}::jsonb, score = ${m.score}, nivel = ${m.nivel},
      observacoes = ${m.observacoes ?? null}, plano_individual = ${m.plano_individual ?? null},
      plano_estrutural = ${m.plano_estrutural ?? null}, acompanhamento_em = ${m.acompanhamento_em ?? null},
      updated_at = NOW()
    WHERE id = ${current.id}
  `;
  return getCheck(current.id);
}

export async function deleteCheck(id) {
  if (!UUID_RE.test(String(id || ''))) return false;
  await ensureBemEstarSchema();
  const sql = getSql();
  const rows = await sql`DELETE FROM rh_bemestar_checks WHERE id = ${String(id)} RETURNING id`;
  return rows.length > 0;
}
