import { json } from '../../_lib/db.js';
import { getMedia } from '../../_lib/parceiros.js';
import { isPublicPartnerStatus } from '../../_lib/parceiros-logic.js';
import { getParceirosSession, hasPermission } from '../../_lib/parceiros-auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  const id = Number(req.query?.id);
  if (!Number.isFinite(id)) return json(res, 400, { error: 'Mídia inválida.' });

  try {
    const media = await getMedia(id);
    if (!media?.file_data) return json(res, 404, { error: 'Mídia não encontrada.' });

    const isPublic = isPublicPartnerStatus(media.partner_status) && !media.partner_deleted;
    if (!isPublic) {
      const session = await getParceirosSession(req);
      if (!session || !hasPermission(session, 'partners.read')) {
        return json(res, 404, { error: 'Mídia não encontrada.' });
      }
    }

    const buf = Buffer.from(media.file_data, 'base64');
    res.statusCode = 200;
    res.setHeader('Content-Type', media.file_type || 'image/jpeg');
    res.setHeader('Cache-Control', isPublic ? 'public, max-age=86400, stale-while-revalidate=604800' : 'private, max-age=60');
    res.setHeader('Content-Length', String(buf.length));
    return res.end(buf);
  } catch (err) {
    console.error('partners media', err);
    return json(res, 500, { error: 'Não foi possível carregar a imagem.' });
  }
}
