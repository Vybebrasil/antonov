import {
  getSql, createEnsure, getColaboradorAtivo, str, int, dateOnly,
} from './common.js';

/**
 * Metodologia trilha-aprendizagem-builder (4 camadas):
 * 1 Fundamentos (sempre obrigatórios) · 2 Especialização do nível · 3 Stretch do próximo nível · 4 Mentoria.
 * Referência de tempo: 4h + 8h + 4h + 2h = 18h/mês.
 * KPIs: camada 1 > 80% em 90 dias; camada 2 > 60% em 180 dias (contados a partir do início da atribuição).
 */
export const CAMADAS = {
  1: { nome: 'Fundamentos', descricao: 'Fundamentos obrigatórios', horas_mes_ref: 4 },
  2: { nome: 'Especialização', descricao: 'Especialização do nível', horas_mes_ref: 8 },
  3: { nome: 'Stretch', descricao: 'Stretch do próximo nível', horas_mes_ref: 4 },
  4: { nome: 'Mentoria', descricao: 'Mentoria estruturada', horas_mes_ref: 2 },
};
export const HORAS_MES_REF = 18;
export const KPIS = [
  { camada: 1, meta: 80, dias: 90 },
  { camada: 2, meta: 60, dias: 180 },
];
export const TIPOS = ['curso', 'livro', 'workshop', 'video', 'mentoria', 'pratica', 'certificacao'];
export const STATUS = ['ativa', 'concluida', 'pausada'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => UUID_RE.test(String(v || ''));

export class TrilhaError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const ensureTrilhasSchema = createEnsure(async (sql) => {
  await sql`
    CREATE TABLE IF NOT EXISTS rh_trilhas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      titulo TEXT NOT NULL,
      area TEXT,
      cargo_titulo TEXT,
      nivel_inicial TEXT,
      nivel_alvo TEXT,
      duracao_meses INTEGER,
      horas_mes INTEGER,
      orcamento_colaborador NUMERIC(12,2),
      descricao TEXT,
      ativa BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS rh_trilha_itens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trilha_id UUID NOT NULL REFERENCES rh_trilhas(id) ON DELETE CASCADE,
      camada INTEGER NOT NULL CHECK (camada BETWEEN 1 AND 4),
      tipo TEXT NOT NULL DEFAULT 'curso'
        CHECK (tipo IN ('curso','livro','workshop','video','mentoria','pratica','certificacao')),
      titulo TEXT NOT NULL,
      link TEXT,
      horas NUMERIC(6,1),
      custo NUMERIC(12,2),
      obrigatorio BOOLEAN NOT NULL DEFAULT FALSE,
      ordem INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS rh_trilha_itens_trilha_idx ON rh_trilha_itens (trilha_id, camada, ordem)`;
  await sql`
    CREATE TABLE IF NOT EXISTS rh_trilha_atribuicoes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trilha_id UUID NOT NULL REFERENCES rh_trilhas(id) ON DELETE CASCADE,
      colaborador_id UUID NOT NULL REFERENCES colaboradores_perfis(id) ON DELETE CASCADE,
      mentor_nome TEXT,
      inicio DATE,
      prazo DATE,
      status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','concluida','pausada')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (trilha_id, colaborador_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS rh_trilha_atrib_colab_idx ON rh_trilha_atribuicoes (colaborador_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS rh_trilha_progresso (
      atribuicao_id UUID NOT NULL REFERENCES rh_trilha_atribuicoes(id) ON DELETE CASCADE,
      item_id UUID NOT NULL REFERENCES rh_trilha_itens(id) ON DELETE CASCADE,
      concluido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      evidencia TEXT,
      PRIMARY KEY (atribuicao_id, item_id)
    )
  `;
});

/* ---------- utilidades ---------- */

function num(value, { min = -Infinity, max = Infinity } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') return ['true', '1', 'sim', 'on'].includes(value.toLowerCase());
  return Boolean(value);
}

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

const round1 = (n) => Math.round(n * 10) / 10;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

export function hojeISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function diasEntre(a, b) {
  return Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

function addMeses(iso, meses) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

function mapTrilha(r) {
  return {
    id: r.id,
    titulo: r.titulo,
    area: r.area,
    cargo_titulo: r.cargo_titulo,
    nivel_inicial: r.nivel_inicial,
    nivel_alvo: r.nivel_alvo,
    duracao_meses: r.duracao_meses == null ? null : Number(r.duracao_meses),
    horas_mes: r.horas_mes == null ? null : Number(r.horas_mes),
    orcamento_colaborador: r.orcamento_colaborador == null ? null : Number(r.orcamento_colaborador),
    descricao: r.descricao,
    ativa: r.ativa,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function mapItem(r) {
  return {
    id: r.id,
    trilha_id: r.trilha_id,
    camada: Number(r.camada),
    tipo: r.tipo,
    titulo: r.titulo,
    link: r.link,
    horas: r.horas == null ? null : Number(r.horas),
    custo: r.custo == null ? null : Number(r.custo),
    obrigatorio: r.obrigatorio,
    ordem: Number(r.ordem),
  };
}

/* ---------- cálculos ---------- */

function resumoItens(itens) {
  const camadas = {};
  for (const c of [1, 2, 3, 4]) camadas[c] = { itens: 0, horas: 0, custo: 0 };
  let horas = 0;
  let custo = 0;
  for (const it of itens) {
    const c = camadas[it.camada];
    c.itens += 1;
    c.horas += it.horas || 0;
    c.custo += it.custo || 0;
    horas += it.horas || 0;
    custo += it.custo || 0;
  }
  for (const c of Object.values(camadas)) {
    c.horas = round1(c.horas);
    c.custo = Math.round(c.custo * 100) / 100;
  }
  return { itens: itens.length, horas: round1(horas), custo: Math.round(custo * 100) / 100, camadas };
}

function kpiStatus({ meta, dias }, pctCamada, totalCamada, diasDecorridos) {
  if (!totalCamada) return { status: 'sem_itens', esperado: null };
  if (pctCamada >= meta) return { status: 'atingido', esperado: meta };
  if (diasDecorridos == null) return { status: 'no_ritmo', esperado: 0 };
  if (diasDecorridos >= dias) return { status: 'nao_atingido', esperado: meta };
  const esperado = Math.round((meta * Math.max(0, diasDecorridos)) / dias);
  return { status: pctCamada >= esperado ? 'no_ritmo' : 'fora_ritmo', esperado };
}

/** Progresso de uma atribuição a partir dos itens da trilha e das conclusões. */
function calcProgresso(atrib, itens, progressoRows, hoje) {
  const feitos = new Map(progressoRows.map((p) => [p.item_id, p]));
  const camadas = {};
  for (const c of [1, 2, 3, 4]) camadas[c] = { total: 0, concluidos: 0, pct: 0, horas_total: 0, horas_concluidas: 0 };
  let concluidos = 0;
  let horasTotal = 0;
  let horasConcluidas = 0;
  const checklist = itens.map((it) => {
    const p = feitos.get(it.id);
    const c = camadas[it.camada];
    c.total += 1;
    c.horas_total += it.horas || 0;
    horasTotal += it.horas || 0;
    if (p) {
      c.concluidos += 1;
      c.horas_concluidas += it.horas || 0;
      concluidos += 1;
      horasConcluidas += it.horas || 0;
    }
    return {
      item_id: it.id,
      concluido: Boolean(p),
      concluido_em: p ? p.concluido_em : null,
      evidencia: p ? p.evidencia : null,
    };
  });
  for (const c of Object.values(camadas)) {
    c.pct = pct(c.concluidos, c.total);
    c.horas_total = round1(c.horas_total);
    c.horas_concluidas = round1(c.horas_concluidas);
  }
  const diasDecorridos = atrib.inicio ? diasEntre(atrib.inicio, hoje) : null;
  const kpis = KPIS.map((k) => {
    const c = camadas[k.camada];
    return { ...k, pct: c.pct, ...kpiStatus(k, c.pct, c.total, diasDecorridos) };
  });
  const geral = pct(concluidos, itens.length);
  const prazoVencido = Boolean(atrib.prazo && atrib.status !== 'concluida' && atrib.prazo < hoje && geral < 100);
  const proximos = itens
    .filter((it) => !feitos.has(it.id))
    .slice(0, 3)
    .map((it) => ({ id: it.id, titulo: it.titulo, camada: it.camada, tipo: it.tipo, obrigatorio: it.obrigatorio }));
  const fora = kpis.some((k) => k.status === 'fora_ritmo' || k.status === 'nao_atingido');
  return {
    total: itens.length,
    concluidos,
    pct: geral,
    horas_total: round1(horasTotal),
    horas_concluidas: round1(horasConcluidas),
    camadas,
    kpis,
    dias_decorridos: diasDecorridos,
    prazo_vencido: prazoVencido,
    no_ritmo: atrib.status === 'concluida' || !fora,
    proximos,
    checklist,
  };
}

function dicasTrilha(trilha, resumo) {
  const dicas = [];
  const { camadas } = resumo;
  if (!resumo.itens) {
    dicas.push({ nivel: 'warn', texto: 'Trilha sem itens: adicione conteúdos nas 4 camadas.' });
    return dicas;
  }
  for (const c of [1, 2, 3]) {
    if (!camadas[c].itens) dicas.push({ nivel: 'warn', texto: `Camada ${c} (${CAMADAS[c].nome}) está vazia.` });
  }
  if (!camadas[4].itens) {
    dicas.push({ nivel: 'warn', texto: 'Sem camada de mentoria: mentoria não é bônus, é camada essencial (1:1 quinzenal).' });
  }
  if (!trilha.horas_mes) {
    dicas.push({ nivel: 'warn', texto: 'Sem tempo protegido definido (h/mês): sem agenda reservada, ninguém termina a trilha.' });
  } else if (trilha.horas_mes < HORAS_MES_REF) {
    dicas.push({ nivel: 'info', texto: `Tempo protegido de ${trilha.horas_mes}h/mês abaixo da referência de ${HORAS_MES_REF}h/mês (4h fundamentos + 8h especialização + 4h stretch + 2h mentoria).` });
  }
  if (trilha.horas_mes && trilha.duracao_meses && resumo.horas > trilha.horas_mes * trilha.duracao_meses) {
    dicas.push({ nivel: 'warn', texto: `Carga total (${resumo.horas}h) maior que o tempo disponível (${trilha.horas_mes}h × ${trilha.duracao_meses} meses = ${trilha.horas_mes * trilha.duracao_meses}h).` });
  }
  if (trilha.orcamento_colaborador != null && resumo.custo > trilha.orcamento_colaborador) {
    dicas.push({ nivel: 'warn', texto: 'Custo dos itens acima do orçamento por colaborador.' });
  }
  return dicas;
}

function dicasItens(itens) {
  const dicas = [];
  if (itens.length && !itens.some((i) => i.tipo === 'pratica' || i.tipo === 'workshop')) {
    dicas.push({ nivel: 'info', texto: 'Nenhum item prático ou workshop: conteúdo sem aplicação em 30 dias é esquecido.' });
  }
  if (itens.some((i) => i.camada === 1 && !i.obrigatorio)) {
    dicas.push({ nivel: 'info', texto: 'Há fundamentos (camada 1) marcados como opcionais: pela metodologia, eles são sempre obrigatórios.' });
  }
  return dicas;
}

/* ---------- carregamento ---------- */

async function loadItens(sql, trilhaIds) {
  if (!trilhaIds.length) return [];
  const rows = await sql`
    SELECT * FROM rh_trilha_itens
    WHERE trilha_id = ANY(${trilhaIds})
    ORDER BY camada ASC, ordem ASC, created_at ASC
  `;
  return rows.map(mapItem);
}

async function loadAtribuicoes(sql, { trilhaIds = null, colaboradorId = null, atribuicaoId = null } = {}) {
  const rows = await sql`
    SELECT a.id, a.trilha_id, a.colaborador_id, a.mentor_nome, a.status,
           to_char(a.inicio, 'YYYY-MM-DD') AS inicio,
           to_char(a.prazo, 'YYYY-MM-DD') AS prazo,
           a.created_at, a.updated_at,
           c.nome AS colaborador_nome, c.cargo_atual AS colaborador_cargo
    FROM rh_trilha_atribuicoes a
    JOIN colaboradores_perfis c ON c.id = a.colaborador_id AND c.deleted_at IS NULL
    WHERE (${trilhaIds}::uuid[] IS NULL OR a.trilha_id = ANY(${trilhaIds}::uuid[]))
      AND (${colaboradorId}::uuid IS NULL OR a.colaborador_id = ${colaboradorId}::uuid)
      AND (${atribuicaoId}::uuid IS NULL OR a.id = ${atribuicaoId}::uuid)
    ORDER BY c.nome ASC
  `;
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const prog = await sql`
    SELECT atribuicao_id, item_id, concluido_em, evidencia
    FROM rh_trilha_progresso WHERE atribuicao_id = ANY(${ids})
  `;
  const byAtrib = new Map();
  for (const p of prog) {
    if (!byAtrib.has(p.atribuicao_id)) byAtrib.set(p.atribuicao_id, []);
    byAtrib.get(p.atribuicao_id).push(p);
  }
  return rows.map((r) => ({ ...r, _progresso: byAtrib.get(r.id) || [] }));
}

function montarAtribuicao(a, itens, hoje) {
  const { _progresso, ...rest } = a;
  const progresso = calcProgresso(rest, itens, _progresso, hoje);
  const alertas = [];
  if (!rest.mentor_nome) alertas.push('Sem mentor designado: sem accountability.');
  if (progresso.prazo_vencido) alertas.push('Prazo vencido.');
  for (const k of progresso.kpis) {
    if (rest.status === 'concluida') break;
    if (k.status === 'fora_ritmo') alertas.push(`Camada ${k.camada} fora do ritmo: ${k.pct}% (esperado ${k.esperado}% hoje; meta ${k.meta}% em ${k.dias} dias).`);
    if (k.status === 'nao_atingido') alertas.push(`Meta da camada ${k.camada} não atingida: ${k.pct}% (meta ${k.meta}% em ${k.dias} dias).`);
  }
  return { ...rest, progresso, alertas };
}

function agregarAtribuicoes(atribs) {
  const considerar = atribs.filter((a) => a.status !== 'pausada');
  const media = (arr) => (arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : null);
  return {
    atribuidos: atribs.length,
    conclusao_media: media(considerar.map((a) => a.progresso.pct)),
    camada1_media: media(considerar.map((a) => a.progresso.camadas[1].pct)),
    camada2_media: media(considerar.map((a) => a.progresso.camadas[2].pct)),
    atrasadas: atribs.filter((a) => a.progresso.prazo_vencido).length,
    fora_ritmo: atribs.filter((a) => a.status === 'ativa' && !a.progresso.no_ritmo).length,
    sem_mentor: atribs.filter((a) => a.status !== 'concluida' && !a.mentor_nome).length,
  };
}

/* ---------- trilhas ---------- */

export async function listTrilhas() {
  await ensureTrilhasSchema();
  const sql = getSql();
  const trilhas = (await sql`SELECT * FROM rh_trilhas ORDER BY ativa DESC, titulo ASC`).map(mapTrilha);
  const ids = trilhas.map((t) => t.id);
  const itens = await loadItens(sql, ids);
  const atribsRaw = ids.length ? await loadAtribuicoes(sql, { trilhaIds: ids }) : [];
  const hoje = hojeISO();

  const itensPor = new Map(ids.map((id) => [id, []]));
  for (const it of itens) itensPor.get(it.trilha_id)?.push(it);

  const atribsPor = new Map(ids.map((id) => [id, []]));
  for (const a of atribsRaw) atribsPor.get(a.trilha_id)?.push(montarAtribuicao(a, itensPor.get(a.trilha_id) || [], hoje));

  const lista = trilhas.map((t) => {
    const resumo = resumoItens(itensPor.get(t.id));
    const atribs = atribsPor.get(t.id);
    const agg = agregarAtribuicoes(atribs);
    return {
      ...t,
      itens: resumo.itens,
      horas_total: resumo.horas,
      custo_total: resumo.custo,
      camadas: resumo.camadas,
      ...agg,
      dicas_count: [...dicasTrilha(t, resumo), ...dicasItens(itensPor.get(t.id))].length,
    };
  });

  const ativasAtribs = trilhas
    .filter((t) => t.ativa)
    .flatMap((t) => atribsPor.get(t.id))
    .filter((a) => a.status !== 'pausada');
  const resumo = {
    trilhas_ativas: trilhas.filter((t) => t.ativa).length,
    atribuicoes: ativasAtribs.length,
    conclusao_media: ativasAtribs.length
      ? Math.round(ativasAtribs.reduce((s, a) => s + a.progresso.pct, 0) / ativasAtribs.length)
      : null,
    atrasadas: ativasAtribs.filter((a) => a.progresso.prazo_vencido).length,
    fora_ritmo: ativasAtribs.filter((a) => a.status === 'ativa' && !a.progresso.no_ritmo).length,
    atrasadas_lista: ativasAtribs
      .filter((a) => a.progresso.prazo_vencido)
      .slice(0, 5)
      .map((a) => ({
        id: a.id,
        trilha_id: a.trilha_id,
        trilha_titulo: trilhas.find((t) => t.id === a.trilha_id)?.titulo,
        colaborador_id: a.colaborador_id,
        colaborador_nome: a.colaborador_nome,
        prazo: a.prazo,
        pct: a.progresso.pct,
      })),
  };
  return { trilhas: lista, resumo };
}

export async function getTrilha(id) {
  if (!isUuid(id)) return null;
  await ensureTrilhasSchema();
  const sql = getSql();
  const row = (await sql`SELECT * FROM rh_trilhas WHERE id = ${id}`)[0];
  if (!row) return null;
  const trilha = mapTrilha(row);
  const itens = await loadItens(sql, [id]);
  const hoje = hojeISO();
  const atribuicoes = (await loadAtribuicoes(sql, { trilhaIds: [id] })).map((a) => montarAtribuicao(a, itens, hoje));
  const resumo = resumoItens(itens);
  const duracao = trilha.duracao_meses || 0;
  const referencia = {};
  for (const c of [1, 2, 3, 4]) {
    referencia[c] = { horas_mes: CAMADAS[c].horas_mes_ref, horas_periodo: duracao ? CAMADAS[c].horas_mes_ref * duracao : null };
  }
  const camadas = [1, 2, 3, 4].map((c) => ({
    camada: c,
    ...CAMADAS[c],
    ...resumo.camadas[c],
    horas_ref_periodo: referencia[c].horas_periodo,
    itens: itens.filter((i) => i.camada === c),
  }));
  return {
    ...trilha,
    camadas,
    orcamento: {
      custo_total: resumo.custo,
      horas_total: resumo.horas,
      orcamento_colaborador: trilha.orcamento_colaborador,
      saldo: trilha.orcamento_colaborador == null ? null : Math.round((trilha.orcamento_colaborador - resumo.custo) * 100) / 100,
      por_tipo: TIPOS.map((tipo) => ({
        tipo,
        custo: Math.round(itens.filter((i) => i.tipo === tipo).reduce((s, i) => s + (i.custo || 0), 0) * 100) / 100,
        horas: round1(itens.filter((i) => i.tipo === tipo).reduce((s, i) => s + (i.horas || 0), 0)),
      })).filter((x) => x.custo || x.horas),
      tempo_disponivel: trilha.horas_mes && trilha.duracao_meses ? trilha.horas_mes * trilha.duracao_meses : null,
    },
    atribuicoes,
    indicadores: agregarAtribuicoes(atribuicoes),
    kpis_ref: KPIS,
    dicas: [...dicasTrilha(trilha, resumo), ...dicasItens(itens)],
    riscos: [
      'Trilha sem tempo protegido: ninguém termina.',
      'Conteúdo sem aplicação prática: o aprendizado não se consolida.',
      'Sem mentor designado: sem accountability.',
      'Curador externo sem contexto da academia: relevância baixa.',
    ],
  };
}

function trilhaFields(body, base = {}) {
  const pick = (k, fn) => (has(body, k) ? fn(body[k]) : base[k] ?? null);
  return {
    titulo: has(body, 'titulo') ? str(body.titulo, 200) : base.titulo,
    area: pick('area', (v) => str(v, 120)),
    cargo_titulo: pick('cargo_titulo', (v) => str(v, 200)),
    nivel_inicial: pick('nivel_inicial', (v) => str(v, 80)),
    nivel_alvo: pick('nivel_alvo', (v) => str(v, 80)),
    duracao_meses: pick('duracao_meses', (v) => int(v, { min: 1, max: 60 })),
    horas_mes: pick('horas_mes', (v) => int(v, { min: 0, max: 300 })),
    orcamento_colaborador: pick('orcamento_colaborador', (v) => num(v, { min: 0, max: 9999999999 })),
    descricao: pick('descricao', (v) => str(v, 5000)),
    ativa: has(body, 'ativa') ? bool(body.ativa, true) : (base.ativa ?? true),
  };
}

export async function createTrilha(body) {
  await ensureTrilhasSchema();
  const f = trilhaFields(body);
  if (!f.titulo) throw new TrilhaError(400, 'Informe o título da trilha.');
  const sql = getSql();
  const row = (await sql`
    INSERT INTO rh_trilhas (titulo, area, cargo_titulo, nivel_inicial, nivel_alvo, duracao_meses, horas_mes,
      orcamento_colaborador, descricao, ativa)
    VALUES (${f.titulo}, ${f.area}, ${f.cargo_titulo}, ${f.nivel_inicial}, ${f.nivel_alvo}, ${f.duracao_meses},
      ${f.horas_mes}, ${f.orcamento_colaborador}, ${f.descricao}, ${f.ativa})
    RETURNING *
  `)[0];
  return mapTrilha(row);
}

export async function updateTrilha(id, body) {
  if (!isUuid(id)) return null;
  await ensureTrilhasSchema();
  const sql = getSql();
  const cur = (await sql`SELECT * FROM rh_trilhas WHERE id = ${id}`)[0];
  if (!cur) return null;
  const f = trilhaFields(body, mapTrilha(cur));
  if (!f.titulo) throw new TrilhaError(400, 'O título da trilha não pode ficar vazio.');
  const row = (await sql`
    UPDATE rh_trilhas SET
      titulo = ${f.titulo}, area = ${f.area}, cargo_titulo = ${f.cargo_titulo},
      nivel_inicial = ${f.nivel_inicial}, nivel_alvo = ${f.nivel_alvo},
      duracao_meses = ${f.duracao_meses}, horas_mes = ${f.horas_mes},
      orcamento_colaborador = ${f.orcamento_colaborador}, descricao = ${f.descricao},
      ativa = ${f.ativa}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `)[0];
  return mapTrilha(row);
}

export async function deleteTrilha(id) {
  if (!isUuid(id)) return false;
  await ensureTrilhasSchema();
  const sql = getSql();
  const rows = await sql`DELETE FROM rh_trilhas WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

/* ---------- itens ---------- */

function itemFields(body, base = {}) {
  const pick = (k, fn) => (has(body, k) ? fn(body[k]) : base[k] ?? null);
  const camada = has(body, 'camada') ? int(body.camada, { min: -999, max: 999 }) : base.camada;
  const tipo = has(body, 'tipo') ? String(body.tipo || '').trim() || 'curso' : (base.tipo || 'curso');
  return {
    camada,
    tipo,
    titulo: has(body, 'titulo') ? str(body.titulo, 300) : base.titulo,
    link: pick('link', (v) => str(v, 1000)),
    horas: pick('horas', (v) => num(v, { min: 0, max: 99999 })),
    custo: pick('custo', (v) => num(v, { min: 0, max: 9999999999 })),
    obrigatorio: has(body, 'obrigatorio') ? bool(body.obrigatorio) : (base.obrigatorio ?? camada === 1),
    ordem: has(body, 'ordem') ? int(body.ordem, { min: 0, max: 100000 }) : base.ordem,
  };
}

function validarItem(f) {
  if (!f.camada || f.camada < 1 || f.camada > 4) throw new TrilhaError(400, 'Camada inválida (use 1 a 4).');
  if (!TIPOS.includes(f.tipo)) throw new TrilhaError(400, `Tipo inválido. Use: ${TIPOS.join(', ')}.`);
  if (!f.titulo) throw new TrilhaError(400, 'Informe o título do item.');
  if (f.link && !/^https?:\/\//i.test(f.link)) throw new TrilhaError(400, 'O link deve começar com http:// ou https://.');
}

export async function createItem(trilhaId, body) {
  if (!isUuid(trilhaId)) return null;
  await ensureTrilhasSchema();
  const sql = getSql();
  const t = (await sql`SELECT id FROM rh_trilhas WHERE id = ${trilhaId}`)[0];
  if (!t) return null;
  const f = itemFields(body);
  validarItem(f);
  if (f.ordem == null) {
    const m = (await sql`
      SELECT COALESCE(MAX(ordem), -1) AS m FROM rh_trilha_itens WHERE trilha_id = ${trilhaId} AND camada = ${f.camada}
    `)[0];
    f.ordem = Number(m.m) + 1;
  }
  const row = (await sql`
    INSERT INTO rh_trilha_itens (trilha_id, camada, tipo, titulo, link, horas, custo, obrigatorio, ordem)
    VALUES (${trilhaId}, ${f.camada}, ${f.tipo}, ${f.titulo}, ${f.link}, ${f.horas}, ${f.custo}, ${f.obrigatorio}, ${f.ordem})
    RETURNING *
  `)[0];
  await sql`UPDATE rh_trilhas SET updated_at = NOW() WHERE id = ${trilhaId}`;
  return mapItem(row);
}

export async function updateItem(itemId, body) {
  if (!isUuid(itemId)) return null;
  await ensureTrilhasSchema();
  const sql = getSql();
  const cur = (await sql`SELECT * FROM rh_trilha_itens WHERE id = ${itemId}`)[0];
  if (!cur) return null;
  const base = mapItem(cur);
  if (body.mover === 'cima' || body.mover === 'baixo') return moverItem(sql, base, body.mover);
  const f = itemFields(body, base);
  validarItem(f);
  if (f.camada !== base.camada && !has(body, 'ordem')) {
    const m = (await sql`
      SELECT COALESCE(MAX(ordem), -1) AS m FROM rh_trilha_itens WHERE trilha_id = ${base.trilha_id} AND camada = ${f.camada}
    `)[0];
    f.ordem = Number(m.m) + 1;
  }
  const row = (await sql`
    UPDATE rh_trilha_itens SET
      camada = ${f.camada}, tipo = ${f.tipo}, titulo = ${f.titulo}, link = ${f.link},
      horas = ${f.horas}, custo = ${f.custo}, obrigatorio = ${f.obrigatorio}, ordem = ${f.ordem ?? 0},
      updated_at = NOW()
    WHERE id = ${itemId}
    RETURNING *
  `)[0];
  return mapItem(row);
}

async function moverItem(sql, item, direcao) {
  const irmaos = (await sql`
    SELECT id FROM rh_trilha_itens
    WHERE trilha_id = ${item.trilha_id} AND camada = ${item.camada}
    ORDER BY ordem ASC, created_at ASC
  `).map((r) => r.id);
  const i = irmaos.indexOf(item.id);
  const j = direcao === 'cima' ? i - 1 : i + 1;
  if (i >= 0 && j >= 0 && j < irmaos.length) [irmaos[i], irmaos[j]] = [irmaos[j], irmaos[i]];
  await sql`
    UPDATE rh_trilha_itens t SET ordem = x.ordem, updated_at = NOW()
    FROM unnest(${irmaos}::uuid[], ${irmaos.map((_, k) => k)}::int[]) AS x(id, ordem)
    WHERE t.id = x.id
  `;
  const row = (await sql`SELECT * FROM rh_trilha_itens WHERE id = ${item.id}`)[0];
  return mapItem(row);
}

export async function deleteItem(itemId) {
  if (!isUuid(itemId)) return false;
  await ensureTrilhasSchema();
  const sql = getSql();
  const rows = await sql`DELETE FROM rh_trilha_itens WHERE id = ${itemId} RETURNING id`;
  return rows.length > 0;
}

/* ---------- atribuições ---------- */

export async function createAtribuicao(trilhaId, body) {
  if (!isUuid(trilhaId)) throw new TrilhaError(404, 'Trilha não encontrada.');
  await ensureTrilhasSchema();
  const sql = getSql();
  const t = (await sql`SELECT id, duracao_meses, ativa FROM rh_trilhas WHERE id = ${trilhaId}`)[0];
  if (!t) throw new TrilhaError(404, 'Trilha não encontrada.');
  const colaboradorId = String(body.colaborador_id || '');
  if (!isUuid(colaboradorId)) throw new TrilhaError(400, 'Selecione o colaborador.');
  const col = await getColaboradorAtivo(colaboradorId);
  if (!col) throw new TrilhaError(404, 'Colaborador não encontrado.');

  const existe = (await sql`
    SELECT id FROM rh_trilha_atribuicoes WHERE trilha_id = ${trilhaId} AND colaborador_id = ${colaboradorId}
  `)[0];
  if (existe) throw new TrilhaError(409, 'Esta trilha já está atribuída a este colaborador.');

  const inicio = dateOnly(body.inicio) || hojeISO();
  let prazo = dateOnly(body.prazo);
  if (!prazo && t.duracao_meses) prazo = addMeses(inicio, Number(t.duracao_meses));
  if (prazo && prazo < inicio) throw new TrilhaError(400, 'O prazo não pode ser anterior ao início.');
  const status = body.status && STATUS.includes(body.status) ? body.status : 'ativa';

  let row;
  try {
    row = (await sql`
      INSERT INTO rh_trilha_atribuicoes (trilha_id, colaborador_id, mentor_nome, inicio, prazo, status)
      VALUES (${trilhaId}, ${colaboradorId}, ${str(body.mentor_nome, 200)}, ${inicio}, ${prazo}, ${status})
      RETURNING id
    `)[0];
  } catch (err) {
    if (err?.code === '23505') throw new TrilhaError(409, 'Esta trilha já está atribuída a este colaborador.');
    throw err;
  }
  return getAtribuicao(row.id);
}

export async function getAtribuicao(id) {
  if (!isUuid(id)) return null;
  await ensureTrilhasSchema();
  const sql = getSql();
  const a = (await loadAtribuicoes(sql, { atribuicaoId: id }))[0];
  if (!a) return null;
  const itens = await loadItens(sql, [a.trilha_id]);
  return montarAtribuicao(a, itens, hojeISO());
}

export async function updateAtribuicao(id, body) {
  if (!isUuid(id)) return null;
  await ensureTrilhasSchema();
  const sql = getSql();
  const cur = (await sql`
    SELECT id, mentor_nome, status, to_char(inicio, 'YYYY-MM-DD') AS inicio, to_char(prazo, 'YYYY-MM-DD') AS prazo
    FROM rh_trilha_atribuicoes WHERE id = ${id}
  `)[0];
  if (!cur) return null;
  const mentor = has(body, 'mentor_nome') ? str(body.mentor_nome, 200) : cur.mentor_nome;
  const inicio = has(body, 'inicio') ? dateOnly(body.inicio) : cur.inicio;
  const prazo = has(body, 'prazo') ? dateOnly(body.prazo) : cur.prazo;
  let status = cur.status;
  if (has(body, 'status')) {
    if (!STATUS.includes(body.status)) throw new TrilhaError(400, 'Status inválido (ativa, concluida ou pausada).');
    status = body.status;
  }
  if (inicio && prazo && prazo < inicio) throw new TrilhaError(400, 'O prazo não pode ser anterior ao início.');
  await sql`
    UPDATE rh_trilha_atribuicoes SET
      mentor_nome = ${mentor}, inicio = ${inicio}, prazo = ${prazo}, status = ${status}, updated_at = NOW()
    WHERE id = ${id}
  `;
  return getAtribuicao(id);
}

export async function deleteAtribuicao(id) {
  if (!isUuid(id)) return false;
  await ensureTrilhasSchema();
  const sql = getSql();
  const rows = await sql`DELETE FROM rh_trilha_atribuicoes WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function setProgresso(atribuicaoId, itemId, body) {
  if (!isUuid(atribuicaoId)) throw new TrilhaError(404, 'Atribuição não encontrada.');
  if (!isUuid(itemId)) throw new TrilhaError(404, 'Item não encontrado.');
  await ensureTrilhasSchema();
  const sql = getSql();
  const a = (await sql`SELECT id, trilha_id FROM rh_trilha_atribuicoes WHERE id = ${atribuicaoId}`)[0];
  if (!a) throw new TrilhaError(404, 'Atribuição não encontrada.');
  const it = (await sql`SELECT id, trilha_id FROM rh_trilha_itens WHERE id = ${itemId}`)[0];
  if (!it) throw new TrilhaError(404, 'Item não encontrado.');
  if (it.trilha_id !== a.trilha_id) throw new TrilhaError(400, 'O item não pertence à trilha desta atribuição.');
  if (!has(body, 'concluido')) throw new TrilhaError(400, 'Informe se o item foi concluído.');

  if (bool(body.concluido)) {
    const evidencia = str(body.evidencia, 2000);
    await sql`
      INSERT INTO rh_trilha_progresso (atribuicao_id, item_id, evidencia)
      VALUES (${atribuicaoId}, ${itemId}, ${evidencia})
      ON CONFLICT (atribuicao_id, item_id) DO UPDATE SET evidencia = EXCLUDED.evidencia
    `;
  } else {
    await sql`DELETE FROM rh_trilha_progresso WHERE atribuicao_id = ${atribuicaoId} AND item_id = ${itemId}`;
  }
  await sql`UPDATE rh_trilha_atribuicoes SET updated_at = NOW() WHERE id = ${atribuicaoId}`;
  return getAtribuicao(atribuicaoId);
}

export async function trilhasDoColaborador(colaboradorId) {
  if (!isUuid(colaboradorId)) return null;
  await ensureTrilhasSchema();
  const col = await getColaboradorAtivo(colaboradorId);
  if (!col) return null;
  const sql = getSql();
  const atribs = await loadAtribuicoes(sql, { colaboradorId });
  if (!atribs.length) return [];
  const trilhaIds = [...new Set(atribs.map((a) => a.trilha_id))];
  const trilhas = (await sql`SELECT * FROM rh_trilhas WHERE id = ANY(${trilhaIds})`).map(mapTrilha);
  const itens = await loadItens(sql, trilhaIds);
  const hoje = hojeISO();
  return atribs.map((a) => {
    const t = trilhas.find((x) => x.id === a.trilha_id);
    const its = itens.filter((i) => i.trilha_id === a.trilha_id);
    const m = montarAtribuicao(a, its, hoje);
    return {
      ...m,
      trilha: t ? {
        id: t.id, titulo: t.titulo, cargo_titulo: t.cargo_titulo, nivel_inicial: t.nivel_inicial,
        nivel_alvo: t.nivel_alvo, horas_mes: t.horas_mes, ativa: t.ativa,
      } : null,
      itens: its,
    };
  }).sort((x, y) => (x.status === 'ativa' ? 0 : 1) - (y.status === 'ativa' ? 0 : 1));
}

/* ---------- modelos ---------- */

const it = (camada, tipo, titulo, horas, obrigatorio = camada === 1) => ({ camada, tipo, titulo, horas, obrigatorio });

export const MODELOS = {
  'musculacao-junior-pleno': {
    titulo: 'Professor de musculação: júnior → pleno',
    area: 'Musculação',
    cargo_titulo: 'Professor de musculação',
    nivel_inicial: 'Júnior',
    nivel_alvo: 'Pleno',
    duracao_meses: 6,
    horas_mes: 18,
    descricao: 'Base técnica e de segurança para o atendimento no salão, aprofundamento em prescrição e periodização e primeiros sinais do nível pleno (avaliação, carteira de alunos e retenção). Preencha custos e links conforme os fornecedores escolhidos.',
    itens: [
      it(1, 'curso', 'Curso de primeiros socorros e suporte básico de vida (RCP e uso do DEA)', 8),
      it(1, 'livro', 'Livro: Fisiologia do Exercício (William D. McArdle, Frank I. Katch e Victor L. Katch)', 20),
      it(1, 'workshop', 'Workshop interno: padrões da academia para anamnese, avaliação física e montagem de treino', 4),
      it(1, 'pratica', 'Prática supervisionada: correção de execução nos exercícios básicos (agachamento, levantamento terra, supino e remada)', 8),
      it(2, 'livro', 'Livro: Ciência e Prática do Treinamento de Força (Vladimir M. Zatsiorsky e William J. Kraemer)', 15, true),
      it(2, 'curso', 'Curso de periodização do treinamento de força e hipertrofia', 20, true),
      it(2, 'curso', 'Curso de treinamento para grupos especiais (idosos, gestantes, hipertensos e diabéticos)', 16),
      it(2, 'pratica', 'Prática: montar e revisar 10 programas de treino com o coordenador técnico', 10, true),
      it(3, 'certificacao', 'Certificação em treinamento funcional', 24),
      it(3, 'pratica', 'Prática: conduzir avaliação e reavaliação física de uma carteira de alunos por um trimestre', 12),
      it(3, 'workshop', 'Workshop interno: retenção de alunos e acompanhamento de resultados', 4),
      it(4, 'mentoria', 'Mentoria 1:1 quinzenal com professor sênior ou coordenador técnico (60 min)', 12, true),
    ],
  },
  'recepcao-atendimento-vendas': {
    titulo: 'Recepção: atendimento e vendas',
    area: 'Recepção',
    cargo_titulo: 'Recepcionista',
    nivel_inicial: 'Iniciante',
    nivel_alvo: 'Consultor(a) de vendas',
    duracao_meses: 4,
    horas_mes: 18,
    descricao: 'Rotina da recepção, atendimento ao aluno e técnicas de venda de planos, com stretch para negociação e reativação de ex-alunos. Preencha custos e links conforme os fornecedores escolhidos.',
    itens: [
      it(1, 'workshop', 'Workshop interno: sistema de gestão, planos, preços e políticas da academia', 4),
      it(1, 'pratica', 'Prática acompanhada: check-in, cadastro de alunos, abertura e fechamento de caixa', 6),
      it(1, 'curso', 'Curso de noções de primeiros socorros e acionamento de emergência', 4),
      it(1, 'curso', 'Curso de LGPD aplicada ao atendimento (dados de alunos)', 3),
      it(2, 'livro', 'Livro: Como Fazer Amigos e Influenciar Pessoas (Dale Carnegie)', 8),
      it(2, 'curso', 'Curso de técnicas de vendas e negociação', 12, true),
      it(2, 'workshop', 'Workshop interno: roteiro de visita guiada e apresentação de planos (com simulação)', 4, true),
      it(2, 'pratica', 'Prática: acompanhamento de leads e retorno de visitas não convertidas', 8),
      it(3, 'livro', 'Livro: Comunicação Não-Violenta (Marshall B. Rosenberg)', 8),
      it(3, 'curso', 'Curso de atendimento ao cliente e gestão de reclamações', 8),
      it(3, 'pratica', 'Prática: campanha de reativação de ex-alunos com meta definida', 6),
      it(4, 'mentoria', 'Mentoria 1:1 quinzenal com a coordenação da recepção ou comercial (60 min)', 8, true),
    ],
  },
  'lideranca-equipe': {
    titulo: 'Liderança de equipe',
    area: 'Coordenação',
    cargo_titulo: 'Coordenador(a)',
    nivel_inicial: 'Professor(a) sênior',
    nivel_alvo: 'Coordenador(a)',
    duracao_meses: 6,
    horas_mes: 18,
    descricao: 'Transição de especialista para líder: rotinas de gestão, feedback e 1:1, indicadores da unidade e, como stretch, finanças e recrutamento. Preencha custos e links conforme os fornecedores escolhidos.',
    itens: [
      it(1, 'workshop', 'Workshop interno: papel do coordenador, indicadores da academia e rotinas de gestão', 4),
      it(1, 'livro', 'Livro: O Monge e o Executivo (James C. Hunter)', 6),
      it(1, 'curso', 'Curso de feedback e condução de reuniões 1:1', 8),
      it(1, 'curso', 'Curso de legislação trabalhista básica para gestores', 6),
      it(2, 'livro', 'Livro: Os 5 Desafios das Equipes (Patrick Lencioni)', 6),
      it(2, 'livro', 'Livro: Conversas Difíceis (Douglas Stone, Bruce Patton e Sheila Heen)', 8),
      it(2, 'curso', 'Curso de gestão de escalas, metas e indicadores', 12, true),
      it(2, 'pratica', 'Prática: conduzir 1:1 quinzenais com a equipe por 3 meses', 12, true),
      it(3, 'curso', 'Curso de gestão financeira para pequenos negócios', 16),
      it(3, 'pratica', 'Prática: elaborar e apresentar o plano de ação trimestral da unidade', 8),
      it(3, 'workshop', 'Workshop interno: recrutamento, seleção e integração de novos professores', 4),
      it(4, 'mentoria', 'Mentoria 1:1 quinzenal com gestor ou sócio da academia (60 min)', 12, true),
    ],
  },
};

export function listModelos() {
  return Object.entries(MODELOS).map(([chave, m]) => {
    const camadas = {};
    for (const c of [1, 2, 3, 4]) camadas[c] = m.itens.filter((i) => i.camada === c).length;
    return {
      chave,
      titulo: m.titulo,
      area: m.area,
      cargo_titulo: m.cargo_titulo,
      nivel_inicial: m.nivel_inicial,
      nivel_alvo: m.nivel_alvo,
      duracao_meses: m.duracao_meses,
      horas_mes: m.horas_mes,
      descricao: m.descricao,
      itens: m.itens.length,
      horas_total: round1(m.itens.reduce((s, i) => s + i.horas, 0)),
      camadas,
      lista: m.itens.map((i) => ({ camada: i.camada, tipo: i.tipo, titulo: i.titulo, horas: i.horas })),
    };
  });
}

export async function createFromModelo(chave) {
  const m = MODELOS[chave];
  if (!m) return null;
  const { itens, ...dados } = m;
  const trilha = await createTrilha(dados);
  const sql = getSql();
  const ordemPor = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const ordens = itens.map((i) => ordemPor[i.camada]++);
  await sql`
    INSERT INTO rh_trilha_itens (trilha_id, camada, tipo, titulo, horas, obrigatorio, ordem)
    SELECT ${trilha.id}::uuid, x.camada, x.tipo, x.titulo, x.horas, x.obrigatorio, x.ordem
    FROM unnest(
      ${itens.map((i) => i.camada)}::int[],
      ${itens.map((i) => i.tipo)}::text[],
      ${itens.map((i) => i.titulo)}::text[],
      ${itens.map((i) => i.horas)}::numeric[],
      ${itens.map((i) => i.obrigatorio)}::boolean[],
      ${ordens}::int[]
    ) AS x(camada, tipo, titulo, horas, obrigatorio, ordem)
  `;
  return trilha;
}
