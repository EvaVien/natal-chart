'use strict';
// Геокодинг: все ветки отказа без реальной сети (подставной fetch).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../script.js');

const ufa = { name: 'Уфа', admin1: 'Башкортостан', country: 'Россия', country_code: 'RU', timezone: 'Asia/Yekaterinburg', latitude: 54.74, longitude: 55.97, population: 1100000 };
const ufaIrk = { name: 'Уфа', admin1: 'Иркутская область', country: 'Россия', country_code: 'RU', timezone: 'Asia/Irkutsk', latitude: 55, longitude: 103, population: 100 };
const ok = (results, extra) => async () => ({ ok: true, status: 200, json: async () => (results === undefined ? { generationtime_ms: 1 } : { results, ...extra }) });
const code = (fn) => fn().then(() => 'no-error', (e) => e.code);

describe('geocode(): сбои', () => {
  test('таймаут: запрос реально прерывается по signal', async () => {
    let aborted = false;
    const hang = (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => { aborted = true; rej(Object.assign(new Error('x'), { name: 'AbortError' })); }));
    assert.equal(await code(() => A.geocode('Уфа', { fetch: hang, timeoutMs: 30 })), 'timeout');
    assert.equal(aborted, true);
  });
  test('сеть недоступна (fetch упал)', async () => {
    assert.equal(await code(() => A.geocode('Уфа', { fetch: async () => { throw new TypeError('Failed to fetch'); } })), 'network');
  });
  test('сервис недоступен: HTTP 500, 503, 429', async () => {
    for (const status of [500, 503, 429, 404]) {
      assert.equal(await code(() => A.geocode('Уфа', { fetch: async () => ({ ok: false, status }) })), 'service', String(status));
    }
  });
  test('ответ — не JSON', async () => {
    const f = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } });
    assert.equal(await code(() => A.geocode('Уфа', { fetch: f })), 'service');
  });
  test('ответ неожиданной формы: null, массив, results не массив', async () => {
    for (const body of [null, [], 'text', 42, { results: 'oops' }, { results: {} }]) {
      const f = async () => ({ ok: true, status: 200, json: async () => body });
      assert.equal(await code(() => A.geocode('Уфа', { fetch: f })), 'service', JSON.stringify(body));
    }
  });
  test('город не найден: нет поля results или пустой массив', async () => {
    assert.equal(await code(() => A.geocode('Qwertyuiop', { fetch: ok(undefined) })), 'nocity');
    assert.equal(await code(() => A.geocode('Qwertyuiop', { fetch: ok([]) })), 'nocity');
  });
  test('слишком короткий запрос не уходит в сеть', async () => {
    let called = false;
    assert.equal(await code(() => A.geocode(' а ', { fetch: async () => { called = true; } })), 'nocity');
    assert.equal(called, false);
  });
  test('новый запрос отменяет предыдущий (superseded), последний завершается нормально', async () => {
    const slow = (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))));
    const first = code(() => A.geocode('Москва', { fetch: slow, timeoutMs: 5000 }));
    const second = await A.geocode('Уфа', { fetch: ok([ufa]) });
    assert.equal(await first, 'superseded');
    assert.equal(second[0].name, 'Уфа');
  });
});

describe('geocode(): валидация ответа', () => {
  const bad = [
    { ...ufa, latitude: 91 }, { ...ufa, longitude: -181 }, { ...ufa, latitude: NaN }, { ...ufa, latitude: '54.7' },
    { ...ufa, timezone: 'Mars/Base' }, { ...ufa, timezone: undefined }, { ...ufa, name: '' }, { ...ufa, name: 'x'.repeat(500) }, null, 5, 'str'
  ];
  test('мусорные записи отбрасываются, нормальная остаётся', async () => {
    const r = await A.geocode('Уфа', { fetch: ok([...bad, ufa]) });
    assert.equal(r.length, 1);
    assert.equal(r[0].latitude, 54.74);
  });
  test('если валидных записей нет, это ошибка сервиса, а не «город не найден»', async () => {
    assert.equal(await code(() => A.geocode('Уфа', { fetch: ok(bad) })), 'service');
  });
  test('дубликаты схлопываются, максимум 5 вариантов', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...ufa, name: 'Уфа' + i, latitude: 10 + i * 3 }));
    assert.equal((await A.geocode('Уфа', { fetch: ok([ufa, ufa, ufa, ...many]) })).length, 5);
  });
});

describe('ранжирование вариантов', () => {
  const mk = (name, extra = {}) => ({ ...ufa, name, ...extra });
  test('точное совпадение имени выше частичного, порядок API не важен', () => {
    const r = A.rankPlaces([mk('Новая Уфа'), mk('Уфалей'), mk('Уфа', { population: 5 })], 'уфа');
    assert.deepEqual(r.map((p) => p.name), ['Уфа', 'Уфалей', 'Новая Уфа']);
  });
  test('регистр и «ё» не мешают', () => {
    assert.equal(A.rankPlaces([mk('Орёл'), mk('Орловка')], 'ОРЕЛ')[0].name, 'Орёл');
  });
  test('подсказка региона через запятую поднимает нужный вариант', () => {
    const r = A.rankPlaces([ufaIrk, ufa], 'Уфа, Иркутская');
    assert.equal(r[0].admin1, 'Иркутская область');
    assert.equal(A.rankPlaces([ufaIrk, ufa], 'Уфа, Россия').length, 2);
  });
  test('при равенстве побеждает более крупный город', () => {
    assert.equal(A.rankPlaces([ufaIrk, ufa], 'Уфа')[0].admin1, 'Башкортостан');
  });
  test('запрос «Уфа, Башкортостан» ищет по имени до запятой', async () => {
    let url = '';
    await A.geocode('Уфа, Башкортостан', { fetch: async (u) => { url = u; return { ok: true, json: async () => ({ results: [ufa] }) }; } });
    assert.match(url, /name=%D0%A3%D1%84%D0%B0(&|$)/);
    assert.doesNotMatch(url, /%2C/);
  });
  test('одинаковые подписи различаются часовым поясом', () => {
    const same = [{ ...ufa }, { ...ufa, timezone: 'Asia/Omsk', latitude: 50 }];
    const labels = A.choiceLabels(same);
    assert.notEqual(labels[0], labels[1]);
    assert.match(labels[1], /Asia\/Omsk/);
    assert.equal(A.choiceLabels([ufa, ufaIrk])[0], 'Уфа, Башкортостан, Россия');
  });
});
