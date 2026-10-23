(function (root) {
  'use strict';
  // 物理模拟互相隔离，只有完成的候选结果回到汇总线程。
  function createBranchPool(createWorker, size, diagnostics = false) {
    const workers = Array.from({ length: size }, createWorker);
    const timings = [];
    let batchId = 0, disposed = false;
    const mapBranches = (positions, context, onResult) => new Promise((resolve, reject) => {
      if (!positions.length) { resolve([]); return; }
      if (disposed) { reject(new Error('搜索线程已关闭')); return; }
      const batch = ++batchId, results = new Array(positions.length);
      const dispatchedAt = diagnostics ? new Array(positions.length) : null;
      let dispatched = 0, completed = 0;
      const dispatch = worker => {
        if (dispatched >= positions.length) return;
        const index = dispatched++;
        if (dispatchedAt) dispatchedAt[index] = performance.now();
        worker.postMessage({ type: 'branch', batch, index, x: positions[index] });
      };
      for (const worker of workers) {
        worker.onerror = error => reject(new Error(error.message || '并行计算失败'));
        worker.onmessage = ({ data }) => {
          if (data.batch !== batch || disposed) return;
          if (data.error) { reject(new Error(data.error)); return; }
          if (dispatchedAt) timings.push({ batch, stage: context.stage || 'branch', index: data.index,
            roundTripMs: +(performance.now() - dispatchedAt[data.index]).toFixed(2), workerMs: data.workerMs });
          results[data.index] = data.first; onResult(data.first);
          if (++completed === positions.length) resolve(results);
          else dispatch(worker);
        };
        worker.postMessage({ type: 'init', context }); dispatch(worker);
      }
    });
    return { mapBranches, drainTimings() { return timings.splice(0); },
      destroy() { disposed = true; workers.forEach(worker => worker.terminate()); } };
  }
  if (typeof module === 'object') module.exports = { createBranchPool };
  else root.createBranchPool = createBranchPool;
})(typeof globalThis !== 'undefined' ? globalThis : this);
