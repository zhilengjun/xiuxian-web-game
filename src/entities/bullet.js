// 弹幕实体——纯数据 + 极薄只读方法；走对象池（README §9）。
// 用法：world 侧建池
//   new HX.Pool({ max: 600, create: HX.Bullet.create, reset: HX.Bullet.init })
// 池取：pool.obtain(opts) → HX.Bullet.init(b, opts)
// 半径（GDD §14）：玩家弹幕 外观 0.15 / 判定 0.1；敌方弹幕 外观 0.2 / 判定 0.12
// source 字段决定是否积累大招能量：只有 'normal' 积累（GDD §10 明确护身技/大招伤害不积累）。
(function () {
  const HX = window.HX || (window.HX = {});

  const Bullet = {
    create() { return Bullet.init({}); },

    init(b, opts) {
      const o = b || {};
      opts = opts || {};
      const side = opts.side || 'enemy';
      const conf = side === 'player' ? HX.C.PBULLET : HX.C.EBULLET;

      o.alive = true;
      o.side = side;
      o.source = opts.source || 'normal';   // 'normal' | 'guard' | 'ult'
      o.style = opts.style || (side === 'player' ? 'sword' : 'enemy');
      o.ownerId = opts.ownerId === undefined ? -1 : opts.ownerId;

      o.pos = o.pos || { x: 0, y: 0 };
      o.vel = o.vel || { x: 0, y: 0 };
      o.pos.x = opts.x || 0;
      o.pos.y = opts.y || 0;
      o.vel.x = opts.vx || 0;
      o.vel.y = opts.vy || 0;

      o.visualR = opts.visualR === undefined ? conf.visualR : opts.visualR;
      o.solidR = opts.solidR === undefined ? conf.solidR : opts.solidR;

      o.dmg = opts.dmg === undefined ? 0 : opts.dmg;
      o.speed = Math.hypot(o.vel.x, o.vel.y);
      o.life = opts.life === undefined ? 6 : opts.life;
      o.age = 0;
      o.spin = opts.spin === undefined ? 0 : opts.spin;   // 视觉自转角速度
      o.angle = Math.atan2(o.vel.y, o.vel.x);

      // 追踪（GDD §11.2 术士追踪弹 / §13.3 BOSS 追踪弹）
      o.homing = opts.homing || null;      // { turnRate, style:'player'|'boss'|'enemy' }
      o.aoe = opts.aoe || 0;               // 命中后爆炸半径（南明离火）
      o.aoeDmg = opts.aoeDmg || 0;
      o.chain = opts.chain || null;        // { range, decay } 雷链传导
      o.pierce = opts.pierce || 0;         // 可穿透数（0 = 命中即消失）
      // 已命中目标 uid（防同一发弹幕重复打同一目标）。复用数组、只清空不重建，减少 GC。
      o.hitIds = o.hitIds || [];
      o.hitIds.length = 0;
      o.onHit = opts.onHit || null;        // 'ignitePillar' 等特殊命中效果
      o.corridor = opts.corridor || null;  // （遗留字段，未使用）
      o.trailFire = opts.trailFire || null;// 是否留下火焰 { life, tickEvery, dmg }
      // 接触型弹幕（火凤凰）：每 tickEvery 秒对碰撞盒内目标造成 tickDmg 伤害（不消失、不记 hitIds）
      o.tickEvery = opts.tickEvery || 0;
      o.tickDmg = opts.tickDmg || 0;
      o.tickTimer = 0;

      return o;
    },

    // ---- 只读派生量（写入由 systems/combat.js 负责，entity 不提供写方法）----
    isPlayerSide(b) { return b.side === 'player'; },
    isExpired(b) { return b.age >= b.life; },
    hasHit(b, uid) { return b.hitIds.indexOf(uid) >= 0; },
    // 命中后是否应继续存活（穿透）
    survivesAfterHit(b) { return b.pierce > 0; }
  };

  HX.Bullet = Bullet;
})();
