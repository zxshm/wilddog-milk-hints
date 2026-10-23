'use strict';
(() => {
  const endless = new URLSearchParams(location.search).get('endless') === '1';
  const panel = document.createElement('aside');
  panel.style.cssText = 'position:fixed;left:8px;top:8px;width:175px;padding:10px;background:#fffdf4e8;border:1px solid #b7986b;border-radius:8px;font:12px/1.6 Microsoft YaHei;z-index:100;';
  panel.innerHTML = '<b>完整对局验收</b><p>原版随机出盒；只点提示。<br>加快显示，物理步长不变。</p><button id="qa-start">开始自动验收</button><p id="qa-state">尚未开始</p><pre id="qa-result" style="white-space:pre-wrap"></pre><textarea id="qa-log" aria-label="验收完整记录" readonly hidden></textarea>';
  document.body.append(panel);
  if (endless) panel.querySelector('b').textContent = '持续高分测试（通关后继续）';
  let running = false, moves = 0, started = 0;
  const route = [];
  const requests = new Map(), slowRequests = [];
  let lastHint = null, initial = null, firstWin = null;
  window.HintDiagnostics = record => {
    if (record.phase === 'request') { requests.clear(); requests.set(record.id, record); return; }
    if (record.phase === 'accepted' || record.phase === 'stale' || record.phase === 'error') {
      const request = requests.get(record.id);
      if (request) {
        const roundTripMs = record.at - request.at;
        // 长等待保留准确输入、分阶段耗时和每个线程任务，后续可以原样重算。
        if (roundTripMs >= 5000 || record.phase !== 'accepted') slowRequests.push({ request, reply: record, roundTripMs });
        if (record.phase === 'accepted') lastHint = { ...record.result, roundTripMs };
        requests.delete(record.id);
      }
    }
  };
  const finish = (won, stopReason) => {
    running = false;
    const s = Game.snapshot();
    const result = { won, endless, stopReason, firstWin, moves, score: s.score, maxLevel: s.maxLv + 1, over: s.over, seconds: Math.round((performance.now() - started) / 1000), mode: 'balanced', runner: '真实浏览器按钮与后台计算，固定物理步长加速显示' };
    document.getElementById('qa-state').textContent = endless ? `持续测试结束：${stopReason}，${s.score} 分` : won ? '验收通过：已合成第11级' : '验收失败：未合成第11级';
    document.getElementById('qa-result').textContent = JSON.stringify(result, null, 2);
    const manifest = JSON.parse(document.getElementById('qa-source')?.textContent || '{}');
    const log = document.getElementById('qa-log'); log.hidden = false;
    log.value = JSON.stringify({ result, route, initial, final: s, slowRequests, manifest, userAgent: navigator.userAgent });
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
    const won = s.maxLv === GamePhysics.LAST;
    if (won && !firstWin) firstWin = { move: moves, score: s.score };
    if (won && !endless) { finish(true, 'first-win'); return; }
    if (state.over || moves >= 5000 || performance.now() - started > 60 * 60 * 1000) { finish(won, state.over ? 'overflow' : moves >= 5000 ? 'move-limit' : 'time-limit'); return; }
    document.getElementById('qa-state').textContent = `已按提示 ${moves} 步\n${s.score} 分 / 最高第 ${s.maxLv + 1} 级`;
    const button = document.getElementById('hintPlace');
    if (!button.disabled) {
      if (!initial) initial = s;
      route.push({ move: ++moves, level: state.level, next: state.nextLevel, hint: document.getElementById('hintStatus').textContent,
        detail: document.getElementById('hintDetail').textContent, score: s.score, boxes: s.bodies.length,
        time: s.time, x: lastHint?.x, diagnostics: lastHint });
      button.click();
    }
  }, 50);
})();
