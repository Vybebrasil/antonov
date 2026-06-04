/**
 * Encurta a árvore de dependência: defer nos scripts do rodapé,
 * vip/leads só onde necessário, menos pesos de fonte no Google Fonts.
 * Uso: node scripts/patch-critical-chain.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const FONTS_OLD =
  /https:\/\/fonts\.googleapis\.com\/css2\?family=Anton&family=Inter:wght@300;400;500;600;700&family=JetBrains\+Mono:wght@400;500&display=swap/g;
const FONTS_NEW =
  'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap';

const VIP_PAGES = new Set(['index.html', 'planos.html']);
/** leads-config separado; index/planos usam config embutido em vip-leads.js */
const LEADS_CONFIG_PAGES = new Set(['contato.html', 'trabalhe-conosco.html']);

const FOOTER_SCRIPTS = [
  'leads-config.js',
  'vip-leads.js',
  'contato-form.js',
  'trabalhe-conosco-form.js',
  'app.js',
];

function deferAttr(tag) {
  return /\bdefer\b/.test(tag) ? tag : tag.replace('<script ', '<script defer ');
}

function patchFonts(html) {
  return html.replace(FONTS_OLD, FONTS_NEW);
}

function patchFooterScripts(html, name) {
  let out = html;

  for (const file of FOOTER_SCRIPTS) {
    const re = new RegExp(
      `<script(?: defer)? src="${file}"[^>]*><\\/script>\\s*`,
      'g'
    );
    out = out.replace(re, (tag) => {
      if (file === 'vip-leads.js' && !VIP_PAGES.has(name)) return '';
      if (file === 'leads-config.js' && !LEADS_CONFIG_PAGES.has(name)) return '';
      return deferAttr(tag);
    });
  }

  return out;
}

for (const name of readdirSync(root).filter((n) => n.endsWith('.html'))) {
  const path = join(root, name);
  const html = readFileSync(path, 'utf8');
  let out = patchFonts(html);
  out = patchFooterScripts(out, name);
  if (out !== html) {
    writeFileSync(path, out, 'utf8');
    console.log('patched', name);
  }
}
