'use strict';
importScripts('lib/matter.min.js', 'physics.js', 'solver-goal.js');
let context;
onmessage = async ({ data }) => {
  if (data.type === 'init') { context = data.context; return; }
  try {
    const first = await PlacementSolver.solveBranch(context.snapshot, context.level, context.nextLevel, data.x, { mode: context.mode });
    postMessage({ batch: data.batch, index: data.index, first });
  } catch (error) { postMessage({ batch: data.batch, index: data.index, error: error.message }); }
};
