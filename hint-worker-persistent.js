'use strict';
importScripts('lib/matter.min.js', 'physics.js', 'solver-optimized.js', 'branch-pool.js');
let pool;
onmessage = async ({ data }) => {
  try {
    let size = Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2)));
    // 不支持嵌套线程的环境仍执行同样的串行搜索。
    try { if (size > 1 && !pool) pool = createBranchPool(() => new Worker('hint-branch-worker.js'), size); }
    catch (_) { size = 1; }
    let lastProgress = 0;
    const options = {
      mode: data.mode,
      onProgress: progress => {
        const now = performance.now();
        if (now - lastProgress > 180 || progress.completed === progress.total) {
          postMessage({ id: data.id, progress }); lastProgress = now;
        }
      },
    };
    let result;
    try { result = await PlacementSolver.solve(data.snapshot, data.level, data.nextLevel, { ...options, mapBranches: pool?.mapBranches }); }
    catch (error) {
      if (!pool) throw error;
      pool.destroy(); pool = null; size = 1;
      result = await PlacementSolver.solve(data.snapshot, data.level, data.nextLevel, options);
    }
    result.workers = size;
    postMessage({ id: data.id, result });
  } catch (error) { pool?.destroy(); pool = null; postMessage({ id: data.id, error: error.message }); }
};
