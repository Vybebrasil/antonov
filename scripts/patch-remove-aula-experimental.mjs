import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dirname, '..');

const pairs = [
  [
    'Academia premium em Irecê, BA. Musculação, cardio, avaliação física e aula experimental grátis. Antonov Center — projetado para decolar.',
    'Academia premium em Irecê, BA. Musculação, cardio e avaliação física. Antonov Center — projetado para decolar.',
  ],
  [
    'Fale com a Antonov Center em Irecê. Aula experimental grátis, dúvidas sobre planos, WhatsApp e e-mail.',
    'Fale com a Antonov Center em Irecê. Dúvidas sobre planos, matrícula, WhatsApp e e-mail.',
  ],
  [
    'Comece com uma aula experimental ou fale conosco. A gente ajuda você a achar o plano, a rotina e o espaço pra desbloquear todo seu potencial.',
    'Fale conosco. A gente ajuda você a achar o plano, a rotina e o espaço pra desbloquear todo seu potencial.',
  ],
  [
    'Aula experimental, dúvida sobre planos ou matrícula — fale com nossa equipe. Será um prazer lhe atender.',
    'Dúvidas sobre planos, matrícula ou fale com nossa equipe. Será um prazer lhe atender.',
  ],
  ['        <div>AULA EXPERIMENTAL<span class="v">GRÁTIS</span></div>\r\n', ''],
  ['        <div>AULA EXPERIMENTAL<span class="v">GRÁTIS</span></div>\n', ''],
  ['        <div>EXPERIMENTAL<span class="v">GRÁTIS</span></div>\r\n', ''],
  ['        <div>EXPERIMENTAL<span class="v">GRÁTIS</span></div>\n', ''],
  [
    '<div class="acc__head">Posso experimentar antes de assinar?<div class="ico"></div></div>',
    '<div class="acc__head">Posso conhecer a academia antes de assinar?<div class="ico"></div></div>',
  ],
  [
    '<div class="acc__body"><p>Sim. Oferecemos 1 aula experimental gratuita. Basta falar conosco pelo link de contato. Sem compromisso.</p></div>',
    '<div class="acc__body"><p>Sim. Fale conosco pelo link de contato para conhecer a estrutura e escolher o plano ideal. Sem compromisso.</p></div>',
  ],
  [
    '<div class="acc__head">Como agendar aula experimental?<div class="ico"></div></div>',
    '<div class="acc__head">Como falar com a Antonov?<div class="ico"></div></div>',
  ],
  [
    '<div class="acc__body"><p>Pelo formulário em <a href="/contato">Contato</a>, WhatsApp +55 74 99963-1507 ou e-mail antonovacademia@gmail.com. Aula grátis, sem compromisso.</p></div>',
    '<div class="acc__body"><p>Pelo formulário em <a href="/contato">Contato</a>, WhatsApp +55 74 99963-1507 ou e-mail antonovacademia@gmail.com. Sem compromisso.</p></div>',
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
