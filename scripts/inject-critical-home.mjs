/**
 * Injeta css/critical-home.css no <style> inline da index.html.
 * Uso: node scripts/inject-critical-home.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import CleanCSS from 'clean-css';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const indexPath = join(root, 'index.html');
const heroCss = readFileSync(join(root, 'css', 'critical-home.css'), 'utf8');
const minified = new CleanCSS({ level: 1 }).minify(heroCss).styles;
const marker = '/* hero CLS */';

let html = readFileSync(indexPath, 'utf8');
const block = `${marker}\n${minified}`;

if (html.includes(marker)) {
  html = html.replace(
    /\/\* hero CLS \*\/[\s\S]*?(?=<\/style>)/,
    `${block}\n`
  );
} else {
  html = html.replace(/<\/style>/, `\n${block}\n</style>`);
}

writeFileSync(indexPath, html, 'utf8');
console.log('injected critical-home into index.html');
