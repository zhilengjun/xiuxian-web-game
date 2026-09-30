// 战斗数值表（GDD §6.1 / §8 / §9 / §10 / §14 / §15 及附录 A）。
// 边界划分（避免同一数值出现两处）：
//   constants.js —— 尺度/尺寸/结构常量（地图、分辨率、固定步长、实体外观与碰撞半径、
//                   石柱坐标、相机死区、边界内距、玩家移速、弹幕速度开关、立绘尺寸）
//   balance.js   —— 战斗规则数值（生命、经验与升级、大招能量、护身技与掉落、接触/无敌冷却、冲刺）
//   enemies.js / boss.js / waves.js —— 各实体与关卡数值
//   skins.js     —— 三套皮肤技能数值
//
// 单位：**全部为 px**（距离/半径）与 px/s（速度）；时间类为秒。详见 config/constants.js 头注释。
// 全部数值来自 GDD；**GDD 未给出的细节数值由设计者授权先暂定**（标注「暂定」），可随时调。
(function () {
  const HX = window.HX || (window.HX = {});

  HX.BAL = {
    // ---- 玩家（GDD §14 碰撞规则 / §15 胜负判定） ----
    player: {
      // 暂定 200（GDD 原未定义）。粗算依据：一局要挨 3 轮共 12 只小怪 + 多阶段 BOSS，
      // 主要伤害为 蛛 15 / 术 8~10 / BOSS 接触 20 / 地火 25 / 追踪弹 10；
      // 200 点约等于能挨 13 下蛛咬或 10 次地火，留出走位容错。改动只动这一处。
      maxHp: 200,
      contactCd: 0.5,   // 接触伤害冷却（GDD §14）
      iframe: 0.5       // 受伤后无敌时间（GDD §14）
    },

    // ---- 冲刺（GDD §6.1：非闪避、无 i-frame） ----
    // 【2026-09-15 设计者指示】冷却 3 → 1 秒；冲刺速度加倍（1344 → 2688）。
    // ⚠ 由此位移 = 2688 × 0.22 ≈ 591px ≈ 7 身位，超出 GDD §6.1 原定的 3~4 身位 ——
    //   若想保持原位移，把 time 减半（0.22 → 0.11）即可，待设计者拍板。
    dash: {
      cd: 1.0,          // 冷却 1 秒（原 3 秒）
      speed: 2688,      // px/s（原 1344 的 2 倍）
      time: 0.22,
      passThrough: true // 位移期间可穿越小怪（GDD §6.1）
    },

    // ---- 经验与升级（GDD §8） ----
    exp: {
      spider: 25,       // 血魔蛛每杀 +25
      wizard: 50,       // 邪修术士每杀 +50
      boss: 0,          // BOSS 不直接给经验
      // 累计阈值，下标 = 目标等级 - 1：Lv1 起点 0 / →2 需 750 / →3 1750 / →4 3000 / →5 4250
      // （2026-09-16 设计者指示：随刷怪三调等比放大并保持原升级节奏 ——
      //   第 1 轮末 Lv2、第 2 轮末 Lv3、第 3 轮清完满级「见 BOSS 即满级」，曲线形状不变。
      //   Lv5 = 4250 而非名义 4500：击杀补怪固定补蜘蛛（25 exp），最坏吃掉全部 10 个术士
      //   配额（50→25）时实际总经验下限 = 4250，阈值取下限保证任何局面第 3 轮必满级）
      cumulative: [0, 750, 1750, 3000, 4250],
      maxLevel: 5
    },

    // ---- 大招能量（GDD §10） ----
    energy: {
      max: 100,
      onHit: 5,         // 命中 +5
      onHitCd: 0.5,     // 每 0.5 秒最多一次（多目标也只算一次）
      onHurt: 5,        // 受伤 +5
      onHurtCd: 1.0,    // 每 1 秒最多一次（只算实际扣血）
      // 2026-09-16 设计者指示：去掉所有大招 CD —— 大招仅由能量门控（攒满 100 即可放）
      // 自洽校验：纯命中 5/0.5s = 10/s → 10s 满；纯受伤 5/1s = 5/s → 20s 满（GDD §10 ✔）
      excludeSources: ['guard', 'ult'] // 护身技伤害、大招伤害不积累能量
    },

    // ---- 护身技与护身灵石（GDD §9） ----
    guard: {
      duration: 10,      // 生效 10 秒（原 15；2026-09-16 设计者指示；重复拾取只刷新，不叠加）
      refreshOnly: true,
      dropChance: 0.3,   // 小怪死亡 30% 掉落
      // BOSS 每掉 25% 血掉 1 个（9000 ÷ 4 = 2250 一档）
      // 说明：名义 4 个的第 4 个落在血量归零瞬间，实际取不到 → 实现按 75% / 50% / 25% 三次掉落。
      bossDropAt: [0.75, 0.5, 0.25],
      bossDropNominal: 4
    },

    // ---- 小怪（GDD §14） ----
    enemy: {
      // 小怪之间**无硬碰撞**，只有"轻微分离力"避免完全重叠（GDD §14 原文）。
      // 实现为位置修正而非力：位移 = min(穿透深度, maxPush) × strength × dt（与帧率无关，无弹开抖动）。
      separation: {
        strength: 9.0,    // 暂定：分离速度系数（/秒）
        maxPush: 4.6      // 暂定：单步最大分离位移（px）—— 随实体尺度 ÷3
      },
      // 自爆型小怪（血魔蛛）自爆后是否给经验：**不给**。
      // 理由：GDD §8 只说"击杀"给经验，自爆是它自己炸的；玩家没在它贴到脸之前打掉它，就拿不到经验与掉落。
      suicideGivesExp: false
    },

    // ---- 拾取（GDD §9 / §14） ----
    pickup: {
      range: 126,        // 拾取范围（= 1.5 身位，1 身位 = 玩家直径 84px）
      auto: true,        // 自动拾取
      magnet: false      // 是否吸附飞行（GDD 未要求吸附，保持"走到即拾"）
    },

    // ---- 关卡时长期望（GDD：单局 3~5 分钟） ----
    session: { minSec: 180, maxSec: 300 },

    // ---- 同屏容量上限（对象池，README §9：同屏实体封顶，防雪崩） ----
    capacity: { bullet: 900, effect: 420 },

    // ---- 打击反馈开关（纯表现；关掉不影响任何数值与判定） ----
    feedback: { damageText: true, hitSpark: true }
  };

  // 便捷：按累计经验求等级（1~5）
  HX.BAL.levelFromExp = function (exp) {
    const t = HX.BAL.exp.cumulative;
    let lv = 1;
    for (let i = 0; i < t.length; i++) if (exp >= t[i]) lv = i + 1;
    return lv;
  };

  // 便捷：返回「当前等级已累计的经验 / 升到下一级所需」的比例（HUD 经验条用）
  HX.BAL.expRatio = function (exp) {
    const t = HX.BAL.exp.cumulative, max = HX.BAL.exp.maxLevel;
    let lv = HX.BAL.levelFromExp(exp);
    if (lv >= max) return 1;
    const base = t[lv - 1], next = t[lv];
    return Math.max(0, Math.min(1, (exp - base) / (next - base)));
  };
})();
