// HUD 绘制（GDD §4.3 游戏内 HUD）。纯绘制，只读 world/game 状态。
// 布局（设计分辨率 1920×1080）：
//   顶部中央  关卡进度（小怪阶段：第 X 轮 / 3；BOSS 阶段：吞天老祖 + 血条 + 4 石柱图标）
//   左上      玩家血条（低血闪烁变红）
//   左下      WASD / 空格 / R 操作提示
//   右下      3 个技能图标：普通技能(Lv+经验条) / 护身技(倒计时) / 大招(能量条+冷却)
// Phase 0 只搭骨架：BOSS 血条与石柱图标位预留，数据接入见 Phase 3。
(function () {
  const HX = window.HX || (window.HX = {});

  const TAU = Math.PI * 2;

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  const Hud = {
    draw(ctx, world, game) {
      if (!world) return;
      const P = HX.PAL.hud;
      this.drawProgress(ctx, world, P);
      if (world.player) {
        this.drawPlayerHp(ctx, world.player, P);
        this.drawSkills(ctx, world, P);
      }
      this.drawHints(ctx, P);
    },

    // ---- 顶部中央：关卡进度（Phase 3 接入 BOSS 血条 + 石柱图标） ----
    drawProgress(ctx, world, P) {
      const cx = HX.C.DESIGN_W_PX / 2;
      const bossPhase = !!world.boss;
      if (!bossPhase) {
        const round = Math.max(1, world.round || 1);
        let label = '小怪阶段  第 ' + round + ' / ' + HX.WAVES.rounds.length + ' 轮';
        // 本轮剩余小怪 = 场上存活 + 还没出场的（spawn 队列）
        if (world.enemies && world.spawn) {
          const left = world.enemies.length + (world.spawn.queue ? world.spawn.queue.length : 0);
          if (left > 0) label += '    剩余 ' + left + ' 只';
        }
        ctx.save();
        ctx.globalAlpha = 0.9;
        HX.Renderer.text(ctx, label, cx, 52, {
          size: 30, color: P.text, weight: '700', shadow: 'rgba(0,0,0,0.8)', blur: 12
        });
        ctx.restore();
        return;
      }

      // BOSS 阶段骨架：名称 + 血条 + 石柱图标（数据 Phase 3 填）
      ctx.save();
      ctx.globalAlpha = 0.9;
      HX.Renderer.text(ctx, (world.boss.name || '吞天老祖'), cx, 34, {
        size: 26, color: P.text, weight: '700', shadow: 'rgba(0,0,0,0.8)', blur: 12
      });
      const bw = 620, bh = 18, bx = cx - bw / 2, by = 52;
      ctx.fillStyle = P.hpBack;
      roundRect(ctx, bx, by, bw, bh, 9); ctx.fill();
      const ratio = Math.max(0, world.boss.hp / (world.boss.maxHp || 1));
      ctx.fillStyle = P.bossHp;
      roundRect(ctx, bx, by, bw * ratio, bh, 9); ctx.fill();
      ctx.strokeStyle = P.panelEdge; ctx.lineWidth = 2;
      roundRect(ctx, bx, by, bw, bh, 9); ctx.stroke();

      // 4 石柱图标（GDD §4.3 / §13.3）
      const n = (world.pillars && world.pillars.length) || 4;
      const iw = 30, gap = 14;
      const totalW = n * iw + (n - 1) * gap;
      const sx = cx - totalW / 2;
      for (let i = 0; i < n; i++) {
        const lit = world.pillars && world.pillars[i] && world.pillars[i].lit;
        const x = sx + i * (iw + gap);
        ctx.fillStyle = lit ? HX.PAL.pillar.lit : HX.PAL.pillar.dark;
        roundRect(ctx, x, by + bh + 10, iw, 22, 5); ctx.fill();
        ctx.strokeStyle = lit ? HX.PAL.pillar.litEdge : HX.PAL.pillar.darkEdge;
        ctx.lineWidth = 2;
        roundRect(ctx, x, by + bh + 10, iw, 22, 5); ctx.stroke();
      }
      ctx.restore();
    },

    // ---- 左上：玩家血条（低血闪烁变红） ----
    drawPlayerHp(ctx, pl, P) {
      const x = 48, y = 44, w = 380, h = 26;
      const ratio = Math.max(0, Math.min(1, pl.hp / (pl.maxHp || HX.BAL.player.maxHp)));
      const low = ratio <= 0.3;

      ctx.save();
      ctx.fillStyle = P.panel;
      roundRect(ctx, x - 8, y - 8, w + 16, h + 16, 8); ctx.fill();

      ctx.fillStyle = P.hpBack;
      roundRect(ctx, x, y, w, h, 6); ctx.fill();

      let col = P.hp;
      if (low) {
        const blink = 0.55 + 0.45 * Math.sin((HX.Game ? HX.Game.time : 0) * 12);
        col = blink > 0.75 ? P.hpLow : P.hp;
      }
      ctx.fillStyle = col;
      roundRect(ctx, x, y, w * ratio, h, 6); ctx.fill();

      ctx.strokeStyle = P.panelEdge; ctx.lineWidth = 2;
      roundRect(ctx, x, y, w, h, 6); ctx.stroke();

      HX.Renderer.text(ctx, Math.ceil(pl.hp) + ' / ' + (pl.maxHp || HX.BAL.player.maxHp), x + w + 18, y + h / 2, {
        size: 20, color: P.text, align: 'left', weight: '700'
      });
      HX.Renderer.text(ctx, '气血', x, y - 22, { size: 18, color: P.dim, align: 'left', weight: '600' });
      ctx.restore();
    },

    // ---- 右下：3 个技能图标（GDD §4.3） ----
    drawSkills(ctx, world, P) {
      const pl = world.player;
      const size = 92, gap = 22;
      const right = HX.C.DESIGN_W_PX - 48;
      const y = HX.C.DESIGN_H_PX - 150;
      const totalW = size * 3 + gap * 2;
      const x0 = right - totalW;

      const skin = HX.SKINS[world.skinId] || HX.SKINS[HX.DEFAULT_SKIN];
      // 装配（GDD v1.19）：护身技随**法袍**槽、大招随**法器**槽；普攻随武器（= world.skinId）
      const eq = pl.equip || { weapon: world.skinId, cloth: world.skinId, aura: world.skinId };
      const clothSkin = HX.SKINS[eq.cloth] || skin;
      const auraSkin = HX.SKINS[eq.aura] || skin;

      // 1) 普通技能：等级 + 经验条
      this.slot(ctx, x0, y, size, skin.normal.name, skin.normal.name.charAt(0), true, P.exp);
      const lv = pl.level || 1;
      HX.Renderer.text(ctx, 'Lv' + lv, x0 + size / 2, y + size / 2, { size: 40, color: P.text, weight: '700' });
      HX.Renderer.text(ctx, skin.normal.name, x0 + size / 2, y + size + 20, { size: 18, color: P.dim, weight: '600' });
      this.bar(ctx, x0, y + size + 32, size, 8, pl.expRatio === undefined ? 0 : pl.expRatio, P.exp, P);

      // 2) 护身技：未触发暗掉 / 触发后亮起 + 倒计时（名字 = 法袍部件的护身技命名）
      const gx = x0 + size + gap;
      const gActive = (pl.guardTimer || 0) > 0;
      this.slot(ctx, gx, y, size, clothSkin.guard.name, clothSkin.guard.name.charAt(0), gActive, HX.PAL.pickup.ring);
      if (gActive) {
        HX.Renderer.text(ctx, Math.ceil(pl.guardTimer) + 's', gx + size / 2, y + size / 2, { size: 30, color: P.text, weight: '700' });
        this.ring(ctx, gx + size / 2, y + size / 2, size * 0.46, pl.guardTimer / (clothSkin.guard.duration || 15), HX.PAL.pickup.ring);
      }
      HX.Renderer.text(ctx, clothSkin.guard.name, gx + size / 2, y + size + 20, { size: 18, color: P.dim, weight: '600' });

      // 3) 大招：能量条 + 冷却（名字 = 法器部件的大招命名）
      const ux = x0 + (size + gap) * 2;
      const energy = pl.energy || 0;
      const full = energy >= 100 && (pl.ultCd || 0) <= 0;
      this.slot(ctx, ux, y, size, auraSkin.ult.name, auraSkin.ult.name.charAt(0), full, P.energy);
      if (full) {
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin((HX.Game ? HX.Game.time : 0) * 6);
        ctx.fillStyle = P.energy;
        roundRect(ctx, ux, y, size, size, 12); ctx.fill();
        ctx.restore();
      }
      if ((pl.ultCd || 0) > 0) {
        HX.Renderer.text(ctx, Math.ceil(pl.ultCd) + 's', ux + size / 2, y + size / 2, { size: 30, color: P.text, weight: '700' });
      } else {
        HX.Renderer.text(ctx, Math.floor(energy) + '', ux + size / 2, y + size / 2, { size: 34, color: P.text, weight: '700' });
      }
      this.ring(ctx, ux + size / 2, y + size / 2, size * 0.46, energy / 100, P.energy);
      HX.Renderer.text(ctx, auraSkin.ult.name + '  R', ux + size / 2, y + size + 20, { size: 18, color: full ? P.energy : P.dim, weight: '600' });
    },

    // 技能槽外框
    slot(ctx, x, y, size, title, glyph, lit, accent) {
      const P = HX.PAL.hud;
      ctx.save();
      ctx.fillStyle = lit ? 'rgba(14,20,34,0.92)' : 'rgba(10,14,24,0.62)';
      roundRect(ctx, x, y, size, size, 12); ctx.fill();
      ctx.strokeStyle = lit ? accent : P.faint;
      ctx.lineWidth = lit ? 3 : 2;
      roundRect(ctx, x, y, size, size, 12); ctx.stroke();
      ctx.globalAlpha = lit ? 0.16 : 0.07;
      ctx.fillStyle = accent;
      roundRect(ctx, x, y, size, size, 12); ctx.fill();
      ctx.restore();
    },

    // 水平条
    bar(ctx, x, y, w, h, ratio, color, P) {
      ctx.save();
      ctx.fillStyle = P.hpBack;
      roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
      ctx.fillStyle = color;
      roundRect(ctx, x, y, w * Math.max(0, Math.min(1, ratio)), h, h / 2); ctx.fill();
      ctx.restore();
    },

    // 环形进度
    ring(ctx, cx, cy, r, ratio, color) {
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, Math.min(1, ratio)));
      ctx.stroke();
      ctx.restore();
    },

    // ---- 左下：操作提示（GDD §6） ----
    drawHints(ctx, P) {
      const x = 48, y = HX.C.DESIGN_H_PX - 66;
      ctx.save();
      ctx.globalAlpha = 0.62;
      HX.Renderer.text(ctx, 'WASD 移动    空格 冲刺    R 大招    普攻自动    Esc 返回', x, y, {
        size: 20, color: P.dim, align: 'left', weight: '600'
      });
      ctx.restore();
    }
  };

  HX.Hud = Hud;
})();
