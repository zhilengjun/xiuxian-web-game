// BOSS 系统（GDD §13）：吞天老祖的登场、阶段机、弹幕、召唤、石柱点燃、狂暴与胜负判定。
//
// 阶段机（config/boss.js PHASE）：
//   登场前（w.phase === 'clear'，三轮小怪清完）→ 等 WAVES.afterLastRound → 吞天老祖登场
//   NORMAL（100%~65%）→ 每 4s 轮换 环形(留缝)/扇形/地火；召唤小怪 5s 首波、每 12s 一波 3~5 只
//   PILLAR（≤65% 触发）→ 召唤施法 2s：原地不动 + 无敌 + 发光 + 相机 100px 随机震动；
//                    4 石柱同步从地下升起（单轴缩放 2s）；施法毕追加追踪弹（点燃石柱）、
//                    召唤降频（每 15s，2~4 只）；4 柱全燃 → 狂暴
//   ENRAGE → 无敌、体型 1.5x、屏幕红闪 + 震动、地火倾泻、1.5s 演出后判负（rage）
//   胜利：4 柱全燃**前**把 BOSS 血量打到 0 → 判胜（win）
//
// 输入：不读 intent（BOSS 行为完全自主）；不引用 render（AGENTS §5）。
(function () {
  const HX = window.HX || (window.HX = {});
  const TAU = Math.PI * 2;

  const BossSys = {
    step(w, dt) {
      if (w.outcome) return;
      const C = HX.C;

      // ---- 登场前：三轮小怪清完 → 等 afterLastRound → 吞天老祖登场 ----
      if (w.phase === 'clear') {
        w.bossDelay = (w.bossDelay === undefined ? HX.WAVES.afterLastRound : w.bossDelay) - dt;
        if (w.bossDelay <= 0) this.spawnBoss(w);
        return;
      }
      if (w.phase !== 'boss') return;                  // 小怪阶段还没有 BOSS

      const b = w.boss;
      // BOSS 被击杀 → 胜利（GDD §15：4 柱全燃**前**击杀；狂暴后 BOSS 无敌不存在"被击杀"）。
      // ⚠ 判据用 hp<=0 而不是 alive —— damageBoss 不翻转 alive（它只是血量归零的标记位）。
      if (!b || b.hp <= 0) {
        w.outcome = 'win';
        w.phase = 'over';
        if (HX.Audio) HX.Audio.play('win');
        return;
      }
      if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt);
      if (b.guardCd > 0) b.guardCd = Math.max(0, b.guardCd - dt);    // 环绕飞剑按圈结算
      if (b.contactCd > 0) b.contactCd = Math.max(0, b.contactCd - dt);  // 接触伤害 CD（movement 结算用）
      b.phaseTime += dt;

      // ---- 阶段推进：NORMAL → PILLAR（≤65% 血，2026-09-16 设计者指示） ----
      if (b.phase === HX.BOSS.PHASE.NORMAL && b.hp <= b.maxHp * HX.BOSS.pillarPhase.triggerAt) {
        b.phase = HX.BOSS.PHASE.PILLAR;
        b.phaseTime = 0;
        // 召唤施法（2026-09-16 设计者指示加强）：原地不动 + 无敌 + 发光，持续 cast.time 秒；
        // 石柱同步开始上升（emergeTime = cast.time）；相机 100px 随机震动同秒数，结束还原。
        const cast = HX.BOSS.pillarPhase.cast;
        b.castTimer = cast.time;
        b.casting = true;
        b.invuln = true;
        HX.World.spawnPillars(w);                      // 石柱从地下升起（与施法同步）
        w.flash = 0.35;
        w.flashColor = '#b04bff';
        if (w.cam) w.cam.shake(cast.ampPx, cast.time, true); // 全程满幅 100px 随机震动 2s，结束瞬间还原
        if (HX.Audio) HX.Audio.play('pillarLit');
      }

      // ---- 石柱点燃推进（点燃延迟由追踪弹命中时写入 pendingLitAt） ----
      const ps = w.pillars;
      let litCount = 0;
      for (let i = 0; i < ps.length; i++) {
        const pl = ps[i];
        if (!pl.lit && pl.pendingLitAt !== undefined && w.time >= pl.pendingLitAt) {
          pl.lit = true;
          pl.litAt = w.time;
          HX.World.fx(w, { type: 'ring', x: pl.pos.x, y: pl.pos.y, r0: pl.solidR, r1: pl.solidR * 3, life: 0.5, color: HX.PAL.pillar.lit });
          if (HX.Audio) HX.Audio.play('pillarLit');
        }
        if (pl.lit) litCount++;
      }

      // ---- 4 柱全燃 → 狂暴（一次性切换） ----
      if (b.phase === HX.BOSS.PHASE.PILLAR && litCount >= HX.BOSS.pillarPhase.pillarCount) {
        this.enterEnrage(w, b);
      }

      // ---- 召唤施法中：原地不动，不放弹幕不召唤；石柱点燃推进不受影响（见上） ----
      if (b.casting) {
        b.castTimer -= dt;
        if (b.castTimer <= 0) { b.casting = false; b.invuln = false; }
        return;
      }

      // ---- 狂暴演出：地火倾泻 + 倒计时判负 ----
      if (b.phase === HX.BOSS.PHASE.ENRAGE) {
        const E = HX.BOSS.enrage;
        if (!b.enrageFired) {
          b.enrageFired = true;
          // 地面大量地火预警：几乎全屏（GDD §13.4），落点用种子 RNG 均匀铺。
          // 玩家被石柱结界围住（2026-09-16）→ 落点限制在结界矩形内，否则全打在玩家够不到的地方
          const pr = w.pillarRect;
          const cx = pr ? (pr.x0 + pr.x1) / 2 : C.ARENA.w / 2;
          const cy = pr ? (pr.y0 + pr.y1) / 2 : C.ARENA.h / 2;
          const rx = pr ? (pr.x1 - pr.x0) / 2 : C.ARENA.w / 2;
          const ry = pr ? (pr.y1 - pr.y0) / 2 : C.ARENA.h / 2;
          for (let i = 0; i < E.groundfire.count; i++) {
            const ang = w.rng.angle();
            const dist = Math.sqrt(w.rng.next());
            let x = cx + Math.cos(ang) * dist * rx;
            let y = cy + Math.sin(ang) * dist * ry;
            x = Math.max(100, Math.min(C.ARENA.w - 100, x));
            y = Math.max(100, Math.min(C.ARENA.h - 100, y));
            HX.World.spawnHazard(w, x, y, {
              r: E.groundfire.r, delay: E.groundfire.delay, dmg: E.groundfire.dmg,
              fireLife: E.groundfire.duration
            });
          }
        }
        b.enrageTimer -= dt;
        if (b.enrageTimer <= 0) {
          // 演出结束：人间倾覆（GDD §15）
          w.outcome = 'rage';
          w.phase = 'over';
          w.flash = 0.6;
          w.flashColor = '#ff2b2b';
          if (HX.Audio) HX.Audio.play('lose');
        }
        return;                                        // 狂暴期间不再放其他弹幕
      }

      // ---- 常规弹幕（NORMAL：三选一轮换；PILLAR：轮换 + 追踪弹） ----
      // （接触伤害在 movement.pushPlayerOutOfSolids 里随推挤结算 —— 见该处注释）
      if (b.atkTimer > 0) {
        b.atkTimer -= dt;
      } else {
        b.atkTimer = HX.BOSS.normal.interval;
        const rot = HX.BOSS.normal.rotation;
        const kind = rot[b.rotationIndex % rot.length];
        b.rotationIndex = (b.rotationIndex + 1) % rot.length;
        this.castNormal(w, b, HX.BOSS.normal[kind]);
      }

      if (b.phase === HX.BOSS.PHASE.PILLAR) {
        b.trackCd -= dt;
        if (b.trackCd <= 0) {
          b.trackCd = HX.BOSS.pillarPhase.tracking.cd;
          this.castTracking(w, b, HX.BOSS.pillarPhase.tracking);
        }
      }

      // ---- 召唤小怪（GDD §13.2：普通 5s 首波/每 12s 3~5 只；§13.3：石柱阶段每 15s 2~4 只） ----
      // 受 BOSS.summonCap（15）同屏上限约束：满了本次跳过，下个周期再试
      b.summonTimer -= dt;
      if (b.summonTimer <= 0) {
        const conf = b.phase === HX.BOSS.PHASE.PILLAR ? HX.BOSS.pillarPhase.summon : HX.BOSS.normal.summon;
        b.summonTimer = conf.every;
        let n = w.rng.int(conf.countMin, conf.countMax);
        n = Math.max(0, Math.min(n, HX.BOSS.summonCap - HX.World.aliveEnemyCount(w)));
        for (let i = 0; i < n; i++) {
          const typeId = conf.mix[w.rng.int(0, conf.mix.length - 1)];
          const pos = HX.Spawn.pickPosition(w);
          HX.World.spawnEnemy(w, typeId, pos.x, pos.y);
        }
      }

      // ---- BOSS 缓慢逼近玩家（config.behavior.chase） ----
      const p = w.player;
      if (HX.BOSS.behavior.chase && p.hp > 0) {
        const dx = p.pos.x - b.pos.x, dy = p.pos.y - b.pos.y;
        const d = Math.hypot(dx, dy) || 1;
        b.vel.x = (dx / d) * b.speed;
        b.vel.y = (dy / d) * b.speed;
        b.pos.x += b.vel.x * dt;
        b.pos.y += b.vel.y * dt;
        b.facing.x = dx / d;
        b.facing.y = dy / d;
        if (Math.abs(dx) > 1e-9) b.side = dx > 0 ? 1 : -1;   // 视觉朝向只做左右（GDD §3.3）
        // BOSS 不越界（地图 + 石柱结界矩形，若已在结界内则被围住）
        HX.Movement.clampToArena(w, b);
        HX.Movement.clampBossToPillarRect(w, b);
      }
    },

    // ---------- 登场 ----------
    spawnBoss(w) {
      const C = HX.C, p = w.player;
      // 登场位置（GDD 未给，暂定）：从玩家指向场地中心的反向 1536px（6 身位）处，夹取到界内。
      // ⚠ 玩家恰在场地中心时方向向量退化为 (0,0) —— 若不兜底，BOSS 会刷在玩家身上
      //   （实测：接触伤害连锁触发、召唤/狂暴用例全被污染）。退化为竖直向下（屏幕外）。
      let dx = C.ARENA.w * 0.5 - p.pos.x;
      let dy = C.ARENA.h * 0.5 - p.pos.y;
      let l = Math.hypot(dx, dy);
      if (l < 1e-6) { dx = 0; dy = 1; l = 1; }
      dx /= l; dy /= l;
      let x = p.pos.x - dx * 1536;
      let y = p.pos.y - dy * 1536;
      x = Math.max(300, Math.min(C.ARENA.w - 300, x));
      y = Math.max(300, Math.min(C.ARENA.h - 300, y));

      const b = HX.makeBoss(x, y);
      b.uid = w.uidSeq++;
      b.bornAt = w.time;
      w.boss = b;
      w.phase = 'boss';

      // 登场演出：屏幕紫闪 + 震动 + 名字飘字
      w.flash = 0.5;
      w.flashColor = '#b04bff';
      w.cam.shake(14, 0.8);
      HX.World.fx(w, {
        type: 'text', x: b.pos.x, y: b.pos.y - b.visualR * 1.1,
        text: HX.BOSS.name, life: 2.0, color: HX.PAL.boss.accent
      });
      if (HX.Audio) HX.Audio.play('bossSpawn');
      return b;
    },

    // ---------- 普通阶段三弹幕 ----------
    castNormal(w, b, pat) {
      const p = w.player;
      const muzzle = b.visualR * 0.7;

      if (pat.id === 'groundfire') {
        // 地火：3 个红圈围绕玩家落点（GDD §13.2），延迟 1s 爆发
        for (let i = 0; i < pat.count; i++) {
          const ang = w.rng.angle();
          const dist = w.rng.between(0, pat.r * 1.2);
          const x = p.pos.x + Math.cos(ang) * dist;
          const y = p.pos.y + Math.sin(ang) * dist;
          HX.World.spawnHazard(w, x, y, { r: pat.r, delay: pat.delay, dmg: pat.dmg });
        }
        return;
      }

      if (pat.id === 'ring') {
        // 环形：14 发，留一道随发数旋转的缺口（GDD §13.2 "留缝隙"）
        b.rotAngle = (b.rotAngle || 0) + 0.42;         // 缺口每次旋转
        const gapCenter = b.rotAngle;
        const gapHalf = (pat.gapDeg || 34) * Math.PI / 180 / 2;
        for (let i = 0; i < pat.count; i++) {
          const a = b.rotAngle * 0.3 + (TAU / pat.count) * i;
          let d = a - gapCenter;
          while (d > Math.PI) d -= TAU;
          while (d < -Math.PI) d += TAU;
          if (Math.abs(d) < gapHalf) continue;         // 缺口
          HX.World.fireBullet(w, {
            side: 'enemy', style: 'enemy',
            x: b.pos.x + Math.cos(a) * muzzle, y: b.pos.y + Math.sin(a) * muzzle,
            vx: Math.cos(a) * pat.speed, vy: Math.sin(a) * pat.speed,
            dmg: pat.dmg, life: pat.life
          });
        }
        w.stats.shots += pat.count;
        if (HX.Audio) HX.Audio.play('fire');
        return;
      }

      // 扇形：5 发，散布 60°，瞄准玩家（带一阶预测，否则玩家横移必脱靶）
      const aimDir = HX.World.aimAt(b.pos, p, pat.speed || HX.C.BULLET_SPEED);
      const aim = Math.atan2(aimDir.y, aimDir.x);
      const n = pat.count;
      const spread = (pat.spreadDeg || 0) * Math.PI / 180;
      for (let i = 0; i < n; i++) {
        const off = n > 1 ? (-spread / 2 + spread * (i / (n - 1))) : 0;
        const a = aim + off;
        HX.World.fireBullet(w, {
          side: 'enemy', style: 'enemy',
          x: b.pos.x + Math.cos(a) * muzzle, y: b.pos.y + Math.sin(a) * muzzle,
          vx: Math.cos(a) * pat.speed, vy: Math.sin(a) * pat.speed,
          dmg: pat.dmg, life: pat.life
        });
      }
      w.stats.shots += n;
      if (HX.Audio) HX.Audio.play('fire');
    },

    // ---------- 石柱阶段：追踪弹（命中玩家 → 点燃最近未点燃石柱，GDD §13.3） ----------
    castTracking(w, b, pat) {
      const p = w.player;
      const ang = Math.atan2(p.pos.y - b.pos.y, p.pos.x - b.pos.x);
      const muzzle = b.visualR * 0.7;
      HX.World.fireBullet(w, {
        side: 'enemy', style: 'tracking',
        x: b.pos.x + Math.cos(ang) * muzzle, y: b.pos.y + Math.sin(ang) * muzzle,
        vx: Math.cos(ang) * pat.speed, vy: Math.sin(ang) * pat.speed,
        dmg: pat.dmg, life: pat.life,
        visualR: HX.C.EBULLET.visualR, solidR: HX.C.EBULLET.solidR,
        homing: { turnRate: pat.turnRate },
        onHit: pat.igniteOnHit ? 'ignitePillar' : null
      });
      w.stats.shots++;
      if (HX.Audio) HX.Audio.play('fire');
    },

    // 追踪弹命中玩家 → 由 combat.hitPlayer 回调这里：
    // 取最近的未点燃石柱（igniteTarget 'nearestUnlit'），安排 igniteDelay 后点燃
    igniteNearestPillar(w) {
      const conf = HX.BOSS.pillarPhase;
      const ps = w.pillars;
      let best = null, bestD = Infinity;
      for (let i = 0; i < ps.length; i++) {
        const pl = ps[i];
        if (pl.lit || pl.pendingLitAt !== undefined) continue;   // 已点燃/已在点燃途中
        // 注：不要求"已出土" —— 石柱刚召唤的 0.8s 内追踪弹也可能命中玩家，
        // 点燃延迟（0.35s）+ 火球飞行足够覆盖出土窗口
        const d = Math.hypot(pl.pos.x - w.player.pos.x, pl.pos.y - w.player.pos.y);
        if (d < bestD) { bestD = d; best = pl; }
      }
      if (!best) return false;
      best.pendingLitAt = w.time + conf.tracking.igniteDelay;
      // 点火火球飞行表现：从玩家飞向石柱（GDD §13.3 "从玩家身上飞出火球点燃"）
      HX.World.fx(w, {
        type: 'ignite', x: w.player.pos.x, y: w.player.pos.y,
        from: { x: w.player.pos.x, y: w.player.pos.y },
        to: { x: best.pos.x, y: best.pos.y },
        life: conf.tracking.igniteDelay, color: HX.PAL.pillar.lit
      });
      return true;
    },

    // ---------- 狂暴（GDD §13.4） ----------
    enterEnrage(w, b) {
      const E = HX.BOSS.enrage;
      b.phase = HX.BOSS.PHASE.ENRAGE;
      b.phaseTime = 0;
      b.invuln = E.invincible;
      b.scale = E.scale;
      b.enrageTimer = E.delay;
      b.enrageFired = false;
      w.flash = E.screenFlash.alpha;
      w.flashColor = E.screenFlash.color;
      w.cam.shake(E.shake.amp, E.shake.dur);
      if (HX.Audio) HX.Audio.play('enrage');
      HX.World.fx(w, {
        type: 'text', x: b.pos.x, y: b.pos.y - b.visualR * 1.1,
        text: '狂暴', life: 1.5, color: HX.PAL.boss.enrage
      });
    }
  };

  HX.BossSys = BossSys;
})();
