import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';
import CleanCSS from 'clean-css';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cssMin = new CleanCSS({ level: 2 });

writeFileSync(
  join(root, 'dist', 'form-render.min.js'),
  (await esbuild.transform(readFileSync(join(root, 'form-render.js'), 'utf8'), {
    minify: true,
    target: 'es2020',
    legalComments: 'none',
  })).code
);

mkdirSync(join(root, 'dist', 'css', 'pages'), { recursive: true });
writeFileSync(
  join(root, 'dist', 'css', 'pages', 'form.min.css'),
  cssMin.minify(readFileSync(join(root, 'css/pages/form.css'), 'utf8')).styles
);

let html = readFileSync(join(root, 'form.html'), 'utf8');
html = html
  .split('src="/form-render.js"').join('src="/form-render.min.js"')
  .split('href="/css/pages/form.css"').join('href="/css/pages/form.min.css"')
  .split('href="/styles.css"').join('href="/styles.min.css"');
writeFileSync(join(root, 'dist', 'form.html'), html);
console.log('form rebuilt');
