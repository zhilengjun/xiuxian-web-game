// 普通技能（GDD §6「普通攻击：自动攻击最近敌人」/ §8 三皮肤 1~5 级升级表）。
// 本文件同时承载：普通技能（step）/ 大招（stepUlt，GDD §10）/ 护身技与灵石（stepGuard，GDD §9）。
//
// 三皮肤的模式差异**全部由 config/skins.js 驱动**（本文件不写死任何数值）：
//   御剑术（§8.1）—— 高速远程飞剑，自动锁敌；数量 1→2→3 把，多把各锁一个目标
//   离火术（§8.2）—— 多向火球（6→8 向），命中后范围爆炸
//   雷链术（§8.3）—— 单发，命中后向附近敌人传导、伤害递减（传导数量不限）
//
// 射程落地方式：弹幕存活时间 = 射程 / 弹速，飞完即灭（无需逐帧累计距离）。
(function () {
  const HX = window.HX || (window.HX = {});
  const TAU = Math.PI * 2;

  const Skill = {
    // ==================== 普通技能 ====================
    step(w, dt) {
      const p = w.player;
      if (p.hp <= 0) return;
      this.stepUltEmit(w, dt);                       // 万剑归宗分批出剑（先于普攻计时推进）
      this.stepThunderEmit(w, dt);                   // 雷霆万钧分批落雷

      if (p.atkTimer > 0) p.atkTimer = Math.max(0, p.atkTimer - dt);
      if (p.atkTimer > 0) return;

      const skin = HX.SKINS[p.skinId] || HX.SKINS[HX.DEFAULT_SKIN];
      const lvDef = HX.skillAt(p.skinId, p.level);

      // 自动锁敌：射程内没有目标就不开火（不空放、不浪费弹幕）；BOSS 也参与锁敌
      const target = HX.World.nearestEnemy(w, p.pos.x, p.pos.y, lvDef.range, null, true);
      if (!target) return;

      p.atkTimer = 1 / lvDef.rate;
      p.atkIndex++;

      if (skin.normal.chain) this.fireChain(w, p, skin, lvDef, target);
      else if (skin.normal.explode) this.fireFan(w, p, skin, lvDef, target);
      else this.fireSwords(w, p, skin, lvDef, target);

      if (HX.Audio) {
        HX.Audio.play(skin.normal.chain ? 'thunder' : (skin.normal.explode ? 'fire' : 'sword'));
      }
    },

    shotLife(range, speed) { return speed > 0 ? range / speed : 1; },

    // 御剑术：count 把飞剑，各自锁最近的目标（不足则都打同一个）
    fireSwords(w, p, skin, lvDef, target) {
      const speed = skin.normal.speed;
      const life = this.shotLife(lvDef.range, speed);
      const n = lvDef.count;
      const targets = HX.World.nearestEnemies(w, p.pos.x, p.pos.y, n, lvDef.range, true);
      if (targets.length === 0) targets.push(target);
      // 飞剑尺寸（2026-09-15 设计者指示：= 原玩家弹幕的 1/2）；未配置时回退通用 PBULLET
      const sz = skin.normal.bullet || {};
      const vr = sz.visualR, sr = sz.solidR;

      for (let i = 0; i < n; i++) {
        const t = targets[i % targets.length];
        const dir = HX.World.aimAt(p.pos, t, speed);      // 一阶预测瞄准（GDD §7.1 自动锁敌）
        const ang = Math.atan2(dir.y, dir.x);
        const ox = p.pos.x + Math.cos(ang) * p.visualR * 0.5;
        const oy = p.pos.y + Math.sin(ang) * p.visualR * 0.5;
        HX.World.fireBullet(w, {
          side: 'player', source: 'normal', style: 'sword',
          x: ox, y: oy,
          vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
          dmg: lvDef.dmg, life: life, visualR: vr, solidR: sr,
          // 轻度追踪（暂定 2.5 rad/s）：目标在飞剑飞行中变速/变向时仍能咬住 ——
          // 这才是 §7.1「自动锁敌」的完整语义；纯直线对"风筝中急停"的目标必脱靶
          homing: { turnRate: 2.5, target: t }
        });
        w.stats.shots++;
      }
    },

    // 离火术：以「指向最近敌人」为基准方向，均匀铺 count 个方向（每个方向都带范围爆炸）。
    // size = 火球大小倍率（GDD §8.2，2026-09-16 设计者调参 1x~2x）：外观与判定半径同倍缩放，
    //       爆炸半径（lvDef.radius）不变 —— 大小只影响弹体本身
    fireFan(w, p, skin, lvDef, target) {
      const speed = skin.normal.speed;
      const life = this.shotLife(lvDef.range, speed);
      const base = Math.atan2(target.pos.y - p.pos.y, target.pos.x - p.pos.x);
      const n = lvDef.count;
      const mul = lvDef.size || 1.0;
      const vr = HX.C.PBULLET.visualR * mul;
      const sr = HX.C.PBULLET.solidR * mul;

      for (let i = 0; i < n; i++) {
        const a = base + (TAU / n) * i;
        HX.World.fireBullet(w, {
          side: 'player', source: 'normal', style: 'fire',
          x: p.pos.x, y: p.pos.y,
          vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
          dmg: lvDef.dmg, life: life, visualR: vr, solidR: sr,
          aoe: lvDef.radius, aoeDmg: lvDef.dmg
        });
        w.stats.shots++;
      }
    },

    // 雷链术：单发；命中后由 combat.chain 负责传导（范围/衰减取本皮肤的等级表）
    fireChain(w, p, skin, lvDef, target) {
      const speed = skin.normal.speed;
      const life = this.shotLife(lvDef.range, speed);
      const ang = Math.atan2(target.pos.y - p.pos.y, target.pos.x - p.pos.x);
      HX.World.fireBullet(w, {
        side: 'player', source: 'normal', style: 'thunder',
        x: p.pos.x, y: p.pos.y,
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        dmg: lvDef.dmg, life: life,
        chain: { range: lvDef.chainRange, decay: lvDef.decay }
      });
      w.stats.shots++;
    },

    // ==================== 大招（GDD §10：能量满 100 + 冷却好，按 R） ====================
    // 大招归属**法器部件**（GDD v1.19 §7.4）：技能数值取 SKINS[equip.aura].ult
    stepUlt(w, dt, it) {
      const p = w.player;
      if (p.hp <= 0 || !it || !it.ult) return;
      if (p.energy < HX.BAL.energy.max) return;    // 仅能量门控（2026-09-16：大招 CD 全部移除）

      const auraSys = p.equip ? p.equip.aura : p.skinId;
      const skin = HX.SKINS[auraSys] || HX.SKINS[HX.DEFAULT_SKIN];
      const u = skin.ult;
      p.energy = 0;
      p.ultReady = false;

      if (auraSys === 'nanming') this.ultPhoenix(w, p, u);
      else if (auraSys === 'jiuxiao') this.stepThunder(w, p, u);
      else this.ultSwords(w, p, u);

      if (HX.Audio) HX.Audio.play('ult_' + auraSys);
      HX.World.fx(w, {
        type: 'ring', x: p.pos.x, y: p.pos.y, r0: 20, r1: 300, life: 0.5,
        color: HX.PAL.skins[auraSys] ? HX.PAL.skins[auraSys].accent : HX.PAL.fx.white
      });
    },

    // 万剑归宗 v2（2026-09-16 设计者指示）：20 把飞剑**同时现身**于角色周围 200px 内随机位置，
    // 悬停 0.5s 后每 0.1s 飞出 1 把；飞行弧线更大（初始偏移 ±1.2rad + 追踪）、速度 = 原弹速 ×0.5；
    // 有敌人（BOSS 优先/最近）→ 弧线锁定，范围内没有敌人 → 沿施放朝向直飞。
    // 现身的剑由 render 层绘制（player.ultSwordQueue.swords，drawUltSwords）。
    ultSwords(w, p, u) {
      const f = p.facing;
      const fl = Math.hypot(f.x, f.y) || 1;
      const swords = [];
      for (let i = 0; i < u.count; i++) {
        const ang = w.rng.angle();
        const dist = Math.sqrt(w.rng.next()) * u.spawnR;   // 200px 半径内面积均匀
        swords.push({
          x: p.pos.x + Math.cos(ang) * dist,               // 世界坐标（现身处悬停，不跟随玩家）
          y: p.pos.y + Math.sin(ang) * dist,
          launchAt: u.hover + i * u.interval,              // 相对施放时刻的起飞时间
          launched: false
        });
      }
      p.ultSwordQueue = {
        castAt: w.time,
        baseAng: Math.atan2(f.y / fl, f.x / fl),           // 无锁目标时的直飞方向 = 施放朝向
        swords: swords,
        left: u.count
      };
    },

    // 分批出剑推进：悬停期过后按 interval 逐把起飞（固定步长驱动，确定性不变）
    stepUltEmit(w, dt) {
      const p = w.player;
      const q = p.ultSwordQueue;
      if (!q || q.left <= 0) return;
      const u = HX.SKINS[p.equip ? p.equip.aura : p.skinId].ult;
      for (let i = 0; i < q.swords.length; i++) {
        const sw = q.swords[i];
        if (sw.launched) continue;
        if (w.time - q.castAt < sw.launchAt) continue;     // 还在悬停
        sw.launched = true;
        q.left--;
        this.emitUltSword(w, p, q, u, sw);
      }
      if (q.left <= 0) p.ultSwordQueue = null;             // 全部起飞 → 清队列
    },

    // 单把大招飞剑：有目标 → 预瞄 + 大角度偏移（更大弧线切入）+ 追踪锁定，速度 ×speedMul；
    // 无目标 → 沿施放朝向直飞（不锁）
    emitUltSword(w, p, q, u, sw) {
      const speed = HX.C.BULLET_SPEED * (u.speedMul || 1);
      // 锁定优先级：BOSS 存活优先，其次射程内最近敌人；都没有 → 直飞
      let target = null;
      if (w.boss && w.boss.alive && w.boss.hp > 0) target = w.boss;
      else target = HX.World.nearestEnemy(w, p.pos.x, p.pos.y, 3072, null, false);

      let ang;
      if (target) {
        const dir = HX.World.aimAt(p.pos, target, speed);
        // 初始角度偏移 ±1.2 rad（种子 RNG）→ 大弧线切入（配合追踪与半速，转弯更明显）
        ang = Math.atan2(dir.y, dir.x) + (w.rng.next() - 0.5) * 2.4;
        HX.World.fireBullet(w, {
          side: 'player', source: 'ult', style: 'sword',
          x: sw.x, y: sw.y,                                // 从悬停位置起飞
          vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
          dmg: u.dmg, life: this.shotLife(3072, speed),
          homing: { turnRate: u.turnRate || 2.5, target: target },
          pierce: u.pierce || 0                            // 穿透（对群收割，2026-09-16）
        });
      } else {
        ang = q.baseAng + (w.rng.next() - 0.5) * 0.25;
        HX.World.fireBullet(w, {
          side: 'player', source: 'ult', style: 'sword',
          x: sw.x, y: sw.y,
          vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
          dmg: u.dmg, life: this.shotLife(3072, speed),
          pierce: u.pierce || 0
        });
      }
      w.stats.shots++;
    },

    // 火凤燎原（2026-09-16 设计者指示 v2）：一只火凤凰从屏幕一侧飞入、水平飞向另一侧，
    // 3 秒横贯屏幕（左进右出 / 右进左出，随机）；768×768 碰撞盒，接触的敌人每 0.2s 吃 100 伤害。
    // 实现：一颗特殊弹幕（style 'phoenix'），位移与 tick 结算都在 combat（出屏不判死，靠 life 收尾）。
    // 起飞高度 = 施放时玩家的 Y（保留玩家对齐走位的操作空间）。
    ultPhoenix(w, p, u) {
      const view = w.cam.viewRect();
      const speed = view.w / u.crossTime;               // 1920 / 3 = 640 px/s
      const dir = w.rng.next() < 0.5 ? 1 : -1;          // 方向随机（种子 RNG，确定性）
      const half = u.size / 2;
      const x = dir > 0 ? view.x - half : view.x + view.w + half;   // 完全在屏外起飞
      const life = (view.w + u.size * 2) / speed;       // 飞到对侧完全出屏 + 余量
      HX.World.fireBullet(w, {
        side: 'player', source: 'ult', style: 'phoenix',
        x: x, y: p.pos.y,
        vx: dir * speed, vy: 0,
        visualR: half, solidR: half,
        dmg: u.dmg, life: life,
        tickEvery: u.tickEvery, tickDmg: u.dmg
      });
      w.stats.shots++;
    },

    // 雷霆万钧（2026-09-16 设计者指示 v3）：锁定**屏幕范围内**的目标（BOSS 优先），
    // 20 道雷霆**每 0.2s 一道**落在目标当前位置（±50px 随机，不正对），每道 100 伤；
    // **同一目标每次施放最多吃 10 道**；每道动画连播两次（第二次延迟 = 第一次时长）。
    // 屏内没有任何敌人（空场）→ 雷落在最后已知目标位置（初始 = 玩家位置，保底不空指针）。
    stepThunder(w, p, u) {
      p.thunderQueue = {
        left: u.count,
        timer: 0,                                        // 首道在下一帧落下
        hits: {},                                        // uid → 已吃道数（本次施放）
        lastX: p.pos.x, lastY: p.pos.y                   // 无目标时的落点兜底
      };
    },

    // 分批落雷推进：每 interval 秒一道（固定步长驱动，确定性不变）
    stepThunderEmit(w, dt) {
      const p = w.player;
      const q = p.thunderQueue;
      if (!q || q.left <= 0) return;
      const u = HX.SKINS[p.equip ? p.equip.aura : p.skinId].ult;
      q.timer -= dt;
      while (q.timer <= 0 && q.left > 0) {
        q.left--;
        q.timer += u.interval;
        this.emitThunder(w, p, q, u);
      }
      if (q.left <= 0) p.thunderQueue = null;
    },

    // 雷霆目标候选（2026-09-16 设计者指示 v3.1）：BOSS（存活）+ 视口内敌人。
    // **优先选「未吃满 maxHits」的最近目标** —— 满员的目标让给其他人；全部满员
    // （= 范围内没有其他目标）→ 退回最优候选并解除上限，雷霆照打不浪费。
    thunderPick(w, p, q, u) {
      const boss = (w.boss && w.boss.alive && w.boss.hp > 0) ? w.boss : null;
      const view = w.cam.viewRect();
      const es = w.enemies;
      let bestU = null, bestUD2 = Infinity;            // 最近的"未满员"敌人
      let bestA = null, bestAD2 = Infinity;            // 最近的敌人（无论满员）
      for (let k = 0; k < es.length; k++) {
        const e = es[k];
        if (!e.alive || e.hp <= 0) continue;
        if (e.pos.x < view.x || e.pos.x > view.x + view.w ||
            e.pos.y < view.y || e.pos.y > view.y + view.h) continue;
        const d2 = (e.pos.x - p.pos.x) ** 2 + (e.pos.y - p.pos.y) ** 2;
        if (d2 < bestAD2) { bestAD2 = d2; bestA = e; }
        if ((q.hits[e.uid] || 0) < u.maxHits && d2 < bestUD2) { bestUD2 = d2; bestU = e; }
      }
      if (boss && (q.hits[boss.uid] || 0) < u.maxHits) return { target: boss, bypass: false };
      if (bestU) return { target: bestU, bypass: false };
      // 全部满员 → 范围内没有其他目标，解除上限（BOSS 优先）
      if (boss) return { target: boss, bypass: true };
      if (bestA) return { target: bestA, bypass: true };
      return { target: null, bypass: false };
    },

    // 单道雷霆：落点 = 目标当前位置 ± jitterR 随机（面积均匀）；命中半径内敌人与 BOSS 结算
    // （每目标本次施放累计 ≤ maxHits 道，bypass 时对选定目标解除）；动画连播两次（第二份延迟 life）
    emitThunder(w, p, q, u) {
      const pick = this.thunderPick(w, p, q, u);
      const t = pick.target;
      if (t) { q.lastX = t.pos.x; q.lastY = t.pos.y; }
      const ang = w.rng.angle();
      const dist = Math.sqrt(w.rng.next()) * u.jitterR;
      const x = q.lastX + Math.cos(ang) * dist;
      const y = q.lastY + Math.sin(ang) * dist;

      // 表现：电弧 + 落点环 × 2（第二份延迟启动 = 连续重播一次）
      for (let rep = 0; rep < 2; rep++) {
        const delay = rep === 0 ? 0 : 0.25;              // 0.25 = 第一份动画时长
        HX.World.fx(w, {
          type: 'arc', x: x, y: y,
          points: [{ x: x, y: y - 560 }, { x: x, y: y }],
          life: 0.25, color: HX.PAL.skins.jiuxiao.accent, delay: delay
        });
        HX.World.fx(w, {
          type: 'ring', x: x, y: y, r0: 8, r1: u.strikeR * 1.6, life: 0.3,
          color: HX.PAL.skins.jiuxiao.accent, delay: delay
        });
      }

      // 音效：每道雷霆一次（2026-09-16 设计者指示，此前只在施放时播一次）
      if (HX.Audio) HX.Audio.play('thunder');

      // 伤害：命中半径内的敌人与 BOSS，各受 100；同一目标本次施放最多 maxHits 道
      //（bypass = 范围内没有其他目标，对选定目标解除上限）
      const capOk = function (e) {
        return (q.hits[e.uid] || 0) < u.maxHits || (pick.bypass && e === t);
      };
      const es = w.enemies;
      for (let k = 0; k < es.length; k++) {
        const e = es[k];
        if (!e.alive || e.hp <= 0) continue;
        if (!HX.Collide.test(x, y, u.strikeR, e.pos.x, e.pos.y, e.solidR)) continue;
        if (!capOk(e)) continue;
        q.hits[e.uid] = (q.hits[e.uid] || 0) + 1;
        HX.Combat.damageEnemy(w, e, u.dmg, { source: 'ult' });
      }
      const bs = w.boss;
      if (bs && bs.alive && bs.hp > 0 &&
          HX.Collide.test(x, y, u.strikeR, bs.pos.x, bs.pos.y, bs.solidR) && capOk(bs)) {
        q.hits[bs.uid] = (q.hits[bs.uid] || 0) + 1;
        HX.Combat.damageBoss(w, u.dmg, { source: 'ult' });
      }
      w.stats.shots++;
    },

    // ==================== 护身技与灵石（GDD §9） ====================
    // 护身技归属**法袍部件**（GDD v1.19 §7.3）：技能数值取 SKINS[equip.cloth].guard
    stepGuard(w, dt) {
      const p = w.player;
      if (p.hp <= 0) return;
      const clothSys = p.equip ? p.equip.cloth : p.skinId;
      const skin = HX.SKINS[clothSys] || HX.SKINS[HX.DEFAULT_SKIN];
      const g = skin.guard;

      // 1) 拾取（一步最多一颗）
      const ps = w.pickups;
      for (let i = 0; i < ps.length; i++) {
        const pk = ps[i];
        if (!pk.alive) continue;
        if (!HX.Pickup.inRange(pk, p.pos.x, p.pos.y)) continue;
        const wasActive = p.guardTimer > 0;
        p.guardTimer = g.duration;                       // 刷新（不叠加超过 duration）
        pk.alive = false;                                // 灵石消耗
        if (HX.Audio) HX.Audio.play('guard');
        HX.World.fx(w, {
          type: 'ring', x: p.pos.x, y: p.pos.y, r0: 10, r1: 160, life: 0.4,
          color: HX.PAL.pickup.ring
        });
        HX.World.fx(w, {
          type: 'text', x: p.pos.x, y: p.pos.y - p.visualR,
          text: wasActive ? '刷新' : g.name, life: 0.8, color: HX.PAL.pickup.core
        });
        break;
      }

      // 2) 护身技生效中：按法袍部件结算
      if (p.guardTimer <= 0) return;

      if (clothSys === 'yujian') this.guardOrbit(w, p, g, dt);
      else if (clothSys === 'nanming') this.guardTrail(w, p, g, dt);
      else this.guardPool(w, p, g, dt);
    },

    // 御剑 · 本命法剑：3 剑绕身 1 秒/圈；接触伤害 8，同一目标每个环绕周期最多吃一次（"按圈结算"）。
    // orbitR 195（2026-09-16 设计者指示：范围变大 3 倍）后，命中判定从"剑尖圆环带"
    // 改为「剑巡飞圆盘」= 轨道半径 + 剑触及：圆盘内目标每圈各吃一次 ——
    // 否则贴脸怪（距玩家 ~44）落在环带内侧会重演"没有伤害"BUG（半径 65 时代修复的教训）。
    guardOrbit(w, p, g, dt) {
      p.guardAngle = (p.guardAngle || 0) + (TAU / g.orbitPeriod) * dt;
      const reach = g.orbitR + 10;                     // 剑巡飞圆盘半径（10 = 剑判定半径）
      const es = HX.World.nearestEnemies(w, p.pos.x, p.pos.y, 16, reach, true);
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if ((e.guardCd || 0) > 0) continue;
        if (!HX.Collide.test(p.pos.x, p.pos.y, reach, e.pos.x, e.pos.y, e.solidR)) continue;
        if (e.kind === 'boss') HX.Combat.damageBoss(w, g.dmg, { source: 'guard' });
        else HX.Combat.damageEnemy(w, e, g.dmg, { source: 'guard' });
        e.guardCd = g.orbitPeriod;                     // 按圈结算：一圈最多一次
        // 命中表现：在目标身上打火花（视觉 = 剑砍过去）
        HX.World.fx(w, {
          type: 'spark', x: e.pos.x, y: e.pos.y, r: 6, life: 0.2, color: HX.PAL.skins.yujian.accent
        });
      }
    },

    // 南明 · 踏焰留痕：移动时落火痕（痕迹 5s，每 0.5s 对范围内敌人 5 伤）
    guardTrail(w, p, g, dt) {
      p.trailTimer = (p.trailTimer === undefined ? 0 : p.trailTimer) - dt;
      const moving = Math.hypot(p.vel.x, p.vel.y) > 1;
      if (moving && p.trailTimer <= 0) {
        p.trailTimer = g.dropEvery;
        HX.World.spawnFire(w, p.pos.x, p.pos.y, {
          r: g.trailR, life: g.trailLife,
          tickEvery: g.tickEvery, tickDmg: g.tickDmg, source: 'guard'
        });
      }
    },

    // 九霄 · 雷池：每 1 秒对半径 512 内的敌人造成一次伤害，50% 几率麻痹 1 秒
    //（2026-09-16 设计者调整：半径 768→512、每 2s 纯麻痹 → 每 1s 伤害 + 50% 概率麻痹）
    guardPool(w, p, g, dt) {
      p.poolTimer = (p.poolTimer === undefined ? g.tickEvery : p.poolTimer) - dt;
      if (p.poolTimer > 0) return;
      p.poolTimer = g.tickEvery;
      HX.World.fx(w, {
        type: 'ring', x: p.pos.x, y: p.pos.y, r0: g.radius * 0.92, r1: g.radius, life: 0.4,
        color: HX.PAL.skins.jiuxiao.accent
      });
      // ⚠ includeBoss 必须为 true：曾用 false 导致 BOSS 完全不进列表（雷池对 BOSS 无伤害的根因）
      const es = HX.World.nearestEnemies(w, p.pos.x, p.pos.y, 32, g.radius, true);
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if (!HX.Collide.test(p.pos.x, p.pos.y, g.radius, e.pos.x, e.pos.y, e.solidR)) continue;
        if (e.kind === 'boss') HX.Combat.damageBoss(w, g.dmg, { source: 'guard' });
        else HX.Combat.damageEnemy(w, e, g.dmg, { source: 'guard' });
        if (e.kind !== 'boss' && w.rng.chance(g.paralyzeChance)) {
          e.paraTimer = Math.max(e.paraTimer || 0, g.paralyze);
          HX.World.fx(w, { type: 'spark', x: e.pos.x, y: e.pos.y, r: 8, life: 0.25, color: HX.PAL.skins.jiuxiao.accent });
        }
      }
    }
  };

  HX.Skill = Skill;
})();
