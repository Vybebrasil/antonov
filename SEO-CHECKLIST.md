# SEO — Checklist pós-deploy (Antonov Center)

## Antes de publicar

1. Atualize o domínio em [`seo-config.js`](seo-config.js) (`siteUrl`).
2. Rode `node scripts/generate-sitemap.mjs` (opcional: defina `SITE_URL` no `.env`).
3. Confirme CEP em `seo-config.js` → `business.postalCode` se tiver.

## Após apontar o domínio na Vercel

1. **Google Search Console** — adicionar propriedade, verificar DNS, enviar `https://SEU-DOMINIO/sitemap.xml`.
2. **Google Business Profile** — NAP idêntico ao site:
   - Antonov Center
   - Av. 1º de Janeiro, Irecê, BA
   - +55 74 99963-1507
   - antonovacademia@gmail.com
   - Link: `/contato` e `/planos`
3. **Bing Webmaster Tools** — mesmo sitemap (opcional).
4. Peça avaliações no perfil do Google (sinal local).

## Arquivos do projeto

| Arquivo | Função |
|---------|--------|
| `seo-config.js` | URL, NAP, negócio local |
| `seo-schema.js` | JSON-LD SportsActivityLocation |
| `robots.txt` | Crawlers + sitemap |
| `sitemap.xml` | URLs canônicas |
| `scripts/seo-pages.json` | Títulos/descriptions por página |
| `scripts/patch-seo-head.mjs` | Reaplicar meta no HTML após mudanças |
