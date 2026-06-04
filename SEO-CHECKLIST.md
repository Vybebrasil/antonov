# SEO — Checklist Antonov Center

## URL canônica (importante)

| Fase | `siteUrl` em `seo-config.js` e `scripts/seo-pages.json` |
|------|--------------------------------------------------------|
| **Agora (pré-domínio)** | `https://antonov-one.vercel.app` |
| **Após go-live** | `https://www.antonovcenter.com.br` |

### Troca automática no go-live

```bash
node scripts/swap-production-url.mjs
```

Isso atualiza `seo-config.js`, `seo-pages.json`, roda `patch-seo-head.mjs` e regenera `sitemap.xml` / `robots.txt`.

### Redirect Vercel (adicione em `vercel.json` após o domínio custom estar ativo)

```json
{
  "source": "/:path*",
  "has": [{ "type": "host", "value": "antonov-one.vercel.app" }],
  "destination": "https://www.antonovcenter.com.br/:path*",
  "permanent": true,
  "statusCode": 308
}
```

Já configurado: `antonovcenter.com.br` → `www.antonovcenter.com.br`.

### Não fazer antes do domínio existir

- Cadastrar Search Console em `antonovcenter.com.br` se o DNS ainda não aponta
- Enviar sitemap para URL que não responde

---

## Antes de cada deploy

1. Confirme `siteUrl` correto para a fase atual.
2. `npm run seo:sitemap` (ou `npm run seo:patch` após mudar meta em `seo-pages.json`).
3. Se tiver PNGs em `assets/`: `npm run seo:webp` (requer `npm install`).

## NAP (Name, Address, Phone)

Deve ser **idêntico** no site, schema (`seo-config.js`), rodapé e Google Business Profile:

| Campo | Valor |
|-------|--------|
| Nome | Antonov Center |
| Endereço | Av. 1º de Janeiro, Irecê, BA |
| CEP | 44860-201 |
| Telefone | +55 74 99963-1507 |
| E-mail | antonovacademia@gmail.com |
| Site | URL canônica + `/contato`, `/planos` |

---

## Google Search Console (após domínio no ar)

1. Adicionar propriedade `https://www.antonovcenter.com.br` (prefixo de URL ou domínio).
2. Verificar via DNS na Vercel ou arquivo HTML.
3. Enviar sitemap: `https://www.antonovcenter.com.br/sitemap.xml`
4. Inspecionar URL: `/` e `/planos`
5. Acompanhar: Cobertura, Core Web Vitals, Usabilidade em dispositivos móveis
6. Vincular propriedade ao **Google Analytics 4**

---

## Google Business Profile

1. Categoria: academia / centro de fitness / ginásio
2. Endereço e telefone = tabela NAP acima
3. Site: domínio custom; destaques para tour e planos
4. Horário: alinhado ao schema (Seg–Dom 05:00–24:00, se for o caso)
5. Fotos: fachada, interior, equipamentos (preferir geo-tag Irecê)
6. Posts semanais (tour grátis, horários, novidades)
7. **Avaliações:** pedir após tour; respostas em até 48h; não inventar notas no site (sem `AggregateRating` no schema até ter reviews reais)

---

## Bing Webmaster Tools

1. Importar site e sitemap
2. Mesmo NAP que o GBP

---

## Google Analytics 4

1. Criar propriedade GA4 para o domínio final
2. Instalar tag (GTM ou gtag.js) — placeholder no site: configurar ID em produção
3. Eventos sugeridos:
   - `click_whatsapp`
   - `form_tour_submit`
   - `form_vip_submit`
4. Vincular GA4 ↔ Search Console

---

## Consistência NAP off-site

Auditar e alinhar:

- Instagram @antonovcenter
- Google Maps (link em `seo-config.js` → `mapsUrl`)
- WhatsApp Business
- Diretórios locais (opcional): Applocal, páginas amarelas BA

---

## Arquivos do projeto

| Arquivo | Função |
|---------|--------|
| `seo-config.js` | URL, NAP, negócio local, `productionSiteUrl` |
| `seo-schema.js` | JSON-LD: LocalBusiness, WebSite, Breadcrumb, FAQ, ContactPage |
| `robots.txt` | Crawlers + sitemap |
| `sitemap.xml` | URLs indexáveis (sem páginas legais `noindex`) |
| `scripts/seo-pages.json` | Títulos, descriptions, `ogImage`, `noindex` |
| `scripts/patch-seo-head.mjs` | Reaplicar meta no HTML |
| `scripts/patch-internal-links.mjs` | Nav, footer, URLs limpas |
| `scripts/generate-sitemap.mjs` | Regenerar sitemap/robots |
| `scripts/swap-production-url.mjs` | Go-live: Vercel → domínio custom |
| `vercel.json` | Redirect apex → www; cache assets |

## Rich results (validar após deploy)

- [Google Rich Results Test](https://search.google.com/test/rich-results): home (`SportsActivityLocation`), `/planos` (`FAQPage`)
- PageSpeed Insights (mobile): meta LCP &lt; 2,5s após WebP no servidor

## Checklist LCP (home) por release

1. Rodar `npm run build` e confirmar que o build termina sem mutar `index.html` da raiz.
2. Validar em `dist/index.html`:
   - `/* hero CLS */` presente e atualizado.
   - `styles.min.css` síncrono no head.
   - `home.min.css` em `media=\"print\"` + `onload`.
3. Validar assets do hero em `dist/assets`:
   - `foto-hero.png`
   - `foto-hero.webp`
   - `foto-hero-1280.webp`
   - `foto-hero-960.webp`
4. Teste manual:
   - cold load da `/` (sem cache) com hero visível imediatamente.
   - navegação interna para `/` com máscara sem esconder conteúdo.
5. PageSpeed/Lighthouse mobile:
   - elemento LCP deve ser o `h1` do hero na maior parte dos testes.
   - sem regressão visual em nav, hero e CTA.

## Conteúdo (médio prazo, opcional)

- Blog ou landing `/guia/academia-irece` só se houver capacidade de atualizar
- Não obrigatório para indexação local básica
