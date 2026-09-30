// 战斗世界（systems 层）：状态容器 + 每步推进编排。**不含任何渲染引用**（AGENTS §5）。
//
// 【为什么世界推进必须落在 systems，而不是 scenes/battle.js】
//   tests/sim.html 的无头平衡模拟要能**不渲染**地跑完整对局 ——
//   所以「一局怎么推进」必须是可独立调用的纯逻辑入口。
//
// 【调用约定】（战斗场景与无头模拟共用同一入口）
//   const w = HX.World.create({ seed, skinId });
//   HX.World.step(w, 1 / 60, { moveX, moveY, dash, ult });
//
// 【为什么输入走 intent 参数注入，而不是系统内部读 HX.Input】
//   ① 无头模拟可以脚本化驱动输入（不依赖浏览器事件）；
//   ② 保证「相同 seed + 相同 intent 序列 → 完全相同结果」（AGENTS §4 确定性）。
//
// 每步推进顺序（固定，不可随意调换）：
//   计时 → 石柱出土 → 玩家移动 → 刷怪 → BOSS → 小怪 AI → 普攻 → 大招 → 护身技/拾取
//   → 弹幕位移 → 命中判定 → 清死体 → 地火/火痕 → 灵石 → 特效老化 → 关卡推进
//   → 相机 → 池回收/索引重建
(function () {
  const HX = window.HX || (window.HX = {});

  // 空输入：无头模拟不传 intent 时复用同一对象，避免每步分配
  const EMPTY_INTENT = { moveX: 0, moveY: 0, dash: false, ult: false };

  // ---------- 特效（池化）----------
  // 字段与 render/art.js 的 drawEffects 约定一致：{ type, pos, age, life, alive, ... }
  function makeEffect() {
    return {
      type: '', pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
      age: 0, life: 0.4, r: 0, r0: 0, r1: 0, color: null,
      text: '', points: null, from: null, to: null, delay: 0, alive: true
    };
  }

  function initEffect(e, opts) {
    opts = opts || {};
    e.type = opts.type || 'spark';
    e.pos.x = opts.x || 0;
    e.pos.y = opts.y || 0;
    e.vel.x = opts.vx || 0;
    e.vel.y = opts.vy || 0;
    e.age = 0;
    e.life = opts.life === undefined ? 0.4 : opts.life;
    e.r = opts.r || 0;
    e.r0 = opts.r0 === undefined ? 0 : opts.r0;
    e.r1 = opts.r1 === undefined ? 0 : opts.r1;
    e.color = opts.color || null;
    e.text = opts.text || '';
    e.points = opts.points || null;
    e.from = opts.from || null;
    e.to = opts.to || null;
    e.delay = opts.delay || 0;                         // >0 = 延迟启动（雷霆动画重播用）
    return e;
  }

  const World = {
    EMPTY_INTENT: EMPTY_INTENT,
    makeEffect: makeEffect,
    initEffect: initEffect,

    // ---------- 建局 ----------
    create(opts) {
      opts = opts || {};
      const C = HX.C, B = HX.BAL;
      const seed = opts.seed === undefined ? C.SEED : opts.seed;
      const skinId = opts.skinId || HX.DEFAULT_SKIN;

      const player = HX.Player.init(null, skinId, opts.x, opts.y);
      const cam = new HX.Camera({
        w: C.VIEW_W, h: C.VIEW_H,
        mapW: C.ARENA.w, mapH: C.ARENA.h,
        deadzone: C.CAMERA.deadzone,
        yOffset: C.CAMERA.yOffset      // 纵向构图偏移（立绘向上站立，见 constants 注释）
      });

      const w = {
        seed: seed,
        rng: new HX.RNG(seed),
        skinId: skinId,
        time: 0,
        step: 0,

        player: player,
        enemies: [],
        bullets: [],      // 玩家侧弹幕索引（每步末尾重建，render 直接遍历）
        ebullets: [],     // 敌方侧弹幕索引
        effects: null,    // 直接引用 pools.effect.active（render 会跳过 !alive，无需另建索引）
        pickups: [],      // 护身灵石（阶段 3 接入掉落/拾取）
        hazards: [],      // 地火预警/成型（阶段 3 BOSS）
        fires: [],        // 残火（阶段 3）
        pillars: [],      // 石柱（开局不存在 —— GDD §13.3：BOSS 50% 血时从地下召唤冒出）
        boss: null,       // 阶段 3

        round: 1,         // HUD 显示用（真正的轮次推进由 systems/spawn.js 写 stats.round）
        phase: 'waves',   // 'waves' 小怪轮次 | 'clear' 三轮清完（阶段 3 扩展 'boss' / 'over'）
        outcome: null,    // null | 'win' | 'rage' | 'down'（GDD §15）
        flash: 0,
        flashColor: null,
        cam: cam,

        uidSeq: 1,
        stats: {
          kills: 0, spiderKills: 0, wizardKills: 0, suicides: 0,
          dmgDealt: 0, dmgTaken: 0, shots: 0,
          level: 1, round: 0, clearTime: 0, duration: 0
        },
        pools: {
          bullet: new HX.Pool({ max: B.capacity.bullet, create: HX.Bullet.create, reset: HX.Bullet.init }),
          effect: new HX.Pool({ max: B.capacity.effect, create: makeEffect, reset: initEffect })
        }
      };

      w.effects = w.pools.effect.active;
      w.spawn = HX.Spawn.create(w);
      cam.centerOn(player.pos.x, player.pos.y);
      return w;
    },

    // ---------- 单步推进 ----------
    step(w, dt, intent) {
      if (!w) return w;
      const it = intent || EMPTY_INTENT;

      w.time += dt;
      w.step++;

      this.stepPillars(w, dt);
      HX.Movement.stepPlayer(w, dt, it);
      HX.Spawn.step(w, dt);
      HX.BossSys.step(w, dt);
      HX.EnemyAI.step(w, dt);
      HX.Skill.step(w, dt);            // 普通技能（自动锁敌）
      HX.Skill.stepUlt(w, dt, it);     // 大招（能量满 + R，GDD §10）
      HX.Skill.stepGuard(w, dt);       // 护身技（拾取灵石激活 / 三皮肤各自结算，GDD §9）
      HX.Combat.stepTimers(w, dt);
      HX.Combat.stepProjectiles(w, dt);
      HX.Combat.resolve(w);
      HX.Combat.compact(w);
      this.stepFires(w, dt);           // 地面火痕（踏焰留痕 / 火凤燎原残留）
      this.stepHazards(w, dt);         // 地火预警 → 成型爆发（BOSS 地火，GDD §13.2/§13.4）
      this.stepPickups(w, dt);         // 护身灵石老化
      this.stepEffects(w, dt);
      this.resolveProgress(w);

      if (w.cam) {
        w.cam.follow(w.player.pos.x, w.player.pos.y, dt);
        w.cam.update(dt);
      }

      // 池回收放最后：sweep 后重建索引，render 读到的永远是当前有效集合
      w.pools.bullet.sweep();
      w.pools.effect.sweep();
      this.refreshIndexes(w);

      if (w.outcome) w.stats.duration = w.time;
      return w;
    },

    // ---------- 灵石 / 地火 / 火痕 ----------
    // 掉落护身灵石（GDD §9）：小怪 30%（combat.killEnemy 掷）、BOSS 75/50/25% 节点（boss 系统）
    spawnPickup(w, typeId, x, y) {
      const p = HX.makePickup(typeId, x, y);
      p.phase = w.rng.angle();           // 浮动相位错开，避免整屏灵石同步呼吸
      w.pickups.push(p);
      return p;
    },

    stepPickups(w, dt) {
      const ps = w.pickups;
      let k = 0;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.age += dt;
        if (!p.alive || HX.Pickup.isExpired(p)) continue;   // 被拾取 / 到期 → 移除
        ps[k++] = p;
      }
      ps.length = k;
    },

    // 地面火痕（踏焰留痕 / 火凤燎原残留）：
    //   字段 { pos, r, age, life, tickEvery, tickTimer, tickDmg, source }
    //   每 tickEvery 秒对范围内**敌人与 BOSS**结算一次 tickDmg（source 决定是否积累能量）
    spawnFire(w, x, y, o) {
      o = o || {};
      const f = {
        pos: { x: x, y: y },
        r: o.r || 40,
        age: 0,
        life: o.life === undefined ? 4 : o.life,
        tickEvery: o.tickEvery === undefined ? 0.5 : o.tickEvery,
        tickTimer: 0,
        tickDmg: o.tickDmg === undefined ? 5 : o.tickDmg,
        source: o.source || 'guard',
        alive: true
      };
      w.fires.push(f);
      return f;
    },

    stepFires(w, dt) {
      const fs = w.fires;
      let k = 0;
      for (let i = 0; i < fs.length; i++) {
        const f = fs[i];
        f.age += dt;
        if (f.age >= f.life) continue;                     // 烧完移除
        f.tickTimer -= dt;
        if (f.tickTimer <= 0) {
          f.tickTimer = f.tickEvery;
          HX.Combat.damageArea(w, f.pos.x, f.pos.y, f.r, f.tickDmg, f.source, true);
        }
        fs[k++] = f;
      }
      fs.length = k;
    },

    // 地火预警（BOSS）：{ pos, r, delay, dmg, age, erupted }
    //   age < delay：画预警红圈；跨过 delay 的瞬间对圈内玩家结算一次伤害并转为火痕灼痕
    spawnHazard(w, x, y, o) {
      o = o || {};
      const h = {
        pos: { x: x, y: y },
        r: o.r || 384,
        delay: o.delay === undefined ? 1.0 : o.delay,
        dmg: o.dmg === undefined ? 25 : o.dmg,
        fireLife: o.fireLife === undefined ? 1.2 : o.fireLife,   // 爆发后灼痕存留
        age: 0,
        erupted: false,
        alive: true
      };
      w.hazards.push(h);
      return h;
    },

    stepHazards(w, dt) {
      const hs = w.hazards;
      let k = 0;
      for (let i = 0; i < hs.length; i++) {
        const h = hs[i];
        h.age += dt;
        if (!h.erupted && h.age >= h.delay) {
          h.erupted = true;
          // 爆发：圈内玩家吃一次伤害
          const p = w.player;
          if (p.hp > 0 && HX.Collide.test(h.pos.x, h.pos.y, h.r, p.pos.x, p.pos.y, p.solidR)) {
            HX.Combat.damagePlayer(w, h.dmg, { source: 'groundfire' });
          }
          // 转为灼痕（视觉残留）
          this.spawnFire(w, h.pos.x, h.pos.y, { r: h.r, life: h.fireLife, tickDmg: 0, tickEvery: 999 });
          continue;                                        // 预警环使命结束
        }
        if (!h.erupted) hs[k++] = h;                       // 只保留未爆发的预警环
      }
      hs.length = k;
    },

    refreshIndexes(w) {
      const act = w.pools.bullet.active;
      const pb = w.bullets, eb = w.ebullets;
      pb.length = 0;
      eb.length = 0;
      for (let i = 0; i < act.length; i++) {
        const b = act[i];
        if (!b.alive) continue;
        if (b.side === 'player') pb.push(b); else eb.push(b);
      }
    },

    stepEffects(w, dt) {
      const act = w.pools.effect.active;
      for (let i = 0; i < act.length; i++) {
        const e = act[i];
        if (!e.alive) continue;
        if (e.delay > 0) { e.delay -= dt; continue; }    // 延迟启动：倒计时期间不绘制不老化
        e.age += dt;
        if (e.age >= e.life) { e.alive = false; continue; }
        if (e.vel.x !== 0 || e.vel.y !== 0) {
          e.pos.x += e.vel.x * dt;
          e.pos.y += e.vel.y * dt;
        }
      }
    },

    // ---------- 石柱（GDD §13.3：BOSS 50% 血时从地下召唤冒出） ----------
    // 位置（2026-09-16 设计者指示）：以"召唤时玩家所在的屏幕"（相机视口）四角内缩
    // inset 定位，保证柱子落在屏内可见；结界矩形 = 视口内缩 barrierInset（比柱子更靠外，
    // 把柱子全部包住），存 w.pillarRect —— 玩家与 BOSS 都不能越出（movement/BossSys 约束）。
    // 召唤：建 4 根石柱并进入出土状态（emerging）；由 systems/boss.js 在进入
    // 石柱阶段时调用。
    spawnPillars(w) {
      if (w.pillars.length > 0) return w.pillars;   // 已存在则不重复召唤
      const view = w.cam ? w.cam.viewRect() : { x: 0, y: 0, w: HX.C.VIEW_W, h: HX.C.VIEW_H };
      const ps = HX.C.pillarPositions(view);
      for (let i = 0; i < ps.length; i++) {
        const p = HX.makePillar(i, ps[i].x, ps[i].y);
        p.emerging = true;
        w.pillars.push(p);
        this.fx(w, {
          type: 'ring', x: p.pos.x, y: p.pos.y,
          r0: p.solidR * 0.6, r1: p.solidR * 2.6, life: 0.55,
          color: HX.PAL.pillar.darkEdge
        });
      }
      // 结界矩形（2026-09-16 二次指示「向外推、贴近屏幕、包住石柱」）：
      // 边界 = 视口四角内缩 barrierInset（= 玩家碰撞半径，玩家边缘恰好贴屏边）；
      // 柱锚点距屏边 140、柱面最外 93.8 → 柱子全部落在结界内。
      const bi = HX.C.PILLAR.barrierInset;
      w.pillarRect = {
        x0: view.x + bi, y0: view.y + bi,
        x1: view.x + view.w - bi, y1: view.y + view.h - bi
      };
      return w.pillars;
    },

    // 出土推进：emerge 0→1；出土完成才有碰撞（movement 只推已出土的石柱）
    stepPillars(w, dt) {
      const ps = w.pillars;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (!p.emerging) continue;
        p.emerge = Math.min(1, p.emerge + dt / HX.C.PILLAR.emergeTime);
        if (p.emerge >= 1) {
          p.emerging = false;
          this.fx(w, {
            type: 'spark', x: p.pos.x, y: p.pos.y - 10, r: p.solidR * 0.5,
            life: 0.3, color: HX.PAL.pillar.dark
          });
        }
      }
    },

    // ---------- 生成原语（供 skill / enemy / boss 复用）----------
    spawnEnemy(w, typeId, x, y) {
      const e = HX.makeEnemy(typeId, x, y);
      e.uid = w.uidSeq++;
      e.bornAt = w.time;
      w.enemies.push(e);
      return e;
    },

    // 发一发弹幕；池满时返回 null（调用方无需处理，等价于"这一发被丢弃"）
    fireBullet(w, o) {
      return w.pools.bullet.obtain(o);
    },

    // 生成一个特效
    fx(w, o) {
      return w.pools.effect.obtain(o);
    },

    // ---------- 查询 ----------
    // 一阶预测瞄准（GDD §7.1「自动锁敌」的实现口径）：直射弹幕若只瞄目标"当前位置"，
    // 对任何横向/远离移动的目标几乎必然脱靶（飞剑 0.9s 飞行时间 × 目标 256px/s ≈ 235px 偏差，
    // 而飞剑判定半径只有 4.2px）。按"目标当前速度 × 估算飞行时间"提前一个身位瞄准。
    // 迭代一次已足够（弹速 512 ≫ 目标速度 144~256）。
    aimAt(from, target, speed) {
      const tvx = target.vel ? target.vel.x : 0;
      const tvy = target.vel ? target.vel.y : 0;
      let dx = target.pos.x - from.x, dy = target.pos.y - from.y;
      const d = Math.hypot(dx, dy) || 1;
      const t = d / speed;
      dx = target.pos.x + tvx * t - from.x;
      dy = target.pos.y + tvy * t - from.y;
      const l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l };
    },

    // 最近敌人（GDD §6：普通攻击自动锁敌）。maxDist 为射程上限；exclude 用于多飞剑分配目标；
    // includeBoss=true 时 BOSS 也参与锁敌（普攻/护身技要能打 BOSS；雷链传导不含 BOSS）。
    nearestEnemy(w, x, y, maxDist, exclude, includeBoss) {
      const es = w.enemies;
      const lim2 = (maxDist === undefined || maxDist === Infinity) ? Infinity : maxDist * maxDist;
      let best = null, bestD2 = Infinity;
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if (!e.alive || e.hp <= 0) continue;
        if (exclude && exclude.length) {
          let skip = false;
          for (let k = 0; k < exclude.length; k++) if (exclude[k] === e) { skip = true; break; }
          if (skip) continue;
        }
        const dx = e.pos.x - x, dy = e.pos.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 > lim2) continue;
        if (d2 < bestD2) { bestD2 = d2; best = e; }
      }
      if (includeBoss && w.boss && w.boss.alive && w.boss.hp > 0) {
        const b = w.boss;
        let skip = false;
        if (exclude && exclude.length) {
          for (let k = 0; k < exclude.length; k++) if (exclude[k] === b) { skip = true; break; }
        }
        if (!skip) {
          const dx = b.pos.x - x, dy = b.pos.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= lim2 && d2 < bestD2) { bestD2 = d2; best = b; }
        }
      }
      return best;
    },

    // 按距离升序取前 n 个敌人（御剑 1→2→3 把飞剑各锁一个目标）
    nearestEnemies(w, x, y, n, maxDist, includeBoss) {
      const out = [], used = [];
      for (let k = 0; k < n; k++) {
        const e = this.nearestEnemy(w, x, y, maxDist, used, includeBoss);
        if (!e) break;
        out.push(e); used.push(e);
      }
      return out;
    },

    aliveEnemyCount(w) {
      const es = w.enemies;
      let n = 0;
      for (let i = 0; i < es.length; i++) if (es[i].alive && es[i].hp > 0) n++;
      return n;
    },

    // ---------- 关卡推进 ----------
    // 胜负判定（GDD §15）。阶段 2 只落地「玩家血量归零 → 失败（down）」；
    // 胜利（石柱全燃前击杀 BOSS）与狂暴失败属阶段 3。
    resolveProgress(w) {
      if (w.outcome) return;
      const p = w.player;
      if (p.hp <= 0) {
        w.outcome = 'down';
        w.phase = 'over';
        w.flash = 0.45;
        w.flashColor = '#ff2b2b';
        this.fx(w, { type: 'ring', x: p.pos.x, y: p.pos.y, r0: 13, r1: 151, life: 0.65, color: '#ff6b5d' });
        if (HX.Audio) HX.Audio.play('lose');
      }
    }
  };

  HX.World = World;
})();
