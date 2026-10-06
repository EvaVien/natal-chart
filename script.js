'use strict';

/* ===== Справочники ===== */
const SIGNS = [
  ['Овен', '♈'], ['Телец', '♉'], ['Близнецы', '♊'], ['Рак', '♋'],
  ['Лев', '♌'], ['Дева', '♍'], ['Весы', '♎'], ['Скорпион', '♏'],
  ['Стрелец', '♐'], ['Козерог', '♑'], ['Водолей', '♒'], ['Рыбы', '♓']
];
// Верхние границы знаков (МДД, не включительно) и индексы в SIGNS
const SIGN_LIMITS = [[120, 9], [219, 10], [321, 11], [420, 0], [521, 1], [621, 2], [723, 3], [823, 4],
                     [923, 5], [1023, 6], [1122, 7], [1222, 8]];

const PLANETS = [
  ['Солнце', '☉'], ['Луна', '☽'], ['Асцендент', 'Asc'],
  ['Меркурий', '☿'], ['Венера', '♀'], ['Марс', '♂']
];

const THEMES = ['Карьера', 'Отношения', 'Финансы', 'Саморазвитие', 'Творчество'];
const TEXTS = [
  'Сегодня хорошо завершать начатое: накопившиеся дела сдвинутся с места, если выделить на них один спокойный час.',
  'День располагает к разговорам. Важное сообщение или встреча может прояснить ситуацию, которая давно беспокоила.',
  'Энергия идёт на подъём во второй половине дня. Не берите лишнего утром — оставьте силы на вечер.',
  'Хороший момент для небольших перемен: новый маршрут, смена порядка дел, пересмотр планов на неделю.',
  'Прислушайтесь к интуиции в мелочах. Первое впечатление о человеке или предложении сегодня особенно точно.',
  'Избегайте спешки в финансовых решениях. Лучше сначала сравнить варианты, а подтвердить выбор завтра.'
];

/* ===== Утилиты ===== */
const $ = (id) => document.getElementById(id);

// Детерминированный хеш строки → число (чтобы одни и те же данные давали один результат)
function hash(str) {
  let h = 2166136261;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Знак Солнца по дате — считается честно, остальное в моках приблизительное
function sunSignIndex(month, day) {
  const md = month * 100 + day;
  const hit = SIGN_LIMITS.find(([limit]) => md < limit);
  return hit ? hit[1] : 9; // с 22.12 — Козерог
}

/* ===== Данные =====
   getAstroData() возвращает объект { planets: [...], horoscope: {...} }.
   Сейчас — мок-данные. Подключение реального API: см. TODO ниже. */
async function getAstroData({ date, time, city }) {
  // TODO: API — замените блок мок-данных на реальный запрос, например AstrologyAPI:
  //   const res = await fetch('https://json.astrologyapi.com/v1/western_horoscope', {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json',
  //       // TODO: API — вставьте ключ: 'Basic ' + btoa('USER_ID:API_KEY')
  //       'Authorization': 'Basic ' + btoa('USER_ID:API_KEY')
  //     },
  //     body: JSON.stringify({ day, month, year, hour, min, lat, lon, tzone })
  //   });
  //   const data = await res.json();
  //   // затем приведите data к формату, который возвращает мок ниже.
  // Внимание: ключ в статическом JS виден всем. Для продакшена проксируйте запрос через
  // серверless-функцию (Cloudflare Workers, Netlify Functions и т.п.).
  // Для координат города нужен геокодинг (например, Nominatim/OpenStreetMap).

  await new Promise((r) => setTimeout(r, 2200)); // имитация сети + анимация загрузки

  const [y, m, d] = date.split('-').map(Number);
  const seed = hash(`${date}|${time}|${city.toLowerCase()}`);

  const planets = PLANETS.map(([name, sym], i) => {
    // Солнце считаем по дате, остальные — псевдослучайно от seed
    const idx = i === 0 ? sunSignIndex(m, d) : (seed >>> (i * 3)) % 12;
    return { name, sym, sign: SIGNS[idx][0], signSym: SIGNS[idx][1], deg: (seed >>> i) % 30 };
  });

  // Гороскоп зависит от знака Солнца и сегодняшней даты
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const hs = hash(todayKey + planets[0].sign);
  const horoscope = {
    date: today.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
    sign: planets[0].sign,
    theme: THEMES[hs % THEMES.length],
    texts: [TEXTS[hs % TEXTS.length], TEXTS[(hs >>> 4) % TEXTS.length]],
    luck: 40 + (hs % 61) // «индекс дня» 40–100
  };

  return { planets, horoscope };
}

/* ===== Экраны ===== */
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ===== Валидация ===== */
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

/* ===== Рендер ===== */
function renderResult(data) {
  $('cards').innerHTML = data.planets.map((p, i) => `
    <div class="card" style="animation-delay:${i * 90}ms">
      <div class="sym">${p.sym}</div>
      <div class="planet">${p.name}</div>
      <div class="sign">${p.signSym} ${p.sign}</div>
      <div class="deg">${p.deg}°</div>
    </div>`).join('');
  $('result-sub').textContent = `Солнце в знаке «${data.planets[0].sign}»`;

  const h = data.horoscope;
  $('horoscope').innerHTML = `
    <h3>Гороскоп на ${h.date}</h3>
    <p class="meta">${h.sign} · акцент дня: ${h.theme.toLowerCase()} · индекс дня ${h.luck}/100</p>
    ${h.texts.map((t) => `<p>${t}</p>`).join('')}`;
  $('horoscope').hidden = true;
}

/* ===== События ===== */
$('birth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validate()) return;                       // Клик 1
  show('screen-loading');
  try {
    const data = await getAstroData({ date: $('date').value, time: $('time').value, city: $('city').value });
    renderResult(data);
    show('screen-result');
  } catch (err) {
    console.error(err);
    show('screen-form');
    $('err-city').textContent = 'Не удалось получить данные. Попробуйте ещё раз.';
  }
});

$('btn-horoscope').addEventListener('click', () => { // Клик 2
  const box = $('horoscope');
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

$('btn-back').addEventListener('click', () => show('screen-form'));
