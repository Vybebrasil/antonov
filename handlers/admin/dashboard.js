import { json, adminCors } from '../../api/_lib/admin-http.js';
import { requireAdmin } from '../../api/_lib/admin-auth.js';
import {
  countAllInRange,
  countFormInRange,
  getSubmissionStats,
  getDailyCountsBetween,
  getDailyCountsForForm,
  getRecentSubmissions,
} from '../../api/_lib/forms.js';
import { fetchGa4Metrics } from '../../api/_lib/ga4.js';

const PERIOD_DAYS = [7, 30, 90];

function startOfUtcDay(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function periodBounds(days) {
  const from = startOfUtcDay();
  from.setUTCDate(from.getUTCDate() - days);
  const toExclusive = startOfUtcDay();
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return {
    fromIso: from.toISOString(),
    toIso: new Date().toISOString(),
    toExclusiveIso: toExclusive.toISOString(),
  };
}

function daysAgoStartOfDay(n) {
  const d = startOfUtcDay();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function parsePeriodDays(raw) {
  const n = Number(raw);
  return PERIOD_DAYS.includes(n) ? n : 30;
}

function buildComparison(total, previousTotal) {
  const delta = total - previousTotal;
  let deltaPct = 0;
  if (previousTotal > 0) {
    deltaPct = Math.round((delta / previousTotal) * 100);
  } else if (total > 0) {
    deltaPct = 100;
  }
  return { previousTotal, delta, deltaPct };
}

export default async function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  try {
    const days = parsePeriodDays(req.query?.days);
    const formId = req.query?.formId ? Number(req.query.formId) : null;
    const { fromIso, toIso, toExclusiveIso } = periodBounds(days);
    const prevFromIso = daysAgoStartOfDay(days * 2);
    const prevToIso = fromIso;

    const countRange = formId
      ? (from, to) => countFormInRange(formId, from, to)
      : (from, to) => countAllInRange(from, to);
    const dailyRange = formId
      ? (from, to) => getDailyCountsForForm(formId, from, to)
      : (from, to) => getDailyCountsBetween(from, to);

    const [
      total,
      previousTotal,
      today,
      topForms,
      daily,
      dailyPrevious,
      recent,
      ga4,
    ] = await Promise.all([
      countRange(fromIso, toExclusiveIso),
      countRange(prevFromIso, prevToIso),
      countRange(startOfUtcDay().toISOString(), periodBounds(0).toExclusiveIso),
      getSubmissionStats(fromIso, toExclusiveIso),
      dailyRange(fromIso, toExclusiveIso),
      dailyRange(prevFromIso, prevToIso),
      getRecentSubmissions(8, fromIso, toExclusiveIso, formId || null),
      fetchGa4Metrics(days),
    ]);

    const top = [...topForms].sort((a, b) => b.count - a.count).slice(0, 5);
    const comparison = buildComparison(total, previousTotal);
    const avgPerDay = days > 0 ? Math.round((total / days) * 10) / 10 : 0;

    const periodLabels = {
      7: 'Últimos 7 dias',
      30: 'Últimos 30 dias',
      90: 'Últimos 90 dias',
    };

    return json(res, 200, {
      period: {
        days,
        from: fromIso,
        to: toIso,
        label: periodLabels[days] || `Últimos ${days} dias`,
      },
      formId: formId || null,
      counts: {
        total,
        today,
        avgPerDay,
      },
      comparison,
      topForms: top,
      daily,
      dailyPrevious,
      recent,
      ga4,
    });
  } catch (err) {
    console.error('dashboard', err);
    return json(res, 500, { error: 'Erro ao carregar dashboard.' });
  }
}
