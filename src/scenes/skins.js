// 装配界面（GDD v1.19 §4.2 换肤系统重构）：唯一裸模 + 武器/法袍/法器三槽 × 三系部件。
//   左侧 = 预览（裸模 + 当前三部件实时叠加，与战斗内同一渲染管线，居上）+ **选中部件详情**
//   （下方，武器含完整 1~5 级数值表）；右侧 = 三行槽位，每槽 3 个部件按钮（御剑/南明/九霄，
//   带部件图标，法器图标 ×2）；三件同系 → 套装提示「xx套装已激活（最大生命 +50）」。
//   左右两块面板顶/底对齐（2026-09-16 设计者指示三改）。
// 交互（2026-09-16 设计者指示三改）：**鼠标悬浮只做视觉描边、不修改选定，必须点击部件才装配**；
//   装配到预览（不跳转），右侧底部**确认按钮**，确认后提示「装配完成：xxxx」并返回主页；
//   返回按钮在左上角（不确认直接走 = 保留装配）；Enter = 确认，与点击确认按钮同效。
// 主页是关卡唯一入口：主页「开始」以当前装配进关（GDD §4.1）。
(function () {
  const HX = window.HX = window.HX || {};

  // ---- 布局（左右两块顶 150 / 底 996 对齐）----
  const PANEL_TOP = 150, PANEL_BOTTOM = 996;
  const PREVIEW_X = 80, PREVIEW_W = 640;                     // 左：预览面板（PREVIEW_H 由对齐决定）
  const PREVIEW_H = PANEL_BOTTOM - PANEL_TOP;
  const PREVIEW_SCALE = 2.2;
  const PREVIEW_ANCHOR = PANEL_TOP + 440;                    // 角色脚下锚点（面板内居上）
  const SLOT_X = 880, SLOT_W = 940;                          // 右：槽位区
  const BTN_W = 288, BTN_GAP = 28;
  const BTN_H = 120, BTN_H_AURA = 190;                       // 法器按钮更高（图标 ×2）
  const SLOT_TITLE_H = 56, SLOT_GAP = 34;
  const ICON = 84;                                           // 武器/法袍图标尺寸；法器 = ICON*2
  const SY0 = PANEL_TOP;                                     // 槽位区起始 y = 面板顶（对齐）

  const SYS_ACCENT = { yujian: '#7fd4ff', nanming: '#ff8a5e', jiuxiao: '#c9a2ff' };

  HX.Scenes = HX.Scenes || {};

  HX.Scenes.skins = {
    name: 'skins',

    enter(game) {
      this.t = 0;
      this.sel = 0;                       // 键盘选中：9 个部件选项的扁平序号（槽 × 系）
      this.detail = { slot: 'weapon', sys: HX.Equip.weapon };   // 详情 = 选中部件（默认武器当前件）
      this.hover = -1;                    // 鼠标悬停（仅视觉描边，不参与选定）
      this._btnRects = [];                // [slot][sys] → rect
      this._backRect = null;
      this._confirmRect = null;
    },

    update(dt, game) {
      HX.HomeBg.step(dt);
      this.t += dt;
      const In = HX.Input;
      const p = In.pointer;
      const inRect = (r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

      // 悬停只做视觉反馈，**不修改选定**（2026-09-16 设计者指示：必须点击才装配）
      let hover = -1;
      for (let s = 0; s < 3; s++) {
        for (let y = 0; y < 3; y++) {
          if (inRect(this._btnRects[s] && this._btnRects[s][y])) { hover = s * 3 + y; break; }
        }
        if (hover >= 0) break;
      }
      const backClick = p.clicked && inRect(this._backRect);
      const confirmClick = p.clicked && inRect(this._confirmRect);

      if (backClick || In.consume('Escape')) {
        HX.Audio.play('uiBack');
        game.setScene('menu');            // 直接返回 = 保留当前装配（已即时生效）
        return;
      }

      if (confirmClick || In.consume('Enter')) {
        game.showToast('装配完成：' + HX.Equip.summary());
        HX.Audio.play('start');
        game.setScene('menu');            // 确认 → 提示 + 回主页
        return;
      }

      // 点击部件 = 装配（即时生效到预览，不跳转）；悬浮高亮仅供预览（不影响 sel/装配）
      let pick = -1;
      if (p.clicked && hover >= 0) pick = hover;
      if (pick >= 0) {
        this.apply(pick);
      } else if (hover >= 0) {
        this.hover = hover;               // 仅用于绘制悬停描边
      }
    },

    // 装配部件 + 详情切到该部件（不跳转，等确认）
    apply(pick) {
      const slot = HX.EQUIP_SLOTS[Math.floor(pick / 3)];
      const sys = HX.EQUIP_ORDER[pick % 3];
      HX.Equip.set(slot, sys);
      this.detail = { slot: slot, sys: sys };
      HX.Audio.play('uiSelect');
    },

    // 选中部件的详情（GDD §4.2：部件名称 + 对应技能**完整信息**——武器含 1~5 级数值表）
    partDetail() {
      const sk = HX.SKINS[this.detail.sys];
      if (this.detail.slot === 'weapon') return { name: sk.normal.name, desc: sk.normal.desc, levels: sk.normal.levels, pos: sk.pos };
      if (this.detail.slot === 'cloth') return { name: sk.guard.name, desc: sk.guard.desc };
      return { name: sk.ult.name, desc: sk.ult.desc };
    },

    render(ctx, game) {
      const W = HX.C.DESIGN_W_PX, H = HX.C.DESIGN_H_PX;
      const P = HX.PAL.hud;

      HX.HomeBg.render(ctx);

      HX.Renderer.text(ctx, '角 色 装 配', W / 2, 92, {
        size: 52, weight: '800', color: '#f2e2b0', shadow: 'rgba(220,180,90,0.45)', blur: 26
      });

      // 返回按钮：左上角
      this._backRect = { x: 48, y: 48, w: 150, h: 58 };
      HX.Renderer.button(ctx, this._backRect.x, this._backRect.y, this._backRect.w, this._backRect.h,
        '返  回', false, { accent: '#ffc45e', size: 24 });

      // ---- 左：预览面板（顶部比右侧下缩 10px，底仍对齐） ----
      const pv = { x: PREVIEW_X, y: PANEL_TOP + 10, w: PREVIEW_W, h: PREVIEW_H - 10 };
      ctx.save();
      ctx.fillStyle = 'rgba(14,22,40,0.88)';
      HX.Renderer.roundRect(ctx, pv.x, pv.y, pv.w, pv.h, 18); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = P.panelEdge;
      HX.Renderer.roundRect(ctx, pv.x, pv.y, pv.w, pv.h, 18); ctx.stroke();
      ctx.restore();

      // 角色（面板内居上；锚点随面板顶下移 10px）
      const fake = {
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        equip: HX.Equip.snapshot(),
        hp: 1, maxHp: 1, invuln: 0, hurtFlash: 0
      };
      ctx.save();
      ctx.translate(pv.x + pv.w / 2, PREVIEW_ANCHOR + 10);
      ctx.scale(PREVIEW_SCALE, PREVIEW_SCALE);
      HX.Sprites.player(ctx, fake, HX.Equip.weapon, this.t);
      ctx.restore();

      // 选中部件详情（完整信息：武器 = desc + 1~5 级数值表；法袍/法器 = desc 全文）
      const d = this.partDetail();
      const slotName = HX.EQUIP_SLOT_NAME[this.detail.slot];
      const part = HX.PARTS[this.detail.sys][this.detail.slot];
      const accent = SYS_ACCENT[this.detail.sys];
      let dy = pv.y + 520 + 10;
      HX.Renderer.text(ctx, slotName + ' · ' + part.name, pv.x + pv.w / 2, dy, {
        size: 26, weight: '800', color: accent
      });
      dy += 34;
      HX.Renderer.text(ctx, d.name, pv.x + pv.w / 2, dy, {
        size: 20, weight: '700', color: P.text
      });
      dy += 28;
      const dlines = HX.Renderer.wrapText(ctx, d.desc, pv.w - 72, '16px sans-serif');
      for (let i = 0; i < dlines.length; i++) {
        HX.Renderer.text(ctx, dlines[i], pv.x + pv.w / 2, dy, { size: 16, color: P.dim, weight: '500' });
        dy += 22;
      }
      dy += 12;
      // 武器部件：完整 1~5 级数值表（列头随部件特性：大小 / 链接范围 / 数量）
      if (d.levels) {
        const l0 = d.levels[0];
        const showSize = l0.size !== undefined;
        const showRange = !showSize && l0.chainRange !== undefined;
        const cols = [pv.x + 90, pv.x + 190, pv.x + 300, pv.x + 410];
        const head = showSize ? ['Lv', '大小', '伤害', '频率/秒']
          : showRange ? ['Lv', '范围', '伤害', '频率/秒']
          : ['Lv', '数量', '伤害', '频率/秒'];
        for (let i = 0; i < 4; i++) {
          HX.Renderer.text(ctx, head[i], cols[i], dy, { size: 15, color: P.faint, align: 'left', weight: '700' });
        }
        dy += 22;
        for (let i = 0; i < d.levels.length; i++) {
          const lv = d.levels[i];
          const col2 = showSize ? lv.size + 'x' : showRange ? String(lv.chainRange) : String(lv.count);
          const vals = ['Lv' + lv.lv, col2, String(lv.dmg), Number(lv.rate).toFixed(1)];
          for (let c = 0; c < 4; c++) {
            HX.Renderer.text(ctx, vals[c], cols[c], dy, { size: 16, color: P.text, align: 'left', weight: '500' });
          }
          dy += 22;
        }
      }

      // ---- 右：三槽位（法器行更高 = 图标 ×2） ----
      this._btnRects = [];
      let sy = SY0;
      const rowBtnH = [BTN_H, BTN_H, BTN_H_AURA];
      for (let s = 0; s < HX.EQUIP_SLOTS.length; s++) {
        const slot = HX.EQUIP_SLOTS[s];
        const bh = rowBtnH[s];
        HX.Renderer.text(ctx, HX.EQUIP_SLOT_NAME[slot], SLOT_X, sy + 30, {
          size: 26, weight: '800', color: '#f2e2b0', align: 'left'
        });
        const cur = HX.PARTS[HX.Equip[slot]][slot];
        HX.Renderer.text(ctx, '当前：' + cur.name, SLOT_X + 130, sy + 30, {
          size: 18, color: P.dim, weight: '600', align: 'left'
        });
        const btnY = sy + SLOT_TITLE_H;
        this._btnRects[s] = [];
        for (let y = 0; y < HX.EQUIP_ORDER.length; y++) {
          const sys = HX.EQUIP_ORDER[y];
          const bx = SLOT_X + y * (BTN_W + BTN_GAP);
          this._btnRects[s][y] = { x: bx, y: btnY, w: BTN_W, h: bh };
          this.drawPartBtn(ctx, bx, btnY, BTN_W, bh, slot, sys,
            this.sel === s * 3 + y, HX.Equip[slot] === sys, this.hover === s * 3 + y);
        }
        sy += SLOT_TITLE_H + bh + SLOT_GAP;
      }

      // ---- 套装提示条 ----
      const kit = HX.Equip.kitName();
      const kitY = sy + 4;
      ctx.save();
      ctx.fillStyle = kit ? 'rgba(20,42,28,0.9)' : 'rgba(16,22,40,0.85)';
      HX.Renderer.roundRect(ctx, SLOT_X, kitY, SLOT_W, 64, 12); ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = kit ? '#6fcf6f' : P.panelEdge;
      HX.Renderer.roundRect(ctx, SLOT_X, kitY, SLOT_W, 64, 12); ctx.stroke();
      ctx.restore();
      HX.Renderer.text(ctx,
        kit ? kit + '已激活（最大生命 +50）' : '自由配搭中（三件同系可激活套装：最大生命 +50）',
        SLOT_X + SLOT_W / 2, kitY + 32,
        { size: 22, weight: '700', color: kit ? '#9fe89f' : P.dim });

      // ---- 确认按钮（装配生效后由它返回主页；底 = 面板底，左右对齐） ----
      this._confirmRect = { x: SLOT_X, y: PANEL_BOTTOM - 74, w: SLOT_W, h: 74 };
      HX.Renderer.button(ctx, this._confirmRect.x, this._confirmRect.y, this._confirmRect.w, this._confirmRect.h,
        '确  认', true, { accent: '#ffc45e', size: 26 });

      HX.Renderer.text(ctx, '点击部件装配（悬浮仅描边预览）    Enter / 确认按钮 返回主页', W / 2, H - 34, {
        size: 18, color: P.faint, weight: '600'
      });
    },

    // 部件按钮：图标 + 名称 + 技能名；法器图标 ×2；当前装配 = 描边加粗 + 角标；
    // selected = 最近试装件（高亮底）；hover = 鼠标悬停（仅细描边，不改变选定）
    drawPartBtn(ctx, x, y, w, h, slot, sys, selected, equipped, hovered) {
      const P = HX.PAL.hud;
      const accent = SYS_ACCENT[sys];
      const part = HX.PARTS[sys][slot];
      const img = HX.partImg ? HX.partImg(part.img) : null;
      const icon = slot === 'aura' ? ICON * 2 : ICON;
      ctx.save();
      ctx.fillStyle = selected ? 'rgba(14,22,40,0.95)' : 'rgba(10,15,28,0.78)';
      HX.Renderer.roundRect(ctx, x, y, w, h, 14); ctx.fill();
      ctx.lineWidth = equipped ? 4 : selected ? 3 : hovered ? 2 : 2;
      ctx.strokeStyle = equipped ? accent : selected ? '#f2e2b0' : hovered ? 'rgba(242,226,176,0.55)' : P.panelEdge;
      HX.Renderer.roundRect(ctx, x, y, w, h, 14); ctx.stroke();
      ctx.restore();

      // 图标（左侧居中；未加载完成则留空）
      if (img) {
        ctx.drawImage(img, x + 12, y + (h - icon) / 2, icon, icon);
      }
      const tx = x + (img ? 12 + icon + 12 : 24);
      const midY = y + h / 2;
      HX.Renderer.text(ctx, part.name, tx, midY - (slot === 'aura' ? 4 : 14), {
        size: 23, weight: '800', color: equipped ? accent : P.text, align: 'left'
      });
      HX.Renderer.text(ctx, part.skill, tx, midY + (slot === 'aura' ? 26 : 24), {
        size: 17, weight: '600', color: equipped ? accent : P.dim, align: 'left'
      });
      if (equipped) {
        HX.Renderer.text(ctx, '✓', x + w - 28, y + 32, { size: 24, weight: '800', color: accent });
      }
    }
  };
})();
