/**
 * Sincroniza variáveis GA4 do .env local para a Vercel.
 * Uso: node scripts/set-vercel-ga4.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');

function loadEnv() {
  if (!existsSync(envPath)) throw new Error('.env não encontrado');
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
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

function addEnv(name, value, target, { sensitive = false, useStdin = false } = {}) {
  const args = [
    'vercel', 'env', 'add', name, target,
    '--yes',
    '--force',
  ];
  if (sensitive) args.push('--sensitive');
  else args.push('--no-sensitive');
  if (!useStdin) args.push('--value', value);

  const r = spawnSync('npx', args, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    input: useStdin ? value : undefined,
  });

  if (r.status !== 0) {
    console.error(`Falha ao definir ${name} (${target}):`, r.stderr || r.stdout);
    return false;
  }
  console.log(`OK ${name} → ${target}`);
  return true;
}

const env = loadEnv();
const vars = [
  { key: 'GA4_PROPERTY_ID', sensitive: false },
  { key: 'GA4_CLIENT_EMAIL', sensitive: false },
  { key: 'GA4_PRIVATE_KEY', sensitive: true, useStdin: true },
];

const targets = ['production', 'development'];

for (const target of targets) {
  for (const { key, sensitive, useStdin } of vars) {
    const value = env[key];
    if (!value) {
      console.error(`Ausente no .env: ${key}`);
      process.exit(1);
    }
    if (!addEnv(key, value, target, { sensitive, useStdin: Boolean(useStdin) })) process.exit(1);
  }
}

console.log('\nVariáveis GA4 enviadas à Vercel.');
