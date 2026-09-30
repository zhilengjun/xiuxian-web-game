// 集成测试：BOSS 三阶段 / 石柱点燃 / 狂暴 / 胜负三态 / 灵石与护身技 / 大招。
// 与 test_world.js 同一套无头驱动约定：world.phase='parked' 停波次、直接调用系统方法做受控断言。
(function () {
  const HX = window.HX || (window.HX = {});
  const DT = HX.C.FIXED_DT;

  function run(w, steps, intent) {
    for (let i = 0; i < steps; i++) HX.World.step(w, DT, intent);
  }

  function bareWorld(opts) {
    const w = HX.World.create(opts || {});
    w.phase = 'parked';
    return w;
  }

  // 直接把世界推进到"BOSS 已登场"（跳过三轮小怪：那是 test_world 的波次用例职责）
  function withBoss(opts) {
    const w = HX.World.create(opts || {});
    w.phase = 'clear';
    w.bossDelay = 0.001;
    run(w, 2, null);
    if (!w.boss) throw new Error('BOSS 未登场');
    return w;
  }

  function dummy(w, typeId, dx, dy) {
    const e = HX.World.spawnEnemy(w, typeId, w.player.pos.x + dx, w.player.pos.y + (dy || 0));
    e.behavior = null;
    return e;
  }

  // ---------- 登场 ----------
  HX.test('boss: 三轮清完 → afterLastRound 后登场（紫闪 + 演出 + phase=boss）', function () {
    const w = HX.World.create({ seed: 1 });
    // 直接把波次推进到"三轮清完"（清场由测试代打）
    let guard = 0;
    while (w.phase === 'waves' && guard++ < 60 * 300) {   // 131 只 × 0.7s ≈ 92s，上限放宽到 5 分钟
      HX.World.step(w, DT, null);
      for (let i = 0; i < w.enemies.length; i++) {
        if (w.enemies[i].alive) HX.Combat.damageEnemy(w, w.enemies[i], 99999, { source: 'normal' });
      }
    }
    HX.assert(w.phase === 'clear', '三轮清完 phase=clear，实为 ' + w.phase);
    HX.assert(!w.boss, '登场前不应有 BOSS');
    run(w, 1, null);
    HX.assert(w.bossDelay > 0, '应进入登场倒计时（afterLastRound）');
    run(w, Math.ceil(HX.WAVES.afterLastRound / DT) + 2, null);
    HX.assert(!!w.boss && w.phase === 'boss', '倒计时结束 BOSS 应登场，phase=' + w.phase);
    HX.assert(w.boss.uid > 0, 'BOSS 应有 uid（弹幕去重用）');
    HX.assert(w.flash > 0, '登场应有屏幕紫闪');
  });

  HX.test('boss: 普通阶段每 4s 轮换 环形(留缝)/扇形/地火', function () {
    const w = withBoss({ seed: 2 });
    const b = w.boss;
    // ① ring：14 发带缺口 → 弹数 < 14
    b.atkTimer = 0.001;
    run(w, 2, null);
    HX.assert(w.ebullets.length > 0 && w.ebullets.length < HX.BOSS.normal.ring.count,
      '环形弹应留缝（0 < n < 14），实为 ' + w.ebullets.length);
    // ② fan：5 发指向玩家
    b.atkTimer = 0.001;
    run(w, 2, null);
    HX.assert(w.ebullets.length >= 1 + HX.BOSS.normal.fan.count,
      '第二轮应为扇形 5 发，累计 ' + w.ebullets.length);
    // ③ groundfire：3 个预警环
    b.atkTimer = 0.001;
    run(w, 2, null);
    HX.assert(w.hazards.length === HX.BOSS.normal.groundfire.count,
      '应有 3 个地火预警，实为 ' + w.hazards.length);
    // 玩家站进第一个预警圈中心 → 延迟 1s 爆发吃 25 伤
    // （先清掉 ①② 已在飞行的敌方弹幕、只留一个预警环，避免干扰精确计数）
    for (let i = 0; i < w.pools.bullet.active.length; i++) {
      if (w.pools.bullet.active[i].side === 'enemy') w.pools.bullet.active[i].alive = false;
    }
    w.hazards.splice(1);
    const hz = w.hazards[0];
    const hp0 = w.player.hp;
    w.player.pos.x = hz.pos.x;
    w.player.pos.y = hz.pos.y;
    run(w, Math.ceil(hz.delay / DT) + 2, null);
    HX.assert(w.player.hp === hp0 - hz.dmg, '地火爆发应恰好造成 ' + hz.dmg + ' 伤害，血量 ' + w.player.hp);
    HX.assert(w.hazards.length === 0, '爆发后预警环应转为灼痕移除');
    HX.assert(w.fires.length > 0, '爆发处应留下灼痕');
  });

  HX.test('boss: 召唤小怪 —— 首波 5s，之后每 12s，普通/石柱阶段频率不同', function () {
    const w = withBoss({ seed: 3 });
    const kills0 = w.stats.kills;
    run(w, Math.ceil(HX.BOSS.normal.summon.first / DT) + 2, null);
    // 召唤出来的小怪可能已被玩家普攻打死 —— 按"场上存活 + 期间击杀"计
    const spawned = w.enemies.length + (w.stats.kills - kills0);
    HX.assert(spawned >= HX.BOSS.normal.summon.countMin,
      '首波应 ≥ ' + HX.BOSS.normal.summon.countMin + ' 只（存活+击杀），实为 ' + spawned);
    const n1 = w.enemies.length + w.stats.kills;
    run(w, Math.ceil(HX.BOSS.normal.summon.every / DT) + 2, null);
    HX.assert(w.enemies.length + w.stats.kills > n1, '每 12s 应再召唤一波');
  });

  // ---------- 石柱阶段 ----------
  // ---------- 石柱阶段 ----------
  HX.test('大招·御剑: 万剑穿透 —— 单剑连穿三只紧密小怪（命中不消失，对群收割）', function () {
    const w = bareWorld({ seed: 20, skinId: 'yujian' });
    const p = w.player;
    p.atkTimer = 999999;                             // 关普攻排除干扰
    const a = dummy(w, 'spider', 400, 0);
    const b = dummy(w, 'spider', 412, 0);
    const c = dummy(w, 'spider', 424, 0);            // 紧密一线（间隔 12px）
    p.energy = 100;
    HX.Skill.stepUlt(w, DT, { ult: true });
    run(w, Math.ceil(0.5 / DT) + 120);               // 首把起飞 + 追踪飞抵并穿过三只
    HX.assert(a.hp <= 0 && b.hp <= 0 && c.hp <= 0, '单剑应穿透连杀三只');
    HX.assert(w.stats.dmgDealt === 150, '三只各记 50 伤 = 150，实为 ' + w.stats.dmgDealt);
    // 穿透证据：命中过目标的飞剑仍存活（pierce > 0）
    const pierced = w.bullets.filter(function (bb) {
      return bb.source === 'ult' && bb.alive && bb.hitIds.length >= 3;
    });
    HX.assert(pierced.length >= 1, '应存在至少一把连穿三只仍存活的飞剑');
  });

  HX.test('boss: 50% 血 → 石柱阶段：召唤 4 柱（地下冒出）+ 追踪弹上线', function () {
    const w = withBoss({ seed: 4 });
    const b = w.boss;
    HX.assert(b.phase === HX.BOSS.PHASE.NORMAL, '初始应为普通阶段');
    b.hp = b.maxHp * HX.BOSS.pillarPhase.triggerAt;
    run(w, 2, null);
    HX.assert(b.phase === HX.BOSS.PHASE.PILLAR, '≤50% 应进入石柱阶段，实为 ' + b.phase);
    HX.assert(w.pillars.length === 4, '应召唤 4 根石柱');
    HX.assert(!HX.Pillar.isEmerged(w.pillars[0]), '石柱应处于出土过程');
    HX.assert(b.casting === true && b.invuln === true, '召唤施法中：原地不动 + 无敌（2s）');
    run(w, Math.ceil(HX.C.PILLAR.emergeTime / DT) + 2, null);
    HX.assert(HX.Pillar.isEmerged(w.pillars[0]), '出土完成后才有碰撞/可点燃');
    HX.assert(b.casting === false && b.invuln === false, '施法结束恢复常态（与石柱升起同步）');
  });

  HX.test('boss: 追踪弹命中玩家 → 最近未点燃石柱延迟点燃', function () {
    const w = withBoss({ seed: 5 });
    const b = w.boss;
    b.hp = b.maxHp * 0.4;                     // 直接进入石柱阶段
    run(w, 2, null);
    const conf = HX.BOSS.pillarPhase.tracking;
    HX.assert(HX.BossSys.igniteNearestPillar(w) === true, '应成功指定一根石柱点燃');
    const target = w.pillars.filter(function (pl) { return pl.pendingLitAt !== undefined; })[0];
    HX.assert(!!target, '应有石柱进入"点燃途中"');
    run(w, 1, null);
    HX.assert(target.lit === false, 'igniteDelay 内还不应点亮');
    run(w, Math.ceil(conf.igniteDelay / DT) + 2, null);
    HX.assert(target.lit === true, '延迟结束应点燃');
    // 已点燃/点燃途中的柱子不会被再次指定
    HX.assert(HX.BossSys.igniteNearestPillar(w) === true, '第二发应指定另一根');
    const n2 = w.pillars.filter(function (pl) { return pl.lit || pl.pendingLitAt !== undefined; }).length;
    HX.assert(n2 === 2, '应恰好两根处于点燃态，实为 ' + n2);
  });

  HX.test('boss: 4 柱全燃 → 狂暴：无敌 / 放大 / 地火倾泻 / 1.5s 后判负 rage', function () {
    const w = withBoss({ seed: 6 });
    const b = w.boss;
    b.hp = b.maxHp * 0.4;
    run(w, Math.ceil(HX.C.PILLAR.emergeTime / DT) + 2, null);   // 等出土
    // 狂暴演出期间玩家会被 BOSS 贴身 + 地火覆盖 —— 给玩家超量血量，
    // 专测"1.5s 演出后判负 rage"这条（玩家被打死的 down 分支另有用例）
    w.player.hp = 100000;
    for (let i = 0; i < w.pillars.length; i++) w.pillars[i].lit = true;
    run(w, 2, null);
    HX.assert(b.phase === HX.BOSS.PHASE.ENRAGE, '4 柱全燃应进入狂暴，实为 ' + b.phase);
    HX.assert(b.invuln === true && b.scale === HX.BOSS.enrage.scale, '狂暴：无敌 + 体型 1.5x');

    const hp0 = b.hp;
    HX.Combat.damageBoss(w, 99999, { source: 'normal' });
    HX.assert(b.hp === hp0, '狂暴时 BOSS 无敌，不掉血');

    run(w, 2, null);
    HX.assert(w.hazards.length >= HX.BOSS.enrage.groundfire.count - 2,
      '狂暴应倾泻大量地火预警，实为 ' + w.hazards.length);
    const outcomeAt = w.outcome;
    HX.assert(!outcomeAt, '演出 1.5s 内不应判负');
    run(w, Math.ceil(HX.BOSS.enrage.delay / DT) + 2, null);
    HX.assert(w.outcome === 'rage', '演出结束应判负（rage），实为 ' + w.outcome);
    HX.assert(w.phase === 'over', 'phase 应为 over');
  });

  HX.test('boss: 石柱全燃前击杀 BOSS → 判胜（win）', function () {
    const w = withBoss({ seed: 7 });
    HX.assert(w.pillars.length === 0, '普通阶段不应有石柱');
    HX.Combat.damageBoss(w, 999999, { source: 'normal' });
    run(w, 2, null);
    HX.assert(w.outcome === 'win', '击杀 BOSS 应判胜，实为 ' + w.outcome);
    HX.assert(w.phase === 'over', 'phase 应为 over');
  });

  HX.test('boss: 石柱结界也围住 BOSS（已在结界内时不能越出）', function () {
    const w = withBoss({ seed: 15 });
    const b = w.boss;
    b.hp = b.maxHp * 0.4;
    run(w, 2, null);
    HX.assert(!!w.pillarRect, '石柱阶段应激活结界矩形');
    const r = w.pillarRect;
    // BOSS 与玩家都放进结界内 → BOSS 追玩家时不能越出结界
    b.pos.x = (r.x0 + r.x1) / 2;
    b.pos.y = (r.y0 + r.y1) / 2;
    w.player.pos.x = r.x0 + 200;
    w.player.pos.y = r.y0 + 200;
    w.player.hp = 100000;                             // 防止被 BOSS 接触磨死干扰断言
    run(w, 120, null);
    HX.assert(b.pos.x >= r.x0 + b.solidR - 0.01 && b.pos.x <= r.x1 - b.solidR + 0.01,
      'BOSS 不应越出结界左右缘，x=' + b.pos.x.toFixed(1));
    HX.assert(b.pos.y >= r.y0 + b.solidR - 0.01 && b.pos.y <= r.y1 - b.solidR + 0.01,
      'BOSS 不应越出结界上下缘，y=' + b.pos.y.toFixed(1));
  });

  HX.test('boss: BOSS 接触伤害 20 / CD 1s（GDD §13.1）', function () {
    const w = withBoss({ seed: 8 });
    const b = w.boss, p = w.player;
    p.pos.x = b.pos.x + b.solidR + p.solidR - 1;   // 贴上 BOSS
    p.pos.y = b.pos.y;
    const hp0 = p.hp;
    run(w, 3, null);
    HX.assert(p.hp === hp0 - b.contact.dmg, '接触应造成 ' + b.contact.dmg + ' 伤害');
    HX.assert(p.hp === hp0 - b.contact.dmg, '接触 CD 1s 内不应连续掉血');
  });

  // ---------- 灵石掉落 / 拾取 / 护身技 ----------
  HX.test('灵石: 小怪死亡 30% 掉落（种子确定性）+ 自动拾取激活护身技', function () {
    const w = bareWorld({ seed: 7 });
    for (let i = 0; i < 30; i++) {
      const e = HX.World.spawnEnemy(w, 'spider', w.player.pos.x + 500 + i, w.player.pos.y);
      HX.Combat.damageEnemy(w, e, 999, { source: 'normal' });
    }
    HX.assert(w.pickups.length > 0, '30 只 30% 掉率下应有掉落（seed=7），实为 ' + w.pickups.length);
    // 拾取：把玩家挪到灵石上
    const pk = w.pickups[0];
    w.player.pos.x = pk.pos.x;
    w.player.pos.y = pk.pos.y;
    HX.World.step(w, DT, null);
    HX.assert(w.player.guardTimer > 0, '拾取应激活护身技 10s，实为 ' + w.player.guardTimer.toFixed(2));
    HX.assert(!pk.alive, '灵石应被消耗');
    // 重复拾取：只刷新，不叠加（拾取发生在 stepGuard，随后 stepTimers 扣 1 步时长）
    // 清掉场上其它灵石 —— 30 只怪掉在相近位置，避免这一步捡到别颗导致断言失真
    w.pickups.length = 0;
    const pk2 = HX.World.spawnPickup(w, 'guardStone', w.player.pos.x, w.player.pos.y);
    w.player.guardTimer = 5;                        // 人为掉一半
    HX.World.step(w, DT, null);
    HX.assert(w.player.guardTimer > 9.9,
      '重复拾取应刷新到 10s（不叠加，扣 1 步后 ≈9.98），实为 ' + w.player.guardTimer.toFixed(3));
    HX.assert(!pk2.alive, '第二颗灵石同样被消耗');
  });

  HX.test('护身技·御剑: 本命法剑接触伤害 8（轨道 195 圆盘内均命中），同一目标一圈最多一次', function () {
    const w = bareWorld({ seed: 9 });
    const p = w.player;
    p.atkTimer = 999999;                             // 关掉普攻：dummy 在射程内，普攻会干扰精确计数
    p.guardTimer = HX.SKINS.yujian.guard.duration;
    const g = HX.SKINS.yujian.guard;
    // ① 贴脸怪（距玩家 ~44，2026-09-16 玩家实测 BUG 场景）：圆盘判定必须覆盖
    const close = dummy(w, 'spider', 44, 0);
    const closeHp = close.hp;
    // ② 轨道上的怪
    const e = dummy(w, 'spider', g.orbitR, 0);
    const hp0 = e.hp;
    run(w, 2, null);
    HX.assert(e.hp === hp0 - g.dmg, '轨道上的怪应受 ' + g.dmg + ' 伤害，剩 ' + e.hp);
    HX.assert(close.hp === closeHp - g.dmg, '贴脸怪也应在圆盘内受 ' + g.dmg + ' 伤害，剩 ' + close.hp);
    HX.assert(e.guardCd > 0, '命中后应进入按圈结算冷却');
    run(w, 30, null);                                 // 0.5s：同一圈内不应再吃
    HX.assert(e.hp === hp0 - g.dmg, '按圈结算：一圈内不应重复伤害');
    HX.assert(close.hp === closeHp - g.dmg, '贴脸怪按圈结算：一圈内不应重复伤害');
  });

  HX.test('护身技·南明: 移动留下火痕，范围内敌人按 tick 掉血', function () {
    const w = bareWorld({ seed: 10, skinId: 'nanming' });
    const p = w.player;
    p.guardTimer = HX.SKINS.nanming.guard.duration;
    const g = HX.SKINS.nanming.guard;
    const e = dummy(w, 'spider', 30, 0);              // 站在玩家脚下附近（火痕半径内）
    const hp0 = e.hp;
    // 直接调 guardTrail（绕开 movement 覆盖 vel），模拟玩家持续移动
    p.vel.x = 100; p.vel.y = 0;
    for (let i = 0; i < 30; i++) HX.Skill.stepGuard(w, DT);
    HX.assert(w.fires.length >= 2, '移动应持续落火痕，实为 ' + w.fires.length);
    const f0 = w.fires[0];
    HX.Combat.damageArea(w, f0.pos.x, f0.pos.y, f0.r, f0.tickDmg, f0.source, true);
    HX.assert(e.hp < hp0, '火痕范围内的敌人应掉血');
  });

  HX.test('护身技·九霄: 雷池每 1s 伤害 + 50% 概率麻痹（半径 512，2026-09-16 调整）', function () {
    const w = bareWorld({ seed: 11, skinId: 'jiuxiao' });
    const p = w.player;
    p.guardTimer = HX.SKINS.jiuxiao.guard.duration;
    const g = HX.SKINS.jiuxiao.guard;
    HX.assert(g.radius === 512 && g.tickEvery === 1.0 && g.paralyzeChance === 0.5,
      '雷池参数应为 512 / 1s / 50%（设计者调整）');
    const e = dummy(w, 'spider', 300, 0);             // 雷池半径 512 内
    e.hp = 10000; e.maxHp = 10000;                    // 撑住多轮 tick 观察概率麻痹
    // 跑 12 个 tick（12s）：每个 tick 范围内必掉血，50% 概率麻痹（种子确定性）
    let sawParalysis = false;
    for (let i = 0; i < Math.ceil(g.tickEvery * 12 / DT); i++) {
      HX.Skill.stepGuard(w, DT);
      if (e.paraTimer > 0) sawParalysis = true;
    }
    HX.assert(e.hp === 10000 - g.dmg * 12, '12 个 tick 应造成 ' + (g.dmg * 12) + ' 伤害，实为 ' + (10000 - e.hp));
    HX.assert(sawParalysis, '50% 概率 × 12 tick 应至少麻痹一次');
    HX.assert(e.paraTimer <= g.paralyze + 0.01, '麻痹时长应为 1s 量级');
    // 站在雷池外的敌人不受影响
    const far = dummy(w, 'spider', 2000, 0);
    const farHp = far.hp;
    for (let i = 0; i < Math.ceil(g.tickEvery * 3 / DT); i++) HX.Skill.stepGuard(w, DT);
    HX.assert(far.hp === farHp && far.paraTimer === 0, '雷池外不应受伤也不应被麻痹');
  });

  HX.test('护身技·九霄: 雷池对 BOSS 也造成伤害（includeBoss 修复回归）', function () {
    const w = withBoss({ seed: 11, skinId: 'jiuxiao' });
    const p = w.player;
    p.guardTimer = HX.SKINS.jiuxiao.guard.duration;
    const g = HX.SKINS.jiuxiao.guard;
    w.boss.pos.x = p.pos.x + 100;                     // BOSS 挪进雷池半径
    w.boss.pos.y = p.pos.y;
    const hp0 = w.boss.hp;
    for (let i = 0; i < Math.ceil(g.tickEvery * 3 / DT); i++) HX.Skill.stepGuard(w, DT);
    HX.assert(w.boss.hp === hp0 - g.dmg * 3,
      'BOSS 应吃 3 tick 雷池伤害 ' + (g.dmg * 3) + '，实扣 ' + (hp0 - w.boss.hp));
  });

  // ---------- 大招 ----------
  HX.test('大招·御剑: 万剑归宗 20 把现身悬停 0.5s → 0.1s 间隔逐把飞出（弧线锁敌）；无 CD', function () {
    const w = withBoss({ seed: 12 });
    const p = w.player;
    p.atkTimer = 999999;                             // 关普攻排除干扰
    p.energy = 100;
    HX.Skill.stepUlt(w, DT, { ult: true });
    HX.assert(p.ultSwordQueue && p.ultSwordQueue.swords.length === 20, '施放应现身 20 把悬停飞剑');
    HX.assert(p.energy === 0 && p.ultCd === 0, '能量清零；大招无 CD');
    HX.World.refreshIndexes(w);
    HX.assert(w.bullets.filter(function (bb) { return bb.source === 'ult'; }).length === 0,
      '悬停期不飞出');

    run(w, 31);                                       // 0.52s：悬停结束，首把起飞
    HX.assert(p.ultSwordQueue.left === 19, '0.5s 后应起飞 1 把，剩 ' + p.ultSwordQueue.left);
    const shots0 = w.stats.shots;
    run(w, 160);                                      // +2.67s：全部起飞（末把 launchAt = 2.4s）
    HX.World.refreshIndexes(w);
    const ultBullets = w.bullets.filter(function (bb) { return bb.source === 'ult'; });
    // ⚠ 存活数不作数：速度 = 原弹速后，先飞的剑已陆续命中 BOSS 被销毁 —— 按"累计发射数"断言
    //（首把已在 run(31) 计入 shots0，本段应再发 19 把）
    HX.assert(w.stats.shots - shots0 === 19,
      '应累计再发射 19 把，实为 ' + (w.stats.shots - shots0));
    if (ultBullets.length > 0) {
      HX.assert(!!ultBullets[0].homing && !!ultBullets[0].homing.target, '有敌人时应锁定目标（弧线轨迹）');
      HX.assert(Math.abs(Math.hypot(ultBullets[0].vel.x, ultBullets[0].vel.y) - HX.C.BULLET_SPEED * 1.5) < 1e-6,
        '大招飞剑速度应为原弹速 ×1.5（13:18 调）');
    }
    HX.assert(!p.ultSwordQueue, '全部起飞后队列应清空');
    HX.assert(p.ultCd === 0, '大招无 CD');
    p.energy = 100;
    HX.Skill.stepUlt(w, DT, { ult: true });
    HX.assert(p.ultSwordQueue && p.ultSwordQueue.swords.length === 20, '能量攒满可再次施放（无 CD 门控）');
  });

  HX.test('大招·南明: 火凤燎原 —— 横贯屏幕 3 秒，768×768 盒内每 0.2s 吃 100（方向随机）', function () {
    const w = bareWorld({ seed: 13, skinId: 'nanming' });
    const p = w.player;
    p.atkTimer = 999999;                              // 关普攻：六向火球会污染目标血量
    const view = w.cam.viewRect();
    // 目标放在玩家同一水平线上（火凤起飞高度 = 玩家 Y），分别近/旁（dummy 为相对玩家偏移）
    const inPath = dummy(w, 'spider', 400, 0);
    inPath.maxHp = 1500; inPath.hp = 1500;            // 加血：30 血第一 tick 就死，无法验证"多次 tick"
    const offPath = dummy(w, 'spider', 400, 600);     // 纵向 600 > 半盒 384 + 判定
    p.energy = 100;
    HX.Skill.stepUlt(w, DT, { ult: true });
    HX.assert(p.energy === 0 && p.ultCd === 0, '能量清零；大招无 CD');
    HX.World.refreshIndexes(w);
    HX.assert(w.bullets.length === 1 && w.bullets[0].style === 'phoenix', '应生成一颗火凤凰弹幕');
    const ph = w.bullets[0];
    HX.assert(ph.solidR === 384, '碰撞盒半径应为 384（768×768）');
    HX.assert(Math.abs(Math.abs(ph.vel.x) - view.w / 3) < 1e-6 && ph.vel.y === 0,
      '应水平飞行且 3 秒横贯屏幕，v=' + ph.vel.x.toFixed(1));
    // 起飞点在屏外（完全不可见）
    const outside = ph.vel.x > 0 ? ph.pos.x < view.x : ph.pos.x > view.x + view.w;
    HX.assert(outside, '应从屏幕外一侧起飞');
    // 飞行 3.5s：穿过屏幕全程，盒内目标应被多次 tick（每 0.2s 100；768 盒 / 640 速度 ≈ 6 tick）
    run(w, Math.ceil(3.5 / DT), null);
    HX.assert(inPath.alive && inPath.hp <= 1300,
      '飞行路径上的敌人应被多次 tick（1500 血至少掉 200），实为 ' + inPath.hp);
    HX.assert(offPath.alive && offPath.hp === offPath.maxHp, '碰撞盒外不应受伤');
    HX.assert(w.stats.dmgDealt >= 200, '应至少 tick 两次（≥200 伤害），实为 ' + w.stats.dmgDealt);
  });

  HX.test('大招·九霄: 雷霆万钧 v3 —— 分批/±50px/每道 100；满 10 道转攻其余目标，无其他目标则解除上限', function () {
    // ① 双目标：主目标吃满 10 道后，剩余雷霆应转攻次目标
    const w = bareWorld({ seed: 14, skinId: 'jiuxiao' });
    const p = w.player;
    p.atkTimer = 999999;                              // 关普攻排除干扰
    const t1 = dummy(w, 'spider', 400, 0);            // 近目标（优先挨打）
    t1.hp = 20000; t1.maxHp = 20000;
    const t2 = dummy(w, 'spider', 900, 300);          // 次目标（屏内、与 t1 相距 583 > 128+50，不互伤）
    t2.hp = 20000; t2.maxHp = 20000;
    p.energy = 100;
    const shots0 = w.stats.shots;
    HX.Skill.stepUlt(w, DT, { ult: true });
    HX.assert(p.thunderQueue && p.thunderQueue.left === 20, '施放应建立 20 道落雷队列');
    run(w, Math.ceil(4.5 / DT));                      // 20 道 × 0.2s = 4s 全落完
    HX.assert(w.stats.shots - shots0 === 20, '应累计落下 20 道，实为 ' + (w.stats.shots - shots0));
    HX.assert(t1.hp === 20000 - 1000, '主目标应恰好吃 10 道（1000），实扣 ' + (20000 - t1.hp));
    HX.assert(t2.hp === 20000 - 1000, '剩余 10 道应转攻次目标（1000），实扣 ' + (20000 - t2.hp));
    HX.assert(p.thunderQueue === null, '队列清空后回收');

    // ② 单目标：范围内没有其他目标 → 上限解除，20 道全落它身上
    const w2 = bareWorld({ seed: 15, skinId: 'jiuxiao' });
    const p2 = w2.player;
    p2.atkTimer = 999999;
    const solo = dummy(w2, 'spider', 400, 0);
    solo.hp = 20000; solo.maxHp = 20000;
    p2.energy = 100;
    HX.Skill.stepUlt(w2, DT, { ult: true });
    run(w2, Math.ceil(4.5 / DT));
    HX.assert(solo.hp === 20000 - 2000, '无其他目标时上限应解除（20 道 = 2000），实扣 ' + (20000 - solo.hp));
  });
})();
