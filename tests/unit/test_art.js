// 单元测试 · 资源冒烟（阶段 1「资源先行」的回归护栏）。
// 思路：用**桩 2D 上下文**（Proxy 吞掉一切绘制调用）把每个绘制函数都真跑一遍，
//       覆盖全部实体 × 全部状态 × 全部皮肤 × 全部弹幕/特效样式。
// 价值：像 "HX.makePillar 不存在"、"drawXxx 里引用了 config 里没有的字段" 这类问题，
//       不必等打开浏览器才发现；浏览器内 run.html 与开发期无头校验都会跑到。
(function () {
  const HX = window.HX;

  // 桩上下文：属性可读写，方法一律 no-op —— **但对数值参数做有限性校验**。
  // 为什么必须校验：真实 Canvas 对 createRadialGradient/arc 等收到 NaN 会抛
  // "The provided double value is non-finite"，而纯 no-op 桩会静默放过，
  // 于是「画了个 NaN 什么都没显示」这类 bug 只在浏览器里才暴露。
  // 有了校验，几何错误在 run.html / 无头校验里就能直接拦下。
  function checkFinite(name, args) {
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (typeof a === 'number' && !isFinite(a)) {
        throw new Error(name + ' 第 ' + (i + 1) + ' 个参数非有限值（' + a + '）——' +
          '通常是某个坐标/半径来自 undefined 或 NaN');
      }
    }
  }

  function stubCtx() {
    const grad = { addColorStop() {} };
    const target = {
      canvas: { width: 1920, height: 1080 },
      createLinearGradient: function () { checkFinite('createLinearGradient', arguments); return grad; },
      createRadialGradient: function () { checkFinite('createRadialGradient', arguments); return grad; },
      measureText: () => ({ width: 48 })
    };
    return new Proxy(target, {
      get(t, k) {
        if (k in t) return t[k];
        if (typeof k === 'symbol') return undefined;
        return function () { checkFinite('ctx.' + String(k), arguments); };
      },
      set(t, k, v) { t[k] = v; return true; }
    });
  }

  function noThrow(label, fn) {
    try {
      fn();
    } catch (e) {
      throw new Error(label + ' 抛出异常：' + (e && e.message ? e.message : e));
    }
  }

  HX.test('art: 实体工厂 API 齐全（画廊/系统依赖的最小接口）', function () {
    const need = ['makePlayer', 'makeEnemy', 'makeBoss', 'makePillar', 'makePillars', 'makePickup'];
    for (let i = 0; i < need.length; i++) {
      HX.assert(typeof HX[need[i]] === 'function', '缺少工厂函数 HX.' + need[i]);
    }
    HX.assert(typeof HX.Bullet.init === 'function', '缺少 HX.Bullet.init（对象池重置入口）');
    HX.assert(HX.makePillars().length === 4, 'makePillars 应建出 4 根石柱');
  });

  HX.test('art: 桩上下文的 NaN 守卫自检（否则冒烟测试形同虚设）', function () {
    // 「测试用例本身也要验证它抓到的，是不是我以为的那个错」——
    // 若守卫失效，下面所有「绘制不抛」的用例都会变成假绿。
    const ctx = stubCtx();
    let caught = false;
    try { ctx.arc(1, NaN, 3, 0, 1); } catch (e) { caught = true; }
    HX.assert(caught, '桩上下文必须对 NaN 参数抛错');
    let caught2 = false;
    try { ctx.createRadialGradient(0, 0, 0, 0, 0, Infinity); } catch (e) { caught2 = true; }
    HX.assert(caught2, '桩上下文必须对 Infinity 参数抛错');
    // 正常参数不得误报
    noThrow('桩上下文正常调用', () => { ctx.arc(1, 2, 3, 0, 1); ctx.fill(); ctx.setTransform(1, 0, 0, 1, 0, 0); });
  });

  HX.test('art: 天幕与场地绘制不抛（drawSky / drawArena）', function () {
    const ctx = stubCtx();
    noThrow('drawSky', () => HX.Art.drawSky(ctx, { x: 3, y: 1 }, 1.5, 1920, 1080));
    noThrow('drawArena', () => HX.Art.drawArena(ctx, { x: 0, y: 0 }, 1.5));
  });

  HX.test('art: 玩家三套皮肤（含受击/无敌态）绘制不抛', function () {
    const ctx = stubCtx();
    for (let i = 0; i < HX.SKIN_ORDER.length; i++) {
      const id = HX.SKIN_ORDER[i];
      const p = HX.makePlayer(id, 5, 5);
      p.facing = { x: 0.5, y: -0.5 };
      noThrow('drawPlayer(' + id + ')', () => HX.Art.drawPlayer(ctx, p, id, 2.0));
      p.hurtFlash = 0.06;
      p.invuln = 0.3;
      noThrow('drawPlayer(' + id + ',受伤态)', () => HX.Art.drawPlayer(ctx, p, id, 2.0));
    }
  });

  HX.test('art: 小怪全部状态绘制不抛（含前摇/麻痹/掉血条）', function () {
    const ctx = stubCtx();
    const ids = HX.ENEMY_ORDER;
    for (let i = 0; i < ids.length; i++) {
      const e = HX.makeEnemy(ids[i], 3, 3);
      noThrow('drawEnemy(' + ids[i] + ')', () => HX.Art.drawEnemy(ctx, e, 1.0));
      e.hp = e.maxHp * 0.5;               // 触发血条分支
      e.hitFlash = 0.05;
      e.paraTimer = 0.5;
      noThrow('drawEnemy(' + ids[i] + ',受伤/麻痹)', () => HX.Art.drawEnemy(ctx, e, 1.0));
      e.telegraphing = true;
      e.telegraph = 0.5;
      noThrow('drawEnemy(' + ids[i] + ',前摇)', () => HX.Art.drawEnemy(ctx, e, 1.0));
      // 静止（速度为 0，验证拖尾分支不除零）
      noThrow('drawEnemy(' + ids[i] + ',静止)', () => HX.Art.drawEnemy(ctx, e, 0));
    }
  });

  HX.test('art: BOSS 三阶段 + 无敌态绘制不抛', function () {
    const ctx = stubCtx();
    const phases = [HX.BOSS.PHASE.NORMAL, HX.BOSS.PHASE.PILLAR, HX.BOSS.PHASE.ENRAGE];
    for (let i = 0; i < phases.length; i++) {
      const b = HX.makeBoss(10, 6);
      b.phase = phases[i];
      b.scale = phases[i] === HX.BOSS.PHASE.ENRAGE ? HX.BOSS.enrage.scale : 1;
      b.invuln = phases[i] === HX.BOSS.PHASE.ENRAGE;
      noThrow('drawBoss(' + phases[i] + ')', () => HX.Art.drawBoss(ctx, b, 3.0));
      b.hitFlash = 0.05;
      noThrow('drawBoss(' + phases[i] + ',受击)', () => HX.Art.drawBoss(ctx, b, 3.0));
    }
  });

  HX.test('art: 石柱暗/燃两态 + 灵石 + 地火 + 残火绘制不抛', function () {
    const ctx = stubCtx();
    const ps = HX.makePillars();
    for (let i = 0; i < ps.length; i++) {
      noThrow('drawPillar(暗)', () => HX.Art.drawPillar(ctx, ps[i], 1.0));
      ps[i].lit = true;
      ps[i].litAt = 0.5;
      ps[i].hitFlash = 0.04;
      noThrow('drawPillar(燃)', () => HX.Art.drawPillar(ctx, ps[i], 2.0));
    }
    const stone = HX.makePickup('guardStone', 4, 4);
    noThrow('drawPickup', () => HX.Art.drawPickup(ctx, stone, 1.7));
    noThrow('drawHazard(预警)', () => HX.Art.drawHazard(ctx, { kind: 'warn', pos: { x: 1, y: 1 }, r: 1.5, delay: 1, age: 0.4 }, 0.4));
    noThrow('drawHazard(地火)', () => HX.Art.drawHazard(ctx, { kind: 'fire', pos: { x: 1, y: 1 }, r: 1.5, delay: 1, age: 0.4 }, 0.4));
    noThrow('drawFire', () => HX.Art.drawFire(ctx, { pos: { x: 1, y: 1 }, r: 0.8, age: 1, life: 5 }, 2.0));
  });

  HX.test('art: 全部弹幕样式绘制不抛（含静止弹与追踪弹）', function () {
    const ctx = stubCtx();
    const styles = ['sword', 'fire', 'thunder', 'enemy', 'tracking', 'phoenix'];
    for (let i = 0; i < styles.length; i++) {
      const b = HX.Bullet.init({}, {
        style: styles[i], side: i < 3 ? 'player' : 'enemy',
        x: 1, y: 1, vx: 3, vy: 0, dmg: 10, life: 5
      });
      noThrow('drawBullets(' + styles[i] + ')', () => HX.Art.drawBullets(ctx, { bullets: [b], ebullets: [] }, 1.2));
      // 静止弹：速度 0 时 atan2 仍应有定义
      const s = HX.Bullet.init({}, { style: styles[i], side: 'enemy', x: 1, y: 1, vx: 0, vy: 0, life: 5 });
      noThrow('drawBullets(' + styles[i] + ',静止)', () => HX.Art.drawBullets(ctx, { ebullets: [s] }, 1.2));
    }
    // 空世界不应抛
    noThrow('drawBullets(空)', () => HX.Art.drawBullets(ctx, {}, 1.0));
  });

  HX.test('art: 全部特效原语绘制不抛（spark/ring/text/arc/ignite）', function () {
    const ctx = stubCtx();
    const list = [
      { type: 'spark', pos: { x: 256, y: 256 }, age: 0.1, life: 0.4, r: 51.2, alive: true, color: '#fff' },
      { type: 'ring', pos: { x: 256, y: 256 }, age: 0.2, life: 0.6, r0: 51.2, r1: 512, alive: true },
      { type: 'text', pos: { x: 256, y: 256 }, age: 0.3, life: 0.9, text: '-15', alive: true },
      { type: 'arc', pos: { x: 256, y: 256 }, age: 0.1, life: 0.35, alive: true, points: [{ x: 0, y: 0 }, { x: 256, y: 128 }, { x: 512, y: -77 }] },
      { type: 'ignite', pos: { x: 256, y: 256 }, age: 0.4, life: 1.0, alive: true, from: { x: 0, y: 0 }, to: { x: 768, y: 512 } }
    ];
    noThrow('drawEffects(全部原语)', () => HX.Art.drawEffects(ctx, { effects: list }, 1.0));
    // 死对象应被跳过
    list[0].alive = false;
    noThrow('drawEffects(含死对象)', () => HX.Art.drawEffects(ctx, { effects: list }, 1.0));
    noThrow('drawEffects(空)', () => HX.Art.drawEffects(ctx, {}, 1.0));
  });

  HX.test('art: 三套护身技视觉绘制不抛（御剑/南明/九霄）', function () {
    const ctx = stubCtx();
    for (let i = 0; i < HX.SKIN_ORDER.length; i++) {
      const id = HX.SKIN_ORDER[i];
      const p = HX.makePlayer(id, 6, 6);
      p.guardTimer = 10;
      p.guardOrbit = 1.2;
      noThrow('drawGuard(' + id + ')', () => HX.Art.drawGuard(ctx, p, id, 2.0));
    }
    // 未触发护身技时应当早退（不画）
    const off = HX.makePlayer('yujian', 1, 1);
    noThrow('drawGuard(未触发)', () => HX.Art.drawGuard(ctx, off, 'yujian', 2.0));
    HX.assert(off.guardTimer === 0, '护身技默认应为未触发');
  });

  HX.test('art: 绘制层只读——跑完一圈不修改实体状态', function () {
    const ctx = stubCtx();
    const p = HX.makePlayer('nanming', 2, 2);
    const boss = HX.makeBoss(8, 8);
    const e = HX.makeEnemy('wizard', 4, 4);
    const before = JSON.stringify([p.pos, p.hp, p.energy, boss.pos, boss.hp, e.pos, e.hp]);
    HX.Art.drawPlayer(ctx, p, 'nanming', 1.1);
    HX.Art.drawEnemy(ctx, e, 1.1);
    HX.Art.drawBoss(ctx, boss, 1.1);
    HX.Art.drawBullets(ctx, {}, 1.1);
    HX.Art.drawEffects(ctx, {}, 1.1);
    const after = JSON.stringify([p.pos, p.hp, p.energy, boss.pos, boss.hp, e.pos, e.hp]);
    HX.assert(before === after, '渲染层不得修改逻辑状态（README §9 渲染隔离）');
  });

  HX.test('audio: 配方覆盖 GDD 附录 B-4 要求的全部音效', function () {
    const R = HX.Audio.recipes;
    const required = {
      '普攻（御剑/南明/九霄）': ['sword', 'fire', 'thunder'],
      '命中与受击': ['hit', 'playerHit', 'enemyDie'],
      '护身技': ['guard'],
      '大招（三皮肤）': ['ult_yujian', 'ult_nanming', 'ult_jiuxiao'],
      '石柱点燃': ['pillarLit'],
      '狂暴': ['enrage'],
      '胜利/失败': ['win', 'lose'],
      'BOSS 登场/波次': ['bossSpawn', 'waveStart']
    };
    const keys = Object.keys(required);
    for (let i = 0; i < keys.length; i++) {
      const names = required[keys[i]];
      for (let j = 0; j < names.length; j++) {
        HX.assert(!!R[names[j]], '缺少音效配方「' + names[j] + '」（' + keys[i] + '）');
      }
    }
  });

  HX.test('audio: 未解锁时 play 静默不抛（浏览器自动播放策略）', function () {
    // 直接调用不应依赖 AudioContext 已就绪（file:// 双击打开时首个手势之前的状态）
    noThrow('Audio.play(未 init)', () => {
      HX.Audio.play('sword');
      HX.Audio.play('不存在的音效名');
    });
  });

  // ================= 阶段 1.5：侧视立绘（billboard）表现层 =================

  HX.test('sprites: faceOf 只做左右朝向（2026-09-15 设计者指示，GDD §3.3）', function () {
    const S = HX.Sprites;
    HX.assert(typeof S.faceOf === 'function', '缺少 HX.Sprites.faceOf');
    // side 由 systems 维护（+1 右 / -1 左）；**纯上下移动不改 side** → 立绘保持原左右朝向
    HX.assert(S.faceOf({ side: 1 }) === 'right', 'side=1 应朝右');
    HX.assert(S.faceOf({ side: -1 }) === 'left', 'side=-1 应朝左');
    HX.assert(S.faceOf({ side: 1, facing: { x: 0, y: -1 } }) === 'right', '向上移动时保持原本朝向（不再有背面）');
    HX.assert(S.faceOf({ side: -1, facing: { x: 0, y: 1 } }) === 'left', '向下移动时保持原本朝向（不再有正面）');
    // 缺省容错
    HX.assert(S.faceOf(null) === 'right', '实体为空时应回退到朝右，不得抛错');
    HX.assert(S.faceOf(undefined) === 'right', '实体为 undefined 时应回退');
    HX.assert(S.faceOf({}) === 'right', '无 side 字段时默认朝右');
    // 旧的四朝向字段必须已删除（防止两套朝向模型并存）
    HX.assert(S.FACE.front === undefined && S.FACE.back === undefined, 'FACE 不应再有 front/back');
  });

  HX.test('sprites: 全部立绘入口存在（渲染层转调依赖的最小接口）', function () {
    const need = ['player', 'spider', 'wizard', 'boss', 'pillar', 'pickup', 'guard', 'shadow', 'billboard', 'faceOf'];
    for (let i = 0; i < need.length; i++) {
      HX.assert(typeof HX.Sprites[need[i]] === 'function', '缺少 HX.Sprites.' + need[i]);
    }
    // 渲染层的转调函数必须都在（调用点不变，实现换层）
    const viaArt = ['drawPlayer', 'drawEnemy', 'drawBoss', 'drawPillar', 'drawPickup', 'drawGuard'];
    for (let i = 0; i < viaArt.length; i++) {
      HX.assert(typeof HX.Art[viaArt[i]] === 'function', '缺少 HX.Art.' + viaArt[i]);
    }
  });

  HX.test('sprites: 三皮肤 × 左右朝向 · 玩家立绘全部可画', function () {
    const ctx = stubCtx();
    const sides = [1, -1];
    for (let i = 0; i < HX.SKIN_ORDER.length; i++) {
      const id = HX.SKIN_ORDER[i];
      for (let f = 0; f < sides.length; f++) {
        const p = HX.makePlayer(id, 5, 5);
        p.side = sides[f];
        p.vel = { x: 30, y: -20 };            // 触发剑气拖尾分支
        noThrow('drawPlayer(' + id + ',side=' + sides[f] + ')', () => HX.Art.drawPlayer(ctx, p, id, 1.3));
        // 静止 + 纯上下移动（side 不变，验证不切朝向、不除零）
        p.vel = { x: 0, y: 0 };
        noThrow('drawPlayer(' + id + ',静止)', () => HX.Art.drawPlayer(ctx, p, id, 1.3));
        p.vel = { x: 0, y: -30 };
        noThrow('drawPlayer(' + id + ',上移保持朝向)', () => HX.Art.drawPlayer(ctx, p, id, 1.3));
      }
    }
  });

  HX.test('sprites: 小怪/BOSS/石柱/灵石的各状态立绘可画', function () {
    const ctx = stubCtx();
    const ids = HX.ENEMY_ORDER;
    for (let i = 0; i < ids.length; i++) {
      const e = HX.makeEnemy(ids[i], 3, 3);
      e.vel = { x: 20, y: 10 };               // 触发拖尾分支
      noThrow('drawEnemy(' + ids[i] + ')', () => HX.Art.drawEnemy(ctx, e, 1.0));
      e.hp = e.maxHp * 0.5; e.hitFlash = 0.05; e.paraTimer = 0.5;
      noThrow('drawEnemy(' + ids[i] + ',受伤/麻痹)', () => HX.Art.drawEnemy(ctx, e, 1.0));
      e.telegraphing = true; e.telegraph = 0.5;
      noThrow('drawEnemy(' + ids[i] + ',前摇)', () => HX.Art.drawEnemy(ctx, e, 1.0));
      e.vel = { x: 0, y: 0 };
      noThrow('drawEnemy(' + ids[i] + ',静止)', () => HX.Art.drawEnemy(ctx, e, 0));
    }
    const phases = [HX.BOSS.PHASE.NORMAL, HX.BOSS.PHASE.PILLAR, HX.BOSS.PHASE.ENRAGE];
    for (let i = 0; i < phases.length; i++) {
      const b = HX.makeBoss(10, 6);
      b.phase = phases[i];
      b.scale = phases[i] === HX.BOSS.PHASE.ENRAGE ? HX.BOSS.enrage.scale : 1;
      b.invuln = phases[i] === HX.BOSS.PHASE.ENRAGE;
      noThrow('drawBoss(' + phases[i] + ')', () => HX.Art.drawBoss(ctx, b, 3.0));
      b.hitFlash = 0.05;
      noThrow('drawBoss(' + phases[i] + ',受击)', () => HX.Art.drawBoss(ctx, b, 3.0));
    }
    const ps = HX.makePillars();
    for (let i = 0; i < ps.length; i++) {
      noThrow('drawPillar(暗)', () => HX.Art.drawPillar(ctx, ps[i], 1.0));
      ps[i].lit = true; ps[i].litAt = 0.5; ps[i].hitFlash = 0.04;
      noThrow('drawPillar(燃)', () => HX.Art.drawPillar(ctx, ps[i], 2.0));
    }
    const stone = HX.makePickup('guardStone', 4, 4);
    noThrow('drawPickup', () => HX.Art.drawPickup(ctx, stone, 1.7));
  });

  HX.test('sprites: 立绘必须画落地阴影（否则会像"贴在地上的一坨"）', function () {
    // 用「记录调用名」的桩上下文验证：画任一立绘都应产生 createRadialGradient（阴影/灵光）
    const seen = [];
    const grad = { addColorStop() {} };
    const target = {
      canvas: { width: 100, height: 100 },
      createLinearGradient: function () { checkFinite('createLinearGradient', arguments); return grad; },
      createRadialGradient: function () { checkFinite('createRadialGradient', arguments); seen.push('radial'); return grad; },
      measureText: () => ({ width: 48 })
    };
    const ctx = new Proxy(target, {
      get(t, k) {
        if (k in t) return t[k];
        if (typeof k === 'symbol') return undefined;
        return function () { seen.push(String(k)); checkFinite('ctx.' + String(k), arguments); };
      },
      set(t, k, v) { t[k] = v; return true; }
    });
    const p = HX.makePlayer('yujian', 2, 2);
    HX.Art.drawPlayer(ctx, p, 'yujian', 1.0);
    HX.assert(seen.indexOf('radial') >= 0, '玩家立绘未绘制落地阴影（GDD §3.3 要求从地面锚点站立）');
    HX.assert(seen.indexOf('ellipse') >= 0, '立绘应包含椭圆（阴影/光环的斜俯视投影）');
    seen.length = 0;
    const e = HX.makeEnemy('spider', 2, 2);
    HX.Art.drawEnemy(ctx, e, 1.0);
    HX.assert(seen.indexOf('radial') >= 0, '小怪立绘未绘制落地阴影');
  });
})();
