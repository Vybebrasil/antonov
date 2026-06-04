/**
 * Remove bloqueio de renderização: CSS assíncrono, fontes assíncronas, SEO defer.
 * Uso: node scripts/patch-render-blocking.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=optional';

const CRITICAL_CSS = `<style>
:root{--bg:#EEEAE2;--ink:#0E0E10;--carbon:#131316;--yellow:#FAB10F;--blue:#2A8FD6;--f-body:system-ui,sans-serif;--f-display:Impact,sans-serif;--nav-h:76px;--pad-x:clamp(20px,4vw,64px)}
body{margin:0;font-family:var(--f-body);background:var(--bg);color:var(--ink)}
html.antonov-loading-pending .page-mask{transform:translateY(0);pointer-events:auto}
html.antonov-loading-pending body>:not(.page-mask){visibility:hidden}
.page-mask{position:fixed;inset:0;z-index:9999;background:var(--carbon);transform:translateY(-100%);transition:transform var(--mask-cover-duration,.38s) var(--mask-ease,ease)}
</style>
`;

const FONTS_BLOCK = `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="style" href="${FONTS_URL}" onload="this.onload=null;this.rel='stylesheet'" />
<noscript><link rel="stylesheet" href="${FONTS_URL}" /></noscript>`;

function asyncStylesheet(href) {
  return `<link rel="preload" href="${href}" as="style" />
<link rel="stylesheet" href="${href}" media="print" onload="this.media='all'" />
<noscript><link rel="stylesheet" href="${href}" /></noscript>`;
}

/** Corrige <noscript> aninhado gerado se o patch rodou duas vezes. */
function fixBrokenAsyncCss(html) {
  return html.replace(
    /<noscript><link rel="preload" href="([^"]+)" as="style" \/>\s*<link rel="stylesheet" href="\1" media="print" onload="this\.media='all'" \/>\s*<noscript><link rel="stylesheet" href="\1" \/><\/noscript><\/noscript>/g,
    '<noscript><link rel="stylesheet" href="$1" /></noscript>'
  );
}

function patchHead(html) {
  let out = fixBrokenAsyncCss(html);

  if (!out.includes('.page-mask{position:fixed')) {
    out = out.replace(
      /(<meta name="viewport"[^>]*>)/,
      `$1\n${CRITICAL_CSS}`
    );
  }

  if (!out.includes('onload="this.onload=null;this.rel=\'stylesheet\'"')) {
    out = out.replace(
      /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com" \/>\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin \/>\s*<link href="https:\/\/fonts\.googleapis\.com\/css2[^"]+" rel="stylesheet" \/>/,
      FONTS_BLOCK
    );
  }

  if (!out.includes('seo-config.js" defer')) {
    out = out.replace(
      /<script src="seo-config\.js"><\/script>\s*<script src="seo-schema\.js"><\/script>/,
      '<script src="seo-config.js" defer></script>\n<script src="seo-schema.js" defer></script>'
    );
  }

  /* CSS síncrono no head — async (media=print) quebrava layout em produção */

  return out;
}

for (const name of readdirSync(root).filter((n) => n.endsWith('.html'))) {
  const path = join(root, name);
  const html = readFileSync(path, 'utf8');
  /* index: folhas fora do head (auditoria 2025 não marca como render-blocking) */
  if (name === 'index.html' && html.includes("load('styles.css')")) continue;
  const patched = patchHead(html);
  if (patched !== html) {
    writeFileSync(path, patched, 'utf8');
    console.log('patched', name);
  }
}
