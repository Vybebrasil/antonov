import { neon } from '@neondatabase/serverless';

function getSql() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  return neon(url);
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  if (!req.body) return null;
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return null;
  }
}

function sanitizeLead(raw) {
  const nome = String(raw?.nome || '').trim();
  const email = String(raw?.email || '').trim().toLowerCase();
  const telefone = String(raw?.telefone || '').trim();
  const interesse = String(raw?.interesse || '').trim() || null;
  const mensagem = String(raw?.mensagem || '').trim() || null;
  const origem = String(raw?.origem || '').trim();
  const page = String(raw?.page || '').trim() || null;
  const melhor_dia = String(raw?.melhor_dia || '').trim() || null;
  const melhor_turno = String(raw?.melhor_turno || '').trim() || null;

  if (!nome || nome.length < 2) return { error: 'Nome inválido.' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'E-mail inválido.' };
  if (!telefone || telefone.length < 8) return { error: 'Telefone inválido.' };
  if (!origem) return { error: 'Origem do lead é obrigatória.' };
  if (origem === 'trabalhe-conosco-curriculo' && !interesse) {
    return { error: 'Área de interesse é obrigatória.' };
  }

  return {
    lead: { nome, email, telefone, interesse, mensagem, origem, page, melhor_dia, melhor_turno },
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    return json(res, 500, { error: 'Banco de dados não configurado no servidor.' });
  }

  const body = parseBody(req);
  if (!body) return json(res, 400, { error: 'JSON inválido.' });

  const parsed = sanitizeLead(body);
  if (parsed.error) return json(res, 400, { error: parsed.error });

  const { lead } = parsed;

  try {
    const rows = await getSql()`
      INSERT INTO leads (nome, email, telefone, interesse, mensagem, origem, page, melhor_dia, melhor_turno)
      VALUES (
        ${lead.nome},
        ${lead.email},
        ${lead.telefone},
        ${lead.interesse},
        ${lead.mensagem},
        ${lead.origem},
        ${lead.page},
        ${lead.melhor_dia},
        ${lead.melhor_turno}
      )
      RETURNING id, created_at
    `;

    return json(res, 201, { ok: true, id: rows[0]?.id, created_at: rows[0]?.created_at });
  } catch (err) {
    console.error('leads insert error', err);
    return json(res, 500, { error: 'Não foi possível salvar o cadastro.' });
  }
}
