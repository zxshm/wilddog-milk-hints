'use strict';
const strategy = new URL(self.location.href).searchParams.get('strategy') === 'future' ? 'future' : 'optimized';
importScripts('lib/matter.min.js', 'physics.js', `solver-${strategy}.js`);
let context;
onmessage = async ({ data }) => {
  if (data.type === 'init') { context = data.context; return; }
  try {
    const first = context.stage === 'refine' ? await PlacementSolver.refineBranch(context, data.x)
      : context.stage === 'future-prepare' ? PlacementSolver.prepareFutureBranch(context, data.x)
      : context.stage === 'future-level' ? await PlacementSolver.solveFutureLevel(context, data.x)
      : context.stage === 'future' ? await PlacementSolver.solveFutureBranch(context, data.x)
      : await PlacementSolver.solveBranch(context.snapshot, context.level, context.nextLevel, data.x, { mode: context.mode });
    postMessage({ batch: data.batch, index: data.index, first });
  } catch (error) { postMessage({ batch: data.batch, index: data.index, error: error.message }); }
};
