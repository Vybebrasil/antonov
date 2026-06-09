/**
 * Sincroniza RESEND_* do .env.local (ou .env) para a Vercel.
 * Uso: node scripts/set-vercel-resend.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val.replace(/\\n/g, '\n');
  }
  return out;
}

function loadEnv() {
  return { ...parseEnvFile(join(root, '.env')), ...parseEnvFile(join(root, '.env.local')) };
}

function addEnv(name, value, target, { sensitive = false } = {}) {
  const args = ['vercel', 'env', 'add', name, target, '--yes', '--force'];
  if (sensitive) args.push('--sensitive');
  else args.push('--no-sensitive');

  const r = spawnSync('npx', args, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    input: value,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (r.status !== 0) {
    console.error(`Falha ao definir ${name} (${target}):`, r.stderr || r.stdout);
    return false;
  }
  console.log(`OK ${name} → ${target}`);
  return true;
}

const env = loadEnv();
const required = ['RESEND_API_KEY', 'RESEND_TO', 'RESEND_FROM'];
for (const key of required) {
  if (!env[key]) {
    console.error(`Ausente no .env/.env.local: ${key}`);
    process.exit(1);
  }
}

const targets = [
  { name: 'production', apiKeySensitive: true },
  { name: 'development', apiKeySensitive: false },
];

for (const { name, apiKeySensitive } of targets) {
  if (!addEnv('RESEND_API_KEY', env.RESEND_API_KEY, name, { sensitive: apiKeySensitive })) process.exit(1);
  if (!addEnv('RESEND_TO', env.RESEND_TO, name, { sensitive: false })) process.exit(1);
  if (!addEnv('RESEND_FROM', env.RESEND_FROM, name, { sensitive: false })) process.exit(1);
}

console.log('\nVariáveis Resend enviadas à Vercel (production + development).');
