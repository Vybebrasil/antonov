import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function fix(html, filePath) {
  const isHome = /index\.html$/i.test(filePath);

  html = html.replace(
    /decoding="async"\s*\/\s*loading="lazy"\s*decoding="async">/g,
    'decoding="async" loading="lazy">'
  );
  html = html.replace(
    /decoding="async"\s*\/\s*loading="lazy"\s*decoding="async"\s*>/g,
    'decoding="async" loading="lazy">'
  );

  html = html.replace(
    /<img src="assets\/logo\.png"([^>]*)\s*\/\s*loading="lazy"[^>]*>/g,
    '<img src="assets/logo.png"$1 decoding="async">'
  );

  html = html.replace(
    /<img class="hero__wireframe"([^>]*)\s*\/\s*fetchpriority="high">/g,
    '<img class="hero__wireframe"$1 fetchpriority="high" decoding="async">'
  );

  html = html.replace(/<img([^>]*)\s*\/\s*loading="lazy"\s*decoding="async">/g, '<img$1 loading="lazy" decoding="async">');

  html = html.replace(/<img([^>]*)\s*\/\s*>/g, '<img$1>');

  if (isHome) {
    html = html.replace(
      /<img class="hero__wireframe"([^>]*)>/g,
      (m, attrs) => {
        if (attrs.includes('fetchpriority')) return m;
        return `<img class="hero__wireframe"${attrs} fetchpriority="high" decoding="async">`;
      }
    );
  }

  return html;
}

function processDir(dir) {
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.html')) continue;
    const path = join(dir, name);
    const out = fix(readFileSync(path, 'utf8'), path);
    writeFileSync(path, out, 'utf8');
    console.log('fixed', path);
  }
}

processDir(root);
if (existsSync(join(root, 'Antonov'))) processDir(join(root, 'Antonov'));
