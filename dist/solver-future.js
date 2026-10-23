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

  function futureMergeCost(bodies) {
    const distanceToSegment = (p, a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    };
    const gap = (a, b) => {
      let d = Infinity;
      for (let i = 0; i < a.vertices.length; i++) for (let j = 0; j < b.vertices.length; j++) {
        d = Math.min(d, distanceToSegment(a.vertices[i], b.vertices[j], b.vertices[(j + 1) % b.vertices.length]),
          distanceToSegment(b.vertices[j], a.vertices[i], a.vertices[(i + 1) % a.vertices.length]));
      }
      return d;
    };
    let cost = 0;
    // 高等级同级盒子相隔很远时，即时得分会掩盖后续无法相遇的问题。
    for (let lv = 4; lv < LEVELS.length; lv++) {
      const remaining = bodies.filter(b => b.lv === lv);
      while (remaining.length > 1) {
        let best = Infinity, ai = 0, bi = 1;
        for (let i = 0; i < remaining.length; i++) for (let j = i + 1; j < remaining.length; j++) {
          const d = gap(remaining[i], remaining[j]);
          if (d < best) { best = d; ai = i; bi = j; }
        }
        cost += Math.min(best, 220) * Math.pow(2, lv / 2) * .8;
        remaining.splice(bi, 1); remaining.splice(ai, 1);
      }
    }
    return cost;
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
      - w.dangerT * 1600 - (w.over ? 1e7 : 0) - futureMergeCost(bodies)
      // 验收目标是造出终极奶；最高级的推进有独立价值，通关路线优先于普通得分。
      + w.maxLv * w.maxLv * 100 + (w.maxLv === P.LAST ? 1e8 : 0);
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
    const result = { x, ...metrics, merges: w.merges - snapshot.merges, over: w.over, won: w.maxLv === P.LAST,
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

  async function solveFutureBranch(context, first, checkpoint = () => {}) {
    const second = first.route.second;
    if (!second || first.route.fatal || first.won || second.won) return { x: first.x, value: first.route.jointValue, simulations: 0 };
    const after = simulate(first.snapshot, context.nextLevel, second.x).snapshot;
    const cap = Math.min(P.SPAWN_WEIGHTS.length, Math.max(3, context.snapshot.maxLv));
    const weights = P.SPAWN_WEIGHTS.slice(0, cap), total = weights.reduce((a, b) => a + b, 0);
    let value = 0, simulations = 1;
    // 第三盒尚未生成，只使用原版概率分布；不读取或固定未来随机结果。
    for (let lv = 0; lv < cap; lv++) {
      let best;
      for (const x of candidates(after, lv, context.mode === 'deep' ? 9 : 5, 4)) {
        await checkpoint();
        const trial = simulate(after, lv, x, false); simulations++;
        const route = { x, fatal: trial.over, jointValue: trial.value
          + (first.gain + second.gain) * GAIN_WEIGHT + (first.merges + second.merges) * MERGE_WEIGHT };
        if (better(route, best)) best = route;
      }
      value += best.jointValue * weights[lv] / total;
    }
    return { x: first.x, value: first.route.jointValue * .35 + value * .65, simulations };
  }

  async function refineBranch(context, first, checkpoint = () => {}) {
    const x = first.route.second.x;
    const simulations = await extendBranch(first, context.nextLevel,
      [-12, -6, 6, 12].map(d => clampX(context.nextLevel, x + d)), checkpoint);
    return { first, simulations };
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
      if (options.mapBranches) {
        // 各优胜分支的第二步细化互不依赖，交给已经启动的线程一起计算。
        const refined = await options.mapBranches(finalists, { nextLevel: nextLv, mode, stage: 'refine' }, r => {
          simulated += r.simulations; pairsExamined += r.simulations;
        });
        refined.forEach((r, i) => Object.assign(finalists[i], r.first));
      } else for (const first of finalists) {
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
    let best = results[0], futureSimulations = 0;
    if (hasNext && !best.won && !best.route.second?.won) {
      const finalists = results.filter(r => !r.route.fatal && r.route.second).slice(0, mode === 'fast' ? 2 : mode === 'deep' ? 6 : 4);
      const context = { snapshot, level: lv, nextLevel: nextLv, mode, stage: 'future' };
      const account = r => { futureSimulations += r.simulations; };
      let forecasts;
      if (options.mapBranches) forecasts = await options.mapBranches(finalists, context, account);
      else {
        forecasts = [];
        for (const first of finalists) { const r = await solveFutureBranch(context, first, checkpoint); account(r); forecasts.push(r); }
      }
      for (const first of finalists) first.futureValue = forecasts.find(r => r.x === first.x).value;
      finalists.sort((a, b) => b.futureValue - a.futureValue || (better(a.route, b.route) ? -1 : 1));
      if (finalists.length) best = finalists[0];
      simulated += futureSimulations;
    }
    const second = best.route.second;
    const answer = { x: best.x, gain: best.gain, merges: best.merges, risk: second?.risk ?? best.risk,
      top: second?.top ?? best.top, value: best.route.jointValue, nextX: second?.x ?? null, nextLevel: nextLv,
      totalGain: best.gain + (second?.gain || 0), totalMerges: best.merges + (second?.merges || 0),
      nextGain: second?.gain || 0, examined: results.length, pairsExamined, simulations: simulated,
      elapsed: Math.round(now() - started), usedNext: !!second, level: lv, version: 'joint-5-future', futureSimulations };
    if (options.diagnostics) answer.branches = results.map(r => ({ x: r.x, firstGain: r.gain, nextX: r.route.second?.x,
      totalGain: r.gain + (r.route.second?.gain || 0), jointValue: r.route.jointValue, nextPositions: r.tested.size }));
    return answer;
  }
  const api = { solve, solveBranch, solveFutureBranch, refineBranch, simulate, candidates, evaluate, MODES };
  if (typeof module === 'object') module.exports = api;
  else root.PlacementSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
