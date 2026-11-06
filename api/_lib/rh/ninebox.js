import { getSql, createEnsure, getColaboradorAtivo, listColaboradoresAtivos, str } from './common.js';

/** Chave do quadrante: `${desempenho}-${potencial}` (1 = baixo, 3 = alto). */
export const NINEBOX_QUADRANTES = {
  '3-3': { nome: 'Estrela', cor: '#22c55e', acao: 'Reter de forma agressiva e preparar como sucessor de cargos-chave.', investimento: 'Máximo', grupo: 'estrela' },
  '3-2': { nome: 'Forte performer', cor: '#84cc16', acao: 'Stretch assignment (desafio maior) e mentoria com a liderança.', investimento: 'Alto', grupo: 'hipo' },
  '2-3': { nome: 'High potential', cor: '#14b8a6', acao: 'Stretch assignment (desafio maior) e mentoria com a liderança.', investimento: 'Alto', grupo: 'hipo' },
  '2-2': { nome: 'Core do time', cor: '#3b82f6', acao: 'Manter, envolver em projeto estruturador e definir PDI claro.', investimento: 'Médio', grupo: 'core' },
  '3-1': { nome: 'Especialista sólido', cor: '#6366f1', acao: 'Reter pela expertise e montar plano de transferência de conhecimento.', investimento: 'Médio', grupo: 'especialista' },
  '2-1': { nome: 'Sólido consistente', cor: '#64748b', acao: 'Reconhecimento e manutenção da rotina.', investimento: 'Baixo', grupo: 'solido' },
  '1-3': { nome: 'Talento subutilizado', cor: '#eab308', acao: 'Coaching + mudança de gestor/área, com revisão em 90 dias.', investimento: 'Alto', grupo: 'subutilizado' },
  '1-2': { nome: 'Coaching urgente', cor: '#f97316', acao: 'Plano de melhoria de performance (PIP) de 60 dias com metas claras.', investimento: 'Médio', grupo: 'coaching' },
  '1-1': { nome: 'Avaliação crítica', cor: '#ef4444', acao: 'Conversa estruturada de desligamento.', investimento: 'Baixo', grupo: 'critica' },
};

export const NINEBOX_RISCOS = ['baixo', 'medio', 'alto'];

const PERIODO_RE = /^\d{4}-(S[12]|Q[1-4])$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ensureNinebox = createEnsure(async (sql) => {
  await sql`
    CREATE TABLE IF NOT EXISTS rh_ninebox (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      colaborador_id UUID NOT NULL REFERENCES colaboradores_perfis(id) ON DELETE CASCADE,
      periodo TEXT NOT NULL,
      desempenho INT NOT NULL CHECK (desempenho BETWEEN 1 AND 3),
      potencial INT NOT NULL CHECK (potencial BETWEEN 1 AND 3),
      justificativa TEXT,
      acao TEXT,
      risco_saida TEXT CHECK (risco_saida IS NULL OR risco_saida IN ('baixo', 'medio', 'alto')),
      sucessor_de TEXT,
      avaliado_por BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (colaborador_id, periodo)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS rh_ninebox_periodo_idx ON rh_ninebox (periodo)`;
});

export function quadranteKey(desempenho, potencial) {
  return `${Number(desempenho)}-${Number(potencial)}`;
}

export function quadranteInfo(desempenho, potencial) {
  const key = quadranteKey(desempenho, potencial);
  const q = NINEBOX_QUADRANTES[key];
  return q ? { key, ...q } : null;
}

/** Período corrente no formato ano-semestre (fuso de São Paulo). */
export function periodoAtual(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric' })
    .formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  return `${year}-S${month <= 6 ? 1 : 2}`;
}

export function periodoValido(p) {
  return typeof p === 'string' && PERIODO_RE.test(p);
}

/** Nota da avaliação (escala 1-5, pode vir como string) → desempenho 1-3. */
export function notaParaDesempenho(nota) {
  if (nota === null || nota === undefined || nota === '') return null;
  const n = Number(nota);
  if (!Number.isFinite(n)) return null;
  if (n <= 2.4) return 1;
  if (n <= 3.4) return 2;
  return 3;
}

/**
 * Sugestões de desempenho vindas do módulo de avaliação (se existir).
 * Retorna Map colaborador_id → { desempenho, nota, concluida_em }. Nunca lança.
 */
export async function sugestoesDesempenho(colaboradorIds = null) {
  const map = new Map();
  try {
    const sql = getSql();
    const reg = await sql`SELECT to_regclass('public.rh_avaliacoes') AS t`;
    if (!reg[0]?.t) return map;
    const rows = colaboradorIds
      ? await sql`
          SELECT DISTINCT ON (colaborador_id) colaborador_id,
                 COALESCE(nota_calibrada, nota_final) AS nota, concluida_em
          FROM rh_avaliacoes
          WHERE status = 'concluida' AND COALESCE(nota_calibrada, nota_final) IS NOT NULL
            AND colaborador_id = ANY(${colaboradorIds})
          ORDER BY colaborador_id, concluida_em DESC NULLS LAST
        `
      : await sql`
          SELECT DISTINCT ON (colaborador_id) colaborador_id,
                 COALESCE(nota_calibrada, nota_final) AS nota, concluida_em
          FROM rh_avaliacoes
          WHERE status = 'concluida' AND COALESCE(nota_calibrada, nota_final) IS NOT NULL
          ORDER BY colaborador_id, concluida_em DESC NULLS LAST
        `;
    for (const r of rows) {
      const desempenho = notaParaDesempenho(r.nota);
      if (desempenho) {
        map.set(String(r.colaborador_id), { desempenho, nota: Number(r.nota), concluida_em: r.concluida_em });
      }
    }
  } catch (err) {
    console.warn('ninebox: sugestão de desempenho indisponível', err?.message);
  }
  return map;
}

function mapRow(r) {
  return {
    id: r.id,
    colaborador_id: r.colaborador_id,
    periodo: r.periodo,
    desempenho: Number(r.desempenho),
    potencial: Number(r.potencial),
    justificativa: r.justificativa,
    acao: r.acao,
    risco_saida: r.risco_saida,
    sucessor_de: r.sucessor_de,
    avaliado_por: r.avaliado_por != null ? Number(r.avaliado_por) : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    quadrante: quadranteInfo(r.desempenho, r.potencial),
  };
}

function ehTalento(d, p) {
  return p === 3 || (d === 3 && p === 2);
}

export async function getGrade(periodoParam) {
  await ensureNinebox();
  const sql = getSql();
  const periodo = periodoParam || periodoAtual();

  const [colaboradores, rows, periodosRows] = await Promise.all([
    listColaboradoresAtivos(),
    sql`
      SELECT n.* FROM rh_ninebox n
      JOIN colaboradores_perfis c ON c.id = n.colaborador_id AND c.deleted_at IS NULL
      WHERE n.periodo = ${periodo}
    `,
    sql`
      SELECT n.periodo, COUNT(*) AS total FROM rh_ninebox n
      JOIN colaboradores_perfis c ON c.id = n.colaborador_id AND c.deleted_at IS NULL
      GROUP BY n.periodo
    `,
  ]);
  const sugestoes = await sugestoesDesempenho();

  const posByColab = new Map(rows.map((r) => [String(r.colaborador_id), mapRow(r)]));
  const quadrantes = Object.entries(NINEBOX_QUADRANTES).map(([key, q]) => {
    const [d, p] = key.split('-').map(Number);
    return { key, desempenho: d, potencial: p, ...q, count: 0, colaboradores: [] };
  });
  const qByKey = new Map(quadrantes.map((q) => [q.key, q]));

  const posicionados = [];
  const naoPosicionados = [];
  for (const c of colaboradores) {
    const base = {
      id: c.id,
      nome: c.nome,
      email: c.email,
      cargo_atual: c.cargo_atual,
      sugestao: sugestoes.get(String(c.id)) || null,
    };
    const pos = posByColab.get(String(c.id));
    if (pos) {
      const item = { ...base, posicao: pos };
      posicionados.push(item);
      const q = qByKey.get(pos.quadrante?.key);
      if (q) {
        q.count += 1;
        q.colaboradores.push({ id: c.id, nome: c.nome, cargo_atual: c.cargo_atual, risco_saida: pos.risco_saida });
      }
    } else {
      naoPosicionados.push(base);
    }
  }

  const talentos = posicionados
    .filter((c) => ehTalento(c.posicao.desempenho, c.posicao.potencial))
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      cargo_atual: c.cargo_atual,
      quadrante: c.posicao.quadrante,
      risco_saida: c.posicao.risco_saida,
      sucessor_de: c.posicao.sucessor_de,
    }))
    .sort((a, b) => (b.quadrante?.key || '').localeCompare(a.quadrante?.key || ''));
  const riscos = posicionados
    .filter((c) => c.posicao.risco_saida === 'alto' || (c.posicao.risco_saida === 'medio' && ehTalento(c.posicao.desempenho, c.posicao.potencial)))
    .map((c) => ({ id: c.id, nome: c.nome, quadrante: c.posicao.quadrante, risco_saida: c.posicao.risco_saida }));
  const sucessores = posicionados
    .filter((c) => c.posicao.sucessor_de)
    .map((c) => ({ id: c.id, nome: c.nome, sucessor_de: c.posicao.sucessor_de, quadrante: c.posicao.quadrante }));

  const periodosSet = new Set(periodosRows.map((r) => r.periodo));
  periodosSet.add(periodoAtual());
  periodosSet.add(periodo);
  const contagemPeriodo = new Map(periodosRows.map((r) => [r.periodo, Number(r.total)]));
  const periodos = [...periodosSet]
    .sort((a, b) => b.localeCompare(a))
    .map((p) => ({ periodo: p, total: contagemPeriodo.get(p) || 0 }));

  return {
    periodo,
    periodo_atual: periodoAtual(),
    periodos,
    total_colaboradores: colaboradores.length,
    total_posicionados: posicionados.length,
    quadrantes,
    posicionados,
    nao_posicionados: naoPosicionados,
    sucessao: {
      talentos,
      riscos,
      sucessores,
      estrelas_sem_sucessao: talentos.filter((t) => t.quadrante?.key === '3-3' && !t.sucessor_de).length,
    },
  };
}

export async function getHistorico(colaboradorId) {
  await ensureNinebox();
  const colaborador = await getColaboradorAtivo(colaboradorId);
  if (!colaborador) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM rh_ninebox WHERE colaborador_id = ${colaborador.id}
    ORDER BY periodo DESC, updated_at DESC
  `;
  const historico = rows.map(mapRow);
  const sugestoes = await sugestoesDesempenho([String(colaborador.id)]);
  const atual = periodoAtual();
  return {
    colaborador: { id: colaborador.id, nome: colaborador.nome, cargo_atual: colaborador.cargo_atual },
    periodo_atual: atual,
    atual: historico.find((h) => h.periodo === atual) || historico[0] || null,
    historico,
    sugestao: sugestoes.get(String(colaborador.id)) || null,
  };
}

function nivel(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 3 ? n : null;
}

/** Valida e grava (upsert por colaborador+período). Retorna { error, status } ou { item, created }. */
export async function upsertPosicao(body, session) {
  await ensureNinebox();
  const periodo = str(body.periodo, 20)?.toUpperCase();
  if (!periodoValido(periodo)) {
    return { status: 400, error: 'Período inválido. Use o formato 2026-S2 (semestre) ou 2026-Q4 (trimestre).' };
  }
  const desempenho = nivel(body.desempenho);
  const potencial = nivel(body.potencial);
  if (!desempenho) return { status: 400, error: 'Desempenho deve ser 1, 2 ou 3.' };
  if (!potencial) return { status: 400, error: 'Potencial deve ser 1, 2 ou 3.' };

  let risco = str(body.risco_saida, 10);
  if (risco) {
    risco = risco.toLowerCase().replace('é', 'e');
    if (!NINEBOX_RISCOS.includes(risco)) return { status: 400, error: 'Risco de saída deve ser baixo, médio ou alto.' };
  }

  const colaboradorId = str(body.colaborador_id, 64);
  if (!colaboradorId || !UUID_RE.test(colaboradorId)) return { status: 400, error: 'Informe um colaborador válido.' };
  const colaborador = await getColaboradorAtivo(colaboradorId);
  if (!colaborador) return { status: 404, error: 'Colaborador não encontrado ou inativo.' };

  const sql = getSql();
  const rows = await sql`
    INSERT INTO rh_ninebox (colaborador_id, periodo, desempenho, potencial, justificativa, acao, risco_saida, sucessor_de, avaliado_por)
    VALUES (
      ${colaborador.id}, ${periodo}, ${desempenho}, ${potencial},
      ${str(body.justificativa, 5000)}, ${str(body.acao, 5000)}, ${risco || null}, ${str(body.sucessor_de, 200)},
      ${session?.userId ?? null}
    )
    ON CONFLICT (colaborador_id, periodo) DO UPDATE SET
      desempenho = EXCLUDED.desempenho,
      potencial = EXCLUDED.potencial,
      justificativa = EXCLUDED.justificativa,
      acao = EXCLUDED.acao,
      risco_saida = EXCLUDED.risco_saida,
      sucessor_de = EXCLUDED.sucessor_de,
      avaliado_por = EXCLUDED.avaliado_por,
      updated_at = now()
    RETURNING *, (xmax = 0) AS inserted
  `;
  const row = rows[0];
  return { item: mapRow(row), created: row.inserted === true };
}

export async function deletePosicao(id) {
  await ensureNinebox();
  if (!id || !UUID_RE.test(String(id))) return false;
  const sql = getSql();
  const rows = await sql`DELETE FROM rh_ninebox WHERE id = ${String(id)} RETURNING id`;
  return rows.length > 0;
}
