import { json, adminCors, parseBody } from '../../api/_lib/admin-http.js';
import { requireModule } from '../../api/_lib/parceiros-auth.js';
import { getSql } from '../../api/_lib/db.js';
import {
  PDI_STATUS,
  ACAO_STATUS,
  DIMENSAO_702010,
  CHECKPOINT_TIPOS,
  MAX_OBJETIVOS,
  parseStringList,
  validateCicloDates,
  ensureColaboradoresSchema,
  ensurePdiSchema,
  getColaboradorById,
  getCicloFull,
  getDashboardGestor,
  listColaboradores,
  normalizeObjetivo,
  insertObjetivo,
  getMentorById,
  parseHorasMes,
  isUuid,
} from '../../api/_lib/pdi.js';

function listOrNull(raw) {
  const list = parseStringList(raw);
  return list.length ? list : null;
}

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

  const session = await requireModule(req, res, 'hr');
  if (!session) return;

  const parts = segments(req);
  const body = parseBody(req) || {};
  const sql = getSql();

  try {
    await ensurePdiSchema();

    if (parts.length === 0 && req.method === 'GET') {
      const data = await getDashboardGestor(session.userId);
      return json(res, 200, data);
    }

    if (parts[0] === 'mentores' && parts.length === 1 && req.method === 'GET') {
      const rows = await sql`
        SELECT id, email, name FROM admin_users WHERE deleted_at IS NULL ORDER BY email ASC
      `;
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
        await ensureColaboradoresSchema();
        const dup = await sql`
          SELECT id, deleted_at FROM colaboradores_perfis WHERE LOWER(email) = ${email} LIMIT 1
        `;
        if (dup[0] && !dup[0].deleted_at) {
          return json(res, 409, { error: 'Já existe um colaborador com esse e-mail.' });
        }
        if (dup[0]) {
          const restored = await sql`
            UPDATE colaboradores_perfis SET
              nome = ${nome},
              cargo_atual = ${String(body.cargo_atual || '').trim() || null},
              cargo_almejado = ${String(body.cargo_almejado || '').trim() || null},
              pontos_fortes = ${parseStringList(body.pontos_fortes).length ? parseStringList(body.pontos_fortes) : null},
              budget_anual = ${Number(body.budget_anual) || 0},
              deleted_at = NULL,
              updated_at = NOW()
            WHERE id = ${dup[0].id}
            RETURNING *
          `;
          return json(res, 201, { colaborador: restored[0] });
        }
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
        const nextEmail = body.email != null ? String(body.email).trim().toLowerCase() : col.email;
        const nextNome = body.nome != null ? String(body.nome).trim() : col.nome;
        if (!nextNome || !nextEmail) return json(res, 400, { error: 'Nome e e-mail são obrigatórios.' });
        if (nextEmail !== String(col.email).toLowerCase()) {
          const dup = await sql`
            SELECT id FROM colaboradores_perfis
            WHERE LOWER(email) = ${nextEmail} AND id <> ${parts[1]} LIMIT 1
          `;
          if (dup[0]) return json(res, 409, { error: 'Já existe um colaborador com esse e-mail.' });
        }
        const rows = await sql`
          UPDATE colaboradores_perfis SET
            nome = ${nextNome},
            email = ${nextEmail},
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
      if (parts.length === 2 && req.method === 'DELETE') {
        const col = await getColaboradorById(parts[1]);
        if (!col) return json(res, 404, { error: 'Colaborador não encontrado.' });
        await sql`
          UPDATE pdis_ciclos SET status = 'cancelado', updated_at = NOW()
          WHERE colaborador_id = ${parts[1]} AND status IN ('rascunho', 'ativo')
        `;
        await sql`
          UPDATE colaboradores_perfis SET deleted_at = NOW(), updated_at = NOW()
          WHERE id = ${parts[1]}
        `;
        return json(res, 200, { ok: true, id: parts[1] });
      }
    }

    if (parts[0] === 'ciclos') {
      if (parts.length === 1 && req.method === 'POST') {
        const colaboradorId = String(body.colaborador_id || '').trim();
        if (!colaboradorId) return json(res, 400, { error: 'Colaborador é obrigatório.' });

        const objetivosIn = (Array.isArray(body.objetivos) ? body.objetivos : [])
          .filter((o) => o && String(o.titulo || '').trim());
        if (objetivosIn.length > MAX_OBJETIVOS) {
          return json(res, 400, {
            error: `No máximo ${MAX_OBJETIVOS} objetivos SMART por ciclo. Mais de ${MAX_OBJETIVOS} objetivos = nenhum entregue.`,
          });
        }
        const objetivos = [];
        for (const raw of objetivosIn) {
          const parsed = normalizeObjetivo(raw);
          if (parsed.error) return json(res, 400, { error: parsed.error });
          objetivos.push(parsed.value);
        }

        const objetivo = String(body.objetivo_principal_smart || '').trim() || objetivos[0]?.titulo || '';
        if (!objetivo) {
          return json(res, 400, { error: 'Informe ao menos um objetivo SMART.' });
        }

        const aspiracao = String(body.aspiracao_12m || '').trim();
        if (!aspiracao) {
          return json(res, 400, { error: 'A aspiração em 12 meses é obrigatória (sem ela o PDI vira lista de cursos).' });
        }
        if (!body.mentor_id) {
          return json(res, 400, { error: 'Designe um mentor: sem mentor o PDI não tem accountability.' });
        }
        const mentor = await getMentorById(body.mentor_id);
        if (!mentor) return json(res, 400, { error: 'Mentor inválido.' });

        const horas = parseHorasMes(body.horas_mes);
        if (horas.error) return json(res, 400, { error: horas.error });

        if (!isUuid(colaboradorId)) return json(res, 404, { error: 'Colaborador não encontrado.' });
        const col = await getColaboradorById(colaboradorId);
        if (!col) return json(res, 404, { error: 'Colaborador não encontrado.' });

        const dateCheck = validateCicloDates(body.data_inicio, body.data_fim);
        if (dateCheck.error) return json(res, 400, { error: dateCheck.error });

        const status = PDI_STATUS.has(body.status) ? body.status : 'rascunho';
        const rows = await sql`
          INSERT INTO pdis_ciclos (
            colaborador_id, lider_id, objetivo_principal_smart, status,
            data_inicio, data_fim, gaps_tecnicos, gaps_comportamentais, budget_limite,
            aspiracao_12m, horas_mes, mentor_id, kpis
          ) VALUES (
            ${colaboradorId},
            ${session.userId},
            ${objetivo},
            ${status},
            ${body.data_inicio},
            ${body.data_fim},
            ${listOrNull(body.gaps_tecnicos)},
            ${listOrNull(body.gaps_comportamentais)},
            ${body.budget_limite != null && body.budget_limite !== '' ? Number(body.budget_limite) : col.budget_anual},
            ${aspiracao},
            ${horas.value},
            ${Number(mentor.id)},
            ${listOrNull(body.kpis)}
          )
          RETURNING *
        `;
        const ciclo = rows[0];

        for (let i = 0; i < objetivos.length; i++) {
          await insertObjetivo(ciclo.id, objetivos[i], i + 1);
        }

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

        let aspiracao = c.aspiracao_12m ?? null;
        if (body.aspiracao_12m !== undefined) {
          aspiracao = String(body.aspiracao_12m || '').trim();
          if (!aspiracao) {
            return json(res, 400, { error: 'A aspiração em 12 meses não pode ficar vazia.' });
          }
        }
        let mentorId = c.mentor_id != null ? Number(c.mentor_id) : null;
        if (body.mentor_id !== undefined) {
          if (!body.mentor_id) {
            return json(res, 400, { error: 'Designe um mentor: sem mentor o PDI não tem accountability.' });
          }
          const mentor = await getMentorById(body.mentor_id);
          if (!mentor) return json(res, 400, { error: 'Mentor inválido.' });
          mentorId = Number(mentor.id);
        }
        let horasMes = c.horas_mes ?? null;
        if (body.horas_mes !== undefined) {
          const horas = parseHorasMes(body.horas_mes);
          if (horas.error) return json(res, 400, { error: horas.error });
          horasMes = horas.value;
        }
        const kpis = body.kpis !== undefined ? listOrNull(body.kpis) : c.kpis ?? null;
        const resumo = body.objetivo_principal_smart != null
          ? String(body.objetivo_principal_smart).trim() || c.objetivo_principal_smart
          : c.objetivo_principal_smart;

        await sql`
          UPDATE pdis_ciclos SET
            objetivo_principal_smart = ${resumo},
            aspiracao_12m = ${aspiracao},
            mentor_id = ${mentorId},
            horas_mes = ${horasMes},
            kpis = ${kpis},
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
        if (body.tipo != null && body.tipo !== '' && !CHECKPOINT_TIPOS.has(body.tipo)) {
          return json(res, 400, { error: 'Tipo de checkpoint inválido.' });
        }
        const tipo = CHECKPOINT_TIPOS.has(body.tipo) ? body.tipo : 'checkpoint';
        const rows = await sql`
          INSERT INTO pdis_checkpoints (
            ciclo_id, tipo, data_reuniao, anotacoes_lider, anotacoes_liderado, proximos_passos
          ) VALUES (
            ${parts[1]},
            ${tipo},
            ${body.data_reuniao},
            ${String(body.anotacoes_lider || '').trim() || null},
            ${String(body.anotacoes_liderado || '').trim() || null},
            ${String(body.proximos_passos || '').trim() || null}
          )
          RETURNING *
        `;
        return json(res, 201, { checkpoint: rows[0], ciclo: await getCicloFull(parts[1]) });
      }

      if (parts.length === 3 && parts[2] === 'objetivos' && req.method === 'POST') {
        const full = await getCicloFull(parts[1]);
        if (!full) return json(res, 404, { error: 'Ciclo não encontrado.' });
        if (full.objetivos.length >= MAX_OBJETIVOS) {
          return json(res, 400, {
            error: `Este ciclo já tem ${MAX_OBJETIVOS} objetivos SMART (máximo). Conclua ou remova um antes de adicionar outro.`,
          });
        }
        const parsed = normalizeObjetivo(body);
        if (parsed.error) return json(res, 400, { error: parsed.error });
        const ordem = full.objetivos.reduce((m, o) => Math.max(m, Number(o.ordem) || 0), 0) + 1;
        const objetivo = await insertObjetivo(parts[1], parsed.value, ordem);
        return json(res, 201, { objetivo, ciclo: await getCicloFull(parts[1]) });
      }
    }

    if (parts[0] === 'objetivos' && parts.length === 2 && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const found = isUuid(parts[1])
        ? await sql`SELECT * FROM pdis_objetivos WHERE id = ${parts[1]} LIMIT 1`
        : [];
      const obj = found[0];
      if (!obj) return json(res, 404, { error: 'Objetivo não encontrado.' });

      if (req.method === 'DELETE') {
        await sql`DELETE FROM pdis_objetivos WHERE id = ${parts[1]}`;
        return json(res, 200, { ok: true, id: parts[1], ciclo: await getCicloFull(obj.ciclo_id) });
      }

      const parsed = normalizeObjetivo(body, { partial: true, current: obj });
      if (parsed.error) return json(res, 400, { error: parsed.error });
      const v = parsed.value;
      const ordem = body.ordem != null && Number.isInteger(Number(body.ordem)) ? Number(body.ordem) : obj.ordem;
      const rows = await sql`
        UPDATE pdis_objetivos SET
          titulo = ${v.titulo},
          especifico = ${v.especifico},
          mensuravel = ${v.mensuravel},
          atingivel = ${v.atingivel},
          relevante = ${v.relevante},
          trimestre = ${v.trimestre},
          status = ${v.status},
          ordem = ${ordem},
          updated_at = NOW()
        WHERE id = ${parts[1]}
        RETURNING *
      `;
      return json(res, 200, { objetivo: rows[0], ciclo: await getCicloFull(obj.ciclo_id) });
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
    if (err?.code === '22P02') return json(res, 404, { error: 'Registro não encontrado.' });
    console.error('pdi handler', err);
    return json(res, 500, { error: 'Erro interno no módulo de RH.' });
  }
}
