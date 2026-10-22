(function (root) {
  'use strict';
  const M = typeof module === 'object' ? require('./lib/matter.min.js') : root.Matter;
  const { Engine, Bodies, Body, Composite, Events } = M;
  const LEVELS = [
    { name: '野生马尿', color: '#f2c230', s: 42, aspect: .468 },
    { name: '野生狗尿', color: '#5fa83c', s: 51, aspect: .436 },
    { name: '野生鼠奶', color: '#4a4f58', s: 62, aspect: .433 },
    { name: '野生驴奶', color: '#2e7fc9', s: 75, aspect: .436 },
    { name: '老母鸡奶', color: '#8a5a2b', s: 90, aspect: .451 },
    { name: '野生见手青奶', color: '#2f6a3d', s: 104, aspect: .440 },
    { name: '野老猫猴奶', color: '#2b2b33', s: 120, aspect: .427 },
    { name: '野生爱因斯坦奶', color: '#5b3a91', s: 136, aspect: .423 },
    { name: '幻纹虎奶', color: '#d9531e', s: 154, aspect: .431 },
    { name: '野生龙奶', color: '#e07a1f', s: 171, aspect: .435 },
    { name: '野生奶·终极进化版', color: '#1f4fa8', s: 211, aspect: .736 },
  ];
  LEVELS.forEach(l => { l.w = l.s * Math.sqrt(l.aspect); l.h = l.s / Math.sqrt(l.aspect); l.round = Math.max(3, l.w * .1); });
  const W = 400, H = 720, DEAD_Y = 150, STEP = 1000 / 60, LAST = 10;
  const SPAWN_WEIGHTS = [30, 28, 22, 13, 7];
  const MERGE_SCORE = LEVELS.map((_, i) => i * (i + 1));
  const FINAL_BONUS = 1000;
  const spawnY = lv => DEAD_Y - 6 - LEVELS[lv].h / 2;
  const clampX = (lv, x) => Math.max(LEVELS[lv].w / 2 + 1, Math.min(W - LEVELS[lv].w / 2 - 1, x));

  // 实际游戏与预测器共用同一套物理、合成、生长和越线规则。
  class World {
    constructor(onMerge) {
      this.engine = Engine.create({ positionIterations: 10, velocityIterations: 8 });
      this.engine.gravity.y = 1.6;
      this.world = this.engine.world;
      this.time = 0; this.score = 0; this.maxLv = 0; this.dangerT = 0; this.over = false;
      this.mergeQueue = []; this.onMerge = onMerge; this.serial = 0; this.merges = 0;
      const wall = 200;
      Composite.add(this.world, [
        Bodies.rectangle(W / 2, H + wall / 2, W + wall * 2, wall, { isStatic: true, friction: .6 }),
        Bodies.rectangle(-wall / 2, H / 2 - 400, wall, H + 800, { isStatic: true, friction: .1 }),
        Bodies.rectangle(W + wall / 2, H / 2 - 400, wall, H + 800, { isStatic: true, friction: .1 }),
      ]);
      const collide = e => {
        if (this.over) return;
        for (const { bodyA: a, bodyB: b } of e.pairs) {
          if (a.lv === undefined || a.lv !== b.lv || a.gone || b.gone) continue;
          a.gone = b.gone = true;
          this.mergeQueue.push([a, b]);
        }
      };
      Events.on(this.engine, 'collisionStart collisionActive', collide);
    }
    cartons() { return Composite.allBodies(this.world).filter(b => b.lv !== undefined); }
    spawn(lv, x, y, angle = 0, k = 1) {
      const l = LEVELS[lv];
      const b = Bodies.rectangle(x, y, l.w * k, l.h * k, {
        angle, chamfer: { radius: l.round * k }, friction: .25, frictionStatic: .5,
        frictionAir: .004, restitution: .12, density: .0012,
      });
      Object.assign(b, { lv, k, born: this.time, gone: false, gameId: ++this.serial });
      Composite.add(this.world, b);
      return b;
    }
    drop(lv, x) {
      if (this.over) return null;
      const b = this.spawn(lv, clampX(lv, x), spawnY(lv));
      Body.setVelocity(b, { x: 0, y: 2 });
      return b;
    }
    merge(a, b) {
      Composite.remove(this.world, [a, b]);
      const x = (a.position.x + b.position.x) / 2, y = (a.position.y + b.position.y) / 2;
      const lv = a.lv === LAST ? LAST : a.lv + 1;
      const gain = a.lv === LAST ? FINAL_BONUS : MERGE_SCORE[lv];
      const special = a.lv === LAST;
      if (!special) {
        const c = this.spawn(lv, x, y, (a.angle + b.angle) / 2, .5);
        Body.setVelocity(c, { x: (a.velocity.x + b.velocity.x) / 2, y: Math.min(0, (a.velocity.y + b.velocity.y) / 2) - 1 });
        this.maxLv = Math.max(this.maxLv, lv);
      }
      this.score += gain; this.merges++;
      if (this.onMerge) this.onMerge({ x, y, lv, gain, special });
    }
    step() {
      const dt = STEP / 1000;
      this.time += dt;
      if (this.over) return;
      Engine.update(this.engine, STEP);
      const q = this.mergeQueue; this.mergeQueue = [];
      q.forEach(([a, b]) => this.merge(a, b));
      const cartons = this.cartons();
      for (const b of cartons) {
        if (b.k < 1) {
          const k = Math.min(1, b.k + dt / .18);
          Body.scale(b, k / b.k, k / b.k); b.k = k;
        }
      }
      const danger = cartons.some(b => this.time - b.born > 1.2 && b.bounds.min.y < DEAD_Y && b.speed < 1.5);
      this.dangerT = danger ? this.dangerT + dt : Math.max(0, this.dangerT - dt * 2);
      if (this.dangerT > 2) this.over = true;
    }
    snapshot() {
      return {
        time: this.time, score: this.score, maxLv: this.maxLv, dangerT: this.dangerT,
        over: this.over, serial: this.serial, merges: this.merges,
        bodies: this.cartons().map(b => ({
          lv: b.lv, k: b.k, born: b.born, gameId: b.gameId,
          x: b.position.x, y: b.position.y, angle: b.angle,
          vx: b.velocity.x, vy: b.velocity.y, av: b.angularVelocity,
          px: b.positionPrev.x, py: b.positionPrev.y, pa: b.anglePrev,
          ix: b.positionImpulse.x, iy: b.positionImpulse.y, deltaTime: b.deltaTime,
          vertices: b.vertices.map(v => ({ x: v.x, y: v.y })),
        })),
      };
    }
    static restore(s) {
      const w = new World();
      Object.assign(w, { time: s.time, score: s.score, maxLv: s.maxLv, dangerT: s.dangerT, over: s.over, merges: s.merges });
      for (const v of s.bodies) {
        const b = w.spawn(v.lv, v.x, v.y, v.angle, v.k);
        // 保留合成后缩放形成的真实圆角顶点，避免重建圆角时改变碰撞形状。
        if (v.vertices) Body.setVertices(b, v.vertices);
        b.born = v.born; b.gameId = v.gameId;
        Body.setVelocity(b, { x: v.vx, y: v.vy }); Body.setAngularVelocity(b, v.av);
        b.positionPrev.x = v.px; b.positionPrev.y = v.py; b.anglePrev = v.pa;
        b.positionImpulse.x = v.ix; b.positionImpulse.y = v.iy; b.deltaTime = v.deltaTime;
      }
      w.serial = s.serial;
      return w;
    }
    destroy() { Events.off(this.engine); Composite.clear(this.world, false); Engine.clear(this.engine); }
  }
  const api = { World, LEVELS, W, H, DEAD_Y, STEP, LAST, SPAWN_WEIGHTS, MERGE_SCORE, FINAL_BONUS, spawnY, clampX };
  if (typeof module === 'object') module.exports = api;
  else root.GamePhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
