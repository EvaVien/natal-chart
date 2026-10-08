// Генерирует assets/social-preview.html (статичная разметка из того же кода колеса и тех же шрифтов).
// PNG снимается из неё headless-браузером: см. README, раздел «Превью для соцсетей».
const fs = require('fs'), path = require('path');
const { ornamentSVG } = require('../script.js');
const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8').split('/* ===== Первый экран')[0];
const fontFaces = css.match(/@font-face[^}]+}/g).join('\n').replace(/url\(fonts\//g, 'url(../fonts/');
const orn = css.match(/\.orn[^{]*\{[^}]*\}/g) || [];
const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Превью Эфемериды</title><style>
${fontFaces}
:root{--ink:#0e0b16;--pearl:#f2ecf7;--mist:#a79db9;--rose:#f2b6cb;--ice:#9fc4ff;--ember:#ff7f90;--champagne:#f3dfae;--fire:#ff9d8c;--earth:#d3c08a;--air:#a9c9ff;--water:#8ed3c6;--sym:'Astro',sans-serif}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;position:relative;color:var(--pearl);font:400 24px/1.5 'Onest',sans-serif;
 background:radial-gradient(60% 70% at 4% 0%,rgba(124,34,88,.5),transparent 72%),radial-gradient(55% 70% at 100% 100%,rgba(18,92,108,.4),transparent 72%),var(--ink)}
.orn-wrap{position:absolute;right:-150px;top:-40px;width:760px;height:760px;opacity:.9}
.orn{width:100%;height:100%;display:block}
.oring{fill:none;stroke:rgba(242,182,203,.65);stroke-width:1.1}.odiv,.otick{stroke:rgba(238,230,248,.32);stroke-width:.9}
.ozs{font-family:var(--sym);font-size:24px;text-anchor:middle;dominant-baseline:central}
.oasp{stroke-width:1.3}.oasp.soft{stroke:var(--ice)}.oasp.hard{stroke:var(--ember)}.oasp.conj{stroke:var(--champagne)}
.fire{fill:var(--fire)}.earth{fill:var(--earth)}.air{fill:var(--air)}.water{fill:var(--water)}
.copy{position:absolute;left:72px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;width:640px}
.brand{font:400 34px/1 'Prata',serif;color:var(--rose);margin-bottom:34px}
h1{font:400 84px/1.02 'Prata',serif;letter-spacing:-.01em}
p{margin-top:28px;font-size:27px;color:var(--mist);max-width:540px}
</style></head><body>
<div class="orn-wrap">${ornamentSVG().replace(/ class="draw"| draw/g, '').replace(/class="oring draw"/g, 'class="oring"')}</div>
<div class="copy"><div class="brand">Эфемерида</div><h1>Небо в тот самый день</h1><p>Натальная карта прямо в браузере. Дата и время рождения никуда не отправляются.</p></div>
</body></html>`;
fs.writeFileSync(path.join(__dirname, '../assets/social-preview.html'), html);
console.log('assets/social-preview.html written');
