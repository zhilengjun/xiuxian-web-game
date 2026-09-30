// BOSS 实体：吞天老祖——纯数据 + 极薄只读方法。
// 数值取自 config/boss.js；阶段机 / 弹幕模式 / 石柱点燃 / 狂暴判定在 src/systems/boss.js。
(function () {
  const HX = window.HX || (window.HX = {});

  const Boss = {
    init(b, x, y) {
      const def = HX.BOSS;
      const o = b || {};

      o.kind = 'boss';
      o.id = def.id;
      o.name = def.name;

      o.pos = o.pos || { x: 0, y: 0 };
      o.vel = o.vel || { x: 0, y: 0 };
      o.facing = o.facing || { x: 0, y: 1 };
      o.side = 1;              // 视觉朝向（±1）—— BOSS 阶段 3 接入；默认朝右
      o.pos.x = x === undefined ? HX.C.ARENA.w * 0.5 : x;
      o.pos.y = y === undefined ? HX.C.ARENA.h * 0.5 : y;
      o.vel.x = 0; o.vel.y = 0;

      // 尺寸（GDD §3.2：外观半径 1.5u = 768px 直径；碰撞 1.05u = 0.7×）
      o.visualR = def.visualR;
      o.solidR = def.solidR;
      o.baseVisualR = def.visualR;      // 狂暴放大后仍保留基准值
      o.scale = 1;                      // 渲染缩放（狂暴 1.5）

      o.hp = def.hp;
      o.maxHp = def.hp;
      o.speed = def.speed;
      o.contact = def.contact;

      // 阶段机（config/boss.js PHASE 枚举）
      o.phase = def.PHASE.NORMAL;
      o.phaseTime = 0;
      o.invuln = false;                 // 狂暴后无敌

      // 弹幕计时
      o.atkTimer = def.normal.interval;  // 出场后等一个间隔再放第一轮
      o.rotationIndex = 0;               // 三种弹幕轮换指针
      o.trackCd = 0;                     // 追踪弹冷却（石柱阶段）
      o.summonTimer = def.normal.summon.first;
      o.contactCd = 0;
      o.enrageTimer = 0;                 // 狂暴演出倒计时（归零 → 直接判负）
      o.enrageFired = false;             // 狂暴地火是否已倾泻

      // 灵石掉落进度（GDD §9）：依次跨过 75% / 50% / 25%
      o.dropIndex = 0;

      o.hitFlash = 0;                    // 受击闪白（纯表现）
      o.bornAt = 0;
      o.alive = true;
      return o;
    },

    // ---- 只读派生量 ----
    isAlive(b) { return b.hp > 0; },
    hpRatio(b) { return Math.max(0, Math.min(1, b.hp / b.maxHp)); },
    isEnraged(b) { return b.phase === HX.BOSS.PHASE.ENRAGE; },
    isInvulnerable(b) { return b.invuln === true; },
    // 是否已进入石柱阶段（含之后的狂暴态）
    inPillarPhase(b) {
      return b.phase === HX.BOSS.PHASE.PILLAR || b.phase === HX.BOSS.PHASE.ENRAGE;
    }
  };

  HX.Boss = Boss;
  HX.makeBoss = function (x, y) { return Boss.init(null, x, y); };
})();
