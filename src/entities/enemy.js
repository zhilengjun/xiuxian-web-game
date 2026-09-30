// 小怪实体（血魔蛛 / 邪修术士）——纯数据 + 极薄只读方法。
// 数值全部取自 config/enemies.js；
// **行为（追击 / 风筝 / 开火 / 自爆前摇推进 / 麻痹）在 src/systems/enemy.js**（AGENTS §5）。
// 对象可复用：用 HX.Enemy.init(e, typeId, x, y) 重置后入池（README §9 对象池）。
(function () {
  const HX = window.HX || (window.HX = {});

  const Enemy = {
    init(e, typeId, x, y) {
      const def = HX.ENEMIES[typeId];
      if (!def) throw new Error('[HX] 未知小怪类型：' + typeId);
      const o = e || {};

      o.kind = 'enemy';
      o.typeId = def.id;
      o.name = def.name;
      o.etype = def.kind;              // 'melee' | 'ranged'
      o.uid = 0;                       // 唯一 id，由 systems/world.js 的 spawnEnemy 赋值（弹幕去重用）

      o.pos = o.pos || { x: 0, y: 0 };
      o.vel = o.vel || { x: 0, y: 0 };
      o.facing = o.facing || { x: 1, y: 0 };
      o.side = 1;              // 视觉朝向（±1，右/左）—— 只做左右两侧，systems 在有水平移动时更新（GDD §3.3）
      o.pos.x = x || 0;
      o.pos.y = y || 0;
      o.vel.x = 0; o.vel.y = 0;

      // 尺寸与数值（GDD §3.2 / §11）
      o.visualR = def.visualR;         // 外观半径 64px（立绘宽度 = 直径 128px）
      o.solidR = def.solidR;           // 碰撞半径 44.8px（= 0.7×，GDD §14）
      o.hp = def.hp;
      o.maxHp = def.hp;
      o.speed = def.speed;
      o.exp = def.exp;
      o.dropChance = def.dropChance;
      o.behavior = def.behavior;
      o.attack = def.attack;

      // 运行时状态（只存状态，推进逻辑在 systems/enemy.js）
      o.atkTimer = def.kind === 'ranged' ? def.attack.interval : 0; // 出场后先等一个间隔再开火
      o.patternIndex = 0;              // 邪修：两种弹幕交替指针
      o.telegraph = 0;                 // 血魔蛛：自爆前摇倒计时（>0 表示正在蓄爆）
      o.telegraphing = false;
      o.paraTimer = 0;                 // 雷池麻痹剩余时间（GDD §7.3）
      o.hitFlash = 0;                  // 受击闪白（纯表现）
      o.bornAt = 0;                    // 出场时刻（world.time），用于出场表现
      o.alive = true;
      return o;
    },

    // ---- 只读派生量 ----
    isAlive(e) { return e.hp > 0; },
    hpRatio(e) { return Math.max(0, Math.min(1, e.hp / e.maxHp)); },
    isParalyzed(e) { return e.paraTimer > 0; },
    isTelegraphing(e) { return e.telegraphing && e.telegraph > 0; },
    isRanged(e) { return e.etype === 'ranged'; }
  };

  HX.Enemy = Enemy;
  HX.makeEnemy = function (typeId, x, y) { return Enemy.init(null, typeId, x, y); };
})();
