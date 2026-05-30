import { writeFileSync, existsSync, readFileSync } from 'fs';
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

const siteUrl = (process.env.SITE_URL || 'https://www.antonovcenter.com.br').replace(
  /\/$/,
  ''
);
const lastmod = new Date().toISOString().slice(0, 10);

const pages = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/planos', priority: '0.9', changefreq: 'weekly' },
  { path: '/contato', priority: '0.9', changefreq: 'monthly' },
  { path: '/aulas', priority: '0.8', changefreq: 'monthly' },
  { path: '/estudio', priority: '0.8', changefreq: 'monthly' },
  { path: '/sobre', priority: '0.8', changefreq: 'monthly' },
  { path: '/trabalhe-conosco', priority: '0.6', changefreq: 'monthly' },
  { path: '/termos', priority: '0.3', changefreq: 'yearly' },
  { path: '/privacidade', priority: '0.3', changefreq: 'yearly' },
  { path: '/cookies', priority: '0.3', changefreq: 'yearly' },
];

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

const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;
writeFileSync(join(root, 'robots.txt'), robots, 'utf8');

console.log(`sitemap.xml e robots.txt gerados para ${siteUrl}`);
