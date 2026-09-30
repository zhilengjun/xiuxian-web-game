// BOSS：吞天老祖（GDD §13 全文）。
// 只放数据：阶段机、弹幕模式、石柱点燃、狂暴判定在 src/systems/boss.js。
// 单位：**全部为 px**（半径/距离）与 px/s（速度），详见 config/constants.js 头注释。
// 数值标注：「暂定」= GDD 未给，设计者授权先定；弹速统一引用 HX.C.BULLET_SPEED（单点开关）。
(function () {
  const HX = window.HX || (window.HX = {});

  HX.BOSS = {
    id: 'boss',
    name: '吞天老祖',
    spriteKey: 'boss',

    // ---- §13.1 基础 ----
    hp: 9000,            // GDD 标注为「工作预估，待无头 sim 调参」；实现直接取此值（AGENTS §1）
    speed: 128,          // 移速（= 玩家 640 的 20%；玩家已降为 1/2，BOSS 未动）
    visualR: 126,        // GDD §3.2：外观半径 126px（立绘宽度 = 直径 252px，随实体尺度 ÷3）
    solidR: 88.2,        // = 0.7 × 外观半径（GDD §14）
    exp: 0,              // BOSS 不直接给经验（GDD §8）
    // 接触伤害 20，冷却 1 秒；玩家不可穿过 BOSS（GDD §13.1 / §14）
    contact: { dmg: 20, cd: 1.0, solid: true },
    // GDD 只给了移速、未说明是否主动追玩家；暂定「缓慢逼近玩家」以制造接触压力。
    // 若设计意图是「近乎站桩」，把 chase 改为 false 即可（一行）。
    behavior: { chase: true, keepOutOfRange: false },

    // BOSS 战同屏小怪上限（2026-09-16 设计者指示：BOSS 轮上限 15）——
    // 召唤时若场上已达上限则本次跳过（下个召唤周期再试）
    summonCap: 15,

    // ---- §13.2 普通阶段（100% ~ 65% 血） ----
    normal: {
      interval: 4.0,                          // 每 4 秒放一次
      rotation: ['ring', 'fan', 'groundfire'],// 三种轮换
      ring: {
        id: 'ring',
        count: 14,                            // 14 发
        dmg: 10,
        speed: HX.C.BULLET_SPEED,             // GDD 只写「中速」未给弹速 → 随统一值
        life: 8.0,
        leavesGap: true,                      // 「留缝隙」：环形留一段缺口的旋转角
        gapDeg: 34                            // 暂定：缝隙宽度 34°（GDD 未给）
      },
      fan: {
        id: 'fan',
        count: 5,                             // 5 发
        dmg: 12,
        spreadDeg: 60,                        // 散布 60°，瞄准玩家
        speed: HX.C.BULLET_SPEED,             // GDD 只写「中快」未给弹速 → 随统一值
        life: 6.0,
        aimAtPlayer: true
      },
      groundfire: {
        id: 'groundfire',
        count: 3,                             // 3 个红圈预警
        delay: 1.0,                           // 延迟 1 秒
        dmg: 25,
        r: 384,                               // 半径 384px
        placeAround: 'player'                 // 落点围绕玩家（GDD 未明确落点规则，暂定）
      },
      // 召唤小怪：开局 5 秒第一波，之后每 12 秒一波，每波 3~5 只，混合两种
      summon: { first: 5.0, every: 12.0, countMin: 3, countMax: 5, mix: ['spider', 'wizard'] }
    },

    // ---- §13.3 石柱阶段（65% 血触发，2026-09-16 设计者指示：50% → 65%） ----
    pillarPhase: {
      triggerAt: 0.65,                        // 血量 ≤65% 触发
      // 召唤施法（2026-09-16 设计者指示加强）：BOSS 原地不动 + 无敌 + 身上发光，
      // 持续 time 秒；石柱同步从地面升起（单轴缩放 0→1，时长 = 石柱 emergeTime）；
      // 施法期间相机在 20px 范围内随机震动（原 100，2026-09-16 设计者指示 ÷5；
      // shake 幅值/时长 = ampPx/time），结束还原位置。
      cast: { time: 2.0, ampPx: 20 },
      summon: { every: 15.0, countMin: 2, countMax: 4, mix: ['spider', 'wizard'] }, // 每 15 秒 2~4 只
      tracking: {
        id: 'tracking',
        // ⚠⚠ 与 GDD 冲突，务必留意：GDD §13.3 原定追踪弹速度为「玩家 80% = 1024px/s」，
        //    而设计者 2026-09-15 指示「弹速先都按 512px/s」→ 此处随统一值（= 玩家 40%）。
        //    石柱机制的张力全靠这颗弹（「可躲但有压力」、认真玩约 80% 通过率），
        //    若后续觉得「点柱几乎不会发生、机制形同虚设」，把本行改为下面第二行即可恢复 GDD 原值：
        //      speed: HX.C.PLAYER.speed * 0.8,   // = 1024px/s（GDD §13.3 原值）
        speed: HX.C.BULLET_SPEED,
        turnRate: 1.2,                        // 「轻微追踪」：缓慢转向玩家（暂定转向速率 rad/s）
        life: 8.0,                            // 存在 8 秒
        cd: 8.0,                              // 冷却 8 秒
        dmg: 10,
        igniteOnHit: true,                    // 命中玩家 → 从玩家身上飞出火球点燃一根未点燃石柱
        igniteDelay: 0.35,                    // 暂定：火球飞行时长（表现）
        igniteTarget: 'nearestUnlit'          // 取最近的未点燃石柱（GDD 未指定选柱规则，暂定）
      },
      // 4 个石柱全部点燃 → 进入狂暴（GDD §13.3 / §13.4）
      pillarCount: 4
    },

    // ---- §13.4 狂暴 ----
    enrage: {
      invincible: true,                       // BOSS 无敌
      scale: 1.5,                             // 体型放大 1.5 倍
      screenFlash: { color: '#ff2b2b', alpha: 0.78 },
      shake: { amp: 26, dur: 1.5 },           // 震动（px 幅值）
      // 地面大量地火预警：几乎全屏、延迟 1 秒、伤害极高、几乎无法躲
      groundfire: {
        count: 46,                            // 覆盖率接近全屏（46 × r409.6 覆盖 5760×3240 的场地）
        delay: 1.0,
        dmg: 200,                             // 「伤害极高」；实际上此时已在 1.5s 演出末尾直接判负
        r: 409.6,
        duration: 2.5
      },
      delay: 1.5                              // 演出 1.5 秒后直接判负（GDD §13.4）
    },

    // 阶段枚举（系统层与渲染层共用，避免散落字符串）
    PHASE: { NORMAL: 'normal', PILLAR: 'pillar', ENRAGE: 'enrage' }
  };
})();
