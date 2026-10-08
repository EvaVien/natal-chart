#!/usr/bin/env python3
"""Опциональная браузерная проверка (не входит в `node --test`, не нужна для CI).

  pip install playwright && playwright install chromium
  python3 -m http.server 8000 &        # из корня проекта
  python3 tools/smoke.py http://localhost:8000/

Геокодер подменяется заглушкой, так что сеть не нужна. Скрипт печатает PASS/FAIL по каждой проверке.
"""
import json, sys, time, datetime as dt
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/'
UFA = {"name": "Уфа", "admin1": "Башкортостан", "country": "Россия", "country_code": "RU", "timezone": "Asia/Yekaterinburg", "latitude": 54.74, "longitude": 55.97, "population": 1100000}
UFA2 = {**UFA, "admin1": "Иркутская область", "timezone": "Asia/Irkutsk", "latitude": 55.0, "longitude": 103.0, "population": 100}
NYC = {"name": "New York", "admin1": "New York", "country": "United States", "country_code": "US", "timezone": "America/New_York", "latitude": 40.71, "longitude": -74.0}
results, failed = [], 0
def check(name, ok, detail=''):
    global failed
    results.append((name, ok, detail)); failed += (not ok)
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail and not ok else ''))

scenario = {'mode': 'ufa', 'calls': 0}
def geo(route):
    scenario['calls'] += 1
    m = scenario['mode']
    if m == 'hang': return                       # запрос не завершается (проверка таймаута)
    if m == 'abort': return route.abort('failed')
    if m == '500': return route.fulfill(status=500, body='boom')
    if m == 'badjson': return route.fulfill(status=200, content_type='application/json', body='<html>nope')
    if m == 'empty': return route.fulfill(status=200, content_type='application/json', body='{"generationtime_ms":1}')
    res = {'two': [UFA, UFA2], 'nyc': [NYC]}.get(m, [UFA])
    route.fulfill(status=200, content_type='application/json', body=json.dumps({'results': res}))

def fresh(p, w=1280, h=900, **kw):
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': w, 'height': h}, **kw); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.route('**/geocoding-api.open-meteo.com/**', geo); pg.goto(BASE); return b, ctx, pg, errs

def fill(pg, date, time_, city, unknown=False):
    pg.fill('#date', date)
    if unknown: pg.check('#no-time')
    else: pg.fill('#time', time_)
    pg.fill('#city', city)

active = lambda pg: pg.evaluate('document.activeElement && document.activeElement.id')
status = lambda pg: pg.inner_text('#live-status') if pg.evaluate("!!document.getElementById('live-status')") else ''
today = dt.date.today().isoformat()

with sync_playwright() as p:
    # ---------- 1. начальное состояние и валидация ----------
    b, ctx, pg, errs = fresh(p)
    check('date min=1900-01-01', pg.get_attribute('#date', 'min') == '1900-01-01')
    check('date max = сегодня', pg.get_attribute('#date', 'max') == today, pg.get_attribute('#date', 'max'))
    check('поля начинаются с aria-invalid=false', all(pg.get_attribute(i, 'aria-invalid') == 'false' for i in ('#date', '#time', '#city')))
    pg.click('#btn-submit')
    check('пустая форма: фокус на первое ошибочное поле (дата)', active(pg) == 'date', active(pg))
    check('aria-invalid=true на всех пустых полях', all(pg.get_attribute(i, 'aria-invalid') == 'true' for i in ('#date', '#time', '#city')))
    check('ошибка связана через aria-describedby', 'err-date' in pg.get_attribute('#date', 'aria-describedby') and pg.inner_text('#err-date') != '')
    check('live-status объявляет ошибку формы', 'ошибки' in status(pg).lower(), status(pg))
    pg.fill('#date', '2001-05-20')
    check('после исправления aria-invalid снимается', pg.get_attribute('#date', 'aria-invalid') == 'false')
    pg.fill('#date', today.replace(today[:4], str(int(today[:4]) + 1)))
    pg.fill('#time', '10:00'); pg.fill('#city', 'Уфа'); pg.click('#btn-submit')
    check('дата в будущем отклоняется с фокусом на дате', active(pg) == 'date' and pg.get_attribute('#date', 'aria-invalid') == 'true')
    # неизвестное время
    pg.fill('#date', '2001-05-20')
    pg.focus('#no-time'); pg.keyboard.press('Space')
    check('Space включает «не знаю время»', pg.is_checked('#no-time'))
    check('поле времени отключено и объяснено', pg.is_disabled('#time') and pg.is_visible('#time-hint'))
    check('подсказка связана с полем через aria-describedby', 'time-hint' in pg.get_attribute('#time', 'aria-describedby'))
    check('нет ошибок в консоли', not errs, str(errs)); b.close()

    # ---------- 2. клавиатурный сценарий: порядок Tab ----------
    b, ctx, pg, errs = fresh(p)
    order = []
    for _ in range(24):                  # у date/time по нескольку внутренних Tab-стопов (день/месяц/год, часы/минуты)
        pg.keyboard.press('Tab'); cur = pg.evaluate("document.activeElement.id || document.activeElement.className || document.activeElement.tagName")
        if not order or order[-1] != cur: order.append(cur)
    exp_start = ['skip']
    check('Tab: skip-link → шапка → поля в логичном порядке', 'date' in order and order.index('date') < order.index('time') < order.index('no-time') < order.index('city') < order.index('btn-submit'), str(order))
    check('первый Tab попадает на skip-link', order[0] == 'skip', order[0])
    b.close()

    # ---------- 3. нормальный сценарий с клавиатуры ----------
    scenario['mode'] = 'ufa'
    b, ctx, pg, errs = fresh(p)
    fill(pg, '2001-05-20', '10:30', 'Уфа'); pg.focus('#city'); pg.keyboard.press('Enter')
    pg.wait_for_selector('#screen-result.active')
    check('после расчёта фокус на заголовке результата', active(pg) == 'result-title', active(pg))
    check('live-status: «Карта готова.»', status(pg) == 'Карта готова.', status(pg))
    check('кнопка расчёта вернулась в норму', pg.inner_text('#btn-submit') == 'Построить карту' and not pg.is_disabled('#btn-submit'))
    check('есть h1 на экране результата', pg.evaluate("[...document.querySelectorAll('#screen-result h1')].length") == 1)
    check('текстовый список планет и аспектов существует (колесо не единственный источник)', pg.locator('.prow').count() == 11 and pg.locator('.arow').count() >= 1, str(pg.locator('.prow').count()))
    # вкладки
    pg.focus('#tab-btn-planets'); pg.keyboard.press('ArrowRight')
    check('ArrowRight → «Аспекты»', pg.get_attribute('#tab-btn-aspects', 'aria-selected') == 'true' and pg.is_hidden('#panel-planets') and pg.is_visible('#panel-aspects'))
    pg.keyboard.press('End')
    check('End → последняя вкладка', pg.get_attribute('#tab-btn-today', 'aria-selected') == 'true' and active(pg) == 'tab-btn-today')
    pg.keyboard.press('Home')
    check('Home → первая вкладка', pg.get_attribute('#tab-btn-planets', 'aria-selected') == 'true')
    check('у неактивных вкладок tabindex=-1', pg.get_attribute('#tab-btn-aspects', 'tabindex') == '-1')
    # «Сегодня»
    pg.click('#tab-btn-today'); txt = pg.inner_text('#horoscope')
    check('«Сегодня»: явный часовой пояс и UTC', 'по времени вашего устройства' in txt and 'UTC' in txt, txt[:200])
    check('«Сегодня»: перечислены учитываемые планеты и отсутствие внешних', 'Уран, Нептун и Плутон здесь не участвуют' in txt)
    check('«Сегодня»: оговорка про ненаучность', 'не научный прогноз' in txt)
    check('нет ошибок в консоли', not errs, str(errs))
    # сохранение — только по действию
    check('ничего не сохранено до нажатия «Сохранить карту»', pg.evaluate("Object.keys(localStorage).length") == 0)
    pg.click('#btn-save')
    raw = pg.evaluate("localStorage.getItem('efemerida:saved-chart:v1')")
    check('после нажатия сохранены минимальные данные', raw is not None and len(raw) < 400 and 'planets' not in raw, str(raw)[:120])
    check('сообщение об успехе видно и в live-status', 'сохранена' in pg.inner_text('#tool-msg') and 'сохранена' in status(pg))
    pg.reload(); pg.wait_for_selector('#saved-box:not([hidden])')
    check('после перезагрузки предлагается «Восстановить последнюю карту»', pg.is_visible('#btn-restore'))
    pg.click('#btn-restore'); pg.wait_for_selector('#screen-result.active')
    check('восстановление строит карту без обращения к геокодеру', scenario['calls'] == 1, str(scenario['calls']))
    pg.click('#btn-forget-result')
    check('«Удалить сохранённые данные» очищает хранилище', pg.evaluate("localStorage.getItem('efemerida:saved-chart:v1')") is None)
    # ссылка
    pg.click('#btn-share')
    check('панель «Поделиться» предупреждает про данные в URL', 'содержать дату, время и место' in pg.inner_text('#share-panel') and pg.get_attribute('#btn-share', 'aria-expanded') == 'true')
    check('ссылка не создана автоматически', pg.is_hidden('#share-url'))
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
    pg.click('#btn-copy-link'); url = pg.input_value('#share-url')
    check('ссылка содержит параметры date/time/lat/lon/tz', all(k in url for k in ('date=2001-05-20', 'time=10%3A30', 'lat=', 'lon=', 'tz=Asia%2FYekaterinburg')), url)
    b2 = ctx.new_page(); b2.route('**/geocoding-api.open-meteo.com/**', geo); b2.goto(url); b2.wait_for_selector('#screen-result.active')
    check('открытие по ссылке строит карту', b2.inner_text('#result-title') == '20 мая 2001')
    check('параметры убраны из адресной строки после открытия', '?' not in b2.url, b2.url)
    b.close()

    # ---------- 4. неоднозначный город ----------
    scenario['mode'] = 'two'
    b, ctx, pg, errs = fresh(p)
    fill(pg, '2001-05-20', '10:30', 'Уфа'); pg.click('#btn-submit'); pg.wait_for_selector('.choice')
    check('выбор города: фокус на первом варианте', pg.evaluate("document.activeElement.className") == 'choice' and pg.evaluate("document.activeElement.textContent").startswith('Уфа'))
    check('кнопка расчёта не залипла в «Считаем…» во время выбора', pg.inner_text('#btn-submit') == 'Построить карту')
    check('live-status: «Выбор города…»', status(pg) == 'Выбор города…', status(pg))
    check('группа вариантов подписана', pg.get_attribute('#city-choices', 'aria-labelledby') == 'city-choices-hint')
    pg.keyboard.press('Tab'); pg.keyboard.press('Enter')
    pg.wait_for_selector('#screen-result.active')
    check('Enter на втором варианте выбирает его', 'Иркутская' in pg.inner_text('#result-sub'), pg.inner_text('#result-sub'))
    b.close()

    # ---------- 5. сбои геокодера ----------
    cases = [('500', 'недоступен'), ('abort', 'связаться'), ('badjson', 'недоступен'), ('empty', 'не найден')]
    for mode, frag in cases:
        scenario['mode'] = mode
        b, ctx, pg, errs = fresh(p)
        fill(pg, '2001-05-20', '10:30', 'Уфа'); pg.click('#btn-submit')
        pg.wait_for_function("document.getElementById('err-city').textContent.length > 0")
        check(f'сбой «{mode}»: понятное сообщение', frag in pg.inner_text('#err-city'), pg.inner_text('#err-city'))
        check(f'сбой «{mode}»: кнопка снова доступна', not pg.is_disabled('#btn-submit') and pg.inner_text('#btn-submit') == 'Построить карту')
        check(f'сбой «{mode}»: фокус на поле города, aria-invalid', active(pg) == 'city' and pg.get_attribute('#city', 'aria-invalid') == 'true')
        check(f'сбой «{mode}»: live-status', status(pg) == 'Не удалось выполнить расчёт.', status(pg))
        b.close()

    # двойная отправка: задержку делаем в самой странице (init-скрипт), чтобы не блокировать диспетчер Playwright
    scenario['mode'] = 'ufa'
    b, ctx, pg, errs = fresh(p)
    pg.evaluate("""() => { window.__geoCalls = 0; const f = window.fetch; window.fetch = async (...a) => { window.__geoCalls++; await new Promise(r => setTimeout(r, 1200)); return f(...a); }; }""")
    fill(pg, '2001-05-20', '10:30', 'Уфа'); pg.focus('#city'); pg.keyboard.press('Enter'); pg.keyboard.press('Enter'); pg.dispatch_event('#birth-form', 'submit'); pg.click('#btn-submit', force=True, no_wait_after=True)
    check('во время запроса кнопка disabled, aria-busy', pg.is_disabled('#btn-submit') and pg.get_attribute('#btn-submit', 'aria-busy') == 'true')
    pg.wait_for_selector('#screen-result.active')
    check('повторные submit не создают параллельных запросов', pg.evaluate('window.__geoCalls') == 1, str(pg.evaluate('window.__geoCalls')))
    b.close()

    # таймаут (реальные 9 секунд)
    scenario['mode'] = 'hang'
    b, ctx, pg, errs = fresh(p)
    fill(pg, '2001-05-20', '10:30', 'Уфа'); t0 = time.time(); pg.click('#btn-submit')
    check('во время ожидания видно «Поиск города…»', 'Поиск города' in pg.inner_text('#form-status'))
    pg.wait_for_function("document.getElementById('err-city').textContent.length > 0", timeout=15000)
    check('таймаут: сообщение и возврат кнопки', 'слишком долго' in pg.inner_text('#err-city') and not pg.is_disabled('#btn-submit'), f'{time.time()-t0:.1f}s')
    check('таймаут наступает за ~9 с', 8 <= time.time() - t0 <= 11, f'{time.time()-t0:.1f}s')
    b.close()

    # ---------- 6. DST ----------
    scenario['mode'] = 'nyc'
    b, ctx, pg, errs = fresh(p)
    fill(pg, '2023-03-12', '02:30', 'New York'); pg.click('#btn-submit')
    pg.wait_for_function("document.getElementById('err-time').textContent.length > 0")
    check('DST gap: понятная ошибка у поля времени и фокус', 'не существовало' in pg.inner_text('#err-time') and active(pg) == 'time')
    check('DST gap: карта не построена молча', pg.is_hidden('#screen-result'))
    fill(pg, '2023-11-05', '01:30', 'New York'); pg.click('#btn-submit'); pg.wait_for_selector('#time-choices:not([hidden])')
    check('DST overlap: предложено два варианта, ничего не выбрано молча', pg.locator('#time-choices .choice').count() == 2 and pg.is_hidden('#screen-result'))
    check('DST overlap: подписи содержат смещения', 'UTC−4' in pg.inner_text('#time-choices') and 'UTC−5' in pg.inner_text('#time-choices'), pg.inner_text('#time-choices'))
    check('DST overlap: фокус на первом варианте', pg.evaluate("document.activeElement.className") == 'choice')
    pg.locator('#time-choices .choice').nth(1).click(); pg.wait_for_selector('#screen-result.active')
    check('DST overlap: выбор отражён в результате', 'второе' in pg.inner_text('#result-sub'), pg.inner_text('#result-sub'))
    b.close()

    # ---------- 7. неизвестное время ----------
    scenario['mode'] = 'ufa'
    b, ctx, pg, errs = fresh(p)
    fill(pg, '2001-05-02', '', 'Уфа', unknown=True); pg.click('#btn-submit'); pg.wait_for_selector('#screen-result.active')
    check('блок «Что известно, а что нет» показан', pg.is_visible('#certainty') and 'Определить невозможно' in pg.inner_text('#certainty'))
    moon = pg.locator('.prow').nth(1).inner_text()
    check('Луна без времени: два знака, градусов нет', ' или ' in moon and '°' not in moon, moon.replace('\n', ' '))
    check('Асцендент: «невозможно определить»', 'невозможно определить' in pg.inner_text('#big3'))
    sun = pg.locator('.prow').nth(0).inner_text()
    check('Солнце без времени: «около N°», без минут', 'около' in sun and '′' not in sun, sun.replace('\n', ' '))
    check('в колесе нет Asc/MC и домов', pg.locator('.wheel .angle').count() == 0 and pg.locator('.wheel .hnum').count() == 0)
    b.close()

    # ---------- 8. безопасность URL ----------
    b, ctx, pg, errs = fresh(p)
    evil = BASE + "?date=2001-05-20&time=10:30&city=%3Cimg%20src%3Dx%20onerror%3D%22window.__xss%3D1%22%3E&lat=54.74&lon=55.97&tz=Asia/Yekaterinburg"
    pg.goto(evil); pg.wait_for_timeout(600)
    check('XSS через city не исполняется', pg.evaluate("window.__xss") is None)
    check('в DOM не появился <img> из параметров', pg.locator('img').count() == 0)
    pg.goto(BASE + "?date=2001-05-20&time=10:30&city=Ufa&lat=999&lon=55&tz=Asia/Yekaterinburg"); pg.wait_for_timeout(400)
    check('некорректная ссылка: уведомление, карта не строится', pg.is_visible('#form-notice') and pg.is_visible('#screen-form') and pg.is_hidden('#screen-result'))
    pg.goto(BASE + "?date=2001-05-20&time=10:30&city=Ufa&lat=54&lon=55&tz=%3Cscript%3E"); pg.wait_for_timeout(400)
    check('подставной часовой пояс отклоняется', pg.is_visible('#form-notice'))
    # повреждённый localStorage не ломает страницу
    pg.goto(BASE); pg.evaluate("localStorage.setItem('efemerida:saved-chart:v1','{не json')"); pg.reload(); pg.wait_for_timeout(300)
    check('повреждённые данные игнорируются и удаляются', pg.is_hidden('#saved-box') and pg.evaluate("localStorage.getItem('efemerida:saved-chart:v1')") is None)
    pg.evaluate("localStorage.setItem('natal_chart_last','{\"date\":\"2001-01-01\"}')"); pg.reload(); pg.wait_for_timeout(300)
    check('данные старой версии без согласия удаляются', pg.evaluate("localStorage.getItem('natal_chart_last')") is None)
    b.close()

    # ---------- 9. печать ----------
    scenario['mode'] = 'ufa'
    b, ctx, pg, errs = fresh(p)
    fill(pg, '2001-05-20', '10:30', 'Уфа'); pg.click('#btn-submit'); pg.wait_for_selector('#screen-result.active')
    pg.emulate_media(media='print'); pg.evaluate("window.dispatchEvent(new Event('beforeprint'))")
    vis = lambda s: pg.locator(s).first.is_visible()
    check('печать: колесо, тройка, планеты и аспекты видны', vis('.wheel') and vis('#big3') and vis('#panel-planets') and vis('#panel-aspects'))
    check('печать: вкладки, кнопки, фон и «Сегодня» скрыты', not vis('.tabs') and not vis('.result-tools') and not vis('.ornament') and not vis('#panel-today'))
    check('печать: оговорка про астрологию присутствует', vis('.foot') and 'не научный прогноз' in pg.inner_text('.foot'))
    check('печать: все планеты раскрыты', pg.locator('details.prow[open]').count() == 11)
    pg.pdf(path='/tmp/print-test.pdf', format='A4', print_background=True)
    pg.evaluate("window.dispatchEvent(new Event('afterprint'))"); pg.emulate_media(media='screen')
    check('после печати интерфейс восстановлен', pg.locator('details.prow[open]').count() == 0 and pg.is_hidden('#panel-aspects'))
    b.close()

    # ---------- 10. переполнение по ширине ----------
    for w in (320, 375, 430, 768, 1024, 1440, 1920):
        b, ctx, pg, errs = fresh(p, w=w, h=900)
        over = lambda: pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        o1 = over()
        fill(pg, '2001-05-20', '10:30', 'Уфа'); pg.click('#btn-submit'); pg.wait_for_selector('#screen-result.active'); pg.wait_for_timeout(500)
        o2 = over(); pg.click('#tab-btn-aspects'); o3 = over(); pg.click('#tab-btn-today'); o4 = over()
        wheel_w = pg.evaluate("document.querySelector('.wheel').getBoundingClientRect().width")
        check(f'{w}px: нет горизонтального переполнения (форма/результат/аспекты/сегодня)', max(o1, o2, o3, o4) <= 0, f'{o1},{o2},{o3},{o4}')
        check(f'{w}px: колесо помещается', wheel_w <= w, f'{wheel_w:.0f}')
        if w in (320, 1440): pg.screenshot(path=f'/tmp/shot-{w}-result.png')
        b.close()

print(f'\n{len(results) - failed}/{len(results)} проверок пройдено')
sys.exit(1 if failed else 0)
