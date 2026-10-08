'use strict';
// Часовые пояса и DST. Эталон — стандартная tz-база Python (zoneinfo), независимая от JS/ICU
// (tests/fixtures/timezones.json). Правило: невозможное и неоднозначное время НЕ угадываем молча.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../script.js');
const cases = require('./fixtures/timezones.json');

describe('resolveLocal() / localToUTC() против zoneinfo', () => {
  for (const c of cases) {
    test(`${c.tz} ${c.date} ${c.time}: ${c.note} → ${c.status}`, () => {
      const r = A.resolveLocal(c.date, c.time, c.tz);
      assert.equal(r.status, c.status);
      assert.deepEqual(r.candidates.map((x) => x.ts), c.candidates);

      const u = A.localToUTC(c.date, c.time, c.tz);
      if (c.status === 'ok') { assert.equal(u.error, undefined); assert.equal(u.ts, c.candidates[0]); }
      else if (c.status === 'invalid-local-time') { assert.equal(u.error, 'invalid-local-time'); assert.equal(u.ts, undefined); }
      else { assert.equal(u.error, 'ambiguous-local-time'); assert.deepEqual([u.ts, u.ts2], c.candidates); }
    });
  }

  test('30-минутный переход (Lord Howe): неоднозначность не теряется', () => {
    const r = A.resolveLocal('2023-04-02', '01:45', 'Australia/Lord_Howe');
    assert.equal(r.status, 'ambiguous-local-time');
    assert.equal(r.candidates[1].ts - r.candidates[0].ts, 30 * 60 * 1000);
  });

  test('смещения нахлёста различаются на величину перевода (Нью-Йорк: UTC−4 и UTC−5)', () => {
    const r = A.resolveLocal('2023-11-05', '01:30', 'America/New_York');
    assert.deepEqual(r.candidates.map((c) => A.fmtOffset(c.offset)), ['UTC−4', 'UTC−5']);
  });

  test('историческая смена смещения: Москва 2011-03-27 и 2014-10-26', () => {
    assert.equal(A.fmtOffset(A.resolveLocal('2011-03-27', '03:30', 'Europe/Moscow').candidates[0].offset), 'UTC+4');
    assert.equal(A.fmtOffset(A.resolveLocal('2014-10-26', '03:30', 'Europe/Moscow').candidates[0].offset), 'UTC+3');
  });

  test('соседние даты одной зоны могут иметь разное смещение', () => {
    const a = A.resolveLocal('2023-03-11', '12:00', 'America/New_York').candidates[0].offset;
    const b = A.resolveLocal('2023-03-13', '12:00', 'America/New_York').candidates[0].offset;
    assert.equal(b - a, 3600e3);
  });

  test('нестандартные смещения: +5:45 и +14', () => {
    assert.equal(A.fmtOffset(A.resolveLocal('2023-06-01', '12:00', 'Asia/Kathmandu').candidates[0].offset), 'UTC+5:45');
    assert.equal(A.fmtOffset(A.resolveLocal('2023-06-01', '12:00', 'Pacific/Kiritimati').candidates[0].offset), 'UTC+14');
  });
});

describe('некорректный ввод', () => {
  test('несуществующая дата и время', () => {
    for (const [d, t] of [['2023-02-30', '12:00'], ['2023-13-01', '12:00'], ['2023-06-15', '24:00'], ['2023-06-15', '12:60'], ['', '12:00'], ['2023-06-15', '']]) {
      assert.equal(A.resolveLocal(d, t, 'Europe/Moscow').status, 'invalid-input', `${d} ${t}`);
    }
  });
  test('29 февраля: високосный год допустим, невисокосный — нет', () => {
    assert.equal(A.resolveLocal('2024-02-29', '12:00', 'UTC').status, 'ok');
    assert.equal(A.resolveLocal('2023-02-29', '12:00', 'UTC').status, 'invalid-input');
  });
  test('несуществующая или подозрительная зона', () => {
    for (const tz of ['Mars/Olympus', '', null, undefined, 'A'.repeat(100), '<script>']) {
      assert.equal(A.resolveLocal('2023-06-15', '12:00', tz).status, 'invalid-timezone', String(tz));
      assert.equal(A.isValidTimeZone(tz), false);
    }
  });
});

describe('мягкие границы суток (только для неизвестного времени)', () => {
  test('обычный день: полночь, конец суток и полдень существуют', () => {
    const tz = 'Europe/Moscow', s = A.dayStartTs('2023-06-15', tz), e = A.dayEndTs('2023-06-15', tz), n = A.dayNoonTs('2023-06-15', tz);
    assert.ok(s < n && n < e);
    assert.equal(e - s, (24 * 60 - 1) * 60e3);
  });
  test('полночи не существует (Сан-Паулу, 2018-11-04): начало суток сдвигается на 01:00', () => {
    const s = A.dayStartTs('2018-11-04', 'America/Sao_Paulo');
    assert.equal(s, A.resolveLocal('2018-11-04', '01:00', 'America/Sao_Paulo').candidates[0].ts);
  });
  test('целого дня не существует (Самоа, 2011-12-30): полдень вернёт null', () => {
    assert.equal(A.dayNoonTs('2011-12-30', 'Pacific/Apia'), null);
    assert.equal(A.dayStartTs('2011-12-30', 'Pacific/Apia'), null);
  });
  test('день с нахлёстом: начало берётся по первому моменту, конец по последнему', () => {
    const s = A.dayStartTs('2023-11-05', 'America/New_York'), e = A.dayEndTs('2023-11-05', 'America/New_York');
    assert.equal((e - s) / 3600e3 | 0, 24);            // в этот день 25 часов: (24:59 − 00:00) + лишний час
  });
});
