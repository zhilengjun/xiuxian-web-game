// 引导代码（main）：建 canvas → 视口缩放 → 输入挂载 → 场景状态机 → 固定步长主循环。
// 加载顺序：本文件最后加载（见 index.html 注释），此时所有模块已挂在 window.HX 上。
(function () {
  const HX = window.HX || (window.HX = {});

  // ---------- 视口缩放 ----------
  // 逻辑分辨率恒为 1920×1080（GDD §3），CSS 等比缩放适配窗口；不引入 DPR 倍率，
  // 保证 1 逻辑像素 = 1 画布像素，避免半像素模糊影响后续像素级验收。
  const View = HX.View = {
    canvas: null,
    scale: 1,
    fit(canvas) {
      const c = canvas || this.canvas;
      if (!c || !window.innerWidth) return;
      this.canvas = c;
      const s = Math.min(window.innerWidth / HX.C.DESIGN_W_PX, window.innerHeight / HX.C.DESIGN_H_PX);
      this.scale = s;
      c.style.width = Math.round(HX.C.DESIGN_W_PX * s) + 'px';
      c.style.height = Math.round(HX.C.DESIGN_H_PX * s) + 'px';
    },
    // 客户端坐标 → 画布逻辑坐标（菜单点击用）
    toCanvas(clientX, clientY) {
      const c = this.canvas;
      if (!c || !c.getBoundingClientRect) return { x: clientX, y: clientY };
      const r = c.getBoundingClientRect();
      if (!r.width) return { x: clientX, y: clientY };
      const s = r.width / HX.C.DESIGN_W_PX;
      return { x: (clientX - r.left) / s, y: (clientY - r.top) / s };
    }
  };

  // ---------- 游戏上下文 / 场景状态机 ----------
  const Game = HX.Game = {
    canvas: null,
    ctx: null,
    scene: null,
    sceneName: '',
    params: null,
    skinId: HX.DEFAULT_SKIN,
    time: 0,                 // 逻辑累计时间（秒），只由固定步长推进
    frame: 0,                // 逻辑步数
    devOverlay: false,
    fps: 0,
    errorCount: 0,
    lastError: '',
    toast: '',               // 全局轻提示（换肤成功等）：跨场景显示，自动消退
    toastT: 0,
    _stepsSinceClear: 0,
    _fpsN: 0, _fpsT: 0,

    // 轻提示（UI 层专用，不参与逻辑）：默认显示 2.4s
    showToast(text, dur) {
      this.toast = text;
      this.toastT = dur === undefined ? 2.4 : dur;
    },

    setScene(name, params) {
      const s = HX.Scenes && HX.Scenes[name];
      if (!s) { console.warn('[HX] 未知场景：' + name); return; }
      if (this.scene && this.scene.leave) {
        try { this.scene.leave(this); } catch (e) { this._err(e, 'leave:' + this.sceneName); }
      }
      this.scene = s;
      this.sceneName = name;
      this.params = params || null;
      if (s.enter) {
        try { s.enter(this, this.params); } catch (e) { this._err(e, 'enter:' + name); }
      }
    },

    step(dt) {
      this._stepsSinceClear++;
      this.time += dt;
      this.frame++;
      if (this.toastT > 0) this.toastT = Math.max(0, this.toastT - dt);   // 仅提示计时，UI 层专用
      const s = this.scene;
      if (s && s.update) {
        try { s.update(dt, this); } catch (e) { this._err(e, 'update:' + this.sceneName); }
      }
    },

    draw() {
      const ctx = this.ctx;
      if (!ctx) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, HX.C.DESIGN_W_PX, HX.C.DESIGN_H_PX);
      ctx.restore();

      const s = this.scene;
      if (s && s.render) {
        try { s.render(ctx, this); } catch (e) { this._err(e, 'render:' + this.sceneName); }
      }

      this._tickFps();
      if (this.devOverlay) this.drawDev(ctx);
      if (this.errorCount > 0) this.drawError(ctx);
      if (this.toastT > 0) this.drawToast(ctx);

      // 输入边沿只在「本帧至少推进过一步逻辑」后才清空：
      // 避免高刷屏（144Hz）下出现「无逻辑步的帧」把按键吃掉。
      if (this._stepsSinceClear > 0) {
        HX.Input.endFrame();
        this._stepsSinceClear = 0;
      }
    },

    _tickFps() {
      // 仅用于调试面板显示；逻辑层不读时钟（AGENTS §4）
      const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
      this._fpsN++;
      if (this._fpsT === 0) this._fpsT = t;
      const dt = t - this._fpsT;
      if (dt >= 0.5) {
        this.fps = this._fpsN / dt;
        this._fpsN = 0; this._fpsT = t;
      }
    },

    _err(e, where) {
      this.errorCount++;
      this.lastError = '[' + where + '] ' + (e && e.message ? e.message : String(e));
      if (window.console && console.error) console.error(where, e);
    },

    // 调试面板（F1 开关）：仅显示，不参与逻辑
    drawDev(ctx) {
      const S = this.scene;
      const world = S && S.world ? S.world : null;
      const lines = [
        'F1 调试面板（再按 F1 关闭）',
        'FPS ' + this.fps.toFixed(0) + '   逻辑步 ' + this.frame + '   逻辑时间 ' + this.time.toFixed(1) + 's',
        '场景 ' + this.sceneName + '   皮肤 ' + this.skinId,
        '逻辑分辨率 ' + HX.C.DESIGN_W_PX + '×' + HX.C.DESIGN_H_PX + '   视口缩放 ' + View.scale.toFixed(3),
        '世界 ' + HX.C.MAP_W + '×' + HX.C.MAP_H + ' px   视口 ' + HX.C.VIEW_W + '×' + HX.C.VIEW_H + ' px',
        '弹速开关 BULLET_SPEED ' + HX.C.BULLET_SPEED + ' px/s　（全项目统一 px，无 u 换算）'
      ];
      if (world) {
        lines.push('相机 ' + world.cam.x.toFixed(1) + ', ' + world.cam.y.toFixed(1) + ' px   种子 ' + world.seed);
        if (world.player) {
          lines.push('玩家 ' + world.player.pos.x.toFixed(1) + ', ' + world.player.pos.y.toFixed(1) +
            ' px   实体数 ' + (world.enemies.length + (world.boss ? 1 : 0)));
        }
        if (world.boss) {
          const b = world.boss;
          lines.push('BOSS ' + b.name + '  阶段 ' + b.phase + '  血 ' + Math.ceil(b.hp) + '/' + b.maxHp +
            '  相位时间 ' + b.phaseTime.toFixed(1) + 's');
          lines.push('石柱 ' + world.pillars.length + ' 根，已点燃 ' +
            world.pillars.filter(function (pl) { return pl.lit; }).length);
        }
        lines.push('灵石 ' + world.pickups.length + '  地面火痕 ' + world.fires.length +
          '  地火预警 ' + world.hazards.length);
      }
      ctx.save();
      ctx.fillStyle = 'rgba(6,10,20,0.72)';
      ctx.fillRect(40, 150, 620, 30 + lines.length * 24);
      ctx.strokeStyle = 'rgba(140,175,225,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(40, 150, 620, 30 + lines.length * 24);
      ctx.font = '18px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (let i = 0; i < lines.length; i++) {
        ctx.fillStyle = i === 0 ? '#9fe8ff' : '#c8d4ea';
        ctx.fillText(lines[i], 54, 162 + i * 24);
      }
      ctx.restore();
    },

    drawError(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(60,8,8,0.88)';
      ctx.fillRect(0, 0, HX.C.DESIGN_W_PX, 46);
      ctx.fillStyle = '#ffb3ab';
      ctx.font = '20px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('运行期错误 ×' + this.errorCount + '  ' + this.lastError, 24, 23);
      ctx.restore();
    },

    // 全局轻提示（换肤成功等）：主页「换肤」按钮下方 15px，跨场景可见、自动淡出
    // 位置推导自 menu.js 按钮几何（开始 y=590、行距 108、高 84 → 换肤钮底 782 + 15）
    drawToast(ctx) {
      const W = HX.C.DESIGN_W_PX;
      const fade = Math.min(1, this.toastT / 0.4);      // 消失前 0.4s 开始淡出
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(10,18,34,0.92)';
      const h = 64;
      const by = 590 + 108 + 84 + 15;                   // = 797：换肤按钮底边 + 15px
      ctx.fillRect(W / 2 - 320, by, 640, h);
      ctx.strokeStyle = 'rgba(220,190,110,0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(W / 2 - 320, by, 640, h);
      ctx.fillStyle = '#f2e2b0';
      ctx.font = '600 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.toast, W / 2, by + h / 2);
      ctx.restore();
    }
  };

  // ---------- 启动 ----------
  HX.main = {
    start(canvas) {
      if (!canvas || !canvas.getContext) throw new Error('[HX] 需要 <canvas>');
      View.canvas = canvas;
      View.fit(canvas);
      Game.canvas = canvas;
      Game.ctx = canvas.getContext('2d');

      HX.Input.attach(canvas);

      window.addEventListener('resize', () => View.fit(canvas));
      window.addEventListener('keydown', (e) => {
        if (e.code === 'F1') { e.preventDefault(); Game.devOverlay = !Game.devOverlay; }
      });

      // 浏览器自动播放策略：首次用户手势时初始化/恢复音频
      const unlock = () => {
        HX.Audio.init();
        HX.Audio.resume();
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);

      Game.setScene('menu');

      // 开发便利：URL 带 ?scene=xxx 时直接落到指定场景（验收 / 截图用，不影响正常流程）
      const qs = (window.location && window.location.search.match(/scene=(\w+)/) || [])[1];
      if (qs && HX.Scenes[qs]) Game.setScene(qs);
      // ?t=秒数：把共享背景的本地时间拨到指定时刻（查看太阳周期等时间驱动效果的验收用）
      const qt = parseFloat((window.location && window.location.search.match(/[?&]t=([\d.]+)/) || [])[1]);
      if (qt > 0) HX.HomeBg.t = qt;

      const loop = new HX.Loop({
        fixedDt: HX.C.FIXED_DT,
        maxSteps: HX.C.MAX_STEPS,
        update(dt) { Game.step(dt); },
        render() { Game.draw(); }
      });
      Game.loop = loop;
      loop.start();
      return { game: Game, loop: loop };
    }
  };
})();
