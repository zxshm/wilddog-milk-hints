'use strict';
// 与实际页面使用同一个浏览器引擎重放，单独记录跨引擎浮点差异，不混同两种验证。
importScripts('/lib/matter.min.js', '/physics.js');
onmessage = async () => {
  let w;
  try {
    const log = await (await fetch('/__qa/browser-record.json')).json();
    w = GamePhysics.World.restore(log.initial);
    const requireEqual = (actual, expected, message) => {
      if (actual !== expected) throw new Error(`${message}：${actual} / ${expected}`);
    };
    const advance = time => {
      const steps = Math.round((time - w.time) / (GamePhysics.STEP / 1000));
      if (steps < 0 || steps > 1000000) throw new Error('投放时刻无效');
      for (let i = 0; i < steps; i++) w.step();
      if (Math.abs(time - w.time) > 1e-7) throw new Error('物理时钟未对齐');
    };
    for (const row of log.route) {
      advance(row.time);
      requireEqual(w.score, row.score, `第 ${row.move} 步投放前得分`);
      requireEqual(w.cartons().length, row.boxes, `第 ${row.move} 步投放前盒子数`);
      w.drop(row.level, row.x);
      if (row.move % 25 === 0) postMessage({ progress: row.move });
    }
    advance(log.final.time);
    requireEqual(w.score, log.final.score, '终局得分');
    requireEqual(w.maxLv, log.final.maxLv, '终局级别');
    requireEqual(w.over, log.final.over, '终局失败状态');
    const snapshot = w.snapshot();
    requireEqual(snapshot.bodies.length, log.final.bodies.length, '终局盒子数');
    let maxError = 0;
    snapshot.bodies.forEach((b, i) => {
      const expected = log.final.bodies[i];
      requireEqual(b.lv, expected.lv, '终局盒子等级');
      for (const key of ['x', 'y', 'angle', 'vx', 'vy', 'av']) maxError = Math.max(maxError, Math.abs(b[key] - expected[key]));
    });
    if (maxError >= 1e-7) throw new Error(`终局状态误差：${maxError}`);
    postMessage({ result: { moves: log.route.length, score: w.score, maxLevel: w.maxLv + 1, over: w.over,
      allMovesMatched: true, maxFinalStateError: maxError, userAgent: navigator.userAgent } });
  } catch (error) { postMessage({ error: error.message }); }
  finally { w?.destroy(); }
};
