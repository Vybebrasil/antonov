import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  addDays,
  airBlockReason,
  aspectWarning,
  buildProgram,
  estimateFromPublications,
  operatingMs,
  pictureOverSpec,
  pageDurationMs,
  playlistHash,
  programSchedule,
  selectOnAir,
  todayInBahia,
} from '../api/_lib/telao-playlist.js';

const creative = (overrides) => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Oferta',
  kind: 'PICTURE',
  public_url: 'https://cdn.example/a.jpg',
  size_bytes: 1000,
  md5: 'abc123abc123abc123abc123abc123ab',
  duration_ms: 10000,
  position: 0,
  active: true,
  approved: true,
  institutional: false,
  contrato_id: 1,
  contrato_status: 'ativo',
  contrato_starts: '2026-10-01',
  contrato_ends: '2026-10-31',
  insercoes_por_ciclo: 1,
  starts_on: null,
  ends_on: null,
  deleted_at: null,
  ...overrides,
});

describe('fuso da Bahia', () => {
  it('ainda é o dia anterior às 23h59 locais', () => {
    assert.equal(todayInBahia(new Date('2026-10-09T02:59:00Z')), '2026-10-08');
    assert.equal(todayInBahia(new Date('2026-10-09T03:00:00Z')), '2026-10-09');
  });
  it('soma dias e meses no calendário', () => {
    assert.equal(addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(addDays('2026-10-09', 7), '2026-10-16');
  });
});

describe('playlist do telão', () => {
  const today = '2026-10-09';

  it('deixa de fora contrato vencido, criativo sem aprovação e período futuro', () => {
    assert.equal(airBlockReason(creative({ contrato_ends: '2026-10-08' }), today), 'contrato encerrado');
    assert.equal(airBlockReason(creative({ approved: false }), today), 'aguardando aprovação');
    assert.equal(airBlockReason(creative({ starts_on: '2026-10-10' }), today), 'ainda não começou');
    assert.equal(airBlockReason(creative({}), today), null);
  });

  it('repete o anúncio pelas inserções e não mistura institucional', () => {
    const selected = selectOnAir([
      creative({ insercoes_por_ciclo: 2, position: 1 }),
      creative({
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Marca',
        institutional: true,
        contrato_id: null,
        position: 0,
      }),
    ], today, { institutionalFallback: false });
    assert.equal(selected.fallback, false);
    assert.deepEqual(selected.pages.map((page) => page.name), ['Oferta', 'Oferta', 'Marca']);
  });

  it('coloca cada anunciante o número de vezes por hora e completa a hora', () => {
    const selected = selectOnAir([
      creative({ insercoes_por_ciclo: 2, duration_ms: 10000 }),
      creative({
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Marca',
        institutional: true,
        contrato_id: null,
        duration_ms: 10000,
      }),
    ], today);
    const ads = selected.pages.filter((page) => page.name === 'Oferta');
    assert.equal(ads.length, 2);
    const total = selected.pages.reduce((sum, page) => sum + pageDurationMs(page), 0);
    assert.ok(Math.abs(total - 3_600_000) < 2000);
    assert.equal(selected.note, '');
  });

  it('usa o institucional quando não há anúncio válido', () => {
    const selected = selectOnAir([
      creative({ approved: false }),
      creative({
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Marca',
        institutional: true,
        contrato_id: null,
      }),
    ], today);
    assert.equal(selected.fallback, true);
    assert.equal(selected.pages.length, 1);
    assert.equal(selected.pages[0].name, 'Marca');
  });

  it('monta uma página por criativo e manda a duração real do vídeo', () => {
    const pages = [
      creative({}),
      creative({ id: 'v', name: 'Filme', kind: 'VIDEO', duration_ms: 8000, position: 1 }),
    ];
    const program = buildProgram(pages, 'player-1', today);
    assert.equal(program.playerIds[0], 'player-1');
    assert.equal(program.schedule.startDate, today);
    assert.equal(program.pages.length, 2);
    assert.equal(program.pages[0].widgets.length, 1);
    assert.equal(program.pages[0].widgets[0].duration, 10000);
    assert.equal(program.pages[0].widgets[0].layout.width, '100%');
    assert.equal(program.pages[1].widgets[0].duration, 8000);
    assert.equal(program.pages[1].widgets[0].inAnimation, undefined);
    assert.equal(playlistHash(pages), playlistHash(pages));
    assert.notEqual(playlistHash(pages), playlistHash(pages.slice(0, 1)));
  });

  it('inclui o institucional junto do anúncio quando o fallback está desligado', () => {
    const selected = selectOnAir([
      creative({}),
      creative({ id: 'i', name: 'Marca', institutional: true, position: 1 }),
    ], today, { institutionalFallback: false });
    assert.equal(selected.fallback, false);
    assert.deepEqual(selected.pages.map((page) => page.name), ['Oferta', 'Marca']);
  });

  it('aplica dias e horário da configuração na grade enviada ao player', () => {
    const pages = [creative({})];
    const schedule = programSchedule({
      open_time: '08:00:00',
      close_time: '22:00:00',
      week_days: '1,2,3,4,5',
    });
    const program = buildProgram(pages, 'player-1', today, schedule);
    assert.deepEqual(program.schedule.plans[0].weekDays, [1, 2, 3, 4, 5]);
    assert.equal(program.schedule.plans[0].startTime, '08:00:00');
    assert.equal(program.schedule.plans[0].endTime, '22:00:00');
    assert.notEqual(playlistHash(pages), playlistHash(pages, schedule));
  });

  it('recusa imagem mais larga que o player consegue exibir', () => {
    assert.equal(pictureOverSpec(2720, 1530), 'A imagem tem 2720×1530. O player só exibe até 2160×4096 e não troca a tela.');
    assert.equal(pictureOverSpec(1920, 1080), '');
  });

  it('avisa quando a peça não é quadrada', () => {
    assert.equal(aspectWarning(800, 400), 'Proporção 800×400. O telão é 400×400.');
    assert.equal(aspectWarning(800, 800), 'Tamanho 800×800. O ideal é 400×400.');
    assert.equal(aspectWarning(400, 400), '');
  });
});

describe('estimativa de exibição', () => {
  it('conta ciclos só dentro do horário de funcionamento', () => {
    const ms = operatingMs(
      Date.parse('2026-10-09T12:00:00-03:00'),
      Date.parse('2026-10-09T13:00:00-03:00'),
      '06:00:00',
      '23:00:00',
    );
    assert.equal(ms, 3600000);
    const rows = estimateFromPublications([
      {
        created_at: '2026-10-09T15:00:00.000Z',
        labels: [{ id: 'a', name: 'Oferta', kind: 'PICTURE', duration_ms: 10000, cliente_id: 7, cliente_name: 'Loja' }],
      },
    ], {
      from: '2026-10-09',
      to: '2026-10-09',
      now: Date.parse('2026-10-09T16:00:00.000Z'),
    });
    assert.equal(rows[0].insertions, 360);
    assert.equal(rows[0].cliente_id, 7);
  });

  it('ignora outro cliente e marca vídeo sem duração como estimativa', () => {
    const rows = estimateFromPublications([
      {
        created_at: '2026-10-09T15:00:00.000Z',
        labels: [{ id: 'v', name: 'Filme', kind: 'VIDEO', duration_ms: 0, cliente_id: 3 }],
      },
    ], {
      from: '2026-10-09',
      to: '2026-10-09',
      clienteId: 9,
      now: Date.parse('2026-10-09T16:00:00.000Z'),
    });
    assert.equal(rows.length, 0);
  });
});

describe('MD5 no navegador', () => {
  const context = {};
  vm.runInNewContext(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'admin-md5.js'), 'utf8'), context);

  it('bate com o MD5 do Node', () => {
    for (const sample of ['', 'abc', 'Antonov', 'a'.repeat(1000)]) {
      const bytes = Buffer.from(sample);
      assert.equal(context.telaoMd5Hex(bytes), createHash('md5').update(bytes).digest('hex'));
    }
  });
});
