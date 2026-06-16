import { json, adminCors, parseBody } from '../../api/_lib/admin-http.js';
import { requireAdmin } from '../../api/_lib/admin-auth.js';
import { getSql } from '../../api/_lib/db.js';
import {
  PDI_STATUS,
  ACAO_STATUS,
  DIMENSAO_702010,
  parseStringList,
  validateCicloDates,
  getColaboradorById,
  getCicloFull,
  getDashboardGestor,
  listColaboradores,
} from '../../api/_lib/pdi.js';

function segments(req) {
  const raw = req.query?.path;
  if (typeof raw === 'string') return raw.split('/').filter(Boolean);
  if (Array.isArray(raw)) return raw.filter(Boolean);
  const pathname = String(req.url || '').split('?')[0];
  const prefix = '/api/admin/pdi/';
  if (pathname.startsWith(prefix)) return pathname.slice(prefix.length).split('/').filter(Boolean);
  return [];
}

export default async function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const parts = segments(req);
  const body = parseBody(req) || {};
  const sql = getSql();

  try {
    if (parts.length === 0 && req.method === 'GET') {
      const data = await getDashboardGestor(session.userId);
      return json(res, 200, data);
    }

    if (parts[0] === 'mentores' && parts.length === 1 && req.method === 'GET') {
      const rows = await sql`SELECT id, email FROM admin_users ORDER BY email ASC`;
      return json(res, 200, { mentores: rows });
    }

    if (parts[0] === 'colaboradores') {
      if (parts.length === 1 && req.method === 'GET') {
        const rows = await listColaboradores();
        return json(res, 200, { colaboradores: rows });
      }
      if (parts.length === 1 && req.method === 'POST') {
        const nome = String(body.nome || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        if (!nome || !email) return json(res, 400, { error: 'Nome e e-mail são obrigatórios.' });
        const rows = await sql`
          INSERT INTO colaboradores_perfis (
            nome, email, admin_user_id, cargo_atual, cargo_almejado, pontos_fortes, budget_anual
          ) VALUES (
            ${nome},
            ${email},
            ${body.admin_user_id ? Number(body.admin_user_id) : null},
            ${String(body.cargo_atual || '').trim() || null},
            ${String(body.cargo_almejado || '').trim() || null},
            ${parseStringList(body.pontos_fortes).length ? parseStringList(body.pontos_fortes) : null},
            ${Number(body.budget_anual) || 0}
          )
          RETURNING *
        `;
        return json(res, 201, { colaborador: rows[0] });
      }
      if (parts.length === 2 && req.method === 'GET') {
        const col = await getColaboradorById(parts[1]);
        if (!col) return json(res, 404, { error: 'Colaborador não encontrado.' });
        const ciclos = await sql`
          SELECT * FROM pdis_ciclos WHERE colaborador_id = ${parts[1]}
          ORDER BY data_inicio DESC
        `;
        const cicloAtivo = ciclos.find((c) => c.status === 'ativo');
        let cicloFull = null;
        if (cicloAtivo) cicloFull = await getCicloFull(cicloAtivo.id);
        return json(res, 200, { colaborador: col, ciclos, cicloAtivo: cicloFull });
      }
      if (parts.length === 2 && req.method === 'PATCH') {
        const col = await getColaboradorById(parts[1]);
        if (!col) return json(res, 404, { error: 'Colaborador não encontrado.' });
        const rows = await sql`
          UPDATE colaboradores_perfis SET
            nome = ${body.nome != null ? String(body.nome).trim() : col.nome},
            email = ${body.email != null ? String(body.email).trim().toLowerCase() : col.email},
            cargo_atual = ${body.cargo_atual != null ? String(body.cargo_atual).trim() || null : col.cargo_atual},
            cargo_almejado = ${body.cargo_almejado != null ? String(body.cargo_almejado).trim() || null : col.cargo_almejado},
            pontos_fortes = ${body.pontos_fortes != null
              ? (parseStringList(body.pontos_fortes).length ? parseStringList(body.pontos_fortes) : null)
              : col.pontos_fortes},
            budget_anual = ${body.budget_anual != null ? Number(body.budget_anual) || 0 : col.budget_anual},
            updated_at = NOW()
          WHERE id = ${parts[1]}
          RETURNING *
        `;
        return json(res, 200, { colaborador: rows[0] });
      }
    }

    if (parts[0] === 'ciclos') {
      if (parts.length === 1 && req.method === 'POST') {
        const colaboradorId = String(body.colaborador_id || '').trim();
        const objetivo = String(body.objetivo_principal_smart || '').trim();
        if (!colaboradorId || !objetivo) {
          return json(res, 400, { error: 'Colaborador e objetivo SMART são obrigatórios.' });
        }
        const col = await getColaboradorById(colaboradorId);
        if (!col) return json(res, 404, { error: 'Colaborador não encontrado.' });

        const dateCheck = validateCicloDates(body.data_inicio, body.data_fim);
        if (dateCheck.error) return json(res, 400, { error: dateCheck.error });

        const status = PDI_STATUS.has(body.status) ? body.status : 'rascunho';
        const rows = await sql`
          INSERT INTO pdis_ciclos (
            colaborador_id, lider_id, objetivo_principal_smart, status,
            data_inicio, data_fim, gaps_tecnicos, gaps_comportamentais, budget_limite
          ) VALUES (
            ${colaboradorId},
            ${session.userId},
            ${objetivo},
            ${status},
            ${body.data_inicio},
            ${body.data_fim},
            ${parseStringList(body.gaps_tecnicos).length ? parseStringList(body.gaps_tecnicos) : null},
            ${parseStringList(body.gaps_comportamentais).length ? parseStringList(body.gaps_comportamentais) : null},
            ${body.budget_limite != null ? Number(body.budget_limite) : col.budget_anual}
          )
          RETURNING *
        `;
        const ciclo = rows[0];

        const acoes = Array.isArray(body.acoes) ? body.acoes : [];
        for (const ac of acoes) {
          if (!String(ac.acao_descricao || '').trim()) continue;
          const dim = DIMENSAO_702010.has(ac.dimensao_70_20_10) ? ac.dimensao_70_20_10 : 'pratico_70';
          const mentorId = ac.mentor_id ? Number(ac.mentor_id) : null;
          await sql`
            INSERT INTO pdis_planos_acao (
              ciclo_id, dimensao_70_20_10, acao_descricao, prazo_limite,
              mentor_id, evidencia_aprendizado, investimento_estimado, status
            ) VALUES (
              ${ciclo.id},
              ${dim},
              ${String(ac.acao_descricao).trim()},
              ${ac.prazo_limite || null},
              ${mentorId},
              ${String(ac.evidencia_aprendizado || '').trim() || null},
              ${Number(ac.investimento_estimado) || 0},
              ${ACAO_STATUS.has(ac.status) ? ac.status : 'nao_iniciado'}
            )
          `;
        }

        const full = await getCicloFull(ciclo.id);
        return json(res, 201, full);
      }

      if (parts.length === 2 && req.method === 'GET') {
        const full = await getCicloFull(parts[1]);
        if (!full) return json(res, 404, { error: 'Ciclo não encontrado.' });
        return json(res, 200, full);
      }

      if (parts.length === 2 && req.method === 'PATCH') {
        const existing = await getCicloFull(parts[1]);
        if (!existing) return json(res, 404, { error: 'Ciclo não encontrado.' });
        const c = existing.ciclo;

        if (body.data_inicio && body.data_fim) {
          const dateCheck = validateCicloDates(body.data_inicio, body.data_fim);
          if (dateCheck.error) return json(res, 400, { error: dateCheck.error });
        }

        const status = body.status != null && PDI_STATUS.has(body.status) ? body.status : c.status;

        await sql`
          UPDATE pdis_ciclos SET
            objetivo_principal_smart = ${body.objetivo_principal_smart != null
              ? String(body.objetivo_principal_smart).trim()
              : c.objetivo_principal_smart},
            status = ${status},
            data_inicio = ${body.data_inicio || c.data_inicio},
            data_fim = ${body.data_fim || c.data_fim},
            gaps_tecnicos = ${body.gaps_tecnicos != null
              ? (parseStringList(body.gaps_tecnicos).length ? parseStringList(body.gaps_tecnicos) : null)
              : c.gaps_tecnicos},
            gaps_comportamentais = ${body.gaps_comportamentais != null
              ? (parseStringList(body.gaps_comportamentais).length ? parseStringList(body.gaps_comportamentais) : null)
              : c.gaps_comportamentais},
            budget_limite = ${body.budget_limite != null ? Number(body.budget_limite) : c.budget_limite},
            updated_at = NOW()
          WHERE id = ${parts[1]}
        `;

        const full = await getCicloFull(parts[1]);
        return json(res, 200, full);
      }

      if (parts.length === 2 && req.method === 'DELETE') {
        const existing = await getCicloFull(parts[1]);
        if (!existing) return json(res, 404, { error: 'Ciclo não encontrado.' });
        await sql`DELETE FROM pdis_ciclos WHERE id = ${parts[1]}`;
        return json(res, 200, { ok: true, id: parts[1] });
      }

      if (parts.length === 3 && parts[2] === 'acoes' && req.method === 'POST') {
        const full = await getCicloFull(parts[1]);
        if (!full) return json(res, 404, { error: 'Ciclo não encontrado.' });
        const desc = String(body.acao_descricao || '').trim();
        if (!desc) return json(res, 400, { error: 'Descrição da ação é obrigatória.' });
        const dim = DIMENSAO_702010.has(body.dimensao_70_20_10) ? body.dimensao_70_20_10 : 'pratico_70';
        const mentorId = body.mentor_id ? Number(body.mentor_id) : null;
        const rows = await sql`
          INSERT INTO pdis_planos_acao (
            ciclo_id, dimensao_70_20_10, acao_descricao, prazo_limite,
            mentor_id, evidencia_aprendizado, investimento_estimado, status, anotacoes_colaborador
          ) VALUES (
            ${parts[1]}, ${dim}, ${desc},
            ${body.prazo_limite || null},
            ${mentorId},
            ${String(body.evidencia_aprendizado || '').trim() || null},
            ${Number(body.investimento_estimado) || 0},
            ${ACAO_STATUS.has(body.status) ? body.status : 'nao_iniciado'},
            ${String(body.anotacoes_colaborador || '').trim() || null}
          )
          RETURNING *
        `;
        return json(res, 201, { acao: rows[0], ciclo: await getCicloFull(parts[1]) });
      }

      if (parts.length === 3 && parts[2] === 'checkpoints' && req.method === 'POST') {
        const full = await getCicloFull(parts[1]);
        if (!full) return json(res, 404, { error: 'Ciclo não encontrado.' });
        if (!body.data_reuniao) return json(res, 400, { error: 'Data da reunião é obrigatória.' });
        const rows = await sql`
          INSERT INTO pdis_checkpoints (
            ciclo_id, data_reuniao, anotacoes_lider, anotacoes_liderado, proximos_passos
          ) VALUES (
            ${parts[1]},
            ${body.data_reuniao},
            ${String(body.anotacoes_lider || '').trim() || null},
            ${String(body.anotacoes_liderado || '').trim() || null},
            ${String(body.proximos_passos || '').trim() || null}
          )
          RETURNING *
        `;
        return json(res, 201, { checkpoint: rows[0], ciclo: await getCicloFull(parts[1]) });
      }
    }

    if (parts[0] === 'acoes' && parts.length === 2 && req.method === 'PATCH') {
      const acoes = await sql`SELECT * FROM pdis_planos_acao WHERE id = ${parts[1]} LIMIT 1`;
      const ac = acoes[0];
      if (!ac) return json(res, 404, { error: 'Ação não encontrada.' });

      await sql`
        UPDATE pdis_planos_acao SET
          dimensao_70_20_10 = ${body.dimensao_70_20_10 != null && DIMENSAO_702010.has(body.dimensao_70_20_10)
            ? body.dimensao_70_20_10 : ac.dimensao_70_20_10},
          acao_descricao = ${body.acao_descricao != null ? String(body.acao_descricao).trim() : ac.acao_descricao},
          prazo_limite = ${body.prazo_limite !== undefined ? body.prazo_limite || null : ac.prazo_limite},
          mentor_id = ${body.mentor_id !== undefined
            ? (body.mentor_id ? Number(body.mentor_id) : null)
            : ac.mentor_id},
          evidencia_aprendizado = ${body.evidencia_aprendizado != null
            ? String(body.evidencia_aprendizado).trim() || null
            : ac.evidencia_aprendizado},
          investimento_estimado = ${body.investimento_estimado != null
            ? Number(body.investimento_estimado) || 0
            : ac.investimento_estimado},
          status = ${body.status != null && ACAO_STATUS.has(body.status) ? body.status : ac.status},
          anotacoes_colaborador = ${body.anotacoes_colaborador != null
            ? String(body.anotacoes_colaborador).trim() || null
            : ac.anotacoes_colaborador},
          updated_at = NOW()
        WHERE id = ${parts[1]}
      `;

      const updated = await sql`SELECT * FROM pdis_planos_acao WHERE id = ${parts[1]} LIMIT 1`;
      const ciclo = await getCicloFull(ac.ciclo_id);
      return json(res, 200, { acao: updated[0], ciclo });
    }

    if (parts[0] === 'acoes' && parts.length === 2 && req.method === 'DELETE') {
      const acoes = await sql`SELECT * FROM pdis_planos_acao WHERE id = ${parts[1]} LIMIT 1`;
      const ac = acoes[0];
      if (!ac) return json(res, 404, { error: 'Ação não encontrada.' });
      await sql`DELETE FROM pdis_planos_acao WHERE id = ${parts[1]}`;
      const ciclo = await getCicloFull(ac.ciclo_id);
      return json(res, 200, { ok: true, ciclo });
    }

    return json(res, 404, { error: 'Rota PDI não encontrada.' });
  } catch (err) {
    console.error('pdi handler', err);
    return json(res, 500, { error: 'Erro interno no módulo de RH.' });
  }
}
