import { getSql, createEnsure, str } from './common.js';

export const NIVEIS = ['estagiário', 'júnior', 'pleno', 'sênior', 'especialista', 'coordenação', 'gerência'];

export const CBO_URL = 'https://cbo.mte.gov.br';

/** Códigos oficiais da CBO 2002 relevantes para uma academia. Confira sempre em cbo.mte.gov.br. */
export const CBO_CATALOGO = [
  { codigo: '2241-05', titulo: 'Avaliador físico', familia: 'Profissionais da educação física', area: 'Técnica' },
  { codigo: '2241-10', titulo: 'Ludomotricista', familia: 'Profissionais da educação física', area: 'Técnica' },
  { codigo: '2241-15', titulo: 'Preparador de atleta', familia: 'Profissionais da educação física', area: 'Técnica' },
  { codigo: '2241-20', titulo: 'Preparador físico', familia: 'Profissionais da educação física', area: 'Técnica' },
  { codigo: '2241-25', titulo: 'Técnico de desporto individual e coletivo (exceto futebol)', familia: 'Profissionais da educação física', area: 'Técnica' },
  { codigo: '2241-30', titulo: 'Técnico de laboratório e fiscalização desportiva', familia: 'Profissionais da educação física', area: 'Técnica' },
  { codigo: '2241-35', titulo: 'Treinador profissional de futebol', familia: 'Profissionais da educação física', area: 'Técnica' },
  { codigo: '2236-05', titulo: 'Fisioterapeuta geral', familia: 'Fisioterapeutas', area: 'Saúde' },
  { codigo: '2237-10', titulo: 'Nutricionista', familia: 'Nutricionistas', area: 'Saúde' },
  { codigo: '4221-05', titulo: 'Recepcionista, em geral', familia: 'Recepcionistas', area: 'Atendimento' },
  { codigo: '4211-25', titulo: 'Operador de caixa', familia: 'Caixas e bilheteiros (exceto caixa de banco)', area: 'Atendimento' },
  { codigo: '4110-05', titulo: 'Auxiliar de escritório, em geral', familia: 'Agentes, assistentes e auxiliares administrativos', area: 'Administrativo' },
  { codigo: '4110-10', titulo: 'Assistente administrativo', familia: 'Agentes, assistentes e auxiliares administrativos', area: 'Administrativo' },
  { codigo: '2521-05', titulo: 'Administrador', familia: 'Administradores', area: 'Administrativo' },
  { codigo: '2524-05', titulo: 'Analista de recursos humanos', familia: 'Profissionais de recursos humanos', area: 'Administrativo' },
  { codigo: '1421-05', titulo: 'Gerente administrativo', familia: 'Gerentes administrativos, financeiros, de riscos e afins', area: 'Gestão' },
  { codigo: '1423-05', titulo: 'Gerente comercial', familia: 'Gerentes de comercialização, marketing e comunicação', area: 'Gestão' },
  { codigo: '5211-10', titulo: 'Vendedor de comércio varejista', familia: 'Operadores do comércio em lojas e mercados', area: 'Comercial' },
  { codigo: '5143-20', titulo: 'Faxineiro', familia: 'Trabalhadores nos serviços de manutenção de edificações', area: 'Limpeza' },
  { codigo: '5143-25', titulo: 'Trabalhador da manutenção de edificações', familia: 'Trabalhadores nos serviços de manutenção de edificações', area: 'Manutenção' },
  { codigo: '5174-10', titulo: 'Porteiro de edifícios', familia: 'Porteiros, guardas e vigias', area: 'Segurança' },
  { codigo: '5173-30', titulo: 'Vigilante', familia: 'Vigilantes e guardas de segurança', area: 'Segurança' },
];

export const MODELOS = [
  {
    id: 'professor-musculacao',
    titulo: 'Professor de musculação',
    cbo_codigo: '2241-20',
    cbo_titulo: 'Preparador físico',
    area: 'Técnica',
    nivel: 'pleno',
    reporta_a: 'Coordenador técnico',
    jornada: '44h semanais em escala de turnos (manhã, tarde ou noite)',
    missao: 'Orientar os alunos na sala de musculação com segurança e técnica correta, prescrevendo e ajustando treinos para que cada aluno evolua em direção ao seu objetivo e permaneça ativo na academia.',
    responsabilidades: [
      'Montar, revisar e atualizar fichas de treino conforme avaliação e objetivo do aluno',
      'Acompanhar a execução dos exercícios e corrigir postura e carga',
      'Recepcionar e integrar alunos novos na sala de musculação',
      'Zelar pela organização e uso seguro dos equipamentos',
      'Registrar evolução e sinalizar alunos com baixa frequência para a equipe de retenção',
    ],
    requisitos_obrigatorios: [
      'Graduação em Educação Física (bacharelado)',
      'Registro ativo no CREF',
      'Experiência com prescrição de treino de força',
    ],
    requisitos_desejaveis: [
      'Pós-graduação em fisiologia do exercício ou treinamento de força',
      'Curso de primeiros socorros atualizado',
      'Experiência com públicos especiais (idosos, gestantes, reabilitação)',
    ],
    competencias_hard: ['Prescrição de treino de força', 'Biomecânica e cinesiologia', 'Avaliação física básica'],
    competencias_soft: ['Comunicação clara', 'Empatia com o aluno', 'Proatividade na sala', 'Trabalho em equipe'],
    indicadores: [
      'Fichas de treino revisadas no prazo (meta: a cada 8 semanas)',
      'Retenção dos alunos acompanhados',
      'NPS dos alunos da musculação',
      'Zero incidentes de segurança na sala',
    ],
  },
  {
    id: 'personal-trainer',
    titulo: 'Personal trainer',
    cbo_codigo: '2241-20',
    cbo_titulo: 'Preparador físico',
    area: 'Técnica',
    nivel: 'sênior',
    reporta_a: 'Coordenador técnico',
    jornada: 'Agenda de atendimentos individuais, conforme contrato',
    missao: 'Conduzir treinos individualizados de alto valor percebido, garantindo resultados mensuráveis aos alunos e fortalecendo a reputação técnica da academia.',
    responsabilidades: [
      'Realizar avaliação inicial e reavaliações periódicas dos alunos atendidos',
      'Planejar periodização individual alinhada ao objetivo do aluno',
      'Conduzir as sessões com atenção integral ao aluno',
      'Reportar evolução ao aluno com dados (medidas, cargas, testes)',
      'Captar e renovar pacotes de treino personalizado',
    ],
    requisitos_obrigatorios: [
      'Graduação em Educação Física (bacharelado)',
      'Registro ativo no CREF',
      'Experiência mínima de 2 anos com treino individual',
    ],
    requisitos_desejaveis: [
      'Especialização em treinamento funcional, emagrecimento ou hipertrofia',
      'Carteira própria de alunos',
    ],
    competencias_hard: ['Periodização do treinamento', 'Avaliação física e testes de desempenho', 'Treinamento funcional'],
    competencias_soft: ['Relacionamento com cliente', 'Motivação e influência', 'Pontualidade', 'Organização da agenda'],
    indicadores: [
      'Taxa de renovação de pacotes',
      'Evolução média dos alunos nas reavaliações',
      'Horas atendidas por mês',
      'NPS dos alunos atendidos',
    ],
  },
  {
    id: 'recepcionista',
    titulo: 'Recepcionista',
    cbo_codigo: '4221-05',
    cbo_titulo: 'Recepcionista, em geral',
    area: 'Atendimento',
    nivel: 'júnior',
    reporta_a: 'Gerente administrativo',
    jornada: '44h semanais em escala de turnos',
    missao: 'Ser o primeiro contato do aluno com a academia, garantindo atendimento cordial, controle de acesso correto e informações claras sobre planos, horários e serviços.',
    responsabilidades: [
      'Atender alunos e visitantes presencialmente, por telefone e WhatsApp',
      'Controlar o acesso à academia e resolver pendências de catraca',
      'Apresentar planos e agendar aulas experimentais',
      'Registrar matrículas, renovações e atualizações cadastrais no sistema',
      'Encaminhar dúvidas financeiras e reclamações para o responsável',
    ],
    requisitos_obrigatorios: [
      'Ensino médio completo',
      'Facilidade com computador e sistemas de gestão',
      'Disponibilidade para trabalhar em escala',
    ],
    requisitos_desejaveis: [
      'Experiência com atendimento ao público ou vendas',
      'Conhecimento básico do mercado fitness',
    ],
    competencias_hard: ['Uso do sistema de gestão da academia', 'Noções de vendas de planos', 'Controle de caixa básico'],
    competencias_soft: ['Cordialidade', 'Comunicação', 'Organização', 'Calma sob pressão'],
    indicadores: [
      'Tempo médio de resposta no WhatsApp',
      'Conversão de visitantes em matrícula',
      'Cadastros sem erro ou pendência',
      'Avaliação do atendimento pelos alunos',
    ],
  },
  {
    id: 'coordenador-tecnico',
    titulo: 'Coordenador técnico',
    cbo_codigo: null,
    cbo_titulo: null,
    area: 'Técnica',
    nivel: 'coordenação',
    reporta_a: 'Gerência / sócios',
    jornada: '44h semanais',
    missao: 'Liderar a equipe de professores para entregar um padrão técnico consistente em todas as modalidades, desenvolvendo pessoas e garantindo resultados de retenção e satisfação dos alunos.',
    responsabilidades: [
      'Definir padrões técnicos de treino, avaliação e atendimento',
      'Montar escalas e distribuir professores entre turnos e modalidades',
      'Recrutar, integrar e desenvolver professores (PDI, 1:1, feedback)',
      'Acompanhar indicadores de retenção e satisfação da área técnica',
      'Conduzir reuniões e treinamentos periódicos da equipe',
    ],
    requisitos_obrigatorios: [
      'Graduação em Educação Física (bacharelado) e CREF ativo',
      'Experiência mínima de 3 anos em academia',
      'Experiência prévia liderando equipe',
    ],
    requisitos_desejaveis: [
      'Pós-graduação em gestão ou treinamento',
      'Vivência com indicadores de retenção',
    ],
    competencias_hard: ['Gestão de escalas e equipe', 'Padronização técnica', 'Leitura de indicadores'],
    competencias_soft: ['Liderança', 'Coaching e feedback', 'Tomada de decisão', 'Comunicação com a gestão'],
    indicadores: [
      'Retenção geral de alunos',
      'Turnover da equipe técnica',
      'NPS da área técnica',
      'Cumprimento do plano de treinamentos da equipe',
    ],
  },
];

const ARRAY_FIELDS = [
  'responsabilidades', 'requisitos_obrigatorios', 'requisitos_desejaveis',
  'competencias_hard', 'competencias_soft', 'indicadores',
];

const ensure = createEnsure(async (sql) => {
  await sql`
    CREATE TABLE IF NOT EXISTS rh_cargos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      titulo TEXT NOT NULL,
      cbo_codigo TEXT,
      cbo_titulo TEXT,
      area TEXT,
      nivel TEXT,
      missao TEXT,
      responsabilidades TEXT[] NOT NULL DEFAULT '{}',
      requisitos_obrigatorios TEXT[] NOT NULL DEFAULT '{}',
      requisitos_desejaveis TEXT[] NOT NULL DEFAULT '{}',
      competencias_hard TEXT[] NOT NULL DEFAULT '{}',
      competencias_soft TEXT[] NOT NULL DEFAULT '{}',
      indicadores TEXT[] NOT NULL DEFAULT '{}',
      jornada TEXT,
      reporta_a TEXT,
      faixa_salarial_min NUMERIC(12,2),
      faixa_salarial_max NUMERIC(12,2),
      ativo BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS rh_cargos_titulo_nivel_uq
    ON rh_cargos (LOWER(titulo), COALESCE(nivel, ''))
  `;
});

export class CargoError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normKey(s) {
  return String(s ?? '').trim().toLowerCase();
}

function stripAccents(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toLines(v) {
  const list = Array.isArray(v) ? v : String(v ?? '').split('\n');
  return list.map((s) => String(s ?? '').trim().slice(0, 1000)).filter(Boolean).slice(0, 50);
}

function money(v, label) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 9999999999) throw new CargoError(400, `${label} inválida.`);
  return Math.round(n * 100) / 100;
}

function normNivel(v) {
  const s = str(v, 40);
  if (!s) return null;
  const found = NIVEIS.find((n) => stripAccents(n) === stripAccents(s.toLowerCase()));
  if (!found) throw new CargoError(400, `Nível inválido. Use: ${NIVEIS.join(', ')}.`);
  return found;
}

function normCbo(v) {
  const s = str(v, 20);
  if (!s) return null;
  if (!/^\d{4}-\d{2}$/.test(s)) throw new CargoError(400, 'Código CBO inválido. Use o formato 0000-00 (ex.: 2241-20).');
  return s;
}

/** Valida e normaliza o payload. `partial` = PATCH (só os campos enviados). */
function parsePayload(body, { partial = false } = {}) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  if (!partial || has('titulo')) {
    const titulo = str(body.titulo, 160);
    if (!titulo) throw new CargoError(400, 'Informe o título do cargo.');
    out.titulo = titulo.replace(/\s+/g, ' ');
  }
  if (!partial || has('cbo_codigo')) out.cbo_codigo = normCbo(body.cbo_codigo);
  if (!partial || has('cbo_titulo')) out.cbo_titulo = str(body.cbo_titulo, 200);
  if (!partial || has('area')) out.area = str(body.area, 120);
  if (!partial || has('nivel')) out.nivel = normNivel(body.nivel);
  if (!partial || has('missao')) out.missao = str(body.missao, 3000);
  if (!partial || has('jornada')) out.jornada = str(body.jornada, 300);
  if (!partial || has('reporta_a')) out.reporta_a = str(body.reporta_a, 160);
  for (const f of ARRAY_FIELDS) {
    if (!partial || has(f)) out[f] = toLines(body[f]);
  }
  if (!partial || has('faixa_salarial_min')) out.faixa_salarial_min = money(body.faixa_salarial_min, 'Faixa salarial mínima');
  if (!partial || has('faixa_salarial_max')) out.faixa_salarial_max = money(body.faixa_salarial_max, 'Faixa salarial máxima');
  if (!partial || has('ativo')) out.ativo = body.ativo === undefined ? true : Boolean(body.ativo);
  return out;
}

function mapRow(r, counts) {
  if (!r) return null;
  return {
    ...r,
    faixa_salarial_min: r.faixa_salarial_min == null ? null : Number(r.faixa_salarial_min),
    faixa_salarial_max: r.faixa_salarial_max == null ? null : Number(r.faixa_salarial_max),
    colaboradores: counts ? (counts.get(normKey(r.titulo)) || 0) : undefined,
  };
}

async function colaboradoresPorCargo(sql) {
  const rows = await sql`
    SELECT LOWER(TRIM(cargo_atual)) AS chave, MIN(TRIM(cargo_atual)) AS cargo, COUNT(*) AS total
    FROM colaboradores_perfis
    WHERE deleted_at IS NULL AND cargo_atual IS NOT NULL AND TRIM(cargo_atual) <> ''
    GROUP BY LOWER(TRIM(cargo_atual))
  `;
  return rows.map((r) => ({ chave: r.chave, cargo: r.cargo, total: Number(r.total) }));
}

async function countFor(sql, titulo) {
  const rows = await sql`
    SELECT COUNT(*) AS total FROM colaboradores_perfis
    WHERE deleted_at IS NULL AND LOWER(TRIM(cargo_atual)) = ${normKey(titulo)}
  `;
  return Number(rows[0]?.total || 0);
}

async function assertUnique(sql, titulo, nivel, exceptId = null) {
  const rows = await sql`
    SELECT id FROM rh_cargos
    WHERE LOWER(titulo) = ${titulo.toLowerCase()} AND COALESCE(nivel, '') = ${nivel || ''}
      AND (${exceptId}::uuid IS NULL OR id <> ${exceptId}::uuid)
    LIMIT 1
  `;
  if (rows.length) throw new CargoError(409, 'Já existe um cargo com esse título e nível.');
}

function assertFaixa(min, max) {
  if (min != null && max != null && min > max) {
    throw new CargoError(400, 'A faixa salarial mínima não pode ser maior que a máxima.');
  }
}

function isUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
}

function isUniqueViolation(err) {
  return err?.code === '23505' || /duplicate key|unique/i.test(String(err?.message || ''));
}

export async function listCargos({ ativos = false } = {}) {
  await ensure();
  const sql = getSql();
  const rows = ativos
    ? await sql`SELECT * FROM rh_cargos WHERE ativo = true ORDER BY LOWER(titulo), nivel NULLS FIRST`
    : await sql`SELECT * FROM rh_cargos ORDER BY ativo DESC, LOWER(titulo), nivel NULLS FIRST`;
  const porCargo = await colaboradoresPorCargo(sql);
  const counts = new Map(porCargo.map((c) => [c.chave, c.total]));
  const cadastrados = new Set(rows.map((r) => normKey(r.titulo)));
  const semDescricao = porCargo
    .filter((c) => !cadastrados.has(c.chave))
    .map(({ cargo, total }) => ({ cargo, colaboradores: total }))
    .sort((a, b) => b.colaboradores - a.colaboradores || a.cargo.localeCompare(b.cargo, 'pt-BR'));
  return {
    cargos: rows.map((r) => mapRow(r, counts)),
    sem_descricao: semDescricao,
    niveis: NIVEIS,
    cbo_url: CBO_URL,
  };
}

export function searchCbo(q) {
  const term = stripAccents(String(q ?? '').trim().toLowerCase());
  if (!term) return CBO_CATALOGO;
  const digits = term.replace(/\D/g, '');
  return CBO_CATALOGO.filter((c) => {
    const hay = stripAccents(`${c.titulo} ${c.familia} ${c.area}`.toLowerCase());
    if (hay.includes(term)) return true;
    return digits.length >= 2 && c.codigo.replace('-', '').startsWith(digits);
  });
}

export async function getCargo(id) {
  if (!isUuid(id)) return null;
  await ensure();
  const sql = getSql();
  const rows = await sql`SELECT * FROM rh_cargos WHERE id = ${id} LIMIT 1`;
  if (!rows[0]) return null;
  const total = await countFor(sql, rows[0].titulo);
  return { ...mapRow(rows[0]), colaboradores: total };
}

export async function createCargo(body) {
  await ensure();
  const sql = getSql();
  const d = parsePayload(body || {});
  assertFaixa(d.faixa_salarial_min, d.faixa_salarial_max);
  await assertUnique(sql, d.titulo, d.nivel);
  try {
    const rows = await sql`
      INSERT INTO rh_cargos (
        titulo, cbo_codigo, cbo_titulo, area, nivel, missao,
        responsabilidades, requisitos_obrigatorios, requisitos_desejaveis,
        competencias_hard, competencias_soft, indicadores,
        jornada, reporta_a, faixa_salarial_min, faixa_salarial_max, ativo
      ) VALUES (
        ${d.titulo}, ${d.cbo_codigo}, ${d.cbo_titulo}, ${d.area}, ${d.nivel}, ${d.missao},
        ${d.responsabilidades}, ${d.requisitos_obrigatorios}, ${d.requisitos_desejaveis},
        ${d.competencias_hard}, ${d.competencias_soft}, ${d.indicadores},
        ${d.jornada}, ${d.reporta_a}, ${d.faixa_salarial_min}, ${d.faixa_salarial_max}, ${d.ativo}
      )
      RETURNING id
    `;
    return getCargo(rows[0].id);
  } catch (err) {
    if (isUniqueViolation(err)) throw new CargoError(409, 'Já existe um cargo com esse título e nível.');
    throw err;
  }
}

export async function updateCargo(id, body) {
  const atual = await getCargo(id);
  if (!atual) return null;
  const sql = getSql();
  const p = parsePayload(body || {}, { partial: true });
  const d = { ...atual, ...p };
  assertFaixa(d.faixa_salarial_min, d.faixa_salarial_max);
  if ('titulo' in p || 'nivel' in p) await assertUnique(sql, d.titulo, d.nivel, id);
  try {
    await sql`
      UPDATE rh_cargos SET
        titulo = ${d.titulo}, cbo_codigo = ${d.cbo_codigo}, cbo_titulo = ${d.cbo_titulo},
        area = ${d.area}, nivel = ${d.nivel}, missao = ${d.missao},
        responsabilidades = ${d.responsabilidades}, requisitos_obrigatorios = ${d.requisitos_obrigatorios},
        requisitos_desejaveis = ${d.requisitos_desejaveis}, competencias_hard = ${d.competencias_hard},
        competencias_soft = ${d.competencias_soft}, indicadores = ${d.indicadores},
        jornada = ${d.jornada}, reporta_a = ${d.reporta_a},
        faixa_salarial_min = ${d.faixa_salarial_min}, faixa_salarial_max = ${d.faixa_salarial_max},
        ativo = ${d.ativo}, updated_at = NOW()
      WHERE id = ${id}
    `;
  } catch (err) {
    if (isUniqueViolation(err)) throw new CargoError(409, 'Já existe um cargo com esse título e nível.');
    throw err;
  }
  return getCargo(id);
}

/** Apaga o cargo; se houver colaboradores nele, apenas inativa. */
export async function deleteCargo(id) {
  const atual = await getCargo(id);
  if (!atual) return null;
  const sql = getSql();
  if (atual.colaboradores > 0) {
    await sql`UPDATE rh_cargos SET ativo = false, updated_at = NOW() WHERE id = ${id}`;
    return { inativado: true, colaboradores: atual.colaboradores };
  }
  await sql`DELETE FROM rh_cargos WHERE id = ${id}`;
  return { inativado: false, colaboradores: 0 };
}
