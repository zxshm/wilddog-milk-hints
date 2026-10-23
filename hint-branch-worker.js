'use strict';
const requested = new URL(self.location.href).searchParams.get('strategy');
const strategy = ['future', 'plan'].includes(requested) ? requested : 'optimized';
importScripts('lib/matter.min.js', 'physics.js');
if (strategy === 'plan') importScripts('solver-future.js', 'layout.js');
importScripts(`solver-${strategy}.js`);
let context;
onmessage = async ({ data }) => {
  if (data.type === 'init') { context = data.context; return; }
  try {
    const started = performance.now();
    const first = context.stage === 'refine' ? await PlacementSolver.refineBranch(context, data.x)
      : context.stage === 'future-prepare' ? PlacementSolver.prepareFutureBranch(context, data.x)
      : context.stage === 'future-level' ? await PlacementSolver.solveFutureLevel(context, data.x)
      : context.stage === 'future' ? await PlacementSolver.solveFutureBranch(context, data.x)
      : await PlacementSolver.solveBranch(context.snapshot, context.level, context.nextLevel, data.x, { mode: context.mode });
    postMessage({ batch: data.batch, index: data.index, first, workerMs: +(performance.now() - started).toFixed(2) });
  } catch (error) { postMessage({ batch: data.batch, index: data.index, error: error.message }); }
};
