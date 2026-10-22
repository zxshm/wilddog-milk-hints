'use strict';
importScripts('lib/matter.min.js', 'physics.js', 'solver-optimized.js', 'branch-pool.js');
onmessage = async ({ data }) => {
  let pool;
  try {
    const size = Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2)));
    if (size > 1) pool = createBranchPool(() => new Worker('hint-branch-worker.js'), size);
    let lastProgress = 0;
    const result = await PlacementSolver.solve(data.snapshot, data.level, data.nextLevel, {
      mode: data.mode, mapBranches: pool?.mapBranches,
      onProgress: progress => {
        const now = performance.now();
        if (now - lastProgress > 180 || progress.completed === progress.total) {
          postMessage({ id: data.id, progress }); lastProgress = now;
        }
      },
    });
    result.workers = size;
    postMessage({ id: data.id, result });
  } catch (error) { postMessage({ id: data.id, error: error.message }); }
  finally { pool?.destroy(); }
};
