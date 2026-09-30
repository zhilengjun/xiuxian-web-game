// 玩家实体（纯数据 + 极薄只读方法）。
// 纪律（AGENTS §5）：entity 只持有状态，不写行为逻辑、不读输入、不引用渲染层；
//   一切写入（移动/受伤/升级/能量）由 src/systems/ 负责。
// 字段来源：尺寸 → config/constants.js；战斗数值 → config/balance.js。
(function () {
  const HX = window.HX || (window.HX = {});

  const Player = {
    // 新建（或复用同一对象重置）
    init(p, skinId, x, y) {
      const C = HX.C.PLAYER, B = HX.BAL;
      const o = p || {};
      o.kind = 'player';
      o.skinId = skinId || HX.DEFAULT_SKIN;
      // 装配（GDD v1.19 §7：武器/法袍/法器三部件）。默认 = 三件同系（与 skinId 一致，
      // 无头模拟与旧调用方零改动）；battle.enter 会用 HX.Equip 快照覆盖。
      o.equip = { weapon: o.skinId, cloth: o.skinId, aura: o.skinId };

      o.pos = o.pos || { x: 0, y: 0 };
      o.vel = o.vel || { x: 0, y: 0 };
      o.facing = o.facing || { x: 1, y: 0 };
      o.side = 1;              // 视觉朝向（±1，右/左）—— 只做左右两侧，systems 在有水平移动时更新（GDD §3.3）
      o.pos.x = x === undefined ? HX.C.ARENA.w * 0.5 : x;
      o.pos.y = y === undefined ? HX.C.ARENA.h * 0.5 : y;
      o.vel.x = 0; o.vel.y = 0;

      // 尺寸与移动（GDD §3.2 / 附录 A）
      o.visualR = C.visualR;   // 外观半径 128px（外观直径 256px）
      o.solidR = C.solidR;     // 碰撞半径 89.6px（= 0.7×，GDD §14）
      o.speed = C.speed;       // 1280 px/s

      // 生命（GDD §14 / §15）—— maxHp 见 balance.js（设计者暂定 200）
      o.hp = B.player.maxHp;
      o.maxHp = B.player.maxHp;
      o.invuln = 0;            // 受伤后无敌倒计时
      o.contactCd = 0;         // 接触伤害冷却倒计时
      o.hurtFlash = 0;         // 受击闪白（纯表现）

      // 成长（GDD §8）
      o.level = 1;
      o.exp = 0;
      o.expRatio = 0;

      // 普通技能节拍（自动锁敌开火间隔由 systems/skill.js 按等级表设置）
      o.atkTimer = 0;
      o.atkIndex = 0;

      // 大招（GDD §10）
      o.energy = 0;
      o.ultCd = 0;
      o.ultReady = false;
      o.energyHitCd = 0;       // 命中积累冷却
      o.energyHurtCd = 0;      // 受伤积累冷却

      // 护身技（GDD §9）
      o.guardTimer = 0;
      o.guardTick = 0;         // 护身技内部节拍（御剑按圈 / 南明落痕 / 雷池）
      o.guardOrbit = 0;        // 御剑环绕角

      // 冲刺（GDD §6.1：非闪避、无 i-frame）
      o.dashCd = 0;
      o.dashTimer = 0;
      o.dashing = false;
      o.dashDir = o.dashDir || { x: 1, y: 0 };

      o.alive = true;
      return o;
    },

    // ---- 以下为只读派生量：不修改任何状态 ----
    isAlive(p) { return p.hp > 0; },
    hpRatio(p) { return Math.max(0, Math.min(1, p.hp / p.maxHp)); },
    isInvulnerable(p) { return p.invuln > 0; },
    canUlt(p) { return p.energy >= HX.BAL.energy.max && p.ultCd <= 0; },
    isGuardActive(p) { return p.guardTimer > 0; },
    isDashing(p) { return p.dashing && p.dashTimer > 0; }
  };

  HX.Player = Player;
  HX.makePlayer = function (skinId, x, y) { return Player.init(null, skinId, x, y); };
})();
