// 战斗结算（GDD §14 碰撞规则 / §8 经验升级 / §10 能量积累 / §15 胜负）。
//
// 职责链：计时器 → 弹幕位移（含追踪/出界） → 命中判定 → 伤害与死亡 → 经验/能量 → 死体清理。
// 所有几何判定一律走 math/collision.js —— 全工程唯一碰撞实现（README §6）。
// 数值一律取自 config/，本文件不含任何硬编码玩法数字。
(function () {
  const HX = window.HX || (window.HX = {});
  const TAU = Math.PI * 2;

  function dec(v, dt) { return v > 0 ? Math.max(0, v - dt) : 0; }

  const Combat = {
    // ---------- 计时器 ----------
    stepTimers(w, dt) {
      const p = w.player;
      p.invuln = dec(p.invuln, dt);            // 受伤后无敌 0.5s（GDD §14）
      p.contactCd = dec(p.contactCd, dt);      // 接触伤害冷却 0.5s（GDD §14，BOSS 接触用）
      p.hurtFlash = dec(p.hurtFlash, dt);
      p.energyHitCd = dec(p.energyHitCd, dt);
      p.energyHurtCd = dec(p.energyHurtCd, dt);
      p.ultCd = dec(p.ultCd, dt);
      if (p.guardTimer > 0) p.guardTimer = dec(p.guardTimer, dt);   // 阶段 3 用
      if (w.flash > 0) w.flash = Math.max(0, w.flash - dt * 2.2);
    },

    // ---------- 弹幕位移 ----------
    stepProjectiles(w, dt) {
      const C = HX.C;
      const act = w.pools.bullet.active;
      for (let i = 0; i < act.length; i++) {
        const b = act[i];
        if (!b.alive) continue;

        b.age += dt;
        if (b.age >= b.life) { b.alive = false; continue; }

        // 追踪（邪修追踪弹 / BOSS 追踪弹 → 玩家；御剑飞剑 → 锁定的目标）：
        // 按 turnRate 逐帧转向目标，非直线也非全锁定。
        // 玩家弹幕的 homing.target 在发射时绑定实体引用（自动锁敌，GDD §7.1）；
        // 敌方弹幕无 target → 默认追踪玩家。目标死亡则弹幕保持直线飞完。
        if (b.homing && b.homing.turnRate > 0) {
          let tgt = b.homing.target;
          if (tgt === undefined) tgt = w.player;
          if (tgt && tgt.hp > 0) {
            const want = Math.atan2(tgt.pos.y - b.pos.y, tgt.pos.x - b.pos.x);
            const cur = Math.atan2(b.vel.y, b.vel.x);
            let d = want - cur;
            while (d > Math.PI) d -= TAU;
            while (d < -Math.PI) d += TAU;
            const maxTurn = b.homing.turnRate * dt;
            const na = cur + Math.max(-maxTurn, Math.min(maxTurn, d));
            b.vel.x = Math.cos(na) * b.speed;
            b.vel.y = Math.sin(na) * b.speed;
            b.angle = na;
          }
        }

        b.pos.x += b.vel.x * dt;
        b.pos.y += b.vel.y * dt;

        // 火凤凰（南明大招 v2）：768×768 碰撞盒内的敌人每 0.2s 吃 tickDmg 伤害（tick 结算）。
        // 起飞点在视口边缘外（可能 < 0 或 > ARENA.w），跳过下面的灵气屏障判死 —— 靠 life 收尾。
        if (b.style === 'phoenix') {
          b.tickTimer += dt;
          if (b.tickTimer >= b.tickEvery) {
            b.tickTimer -= b.tickEvery;
            const half = b.solidR;
            const es = w.enemies;
            for (let k = 0; k < es.length; k++) {
              const e = es[k];
              if (!e.alive || e.hp <= 0) continue;
              if (Math.abs(e.pos.x - b.pos.x) <= half + e.solidR &&
                  Math.abs(e.pos.y - b.pos.y) <= half + e.solidR) {
                this.damageEnemy(w, e, b.tickDmg, { source: 'ult' });
              }
            }
            const bs = w.boss;
            if (bs && bs.alive && bs.hp > 0 &&
                Math.abs(bs.pos.x - b.pos.x) <= half + bs.solidR &&
                Math.abs(bs.pos.y - b.pos.y) <= half + bs.solidR) {
              this.damageBoss(w, b.tickDmg, { source: 'ult' });
            }
          }
          continue;                                        // 跳过灵气屏障判死
        }

        // 出界（灵气屏障，GDD §5）即灭
        if (b.pos.x < 0 || b.pos.x > C.ARENA.w || b.pos.y < 0 || b.pos.y > C.ARENA.h) b.alive = false;
      }
    },

    // ---------- 命中判定 ----------
    resolve(w) {
      const act = w.pools.bullet.active;
      for (let i = 0; i < act.length; i++) {
        const b = act[i];
        if (!b.alive) continue;
        if (b.style === 'phoenix') continue;               // 火凤走接触 tick（stepProjectiles），不走命中-消失
        if (b.side === 'player') this.hitEnemies(w, b);
        else this.hitPlayer(w, b);
      }
    },

    hitEnemies(w, b) {
      const es = w.enemies;
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if (!e.alive || e.hp <= 0) continue;
        if (HX.Bullet.hasHit(b, e.uid)) continue;
        if (!HX.Collide.test(b.pos.x, b.pos.y, b.solidR, e.pos.x, e.pos.y, e.solidR)) continue;

        b.hitIds.push(e.uid);   // 同一发弹幕不重复打同一目标

        if (b.aoe > 0) { this.explode(w, b); b.alive = false; return; }
        if (b.chain) { this.chain(w, b, e); b.alive = false; return; }

        this.damageEnemy(w, e, b.dmg, { source: b.source });

        if (HX.BAL.feedback.hitSpark) {
          HX.World.fx(w, { type: 'spark', x: b.pos.x, y: b.pos.y, r: 5.3, life: 0.22, color: HX.PAL.fx.hit });
        }

        if (HX.Bullet.survivesAfterHit(b)) b.pierce--;
        else { b.alive = false; return; }
      }

      // BOSS（GDD §13）：也吃玩家弹幕；狂暴时无敌。
      // 万剑穿透仅对小怪生效 —— 命中 BOSS 即消失（2026-09-16 设计者指示），
      // 否则追踪剑会绕着 BOSS 反复结算（hitIds 只防同一目标一次）
      const boss = w.boss;
      if (boss && boss.alive && boss.hp > 0 && !HX.Bullet.hasHit(b, boss.uid)) {
        if (HX.Collide.test(b.pos.x, b.pos.y, b.solidR, boss.pos.x, boss.pos.y, boss.solidR)) {
          b.hitIds.push(boss.uid);
          if (b.aoe > 0) { this.explode(w, b); b.alive = false; return; }
          if (b.chain) { this.chain(w, b, boss); b.alive = false; return; }
          this.damageBoss(w, b.dmg, { source: b.source });
          b.alive = false; return;                       // 命中 BOSS 一律消失（含穿透弹）
        }
      }
    },

    hitPlayer(w, b) {
      const p = w.player;
      if (p.hp <= 0) return;
      if (!HX.Collide.test(b.pos.x, b.pos.y, b.solidR, p.pos.x, p.pos.y, p.solidR)) return;

      b.alive = false;   // 命中即消失（即使玩家正处于无敌帧，子弹也算"打到了"）
      this.damagePlayer(w, b.dmg, { source: 'bullet' });
      // BOSS 追踪弹：命中玩家 → 点燃最近的未点燃石柱（GDD §13.3）
      if (b.onHit === 'ignitePillar' && w.boss && w.boss.alive && w.boss.hp > 0) {
        HX.BossSys.igniteNearestPillar(w);
      }
    },

    // ---------- 范围爆炸（南明离火）----------
    explode(w, b) {
      const r = b.aoe;
      const dmg = b.aoeDmg || b.dmg;
      HX.World.fx(w, {
        type: 'ring', x: b.pos.x, y: b.pos.y,
        r0: b.solidR, r1: r, life: 0.3,
        color: HX.PAL.skins.nanming.accent
      });
      const es = w.enemies;
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if (!e.alive || e.hp <= 0) continue;
        if (!HX.Collide.test(b.pos.x, b.pos.y, r, e.pos.x, e.pos.y, e.solidR)) continue;
        this.damageEnemy(w, e, dmg, { source: b.source });
      }
      // 爆炸同样波及 BOSS
      const boss = w.boss;
      if (boss && boss.alive && boss.hp > 0 &&
        HX.Collide.test(b.pos.x, b.pos.y, r, boss.pos.x, boss.pos.y, boss.solidR)) {
        this.damageBoss(w, dmg, { source: b.source });
      }
    },

    // 区域结算（火痕 tick / 护身技范围伤害等）：对范围内敌人 + BOSS 各结一次
    damageArea(w, x, y, r, dmg, source, includeBoss) {
      if (dmg <= 0) return;
      const es = w.enemies;
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if (!e.alive || e.hp <= 0) continue;
        if (!HX.Collide.test(x, y, r, e.pos.x, e.pos.y, e.solidR)) continue;
        this.damageEnemy(w, e, dmg, { source: source });
      }
      if (includeBoss) {
        const boss = w.boss;
        if (boss && boss.alive && boss.hp > 0 &&
          HX.Collide.test(x, y, r, boss.pos.x, boss.pos.y, boss.solidR)) {
          this.damageBoss(w, dmg, { source: source });
        }
      }
    },

    // ---------- 雷链传导（九霄神雷）----------
    // GDD §8.3：命中后按 chainRange 继续传导，伤害按 decay 递减，**传导数量不限**。
    // 实现为「直到没有新目标 或 伤害衰减到 1 以下为止」，并留 64 跳硬上限防死循环。
    chain(w, b, first) {
      const conf = b.chain;
      const pts = [{ x: b.pos.x, y: b.pos.y }];
      const hit = [first];
      let cur = first;
      let dmg = b.dmg;

      for (let n = 0; n < 64; n++) {
        this.damageEnemy(w, cur, dmg, { source: b.source });
        pts.push({ x: cur.pos.x, y: cur.pos.y });

        const next = HX.World.nearestEnemy(w, cur.pos.x, cur.pos.y, conf.range, hit);
        if (!next) break;
        dmg *= conf.decay;
        if (dmg < 1) break;
        hit.push(next);
        cur = next;
      }

      HX.World.fx(w, {
        type: 'arc', x: first.pos.x, y: first.pos.y,
        points: pts, life: 0.3, color: HX.PAL.skins.jiuxiao.accent
      });
    },

    // ---------- 伤害 ----------
    damageEnemy(w, e, dmg, opt) {
      if (!e.alive || e.hp <= 0 || dmg <= 0) return;
      opt = opt || {};
      const def = HX.ENEMIES[e.typeId];

      e.hp -= dmg;
      e.hitFlash = def && def.damageFlash ? def.damageFlash : 0.08;
      w.stats.dmgDealt += dmg;

      if (HX.BAL.feedback.damageText) {
        HX.World.fx(w, {
          type: 'text', x: e.pos.x, y: e.pos.y, text: '-' + Math.round(dmg),
          life: 0.55, color: HX.PAL.fx.text
        });
      }

      // 能量：命中 +5，每 0.5 秒最多一次（多目标同帧也只算一次，GDD §10）
      this.addEnergyOnHit(w, opt.source);

      if (e.hp <= 0) this.killEnemy(w, e, opt);
    },

    // BOSS 受击（GDD §13）：狂暴时无敌；血量归零 → 胜利判定在 systems/boss.js
    damageBoss(w, dmg, opt) {
      const b = w.boss;
      if (!b || !b.alive || dmg <= 0) return;
      opt = opt || {};
      if (b.invuln) {
        // 无敌：只给"打不动"的反馈，不掉血、不积累能量
        HX.World.fx(w, { type: 'text', x: b.pos.x, y: b.pos.y, text: '无敌', life: 0.5, color: HX.PAL.boss.enrage });
        return;
      }
      b.hp = Math.max(0, b.hp - dmg);
      b.hitFlash = 0.06;
      w.stats.dmgDealt += dmg;
      if (HX.BAL.feedback.damageText) {
        HX.World.fx(w, {
          type: 'text', x: b.pos.x, y: b.pos.y, text: '-' + Math.round(dmg),
          life: 0.55, color: HX.PAL.fx.text
        });
      }
      this.addEnergyOnHit(w, opt.source);
    },

    damagePlayer(w, dmg, opt) {
      const p = w.player;
      if (p.hp <= 0 || dmg <= 0) return false;
      opt = opt || {};

      // 受伤无敌帧（GDD §14：0.5 秒）。冲刺**不提供**无敌（GDD §6.1 明确非闪避）
      if (p.invuln > 0 && !opt.ignoreIframe) return false;

      p.hp = Math.max(0, p.hp - dmg);
      p.invuln = HX.BAL.player.iframe;
      p.contactCd = HX.BAL.player.contactCd;
      p.hurtFlash = 0.20;
      w.stats.dmgTaken += dmg;

      HX.World.fx(w, { type: 'spark', x: p.pos.x, y: p.pos.y, r: 22, life: 0.3, color: '#ff8b7a' });
      if (HX.BAL.feedback.damageText) {
        HX.World.fx(w, { type: 'text', x: p.pos.x, y: p.pos.y, text: '-' + Math.round(dmg), life: 0.6, color: '#ff9b8a' });
      }
      if (HX.Audio) HX.Audio.play('playerHit');

      // 能量：受伤 +5，每 1 秒最多一次（只算实际扣血，GDD §10）
      if (p.energyHurtCd <= 0) {
        this.addEnergy(w, HX.BAL.energy.onHurt);
        p.energyHurtCd = HX.BAL.energy.onHurtCd;
      }
      return true;
    },

    killEnemy(w, e, opt) {
      if (!e.alive) return;
      opt = opt || {};
      e.hp = 0;
      e.alive = false;
      w.stats.kills++;
      if (e.typeId === 'spider') w.stats.spiderKills++;
      else if (e.typeId === 'wizard') w.stats.wizardKills++;

      // 经验（GDD §8）：击杀才给；自爆死的按配置决定（默认不给，见 balance.enemy.suicideGivesExp）
      const bySuicide = opt.bySuicide === true;
      if (!bySuicide || HX.BAL.enemy.suicideGivesExp) this.gainExp(w, e.exp);

      HX.World.fx(w, {
        type: 'ring', x: e.pos.x, y: e.pos.y,
        r0: e.solidR * 0.6, r1: e.solidR * 2.6, life: 0.3,
        color: HX.PAL.fx.white
      });
      if (HX.Audio) HX.Audio.play('enemyDie');

      // 掉落护身灵石（30%，GDD §9）：掷点用 world.rng（确定性，AGENTS §4）
      if (e.dropChance > 0 && w.rng.chance(e.dropChance)) {
        HX.World.spawnPickup(w, 'guardStone', e.pos.x, e.pos.y);
      }

      // 击杀补怪（2026-09-16 设计者指示）：波次期间死一只立即补一只（受同屏 cap 约束）
      if (HX.Spawn) HX.Spawn.onEnemyKilled(w);
    },

    // 经验与升级（GDD §8；满级 Lv5 = 见 BOSS 前的目标等级）
    gainExp(w, amount) {
      const p = w.player, B = HX.BAL;
      if (amount <= 0) return;
      if (p.level < B.exp.maxLevel) {
        p.exp += amount;
        const lv = B.levelFromExp(p.exp);
        if (lv > p.level) {
          p.level = lv;
          w.stats.level = lv;
          HX.World.fx(w, { type: 'ring', x: p.pos.x, y: p.pos.y, r0: 10, r1: 79, life: 0.5, color: HX.PAL.hud.exp });
          HX.World.fx(w, { type: 'text', x: p.pos.x, y: p.pos.y - p.visualR, text: 'Lv' + lv, life: 0.9, color: HX.PAL.hud.exp });
        }
      }
      p.expRatio = B.expRatio(p.exp);
    },

    // 能量积累（GDD §10）：命中 +5/0.5s，受伤 +5/1s；护身技与大招造成的伤害**不积累**
    addEnergyOnHit(w, source) {
      const B = HX.BAL.energy;
      if (source && B.excludeSources.indexOf(source) >= 0) return;
      const p = w.player;
      if (p.energyHitCd > 0) return;
      this.addEnergy(w, B.onHit);
      p.energyHitCd = B.onHitCd;
    },

    addEnergy(w, amount) {
      const p = w.player;
      p.energy = Math.max(0, Math.min(HX.BAL.energy.max, p.energy + amount));
      p.ultReady = p.energy >= HX.BAL.energy.max && p.ultCd <= 0;
    },

    // ---------- 死体清理 ----------
    compact(w) {
      const es = w.enemies;
      let k = 0;
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if (e.alive && e.hp > 0) es[k++] = e;
      }
      es.length = k;
    }
  };

  HX.Combat = Combat;
})();
