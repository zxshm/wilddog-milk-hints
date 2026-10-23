'use strict';
// 用真实网址生成二维码矩阵，再以 SVG 排版原游戏奶盒和装饰，码区始终保留四格净空。
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '分享素材');
const url = 'https://zxshm.github.io/wilddog-milk-hints/';
const python = process.env.QR_PYTHON || 'python';
const source = 'import qrcode,json,sys; q=qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H,border=4); q.add_data(sys.argv[1]); q.make(fit=True); print(json.dumps(q.get_matrix()))';
const matrix = JSON.parse(execFileSync(python, ['-c', source, url], { encoding: 'utf8' }));
const n = matrix.length, moduleSize = Math.floor(680 / n), qrSize = n * moduleSize;
const left = (1200 - qrSize) / 2, top = 486 + (680 - qrSize) / 2;
const dark = '#432b20', accent = '#b9431c';
const bodySize = n - 8;
const finders = [[4, 4], [bodySize - 3, 4], [4, bodySize - 3]];
const inFinder = (x, y) => finders.some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
let qr = `<rect x="${left}" y="${top}" width="${qrSize}" height="${qrSize}" fill="#fff"/>`;
for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
  if (matrix[y][x] && !inFinder(x, y)) qr += `<rect x="${left + x * moduleSize}" y="${top + y * moduleSize}" width="${moduleSize}" height="${moduleSize}" rx="1.8" fill="${dark}"/>`;
}
for (const [x, y] of finders) {
  const a = left + x * moduleSize, b = top + y * moduleSize;
  qr += `<rect x="${a}" y="${b}" width="${7 * moduleSize}" height="${7 * moduleSize}" rx="${moduleSize}" fill="${accent}"/>
  <rect x="${a + moduleSize}" y="${b + moduleSize}" width="${5 * moduleSize}" height="${5 * moduleSize}" rx="${moduleSize * .55}" fill="#fff"/>
  <rect x="${a + 2 * moduleSize}" y="${b + 2 * moduleSize}" width="${3 * moduleSize}" height="${3 * moduleSize}" rx="${moduleSize * .4}" fill="${dark}"/>`;
}
function milk(level, x, y, w, h, angle) {
  const data = fs.readFileSync(path.join(root, 'dist/img', `${level}.png`)).toString('base64');
  return `<g transform="rotate(${angle} ${x + w / 2} ${y + h / 2})"><rect x="${x + 5}" y="${y + 10}" width="${w}" height="${h}" rx="9" fill="#7b45271c"/><image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${data}"/></g>`;
}
function sparkle(x, y, s, color) {
  return `<path transform="translate(${x} ${y}) scale(${s})" d="M0,-16 Q3,-3 16,0 Q3,3 0,16 Q-3,3 -16,0 Q-3,-3 0,-16" fill="${color}"/>`;
}
function paw(x, y, s, angle) {
  return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${s})" fill="#bf7138" opacity=".16"><ellipse cx="0" cy="8" rx="18" ry="14"/><ellipse cx="-19" cy="-10" rx="7" ry="9" transform="rotate(-25 -19 -10)"/><ellipse cx="-7" cy="-20" rx="7" ry="10"/><ellipse cx="9" cy="-19" rx="7" ry="10"/><ellipse cx="21" cy="-6" rx="7" ry="9" transform="rotate(25 21 -6)"/></g>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1520" viewBox="0 0 1200 1520">
<defs>
  <linearGradient id="cream" x2="0" y2="1"><stop stop-color="#fff9ed"/><stop offset="1" stop-color="#ffdba3"/></linearGradient>
  <linearGradient id="orange" x2="0" y2="1"><stop stop-color="#f36f3c"/><stop offset="1" stop-color="#d64c24"/></linearGradient>
</defs>
<rect width="1200" height="1520" fill="url(#cream)"/>
<rect x="28" y="28" width="1144" height="1464" rx="58" fill="none" stroke="#e8bc7b" stroke-width="2"/>
<path d="M0 1420 Q200 1260 440 1410 T900 1380 T1200 1370 V1520 H0Z" fill="#fff6e3" opacity=".7"/>
<circle cx="1140" cy="400" r="230" fill="#ffcf7c" opacity=".16"/>
<circle cx="20" cy="880" r="240" fill="#fff" opacity=".28"/>
${paw(110, 110, 1.4, -25)}${paw(1068, 125, 1.6, 24)}${paw(1050, 1300, 1.1, 35)}${paw(130, 1380, 1.05, -20)}
${sparkle(202, 283, 1.05, '#e9ad4e')}${sparkle(1010, 284, .9, '#e9ad4e')}${sparkle(87, 762, 1.4, '#e7a355')}${sparkle(1101, 847, 1.1, '#e7a355')}
<g font-family="Microsoft YaHei, sans-serif" text-anchor="middle">
  <rect x="434" y="71" width="332" height="48" rx="24" fill="#fffdf6" stroke="#edc798" stroke-width="2"/>
  <text x="600" y="103" font-size="22" fill="#9b592e" letter-spacing="4">奶盒合成 · 实时提示版</text>
  <text x="600" y="232" font-size="94" font-weight="900" fill="#a4411c" letter-spacing="3">合成野生狗奶</text>
  <text x="600" y="286" font-size="28" fill="#805738" letter-spacing="3">一盒接一盒，看看你能合到哪一级</text>
  <g transform="translate(465 326)">
    <rect width="270" height="48" rx="24" fill="#f7d699"/>
    <text x="135" y="32" font-size="22" font-weight="700" fill="#8b521f">同级相碰 · 一起升级</text>
  </g>
</g>
<rect x="213" y="414" width="774" height="834" rx="40" fill="#bd864a" opacity=".15"/>
<rect x="213" y="402" width="774" height="834" rx="40" fill="#fff" stroke="#e7b777" stroke-width="4"/>
<text x="600" y="461" font-family="Microsoft YaHei, sans-serif" text-anchor="middle" font-size="26" font-weight="700" fill="#9c582a" letter-spacing="6">扫描二维码 · 直接开玩</text>
${qr}
<path d="M277 1193 H442 M758 1193 H923" stroke="#ebd5b9" stroke-width="2"/>
<text x="600" y="1201" font-family="Microsoft YaHei, sans-serif" text-anchor="middle" font-size="22" fill="#997354">无需下载 · 打开即玩</text>
${milk(2, 70, 377, 111, 207, -13)}
${milk(9, 1017, 418, 112, 244, 12)}
${milk(4, 85, 984, 110, 223, 12)}
${milk(11, 1003, 1030, 143, 194, -11)}
<g fill="none" stroke="#d29851" stroke-width="3" stroke-linecap="round" opacity=".65">
  <path d="M125 620 Q108 667 138 700" stroke-dasharray="7 12"/>
  <path d="M111 691 L138 704 L141 677"/>
  <path d="M1092 937 Q1070 970 1094 994" stroke-dasharray="7 12"/>
</g>
<g font-family="Microsoft YaHei, sans-serif" text-anchor="middle">
  <rect x="282" y="1283" width="636" height="88" rx="44" fill="#b95726" opacity=".18"/>
  <rect x="282" y="1275" width="636" height="88" rx="44" fill="url(#orange)"/>
  <text x="600" y="1333" font-size="34" font-weight="700" fill="#fffdf6" letter-spacing="3">长按识别 · 扫码开玩</text>
  <text x="600" y="1420" font-size="24" fill="#8a5e39" letter-spacing="2">每步有提示 · 大家共用玩家排行榜</text>
  <text x="600" y="1460" font-size="18" fill="#a47d54" letter-spacing="1">zxshm.github.io/wilddog-milk-hints/</text>
</g>
</svg>`;
fs.mkdirSync(output, { recursive: true });
const base = path.join(output, '合成野生狗奶-装饰二维码');
fs.writeFileSync(base + '.svg', svg);
(async () => {
  await sharp(Buffer.from(svg), { density: 144 }).png().toFile(base + '.png');
  console.log(JSON.stringify({ url, modules: n - 8, quietZone: 4, errorCorrection: 'H', size: [2400, 3040], files: [base + '.png', base + '.svg'] }));
})().catch(error => { console.error(error); process.exitCode = 1; });
