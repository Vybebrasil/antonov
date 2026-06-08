import * as jose from 'jose';

export const GA4_MEASUREMENT_ID = 'G-SXNR4ZH6Y5';

export const GA4_TRACKED_EVENTS = [
  {
    key: 'assinar_first_class_mensal',
    label: 'Checkout mensal',
    description: 'Clique em assinar First Class (mensal)',
  },
  {
    key: 'assinar_first_class_anual',
    label: 'Checkout anual',
    description: 'Clique em assinar First Class (anual)',
  },
];

const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export function ga4EnvStatus() {
  const missing = [];
  if (!process.env.GA4_PROPERTY_ID) missing.push('GA4_PROPERTY_ID');
  if (!process.env.GA4_CLIENT_EMAIL) missing.push('GA4_CLIENT_EMAIL');
  if (!process.env.GA4_PRIVATE_KEY) missing.push('GA4_PRIVATE_KEY');
  return { configured: missing.length === 0, missing };
}

export function isGa4Configured() {
  return ga4EnvStatus().configured;
}

function privateKeyPem() {
  return String(process.env.GA4_PRIVATE_KEY || '').replace(/\\n/g, '\n');
}

async function getAccessToken() {
  const email = process.env.GA4_CLIENT_EMAIL;
  const key = await jose.importPKCS8(privateKeyPem(), 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new jose.SignJWT({ scope: GA4_SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(email)
    .setSubject(email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Falha na autenticação GA4');
  }
  return data.access_token;
}

async function runReport(body) {
  const propertyId = process.env.GA4_PROPERTY_ID;
  const token = await getAccessToken();
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'Erro ao consultar GA4');
  }
  return data;
}

function gaDateRanges(days) {
  return [
    { startDate: `${days}daysAgo`, endDate: 'today', name: 'current' },
    { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo`, name: 'previous' },
  ];
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function deltaPct(current, previous) {
  const delta = current - previous;
  if (previous > 0) return { delta, deltaPct: Math.round((delta / previous) * 100) };
  if (current > 0) return { delta, deltaPct: 100 };
  return { delta: 0, deltaPct: 0 };
}

function metricPair(report, metricIndex) {
  const rows = report?.rows || [];
  const current = num(rows[0]?.metricValues?.[metricIndex]?.value);
  const previous = num(rows[1]?.metricValues?.[metricIndex]?.value);
  return { value: current, previous, ...deltaPct(current, previous) };
}

function gaDayToIso(gaDate) {
  const s = String(gaDate || '');
  if (s.length !== 8) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function eventMeta(name) {
  return GA4_TRACKED_EVENTS.find((e) => e.key === name) || {
    key: name,
    label: name,
    description: '',
  };
}

function buildSetupPayload() {
  const { missing } = ga4EnvStatus();
  return {
    configured: false,
    missingEnv: missing,
    measurementId: GA4_MEASUREMENT_ID,
    propertyId: process.env.GA4_PROPERTY_ID || null,
    url: 'https://analytics.google.com/',
    lookerEmbedUrl: process.env.GA4_LOOKER_EMBED_URL || null,
    trackedEvents: GA4_TRACKED_EVENTS,
    setupSteps: [
      'No Google Cloud, crie uma service account e baixe a chave JSON.',
      'Ative a API "Google Analytics Data API" no projeto.',
      'Em GA4 → Admin → Acesso à propriedade, adicione o e-mail da service account como Leitor.',
      'No Vercel, configure GA4_PROPERTY_ID (numérico), GA4_CLIENT_EMAIL e GA4_PRIVATE_KEY.',
      'Opcional: GA4_LOOKER_EMBED_URL com um relatório Looker Studio publicado.',
    ],
    hint: 'Conecte o GA4 para ver usuários, sessões, páginas mais visitadas e cliques nos planos.',
  };
}

export async function fetchGa4Metrics(days = 30) {
  if (!isGa4Configured()) return buildSetupPayload();

  const propertyId = process.env.GA4_PROPERTY_ID;
  const eventKeys = GA4_TRACKED_EVENTS.map((e) => e.key);
  const ranges = gaDateRanges(days);

  try {
    const [overviewReport, eventsReport, dailyReport, pagesReport] = await Promise.all([
      runReport({
        dateRanges: ranges,
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
        ],
      }),
      runReport({
        dateRanges: [ranges[0]],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            inListFilter: { values: eventKeys },
          },
        },
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      }),
      runReport({
        dateRanges: [ranges[0]],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
      runReport({
        dateRanges: [ranges[0]],
        dimensions: [{ name: 'pagePath' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'activeUsers' },
        ],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 5,
      }),
    ]);

    const activeUsers = metricPair(overviewReport, 0);
    const sessions = metricPair(overviewReport, 1);
    const pageViews = metricPair(overviewReport, 2);

    const eventCounts = new Map(eventKeys.map((k) => [k, 0]));
    for (const row of eventsReport?.rows || []) {
      const name = row.dimensionValues?.[0]?.value;
      if (eventCounts.has(name)) {
        eventCounts.set(name, num(row.metricValues?.[0]?.value));
      }
    }

    const checkoutTotal = eventKeys.reduce((sum, key) => sum + (eventCounts.get(key) || 0), 0);
    const conversionRate = sessions.value > 0
      ? Math.round((checkoutTotal / sessions.value) * 1000) / 10
      : 0;

    const dailySessions = (dailyReport?.rows || []).map((row) => ({
      day: gaDayToIso(row.dimensionValues?.[0]?.value),
      count: num(row.metricValues?.[0]?.value),
    }));

    const topPages = (pagesReport?.rows || []).map((row) => ({
      path: row.dimensionValues?.[0]?.value || '/',
      views: num(row.metricValues?.[0]?.value),
      users: num(row.metricValues?.[1]?.value),
    }));

    return {
      configured: true,
      measurementId: GA4_MEASUREMENT_ID,
      propertyId,
      url: `https://analytics.google.com/analytics/web/#/p${propertyId}/reports/intelligenthome`,
      lookerEmbedUrl: process.env.GA4_LOOKER_EMBED_URL || null,
      overview: {
        activeUsers,
        sessions,
        pageViews,
        checkoutClicks: checkoutTotal,
        conversionRate,
      },
      events: eventKeys.map((key) => {
        const meta = eventMeta(key);
        return {
          key,
          label: meta.label,
          description: meta.description,
          count: eventCounts.get(key) || 0,
        };
      }),
      dailySessions,
      topPages,
      hint: 'Métricas do site público (GA4). Leads de formulário aparecem nos cards acima.',
    };
  } catch (err) {
    console.error('ga4 metrics', err);
    return {
      ...buildSetupPayload(),
      configured: true,
      error: err.message || 'Não foi possível carregar métricas do GA4.',
    };
  }
}
