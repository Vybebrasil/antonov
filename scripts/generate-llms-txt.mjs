/**
 * Gera llms.txt na raiz — resumo factual para crawlers de IA.
 * Uso: node scripts/generate-llms-txt.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const seoPages = JSON.parse(readFileSync(join(__dirname, 'seo-pages.json'), 'utf8'));
const siteUrl = seoPages.siteUrl.replace(/\/$/, '');

const llms = `# Antonov Center

> Academia de performance em Irecê, Bahia (Brasil). Hangar com cerca de 3.000 m², musculação, cardio, avaliação física e planos mensais ou diárias.

## Identidade

- Nome fantasia: Antonov Center
- Razão social: Antonov Center LTDA
- CNPJ: 62.421.964/0001-60
- Cidade: Irecê, Bahia, Brasil

## Contato e localização

- Site: ${siteUrl}
- Endereço: Av. 1º de Janeiro, Irecê, BA — CEP 44860-201
- Telefone: +55 74 99963-1507
- E-mail: antonovacademia@gmail.com
- Instagram: https://www.instagram.com/antonovcenter
- Mapa: ${siteUrl}/contato#mapa

## Horário

- Segunda a sexta-feira: 5h às 23h
- Sábado: 6h às 15h
- Domingo e feriado: 8h às 14h
- Fuso: horário de Brasília / America/Bahia

## Planos (referência)

- First Class: mensalidade com acesso ao hangar nos horários de funcionamento; avaliação física grátis. Valores em ${siteUrl}/planos (mensal e opção anual com desconto).
- Diária: acesso avulso — 1 diária R$ 50; pacote 3 diárias R$ 110; pacote 10 diárias R$ 300 (validade 6 meses).

## Páginas principais

- Home: ${siteUrl}/
- Planos e FAQ: ${siteUrl}/planos
- Contato e formulário: ${siteUrl}/contato
- Trabalhe conosco: ${siteUrl}/trabalhe-conosco

## Perguntas frequentes (resumo)

- O que é: academia premium em Irecê focada em treino, estrutura ampla e performance.
- Onde fica: Av. 1º de Janeiro, Irecê, BA — mapa em /contato#mapa.
- Planos ativos: First Class (mensal) e Diária; detalhes e preços atualizados em /planos.
- Fidelidade: planos mensais e diários sem fidelidade; plano anual com desconto de 10% e fidelidade de 12 meses.
- Como falar: formulário em /contato, WhatsApp +55 74 99963-1507 ou antonovacademia@gmail.com.

## Para sistemas

- Sitemap: ${siteUrl}/sitemap.xml
- robots.txt: ${siteUrl}/robots.txt
- llms.txt: ${siteUrl}/llms.txt
`;

writeFileSync(join(root, 'llms.txt'), llms, 'utf8');
console.log(`llms.txt gerado para ${siteUrl}`);
