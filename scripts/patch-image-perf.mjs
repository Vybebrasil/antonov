import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const WEBP_BG = [
  ['assets/foto-hero.png', 'assets/foto-hero.webp'],
  ['assets/disc-01-barbells.png', 'assets/disc-01-barbells.webp'],
  ['assets/disc-02.png', 'assets/disc-02.webp'],
  ['assets/disc-03-treadmills.png', 'assets/disc-03-treadmills.webp'],
  ['assets/fotogeral.png', 'assets/fotogeral.webp'],
  ['assets/space-hightech.png', 'assets/space-hightech.webp'],
  ['assets/purpose-bg.png', 'assets/purpose-bg.webp'],
];

function imageSetCss(png, webp) {
  return `image-set(url("${webp}") type("image/webp"), url("${png}") type("image/png"))`;
}

function patchCssBackgrounds(html) {
  for (const [png, webp] of WEBP_BG) {
    const escaped = png.replace(/\./g, '\\.');
    const re = new RegExp(`url\\("${escaped}"\\)`, 'g');
    if (!html.includes('image-set')) {
      html = html.replace(re, imageSetCss(png, webp));
    }
  }
  return html;
}

function patchImgTags(html, isHome) {
  return html.replace(/<img\b([^>]*?)(\s*\/?)>/gi, (match, attrs, slash) => {
    const trimmed = attrs.trim();
    const isLogoNav = /nav__logo|page-mask__logo/i.test(trimmed);
    const isHeroWire = /hero__wireframe/i.test(trimmed);
    const hasLazy = /loading\s*=/i.test(trimmed);
    const hasDecode = /decoding\s*=/i.test(trimmed);

    let next = trimmed;
    if (!isLogoNav && !hasLazy && !isHeroWire) {
      next += ' loading="lazy"';
    }
    if (!hasDecode) {
      next += ' decoding="async"';
    }
    if (isHome && isHeroWire && !/fetchpriority\s*=/i.test(next)) {
      next += ' fetchpriority="high"';
    }
    return `<img ${next}>`;
  });
}

function patchFile(filePath) {
  const isHome = /index\.html$/i.test(filePath);
  let html = readFileSync(filePath, 'utf8');
  html = patchCssBackgrounds(html);
  html = patchImgTags(html, isHome);
  writeFileSync(filePath, html, 'utf8');
  console.log('perf', filePath);
}

function processDir(dir) {
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.html')) continue;
    patchFile(join(dir, name));
  }
}

processDir(root);
if (existsSync(join(root, 'Antonov'))) processDir(join(root, 'Antonov'));
