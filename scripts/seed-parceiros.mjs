import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ensureParceirosSchema } from './init-parceiros.mjs';
import { slugify } from '../api/_lib/parceiros-logic.js';

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

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('Defina DATABASE_URL no .env');
  process.exit(1);
}

const sql = neon(url);
await ensureParceirosSchema(sql);

const categories = [
  { name: 'Nutrição', slug: 'nutricao', description: 'Nutrição esportiva e reeducação alimentar.', sort: 1 },
  { name: 'Personal Trainers', slug: 'personal-trainers', description: 'Treinamento personalizado para performance.', sort: 2 },
  { name: 'Estética & Saúde', slug: 'estetica-saude', description: 'Cuidado, recuperação e bem-estar.', sort: 3 },
  { name: 'Fisioterapia', slug: 'fisioterapia', description: 'Prevenção, reabilitação e movimento.', sort: 4 },
];

const catIds = {};
for (const c of categories) {
  const rows = await sql`
    INSERT INTO partner_categories (name, slug, description, sort_order, status)
    VALUES (${c.name}, ${c.slug}, ${c.description}, ${c.sort}, 'ativa')
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order,
      deleted_at = NULL,
      status = 'ativa'
    RETURNING id
  `;
  catIds[c.slug] = rows[0].id;
}

const demo = [
  {
    cat: 'nutricao',
    people: [
      ['Marina Dourado', 'Nutrição esportiva', 'Nutricionista', 'CRN-5 00001', ['Nutrição esportiva', 'Hipertrofia', 'Emagrecimento', 'Reeducação alimentar', 'Avaliação nutricional', 'Acompanhamento esportivo']],
      ['Lucas Alencar', 'Emagrecimento', 'Nutricionista', 'CRN-5 00002', ['Emagrecimento', 'Metabolismo', 'Planejamento semanal']],
      ['Helena Vasconcelos', 'Performance feminina', 'Nutricionista', 'CRN-5 00003', ['Performance feminina', 'Endocrino-nutrição', 'Composição corporal']],
      ['Pedro Nunes', 'Nutrição clínica esportiva', 'Nutricionista', 'CRN-5 00004', ['Clínica esportiva', 'Suplementação', 'Periodização']],
      ['Camila Farias', 'Reeducação alimentar', 'Nutricionista', 'CRN-5 00005', ['Reeducação alimentar', 'Intestino', 'Rotina prática']],
    ],
  },
  {
    cat: 'personal-trainers',
    people: [
      ['Rafael Costa', 'Hipertrofia', 'Personal Trainer', 'CREF 000001-G/BA', ['Hipertrofia', 'Força', 'Avaliação física']],
      ['Bruna Melo', 'Condicionamento', 'Personal Trainer', 'CREF 000002-G/BA', ['Condicionamento', 'Emagrecimento', 'Treino feminino']],
      ['Thiago Andrade', 'Força e potência', 'Personal Trainer', 'CREF 000003-G/BA', ['Força', 'Potência', 'Atletismo funcional']],
      ['Julia Pires', 'Treino iniciante', 'Personal Trainer', 'CREF 000004-G/BA', ['Iniciantes', 'Técnica', 'Consistência']],
      ['Diego Santana', 'Performance', 'Personal Trainer', 'CREF 000005-G/BA', ['Performance', 'Periodização', 'Mobilidade']],
    ],
  },
  {
    cat: 'estetica-saude',
    people: [
      ['Ana Beatriz Lima', 'Estética corporal', 'Esteticista', null, ['Corporal', 'Recuperação', 'Bem-estar']],
      ['Felipe Rocha', 'Saúde integrativa', 'Fisioterapeuta dermatofuncional', 'CREFITO-7 00001', ['Dermatofuncional', 'Postura', 'Recuperação']],
      ['Sofia Martins', 'Pele e performance', 'Biomédica', 'CRBM 00001', ['Pele', 'Protocolos', 'Avaliação']],
      ['Renato Alves', 'Massoterapia', 'Massoterapeuta', null, ['Massagem esportiva', 'Liberação', 'Recuperação']],
      ['Patricia Gomes', 'Bem-estar', 'Terapeuta', null, ['Relaxamento', 'Rotina', 'Autocuidado']],
    ],
  },
  {
    cat: 'fisioterapia',
    people: [
      ['Carla Mendes', 'Ortopedia', 'Fisioterapeuta', 'CREFITO-7 00011', ['Ortopedia', 'Reabilitação', 'Prevenção']],
      ['Bruno Teixeira', 'Esportiva', 'Fisioterapeuta', 'CREFITO-7 00012', ['Fisio esportiva', 'Retorno ao treino', 'Lesões']],
      ['Isabela Freitas', 'Pilates clínico', 'Fisioterapeuta', 'CREFITO-7 00013', ['Pilates clínico', 'Core', 'Postura']],
      ['Marcelo Dias', 'RPG e postura', 'Fisioterapeuta', 'CREFITO-7 00014', ['Postura', 'RPG', 'Dor crônica']],
      ['Livia Castro', 'Reabilitação', 'Fisioterapeuta', 'CREFITO-7 00015', ['Reabilitação', 'Mobilidade', 'Força funcional']],
    ],
  },
];

const created = [];
let sort = 1;
for (const group of demo) {
  for (const [i, person] of group.people.entries()) {
    const [name, specialty, profession, registry, services] = person;
    const slug = slugify(name);
    const featured = i === 0;
    const rows = await sql`
      INSERT INTO partners (
        name, slug, trade_name, category_id, specialty, profession, registry,
        short_description, full_description, whatsapp, instagram, website, email,
        venue_name, address, neighborhood, city, state, postal_code, maps_url,
        status, featured, show_on_home, priority, sort_order, published_at
      ) VALUES (
        ${`${name} (demo)`},
        ${slug},
        ${`${name} Studio`},
        ${catIds[group.cat]},
        ${specialty},
        ${profession},
        ${registry},
        ${`Profissional do ecossistema Antonov — ${specialty.toLowerCase()} (dado de demonstração).`},
        ${`${name} faz parte do ecossistema Antonov Center como perfil de demonstração. Os dados são fictícios e existem apenas para testes de layout, filtros e rastreamento.`},
        ${'74999000000'},
        ${`exemplo_${slug.replace(/-/g, '_')}`},
        ${'https://www.antonovcenter.com.br/parceiros'},
        ${`${slug}@placeholder.antonov`},
        ${i % 2 === 0 ? `${name} Studio` : null},
        ${i % 2 === 0 ? 'Av. 1º de Janeiro' : null},
        ${i % 2 === 0 ? 'Centro' : null},
        ${i % 2 === 0 ? 'Irecê' : null},
        ${i % 2 === 0 ? 'BA' : null},
        ${i % 2 === 0 ? '44860-201' : null},
        ${i % 2 === 0 ? 'https://maps.app.goo.gl/rbhgwPvZnJfMyKkB9' : null},
        ${'ativo'},
        ${featured},
        ${true},
        ${featured ? 40 : 10 - i},
        ${sort++},
        NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        specialty = EXCLUDED.specialty,
        status = 'ativo',
        deleted_at = NULL,
        show_on_home = TRUE,
        updated_at = NOW()
      RETURNING id, slug, name
    `;
    const partner = rows[0];
    created.push(partner);
    await sql`DELETE FROM partner_services WHERE partner_id = ${partner.id}`;
    for (const [j, svc] of services.entries()) {
      await sql`
        INSERT INTO partner_services (partner_id, name, sort_order)
        VALUES (${partner.id}, ${svc}, ${j})
      `;
    }
  }
}

const plans = await sql`SELECT id, slug FROM partner_plans WHERE deleted_at IS NULL`;
const planBySlug = Object.fromEntries(plans.map((p) => [p.slug, p.id]));
const placements = await sql`SELECT id, code FROM partner_placements`;
const placeByCode = Object.fromEntries(placements.map((p) => [p.code, p.id]));

for (const [i, partner] of created.entries()) {
  const planSlug = i < 8 ? 'base' : i < 16 ? 'destaque' : 'premium';
  const amount = planSlug === 'base' ? 390 : planSlug === 'destaque' ? 690 : 990;
  const existing = await sql`
    SELECT id FROM partner_contracts WHERE partner_id = ${partner.id} AND deleted_at IS NULL LIMIT 1
  `;
  let contractId = existing[0]?.id;
  if (!contractId) {
    const starts = new Date();
    starts.setMonth(starts.getMonth() - 1);
    const ends = new Date();
    ends.setMonth(ends.getMonth() + (i === 1 ? 0 : i === 2 ? 1 : 11));
    const ct = await sql`
      INSERT INTO partner_contracts (partner_id, plan_id, amount, starts_on, ends_on, status, payment_method, notes)
      VALUES (
        ${partner.id}, ${planBySlug[planSlug]}, ${amount},
        ${starts.toISOString().slice(0, 10)}, ${ends.toISOString().slice(0, 10)},
        ${'ativo'}, ${'pix'}, ${'Contrato de demonstração'}
      )
      RETURNING id
    `;
    contractId = ct[0].id;
    await sql`
      INSERT INTO partner_payments (contract_id, partner_id, contracted_amount, received_amount, due_on, status, notes)
      VALUES (
        ${contractId}, ${partner.id}, ${amount}, ${i % 3 === 0 ? amount : i % 3 === 1 ? amount / 2 : 0},
        ${ends.toISOString().slice(0, 10)}, ${'pendente'}, ${'Lançamento demo'}
      )
    `;
  }

  if (i < 4) {
    const has = await sql`SELECT id FROM partner_campaigns WHERE partner_id = ${partner.id} AND deleted_at IS NULL LIMIT 1`;
    if (!has[0]) {
      const start = new Date();
      const end = new Date();
      end.setMonth(end.getMonth() + 1);
      await sql`
        INSERT INTO partner_campaigns (
          name, partner_id, starts_on, ends_on, status, placement_id, link_url, priority, notes
        ) VALUES (
          ${`Campanha demo ${partner.name}`},
          ${partner.id},
          ${start.toISOString().slice(0, 10)},
          ${end.toISOString().slice(0, 10)},
          ${'ativa'},
          ${placeByCode.HOME_PARTNERS_CAROUSEL || null},
          ${`/parceiros/${partner.slug}`},
          ${50 - i},
          ${'Campanha de demonstração'}
        )
      `;
    }
  }
}

const [{ n: eventCount }] = await sql`SELECT COUNT(*)::int AS n FROM partner_analytics_events`;
if (eventCount < 50) {
  for (const partner of created.slice(0, 12)) {
    for (const type of ['partner_impression', 'partner_card_click', 'partner_profile_view', 'whatsapp_click']) {
      const times = type === 'partner_impression' ? 12 : type === 'partner_profile_view' ? 4 : 2;
      for (let i = 0; i < times; i++) {
        await sql`
          INSERT INTO partner_analytics_events (event_type, partner_id, session_id, page, metadata)
          VALUES (
            ${type}, ${partner.id}, ${`seed-${partner.id}-${type}-${i}`},
            ${'/parceiros'}, ${JSON.stringify({ source: 'seed' })}
          )
        `;
      }
    }
  }
}

console.log(`Seed Parceiros pronto: ${created.length} profissionais de demonstração.`);
console.log('Os nomes incluem "(demo)" e e-mails @placeholder.antonov.');
