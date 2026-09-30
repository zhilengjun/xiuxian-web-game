// 波次调度（GDD §12 关卡流程）：小怪 3 轮，每轮结束自动开始下轮。
//
// 阶段 2 范围：只落地小怪轮次（第 1/2/3 轮的配比与出场节奏）。
// 阶段 3 接入：第 3 轮清完后「吞天老祖出现」，以及「BOSS 战期间继续召唤小怪（频率降低）」。
//
// 状态机：delay（等开场/轮间）→ spawning（逐只放怪）→ clearing（等场上清空）→ 下一轮 / done
// 全程只用 world.rng（种子 RNG），保证同种子 → 同出场顺序（AGENTS §4）。
(function () {
  const HX = window.HX || (window.HX = {});

  const Spawn = {
    create(w) {
      return { round: 0, state: 'delay', timer: HX.WAVES.startDelay, queue: [] };
    },

    step(w, dt) {
      if (w.phase !== 'waves') return;
      const S = w.spawn, W = HX.WAVES;
      S.timer -= dt;

      if (S.state === 'delay') {
        if (S.timer <= 0) this.beginRound(w, S.round + 1);
        return;
      }

      if (S.state === 'spawning') {
        if (S.timer > 0) return;
        // 时间刷新受同屏上限（cap）约束：满了就跳过这个节拍，等击杀腾位
        if (HX.World.aliveEnemyCount(w) < W.rounds[S.round - 1].cap) this.spawnNext(w);
        if (S.queue.length > 0) S.timer = W.interval;
        else { S.state = 'clearing'; S.timer = 0; }
        return;
      }

      if (S.state === 'clearing') {
        if (HX.World.aliveEnemyCount(w) > 0) return;
        if (S.round >= W.rounds.length) {
          // 3 轮清完。（阶段 3：这里改为吞天老祖登场 → phase = 'boss'）
          S.state = 'done';
          w.phase = 'clear';
          w.stats.clearTime = w.time;
          return;
        }
        S.state = 'delay';
        S.timer = W.betweenRounds;
      }
    },

    // 击杀补怪（2026-09-16 设计者指示 v2）：场上每死一只**立即补一只蜘蛛**（不补术士），
    // 消耗本轮剩余配额 —— 从队列**尾部**扣除，不影响时间流的出场顺序；
    // **不重置时间刷新倒计时**：两者除共用同一总怪数外互不相关。
    // 由 Combat.killEnemy 在击杀时调用。
    onEnemyKilled(w) {
      if (w.phase !== 'waves') return;
      const S = w.spawn;
      if (S.queue.length === 0) return;                             // 配额已耗尽
      if (HX.World.aliveEnemyCount(w) >= HX.WAVES.rounds[S.round - 1].cap) return;  // 场上已满
      S.queue.pop();                                                // 尾部扣除 1 个配额（类型丢弃）
      const pos = this.pickPosition(w);
      HX.World.spawnEnemy(w, 'spider', pos.x, pos.y);               // 补的固定是蜘蛛
    },

    beginRound(w, n) {
      const W = HX.WAVES, S = w.spawn;
      const cfg = W.rounds[n - 1];
      if (!cfg) { S.state = 'done'; return; }

      // 组队 + 用种子 RNG 洗牌（蜘蛛/术士混着出场，而不是"先出完蜘蛛再出术士"）
      const q = [];
      for (let i = 0; i < cfg.spider; i++) q.push('spider');
      for (let i = 0; i < cfg.wizard; i++) q.push('wizard');
      for (let i = q.length - 1; i > 0; i--) {
        const j = w.rng.int(0, i);
        const t = q[i]; q[i] = q[j]; q[j] = t;
      }

      S.round = n;
      S.queue = q;
      S.state = 'spawning';
      S.timer = 0;
      w.round = n;
      w.stats.round = n;
      if (HX.Audio) HX.Audio.play('waveStart');
    },

    spawnNext(w) {
      const typeId = w.spawn.queue.shift();
      if (!typeId) return;
      const pos = this.pickPosition(w);
      HX.World.spawnEnemy(w, typeId, pos.x, pos.y);
    },

    // 刷怪位置：以玩家为圆心的环形随机，保证不贴脸也不贴墙。
    // ⚠ 关键点：**夹取距离，而不是夹取坐标**。
    //   若先算坐标再 clamp 到边界内距，玩家靠角落时环形外侧的点会被拉回，
    //   实际距离被缩短（实测可缩到 890px，低于 spawnMinDist 1024）→ 变成"糊脸刷怪"。
    //   正确做法：先求该方向射到"边界内距矩形"的最大可行距离 t，再取 min(采样距离, t)；
    //   t < spawnMinDist 的方向重投。玩家贴角落时约 7 成方向不可用（会被重投），
    //   因此兜底不能再用"最大 t 的候选"（那可能很小），而是**朝场地中心方向**放 spawnMinDist。
    // 距离区间/内距/重投次数见 config/waves.js，均为暂定值。
    pickPosition(w) {
      const W = HX.WAVES, C = HX.C, p = w.player;
      const m = W.edgeMargin;

      for (let i = 0; i < W.spawnTries; i++) {
        const ang = w.rng.angle();
        const ux = Math.cos(ang), uy = Math.sin(ang);
        const t = Math.min(w.rng.between(W.spawnMinDist, W.spawnMaxDist), this.rayReach(p.pos.x, p.pos.y, ux, uy, m));
        if (t < W.spawnMinDist) continue;
        const x = p.pos.x + ux * t, y = p.pos.y + uy * t;
        // 玩家自己站得比 edgeMargin 更靠边时（合法：空气墙在 WALL_MARGIN 处），
        // 近乎平行于墙的方向会落在内距带里 —— 这时换个方向，别贴墙生怪。
        if (x < m || x > C.ARENA.w - m || y < m || y > C.ARENA.h - m) continue;
        return { x: x, y: y };
      }

      // 兜底：朝场地中心 —— 该方向的可达距离必然最大，因此必定能放足 spawnMinDist
      let ux = C.ARENA.w * 0.5 - p.pos.x;
      let uy = C.ARENA.h * 0.5 - p.pos.y;
      const l = Math.hypot(ux, uy);
      if (l > 1e-6) { ux /= l; uy /= l; } else { ux = 1; uy = 0; }
      const t = Math.min(W.spawnMinDist, this.rayReach(p.pos.x, p.pos.y, ux, uy, m));
      return { x: p.pos.x + ux * t, y: p.pos.y + uy * t };
    },

    // 自 (x,y) 沿单位向量 (ux,uy) 出发，到"边界内距矩形"的最大可行距离
    rayReach(x, y, ux, uy, margin) {
      const C = HX.C;
      const maxX = C.ARENA.w - margin, maxY = C.ARENA.h - margin;
      let t = Infinity;
      if (ux > 1e-9) t = Math.min(t, (maxX - x) / ux);
      else if (ux < -1e-9) t = Math.min(t, (margin - x) / ux);
      if (uy > 1e-9) t = Math.min(t, (maxY - y) / uy);
      else if (uy < -1e-9) t = Math.min(t, (margin - y) / uy);
      return Math.max(0, t);
    },

    totalRounds() { return HX.WAVES.rounds.length; }
  };

  HX.Spawn = Spawn;
})();
