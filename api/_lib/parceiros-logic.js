/** Funções puras do módulo Parceiros — testáveis sem banco. */

export const PARTNER_STATUSES = ['rascunho', 'ativo', 'pausado', 'expirado', 'arquivado'];
export const PUBLIC_PARTNER_STATUSES = ['ativo'];
export const CATEGORY_STATUSES = ['ativa', 'arquivada'];
export const PLAN_STATUSES = ['ativo', 'arquivado'];
export const CONTRACT_STATUSES = ['ativo', 'pendente', 'vencendo', 'vencido', 'cancelado'];
export const CAMPAIGN_STATUSES = ['rascunho', 'agendada', 'ativa', 'pausada', 'finalizada'];
export const PAYMENT_STATUSES = ['pago', 'pendente', 'atrasado', 'cancelado'];
export const USER_ROLES = ['super_admin', 'admin_antonov', 'marketing', 'financeiro', 'parceiro'];
export const GO_CHANNELS = ['whatsapp', 'instagram', 'maps', 'website'];
export const EVENT_TYPES = [
  'partner_impression',
  'partner_card_click',
  'partner_profile_view',
  'whatsapp_click',
  'instagram_click',
  'maps_click',
  'website_click',
  'category_view',
  'service_click',
];
export const LEAD_EVENTS = new Set(['whatsapp_click']);
export const CLICK_EVENTS = new Set([
  'partner_card_click',
  'whatsapp_click',
  'instagram_click',
  'maps_click',
  'website_click',
  'service_click',
]);
export const MAX_SERVICES = 6;
export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const DEFAULT_PLACEMENTS = [
  { code: 'HOME_PARTNERS_CAROUSEL', name: 'Carrossel da Home', description: 'Linhas de logos na seção Ecossistema Antonov' },
  { code: 'HOME_PARTNERS_FEATURED', name: 'Destaque na Home', description: 'Parceiros em destaque na Home' },
  { code: 'PARTNERS_FEATURED', name: 'Destaque no grid', description: 'Cards em destaque em /parceiros' },
  { code: 'CATEGORY_FEATURED', name: 'Destaque na categoria', description: 'Prioridade dentro da categoria' },
  { code: 'PARTNER_GRID_PRIORITY', name: 'Prioridade no grid', description: 'Ordem privilegiada no grid geral' },
  { code: 'HOME_BANNER', name: 'Banner da Home', description: 'Posição publicitária na Home' },
  { code: 'PARTNER_CATEGORY_BANNER', name: 'Banner de categoria', description: 'Banner na listagem filtrada' },
];

export const DEFAULT_PLANS = [
  {
    name: 'Base',
    slug: 'base',
    description: 'Presença no ecossistema Antonov.',
    priority: 10,
    price: 390,
    benefits: [
      'Perfil público',
      'Presença no grid',
      'Carrossel da Home',
      'Relatório básico',
    ],
  },
  {
    name: 'Destaque',
    slug: 'destaque',
    description: 'Prioridade no grid e nas categorias.',
    priority: 50,
    price: 690,
    benefits: [
      'Tudo do plano Base',
      'Destaque no grid',
      'Prioridade maior',
      'Destaque em categoria',
    ],
  },
  {
    name: 'Premium',
    slug: 'premium',
    description: 'Máxima exposição e posições publicitárias.',
    priority: 100,
    price: 990,
    benefits: [
      'Tudo do plano Destaque',
      'Posições publicitárias',
      'Banner',
      'Prioridade máxima',
    ],
  },
];

const RESERVED = new Set([
  'admin', 'api', 'planos', 'contato', 'sobre', 'form', 'forms', 'index', 'assets',
  'parceiros', 'go', 'partner', 'login', 'logout', 'sitemap', 'robots',
]);

export function slugify(text, fallback = 'parceiro') {
  const s = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (!s || RESERVED.has(s)) return fallback;
  return s;
}

export function isValidSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug || '')) && !RESERVED.has(slug);
}

export function parseWarnDays(value, fallback = [30, 15, 7]) {
  const parts = String(value || '')
    .split(/[,\s]+/)
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return parts.length ? [...new Set(parts)].sort((a, b) => b - a) : fallback;
}

export function startOfDay(date) {
  if (typeof date === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim());
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = date instanceof Date ? new Date(date) : new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function daysBetween(from, to) {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.round((b - a) / 86400000);
}

export function addMonths(date, months) {
  const d = startOfDay(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + Number(months || 0));
  if (d.getDate() < day) d.setDate(0);
  return d;
}

export function toDateInput(date) {
  const d = startOfDay(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Pró-rata de troca de plano no meio do período. adjustment > 0 = cobrar; < 0 = crédito. */
export function computeProrataAdjustment({
  oldAmount,
  newAmount,
  startsOn,
  endsOn,
  changeOn = new Date(),
} = {}) {
  const total = Math.max(1, daysBetween(startsOn, endsOn));
  const remaining = Math.max(0, daysBetween(changeOn, endsOn));
  const used = Math.max(0, total - remaining);
  const oldDaily = (Number(oldAmount) || 0) / total;
  const newDaily = (Number(newAmount) || 0) / total;
  const oldCredit = roundMoney(oldDaily * remaining);
  const newCharge = roundMoney(newDaily * remaining);
  const adjustment = roundMoney(newCharge - oldCredit);
  let direction = 'same';
  if (adjustment > 0) direction = 'upgrade';
  else if (adjustment < 0) direction = 'downgrade';
  return {
    total_days: total,
    remaining_days: remaining,
    used_days: used,
    old_credit: oldCredit,
    new_charge: newCharge,
    adjustment,
    direction,
  };
}

export function buildContractExpiryMessage({
  partnerName,
  planName,
  endsOn,
  daysLeft,
  amount,
} = {}) {
  const name = String(partnerName || 'Parceiro').trim();
  const plan = String(planName || 'plano').trim();
  const end = String(endsOn || '').slice(0, 10);
  const days = Number(daysLeft);
  const daysLabel = Number.isFinite(days)
    ? (days <= 0 ? 'venceu' : `vence em ${days} dia${days === 1 ? '' : 's'}`)
    : 'está próximo do vencimento';
  const value = Number.isFinite(Number(amount))
    ? ` Valor atual: R$ ${roundMoney(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`
    : '';
  return `Olá! O contrato de ${name} (${plan}) ${daysLabel} (${end}).${value} Podemos renovar?`;
}

export function mailtoExpiryUrl({ email, subject, body }) {
  const to = String(email || '').trim();
  if (!to || !to.includes('@')) return null;
  const q = new URLSearchParams();
  if (subject) q.set('subject', subject);
  if (body) q.set('body', body);
  return `mailto:${encodeURIComponent(to)}?${q.toString()}`;
}

export function whatsappMessageUrl(phone, text) {
  const base = whatsappUrl(phone);
  if (!base) return null;
  const msg = String(text || '').trim();
  if (!msg) return base;
  return `${base}?text=${encodeURIComponent(msg)}`;
}

export function computeContractStatus(contract, now = new Date(), warnDays = [30, 15, 7]) {
  if (contract?.status === 'cancelado') return 'cancelado';
  if (!contract?.starts_on || !contract?.ends_on) return contract?.status || 'pendente';
  const today = startOfDay(now);
  const start = startOfDay(contract.starts_on);
  const end = startOfDay(contract.ends_on);
  if (today > end) return 'vencido';
  if (today < start) return 'pendente';
  const left = daysBetween(today, end);
  const maxWarn = Math.max(...warnDays);
  if (left <= maxWarn) return 'vencendo';
  return 'ativo';
}

export function computeCampaignStatus(campaign, now = new Date()) {
  if (!campaign) return 'rascunho';
  if (campaign.status === 'pausada' || campaign.status === 'rascunho') return campaign.status;
  const today = startOfDay(now);
  if (campaign.ends_on && today > startOfDay(campaign.ends_on)) return 'finalizada';
  if (campaign.starts_on && today < startOfDay(campaign.starts_on)) return 'agendada';
  return 'ativa';
}

export function computePaymentStatus(payment, now = new Date()) {
  if (!payment) return 'pendente';
  if (payment.status === 'cancelado' || payment.status === 'pago') return payment.status;
  const contracted = Number(payment.contracted_amount) || 0;
  const received = Number(payment.received_amount) || 0;
  if (received >= contracted && contracted > 0) return 'pago';
  if (payment.due_on && startOfDay(now) > startOfDay(payment.due_on) && received < contracted) {
    return 'atrasado';
  }
  return 'pendente';
}

export function safeRate(numerator, denominator) {
  const n = Number(numerator) || 0;
  const d = Number(denominator) || 0;
  if (d <= 0) return 0;
  return (n / d) * 100;
}

export function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

export function computeMetrics(totals = {}) {
  const impressions = Number(totals.impressions) || 0;
  const clicks = Number(totals.clicks) || 0;
  const profileViews = Number(totals.profile_views) || 0;
  const leads = Number(totals.leads) || 0;
  return {
    impressions,
    clicks,
    profile_views: profileViews,
    leads,
    whatsapp: Number(totals.whatsapp) || 0,
    instagram: Number(totals.instagram) || 0,
    maps: Number(totals.maps) || 0,
    website: Number(totals.website) || 0,
    ctr: round1(safeRate(clicks, impressions)),
    interest_rate: round1(safeRate(profileViews, impressions)),
    lead_rate: round1(safeRate(leads, profileViews)),
  };
}

export function variationPct(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return c === 0 ? 0 : 100;
  return round1(((c - p) / p) * 100);
}

export function comparePartnerPriority(a, b, rotationSeed = 0) {
  const campA = Number(a.campaign_priority) || (a.has_active_campaign ? 1 : 0);
  const campB = Number(b.campaign_priority) || (b.has_active_campaign ? 1 : 0);
  if (campB !== campA) return campB - campA;
  const planA = Number(a.plan_priority) || 0;
  const planB = Number(b.plan_priority) || 0;
  if (planB !== planA) return planB - planA;
  const priA = Number(a.priority) || 0;
  const priB = Number(b.priority) || 0;
  if (priB !== priA) return priB - priA;
  const ordA = Number(a.sort_order) || 0;
  const ordB = Number(b.sort_order) || 0;
  if (ordA !== ordB) return ordA - ordB;
  const idA = Number(a.id) || 0;
  const idB = Number(b.id) || 0;
  return ((idA + rotationSeed) % 997) - ((idB + rotationSeed) % 997);
}

export function rotationSeedFromDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86400000);
}

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export function whatsappUrl(phone) {
  const digits = digitsOnly(phone);
  if (digits.length < 10) return null;
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

export function instagramUrl(handle) {
  const h = String(handle || '').trim();
  if (!h) return null;
  if (/^https?:\/\//i.test(h)) return h;
  const user = h.replace(/^@/, '').replace(/\/+$/, '');
  if (!user) return null;
  return `https://www.instagram.com/${user}`;
}

export function websiteUrl(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}

export function mapsUrl(partner) {
  if (!partner) return null;
  const direct = String(partner.maps_url || '').trim();
  if (direct) return /^https?:\/\//i.test(direct) ? direct : `https://${direct}`;
  const parts = [partner.address, partner.neighborhood, partner.city, partner.state, partner.postal_code]
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
}

export function goTargetUrl(partner, channel) {
  if (!partner || !GO_CHANNELS.includes(channel)) return null;
  if (channel === 'whatsapp') return whatsappUrl(partner.whatsapp);
  if (channel === 'instagram') return instagramUrl(partner.instagram);
  if (channel === 'website') return websiteUrl(partner.website);
  if (channel === 'maps') return mapsUrl(partner);
  return null;
}

export function eventTypeForChannel(channel) {
  const map = {
    whatsapp: 'whatsapp_click',
    instagram: 'instagram_click',
    maps: 'maps_click',
    website: 'website_click',
  };
  return map[channel] || null;
}

export function hasPhysicalLocation(partner) {
  if (!partner) return false;
  return Boolean(
    String(partner.address || '').trim()
    || String(partner.city || '').trim()
    || String(partner.maps_url || '').trim()
  );
}

export function sanitizeServices(list) {
  const items = Array.isArray(list) ? list : [];
  const out = [];
  for (const item of items) {
    const name = String(item?.name ?? item ?? '').trim();
    if (!name) continue;
    out.push({
      name: name.slice(0, 80),
      sort_order: Number.isFinite(Number(item?.sort_order)) ? Number(item.sort_order) : out.length,
    });
    if (out.length >= MAX_SERVICES) break;
  }
  return out;
}

export function parsePeriod(query = {}, now = new Date()) {
  const customFrom = query.from || query.date_from;
  const customTo = query.to || query.date_to;
  if (customFrom && customTo) {
    const from = startOfDay(customFrom);
    const to = startOfDay(customTo);
    to.setHours(23, 59, 59, 999);
    if (from > to) return { error: 'Período inválido.' };
    const days = Math.max(1, daysBetween(from, to) + 1);
    const prevTo = addDays(from, -1);
    prevTo.setHours(23, 59, 59, 999);
    const prevFrom = addDays(from, -days);
    return { from, to, prevFrom, prevTo, days, label: 'personalizado' };
  }
  const days = [7, 30, 90].includes(Number(query.days)) ? Number(query.days) : 30;
  const to = new Date(now);
  const from = addDays(startOfDay(now), -(days - 1));
  const prevTo = addDays(from, -1);
  prevTo.setHours(23, 59, 59, 999);
  const prevFrom = addDays(from, -days);
  return { from, to, prevFrom, prevTo, days, label: `${days} dias` };
}

export function isPublicPartnerStatus(status) {
  return PUBLIC_PARTNER_STATUSES.includes(status);
}

export function schemaTypeForProfession(profession) {
  const p = String(profession || '').toLowerCase();
  if (/m[eé]dic|dermatolog|endocrin/.test(p)) return 'Physician';
  if (/fisioter/.test(p)) return 'LocalBusiness';
  if (/nutri/.test(p)) return 'Person';
  if (/personal|treinador/.test(p)) return 'Person';
  if (/est[eé]tic|cl[ií]nica/.test(p)) return 'LocalBusiness';
  return 'Person';
}

export function pendingAmount(contracted, received) {
  return Math.max(0, (Number(contracted) || 0) - (Number(received) || 0));
}

export function canShowOnHome(partner) {
  return Boolean(
    partner
    && isPublicPartnerStatus(partner.status)
    && partner.show_on_home
    && !partner.deleted_at
  );
}
