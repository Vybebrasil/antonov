import { getSql, createEnsure, getColaboradorAtivo, str, int, dateOnly } from './common.js';

export const FASES = ['pre', 'dia1', 'd30', 'd60', 'd90'];

export const FASE_LABELS = {
  pre: 'Antes do 1º dia',
  dia1: 'Dia 1',
  d30: 'Marco 30 dias',
  d60: 'Marco 60 dias',
  d90: 'Marco 90 dias',
  pos: 'Pós-integração',
};

export const STATUS = ['em_andamento', 'concluido', 'cancelado'];

/** Modelo padrão da integração para a equipe da academia (offset em dias a partir da entrada). */
export const MODELO_PADRAO = [
  { fase: 'pre', dias: -7, titulo: 'Mensagem de boas-vindas enviada (WhatsApp/e-mail) com apresentação da Antonov' },
  { fase: 'pre', dias: -5, titulo: 'Uniforme da equipe, crachá e armário separados' },
  { fase: 'pre', dias: -3, titulo: 'Incluído no grupo de WhatsApp do time e acessos liberados (sistema, catraca, agenda de aulas)' },
  { fase: 'pre', dias: -2, titulo: 'Escala de horários definida e padrinho avisado' },
  { fase: 'pre', dias: -1, titulo: 'Guia do primeiro dia enviado (horário de chegada, uniforme, quem procurar, estacionamento)' },

  { fase: 'dia1', dias: 0, titulo: 'Checagem com RH: documentos, CREF (se professor), benefícios e LGPD' },
  { fase: 'dia1', dias: 0, titulo: 'Tour pela academia: salas, musculação, equipamentos, vestiários e áreas técnicas' },
  { fase: 'dia1', dias: 0, titulo: 'Apresentação à equipe (recepção, professores, limpeza e manutenção)' },
  { fase: 'dia1', dias: 0, titulo: 'Normas de segurança, plano de emergência e kit de primeiros socorros' },
  { fase: 'dia1', dias: 0, titulo: 'Conversa de boas-vindas com o padrinho' },
  { fase: 'dia1', dias: 0, titulo: 'Alinhamento de expectativas com o gestor (30 min)' },

  { fase: 'd30', dias: 7, titulo: 'Acompanhar aulas/atendimentos do padrinho (ou turno da recepção) na primeira semana' },
  { fase: 'd30', dias: 14, titulo: 'Conhecer os protocolos de anamnese, avaliação física e treino inicial da casa' },
  { fase: 'd30', dias: 14, titulo: 'Treinamento no sistema da academia (cadastro de alunos, check-in, agenda)' },
  { fase: 'd30', dias: 21, titulo: 'Primeira aula/atendimento conduzido com supervisão do padrinho' },
  { fase: 'd30', dias: 30, titulo: '1:1 semanal com o gestor acontecendo' },
  { fase: 'd30', dias: 30, titulo: 'Conversa de adaptação com RH e NPS de 30 dias (alvo > 70)' },

  { fase: 'd60', dias: 45, titulo: 'Conduzindo aulas/atendimentos de forma independente (padrinho de apoio)' },
  { fase: 'd60', dias: 45, titulo: 'Montando e acompanhando treinos de alunos novos com o protocolo da casa' },
  { fase: 'd60', dias: 60, titulo: 'Feedback leve coletado (gestor + padrinho + 2 colegas)' },
  { fase: 'd60', dias: 60, titulo: 'Trilha de capacitação iniciada (cursos internos, reciclagem)' },

  { fase: 'd90', dias: 90, titulo: 'Avaliação formal do período de experiência (90 dias)' },
  { fase: 'd90', dias: 90, titulo: 'Metas do próximo trimestre definidas (turmas, retenção de alunos)' },
  { fase: 'd90', dias: 90, titulo: 'Compartilhar com o time: o que aprendi e o que vou propor' },
  { fase: 'd90', dias: 90, titulo: 'NPS final da integração coletado' },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v) {
  return UUID_RE.test(String(v || ''));
}

export const ensure = createEnsure(async (sql) => {
  await sql`
    CREATE TABLE IF NOT EXISTS rh_settings (
      chave TEXT PRIMARY KEY,
      valor TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS rh_onboardings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      colaborador_id UUID NOT NULL UNIQUE REFERENCES colaboradores_perfis(id) ON DELETE CASCADE,
      data_entrada DATE NOT NULL,
      padrinho_id UUID REFERENCES colaboradores_perfis(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'em_andamento'
        CHECK (status IN ('em_andamento', 'concluido', 'cancelado')),
      nps_30 INTEGER CHECK (nps_30 BETWEEN 0 AND 100),
      nps_90 INTEGER CHECK (nps_90 BETWEEN 0 AND 100),
      observacoes TEXT,
      concluido_em TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS rh_onboarding_itens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      onboarding_id UUID NOT NULL REFERENCES rh_onboardings(id) ON DELETE CASCADE,
      fase TEXT NOT NULL CHECK (fase IN ('pre', 'dia1', 'd30', 'd60', 'd90')),
      ordem INTEGER NOT NULL DEFAULT 0,
      titulo TEXT NOT NULL,
      prazo DATE,
      concluido_em TIMESTAMPTZ,
      concluido_por BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS rh_onboarding_itens_onb_idx ON rh_onboarding_itens (onboarding_id)`;
  await sql`
    INSERT INTO rh_settings (chave, valor) VALUES ('onboarding_since', NOW()::text)
    ON CONFLICT (chave) DO NOTHING
  `;
});

/* ---------- datas ---------- */

export function hojeSP() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function addDias(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diffDias(a, b) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

export function faseAtual(dataEntrada, hoje = hojeSP()) {
  const d = diffDias(hoje, dataEntrada);
  if (d < 0) return 'pre';
  if (d === 0) return 'dia1';
  if (d <= 30) return 'd30';
  if (d <= 60) return 'd60';
  if (d <= 90) return 'd90';
  return 'pos';
}

/* ---------- consultas ---------- */

async function oneOnOneCanceladas(sql, hoje) {
  const reg = await sql`SELECT to_regclass('public.rh_one_on_ones') AS t`;
  if (!reg[0]?.t) return null;
  try {
    const rows = await sql`
      SELECT colaborador_id, COUNT(*) AS n
      FROM rh_one_on_ones
      WHERE status = 'cancelada'
        AND data >= (${hoje}::date - 30) AND data <= ${hoje}::date
      GROUP BY colaborador_id
    `;
    const map = new Map();
    rows.forEach((r) => map.set(String(r.colaborador_id), Number(r.n)));
    return map;
  } catch (err) {
    console.error('rh onboarding: leitura de rh_one_on_ones falhou', err);
    return null;
  }
}

function montarAlertas(o, cancel) {
  const alertas = [];
  if (o.status !== 'em_andamento') return alertas;
  if (o.vencidos > 0) {
    alertas.push({
      tipo: 'vencidos',
      nivel: 'danger',
      msg: o.vencidos === 1 ? '1 item vencido' : `${o.vencidos} itens vencidos`,
    });
  }
  if (!o.padrinho_id) alertas.push({ tipo: 'sem_padrinho', nivel: 'warn', msg: 'Sem padrinho' });
  const npsBaixo = [['nps_30', 'NPS 30'], ['nps_90', 'NPS 90']]
    .filter(([k]) => o[k] !== null && o[k] !== undefined && Number(o[k]) < 50)
    .map(([k, l]) => `${l}: ${o[k]}`);
  if (npsBaixo.length) alertas.push({ tipo: 'nps_baixo', nivel: 'danger', msg: `NPS abaixo de 50 (${npsBaixo.join(', ')})` });
  const n = cancel?.get(String(o.colaborador_id)) || 0;
  if (n > 2) alertas.push({ tipo: 'one_on_one', nivel: 'danger', msg: `${n} reuniões 1:1 canceladas em 30 dias` });
  return alertas;
}

function normalizar(row, hoje, cancel) {
  const total = Number(row.total || 0);
  const concluidos = Number(row.concluidos || 0);
  const o = {
    id: row.id,
    colaborador_id: row.colaborador_id,
    colaborador_nome: row.colaborador_nome,
    colaborador_cargo: row.colaborador_cargo || null,
    padrinho_id: row.padrinho_nome ? row.padrinho_id : null,
    padrinho_nome: row.padrinho_nome || null,
    data_entrada: String(row.data_entrada).slice(0, 10),
    status: row.status,
    nps_30: row.nps_30 === null ? null : Number(row.nps_30),
    nps_90: row.nps_90 === null ? null : Number(row.nps_90),
    observacoes: row.observacoes || '',
    concluido_em: row.concluido_em,
    created_at: row.created_at,
    updated_at: row.updated_at,
    total,
    concluidos,
    vencidos: Number(row.vencidos || 0),
    progresso: total ? Math.round((concluidos / total) * 100) : 0,
  };
  o.dias_desde_entrada = diffDias(hoje, o.data_entrada);
  o.fase = faseAtual(o.data_entrada, hoje);
  o.fase_label = FASE_LABELS[o.fase];
  o.alertas = montarAlertas(o, cancel);
  return o;
}

async function selectOnboardings(sql, hoje, { id = null, colaboradorId = null } = {}) {
  return sql`
    SELECT o.id, o.colaborador_id, o.padrinho_id, o.status, o.nps_30, o.nps_90, o.observacoes,
           o.concluido_em, o.created_at, o.updated_at,
           to_char(o.data_entrada, 'YYYY-MM-DD') AS data_entrada,
           c.nome AS colaborador_nome, c.cargo_atual AS colaborador_cargo,
           p.nome AS padrinho_nome,
           (SELECT COUNT(*) FROM rh_onboarding_itens i WHERE i.onboarding_id = o.id) AS total,
           (SELECT COUNT(*) FROM rh_onboarding_itens i WHERE i.onboarding_id = o.id AND i.concluido_em IS NOT NULL) AS concluidos,
           (SELECT COUNT(*) FROM rh_onboarding_itens i
             WHERE i.onboarding_id = o.id AND i.concluido_em IS NULL AND i.prazo < ${hoje}::date) AS vencidos
    FROM rh_onboardings o
    JOIN colaboradores_perfis c ON c.id = o.colaborador_id AND c.deleted_at IS NULL
    LEFT JOIN colaboradores_perfis p ON p.id = o.padrinho_id AND p.deleted_at IS NULL
    WHERE (${id}::uuid IS NULL OR o.id = ${id}::uuid)
      AND (${colaboradorId}::uuid IS NULL OR o.colaborador_id = ${colaboradorId}::uuid)
    ORDER BY (o.status = 'em_andamento') DESC, o.data_entrada DESC
  `;
}

async function inserirItensPadrao(sql, onboardingId, dataEntrada) {
  const ordemPorFase = {};
  const fases = [];
  const ordens = [];
  const titulos = [];
  const prazos = [];
  MODELO_PADRAO.forEach((m) => {
    ordemPorFase[m.fase] = (ordemPorFase[m.fase] || 0) + 1;
    fases.push(m.fase);
    ordens.push(ordemPorFase[m.fase]);
    titulos.push(m.titulo);
    prazos.push(addDias(dataEntrada, m.dias));
  });
  await sql`
    INSERT INTO rh_onboarding_itens (onboarding_id, fase, ordem, titulo, prazo)
    SELECT ${onboardingId}::uuid, f, o, t, p
    FROM unnest(${fases}::text[], ${ordens}::int[], ${titulos}::text[], ${prazos}::date[]) AS x(f, o, t, p)
  `;
}

/** Cria a integração com os itens do modelo. Retorna o id ou null se já existir. */
async function criarOnboarding(sql, { colaboradorId, dataEntrada, padrinhoId = null }) {
  const rows = await sql`
    INSERT INTO rh_onboardings (colaborador_id, data_entrada, padrinho_id)
    VALUES (${colaboradorId}, ${dataEntrada}::date, ${padrinhoId})
    ON CONFLICT (colaborador_id) DO NOTHING
    RETURNING id
  `;
  if (!rows[0]) return null;
  await inserirItensPadrao(sql, rows[0].id, dataEntrada);
  return rows[0].id;
}

async function autoCriar(sql) {
  const pendentes = await sql`
    SELECT c.id, to_char((c.created_at AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS entrada
    FROM colaboradores_perfis c
    WHERE c.deleted_at IS NULL
      AND c.created_at > (SELECT valor::timestamptz FROM rh_settings WHERE chave = 'onboarding_since')
      AND NOT EXISTS (SELECT 1 FROM rh_onboardings o WHERE o.colaborador_id = c.id)
  `;
  for (const p of pendentes) {
    await criarOnboarding(sql, { colaboradorId: p.id, dataEntrada: p.entrada });
  }
  return pendentes.length;
}

async function proximosItens(sql, ids, limite = 3) {
  if (!ids.length) return new Map();
  const rows = await sql`
    SELECT * FROM (
      SELECT i.id, i.onboarding_id, i.fase, i.titulo, to_char(i.prazo, 'YYYY-MM-DD') AS prazo,
             ROW_NUMBER() OVER (PARTITION BY i.onboarding_id ORDER BY i.prazo ASC NULLS LAST, i.ordem ASC) AS rn
      FROM rh_onboarding_itens i
      WHERE i.onboarding_id = ANY(${ids}::uuid[]) AND i.concluido_em IS NULL
    ) x WHERE rn <= ${limite}
    ORDER BY rn
  `;
  const map = new Map();
  rows.forEach((r) => {
    const k = String(r.onboarding_id);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ id: r.id, fase: r.fase, titulo: r.titulo, prazo: r.prazo });
  });
  return map;
}

/* ---------- API pública ---------- */

export async function listOnboardings({ colaboradorId = null } = {}) {
  await ensure();
  const sql = getSql();
  const hoje = hojeSP();
  const criados = await autoCriar(sql);
  const [rows, cancel] = await Promise.all([
    selectOnboardings(sql, hoje, { colaboradorId }),
    oneOnOneCanceladas(sql, hoje),
  ]);
  const lista = rows.map((r) => normalizar(r, hoje, cancel));
  const prox = await proximosItens(sql, lista.map((o) => o.id));
  lista.forEach((o) => { o.proximos = prox.get(String(o.id)) || []; });
  return { hoje, criados_automaticamente: criados, onboardings: lista };
}

export async function getOnboarding(id) {
  if (!isUuid(id)) return null;
  await ensure();
  const sql = getSql();
  const hoje = hojeSP();
  const [rows, cancel] = await Promise.all([
    selectOnboardings(sql, hoje, { id }),
    oneOnOneCanceladas(sql, hoje),
  ]);
  if (!rows[0]) return null;
  const o = normalizar(rows[0], hoje, cancel);
  const itens = await sql`
    SELECT id, fase, ordem, titulo, to_char(prazo, 'YYYY-MM-DD') AS prazo, concluido_em, concluido_por
    FROM rh_onboarding_itens
    WHERE onboarding_id = ${id}
    ORDER BY ordem ASC, created_at ASC
  `;
  o.fases = FASES.map((fase) => ({
    fase,
    label: FASE_LABELS[fase],
    itens: itens
      .filter((i) => i.fase === fase)
      .map((i) => ({
        id: i.id,
        fase: i.fase,
        ordem: Number(i.ordem),
        titulo: i.titulo,
        prazo: i.prazo,
        concluido: !!i.concluido_em,
        concluido_em: i.concluido_em,
        concluido_por: i.concluido_por === null ? null : Number(i.concluido_por),
        vencido: !i.concluido_em && !!i.prazo && i.prazo < hoje,
      })),
  }));
  o.hoje = hoje;
  return o;
}

function fail(status, error) {
  return { status, error };
}

async function validarPadrinho(padrinhoId, colaboradorId) {
  if (!padrinhoId) return null;
  if (!isUuid(padrinhoId)) return fail(400, 'Padrinho inválido.');
  if (String(padrinhoId) === String(colaboradorId)) return fail(400, 'O padrinho não pode ser o próprio colaborador.');
  const p = await getColaboradorAtivo(padrinhoId);
  if (!p) return fail(400, 'Padrinho não encontrado.');
  return null;
}

function parseNps(v, label) {
  if (v === null || v === undefined || v === '') return { value: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 100) return { error: `${label} deve ser um número inteiro de 0 a 100.` };
  return { value: n };
}

export async function createOnboarding(body) {
  await ensure();
  const sql = getSql();
  const colaboradorId = str(body.colaborador_id, 64);
  if (!isUuid(colaboradorId)) return fail(400, 'Informe o colaborador.');
  const colab = await getColaboradorAtivo(colaboradorId);
  if (!colab) return fail(404, 'Colaborador não encontrado.');
  const dataEntrada = body.data_entrada ? dateOnly(body.data_entrada) : hojeSP();
  if (!dataEntrada) return fail(400, 'Data de entrada inválida.');
  const padrinhoId = str(body.padrinho_id, 64);
  const errPad = await validarPadrinho(padrinhoId, colaboradorId);
  if (errPad) return errPad;
  const id = await criarOnboarding(sql, { colaboradorId, dataEntrada, padrinhoId });
  if (!id) return fail(409, 'Este colaborador já tem uma integração.');
  return { status: 201, data: await getOnboarding(id) };
}

export async function updateOnboarding(id, body) {
  if (!isUuid(id)) return fail(404, 'Integração não encontrada.');
  await ensure();
  const sql = getSql();
  const cur = (await sql`
    SELECT id, colaborador_id, padrinho_id, status, nps_30, nps_90, observacoes,
           to_char(data_entrada, 'YYYY-MM-DD') AS data_entrada
    FROM rh_onboardings WHERE id = ${id}
  `)[0];
  if (!cur) return fail(404, 'Integração não encontrada.');

  let padrinhoId = cur.padrinho_id;
  if ('padrinho_id' in body) {
    padrinhoId = str(body.padrinho_id, 64);
    const errPad = await validarPadrinho(padrinhoId, cur.colaborador_id);
    if (errPad) return errPad;
  }

  let dataEntrada = cur.data_entrada;
  if ('data_entrada' in body) {
    dataEntrada = dateOnly(body.data_entrada);
    if (!dataEntrada) return fail(400, 'Data de entrada inválida.');
  }

  let status = cur.status;
  if ('status' in body) {
    status = String(body.status || '');
    if (!STATUS.includes(status)) return fail(400, 'Status inválido.');
  }

  let nps30 = cur.nps_30;
  let nps90 = cur.nps_90;
  if ('nps_30' in body) {
    const r = parseNps(body.nps_30, 'NPS 30 dias');
    if (r.error) return fail(400, r.error);
    nps30 = r.value;
  }
  if ('nps_90' in body) {
    const r = parseNps(body.nps_90, 'NPS 90 dias');
    if (r.error) return fail(400, r.error);
    nps90 = r.value;
  }

  const observacoes = 'observacoes' in body ? str(body.observacoes, 10000) : cur.observacoes;

  await sql`
    UPDATE rh_onboardings SET
      padrinho_id = ${padrinhoId},
      data_entrada = ${dataEntrada}::date,
      status = ${status},
      nps_30 = ${nps30},
      nps_90 = ${nps90},
      observacoes = ${observacoes},
      concluido_em = CASE
        WHEN ${status} = 'concluido' THEN COALESCE(concluido_em, NOW())
        ELSE NULL END,
      updated_at = NOW()
    WHERE id = ${id}
  `;

  const delta = diffDias(dataEntrada, cur.data_entrada);
  if (delta !== 0) {
    await sql`
      UPDATE rh_onboarding_itens SET prazo = prazo + ${delta}::int, updated_at = NOW()
      WHERE onboarding_id = ${id} AND prazo IS NOT NULL
    `;
  }
  return { status: 200, data: await getOnboarding(id) };
}

export async function deleteOnboarding(id) {
  if (!isUuid(id)) return false;
  await ensure();
  const sql = getSql();
  const rows = await sql`DELETE FROM rh_onboardings WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function addItem(onboardingId, body) {
  if (!isUuid(onboardingId)) return fail(404, 'Integração não encontrada.');
  await ensure();
  const sql = getSql();
  const onb = (await sql`SELECT id FROM rh_onboardings WHERE id = ${onboardingId}`)[0];
  if (!onb) return fail(404, 'Integração não encontrada.');
  const fase = String(body.fase || '');
  if (!FASES.includes(fase)) return fail(400, 'Fase inválida.');
  const titulo = str(body.titulo, 500);
  if (!titulo) return fail(400, 'Informe o título do item.');
  let prazo = null;
  if (body.prazo) {
    prazo = dateOnly(body.prazo);
    if (!prazo) return fail(400, 'Prazo inválido.');
  }
  const rows = await sql`
    INSERT INTO rh_onboarding_itens (onboarding_id, fase, ordem, titulo, prazo)
    VALUES (
      ${onboardingId}, ${fase},
      (SELECT COALESCE(MAX(ordem), 0) + 1 FROM rh_onboarding_itens WHERE onboarding_id = ${onboardingId} AND fase = ${fase}),
      ${titulo}, ${prazo}::date
    )
    RETURNING id
  `;
  await sql`UPDATE rh_onboardings SET updated_at = NOW() WHERE id = ${onboardingId}`;
  return { status: 201, data: { id: rows[0].id } };
}

export async function updateItem(itemId, body, userId) {
  if (!isUuid(itemId)) return fail(404, 'Item não encontrado.');
  await ensure();
  const sql = getSql();
  const cur = (await sql`
    SELECT id, onboarding_id, titulo, to_char(prazo, 'YYYY-MM-DD') AS prazo, concluido_em, concluido_por
    FROM rh_onboarding_itens WHERE id = ${itemId}
  `)[0];
  if (!cur) return fail(404, 'Item não encontrado.');

  let titulo = cur.titulo;
  if ('titulo' in body) {
    titulo = str(body.titulo, 500);
    if (!titulo) return fail(400, 'Informe o título do item.');
  }
  let prazo = cur.prazo;
  if ('prazo' in body) {
    if (body.prazo === null || body.prazo === '') prazo = null;
    else {
      prazo = dateOnly(body.prazo);
      if (!prazo) return fail(400, 'Prazo inválido.');
    }
  }
  let concluir = null;
  if ('concluido' in body) concluir = !!body.concluido;

  const uid = int(userId) ?? null;
  const rows = await sql`
    UPDATE rh_onboarding_itens SET
      titulo = ${titulo},
      prazo = ${prazo}::date,
      concluido_em = CASE
        WHEN ${concluir}::boolean IS NULL THEN concluido_em
        WHEN ${concluir}::boolean THEN COALESCE(concluido_em, NOW())
        ELSE NULL END,
      concluido_por = CASE
        WHEN ${concluir}::boolean IS NULL THEN concluido_por
        WHEN ${concluir}::boolean THEN COALESCE(concluido_por, ${uid}::bigint)
        ELSE NULL END,
      updated_at = NOW()
    WHERE id = ${itemId}
    RETURNING id, fase, titulo, to_char(prazo, 'YYYY-MM-DD') AS prazo, concluido_em, concluido_por
  `;
  await sql`UPDATE rh_onboardings SET updated_at = NOW() WHERE id = ${cur.onboarding_id}`;
  const r = rows[0];
  return {
    status: 200,
    data: {
      id: r.id,
      fase: r.fase,
      titulo: r.titulo,
      prazo: r.prazo,
      concluido: !!r.concluido_em,
      concluido_em: r.concluido_em,
      concluido_por: r.concluido_por === null ? null : Number(r.concluido_por),
    },
  };
}

export async function deleteItem(itemId) {
  if (!isUuid(itemId)) return false;
  await ensure();
  const sql = getSql();
  const rows = await sql`DELETE FROM rh_onboarding_itens WHERE id = ${itemId} RETURNING onboarding_id`;
  if (!rows[0]) return false;
  await sql`UPDATE rh_onboardings SET updated_at = NOW() WHERE id = ${rows[0].onboarding_id}`;
  return true;
}
