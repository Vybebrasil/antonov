/**
 * Servidor local: HTML estático + funções /api (compatível com os handlers Vercel).
 * Uso: node scripts/dev-local.mjs
 */
import http from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { extname, join, normalize, relative, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const envPath = join(root, name);
    if (!existsSync(envPath)) continue;
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
}

loadEnv();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function parseQuery(search) {
  const out = {};
  const params = new URLSearchParams(search);
  for (const [k, v] of params) {
    if (out[k] == null) out[k] = v;
    else if (Array.isArray(out[k])) out[k].push(v);
    else out[k] = [out[k], v];
  }
  return out;
}

function applyRewrites(pathname, search) {
  const q = parseQuery(search);

  let m = pathname.match(/^\/api\/admin(?:\/(.*))?$/);
  if (m) {
    q.path = m[1] || '';
    return { file: 'api/admin/index.js', query: q };
  }

  m = pathname.match(/^\/api\/forms\/([^/]+)(?:\/submit)?$/);
  if (m) {
    q.slug = m[1];
    return { file: 'api/forms/[slug].js', query: q };
  }

  m = pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (m) {
    q.kind = m[1];
    return { file: 'api/leads/[kind].js', query: q };
  }

  m = pathname.match(/^\/api\/telao(?:\/([^/]+))?$/);
  if (m) {
    if (m[1]) q.job = m[1];
    return { file: 'api/telao/index.js', query: q };
  }

  if (pathname === '/api/achados-e-perdidos') {
    return { file: 'api/achados-e-perdidos.js', query: q };
  }

  if (pathname === '/api/partners' || pathname === '/api/partners/') {
    return { file: 'api/partners/index.js', query: q };
  }
  if (pathname === '/api/partners/events') {
    return { file: 'api/partners/events.js', query: q };
  }
  if (pathname === '/api/partners/go') {
    return { file: 'api/partners/go.js', query: q };
  }
  if (pathname === '/api/partners/sitemap' || pathname === '/sitemap-parceiros.xml') {
    return { file: 'api/partners/sitemap.js', query: q };
  }
  if (pathname === '/api/partners/jobs/tick') {
    return { file: 'api/partners/jobs/tick.js', query: q };
  }
  m = pathname.match(/^\/api\/partners\/media\/([^/]+)$/);
  if (m) {
    q.id = m[1];
    return { file: 'api/partners/media/[id].js', query: q };
  }
  m = pathname.match(/^\/api\/partners\/([^/]+)$/);
  if (m) {
    q.slug = m[1];
    return { file: 'api/partners/[slug].js', query: q };
  }

  m = pathname.match(/^\/go\/([^/]+)\/([^/]+)$/);
  if (m) {
    q.slug = m[1];
    q.channel = m[2];
    return { file: 'api/partners/go.js', query: q };
  }

  m = pathname.match(/^\/parceiros\/([^/]+)$/);
  if (m) {
    q.slug = m[1];
    return { page: 'parceiros-perfil.html', query: q };
  }

  m = pathname.match(/^\/form\/([^/]+)$/);
  if (m) {
    q.slug = m[1];
    return { page: 'form.html', query: q };
  }

  return { page: null, query: q };
}

function safeFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  let rel = decoded.replace(/^\/+/, '');
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  if (!extname(rel)) {
    const html = `${rel}.html`;
    if (existsSync(join(root, html))) rel = html;
  }
  const abs = normalize(join(root, rel));
  const relSafe = relative(root, abs);
  if (relSafe.startsWith('..') || relSafe.includes(':')) return null;
  if (!existsSync(abs) || !statSync(abs).isFile()) return null;
  return abs;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;
  const type = String(req.headers['content-type'] || '');
  if (type.includes('application/json')) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

async function loadHandler(rel) {
  // Sempre reimporta no dev para refletir alterações de código sem reiniciar.
  const href = pathToFileURL(join(root, rel)).href + `?t=${Date.now()}`;
  const mod = await import(href);
  return mod.default;
}

function sendFile(res, abs) {
  const type = MIME[extname(abs).toLowerCase()] || 'application/octet-stream';
  res.statusCode = 200;
  res.setHeader('Content-Type', type);
  if (type.includes('javascript') || type.includes('css') || type.includes('html')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  createReadStream(abs).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
    const rewritten = applyRewrites(url.pathname, url.search);

    if (rewritten.file) {
      req.query = rewritten.query;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) {
        req.body = await readBody(req);
      }
      const handler = await loadHandler(rewritten.file);
      return handler(req, res);
    }

    if (rewritten.page) {
      const qs = new URLSearchParams(rewritten.query).toString();
      req.url = `/${rewritten.page}${qs ? `?${qs}` : ''}`;
      const abs = join(root, rewritten.page);
      if (existsSync(abs)) return sendFile(res, abs);
    }

    if (url.pathname === '/') {
      const home = existsSync(join(root, 'index.html')) ? 'index.html' : 'home.html';
      return sendFile(res, join(root, home));
    }

    const abs = safeFile(url.pathname);
    if (abs) return sendFile(res, abs);

    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Não encontrado.');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Erro interno.' }));
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Antonov local em http://127.0.0.1:${PORT}`);
  console.log(`  Home        http://127.0.0.1:${PORT}/`);
  console.log(`  Parceiros   http://127.0.0.1:${PORT}/parceiros`);
  console.log(`  Perfil demo http://127.0.0.1:${PORT}/parceiros/marina-dourado`);
  console.log(`  Admin       http://127.0.0.1:${PORT}/admin`);
});
