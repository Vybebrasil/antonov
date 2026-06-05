/**
 * Insere Google tag (gtag.js) no <head> de todas as páginas HTML na raiz.
 * Uso: node scripts/inject-gtag.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GTAG = `
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-SXNR4ZH6Y5"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-SXNR4ZH6Y5');
</script>`;
const marker = 'G-SXNR4ZH6Y5';

for (const name of readdirSync(root).filter(
  (n) => n.endsWith('.html') && !n.startsWith('google')
)) {
  const path = join(root, name);
  let html = readFileSync(path, 'utf8');
  if (html.includes(marker)) {
    console.log('skip', name);
    continue;
  }
  if (!html.includes('<meta charset="utf-8" />')) {
    console.log('no charset', name);
    continue;
  }
  html = html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />${GTAG}`);
  writeFileSync(path, html, 'utf8');
  console.log('patched', name);
}
