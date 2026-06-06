import { handleLeadPost, sanitizeContact } from '../lib/db.js';

function parseTour(raw) {
  const base = sanitizeContact(raw);
  if (base.error) return base;

  const interesse = String(raw?.interesse || '').trim() || null;
  const mensagem = String(raw?.mensagem || '').trim() || null;
  const melhor_dia = String(raw?.melhor_dia || '').trim() || null;
  const melhor_turno = String(raw?.melhor_turno || '').trim() || null;
  const page = String(raw?.page || '').trim() || null;

  if (!interesse) return { error: 'Selecione seu interesse principal.' };

  const row = { ...base, interesse, mensagem, melhor_dia, melhor_turno, page };

  return {
    notify: {
      subject: 'Nova mensagem | Contato',
      formType: 'Formulário de contato',
      confirmationType: 'contato',
      fields: row,
    },
    insert: (sql) => sql`
      INSERT INTO leads_tour (nome, email, telefone, interesse, melhor_dia, melhor_turno, mensagem, page)
      VALUES (
        ${row.nome},
        ${row.email},
        ${row.telefone},
        ${row.interesse},
        ${row.melhor_dia},
        ${row.melhor_turno},
        ${row.mensagem},
        ${row.page}
      )
      RETURNING id, created_at
    `,
  };
}

export default function handler(req, res) {
  return handleLeadPost(req, res, parseTour);
}
