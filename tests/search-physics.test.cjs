'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../dist/lib/matter.min.js');
const P = require('../dist/physics.js');
const Kernel = require('../dist/search-physics.js');
const original = M.Collision._overlapAxes;

test('全部级别、旋转、生长和平行边的投影与原版逐项完全一致', () => {
  const w = new P.World();
  let checks = 0;
  for (let a = 0; a <= P.LAST; a++) for (let b = 0; b <= P.LAST; b++) {
    const first = w.spawn(a, 200, 500, 0, .5), second = w.spawn(b, 180, 540);
    for (let frame = 0; frame < 90; frame++) {
      M.Body.rotate(first, frame < 10 ? 1e-14 : .173);
      M.Body.rotate(second, frame < 10 ? 0 : -.217);
      M.Body.translate(second, { x: Math.sin(frame) * 20, y: Math.cos(frame) * 15 });
      if (frame < 8) M.Body.scale(first, 1.05, 1.05);
      for (const [x, y] of [[first, second], [second, first]]) {
        const expected = {}, actual = {};
        original(expected, x.vertices, y.vertices, x.axes);
        Kernel.overlapAxes(actual, x.vertices, y.vertices, x.axes);
        assert.equal(actual.overlap, expected.overlap, `级别 ${a}/${b} 帧 ${frame}`);
        assert.equal(actual.axis, expected.axis);
        checks++;
      }
    }
    M.Composite.remove(w.world, [first, second]);
  }
  w.destroy();
  console.log(`投影几何对照 ${checks} 次`);
});

test('历史失败整局每次碰撞投影均等价，异常退出恢复原版内核', () => {
  const fixture = require('./fixtures/failed-route-42.json'), w = new P.World();
  let checks = 0;
  M.Collision._overlapAxes = (result, a, b, axes) => {
    const expected = {};
    original(expected, a, b, axes);
    Kernel.overlapAxes(result, a, b, axes);
    assert.equal(result.overlap, expected.overlap);
    assert.equal(result.axis, expected.axis);
    checks++;
  };
  try {
    for (const move of fixture.route) {
      w.drop(move.level, move.x);
      for (let frame = 0; frame < 240; frame++) w.step();
    }
    assert.equal(w.score, fixture.score);
  } finally { M.Collision._overlapAxes = original; w.destroy(); }
  assert.throws(() => Kernel.run(() => { throw new Error('模拟中止'); }), /模拟中止/);
  assert.equal(M.Collision._overlapAxes, original);
  console.log(`整局碰撞对照 ${checks} 次`);
});
