import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(root, '.env'), 'utf8');
const m = env.match(/^GA4_PRIVATE_KEY=(.+)$/ms);
if (!m) process.exit(1);
let val = m[1].trim();
if (val.startsWith('"')) val = JSON.parse(val);
val = val.replace(/\\n/g, '\n');

const r = spawnSync(
  'npx',
  ['vercel', 'env', 'add', 'GA4_PRIVATE_KEY', 'development', '--force', '--no-sensitive'],
  { cwd: root, encoding: 'utf8', shell: true, input: val }
);
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
process.exit(r.status ?? 1);
