import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const moves = [
  ['api/admin/dashboard.js', 'handlers/admin/dashboard.js'],
  ['api/admin/login.js', 'handlers/admin/login.js'],
  ['api/admin/logout.js', 'handlers/admin/logout.js'],
  ['api/admin/me.js', 'handlers/admin/me.js'],
  ['api/admin/form-fields.js', 'handlers/admin/form-fields.js'],
  ['api/admin/forms/index.js', 'handlers/admin/forms-index.js'],
  ['api/admin/forms/[id].js', 'handlers/admin/forms-id.js'],
  ['api/admin/forms/[id]/export.js', 'handlers/admin/forms-export.js'],
  ['api/admin/forms/[id]/submissions.js', 'handlers/admin/forms-submissions.js'],
];

function fixImports(code) {
  return code
    .replace(/from '\.\.\/\.\.\/\.\.\/lib\//g, "from '../../api/_lib/")
    .replace(/from '\.\.\/\.\.\/lib\//g, "from '../../api/_lib/")
    .replace(/from '\.\.\/lib\//g, "from '../../api/_lib/");
}

mkdirSync(join(root, 'handlers/admin'), { recursive: true });

for (const [src, dst] of moves) {
  const from = join(root, src);
  const to = join(root, dst);
  writeFileSync(to, fixImports(readFileSync(from, 'utf8')));
}

// Public form handler (GET + POST)
const getForm = readFileSync(join(root, 'api/forms/[slug]/index.js'), 'utf8');
const submitForm = readFileSync(join(root, 'api/forms/[slug]/submit.js'), 'utf8');
const publicForm = `import getHandler from '../../handlers/forms/get.js';
import submitHandler from '../../handlers/forms/submit.js';

export default async function handler(req, res) {
  if (req.method === 'GET') return getHandler(req, res);
  if (req.method === 'POST') return submitHandler(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.end();
  }
  res.statusCode = 405;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'Método não permitido.' }));
}
`;

mkdirSync(join(root, 'handlers/forms'), { recursive: true });
writeFileSync(
  join(root, 'handlers/forms/get.js'),
  getForm.replace(/from '\.\.\/\.\.\/lib\//g, "from '../../api/_lib/")
);
writeFileSync(
  join(root, 'handlers/forms/submit.js'),
  submitForm.replace(/from '\.\.\/\.\.\/lib\//g, "from '../../api/_lib/")
);
writeFileSync(join(root, 'api/forms/[slug].js'), publicForm);

console.log('Consolidated API handlers');
