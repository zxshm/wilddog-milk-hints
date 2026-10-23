(function (root) {
  'use strict';
  // 只用于评价模拟后的布局，不参与碰撞、合成、出盒或失败判定。
  const position = b => b.position || { x: b.x, y: b.y };
  function bounds(b) {
    // 引擎包围框含速度外扩，接近通道应取真实轮廓，不能把预测扫过的空白当成盒子表面。
    const box = { min: { x: Infinity, y: Infinity }, max: { x: -Infinity, y: -Infinity } };
    for (const v of b.vertices) {
      box.min.x = Math.min(box.min.x, v.x); box.min.y = Math.min(box.min.y, v.y);
      box.max.x = Math.max(box.max.x, v.x); box.max.y = Math.max(box.max.y, v.y);
    }
    return box;
  }
  function nearest(a, b) {
    let squared = Infinity, start, end;
    const project = (p, v, w, reverse) => {
      const dx = w.x - v.x, dy = w.y - v.y;
      const t = Math.max(0, Math.min(1, ((p.x - v.x) * dx + (p.y - v.y) * dy) / (dx * dx + dy * dy || 1)));
      const q = { x: v.x + t * dx, y: v.y + t * dy };
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      if (d < squared) { squared = d; start = reverse ? q : p; end = reverse ? p : q; }
    };
    for (let i = 0; i < a.vertices.length; i++) for (let j = 0; j < b.vertices.length; j++) {
      project(a.vertices[i], b.vertices[j], b.vertices[(j + 1) % b.vertices.length], false);
      project(b.vertices[j], a.vertices[i], a.vertices[(i + 1) % a.vertices.length], true);
    }
    return { gap: Math.sqrt(squared), start, end };
  }
  function contains(body, p, box) {
    if (p.x < box.min.x || p.x > box.max.x || p.y < box.min.y || p.y > box.max.y) return false;
    let positive = false, negative = false;
    for (let i = 0; i < body.vertices.length; i++) {
      const a = body.vertices[i], b = body.vertices[(i + 1) % body.vertices.length];
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      positive ||= cross > 1e-7; negative ||= cross < -1e-7;
      if (positive && negative) return false;
    }
    return true;
  }
  function verticalSpan(b, x) {
    let top = Infinity, bottom = -Infinity;
    for (let i = 0; i < b.vertices.length; i++) {
      const a = b.vertices[i], c = b.vertices[(i + 1) % b.vertices.length];
      if (x < Math.min(a.x, c.x) || x > Math.max(a.x, c.x)) continue;
      if (Math.abs(c.x - a.x) < 1e-9) { top = Math.min(top, a.y, c.y); bottom = Math.max(bottom, a.y, c.y); }
      else {
        const y = a.y + (x - a.x) / (c.x - a.x) * (c.y - a.y);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    return { top, bottom };
  }
  function analyze(bodies) {
    const boxes = bodies.map(bounds), positions = bodies.map(position), cache = new Map();
    const connection = (i, j) => {
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (!cache.has(key)) cache.set(key, nearest(bodies[Math.min(i, j)], bodies[Math.max(i, j)]));
      return cache.get(key);
    };
    let mixed = 0, buried = 0, blocked = 0;
    // 等级相差很大的接触不利于连续升级，但轻小盒子可被消除，惩罚不按大盒子的全部价值放大。
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const difference = Math.abs(bodies[i].lv - bodies[j].lv);
      if (difference <= 1) continue;
      const a = boxes[i], b = boxes[j];
      const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
      const dy = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y);
      if (dx * dx + dy * dy > 64) continue;
      const near = Math.max(0, 1 - connection(i, j).gap / 8);
      mixed += near * (difference - 1) * Math.pow(2, Math.min(bodies[i].lv, bodies[j].lv) / 2) * 6;
    }
    // 从大盒子的真实上表面向上观察九条通道，区分可接近表面和被低级盒子盖住的表面。
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i], box = boxes[i];
      if (body.lv < 3) continue;
      for (let k = 0; k < 9; k++) {
        const x = box.min.x + (box.max.x - box.min.x) * (k + .5) / 9;
        const surface = verticalSpan(body, x).top;
        if (!Number.isFinite(surface)) continue;
        let cover = -1, coverBottom = -Infinity;
        for (let j = 0; j < bodies.length; j++) {
          if (i === j || positions[j].y >= positions[i].y || x < boxes[j].min.x || x > boxes[j].max.x) continue;
          const span = verticalSpan(bodies[j], x);
          if (span.top < surface - 2 && span.bottom > coverBottom) { cover = j; coverBottom = span.bottom; }
        }
        if (cover >= 0) buried += Math.max(0, body.lv - bodies[cover].lv - 1) * Math.pow(2, body.lv / 2) * 4 / 9;
      }
    }
    // 同级最近边界之间若有其他盒子，距离近也不能当成畅通的合成路径。
    for (let lv = 3; lv < 10; lv++) {
      const remaining = bodies.map((b, i) => b.lv === lv ? i : -1).filter(i => i >= 0);
      while (remaining.length > 1) {
        let best, ai, bi;
        for (let a = 0; a < remaining.length; a++) for (let b = a + 1; b < remaining.length; b++) {
          const c = connection(remaining[a], remaining[b]);
          if (!best || c.gap < best.gap) { best = c; ai = a; bi = b; }
        }
        const left = remaining[ai], right = remaining[bi];
        let obstruction = 0;
        // 最近边缘可能恰在盒子顶部，同时检查中心连线，避免漏掉挡在两大盒子腰部的障碍。
        for (const [start, end] of [[best.start, best.end], [positions[left], positions[right]]]) {
          let samples = 0, blockedSamples = 0;
          for (let k = 1; k <= 7; k++) {
            const t = k / 8, p = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
            if (contains(bodies[left], p, boxes[left]) || contains(bodies[right], p, boxes[right])) continue;
            samples++;
            let weight = 0;
            for (let j = 0; j < bodies.length; j++) if (j !== left && j !== right && contains(bodies[j], p, boxes[j])) {
              weight = Math.max(weight, .5 + Math.min(lv, bodies[j].lv) / Math.max(1, lv));
            }
            blockedSamples += weight;
          }
          obstruction += blockedSamples / Math.max(1, samples) / 2;
        }
        blocked += Math.min(best.gap, 220) * Math.pow(2, lv / 2) * obstruction * .35;
        remaining.splice(bi, 1); remaining.splice(ai, 1);
      }
    }
    return { mixed, buried, blocked, total: mixed + buried + blocked };
  }
  const api = { analyze, cost: bodies => analyze(bodies).total };
  if (typeof module === 'object') module.exports = api;
  else root.LayoutEvaluation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
