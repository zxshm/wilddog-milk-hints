'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze } = require('../dist/layout.js');
const { World } = require('../dist/physics.js');

function rectangle(lv, x, y, width, height) {
  return { lv, position: { x, y }, vertices: [
    { x: x - width / 2, y: y - height / 2 }, { x: x + width / 2, y: y - height / 2 },
    { x: x + width / 2, y: y + height / 2 }, { x: x - width / 2, y: y + height / 2 },
  ] };
}
test('相同接触几何中，等级差悬殊比相近等级更不利', () => {
  const big = rectangle(9, 200, 600, 200, 100);
  assert.ok(analyze([big, rectangle(0, 200, 530, 30, 40)]).mixed
    > analyze([big, rectangle(8, 200, 530, 30, 40)]).mixed);
});
test('底部横放大盒的低级遮挡比裸露表面或相近级覆盖惩罚更高', () => {
  const big = rectangle(9, 200, 650, 260, 100);
  const low = analyze([big, rectangle(0, 200, 570, 200, 60)]);
  assert.ok(low.buried > 0);
  assert.equal(analyze([big]).buried, 0);
  assert.ok(low.buried > analyze([big, rectangle(8, 200, 570, 200, 60)]).buried);
});
test('同级距离相同时识别中间挡住接触路径的盒子', () => {
  const pair = [rectangle(7, 90, 600, 60, 160), rectangle(7, 310, 600, 60, 160)];
  assert.equal(analyze(pair).blocked, 0);
  assert.ok(analyze([...pair, rectangle(3, 200, 600, 100, 60)]).blocked > 0);
  assert.equal(analyze([...pair, rectangle(3, 200, 400, 100, 60)]).blocked, 0);
});
test('旋转真实几何的评分有限且不修改原物理对象', () => {
  const w = new World();
  try {
    w.spawn(9, 200, 600, Math.PI / 2); w.spawn(0, 200, 480, -.3); w.spawn(7, 100, 350, .5);
    const before = JSON.stringify(w.snapshot());
    assert.ok(Number.isFinite(analyze(w.cartons()).total));
    assert.equal(JSON.stringify(w.snapshot()), before);
  } finally { w.destroy(); }
});
test('速度外扩的碰撞包围框不改变真实接近通道的评价', () => {
  const bodies = [rectangle(9, 200, 650, 200, 100), rectangle(0, 200, 570, 100, 60)];
  const expected = analyze(bodies);
  bodies[0].bounds = { min: { x: 0, y: 540 }, max: { x: 400, y: 720 } };
  assert.deepEqual(analyze(bodies), expected);
});
