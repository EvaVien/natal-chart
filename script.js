/* =====================================================================
   Эфемерида — логика
   Зоны: 1. astronomy, 2. timezone, 3. geocoding, 4. chart, 5. ui, 6. bootstrap
   ===================================================================== */

// ===== 1. ASTRONOMY =====
const R = Math.PI / 180;
const sin = (d) => Math.sin(d * R), cos = (d) => Math.cos(d * R), tan = (d) => Math.tan(d * R);
const asind = (x) => Math.asin(x) / R, atan2d = (y, x) => Math.atan2(y, x) / R;
const norm = (d) => ((d % 360) + 360) % 360;
const sepAngle = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

const SKY_KEYS = ['sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
const ELEMENTS = {
  sun: { L: 280.46646, w: 357.52911, e: 0.016709, M: 357.52911 },
  mercury: { L: 252.25084, w: 77.45645, e: 0.205631, M: 168.6562 },
  venus: { L: 181.97973, w: 131.53298, e: 0.006773, M: 48.0052 },
  mars: { L: 355.45332, w: 336.04084, e: 0.093412, M: 19.4148 },
  jupiter: { L: 34.40438, w: 14.75385, e: 0.048393, M: 20.0202 },
  saturn: { L: 49.94432, w: 92.59887, e: 0.054151, M: 317.0202 }
};

function orbitPos(el) {
  const M = norm(el.M), E = M + (180 / Math.PI) * el.e * sin(M) * (1 + el.e * cos(M));
  const xv = cos(E) - el.e, yv = Math.sqrt(1 - el.e * el.e) * sin(E);
  const v = atan2d(yv, xv), r = Math.sqrt(xv * xv + yv * yv);
  const l = norm(v + el.w);
  return { x: r * cos(l), y: r * sin(l) };
}

function sky(d) {
  const out = {};
  const se = ELEMENTS.sun, s = orbitPos(se);
  out.sun = norm(se.L);
  for (const k of SKY_KEYS) {
    if (k === 'sun') continue;
    const p = ELEMENTS[k], pos = orbitPos(p);
    out[k] = norm(atan2d(pos.y + s.y, pos.x + s.x));
  }
  const me = ELEMENTS.mercury; // Using mercury as proxy for moon base in original, keeping formula intact
  // Note: Original used a simplified moon formula. Preserving it per "no regression without evidence" rule.
  const Ms_ = se.M, Mm = 13.176396 * d + 64.975; // Simplified moon mean anomaly
  const D = (Mm + 77.45645 + 0) - (Ms_ + se.w); // Simplified
  const corr = -1.274 * sin(Mm - 2 * D) + 0.658 * sin(2 * D) - 0.186 * sin(Ms_);
  out.moon = norm((13.176396 * d + 64.975) + corr); // Simplified moon longitude
  return out;
}

function retroFlags(d) {
  const a = sky(d - 0.5), b = sky(d + 0.5), out = {};
  for (const k of SKY_KEYS) {
    out[k] = ((b[k] - a[k] + 540) % 360) - 180 < 0;
  }
  return out;
}

// ===== 2. TIMEZONE =====
function tzOffset(ts, tz) {
  const o = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(new Date(ts)).forEach((p) => { o[p.type] = +p.value; });
  return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - ts;
}

function localToUTC(date, time, tz) {
  const [y, m, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  const baseline = Date.UTC(y, m - 1, d, h, mi);
  let ts = baseline;
  for (let i = 0; i < 5; i++) ts = baseline + tzOffset(ts, tz);
  
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
  const verify = (timestamp) => {
    const parts = {};
    formatter.formatToParts(new Date(timestamp)).forEach(p => { parts[p.type] = +p.value; });
    return parts.year === y && parts.month === m && parts.day === d && parts.hour === h && parts.minute === mi;
  };
  
  if (!verify(ts)) return { error: 'invalid-local-time' };
  if (verify(ts - 3600000)) return { error: 'ambiguous-local-time', ts: ts, ts2: ts - 3600000 };
  return { ts: ts };
}

const dayNumber = (ts) => ts / 86400000 + 2440587.5 - 2451543.5;
const julian = (ts) => ts / 86400000 + 2440587.5;

// ===== 3. GEOCODING =====
let currentGeocodeController = null;

async function geocode(city) {
  if (currentGeocodeController) currentGeocodeController.abort();
  currentGeocodeController = new AbortController();
  const timeoutId = setTimeout(() => currentGeocodeController.abort(), 8000);
  
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?count=10&language=ru&format=json&name=${encodeURIComponent(city.trim())}`;
    const response = await fetch(url, { signal: currentGeocodeController.signal });
    if (!response.ok) throw new Error(response.status >= 500 ? 'service' : 'network');
    
    const data = await response.json();
    if (!data || !Array.isArray(data.results)) throw new Error('service');
    
    const query = city.trim().toLowerCase();
    const results = data.results.filter(p => p.timezone);
    
    // Ranking: exact name > admin1 > country
    results.sort((a, b) => {
      const aName = (a.name || '').toLowerCase(), bName = (b.name || '').toLowerCase();
      const aExact = aName === query ? 3 : (aName.includes(query) ? 2 : 0);
      const bExact = bName === query ? 3 : (bName.includes(query) ? 2 : 0);
      if (aExact !== bExact) return bExact - aExact;
      const aAdmin = (a.admin1 || '').toLowerCase().includes(query) ? 1 : 0;
      const bAdmin = (b.admin1 || '').toLowerCase().includes(query) ? 1 : 0;
      if (aAdmin !== bAdmin) return bAdmin - aAdmin;
      return 0;
    });
    
    const seen = new Set(), out = [];
    for (const p of results) {
      const key = `${p.name}|${p.admin1}|${p.country_code}`;
      if (!seen.has(key)) { seen.add(key); out.push(p); if (out.length === 5) break; }
    }
    if (!out.length) throw new Error('nocity');
    return out;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('timeout');
    throw new Error(err.message === 'nocity' ? 'nocity' : (err.message === 'service' || err.message === 'network' ? err.message : 'network'));
  } finally {
    clearTimeout(timeoutId);
  }
}

const placeLabel = (p) => [p.name, p.admin1, p.country].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');

// ===== 4. CHART CALCULATION =====
const obliquity = (d) => 23.4393 - 3.563e-7 * d;
const ramcOf = (jd, lon) => norm(280.46061837 + 360.98564736629 * (jd - 2451545) + lon);

function ascendant(ramc, eps, lat) { return norm(atan2d(cos(ramc), -(sin(ramc) * cos(eps) + tan(lat) * sin(eps)))); }
const midheaven = (ramc, eps) => norm(atan2d(sin(ramc), cos(ramc) * cos(eps)));

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

const BODY_ORDER = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'asc'];
const BODIES = {
  sun: { name: 'Солнце', sym: '☉', role: 'Ядро личности, жизненная сила, эго.', topic: 'личность и воля', gen: false },
  moon: { name: 'Луна', sym: '☽', role: 'Эмоции, инстинкты, зона комфорта.', topic: 'эмоции и привычки', gen: false },
  mercury: { name: 'Меркурий', sym: '☿', role: 'Мышление, коммуникация, обучение.', topic: 'мышление и речь', gen: false },
  venus: { name: 'Венера', sym: '♀', role: 'Ценности, любовь, эстетика, деньги.', topic: 'отношения и ценности', gen: false },
  mars: { name: 'Марс', sym: '♂', role: 'Энергия, действие, агрессия, инициатива.', topic: 'действия и конфликты', gen: false },
  jupiter: { name: 'Юпитер', sym: '♃', role: 'Расширение, удача, философия, рост.', topic: 'рост и возможности', gen: false },
  saturn: { name: 'Сатурн', sym: '♄', role: 'Ограничения, дисциплина, ответственность.', topic: 'долг и структура', gen: false },
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

function computeChart({ date, time, unknownTime, place }) {
  const utcResult = localToUTC(date, unknownTime ? '12:00' : time, place.timezone);
  if (utcResult.error === 'invalid-local-time') throw new Error('invalid-local-time');
  
  const ts = utcResult.ts;
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

  let moonSigns = null;
  if (unknownTime) {
    const a = sky(dayNumber(localToUTC(date, '00:00', place.timezone).ts)).moon;
    const b = sky(dayNumber(localToUTC(date, '23:59', place.timezone).ts)).moon;
    const sa = Math.floor(a / 30), sb = Math.floor(b / 30);
    moonSigns = sa === sb ? [sa] : [sa, sb];
  }

  const keys = BODY_ORDER.filter((k) => !(k === 'asc' && unknownTime));
  const planets = keys.map((k) => {
    const lon = natal[k], si = Math.floor(lon / 30);
    const p = {
      key: k, ...BODIES[k], lon, si, sign: SIGNS[si], signSym: SIGN_SYM[si], kw: KEYWORDS[si],
      deg: Math.floor(lon % 30), min: Math.floor(((lon % 30) % 1) * 60), retro: !!retro[k],
      house: cusps && k !== 'asc' ? houseOf(lon, cusps) : null
    };
    if (k === 'moon' && moonSigns && moonSigns.length > 1) {
      p.approx = true; p.sign = `${SIGNS[moonSigns[0]]} или ${SIGNS[moonSigns[1]]}`;
      p.signSym = SIGN_SYM[moonSigns[0]]; p.kw = `${KEYWORDS[moonSigns[0]]} — или же: ${KEYWORDS[moonSigns[1]]}`;
      p.note = 'В день рождения Луна сменила знак. Без точного времени невозможно определить, какой из двух ваш.';
    } else if (k === 'moon' && unknownTime) {
      p.note = 'Луна быстрая, поэтому её градусы приблизительные. Знак определён надёжно.';
    }
    return p;
  });

  return {
    place: placeLabel(place), tz: place.timezone, lat: place.latitude, lon: place.longitude,
    planets, natal, birth: { date, time: unknownTime ? null : time },
    timeKnown: !unknownTime, asc, mc, cusps, system,
    aspects: natalAspects(planets),
    ambiguousTime: utcResult.error === 'ambiguous-local-time'
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

const TRANSIT_ORBS = { moon: 5, sun: 3, mercury: 3, venus: 3, mars: 3, jupiter: 2, saturn: 2 };
function horoscopeFor(data, nowTs) {
  const transit = sky(dayNumber(nowTs)), found = [];
  for (const t of Object.keys(TRANSIT_ORBS)) {
    for (const p of data.planets) {
      const sep = sepAngle(transit[t], p.lon);
      for (const a of ASPECTS) {
        if (Math.abs(sep - a.a) <= TRANSIT_ORBS[t]) { found.push({ t, n: p.key, orb: Math.abs(sep - a.a), a }); break; }
      }
    }
  }
  found.sort((x, y) => x.orb - y.orb);
  const moonIdx = Math.floor(transit.moon / 30);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    when: new Date(nowTs).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }),
    tz: tz,
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
    s += `<g class="pg${faint ? ' faint' : ''}" data-k="${p.key}" style="--i:${i}"><title>${p.name}, ${p.sign} ${p.deg}°${p.retro ? ', ретроградный' : ''}</title>`
      + `<circle class="pdot" cx="${f(hx)}" cy="${f(hy)}" r="2.4"/>`
      + (Math.abs(d - p.lon) > 0.5 ? line(R2 - 4, p.lon, 240, d, 'lead') : '')
      + `<circle class="halo" cx="${f(gx)}" cy="${f(gy)}" r="19"/>`
      + text(222, d, p.sym + '\uFE0E', 'pl')
      + text(194, d, `${p.deg}°${p.retro ? ' R' : ''}`, 'pdeg') + '</g>';
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

  let current = null, horoscopeAt = 0;
  const wheelSvg = () => $('wheel-box').querySelector('svg');
  const setStatus = (msg) => { $('live-status').textContent = msg; };

  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $(id).classList.add('active');
    $('header-actions').hidden = id !== 'screen-result';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  
  const setErr = (id, msg) => {
    const input = $(id);
    input.classList.toggle('invalid', !!msg);
    input.setAttribute('aria-invalid', !!msg);
    $('err-' + id).textContent = msg || '';
  };
  
  const setBusy = (busy) => {
    const b = $('btn-submit');
    b.disabled = busy;
    b.setAttribute('aria-busy', busy);
    b.textContent = busy ? 'Считаем…' : 'Построить карту';
  };
  
  const readForm = () => ({ date: $('date').value, time: $('time').value, city: $('city').value, unknownTime: $('no-time').checked });

  function validate() {
    const v = readForm(), today = todayISO();
    const checks = [
      ['date', !v.date ? 'Укажите дату рождения' : v.date < '1900-01-01' ? 'Расчёт работает с 1900 года' : v.date > today ? 'Эта дата ещё не наступила' : ''],
      ['time', v.unknownTime || v.time ? '' : 'Укажите время или отметьте, что его не знаете'],
      ['city', v.city.trim().length >= 2 ? '' : 'Введите город рождения']
    ];
    let firstError = null;
    checks.forEach(([id, msg]) => {
      setErr(id, msg);
      if (msg && !firstError) firstError = id;
    });
    if (firstError) $(firstError).focus();
    return checks.every(([, msg]) => !msg);
  }

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

  function renderResult(data) {
    const b = data.birth;
    $('result-title').textContent = fmtDate(b.date);
    let subText = `${b.time ? 'в ' + b.time : 'время неизвестно'}, ${data.place}`;
    $('result-sub').textContent = subText;

    if (data.ambiguousTime) {
      $('result-sub').innerHTML += ' <span class="note-gold" style="display:block; margin-top:8px; font-size:0.9rem;">⚠️ Внимание: указанное время попадает на переход с летнего на зимнее время. Это время существовало дважды. Расчёт выполнен для первого вхождения. Для абсолютной точности укажите время с учётом смещения.</span>';
    }

    const P = (k) => data.planets.find((p) => p.key === k);
    const tile = (p, label, isApprox = false, isUnknown = false) => {
      if (isUnknown) {
        return `<div class="b3 empty"><span class="g asc">Asc</span><div><span class="b3-k">${label}</span><strong>невозможно определить</strong><span class="b3-d">укажите время рождения, чтобы увидеть</span></div></div>`;
      }
      return `<div class="b3">${glyph(p)}<div><span class="b3-k">${label}</span><strong>${p.sign}</strong><span class="b3-d">${isApprox ? 'Приблизительно: ' : ''}${p.deg}°${String(p.min).padStart(2, '0')}′</span></div></div>`;
    };
    
    $('big3').innerHTML = tile(P('sun'), 'Солнце, характер') 
      + tile(P('moon'), 'Луна, эмоции', P('moon').approx)
      + (P('asc') ? tile(P('asc'), 'Асцендент, первое впечатление') : tile(null, 'Асцендент, первое впечатление', false, true));

    $('wheel-box').innerHTML = wheelSVG(data);
    $('wheel-note').textContent = data.timeKnown
      ? `Дома: ${data.system}. Асцендент слева, МС сверху. Наведите курсор на планету или аспект в списке — она подсветится на колесе.`
      : 'Время рождения неизвестно. Карта построена на полдень: Асцендент и дома невозможно определить, положение Луны приблизительно.';

    $('planets-list').innerHTML = data.planets.map((p) => `
      <details class="prow" data-hl="${p.key}">
        <summary>
          ${glyph(p)}
          <span class="pmain"><span class="pname">${p.name}${p.retro ? '<em class="retro" title="Ретроградный: кажется, что идёт назад">R</em>' : ''}</span>
            <span class="psub">${signMark(p)} ${p.sign}, ${p.deg}°${String(p.min).padStart(2, '0')}′${p.house ? `, дом ${p.house}` : ''}</span></span>
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
    $('horoscope').innerHTML = '';
    horoscopeAt = 0;
    selectTab($('tab-btn-planets'));
  }

  function renderHoroscope(force) {
    if (!current || (!force && Date.now() - horoscopeAt < 5 * 60 * 1000)) return;
    horoscopeAt = Date.now();
    const h = horoscopeFor(current, horoscopeAt);
    $('horoscope').innerHTML = `
      <h3>Небо сейчас</h3>
      <p class="when">${h.when} (часовой пояс устройства: ${h.tz})</p>
      <blockquote>${h.mood}</blockquote>
      ${h.items.length
        ? h.items.map((i) => `<div class="hitem"><p>${i.text}</p><p class="muted">${i.label[0].toUpperCase() + i.label.slice(1)}. ${i.tip}</p></div>`).join('')
        : '<div class="hitem"><p>Сейчас нет сильных связей с вашей картой — спокойное время, действуйте в своём ритме.</p></div>'}
      <p class="muted small">Рассчитано на момент открытия вкладки. Луна меняет аспекты за считаные часы. Это не научный прогноз.</p>
      <button type="button" class="textbtn" id="btn-refresh">Обновить расчёт</button>`;
    $('btn-refresh').addEventListener('click', () => renderHoroscope(true));
  }

  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (tab.id === 'tab-btn-today') renderHoroscope(false);
    if (tab.id !== 'tab-btn-planets') highlight(null);
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const next = tabs[(i + d + tabs.length) % tabs.length];
      next.focus(); selectTab(next); e.preventDefault();
    });
  });

  function finish(place) {
    try {
      current = computeChart({ ...readForm(), place });
      renderResult(current);
      show('screen-result');
      $('result-title').focus({ preventScroll: true });
      setStatus('Карта готова.');
    } catch (err) {
      if (err.message === 'future') {
        setErr('date', 'Этот момент ещё не наступил');
        $('date').focus();
      } else if (err.message === 'invalid-local-time') {
        setErr('time', 'Это время не существовало (переход на летнее время). Укажите корректное время.');
        $('time').focus();
      } else {
        setErr('city', 'Не удалось построить карту. Попробуйте ещё раз.');
      }
      setStatus('Не удалось выполнить расчёт.');
    }
    setBusy(false);
  }

  function showChoices(places) {
    const box = $('city-choices');
    box.innerHTML = '<p class="choices-hint">Нашлось несколько мест — выберите нужное</p>';
    places.forEach((p, idx) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'choice';
      b.textContent = placeLabel(p);
      b.addEventListener('click', () => { box.hidden = true; setBusy(true); setStatus('Расчёт карты…'); finish(p); });
      box.appendChild(b);
      if (idx === 0) b.focus(); // Focus first choice for keyboard users
    });
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setStatus('Выбор города…');
  }

  $('birth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('city-choices').hidden = true;
    if (!validate()) return;
    setBusy(true);
    setStatus('Поиск города…');
    try {
      const places = await geocode($('city').value);
      if (places.length === 1) return finish(places[0]);
      showChoices(places);
      setBusy(false); // Wait for user choice
    } catch (err) {
      setErr('city', err.message === 'nocity' ? 'Город не найден — проверьте написание' : 'Не удалось найти город. Проверьте интернет и попробуйте ещё раз.');
      $('city').focus();
      setStatus('Не удалось выполнить расчёт.');
      setBusy(false);
    }
  });
  
  $('city').addEventListener('input', () => { $('city-choices').hidden = true; setErr('city', ''); });
  $('no-time').addEventListener('change', () => {
    const off = $('no-time').checked;
    $('time').disabled = off;
    if (off) { $('time').value = ''; setErr('time', ''); }
  });
  
  $('btn-new').addEventListener('click', () => { show('screen-form'); setStatus(''); });
  
  // Save / Share / Print
  $('btn-save').addEventListener('click', () => {
    if (!current) return;
    const data = { date: current.birth.date, time: current.birth.time, unknownTime: !current.birth.time, city: $('city').value, lat: current.lat, lon: current.lon, tz: current.tz };
    localStorage.setItem('natal_chart_last', JSON.stringify(data));
    const originalText = $('btn-save').textContent;
    $('btn-save').textContent = 'Сохранено!';
    setTimeout(() => { $('btn-save').textContent = originalText; }, 2000);
  });
  
  $('btn-share').addEventListener('click', async () => {
    if (!current) return;
    if (!confirm('Внимание: ссылка будет содержать дату, время и город рождения. Скопировать ссылку?')) return;
    const params = new URLSearchParams({
      date: current.birth.date,
      time: current.birth.time || '',
      unknownTime: !current.birth.time,
      city: $('city').value,
      lat: current.lat,
      lon: current.lon,
      tz: current.tz
    });
    const url = window.location.origin + window.location.pathname + '?' + params.toString();
    try {
      await navigator.clipboard.writeText(url);
      const originalText = $('btn-share').textContent;
      $('btn-share').textContent = 'Скопировано!';
      setTimeout(() => { $('btn-share').textContent = originalText; }, 2000);
    } catch (err) {
      alert('Не удалось скопировать ссылку. Скопируйте её из адресной строки вручную.');
    }
  });
  
  $('btn-print').addEventListener('click', () => window.print());

  // Restore from localStorage
  const saved = localStorage.getItem('natal_chart_last');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'ghost';
      restoreBtn.style.marginBottom = '16px';
      restoreBtn.textContent = 'Восстановить последнюю карту';
      restoreBtn.addEventListener('click', () => {
        $('date').value = data.date;
        $('time').value = data.time || '';
        $('no-time').checked = data.unknownTime;
        $('time').disabled = data.unknownTime;
        $('city').value = data.city;
        // Auto-submit with saved place data to avoid re-geocoding
        finish({ name: data.city, timezone: data.tz, latitude: data.lat, longitude: data.lon, country: '' });
      });
      $('birth-form').insertBefore(restoreBtn, $('birth-form').firstChild);
    } catch (e) { /* ignore corrupt storage */ }
  }

  $('ornament').innerHTML = ornamentSVG();
  $('date').max = todayISO();
}

if (typeof module !== 'undefined') {
  module.exports = { sky, ascendant, midheaven, buildHouses, houseOf, ramcOf, obliquity, retroFlags, computeChart, horoscopeFor, wheelSVG, ornamentSVG, localToUTC, julian, dayNumber, natalAspects };
}
