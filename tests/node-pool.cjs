'use strict';
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const { createBranchPool } = require('../dist/branch-pool.js');
module.exports = (size, modulePath) => createBranchPool(() => {
  const worker = new Worker(path.join(__dirname, 'node-branch-worker.cjs'), { workerData: { modulePath } });
  const adapter = { postMessage: data => worker.postMessage(data), terminate: () => worker.terminate() };
  worker.on('message', data => adapter.onmessage?.({ data }));
  worker.on('error', error => adapter.onerror?.(error));
  return adapter;
}, size);
