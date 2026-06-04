/**
 * Extrai <style> inline dos HTML para css/pages/*.css (melhora text/HTML ratio).
 * Uso: node scripts/extract-page-styles.mjs
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pagesDir = join(root, 'css', 'pages');

const nameMap = {
  'index.html': 'home',
  'trabalhe-conosco.html': 'trabalhe-conosco',
};

mkdirSync(pagesDir, { recursive: true });

for (const file of readdirSync(root).filter((n) => n.endsWith('.html'))) {
  const path = join(root, file);
  let html = readFileSync(path, 'utf8');
  const match = html.match(/<style>([\s\S]*?)<\/style>/i);
  if (!match) continue;

  const slug = nameMap[file] || basename(file, '.html');
  const cssPath = join(pagesDir, `${slug}.css`);
  let css = match[1].trim();
  css = css.replace(/url\(\s*["']assets\//g, 'url("/assets/');
  writeFileSync(cssPath, css + '\n', 'utf8');

  const link = `<link rel="stylesheet" href="css/pages/${slug}.css" />`;
  html = html.replace(/<style>[\s\S]*?<\/style>/i, link);
  writeFileSync(path, html, 'utf8');
  console.log('extracted', file, '→', `css/pages/${slug}.css`);
}

console.log('\nConcluído. Rode npm run build para minificar.');
