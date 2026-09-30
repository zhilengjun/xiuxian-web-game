// 玩家移动 / 冲刺 / 地图边界 / 固体推挤 / 小怪分离（GDD §5 §6.1 §14）。
// 只读调用方注入的 intent，不读 HX.Input —— 理由见 systems/world.js 头注释。
// 边界：地图外圈是"空气墙/灵气屏障"（GDD §5），停在 WALL_MARGIN 之内，相机随之停镜。
(function () {
  const HX = window.HX || (window.HX = {});

  function clampToArena(w, o) {
    const m = o.solidR + HX.C.WALL_MARGIN;
    const maxX = HX.C.ARENA.w - m, maxY = HX.C.ARENA.h - m;
    if (o.pos.x < m) o.pos.x = m; else if (o.pos.x > maxX) o.pos.x = maxX;
    if (o.pos.y < m) o.pos.y = m; else if (o.pos.y > maxY) o.pos.y = maxY;
  }

  const Movement = {
    clampToArena: clampToArena,

    stepPlayer(w, dt, it) {
      const p = w.player, B = HX.BAL;

      if (p.hp <= 0) { p.vel.x = 0; p.vel.y = 0; return; }

      if (p.dashCd > 0) p.dashCd = Math.max(0, p.dashCd - dt);

      // 输入归一化（GDD §6：WASD 移动，斜向不加速）
      let mx = it.moveX || 0, my = it.moveY || 0;
      const ml = Math.hypot(mx, my);
      if (ml > 1e-9) {
        mx /= ml; my /= ml;
        p.facing.x = mx; p.facing.y = my;
        // 视觉朝向（GDD §3.3：只做左右两侧，上下移动保持原朝向）→ 只有水平分量才改 side
        if (Math.abs(mx) > 1e-9) p.side = mx > 0 ? 1 : -1;
      }

      // 冲刺（GDD §6.1：非闪避，**没有 i-frame**，只补机动缺口）
      if (!p.dashing && it.dash && p.dashCd <= 0) {
        const hasInput = ml > 1e-9;
        const dx = hasInput ? mx : (p.facing.x || 1);
        const dy = hasInput ? my : (p.facing.y || 0);
        const dl = Math.hypot(dx, dy) || 1;
        p.dashDir.x = dx / dl;
        p.dashDir.y = dy / dl;
        p.dashing = true;
        p.dashTimer = B.dash.time;
        p.dashCd = B.dash.cd;
        if (HX.Audio) HX.Audio.play('dash');
        HX.World.fx(w, {
          type: 'ring', x: p.pos.x, y: p.pos.y,
          r0: p.solidR * 0.8, r1: p.solidR * 2.4, life: 0.26,
          color: HX.PAL.skins[p.skinId] ? HX.PAL.skins[p.skinId].accent : HX.PAL.fx.white
        });
      }

      if (p.dashing) {
        p.vel.x = p.dashDir.x * B.dash.speed;
        p.vel.y = p.dashDir.y * B.dash.speed;
      } else {
        p.vel.x = mx * p.speed;
        p.vel.y = my * p.speed;
      }
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;

      // 冲刺计时在**位移之后**推进：保证位移量 ≈ speed × time（不会被"提前一帧结束"削掉）
      if (p.dashing) {
        p.dashTimer -= dt;
        if (p.dashTimer <= 0) { p.dashing = false; p.dashTimer = 0; }
      }

      clampToArena(w, p);
      this.pushPlayerOutOfSolids(w, p);
      this.clampToPillarRect(w, p);

      // 小怪：边界收敛（GDD §14 未规定，取"不越界"） + 相互分离力
      const es = w.enemies;
      for (let i = 0; i < es.length; i++) if (es[i].alive) clampToArena(w, es[i]);
      this.separateEnemies(w, dt);
    },

    // 石柱结界（2026-09-16 设计者指示）：4 根石柱连成的矩形把玩家围在中间，不能出去。
    // 结界边界 = 召唤时视口内缩 barrierInset（= 玩家碰撞半径）：玩家中心被 clamp 在
    // 结界内 → 玩家**边缘**恰好贴到屏边；柱子（锚点距屏边 140）全部在结界内。
    clampToPillarRect(w, p) {
      const r = w.pillarRect;
      if (!r) return;
      p.pos.x = Math.max(r.x0, Math.min(r.x1, p.pos.x));
      p.pos.y = Math.max(r.y0, Math.min(r.y1, p.pos.y));
    },

    // BOSS 也被结界围住（"最好也不出去"）—— margin 用 BOSS 自身碰撞半径。
    // 语义与术士不出屏相同：只约束"在结界内"的实体；召唤瞬间 BOSS 通常在结界外，
    // 不瞬移，它追玩家时会自然走进来，进入后即受约束。
    clampBossToPillarRect(w, b) {
      const r = w.pillarRect;
      if (!r) return false;
      const m = b.solidR;
      const inside = b.pos.x >= r.x0 - m && b.pos.x <= r.x1 + m &&
                     b.pos.y >= r.y0 - m && b.pos.y <= r.y1 + m;
      if (!inside) return false;
      b.pos.x = Math.max(r.x0 + m, Math.min(r.x1 - m, b.pos.x));
      b.pos.y = Math.max(r.y0 + m, Math.min(r.y1 - m, b.pos.y));
      return true;
    },

    // 固体推挤：只推玩家（石柱；见 constants.PILLAR.solidForPlayer）。
    // 小怪与 BOSS 不受石柱阻挡 —— 否则追玩家时会卡在柱子后面（GDD 未规定，取"不卡怪"）。
    // ⚠ 只推**已出土**的石柱：石柱是 BOSS 50% 血时才从地下冒出的（GDD §13.3），
    //   出土过程中 / 未召唤时玩家可直接穿过。
    pushPlayerOutOfSolids(w, p) {
      if (!HX.C.PILLAR.solidForPlayer || !w.pillars) return;
      for (let i = 0; i < w.pillars.length; i++) {
        const pl = w.pillars[i];
        if (!HX.Pillar.isEmerged(pl)) continue;
        const o = HX.Collide.overlap(p.pos.x, p.pos.y, p.solidR, pl.pos.x, pl.pos.y, pl.solidR);
        if (!o) continue;
        p.pos.x -= o.nx * o.depth;
        p.pos.y -= o.ny * o.depth;
      }

      // BOSS：玩家不可穿（GDD §13.1 固体推挤）+ 接触伤害 20 / **BOSS 自身 CD 1s**。
      // ⚠ 接触判定必须在这里做 —— movement 先于 BOSS 系统执行，把玩家推出重叠后
      //   BossSys 再测就永远测不到重叠，接触伤害会"永远打不出来"（实测踩过）。
      // CD 用 BOSS 自己的 contact.cd（1s，§13.1），不用玩家的 0.5s 接触冷却（那是 §14 通用口径）。
      const b = w.boss;
      if (b && b.alive && b.hp > 0) {
        const o = HX.Collide.overlap(p.pos.x, p.pos.y, p.solidR, b.pos.x, b.pos.y, b.solidR);
        if (o) {
          p.pos.x -= o.nx * o.depth;
          p.pos.y -= o.ny * o.depth;
          if ((b.contactCd || 0) <= 0) {
            HX.Combat.damagePlayer(w, b.contact.dmg, { source: 'bossContact' });
            b.contactCd = b.contact.cd;
          }
        }
      }
    },

    // 小怪之间无硬碰撞，只有"轻微分离力"（GDD §14 原文）：
    // 位移 = min(穿透深度, maxPush) × strength × dt —— 与帧率无关，且不会出现"弹开"抖动
    separateEnemies(w, dt) {
      const es = w.enemies, cfg = HX.BAL.enemy.separation;
      for (let i = 0; i < es.length; i++) {
        const a = es[i];
        if (!a.alive || a.hp <= 0) continue;
        for (let j = i + 1; j < es.length; j++) {
          const b = es[j];
          if (!b.alive || b.hp <= 0) continue;
          const o = HX.Collide.overlap(a.pos.x, a.pos.y, a.solidR, b.pos.x, b.pos.y, b.solidR);
          if (!o) continue;
          const step = Math.min(o.depth, cfg.maxPush) * cfg.strength * dt;
          a.pos.x -= o.nx * step; a.pos.y -= o.ny * step;
          b.pos.x += o.nx * step; b.pos.y += o.ny * step;
        }
      }
    }
  };

  HX.Movement = Movement;
})();
