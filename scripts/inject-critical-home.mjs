/**
 * Injeta css/critical-home.css no <style> inline da home.
 * Uso:
 * - node scripts/inject-critical-home.mjs        -> dist/index.html
 * - node scripts/inject-critical-home.mjs --source -> index.html (legado)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import CleanCSS from 'clean-css';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const targetSource = process.argv.includes('--source');
const indexPath = targetSource
  ? join(root, 'index.html')
  : join(root, 'dist', 'index.html');
const heroCss = readFileSync(join(root, 'css', 'critical-home.css'), 'utf8');
const minified = new CleanCSS({ level: 1 }).minify(heroCss).styles;
const marker = '/* hero CLS */';

if (!existsSync(indexPath)) {
  console.log(`skip critical inject (${targetSource ? 'source' : 'dist'} missing)`);
  process.exit(0);
}

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
console.log(`injected critical-home into ${targetSource ? 'index.html' : 'dist/index.html'}`);
