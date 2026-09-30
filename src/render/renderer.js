// 绘制层（只读状态，不修改任何实体；README §9 渲染隔离）。
// 结构：本文件负责「世界怎么画」——清屏 → 天幕 → 相机变换 → 场景 → 屏幕特效。
//      HUD 交给 src/ui/hud.js；具体图形笔触交给 src/render/art.js。
// 纪律：全项目统一 px，本层不做单位换算；只读状态绘制，绝不把坐标写回逻辑状态。
(function () {
  const HX = window.HX || (window.HX = {});

  const Renderer = {
    // 世界渲染（battle 场景用）
    drawWorld(ctx, world, cam, game) {
      const W = HX.C.DESIGN_W_PX, H = HX.C.DESIGN_H_PX;
      const t = world.time || 0;

      // 1) 天幕（屏幕空间，不随相机移动）
      HX.Art.drawSky(ctx, cam, t, W, H);

      // 2) 世界空间
      ctx.save();
      cam.apply(ctx);

      HX.Art.drawArena(ctx, cam, t);

      // 实体（Phase 0 仅占位玩家；Phase 1/2 起按 z 序追加敌人/BOSS/弹幕/石柱/拾取物）
      this.drawEntities(ctx, world, t);

      ctx.restore();

      // 3) 屏幕空间后处理
      this.drawVignette(ctx, W, H);
      if (world.flash > 0) this.drawFlash(ctx, W, H, world.flash, world.flashColor || '#ff2b2b');
    },

    // 实体绘制（分层：地面 → 实体按 y 排序 → 护身技 → 弹幕 → 特效）
    drawEntities(ctx, world, t) {
      // 1) 地面层：地火预警/成型地火、残火、拾取物（都会被实体压住）
      if (world.hazards) for (let i = 0; i < world.hazards.length; i++) HX.Art.drawHazard(ctx, world.hazards[i], t);
      if (world.fires) for (let i = 0; i < world.fires.length; i++) HX.Art.drawFire(ctx, world.fires[i], t);
      if (world.pickups) for (let i = 0; i < world.pickups.length; i++) HX.Art.drawPickup(ctx, world.pickups[i], t);
      // 1.5) 石柱结界边框（2026-09-16：4 柱连成矩形把玩家围在中间 —— 画个可见的"结界"）
      if (world.pillarRect) HX.Art.drawPillarBarrier(ctx, world, t);

      // 2) 实体层：按 y 排序，制造俯视遮挡的层次感
      const list = [];
      if (world.player) list.push({ y: world.player.pos.y, kind: 'player', o: world.player });
      if (world.pillars) for (let i = 0; i < world.pillars.length; i++) list.push({ y: world.pillars[i].pos.y, kind: 'pillar', o: world.pillars[i] });
      if (world.enemies) for (let i = 0; i < world.enemies.length; i++) list.push({ y: world.enemies[i].pos.y, kind: 'enemy', o: world.enemies[i] });
      if (world.boss) list.push({ y: world.boss.pos.y, kind: 'boss', o: world.boss });

      list.sort((a, b) => a.y - b.y);

      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (it.kind === 'player') HX.Art.drawPlayer(ctx, it.o, world.skinId, t);
        else if (it.kind === 'pillar') HX.Art.drawPillar(ctx, it.o, t);
        else if (it.kind === 'enemy') HX.Art.drawEnemy(ctx, it.o, t);
        else if (it.kind === 'boss') HX.Art.drawBoss(ctx, it.o, t);
      }

      // 3) 护身技视觉（套在玩家外层，画在实体之上，避免被 BOSS 压住看不见）
      //    ⚠ 视觉按**法袍槽**（equip.cloth）取系 —— 曾误传 world.skinId（武器系），
      //    导致「南明法袍 + 御剑武器」装配时逻辑跑火痕、视觉却画御剑飞剑（2026-09-16 玩家实测 BUG）
      if (world.player) {
        const pl = world.player;
        HX.Art.drawGuard(ctx, pl, pl.equip ? pl.equip.cloth : world.skinId, t);
      }
      // 3.5) 万剑归宗悬停飞剑（现身未起飞）
      if (world.player) HX.Art.drawUltSwords(ctx, world, t);

      // 4) 弹幕 + 特效
      HX.Art.drawBullets(ctx, world, t);
      HX.Art.drawEffects(ctx, world, t);
    },

    // 暗角：把注意力收进屏幕中心
    drawVignette(ctx, W, H) {
      if (!this._vig || this._vig.w !== W || this._vig.h !== H) {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.92);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.55)');
        this._vig = { w: W, h: H, g: g };
      }
      ctx.save();
      ctx.fillStyle = this._vig.g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    },

    // 全屏闪烁（BOSS 狂暴红闪等，GDD §13.4）
    drawFlash(ctx, W, H, alpha, color) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    },

    // 圆角矩形路径（UI 通用）
    roundRect(ctx, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    },

    // 文本按宽度折行（菜单/换肤卡片描述用）。返回行数组；调用方负责逐行绘制。
    wrapText(ctx, str, maxWidth, font) {
      ctx.save();
      if (font) ctx.font = font;
      const lines = [];
      const paras = String(str).split('\n');
      for (let p = 0; p < paras.length; p++) {
        let line = '';
        const chars = paras[p].split('');
        for (let i = 0; i < chars.length; i++) {
          const test = line + chars[i];
          if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = chars[i]; }
          else line = test;
        }
        lines.push(line);
      }
      ctx.restore();
      return lines;
    },

    // 菜单按钮（选中/悬停高亮）
    button(ctx, x, y, w, h, label, selected, opt) {
      opt = opt || {};
      const P = HX.PAL.hud;
      ctx.save();
      ctx.fillStyle = selected ? 'rgba(28,44,74,0.92)' : 'rgba(12,18,32,0.72)';
      this.roundRect(ctx, x, y, w, h, 14); ctx.fill();
      ctx.lineWidth = selected ? 3 : 2;
      ctx.strokeStyle = selected ? (opt.accent || '#9fe8ff') : P.panelEdge;
      this.roundRect(ctx, x, y, w, h, 14); ctx.stroke();
      if (selected) {
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = opt.accent || '#9fe8ff';
        this.roundRect(ctx, x, y, w, h, 14); ctx.fill();
      }
      ctx.restore();
      this.text(ctx, label, x + w / 2, y + h / 2, {
        size: opt.size || 34,
        weight: '700',
        color: selected ? P.text : P.dim,
        shadow: selected ? 'rgba(120,200,255,0.5)' : null,
        blur: 18
      });
    },

    // 居中文本（菜单/结算通用）
    text(ctx, str, x, y, opt) {
      opt = opt || {};
      ctx.save();
      ctx.font = (opt.weight || '600') + ' ' + (opt.size || 32) + 'px ' + (opt.font || 'sans-serif');
      ctx.fillStyle = opt.color || HX.PAL.hud.text;
      ctx.textAlign = opt.align || 'center';
      ctx.textBaseline = opt.baseline || 'middle';
      if (opt.shadow) { ctx.shadowColor = opt.shadow; ctx.shadowBlur = opt.blur || 24; }
      ctx.fillText(str, x, y);
      ctx.restore();
    }
  };

  HX.Renderer = Renderer;
})();
