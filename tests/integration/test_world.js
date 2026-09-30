// 集成测试：世界推进 / 移动与冲刺 / 小怪 AI / 普攻与伤害 / 经验与能量 / 波次与胜负。
// 全部通过 **无头驱动 HX.World** 完成（不渲染、不碰 DOM），这与 tests/sim.html 用的是同一条入口 ——
// 所以这些用例同时也验证了「世界推进可以脱离渲染运行」这条架构约束。
// 约定：测试内把世界相位改成 'parked' 可停掉波次调度，把敌人 behavior 置 null 可停掉其 AI，
//       以便在受控条件下断言单个系统。
(function () {
  const HX = window.HX || (window.HX = {});
  const DT = HX.C.FIXED_DT;

  function run(w, steps, intent) {
    for (let i = 0; i < steps; i++) HX.World.step(w, DT, intent);
  }

  // 建一个"只有玩家"的受控世界（波次停摆）
  function bareWorld(opts) {
    const w = HX.World.create(opts || {});
    w.phase = 'parked';
    return w;
  }

  // 放一只不动的靶子（behavior=null → 既不追也不开火）
  function dummy(w, typeId, dx, dy) {
    const e = HX.World.spawnEnemy(w, typeId, w.player.pos.x + dx, w.player.pos.y + (dy || 0));
    e.behavior = null;
    return e;
  }

  // ---------- 移动与边界（GDD §5 §6） ----------
  HX.test('移动: intent 驱动位移 = 速度 × 时间', function () {
    const w = bareWorld({ seed: 1 });
    const x0 = w.player.pos.x;
    run(w, 60, { moveX: 1, moveY: 0 });
    const dx = w.player.pos.x - x0;
    HX.assert(Math.abs(dx - w.player.speed) < 1e-6, '1 秒应位移 ' + w.player.speed + 'px，实为 ' + dx.toFixed(3));
    HX.assert(w.player.pos.y === w.player.pos.y, 'y 不应为 NaN');
  });

  HX.test('移动: 斜向不加速（输入归一化，GDD §6）', function () {
    const w = bareWorld({ seed: 1 });
    const x0 = w.player.pos.x, y0 = w.player.pos.y;
    run(w, 60, { moveX: 1, moveY: 1 });
    const d = Math.hypot(w.player.pos.x - x0, w.player.pos.y - y0);
    HX.assert(Math.abs(d - w.player.speed) < 1e-6, '斜向总位移应仍为 ' + w.player.speed + 'px，实为 ' + d.toFixed(3));
  });

  HX.test('边界: 停在 WALL_MARGIN + 碰撞半径 内（GDD §5 空气墙）', function () {
    const w = bareWorld({ seed: 1 });
    const m = w.player.solidR + HX.C.WALL_MARGIN;
    run(w, 600, { moveX: -1, moveY: -1 });
    HX.assert(Math.abs(w.player.pos.x - m) < 1e-9, '左边界应停在 ' + m + '，实为 ' + w.player.pos.x);
    HX.assert(Math.abs(w.player.pos.y - m) < 1e-9, '上边界应停在 ' + m + '，实为 ' + w.player.pos.y);
  });

  HX.test('石柱: 开局不存在；召唤后以玩家屏幕四角定位并激活结界矩形', function () {
    const w = bareWorld({ seed: 1 });
    HX.assert(w.pillars.length === 0, '开局不应有石柱（GDD §13.3：BOSS 50% 血才召唤）');
    HX.assert(!w.pillarRect, '开局不应有结界矩形');

    const view = w.cam.viewRect();
    const future = HX.C.pillarPositions(view)[0];
    w.player.pos.x = future.x;
    w.player.pos.y = future.y;

    const pillar = HX.World.spawnPillars(w)[0];       // 召唤（阶段 3 由 BOSS 系统触发）
    HX.assert(w.pillars.length === 4, '召唤一次应出 4 根');
    HX.assert(pillar.pos.x === future.x && pillar.pos.y === future.y,
      '柱心应以召唤时玩家所在屏幕四角定位');
    HX.assert(pillar.emerge < 1, '刚召唤时应仍在地下，emerge=' + pillar.emerge);

    // 结界（视口内缩 barrierInset）立即生效：玩家不能越出，且**石柱被完全包住**
    const r = w.pillarRect;
    const bi = HX.C.PILLAR.barrierInset;
    HX.assert(r.x0 === view.x + bi && r.y0 === view.y + bi, '结界边界应贴近屏幕（内缩 = 玩家半径）');
    for (let i = 0; i < w.pillars.length; i++) {
      const pl = w.pillars[i];
      HX.assert(pl.pos.x - pl.solidR >= r.x0 && pl.pos.x + pl.solidR <= r.x1 &&
        pl.pos.y - pl.solidR >= r.y0 && pl.pos.y + pl.solidR <= r.y1,
        '石柱（含碰撞体）应整体落在结界内');
    }
    run(w, 90, { moveX: 1, moveY: 0 });               // 向右冲 1.5s（速度 640，足以冲出屏）
    HX.assert(w.player.pos.x <= r.x1 + 1e-6, '玩家不应走出结界右缘，x=' + w.player.pos.x.toFixed(1));
    run(w, 90, { moveX: -1, moveY: 0 });
    HX.assert(w.player.pos.x >= r.x0 - 1e-6, '玩家不应走出结界左缘');

    // 再次召唤不应重复
    HX.World.spawnPillars(w);
    HX.assert(w.pillars.length === 4, '重复召唤不应新增石柱');
  });

  HX.test('石柱: 正对柱心冲过去应停在柱面上（柱面推挤与结界不打架）', function () {
    const w = bareWorld({ seed: 1 });
    const pillar = HX.World.spawnPillars(w)[0];       // 召唤时屏幕四角的柱子（整体在结界内）
    run(w, Math.ceil(HX.C.PILLAR.emergeTime / DT) + 5, null);   // 等石柱升起完成（2s）
    // 从结界内侧正对柱心冲过去 → 停在"柱面 + 玩家判定半径"处（不穿柱、不出结界）
    w.player.pos.x = pillar.pos.x + 500;
    w.player.pos.y = pillar.pos.y;
    run(w, 120, { moveX: -1, moveY: 0 });
    const d = Math.hypot(w.player.pos.x - pillar.pos.x, w.player.pos.y - pillar.pos.y);
    const need = pillar.solidR + w.player.solidR;
    HX.assert(Math.abs(d - need) < 0.5, '玩家应停在柱面上，距离 ' + d.toFixed(2) + ' 应 ≈ ' + need.toFixed(2));
    const r = w.pillarRect;
    HX.assert(w.player.pos.x >= r.x0 - 1e-6 && w.player.pos.y >= r.y0 - 1e-6, '同时不应越出结界');
  });

  // ---------- 冲刺（GDD §6.1） ----------
  HX.test('冲刺: 位移 ≈ 速度×时长（速度加倍后 ≈ 7 身位）', function () {
    const w = bareWorld({ seed: 1 });
    const B = HX.BAL.dash;
    const D = HX.C.PLAYER.visualR * 2;          // 1 身位 = 玩家直径（84px）
    const x0 = w.player.pos.x;
    run(w, 1, { moveX: 1, moveY: 0, dash: true });
    HX.assert(w.player.dashing === true, '按下空格应进入冲刺');
    run(w, 30, { moveX: 0, moveY: 0 });
    const dx = w.player.pos.x - x0;
    const ideal = B.speed * B.time;
    HX.assert(dx >= D * 6 && dx <= D * 8,
      '冲刺位移应 ≈ 7 身位（速度加倍所致，' + (D * 6) + '~' + (D * 8) + 'px），实为 ' + dx.toFixed(1));
    HX.assert(Math.abs(dx - ideal) <= B.speed * DT + 1e-6,
      '冲刺位移应 ≈ ' + ideal.toFixed(1) + 'px（±1 步），实为 ' + dx.toFixed(1));
    HX.assert(w.player.dashing === false, '冲刺应已结束');
    // 冲刺在触发当帧设置 cd=1，之后每步扣一次；共跑了 31 步 → 实际扣了 30 步
    HX.assert(Math.abs(w.player.dashCd - (B.cd - 30 * DT)) < 1e-6,
      '冲刺冷却应扣掉已过时间，实为 ' + w.player.dashCd.toFixed(4));
  });

  HX.test('冲刺: 不提供无敌（GDD §6.1 明确非闪避）', function () {
    const w = bareWorld({ seed: 1 });
    run(w, 1, { moveX: 1, moveY: 0, dash: true });
    HX.assert(w.player.dashing === true, '应正在冲刺');
    HX.assert(w.player.invuln === 0, '冲刺期间不该有 i-frame，invuln=' + w.player.invuln);
  });

  HX.test('冲刺: 冷却未到时按空格不触发（CD 3 秒）', function () {
    const w = bareWorld({ seed: 1 });
    run(w, 1, { moveX: 1, moveY: 0, dash: true });
    run(w, 20, { moveX: 1, moveY: 0 });
    const x1 = w.player.pos.x;
    run(w, 1, { moveX: 1, moveY: 0, dash: true });
    HX.assert(w.player.dashing === false, 'CD 内不应再次冲刺');
    HX.assert(Math.abs(w.player.pos.x - x1 - w.player.speed * DT) < 1e-6, '应走普通速度');
  });

  // ---------- 血魔蛛自爆（GDD §11.1） ----------
  HX.test('术士: 自己的移动不走出当前屏幕（玩家移动带动镜头导致的出屏除外）', function () {
    const w = bareWorld({ seed: 3 });
    const p = w.player;
    const view = w.cam.viewRect();
    const m = HX.ENEMIES.wizard.behavior.viewMargin;

    // 术士放在"太近"区（<504）且靠屏幕右缘内侧：它会向右退，无约束时会冲出屏幕
    const e = HX.World.spawnEnemy(w, 'wizard', p.pos.x + 400, p.pos.y);
    run(w, 120, null);
    HX.assert(e.pos.x > p.pos.x + 400, '应持续向右后退');
    HX.assert(e.pos.x <= view.x + view.w - m + 1,
      '术士不应走出屏幕右缘，x=' + e.pos.x.toFixed(1) + ' 上限 ' + (view.x + view.w - m).toFixed(1));

    // 玩家向左跑 → 镜头跟走 → 术士被留在屏外：此时**不回拉**（设计者明确除外）
    const x1 = e.pos.x;
    run(w, 90, { moveX: -1, moveY: 0 });
    HX.assert(w.cam.viewRect().x < view.x, '镜头应已向左移动');
    HX.assert(Math.abs(e.pos.x - x1) < e.speed * 90 * DT + 1,
      '屏外的术士只按自己的 AI 移动，不应被拉回屏内');

    // 镜头回来后（玩家跑回术士附近）它重新受约束
    run(w, 120, { moveX: 1, moveY: 0 });
    if (e.pos.x >= w.cam.viewRect().x + m && e.pos.x <= w.cam.viewRect().x + view.w - m) {
      // 回到屏内后再退，也不应出屏
      run(w, 60, null);
      HX.assert(e.pos.x <= w.cam.viewRect().x + view.w - m + 1, '回到屏内后应重新受约束');
    }
  });

  HX.test('血魔蛛: 接触 → 0.5s 前摇 → 自爆造成 15 伤害并自身死亡', function () {
    const w = bareWorld({ seed: 2 });
    const e = HX.World.spawnEnemy(w, 'spider', w.player.pos.x + 300, w.player.pos.y);
    const hp0 = w.player.hp;

    run(w, 110, null);                                  // 约 104 步贴上接触距离（移速已降为 144）
    HX.assert(e.telegraphing === true, '应已进入自爆前摇');
    run(w, 60, null);                                   // 再 1s：前摇结束、爆炸
    HX.assert(w.stats.suicides === 1, '应记录 1 次自爆，实为 ' + w.stats.suicides);
    HX.assert(w.player.hp === hp0 - e.attack.dmg, '爆炸应造成 ' + e.attack.dmg + ' 伤害，血量 ' + w.player.hp);
    HX.assert(w.stats.dmgTaken === e.attack.dmg, '受伤统计应对得上');
  });

  HX.test('血魔蛛: 自爆不给经验（balance.enemy.suicideGivesExp=false）', function () {
    const w = bareWorld({ seed: 2 });
    HX.World.spawnEnemy(w, 'spider', w.player.pos.x + 300, w.player.pos.y);
    run(w, 180, null);
    HX.assert(w.stats.suicides === 1, '应已自爆');
    HX.assert(w.player.exp === 0, '自爆 ≠ 击杀，不应给经验，实为 ' + w.player.exp);
  });

  HX.test('血魔蛛: 用冲刺拉开距离可躲掉自爆（GDD §6.1 冲刺的定位）', function () {
    const w = bareWorld({ seed: 2 });
    const e = HX.World.spawnEnemy(w, 'spider', w.player.pos.x + 300, w.player.pos.y);
    run(w, 110, null);                                  // 接触距离 50.4px，移速 144 → 约 104 步贴上
    HX.assert(e.telegraphing === true, '应已进入自爆前摇');
    const hp0 = w.player.hp;
    run(w, 1, { moveX: -1, moveY: 0, dash: true });      // 立刻反向冲刺脱离
    run(w, 60, { moveX: -1, moveY: 0 });                 // 并继续跑（玩家 640 > 蜘蛛 144）
    HX.assert(w.stats.suicides === 1, '蜘蛛应仍自爆（前摇已启动就必炸）');
    HX.assert(w.player.hp === hp0, '冲刺脱离后不应吃伤害，血量 ' + w.player.hp);
  });

  // ---------- 邪修术士风筝与弹幕（GDD §11.2） ----------
  HX.test('术士: 太近则后退、太远则靠近、区间内原地（6~8 身位）', function () {
    const w = bareWorld({ seed: 3 });
    const p = w.player;

    const near = HX.World.spawnEnemy(w, 'wizard', p.pos.x + 300, p.pos.y);   // < 6 身位(504)
    const nx0 = near.pos.x - p.pos.x;
    run(w, 30, null);
    HX.assert(near.pos.x - p.pos.x > nx0 + 1, '太近应后退（距离变大）');

    const far = HX.World.spawnEnemy(w, 'wizard', p.pos.x + 1500, p.pos.y);   // > 8 身位(672)
    const fx0 = far.pos.x - p.pos.x;
    run(w, 30, null);
    HX.assert(far.pos.x - p.pos.x < fx0 - 1, '太远应靠近（距离变小）');

    const hold = HX.World.spawnEnemy(w, 'wizard', p.pos.x + 600, p.pos.y);   // 504~672 之间
    const hx0 = hold.pos.x;
    hold.atkTimer = 999;                                 // 静默开火，只测移动
    run(w, 30, null);
    HX.assert(Math.abs(hold.pos.x - hx0) < 1e-9, '区间内应保持原地，位移 ' + (hold.pos.x - hx0).toFixed(3));
  });

  HX.test('术士: 每 2 秒交替「追踪弹 1 发 / 扇形 3 发」', function () {
    const w = bareWorld({ seed: 3 });
    const p = w.player;
    const e = HX.World.spawnEnemy(w, 'wizard', p.pos.x + 600, p.pos.y);

    run(w, 121, null);                                   // 第一次开火（interval 2s）
    HX.assert(e.patternIndex === 1, '应已切到第 2 种弹幕，patternIndex=' + e.patternIndex);
    HX.assert(w.ebullets.length === 1, '第 1 次应为追踪弹 1 发，实为 ' + w.ebullets.length);
    HX.assert(w.ebullets[0].style === 'tracking', '样式应为 tracking');
    HX.assert(w.ebullets[0].homing !== null, '追踪弹应带 homing');

    e.atkTimer = 0;                                      // 直接推进到下一次开火（约 1ms 后）
    HX.World.step(w, DT, null);
    HX.assert(e.patternIndex === 0, '两种弹幕应循环交替，patternIndex 回到 0');
    HX.assert(w.ebullets.length === 4, '第 2 次应为扇形 3 发（累计 1+3=4），实为 ' + w.ebullets.length);
  });

  HX.test('术士: 追踪弹会朝玩家转向（turnRate 生效）', function () {
    const w = bareWorld({ seed: 3 });
    const p = w.player;
    const e = HX.World.spawnEnemy(w, 'wizard', p.pos.x + 600, p.pos.y);

    run(w, 121, null);
    const b = w.ebullets[0];
    HX.assert(b, '应有追踪弹');
    // 让玩家移动到弹的侧向，追踪弹的航向角应随之改变
    const a0 = Math.atan2(b.vel.y, b.vel.x);
    run(w, 30, { moveX: 0, moveY: -1 });
    const a1 = Math.atan2(b.vel.y, b.vel.x);
    HX.assert(Math.abs(a1 - a0) > 1e-4, '追踪弹航向应随玩家移动改变');
  });

  // ---------- 普攻自动锁敌（GDD §6 §8） ----------
  HX.test('普攻: 射程内无目标则不开火', function () {
    const w = bareWorld({ seed: 4 });                    // 默认御剑，射程 3072
    run(w, 120, null);
    HX.assert(w.stats.shots === 0, '无目标不该开火，实发 ' + w.stats.shots);
  });

  HX.test('御剑: Lv1 单剑 伤害 10，命中扣血，击杀给 25 经验', function () {
    const w = bareWorld({ seed: 4 });
    const e = dummy(w, 'spider', 600, 0);
    run(w, 80, null);                                    // 命中（600px / 512px·s⁻¹ ≈ 65 步）
    HX.assert(e.hp === e.maxHp - 10, 'Lv1 飞剑应造成 10 伤害，剩 ' + e.hp);
    HX.assert(w.stats.dmgDealt === 10, '伤害统计应为 10');

    HX.Combat.damageEnemy(w, e, 999, { source: 'normal' });
    HX.assert(w.player.exp === 25, '击杀血魔蛛应 +25 经验，实为 ' + w.player.exp);
    HX.assert(w.stats.kills === 1 && w.stats.spiderKills === 1, '击杀统计');
  });

  HX.test('御剑: 飞剑数量 = 等级（Lv3 放 3 把，2026-09-16 设计者调参）', function () {
    const w = bareWorld({ seed: 4 });
    w.player.level = 3;
    dummy(w, 'spider', 800, -100);
    dummy(w, 'spider', 800, 100);
    dummy(w, 'spider', 800, 0);
    run(w, 1, null);
    HX.assert(w.bullets.length === 3, 'Lv3 应放出 3 把飞剑，实为 ' + w.bullets.length);
    HX.assert(w.bullets[0].dmg === 12, 'Lv3 飞剑伤害应为 12（2026-09-16 二次调参）');
  });

  HX.test('南明: 6 向火球 + 命中范围爆炸（一发打中多个敌人）', function () {
    const w = bareWorld({ seed: 5, skinId: 'nanming' });
    const a = dummy(w, 'spider', 600, 0);
    const b = dummy(w, 'spider', 700, 0);                // 与 a 距离 100 < 爆炸半径 384
    run(w, 1, null);
    HX.assert(w.bullets.length === 6, 'Lv1 应为 6 向火球，实为 ' + w.bullets.length);
    run(w, 80, null);                                    // 让对准 a 的那一发飞抵并爆炸
    HX.assert(a.hp < a.maxHp, '被直接命中的目标应掉血');
    HX.assert(b.hp < b.maxHp, '爆炸范围内的第二个目标也应掉血');
    HX.assert(w.stats.dmgDealt === 30, '两个目标各 15 伤害，共 30（2026-09-16 调参），实为 ' + w.stats.dmgDealt);
  });

  HX.test('九霄: 雷链传导、传导伤害为直击一半（GDD §8.3）', function () {
    const w = bareWorld({ seed: 6, skinId: 'jiuxiao' });
    const a = dummy(w, 'spider', 400, 0);
    const b = dummy(w, 'spider', 580, 0);                 // 与 a 距离 180 < 链接范围 200（Lv1）
    const c = dummy(w, 'spider', 750, 0);                 // 与 b 距离 170 < 200
    run(w, 1, null);
    HX.assert(w.bullets.length === 1, '雷链术应为单发，实为 ' + w.bullets.length);
    HX.assert(w.bullets[0].chain !== null, '应带传导参数');
    run(w, 60, null);                                    // 首发命中
    const expect = 16 + 8 + 4;                            // 16 / 8 / 4（传导 = 直击一半）
    HX.assert(Math.abs(w.stats.dmgDealt - expect) < 1e-6,
      '三段传导总伤害应为 ' + expect.toFixed(2) + '，实为 ' + w.stats.dmgDealt.toFixed(2));
    HX.assert(a.hp === a.maxHp - 16 && b.hp === b.maxHp - 8 && c.hp === c.maxHp - 4,
      '三段伤害应分别为 16 / 8 / 4');
  });

  // ---------- 伤害规则与经验/能量（GDD §10 §14 §8） ----------
  HX.test('伤害: 受伤后 0.5s 内不再吃第二次（无敌帧，GDD §14）', function () {
    const w = bareWorld({ seed: 7 });
    const first = HX.Combat.damagePlayer(w, 15, {});
    const second = HX.Combat.damagePlayer(w, 15, {});
    HX.assert(first === true && second === false, '第二次应被无敌帧挡下');
    run(w, 31, null);                                    // 0.52s 后无敌结束
    const third = HX.Combat.damagePlayer(w, 15, {});
    HX.assert(third === true, '无敌帧结束后应能再次受伤');
  });

  HX.test('能量: 命中 +5 且 0.5 秒内只算一次（GDD §10）', function () {
    const w = bareWorld({ seed: 7 });
    HX.Combat.addEnergyOnHit(w, 'normal');
    HX.Combat.addEnergyOnHit(w, 'normal');
    HX.assert(w.player.energy === 5, '0.5s 内多次命中只算一次，实为 ' + w.player.energy);
    run(w, 31, null);
    HX.Combat.addEnergyOnHit(w, 'normal');
    HX.assert(w.player.energy === 10, '冷却结束应再 +5，实为 ' + w.player.energy);
  });

  HX.test('能量: 护身技/大招伤害不积累（GDD §10）；受伤 +5 且 1 秒一次', function () {
    const w = bareWorld({ seed: 7 });
    HX.Combat.addEnergyOnHit(w, 'guard');
    HX.Combat.addEnergyOnHit(w, 'ult');
    HX.assert(w.player.energy === 0, 'guard/ult 伤害不应积累能量');

    HX.Combat.damagePlayer(w, 5, {});
    HX.assert(w.player.energy === 5, '受伤应 +5');
    run(w, 61, null);
    HX.Combat.damagePlayer(w, 5, {});
    HX.assert(w.player.energy === 10, '1 秒后再受伤应再 +5');
  });

  HX.test('升级: 累计经验阈值 750/1750/3000/4500 → Lv2~Lv5（GDD §8，×12.5 保持原节奏）', function () {
    const w = bareWorld({ seed: 8 });
    const p = w.player;
    HX.Combat.gainExp(w, 750);
    HX.assert(p.level === 2, '750 经验应到 Lv2，实为 Lv' + p.level);
    HX.Combat.gainExp(w, 1000);
    HX.assert(p.level === 3, '累计 1750 应到 Lv3');
    HX.Combat.gainExp(w, 1250);
    HX.assert(p.level === 4, '累计 3000 应到 Lv4');
    HX.Combat.gainExp(w, 1250);
    HX.assert(p.level === 5, '累计 4250 应到 Lv5（补怪最坏情况）');
    HX.assert(p.expRatio === 1, '满级后经验条应满');
  });

  // ---------- 波次与胜负（GDD §12 §15） ----------
  HX.test('波次: 3 轮共 170 只（160 蛛 + 10 术，三调），清完 → phase=clear 且已达 Lv5', function () {
    const w = HX.World.create({ seed: 11 });
    let guard = 0;
    while (w.phase === 'waves' && guard++ < 60 * 600) {
      HX.World.step(w, DT, null);
      for (let i = 0; i < w.enemies.length; i++) {
        const e = w.enemies[i];
        if (e.alive) HX.Combat.damageEnemy(w, e, 99999, { source: 'normal' });
      }
    }
    HX.assert(w.phase === 'clear', '三轮清完 phase 应为 clear，实为 ' + w.phase);
    HX.assert(w.stats.kills === 170, '三轮共 170 只，实为 ' + w.stats.kills);
    // 击杀补怪固定补蜘蛛且消耗配额 → 蛛/术构成动态，只断言总数守恒
    HX.assert(w.stats.spiderKills + w.stats.wizardKills === 170, '蛛 + 术击杀合计应守恒 170');
    HX.assert(w.player.level === 5, '清完三轮应到 Lv5，实为 Lv' + w.player.level);
    HX.assert(w.round === 3, '轮次应停在 3，实为 ' + w.round);
  });

  HX.test('波次: 击杀补怪 —— 时间刷新停在 cap，杀一只立即补一只，总数守恒', function () {
    const w = HX.World.create({ seed: 12 });
    // 不击杀：等时间刷满 cap（第 1 轮上限 10）
    let guard = 0;
    while (HX.World.aliveEnemyCount(w) < 10 && guard++ < 60 * 30) HX.World.step(w, DT, null);
    HX.assert(HX.World.aliveEnemyCount(w) === 10, '时间刷新应停在 cap=10，实为 ' + HX.World.aliveEnemyCount(w));
    // 杀一只 → 立即补一只（场上回满 10）
    const before = HX.World.aliveEnemyCount(w);
    const k0 = w.stats.kills;
    HX.Combat.damageEnemy(w, w.enemies[0], 99999, { source: 'normal' });
    HX.assert(HX.World.aliveEnemyCount(w) === before, '击杀后应立即补一只');
    HX.assert(w.stats.kills === k0 + 1, '击杀数 +1');
    // 连杀到队列耗尽：总击杀不可能超过本轮配额 32
    guard = 0;
    while (HX.World.aliveEnemyCount(w) > 0 && guard++ < 60 * 120) {
      HX.World.step(w, DT, null);
      for (let i = 0; i < w.enemies.length; i++) {
        if (w.enemies[i].alive) HX.Combat.damageEnemy(w, w.enemies[i], 99999, { source: 'normal' });
      }
    }
    HX.assert(w.stats.kills <= 32, '第 1 轮总击杀不应超过配额 32，实为 ' + w.stats.kills);
    HX.assert(w.phase === 'waves' || w.phase === 'clear', '第 1 轮结束后应在轮间等待或已进下一轮');
  });

  HX.test('波次: 刷怪点不贴脸（≥ spawnMinDist）且贴墙时也不会被夹到玩家身边', function () {
    const W = HX.WAVES, C = HX.C;
    // ① 直接验证取点函数（纯函数，不受敌人移动干扰）
    //    "不贴脸" 是硬约束（任何站位都要满足）；"不在 edgeMargin 内距带里" 是软约束 ——
    //    玩家自己站得比 edgeMargin 还靠边时（合法，空气墙在 WALL_MARGIN）
    // 故分两组站位分别断言。
    const insideBox = [
      { x: C.ARENA.w * 0.5, y: C.ARENA.h * 0.5 },        // 场地中心
      { x: W.edgeMargin + 100, y: W.edgeMargin + 100 },  // 内距带内侧的左上
      { x: C.ARENA.w - W.edgeMargin - 100, y: C.ARENA.h - W.edgeMargin - 100 },
      { x: C.ARENA.w * 0.5, y: W.edgeMargin + 1 }
    ];
    const nearWall = [
      { x: C.PLAYER.solidR + C.WALL_MARGIN, y: C.PLAYER.solidR + C.WALL_MARGIN },   // 玩家能站到的极限角落
      { x: C.ARENA.w - C.PLAYER.solidR - C.WALL_MARGIN, y: C.ARENA.h - C.PLAYER.solidR - C.WALL_MARGIN },
      { x: 2880, y: C.PLAYER.solidR + C.WALL_MARGIN }                               // 贴上边
    ];

    function probe(spot, soft) {
      const w = bareWorld({ seed: 20 });
      w.player.pos.x = spot.x;
      w.player.pos.y = spot.y;
      for (let i = 0; i < 200; i++) {
        const pt = HX.Spawn.pickPosition(w);
        const d = Math.hypot(pt.x - w.player.pos.x, pt.y - w.player.pos.y);
        HX.assert(d >= W.spawnMinDist - 1e-6,
          '站位(' + spot.x.toFixed(0) + ',' + spot.y.toFixed(0) + ') 第 ' + i + ' 次取点距离 ' + d.toFixed(1) + ' 应 ≥ ' + W.spawnMinDist);
        HX.assert(pt.x >= 0 && pt.x <= C.ARENA.w && pt.y >= 0 && pt.y <= C.ARENA.h,
          '取点不得越出地图');
        if (soft) {
          HX.assert(pt.x >= W.edgeMargin - 1e-6 && pt.x <= C.ARENA.w - W.edgeMargin + 1e-6 &&
            pt.y >= W.edgeMargin - 1e-6 && pt.y <= C.ARENA.h - W.edgeMargin + 1e-6,
            '站位在内距带内时，取点也应在内距带内，实为 (' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ')');
        }
      }
    }
    for (let i = 0; i < insideBox.length; i++) probe(insideBox[i], true);
    for (let i = 0; i < nearWall.length; i++) probe(nearWall[i], false);

    // ② 端到端：本步出场后立刻量距离，只允许"该帧小怪朝玩家挪了一步"的偏差
    const w2 = HX.World.create({ seed: 13 });
    let minD = Infinity;
    for (let i = 0; i < 60 * 12 && w2.phase === 'waves'; i++) {
      HX.World.step(w2, DT, null);
      for (let k = 0; k < w2.enemies.length; k++) {
        const e = w2.enemies[k];
        if (e.bornAt === w2.time) {
          minD = Math.min(minD, Math.hypot(e.pos.x - w2.player.pos.x, e.pos.y - w2.player.pos.y));
        }
      }
      for (let k = 0; k < w2.enemies.length; k++) {
        if (w2.enemies[k].alive) HX.Combat.damageEnemy(w2, w2.enemies[k], 99999, { source: 'normal' });
      }
    }
    const oneStep = HX.ENEMIES.spider.speed * DT;   // 出场同帧最大逼近量
    HX.assert(minD < Infinity, '应至少出过一只怪');
    HX.assert(minD >= W.spawnMinDist - oneStep - 1e-6,
      '出场距离应 ≥ ' + W.spawnMinDist + '（扣一帧逼近 ' + oneStep.toFixed(1) + '），实为 ' + minD.toFixed(1));
  });

  HX.test('胜负: 玩家血量归零 → outcome=down、phase=over（GDD §15）', function () {
    const w = bareWorld({ seed: 12 });
    HX.Combat.damagePlayer(w, 99999, { ignoreIframe: true });
    HX.assert(w.player.hp === 0, '血量应清零');
    HX.World.step(w, DT, null);
    HX.assert(w.outcome === 'down', '应判负，实为 ' + w.outcome);
    HX.assert(w.phase === 'over', 'phase 应为 over');
  });

  HX.test('胜负: 玩家阵亡后不再移动（intent 无效）', function () {
    const w = bareWorld({ seed: 12 });
    HX.Combat.damagePlayer(w, 99999, { ignoreIframe: true });
    HX.World.step(w, DT, null);
    const x0 = w.player.pos.x;
    run(w, 30, { moveX: 1, moveY: 0 });
    HX.assert(w.player.pos.x === x0, '阵亡后不应再移动');
  });

  // ---------- 架构与确定性约束 ----------
  HX.test('架构: 世界推进不依赖渲染（systems 无 render 引用）', function () {
    const src = String(HX.World.step) + String(HX.Movement.stepPlayer) +
      String(HX.EnemyAI.step) + String(HX.Skill.step) + String(HX.Combat.resolve) + String(HX.Spawn.step);
    HX.assert(src.indexOf('Renderer') === -1 && src.indexOf('HX.Art') === -1,
      'systems 层不得引用 render 层（AGENTS §5）');
  });

  HX.test('确定性: 相同 seed + 相同 intent 序列 → 完全相同（AGENTS §4）', function () {
    function play(seed) {
      const w = HX.World.create({ seed: seed });
      for (let i = 0; i < 900; i++) {
        HX.World.step(w, DT, { moveX: 1, moveY: 0.3, dash: (i % 200 === 0) });
      }
      const e0 = w.enemies.length ? w.enemies[0].pos.x.toFixed(6) : 'none';
      return [w.player.pos.x.toFixed(6), w.player.pos.y.toFixed(6), w.player.hp,
        w.stats.kills, w.stats.dmgDealt.toFixed(6), w.stats.shots, w.enemies.length, e0].join('|');
    }
    const a = play(777), b = play(777);
    HX.assert(a === b, '同种子结果应完全一致:\n' + a + '\n' + b);
    const c = play(778);
    HX.assert(a !== c, '不同种子应产生不同局面');
  });

  HX.test('确定性: 逻辑层不读时钟（world.step 只按传入 dt 推进）', function () {
    const w = bareWorld({ seed: 14 });
    run(w, 60, null);
    HX.assert(Math.abs(w.time - 1) < 1e-9, '逻辑时间应严格等于步数 × dt，实为 ' + w.time);
    HX.assert(w.step === 60, '步数应为 60，实为 ' + w.step);
  });
})();
