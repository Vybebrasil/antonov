/**
 * Prepara dist mínimo para preview local (sem limpar dist — evita EPERM).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';
import CleanCSS from 'clean-css';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const cssMin = new CleanCSS({ level: 2 });

mkdirSync(join(dist, 'css', 'pages'), { recursive: true });
mkdirSync(join(dist, 'assets'), { recursive: true });

async function minifyJs(file) {
  const out = file.replace(/\.js$/, '.min.js');
  const result = await esbuild.transform(readFileSync(join(root, file), 'utf8'), {
    minify: true,
    target: 'es2020',
    legalComments: 'none',
  });
  writeFileSync(join(dist, out), result.code);
  return out;
}

function minifyCss(srcRel, destRel) {
  writeFileSync(
    join(dist, destRel),
    cssMin.minify(readFileSync(join(root, srcRel), 'utf8')).styles,
  );
}

minifyCss('styles.css', 'styles.min.css');
minifyCss('css/pages/achados-e-perdidos.css', 'css/pages/achados-e-perdidos.min.css');
minifyCss('css/pages/admin.css', 'css/pages/admin.min.css');
minifyCss('css/pages/home.css', 'css/pages/home.min.css');

await minifyJs('achados-e-perdidos.js');
for (const f of ['app.js', 'seo-config.js', 'seo-schema.js', 'google-review-prompt.js', 'vip-leads.js', 'leads-config.js']) {
  if (existsSync(join(root, f))) await minifyJs(f);
}

// admin bundle
const adminBundle = [
  readFileSync(join(root, 'admin.js'), 'utf8'),
  readFileSync(join(root, 'admin-pdi.js'), 'utf8'),
  readFileSync(join(root, 'admin-achados.js'), 'utf8'),
].join('\n');
writeFileSync(
  join(dist, 'admin.min.js'),
  (await esbuild.transform(adminBundle, { minify: true, target: 'es2020', legalComments: 'none' })).code,
);

function rewritePublicHtml(html) {
  return html
    .replaceAll('href="styles.css"', 'href="/styles.min.css"')
    .replaceAll("load('styles.css')", "load('/styles.min.css')")
    .replace(/href="(?:\/)?css\/pages\/([^"]+)\.css"/g, 'href="/css/pages/$1.min.css"')
    .replace(/src="(?:\/)?([a-z0-9-]+)\.js"/gi, 'src="/$1.min.js"')
    .replace(/src='(?:\/)?([a-z0-9-]+)\.js'/gi, "src='/$1.min.js'");
}

let achadosHtml = readFileSync(join(root, 'achados-e-perdidos.html'), 'utf8');
writeFileSync(join(dist, 'achados-e-perdidos.html'), rewritePublicHtml(achadosHtml));

let home = readFileSync(join(root, 'home.html'), 'utf8');
writeFileSync(join(dist, 'index.html'), rewritePublicHtml(home));

let adminHtml = readFileSync(join(root, 'admin.html'), 'utf8');
adminHtml = adminHtml
  .replaceAll('src="/admin.js"', 'src="/admin.min.js"')
  .replaceAll('href="/css/pages/admin.css"', 'href="/css/pages/admin.min.css"')
  .replace(/<script[^>]*src=["']\/?admin-pdi\.js["'][^>]*>\s*<\/script>\s*/gi, '')
  .replace(/<script[^>]*src=["']\/?admin-achados\.js["'][^>]*>\s*<\/script>\s*/gi, '');
writeFileSync(join(dist, 'admin.html'), adminHtml);

try {
  cpSync(join(root, 'assets'), join(dist, 'assets'), { recursive: true, force: true });
} catch (err) {
  console.warn('assets copy partial:', err.message);
}

console.log('Preview pronto em dist/');
