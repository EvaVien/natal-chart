const { test, describe } = require('node:test');
const assert = require('node:assert');
const { sky, ascendant, midheaven, buildHouses, houseOf, localToUTC, computeChart, natalAspects } = require('../script.js');

describe('Astronomy and Time Core', () => {
  test('sky returns valid positions for J2000', () => {
    const pos = sky(0);
    assert.strictEqual(typeof pos.sun, 'number');
    assert.strictEqual(typeof pos.moon, 'number');
    assert.strictEqual(pos.sun >= 0 && pos.sun < 360, true);
  });

  test('localToUTC handles standard time correctly', () => {
    // Moscow is UTC+3 in summer 2023
    const res = localToUTC('2023-06-15', '12:00', 'Europe/Moscow');
    assert.strictEqual(res.error, undefined);
    assert.strictEqual(res.ts, Date.UTC(2023, 5, 15, 9, 0));
  });

  test('localToUTC detects DST gap (invalid local time)', () => {
    // US/Eastern DST gap: March 12, 2023, 02:00 to 03:00
    const res = localToUTC('2023-03-12', '02:30', 'America/New_York');
    assert.strictEqual(res.error, 'invalid-local-time');
  });

  test('localToUTC detects DST overlap (ambiguous local time)', () => {
    // US/Eastern DST overlap: Nov 5, 2023, 01:00 to 02:00
    const res = localToUTC('2023-11-05', '01:30', 'America/New_York');
    assert.strictEqual(res.error, 'ambiguous-local-time');
    assert.strictEqual(typeof res.ts, 'number');
  });

  test('computeChart rejects future dates', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const iso = futureDate.toISOString().split('T')[0];
    assert.throws(() => {
      computeChart({
        date: iso, time: '12:00', unknownTime: false,
        place: { name: 'Moscow', timezone: 'Europe/Moscow', latitude: 55.75, longitude: 37.61 }
      });
    }, /future/);
  });

  test('computeChart handles unknown birth time', () => {
    const res = computeChart({
      date: '1990-05-15', time: '12:00', unknownTime: true,
      place: { name: 'London', timezone: 'Europe/London', latitude: 51.5, longitude: -0.1 }
    });
    assert.strictEqual(res.timeKnown, false);
    assert.strictEqual(res.cusps, null);
    assert.strictEqual(res.planets.find(p => p.key === 'asc'), undefined);
  });

  test('natalAspects calculates correctly', () => {
    const planets = [
      { key: 'sun', lon: 0, name: 'Sun', gen: false },
      { key: 'moon', lon: 120, name: 'Moon', gen: false }
    ];
    const aspects = natalAspects(planets);
    assert.strictEqual(aspects.length, 1);
    assert.strictEqual(aspects[0].asp.name, 'тригон');
  });
});
