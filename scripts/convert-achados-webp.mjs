/**
 * Converte fotos existentes de Achados e Perdidos para WebP (menor e mais rápido).
 * Uso: node scripts/convert-achados-webp.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { neon } from '@neondatabase/serverless';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('DATABASE_URL não configurada.');
  process.exit(1);
}

const sql = neon(url);

const rows = await sql`
  SELECT id, foto_name, foto_type, foto_data, length(foto_data) AS foto_len
  FROM achados_perdidos
  WHERE foto_data IS NOT NULL AND length(foto_data) > 0
  ORDER BY created_at DESC
`;

console.log(`Itens com foto: ${rows.length}`);

let converted = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  const type = String(row.foto_type || '').toLowerCase();
  if (type === 'image/webp' && Number(row.foto_len) < 500_000) {
    skipped += 1;
    continue;
  }

  try {
    const input = Buffer.from(row.foto_data, 'base64');
    const out = await sharp(input)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70, effort: 4 })
      .toBuffer();

    const before = Number(row.foto_len) || 0;
    const after = out.length;
    // só troca se melhorou (ou se ainda não era webp)
    if (type === 'image/webp' && after >= before * 0.95) {
      skipped += 1;
      continue;
    }

    const b64 = out.toString('base64');
    const name = String(row.foto_name || 'foto').replace(/\.\w+$/, '') + '.webp';
    await sql`
      UPDATE achados_perdidos SET
        foto_data = ${b64},
        foto_type = 'image/webp',
        foto_name = ${name},
        updated_at = NOW()
      WHERE id = ${row.id}
    `;
    converted += 1;
    console.log(`OK ${row.id.slice(0, 8)}… ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${row.id}:`, err.message);
  }
}

console.log(`Concluído. convertidas=${converted} ignoradas=${skipped} falhas=${failed}`);
