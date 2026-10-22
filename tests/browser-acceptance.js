'use strict';
(() => {
  const panel = document.createElement('aside');
  panel.style.cssText = 'position:fixed;left:8px;top:8px;width:175px;padding:10px;background:#fffdf4e8;border:1px solid #b7986b;border-radius:8px;font:12px/1.6 Microsoft YaHei;z-index:100;';
  panel.innerHTML = '<b>完整对局验收</b><p>原版随机出盒；只点提示。<br>加快显示，物理步长不变。</p><button id="qa-start">开始自动验收</button><p id="qa-state">尚未开始</p><pre id="qa-result" style="white-space:pre-wrap"></pre><textarea id="qa-log" aria-label="验收完整记录" readonly hidden></textarea>';
  document.body.append(panel);
  let running = false, moves = 0, started = 0;
  const route = [];
  const finish = won => {
    running = false;
    const s = Game.snapshot();
    const result = { won, moves, score: s.score, maxLevel: s.maxLv + 1, over: s.over, seconds: Math.round((performance.now() - started) / 1000), mode: 'balanced', runner: '真实浏览器按钮与后台计算，固定物理步长加速显示' };
    document.getElementById('qa-state').textContent = won ? '验收通过：已合成第11级' : '验收失败：未合成第11级';
    document.getElementById('qa-result').textContent = JSON.stringify(result, null, 2);
    const log = document.getElementById('qa-log'); log.hidden = false; log.value = JSON.stringify({ result, route });
    document.getElementById('qa-start').disabled = false;
  };
  document.getElementById('qa-start').onclick = () => {
    if (running) return;
    running = true; started = performance.now();
    document.getElementById('qa-start').disabled = true;
  };
  setInterval(() => {
    if (!running) return;
    const state = Game.state(), s = Game.snapshot();
    if (s.maxLv === GamePhysics.LAST) { finish(true); return; }
    if (state.over || moves >= 1200 || performance.now() - started > 45 * 60 * 1000) { finish(false); return; }
    document.getElementById('qa-state').textContent = `已按提示 ${moves} 步\n${s.score} 分 / 最高第 ${s.maxLv + 1} 级`;
    const button = document.getElementById('hintPlace');
    if (!button.disabled) {
      route.push({ move: ++moves, level: state.level, next: state.nextLevel, hint: document.getElementById('hintStatus').textContent, detail: document.getElementById('hintDetail').textContent, score: s.score });
      button.click();
    }
  }, 50);
})();
