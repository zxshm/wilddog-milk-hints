(function (root) {
  'use strict';
  // 物理模拟互相隔离，只有完成的候选结果回到汇总线程。
  function createBranchPool(createWorker, size, diagnostics = false) {
    const workers = [];
    const timings = [];
    let batchId = 0, disposed = false, failure = null, active = null;
    function fail(error) {
      failure = error;
      if (active) { clearTimeout(active.timer); active.reject(error); active = null; }
    }
    function arm(batch) {
      clearTimeout(batch.timer);
      batch.timer = setTimeout(() => fail(new Error('搜索线程长时间未返回，将恢复串行计算')), 60000);
    }
    // 创建后立即接收错误，避免首次下载依赖失败时，错误早于第一批任务而被丢弃。
    try {
      for (let i = 0; i < size; i++) {
        const worker = createWorker(); workers.push(worker);
        worker.onerror = error => { error.preventDefault?.(); fail(new Error(error.message || '并行计算失败')); };
        worker.onmessageerror = () => fail(new Error('搜索线程消息读取失败'));
        worker.onmessage = ({ data }) => {
          const batch = active;
          if (!batch || disposed || data.batch !== batch.id) return;
          if (data.error) { fail(new Error(data.error)); return; }
          if (batch.dispatchedAt) timings.push({ batch: batch.id, stage: batch.context.stage || 'branch', index: data.index,
            roundTripMs: +(performance.now() - batch.dispatchedAt[data.index]).toFixed(2), workerMs: data.workerMs });
          batch.results[data.index] = data.first;
          try { batch.onResult(data.first); }
          catch (error) { fail(error); return; }
          if (++batch.completed === batch.results.length) {
            clearTimeout(batch.timer); active = null; batch.resolve(batch.results);
          } else { arm(batch); batch.dispatch(worker); }
        };
      }
    } catch (error) { workers.forEach(worker => worker.terminate()); throw error; }
    const mapBranches = (positions, context, onResult) => new Promise((resolve, reject) => {
      if (!positions.length) { resolve([]); return; }
      if (disposed) { reject(new Error('搜索线程已关闭')); return; }
      if (failure) { reject(failure); return; }
      if (active) { reject(new Error('上一批搜索尚未完成')); return; }
      const batch = { id: ++batchId, results: new Array(positions.length), context, onResult, resolve, reject,
        dispatchedAt: diagnostics ? new Array(positions.length) : null, dispatched: 0, completed: 0, timer: null };
      active = batch;
      const dispatch = worker => {
        if (batch.dispatched >= positions.length) return;
        const index = batch.dispatched++;
        if (batch.dispatchedAt) batch.dispatchedAt[index] = performance.now();
        try { worker.postMessage({ type: 'branch', batch: batch.id, index, x: positions[index] }); }
        catch (error) { fail(error); }
      };
      batch.dispatch = dispatch; arm(batch);
      for (const worker of workers) {
        try { worker.postMessage({ type: 'init', context }); dispatch(worker); }
        catch (error) { fail(error); break; }
      }
    });
    return { mapBranches, drainTimings() { return timings.splice(0); },
      destroy() { disposed = true; fail(new Error('搜索线程已关闭')); workers.forEach(worker => worker.terminate()); } };
  }
  if (typeof module === 'object') module.exports = { createBranchPool };
  else root.createBranchPool = createBranchPool;
})(typeof globalThis !== 'undefined' ? globalThis : this);
