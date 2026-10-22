(function (root) {
  'use strict';
  // 物理模拟互相隔离，只有完成的候选结果回到汇总线程。
  function createBranchPool(createWorker, size) {
    const workers = Array.from({ length: size }, createWorker);
    let batchId = 0, disposed = false;
    const mapBranches = (positions, context, onResult) => new Promise((resolve, reject) => {
      if (!positions.length) { resolve([]); return; }
      if (disposed) { reject(new Error('搜索线程已关闭')); return; }
      const batch = ++batchId, results = new Array(positions.length);
      let dispatched = 0, completed = 0;
      const dispatch = worker => {
        if (dispatched >= positions.length) return;
        const index = dispatched++;
        worker.postMessage({ type: 'branch', batch, index, x: positions[index] });
      };
      for (const worker of workers) {
        worker.onerror = error => reject(new Error(error.message || '并行计算失败'));
        worker.onmessage = ({ data }) => {
          if (data.batch !== batch || disposed) return;
          if (data.error) { reject(new Error(data.error)); return; }
          results[data.index] = data.first; onResult(data.first);
          if (++completed === positions.length) resolve(results);
          else dispatch(worker);
        };
        worker.postMessage({ type: 'init', context }); dispatch(worker);
      }
    });
    return { mapBranches, destroy() { disposed = true; workers.forEach(worker => worker.terminate()); } };
  }
  if (typeof module === 'object') module.exports = { createBranchPool };
  else root.createBranchPool = createBranchPool;
})(typeof globalThis !== 'undefined' ? globalThis : this);
