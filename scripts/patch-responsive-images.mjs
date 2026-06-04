/**
 * Aplica <picture> + srcset em logo e wireframe da home.
 * Uso: node scripts/patch-responsive-images.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function wrapLogoDark(fullTag) {
  const attrs = fullTag
    .replace(/^<img\s+/i, '')
    .replace(/>$/, '')
    .replace(/\s*src="assets\/logo\.png"/gi, '')
    .replace(/\s*loading="lazy"/gi, '')
    .trim();
  return `<picture class="logo-picture"><source type="image/webp" srcset="assets/logo-211.webp 211w, assets/logo.webp 422w" sizes="211px"><img ${attrs} src="assets/logo-422.png" srcset="assets/logo-211.png 211w, assets/logo-422.png 422w" sizes="211px"></picture>`;
}

function wrapLogoLight(fullTag) {
  const attrs = fullTag
    .replace(/^<img\s+/i, '')
    .replace(/>$/, '')
    .replace(/\s*src="assets\/logo-preta\.png"/gi, '')
    .trim();
  return `<picture class="logo-picture"><source type="image/webp" srcset="assets/logo-preta-253.webp 253w, assets/logo-preta.webp 506w" sizes="253px"><img ${attrs} src="assets/logo-preta-506.png" srcset="assets/logo-preta-253.png 253w, assets/logo-preta-506.png 506w" sizes="253px"></picture>`;
}

const WIREFRAME_PICTURE = `<picture class="hero__wireframe">
  <source type="image/webp" srcset="assets/wireframe-side-640.webp 640w, assets/wireframe-side.webp 1024w" sizes="(max-width: 880px) 95vw, 937px">
  <img class="hero__wireframe__img" src="assets/wireframe-side-1024.png" alt="Hangar Antonov Center — estrutura da academia em Irecê" width="937" height="937" fetchpriority="high" decoding="async">
</picture>`;

function patchLogo(html) {
  return html
    .replace(/<img[^>]*src="assets\/logo\.png"[^>]*>/gi, wrapLogoDark)
    .replace(/<img[^>]*src="assets\/logo-preta\.png"[^>]*>/gi, wrapLogoLight);
}

function patchIndexPreload(html) {
  if (html.includes('wireframe-side.webp')) return html;
  const insert =
    '  <link rel="preload" as="image" href="assets/wireframe-side.webp" type="image/webp" fetchpriority="high" />\n';
  return html.replace(
    /(<link rel="preload" as="image" href="\/assets\/foto-hero\.webp"[^>]*>)/,
    `${insert}$1`
  );
}

for (const name of readdirSync(root).filter((n) => n.endsWith('.html'))) {
  const path = join(root, name);
  let html = readFileSync(path, 'utf8');
  const before = html;
  html = patchLogo(html);
  if (name === 'index.html') {
    html = html.replace(/<img class="hero__wireframe"[^>]*>/i, WIREFRAME_PICTURE);
    html = patchIndexPreload(html);
  }
  if (html !== before) {
    writeFileSync(path, html, 'utf8');
    console.log('patched', name);
  }
}
