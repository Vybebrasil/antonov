/**
 * Ajusta srcset/sizes do logo e wireframe (PageSpeed — entrega de imagens).
 * Uso: node scripts/patch-image-delivery.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const LOGO_SIZES = '(max-width: 880px) 42vw, 211px';

function patch(html, name) {
  let out = html;

  out = out.replace(
    /srcset="assets\/logo-211\.webp 211w, assets\/logo\.webp 422w" sizes="211px"/g,
    `srcset="assets/logo-211.webp 211w, assets/logo.webp 422w" sizes="${LOGO_SIZES}"`
  );
  out = out.replace(
    /src="assets\/logo-422\.png" srcset="assets\/logo-211\.png 211w, assets\/logo-422\.png 422w" sizes="211px"/g,
    `src="assets/logo-211.png" srcset="assets/logo-211.png 211w, assets/logo-422.png 422w" sizes="${LOGO_SIZES}"`
  );

  out = out.replace(
    /srcset="assets\/wireframe-side-640\.webp 640w, assets\/wireframe-side\.webp 1024w"/g,
    'srcset="assets/wireframe-side-640.webp 640w, assets/wireframe-side.webp 937w"'
  );
  out = out.replace(
    /src="assets\/wireframe-side-1024\.png"/g,
    'src="assets/wireframe-side-937.png"'
  );

  if (name === 'index.html') {
    out = out.replace(
      /<link rel="preload" as="image" href="\/assets\/wireframe-side\.webp"[^>]*>/,
      '<link rel="preload" as="image" type="image/webp" fetchpriority="high" imagesrcset="/assets/wireframe-side-640.webp 640w, /assets/wireframe-side.webp 937w" imagesizes="(max-width: 880px) 95vw, 937px" />'
    );
  }

  return out;
}

for (const name of readdirSync(root).filter((n) => n.endsWith('.html'))) {
  const path = join(root, name);
  const html = readFileSync(path, 'utf8');
  const next = patch(html, name);
  if (next !== html) {
    writeFileSync(path, next, 'utf8');
    console.log('patched', name);
  }
}
