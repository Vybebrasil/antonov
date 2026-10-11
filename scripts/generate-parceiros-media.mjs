/**
 * Gera logos fictícios no visual Antonov, compacta fotos de perfil
 * e associa a mídia aos parceiros demo no banco.
 */
import { neon } from '@neondatabase/serverless';
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const photoDir = join(root, 'assets', 'parceiros', 'photos');
const logoDir = join(root, 'assets', 'parceiros', 'logos');

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

mkdirSync(photoDir, { recursive: true });
mkdirSync(logoDir, { recursive: true });

const PARTNERS = [
  { slug: 'marina-dourado', initials: 'MD', word: 'DOURADO', cat: 'nutricao', variant: 0 },
  { slug: 'lucas-alencar', initials: 'LA', word: 'ALENCAR', cat: 'nutricao', variant: 1 },
  { slug: 'helena-vasconcelos', initials: 'HV', word: 'HELENA', cat: 'nutricao', variant: 2 },
  { slug: 'pedro-nunes', initials: 'PN', word: 'NUNES', cat: 'nutricao', variant: 3 },
  { slug: 'camila-farias', initials: 'CF', word: 'FARIAS', cat: 'nutricao', variant: 4 },
  { slug: 'rafael-costa', initials: 'RC', word: 'COSTA', cat: 'personal-trainers', variant: 0 },
  { slug: 'bruna-melo', initials: 'BM', word: 'MELO', cat: 'personal-trainers', variant: 1 },
  { slug: 'thiago-andrade', initials: 'TA', word: 'ANDRADE', cat: 'personal-trainers', variant: 2 },
  { slug: 'julia-pires', initials: 'JP', word: 'PIRES', cat: 'personal-trainers', variant: 3 },
  { slug: 'diego-santana', initials: 'DS', word: 'SANTANA', cat: 'personal-trainers', variant: 4 },
  { slug: 'ana-beatriz-lima', initials: 'AB', word: 'LIMA', cat: 'estetica-saude', variant: 0 },
  { slug: 'felipe-rocha', initials: 'FR', word: 'ROCHA', cat: 'estetica-saude', variant: 1 },
  { slug: 'sofia-martins', initials: 'SM', word: 'SOFIA', cat: 'estetica-saude', variant: 2 },
  { slug: 'renato-alves', initials: 'RA', word: 'ALVES', cat: 'estetica-saude', variant: 3 },
  { slug: 'patricia-gomes', initials: 'PG', word: 'GOMES', cat: 'estetica-saude', variant: 4 },
  { slug: 'carla-mendes', initials: 'CM', word: 'MENDES', cat: 'fisioterapia', variant: 0 },
  { slug: 'bruno-teixeira', initials: 'BT', word: 'TEIXEIRA', cat: 'fisioterapia', variant: 1 },
  { slug: 'isabela-freitas', initials: 'IF', word: 'FREITAS', cat: 'fisioterapia', variant: 2 },
  { slug: 'marcelo-dias', initials: 'DI', word: 'DIAS', cat: 'fisioterapia', variant: 3 },
  { slug: 'livia-castro', initials: 'LC', word: 'CASTRO', cat: 'fisioterapia', variant: 4 },
];

const YEL = '#FAB10F';
const BLUE = '#2A8FD6';
const CARBON = '#131316';
const CREAM = '#EEEAE2';

function motif(cat, accent) {
  if (cat === 'nutricao') {
    return `<path d="M160 78c28 18 42 48 42 72 0 28-18 50-42 62-24-12-42-34-42-62 0-24 14-54 42-72z" fill="none" stroke="${accent}" stroke-width="4"/>`;
  }
  if (cat === 'personal-trainers') {
    return `<path d="M118 92h84M132 108h56M146 124h28" stroke="${accent}" stroke-width="5" stroke-linecap="square"/>`;
  }
  if (cat === 'estetica-saude') {
    return `<circle cx="160" cy="96" r="8" fill="${accent}"/><circle cx="160" cy="96" r="22" fill="none" stroke="${accent}" stroke-width="2"/>`;
  }
  return `<g fill="none" stroke="${accent}" stroke-width="2.5">
    <circle cx="160" cy="96" r="14"/>
    <path d="M160 76v40M140 96h40"/>
  </g>`;
}

function logoSvg(p) {
  const dark = p.variant % 2 === 0;
  const bg = dark ? CARBON : CREAM;
  const ink = dark ? CREAM : CARBON;
  const accent = p.variant % 3 === 0 ? YEL : BLUE;
  const rx = p.variant === 2 || p.variant === 4 ? 160 : 28;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <rect width="320" height="320" rx="${rx}" fill="${bg}"/>
  ${motif(p.cat, accent)}
  <text x="160" y="196" text-anchor="middle" font-family="Impact, Arial Black, sans-serif" font-size="86" letter-spacing="6" fill="${ink}">${p.initials}</text>
  <text x="160" y="236" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" letter-spacing="6" fill="${accent}">${p.word}</text>
  <rect x="110" y="252" width="100" height="2" fill="${accent}"/>
</svg>`;
}

async function collectPhotos() {
  const assets = join(root, 'assets');
  for (const name of readdirSync(assets)) {
    const m = name.match(/^(.+)-photo\.(png|jpg|jpeg|webp)$/i);
    if (!m) continue;
    const slug = m[1];
    const src = join(assets, name);
    const dest = join(photoDir, `${slug}.webp`);
    await sharp(src)
      .rotate()
      .resize(640, 640, { fit: 'cover', position: 'attention' })
      .webp({ quality: 72 })
      .toFile(dest);
    try { unlinkSync(src); } catch { /* keep */ }
    console.log('photo', slug);
  }
}

async function makeLogos() {
  for (const p of PARTNERS) {
    const svg = logoSvg(p);
    const svgPath = join(logoDir, `${p.slug}.svg`);
    const pngPath = join(logoDir, `${p.slug}.png`);
    const webpPath = join(logoDir, `${p.slug}.webp`);
    writeFileSync(svgPath, svg, 'utf8');
    await sharp(Buffer.from(svg)).png().toFile(pngPath);
    await sharp(pngPath).webp({ quality: 86 }).toFile(webpPath);
    console.log('logo', p.slug);
  }
}

async function attachToDb() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.warn('Sem DATABASE_URL — arquivos gerados, banco não atualizado.');
    return;
  }
  const sql = neon(url);

  for (const p of PARTNERS) {
    const rows = await sql`SELECT id FROM partners WHERE slug = ${p.slug} AND deleted_at IS NULL LIMIT 1`;
    if (!rows[0]) {
      console.warn('parceiro ausente', p.slug);
      continue;
    }
    const partnerId = rows[0].id;
    const photoPath = join(photoDir, `${p.slug}.webp`);
    const logoPath = join(logoDir, `${p.slug}.webp`);
    if (!existsSync(photoPath) || !existsSync(logoPath)) {
      console.warn('mídia faltando', p.slug);
      continue;
    }

    await sql`UPDATE partners SET photo_media_id = NULL, logo_media_id = NULL WHERE id = ${partnerId}`;

    const photoBuf = readFileSync(photoPath);
    const logoBuf = readFileSync(logoPath);

    const photo = await sql`
      INSERT INTO partner_media (partner_id, kind, file_name, file_type, file_data, width, height)
      VALUES (
        ${partnerId}, 'photo', ${`${p.slug}.webp`}, 'image/webp',
        ${photoBuf.toString('base64')}, 640, 640
      )
      RETURNING id
    `;
    const logo = await sql`
      INSERT INTO partner_media (partner_id, kind, file_name, file_type, file_data, width, height)
      VALUES (
        ${partnerId}, 'logo', ${`${p.slug}-logo.webp`}, 'image/webp',
        ${logoBuf.toString('base64')}, 320, 320
      )
      RETURNING id
    `;
    await sql`
      UPDATE partners
      SET photo_media_id = ${photo[0].id},
          logo_media_id = ${logo[0].id},
          updated_at = NOW()
      WHERE id = ${partnerId}
    `;
    console.log('db', p.slug, photo[0].id, logo[0].id);
  }
}

await collectPhotos();
await makeLogos();
await attachToDb();
console.log('Mídia dos parceiros pronta.');
