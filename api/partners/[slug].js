import { json } from '../_lib/db.js';
import { getPublicPartnerBySlug } from '../_lib/parceiros.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  const slug = String(req.query?.slug || '').trim();
  if (!slug) return json(res, 400, { error: 'Slug inválido.' });

  try {
    const partner = await getPublicPartnerBySlug(slug);
    if (!partner) return json(res, 404, { error: 'Parceiro não encontrado.' });
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
    return json(res, 200, { partner });
  } catch (err) {
    console.error('partners slug', err);
    return json(res, 500, { error: 'Não foi possível carregar o perfil.' });
  }
}
