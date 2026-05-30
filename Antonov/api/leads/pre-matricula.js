import { handleLeadPost, sanitizeContact } from '../lib/db.js';

function parsePreMatricula(raw) {
  const base = sanitizeContact(raw);
  if (base.error) return base;

  const interesse = String(raw?.interesse || '').trim() || null;
  const mensagem = String(raw?.mensagem || '').trim() || null;
  const page = String(raw?.page || '').trim() || null;

  if (!interesse) return { error: 'Selecione seu principal interesse.' };

  const row = { ...base, interesse, mensagem, page };

  return {
    insert: (sql) => sql`
      INSERT INTO leads_pre_matricula (nome, email, telefone, interesse, mensagem, page)
      VALUES (
        ${row.nome},
        ${row.email},
        ${row.telefone},
        ${row.interesse},
        ${row.mensagem},
        ${row.page}
      )
      RETURNING id, created_at
    `,
  };
}

export default function handler(req, res) {
  return handleLeadPost(req, res, parsePreMatricula);
}
