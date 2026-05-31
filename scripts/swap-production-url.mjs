/**
 * Go-live: troca siteUrl temporário (Vercel) pelo domínio final.
 * Uso: node scripts/swap-production-url.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const seoPagesPath = join(__dirname, 'seo-pages.json');
const seoPages = JSON.parse(readFileSync(seoPagesPath, 'utf8'));
const production = seoPages.productionSiteUrl || 'https://www.antonovcenter.com.br';
const interim = seoPages.siteUrl;

if (interim === production) {
  console.log('siteUrl já está no domínio de produção:', production);
  process.exit(0);
}

seoPages.siteUrl = production;
seoPages.image = production + '/assets/foto-hero.png';
writeFileSync(seoPagesPath, JSON.stringify(seoPages, null, 2) + '\n', 'utf8');

const configPath = join(root, 'seo-config.js');
let cfg = readFileSync(configPath, 'utf8');
cfg = cfg.replace(/siteUrl:\s*'[^']+'/, `siteUrl: '${production}'`);
writeFileSync(configPath, cfg, 'utf8');

const mirrorCfg = join(root, 'Antonov', 'seo-config.js');
if (existsSync(mirrorCfg)) writeFileSync(mirrorCfg, cfg, 'utf8');

process.env.SITE_URL = production;
execSync('node scripts/generate-sitemap.mjs', { cwd: root, stdio: 'inherit' });
execSync('node scripts/patch-seo-head.mjs', { cwd: root, stdio: 'inherit' });

console.log(`\nTrocado ${interim} → ${production}`);
console.log('Próximo: adicionar redirect vercel.app em vercel.json (ver SEO-CHECKLIST.md)');
