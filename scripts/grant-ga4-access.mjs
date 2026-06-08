/**
 * Concede acesso Viewer no GA4 para a service account via Admin API
 * (contorna bug da UI que diz "Esse e-mail não corresponde a uma Conta do Google").
 *
 * Pré-requisitos:
 * 1. Google Analytics Admin API ativada no projeto Cloud
 * 2. gcloud instalado OU token OAuth manual (ver abaixo)
 * 3. .env com GA4_PROPERTY_ID e GA4_CLIENT_EMAIL
 *
 * Uso com gcloud (recomendado):
 *   gcloud auth application-default login
 *   node scripts/grant-ga4-access.mjs
 *
 * O login acima deve ser com a conta Google que é Administrador no GA4.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

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

const propertyId = process.env.GA4_PROPERTY_ID;
const serviceEmail = process.env.GA4_CLIENT_EMAIL;

if (!propertyId || !serviceEmail) {
  console.error('Defina GA4_PROPERTY_ID e GA4_CLIENT_EMAIL no .env');
  process.exit(1);
}

function getAccessToken() {
  if (process.env.GA4_ADMIN_ACCESS_TOKEN) {
    return process.env.GA4_ADMIN_ACCESS_TOKEN.trim();
  }
  try {
    return execSync('gcloud auth application-default print-access-token', {
      encoding: 'utf8',
    }).trim();
  } catch {
    console.error(`
Não foi possível obter token OAuth.

Opção A — gcloud (mais fácil):
  gcloud auth application-default login
  node scripts/grant-ga4-access.mjs

Opção B — OAuth Playground (sem gcloud):
  1. Ative "Google Analytics Admin API" no Cloud Console
  2. Abra https://developers.google.com/oauthplayground/
  3. Clique na engrenagem → marque "Use your own OAuth credentials" (opcional)
  4. Em "Input your own scopes", cole:
     https://www.googleapis.com/auth/analytics.manage.users
  5. Authorize APIs → faça login com a conta ADMIN do GA4
  6. Exchange authorization code for tokens
  7. Copie o Access token e rode:
     set GA4_ADMIN_ACCESS_TOKEN=seu_token
     node scripts/grant-ga4-access.mjs
`);
    process.exit(1);
  }
}

const token = getAccessToken();
const url = `https://analyticsadmin.googleapis.com/v1alpha/properties/${propertyId}/accessBindings`;

const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    user: serviceEmail,
    roles: ['predefinedRoles/viewer'],
  }),
});

const data = await res.json();

if (!res.ok) {
  console.error('Erro ao conceder acesso:', data.error?.message || JSON.stringify(data));
  process.exit(1);
}

console.log('Acesso concedido com sucesso.');
console.log('Service account:', serviceEmail);
console.log('Propriedade:', propertyId);
console.log('Papel: Leitor (viewer)');
console.log('\nPróximo passo: redeploy no Vercel e recarregue o admin.');
