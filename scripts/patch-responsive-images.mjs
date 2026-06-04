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
  return `<picture class="logo-picture"><source type="image/webp" srcset="assets/logo-211.webp 211w, assets/logo.webp 422w" sizes="(max-width: 880px) 42vw, 211px"><img ${attrs} src="assets/logo-211.png" srcset="assets/logo-211.png 211w, assets/logo-422.png 422w" sizes="(max-width: 880px) 42vw, 211px"></picture>`;
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
  <img
    class="hero__wireframe__img"
    alt=""
    width="640"
    height="640"
    decoding="async"
    aria-hidden="true"
    data-wire-webp="assets/wireframe-side-536.webp 536w, assets/wireframe-side-640.webp 640w"
    data-wire-sizes="(max-width: 880px) min(95vw, 640px), min(70vw, 640px)"
    data-wire-fallback="assets/wireframe-side-536.png"
  />
</picture>`;

function patchLogo(html) {
  return html
    .replace(/<img[^>]*src="assets\/logo\.png"[^>]*>/gi, wrapLogoDark)
    .replace(/<img[^>]*src="assets\/logo-preta\.png"[^>]*>/gi, wrapLogoLight);
}

function patchIndexPreload(html) {
  return html
    .replace(
      /\s*<link rel="preload" as="image"[^>]*wireframe-side[^>]*>\s*/g,
      '\n'
    )
    .replace(
      /\s*<link rel="preload" as="image" href="\/assets\/foto-hero\.webp"[^>]*>\s*/g,
      '\n'
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
    if (!html.includes('href="styles.css"')) {
      html = html.replace(
        /<\/style>\s*/,
        '</style>\n<link rel="stylesheet" href="styles.css" />\n<link rel="stylesheet" href="css/pages/home.css" />\n'
      );
    }
  }
  if (html !== before) {
    writeFileSync(path, html, 'utf8');
    console.log('patched', name);
  }
}
