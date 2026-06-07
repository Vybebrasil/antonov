import { writeFileSync, existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const seoPages = JSON.parse(readFileSync(join(__dirname, 'seo-pages.json'), 'utf8'));
const siteUrl = (process.env.SITE_URL || seoPages.siteUrl).replace(/\/$/, '');
const lastmod = new Date().toISOString().slice(0, 10);

const priorityMap = {
  '/': { priority: '1.0', changefreq: 'weekly' },
  '/planos': { priority: '0.9', changefreq: 'weekly' },
  '/contato': { priority: '0.9', changefreq: 'monthly' },
  '/sobre': { priority: '0.8', changefreq: 'monthly' },
  '/trabalhe-conosco': { priority: '0.6', changefreq: 'monthly' },
};

const pages = Object.values(seoPages.pages)
  .filter((p) => !p.noindex)
  .map((p) => ({
    path: p.path,
    ...(priorityMap[p.path] || { priority: '0.5', changefreq: 'monthly' }),
  }));

const urls = pages
  .map(
    (p) => `  <url>
    <loc>${siteUrl}${p.path === '/' ? '/' : p.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
  )
  .join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

writeFileSync(join(root, 'sitemap.xml'), xml, 'utf8');

const robots = `# Antonov Center — ${siteUrl}
User-agent: *
Allow: /

Disallow: /api/
Disallow: /aulas
Disallow: /estudio
Disallow: /termos
Disallow: /privacidade
Disallow: /cookies

Sitemap: ${siteUrl}/sitemap.xml
`;
writeFileSync(join(root, 'robots.txt'), robots, 'utf8');

execSync('node scripts/generate-llms-txt.mjs', { cwd: root, stdio: 'inherit' });

console.log(`sitemap.xml, robots.txt e llms.txt — ${siteUrl} (${pages.length} URLs)`);
