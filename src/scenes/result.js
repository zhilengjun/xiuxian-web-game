// 结算场景（GDD §15 胜负判定：弹窗 + 返回主界面）。
// 文案**不写在本文件**：全部取自 src/config/texts.js，其口径锚定 GDD §15 / §15.1
//   （v1.4 起 = 诛魔救人世；原「渡劫成功 / 道心破碎」的个人飞升口径已弃用）。
// 三态：win 石柱全燃前击杀 BOSS ｜ rage 四柱全燃 BOSS 狂暴 ｜ down 玩家血量归零
(function () {
  const HX = window.HX || (window.HX = {});
  HX.Scenes = HX.Scenes || {};

  HX.Scenes.result = {
    name: 'result',

    enter(game, params) {
      this.t = 0;
      this.preview = !!(params && params.preview);
      this.stats = (params && params.stats) || null;

      // 结算态：优先 outcome；兼容旧的 win 布尔入参（win=true → win，否则 rage）
      this.outcome = (params && params.outcome) || ((params && params.win) ? 'win' : 'rage');
      const T = HX.TEXT.result[this.outcome] || HX.TEXT.result.rage;
      this.title = (params && params.title) || T.title;
      this.reason = (params && params.reason) || T.reason;
      this.win = this.outcome === 'win';
    },

    update(dt, game) {
      this.t += dt;
      // 入场后短暂锁定输入，防「手滑瞬回菜单」
      if (this.t < 0.45) { HX.Input.consume('Enter'); HX.Input.consume('Escape'); return; }
      const back = HX.Input.consume('Enter') || HX.Input.consume('Escape') || HX.Input.consume('Space') || HX.Input.pointer.clicked;
      if (back) { HX.Audio.play('uiBack'); game.setScene('menu'); }
    },

    render(ctx, game) {
      const W = HX.C.DESIGN_W_PX, H = HX.C.DESIGN_H_PX;
      const cx = W / 2, cy = H / 2;
      const P = HX.PAL.hud;

      // 背景：天幕 + 暗化
      HX.Art.drawSky(ctx, { x: 0 }, this.t, W, H);
      ctx.save();
      ctx.fillStyle = 'rgba(4,6,14,0.72)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // 弹窗
      const bw = 900, bh = 420;
      ctx.save();
      ctx.fillStyle = P.panel;
      HX.Renderer.roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, 22); ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = this.win ? '#7fe6c0' : '#ff5a4d';
      HX.Renderer.roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, 22); ctx.stroke();
      ctx.restore();

      // 四字结算标题（GDD §15「结算标题」列），字间加空格便于大字排版
      const titleSpaced = this.title.split('').join('  ');
      HX.Renderer.text(ctx, titleSpaced, cx, cy - 118, {
        size: 76, weight: '800',
        color: this.win ? '#8ff0cf' : '#ff6b5d',
        shadow: this.win ? 'rgba(120,240,200,0.5)' : 'rgba(255,90,80,0.5)', blur: 32
      });
      HX.Renderer.text(ctx, this.reason, cx, cy - 24, {
        size: 30, color: P.text, weight: '600'
      });

      if (this.preview) {
        HX.Renderer.text(ctx, '[开发期预览 · 在战斗内按 F2 轮换三态：诛魔救世 → 人间倾覆 → 力战而竭]', cx, cy + 26, { size: 18, color: P.faint, weight: '600' });
      }

      // 统计（Phase 3 接入真实数据）
      const s = this.stats;
      if (s) {
        HX.Renderer.text(ctx,
          '用时 ' + (s.time || 0).toFixed(1) + 's    击杀 ' + (s.kills || 0) +
          '    剩余血量 ' + Math.ceil(s.hp || 0) + '    BOSS 剩余 ' + Math.ceil(s.bossHp || 0),
          cx, cy + 78, { size: 22, color: P.dim, weight: '600' });
      }

      HX.Renderer.text(ctx, 'Enter / 空格 / 点击   返回主界面', cx, cy + bh / 2 - 52, {
        size: 22, color: P.dim, weight: '600'
      });
    }
  };
})();
