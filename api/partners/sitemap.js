import { getSql } from '../_lib/db.js';

const SITE = (process.env.SITE_URL || 'https://www.antonovcenter.com.br').replace(/\/$/, '');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end('Method Not Allowed');
  }

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT slug, updated_at FROM partners
      WHERE deleted_at IS NULL AND status = 'ativo'
      ORDER BY name ASC
    `;
    const lastmod = new Date().toISOString().slice(0, 10);
    const urls = [
      `  <url><loc>${SITE}/parceiros</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
      ...rows.map((r) => {
        const lm = r.updated_at ? String(r.updated_at).slice(0, 10) : lastmod;
        return `  <url><loc>${SITE}/parceiros/${r.slug}</loc><lastmod>${lm}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`;
      }),
    ].join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.end(xml);
  } catch (err) {
    console.error('partners sitemap', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    return res.end('Erro ao gerar sitemap.');
  }
}
