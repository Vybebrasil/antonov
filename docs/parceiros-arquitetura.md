# Parceiros Antonov — arquitetura

Documento da auditoria do site Antonov Center e das decisões do módulo **Parceiros Antonov**.

## Stack encontrada (não substituída)

| Camada | Tecnologia |
| --- | --- |
| Frontend público | HTML estático + CSS próprio (`styles.css`, `css/pages/*`) + JavaScript vanilla (`app.js`) |
| Build | `scripts/build.mjs` (esbuild + CleanCSS) → `dist/` |
| Deploy | Vercel (`vercel.json`, `cleanUrls`, `outputDirectory: dist`) |
| Banco | Neon Postgres (`@neondatabase/serverless`) via `DATABASE_URL` / `POSTGRES_URL` |
| Auth admin | Cookie HttpOnly JWT (`jose`) + `admin_users` + bcrypt (`api/_lib/admin-auth.js`) |
| Admin UI | SPA em `/admin` (`admin.html` + `admin.js` + módulos concatenados no build) |
| E-mail | Resend |
| Analytics existente | GA4 (`G-SXNR4ZH6Y5`) + leitura no dashboard admin |
| Uploads | Base64 no Postgres (padrão de Achados e Perdidos), validação em `parseFilePayload` |
| Rate limit | `form_rate_limits` + hash de IP (`api/_lib/rate-limit.js`) |
| SEO | `seo-config.js`, `seo-schema.js`, `scripts/seo-pages.json`, sitemap gerado |

Não há Next.js, React, Prisma nem ORM. Rotas públicas são arquivos HTML; APIs são Serverless Functions no diretório `api/`.

## Design system (fonte de verdade)

- Tokens em `:root` de `styles.css`: `--bg #EEEAE2`, `--ink #0E0E10`, `--carbon #131316`, `--yellow #FAB10F`, `--blue #2A8FD6`
- Display: Anton / Impact; corpo: Inter; kicker: mono (`/ ECOSSISTEMA ANTONOV`)
- Nav fixa, pills, CTA amarelo com seta, page-hero com crumb `/ 01 · …`
- Animações: ticker CSS infinito, `prefers-reduced-motion` em `app.js` e CSS
- Admin: tema carbon + amarelo (`css/pages/admin.css`), tabelas, badges, estados de loading/erro

O módulo público reutiliza esses padrões. O admin ganha uma aba **Parceiros** no painel existente, sem identidade paralela.

## Rotas

### Públicas

| URL | Origem |
| --- | --- |
| `/parceiros` | `parceiros.html` |
| `/parceiros?categoria=nutricao` | mesmos HTML + query string |
| `/parceiros/:slug` | rewrite → `/parceiros-perfil?slug=:slug` |
| `/go/:slug/:channel` | rewrite → `/api/partners/go` (302 após gravar evento) |

### APIs públicas

- `GET /api/partners` — listagem/filtros
- `GET /api/partners?view=home` — carrosséis da Home
- `GET /api/partners/:slug` — perfil público
- `POST /api/partners/events` — analytics (rate limit)
- `GET /api/partners/media/:id` — foto/logo
- `GET /api/partners/sitemap` — sitemap dinâmico
- `GET /api/partners/jobs/tick` — atualiza status de campanhas/contratos

### Admin (auth JWT existente)

Prefixo `/api/admin/parceiros/*`, roteado em `handlers/admin/parceiros.js`.

## Modelagem

Prefixo `partner_` para não colidir com `forms`, `leads_*`, `pdis_*`, `achados_perdidos`.

Tabelas: `partner_categories`, `partners`, `partner_services`, `partner_media`, `partner_plans`, `partner_plan_benefits`, `partner_contracts`, `partner_placements`, `partner_campaigns`, `partner_campaign_placements`, `partner_creatives`, `partner_payments`, `partner_analytics_events`, `partner_settings`.

RBAC: coluna `role` e `partner_id` em `admin_users`. Portal em `/partner` para `role = parceiro`.


## Decisões

1. **Sem framework novo.** Páginas estáticas hidratam dados via `fetch`.
2. **Tracking próprio + GA4.** Eventos internos em `partner_analytics_events`; `gtag` dispara em paralelo quando existir.
3. **Links externos passam por `/go/`.** WhatsApp, Instagram, Maps e site nunca são o `href` direto nos CTAs principais.
4. **Impressão só no viewport.** `IntersectionObserver` (threshold 0.4), uma vez por parceiro/sessão.
5. **Prioridade de exposição:** campanha ativa → prioridade do plano → `priority` do parceiro → `sort_order` → rotação estável por dia.
6. **Status automático** de contratos e campanhas no carregamento do dashboard/listagens (sem depender só de cron).
7. **Soft delete** (`deleted_at`) em entidades comerciais. Parceiro `expirado`/`arquivado`/`rascunho`/`pausado` não aparece no site.
8. **LGPD:** eventos sem IP em claro; rate limit usa hash; telefone/Instagram não vazam na listagem pública.
9. **Portal do parceiro (`/partner`)**: login compartilhado; `GET /api/admin/parceiros/portal` retorna contrato, pagamentos e anexos do `partner_id` da sessão.
10. **Contratos avançados**: troca de plano com pró-rata, `auto_renew`/`cycle_months`, anexos PDF, avisos de vencimento (WhatsApp/e-mail/admin) no tick diário.
10. **PDF de relatório** fica para fase 2; a API de relatório individual já devolve o payload.

## Variáveis de ambiente

Existentes: `DATABASE_URL` / `POSTGRES_URL`, `ADMIN_JWT_SECRET`, `RATE_LIMIT_SALT`, `SITE_URL`.

Nova (opcional): `PARTNERS_CRON_SECRET` — autentica `GET /api/partners/jobs/tick`. Sem ela, o tick só roda autenticado no admin ou de forma lazy nas consultas.

## Como operar localmente

```bash
npm run db:init
node scripts/seed-parceiros.mjs
npx vercel dev
```

Admin: `/admin` → aba Parceiros.

## Entrega — resumo

### Comandos

```bash
npm install
npm run db:init              # inclui schema Parceiros
npm run db:seed-parceiros    # 20 parceiros demo + planos/placements
npm run build
npm test
npx vercel dev               # local com APIs
```

### Variável nova (opcional)

- `PARTNERS_CRON_SECRET` — protege `/api/partners/jobs/tick` (cron diário no `vercel.json`)

### Pendências fase 2

- Exportação PDF do relatório individual
- Upload para blob/CDN (hoje base64 no Postgres, padrão Achados)
- CRUD completo de campanhas/criativos/placements via UI (listagem pronta; criação avançada via API)
- Gráficos temporais no analytics admin
- Rotação A/B sofisticada entre parceiros em placements rotativos
- Testes E2E de responsividade automatizados

### Entregue na Fase 5 (contratos)

- Portal `/partner` com login do parceiro
- Troca de plano com pró-rata opcional
- Renovação automática (`auto_renew` + `cycle_months`)
- Anexos PDF no contrato
- Avisos de vencimento (WhatsApp / e-mail / admin) no tick diário
