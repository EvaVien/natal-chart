/* =====================================================================
   Эфемерида — логика
   Зоны: 1. astronomy, 2. timezone, 3. geocoding, 4. chart, 5. ui, 6. bootstrap
   ===================================================================== */

// ===== 1. ASTRONOMY =====
// Формулы П. Шлитера (Paul Schlyter, «How to compute planetary positions») с поправками
// на возмущения Юпитера, Сатурна и Урана; Плутон — приближённая формула для 1800–2100.
// Точность и пределы подтверждены тестами против Swiss Ephemeris (см. tests/ и README).
const R = Math.PI / 180;
const sin = (d) => Math.sin(d * R), cos = (d) => Math.cos(d * R), tan = (d) => Math.tan(d * R);
const asind = (x) => Math.asin(x) / R, atan2d = (y, x) => Math.atan2(y, x) / R;
const norm = (d) => ((d % 360) + 360) % 360;
const sepAngle = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

const SKY_KEYS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

// Уравнение Кеплера (итерации Ньютона)
function kepler(M, e) {
  let E = M + (e / R) * sin(M) * (1 + e * cos(M));
  for (let i = 0; i < 8; i++) E -= (E - (e / R) * sin(E) - M) / (1 - e * cos(E));
  return E;
}

// Орбитальные элементы; d — дней от 31.12.1999 0:00 UT
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

// Взаимные возмущения гигантов (поправки к эклиптической долготе и широте, градусы)
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

// Эклиптические долготы Солнца, Луны и планет (градусы, экватор даты)
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

// Ретроградность: долгота за сутки уменьшается (Солнце и Луна не бывают ретроградными)
function retroFlags(d) {
  const a = sky(d - 0.5), b = sky(d + 0.5), out = {};
  for (const k of SKY_KEYS) {
    if (k === 'sun' || k === 'moon') continue;
    out[k] = ((b[k] - a[k] + 540) % 360) - 180 < 0;
  }
  return out;
}

// ===== 2. TIMEZONE =====
// Локальное время рождения → момент UTC. Главное правило: если локальное время невозможно
// (переход вперёд) или неоднозначно (переход назад), мы НЕ выбираем «ближайшее» молча,
// а возвращаем структурированный результат.
const makeFail = (code, extra = {}) => Object.assign(new Error(code), { code }, extra);

function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
}

const _dtfCache = new Map();
function tzOffset(ts, tz) {
  let f = _dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    _dtfCache.set(tz, f);
  }
  const o = {};
  f.formatToParts(new Date(ts)).forEach((p) => { o[p.type] = +p.value; });
  // era может дать год ≤ 0 только для очень древних дат; в нашем диапазоне это не возникает
  return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - Math.floor(ts / 1000) * 1000;
}

const fmtOffset = (ms) => {
  const m = Math.round(ms / 60000), a = Math.abs(m);
  return `UTC${m < 0 ? '−' : '+'}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`;
};

// Находит все моменты UTC, в которые на стенных часах зоны tz показывается date time.
// 0 моментов → «дыра» (invalid), 1 → обычное время, 2 → «нахлёст» (ambiguous).
function resolveLocal(date, time, tz) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ''), tm = /^(\d{2}):(\d{2})$/.exec(time || '');
  if (!dm || !tm) return { status: 'invalid-input', candidates: [] };
  const [y, m, d, h, mi] = [+dm[1], +dm[2], +dm[3], +tm[1], +tm[2]];
  const wall = Date.UTC(y, m - 1, d, h, mi);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) {
    return { status: 'invalid-input', candidates: [] };
  }
  if (!isValidTimeZone(tz)) return { status: 'invalid-timezone', candidates: [] };
  // Кандидаты смещений берём из окрестности ±36 ч (переходы случаются раз в месяцы, не в часы)
  const offsets = new Set([tzOffset(wall - 36 * 3600e3, tz), tzOffset(wall, tz), tzOffset(wall + 36 * 3600e3, tz)]);
  const candidates = [];
  for (const off of offsets) {
    const ts = wall - off;
    if (tzOffset(ts, tz) === off) candidates.push({ ts, offset: off });
  }
  candidates.sort((a, b) => a.ts - b.ts);
  const status = candidates.length === 0 ? 'invalid-local-time' : candidates.length === 1 ? 'ok' : 'ambiguous-local-time';
  return { status, candidates };
}

// Совместимый интерфейс: { ts } | { error, ts?, ts2?, offsets? }
function localToUTC(date, time, tz) {
  const r = resolveLocal(date, time, tz);
  if (r.status === 'ok') return { ts: r.candidates[0].ts, offset: r.candidates[0].offset };
  if (r.status === 'ambiguous-local-time') {
    const [a, b] = r.candidates;
    return { error: r.status, ts: a.ts, ts2: b.ts, offsets: [a.offset, b.offset] };
  }
  return { error: r.status };
}

// Для неизвестного времени: границы местных суток и «полдень» берём мягко (первый существующий момент),
// потому что точного времени всё равно нет. Это НЕ используется для известного времени рождения.
function lenientLocal(date, times, tz, pick) {
  for (const t of times) {
    const r = resolveLocal(date, t, tz);
    if (r.candidates.length) return pick === 'last' ? r.candidates[r.candidates.length - 1].ts : r.candidates[0].ts;
  }
  return null;
}
const dayStartTs = (date, tz) => lenientLocal(date, ['00:00', '01:00', '02:00', '03:00'], tz, 'first');
const dayEndTs = (date, tz) => lenientLocal(date, ['23:59', '22:59', '21:59', '20:59'], tz, 'last');
const dayNoonTs = (date, tz) => lenientLocal(date, ['12:00', '11:00', '13:00', '10:00'], tz, 'first');

const dayNumber = (ts) => ts / 86400000 + 2440587.5 - 2451543.5;
const julian = (ts) => ts / 86400000 + 2440587.5;

// ===== 3. GEOCODING =====
// Open-Meteo geocoding. Ошибки — коды: timeout | offline | network | service | nocity | superseded.
// Запрос можно прервать (новый запрос отменяет предыдущий), по истечении таймаута он прерывается сам.
const GEO_TIMEOUT_MS = 9000;
let _geoCtl = null;

const normText = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

// «Уфа, Башкортостан» → { name: 'Уфа', hints: ['башкортостан'] }
function parseCityQuery(raw) {
  const parts = String(raw || '').split(',').map(normText).filter(Boolean);
  return { name: parts[0] || '', hints: parts.slice(1), display: String(raw || '').split(',')[0].trim() };
}

function validPlace(p) {
  return p && typeof p === 'object' && typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 120
    && Number.isFinite(p.latitude) && p.latitude >= -90 && p.latitude <= 90
    && Number.isFinite(p.longitude) && p.longitude >= -180 && p.longitude <= 180
    && isValidTimeZone(p.timezone);
}

function rankPlaces(results, query) {
  const q = parseCityQuery(query);
  return results.map((p, i) => {
    const name = normText(p.name), admin = normText(p.admin1), country = normText(p.country), cc = normText(p.country_code);
    let score = name === q.name ? 100 : name.startsWith(q.name) ? 40 : name.includes(q.name) ? 10 : 0;
    for (const h of q.hints) {
      if (admin === h || country === h || cc === h) score += 60;
      else if (admin.includes(h) || country.includes(h)) score += 25;
    }
    return { p, i, score, pop: Number.isFinite(p.population) ? p.population : 0 };
  }).sort((a, b) => b.score - a.score || b.pop - a.pop || a.i - b.i).map((x) => x.p);
}

async function geocode(city, opts = {}) {
  const doFetch = opts.fetch || (typeof fetch === 'function' ? fetch : null);
  const timeoutMs = opts.timeoutMs || GEO_TIMEOUT_MS;
  const q = parseCityQuery(city);
  if (q.name.length < 2) throw makeFail('nocity');
  if (!doFetch) throw makeFail('network');
  if (_geoCtl) _geoCtl.abort();                 // новый запрос отменяет предыдущий
  const ctl = _geoCtl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, timeoutMs);
  try {
    const url = 'https://geocoding-api.open-meteo.com/v1/search?count=10&language=ru&format=json&name=' + encodeURIComponent(q.display);
    let res;
    try {
      res = await doFetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    } catch (e) {
      if (ctl.signal.aborted) throw makeFail(timedOut ? 'timeout' : 'superseded');
      throw makeFail(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'network');
    }
    if (!res.ok) throw makeFail('service', { status: res.status });
    let data;
    try { data = await res.json(); } catch (e) {
      if (ctl.signal.aborted) throw makeFail(timedOut ? 'timeout' : 'superseded');
      throw makeFail('service');                // тело ответа — не JSON
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw makeFail('service');
    if (data.results === undefined) throw makeFail('nocity');      // Open-Meteo не возвращает поле, если ничего не найдено
    if (!Array.isArray(data.results)) throw makeFail('service');
    const valid = data.results.filter(validPlace);
    if (!valid.length) throw makeFail(data.results.length ? 'service' : 'nocity');
    const seen = new Set(), out = [];
    for (const p of rankPlaces(valid, city)) {
      const key = `${p.name}|${p.admin1}|${p.country_code}|${Math.round(p.latitude * 10)}|${Math.round(p.longitude * 10)}`;
      if (!seen.has(key)) { seen.add(key); out.push(p); if (out.length === 5) break; }
    }
    return out;
  } finally {
    clearTimeout(timer);
    if (_geoCtl === ctl) _geoCtl = null;
  }
}

const placeLabel = (p) => [p.name, p.admin1, p.country].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
// В списке выбора: если подписи совпадают, добавляем часовой пояс, чтобы места можно было различить
function choiceLabels(places) {
  const base = places.map(placeLabel);
  return base.map((l, i) => (base.indexOf(l) !== i || base.lastIndexOf(l) !== i ? `${l} (${places[i].timezone})` : l));
}

// ===== 3b. PERSISTENCE & SHARE (чистые функции, без DOM) =====
// Данные рождения — личные. Поэтому: сохранение и ссылка создаются только по явному действию пользователя,
// всё, что приходит из localStorage или из URL, считается недоверенным и проходит строгую проверку.
const STORAGE_KEY = 'efemerida:saved-chart:v1';

const cleanText = (v, max) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
const isRealDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
const isTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');
const NUM = /^-?\d{1,3}(\.\d{1,8})?$/;

function cleanPlace(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const p = { name: cleanText(raw.name, 120), timezone: typeof raw.timezone === 'string' ? raw.timezone : '', latitude: raw.latitude, longitude: raw.longitude };
  const a = cleanText(raw.admin1, 120), c = cleanText(raw.country, 120);
  if (a) p.admin1 = a;
  if (c) p.country = c;
  return validPlace(p) ? p : null;
}

// Общая проверка введённых данных: возвращает { date, time|null, place } или null
function cleanChartInput({ date, time, place }, today) {
  if (!isRealDate(date) || date < MIN_DATE || (today && date > today)) return null;
  if (time !== null && !isTime(time)) return null;
  const p = cleanPlace(place);
  return p ? { date, time, place: p } : null;
}

// Параметры ссылки: ?date=YYYY-MM-DD&time=HH:MM&city=…&lat=…&lon=…&tz=…  (без time — время неизвестно)
function buildShareQuery(chart) {
  const q = new URLSearchParams();
  q.set('date', chart.birth.date);
  if (chart.birth.time) q.set('time', chart.birth.time);
  q.set('city', chart.place);
  q.set('lat', String(Math.round(chart.lat * 1e4) / 1e4));
  q.set('lon', String(Math.round(chart.lon * 1e4) / 1e4));
  q.set('tz', chart.tz);
  return q.toString();
}

function parseShareQuery(search, today) {
  const q = new URLSearchParams(search);
  if (!q.has('date') && !q.has('lat') && !q.has('tz')) return { status: 'none' };
  const lat = q.get('lat'), lon = q.get('lon');
  if (!NUM.test(lat || '') || !NUM.test(lon || '')) return { status: 'invalid' };
  if ((q.get('city') || '').length > 120) return { status: 'invalid' };   // подозрительно длинное имя — отказ, а не молчаливая обрезка
  const rawTime = q.get('time');
  const input = cleanChartInput({
    date: q.get('date'), time: rawTime ? rawTime : null,
    place: { name: q.get('city'), timezone: q.get('tz'), latitude: Number(lat), longitude: Number(lon) }
  }, today);
  return input ? { status: 'ok', input } : { status: 'invalid' };
}

function serializeSaved(chart) {
  return JSON.stringify({ v: 1, date: chart.birth.date, time: chart.birth.time, place: chart.placeRef, savedAt: Date.now() });
}
function parseSaved(text, today) {
  let o;
  try { o = JSON.parse(text); } catch (e) { return null; }
  if (!o || typeof o !== 'object' || o.v !== 1) return null;
  return cleanChartInput({ date: o.date, time: o.time === undefined ? null : o.time, place: o.place }, today);
}

// ===== 4. CHART CALCULATION =====
const obliquity = (d) => 23.4393 - 3.563e-7 * d;
const ramcOf = (jd, lon) => norm(280.46061837 + 360.98564736629 * (jd - 2451545) + lon);

const midheaven = (ramc, eps) => norm(atan2d(sin(ramc), cos(ramc) * cos(eps)));

// Асцендент — точка эклиптики, которая сейчас восходит. Формула atan2 даёт одну из двух точек пересечения
// эклиптики с горизонтом; выше ~65° с.ш./ю.ш. она может вернуть западную (заходящую) вместо восточной —
// ошибка ровно на 180°. Поэтому проверяем: Асцендент всегда лежит в пределах 180° к востоку от МС
// (правило подтверждено сверкой со Swiss Ephemeris, см. tests/astronomy.test.js).
function ascendant(ramc, eps, lat) {
  const asc = norm(atan2d(cos(ramc), -(sin(ramc) * cos(eps) + tan(lat) * sin(eps))));
  return norm(asc - midheaven(ramc, eps)) > 180 ? norm(asc + 180) : asc;
}

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
      lon = next; if (done) break;
    }
    return lon;
  };
  const c11 = cusp(1 / 3, true, ramc + 30), c12 = cusp(2 / 3, true, ramc + 60);
  const c2 = cusp(2 / 3, false, ramc + 120), c3 = cusp(1 / 3, false, ramc + 150);

  if (Math.abs(lat) > 66 || [c11, c12, c2, c3].some(Number.isNaN)) {
    return { system: 'равные дома', cusps: Array.from({ length: 12 }, (_, i) => norm(asc + 30 * i)) };
  }
  return { system: 'Плацидус', cusps: [asc, c2, c3, norm(mc + 180), norm(c11 + 180), norm(c12 + 180), norm(asc + 180), norm(c2 + 180), norm(c3 + 180), mc, c11, c12] };
}

function houseOf(lon, cusps) {
  for (let i = 0; i < 12; i++) {
    if (norm(lon - cusps[i]) < norm(cusps[(i + 1) % 12] - cusps[i])) return i + 1;
  }
  return 1;
}

const BODY_ORDER = ['sun', 'moon', 'asc', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
const BODIES = {
  sun: { name: 'Солнце', sym: '☉', role: 'Ядро личности, жизненная сила, эго.', topic: 'личность и воля', gen: false },
  moon: { name: 'Луна', sym: '☽', role: 'Эмоции, инстинкты, зона комфорта.', topic: 'эмоции и привычки', gen: false },
  mercury: { name: 'Меркурий', sym: '☿', role: 'Мышление, коммуникация, обучение.', topic: 'мышление и речь', gen: false },
  venus: { name: 'Венера', sym: '♀', role: 'Ценности, любовь, эстетика, деньги.', topic: 'отношения и ценности', gen: false },
  mars: { name: 'Марс', sym: '♂', role: 'Энергия, действие, агрессия, инициатива.', topic: 'действия и конфликты', gen: false },
  jupiter: { name: 'Юпитер', sym: '♃', role: 'Расширение, удача, философия, рост.', topic: 'рост и возможности', gen: false },
  saturn: { name: 'Сатурн', sym: '♄', role: 'Ограничения, дисциплина, ответственность.', topic: 'долг и структура', gen: false },
  uranus: { name: 'Уран', sym: '♅', role: 'Свобода, неожиданные перемены, оригинальность.', topic: 'перемены и свобода', gen: true },
  neptune: { name: 'Нептун', sym: '♆', role: 'Мечты, вдохновение, интуиция и иллюзии.', topic: 'мечты и интуиция', gen: true },
  pluto: { name: 'Плутон', sym: '♇', role: 'Глубинные перемены, сила, кризисы и обновление.', topic: 'глубинные перемены', gen: true },
  asc: { name: 'Асцендент', sym: 'Asc', role: 'Внешнее проявление, первое впечатление, тело.', topic: 'внешность и поведение', gen: false }
};
const SIGNS = ['Овен','Телец','Близнецы','Рак','Лев','Дева','Весы','Скорпион','Стрелец','Козерог','Водолей','Рыбы'];
const SIGN_SYM = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
const KEYWORDS = ['импульсивность и лидерство','стабильность и чувственность','любопытство и коммуникация','забота и эмоциональность','творчество и самовыражение','анализ и порядок','гармония и партнёрство','глубина и трансформация','оптимизм и расширение','амбиции и структура','инновации и свобода','интуиция и сострадание'];
const HOUSE_TOPICS = ['Личность и тело','Ресурсы и ценности','Коммуникация и окружение','Дом и семья','Творчество и дети','Работа и здоровье','Партнёрство','Трансформация и чужие ресурсы','Философия и путешествия','Карьера и статус','Друзья и надежды','Тайны и подсознание'];
const ASPECTS = [
  { name: 'соединение', a: 0, orb: 8, cls: 'conj', verb: 'усиливает' },
  { name: 'секстиль', a: 60, orb: 6, cls: 'soft', verb: 'гармонично поддерживает' },
  { name: 'квадрат', a: 90, orb: 7, cls: 'hard', verb: 'создаёт напряжение с' },
  { name: 'тригон', a: 120, orb: 8, cls: 'soft', verb: 'лёгко соединяет с' },
  { name: 'оппозиция', a: 180, orb: 8, cls: 'hard', verb: 'противопоставляет' }
];

const MIN_DATE = '1900-01-01';

// Коды ошибок (err.code === err.message): invalid-input | out-of-range | invalid-place |
// invalid-timezone | invalid-local-time | ambiguous-local-time | future
function computeChart({ date, time, unknownTime, place, ambiguousChoice, now = Date.now() }) {
  if (!validPlace(place)) throw makeFail(isValidTimeZone(place && place.timezone) ? 'invalid-place' : 'invalid-timezone');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw makeFail('invalid-input');
  if (date < MIN_DATE) throw makeFail('out-of-range');

  let ts, timeChoice = null, ambiguous = null;
  if (unknownTime) {
    ts = dayNoonTs(date, place.timezone);                  // времени нет — берём полдень (мягко, см. зону 2)
    if (ts == null) throw makeFail('invalid-local-time', { wholeDay: true });
    const start = dayStartTs(date, place.timezone);
    if (start != null && start > now) throw makeFail('future');
  } else {
    const r = resolveLocal(date, time, place.timezone);
    if (r.status === 'ok') ts = r.candidates[0].ts;
    else if (r.status === 'ambiguous-local-time') {
      const idx = ambiguousChoice === 'first' ? 0 : ambiguousChoice === 'second' ? 1 : -1;
      if (idx < 0) throw makeFail('ambiguous-local-time', { candidates: r.candidates });   // молча не выбираем
      ts = r.candidates[idx].ts; timeChoice = ambiguousChoice; ambiguous = r.candidates;
    } else throw makeFail(r.status);
    if (ts > now) throw makeFail('future');
  }

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

  // Без времени Луна за сутки проходит ~13° и может сменить знак — тогда показываем оба знака
  let moonSigns = null;
  if (unknownTime) {
    const t0 = dayStartTs(date, place.timezone), t1 = dayEndTs(date, place.timezone);
    const a = sky(dayNumber(t0)).moon, b = sky(dayNumber(t1)).moon;
    const sa = Math.floor(a / 30), sb = Math.floor(b / 30);
    moonSigns = sa === sb ? [sa] : [sa, sb];
  }

  const keys = BODY_ORDER.filter((k) => !(k === 'asc' && unknownTime));
  const planets = keys.map((k) => {
    const lon = natal[k], si = Math.floor(lon / 30);
    const p = {
      key: k, ...BODIES[k], lon, si, sign: SIGNS[si], signSym: SIGN_SYM[si], kw: KEYWORDS[si],
      deg: Math.floor(lon % 30), min: Math.floor(((lon % 30) % 1) * 60), retro: !!retro[k],
      house: cusps && k !== 'asc' ? houseOf(lon, cusps) : null,
      // Точность по градусам: без времени минуты бессмысленны, а для Луны и градусы
      precision: !unknownTime ? 'exact' : k === 'moon' ? 'none' : 'day'
    };
    if (k === 'moon' && moonSigns && moonSigns.length > 1) {
      p.approx = true; p.alt = moonSigns;
      p.sign = `${SIGNS[moonSigns[0]]} или ${SIGNS[moonSigns[1]]}`;
      p.signSym = SIGN_SYM[moonSigns[0]]; p.kw = `${KEYWORDS[moonSigns[0]]} — или же: ${KEYWORDS[moonSigns[1]]}`;
      p.note = 'В день рождения Луна сменила знак. Без точного времени невозможно определить, какой из двух ваш.';
    } else if (k === 'moon' && unknownTime) {
      p.note = 'Луна быстрая, поэтому её градусы нельзя определить без времени рождения. Знак определён надёжно.';
    }
    return p;
  });

  return {
    ts, place: placeLabel(place), placeRef: cleanPlace(place), tz: place.timezone, lat: place.latitude, lon: place.longitude,
    planets, natal, birth: { date, time: unknownTime ? null : time },
    timeKnown: !unknownTime, asc, mc, cusps, system,
    aspects: natalAspects(planets),
    timeChoice, ambiguous: ambiguous && ambiguous.map((c) => ({ ts: c.ts, offset: c.offset }))
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

// Транзиты считаются для абсолютного момента времени (UTC); показываем его в часовом поясе
// устройства И в UTC, чтобы не было двусмысленности. Участвуют только быстрые планеты:
// Солнце, Луна, Меркурий, Венера, Марс, Юпитер, Сатурн (Уран, Нептун и Плутон не учитываются).
const TRANSIT_ORBS = { moon: 5, sun: 3, mercury: 3, venus: 3, mars: 3, jupiter: 2, saturn: 2 };
const TRANSIT_NAMES = Object.keys(TRANSIT_ORBS);

function formatMoment(ts, tz) {
  const opt = { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  return new Date(ts).toLocaleString('ru-RU', { ...opt, timeZone: tz });
}

function horoscopeFor(data, nowTs, deviceTz) {
  const tz = isValidTimeZone(deviceTz) ? deviceTz : 'UTC';
  const transit = sky(dayNumber(nowTs)), found = [];
  for (const t of TRANSIT_NAMES) {
    for (const p of data.planets) {
      if (p.precision === 'none') continue;           // у Луны без времени рождения градусов нет — аспекты к ней были бы ложной точностью
      const sep = sepAngle(transit[t], p.lon);
      for (const a of ASPECTS) {
        if (Math.abs(sep - a.a) <= TRANSIT_ORBS[t]) { found.push({ t, n: p.key, orb: Math.abs(sep - a.a), a }); break; }
      }
    }
  }
  found.sort((x, y) => x.orb - y.orb);
  const moonIdx = Math.floor(transit.moon / 30);
  return {
    ts: nowTs, tz, offset: fmtOffset(tzOffset(nowTs, tz)),
    when: formatMoment(nowTs, tz), whenUtc: formatMoment(nowTs, 'UTC'),
    planets: TRANSIT_NAMES.map((k) => BODIES[k].name),
    mood: `Луна сейчас в знаке «${SIGNS[moonIdx]}» — общий фон: ${KEYWORDS[moonIdx]}.`,
    items: found.slice(0, 3).map(({ t, n, a }) => ({
      text: `${BODIES[t].name} ${a.verb} вашу сферу: ${BODIES[n].topic}.`,
      label: `${a.name} с «${BODIES[n].name}» в вашей карте`,
      tip: a.cls === 'soft' ? 'Хороший момент действовать и просить о нужном.' : 'Не торопитесь и не спорьте по мелочам.'
    }))
  };
}

// ===== 5. UI & RENDERING =====
const ELEM = ['fire', 'earth', 'air', 'water'];
const elOf = (si) => ELEM[si % 4];
const ASP_ICON = {
  'соединение': '<circle cx="6.5" cy="11.5" r="3.4"/><path d="M9 9l5.5-5.5"/>',
  'секстиль': '<path d="M9 2.5v13M3.4 5.8l11.2 6.4M14.6 5.8L3.4 12.2"/>',
  'квадрат': '<rect x="3.5" y="3.5" width="11" height="11"/>',
  'тригон': '<path d="M9 3l6.6 11.5H2.4z"/>',
  'оппозиция': '<circle cx="5" cy="13" r="2.8"/><circle cx="13" cy="5" r="2.8"/><path d="M7 11l4-4"/>'
};
const aspIcon = (name) => `<svg class="aic" viewBox="0 0 18 18" aria-hidden="true">${ASP_ICON[name]}</svg>`;

function polar(C, r, lon, ref) {
  const a = (180 + lon - ref) * R;
  return [C + r * Math.cos(a), C - r * Math.sin(a)];
}

// Подпись градусов с учётом того, насколько они известны
function degLabel(p) {
  if (p.precision === 'none') return 'градусы неизвестны';
  if (p.precision === 'day') return `около ${p.deg}°`;
  return `${p.deg}°${String(p.min).padStart(2, '0')}′`;
}

function wheelSVG(data) {
  const C = 350, R1 = 300, R2 = 258, R3 = 120, RS = 279;
  const ref = data.timeKnown ? data.asc : 0;
  const pt = (r, lon) => polar(C, r, lon, ref);
  const f = (n) => n.toFixed(1);
  const line = (r1, l1, r2, l2, cls) => {
    const [x1, y1] = pt(r1, l1), [x2, y2] = pt(r2, l2);
    return `<line class="${cls}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
  };
  const text = (r, lon, str, cls) => {
    const [x, y] = pt(r, lon);
    return `<text class="${cls}" x="${f(x)}" y="${f(y)}">${str}</text>`;
  };
  let s = `<svg viewBox="0 0 700 700" class="wheel" role="img" aria-label="Колесо натальной карты: знаки зодиака, дома, планеты и аспекты">`;
  s += `<defs><radialGradient id="wcore"><stop offset="0" stop-color="#f2b6cb" stop-opacity=".13"/><stop offset="1" stop-color="#f2b6cb" stop-opacity="0"/></radialGradient></defs>`;
  s += `<circle cx="${C}" cy="${C}" r="${R3}" fill="url(#wcore)"/>`;

  for (let i = 0; i < 12; i++) {
    const a = i * 30, b = a + 30, el = elOf(i);
    const [ox1, oy1] = pt(R1, a), [ox2, oy2] = pt(R1, b), [ix1, iy1] = pt(R2, a), [ix2, iy2] = pt(R2, b);
    s += `<path class="sec ${el}" d="M${f(ox1)} ${f(oy1)} A${R1} ${R1} 0 0 0 ${f(ox2)} ${f(oy2)} L${f(ix2)} ${f(iy2)} A${R2} ${R2} 0 0 1 ${f(ix1)} ${f(iy1)}Z"><title>${SIGNS[i]}</title></path>`;
    s += line(R1, a, R2, a, 'sdiv');
    s += text(RS, a + 15, SIGN_SYM[i], `zsign ${el}`);
  }
  [R1, R2, R3].forEach((r, i) => { s += `<circle class="ring draw" pathLength="1" style="--i:${i}" cx="${C}" cy="${C}" r="${r}"/>`; });
  for (let l = 0; l < 360; l += 5) if (l % 30) s += line(R2, l, R2 - (l % 10 === 0 ? 9 : 5), l, 'tick');

  if (data.cusps) {
    data.cusps.forEach((c, i) => {
      s += line(R3, c, R2, c, i % 3 === 0 ? 'cusp main' : 'cusp');
      s += text(R3 + 17, c + norm(data.cusps[(i + 1) % 12] - c) / 2, i + 1, 'hnum');
    });
    [['Asc', data.cusps[0]], ['IC', data.cusps[3]], ['Dsc', data.cusps[6]], ['MC', data.cusps[9]]]
      .forEach(([n, l]) => { s += text(R1 + 24, l, n, 'angle'); });
  }

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

  data.aspects.forEach((x, i) => {
    if (x.a.key === 'asc' || x.b.key === 'asc') return;
    const [x1, y1] = pt(R3, x.a.lon), [x2, y2] = pt(R3, x.b.lon);
    const w = (0.9 + (1 - x.orb / x.asp.orb) * 1.5).toFixed(2);
    s += `<line class="asp ${x.asp.cls}" data-a="${x.a.key}" data-b="${x.b.key}" style="stroke-width:${w};--i:${i}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"><title>${x.a.name} — ${x.b.name}: ${x.asp.name}</title></line>`;
  });
  
  items.forEach(({ p, d }, i) => {
    const [gx, gy] = pt(222, d), [hx, hy] = pt(R2, p.lon);
    const faint = p.approx || (p.key === 'moon' && !data.timeKnown);
    s += `<g class="pg${faint ? ' faint' : ''}" data-k="${p.key}" style="--i:${i}"><title>${p.name}, ${p.sign}${p.precision === 'none' ? '' : ', ' + degLabel(p)}${p.retro ? ', ретроградный' : ''}</title>`
      + `<circle class="pdot" cx="${f(hx)}" cy="${f(hy)}" r="2.4"/>`
      + (Math.abs(d - p.lon) > 0.5 ? line(R2 - 4, p.lon, 240, d, 'lead') : '')
      + `<circle class="halo" cx="${f(gx)}" cy="${f(gy)}" r="19"/>`
      + text(222, d, p.sym + '\uFE0E', 'pl')
      + (p.precision === 'none' ? '' : text(194, d, `${p.precision === 'day' ? '≈' : ''}${p.deg}°${p.retro ? ' R' : ''}`, 'pdeg')) + '</g>';
  });
  return s + '</svg>';
}

function ornamentSVG() {
  const C = 300, pt = (r, l) => polar(C, r, l, 0), f = (n) => n.toFixed(1);
  let s = '<svg viewBox="0 0 600 600" class="orn">';
  [292, 252, 176, 104].forEach((r, i) => { s += `<circle class="oring draw" pathLength="1" style="--i:${i}" cx="${C}" cy="${C}" r="${r}"/>`; });
  for (let i = 0; i < 12; i++) {
    const [x1, y1] = pt(252, i * 30), [x2, y2] = pt(292, i * 30), [gx, gy] = pt(272, i * 30 + 15);
    s += `<line class="odiv" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
    s += `<text class="ozs ${elOf(i)}" x="${f(gx)}" y="${f(gy)}">${SIGN_SYM[i]}</text>`;
  }
  for (let l = 0; l < 360; l += 5) {
    if (l % 30 === 0) continue;
    const [x1, y1] = pt(252, l), [x2, y2] = pt(252 - (l % 10 === 0 ? 9 : 5), l);
    s += `<line class="otick" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
  }
  [[18, 138, 'soft'], [78, 258, 'hard'], [198, 318, 'soft'], [48, 168, 'conj'], [108, 288, 'soft'], [228, 348, 'hard']].forEach(([a, b, c], i) => {
    const [x1, y1] = pt(104, a), [x2, y2] = pt(104, b);
    s += `<line class="oasp draw ${c}" pathLength="1" style="--i:${i + 4}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
  });
  return s + '</svg>';
}

// ===== 6. BOOTSTRAP & UI LOGIC =====
// Правило безопасности: всё, что пришло извне (API, URL, localStorage, поля формы), попадает в DOM
// только через textContent. innerHTML допустим лишь для статической разметки и значений из наших
// справочников (названия планет, знаков). Это проверяет tests/security.test.js.
if (typeof document !== 'undefined') {
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const todayISO = () => { const n = new Date(); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`; };
  const ru1 = (x) => x.toFixed(1).replace('.', ',');
  const fmtDate = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s?г\.$/, '');
  };
  const glyph = (p) => (p.key === 'asc' ? '<span class="g asc">Asc</span>' : `<span class="g">${p.sym}\uFE0E</span>`);
  const signMark = (p) => `<span class="g sg ${elOf(p.si)}">${p.signSym}</span>`;
  const CHEVRON = '<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg>';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  let current = null, horoscopeAt = 0, busy = false;
  const wheelSvg = () => $('wheel-box').querySelector('svg');

  /* ---------- состояние и сообщения ---------- */
  // Один глобальный live-регион для скринридеров + видимая подпись под кнопкой для всех остальных
  const setStatus = (msg) => { $('live-status').textContent = msg; $('form-status').textContent = msg; };
  const setBusy = (b) => {
    busy = b;
    const btn = $('btn-submit');
    btn.disabled = b;
    btn.setAttribute('aria-busy', String(b));
    btn.textContent = b ? 'Считаем…' : 'Построить карту';
  };
  const setErr = (id, msg) => {
    const input = $(id);
    input.classList.toggle('invalid', !!msg);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    $('err-' + id).textContent = msg || '';
  };
  const clearErrors = () => ['date', 'time', 'city'].forEach((id) => setErr(id, ''));

  const GEO_MESSAGES = {
    timeout: 'Сервис поиска городов отвечает слишком долго. Попробуйте ещё раз.',
    offline: 'Нет подключения к интернету. Проверьте сеть и повторите.',
    network: 'Не удалось связаться с сервисом поиска городов. Проверьте интернет и повторите.',
    service: 'Сервис поиска городов временно недоступен. Попробуйте позже.',
    nocity: 'Город не найден — проверьте написание.'
  };

  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $(id).classList.add('active');
    $('header-actions').hidden = id !== 'screen-result';
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  /* ---------- хранилище (только по явному действию пользователя) ---------- */
  const store = {
    get() { try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(STORAGE_KEY, v); return true; } catch (e) { return false; } },
    del() { try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem('natal_chart_last'); return true; } catch (e) { return false; } }
  };
  const savedInput = () => {
    const raw = store.get();
    if (raw == null) return null;
    const parsed = parseSaved(raw, todayISO());
    if (!parsed) store.del();                        // повреждённые данные не храним
    return parsed;
  };

  /* ---------- форма ---------- */
  const readForm = () => ({ date: $('date').value, time: $('time').value, city: $('city').value, unknownTime: $('no-time').checked });
  const hideChoices = () => { $('city-choices').hidden = true; $('time-choices').hidden = true; };

  function validate() {
    $('date').max = todayISO();
    const v = readForm(), today = todayISO();
    const checks = [
      ['date', !v.date ? 'Укажите дату рождения' : !isRealDate(v.date) ? 'Такой даты не существует' : v.date < MIN_DATE ? 'Расчёт работает с 1900 года' : v.date > today ? 'Эта дата ещё не наступила' : ''],
      ['time', v.unknownTime || v.time ? '' : 'Укажите время или отметьте, что его не знаете'],
      ['city', v.city.trim().length >= 2 ? '' : 'Введите город рождения']
    ];
    let first = null;
    checks.forEach(([id, msg]) => { setErr(id, msg); if (msg && !first) first = id; });
    if (first) { $(first).focus(); setStatus('Проверьте форму: есть ошибки в данных.'); }
    return !first;
  }

  function syncUnknownTime() {
    const off = $('no-time').checked;
    $('time').disabled = off;
    $('time').required = !off;
    $('field-time').classList.toggle('off', off);
    $('time-hint').hidden = !off;
    $('time').setAttribute('aria-describedby', off ? 'time-hint err-time' : 'err-time');
    if (off) { $('time').value = ''; setErr('time', ''); }
  }

  function fillForm(input) {
    $('date').value = input.date;
    $('time').value = input.time || '';
    $('no-time').checked = !input.time;
    $('city').value = placeLabel(input.place);
    syncUnknownTime();
  }

  /* ---------- выбор варианта (город / нахлёст времени) ---------- */
  function renderChoice(box, hintText, items, onPick) {
    box.textContent = '';
    const hint = el('p', 'choices-hint', hintText);
    hint.id = box.id + '-hint';
    box.setAttribute('aria-labelledby', hint.id);
    box.appendChild(hint);
    items.forEach((label) => {
      const b = el('button', 'choice', label);
      b.type = 'button';
      b.addEventListener('click', () => onPick(items.indexOf(label)));
      box.appendChild(b);
    });
    box.hidden = false;
    box.querySelector('.choice').focus();           // первый вариант доступен с клавиатуры (Enter/Space — штатно у button)
    box.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function showCityChoices(places) {
    setStatus('Выбор города…');
    const labels = choiceLabels(places);
    renderChoice($('city-choices'), 'Нашлось несколько мест — выберите нужное', labels, (i) => {
      $('city-choices').hidden = true;
      setBusy(true);
      build(places[i]);
    });
  }

  function showTimeChoices(err, place) {
    const t = readForm().time;
    const msg = `Время ${t} в этот день встречалось дважды: часы переводили назад. Выберите, какой момент вы имеете в виду, или измените время.`;
    setErr('time', msg);
    setStatus('Выбор времени: ' + msg);
    const names = ['Первый раз', 'Второй раз'];
    const labels = err.candidates.map((c, i) => `${names[i]} (${fmtOffset(c.offset)})`);
    renderChoice($('time-choices'), 'Какое из двух повторившихся времён?', labels, (i) => {
      $('time-choices').hidden = true;
      setErr('time', '');
      setBusy(true);
      build(place, i === 0 ? 'first' : 'second');
    });
  }

  /* ---------- расчёт ---------- */
  function build(place, ambiguousChoice) {
    setStatus('Расчёт карты…');
    try {
      current = computeChart({ ...readForm(), place, ambiguousChoice });
      clearErrors();
      renderResult(current);
      show('screen-result');
      $('result-title').focus({ preventScroll: true });
      setStatus('Карта готова.');
    } catch (err) {
      handleChartError(err, place);
    }
    setBusy(false);
  }

  function handleChartError(err, place) {
    const t = readForm().time;
    switch (err.code) {
      case 'future': setErr('date', 'Этот момент ещё не наступил'); $('date').focus(); break;
      case 'out-of-range': setErr('date', 'Расчёт работает с 1900 года'); $('date').focus(); break;
      case 'invalid-input': setErr('date', 'Проверьте дату и время'); $('date').focus(); break;
      case 'invalid-local-time':
        if (err.wholeDay) { setErr('date', 'В этом месте такой даты не существовало (при смене часового пояса день был пропущен).'); $('date').focus(); }
        else { setErr('time', `В этот день в этом месте часы переводили вперёд, и времени ${t} не существовало. Проверьте время рождения.`); $('time').focus(); }
        break;
      case 'ambiguous-local-time': showTimeChoices(err, place); setStatus('Нужно уточнить время.'); return;
      case 'invalid-place': case 'invalid-timezone':
        setErr('city', 'Для этого места не удалось определить часовой пояс. Выберите другой вариант.'); $('city').focus(); break;
      default: setErr('city', 'Не удалось построить карту. Попробуйте ещё раз.'); $('city').focus();
    }
    setStatus('Не удалось выполнить расчёт.');
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;                                  // повторная отправка не создаёт параллельных запросов
    hideChoices();
    if (!validate()) return;
    setBusy(true);
    setStatus('Поиск города…');
    let waiting = false;
    try {
      const places = await geocode($('city').value);
      if (places.length === 1) build(places[0]);
      else { showCityChoices(places); waiting = true; }
    } catch (err) {
      if (err.code === 'superseded') return;
      setErr('city', GEO_MESSAGES[err.code] || 'Не удалось найти город. Попробуйте ещё раз.');
      $('city').focus();
      setStatus('Не удалось выполнить расчёт.');
    } finally {
      setBusy(false);                                  // кнопка всегда возвращается в нормальное состояние
      if (waiting) setStatus('Выбор города…');
    }
  }

  /* ---------- результат ---------- */
  function highlight(a, b) {
    const svg = wheelSvg();
    if (!svg) return;
    svg.querySelectorAll('.on').forEach((n) => n.classList.remove('on'));
    svg.classList.toggle('hl', !!a);
    if (!a) return;
    svg.querySelectorAll('.pg').forEach((n) => { if (n.dataset.k === a || n.dataset.k === b) n.classList.add('on'); });
    svg.querySelectorAll('.asp').forEach((n) => {
      const hit = b ? (n.dataset.a === a && n.dataset.b === b) || (n.dataset.a === b && n.dataset.b === a) : n.dataset.a === a || n.dataset.b === a;
      if (hit) n.classList.add('on');
    });
  }
  function bindHighlight(root) {
    root.querySelectorAll('[data-hl]').forEach((row) => {
      const [a, b] = row.dataset.hl.split(',');
      const on = () => highlight(a, b), off = () => highlight(null);
      row.addEventListener('mouseenter', on); row.addEventListener('mouseleave', off);
      row.addEventListener('focusin', on); row.addEventListener('focusout', off);
    });
  }

  // Блок для неизвестного времени: что известно точно, что приблизительно, что определить нельзя
  function renderCertainty(data) {
    const box = $('certainty');
    box.hidden = data.timeKnown;
    if (data.timeKnown) return;
    const moon = data.planets.find((p) => p.key === 'moon');
    const groups = [
      ['Известно точно', 'is-sure', ['Дата и место рождения', moon.approx ? 'Знаки Солнца, Меркурия, Венеры, Марса и более далёких планет' : 'Знаки Солнца, Луны и всех планет']],
      ['Приблизительно', 'is-approx', [moon.approx ? 'Знак Луны: в этот день она сменила знак, поэтому возможны два' : 'Градусы Луны не показываем: без времени они неизвестны', 'Градусы остальных планет: точность в пределах суток («около N°»)']],
      ['Определить невозможно', 'is-none', ['Асцендент', 'Середина неба (МС)', 'Дома и положение планет в них']]
    ];
    box.textContent = '';
    box.appendChild(el('h3', null, 'Что известно, а что нет'));
    const dl = el('div', 'cert-grid');
    for (const [title, cls, items] of groups) {
      const sec = el('div', 'cert ' + cls);
      sec.appendChild(el('h4', null, title));
      const ul = el('ul');
      items.forEach((t) => ul.appendChild(el('li', null, t)));
      sec.appendChild(ul);
      dl.appendChild(sec);
    }
    box.appendChild(dl);
  }

  function renderResult(data) {
    const b = data.birth;
    $('result-title').textContent = fmtDate(b.date);
    $('result-sub').textContent = `${b.time ? 'в ' + b.time : 'время неизвестно'}, ${data.place}`;
    $('result-sub').appendChild(document.createElement('span'));
    $('result-sub').lastChild.className = 'sub-note';
    if (data.timeChoice) {
      const o = data.ambiguous[data.timeChoice === 'first' ? 0 : 1].offset;
      $('result-sub').lastChild.textContent = `Выбрано ${data.timeChoice === 'first' ? 'первое' : 'второе'} из двух повторившихся времён (${fmtOffset(o)}).`;
    }

    const P = (k) => data.planets.find((p) => p.key === k);
    const tile = (p, label) => `<div class="b3">${glyph(p)}<div><span class="b3-k">${label}</span><strong>${p.sign}</strong><span class="b3-d">${p.approx ? 'градусы неизвестны' : degLabel(p)}</span></div></div>`;
    $('big3').innerHTML = tile(P('sun'), 'Солнце, характер') + tile(P('moon'), 'Луна, эмоции')
      + (P('asc') ? tile(P('asc'), 'Асцендент, первое впечатление')
        : '<div class="b3 empty"><span class="g asc">Asc</span><div><span class="b3-k">Асцендент, первое впечатление</span><strong>невозможно определить</strong><span class="b3-d">нужно время рождения</span></div></div>');

    renderCertainty(data);
    $('wheel-box').innerHTML = wheelSVG(data);
    $('wheel-note').textContent = data.timeKnown
      ? `Дома: ${data.system}. Асцендент слева, МС сверху. Колесо дублируется списками планет и аспектов справа. Наведите курсор на строку списка — планета подсветится на колесе.`
      : 'Время рождения неизвестно. Карта построена на полдень: Асцендент, МС и дома определить невозможно. Все данные также доступны в списках планет и аспектов.';

    $('planets-list').innerHTML = data.planets.map((p) => `
      <details class="prow" data-hl="${p.key}">
        <summary>
          ${glyph(p)}
          <span class="pmain"><span class="pname">${p.name}${p.retro ? '<em class="retro" title="Ретроградный: кажется, что идёт назад">R</em>' : ''}</span>
            <span class="psub">${signMark(p)} ${p.sign}${p.precision === 'none' ? '' : ', ' + degLabel(p)}${p.house ? `, дом ${p.house}` : ''}</span></span>
          ${CHEVRON}
        </summary>
        <div class="pbody">
          <p>${p.role}</p>
          <p class="muted">В знаке «${p.sign}» это проявляется так: ${p.kw}.</p>
          ${p.house ? `<p class="muted">Дом ${p.house} — ${HOUSE_TOPICS[p.house - 1]}.</p>` : ''}
          ${p.gen ? '<p class="muted">Знак общий для всех, кто родился в эти годы — личное здесь говорят дом и аспекты.</p>' : ''}
          ${p.note ? `<p class="note-gold">${p.note}</p>` : ''}
        </div>
      </details>`).join('');

    $('aspects-list').innerHTML = data.aspects.length
      ? data.aspects.map((x) => `
        <li class="arow ${x.asp.cls}" tabindex="0" data-hl="${x.a.key},${x.b.key}">
          <span class="an">${glyph(x.a)}${x.a.name}</span>
          <span class="ai">${aspIcon(x.asp.name)}</span>
          <span class="an">${glyph(x.b)}${x.b.name}</span>
          <span class="am">${x.asp.name}, орбис ${ru1(x.orb)}°</span>
        </li>`).join('')
      : '<li class="arow none">Явных аспектов между планетами нет.</li>';

    bindHighlight($('planets-list')); bindHighlight($('aspects-list'));
    $('horoscope').textContent = '';
    horoscopeAt = 0;
    $('share-panel').hidden = true; $('btn-share').setAttribute('aria-expanded', 'false'); $('share-url').hidden = true;
    $('tool-msg').textContent = '';
    $('btn-forget-result').hidden = store.get() == null;
    selectTab($('tab-btn-planets'));
  }

  /* ---------- «Сегодня» ---------- */
  function renderHoroscope(force) {
    if (!current || (!force && Date.now() - horoscopeAt < 5 * 60 * 1000)) return;
    horoscopeAt = Date.now();
    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const h = horoscopeFor(current, horoscopeAt, deviceTz);
    const root = $('horoscope');
    root.textContent = '';
    root.appendChild(el('h3', null, 'Небо сейчас'));
    root.appendChild(el('p', 'when', `${h.when} — по времени вашего устройства (${h.tz}, ${h.offset})`));
    root.appendChild(el('p', 'muted small', `То же в UTC: ${h.whenUtc}.`));
    root.appendChild(el('blockquote', null, h.mood));
    if (h.items.length) {
      h.items.forEach((i) => {
        const d = el('div', 'hitem');
        d.appendChild(el('p', null, i.text));
        d.appendChild(el('p', 'muted', `${i.label[0].toUpperCase() + i.label.slice(1)}. ${i.tip}`));
        root.appendChild(d);
      });
    } else {
      const d = el('div', 'hitem');
      d.appendChild(el('p', null, 'Сейчас нет сильных связей с вашей картой — спокойное время, действуйте в своём ритме.'));
      root.appendChild(d);
    }
    if (!current.timeKnown) root.appendChild(el('p', 'muted small', 'Время рождения неизвестно, поэтому связи с вашей Луной не показываются: у неё нет точных градусов.'));
    const about = el('div', 'today-about');
    about.appendChild(el('p', 'muted small', 'Что это: транзиты — положение планет на небе в этот момент относительно вашей карты. Учитываются только Луна, Солнце, Меркурий, Венера, Марс, Юпитер и Сатурн; Уран, Нептун и Плутон здесь не участвуют.'));
    about.appendChild(el('p', 'muted small', 'Это не научный прогноз, а повод для размышления. Луна меняет аспекты за считаные часы.'));
    root.appendChild(about);
    const btn = el('button', 'textbtn', 'Обновить расчёт');
    btn.type = 'button';
    btn.addEventListener('click', () => { renderHoroscope(true); setStatus('Расчёт на текущий момент обновлён.'); });
    root.appendChild(btn);
  }

  /* ---------- вкладки ---------- */
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (tab.id === 'tab-btn-today') renderHoroscope(false);
    if (tab.id !== 'tab-btn-planets') highlight(null);
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t));
    t.addEventListener('keydown', (e) => {
      const key = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      const to = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : key ? (i + key + tabs.length) % tabs.length : -1;
      if (to < 0) return;
      tabs[to].focus(); selectTab(tabs[to]); e.preventDefault();
    });
  });

  /* ---------- сохранить / поделиться / печать ---------- */
  const toolMsg = (m) => { $('tool-msg').textContent = m; setStatus(m); };

  function refreshSavedBox() {
    const s = savedInput();
    $('saved-box').hidden = !s;
    if (s) $('saved-text').textContent = `В этом браузере сохранена карта: ${fmtDate(s.date)}, ${placeLabel(s.place)}.`;
    $('btn-forget-result').hidden = !s;
  }
  function forget() {
    if (store.del()) { toolMsg('Сохранённые данные удалены из этого браузера.'); }
    else toolMsg('Не удалось удалить: браузер не даёт доступ к хранилищу.');
    refreshSavedBox();
  }

  $('btn-save').addEventListener('click', () => {
    if (!current) return;
    if (store.set(serializeSaved(current))) {
      toolMsg('Карта сохранена в этом браузере. Сохранены только дата, время и место рождения; на сервер ничего не отправлялось.');
      refreshSavedBox();
    } else toolMsg('Не удалось сохранить: браузер запретил локальное хранилище (возможно, включён приватный режим).');
  });
  $('btn-forget-result').addEventListener('click', forget);
  $('btn-forget').addEventListener('click', forget);
  $('btn-restore').addEventListener('click', () => {
    const s = savedInput();
    if (!s) { refreshSavedBox(); return; }
    fillForm(s);
    clearErrors(); hideChoices();
    setBusy(true);
    build(s.place);
  });

  $('btn-share').addEventListener('click', () => {
    const open = $('share-panel').hidden;
    $('share-panel').hidden = !open;
    $('btn-share').setAttribute('aria-expanded', String(open));
    if (open) $('btn-copy-link').focus();
  });
  $('btn-copy-link').addEventListener('click', async () => {
    if (!current) return;
    const url = location.href.split(/[?#]/)[0] + '?' + buildShareQuery(current);   // ссылка создаётся только по этой кнопке
    const field = $('share-url');
    field.value = url; field.hidden = false;
    try {
      await navigator.clipboard.writeText(url);
      toolMsg('Ссылка скопирована. В ней содержатся дата, время и место рождения.');
    } catch (e) {
      field.focus(); field.select();
      toolMsg('Не удалось скопировать автоматически. Ссылка выделена — скопируйте её вручную (Ctrl+C).');
    }
  });

  $('btn-print').addEventListener('click', () => window.print());
  // Перед печатью раскрываем всё нужное (планеты и аспекты), а «Сегодня» не печатаем
  let printSnapshot = null;
  window.addEventListener('beforeprint', () => {
    if (printSnapshot) return;                      // повторное событие не должно затирать исходное состояние
    printSnapshot = {
      panels: ['panel-planets', 'panel-aspects', 'panel-today'].map((id) => [id, $(id).hidden]),
      open: [...document.querySelectorAll('details.prow')].map((d) => [d, d.open])
    };
    $('panel-planets').hidden = false; $('panel-aspects').hidden = false; $('panel-today').hidden = true;
    printSnapshot.open.forEach(([d]) => { d.open = true; });
  });
  window.addEventListener('afterprint', () => {
    if (!printSnapshot) return;
    printSnapshot.panels.forEach(([id, h]) => { $(id).hidden = h; });
    printSnapshot.open.forEach(([d, o]) => { d.open = o; });
    printSnapshot = null;
  });

  /* ---------- запуск ---------- */
  $('birth-form').addEventListener('submit', onSubmit);
  $('city').addEventListener('input', () => { $('city-choices').hidden = true; setErr('city', ''); });
  $('date').addEventListener('input', () => setErr('date', ''));
  $('time').addEventListener('input', () => { $('time-choices').hidden = true; setErr('time', ''); });
  $('date').addEventListener('focus', () => { $('date').max = todayISO(); });
  $('no-time').addEventListener('change', syncUnknownTime);
  $('btn-new').addEventListener('click', () => { show('screen-form'); setStatus(''); refreshSavedBox(); $('date').focus({ preventScroll: true }); });

  $('ornament').innerHTML = ornamentSVG();
  $('date').max = todayISO();
  syncUnknownTime();
  try { localStorage.removeItem('natal_chart_last'); } catch (e) { /* хранилище недоступно */ }   // данные старой версии без явного согласия
  refreshSavedBox();

  // Открытие по ссылке: параметры недоверенные, проходят строгую проверку; из адресной строки убираем сразу
  const link = parseShareQuery(location.search, todayISO());
  if (link.status !== 'none') {
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* file:// и т. п. */ }
    if (link.status === 'ok') {
      fillForm(link.input);
      setBusy(true);
      build(link.input.place);
      if (current) setStatus('Карта открыта по ссылке.');
    } else {
      $('form-notice').textContent = 'Ссылка повреждена или содержит некорректные данные. Введите данные вручную.';
      $('form-notice').hidden = false;
      setStatus('Ссылка содержит некорректные данные.');
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    // astronomy
    sky, retroFlags, ascendant, midheaven, buildHouses, houseOf, ramcOf, obliquity, natalAspects, sepAngle, norm,
    // timezone
    resolveLocal, localToUTC, tzOffset, fmtOffset, isValidTimeZone, dayStartTs, dayEndTs, dayNoonTs, dayNumber, julian,
    // geocoding
    geocode, rankPlaces, parseCityQuery, validPlace, placeLabel, choiceLabels,
    // chart, persistence, share
    computeChart, horoscopeFor, wheelSVG, ornamentSVG, degLabel, MIN_DATE,
    buildShareQuery, parseShareQuery, serializeSaved, parseSaved, cleanPlace, cleanChartInput, isRealDate
  };
}
