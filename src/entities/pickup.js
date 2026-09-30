// 护身灵石实体（GDD §9 护身技机制）。
// 特性（GDD §7 / §9 / §14）：无碰撞、自动拾取、拾取范围 1.5u（见 config/balance.js pickup）。
// 掉落来源：小怪死亡 30%（GDD §9）；BOSS 每掉 25% 血掉 1 个（掉落节点见 balance.bossDropAt）。
// 注意：拾取后**只是刷新护身技持续时间，不叠加**（GDD §9），该规则由 systems/skill.js 执行。
(function () {
  const HX = window.HX || (window.HX = {});

  const PICKUP_TYPES = {
    guardStone: {
      id: 'guardStone',
      name: '护身灵石',
      visualR: 25.2,     // 暂定：外观半径 25.2px（随实体尺度 ÷3；GDD 未给尺寸）
      spriteKey: 'pickup',
      life: 999,         // 不自动消失（GDD 未给消散时间；设为长期存在，避免"漏捡就没了"）
      bobAmp: 0.05,      // 上下浮动幅度（按**立绘高度的比例**表达，与尺寸解耦）
      bobSpeed: 3.0
    }
  };

  const Pickup = {
    types: PICKUP_TYPES,

    init(p, typeId, x, y) {
      const def = PICKUP_TYPES[typeId] || PICKUP_TYPES.guardStone;
      const o = p || {};
      o.kind = 'pickup';
      o.typeId = def.id;
      o.name = def.name;
      o.pos = o.pos || { x: 0, y: 0 };
      o.pos.x = x;
      o.pos.y = y;
      o.r = def.visualR;
      o.life = def.life;
      o.age = 0;
      o.bobAmp = def.bobAmp;
      o.bobSpeed = def.bobSpeed;
      o.phase = 0;             // 浮动相位（由 world 用种子 RNG 赋初值，避免同步呼吸）
      o.alive = true;
      return o;
    },

    // 仅判断，不执行拾取（写入由 systems/skill.js 做）
    inRange(p, x, y, range) {
      const dx = p.pos.x - x, dy = p.pos.y - y;
      const r = range === undefined ? HX.BAL.pickup.range : range;
      return dx * dx + dy * dy <= r * r;
    },

    isExpired(p) { return p.age >= p.life; }
  };

  HX.Pickup = Pickup;
  HX.makePickup = function (typeId, x, y) { return Pickup.init(null, typeId, x, y); };
})();
