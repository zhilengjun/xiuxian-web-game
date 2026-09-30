// 三套皮肤全套技能配置（GDD §7 角色与皮肤 / §8 普通技能升级 / §9 护身技 / §10 大招）。
// 原则（AGENTS §3）：所有数值在此声明，逻辑层只读不写；改数值不动逻辑。
//
// 字段说明：
//   identity    皮肤身份（换肤界面用；GDD §7 定位/外观原文）
//   normal      普通技能：levels[] 为「已解析」的 1~5 级完整数值（运行时直接按 lv-1 取，不做累加推算）
//               progression[] 为 GDD §8 的等级表原文，供换肤界面展示
//   guard       护身技（GDD §7 / §9）：拾取灵石后生效 15s，重复拾取只刷新不叠加
//   ult         大招（GDD §7 / §10）：能量满 + 冷却好时按 R 释放
//
// 单位：**全部为 px**（射程 / 半径 / 长度 / 宽度等长度量），速度类为 px/s。详见 config/constants.js 头注释。
// 数值标注约定：
//   无标注   = GDD 明文给出的定稿值
//   「暂定」 = GDD 未给，设计者授权先暂定（可随时改，不阻塞开发）
//   弹速     = 统一引用 HX.C.BULLET_SPEED（当前 512 px/s，单点开关，改一行全生效）
(function () {
  const HX = window.HX || (window.HX = {});

  const SKINS = {
    // ================= 御剑飞仙（默认皮肤，GDD §7.1） =================
    yujian: {
      id: 'yujian',
      name: '御剑飞仙',
      pos: '高攻速 · 高射程 · 单体持续输出',
      look: '蓝白道袍 · 青霄飞剑 · 青色剑气拖尾',
      color: 'yujian',
      normal: {
        name: '御剑术',
        desc: '高速超远程飞剑，自动锁敌',
        speed: HX.C.BULLET_SPEED,          // GDD 只写「高速」未给弹速 → 暂按统一弹速
        // 2026-09-15 设计者指示：**飞剑尺寸降为原玩家弹幕的 1/2**（12.6/8.4 → 6.3/4.2）。
        // 只作用于御剑的飞剑；南明火球 / 九霄雷球仍用通用玩家弹幕尺寸（PBULLET）。
        bullet: { visualR: 6.3, solidR: 4.2 },
        levels: [
          // 2026-09-16 设计者调参（二次）：数量 1~5、伤害 10/11/12/13/15、频率 1.0/1.1/1.3/1.6/2.0
          { lv: 1, count: 1, dmg: 10, rate: 1.0, range: 3072 },
          { lv: 2, count: 2, dmg: 11, rate: 1.1, range: 3072 },
          { lv: 3, count: 3, dmg: 12, rate: 1.3, range: 3072 },
          { lv: 4, count: 4, dmg: 13, rate: 1.6, range: 3072 },
          { lv: 5, count: 5, dmg: 15, rate: 2.0, range: 3072 }
        ],
        progression: [
          'Lv1 — 1 把飞剑，伤害 10，攻速 1.0，射程 3072',
          'Lv2 — 2 把飞剑，伤害 11，攻速 1.1',
          'Lv3 — 3 把飞剑，伤害 12，攻速 1.3',
          'Lv4 — 4 把飞剑，伤害 13，攻速 1.6',
          'Lv5 — 5 把飞剑，伤害 15，攻速 2.0'
        ]
      },
      guard: {
        name: '本命法剑',
        desc: '3 把本命飞剑绕身旋转 1 秒/圈，持续 10 秒，范围内敌人每圈受到接触伤害 25（按圈结算）',
        duration: 10, orbitPeriod: 1.0, count: 3, dmg: 25,
        // orbitR 292.5（2026-09-16 设计者指示：65 → 195 → ×1.5 = 292.5）。
        // ⚠ 命中判定为「剑巡飞圆盘」（轨道半径 + 剑触及 10，见 skill.js guardOrbit）——
        //   圆盘内目标每圈各吃一次伤害；改半径无需改判定口径。
        orbitR: 292.5
      },
      ult: {
        name: '万剑归宗',
        desc: '20 把飞剑现身于身周 200px 内，停顿 0.5 秒后每 0.1 秒 1 把弧线飞出并锁定敌人（范围内无敌人则直飞），每把伤害 50；飞剑命中后不消失，可穿透继续命中（同一目标只结算一次）',
        count: 20, dmg: 50,
        // 2026-09-16 设计者指示（v2）：20 把同时出现在角色周围 200px 内随机位置，
        //   悬停 0.5s 后每 0.1s 飞出 1 把；飞行弧线更大；CD 全部移除（仅能量门控）
        // speedMul 1.5（同日三调：0.5 → 1.0 → 1.5，13:18 设计者指示 ×1.5）
        // turnRate 5.0（13:28 设计者指示「提速后追踪加强」）：转弯半径 r = v/ω，
        //   速度 ×1.5 后若仍用 2.5，半径从 205 恶化到 307；5.0 → r≈154，比提速前咬得更紧
        // pierce 20（2026-09-16 设计者反馈「对一群小怪效果不好」）：命中即消失导致
        //   过度击杀浪费（蜘蛛 30 血吃 50 伤）+ 群伤全空。启用穿透（弹幕系统原生支持），
        //   命中后继续飞行收割（hitIds 防同一目标重复结算），20 ≈ 全程不消失
        hover: 0.5, interval: 0.1, spawnR: 200, speedMul: 1.5, turnRate: 5.0, pierce: 20,
      }
    },

    // ================= 南明离火（GDD §7.2） =================
    nanming: {
      id: 'nanming',
      name: '南明离火',
      pos: '中距离范围输出 · 清场 · 封路',
      look: '红金道袍 · 离火珠 · 火焰粒子',
      color: 'nanming',
      normal: {
        name: '离火术',
        desc: '中低速中远程火球，多方向，命中范围爆炸',
        speed: HX.C.BULLET_SPEED,
        explode: true,
        levels: [
          // 2026-09-16 设计者调参：size = 火球大小倍率（1x 为当前基准），数量列不再对外展示；
          // 二次调参：伤害 15/16/18/21/25、频率 0.6/0.7/0.8/0.9/1.0
          { lv: 1, count: 6, dmg: 15, rate: 0.6, radius: 384, range: 2048, size: 1.0 },
          { lv: 2, count: 6, dmg: 16, rate: 0.7, radius: 384, range: 2048, size: 1.1 },
          { lv: 3, count: 6, dmg: 18, rate: 0.8, radius: 563.2, range: 2048, size: 1.3 },
          { lv: 4, count: 6, dmg: 21, rate: 0.9, radius: 563.2, range: 2048, size: 1.6 },
          { lv: 5, count: 8, dmg: 25, rate: 1.0, radius: 563.2, range: 2048, size: 2.0 }
        ],
        progression: [
          'Lv1 — 6 向火球，伤害 15，爆炸半径 384，攻速 0.6，大小 1x',
          'Lv2 — 伤害 16，攻速 0.7，大小 1.1x',
          'Lv3 — 爆炸半径 563（质变·范围），大小 1.3x',
          'Lv4 — 伤害 21，攻速 0.9，大小 1.6x',
          'Lv5 — 8 向火球（质变·数量），伤害 25，攻速 1.0，大小 2x'
        ]
      },
      guard: {
        name: '踏焰留痕',
        desc: '持续 10 秒；移动时在地面留下火焰痕迹，痕迹存在 3 秒，每 0.5 秒伤害 15',
        duration: 10, trailLife: 3, tickEvery: 0.5, tickDmg: 15,
        dropEvery: 0.12,                   // 暂定：每 0.12s 落一枚，近似连续火痕（GDD 未给）
        trailR: 67.2                       // 暂定：痕迹半径（随实体尺度 ÷3；GDD 未给）
      },
      ult: {
        name: '火凤燎原',
        desc: '火凤凰从屏幕一侧飞入、3 秒横贯屏幕（方向随机），768×768，碰到敌人每 0.2 秒造成 100 伤害',
        // 2026-09-16 设计者指示（v2）：火凤凰从视口一侧进入、水平飞行 3 秒穿屏（左进右出或右进左出随机）；
        // 768×768 碰撞盒，接触期间每 0.2s 对盒内敌人造成 100 伤害（tick 结算，非一次性）
        crossTime: 3, size: 768, dmg: 100, tickEvery: 0.2
      }
    },

    // ================= 九霄神雷（GDD §7.3） =================
    jiuxiao: {
      id: 'jiuxiao',
      name: '九霄神雷',
      pos: '中距离群伤 · 控制 · 传导',
      look: '紫黑道袍 · 雷印 · 电弧闪烁',
      color: 'jiuxiao',
      normal: {
        name: '雷链术',
        desc: '中低速，中范围，传导数量不限，伤害递减',
        speed: HX.C.BULLET_SPEED,
        chain: true,
        levels: [
          // 2026-09-16 设计者调参：chainRange（链接/传导范围）200/250/350/500/800px；
          // 二次调参：伤害 16/17/19/22/26、频率 0.6/0.7/0.8/0.9/1.0、传导衰减统一 0.5（传导伤害 = 直击一半）
          { lv: 1, count: 1, dmg: 16, rate: 0.6, chainRange: 200, decay: 0.5, range: 2304 },
          { lv: 2, count: 1, dmg: 17, rate: 0.7, chainRange: 250, decay: 0.5, range: 2304 },
          { lv: 3, count: 1, dmg: 19, rate: 0.8, chainRange: 350, decay: 0.5, range: 2304 },
          { lv: 4, count: 1, dmg: 22, rate: 0.9, chainRange: 500, decay: 0.5, range: 2304 },
          { lv: 5, count: 1, dmg: 26, rate: 1.0, chainRange: 800, decay: 0.5, range: 2304 }
        ],
        progression: [
          'Lv1 — 伤害 16，链接范围 200，传导伤害减半，攻速 0.6',
          'Lv2 — 伤害 17，链接范围 250，攻速 0.7',
          'Lv3 — 伤害 19，链接范围 350，攻速 0.8',
          'Lv4 — 伤害 22，链接范围 500，攻速 0.9',
          'Lv5 — 伤害 26，链接范围 800，攻速 1.0'
        ]
      },
      guard: {
        name: '雷池',
        desc: '持续 10 秒；半径 512，每 1 秒落雷造成 20 伤害，50% 几率麻痹小怪 1 秒',
        duration: 10, radius: 512, tickEvery: 1.0, dmg: 20, paralyzeChance: 0.5, paralyze: 1.0
        // dmg 20（2026-09-16 设计者指示；此前暂定 10）
      },
      ult: {
        name: '雷霆万钧',
        desc: '锁定屏幕范围内的目标（BOSS 优先），20 道雷霆每 0.2 秒一道落在目标处（±50px 随机），每道伤害 100，同一目标最多吃 10 道',
        // 2026-09-16 设计者指示（v3）：20 道间隔 0.2s 分批落下（队列驱动，确定性不变）；
        // 落点 = 目标当前位置 ± jitterR 随机（不正对）；同一目标每次施放最多吃 maxHits 道；
        // 每道动画连播两次（第二次 delay = 第一次 life）；strikeR = 单道雷命中半径（暂定 128）
        count: 20, dmg: 100, interval: 0.2, jitterR: 50, strikeR: 128, maxHits: 10
      }
    }
  };

  HX.SKINS = SKINS;
  HX.SKIN_ORDER = ['yujian', 'nanming', 'jiuxiao'];
  HX.DEFAULT_SKIN = 'yujian';

  // 便捷取值：按皮肤 id + 等级(1~5) 取普通技能已解析数值
  HX.skillAt = function (skinId, level) {
    const s = SKINS[skinId] || SKINS[HX.DEFAULT_SKIN];
    const lv = Math.max(1, Math.min(5, level | 0 || 1));
    return s.normal.levels[lv - 1];
  };
})();
