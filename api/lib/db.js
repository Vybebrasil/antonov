import { neon } from '@neondatabase/serverless';
import { isResendConfigured, sendLeadEmails } from './resend.js';

export function getSql() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  return neon(url);
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function parseBody(req) {
  if (!req.body) return null;
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return null;
  }
}

export function sanitizeContact(raw) {
  const nome = String(raw?.nome || '').trim();
  const email = String(raw?.email || '').trim().toLowerCase();
  const telefone = String(raw?.telefone || '').trim();

  if (!nome || nome.length < 2) return { error: 'Nome inválido.' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'E-mail inválido.' };
  if (!telefone || telefone.length < 8) return { error: 'Telefone inválido.' };

  return { nome, email, telefone };
}

export async function handleLeadPost(req, res, insertFn) {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  const hasDb = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const hasResend = isResendConfigured();

  if (!hasDb && !hasResend) {
    return json(res, 500, { error: 'Servidor não configurado (banco ou e-mail).' });
  }

  const body = parseBody(req);
  if (!body) return json(res, 400, { error: 'JSON inválido.' });

  const parsed = insertFn(body);
  if (parsed.error) return json(res, 400, { error: parsed.error });

  let id;
  let created_at;

  if (hasDb && parsed.insert) {
    try {
      const rows = await parsed.insert(getSql());
      id = rows[0]?.id;
      created_at = rows[0]?.created_at;
    } catch (err) {
      console.error('lead insert error', err);
      return json(res, 500, { error: 'Não foi possível salvar o cadastro.' });
    }
  }

  if (hasResend && parsed.notify) {
    try {
      await sendLeadEmails(parsed.notify);
    } catch (err) {
      console.error('resend error', err);
      if (!hasDb || id == null) {
        return json(res, 500, { error: 'Não foi possível enviar a mensagem.' });
      }
    }
  }

  return json(res, 201, { ok: true, id, created_at });
}
