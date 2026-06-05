/**
 * Build estático: minifica JS/CSS externos → pasta dist/
 * Uso: npm run build
 */
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  cpSync,
  rmSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';
import CleanCSS from 'clean-css';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');
const pagesCssDir = join(root, 'css', 'pages');

const JS_FILES = [
  'seo-config.js',
  'seo-schema.js',
  'leads-config.js',
  'vip-leads.js',
  'google-review-prompt.js',
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

function minifyCssToDist(srcPath, distPath) {
  const { styles } = cssMin.minify(readFileSync(srcPath, 'utf8'));
  mkdirSync(dirname(distPath), { recursive: true });
  writeFileSync(distPath, styles, 'utf8');
}

function prepareDist() {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  cpSync(join(root, 'assets'), join(dist, 'assets'), { recursive: true });
  cpSync(join(root, 'assets', 'favicon.ico'), join(dist, 'favicon.ico'));
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

  for (const file of JS_FILES) {
    const base = file.replace(/\.js$/, '');
    html = html
      .split(`src="${file}"`).join(`src="${base}.min.js"`)
      .split(`src='${file}'`).join(`src='${base}.min.js'`);
  }

  html = html.split('href="styles.css"').join('href="styles.min.css"');
  html = html.split("href='styles.css'").join("href='styles.min.css'");
  html = html.split("load('styles.css')").join("load('styles.min.css')");
  html = html.split('load("styles.css")').join('load("styles.min.css")');

  html = html.replace(
    /href="css\/pages\/([^"]+)\.css"/g,
    (_, slug) => `href="css/pages/${slug}.min.css"`
  );
  if (name === 'index.html') {
    html = html.replace(
      /load\('css\/pages\/home\.css'\)/g,
      "load('css/pages/home.min.css')"
    );
  }

  html = html.replace(
    /<script src="seo-config\.min\.js"(?![^>]*\bdefer\b)/g,
    '<script src="seo-config.min.js" defer'
  );
  html = html.replace(
    /<script src="seo-schema\.min\.js"(?![^>]*\bdefer\b)/g,
    '<script src="seo-schema.min.js" defer'
  );

  for (const base of [
    'leads-config',
    'vip-leads',
    'contato-form',
    'trabalhe-conosco-form',
    'app',
  ]) {
    html = html.replace(
      new RegExp(`<script src="${base}\\.min\\.js"(?![^>]*\\bdefer\\b)`, 'g'),
      `<script src="${base}.min.js" defer`
    );
  }

  writeFileSync(join(dist, name), html, 'utf8');
  console.log('html', name);
}

function injectCriticalHomeIntoDist() {
  const indexPath = join(dist, 'index.html');
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
  console.log('critical home injected in dist/index.html');
}

async function main() {
  prepareDist();

  minifyCssToDist(join(root, 'styles.css'), join(dist, 'styles.min.css'));
  console.log('css styles.min.css');

  if (readdirSync(join(root, 'css')).includes('pages')) {
    mkdirSync(join(dist, 'css', 'pages'), { recursive: true });
    for (const file of readdirSync(pagesCssDir).filter((n) => n.endsWith('.css'))) {
      const slug = file.replace(/\.css$/, '');
      minifyCssToDist(join(pagesCssDir, file), join(dist, 'css', 'pages', `${slug}.min.css`));
      console.log('css pages', `${slug}.min.css`);
    }
  }

  for (const file of JS_FILES) {
    await minifyJsToDist(file);
  }

  const htmlFiles = readdirSync(root).filter((n) => n.endsWith('.html'));
  for (const name of htmlFiles) {
    processHtml(name);
  }

  injectCriticalHomeIntoDist();

  console.log(`\nBuild concluído → ${dist}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
