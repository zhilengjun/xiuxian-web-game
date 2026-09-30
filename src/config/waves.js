// 关卡波次表（GDD §12 关卡流程）。
// 只放数据：调度逻辑在 src/systems/spawn.js。
// 单位：**全部为 px**（距离），详见 config/constants.js 头注释。
// 数值标注：「暂定」= GDD 未给，设计者授权先定、可随时调（不阻塞开发）。
(function () {
  const HX = window.HX || (window.HX = {});

  HX.WAVES = {
    // 小怪 3 轮，每轮结束自动开始下轮（GDD §12）。
    // 2026-09-16 设计者指示（三调）：
    //   总数 —— 1 轮蛛 30 + 术 2；2 轮蛛 50 + 术 3；3 轮蛛 80 + 术 5；
    //   cap  = 同屏小怪上限（10/15/20）：时间刷新与击杀补怪都不得越过；
    //   击杀补怪 —— 场上每死一只，立即补一只（消耗本轮剩余配额），保持场上尽量贴近上限。
    rounds: [
      { round: 1, spider: 30, wizard: 2, cap: 10 },
      { round: 2, spider: 50, wizard: 3, cap: 15 },
      { round: 3, spider: 80, wizard: 5, cap: 20 }
    ],

    // ---- 刷怪调度（GDD 只给"3 轮 + 配比"，未给节奏，以下全部暂定；单位：秒） ----
    startDelay: 1.2,          // 进关到第 1 轮开始的小缓冲
    interval: 0.7,            // 同一轮内相邻两只小怪的时间刷新间隔（受 cap 约束）
    betweenRounds: 1.8,       // 轮与轮之间的间隙
    afterLastRound: 2.0,      // 第 3 轮清完 → 吞天老祖登场的间隙

    // ---- 刷怪位置 ----
    // 不在玩家脚下生怪：与玩家至少保持 spawnMinDist（身位口径，1 身位 = 玩家直径 84px）
    spawnMinDist: 336,        // 4 身位
    spawnMaxDist: 756,        // 9 身位；上限保证怪能合理进场（≈0.4 屏内）
    spawnInView: true,        // 倾向刷在玩家附近可见范围内，避免"空场找不到怪"
    edgeMargin: 100.8,        // 距地图边界的内距，防止贴墙生成
    // 玩家靠近地图角落时，环形候选点会被 edgeMargin 夹取、导致离玩家变近。
    // 因此最多重投 spawnTries 次，取第一个"夹取后仍 ≥ spawnMinDist"的点（暂定 8 次）。
    spawnTries: 8,

    // ---- 经验自洽校验（GDD §8） ----
    // 小怪总经验 = 160×25 + 10×50 = 4500（三调后）；Lv5 阈值 360 → 第 1 轮即满级
    expectedTotalExp: 4500
  };

  // 便捷：本轮小怪总数 / 经验总量（HUD 与测试用）
  HX.WAVES.roundTotal = function (round) {
    const r = HX.WAVES.rounds[round - 1];
    return r ? (r.spider + r.wizard) : 0;
  };
  HX.WAVES.roundExp = function (round) {
    const r = HX.WAVES.rounds[round - 1];
    if (!r) return 0;
    const E = HX.ENEMIES;
    return r.spider * E.spider.exp + r.wizard * E.wizard.exp;
  };
  HX.WAVES.allExp = function () {
    let sum = 0;
    for (let i = 1; i <= HX.WAVES.rounds.length; i++) sum += HX.WAVES.roundExp(i);
    return sum;
  };
})();
