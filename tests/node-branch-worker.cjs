'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const Solver = require(workerData?.modulePath || '../dist/solver-optimized.js');
let context;
parentPort.on('message', async data => {
  if (data.type === 'init') { context = data.context; return; }
  try {
    const first = context.stage === 'refine' ? await Solver.refineBranch(context, data.x)
      : context.stage === 'future-prepare' ? Solver.prepareFutureBranch(context, data.x)
      : context.stage === 'future-level' ? await Solver.solveFutureLevel(context, data.x)
      : context.stage === 'future' ? await Solver.solveFutureBranch(context, data.x)
      : await Solver.solveBranch(context.snapshot, context.level, context.nextLevel, data.x, { mode: context.mode });
    parentPort.postMessage({ batch: data.batch, index: data.index, first });
  } catch (error) { parentPort.postMessage({ batch: data.batch, index: data.index, error: error.message }); }
});
