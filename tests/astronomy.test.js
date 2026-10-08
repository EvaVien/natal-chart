'use strict';
// Регрессионные тесты астрономического ядра. Эталон — Swiss Ephemeris (tests/fixtures/swisseph.json,
// генерируется tests/tools/make-fixtures.py). Допуски выбраны по реально измеренной точности с запасом.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../script.js');
const fx = require('./fixtures/swisseph.json');
const polar = require('./fixtures/polar-asc.json');

const diff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const TOL = { planet: 0.06, moon: 0.10, angle: 0.03 };      // градусы
const D = (jd) => jd - 2451543.5;

describe('sky(): положения тел против Swiss Ephemeris', () => {
  for (const c of fx.cases) {
    test(`${c.name} (${c.note})`, () => {
      const s = A.sky(D(c.jd));
      for (const [k, ref] of Object.entries(c.planets)) {
        const err = diff(s[k], ref), tol = k === 'moon' ? TOL.moon : TOL.planet;
        assert.ok(err <= tol, `${k}: ошибка ${err.toFixed(3)}° > ${tol}° (моё ${s[k].toFixed(3)}, эталон ${ref.toFixed(3)})`);
      }
    });
  }

  test('Солнце действительно зависит от даты (защита от «замороженного» движка)', () => {
    const a = A.sky(D(2451545)).sun, b = A.sky(D(2451545 + 91.3)).sun;
    assert.ok(diff(a, b) > 80 && diff(a, b) < 100, `за четверть года Солнце должно пройти ~90°, прошло ${diff(a, b).toFixed(1)}°`);
  });

  test('значения конечны и в диапазоне [0, 360) на всём интервале 1800–2200', () => {
    for (let y = 1800; y <= 2200; y += 5) {
      const s = A.sky(D(2451545 + (y - 2000) * 365.25));
      for (const [k, v] of Object.entries(s)) assert.ok(Number.isFinite(v) && v >= 0 && v < 360, `${k} ${y}: ${v}`);
    }
    assert.deepEqual(Object.keys(A.sky(0)).sort(), ['jupiter', 'mars', 'mercury', 'moon', 'neptune', 'pluto', 'saturn', 'sun', 'uranus', 'venus']);
  });
});

describe('retroFlags(): ретроградность', () => {
  test('совпадает со знаком скорости Swiss Ephemeris (вдали от стояний)', () => {
    let checked = 0;
    for (const r of fx.retro) {
      const f = A.retroFlags(D(r.jd));
      for (const [k, v] of Object.entries(r.retro)) {
        if (Math.abs(v.speed) < 0.01) continue;                // у самой точки стояния результат зависит от шага
        assert.equal(f[k], v.retro, `${r.date} ${k}: скорость ${v.speed.toFixed(3)}`);
        checked++;
      }
    }
    assert.ok(checked >= 25, `проверено слишком мало случаев: ${checked}`);
  });

  test('Меркурий ретрограден в конце декабря 2023 и прямой в феврале 2024', () => {
    assert.equal(A.retroFlags(D(2460304.5)).mercury, true);     // 2023-12-25
    assert.equal(A.retroFlags(D(2460341.5)).mercury, false);    // 2024-02-01
  });

  test('Солнце и Луна никогда не бывают ретроградными', () => {
    const f = A.retroFlags(0);
    assert.equal('sun' in f, false);
    assert.equal('moon' in f, false);
  });
});

describe('ascendant(), midheaven(), buildHouses()', () => {
  for (const c of fx.cases) {
    test(`Асцендент, МС и дома: ${c.name}`, () => {
      const d = D(c.jd), eps = A.obliquity(d), ramc = A.ramcOf(c.jd, c.lon);
      const asc = A.ascendant(ramc, eps, c.lat), mc = A.midheaven(ramc, eps);
      assert.ok(diff(asc, c.asc) <= TOL.angle, `Asc ${asc} vs ${c.asc}`);
      assert.ok(diff(mc, c.mc) <= TOL.angle, `MC ${mc} vs ${c.mc}`);
      const h = A.buildHouses(ramc, eps, c.lat, asc, mc);
      assert.equal(h.system === 'Плацидус' ? 'placidus' : 'equal', c.system);
      h.cusps.forEach((x, i) => assert.ok(diff(x, c.cusps[i]) <= TOL.angle, `куспид ${i + 1}: ${x} vs ${c.cusps[i]}`));
    });
  }

  test('заполярье: Асцендент не «переворачивается» на 180° (120 случайных точек, |широта| 60–88°)', () => {
    let worst = 0;
    for (const p of polar) {
      const d = D(p.jd), eps = A.obliquity(d), ramc = A.ramcOf(p.jd, p.lon);
      const asc = A.ascendant(ramc, eps, p.lat);
      worst = Math.max(worst, diff(asc, p.asc));
      assert.ok(diff(asc, p.asc) <= 0.1, `lat ${p.lat.toFixed(2)}: Асцендент ${asc.toFixed(2)} vs эталон ${p.asc.toFixed(2)}`);
    }
    assert.ok(worst < 0.1);
  });

  test('выше 66° дома равные: 12 куспидов с шагом ровно 30° от Асцендента', () => {
    const c = fx.cases.find((x) => x.name === 'longyearbyen-polar');
    const d = D(c.jd), eps = A.obliquity(d), ramc = A.ramcOf(c.jd, c.lon);
    const asc = A.ascendant(ramc, eps, c.lat), h = A.buildHouses(ramc, eps, c.lat, asc, A.midheaven(ramc, eps));
    assert.equal(h.system, 'равные дома');
    h.cusps.forEach((x, i) => assert.ok(diff(x, (asc + 30 * i) % 360) < 1e-9));
  });

  test('Плацидус около полярного круга (65.9°) не даёт NaN и сохраняет порядок домов', () => {
    const jd = 2451545.3, d = D(jd), eps = A.obliquity(d), ramc = A.ramcOf(jd, 30);
    const asc = A.ascendant(ramc, eps, 65.9), h = A.buildHouses(ramc, eps, 65.9, asc, A.midheaven(ramc, eps));
    assert.equal(h.cusps.length, 12);
    h.cusps.forEach((x) => assert.ok(Number.isFinite(x)));
    let total = 0;
    for (let i = 0; i < 12; i++) total += A.norm(h.cusps[(i + 1) % 12] - h.cusps[i]);
    assert.ok(Math.abs(total - 360) < 1e-6, `дома должны обходить круг ровно один раз, сумма ${total}`);
  });
});

describe('houseOf()', () => {
  const equal = Array.from({ length: 12 }, (_, i) => i * 30);
  test('границы и переход через 0°', () => {
    assert.equal(A.houseOf(0, equal), 1);
    assert.equal(A.houseOf(29.99, equal), 1);
    assert.equal(A.houseOf(30, equal), 2);
    assert.equal(A.houseOf(359.99, equal), 12);
  });
  test('Асцендент не на 0°: дома считаются с переходом через 360°', () => {
    const cusps = Array.from({ length: 12 }, (_, i) => (345 + 30 * i) % 360);
    assert.equal(A.houseOf(350, cusps), 1);
    assert.equal(A.houseOf(10, cusps), 1);   // дом 1 занимает 345°–15°
    assert.equal(A.houseOf(20, cusps), 2);
    assert.equal(A.houseOf(344, cusps), 12);
  });
});

describe('natalAspects()', () => {
  const P = (key, lon, gen = false) => ({ key, lon, name: key, gen });
  test('тригон найден, соединение по другую сторону 0°', () => {
    assert.equal(A.natalAspects([P('sun', 0), P('moon', 120)])[0].asp.name, 'тригон');
    const conj = A.natalAspects([P('sun', 359), P('moon', 3)]);
    assert.equal(conj[0].asp.name, 'соединение');
    assert.ok(Math.abs(conj[0].orb - 4) < 1e-9);
  });
  test('вне орбиса аспекта нет', () => {
    assert.equal(A.natalAspects([P('sun', 0), P('moon', 100)]).length, 0);
  });
  test('для медленных планет орбис уже на 2°', () => {
    assert.equal(A.natalAspects([P('sun', 0), P('pluto', 7, true)]).length, 0);
    assert.equal(A.natalAspects([P('sun', 0), P('moon', 7)]).length, 1);
  });
  test('результат отсортирован по точности', () => {
    const r = A.natalAspects([P('sun', 0), P('moon', 121), P('mars', 60.5), P('venus', 240)]);
    for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].orb <= r[i].orb);
  });
});
