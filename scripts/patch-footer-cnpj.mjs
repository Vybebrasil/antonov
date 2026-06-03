import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dirname, '..');
const replacements = [
  [
    '<li><address class="footer__address">Av. 1º de Janeiro · ANTONOV<br />Irecê · Bahia · BR</address></li>',
    '<li><address class="footer__address">Antonov Center LTDA · CNPJ 62.421.964/0001-60<br /><a href="/contato#mapa">Av. 1º de Janeiro · Irecê · Bahia · BR</a></address></li>',
  ],
  [
    '<div>© 2026 ANTONOV CENTER · TODOS OS DIREITOS RESERVADOS · </div>',
    '<div>© 2026 Antonov Center LTDA · CNPJ 62.421.964/0001-60 · TODOS OS DIREITOS RESERVADOS</div>',
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
      for (const [from, to] of replacements) {
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
