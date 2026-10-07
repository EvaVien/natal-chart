'use strict';

/* =====================================================================
   Натальная карта — расчёт целиком в браузере, без ключей и сервера.
   Положения планет: формулы П. Шлитера (с поправками для Юпитера,
   Сатурна и Урана; Плутон — приближённая формула для 1800–2100).
   Дома: Плацидус (на широтах выше 66° — равные дома).
   ===================================================================== */

/* ===== Справочники (простым языком) ===== */
const SIGNS = ['Овен','Телец','Близнецы','Рак','Лев','Дева','Весы','Скорпион','Стрелец','Козерог','Водолей','Рыбы'];
// \uFE0E — просим систему рисовать символ текстом, а не цветным эмодзи
const SIGN_SYM = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'].map((s) => s + '\uFE0E');
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
const HOUSE_TOPICS = [
  'личность и внешность', 'деньги и ресурсы', 'общение и учёба', 'дом и семья',
  'творчество и романтика', 'работа и здоровье', 'партнёрство', 'кризисы и общие ресурсы',
  'путешествия и смыслы', 'карьера и призвание', 'друзья и мечты', 'уединение и подсознание'
];
// name — название, sym — символ, topic — сфера жизни, role — что это значит для человека
const BODIES = {
  sun:     { name: 'Солнце',    sym: '☉', topic: 'характер и жизненная энергия', role: 'Ваша суть: характер, воля и то, кем вы хотите быть.' },
  moon:    { name: 'Луна',      sym: '☽', topic: 'эмоции и душевный комфорт', role: 'Ваш внутренний мир: эмоции, настроение и то, что даёт ощущение уюта и безопасности.' },
  asc:     { name: 'Асцендент', sym: 'Asc', topic: 'самоподача и первое впечатление', role: 'Ваша «обложка»: как вас видят люди при первой встрече и как вы входите в новые ситуации.' },
  mercury: { name: 'Меркурий',  sym: '☿', topic: 'мышление и общение', role: 'Как вы думаете, учитесь и разговариваете с людьми.' },
  venus:   { name: 'Венера',    sym: '♀', topic: 'отношения, симпатии и деньги', role: 'Как вы любите, что вам нравится и как относитесь к красоте и деньгам.' },
  mars:    { name: 'Марс',      sym: '♂', topic: 'энергия и активность', role: 'Ваша энергия: как вы добиваетесь своего, спорите и действуете.' },
  jupiter: { name: 'Юпитер',    sym: '♃', topic: 'рост, удача и возможности', role: 'Где вам легче расти и где приходит удача: вера в себя, широта взглядов, возможности.' },
  saturn:  { name: 'Сатурн',    sym: '♄', topic: 'дисциплина и ответственность', role: 'Ваш внутренний «учитель»: границы, ответственность и то, что даётся трудом и временем.' },
  uranus:  { name: 'Уран',      sym: '♅', topic: 'перемены и свобода', role: 'Где вам нужна свобода и где вы выбиваетесь из шаблонов.', gen: true },
  neptune: { name: 'Нептун',    sym: '♆', topic: 'мечты и интуиция', role: 'Ваши мечты, вдохновение и тонкая чувствительность — и то, где легко себя обмануть.', gen: true },
  pluto:   { name: 'Плутон',    sym: '♇', topic: 'глубинные перемены', role: 'Темы силы и трансформации: то, что в жизни меняется до основания и возрождается.', gen: true }
};
const BODY_ORDER = ['sun', 'moon', 'asc', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
const SKY_KEYS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

// a — угол, orb — допустимое отклонение (орбис), soft — мягкий ли аспект
const ASPECTS = [
  { a: 0,   name: 'соединение', sym: '☌', verb: 'усиливает',          soft: true,  orb: 8, cls: 'conj' },
  { a: 60,  name: 'секстиль',   sym: '⚹', verb: 'мягко поддерживает', soft: true,  orb: 4, cls: 'soft' },
  { a: 90,  name: 'квадрат',    sym: '□', verb: 'обостряет',          soft: false, orb: 6, cls: 'hard' },
  { a: 120, name: 'тригон',     sym: '△', verb: 'облегчает',          soft: true,  orb: 6, cls: 'soft' },
  { a: 180, name: 'оппозиция',  sym: '☍', verb: 'обостряет',          soft: false, orb: 8, cls: 'hard' }
];

/* ===== Математика ===== */
const R = Math.PI / 180;
const norm = (x) => ((x % 360) + 360) % 360;
const sin = (x) => Math.sin(x * R), cos = (x) => Math.cos(x * R), tan = (x) => Math.tan(x * R);
const atan2d = (y, x) => Math.atan2(y, x) / R;
const asind = (x) => Math.asin(x) / R;
const sepAngle = (a, b) => Math.abs(((a - b + 540) % 360) - 180); // 0..180
const $ = (id) => document.getElementById(id);

// Уравнение Кеплера (итерации Ньютона)
function kepler(M, e) {
  let E = M + (e / R) * sin(M) * (1 + e * cos(M));
  for (let i = 0; i < 8; i++) E -= (E - (e / R) * sin(E) - M) / (1 - e * cos(E));
  return E;
}

// Орбитальные элементы (П. Шлитер), d — дней от 31.12.1999 0:00 UT
const ELEMENTS = {
  sun:     (d) => ({ N: 0, i: 0, w: 282.9404 + 4.70935e-5 * d, a: 1, e: 0.016709 - 1.151e-9 * d, M: 356.0470 + 0.9856002585 * d }),
  moon:    (d) => ({ N: 125.1228 - 0.0529538083 * d, i: 5.1454, w: 318.0634 + 0.1643573223 * d, a: 60.2666, e: 0.0549, M: 115.3654 + 13.0649929509 * d }),
  mercury: (d) => ({ N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5e-8 * d, w: 29.1241 + 1.01444e-5 * d, a: 0.387098, e: 0.205635 + 5.59e-10 * d, M: 168.6562 + 4.0923344368 * d }),
  venus:   (d) => ({ N: 76.6799 + 2.4659e-5 * d, i: 3.3946 + 2.75e-8 * d, w: 54.891 + 1.38374e-5 * d, a: 0.72333, e: 0.006773 - 1.302e-9 * d, M: 48.0052 + 1.6021302244 * d }),
  mars:    (d) => ({ N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d, w: 286.5016 + 2.92961e-5 * d, a: 1.523688, e: 0.093405 + 2.516e-9 * d, M: 18.6021 + 0.5240207766 * d }),
  jupiter: (d) => ({ N: 100.4542 + 2.76854e-5 * d, i: 1.3030 - 1.557e-7 * d, w: 273.8777 + 1.64505e-5 * d, a: 5.20256, e: 0.048498 + 4.469e-9 * d, M: 19.8950 + 0.0830853001 * d }),
  saturn:  (d) => ({ N: 113.6634 + 2.38980e-5 * d, i: 2.4886 - 1.081e-7 * d, w: 339.3939 + 2.97661e-5 * d, a: 9.55475, e: 0.055546 - 9.499e-9 * d, M: 316.9670 + 0.0334442282 * d }),
  uranus:  (d) => ({ N: 74.0005 + 1.3978e-5 * d, i: 0.7733 + 1.9e-8 * d, w: 96.6612 + 3.0565e-5 * d, a: 19.18171 - 1.55e-8 * d, e: 0.047318 + 7.45e-9 * d, M: 142.5905 + 0.011725806 * d }),
  neptune: (d) => ({ N: 131.7806 + 3.0173e-5 * d, i: 1.7700 - 2.55e-7 * d, w: 272.8461 - 6.027e-6 * d, a: 30.05826 + 3.313e-8 * d, e: 0.008606 + 2.15e-9 * d, M: 260.2471 + 0.005995147 * d })
};

// Положение в прямоугольных эклиптических координатах
function orbitPos(el) {
  const E = kepler(el.M, el.e);
  const xv = el.a * (cos(E) - el.e), yv = el.a * Math.sqrt(1 - el.e * el.e) * sin(E);
  const r = Math.hypot(xv, yv), u = atan2d(yv, xv) + el.w;
  return {
    x: r * (cos(el.N) * cos(u) - sin(el.N) * sin(u) * cos(el.i)),
    y: r * (sin(el.N) * cos(u) + cos(el.N) * sin(u) * cos(el.i)),
    z: r * sin(u) * sin(el.i)
  };
}

// Взаимные возмущения гигантов (поправки к долготе и широте, в градусах)
const PERTURB = {
  jupiter: (j, s) => ({
    lon: -0.332 * sin(2 * j - 5 * s - 67.6) - 0.056 * sin(2 * j - 2 * s + 21) + 0.042 * sin(3 * j - 5 * s + 21)
         - 0.036 * sin(j - 2 * s) + 0.022 * cos(j - s) + 0.023 * sin(2 * j - 3 * s + 52) - 0.016 * sin(j - 5 * s - 69),
    lat: 0
  }),
  saturn: (j, s) => ({
    lon: 0.812 * sin(2 * j - 5 * s - 67.6) - 0.229 * cos(2 * j - 4 * s - 2) + 0.119 * sin(j - 2 * s - 3)
         + 0.046 * sin(2 * j - 6 * s - 69) + 0.014 * sin(j - 3 * s + 32),
    lat: -0.020 * cos(2 * j - 4 * s - 2) + 0.018 * sin(2 * j - 6 * s - 49)
  }),
  uranus: (j, s, u) => ({
    lon: 0.040 * sin(s - 2 * u + 6) + 0.035 * sin(s - 3 * u + 33) - 0.015 * sin(j - u + 20),
    lat: 0
  })
};

// Плутон: приближённая формула (верна для 1800–2100)
function plutoPos(d) {
  const S = 50.03 + 0.033459652 * d, P = 238.95 + 0.003968789 * d;
  const lon = 238.9508 + 0.00400703 * d - 19.799 * sin(P) + 19.848 * cos(P) + 0.897 * sin(2 * P) - 4.956 * cos(2 * P)
    + 0.610 * sin(3 * P) + 1.211 * cos(3 * P) - 0.341 * sin(4 * P) - 0.190 * cos(4 * P) + 0.128 * sin(5 * P)
    - 0.034 * cos(5 * P) - 0.038 * sin(6 * P) + 0.031 * cos(6 * P) + 0.020 * sin(S - P) - 0.010 * cos(S - P);
  const lat = -3.9082 - 5.453 * sin(P) - 14.975 * cos(P) + 3.527 * sin(2 * P) + 1.673 * cos(2 * P)
    - 1.051 * sin(3 * P) + 0.328 * cos(3 * P) + 0.179 * sin(4 * P) - 0.292 * cos(4 * P) + 0.019 * sin(5 * P)
    + 0.100 * cos(5 * P) - 0.031 * sin(S - P) - 0.026 * cos(S - P) + 0.011 * cos(S - 2 * P);
  const r = 40.72 + 6.68 * sin(P) + 6.90 * cos(P) - 1.18 * sin(2 * P) - 0.03 * cos(2 * P) + 0.15 * sin(3 * P) - 0.14 * cos(3 * P);
  return { x: r * cos(lat) * cos(lon), y: r * cos(lat) * sin(lon) };
}

// Эклиптические долготы (в градусах) Солнца, Луны и планет
function sky(d) {
  const se = ELEMENTS.sun(d), s = orbitPos(se);
  const out = { sun: norm(atan2d(s.y, s.x)) };
  const Mj = ELEMENTS.jupiter(d).M, Ms = ELEMENTS.saturn(d).M, Mu = ELEMENTS.uranus(d).M;

  for (const k of ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
    let p = orbitPos(ELEMENTS[k](d));
    if (PERTURB[k]) {
      let lon = atan2d(p.y, p.x), lat = atan2d(p.z, Math.hypot(p.x, p.y));
      const r = Math.hypot(p.x, p.y, p.z), c = PERTURB[k](Mj, Ms, Mu);
      lon += c.lon; lat += c.lat;
      p = { x: r * cos(lat) * cos(lon), y: r * cos(lat) * sin(lon) };
    }
    out[k] = norm(atan2d(p.y + s.y, p.x + s.x)); // гелио- → геоцентрическая
  }
  const pl = plutoPos(d);
  out.pluto = norm(atan2d(pl.y + s.y, pl.x + s.x));

  const me = ELEMENTS.moon(d), m = orbitPos(me);
  const Ms_ = se.M, Mm = me.M, D = (Mm + me.w + me.N) - (Ms_ + se.w), F = (Mm + me.w + me.N) - me.N;
  const corr = -1.274 * sin(Mm - 2 * D) + 0.658 * sin(2 * D) - 0.186 * sin(Ms_) - 0.059 * sin(2 * Mm - 2 * D)
    - 0.057 * sin(Mm - 2 * D + Ms_) + 0.053 * sin(Mm + 2 * D) + 0.046 * sin(2 * D - Ms_) + 0.041 * sin(Mm - Ms_)
    - 0.035 * sin(D) - 0.031 * sin(Mm + Ms_) - 0.015 * sin(2 * F - 2 * D) + 0.011 * sin(Mm - 4 * D);
  out.moon = norm(atan2d(m.y, m.x) + corr);
  return out;
}

// Ретроградность: планета идёт «назад», если за сутки её долгота уменьшается
function retroFlags(d) {
  const a = sky(d - 0.5), b = sky(d + 0.5), out = {};
  for (const k of SKY_KEYS) {
    if (k === 'sun' || k === 'moon') continue;
    out[k] = ((b[k] - a[k] + 540) % 360) - 180 < 0;
  }
  return out;
}

/* ===== Асцендент, МС и дома ===== */
const obliquity = (d) => 23.4393 - 3.563e-7 * d;
const ramcOf = (jd, lon) => norm(280.46061837 + 360.98564736629 * (jd - 2451545) + lon);

function ascendant(ramc, eps, lat) {
  return norm(atan2d(cos(ramc), -(sin(ramc) * cos(eps) + tan(lat) * sin(eps))));
}
const midheaven = (ramc, eps) => norm(atan2d(sin(ramc), cos(ramc) * cos(eps)));

// Плацидус: вершины домов 11, 12, 2, 3 находятся итерациями. Остальные — по симметрии.
function buildHouses(ramc, eps, lat, asc, mc) {
  const raToLon = (ra) => norm(atan2d(sin(ra), cos(ra) * cos(eps)));
  const cusp = (frac, above, start) => {
    let lon = raToLon(start);
    for (let i = 0; i < 40; i++) {
      const t = tan(lat) * tan(asind(sin(eps) * sin(lon)));
      if (!(Math.abs(t) < 1)) return NaN;
      const ad = asind(t);
      const ra = above ? ramc + frac * (90 + ad) : ramc + 180 - frac * (90 - ad);
      const next = raToLon(ra), done = sepAngle(next, lon) < 1e-7;
      lon = next;
      if (done) break;
    }
    return lon;
  };
  const c11 = cusp(1 / 3, true, ramc + 30), c12 = cusp(2 / 3, true, ramc + 60);
  const c2 = cusp(2 / 3, false, ramc + 120), c3 = cusp(1 / 3, false, ramc + 150);

  if (Math.abs(lat) > 66 || [c11, c12, c2, c3].some(Number.isNaN)) {
    return { system: 'равные дома', cusps: Array.from({ length: 12 }, (_, i) => norm(asc + 30 * i)) };
  }
  return {
    system: 'Плацидус',
    cusps: [asc, c2, c3, norm(mc + 180), norm(c11 + 180), norm(c12 + 180), norm(asc + 180), norm(c2 + 180), norm(c3 + 180), mc, c11, c12]
  };
}
function houseOf(lon, cusps) {
  for (let i = 0; i < 12; i++) {
    if (norm(lon - cusps[i]) < norm(cusps[(i + 1) % 12] - cusps[i])) return i + 1;
  }
  return 1;
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
  const utc = guess - tzOffset(guess, tz);
  return guess - tzOffset(utc, tz);
}
const dayNumber = (ts) => ts / 86400000 + 2440587.5 - 2451543.5;
const julian = (ts) => ts / 86400000 + 2440587.5;

// Геокодер Open-Meteo (без ключа). Возвращает до 5 разных вариантов — пользователь выберет нужный.
async function geocode(city) {
  const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=10&language=ru&format=json&name=' + encodeURIComponent(city.trim()));
  if (!r.ok) throw new Error('network');
  const j = await r.json();
  const seen = new Set(), out = [];
  for (const p of j.results || []) {
    const key = [p.name, p.admin1, p.country_code].join('|');
    if (!p.timezone || seen.has(key)) continue;
    seen.add(key); out.push(p);
    if (out.length === 5) break;
  }
  if (!out.length) throw new Error('nocity');
  return out;
}
const placeLabel = (p) => [p.name, p.admin1, p.country].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');

/* ===== Расчёт карты ===== */
function computeChart({ date, time, unknownTime, place }) {
  const ts = localToUTC(date, unknownTime ? '12:00' : time, place.timezone);
  if (ts > Date.now()) throw new Error('future');
  const jd = julian(ts), d = dayNumber(ts);

  const natal = sky(d), retro = retroFlags(d);
  let cusps = null, system = null, asc = null, mc = null;
  if (!unknownTime) {
    const eps = obliquity(d), ramc = ramcOf(jd, place.longitude);
    asc = ascendant(ramc, eps, place.latitude);
    mc = midheaven(ramc, eps);
    ({ cusps, system } = buildHouses(ramc, eps, place.latitude, asc, mc));
    natal.asc = asc;
  }

  // Если времени нет, Луна за сутки проходит ~13° и может сменить знак
  let moonSigns = null;
  if (unknownTime) {
    const a = sky(dayNumber(localToUTC(date, '00:00', place.timezone))).moon;
    const b = sky(dayNumber(localToUTC(date, '23:59', place.timezone))).moon;
    const sa = Math.floor(a / 30), sb = Math.floor(b / 30);
    moonSigns = sa === sb ? [sa] : [sa, sb];
  }

  const keys = BODY_ORDER.filter((k) => !(k === 'asc' && unknownTime));
  const planets = keys.map((k) => {
    const lon = natal[k], si = Math.floor(lon / 30);
    const p = {
      key: k, ...BODIES[k], lon, sign: SIGNS[si], signSym: SIGN_SYM[si], kw: KEYWORDS[si],
      deg: Math.floor(lon % 30), min: Math.floor(((lon % 30) % 1) * 60), retro: !!retro[k],
      house: cusps && k !== 'asc' ? houseOf(lon, cusps) : null
    };
    if (k === 'moon' && moonSigns && moonSigns.length > 1) {
      p.approx = true;
      p.sign = `${SIGNS[moonSigns[0]]} или ${SIGNS[moonSigns[1]]}`;
      p.signSym = SIGN_SYM[moonSigns[0]];
      p.kw = `${KEYWORDS[moonSigns[0]]} — или же: ${KEYWORDS[moonSigns[1]]}`;
      p.note = 'В день рождения Луна сменила знак, а без времени узнать, какой из двух ваш, нельзя.';
    } else if (k === 'moon' && unknownTime) {
      p.note = 'Луна быстрая, так что градусы приблизительные — знак надёжен.';
    }
    return p;
  });

  return {
    place: placeLabel(place), tz: place.timezone, planets, natal,
    timeKnown: !unknownTime, asc, mc, cusps, system,
    aspects: natalAspects(planets)
  };
}

function natalAspects(planets) {
  const out = [];
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const A = planets[i], B = planets[j], sep = sepAngle(A.lon, B.lon);
      const slow = (A.gen || B.gen) ? 2 : 0;
      for (const a of ASPECTS) {
        const orb = Math.abs(sep - a.a);
        if (orb <= a.orb - slow) { out.push({ a: A, b: B, asp: a, orb }); break; }
      }
    }
  }
  return out.sort((x, y) => x.orb - y.orb);
}

/* ===== Гороскоп на сейчас =====
   Считается в момент нажатия кнопки: небо меняется, особенно Луна. */
const TRANSIT_ORBS = { moon: 5, sun: 3, mercury: 3, venus: 3, mars: 3, jupiter: 2, saturn: 2 };
function horoscopeFor(data, nowTs) {
  const transit = sky(dayNumber(nowTs)), found = [];
  for (const t of Object.keys(TRANSIT_ORBS)) {
    for (const p of data.planets) {
      const sep = sepAngle(transit[t], p.lon);
      for (const a of ASPECTS) {
        const orb = Math.abs(sep - a.a);
        if (orb <= TRANSIT_ORBS[t]) { found.push({ t, n: p.key, orb, a }); break; }
      }
    }
  }
  found.sort((x, y) => x.orb - y.orb);
  const moonIdx = Math.floor(transit.moon / 30);
  return {
    when: new Date(nowTs).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
    mood: `Луна сегодня в знаке «${SIGNS[moonIdx]}» — общий фон дня: ${KEYWORDS[moonIdx]}.`,
    items: found.slice(0, 3).map(({ t, n, a }) => ({
      text: `${BODIES[t].name} (${BODIES[t].topic}) ${a.verb} вашу сферу: ${BODIES[n].topic}.`,
      label: `${a.sym} ${a.name} с вашим объектом «${BODIES[n].name}»`,
      tip: a.soft ? 'Хороший момент действовать и просить о нужном.' : 'Не торопитесь и не спорьте по мелочам.'
    }))
  };
}

/* ===== Колесо карты (SVG) ===== */
function wheelSVG(data) {
  const S = 700, C = S / 2, R1 = 300, R2 = 258, R3 = 120;
  const ref = data.timeKnown ? data.asc : 0;                 // Асцендент слева; без времени — Овен слева
  const pt = (r, lon) => {
    const a = (180 + lon - ref) * R;
    return [C + r * Math.cos(a), C - r * Math.sin(a)];
  };
  const f = (n) => n.toFixed(1);
  const line = (r1, l1, r2, l2, cls) => {
    const [x1, y1] = pt(r1, l1), [x2, y2] = pt(r2, l2);
    return `<line class="${cls}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
  };
  const text = (r, lon, str, cls) => {
    const [x, y] = pt(r, lon);
    return `<text class="${cls}" x="${f(x)}" y="${f(y)}">${str}</text>`;
  };
  let s = `<svg viewBox="0 0 ${S} ${S}" class="wheel" role="img" aria-label="Колесо натальной карты: знаки зодиака, дома, планеты и аспекты">`;

  // Знаки зодиака
  for (let i = 0; i < 12; i++) {
    const a = i * 30, b = a + 30;
    const [ox1, oy1] = pt(R1, a), [ox2, oy2] = pt(R1, b), [ix1, iy1] = pt(R2, a), [ix2, iy2] = pt(R2, b);
    s += `<path class="sec sec${i % 2}" d="M${f(ox1)} ${f(oy1)} A${R1} ${R1} 0 0 0 ${f(ox2)} ${f(oy2)} L${f(ix2)} ${f(iy2)} A${R2} ${R2} 0 0 1 ${f(ix1)} ${f(iy1)}Z"><title>${SIGNS[i]}</title></path>`;
    s += text((R1 + R2) / 2, a + 15, SIGN_SYM[i], 'zsign');
  }
  s += `<circle class="ring" cx="${C}" cy="${C}" r="${R1}"/><circle class="ring" cx="${C}" cy="${C}" r="${R2}"/><circle class="ring" cx="${C}" cy="${C}" r="${R3}"/>`;
  for (let l = 0; l < 360; l += 5) s += line(R2, l, R2 - (l % 10 === 0 ? 9 : 5), l, 'tick');

  // Дома и углы
  if (data.cusps) {
    data.cusps.forEach((c, i) => {
      s += line(R3, c, R2, c, i % 3 === 0 ? 'cusp main' : 'cusp');
      const mid = c + norm(data.cusps[(i + 1) % 12] - c) / 2;
      s += text(R3 + 16, mid, i + 1, 'hnum');
    });
    [['Asc', data.cusps[0]], ['IC', data.cusps[3]], ['Dsc', data.cusps[6]], ['MC', data.cusps[9]]]
      .forEach(([n, l]) => { s += text(R1 + 22, l, n, 'angle'); });
  }

  // Планеты: расталкиваем, чтобы значки не налезали друг на друга
  const pl = data.planets.filter((p) => p.key !== 'asc');
  const items = pl.map((p) => ({ p, d: p.lon })).sort((x, y) => x.d - y.d);
  const MIN = 10;
  for (let it = 0; it < 60 && items.length > 1; it++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      const j = (i + 1) % items.length, gap = norm(items[j].d - items[i].d);
      if (gap < MIN) { const k = (MIN - gap) / 2; items[i].d -= k; items[j].d += k; moved = true; }
    }
    if (!moved) break;
  }

  // Аспекты рисуем под планетами
  for (const x of data.aspects) {
    if (x.a.key === 'asc' || x.b.key === 'asc') continue;
    const [x1, y1] = pt(R3, x.a.lon), [x2, y2] = pt(R3, x.b.lon);
    s += `<line class="asp ${x.asp.cls}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"><title>${x.a.name} ${x.asp.sym} ${x.b.name}: ${x.asp.name}</title></line>`;
  }
  for (const { p, d } of items) {
    s += line(R2, p.lon, R2 - 7, p.lon, 'ptick');
    if (Math.abs(d - p.lon) > 0.5) s += line(R2 - 7, p.lon, 238, d, 'lead');
    const cls = p.approx || (p.key === 'moon' && !data.timeKnown) ? 'pl approx' : 'pl';
    s += `<g><title>${p.name} в знаке «${p.sign}», ${p.deg}°${p.retro ? ' (ретроградный)' : ''}</title>`
      + text(222, d, p.sym + '\uFE0E', cls)
      + text(194, d, `${p.deg}°${p.retro ? '℞' : ''}`, 'pdeg') + '</g>';
  }
  return s + '</svg>';
}

/* ===== Экраны и форма (работает только в браузере) ===== */
if (typeof document !== 'undefined') {
  const pad = (n) => String(n).padStart(2, '0');
  const todayISO = () => { const n = new Date(); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`; };
  let current = null; // последняя рассчитанная карта

  const show = (id) => {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $(id).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const setErr = (id, msg) => {
    $(id).classList.toggle('invalid', !!msg);
    $('err-' + id).textContent = msg || '';
  };
  const readForm = () => ({ date: $('date').value, time: $('time').value, city: $('city').value, unknownTime: $('no-time').checked });

  function validate() {
    const v = readForm(), today = todayISO();
    const checks = [
      ['date', !v.date ? 'Укажите дату рождения' : v.date < '1900-01-01' ? 'Расчёт работает с 1900 года' : v.date > today ? 'Эта дата ещё не наступила' : ''],
      ['time', v.unknownTime || v.time ? '' : 'Укажите время или отметьте, что его не знаете'],
      ['city', v.city.trim().length >= 2 ? '' : 'Введите город рождения']
    ];
    checks.forEach(([id, msg]) => setErr(id, msg));
    return checks.every(([, msg]) => !msg);
  }

  const glyph = (p) => (p.key === 'asc' ? '' : p.sym + '\uFE0E ');

  function renderResult(data) {
    const moon = data.planets.find((p) => p.key === 'moon'), sun = data.planets[0], asc = data.planets.find((p) => p.key === 'asc');
    $('result-sub').textContent = `${data.place} · Солнце в знаке «${sun.sign}», Луна в знаке «${moon.sign}»` + (asc ? `, Асцендент в знаке «${asc.sign}»` : '');
    $('wheel-box').innerHTML = wheelSVG(data);
    $('wheel-note').textContent = data.timeKnown
      ? `Дома: ${data.system}. Асцендент слева, МС сверху — так принято читать карту. Наведите курсор на планету или линию, чтобы увидеть подпись.`
      : 'Время рождения неизвестно: карта построена на полдень, поэтому Асцендент и дома не показаны, а положение Луны приблизительно.';

    $('cards').innerHTML = data.planets.map((p, i) => `
      <div class="card" style="animation-delay:${i * 70}ms">
        <div class="sym">${p.sym}</div>
        <div class="planet">${p.name}${p.retro ? ' · ретроградный' : ''}</div>
        <div class="sign">${p.signSym} ${p.sign}, ${p.deg}°${String(p.min).padStart(2, '0')}′</div>
        ${p.house ? `<div class="house">${p.house}-й дом: ${HOUSE_TOPICS[p.house - 1]}</div>` : ''}
        <p class="what">${p.role}</p>
        <p class="how">В знаке «${p.sign}» это проявляется так: ${p.kw}.</p>
        ${p.gen ? '<p class="how">Знак общий для всех, кто родился в эти годы — личное здесь говорят дом и аспекты.</p>' : ''}
        ${p.note ? `<p class="how warn">${p.note}</p>` : ''}
      </div>`).join('');

    $('aspects-count').textContent = data.aspects.length;
    $('aspects-list').innerHTML = data.aspects.length
      ? data.aspects.map((x) => `<li class="asp-row ${x.asp.cls}"><span>${glyph(x.a)}${x.a.name}</span><span class="as">${x.asp.sym}\uFE0E</span><span>${glyph(x.b)}${x.b.name}</span><span class="m">${x.asp.name}, ${x.orb.toFixed(1)}°</span></li>`).join('')
      : '<li class="asp-row">Явных аспектов нет.</li>';

    $('horoscope').hidden = true;
  }

  function renderHoroscope() {
    const h = horoscopeFor(current, Date.now());
    $('horoscope').innerHTML = `
      <h3>Гороскоп на ${h.when}</h3>
      <p>${h.mood}</p>
      ${h.items.length
        ? h.items.map((i) => `<p>${i.text}<br><span class="meta">${i.label}</span><br>${i.tip}</p>`).join('')
        : '<p>Сейчас нет особо сильных связей с вашей картой — спокойное время, действуйте в своём ритме.</p>'}
      <p class="meta">Рассчитано на момент нажатия кнопки. Луна меняет аспекты за считаные часы — нажмите снова позже, и картина обновится.</p>`;
    $('horoscope').hidden = false;
    $('horoscope').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function finish(place) {
    show('screen-loading');
    try {
      current = computeChart({ ...readForm(), place });
      renderResult(current);
      show('screen-result');
    } catch (err) {
      show('screen-form');
      if (err.message === 'future') setErr('date', 'Этот момент ещё не наступил');
      else setErr('city', 'Не удалось построить карту. Попробуйте ещё раз.');
    }
  }

  function showChoices(places) {
    const box = $('city-choices');
    box.innerHTML = '';
    const hint = document.createElement('p');
    hint.className = 'choices-hint';
    hint.textContent = 'Нашлось несколько мест — выберите нужное:';
    box.appendChild(hint);
    places.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'choice';
      b.textContent = placeLabel(p);
      b.addEventListener('click', () => { box.hidden = true; finish(p); });
      box.appendChild(b);
    });
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  $('birth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('city-choices').hidden = true;
    if (!validate()) return;                              // Клик 1
    show('screen-loading');
    try {
      const places = await geocode($('city').value);
      if (places.length === 1) return finish(places[0]);
      show('screen-form');
      showChoices(places);
    } catch (err) {
      show('screen-form');
      setErr('city', err.message === 'nocity'
        ? 'Город не найден — проверьте написание'
        : 'Не удалось найти город. Проверьте интернет и попробуйте ещё раз.');
    }
  });
  $('city').addEventListener('input', () => { $('city-choices').hidden = true; });
  $('no-time').addEventListener('change', () => {
    const off = $('no-time').checked;
    $('time').disabled = off;
    if (off) { $('time').value = ''; setErr('time', ''); }
  });
  $('btn-horoscope').addEventListener('click', renderHoroscope);  // Клик 2
  $('btn-back').addEventListener('click', () => show('screen-form'));
}

if (typeof module !== 'undefined') {
  module.exports = { sky, ascendant, midheaven, buildHouses, houseOf, ramcOf, obliquity, retroFlags, computeChart, horoscopeFor, wheelSVG, localToUTC, julian, dayNumber, natalAspects };
}
