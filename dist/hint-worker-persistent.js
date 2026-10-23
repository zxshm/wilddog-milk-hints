'use strict';
const parameters = new URL(self.location.href).searchParams;
const requested = parameters.get('strategy'), release = parameters.get('v');
// 页面、主线程和分支线程使用同一版本，避免发布后命中旧脚本缓存。
const versioned = file => release ? `${file}?v=${encodeURIComponent(release)}` : file;
const strategy = ['future', 'plan'].includes(requested) ? requested : 'optimized';
importScripts(...['lib/matter.min.js', 'physics.js'].map(versioned));
if (strategy === 'plan') importScripts(...['solver-future.js', 'layout.js'].map(versioned));
importScripts(...[`solver-${strategy}.js`, 'branch-pool.js'].map(versioned));
let pool;
onmessage = async ({ data }) => {
  try {
    let size = Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2)));
    // 不支持嵌套线程的环境仍执行同样的串行搜索。
    try { if (size > 1 && !pool) pool = createBranchPool(() => new Worker(`hint-branch-worker.js?strategy=${strategy}${release ? `&v=${encodeURIComponent(release)}` : ''}`), size, !!data.diagnostics); }
    catch (_) { size = 1; }
    let lastProgress = 0;
    const options = {
      mode: data.mode,
      onProgress: progress => {
        const now = performance.now();
        if (now - lastProgress > 180 || progress.completed === progress.total) {
          postMessage({ id: data.id, progress }); lastProgress = now;
        }
      },
    };
    let result;
    try { result = await PlacementSolver.solve(data.snapshot, data.level, data.nextLevel, { ...options, mapBranches: pool?.mapBranches }); }
    catch (error) {
      if (!pool) throw error;
      pool.destroy(); pool = null; size = 1;
      result = await PlacementSolver.solve(data.snapshot, data.level, data.nextLevel, options);
    }
    result.workers = size;
    if (data.diagnostics) result.workerTasks = pool?.drainTimings() || [];
    postMessage({ id: data.id, result });
  } catch (error) { pool?.destroy(); pool = null; postMessage({ id: data.id, error: error.message }); }
};
// 主页面据此区分依赖尚未下载完成和正常的长时间搜索。
postMessage({ ready: true });
