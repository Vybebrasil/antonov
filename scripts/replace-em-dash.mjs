/**
 * Substitui travessões (—) por conectivos nos textos do site.
 * Uso: node scripts/replace-em-dash.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = [
  'index.html',
  'planos.html',
  'sobre.html',
  'contato.html',
  'aulas.html',
  'estudio.html',
  'trabalhe-conosco.html',
  'termos.html',
  'privacidade.html',
  'cookies.html',
  'seo-schema.js',
  'llms.txt',
  'google-review-prompt.js',
  'app.js',
  'api/lib/resend.js',
  'api/leads/tour.js',
  'api/leads/pre-matricula.js',
  'api/leads/curriculos.js',
];

/** Ordem importa: regras específicas antes das genéricas. */
const RULES = [
  // Títulos e meta
  [/Antonov Center — Treino/g, 'Antonov Center: Treino'],
  [/Academia Antonov — Irecê/g, 'Academia Antonov em Irecê'],
  [/Antonov Center — Irecê, Bahia/g, 'Antonov Center em Irecê, Bahia'],
  [/Antonov Center — Irecê/g, 'Antonov Center em Irecê'],
  [/Antonov Center — projetado/g, 'Antonov Center, projetado'],
  [/ANTONOV CENTER — tipos/g, 'ANTONOV CENTER: tipos'],
  [/Contato — Antonov Center/g, 'Contato | Antonov Center'],

  // Alt e labels de marca
  [/ANTONOV CENTER — Bahia/g, 'ANTONOV CENTER na Bahia'],
  [/Antonov Center — academia em Irecê/g, 'Antonov Center, academia em Irecê'],
  [/Hangar Antonov Center — estrutura/g, 'Hangar Antonov Center, estrutura'],

  // Endereços e legal
  [/Irecê — Bahia/g, 'Irecê, Bahia'],
  [/Irecê — BA/g, 'Irecê, BA'],
  [/Av\. 1º de Janeiro, Irecê — Bahia/g, 'Av. 1º de Janeiro, Irecê, Bahia'],

  // Preços, horários e badges
  [/<strong>1 diária<\/strong> — R\$/g, '<strong>1 diária</strong> por R$'],
  [/<strong>3 diárias<\/strong> — R\$/g, '<strong>3 diárias</strong> por R$'],
  [/<strong>10 diárias<\/strong> — R\$/g, '<strong>10 diárias</strong> por R$'],
  [/\(—8%\)/g, '(-8%)'],
  [/<span class="badge">—8%<\/span>/g, '<span class="badge">-8%</span>'],
  [/05:00—23:00/g, '05:00 às 23:00'],
  [/1 diária R\$ 50; pacote 3 diárias R\$ 110; pacote 10 diárias R\$/g, '1 diária por R$ 50; pacote de 3 diárias por R$ 110; pacote de 10 diárias por'],

  // Crumbs e rótulos de seção
  [/\/ LEGAL — /g, '/ LEGAL · '],
  [/\/ SEJA ANTONOV — /g, '/ SEJA ANTONOV · '],
  [/\/ CONTATO — /g, '/ CONTATO · '],
  [/\/ PROGRAMAÇÃO — /g, '/ PROGRAMAÇÃO · '],
  [/\/ CARREIRAS — /g, '/ CARREIRAS · '],
  [/\/ EXTRAS — /g, '/ EXTRAS · '],
  [/\/ MANIFESTO — /g, '/ MANIFESTO · '],
  [/\/ HANGAR ANTONOV — /g, '/ HANGAR ANTONOV · '],
  [/\/ (\d+) — /g, '/ $1 · '],
  [/<span class="num">\/ (\d+) — /g, '<span class="num">/ $1 · '],
  [/<div class="crow__cat">\/ (\d+) — /g, '<div class="crow__cat">/ $1 · '],
  [/<div class="pillar__no">\/ (\d+) — /g, '<div class="pillar__no">/ $1 · '],
  [/<div class="editorial__num[^>]*>\/ (\d+) — /g, (m) => m.replace(' — ', ' · ')],

  // Depoimentos / placeholders visuais
  [/<div class="t-card__author">— /g, '<div class="t-card__author">· '],
  [/<div data-clock>—<\/div>/g, '<div data-clock></div>'],
  [/<div class="qstat__sub" data-clock>—<\/div>/g, '<div class="qstat__sub" data-clock></div>'],
  [/<strong>—<\/strong>/g, '<strong>Não incluído</strong>'],
  [/FOTO PRINCIPAL — PLATAFORMA/g, 'FOTO PRINCIPAL · PLATAFORMA'],

  // Corpo de texto (frases específicas)
  [/Performance como operação — força/g, 'Performance como operação, com força'],
  [/Bahia — quatro zonas/g, 'Bahia, com quatro zonas'],
  [/progressivo — sessão pesada/g, 'progressivo, com sessão pesada'],
  [/experiência — climatização/g, 'experiência, com climatização'],
  [/NC-30 — biblioteca/g, 'NC-30, nível de biblioteca'],
  [/Diagrama do hangar — fluxo/g, 'Diagrama do hangar, com fluxo'],
  [/você precisa — praticidade/g, 'você precisa, com praticidade'],
  [/com intenção — equipamentos/g, 'com intenção, com equipamentos'],
  [/hangar industrial — circulação/g, 'hangar industrial, com circulação'],
  [/desenvolvimento — equipamentos/g, 'desenvolvimento, com equipamentos'],
  [/faz sentido — a mais alta/g, 'faz sentido com a mais alta'],
  [/sua rotina — sem caos/g, 'sua rotina, sem caos'],
  [/só treino — é construída/g, 'só treino, pois é construída'],
  [/em Irecê, Bahia — hangar/g, 'em Irecê, Bahia, hangar'],
  [/recorrente — não consome/g, 'recorrente e não consome'],
  [/Bahia — CEP/g, 'Bahia, CEP'],
  [/sustenta — sem caos/g, 'sustenta, sem caos'],
  [/3 grandes — agachamento/g, '3 grandes: agachamento'],
  [/para prova — 8 estações/g, 'para prova, com 8 estações'],
  [/recuperação ativa — mobilidade/g, 'recuperação ativa, com mobilidade'],
  [/medicine ball — para performance/g, 'medicine ball, para performance'],
  [/profundidade — para postura/g, 'profundidade, para postura'],
  [/proprietário — 14 estações/g, 'proprietário, com 14 estações'],
  [/por semana — disponível/g, 'por semana, disponível'],
  [/da região — um hangar/g, 'da região, um hangar'],
  [/evolução humana<\/strong> — um complexo/g, 'evolução humana</strong>, uma zona comercial'],
  [/evolução humana<\/strong>, um complexo/g, 'evolução humana</strong>, uma zona comercial'],
  [/altíssima tecnologia\./g, 'altíssima tecnologia.'],
  [/manifesto em operação — da/g, 'manifesto em operação, da'],
  [/O nome vem dos cargueiros <strong>Antonov<\/strong> — engenharia/g, 'O nome vem dos cargueiros <strong>Antonov</strong>, com engenharia'],
  [/sem improviso\./g, 'sem improviso.'],
  [/excelência, sem improviso\./g, 'excelência, sem improviso.'],
  [/requalificados em zonas dedicadas — força/g, 'requalificados em zonas dedicadas: força'],
  [/em operação plena — <strong>/g, 'em operação plena, com <strong>'],
  [/mesmo padrão — precisão/g, 'mesmo padrão de precisão'],
  [/cada movimento — força bruta/g, 'cada movimento, com força bruta'],
  [/padrão da região — engenharia/g, 'padrão da região, com engenharia'],
  [/distração — só o que/g, 'distração, só o que'],
  [/recuperação — projetada/g, 'recuperação, projetada'],
  [/Unlimited — mas se/g, 'Unlimited, mas se'],
  [/Sem fidelidade — pague/g, 'Sem fidelidade: pague'],
  [/por 1 dia — sauna/g, 'por 1 dia, com sauna'],
  [/de elite — 12 sessões/g, 'de elite, com 12 sessões'],
  [/incorporados ao site — como mapas/g, 'incorporados ao site, como mapas'],
  [/redes sociais — podem/g, 'redes sociais, podem'],
  [/redes sociais — tudo em um lugar/g, 'redes sociais, tudo em um lugar'],
  [/Irecê, BA — academia/g, 'Irecê, BA, academia'],
  [/sem improviso\./g, 'sem improviso.'],
  [/Treino estruturado com metodologia Antonov, foco em evolução e suporte técnico durante toda a jornada\./g, 'Treino estruturado com metodologia Antonov, foco em evolução e suporte técnico durante toda a jornada.'],
  [/alt="\$\{title\} — imagem/g, 'alt="${title}, imagem'],
  [/Irecê, BA — mapa/g, 'Irecê, BA. Veja o mapa'],
  [/acesso avulso — 1 diária/g, 'acesso avulso: 1 diária'],

  // E-mails
  [/Nova mensagem — Contato/g, 'Nova mensagem | Contato'],
  [/Novo pré-cadastro — Antonov/g, 'Novo pré-cadastro | Antonov'],
  [/Nova candidatura — Trabalhe/g, 'Nova candidatura | Trabalhe'],
  [/Antonov Center · Av\. 1º de Janeiro, Irecê — BA/g, 'Antonov Center · Av. 1º de Janeiro, Irecê, BA'],
  [/lista com foco em \*\*\$\{fields\.interesse[^}]+\}\*\* — avisaremos/g, 'lista com foco em **${fields.interesse || \'performance\'}** e avisaremos'],
  [/Antonov Center — \$\{formType\}/g, 'Antonov Center | ${formType}'],
  [/Novo lead: \$\{nome\} — \$\{formType\}/g, 'Novo lead: ${nome} | ${formType}'],
  [/subject\.replace\(' —', ''\)/g, "subject.replace(' |', '')"],

  // Fallback: travessão entre palavras → vírgula (evita sobras)
  [/ — /g, ', '],
  [/—/g, ','],
];

for (const file of FILES) {
  const path = join(root, file);
  let text = readFileSync(path, 'utf8');
  const before = (text.match(/—/g) || []).length;
  if (before === 0) continue;

  for (const [pattern, replacement] of RULES) {
    text = text.replace(pattern, replacement);
  }

  const after = (text.match(/—/g) || []).length;
  writeFileSync(path, text, 'utf8');
  console.log(`${file}: ${before} → ${after} travessões`);
}
