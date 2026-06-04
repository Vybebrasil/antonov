/**
 * Corrige hierarquia de títulos no rodapé (h4 → h3 após h2 do CTA).
 * Uso: node scripts/patch-footer-headings.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const FOOTER_LABELS = [
  'Navegação',
  'Contato',
  'Operação',
  'Coordenadas',
  'Legal',
  'Social',
];

function patchFooterHeadings(html) {
  let out = html;
  for (const label of FOOTER_LABELS) {
    out = out
      .split(`<h4>${label}</h4>`)
      .join(`<h3 class="footer__col-title">${label}</h3>`);
  }
  return out;
}

for (const name of readdirSync(root).filter((n) => n.endsWith('.html'))) {
  const path = join(root, name);
  const html = readFileSync(path, 'utf8');
  const patched = patchFooterHeadings(html);
  if (patched !== html) {
    writeFileSync(path, patched, 'utf8');
    console.log('patched', name);
  }
}
