// 小怪 AI（GDD §11）——行为逻辑归 systems（AGENTS §5：entity 只留数据与只读方法）。
//
// 血魔蛛（§11.1）：直线追玩家（不绕路）→ 接触后进入 0.5 秒**自爆前摇**（变红闪烁）→ 爆炸伤害 15
// 邪修术士（§11.2）：与玩家保持 6~8 身位（1536~2048px），太近后退、太远靠近；
//                   每 2 秒交替两种弹幕：追踪弹 1 发 / 扇形 3 发（散布 45°）
// 共同：被雷池麻痹期间**不移动也不开火**（GDD §7.3）
(function () {
  const HX = window.HX || (window.HX = {});

  const EnemyAI = {
    step(w, dt) {
      const es = w.enemies;
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if (!e.alive || e.hp <= 0) continue;

        if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
        if (e.guardCd > 0) e.guardCd = Math.max(0, e.guardCd - dt);   // 环绕飞剑"按圈结算"冷却

        // 麻痹（雷池，GDD §7.3）
        if (e.paraTimer > 0) {
          e.paraTimer = Math.max(0, e.paraTimer - dt);
          e.vel.x = 0; e.vel.y = 0;
          continue;
        }

        const b = e.behavior;
        if (b && b.type === 'chase') this.chase(w, e, dt);
        else if (b && b.type === 'kite') this.kite(w, e, dt);
      }
    },

    // ---- 血魔蛛：直追 + 自爆 ----
    chase(w, e, dt) {
      const p = w.player;
      const dx = p.pos.x - e.pos.x, dy = p.pos.y - e.pos.y;
      const d = Math.hypot(dx, dy) || 1;

      if (!e.telegraphing) {
        if (p.hp > 0 && d <= e.attack.range) {
          // 接触 → 进入前摇。前摇期间**继续逼近**：给玩家的反制窗口是「打掉它」或「空格冲刺脱离」
          // （冲刺位移 901px 远大于爆炸半径 153.6px，这是冲刺存在的意义之一，GDD §6.1）
          e.telegraphing = true;
          e.telegraph = e.attack.telegraph;
        }
      } else {
        e.telegraph -= dt;
        if (e.telegraph <= 0) { this.explode(w, e); return; }
      }

      e.vel.x = (dx / d) * e.speed;
      e.vel.y = (dy / d) * e.speed;
      e.pos.x += e.vel.x * dt;
      e.pos.y += e.vel.y * dt;
      e.facing.x = dx / d;
      e.facing.y = dy / d;
      // 视觉朝向（GDD §3.3：只做左右两侧）—— 有水平移动分量才更新，纯上下移动保持原朝向
      if (Math.abs(dx) > 1e-9) e.side = dx > 0 ? 1 : -1;
    },

    explode(w, e) {
      const p = w.player;
      const dx = p.pos.x - e.pos.x, dy = p.pos.y - e.pos.y;
      const reach = e.attack.range + p.solidR;
      const inBlast = p.hp > 0 && Math.hypot(dx, dy) <= reach;

      HX.World.fx(w, {
        type: 'ring', x: e.pos.x, y: e.pos.y,
        r0: e.solidR * 0.5, r1: e.attack.range, life: 0.34,
        color: HX.PAL.enemy.spiderTelegraph
      });
      HX.World.fx(w, {
        type: 'spark', x: e.pos.x, y: e.pos.y,
        r: e.solidR * 0.7, life: 0.26, color: HX.PAL.enemy.spiderTelegraph
      });

      w.stats.suicides++;
      if (inBlast) HX.Combat.damagePlayer(w, e.attack.dmg, { source: 'suicide' });

      // 自爆 ≠ 被击杀 → 默认不给经验（GDD §8 只说"击杀"；开关见 balance.enemy.suicideGivesExp）
      HX.Combat.killEnemy(w, e, { bySuicide: true });
    },

    // ---- 邪修术士：风筝 + 交替弹幕 ----
    kite(w, e, dt) {
      const p = w.player;
      const dx = p.pos.x - e.pos.x, dy = p.pos.y - e.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;

      const kMin = e.behavior.keepMin, kMax = e.behavior.keepMax;
      let mvx = 0, mvy = 0;
      if (d < kMin) { mvx = -ux; mvy = -uy; }        // 太近：后退
      else if (d > kMax) { mvx = ux; mvy = uy; }     // 太远：靠近
      // 区间内：原地不动（GDD「保持 6~8 身位」），不开火也没必要贴脸

      e.vel.x = mvx * e.speed;
      e.vel.y = mvy * e.speed;

      // 【2026-09-15 设计者补充】术士自己的移动**不走出当前屏幕外**；
      // 由玩家移动带动镜头导致的出屏不回拉 —— 实现：仅当"当前位置在屏内"时，
      // 才把本次位移夹到屏内（贴 viewMargin 内距）。镜头移走后它在屏外就随它去，
      // 直到镜头回来它才会重新被约束。
      let nx = e.pos.x + e.vel.x * dt;
      let ny = e.pos.y + e.vel.y * dt;
      const view = (e.behavior.stayInView !== false && w.cam) ? w.cam.viewRect() : null;
      if (view) {
        const m = e.behavior.viewMargin === undefined ? 24 : e.behavior.viewMargin;
        const loX = view.x + m, hiX = view.x + view.w - m;
        const loY = view.y + m, hiY = view.y + view.h - m;
        if (e.pos.x >= loX && e.pos.x <= hiX) nx = Math.max(loX, Math.min(hiX, nx));
        if (e.pos.y >= loY && e.pos.y <= hiY) ny = Math.max(loY, Math.min(hiY, ny));
      }
      e.pos.x = nx;
      e.pos.y = ny;
      e.facing.x = ux;
      e.facing.y = uy;
      if (Math.abs(mvx) > 1e-9) e.side = mvx > 0 ? 1 : -1;   // 后退/靠近也镜像（GDD §3.3 只做左右）

      const atk = e.attack;
      e.atkTimer -= dt;
      if (e.atkTimer > 0) return;

      const pat = atk.pattern[e.patternIndex % atk.pattern.length];
      e.patternIndex = (e.patternIndex + 1) % atk.pattern.length;
      e.atkTimer += atk.interval;
      this.fire(w, e, pat);
    },

    fire(w, e, pat) {
      const p = w.player;
      if (p.hp <= 0) return;
      // 瞄准带一阶预测（玩家在移动，只瞄当前位置对 512px/s 的弹幕必然脱靶）
      const dir = HX.World.aimAt(e.pos, p, e.attack.speed !== undefined ? e.attack.speed : HX.C.BULLET_SPEED);
      const ang = Math.atan2(dir.y, dir.x);
      // 弹速取值顺序：pattern 自带 > attack 层（2026-09-15 术士 = 统一弹速 × 2/3）> 全局统一弹速
      const sp = pat.speed !== undefined ? pat.speed
        : (e.attack.speed !== undefined ? e.attack.speed : HX.C.BULLET_SPEED);
      const muzzle = e.visualR * 0.7;
      const ox = e.pos.x + Math.cos(ang) * muzzle;
      const oy = e.pos.y + Math.sin(ang) * muzzle;
      // 弹幕尺寸（2026-09-15 设计者指示：邪修术士弹幕 = 原敌方弹幕的 1/3）
      const sz = e.attack.size || {};
      const vr = sz.visualR === undefined ? undefined : sz.visualR;
      const sr = sz.solidR === undefined ? undefined : sz.solidR;

      if (pat.id === 'track') {
        HX.World.fireBullet(w, {
          side: 'enemy', style: 'tracking',
          x: ox, y: oy,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          dmg: pat.dmg, life: pat.life, visualR: vr, solidR: sr,
          homing: pat.turnRate ? { turnRate: pat.turnRate } : null
        });
        w.stats.shots++;
        if (HX.Audio) HX.Audio.play('fire');
        return;
      }

      // 扇形：count 发，总散布 spreadDeg，中线指向玩家
      const n = pat.count;
      const spread = (pat.spreadDeg || 0) * Math.PI / 180;
      for (let i = 0; i < n; i++) {
        const off = n > 1 ? (-spread / 2 + spread * (i / (n - 1))) : 0;
        const a = ang + off;
        HX.World.fireBullet(w, {
          side: 'enemy', style: 'enemy',
          x: ox, y: oy,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          dmg: pat.dmg, life: pat.life, visualR: vr, solidR: sr
        });
      }
      w.stats.shots += n;
      if (HX.Audio) HX.Audio.play('fire');
    }
  };

  HX.EnemyAI = EnemyAI;
})();
