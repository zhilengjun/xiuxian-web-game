// 单元测试 · config schema（README §8）：数值自洽与字段齐全性。
// 目的：把 GDD 的「尺度定稿」「碰撞半径 0.7×」「单位统一为 px」等硬约束变成可回归的断言，
//       后续误改一处常量会立刻红，不必靠肉眼比对文档。
(function () {
  const HX = window.HX;
  const C = HX.C;

  // ================= 单位（2026-09-15 变更：u → px） =================

  HX.test('单位：u 层已彻底移除，全项目统一 px', function () {
    HX.assert(C.PX_PER_UNIT === undefined, 'PX_PER_UNIT 应已删除（不再有 u→px 换算）');
    HX.assert(C.u2px === undefined && C.px2u === undefined, 'u2px / px2u 换算函数应已删除');
    HX.assert(C.MAP_W === 5760 && C.MAP_H === 3240, '地图尺寸应为 px（5760×3240）');
    HX.assert(C.VIEW_W === 1920 && C.VIEW_H === 1080, '视口应为 px（1920×1080）');
    HX.assert(C.PLAYER.speed === 640, '玩家移速应为 640 px/s（2026-09-15 设计者指示降为 1/2）');
    HX.assert(C.BULLET_SPEED === 512, '统一弹速应为 512 px/s');
    // 关键长度若意外退回 u 量级（个位数）立即暴露
    const lens = [
      ['玩家碰撞半径', C.PLAYER.solidR], ['小怪碰撞半径', C.ENEMY.solidR],
      ['BOSS 碰撞半径', C.BOSS.solidR], ['石柱内缩', C.PILLAR.inset],
      ['拾取范围', HX.BAL.pickup.range], ['冲刺速度', HX.BAL.dash.speed]
    ];
    for (let i = 0; i < lens.length; i++) {
      HX.assert(lens[i][1] > 10, lens[i][0] + ' 疑似仍是 u 单位（过小）：' + lens[i][1]);
    }
  });

  HX.test('config: 实体尺寸与 GDD §3.2 的 px 基准精确对齐', function () {
    const playerPx = C.PLAYER.visualR * 2;
    const enemyPx = C.ENEMY.visualR * 2;
    const bossPx = C.BOSS.visualR * 2;
    // 2026-09-15 设计者指示：实体太大 → 全部缩小到 1/3 左右（256px 基准 → 84px 基准，系数 21/64）
    HX.assert(playerPx === 84, '玩家外观直径应为 84px，实为 ' + playerPx);
    HX.assert(enemyPx === 42, '小怪外观直径应为 42px，实为 ' + enemyPx);
    HX.assert(bossPx === 252, 'BOSS 外观直径应为 252px，实为 ' + bossPx);
    HX.assert(bossPx / playerPx === 3 && playerPx / enemyPx === 2, '外观比例应为 玩家:小怪:BOSS = 2:1:6');
    HX.assert(Math.abs(playerPx / 256 - 1 / 3) < 0.03, '玩家尺寸应约为原基准 256px 的 1/3，实为 ' + (playerPx / 256).toFixed(3));
  });

  HX.test('config: 弹幕尺寸与身位比例同步（GDD §14：0.15/0.1、0.2/0.12 身位）', function () {
    const D = C.PLAYER.visualR * 2;   // 1 身位 = 玩家直径
    HX.assert(Math.abs(C.PBULLET.visualR / D - 0.15) < 1e-9, '玩家弹幕外观直径应为 0.15 身位');
    HX.assert(Math.abs(C.PBULLET.solidR / D - 0.1) < 1e-9, '玩家弹幕判定直径应为 0.1 身位');
    HX.assert(Math.abs(C.EBULLET.visualR / D - 0.2) < 1e-9, '敌方弹幕外观直径应为 0.2 身位');
    HX.assert(Math.abs(C.EBULLET.solidR / D - 0.12) < 1e-9, '敌方弹幕判定直径应为 0.12 身位');
  });

  HX.test('config: 以身位表述的距离随实体尺寸同步（GDD §9 / §11.2 / §12）', function () {
    // 这条用例的意义：实体尺寸以后再调，"身位口径"的距离必须跟着走 ——
    // 否则风筝距离、拾取范围会相对角色变得离谱（例如变成二十几个身位）。
    // ⚠ 冲刺位移不再在此列：2026-09-15 设计者指示速度加倍（CD 1s），
    //   位移 ≈ 7 身位属"速度手感"决定，见 test 'balance: 冲刺'。
    const D = C.PLAYER.visualR * 2;
    HX.assert(Math.abs(HX.BAL.pickup.range / D - 1.5) < 1e-9, '拾取范围应为 1.5 身位');
    HX.assert(Math.abs(HX.ENEMIES.wizard.behavior.keepMin / D - 6) < 1e-9, '术士风筝下限应为 6 身位');
    HX.assert(Math.abs(HX.ENEMIES.wizard.behavior.keepMax / D - 8) < 1e-9, '术士风筝上限应为 8 身位');
    HX.assert(Math.abs(HX.WAVES.spawnMinDist / D - 4) < 1e-9, '刷怪最小距离应为 4 身位');
  });

  HX.test('config: 碰撞半径 = 外观半径 × 0.7，且落在 0.6~0.8 合规区间（GDD §14）', function () {
    const items = [['玩家', C.PLAYER], ['小怪', C.ENEMY], ['BOSS', C.BOSS], ['玩家弹幕', C.PBULLET], ['敌方弹幕', C.EBULLET]];
    for (let i = 0; i < items.length; i++) {
      const name = items[i][0], e = items[i][1];
      const ratio = e.solidR / e.visualR;
      HX.assert(e.solidR < e.visualR, name + '：判定半径必须小于外观半径');
      HX.assert(ratio >= 0.6 - 1e-9 && ratio <= 0.8 + 1e-9, name + '：半径比 ' + ratio.toFixed(2) + ' 超出 0.6~0.8');
    }
    HX.assert(Math.abs(C.PLAYER.solidR / C.PLAYER.visualR - 0.7) < 1e-9, '实体统一取 0.7×');
    // 精确值而非四舍五入：42 × 0.7 = 29.4
    HX.assert(C.PLAYER.solidR === 29.4, '玩家碰撞半径应为精确值 29.4（42 × 0.7），不得取整');
  });

  HX.test('config: 地图与视口自洽（GDD §3）', function () {
    HX.assert(C.MAP_W === 1920 * 3 && C.MAP_H === 1080 * 3, '地图应为 3×3 屏 = 5760×3240');
    HX.assert(C.ARENA.w === C.MAP_W && C.ARENA.h === C.MAP_H, 'ARENA 必须等于地图尺寸');
    HX.assert(C.VIEW_W === C.DESIGN_W_PX && C.VIEW_H === C.DESIGN_H_PX, '视口应等于设计分辨率（= 一屏）');
    HX.assert(C.VIEW_W < C.MAP_W && C.VIEW_H < C.MAP_H, '视口必须小于地图（否则镜头无用）');
  });

  HX.test('config: 固定步长 60Hz（README §9）', function () {
    HX.assert(Math.abs(C.FIXED_DT - 1 / 60) < 1e-12, '固定步长应为 1/60 秒');
    HX.assert(C.MAX_STEPS >= 1, 'MAX_STEPS 应 ≥ 1');
  });

  HX.test('balance: 冲刺 —— 冷却 1 秒、速度加倍（2026-09-15 设计者指示）', function () {
    const d = HX.BAL.dash;
    const D = C.PLAYER.visualR * 2;                 // 1 身位 = 玩家直径（84px）
    const dist = d.speed * d.time;
    HX.assert(d.cd === 1, '冲刺冷却应为 1 秒（设计者指示，原 3 秒）');
    HX.assert(d.speed === 2688, '冲刺速度应为 2688px/s（设计者指示加倍，原 1344）');
    // 速度加倍后位移 ≈ 591px ≈ 7 身位 —— 超出 GDD §6.1 原 3~4 身位，已在 GDD 标注待拍板
    HX.assert(dist / D > 6 && dist / D < 8, '冲刺位移应 ≈ 7 身位（速度加倍所致），实为 ' + (dist / D).toFixed(2));
    HX.assert(d.passThrough === true, '冲刺期间应可穿越小怪（GDD §6.1）');
  });

  HX.test('config: 石柱召唤参数（2026-09-16：召唤时屏幕四角定位 + 结界矩形）', function () {
    const ps = C.pillarPositions();
    HX.assert(C.PILLAR.count === 4 && ps.length === 4, '石柱应为 4 根');
    // 不传 view：按设计分辨率全屏四角内缩
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      HX.assert(p.x > 0 && p.x < C.VIEW_W && p.y > 0 && p.y < C.VIEW_H,
        '柱心应在设计分辨率屏内（内缩 inset）: ' + p.x + ',' + p.y);
      HX.assert(p.x >= C.PILLAR.inset && p.y >= C.PILLAR.inset, '柱心应内缩 inset');
    }
    // 传 view：柱心 = 该视口四角内缩（"以召唤时玩家所在屏幕定位"）
    const view = { x: 2000, y: 900, w: C.VIEW_W, h: C.VIEW_H };
    const ps2 = C.pillarPositions(view);
    const i2 = C.PILLAR.inset;
    HX.assert(ps2[0].x === view.x + i2 && ps2[0].y === view.y + i2, '视口左上柱心应随视口平移');
    HX.assert(ps2[2].x === view.x + view.w - i2 && ps2[2].y === view.y + view.h - i2, '视口右下柱心应随视口平移');
    // 结界参数（2026-09-16 二次指示：结界向外推、贴近屏幕、把石柱全部包住）
    HX.assert(C.PILLAR.barrierInset === C.PLAYER.solidR,
      '结界边界内缩应 = 玩家碰撞半径（玩家中心在结界内 → 边缘恰好贴屏边）');
    // 柱子整体在结界内：柱锚点 inset 140 - 柱碰撞半径 46.2 = 93.8 > barrierInset 29.4
    HX.assert(C.PILLAR.inset - C.PILLAR.solidR > C.PILLAR.barrierInset,
      '柱面最外沿应在结界边界内侧（石柱被完全包住）');
    HX.assert(C.PILLAR.emergeTime > 0, '出土动画时长必须为正');
  });

  // ================= 皮肤（GDD §7 / §8） =================

  HX.test('config: 三套皮肤字段齐全（GDD §7）', function () {
    HX.assert(HX.SKIN_ORDER.length === 3, '应为 3 套皮肤');
    HX.assert(HX.DEFAULT_SKIN === 'yujian', '默认皮肤应为御剑飞仙');
    for (let i = 0; i < HX.SKIN_ORDER.length; i++) {
      const id = HX.SKIN_ORDER[i];
      const s = HX.SKINS[id];
      HX.assert(!!s, '缺少皮肤: ' + id);
      HX.assert(!!s.name && !!s.pos && !!s.look, id + '：身份字段缺失');
      HX.assert(!!s.normal.name && s.normal.levels.length === 5, id + '：普通技能应有 5 级');
      HX.assert(s.normal.progression.length === 5, id + '：等级表应有 5 行');
      HX.assert(!!s.guard.name && s.guard.duration === 10, id + '：护身技时长应为 10s（2026-09-16 设计者指示）');
      HX.assert(!!s.ult.name && s.ult.cd === undefined, id + '：大招不应有 CD（2026-09-16 设计者指示，仅能量门控）');
    }
  });

  HX.test('config: 普通技能 1→5 级单调增强（数值不倒退）', function () {
    for (let i = 0; i < HX.SKIN_ORDER.length; i++) {
      const id = HX.SKIN_ORDER[i];
      const lv = HX.SKINS[id].normal.levels;
      for (let k = 0; k < lv.length; k++) {
        HX.assert(lv[k].lv === k + 1, id + '：等级序号错位，第 ' + k + ' 项 lv=' + lv[k].lv);
        HX.assert(lv[k].dmg > 0 && lv[k].rate > 0 && lv[k].count >= 1, id + ' Lv' + (k + 1) + '：基础数值非法');
        if (k > 0) {
          HX.assert(lv[k].dmg >= lv[k - 1].dmg, id + '：伤害随等级倒退');
          HX.assert(lv[k].rate >= lv[k - 1].rate, id + '：攻速随等级倒退');
          HX.assert(lv[k].count >= lv[k - 1].count, id + '：数量随等级倒退');
        }
      }
    }
  });

  HX.test('config: 质变节点与 GDD §8 升级表一致（px）', function () {
    const y = HX.SKINS.yujian.normal.levels;
    // 2026-09-16 设计者调参：数量 = 等级（1~5）、伤害 10~18（+2/级）、频率 1.0/1.4/1.6/2.0/2.4
    for (let i = 0; i < 5; i++) {
      HX.assert(y[i].count === i + 1, '御剑 Lv' + (i + 1) + ' 数量应为 ' + (i + 1) + ' 把');
      HX.assert(y[i].dmg === [10,11,12,13,15][i], '御剑 Lv' + (i + 1) + ' 伤害应为 ' + [10,11,12,13,15][i]);
    }
    HX.assert(y[0].rate === 1.0 && y[1].rate === 1.1 && y[2].rate === 1.3 && y[3].rate === 1.6 && y[4].rate === 2.0,
      '御剑频率应为 1.0/1.1/1.3/1.6/2.0');
    HX.assert(y[0].range === 3072, '御剑射程应为 3072px（超远）');
    const n = HX.SKINS.nanming.normal.levels;
    HX.assert(n[0].count === 6 && n[4].count === 8, '南明火球应为 6 向 → 8 向');
    const SZ = [1.0, 1.1, 1.3, 1.6, 2.0];
    for (let i = 0; i < 5; i++) HX.assert(n[i].size === SZ[i], '南明火球 Lv' + (i + 1) + ' 大小应为 ' + SZ[i] + 'x');
    HX.assert(n[2].radius === 563.2 && n[1].radius === 384, '南明爆炸半径质变错误（384 → 563.2）');
    const DMG = [15, 16, 18, 21, 25], RATE = [0.6, 0.7, 0.8, 0.9, 1.0];
    for (let i = 0; i < 5; i++) {
      HX.assert(n[i].dmg === DMG[i], '南明 Lv' + (i + 1) + ' 伤害应为 ' + DMG[i]);
      HX.assert(n[i].rate === RATE[i], '南明 Lv' + (i + 1) + ' 攻速应为 ' + RATE[i]);
    }
    const j = HX.SKINS.jiuxiao.normal.levels;
    HX.assert(j[0].chainRange === 200 && j[2].chainRange === 350 && j[4].chainRange === 800,
      '九霄链接范围应为 200/350/800px（2026-09-16 调参）');
    const JD = [16, 17, 19, 22, 26], JR = [0.6, 0.7, 0.8, 0.9, 1.0];
    for (let i = 0; i < 5; i++) {
      HX.assert(j[i].dmg === JD[i], '九霄 Lv' + (i + 1) + ' 伤害应为 ' + JD[i]);
      HX.assert(j[i].rate === JR[i], '九霄 Lv' + (i + 1) + ' 攻速应为 ' + JR[i]);
      HX.assert(j[i].decay === 0.5, '九霄传导伤害应为直击一半（decay 0.5）');
    }
    HX.assert(HX.SKINS.jiuxiao.guard.dmg === 20, '雷池单次伤害应为 20（2026-09-16 调参）');
  });

  HX.test('config: 大招数值与 GDD §7 / 附录 A 一致（px）', function () {
    const y = HX.SKINS.yujian.ult;
    HX.assert(y.count === 20 && y.dmg === 50, '万剑归宗应为 20 把 × 50 = 1000（2026-09-16 调参）');
    HX.assert(y.count * y.dmg === 1000, '万剑归宗总伤应为 1000');
    HX.assert(y.hover === 0.5 && y.interval === 0.1 && y.spawnR === 200 && y.speedMul === 1.5 && y.turnRate === 5.0, '万剑归宗 v2 参数：悬停 0.5s / 间隔 0.1s / 现身半径 200 / 速度 ×1.5 / 追踪 turnRate 5.0');
    const n = HX.SKINS.nanming.ult;
    HX.assert(n.crossTime === 3 && n.size === 768 && n.dmg === 100 && n.tickEvery === 0.2,
      '火凤燎原 v2：3 秒横贯 / 768×768 / 每 0.2s 100 伤害');
    const j = HX.SKINS.jiuxiao.ult;
    HX.assert(j.count === 20 && j.dmg === 100 && j.interval === 0.2 && j.jitterR === 50 &&
              j.strikeR === 128 && j.maxHits === 10,
      '雷霆万钧 v3：20 道 × 100、间隔 0.2s、落点 ±50px、命中 128、单目标限 10 道');
    HX.assert(j.count * j.dmg === 2000, '雷霆万钧总伤上限应为 2000');
  });

  HX.test('config: skillAt 按等级取值并夹取越界等级', function () {
    HX.assert(HX.skillAt('yujian', 1).dmg === 10, 'Lv1 伤害应为 10');
    HX.assert(HX.skillAt('yujian', 5).count === 5, 'Lv5 应为 5 把飞剑');
    HX.assert(HX.skillAt('yujian', 0).lv === 1, '低于 1 级应夹到 Lv1');
    HX.assert(HX.skillAt('yujian', 99).lv === 5, '高于 5 级应夹到 Lv5');
    HX.assert(HX.skillAt('not-exist', 3).lv === 3, '未知皮肤应回退默认皮肤而非崩溃');
  });

  HX.test('config: 配色表覆盖三套皮肤与关键实体（渲染层依赖）', function () {
    for (let i = 0; i < HX.SKIN_ORDER.length; i++) {
      const c = HX.SKINS[HX.SKIN_ORDER[i]].color;
      HX.assert(!!HX.PAL.skins[c], '缺少配色: ' + c);
    }
    HX.assert(!!HX.PAL.enemy.spider && !!HX.PAL.enemy.wizard, '缺少敌人配色');
    HX.assert(!!HX.PAL.boss.body && !!HX.PAL.boss.enrage, '缺少 BOSS 配色');
    HX.assert(!!HX.PAL.pillar.dark && !!HX.PAL.pillar.lit, '石柱需暗/燃两态配色');
  });

  // ================= 战斗数值（GDD §6.1 / §8 / §9 / §10） =================

  HX.test('balance: 玩家生命 = 设计者暂定 200 且相关冷却为正', function () {
    HX.assert(HX.BAL.player.maxHp === 200, '设计者 2026-09-15 暂定玩家生命 200，实为 ' + HX.BAL.player.maxHp);
    HX.assert(HX.BAL.player.iframe > 0 && HX.BAL.player.contactCd > 0, '受伤无敌/接触冷却必须为正');
  });

  HX.test('弹速：统一为 512px/s 单点开关，且各处配置无遗漏', function () {
    HX.assert(C.BULLET_SPEED === 512, '统一弹速应为 512 px/s');
    const eq = (v, label) => HX.assert(Math.abs(v - C.BULLET_SPEED) < 1e-12,
      label + ' 未引用统一弹速（实为 ' + v + '，应为 ' + C.BULLET_SPEED + '）');
    for (let i = 0; i < HX.SKIN_ORDER.length; i++) {
      const s = HX.SKINS[HX.SKIN_ORDER[i]];
      eq(s.normal.speed, s.name + '·普攻');
      if (s.ult.speed !== undefined) eq(s.ult.speed, s.name + '·大招');
    }
    eq(HX.BOSS.normal.ring.speed, 'BOSS·环形弹幕');
    eq(HX.BOSS.normal.fan.speed, 'BOSS·扇形弹幕');
    eq(HX.BOSS.pillarPhase.tracking.speed, 'BOSS·追踪弹');
    // 例外（设计者 2026-09-15 指示）：邪修术士弹速 = 统一弹速 × 2/3 ≈ 341px/s
    // 弹速收敛到 attack 层（pattern 不再各自携带）—— systems/enemy.js fire() 的取值顺序：
    // pattern.speed > attack.speed > 全局 BULLET_SPEED
    const wp = HX.ENEMIES.wizard.attack;
    HX.assert(Math.abs(wp.speed - C.BULLET_SPEED * 2 / 3) < 1e-9,
      '术士弹速应为统一弹速的 2/3（≈341px/s），实为 ' + wp.speed);
    HX.assert(wp.pattern[0].speed === undefined && wp.pattern[1].speed === undefined,
      '术士两种弹幕不应再各自携带 speed（已收敛到 attack.speed）');
  });

  HX.test('弹幕尺寸：通用基准 + 两处设计者指定缩放（2026-09-15）', function () {
    const D = C.PLAYER.visualR * 2;
    // 通用基准（GDD §14）：玩家 0.15/0.1 身位，敌方 0.2/0.12 身位
    HX.assert(Math.abs(C.PBULLET.visualR / D - 0.15) < 1e-9, '玩家弹幕通用外观直径应为 0.15 身位');
    HX.assert(Math.abs(C.EBULLET.visualR / D - 0.2) < 1e-9, '敌方弹幕通用外观直径应为 0.2 身位');
    // 御剑飞剑 = 玩家弹幕通用尺寸的 1/2
    const yb = HX.SKINS.yujian.normal.bullet;
    HX.assert(Math.abs(yb.visualR - C.PBULLET.visualR / 2) < 1e-9, '飞剑外观半径应为通用值 1/2');
    HX.assert(Math.abs(yb.solidR - C.PBULLET.solidR / 2) < 1e-9, '飞剑判定半径应为通用值 1/2');
    // 邪修术士弹幕 = 敌方弹幕通用尺寸的 1/3
    const ws = HX.ENEMIES.wizard.attack.size;
    HX.assert(Math.abs(ws.visualR - C.EBULLET.visualR / 3) < 1e-9, '术士弹幕外观半径应为通用值 1/3');
    HX.assert(Math.abs(ws.solidR - C.EBULLET.solidR / 3) < 1e-9, '术士弹幕判定半径应为通用值 1/3');
  });

  HX.test('表现层：VISUAL 表覆盖全部立绘，且尺寸自洽（GDD §3.3）', function () {
    const V = C.VISUAL;
    const need = ['player', 'spider', 'wizard', 'boss', 'pillar', 'pickup'];
    for (let i = 0; i < need.length; i++) {
      const v = V[need[i]];
      HX.assert(!!v, '缺少立绘尺寸: ' + need[i]);
      HX.assert(v.w > 0 && v.h > 0, need[i] + '：立绘宽高必须为正');
      HX.assert(v.shadowW > 0 && v.shadowH > 0, need[i] + '：缺少落地阴影尺寸');
      HX.assert(v.shadowW <= v.w * 1.1, need[i] + '：阴影不应比立绘还宽（视觉上会「飘」）');
      HX.assert(v.shadowH < v.shadowW, need[i] + '：阴影应为压扁的椭圆（斜俯视投影）');
    }
    // 立绘宽度必须与 GDD §3.2 的世界外观直径一致（同一数值只能有一处来源）
    HX.assert(V.player.w === C.PLAYER.visualR * 2, '玩家立绘宽应 = 外观直径 84px');
    HX.assert(V.spider.w === C.ENEMY.visualR * 2, '小怪立绘宽应 = 外观直径 42px');
    HX.assert(V.boss.w === C.BOSS.visualR * 2, 'BOSS 立绘宽应 = 外观直径 252px');
    HX.assert(V.boss.w / V.player.w === 3 && V.player.w / V.spider.w === 2, '立绘宽度比例应为 玩家:小怪:BOSS = 2:1:6');
    HX.assert(C.PLANE_SQUASH > 0 && C.PLANE_SQUASH <= 1, 'PLANE_SQUASH 应在 (0,1]');
  });

  // ================= 敌人 / BOSS / 波次 =================

  HX.test('enemies: 两只小怪字段齐全且碰撞半径合规（GDD §11 / §14）', function () {
    const E = HX.ENEMIES;
    const ids = HX.ENEMY_ORDER;
    HX.assert(ids.length === 2, '小怪应为两种');
    for (let i = 0; i < ids.length; i++) {
      const e = E[ids[i]];
      HX.assert(!!e, '缺少小怪: ' + ids[i]);
      HX.assert(!!e.name && e.hp > 0 && e.speed > 0, ids[i] + '：基础数值缺失');
      HX.assert(e.visualR === 21, ids[i] + '：外观半径应为 21px（GDD §3.2，实体已缩至 1/3）');
      HX.assert(Math.abs(e.solidR / e.visualR - 0.7) < 1e-9, ids[i] + '：碰撞半径应为 0.7×（GDD §14）');
      HX.assert(e.dropChance === 0.3, ids[i] + '：掉落率应为 30%（GDD §9）');
      HX.assert(e.speed < C.PLAYER.speed, ids[i] + '：小怪移速必须低于玩家（否则无法走位）');
      HX.assert(!!e.behavior && !!e.behavior.type, ids[i] + '：缺少行为定义');
    }
  });

  HX.test('enemies: 血魔蛛 = 数值 + 自爆前摇（GDD §11.1）', function () {
    const s = HX.ENEMIES.spider;
    HX.assert(s.hp === 30, '血量应为 30');
    HX.assert(s.speed === 144, '移速应为 144px/s（2026-09-15 设计者指示两次下调，累计 1/8）');
    HX.assert(s.exp === 25, '经验应为 25（GDD §8）');
    HX.assert(s.behavior.type === 'chase', '应为直线追击');
    HX.assert(s.attack.type === 'suicide' && s.attack.dmg === 15, '接触自爆伤害应为 15');
    HX.assert(s.attack.telegraph === 0.5, '自爆前摇应为 0.5 秒');
  });

  HX.test('enemies: 邪修术士 = 风筝距离 + 两种弹幕交替（GDD §11.2）', function () {
    const w = HX.ENEMIES.wizard;
    HX.assert(w.hp === 50 && w.speed === 256 && w.exp === 50, '血量/移速/经验不符');
    HX.assert(w.behavior.type === 'kite', '应为风筝行为');
    HX.assert(w.behavior.keepMin === 504 && w.behavior.keepMax === 672, '应保持 6~8 身位（504~672px）');
    HX.assert(w.attack.type === 'alternate' && w.attack.interval === 2.0, '应每 2 秒交替一次');
    const p = w.attack.pattern;
    HX.assert(p.length === 2, '应为两种弹幕');
    HX.assert(p[0].id === 'track' && p[0].count === 1 && p[0].dmg === 10, '追踪弹应为 1 发伤害 10');
    HX.assert(p[1].id === 'fan' && p[1].count === 3 && p[1].dmg === 8, '扇形弹应为 3 发伤害 8');
    HX.assert(p[1].spreadDeg === 45, '扇形散布应为 45°');
  });

  HX.test('boss: 基础数值 + 接触规则（GDD §13.1）', function () {
    const B = HX.BOSS;
    HX.assert(B.hp === 9000, 'BOSS 血量应为 9000（GDD 工作预估，实现直接取此值）');
    HX.assert(B.speed === 128, 'BOSS 移速应为 128px/s');
    HX.assert(B.visualR === 126 && Math.abs(B.solidR / B.visualR - 0.7) < 1e-9, 'BOSS 外观 126px、碰撞 0.7×');
    HX.assert(B.contact.dmg === 20 && B.contact.cd === 1.0, '接触伤害 20、冷却 1 秒');
    HX.assert(B.contact.solid === true, '玩家不可穿过 BOSS（GDD §14）');
  });

  HX.test('boss: 普通阶段三种弹幕轮换与参数（GDD §13.2）', function () {
    const n = HX.BOSS.normal;
    HX.assert(n.interval === 4.0, '应每 4 秒放一次');
    HX.assert(n.rotation.length === 3, '应三种轮换');
    for (let i = 0; i < n.rotation.length; i++) {
      HX.assert(!!n[n.rotation[i]], '轮换表引用了未定义的弹幕: ' + n.rotation[i]);
    }
    HX.assert(n.ring.count === 14 && n.ring.dmg === 10, '环形弹幕应为 14 发伤害 10');
    HX.assert(n.ring.leavesGap === true, '环形弹幕需留缝隙（GDD §13.2）');
    HX.assert(n.fan.count === 5 && n.fan.dmg === 12 && n.fan.spreadDeg === 60, '扇形弹幕应为 5 发伤害 12 散布 60°');
    HX.assert(n.fan.aimAtPlayer === true, '扇形弹幕应瞄准玩家');
    HX.assert(n.groundfire.count === 3 && n.groundfire.dmg === 25, '地火应为 3 个红圈伤害 25');
    HX.assert(n.groundfire.delay === 1.0 && n.groundfire.r === 384, '地火延迟 1 秒、半径 384px');
  });

  HX.test('boss: 普通阶段召唤节奏 5s 首波 / 12s 一波 / 3~5 只（GDD §13.2）', function () {
    const s = HX.BOSS.normal.summon;
    HX.assert(s.first === 5.0, '开局 5 秒第一波');
    HX.assert(s.every === 12.0, '之后每 12 秒一波');
    HX.assert(s.countMin === 3 && s.countMax === 5, '每波 3~5 只');
    HX.assert(s.mix.length === 2, '应混合两种小怪');
  });

  HX.test('boss: 石柱阶段触发阈值 + 追踪弹参数（GDD §13.3）', function () {
    const p = HX.BOSS.pillarPhase;
    HX.assert(p.triggerAt === 0.65, '应在 65% 血触发（2026-09-16 设计者指示）');
    HX.assert(p.pillarCount === 4, '石柱应为 4 根');
    const t = p.tracking;
    // ⚠ 已知偏离，已向设计者报备：GDD §13.3 原定追踪弹 = 玩家 80% = 1024px/s，
    //   设计者 2026-09-15 指示「弹速先都按 512px/s」→ 现为 512px/s（= 玩家 40%）。
    //   这里断言的**当前决策**；恢复 GDD 原值只需改 config/boss.js 一行，本用例会立刻变红提醒。
    HX.assert(Math.abs(t.speed - C.BULLET_SPEED) < 1e-12,
      '追踪弹当前应随统一弹速 ' + C.BULLET_SPEED + 'px/s，实为 ' + t.speed);
    HX.assert(t.life === 8.0 && t.cd === 8.0, '追踪弹存在 8 秒、冷却 8 秒');
    HX.assert(t.dmg === 10, '追踪弹伤害应为 10');
    HX.assert(t.igniteOnHit === true, '命中玩家必须点燃石柱');
    HX.assert(p.summon.every === 15.0 && p.summon.countMin === 2 && p.summon.countMax === 4, '石柱阶段应为每 15 秒 2~4 只');
  });

  HX.test('boss: 狂暴三要素 = 无敌 / 放大 / 演出后判负（GDD §13.4）', function () {
    const e = HX.BOSS.enrage;
    HX.assert(e.invincible === true, '狂暴时 BOSS 应无敌');
    HX.assert(e.scale === 1.5, '体型应放大 1.5 倍');
    HX.assert(e.delay === 1.5, '演出 1.5 秒后判负');
    HX.assert(e.groundfire.dmg >= 100, '地火伤害应「极高」（几乎无法躲）');
    HX.assert(e.groundfire.count >= 30, '地火应几乎覆盖全屏');
    HX.assert(!!e.screenFlash && !!e.shake, '缺屏幕红闪 / 震动');
  });

  HX.test('waves: 三轮配比 / 同屏上限 / 击杀补怪（GDD §12 三调）', function () {
    const R = HX.WAVES.rounds;
    HX.assert(R.length === 3, '应为 3 轮');
    const want = [[30, 2, 10], [50, 3, 15], [80, 5, 20]];  // 2026-09-16 三调：总数 + cap
    let total = 0;
    for (let i = 0; i < 3; i++) {
      HX.assert(R[i].round === i + 1, '轮次序号错位');
      HX.assert(R[i].spider === want[i][0] && R[i].wizard === want[i][1],
        '第 ' + (i + 1) + ' 轮配比应为 ' + want[i][0] + ' 蛛 ' + want[i][1] + ' 术');
      HX.assert(R[i].cap === want[i][2], '第 ' + (i + 1) + ' 轮同屏上限应为 ' + want[i][2]);
      total += HX.WAVES.roundTotal(i + 1);
    }
    // 自洽：蛛 30+50+80 = 160，术 2+3+5 = 10 → 合计 170 只（160×25 + 10×50 = 4500 经验）
    HX.assert(total === 170, '三轮小怪总数应为 170，实为 ' + total);
    HX.assert(R[0].spider + R[1].spider + R[2].spider === 160, '血魔蛛总数应为 160');
    HX.assert(R[0].wizard + R[1].wizard + R[2].wizard === 10, '邪修术士总数应为 10');
  });

  HX.test('waves: 小怪总经验 4500（三调）→ 升级节奏还原原 GDD 设计（第 3 轮清完恰满级）', function () {
    const B = HX.BAL;
    HX.assert(HX.WAVES.allExp() === HX.WAVES.expectedTotalExp, '总经验与声明值不符');
    HX.assert(HX.WAVES.allExp() === 4500, '总经验应为 160×25 + 10×50 = 4500');
    const lv5 = B.exp.cumulative[B.exp.maxLevel - 1];
    HX.assert(HX.WAVES.allExp() >= lv5, '总经验必须够满级（' + HX.WAVES.allExp() + ' ≥ ' + lv5 + '）');
    let acc = 0;
    const lvAfter = [];
    for (let i = 1; i <= 3; i++) { acc += HX.WAVES.roundExp(i); lvAfter.push(B.levelFromExp(acc)); }
    // 原节奏（4500 exp 等比放大后）：R1 末 Lv2 → R2 末 Lv3 → R3 末恰好 Lv5（见 BOSS 即满级）
    HX.assert(lvAfter[0] === 2, '第 1 轮末应 Lv2（850 exp，阈值 750/1750），实为 Lv' + lvAfter[0]);
    HX.assert(lvAfter[1] === 3, '第 2 轮末应 Lv3（2250 exp），实为 Lv' + lvAfter[1]);
    HX.assert(lvAfter[2] === 5, '第 3 轮清完恰好 Lv5（4500），实为 Lv' + lvAfter[2]);
  });

  HX.test('waves: BOSS 召唤同屏上限 15（2026-09-16 设计者指示）', function () {
    HX.assert(HX.BOSS.summonCap === 15, 'BOSS 战同屏小怪上限应为 15');
  });

  HX.test('balance: 能量自洽 —— 纯命中 10s / 纯受伤 20s（GDD §10）', function () {
    const e = HX.BAL.energy;
    HX.assert(e.max === 100, '能量上限 100');
    const hitRate = e.onHit / e.onHitCd;
    const hurtRate = e.onHurt / e.onHurtCd;
    HX.assert(Math.abs(hitRate - 10) < 1e-9, '命中积累应为 10/s，实为 ' + hitRate);
    HX.assert(Math.abs(hurtRate - 5) < 1e-9, '受伤积累应为 5/s，实为 ' + hurtRate);
    HX.assert(Math.abs(e.max / hitRate - 10) < 1e-9, '纯命中应 10 秒攒满');
    HX.assert(Math.abs(e.max / hurtRate - 20) < 1e-9, '纯受伤应 20 秒攒满');
    HX.assert(e.excludeSources.indexOf('guard') >= 0 && e.excludeSources.indexOf('ult') >= 0,
      '护身技伤害与大招伤害不得积累能量');
  });

  HX.test('balance: 升级阈值单调 + 等级换算函数正确（GDD §8）', function () {
    const B = HX.BAL;
    const t = B.exp.cumulative;
    HX.assert(t.length === B.exp.maxLevel, '累计阈值数组长度应等于最高等级');
    HX.assert(t[0] === 0, 'Lv1 起点应为 0');
    for (let i = 1; i < t.length; i++) HX.assert(t[i] > t[i - 1], '累计阈值必须严格递增');
    HX.assert(t[1] === 750 && t[2] === 1750 && t[3] === 3000 && t[4] === 4250, '累计阈值应为 750/1750/3000/4250（Lv5 取补怪最坏经验下限）');
    HX.assert(B.levelFromExp(0) === 1, '0 经验 = Lv1');
    HX.assert(B.levelFromExp(749) === 1, '749 经验仍是 Lv1');
    HX.assert(B.levelFromExp(750) === 2, '750 经验升 Lv2');
    HX.assert(B.levelFromExp(4250) === 5, '4250 经验满级（补怪最坏情况）');
    HX.assert(B.levelFromExp(9999) === 5, '超出上限应夹到 Lv5');
    HX.assert(Math.abs(B.expRatio(1000) - (1000 - 750) / (1750 - 750)) < 1e-9, '经验条比例计算错误');
    HX.assert(B.expRatio(9999) === 1, '满级时经验条应为满');
  });

  HX.test('balance: 护身技与掉落规则（GDD §9）', function () {
    const g = HX.BAL.guard;
    HX.assert(g.duration === 10, '护身技应持续 10 秒（2026-09-16 设计者指示）');
    HX.assert(g.refreshOnly === true, '重复拾取只刷新，不叠加');
    HX.assert(g.dropChance === 0.3, '小怪 30% 掉落灵石');
    HX.assert(g.bossDropAt.length === 3 && g.bossDropAt[0] === 0.75 && g.bossDropAt[2] === 0.25,
      'BOSS 掉落在 75% / 50% / 25% 三个节点');
    HX.assert(g.bossDropNominal === 4, 'GDD 名义 4 个（第 4 个落在血量归零瞬间，实际取不到）');
    HX.assert(HX.BAL.pickup.range === 126 && HX.BAL.pickup.auto === true, '拾取范围 126px（1.5 身位）且自动拾取');
  });

  HX.test('equip: 装配部件 —— 三槽三系 / 默认御剑套装 / 套装血量 +50（GDD v1.19 §7）', function () {
    const E = HX.Equip, PARTS = HX.PARTS;
    // 三槽 × 三系部件表完整
    for (const sys of HX.EQUIP_ORDER) {
      for (const slot of HX.EQUIP_SLOTS) {
        const pt = PARTS[sys][slot];
        HX.assert(!!pt && !!pt.name && !!pt.skill && !!pt.img, '部件 ' + sys + '.' + slot + ' 应有 名称/技能/贴图');
      }
    }
    // 默认装配 = 御剑套装 → 套装激活 + maxHp 250
    HX.assert(E.weapon === 'yujian' && E.cloth === 'yujian' && E.aura === 'yujian', '默认装配应为御剑三件');
    HX.assert(E.kitMatch() && E.kitName() === '御剑套装', '默认应激活御剑套装');
    HX.assert(E.maxHp() === HX.BAL.player.maxHp + 50, '套装 maxHp 应为 基础+50');
    // 混搭：功能正常、无套装
    E.set('cloth', 'nanming');
    HX.assert(!E.kitMatch() && E.maxHp() === HX.BAL.player.maxHp, '混搭应无套装加成（基础血量）');
    HX.assert(E.snapshot().cloth === 'nanming', '快照应记录混搭');
    // 恢复默认（不污染其他用例）
    E.set('cloth', 'yujian');
    HX.assert(E.kitMatch(), '恢复默认后应重新激活套装');
  });

  HX.test('equip: 玩家实体默认装配与武器系一致（无头模拟零改动）', function () {
    const p = HX.makePlayer('nanming', 100, 100);
    HX.assert(p.equip.weapon === 'nanming' && p.equip.cloth === 'nanming' && p.equip.aura === 'nanming',
      '实体默认 equip 三槽应与 skinId 同系');
    HX.assert(p.maxHp === HX.BAL.player.maxHp, '实体默认血量应为基础值');
  });

  HX.test('balance: 单局时长期望 3~5 分钟（GDD 概述）', function () {
    const s = HX.BAL.session;
    HX.assert(s.minSec === 180 && s.maxSec === 300, '单局时长期望应为 180~300 秒');
  });

  HX.test('config: 数值分层无重复（同一数值只允许一处）', function () {
    const banned = ['PLAYER_MAX_HP', 'CONTACT_CD', 'IFRAME', 'PICKUP_RANGE', 'DASH', 'PX_PER_UNIT'];
    for (let i = 0; i < banned.length; i++) {
      HX.assert(C[banned[i]] === undefined, 'constants.js 不应再有 ' + banned[i]);
    }
    HX.assert(!!HX.BAL && !!HX.ENEMIES && !!HX.BOSS && !!HX.WAVES, '数据表缺文件');
    HX.assert(!!HX.TEXT && !!HX.SKINS && !!HX.PAL, '缺 config 基础表');
  });

  // ================= 文案（GDD §15 / §15.1） =================

  HX.test('texts: 结算文案口径 = 诛魔救人世（GDD §15 / §15.1）', function () {
    const T = HX.TEXT;
    HX.assert(!!T && !!T.result, '缺少 HX.TEXT.result');
    const kinds = ['win', 'rage', 'down'];
    for (let i = 0; i < kinds.length; i++) {
      const r = T.result[kinds[i]];
      HX.assert(!!r, '缺少结算态: ' + kinds[i]);
      HX.assert(!!r.title && r.title.length === 4, kinds[i] + '：结算标题应为四字，实为「' + (r && r.title) + '」');
      HX.assert(!!r.reason && r.reason.length >= 6, kinds[i] + '：信息文案缺失');
    }
    HX.assert(T.result.win.reason.indexOf('人间界') >= 0, '胜利文案必须落在「人间界」这条线上');
    HX.assert(T.narrative.villain === '吞天老祖', '叙事锚点「反派」被改动');
    HX.assert(T.narrative.stake === '人间界', '叙事锚点「赌注」被改动');
  });

  HX.test('texts: 无「个人飞升」口径残留（渡劫 / 飞升 / 道心）', function () {
    const banned = ['渡劫', '飞升', '道心'];
    const flat = JSON.stringify(HX.TEXT);
    for (let i = 0; i < banned.length; i++) {
      HX.assert(flat.indexOf(banned[i]) === -1, '文案内出现已弃用口径「' + banned[i] + '」');
    }
  });
})();
