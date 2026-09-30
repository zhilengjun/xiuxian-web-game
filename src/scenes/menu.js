// 主菜单场景（GDD §4.1：游戏名 + 开始 / 换肤）。
// 背景：HX.HomeBg（assets/home 素材分层：背景渐变 → 太阳 120s 周期右升左落 → 山 → 云 → UI），
//       与换肤界面共用同一份背景状态（云位置跨场景连续），见 src/ui/home_bg.js。
// 入口语义（2026-09-16 设计者指示）：主页是关卡唯一入口 —— 开始以当前选中皮肤进关；换肤只选皮肤。
// 交互：W/S 或 ↑/↓ 选择，Enter 或鼠标点击确认。
(function () {
  const HX = window.HX || (window.HX = {});
  HX.Scenes = HX.Scenes || {};

  const BTN_W = 360, BTN_H = 84;

  HX.Scenes.menu = {
    name: 'menu',

    enter(game) {
      this.sel = 0;
      this.items = [
        { label: '开  始', action: 'battle' },
        { label: '装  配', action: 'skins' }
      ];
      this._rects = [];
    },

    update(dt, game) {
      HX.HomeBg.step(dt);                      // 共享背景推进（云/太阳）

      const In = HX.Input;
      const up = In.consume('KeyW') || In.consume('ArrowUp');
      const dn = In.consume('KeyS') || In.consume('ArrowDown');
      if (up || dn) {
        this.sel = (this.sel + (up ? -1 : 1) + this.items.length) % this.items.length;
        HX.Audio.play('uiMove');
      }

      // 鼠标悬停选中 + 点击确认
      const p = In.pointer;
      for (let i = 0; i < this._rects.length; i++) {
        const r = this._rects[i];
        const inside = p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
        if (inside && this.sel !== i) { this.sel = i; HX.Audio.play('uiMove'); }
      }
      let clickedIdx = -1;
      if (p.clicked) {
        for (let i = 0; i < this._rects.length; i++) {
          const r = this._rects[i];
          if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) clickedIdx = i;
        }
      }

      const confirm = In.consume('Enter') || clickedIdx === this.sel;
      if (confirm) {
        HX.Audio.play('start');
        const item = this.items[this.sel];
        game.setScene(item.action, item.action === 'battle' ? { skinId: game.skinId } : { from: 'menu' });
      }
    },

    render(ctx, game) {
      const W = HX.C.DESIGN_W_PX, H = HX.C.DESIGN_H_PX;
      const P = HX.PAL.hud;
      const cx = W / 2;

      // 背景（素材分层，见 src/ui/home_bg.js）
      HX.HomeBg.render(ctx);

      // UI 最上层
      HX.Renderer.text(ctx, '洪 荒 修 仙', cx, 300, {
        size: 104, weight: '800', color: '#3a4a66', shadow: 'rgba(120,160,200,0.45)', blur: 22
      });
      HX.Renderer.text(ctx, '2D 俯视角轻量弹幕生存 · 零构建验证 Demo', cx, 392, {
        size: 24, color: 'rgba(52,70,100,0.85)', weight: '600'
      });

      // 按钮
      this._rects = [];
      for (let i = 0; i < this.items.length; i++) {
        const x = cx - BTN_W / 2, y = 590 + i * 108;
        this._rects.push({ x: x, y: y, w: BTN_W, h: BTN_H });
        HX.Renderer.button(ctx, x, y, BTN_W, BTN_H, this.items[i].label, this.sel === i, {
          accent: i === 0 ? '#9fe8ff' : '#ffc45e'
        });
      }

      // 底部：当前装配 + 操作提示（GDD v1.19 §4.2：武器/法袍/法器三部件）
      const eq = HX.Equip;
      HX.Renderer.text(ctx, '当前装配：' + eq.summary(), cx, H - 84, {
        size: 22, color: 'rgba(52,70,100,0.85)', weight: '600'
      });
      HX.Renderer.text(ctx, 'W/S 选择    Enter 确认    鼠标可直接点击', cx, H - 46, {
        size: 18, color: 'rgba(52,70,100,0.6)', weight: '600'
      });
    }
  };
})();
