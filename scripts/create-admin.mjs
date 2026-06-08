/**
 * Cria ou atualiza usuário admin.
 * Uso: node scripts/create-admin.mjs email@exemplo.com [senha]
 * Senha: argumento ou variável ADMIN_PASSWORD
 */
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'fs';
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

const email = process.argv[2];
const password = process.argv[3] || process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('Uso: node scripts/create-admin.mjs email@exemplo.com [senha]');
  console.error('Ou defina ADMIN_PASSWORD no .env');
  process.exit(1);
}

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('Defina DATABASE_URL no .env');
  process.exit(1);
}

const sql = neon(url);
const hash = await bcrypt.hash(password, 12);
const normalized = email.trim().toLowerCase();

const rows = await sql`
  INSERT INTO admin_users (email, password_hash)
  VALUES (${normalized}, ${hash})
  ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
  RETURNING id, email
`;

console.log(`Admin pronto: ${rows[0].email} (id ${rows[0].id})`);
