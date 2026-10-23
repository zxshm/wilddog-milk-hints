'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../dist/lib/matter.min.js');
const { World, LAST } = require('../dist/physics.js');

test('快速恢复覆盖全部级别、生长和旋转，与完整几何重建的后续运动完全一致', () => {
  for (let level = 0; level <= LAST; level++) {
    const original = new World();
    const b = original.spawn(level, 200, 400, .317, .5);
    M.Body.setVelocity(b, { x: .81, y: -.33 }); M.Body.setAngularVelocity(b, .021);
    original.step();
    const snapshot = original.snapshot(), frozen = JSON.stringify(snapshot);
    const fast = World.restore(snapshot), reference = World.restore(snapshot, { reuseGeometry: false });
    for (let frame = 0; frame < 240; frame++) { fast.step(); reference.step(); }
    const a = fast.snapshot(), expected = reference.snapshot();
    assert.deepEqual(a.bodies, expected.bodies, `级别 ${level} 的顶点或运动量改变`);
    assert.deepEqual(a.pairs, expected.pairs);
    assert.equal(a.score, expected.score); assert.equal(a.over, expected.over);
    assert.equal(JSON.stringify(snapshot), frozen);
    original.destroy(); fast.destroy(); reference.destroy();
  }
});

test('两个恢复副本互不共享可变字段，旧格式快照仍能恢复', () => {
  const original = new World(); original.spawn(3, 180, 500);
  const snapshot = original.snapshot(), a = World.restore(snapshot), b = World.restore(snapshot);
  const x = a.cartons()[0], y = b.cartons()[0];
  for (const key of ['vertices', 'axes', 'bounds', 'position', 'positionPrev', 'velocity', 'force',
    'positionImpulse', 'constraintImpulse', 'parts', 'plugin', 'collisionFilter', 'render']) assert.notEqual(x[key], y[key], key);
  x.render.sprite.xOffset = 999; x.collisionFilter.mask = 0; x.force.x = 100;
  assert.notEqual(y.render.sprite.xOffset, 999); assert.notEqual(y.collisionFilter.mask, 0); assert.equal(y.force.x, 0);
  assert.equal(x.parent, x); assert.equal(x.parts[0], x);
  const legacy = structuredClone(snapshot); delete legacy.bodies[0].dynamics;
  const restored = World.restore(legacy); restored.step();
  assert.equal(restored.cartons()[0].lv, 3);
  original.destroy(); a.destroy(); b.destroy(); restored.destroy();
});
