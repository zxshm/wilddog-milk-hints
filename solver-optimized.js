(function (root) {
  'use strict';
  const P = typeof module === 'object' ? require('./physics.js') : root.GamePhysics;
  const { World, LEVELS, W, H, DEAD_Y, clampX } = P;
  const now = () => performance.now();
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));
  const GAIN_WEIGHT = 32, MERGE_WEIGHT = 8;
  const MODES = {
    fast: { first: 9, second: 7, extra: 5, refine: 0, budget: 1100 },
    balanced: { first: 17, second: 11, extra: 9, refine: 2, budget: 3500 },
    deep: { first: 25, second: 17, extra: 15, refine: 4, budget: 8500 },
  };

  function candidates(snapshot, lv, count = 17, extra = 9) {
    const xs = [], add = x => {
      x = clampX(lv, Math.round(clampX(lv, x) * 10) / 10);
      if (!xs.some(v => Math.abs(v - x) < 3)) xs.push(x);
    };
    // 横向全覆盖，再补同级接触点和倾斜支撑边缘，让偏心碰撞也进入搜索。
    const half = LEVELS[lv].w / 2 + 1;
    for (let i = 0; i < count; i++) add(half + (W - 2 * half) * i / (count - 1));
    const surface = [...snapshot.bodies].sort((a, b) => a.y - b.y);
    const matching = surface.filter(b => b.lv === lv).slice(0, 7);
    const extraXs = matching.map(b => b.x);
    for (const b of matching) extraXs.push(b.x - LEVELS[lv].w * .7, b.x + LEVELS[lv].w * .7);
    for (const b of surface.filter(b => Math.abs(Math.sin(b.angle * 2)) > .2).slice(0, 4)) {
      if (b.vertices) extraXs.push(Math.min(...b.vertices.map(v => v.x)) - half * .35, Math.max(...b.vertices.map(v => v.x)) + half * .35);
    }
    for (const x of extraXs) {
      if (xs.length >= count + extra) break;
      add(x);
    }
    return xs;
  }

  function evaluate(w, startScore, startMerges = 0) {
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
    // 两步总合成优先，平整度只作为很弱的次要项；不奖励横放角度本身。
    const value = gain * GAIN_WEIGHT + (w.merges - startMerges) * MERGE_WEIGHT
      - (H - top) * .45 - avg * .16 - spread * .06
      - centerCost * .025 - bodies.length * 8 - motion * 3 - blocked * 16
      - w.dangerT * 1600 - (w.over ? 1e7 : 0);
    return { value, gain, top, risk: w.over ? 'fatal' : (w.dangerT > .1 || top < DEAD_Y + 60 ? 'high' : top < DEAD_Y + 160 ? 'medium' : 'low') };
  }

  function simulate(snapshot, lv, x, capture = true) {
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
    const metrics = evaluate(w, snapshot.score, snapshot.merges);
    const result = { x, ...metrics, merges: w.merges - snapshot.merges, over: w.over,
      snapshot: capture ? w.snapshot() : null };
    w.destroy();
    return result;
  }

  const better = (a, b) => {
    if (!b) return true;
    if (a.fatal !== b.fatal) return !a.fatal;
    if (Math.abs(a.jointValue - b.jointValue) > 1e-7) return a.jointValue > b.jointValue;
    return Math.abs(a.x - 200) < Math.abs(b.x - 200);
  };
  async function extendBranch(first, nextLv, positions, checkpoint) {
    let count = 0;
    for (const x of positions) {
      const key = x.toFixed(2);
      if (first.tested.has(key)) continue;
      first.tested.add(key);
      await checkpoint();
      // 第二步只需要末态指标，不再为每个叶子复制整套接触缓存。
      const second = simulate(first.snapshot, nextLv, x, false); count++;
      const route = { x: first.x, second, fatal: second.over,
        jointValue: second.value + first.gain * GAIN_WEIGHT + first.merges * MERGE_WEIGHT };
      if (better(route, first.route)) first.route = route;
    }
    return count;
  }
  async function solveBranch(snapshot, lv, nextLv, x, options = {}) {
    const config = MODES[options.mode] || MODES.balanced;
    const checkpoint = options.checkpoint || (() => {});
    await checkpoint();
    const first = simulate(snapshot, lv, x);
    first.tested = new Set();
    const hasNext = Number.isInteger(nextLv) && nextLv >= 0 && nextLv < LEVELS.length;
    if (hasNext && !first.over) await extendBranch(first, nextLv,
      candidates(first.snapshot, nextLv, config.second, config.extra), checkpoint);
    if (!first.route) first.route = { x, second: null, fatal: first.over, jointValue: first.value };
    return first;
  }

  async function solve(snapshot, lv, nextLv, options = {}) {
    const started = now(), mode = options.mode || 'balanced';
    const config = MODES[mode] || MODES.balanced;
    // 搜索数量只取决于精度档，避免手机或后台负载改变同一局面的推荐。
    const refinement = options.budgetMs === 0 ? 0 : config.refine;
    const xs = candidates(snapshot, lv, config.first, config.extra);
    const results = []; let simulated = 0, pairsExamined = 0;
    const hasNext = Number.isInteger(nextLv) && nextLv >= 0 && nextLv < LEVELS.length;
    const checkpoint = async () => {
      if (options.cancelled?.()) throw new Error('已取消');
      if (options.yieldMain) await pause();
    };
    const extend = async (first, positions) => {
      const count = await extendBranch(first, nextLv, positions, checkpoint);
      simulated += count; pairsExamined += count;
    };
    const searchMany = async positions => {
      let completed = 0;
      const account = first => {
        simulated += 1 + first.tested.size; pairsExamined += first.tested.size;
        options.onProgress?.({ completed: ++completed, total: positions.length, pairs: pairsExamined });
      };
      if (options.mapBranches) {
        const branches = await options.mapBranches(positions, { snapshot, level: lv, nextLevel: nextLv, mode }, account);
        // 并行任务按输入顺序汇总，完成时间不能改变平分时的稳定排序。
        results.push(...branches);
      } else for (const x of positions) {
        const first = await solveBranch(snapshot, lv, nextLv, x, { mode, checkpoint });
        account(first); results.push(first);
      }
    };
    // 完整搜索所有初选落点的下一盒，然后才排名和细化。
    await searchMany(xs);
    const rank = () => results.sort((a, b) => better(a.route, b.route) ? -1 : better(b.route, a.route) ? 1 : 0);
    rank();
    if (hasNext && refinement) {
      const finalists = results.filter(r => r.route.second && !r.route.fatal).slice(0, refinement);
      for (const first of finalists) {
        const x = first.route.second.x;
        await extend(first, [-12, -6, 6, 12].map(d => clampX(nextLv, x + d)));
      }
      rank();
      const centers = results.slice(0, refinement).map(r => r.x);
      const refinements = [];
      for (const x of centers.flatMap(x => [-6, 6].map(d => clampX(lv, x + d)))) {
        if (!results.some(r => Math.abs(r.x - x) < 2) && !refinements.some(v => Math.abs(v - x) < 2)) refinements.push(x);
      }
      await searchMany(refinements);
      rank();
    }
    const best = results[0], second = best.route.second;
    const answer = { x: best.x, gain: best.gain, merges: best.merges, risk: second?.risk ?? best.risk,
      top: second?.top ?? best.top, value: best.route.jointValue, nextX: second?.x ?? null, nextLevel: nextLv,
      totalGain: best.gain + (second?.gain || 0), totalMerges: best.merges + (second?.merges || 0),
      nextGain: second?.gain || 0, examined: results.length, pairsExamined, simulations: simulated,
      elapsed: Math.round(now() - started), usedNext: !!second, level: lv, version: 'joint-2-parallel' };
    if (options.diagnostics) answer.branches = results.map(r => ({ x: r.x, firstGain: r.gain, nextX: r.route.second?.x,
      totalGain: r.gain + (r.route.second?.gain || 0), jointValue: r.route.jointValue, nextPositions: r.tested.size }));
    return answer;
  }
  const api = { solve, solveBranch, simulate, candidates, evaluate, MODES };
  if (typeof module === 'object') module.exports = api;
  else root.PlacementSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
