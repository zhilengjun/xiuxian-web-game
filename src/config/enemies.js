// 敌方单位数值表（GDD §11 敌方单位）。
// 只放数据：行为规则在 src/systems/enemy.js，实体构造在 src/entities/enemy.js。
// 单位：**全部为 px**（半径/距离）与 px/s（速度），详见 config/constants.js 头注释。
// 数值标注：「暂定」= GDD 未给，设计者授权先定；弹速统一引用 HX.C.BULLET_SPEED（单点开关）。
(function () {
  const HX = window.HX || (window.HX = {});

  // 弹幕通用字段说明：
  //   speed  px/s ｜ life 存活秒数 ｜ dmg 伤害 ｜ turnRate 追踪转向速率(rad/s) ｜ spreadDeg 扇形总散布角
  HX.ENEMIES = {
    // ---- 血魔蛛（近战，GDD §11.1） ----
    spider: {
      id: 'spider',
      name: '血魔蛛',
      kind: 'melee',
      spriteKey: 'spider',        // 侧视立绘查表用（config/constants.js VISUAL）
      hp: 30,
      // 2026-09-15 设计者指示：血魔蛛移速两次下调（1152 → 288 → **144**，累计 1/8）。
      speed: 144,
      visualR: 21,                // GDD §3.2：外观半径 21px（立绘宽度 = 直径 42px）
      solidR: 14.7,               // = 0.7 × 外观半径（GDD §14 合规区间）
      exp: 25,                    // GDD §8
      dropChance: 0.3,            // GDD §9：30% 掉护身灵石
      // 直线追玩家，不绕路（GDD §11.1）
      behavior: { type: 'chase', avoidOverlap: true }, // 小怪之间无硬碰撞，仅轻微分离力（GDD §14）
      // 接触自爆：伤害 15，前摇 0.5 秒变红闪烁（GDD §11.1）
      attack: {
        type: 'suicide',
        dmg: 15,
        telegraph: 0.5,           // 进入接触后的起爆前摇
        range: 50.4               // 触发前摇的接触距离（≈ 两实体外观/判定半径之和，随实体尺度 ÷3）
      },
      hitIframe: 0,               // 被弹幕命中不进入无敌（多段弹幕可连续打）
      damageFlash: 0.08           // 受击闪白时长（表现）
    },

    // ---- 邪修术士（远程，GDD §11.2） ----
    wizard: {
      id: 'wizard',
      name: '邪修术士',
      kind: 'ranged',
      spriteKey: 'wizard',
      hp: 50,
      // 2026-09-15 设计者指示：邪修术士移速降为原本的 1/2（512 → 256）。
      speed: 256,
      visualR: 21,
      solidR: 14.7,
      exp: 50,
      dropChance: 0.3,
      // 与玩家保持 6~8 身位（1 身位 = 玩家直径 84px → 504~672px）；太近后退、太远靠近
      // stayInView（2026-09-15 设计者补充）：术士**自己的移动**不走出当前屏幕外；
      //   由玩家移动带动镜头导致的出屏**不回拉**（systems 只约束"本次位移"，不追镜头）。
      //   viewMargin：贴边内距（暂定 24px）。
      behavior: { type: 'kite', keepMin: 504, keepMax: 672, stayInView: true, viewMargin: 24 },
      attack: {
        type: 'alternate',        // 每 2 秒交替两种弹幕（GDD §11.2）
        interval: 2.0,
        // 2026-09-15 设计者指示：邪修术士**弹速降为统一弹速的 2/3**（512 → ≈341px/s），
        // **弹幕尺寸降为原敌方弹幕的 1/3**（16.8/10.08 → 5.6/3.36）。
        // 因此不再引用 BULLET_SPEED 单点开关，改用下面的独立值（见 test_config 的对应断言）。
        speed: HX.C.BULLET_SPEED * 2 / 3,
        size: { visualR: 5.6, solidR: 3.36 },
        pattern: [
          { id: 'track', count: 1, dmg: 10, life: 6.0, turnRate: 1.1 }, // 追踪弹 1 发
          { id: 'fan', count: 3, dmg: 8, spreadDeg: 45, life: 6.0 }     // 扇形 3 发，散布 45°
        ],
        // 暂定：GDD 只写「追踪弹/扇形弹」，未给追踪强度；turnRate 1.1rad/s 为暂定
        aimAtPlayer: true         // 是否朝玩家方向发射（GDD：扇形弹未明确指向；取朝向玩家）
      },
      hitIframe: 0,
      damageFlash: 0.08
    }
  };

  // 两种小怪混合出场的默认配比（具体每轮数量见 config/waves.js）
  HX.ENEMY_ORDER = ['spider', 'wizard'];
})();
