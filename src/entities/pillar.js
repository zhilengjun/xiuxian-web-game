// 石柱实体（GDD §13.3）：场地四角 4 根，初始暗色，**不可攻击、不可摧毁**，点燃后火焰亮起。
// 坐标由 config/constants.js 的 pillarPositions() 推导（四角内缩）。
// 【存在时机】石柱**开局不存在**——BOSS 血量 50% 进入石柱阶段时才"从地下召唤冒出"
//   （GDD §13.3 原文「场地四角召唤」，2026-09-15 设计者确认）。出土进度 `emerge` 由
//   systems/world.js 推进；出土完成前无碰撞（movement 只推已出土的石柱）。
(function () {
  const HX = window.HX || (window.HX = {});

  const Pillar = {
    init(p, index, x, y) {
      const C = HX.C.PILLAR;
      const o = p || {};
      o.kind = 'pillar';
      o.index = index;
      o.pos = o.pos || { x: 0, y: 0 };
      o.pos.x = x;
      o.pos.y = y;
      o.visualR = C.visualR;     // 外观半径
      o.solidR = C.solidR;       // 碰撞半径（出土完成后才生效）
      o.emerge = 0;              // 出土进度 0→1（0 = 完全在地下，1 = 完全立起）
      o.emerging = false;        // 是否正在出土（spawnPillars 置 true，world 推进到 1 后置 false）
      o.lit = false;
      o.litAt = 0;               // 点燃时刻（world.time），用于火焰起势动画
      o.hitFlash = 0;            // 被火球命中的闪白
      o.alive = true;            // 石柱永不销毁；此字段仅用于统一遍历
      return o;
    },

    isLit(p) { return p.lit === true; },
    // 出土完成才有碰撞/点燃判定（未出土时玩家可直接穿过它所在的地面位置）
    isEmerged(p) { return p.emerge >= 1; },

    // 已点燃数量（狂暴判定用，GDD §13.4）
    litCount(pillars) {
      let n = 0;
      for (let i = 0; i < pillars.length; i++) if (pillars[i].lit) n++;
      return n;
    },

    // 是否已全燃
    allLit(pillars) {
      return pillars.length > 0 && Pillar.litCount(pillars) >= pillars.length;
    },

    // 取最近的未点燃石柱（追踪弹命中玩家后，火球飞向它的目标，GDD §13.3）
    // 全部已点燃时返回 null。
    nearestUnlit(pillars, fromX, fromY) {
      let best = null, bestD2 = Infinity;
      for (let i = 0; i < pillars.length; i++) {
        const p = pillars[i];
        if (p.lit) continue;
        const dx = p.pos.x - fromX, dy = p.pos.y - fromY;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = p; }
      }
      return best;
    }
  };

  HX.Pillar = Pillar;
  HX.makePillar = function (index, x, y) { return Pillar.init(null, index, x, y); };

  // 按地图四角建出 4 根石柱
  HX.makePillars = function () {
    const ps = HX.C.pillarPositions();
    const out = [];
    for (let i = 0; i < ps.length; i++) out.push(Pillar.init(null, i, ps[i].x, ps[i].y));
    return out;
  };
})();
