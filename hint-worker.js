'use strict';
importScripts('lib/matter.min.js', 'physics.js', 'solver.js');
onmessage = async ({ data }) => {
  try {
    let lastProgress = 0;
    const result = await PlacementSolver.solve(data.snapshot, data.level, data.nextLevel, {
      mode: data.mode,
      onProgress: progress => {
        const now = performance.now();
        if (now - lastProgress > 180 || progress.completed === progress.total) {
          postMessage({ id: data.id, progress }); lastProgress = now;
        }
      },
    });
    postMessage({ id: data.id, result });
  } catch (error) {
    postMessage({ id: data.id, error: error.message });
  }
};
