'use strict';
importScripts('lib/matter.min.js', 'physics.js', 'solver.js');
onmessage = async ({ data }) => {
  try {
    const result = await PlacementSolver.solve(data.snapshot, data.level, data.nextLevel, { mode: data.mode });
    postMessage({ id: data.id, result });
  } catch (error) {
    postMessage({ id: data.id, error: error.message });
  }
};
