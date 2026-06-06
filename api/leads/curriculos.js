import { handleLeadPost, sanitizeContact } from '../lib/db.js';

function parseCurriculo(raw) {
  const base = sanitizeContact(raw);
  if (base.error) return base;

  const area =
    String(raw?.area || raw?.interesse || '').trim() || null;
  const disponibilidade =
    String(raw?.disponibilidade || raw?.melhor_turno || '').trim() || null;
  let mensagem = String(raw?.mensagem || '').trim() || null;
  const portfolio = String(raw?.portfolio || '').trim() || null;
  const page = String(raw?.page || '').trim() || null;

  if (!area) return { error: 'Área de interesse é obrigatória.' };

  if (portfolio) {
    mensagem = mensagem ? `Portfólio: ${portfolio}\n\n${mensagem}` : `Portfólio: ${portfolio}`;
  }

  const row = { ...base, area, disponibilidade, mensagem, page };

  return {
    notify: {
      subject: 'Nova candidatura | Trabalhe conosco',
      formType: 'Trabalhe conosco',
      confirmationType: 'curriculos',
      fields: row,
    },
    insert: (sql) => sql`
      INSERT INTO leads_curriculos (nome, email, telefone, area, disponibilidade, mensagem, page)
      VALUES (
        ${row.nome},
        ${row.email},
        ${row.telefone},
        ${row.area},
        ${row.disponibilidade},
        ${row.mensagem},
        ${row.page}
      )
      RETURNING id, created_at
    `,
  };
}

export default function handler(req, res) {
  return handleLeadPost(req, res, parseCurriculo);
}
