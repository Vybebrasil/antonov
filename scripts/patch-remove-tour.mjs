import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dirname, '..');

const pairs = [
  [
    'Academia premium em Irecê, BA. Musculação, cardio, avaliação física e tour gratuito. Antonov Center — projetado para decolar.',
    'Academia premium em Irecê, BA. Musculação, cardio, avaliação física e aula experimental grátis. Antonov Center — projetado para decolar.',
  ],
  [
    'Comece com um tour ou uma aula experimental. A gente ajuda você a achar o plano, a rotina e o espaço pra desbloquear todo seu potencial.',
    'Comece com uma aula experimental ou fale conosco. A gente ajuda você a achar o plano, a rotina e o espaço pra desbloquear todo seu potencial.',
  ],
  ['Agendar visita', 'Fale conosco'],
  [
    'Tour guiado, aula experimental, dúvida sobre plano, fale com nossa equipe. Será um prazer lhe atender.',
    'Aula experimental, dúvida sobre planos ou matrícula — fale com nossa equipe. Será um prazer lhe atender.',
  ],
  ['        <div>TOUR GUIADO<span class="v">DIÁRIO</span></div>\n        <div>AULA EXPERIMENTAL', '        <div>AULA EXPERIMENTAL'],
  ['<div class="cform__lbl">/ AGENDE SUA VISITA</div>', '<div class="cform__lbl">/ FALE CONOSCO</div>'],
  ['<h2>Marque um tour<br/>guiado.</h2>', '<h2>Envie sua<br/>mensagem.</h2>'],
  [
    '<p class="cform__sub">Um Tour guiado pelo espaço com um coach — incluindo uma aula experimental no final.</p>',
    '<p class="cform__sub">Tire dúvidas sobre planos, aula experimental ou fale direto com a tripulação.</p>',
  ],
  [
    'placeholder="Algo que a gente deve saber antes do tour?"',
    'placeholder="Como podemos te ajudar?"',
  ],
  ['<span>Agendar tour</span>', '<span>Enviar mensagem</span>'],
  [
    '<div class="acc__body"><p>Sim. Oferecemos um tour guiado + 1 aula experimental gratuita. Basta agendar pelo link de contato. Sem compromisso.</p></div>',
    '<div class="acc__body"><p>Sim. Oferecemos 1 aula experimental gratuita. Basta falar conosco pelo link de contato. Sem compromisso.</p></div>',
  ],
  [
    '<div class="acc__body"><p>Sim. Oferecemos um tour guiado de 45 minutos + 1 aula experimental gratuita. Basta agendar pelo link de contato. Sem pegadinha, sem compromisso.</p></div>',
    '<div class="acc__body"><p>Sim. Oferecemos 1 aula experimental gratuita. Basta falar conosco pelo link de contato. Sem compromisso.</p></div>',
  ],
  [
    '<div class="acc__body"><p>Na Av. 1º de Janeiro, Irecê, Bahia — hangar de 3.000 m². Use o mapa em <a href="/contato">Contato</a> ou agende um tour para visitar.</p></div>',
    '<div class="acc__body"><p>Na Av. 1º de Janeiro, Irecê, Bahia — hangar de 3.000 m². Veja o mapa em <a href="/contato#mapa">Contato</a>.</p></div>',
  ],
  [
    '<div class="acc__head">Como agendar tour ou aula experimental?<div class="ico"></div></div>',
    '<div class="acc__head">Como agendar aula experimental?<div class="ico"></div></div>',
  ],
  [
    '<div class="acc__body"><p>Pelo formulário em <a href="/contato">Contato</a>, WhatsApp +55 74 99963-1507 ou e-mail antonovacademia@gmail.com. Tour guiado e 1 aula grátis, sem compromisso.</p></div>',
    '<div class="acc__body"><p>Pelo formulário em <a href="/contato">Contato</a>, WhatsApp +55 74 99963-1507 ou e-mail antonovacademia@gmail.com. Aula grátis, sem compromisso.</p></div>',
  ],
  ['<div class="page-hero__crumb">/ TOUR — HANGAR ANTONOV</div>', '<div class="page-hero__crumb">/ HANGAR ANTONOV</div>'],
  [
    'Vagas, suporte, visita ao hangar e redes sociais — tudo em um lugar, com os canais oficiais da operação.',
    'Vagas, suporte, localização e redes sociais — tudo em um lugar, com os canais oficiais da operação.',
  ],
];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules') continue;
      walk(p);
    } else if (name.endsWith('.html')) {
      let html = readFileSync(p, 'utf8');
      let changed = false;
      for (const [from, to] of pairs) {
        if (html.includes(from)) {
          html = html.split(from).join(to);
          changed = true;
        }
      }
      if (changed) {
        writeFileSync(p, html, 'utf8');
        console.log('patched', p);
      }
    }
  }
}

walk(root);
