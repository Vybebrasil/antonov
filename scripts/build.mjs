/**
 * Build estático: minifica JS/CSS, HTML com <style> inline → pasta dist/
 * Uso: npm run build
 */
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  cpSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';
import CleanCSS from 'clean-css';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');

const JS_FILES = [
  'seo-config.js',
  'seo-schema.js',
  'leads-config.js',
  'vip-leads.js',
  'app.js',
  'contato-form.js',
  'trabalhe-conosco-form.js',
];

const COPY_FILES = [
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  'google4b3d7f08db2b7f07.html',
];

const cssMin = new CleanCSS({ level: 2 });

async function minifyJsToDist(file) {
  const code = readFileSync(join(root, file), 'utf8');
  const out = await esbuild.transform(code, {
    minify: true,
    target: 'es2020',
    legalComments: 'none',
  });
  const outName = file.replace(/\.js$/, '.min.js');
  writeFileSync(join(dist, outName), out.code, 'utf8');
  console.log('js', outName);
}

function prepareDist() {
  mkdirSync(dist, { recursive: true });
  cpSync(join(root, 'assets'), join(dist, 'assets'), { recursive: true });
  for (const f of COPY_FILES) {
    try {
      cpSync(join(root, f), join(dist, f));
    } catch {
      /* opcional */
    }
  }
}

function processHtml(name) {
  let html = readFileSync(join(root, name), 'utf8');

  html = html.replace(/<style>([\s\S]*?)<\/style>/gi, (_, block) => {
    const { styles } = cssMin.minify(block);
    return `<style>${styles}</style>`;
  });

  for (const file of JS_FILES) {
    const base = file.replace(/\.js$/, '');
    html = html
      .split(`src="${file}"`).join(`src="${base}.min.js"`)
      .split(`src='${file}'`).join(`src='${base}.min.js'`);
  }

  html = html.split('href="styles.css"').join('href="styles.min.css"');
  html = html.split("href='styles.css'").join("href='styles.min.css'");

  writeFileSync(join(dist, name), html, 'utf8');
  console.log('html', name);
}

async function main() {
  prepareDist();

  const { styles } = cssMin.minify(readFileSync(join(root, 'styles.css'), 'utf8'));
  writeFileSync(join(dist, 'styles.min.css'), styles, 'utf8');
  console.log('css styles.min.css');

  for (const file of JS_FILES) {
    await minifyJsToDist(file);
  }

  const htmlFiles = readdirSync(root).filter((n) => n.endsWith('.html'));
  for (const name of htmlFiles) {
    processHtml(name);
  }

  console.log(`\nBuild concluído → ${dist}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
