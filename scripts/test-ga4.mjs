import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchGa4Metrics, ga4EnvStatus } from '../api/_lib/ga4.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
if (existsSync(envPath)) {
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

const status = ga4EnvStatus();
console.log('Env GA4:', status);

if (!status.configured) {
  console.error('\nFaltam variáveis. Adicione no .env (local) ou Vercel (produção).');
  process.exit(1);
}

const data = await fetchGa4Metrics(30);
if (data.error) {
  console.error('\nErro GA4:', data.error);
  process.exit(1);
}

console.log('\nGA4 OK');
console.log('Usuários:', data.overview?.activeUsers?.value);
console.log('Sessões:', data.overview?.sessions?.value);
console.log('Checkout cliques:', data.overview?.checkoutClicks);
