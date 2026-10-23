(function (root) {
  'use strict';
  const Future = typeof module === 'object' ? require('./solver-future.js') : root.PlacementSolver;
  const Layout = typeof module === 'object' ? require('./layout.js') : root.LayoutEvaluation;
  // 保留第二步的两条路线；第三盒显示出来后，下一步可以据此选择不同路线。
  const api = Future.createSolver({ layoutCost: Layout.cost, secondWidth: 2, continueAfterWin: true, version: 'joint-8-endless' });
  if (typeof module === 'object') module.exports = api;
  else root.PlacementSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
