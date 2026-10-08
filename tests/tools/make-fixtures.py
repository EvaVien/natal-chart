#!/usr/bin/env python3
"""Генерирует tests/fixtures/*.json — независимые эталоны для регрессионных тестов.

  pip install pyswisseph
  python3 tests/tools/make-fixtures.py

swisseph.json  — долготы планет, ретроградность (по знаку скорости), Асцендент, МС, куспиды домов
                 из Swiss Ephemeris (встроенная Moshier-эфемерида, файлы данных не нужны).
timezones.json — ожидаемые моменты UTC для локального времени, вычислены стандартной tz-базой Python (zoneinfo),
                 то есть независимо от JavaScript-реализации.
"""
import json, sys, datetime as dt
from zoneinfo import ZoneInfo
import swisseph as swe

OUT = __file__.rsplit('/tests/tools/', 1)[0] + '/tests/fixtures/'
BODIES = {'sun': swe.SUN, 'moon': swe.MOON, 'mercury': swe.MERCURY, 'venus': swe.VENUS, 'mars': swe.MARS,
          'jupiter': swe.JUPITER, 'saturn': swe.SATURN, 'uranus': swe.URANUS, 'neptune': swe.NEPTUNE, 'pluto': swe.PLUTO}

def jd_ut(y, m, d, hh, mm):
    return swe.julday(y, m, d, hh + mm / 60.0)

# name, UTC момент, широта, долгота, комментарий
CASES = [
    ('lower-bound-1900',    (1900, 1, 1, 12, 0),   51.48,   0.00,  'нижняя граница поддерживаемых дат'),
    ('j2000-greenwich',     (2000, 1, 1, 12, 0),   51.48,   0.00,  'эпоха J2000'),
    ('mid-century-moscow',  (1950, 6, 15, 8, 30),  55.75,  37.62,  'середина диапазона'),
    ('apollo11-florida',    (1969, 7, 20, 20, 17), 28.50, -80.60,  'западное полушарие'),
    ('ufa-2001',            (2001, 5, 20, 4, 30),  54.74,  55.97,  'типичный сценарий'),
    ('quito-equator',       (2010, 10, 10, 15, 0), -0.18, -78.47,  'экватор'),
    ('sydney-leapday',      (2024, 2, 29, 12, 0), -33.87, 151.21,  'южное полушарие, 29 февраля'),
    ('tokyo-2050',          (2050, 6, 15, 6, 0),   35.68, 139.69,  'будущее (формулы справедливы)'),
    ('reykjavik-2099',      (2099, 12, 31, 23, 0), 64.15, -21.94,  'около верхней границы 2100'),
    ('tromso-high-lat',     (1950, 12, 21, 3, 0),  69.65,  18.96,  'выше 66° — равные дома'),
    ('longyearbyen-polar',  (1985, 1, 1, 10, 0),   78.22,  15.65,  'около-полярная широта'),
]

def planets(jd):
    out, retro = {}, {}
    for k, b in BODIES.items():
        r = swe.calc_ut(jd, b, swe.FLG_MOSEPH | swe.FLG_SPEED)[0]
        out[k] = r[0]
        if k not in ('sun', 'moon'):
            retro[k] = {'retro': r[3] < 0, 'speed': r[3]}
    return out, retro

fx = []
for name, (y, m, d, hh, mm), lat, lon, note in CASES:
    jd = jd_ut(y, m, d, hh, mm)
    pl, retro = planets(jd)
    hs = b'E' if abs(lat) > 66 else b'P'
    cusps, ascmc = swe.houses(jd, lat, lon, hs)
    fx.append({'name': name, 'note': note, 'utc': dt.datetime(y, m, d, hh, mm, tzinfo=dt.timezone.utc).isoformat(),
               'jd': jd, 'lat': lat, 'lon': lon, 'system': 'equal' if hs == b'E' else 'placidus',
               'planets': pl, 'retro': retro, 'asc': ascmc[0], 'mc': ascmc[1], 'cusps': list(cusps)})

# Ретроградность в известные периоды (контроль по скорости Swiss Ephemeris)
retro_dates = [(2023, 12, 25), (2024, 2, 1), (2024, 6, 20), (2025, 3, 20), (2019, 9, 10), (1999, 8, 1)]
retro_fx = []
for y, m, d in retro_dates:
    jd = jd_ut(y, m, d, 12, 0)
    _, retro = planets(jd)
    retro_fx.append({'date': f'{y}-{m:02d}-{d:02d}', 'jd': jd, 'retro': retro})

# Дата, когда Луна меняет знак в течение местных суток (для неизвестного времени)
def find_moon_cross(tzname, start):
    tz = ZoneInfo(tzname)
    day = start
    for _ in range(40):
        a = dt.datetime(day.year, day.month, day.day, 0, 0, tzinfo=tz).astimezone(dt.timezone.utc)
        b = dt.datetime(day.year, day.month, day.day, 23, 59, tzinfo=tz).astimezone(dt.timezone.utc)
        la = swe.calc_ut(jd_ut(a.year, a.month, a.day, a.hour, a.minute), swe.MOON, swe.FLG_MOSEPH)[0][0]
        lb = swe.calc_ut(jd_ut(b.year, b.month, b.day, b.hour, b.minute), swe.MOON, swe.FLG_MOSEPH)[0][0]
        if int(la // 30) != int(lb // 30):
            return {'date': day.isoformat(), 'signs': [int(la // 30), int(lb // 30)], 'start': la, 'end': lb}
        day += dt.timedelta(days=1)
moon_cross = find_moon_cross('Asia/Yekaterinburg', dt.date(2001, 5, 1))
moon_still = None
tz = ZoneInfo('Asia/Yekaterinburg'); day = dt.date(2001, 6, 1)
for _ in range(40):
    a = dt.datetime(day.year, day.month, day.day, 0, 0, tzinfo=tz).astimezone(dt.timezone.utc)
    b = dt.datetime(day.year, day.month, day.day, 23, 59, tzinfo=tz).astimezone(dt.timezone.utc)
    la = swe.calc_ut(jd_ut(a.year, a.month, a.day, a.hour, a.minute), swe.MOON, swe.FLG_MOSEPH)[0][0]
    lb = swe.calc_ut(jd_ut(b.year, b.month, b.day, b.hour, b.minute), swe.MOON, swe.FLG_MOSEPH)[0][0]
    if int(la // 30) == int(lb // 30) and (la % 30) > 8 and (la % 30) < 15:
        moon_still = {'date': day.isoformat(), 'sign': int(la // 30)}; break
    day += dt.timedelta(days=1)

json.dump({'swe': swe.version, 'cases': fx, 'retro': retro_fx, 'moonCross': moon_cross, 'moonStill': moon_still},
          open(OUT + 'swisseph.json', 'w'), indent=1, ensure_ascii=False)

# ---- Асцендент на высоких широтах: случайный набор (фиксированный seed), Swiss Ephemeris, равные дома
import random
random.seed(7)
polar = []
for _ in range(120):
    lat = random.choice([-1, 1]) * random.uniform(60, 88)
    lon = random.uniform(-180, 180); jd = random.uniform(2415385, 2488069)
    _, ascmc = swe.houses(jd, lat, lon, b'E')
    polar.append({'jd': jd, 'lat': lat, 'lon': lon, 'asc': ascmc[0], 'mc': ascmc[1]})
json.dump(polar, open(OUT + 'polar-asc.json', 'w'))

# ---- Часовые пояса: ожидаемые результаты по zoneinfo
TZ_CASES = [
    # (tz, date, time, заметка)
    ('Europe/Moscow',        '2023-06-15', '12:00', 'обычное время'),
    ('Europe/Moscow',        '2023-06-15', '00:00', 'начало суток'),
    ('Europe/Moscow',        '2023-06-15', '23:59', 'конец суток'),
    ('Asia/Yekaterinburg',   '1998-03-16', '12:00', 'историческая зона'),
    ('Asia/Yekaterinburg',   '2001-05-20', '09:30', 'российское летнее время 2001'),
    ('America/New_York',     '2023-03-12', '01:59', 'за минуту до перевода вперёд'),
    ('America/New_York',     '2023-03-12', '02:00', 'DST gap — начало'),
    ('America/New_York',     '2023-03-12', '02:30', 'DST gap — середина'),
    ('America/New_York',     '2023-03-12', '03:00', 'сразу после gap'),
    ('America/New_York',     '2023-11-05', '00:59', 'до overlap'),
    ('America/New_York',     '2023-11-05', '01:00', 'DST overlap — начало'),
    ('America/New_York',     '2023-11-05', '01:30', 'DST overlap — середина'),
    ('America/New_York',     '2023-11-05', '02:00', 'после overlap'),
    ('Europe/Berlin',        '2023-03-26', '02:30', 'gap, Европа'),
    ('Europe/Berlin',        '2023-10-29', '02:30', 'overlap, Европа'),
    ('Europe/Moscow',        '2011-03-27', '02:30', 'gap: последний перевод вперёд в РФ'),
    ('Europe/Moscow',        '2011-03-27', '03:30', 'после последнего перевода вперёд'),
    ('Europe/Moscow',        '2014-10-26', '01:30', 'overlap: перевод на постоянное +3'),
    ('Europe/Moscow',        '2014-10-26', '03:30', 'после перевода на +3'),
    ('Australia/Lord_Howe',  '2023-10-01', '02:15', 'gap 30 минут'),
    ('Australia/Lord_Howe',  '2023-04-02', '01:45', 'overlap 30 минут'),
    ('Pacific/Apia',         '2011-12-30', '12:00', 'целый пропущенный день'),
    ('Pacific/Apia',         '2011-12-31', '12:00', 'день после пропуска'),
    ('America/Sao_Paulo',    '2018-11-04', '00:30', 'gap в полночь'),
    ('Asia/Kathmandu',       '2023-06-01', '12:00', 'смещение +5:45'),
    ('Pacific/Kiritimati',   '2023-06-01', '12:00', 'смещение +14'),
    ('Asia/Kolkata',         '1941-06-01', '12:00', 'историческое смещение Индии'),
]
def expected(tz, date, time):
    z = ZoneInfo(tz)
    y, m, d = map(int, date.split('-')); hh, mm = map(int, time.split(':'))
    res = []
    for fold in (0, 1):
        loc = dt.datetime(y, m, d, hh, mm, tzinfo=z, fold=fold)
        u = loc.astimezone(dt.timezone.utc)
        back = u.astimezone(z).replace(tzinfo=None)
        if back == loc.replace(tzinfo=None):
            res.append(int(u.timestamp() * 1000))
    res = sorted(set(res))
    status = 'invalid-local-time' if not res else 'ok' if len(res) == 1 else 'ambiguous-local-time'
    return {'status': status, 'candidates': res}
out = [dict(tz=tz, date=date, time=time, note=note, **expected(tz, date, time)) for tz, date, time, note in TZ_CASES]
json.dump(out, open(OUT + 'timezones.json', 'w'), indent=1, ensure_ascii=False)
print('swisseph', swe.version, '| cases', len(fx), '| tz cases', len(out), '| moonCross', moon_cross, '| moonStill', moon_still)
print({o['status'] for o in out}, sum(o['status'] != 'ok' for o in out), 'non-ok')
