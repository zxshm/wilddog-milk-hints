(function (root) {
  'use strict';
  const P = typeof module === 'object' ? require('./physics.js') : root.GamePhysics;
  const { World, LEVELS, W, H, DEAD_Y, clampX } = P;
  const now = () => performance.now();
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));

  function candidates(snapshot, lv, count = 17) {
    const xs = [], add = x => {
      x = Math.round(clampX(lv, x) * 10) / 10;
      if (!xs.some(v => Math.abs(v - x) < 3)) xs.push(x);
    };
    // 先覆盖整个容器，再补同级奶盒上方和左右邻接位置。
    const half = LEVELS[lv].w / 2 + 1;
    for (let i = 0; i < count; i++) add(half + (W - 2 * half) * i / (count - 1));
    for (const b of snapshot.bodies.filter(b => b.lv === lv).sort((a, b) => a.y - b.y).slice(0, 7)) {
      add(b.x); add(b.x - LEVELS[lv].w * .75); add(b.x + LEVELS[lv].w * .75);
    }
    return xs;
  }

  function evaluate(w, startScore) {
    const bodies = w.cartons();
    let top = H, centerCost = 0, motion = 0, blocked = 0;
    const skyline = Array(20).fill(H);
    for (const b of bodies) {
      const y = b.bounds.min.y;
      top = Math.min(top, y);
      centerCost += (H - b.position.y) * LEVELS[b.lv].s / 100;
      motion += b.speed + Math.abs(b.angularVelocity) * 12;
      if (y < DEAD_Y + 55) blocked += (DEAD_Y + 55 - y);
      for (let i = 0; i < skyline.length; i++) {
        const x = (i + .5) * W / skyline.length;
        if (x >= b.bounds.min.x && x <= b.bounds.max.x) skyline[i] = Math.min(skyline[i], y);
      }
    }
    const heights = skyline.map(y => H - y);
    const avg = heights.reduce((a, b) => a + b, 0) / heights.length;
    const spread = heights.reduce((s, h) => s + Math.abs(h - avg), 0) / heights.length;
    const gain = w.score - startScore;
    // 高堆叠和越线优先受罚；收益、空余高度和较平整的表面用于候选排序。
    const value = gain * 20 - (H - top) * .78 - avg * .28 - spread * .28
      - centerCost * .045 - bodies.length * 3 - motion * 3 - blocked * 12
      - w.dangerT * 1600 - (w.over ? 1e7 : 0);
    return { value, gain, top, risk: w.over ? 'fatal' : (w.dangerT > .1 || top < DEAD_Y + 60 ? 'high' : top < DEAD_Y + 160 ? 'medium' : 'low') };
  }

  function simulate(snapshot, lv, x) {
    const w = World.restore(snapshot);
    w.drop(lv, x);
    let quiet = 0;
    // 至少模拟 2.5 秒；危险局面继续跑满 4.8 秒，覆盖越线持续两秒的结算。
    for (let i = 0; i < 288 && !w.over; i++) {
      w.step();
      const bs = w.cartons();
      const calm = bs.every(b => b.k >= 1 && b.speed < .18 && Math.abs(b.angularVelocity) < .009);
      quiet = calm ? quiet + 1 : 0;
      if (i >= 150 && quiet >= 20 && !w.dangerT) break;
    }
    const metrics = evaluate(w, snapshot.score);
    const result = { x, ...metrics, merges: w.merges - snapshot.merges, snapshot: w.snapshot() };
    w.destroy();
    return result;
  }

  async function solve(snapshot, lv, nextLv, options = {}) {
    const started = now(), mode = options.mode || 'balanced';
    const budget = mode === 'deep' ? 4200 : mode === 'fast' ? 700 : 1800;
    const xs = candidates(snapshot, lv, mode === 'fast' ? 11 : 17);
    const results = []; let simulated = 0;
    const checkpoint = async () => {
      if (options.cancelled?.()) throw new Error('已取消');
      if (options.yieldMain) await pause();
    };
    for (const x of xs) {
      await checkpoint();
      results.push(simulate(snapshot, lv, x)); simulated++;
    }
    results.sort((a, b) => b.value - a.value || Math.abs(a.x - 200) - Math.abs(b.x - 200));
    if (mode !== 'fast' && now() - started < budget) {
      const bestXs = results.slice(0, 2).map(r => r.x);
      for (const x of bestXs.flatMap(x => [clampX(lv, x - 6), clampX(lv, x + 6)])) {
        if (now() - started >= budget) break;
        await checkpoint();
        if (results.some(r => Math.abs(r.x - x) < 2)) continue;
        results.push(simulate(snapshot, lv, x)); simulated++;
      }
      results.sort((a, b) => b.value - a.value || Math.abs(a.x - 200) - Math.abs(b.x - 200));
    }
    let best = results[0], usedNext = false;
    // 仅使用游戏已公开的下一盒。一次完整比较所有入围分支，避免超时偏袒先计算的候选。
    if (mode !== 'fast' && Number.isInteger(nextLv) && now() - started < budget * .7 && !best.snapshot.over) {
      const beam = results.filter(r => !r.snapshot.over).slice(0, 3);
      const nextResults = beam.map(r => ({ first: r, best: -Infinity }));
      const grids = beam.map(r => candidates(r.snapshot, nextLv, 9));
      const rounds = Math.max(...grids.map(g => g.length));
      for (let i = 0; i < rounds; i++) {
        if (i >= 9 && now() - started >= budget) break;
        for (let j = 0; j < beam.length; j++) {
          if (i >= grids[j].length) continue;
          await checkpoint();
          const r = simulate(beam[j].snapshot, nextLv, grids[j][i]); simulated++;
          const finalValue = r.value + (beam[j].snapshot.score - snapshot.score) * 20;
          nextResults[j].best = Math.max(nextResults[j].best, finalValue);
        }
      }
      nextResults.sort((a, b) => (b.first.value * .45 + b.best * .55) - (a.first.value * .45 + a.best * .55));
      best = nextResults[0].first; usedNext = true;
    }
    const { snapshot: ignored, ...answer } = best;
    return { ...answer, examined: results.length, simulations: simulated, elapsed: Math.round(now() - started), usedNext, level: lv };
  }
  const api = { solve, simulate, candidates, evaluate };
  if (typeof module === 'object') module.exports = api;
  else root.PlacementSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
