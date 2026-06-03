import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dirname, '..');
const from =
  '<li><address class="footer__address">Antonov Center LTDA · CNPJ 62.421.964/0001-60<br />Av. 1º de Janeiro · Irecê · Bahia · BR</address></li>';
const to =
  '<li><address class="footer__address">Antonov Center LTDA · CNPJ 62.421.964/0001-60<br /><a href="/contato#mapa">Av. 1º de Janeiro · Irecê · Bahia · BR</a></address></li>';

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules') continue;
      walk(p);
    } else if (name.endsWith('.html') && readFileSync(p, 'utf8').includes(from)) {
      writeFileSync(p, readFileSync(p, 'utf8').split(from).join(to), 'utf8');
      console.log('patched', p);
    }
  }
}

walk(root);
