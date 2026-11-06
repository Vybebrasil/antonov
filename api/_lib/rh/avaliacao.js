import { getSql, createEnsure, getColaboradorAtivo, str, dateOnly } from './common.js';

export const CICLO_TIPOS = ['gestor', '90'];
export const CICLO_STATUS = ['aberto', 'calibracao', 'encerrado'];
export const AVALIACAO_STATUS = ['rascunho', 'concluida'];

/** Distribuição alvo da skill (% por nota 1..5). */
export const DISTRIBUICAO_ALVO = [5, 15, 60, 15, 5];
export const LIMITE_VIES_PCT = 35;
export const MIN_AMOSTRA_VIES = 3;

export const COMPETENCIAS_PADRAO = [
  { chave: 'dominio_tecnico', nome: 'Domínio técnico de treino', tipo: 'hard', descricao: 'Prescrição, execução correta, segurança e atualização em métodos de treino.' },
  { chave: 'qualidade_atendimento', nome: 'Qualidade do atendimento ao aluno', tipo: 'hard', descricao: 'Acolhimento, atenção individual, correções e experiência do aluno na academia.' },
  { chave: 'pontualidade_agilidade', nome: 'Pontualidade e agilidade', tipo: 'hard', descricao: 'Cumpre horários de aula/turno e resolve demandas sem deixar o aluno esperando.' },
  { chave: 'autonomia', nome: 'Autonomia', tipo: 'hard', descricao: 'Resolve problemas do dia a dia sem depender do gestor e toma iniciativa.' },
  { chave: 'visao_negocio', nome: 'Visão de negócio e retenção', tipo: 'hard', descricao: 'Percebe risco de evasão, incentiva renovação/indicação e cuida dos resultados da academia.' },
  { chave: 'comunicacao', nome: 'Comunicação', tipo: 'soft', descricao: 'Explica com clareza para alunos e colegas, escuta e registra informações importantes.' },
  { chave: 'colaboracao', nome: 'Colaboração', tipo: 'soft', descricao: 'Ajuda colegas, cobre turnos quando necessário e trabalha em equipe com recepção e professores.' },
  { chave: 'feedback', nome: 'Capacidade de feedback', tipo: 'soft', descricao: 'Recebe e dá feedback de forma construtiva e transforma em ação.' },
  { chave: 'lideranca_si', nome: 'Liderança de si', tipo: 'soft', descricao: 'Postura, responsabilidade, constância e cuidado com o próprio desenvolvimento.' },
  { chave: 'gestao_tempo', nome: 'Gestão de tempo e prioridades', tipo: 'soft', descricao: 'Organiza a agenda de aulas e tarefas e prioriza o que impacta o aluno.' },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => UUID_RE.test(String(v || ''));

export class AvaliacaoError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => { throw new AvaliacaoError(status, message); };

export const ensure = createEnsure(async (sql) => {
  await sql`
    CREATE TABLE IF NOT EXISTS rh_avaliacao_ciclos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nome TEXT NOT NULL,
      periodo_inicio DATE NOT NULL,
      periodo_fim DATE NOT NULL,
      tipo TEXT NOT NULL DEFAULT '90',
      status TEXT NOT NULL DEFAULT 'aberto',
      competencias JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS rh_avaliacoes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ciclo_id UUID NOT NULL REFERENCES rh_avaliacao_ciclos(id) ON DELETE CASCADE,
      colaborador_id UUID NOT NULL REFERENCES colaboradores_perfis(id) ON DELETE CASCADE,
      avaliador_id BIGINT,
      status TEXT NOT NULL DEFAULT 'rascunho',
      notas_gestor JSONB NOT NULL DEFAULT '{}'::jsonb,
      notas_auto JSONB NOT NULL DEFAULT '{}'::jsonb,
      nota_final NUMERIC(3,2),
      nota_calibrada NUMERIC(3,2),
      pontos_fortes TEXT,
      pontos_desenvolver TEXT[] NOT NULL DEFAULT '{}',
      plano_90_dias TEXT,
      devolutiva_em DATE,
      concluida_em TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (ciclo_id, colaborador_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS rh_avaliacoes_colaborador_idx ON rh_avaliacoes (colaborador_id)`;
});

/* ---------- normalização ---------- */

function slug(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function parseJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  return v;
}

export function normalizeCompetencias(list) {
  if (!Array.isArray(list)) fail(400, 'Competências inválidas.');
  const out = [];
  const keys = new Set();
  for (const item of list) {
    const nome = str(item?.nome, 120);
    if (!nome) continue;
    let chave = slug(item?.chave) || slug(nome) || `comp_${out.length + 1}`;
    let base = chave;
    let i = 2;
    while (keys.has(chave)) chave = `${base}_${i++}`;
    keys.add(chave);
    out.push({
      chave,
      nome,
      tipo: item?.tipo === 'soft' ? 'soft' : 'hard',
      descricao: str(item?.descricao, 500) || '',
    });
  }
  if (!out.length) fail(400, 'Informe pelo menos uma competência.');
  if (out.length > 20) fail(400, 'Máximo de 20 competências por ciclo.');
  return out;
}

function normalizeNotas(raw, competencias) {
  const obj = parseJson(raw, {}) || {};
  if (typeof obj !== 'object' || Array.isArray(obj)) fail(400, 'Notas inválidas.');
  const valid = new Set(competencias.map((c) => c.chave));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!valid.has(k) || v === null || v === '') continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 5) fail(400, 'As notas devem ser inteiros de 1 a 5.');
    out[k] = n;
  }
  return out;
}

function mediaNotas(notas, competencias) {
  const vals = competencias.map((c) => notas[c.chave]).filter((n) => Number.isFinite(n));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function d10(v) {
  if (!v) return null;
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return dateOnly(v);
}

function mapCiclo(row) {
  if (!row) return null;
  return {
    ...row,
    periodo_inicio: d10(row.periodo_inicio),
    periodo_fim: d10(row.periodo_fim),
    competencias: parseJson(row.competencias, []) || [],
    total_avaliacoes: row.total_avaliacoes != null ? Number(row.total_avaliacoes) : undefined,
    concluidas: row.concluidas != null ? Number(row.concluidas) : undefined,
  };
}

function mapAvaliacao(row) {
  if (!row) return null;
  return {
    ...row,
    avaliador_id: row.avaliador_id != null ? Number(row.avaliador_id) : null,
    notas_gestor: parseJson(row.notas_gestor, {}) || {},
    notas_auto: parseJson(row.notas_auto, {}) || {},
    nota_final: numOrNull(row.nota_final),
    nota_calibrada: numOrNull(row.nota_calibrada),
    pontos_desenvolver: Array.isArray(row.pontos_desenvolver) ? row.pontos_desenvolver : [],
    devolutiva_em: d10(row.devolutiva_em),
    ...(row.competencias !== undefined ? { competencias: parseJson(row.competencias, []) || [] } : {}),
    ...(row.periodo_inicio !== undefined ? { periodo_inicio: d10(row.periodo_inicio) } : {}),
    ...(row.periodo_fim !== undefined ? { periodo_fim: d10(row.periodo_fim) } : {}),
  };
}

/* ---------- distribuição / calibração ---------- */

export function faixaDe(av) {
  const n = av.nota_calibrada ?? av.nota_final;
  if (n == null) return null;
  return Math.min(5, Math.max(1, Math.round(Number(n))));
}

export function calcularDistribuicao(avaliacoes, competencias) {
  const concluidas = avaliacoes.filter((a) => a.status === 'concluida');
  const contagem = [0, 0, 0, 0, 0];
  for (const a of concluidas) {
    const f = faixaDe(a);
    if (f) contagem[f - 1] += 1;
  }
  const total = contagem.reduce((a, b) => a + b, 0);
  const pct = contagem.map((c) => (total ? Math.round((c / total) * 1000) / 10 : 0));
  const faixas = contagem.map((qtd, i) => ({
    nota: i + 1,
    qtd,
    pct: pct[i],
    alvo: DISTRIBUICAO_ALVO[i],
  }));
  const pctAltas = total ? Math.round(((contagem[3] + contagem[4]) / total) * 1000) / 10 : 0;
  const pctBaixas = total ? Math.round(((contagem[0] + contagem[1]) / total) * 1000) / 10 : 0;
  const desvio = total
    ? Math.round((faixas.reduce((s, f) => s + Math.abs(f.pct - f.alvo), 0) / 2) * 10) / 10
    : 0;

  const alertas = [];
  if (total >= MIN_AMOSTRA_VIES) {
    if (pctAltas > LIMITE_VIES_PCT) {
      alertas.push({
        tipo: 'leniencia',
        nivel: 'warn',
        mensagem: `Possível viés de leniência: ${pctAltas}% das avaliações com nota 4-5 (alvo ≈ 20%). Revise na calibração.`,
      });
    }
    if (pctBaixas > LIMITE_VIES_PCT) {
      alertas.push({
        tipo: 'severidade',
        nivel: 'warn',
        mensagem: `Possível viés de severidade: ${pctBaixas}% das avaliações com nota 1-2 (alvo ≈ 20%). Revise na calibração.`,
      });
    }
  }

  const gapCompetencias = competencias.map((c) => {
    let soma = 0; let n = 0; let somaG = 0; let somaA = 0;
    for (const a of avaliacoes) {
      const g = a.notas_gestor?.[c.chave];
      const au = a.notas_auto?.[c.chave];
      if (Number.isFinite(g) && Number.isFinite(au)) {
        soma += au - g; somaG += g; somaA += au; n += 1;
      }
    }
    return {
      chave: c.chave,
      nome: c.nome,
      tipo: c.tipo,
      n,
      media_gestor: n ? Math.round((somaG / n) * 100) / 100 : null,
      media_auto: n ? Math.round((somaA / n) * 100) / 100 : null,
      diferenca: n ? Math.round((soma / n) * 100) / 100 : null,
    };
  });

  return {
    total,
    faixas,
    pct_altas: pctAltas,
    pct_baixas: pctBaixas,
    desvio_alvo: desvio,
    amostra_suficiente: total >= MIN_AMOSTRA_VIES,
    alertas,
    gap_competencias: gapCompetencias,
  };
}

/* ---------- ciclos ---------- */

async function totalColaboradoresAtivos(sql) {
  const r = await sql`SELECT COUNT(*)::int AS n FROM colaboradores_perfis WHERE deleted_at IS NULL`;
  return Number(r[0]?.n || 0);
}

export async function listCiclos() {
  await ensure();
  const sql = getSql();
  const rows = await sql`
    SELECT c.*,
      COUNT(a.id) FILTER (WHERE cp.id IS NOT NULL) AS total_avaliacoes,
      COUNT(a.id) FILTER (WHERE cp.id IS NOT NULL AND a.status = 'concluida') AS concluidas
    FROM rh_avaliacao_ciclos c
    LEFT JOIN rh_avaliacoes a ON a.ciclo_id = c.id
    LEFT JOIN colaboradores_perfis cp ON cp.id = a.colaborador_id AND cp.deleted_at IS NULL
    GROUP BY c.id
    ORDER BY c.periodo_fim DESC, c.created_at DESC
  `;
  return {
    ciclos: rows.map(mapCiclo),
    total_colaboradores: await totalColaboradoresAtivos(sql),
    competencias_padrao: COMPETENCIAS_PADRAO,
  };
}

function cicloPayload(body, current) {
  const nome = body.nome !== undefined ? str(body.nome, 160) : current?.nome;
  if (!nome) fail(400, 'Informe o nome do ciclo.');
  const ini = body.periodo_inicio !== undefined ? dateOnly(body.periodo_inicio) : current?.periodo_inicio;
  const fim = body.periodo_fim !== undefined ? dateOnly(body.periodo_fim) : current?.periodo_fim;
  if (!ini || !fim) fail(400, 'Informe o início e o fim do período.');
  if (ini > fim) fail(400, 'O início do período deve ser antes do fim.');
  let tipo = current?.tipo || '90';
  if (body.tipo !== undefined) {
    if (!CICLO_TIPOS.includes(body.tipo)) fail(400, 'Tipo de ciclo inválido.');
    tipo = body.tipo;
  }
  let status = current?.status || 'aberto';
  if (body.status !== undefined) {
    if (!CICLO_STATUS.includes(body.status)) fail(400, 'Status de ciclo inválido.');
    status = body.status;
  }
  let competencias = current?.competencias || COMPETENCIAS_PADRAO;
  if (body.competencias !== undefined && body.competencias !== null) {
    competencias = normalizeCompetencias(body.competencias);
  }
  return { nome, periodo_inicio: ini, periodo_fim: fim, tipo, status, competencias };
}

export async function createCiclo(body) {
  await ensure();
  const sql = getSql();
  const p = cicloPayload(body || {}, null);
  const rows = await sql`
    INSERT INTO rh_avaliacao_ciclos (nome, periodo_inicio, periodo_fim, tipo, status, competencias)
    VALUES (${p.nome}, ${p.periodo_inicio}, ${p.periodo_fim}, ${p.tipo}, ${p.status}, ${JSON.stringify(p.competencias)}::jsonb)
    RETURNING *
  `;
  return mapCiclo(rows[0]);
}

async function findCiclo(sql, id) {
  if (!isUuid(id)) return null;
  const rows = await sql`SELECT * FROM rh_avaliacao_ciclos WHERE id = ${id} LIMIT 1`;
  return mapCiclo(rows[0]);
}

async function recalcularNotasFinais(sql, ciclo) {
  const avs = await sql`SELECT id, notas_gestor FROM rh_avaliacoes WHERE ciclo_id = ${ciclo.id}`;
  for (const a of avs) {
    const nf = mediaNotas(parseJson(a.notas_gestor, {}) || {}, ciclo.competencias);
    await sql`UPDATE rh_avaliacoes SET nota_final = ${nf} WHERE id = ${a.id}`;
  }
}

export async function updateCiclo(id, body) {
  await ensure();
  const sql = getSql();
  const current = await findCiclo(sql, id);
  if (!current) return null;
  const p = cicloPayload(body || {}, current);
  const rows = await sql`
    UPDATE rh_avaliacao_ciclos SET
      nome = ${p.nome},
      periodo_inicio = ${p.periodo_inicio},
      periodo_fim = ${p.periodo_fim},
      tipo = ${p.tipo},
      status = ${p.status},
      competencias = ${JSON.stringify(p.competencias)}::jsonb,
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  const ciclo = mapCiclo(rows[0]);
  if (body?.competencias !== undefined && body?.competencias !== null) {
    await recalcularNotasFinais(sql, ciclo);
  }
  return ciclo;
}

export async function deleteCiclo(id) {
  await ensure();
  if (!isUuid(id)) return false;
  const sql = getSql();
  const rows = await sql`DELETE FROM rh_avaliacao_ciclos WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function getCiclo(id) {
  await ensure();
  const sql = getSql();
  const ciclo = await findCiclo(sql, id);
  if (!ciclo) return null;
  const rows = await sql`
    SELECT a.*, cp.nome AS colaborador_nome, cp.cargo_atual AS colaborador_cargo
    FROM rh_avaliacoes a
    JOIN colaboradores_perfis cp ON cp.id = a.colaborador_id AND cp.deleted_at IS NULL
    WHERE a.ciclo_id = ${id}
    ORDER BY cp.nome ASC
  `;
  const avaliacoes = rows.map(mapAvaliacao);
  const totalColab = await totalColaboradoresAtivos(sql);
  const concluidas = avaliacoes.filter((a) => a.status === 'concluida').length;
  return {
    ciclo,
    avaliacoes,
    progresso: {
      concluidas,
      avaliacoes: avaliacoes.length,
      colaboradores: totalColab,
      pct: totalColab ? Math.round((concluidas / totalColab) * 100) : 0,
    },
    distribuicao: calcularDistribuicao(avaliacoes, ciclo.competencias),
  };
}

/* ---------- avaliações ---------- */

export async function createAvaliacao(cicloId, body, avaliadorId) {
  await ensure();
  const sql = getSql();
  const ciclo = await findCiclo(sql, cicloId);
  if (!ciclo) fail(404, 'Ciclo não encontrado.');
  if (ciclo.status === 'encerrado') fail(400, 'Ciclo encerrado: não é possível criar avaliações.');
  const colabId = body?.colaborador_id;
  if (!colabId) fail(400, 'Informe o colaborador.');
  const colab = isUuid(colabId) ? await getColaboradorAtivo(colabId) : null;
  if (!colab) fail(404, 'Colaborador não encontrado.');
  const exists = await sql`SELECT id FROM rh_avaliacoes WHERE ciclo_id = ${ciclo.id} AND colaborador_id = ${colab.id} LIMIT 1`;
  if (exists.length) {
    const err = new AvaliacaoError(409, 'Este colaborador já tem avaliação neste ciclo.');
    err.id = exists[0].id;
    throw err;
  }
  const rows = await sql`
    INSERT INTO rh_avaliacoes (ciclo_id, colaborador_id, avaliador_id)
    VALUES (${ciclo.id}, ${colab.id}, ${avaliadorId ?? null})
    ON CONFLICT (ciclo_id, colaborador_id) DO NOTHING
    RETURNING id
  `;
  if (!rows.length) fail(409, 'Este colaborador já tem avaliação neste ciclo.');
  return getAvaliacao(rows[0].id);
}

async function findAvaliacao(sql, id) {
  if (!isUuid(id)) return null;
  const rows = await sql`
    SELECT a.*, cp.nome AS colaborador_nome, cp.cargo_atual AS colaborador_cargo,
      c.nome AS ciclo_nome, c.status AS ciclo_status, c.tipo AS ciclo_tipo,
      c.competencias, c.periodo_inicio, c.periodo_fim
    FROM rh_avaliacoes a
    JOIN rh_avaliacao_ciclos c ON c.id = a.ciclo_id
    JOIN colaboradores_perfis cp ON cp.id = a.colaborador_id AND cp.deleted_at IS NULL
    WHERE a.id = ${id}
    LIMIT 1
  `;
  return mapAvaliacao(rows[0]);
}

export async function getAvaliacao(id) {
  await ensure();
  return findAvaliacao(getSql(), id);
}

export async function updateAvaliacao(id, body) {
  await ensure();
  const sql = getSql();
  const cur = await findAvaliacao(sql, id);
  if (!cur) return null;
  if (cur.ciclo_status === 'encerrado') fail(400, 'Ciclo encerrado: reabra o ciclo para editar a avaliação.');
  const comps = cur.competencias;
  const b = body || {};

  const notasGestor = b.notas_gestor !== undefined ? normalizeNotas(b.notas_gestor, comps) : normalizeNotas(cur.notas_gestor, comps);
  const notasAuto = b.notas_auto !== undefined ? normalizeNotas(b.notas_auto, comps) : normalizeNotas(cur.notas_auto, comps);
  const pontosFortes = b.pontos_fortes !== undefined ? str(b.pontos_fortes, 4000) : cur.pontos_fortes;
  let pontosDev = cur.pontos_desenvolver;
  if (b.pontos_desenvolver !== undefined) {
    if (b.pontos_desenvolver !== null && !Array.isArray(b.pontos_desenvolver)) fail(400, 'Pontos a desenvolver inválidos.');
    pontosDev = (b.pontos_desenvolver || []).map((s) => str(s, 500)).filter(Boolean);
    if (pontosDev.length > 3) fail(400, 'Informe no máximo 3 pontos a desenvolver.');
  }
  const plano = b.plano_90_dias !== undefined ? str(b.plano_90_dias, 6000) : cur.plano_90_dias;
  let devolutiva = cur.devolutiva_em;
  if (b.devolutiva_em !== undefined) {
    devolutiva = b.devolutiva_em ? dateOnly(b.devolutiva_em) : null;
    if (b.devolutiva_em && !devolutiva) fail(400, 'Data da devolutiva inválida.');
  }
  let calibrada = cur.nota_calibrada;
  if (b.nota_calibrada !== undefined) {
    if (b.nota_calibrada === null || b.nota_calibrada === '') calibrada = null;
    else {
      const n = Number(b.nota_calibrada);
      if (!Number.isFinite(n) || n < 1 || n > 5) fail(400, 'A nota calibrada deve estar entre 1 e 5.');
      calibrada = Math.round(n * 100) / 100;
    }
  }
  let status = cur.status;
  if (b.status !== undefined) {
    if (!AVALIACAO_STATUS.includes(b.status)) fail(400, 'Status de avaliação inválido.');
    status = b.status;
  }

  if (status === 'concluida') {
    const faltando = comps.filter((c) => !Number.isFinite(notasGestor[c.chave]));
    if (faltando.length) {
      fail(400, `Para concluir, dê a nota do gestor em todas as competências (faltam: ${faltando.map((c) => c.nome).join(', ')}).`);
    }
    if (pontosDev.length < 2 || pontosDev.length > 3) {
      fail(400, 'Para concluir, informe de 2 a 3 pontos a desenvolver.');
    }
  }

  const notaFinal = mediaNotas(notasGestor, comps);
  const concluir = status === 'concluida';
  const rows = await sql`
    UPDATE rh_avaliacoes SET
      notas_gestor = ${JSON.stringify(notasGestor)}::jsonb,
      notas_auto = ${JSON.stringify(notasAuto)}::jsonb,
      nota_final = ${notaFinal},
      nota_calibrada = ${calibrada},
      pontos_fortes = ${pontosFortes},
      pontos_desenvolver = ${pontosDev}::text[],
      plano_90_dias = ${plano},
      devolutiva_em = ${devolutiva},
      status = ${status},
      concluida_em = CASE WHEN ${concluir}::boolean THEN COALESCE(concluida_em, now()) ELSE NULL END,
      updated_at = now()
    WHERE id = ${id}
    RETURNING id
  `;
  if (!rows.length) return null;
  return findAvaliacao(sql, id);
}

export async function deleteAvaliacao(id) {
  await ensure();
  if (!isUuid(id)) return false;
  const sql = getSql();
  const rows = await sql`DELETE FROM rh_avaliacoes WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function historicoColaborador(colaboradorId) {
  await ensure();
  if (!isUuid(colaboradorId)) return null;
  const colab = await getColaboradorAtivo(colaboradorId);
  if (!colab) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT a.*, c.nome AS ciclo_nome, c.status AS ciclo_status, c.tipo AS ciclo_tipo,
      c.competencias, c.periodo_inicio, c.periodo_fim
    FROM rh_avaliacoes a
    JOIN rh_avaliacao_ciclos c ON c.id = a.ciclo_id
    WHERE a.colaborador_id = ${colab.id}
    ORDER BY c.periodo_fim DESC, a.created_at DESC
  `;
  const avaliacoes = rows.map(mapAvaliacao);
  const ultima = avaliacoes
    .filter((a) => a.status === 'concluida')
    .sort((x, y) => new Date(y.concluida_em || 0) - new Date(x.concluida_em || 0))[0] || null;
  return {
    colaborador: { id: colab.id, nome: colab.nome, cargo_atual: colab.cargo_atual },
    avaliacoes,
    ultima_concluida: ultima,
  };
}
