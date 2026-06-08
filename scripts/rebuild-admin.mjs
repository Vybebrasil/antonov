import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';
import CleanCSS from 'clean-css';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cssMin = new CleanCSS({ level: 2 });

writeFileSync(
  join(root, 'dist', 'admin.min.js'),
  (await esbuild.transform(readFileSync(join(root, 'admin.js'), 'utf8'), {
    minify: true,
    target: 'es2020',
    legalComments: 'none',
  })).code
);

mkdirSync(join(root, 'dist', 'css', 'pages'), { recursive: true });
writeFileSync(
  join(root, 'dist', 'css', 'pages', 'admin.min.css'),
  cssMin.minify(readFileSync(join(root, 'css/pages/admin.css'), 'utf8')).styles
);

let html = readFileSync(join(root, 'admin.html'), 'utf8');
html = html
  .split('src="/admin.js"').join('src="/admin.min.js"')
  .split("src='/admin.js'").join("src='/admin.min.js'")
  .split('href="/css/pages/admin.css"').join('href="/css/pages/admin.min.css"')
  .split("href='/css/pages/admin.css'").join("href='/css/pages/admin.min.css'");
writeFileSync(join(root, 'dist', 'admin.html'), html);

console.log('admin rebuilt');
