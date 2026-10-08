'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../script.js');
const fx = require('./fixtures/swisseph.json');

const UFA = { name: 'Уфа', admin1: 'Башкортостан', country: 'Россия', timezone: 'Asia/Yekaterinburg', latitude: 54.74, longitude: 55.97 };
const NYC = { name: 'New York', timezone: 'America/New_York', latitude: 40.71, longitude: -74.0 };
const NOW = Date.UTC(2026, 9, 7, 12, 0);
const base = (o) => ({ unknownTime: false, now: NOW, ...o });
const err = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const diff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

describe('computeChart(): известное время', () => {
  test('момент и результаты совпадают с эталоном (Уфа, 20 мая 2001, 10:30 местного = 04:30 UTC)', () => {
    const ref = fx.cases.find((c) => c.name === 'ufa-2001');
    const c = A.computeChart(base({ date: '2001-05-20', time: '10:30', place: UFA }));
    assert.equal(c.ts, Date.parse(ref.utc));
    assert.equal(c.timeKnown, true);
    assert.ok(diff(c.asc, ref.asc) < 0.03 && diff(c.mc, ref.mc) < 0.03);
    for (const p of c.planets.filter((x) => x.key !== 'asc')) assert.ok(diff(p.lon, ref.planets[p.key]) < 0.1, p.key);
    assert.equal(c.system, 'Плацидус');
  });
  test('11 тел с Асцендентом, у каждого планеты есть дом, у Асцендента нет', () => {
    const c = A.computeChart(base({ date: '2001-05-20', time: '10:30', place: UFA }));
    assert.equal(c.planets.length, 11);
    for (const p of c.planets) {
      if (p.key === 'asc') assert.equal(p.house, null); else assert.ok(p.house >= 1 && p.house <= 12, p.key);
      assert.equal(p.precision, 'exact');
    }
  });
  test('результат содержит данные для сохранения', () => {
    const c = A.computeChart(base({ date: '2001-05-20', time: '10:30', place: UFA }));
    assert.deepEqual(c.birth, { date: '2001-05-20', time: '10:30' });
    assert.equal(c.placeRef.timezone, 'Asia/Yekaterinburg');
    assert.equal(c.place, 'Уфа, Башкортостан, Россия');
  });
});

describe('computeChart(): неизвестное время', () => {
  const run = (date, place = UFA) => A.computeChart(base({ date, time: '', unknownTime: true, place }));
  test('нет Асцендента, МС, домов; у планет нет домов', () => {
    const c = run('2001-06-06');
    assert.equal(c.timeKnown, false);
    assert.equal(c.asc, null); assert.equal(c.mc, null); assert.equal(c.cusps, null); assert.equal(c.system, null);
    assert.equal(c.planets.find((p) => p.key === 'asc'), undefined);
    assert.equal(c.planets.length, 10);
    assert.ok(c.planets.every((p) => p.house === null));
    assert.equal(c.birth.time, null);
  });
  test('точность помечена честно: у Луны градусов нет, у остальных — «по дню»', () => {
    const c = run('2001-06-06');
    assert.equal(c.planets.find((p) => p.key === 'moon').precision, 'none');
    assert.ok(c.planets.filter((p) => p.key !== 'moon').every((p) => p.precision === 'day'));
  });
  test('Луна меняет знак в течение суток: показываются оба знака (эталон Swiss Ephemeris)', () => {
    const m = fx.moonCross, c = run(m.date), moon = c.planets.find((p) => p.key === 'moon');
    assert.equal(moon.approx, true);
    assert.deepEqual(moon.alt, m.signs);
    assert.match(moon.sign, / или /);
    assert.match(moon.note, /сменила знак/);
  });
  test('Луна не меняет знак: один знак без пометки «или»', () => {
    const m = fx.moonStill, c = run(m.date), moon = c.planets.find((p) => p.key === 'moon');
    assert.equal(moon.approx, undefined);
    assert.equal(moon.si, m.sign);
    assert.doesNotMatch(moon.sign, / или /);
  });
  test('день, которого не существует (Самоа, 2011-12-30), даёт понятную ошибку', () => {
    const e = err(() => run('2011-12-30', { name: 'Apia', timezone: 'Pacific/Apia', latitude: -13.83, longitude: -171.76 }));
    assert.equal(e.code, 'invalid-local-time');
    assert.equal(e.wholeDay, true);
  });
});

describe('computeChart(): DST', () => {
  test('время в «дыре» перевода вперёд → invalid-local-time, расчёт не выполняется', () => {
    const e = err(() => A.computeChart(base({ date: '2023-03-12', time: '02:30', place: NYC })));
    assert.equal(e.code, 'invalid-local-time');
    assert.equal(e.message, 'invalid-local-time');
  });
  test('время при переводе назад → ambiguous-local-time с обоими вариантами, молча не выбирается', () => {
    const e = err(() => A.computeChart(base({ date: '2023-11-05', time: '01:30', place: NYC })));
    assert.equal(e.code, 'ambiguous-local-time');
    assert.equal(e.candidates.length, 2);
    assert.equal(e.candidates[1].ts - e.candidates[0].ts, 3600e3);
  });
  test('явный выбор пользователя разрешает неоднозначность и даёт разные карты', () => {
    const a = A.computeChart(base({ date: '2023-11-05', time: '01:30', place: NYC, ambiguousChoice: 'first' }));
    const b = A.computeChart(base({ date: '2023-11-05', time: '01:30', place: NYC, ambiguousChoice: 'second' }));
    assert.equal(b.ts - a.ts, 3600e3);
    assert.equal(a.timeChoice, 'first'); assert.equal(b.timeChoice, 'second');
    assert.notEqual(a.asc, b.asc);
  });
  test('выбор игнорируется там, где нет неоднозначности', () => {
    const c = A.computeChart(base({ date: '2023-06-15', time: '12:00', place: NYC, ambiguousChoice: 'second' }));
    assert.equal(c.timeChoice, null);
  });
  test('границы перевода: 01:59 и 03:00 принимаются', () => {
    assert.equal(A.computeChart(base({ date: '2023-03-12', time: '01:59', place: NYC })).timeKnown, true);
    assert.equal(A.computeChart(base({ date: '2023-03-12', time: '03:00', place: NYC })).timeKnown, true);
  });
});

describe('computeChart(): границы и ошибки', () => {
  test('будущее отклоняется (известное и неизвестное время)', () => {
    assert.equal(err(() => A.computeChart(base({ date: '2026-10-08', time: '12:00', place: UFA }))).code, 'future');
    assert.equal(err(() => A.computeChart(base({ date: '2027-01-01', time: '', unknownTime: true, place: UFA }))).code, 'future');
  });
  test('сегодняшний день с неизвестным временем допустим, будущее время сегодня — нет', () => {
    assert.equal(A.computeChart(base({ date: '2026-10-07', time: '', unknownTime: true, place: UFA })).timeKnown, false);
    assert.equal(err(() => A.computeChart(base({ date: '2026-10-07', time: '23:30', place: UFA }))).code, 'future');
  });
  test('нижняя граница 1900-01-01 принимается, 1899-12-31 нет', () => {
    assert.equal(A.computeChart(base({ date: '1900-01-01', time: '12:00', place: UFA })).planets.length, 11);
    assert.equal(err(() => A.computeChart(base({ date: '1899-12-31', time: '12:00', place: UFA }))).code, 'out-of-range');
  });
  test('мусорные данные отклоняются с кодом, а не исключением TypeError', () => {
    const ok = { date: '2001-05-20', time: '10:30', place: UFA };
    assert.equal(err(() => A.computeChart(base({ ...ok, date: '2001-5-2' }))).code, 'invalid-input');
    assert.equal(err(() => A.computeChart(base({ ...ok, date: undefined }))).code, 'invalid-input');
    assert.equal(err(() => A.computeChart(base({ ...ok, time: '25:00' }))).code, 'invalid-input');
    assert.equal(err(() => A.computeChart(base({ ...ok, place: null }))).code, 'invalid-timezone');
    assert.equal(err(() => A.computeChart(base({ ...ok, place: { ...UFA, timezone: 'Nope/Zone' } }))).code, 'invalid-timezone');
    assert.equal(err(() => A.computeChart(base({ ...ok, place: { ...UFA, latitude: 95 } }))).code, 'invalid-place');
    assert.equal(err(() => A.computeChart(base({ ...ok, place: { ...UFA, longitude: NaN } }))).code, 'invalid-place');
  });
  test('высокая широта (Мурманск 68.97°): равные дома, Асцендент и дома конечны', () => {
    const c = A.computeChart(base({ date: '2001-05-20', time: '10:30', place: { name: 'Мурманск', timezone: 'Europe/Moscow', latitude: 68.97, longitude: 33.07 } }));
    assert.equal(c.system, 'равные дома');
    assert.ok(Number.isFinite(c.asc) && c.cusps.every(Number.isFinite));
    assert.ok(c.planets.every((p) => p.key === 'asc' || (p.house >= 1 && p.house <= 12)));
  });
  test('почти полюс (89.5°) не ломает расчёт', () => {
    const c = A.computeChart(base({ date: '2001-05-20', time: '10:30', place: { name: 'Pole', timezone: 'UTC', latitude: 89.5, longitude: 0 } }));
    assert.ok(Number.isFinite(c.asc));
  });
  test('29 февраля високосного года', () => {
    assert.equal(A.computeChart(base({ date: '2000-02-29', time: '12:00', place: UFA })).planets.length, 11);
  });
});

describe('horoscopeFor(): транзиты и часовой пояс', () => {
  const chart = A.computeChart(base({ date: '2001-05-20', time: '10:30', place: UFA }));
  const TS = Date.UTC(2026, 9, 7, 8, 5);
  test('момент показывается в явно указанном поясе и в UTC', () => {
    const h = A.horoscopeFor(chart, TS, 'Asia/Yekaterinburg');
    assert.equal(h.tz, 'Asia/Yekaterinburg');
    assert.equal(h.offset, 'UTC+5');
    assert.match(h.when, /7 октября 2026/); assert.match(h.when, /13:05/);
    assert.match(h.whenUtc, /08:05/);
  });
  test('другой пояс даёт другое местное время, но тот же момент и те же транзиты', () => {
    const a = A.horoscopeFor(chart, TS, 'Asia/Yekaterinburg'), b = A.horoscopeFor(chart, TS, 'America/New_York');
    assert.match(b.when, /04:05/);
    assert.equal(a.whenUtc, b.whenUtc);
    assert.deepEqual(a.items, b.items);
  });
  test('неизвестный пояс безопасно заменяется на UTC', () => {
    assert.equal(A.horoscopeFor(chart, TS, 'Nope/Zone').tz, 'UTC');
    assert.equal(A.horoscopeFor(chart, TS).tz, 'UTC');
  });
  test('в транзитах только быстрые планеты; список открыто перечислен', () => {
    const h = A.horoscopeFor(chart, TS, 'UTC');
    assert.deepEqual(h.planets, ['Луна', 'Солнце', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн']);
    assert.ok(h.items.length <= 3);
  });
});

describe('рендер колеса', () => {
  test('SVG не содержит названия места и данных, пришедших извне', () => {
    const evil = { ...UFA, name: '<img src=x onerror=alert(1)>' };
    const c = A.computeChart(base({ date: '2001-05-20', time: '10:30', place: evil }));
    const svg = A.wheelSVG(c);
    assert.doesNotMatch(svg, /onerror|<img|alert/);
    assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  });
  test('без времени: нет подписей углов и домов', () => {
    const c = A.computeChart(base({ date: '2001-06-06', time: '', unknownTime: true, place: UFA }));
    const svg = A.wheelSVG(c);
    assert.doesNotMatch(svg, />(Asc|MC|IC|Dsc)</);
    assert.doesNotMatch(svg, /class="hnum"/);
  });
  test('с известным временем: четыре угла и 12 номеров домов', () => {
    const svg = A.wheelSVG(A.computeChart(base({ date: '2001-05-20', time: '10:30', place: UFA })));
    for (const a of ['Asc', 'MC', 'IC', 'Dsc']) assert.match(svg, new RegExp(`>${a}<`));
    assert.equal((svg.match(/class="hnum"/g) || []).length, 12);
  });
});
