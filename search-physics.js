(function (root) {
  'use strict';
  const M = typeof module === 'object' ? require('./lib/matter.min.js') : root.Matter;
  const original = M.Collision._overlapAxes;
  let projections = new WeakMap();

  // 凸多边形的投影沿边界先增后减。复用上一帧的极值顶点，只沿相邻边修正。
  // 在几乎平行的边上继续遍历整段平台，保留浮点舍入导致的微小极值差异。
  function extreme(vertices, x, y, indices, slot, sign) {
    const length = vertices.length, start = indices[slot];
    let index = start, bestIndex = start;
    let best = vertices[start].x * x + vertices[start].y * y;
    const tolerance = (Math.abs(best) + 1) * 1e-12;
    for (let step = 1; step < length; step++) {
      index = index + 1 === length ? 0 : index + 1;
      const value = vertices[index].x * x + vertices[index].y * y;
      if ((value - best) * sign < -tolerance) break;
      if ((value - best) * sign > 0) { best = value; bestIndex = index; }
    }
    index = start;
    for (let step = 1; step < length; step++) {
      index = index === 0 ? length - 1 : index - 1;
      const value = vertices[index].x * x + vertices[index].y * y;
      if ((value - best) * sign < -tolerance) break;
      if ((value - best) * sign > 0) { best = value; bestIndex = index; }
    }
    indices[slot] = bestIndex;
    return best;
  }

  function cachedIndices(axes, vertices) {
    let bodies = projections.get(axes);
    if (!bodies) { bodies = new WeakMap(); projections.set(axes, bodies); }
    let indices = bodies.get(vertices);
    if (!indices) { indices = new Uint16Array(axes.length * 2); bodies.set(vertices, indices); }
    return indices;
  }

  function overlapAxes(result, a, b, axes) {
    // 四顶点墙体继续用原来的短循环。
    if (a.length <= 4 && b.length <= 4) return original(result, a, b, axes);
    const ai = cachedIndices(axes, a), bi = cachedIndices(axes, b);
    let overlap = Number.MAX_VALUE, axisIndex = 0;
    for (let i = 0; i < axes.length; i++) {
      const axis = axes[i], x = axis.x, y = axis.y, slot = i * 2;
      const maxA = extreme(a, x, y, ai, slot, 1);
      const minA = extreme(a, x, y, ai, slot + 1, -1);
      const maxB = extreme(b, x, y, bi, slot, 1);
      const minB = extreme(b, x, y, bi, slot + 1, -1);
      const ab = maxA - minB, ba = maxB - minA, value = ab < ba ? ab : ba;
      if (value < overlap) {
        overlap = value; axisIndex = i;
        if (value <= 0) break;
      }
    }
    result.axis = axes[axisIndex]; result.overlap = overlap;
  }

  // 仅在同步的搜索模拟期间启用；退出时恢复，网页实际游戏仍使用原版引擎。
  function run(simulation) {
    const previous = M.Collision._overlapAxes;
    M.Collision._overlapAxes = overlapAxes;
    try { return simulation(); }
    finally { M.Collision._overlapAxes = previous; }
  }
  const api = { run, overlapAxes, reset() { projections = new WeakMap(); } };
  if (typeof module === 'object') module.exports = api;
  else root.SearchPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
