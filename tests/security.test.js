'use strict';
// Аудит innerHTML. Правило: данные извне (API, URL, localStorage, поля формы) в DOM — только через textContent.
// innerHTML допустим для статической разметки и значений из справочников. Тест ловит возврат опасных паттернов.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const A = require('../script.js');

const src = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const lines = src.split('\n');
const sinks = lines.map((l, i) => ({ n: i + 1, l })).filter(({ l }) => /\.innerHTML\s*[+]?=|insertAdjacentHTML|document\.write|outerHTML\s*=/.test(l));

describe('innerHTML и аналоги', () => {
  test('опасные приёмники вообще не используются, кроме innerHTML', () => {
    assert.equal(sinks.filter(({ l }) => /insertAdjacentHTML|document\.write|outerHTML/.test(l)).length, 0);
  });
  test('в присваиваниях innerHTML нет внешних данных (место, город, URL, хранилище, поля формы)', () => {
    const tainted = /data\.place|current\.place|placeRef|\.city|location\.|\.search|URLSearchParams|localStorage|readForm\(|\$\('(city|date|time)'\)\.value|link\.input|savedInput|input\.place|err\.message/;
    // Оператор целиком: от присваивания до первой строки, оканчивающейся «;» при чётном числе обратных кавычек
    const statementAt = (n) => {
      const from = lines.slice(0, n - 1).join('\n').length + (n > 1 ? 1 : 0);
      for (let end = from; end < src.length; end++) {
        if (src[end] !== '\n' && end !== src.length - 1) continue;
        const chunk = src.slice(from, end + 1);
        if (/;\s*$/.test(chunk) && (chunk.match(/`/g) || []).length % 2 === 0) return chunk;
      }
      return src.slice(from, from + 2000);
    };
    assert.ok(sinks.length > 0);
    for (const { n } of sinks) {
      assert.doesNotMatch(statementAt(n), tainted, `script.js:${n} — в операторе innerHTML обнаружен внешний источник`);
    }
  });
  test('число мест с innerHTML ограничено (новый — осознанное решение, а не случайность)', () => {
    assert.ok(sinks.length <= 8, `найдено ${sinks.length} присваиваний innerHTML — проверьте, что в них нет данных извне`);
  });
  test('HTML-разметка не содержит inline-обработчиков событий', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
    assert.doesNotMatch(html, /javascript:/i);
  });
});

describe('вывод ничего не принимает извне', () => {
  const UFA = { name: 'Уфа', timezone: 'Asia/Yekaterinburg', latitude: 54.74, longitude: 55.97 };
  test('имя места с разметкой не попадает в SVG колеса', () => {
    const hostile = '"><script>alert(1)</script><img src=x onerror=alert(1)>';
    const c = A.computeChart({ date: '2001-05-20', time: '10:30', unknownTime: false, place: { ...UFA, name: hostile }, now: Date.UTC(2026, 9, 7) });
    const svg = A.wheelSVG(c);
    assert.doesNotMatch(svg, /script|onerror|<img|alert/);
    // а в данных место хранится как обычная строка — выводится только через textContent
    assert.equal(typeof c.place, 'string');
  });
  test('degLabel не показывает ложную точность без времени рождения', () => {
    assert.equal(A.degLabel({ precision: 'exact', deg: 17, min: 42 }), '17°42′');
    assert.equal(A.degLabel({ precision: 'day', deg: 17, min: 42 }), 'около 17°');
    assert.equal(A.degLabel({ precision: 'none', deg: 17, min: 42 }), 'градусы неизвестны');
    const c = A.computeChart({ date: '2001-06-06', time: '', unknownTime: true, place: UFA, now: Date.UTC(2026, 9, 7) });
    assert.doesNotMatch(A.wheelSVG(c), /\d+°\d\d′/);
    assert.ok(c.planets.every((p) => !/′/.test(A.degLabel(p))));
  });
  test('неизвестное время: транзиты не строят аспекты к Луне', () => {
    const c = A.computeChart({ date: '2001-06-06', time: '', unknownTime: true, place: UFA, now: Date.UTC(2026, 9, 7) });
    for (let h = 0; h < 24 * 60; h += 7) {
      const r = A.horoscopeFor(c, Date.UTC(2026, 9, 7) + h * 3600e3, 'UTC');
      assert.ok(r.items.every((i) => !/«Луна» в вашей карте/.test(i.label)), r.items.map((i) => i.label).join('|'));
    }
  });
});
