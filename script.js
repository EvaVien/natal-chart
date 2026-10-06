'use strict';

/* ===== Справочники (простым языком) ===== */
const SIGNS = ['Овен','Телец','Близнецы','Рак','Лев','Дева','Весы','Скорпион','Стрелец','Козерог','Водолей','Рыбы'];
const SIGN_SYM = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
const KEYWORDS = [
  'смелость, напор, инициатива, прямота',
  'стабильность, упорство, любовь к комфорту и красоте',
  'любопытство, общительность, лёгкость, умение переключаться',
  'чувствительность, забота, привязанность к дому и близким',
  'яркость, щедрость, потребность в признании',
  'аккуратность, внимание к деталям, практичность',
  'стремление к гармонии, такт, чувство красоты',
  'глубина, сила чувств, интуиция, страсть',
  'свобода, оптимизм, тяга к новому и поиску смысла',
  'дисциплина, ответственность, целеустремлённость',
  'независимость, оригинальность, нестандартные идеи',
  'воображение, сострадание, тонкая интуиция'
];
// name — название, sym — символ, topic — сфера жизни, role — что это значит для человека
const BODIES = {
  sun:     { name: 'Солнце',    sym: '☉',   topic: 'характер и жизненная энергия', role: 'Ваша суть: характер, воля и то, кем вы хотите быть.' },
  moon:    { name: 'Луна',      sym: '☽',   topic: 'эмоции и душевный комфорт',   role: 'Ваш внутренний мир: эмоции, настроение и то, что даёт ощущение уюта и безопасности.' },
  asc:     { name: 'Асцендент', sym: 'Asc', topic: 'самоподача и первое впечатление', role: 'Ваша «обложка»: как вас видят люди при первой встрече и как вы входите в новые ситуации.' },
  mercury: { name: 'Меркурий',  sym: '☿',   topic: 'мышление и общение',          role: 'Как вы думаете, учитесь и разговариваете с людьми.' },
  venus:   { name: 'Венера',    sym: '♀',   topic: 'отношения, симпатии и деньги', role: 'Как вы любите, что вам нравится и как относитесь к красоте и деньгам.' },
  mars:    { name: 'Марс',      sym: '♂',   topic: 'энергия и активность',        role: 'Ваша энергия: как вы добиваетесь своего, спорите и действуете.' }
};
const NATAL_KEYS = ['sun', 'moon', 'asc', 'mercury', 'venus', 'mars'];
// угол, название, глагол, мягкий ли аспект
const ASPECTS = [
  [0, 'соединение', 'усиливает', true], [60, 'секстиль', 'мягко поддерживает', true],
  [90, 'квадрат', 'обостряет', false], [120, 'тригон', 'облегчает', true], [180, 'оппозиция', 'обостряет', false]
];

/* ===== Математика ===== */
const R = Math.PI / 180;
const norm = (x) => ((x % 360) + 360) % 360;
const sin = (x) => Math.sin(x * R), cos = (x) => Math.cos(x * R), tan = (x) => Math.tan(x * R);
const atan2d = (y, x) => Math.atan2(y, x) / R;
const $ = (id) => document.getElementById(id);

// Решение уравнения Кеплера (итерации Ньютона)
function kepler(M, e) {
  let E = M + (e / R) * sin(M) * (1 + e * cos(M));
  for (let i = 0; i < 6; i++) E -= (E - (e / R) * sin(E) - M) / (1 - e * cos(E));
  return E;
}

// Орбитальные элементы (формулы П. Шлитера), d — дней от 31.12.1999 0:00 UT
const ELEMENTS = {
  sun:     (d) => ({ N: 0, i: 0, w: 282.9404 + 4.70935e-5 * d, a: 1, e: 0.016709 - 1.151e-9 * d, M: 356.0470 + 0.9856002585 * d }),
  moon:    (d) => ({ N: 125.1228 - 0.0529538083 * d, i: 5.1454, w: 318.0634 + 0.1643573223 * d, a: 60.2666, e: 0.0549, M: 115.3654 + 13.0649929509 * d }),
  mercury: (d) => ({ N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5e-8 * d, w: 29.1241 + 1.01444e-5 * d, a: 0.387098, e: 0.205635 + 5.59e-10 * d, M: 168.6562 + 4.0923344368 * d }),
  venus:   (d) => ({ N: 76.6799 + 2.4659e-5 * d, i: 3.3946 + 2.75e-8 * d, w: 54.891 + 1.38374e-5 * d, a: 0.72333, e: 0.006773 - 1.302e-9 * d, M: 48.0052 + 1.6021302244 * d }),
  mars:    (d) => ({ N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d, w: 286.5016 + 2.92961e-5 * d, a: 1.523688, e: 0.093405 + 2.516e-9 * d, M: 18.6021 + 0.5240207766 * d })
};

function orbitPos(el) {
  const E = kepler(el.M, el.e);
  const xv = el.a * (cos(E) - el.e), yv = el.a * Math.sqrt(1 - el.e * el.e) * sin(E);
  const u = atan2d(yv, xv) + el.w, r = Math.hypot(xv, yv);
  return {
    x: r * (cos(el.N) * cos(u) - sin(el.N) * sin(u) * cos(el.i)),
    y: r * (sin(el.N) * cos(u) + cos(el.N) * sin(u) * cos(el.i))
  };
}

// Эклиптические долготы (в градусах) Солнца, Луны, Меркурия, Венеры, Марса
function sky(d) {
  const se = ELEMENTS.sun(d), s = orbitPos(se);
  const out = { sun: norm(atan2d(s.y, s.x)) };
  for (const k of ['mercury', 'venus', 'mars']) {
    const p = orbitPos(ELEMENTS[k](d));
    out[k] = norm(atan2d(p.y + s.y, p.x + s.x));
  }
  const me = ELEMENTS.moon(d), m = orbitPos(me);
  const Ms = se.M, Mm = me.M, D = (Mm + me.w + me.N) - (Ms + se.w), F = (Mm + me.w + me.N) - me.N;
  const corr = -1.274 * sin(Mm - 2 * D) + 0.658 * sin(2 * D) - 0.186 * sin(Ms) - 0.059 * sin(2 * Mm - 2 * D)
    - 0.057 * sin(Mm - 2 * D + Ms) + 0.053 * sin(Mm + 2 * D) + 0.046 * sin(2 * D - Ms) + 0.041 * sin(Mm - Ms)
    - 0.035 * sin(D) - 0.031 * sin(Mm + Ms) - 0.015 * sin(2 * F - 2 * D) + 0.011 * sin(Mm - 4 * D);
  out.moon = norm(atan2d(m.y, m.x) + corr);
  return out;
}

// Асцендент по юлианской дате, широте и долготе (восточная — положительная)
function ascendant(jd, d, lat, lon) {
  const eps = 23.4393 - 3.563e-7 * d;
  const ramc = norm(280.46061837 + 360.98564736629 * (jd - 2451545) + lon);
  return norm(atan2d(cos(ramc), -(sin(ramc) * cos(eps) + tan(lat) * sin(eps))));
}

/* ===== Время и место ===== */
// Смещение часового пояса tz (IANA) в мс на момент ts — учитывает исторические изменения поясов
function tzOffset(ts, tz) {
  const o = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(new Date(ts)).forEach((p) => { o[p.type] = +p.value; });
  return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - ts;
}
function localToUTC(date, time, tz) {
  const [y, m, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let utc = guess - tzOffset(guess, tz);
  return guess - tzOffset(utc, tz);
}
// Бесплатный геокодер Open-Meteo: координаты и часовой пояс города, ключ не нужен
async function geocode(city) {
  const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&name=' + encodeURIComponent(city.trim()));
  if (!r.ok) throw new Error('network');
  const j = await r.json();
  if (!j.results || !j.results.length) throw new Error('nocity');
  return j.results[0];
}

/* ===== Главная функция =====
   Всё считается в браузере, ключи не нужны.
   При желании можно заменить расчёт на внешний API (например, AstrologyAPI),
   сохранив формат возвращаемого объекта. */
async function getAstroData({ date, time, city }) {
  const place = await geocode(city);
  const ts = localToUTC(date, time, place.timezone);
  const jd = ts / 86400000 + 2440587.5, d = jd - 2451543.5;

  const natal = sky(d);
  natal.asc = ascendant(jd, d, place.latitude, place.longitude);

  const planets = NATAL_KEYS.map((k) => ({
    key: k, ...BODIES[k], lon: natal[k],
    sign: SIGNS[Math.floor(natal[k] / 30)], signSym: SIGN_SYM[Math.floor(natal[k] / 30)],
    kw: KEYWORDS[Math.floor(natal[k] / 30)], deg: Math.floor(natal[k] % 30)
  }));

  // Гороскоп на сегодня: где планеты стоят сейчас и как они связаны с вашей картой
  const now = Date.now(), dNow = now / 86400000 + 2440587.5 - 2451543.5;
  const transit = sky(dNow), found = [];
  for (const t of ['moon', 'sun', 'mercury', 'venus', 'mars']) {
    for (const n of NATAL_KEYS) {
      const sep = Math.abs(((transit[t] - natal[n] + 540) % 360) - 180);
      for (const a of ASPECTS) {
        const orb = Math.abs(sep - a[0]);
        if (orb <= (t === 'moon' ? 5 : 3)) found.push({ t, n, orb, a });
      }
    }
  }
  found.sort((x, y) => x.orb - y.orb);
  const moonIdx = Math.floor(transit.moon / 30);
  return {
    place: `${place.name}${place.country ? ', ' + place.country : ''}`, tz: place.timezone, planets,
    horoscope: {
      date: new Date(now).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
      mood: `Луна сегодня в знаке «${SIGNS[moonIdx]}» — общий фон дня: ${KEYWORDS[moonIdx]}.`,
      items: found.slice(0, 3).map(({ t, n, a }) => ({
        text: `${BODIES[t].name} (${BODIES[t].topic}) ${a[2]} вашу сферу: ${BODIES[n].topic}.`,
        label: a[1],
        tip: a[3] ? 'Хороший момент действовать и просить о нужном.' : 'Не торопитесь и не спорьте по мелочам.'
      }))
    }
  };
}

/* ===== Экраны и форма ===== */
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function validate() {
  const rules = [
    ['date', (v) => v && new Date(v) <= new Date() && v >= '1900-01-01', 'Укажите корректную дату рождения'],
    ['time', (v) => !!v, 'Укажите время (если не знаете — примерно 12:00)'],
    ['city', (v) => v.trim().length >= 2, 'Введите город рождения']
  ];
  let ok = true;
  for (const [id, test, msg] of rules) {
    const el = $(id), good = test(el.value);
    el.classList.toggle('invalid', !good);
    $('err-' + id).textContent = good ? '' : msg;
    if (!good) ok = false;
  }
  return ok;
}

function renderResult(data) {
  const [sun, moon, asc] = data.planets;
  $('result-sub').textContent = `${data.place} · Солнце в знаке «${sun.sign}», Луна в знаке «${moon.sign}», Асцендент в знаке «${asc.sign}»`;
  $('cards').innerHTML = data.planets.map((p, i) => `
    <div class="card" style="animation-delay:${i * 90}ms">
      <div class="sym">${p.sym}</div>
      <div class="planet">${p.name}</div>
      <div class="sign">${p.signSym} ${p.sign}, ${p.deg}°</div>
      <p class="what">${p.role}</p>
      <p class="how">В знаке «${p.sign}» это проявляется так: ${p.kw}.</p>
    </div>`).join('');

  const h = data.horoscope;
  $('horoscope').innerHTML = `
    <h3>Гороскоп на ${h.date}</h3>
    <p>${h.mood}</p>
    ${h.items.length
      ? h.items.map((i) => `<p>${i.text} <span class="meta">(${i.label})</span><br>${i.tip}</p>`).join('')
      : '<p>Сегодня нет особо сильных связей с вашей картой — спокойный день, действуйте в своём ритме.</p>'}`;
  $('horoscope').hidden = true;
}

$('birth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validate()) return;                               // Клик 1
  show('screen-loading');
  try {
    renderResult(await getAstroData({ date: $('date').value, time: $('time').value, city: $('city').value }));
    show('screen-result');
  } catch (err) {
    show('screen-form');
    $('city').classList.add('invalid');
    $('err-city').textContent = err.message === 'nocity'
      ? 'Город не найден — проверьте написание'
      : 'Не удалось найти город. Проверьте интернет и попробуйте ещё раз.';
  }
});
$('btn-horoscope').addEventListener('click', () => {      // Клик 2
  $('horoscope').hidden = false;
  $('horoscope').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
$('btn-back').addEventListener('click', () => show('screen-form'));
