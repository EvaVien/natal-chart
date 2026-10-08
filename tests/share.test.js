'use strict';
// Сохранение и ссылка: всё, что приходит из URL и localStorage, недоверенное.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../script.js');

const UFA = { name: 'Уфа', admin1: 'Башкортостан', country: 'Россия', timezone: 'Asia/Yekaterinburg', latitude: 54.74, longitude: 55.97 };
const NOW = Date.UTC(2026, 9, 7, 12, 0), TODAY = '2026-10-07';
const chart = (o = {}) => A.computeChart({ date: '2001-05-20', time: '10:30', unknownTime: false, place: UFA, now: NOW, ...o });

describe('ссылка', () => {
  test('известное время: круг «собрать → разобрать» возвращает те же данные', () => {
    const q = A.buildShareQuery(chart());
    const r = A.parseShareQuery('?' + q, TODAY);
    assert.equal(r.status, 'ok');
    assert.equal(r.input.date, '2001-05-20'); assert.equal(r.input.time, '10:30');
    assert.equal(r.input.place.timezone, 'Asia/Yekaterinburg');
    assert.ok(Math.abs(r.input.place.latitude - 54.74) < 1e-4);
    assert.equal(r.input.place.name, 'Уфа, Башкортостан, Россия');
  });
  test('неизвестное время: параметра time нет, при разборе time = null', () => {
    const c = chart({ time: '', unknownTime: true });
    const q = A.buildShareQuery(c);
    assert.doesNotMatch(q, /time=/);
    assert.equal(A.parseShareQuery('?' + q, TODAY).input.time, null);
  });
  test('нет параметров → none (страница открывается как обычно)', () => {
    assert.equal(A.parseShareQuery('', TODAY).status, 'none');
    assert.equal(A.parseShareQuery('?utm_source=x&ref=y', TODAY).status, 'none');
  });
  const good = 'date=2001-05-20&time=10:30&city=Ufa&lat=54.74&lon=55.97&tz=Asia/Yekaterinburg';
  const bad = {
    'нет координат': good.replace('&lat=54.74', ''),
    'широта вне диапазона': good.replace('lat=54.74', 'lat=91'),
    'долгота вне диапазона': good.replace('lon=55.97', 'lon=-181'),
    'экспонента вместо числа': good.replace('lat=54.74', 'lat=1e2'),
    'NaN': good.replace('lat=54.74', 'lat=NaN'),
    'Infinity': good.replace('lon=55.97', 'lon=Infinity'),
    'пустая широта': good.replace('lat=54.74', 'lat='),
    'несуществующая дата': good.replace('2001-05-20', '2001-02-30'),
    'формат даты': good.replace('2001-05-20', '20.05.2001'),
    'дата до 1900': good.replace('2001-05-20', '1899-12-31'),
    'дата в будущем': good.replace('2001-05-20', '2026-10-08'),
    'формат времени': good.replace('10:30', '10:30:15'),
    'время 24:00': good.replace('10:30', '24:00'),
    'пояс не существует': good.replace('Asia/Yekaterinburg', 'Mars/Base'),
    'пояс — скрипт': good.replace('Asia/Yekaterinburg', '<script>alert(1)</script>'),
    'город пустой': good.replace('city=Ufa', 'city='),
    'город слишком длинный': good.replace('city=Ufa', 'city=' + 'x'.repeat(500))
  };
  for (const [name, qs] of Object.entries(bad)) {
    test(`отклоняется: ${name}`, () => assert.equal(A.parseShareQuery('?' + qs, TODAY).status, 'invalid'));
  }
  test('опасное имя города очищается от угловых скобок и управляющих символов', () => {
    for (const evil of ['<img src=x onerror=alert(1)>', '"><script>alert(1)</script>', 'Уфа\u0000\u0007\n', '<svg/onload=alert(1)>']) {
      const r = A.parseShareQuery('?' + good.replace('city=Ufa', 'city=' + encodeURIComponent(evil)), TODAY);
      if (r.status === 'ok') {
        assert.doesNotMatch(r.input.place.name, /[<>\u0000-\u001f]/, evil);
        assert.ok(r.input.place.name.length <= 120);
      }
    }
  });
  test('лишние параметры игнорируются и не попадают в результат', () => {
    const r = A.parseShareQuery('?' + good + '&__proto__=x&constructor=y&admin1=<b>', TODAY);
    assert.equal(r.status, 'ok');
    assert.deepEqual(Object.keys(r.input.place).sort(), ['latitude', 'longitude', 'name', 'timezone']);
  });
  test('повторяющиеся параметры: берётся первый, ошибки нет', () => {
    assert.equal(A.parseShareQuery('?' + good + '&date=1999-01-01', TODAY).input.date, '2001-05-20');
  });
});

describe('localStorage', () => {
  test('круг «сохранить → прочитать»', () => {
    const r = A.parseSaved(A.serializeSaved(chart()), TODAY);
    assert.equal(r.date, '2001-05-20'); assert.equal(r.time, '10:30');
    assert.equal(r.place.name, 'Уфа'); assert.equal(r.place.admin1, 'Башкортостан');
  });
  test('в хранилище лежат минимальные данные: нет SVG, планет и аспектов', () => {
    const raw = A.serializeSaved(chart());
    assert.ok(raw.length < 400, `слишком большой объём: ${raw.length}`);
    for (const k of ['svg', 'planets', 'aspects', 'cusps']) assert.doesNotMatch(raw, new RegExp(k));
    assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ['date', 'place', 'savedAt', 'time', 'v']);
  });
  test('неизвестное время сохраняется как null', () => {
    assert.equal(A.parseSaved(A.serializeSaved(chart({ time: '', unknownTime: true })), TODAY).time, null);
  });
  const hostile = {
    'не JSON': 'не json {', 'null': 'null', 'число': '42', 'массив': '[]', 'пустая строка': '',
    'чужая версия': JSON.stringify({ v: 2, date: '2001-05-20', time: null, place: UFA }),
    'без места': JSON.stringify({ v: 1, date: '2001-05-20', time: null }),
    'пояс подменён': JSON.stringify({ v: 1, date: '2001-05-20', time: null, place: { ...UFA, timezone: 'Evil/Zone' } }),
    'координаты — строки': JSON.stringify({ v: 1, date: '2001-05-20', time: null, place: { ...UFA, latitude: '54.74' } }),
    'дата в будущем': JSON.stringify({ v: 1, date: '2030-01-01', time: null, place: UFA }),
    'время повреждено': JSON.stringify({ v: 1, date: '2001-05-20', time: '99:99', place: UFA })
  };
  for (const [name, raw] of Object.entries(hostile)) {
    test(`повреждённые данные игнорируются: ${name}`, () => assert.equal(A.parseSaved(raw, TODAY), null));
  }
  test('в имени места из хранилища вырезаются теги', () => {
    const raw = JSON.stringify({ v: 1, date: '2001-05-20', time: null, place: { ...UFA, name: '<img src=x onerror=alert(1)>' } });
    const r = A.parseSaved(raw, TODAY);
    assert.ok(r === null || !/[<>]/.test(r.place.name));
  });
});

describe('cleanPlace / isRealDate', () => {
  test('cleanPlace сохраняет только известные поля', () => {
    const p = A.cleanPlace({ ...UFA, evil: '<script>', __proto__: { x: 1 } });
    assert.equal(p.evil, undefined);
    assert.equal(p.name, 'Уфа');
  });
  test('isRealDate', () => {
    for (const [d, v] of [['2024-02-29', true], ['2023-02-29', false], ['2023-04-31', false], ['2023-12-31', true], ['0000-00-00', false], ['2023-1-1', false], [null, false]]) {
      assert.equal(A.isRealDate(d), v, String(d));
    }
  });
});
