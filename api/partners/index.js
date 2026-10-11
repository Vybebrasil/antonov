import { json } from '../_lib/db.js';
import { listPublicCategories, listPublicPartners, getHomeCarousels, refreshOperationalStatuses } from '../_lib/parceiros.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  try {
    await refreshOperationalStatuses();
    const view = String(req.query?.view || '');
    const [categories, partners] = await Promise.all([
      listPublicCategories(),
      view === 'home'
        ? Promise.resolve(null)
        : listPublicPartners({
            categoria: req.query?.categoria || req.query?.category,
            q: req.query?.q || req.query?.busca,
          }),
    ]);

    if (view === 'home') {
      const home = await getHomeCarousels();
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
      return json(res, 200, { categories, home });
    }

    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
    return json(res, 200, { categories, partners });
  } catch (err) {
    console.error('partners list', err);
    return json(res, 500, { error: 'Não foi possível carregar os parceiros.' });
  }
}
