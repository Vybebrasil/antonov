/**
 * Favicon para Google Search: /favicon.ico na raiz + link rel="icon" no início do head.
 * Uso: node scripts/patch-favicon.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const FAVICON_BLOCK = `<link rel="icon" href="/favicon.ico" sizes="48x48" />
<link rel="icon" type="image/png" href="/assets/favicon-96x96.png" sizes="96x96" />
<link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-title" content="Antonov" />
<link rel="manifest" href="/assets/site.webmanifest" />`;

const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1" />';

/** Remove blocos legados (svg, shortcut icon, duplicatas fora do viewport). */
function stripLegacyFavicon(html) {
  return html
    .replace(
      /<link rel="icon" type="image\/svg\+xml" href="\/assets\/favicon\.svg" \/>\s*/g,
      '',
    )
    .replace(/<link rel="shortcut icon" href="\/assets\/favicon\.ico" \/>\s*/g, '')
    .replace(
      /(?:<link rel="icon" type="image\/png" href="\/assets\/favicon-96x96\.png" sizes="96x96" \/>\s*){2,}/g,
      '<link rel="icon" type="image/png" href="/assets/favicon-96x96.png" sizes="96x96" />\n',
    )
    .replace(
      /(?:<link rel="manifest" href="\/assets\/site\.webmanifest" \/>\s*){2,}/g,
      '<link rel="manifest" href="/assets/site.webmanifest" />\n',
    )
    .replace(
      /(?:<meta name="apple-mobile-web-app-title" content="Antonov" \/>\s*){2,}/g,
      '<meta name="apple-mobile-web-app-title" content="Antonov" />\n',
    )
    .replace(
      /(?:<link rel="apple-touch-icon" sizes="180x180" href="\/assets\/apple-touch-icon\.png" \/>\s*){2,}/g,
      '<link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png" />\n',
    );
}

for (const file of readdirSync(root).filter((n) => n.endsWith('.html') && !n.startsWith('google'))) {
  let html = readFileSync(join(root, file), 'utf8');
  html = stripLegacyFavicon(html);

  if (!html.includes('href="/favicon.ico"')) {
    html = html.replace(VIEWPORT, `${VIEWPORT}\n${FAVICON_BLOCK}`);
  }

  writeFileSync(join(root, file), html, 'utf8');
  console.log('patched', file);
}
