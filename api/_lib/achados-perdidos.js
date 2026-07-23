import { getSql } from './db.js';
import { parseFilePayload } from './forms.js';

export const ACHADOS_STATUS = new Set(['pendente', 'entregue']);

export function fotoToDataUrl(row) {
  if (!row?.foto_data) return null;
  const type = row.foto_type || 'image/jpeg';
  return `data:${type};base64,${row.foto_data}`;
}

export function mapItem(row, { includeFotoData = true } = {}) {
  if (!row) return null;
  const item = {
    id: row.id,
    nome_produto: row.nome_produto,
    data_cadastro: row.data_cadastro,
    status: row.status,
    data_entrega: row.data_entrega,
    entregue_a: row.entregue_a,
    entregue_a_id: row.entregue_a_id,
    entregue_por: row.entregue_por,
    criado_por: row.criado_por,
    criado_por_email: row.criado_por_email || null,
    foto_name: row.foto_name,
    foto_type: row.foto_type,
    has_foto: Boolean(row.foto_data),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (includeFotoData && row.foto_data) {
    item.foto_url = fotoToDataUrl(row);
  }
  return item;
}

export function parseFotoBody(body) {
  if (body?.foto == null || body.foto === '') {
    return { value: null };
  }
  return parseFilePayload(body.foto, 'Foto');
}

export async function listAll() {
  const sql = getSql();
  const rows = await sql`
    SELECT a.*, u.email AS criado_por_email
    FROM achados_perdidos a
    LEFT JOIN admin_users u ON u.id = a.criado_por
    ORDER BY
      CASE WHEN a.status = 'pendente' THEN 0 ELSE 1 END,
      a.data_cadastro DESC,
      a.created_at DESC
  `;
  return rows.map((r) => mapItem(r));
}

export async function listPendentesPublic() {
  const sql = getSql();
  const rows = await sql`
    SELECT id, nome_produto, data_cadastro, foto_name, foto_type, foto_data, status
    FROM achados_perdidos
    WHERE status = 'pendente'
    ORDER BY data_cadastro DESC, created_at DESC
  `;
  return rows.map((r) => mapItem(r));
}

export async function getById(id) {
  const sql = getSql();
  const rows = await sql`
    SELECT a.*, u.email AS criado_por_email
    FROM achados_perdidos a
    LEFT JOIN admin_users u ON u.id = a.criado_por
    WHERE a.id = ${id}
    LIMIT 1
  `;
  return rows[0] ? mapItem(rows[0]) : null;
}

export async function createItem({ nome_produto, data_cadastro, foto, criado_por }) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO achados_perdidos (
      nome_produto, data_cadastro,
      foto_name, foto_type, foto_data,
      status, criado_por
    ) VALUES (
      ${nome_produto},
      ${data_cadastro},
      ${foto?.name || null},
      ${foto?.type || null},
      ${foto?.data || null},
      'pendente',
      ${criado_por || null}
    )
    RETURNING *
  `;
  return mapItem(rows[0]);
}

export async function updateItem(id, patch) {
  const sql = getSql();
  const existing = await sql`SELECT * FROM achados_perdidos WHERE id = ${id} LIMIT 1`;
  const cur = existing[0];
  if (!cur) return null;

  const nome = patch.nome_produto != null ? String(patch.nome_produto).trim() : cur.nome_produto;
  const dataCadastro = patch.data_cadastro != null ? patch.data_cadastro : cur.data_cadastro;
  const status = patch.status != null && ACHADOS_STATUS.has(patch.status) ? patch.status : cur.status;

  let fotoName = cur.foto_name;
  let fotoType = cur.foto_type;
  let fotoData = cur.foto_data;
  if (patch.foto !== undefined) {
    if (patch.foto === null) {
      fotoName = null;
      fotoType = null;
      fotoData = null;
    } else if (patch.foto) {
      fotoName = patch.foto.name;
      fotoType = patch.foto.type;
      fotoData = patch.foto.data;
    }
  }

  let dataEntrega = cur.data_entrega;
  let entregueA = cur.entregue_a;
  let entregueAId = cur.entregue_a_id;
  let entreguePor = cur.entregue_por;

  if (status === 'entregue') {
    dataEntrega = patch.data_entrega != null ? patch.data_entrega : cur.data_entrega;
    entregueA = patch.entregue_a != null ? String(patch.entregue_a).trim() : cur.entregue_a;
    entregueAId = patch.entregue_a_id != null ? String(patch.entregue_a_id).trim() : cur.entregue_a_id;
    entreguePor = patch.entregue_por != null ? String(patch.entregue_por).trim() : cur.entregue_por;
  } else if (status === 'pendente' && patch.status === 'pendente') {
    dataEntrega = null;
    entregueA = null;
    entregueAId = null;
    entreguePor = null;
  }

  const rows = await sql`
    UPDATE achados_perdidos SET
      nome_produto = ${nome},
      data_cadastro = ${dataCadastro},
      foto_name = ${fotoName},
      foto_type = ${fotoType},
      foto_data = ${fotoData},
      status = ${status},
      data_entrega = ${dataEntrega || null},
      entregue_a = ${entregueA || null},
      entregue_a_id = ${entregueAId || null},
      entregue_por = ${entreguePor || null},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return mapItem(rows[0]);
}

export async function deleteItem(id) {
  const sql = getSql();
  const rows = await sql`DELETE FROM achados_perdidos WHERE id = ${id} RETURNING id`;
  return rows[0] || null;
}
