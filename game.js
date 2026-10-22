'use strict';

// 原版游戏与预测器使用同一组尺寸和物理参数。
const { LEVELS, LAST, SPAWN_WEIGHTS, MERGE_SCORE, FINAL_BONUS, W, H, DEAD_Y, STEP, spawnY } = GamePhysics;
const PI2 = Math.PI * 2;
const TEXT_FONT = '"PingFang SC","Microsoft YaHei",sans-serif';
const { Body } = Matter;
const $ = (id) => document.getElementById(id);
const cvs = $('game'), ctx = cvs.getContext('2d');
const nextCvs = $('next'), nctx = nextCvs.getContext('2d');
const chainCvs = $('chain'), cctx = chainCvs.getContext('2d');
const board = $('board'), top_ = $('top');

let sim;
let viewScale = 1, dpr = 1;
let particles = [], popups = [], mergeQueue = [];
let score = 0, best = +localStorage.getItem('wildDogMilkHintBest') || 0;
let curLv = 0, nextLv = 0, aimX = W / 2, dropCd = 0;
let dangerT = 0, maxLv = 0, shake = 0, over = false, acc = 0, lastT = 0, time = 0;
let soundOn = localStorage.getItem('wildDogMilkHintSound') !== '0';

// ===== 贴图 =====
LEVELS.forEach((L) => {
  const img = new Image();
  img.onload = () => { L.img = img; drawNext(); drawChain(); };
  img.src = `img/${LEVELS.indexOf(L) + 1}.png`;
});

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// 在 (x,y) 以角度 angle 画一盒第 i 级奶，k 为缩放
function drawCarton(g, i, x, y, k = 1, angle = 0, alpha = 1) {
  const L = LEVELS[i], w = L.w * k, h = L.h * k, r = L.round * k;
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y); g.rotate(angle);
  // 阴影
  g.fillStyle = 'rgba(80,45,10,.22)';
  roundRect(g, -w / 2 + 1.5 * k, -h / 2 + 2.5 * k, w, h, r); g.fill();
  if (L.img) {
    g.save();
    roundRect(g, -w / 2, -h / 2, w, h, r); g.clip();
    g.drawImage(L.img, -w / 2, -h / 2, w, h);
    g.restore();
  } else {
    // 图片缺失时的兜底：纯色盒子 + 名字
    g.fillStyle = L.color;
    roundRect(g, -w / 2, -h / 2, w, h, r); g.fill();
    g.fillStyle = '#fff';
    g.font = `900 ${Math.min(w * .22, h / L.name.length)}px ${TEXT_FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    [...L.name].forEach((ch, n, arr) => g.fillText(ch, 0, (n - (arr.length - 1) / 2) * h / (arr.length + 1)));
  }
  roundRect(g, -w / 2, -h / 2, w, h, r);
  g.lineWidth = Math.max(1, w * .025);
  g.strokeStyle = 'rgba(60,35,10,.45)'; g.stroke();
  if (i === LAST) {
    g.lineWidth = w * .03; g.strokeStyle = '#ffd34d';
    roundRect(g, -w / 2 - g.lineWidth / 2, -h / 2 - g.lineWidth / 2, w + g.lineWidth, h + g.lineWidth, r); g.stroke();
  }
  g.restore();
}

// ===== 音效 =====
let actx = null;
function tone(freq, dur = .12, type = 'sine', vol = .2, delay = 0) {
  if (!soundOn) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime + delay;
    const o = actx.createOscillator(), gn = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * .55, t + dur);
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(gn).connect(actx.destination);
    o.start(t); o.stop(t + dur + .02);
  } catch (_) { /* 音频不可用时静默 */ }
}

// ===== 游戏逻辑 =====
function randLv() {
  const cap = Math.min(SPAWN_WEIGHTS.length, Math.max(3, maxLv));
  let total = 0;
  for (let i = 0; i < cap; i++) total += SPAWN_WEIGHTS[i];
  let r = Math.random() * total;
  for (let i = 0; i < cap; i++) { r -= SPAWN_WEIGHTS[i]; if (r < 0) return i; }
  return 0;
}

function cartons() { return sim.cartons(); }

function reset() {
  if (sim) sim.destroy();
  sim = new GamePhysics.World(mergeEffects);
  if (window.Hints) Hints.invalidate();
  particles = []; popups = []; mergeQueue = [];
  time = 0; score = 0; maxLv = 0; dangerT = 0; dropCd = 0; shake = 0; over = false;
  curLv = randLv(); nextLv = randLv();
  aimX = W / 2;
  $('over').hidden = true;
  updateHud(); drawNext(); drawChain();
}

function clampAim(lv) {
  const half = LEVELS[lv].w / 2 + 1;
  return Math.min(W - half, Math.max(half, aimX));
}

function drop() {
  if (over || dropCd > 0) return;
  sim.drop(curLv, clampAim(curLv));
  if (window.Hints) Hints.invalidate();
  tone(320, .08, 'triangle', .12);
  curLv = nextLv; nextLv = randLv();
  dropCd = .5;
  drawNext();
}

function addScore(n, x, y) {
  score += n;
  popups.push({ x, y, text: '+' + n, life: 1 });
  if (score > best) { best = score; localStorage.setItem('wildDogMilkHintBest', best); }
  updateHud();
}

function burst(x, y, color, n, speed) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * PI2, v = speed * (.4 + Math.random() * .6);
    particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * .3,
      r: 2 + Math.random() * 3.5, life: 1, decay: 1.2 + Math.random(),
      color: Math.random() < .6 ? '#fffdf5' : color,
    });
  }
}

// 合成动画与音效沿用原版；分数、消除和生长由共享内核执行。
function mergeEffects({ x, y, lv, gain, special }) {
  if (special) {
    burst(x, y, '#ffd34d', 70, 520);
    shake = 14;
    addScore(gain, x, y);
    popups.push({ x: W / 2, y: H * .38, text: '🐕 狗奶大爆炸', life: 1.6, big: true });
    tone(200, .5, 'sawtooth', .18); tone(500, .4, 'sine', .2, .1);
    return;
  }
  const L = LEVELS[lv];
  burst(x, y, L.color, 8 + lv * 2, 160 + lv * 25);
  addScore(gain, x, y - L.h / 2);
  if (lv > maxLv) {
    maxLv = lv; drawChain();
    if (lv >= 5) popups.push({ x: W / 2, y: H * .38, text: L.name, life: 1.6, big: true });
  }
  if (lv === LAST) { shake = 10; tone(520, .5, 'triangle', .2); tone(780, .5, 'triangle', .15, .15); }
  else { shake = Math.max(shake, lv * .5); tone(780 - lv * 50, .14, 'sine', .22); }
}

function update(dt) {
  time += dt;
  if (dropCd > 0) dropCd -= dt;

  if (!over) {
    sim.step();
    time = sim.time;
    dangerT = sim.dangerT;
    if (sim.over) gameOver();
  }

  for (const p of particles) {
    p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= p.decay * dt;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const p of popups) { p.y -= 40 * dt; p.life -= dt; }
  popups = popups.filter((p) => p.life > 0);
  shake = Math.max(0, shake - 40 * dt);


}

function gameOver() {
  over = true;
  if (window.Hints) Hints.invalidate();
  tone(300, .6, 'sawtooth', .15); tone(180, .7, 'sawtooth', .12, .2);
  $('finalScore').textContent = score;
  $('finalBest').textContent = best;
  $('finalLevel').textContent = `Lv.${maxLv + 1} ${LEVELS[maxLv].name}`;
  const endedWorld = sim;
  setTimeout(() => { if (over && sim === endedWorld) { $('over').hidden = false; $('restartBtn').focus(); } }, 500);
}

// ===== 绘制 =====
function render() {
  ctx.setTransform(viewScale * dpr, 0, 0, viewScale * dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  // 背景：超市冷柜货架
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#fffaf0'); bg.addColorStop(1, '#ffe9c7');
  ctx.fillStyle = bg; ctx.fillRect(-20, -20, W + 40, H + 40);
  ctx.fillStyle = '#f3d3a3';
  for (let y = DEAD_Y + 130; y < H; y += 130) ctx.fillRect(0, y, W, 3);
  ctx.fillStyle = '#d69a55'; ctx.fillRect(0, H - 6, W, 6);

  // 警戒线
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = dangerT > 0 ? `rgba(230,40,30,${.5 + .5 * Math.sin(time * 18)})` : 'rgba(200,120,60,.35)';
  ctx.beginPath(); ctx.moveTo(0, DEAD_Y); ctx.lineTo(W, DEAD_Y); ctx.stroke();
  ctx.restore();

  if (window.Hints) Hints.draw(ctx);

  // 瞄准线 + 手上的奶盒
  if (!over) {
    const x = clampAim(curLv), y = spawnY(curLv);
    ctx.save();
    ctx.setLineDash([4, 8]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(150,100,50,.25)';
    ctx.beginPath(); ctx.moveTo(x, y + LEVELS[curLv].h / 2); ctx.lineTo(x, H); ctx.stroke();
    ctx.restore();
    drawCarton(ctx, curLv, x, y, 1, 0, dropCd > 0 ? .45 : 1);
  }

  for (const b of cartons()) drawCarton(ctx, b.lv, b.position.x, b.position.y, b.k, b.angle);

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, PI2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of popups) {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.font = `900 ${p.big ? 26 : 18}px ${TEXT_FONT}`;
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.big ? '#c2410c' : '#e8553a'; ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;

  if (!cartons().length && !over) {
    ctx.font = `700 16px ${TEXT_FONT}`;
    ctx.fillStyle = 'rgba(90,61,30,.55)';
    ctx.fillText('移动瞄准，点击 / 松手投放', W / 2, H * .5);
    ctx.fillText('两盒一样的撞在一起，合成更大的奶', W / 2, H * .5 + 26);
  }
}

function drawNext() {
  const cw = 44 * dpr, ch = 60 * dpr;
  nextCvs.width = cw; nextCvs.height = ch;
  nctx.setTransform(1, 0, 0, 1, 0, 0);
  nctx.clearRect(0, 0, cw, ch);
  // 按真实比例缩放（可投放的最大一级占满框）
  const big = LEVELS[SPAWN_WEIGHTS.length - 1];
  const k = Math.min((cw - 4) / big.w, (ch - 6) / big.h);
  drawCarton(nctx, nextLv, cw / 2, ch / 2, k);
}

// 合成表：十一盒按真实比例并排，底边对齐
const GAP = 3;
const SUM_W = LEVELS.reduce((t, L) => t + L.w, 0);
function chainScale(cssW) { return (cssW - GAP * (LEVELS.length - 1) - 6) / SUM_W; }
function drawChain() {
  const cssW = board.clientWidth;
  const k = chainScale(cssW);
  const cssH = Math.ceil(LEVELS[LAST].h * k) + 8;
  chainCvs.style.width = cssW + 'px';
  chainCvs.style.height = cssH + 'px';
  chainCvs.width = cssW * dpr; chainCvs.height = cssH * dpr;
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  let x = 3;
  LEVELS.forEach((L, i) => {
    drawCarton(cctx, i, x + L.w * k / 2, cssH - 4 - L.h * k / 2, k, 0, i <= maxLv ? 1 : .35);
    x += L.w * k + GAP;
  });
}

function updateHud() {
  $('score').textContent = score;
  $('best').textContent = best;
}

// ===== 尺寸自适应 =====
function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  const headH = top_.offsetHeight + 8;
  // 棋盘高 = 宽·H/W，合成表高 ≈ 宽·chainRatio，一起塞进剩余高度
  const chainRatio = LEVELS[LAST].h * chainScale(1000) / 1000;
  const dockH = innerWidth >= 1040 ? 0 : (window.Hints && Hints.enabled ? 98 : 30);
  const availH = innerHeight - headH - 40 - dockH;
  const cssW = Math.floor(Math.max(240, Math.min(innerWidth - 16, availH / (H / W + chainRatio), 480)));
  const cssH = Math.round(cssW * H / W);
  board.style.width = cssW + 'px'; board.style.height = cssH + 'px';
  top_.style.width = cssW + 'px';
  const dock = $('hintDock');
  if (dock) {
    dock.style.width = (innerWidth >= 1040 ? 240 : cssW) + 'px';
    dock.style.left = innerWidth >= 1040 ? `calc(50% + ${cssW / 2 + 18}px)` : '';
  }
  cvs.width = cssW * dpr; cvs.height = cssH * dpr;
  viewScale = cssW / W;
  drawNext(); drawChain();
}

// ===== 输入 =====
function toLogicalX(e) {
  const rect = cvs.getBoundingClientRect();
  return (e.clientX - rect.left) / rect.width * W;
}
cvs.addEventListener('pointerdown', (e) => {
  cvs.setPointerCapture(e.pointerId);
  aimX = toLogicalX(e);
});
cvs.addEventListener('pointermove', (e) => { aimX = toLogicalX(e); });
cvs.addEventListener('pointerup', (e) => { aimX = toLogicalX(e); drop(); });

window.addEventListener('keydown', (e) => {
  if (['SELECT', 'INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.target.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
  if (e.key === 'ArrowLeft') aimX = Math.max(0, clampAim(curLv) - 12);
  else if (e.key === 'ArrowRight') aimX = Math.min(W, clampAim(curLv) + 12);
  else if (e.key === ' ') { e.preventDefault(); drop(); }
  else if (e.key === 'r' || e.key === 'R') reset();
  else if (e.key === 'h' || e.key === 'H') Hints.place();
});

$('resetBtn').addEventListener('click', reset);
$('restartBtn').addEventListener('click', reset);
const soundBtn = $('soundBtn');
function syncSound() {
  soundBtn.textContent = soundOn ? '🔊' : '🔇';
  soundBtn.setAttribute('aria-pressed', String(soundOn));
}
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  localStorage.setItem('wildDogMilkHintSound', soundOn ? '1' : '0');
  syncSound();
});
window.addEventListener('resize', layout);

// ===== 主循环（固定步长，高刷屏也一样快） =====
function loop(t) {
  const dt = Math.min(100, t - (lastT || t));
  lastT = t;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n++ < 6) { update(STEP / 1000); acc -= STEP; }
  if (n >= 6) acc = 0;
  if (window.Hints) Hints.tick(t);
  render();
  requestAnimationFrame(loop);
}

// 向提示层提供只读快照和经过原版冷却校验的投放入口。
window.Game = {
  snapshot: () => sim.snapshot(),
  state: () => ({ level: curLv, nextLevel: nextLv, over, cooldown: dropCd, bodies: cartons() }),
  place: x => { if (over || dropCd > 0) return false; aimX = x; drop(); return true; },
  layout,
};
syncSound();
layout();
reset();
Hints.init();
requestAnimationFrame(loop);
