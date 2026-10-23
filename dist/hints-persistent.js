'use strict';
window.Hints = (() => {
  const workerUrl = document.currentScript?.dataset.worker || 'hint-worker-persistent.js';
  let enabled = true, mode = 'balanced', hint = null, source = null, worker = null;
  let generation = 0, pending = false, stableSince = 0, lastRequest = -10000, fallback = false;
  let ready = false, lastStatus = '', lastDetail = '';
  const $h = id => document.getElementById(id);
  const status = (title, detail) => {
    if (!ready) return;
    if (title !== lastStatus) { $h('hintStatus').textContent = title; lastStatus = title; }
    if (detail !== undefined && detail !== lastDetail) { $h('hintDetail').textContent = detail; lastDetail = detail; }
  };
  function invalidate() {
    const wasPending = pending;
    generation++; hint = null; source = null; pending = false; stableSince = 0;
    // 已完成的计算保留热线程；中途取消或关闭提示时才释放。
    if (worker && (wasPending || !enabled)) { worker.terminate(); worker = null; }
    if (ready) {
      $h('hintPlace').disabled = true;
      if (enabled) status('局势已更新，准备计算…', '奶盒落定后自动给出新的放置建议。');
    }
  }
  function compatible(snapshot, state) {
    if (!snapshot || snapshot.bodies.length !== state.bodies.length || state.level !== snapshot.level || state.nextLevel !== snapshot.nextLevel) return false;
    // 奶盒位置、旋转或合成发生变化时，过期结果不能再用于一键投放。
    return snapshot.bodies.every((v, i) => {
      const b = state.bodies[i];
      return b.gameId === v.gameId && b.lv === v.lv && Math.abs(b.k - v.k) < .02
        && Math.hypot(b.position.x - v.x, b.position.y - v.y) < 5 && Math.abs(b.angle - v.angle) < .07;
    });
  }
  function accept(id, result, error) {
    if (id !== generation) return;
    pending = false;
    if (error) { source = null; status('本次计算失败，可点击重算', error); return; }
    const state = Game.state();
    if (!enabled || state.over || !compatible(source, state)) { hint = null; source = null; return; }
    hint = result;
    const risks = { low: '堆叠较低', medium: '注意高度', high: '接近溢出', fatal: '所有已测落点都有失败风险' };
    const pos = Math.round(result.x / GamePhysics.W * 100), nextPos = Math.round(result.nextX / GamePhysics.W * 100);
    status(result.usedNext ? `①本步 ${pos}% → ②下步 ${nextPos}%` : `本步 ${pos}% · 暂无可行后续`,
      `预计${result.usedNext ? '两步' : '本步'} +${result.totalGain} 分 · ${result.totalMerges} 次合成\n${result.pairsExamined} 组组合 · ${(result.elapsed / 1000).toFixed(1)} 秒 · ${risks[result.risk]}${fallback ? ' · 兼容模式' : ''}`);
    $h('hintStatus').title = '②是本步落定后的预估落点；每次实际投放后会按新局面重算。';
  }
  function request(t) {
    const id = ++generation, state = Game.state();
    source = { ...Game.snapshot(), level: state.level, nextLevel: state.nextLevel };
    pending = true; hint = null; lastRequest = t;
    status('正在联算当前盒与下一盒…', '逐一模拟两次投放、运动和连锁合成。');
    const data = { id, snapshot: source, level: state.level, nextLevel: state.nextLevel, mode };
    const localSolve = () => PlacementSolver.solve(data.snapshot, data.level, data.nextLevel,
      { mode, yieldMain: true, cancelled: () => id !== generation })
      .then(result => accept(id, result)).catch(e => accept(id, null, e.message));
    if (fallback || location.protocol === 'file:') { fallback = true; localSolve(); return; }
    try {
      if (!worker) {
        worker = new Worker(workerUrl);
      }
      worker.onmessage = ({ data: reply }) => {
        if (reply.progress) {
          if (reply.id === generation && pending) status(`两步搜索 ${reply.progress.completed}/${reply.progress.total}`, `已模拟 ${reply.progress.pairs} 组组合，仍可手动投放。`);
        } else accept(reply.id, reply.result, reply.error);
      };
      worker.onerror = e => {
        e.preventDefault(); worker?.terminate(); worker = null; fallback = true;
        if (id === generation) localSolve();
      };
      worker.postMessage(data);
    } catch (_) { fallback = true; localSolve(); }
  }
  function tick(t) {
    if (!enabled || !ready) return;
    const state = Game.state();
    if (state.over) { status('本局结束', '再来一局后会自动计算新的放置建议。'); return; }
    if (hint && !compatible(source, state)) { invalidate(); }
    const stable = state.cooldown <= 0 && state.bodies.every(b => b.k >= 1 && b.speed < .45 && Math.abs(b.angularVelocity) < .025);
    if (!stable) {
      stableSince = 0;
      $h('hintPlace').disabled = true;
      if (!pending) status('奶盒正在下落，稍候计算…', '落定后自动更新建议，也可以继续手动投放。');
      return;
    }
    if (!stableSince) stableSince = t;
    $h('hintPlace').disabled = !hint || pending;
    if (!pending && !hint && t - stableSince > 220 && t - lastRequest > 350) request(t);
  }
  function place() {
    const state = Game.state();
    if (!enabled || !hint || pending || state.over || state.cooldown > 0 || !compatible(source, state)) return false;
    if (!state.bodies.every(b => b.k >= 1 && b.speed < .45 && Math.abs(b.angularVelocity) < .025)) return false;
    return Game.place(hint.x);
  }
  function draw(ctx) {
    if (!enabled || !hint || Game.state().over || !compatible(source, Game.state())) return;
    const x = hint.x, { H, DEAD_Y, LEVELS, spawnY } = GamePhysics;
    const lv = Game.state().level;
    ctx.save();
    if (hint.usedNext && Math.abs(hint.nextX - x) > 12) {
      ctx.strokeStyle = '#537ab08c'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 9]);
      ctx.beginPath(); ctx.moveTo(hint.nextX, DEAD_Y + 54); ctx.lineTo(hint.nextX, H - 8); ctx.stroke();
      ctx.fillStyle = '#537ab0'; ctx.font = '700 11px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('②预计', Math.max(23, Math.min(377, hint.nextX)), DEAD_Y + 52);
    }
    const color = hint.risk === 'high' || hint.risk === 'fatal' ? '#d04b2f' : '#168b70';
    ctx.fillStyle = hint.risk === 'high' || hint.risk === 'fatal' ? '#e8553a14' : '#168b7012';
    ctx.fillRect(x - LEVELS[lv].w / 2, DEAD_Y, LEVELS[lv].w, H - DEAD_Y);
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(x, spawnY(lv) + LEVELS[lv].h / 2); ctx.lineTo(x, H - 8); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x - 7, DEAD_Y + 12); ctx.lineTo(x + 7, DEAD_Y + 12); ctx.lineTo(x, DEAD_Y + 23); ctx.closePath(); ctx.fill();
    ctx.font = '700 12px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(hint.usedNext && Math.abs(hint.nextX - x) <= 12 ? '①②同列' : '①本步', Math.max(25, Math.min(375, x)), DEAD_Y + 39);
    ctx.restore();
  }
  function init() {
    ready = true;
    try { enabled = localStorage.getItem('wildDogMilkHints') !== '0'; } catch (_) {}
    const sync = () => {
      $h('hintToggle').textContent = enabled ? '💡 提示开启' : '💡 提示关闭';
      $h('hintToggle').setAttribute('aria-pressed', String(enabled));
      $h('hintControls').hidden = !enabled;
      if (!enabled) status('按原版方式自由放置');
      Game.layout();
    };
    $h('hintToggle').addEventListener('click', () => {
      enabled = !enabled; invalidate();
      try { localStorage.setItem('wildDogMilkHints', enabled ? '1' : '0'); } catch (_) {}
      sync();
    });
    $h('hintPlace').addEventListener('click', place);
    $h('hintRefresh').addEventListener('click', invalidate);
    $h('hintMode').addEventListener('change', e => { mode = e.target.value; invalidate(); });
    sync();
  }
  return { init, tick, draw, invalidate, place, get enabled() { return enabled; } };
})();
