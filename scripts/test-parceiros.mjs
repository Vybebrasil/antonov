import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  slugify,
  isValidSlug,
  computeContractStatus,
  computeCampaignStatus,
  computePaymentStatus,
  computeMetrics,
  computeProrataAdjustment,
  safeRate,
  variationPct,
  comparePartnerPriority,
  goTargetUrl,
  eventTypeForChannel,
  sanitizeServices,
  parseWarnDays,
  parsePeriod,
  hasPhysicalLocation,
  canShowOnHome,
  whatsappUrl,
  instagramUrl,
  buildContractExpiryMessage,
  addMonths,
  toDateInput,
} from '../api/_lib/parceiros-logic.js';
import { hasPermission } from '../api/_lib/parceiros-auth.js';
import { normalizeEvent } from '../api/_lib/parceiros-analytics.js';

describe('slug e validação', () => {
  it('gera slug sem acento', () => {
    assert.equal(slugify('Marina Dourado'), 'marina-dourado');
    assert.equal(slugify('Estética & Saúde'), 'estetica-saude');
  });
  it('bloqueia slugs reservados', () => {
    assert.equal(isValidSlug('admin'), false);
    assert.equal(isValidSlug('parceiros'), false);
    assert.equal(isValidSlug('marina-dourado'), true);
  });
});

describe('status de contrato', () => {
  const now = new Date('2026-08-18T12:00:00-03:00');
  it('marca vencido depois da data final', () => {
    assert.equal(computeContractStatus({ starts_on: '2026-01-01', ends_on: '2026-08-01' }, now), 'vencido');
  });
  it('marca vencendo dentro da janela', () => {
    assert.equal(computeContractStatus({ starts_on: '2026-01-01', ends_on: '2026-09-01' }, now, [30, 15, 7]), 'vencendo');
  });
  it('mantém cancelado', () => {
    assert.equal(computeContractStatus({ status: 'cancelado', starts_on: '2026-01-01', ends_on: '2026-12-01' }, now), 'cancelado');
  });
  it('pendente antes do início', () => {
    assert.equal(computeContractStatus({ starts_on: '2026-09-01', ends_on: '2027-09-01' }, now), 'pendente');
  });
});

describe('pró-rata de troca de plano', () => {
  it('calcula ajuste de upgrade no meio do período', () => {
    const r = computeProrataAdjustment({
      oldAmount: 390,
      newAmount: 990,
      startsOn: '2026-01-01',
      endsOn: '2026-12-31',
      changeOn: '2026-07-01',
    });
    assert.equal(r.direction, 'upgrade');
    assert.ok(r.adjustment > 0);
    assert.ok(r.remaining_days > 0);
  });
  it('calcula crédito em downgrade', () => {
    const r = computeProrataAdjustment({
      oldAmount: 990,
      newAmount: 390,
      startsOn: '2026-01-01',
      endsOn: '2026-12-31',
      changeOn: '2026-07-01',
    });
    assert.equal(r.direction, 'downgrade');
    assert.ok(r.adjustment < 0);
  });
  it('monta mensagem de vencimento', () => {
    const msg = buildContractExpiryMessage({
      partnerName: 'Marina',
      planName: 'Premium',
      endsOn: '2026-09-01',
      daysLeft: 7,
      amount: 990,
    });
    assert.match(msg, /Marina/);
    assert.match(msg, /7 dia/);
  });
  it('addMonths preserva ciclo', () => {
    assert.equal(toDateInput(addMonths('2026-01-15', 12)), '2027-01-15');
  });
});
describe('campanhas por período', () => {
  const now = new Date('2026-08-18T12:00:00-03:00');
  it('finaliza automaticamente após a data', () => {
    assert.equal(computeCampaignStatus({ status: 'ativa', starts_on: '2026-07-01', ends_on: '2026-08-01' }, now), 'finalizada');
  });
  it('agenda antes do início', () => {
    assert.equal(computeCampaignStatus({ status: 'ativa', starts_on: '2026-09-01', ends_on: '2026-10-01' }, now), 'agendada');
  });
  it('respeita pausa manual', () => {
    assert.equal(computeCampaignStatus({ status: 'pausada', starts_on: '2026-07-01', ends_on: '2026-12-01' }, now), 'pausada');
  });
});

describe('métricas', () => {
  it('calcula CTR e protege divisão por zero', () => {
    assert.equal(computeMetrics({ impressions: 200, clicks: 10, profile_views: 8, leads: 2 }).ctr, 5);
    assert.equal(safeRate(10, 0), 0);
    assert.equal(computeMetrics({}).lead_rate, 0);
  });
  it('calcula variação contra o período anterior', () => {
    assert.equal(variationPct(150, 100), 50);
    assert.equal(variationPct(10, 0), 100);
  });
  it('pagamento atrasado', () => {
    assert.equal(computePaymentStatus({
      contracted_amount: 100,
      received_amount: 0,
      due_on: '2026-08-01',
      status: 'pendente',
    }, new Date('2026-08-18')), 'atrasado');
  });
});

describe('prioridade de exposição', () => {
  it('campanha ativa vence plano e ordem manual', () => {
    const a = { id: 1, has_active_campaign: false, plan_priority: 100, priority: 100, sort_order: 1 };
    const b = { id: 2, has_active_campaign: true, plan_priority: 10, priority: 0, sort_order: 99 };
    assert.ok(comparePartnerPriority(b, a) < 0);
  });
});

describe('links rastreados', () => {
  const partner = {
    whatsapp: '74999000000',
    instagram: '@exemplo_marina',
    website: 'antonovcenter.com.br',
    maps_url: 'https://maps.app.goo.gl/rbhgwPvZnJfMyKkB9',
  };
  it('monta destinos por canal', () => {
    assert.equal(goTargetUrl(partner, 'whatsapp'), 'https://wa.me/5574999000000');
    assert.equal(goTargetUrl(partner, 'instagram'), 'https://www.instagram.com/exemplo_marina');
    assert.match(goTargetUrl(partner, 'website'), /https:\/\/antonovcenter\.com\.br/);
    assert.equal(eventTypeForChannel('whatsapp'), 'whatsapp_click');
  });
  it('helpers de URL', () => {
    assert.equal(whatsappUrl('74 99900-0000'), 'https://wa.me/5574999000000');
    assert.equal(instagramUrl('foo'), 'https://www.instagram.com/foo');
  });
});

describe('serviços e visibilidade', () => {
  it('limita a 6 serviços', () => {
    const list = sanitizeServices(Array.from({ length: 9 }, (_, i) => ({ name: `S${i + 1}` })));
    assert.equal(list.length, 6);
  });
  it('esconde parceiro expirado da home', () => {
    assert.equal(canShowOnHome({ status: 'expirado', show_on_home: true }), false);
    assert.equal(canShowOnHome({ status: 'ativo', show_on_home: true }), true);
  });
  it('esconde localização sem endereço', () => {
    assert.equal(hasPhysicalLocation({ city: '' }), false);
    assert.equal(hasPhysicalLocation({ city: 'Irecê' }), true);
  });
});

describe('permissões', () => {
  it('financeiro não edita campanhas', () => {
    const fin = { role: 'financeiro' };
    assert.equal(hasPermission(fin, 'finance.read'), true);
    assert.equal(hasPermission(fin, 'campaigns.write'), false);
    assert.equal(hasPermission({ role: 'super_admin' }, 'users.write'), true);
    assert.equal(hasPermission({ role: 'marketing' }, 'partners.write'), true);
    assert.equal(hasPermission({ role: 'marketing' }, 'finance.write'), false);
  });
});

describe('eventos de analytics', () => {
  it('rejeita tipo inválido e aceita impression', () => {
    assert.equal(normalizeEvent({ event_type: 'foo', session_id: 'abcdefghij' }).error, 'Tipo de evento inválido.');
    const ok = normalizeEvent({ event_type: 'partner_impression', session_id: 'abcdefghij', partner_id: 1 });
    assert.equal(ok.value.event_type, 'partner_impression');
  });
});

describe('período', () => {
  it('aceita 7/30/90 e personalizado', () => {
    const p = parsePeriod({ days: 7 }, new Date('2026-08-18T12:00:00Z'));
    assert.equal(p.days, 7);
    const c = parsePeriod({ from: '2026-08-01', to: '2026-08-10' });
    assert.equal(c.days, 10);
  });
  it('parseia janela de vencimento', () => {
    assert.deepEqual(parseWarnDays('30,15,7'), [30, 15, 7]);
  });
});
