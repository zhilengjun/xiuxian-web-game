// 首页/换肤共用背景（2026-09-16）：assets/home 实体素材分层 + 云系统 + 太阳周期。
// 自下而上 = 背景渐变 → 太阳（山后）→ 山 → 云（山前）；UI 由各场景自绘（本模块只画背景层）。
// 用法：场景 update 里调 HX.HomeBg.step(dt)（推进云/太阳），render 里调 HX.HomeBg.render(ctx)。
// 状态自持（云数组 + 种子 RNG + 本地时间）：多场景共用同一份实例，云的位置跨场景切换保持连续。
// 随机走种子 RNG（AGENTS §4 禁 Math.random）；素材懒加载，未加载完成时跳过该层。
(function () {
  const HX = window.HX || (window.HX = {});

  // ---- 参数（视觉装饰，暂定值均可调）----
  // 2026-09-16 设计者调参：云速度 ÷3（60~150s 贯穿）、太阳周期 ×2（120s）
  const HOME = {
    SUN_CYCLE: 120,       // 太阳运动段（秒）：从右侧山后升起到完全没入左侧山后
    SUN_WAIT: 10,         // 完全落山后的等待时间（秒，2026-09-16 设计者指示：不能立即再现）
    SUN_X_FROM: 0.78,     // 升起点（屏幕宽度比例）
    SUN_X_TO: 0.22,       // 落点（屏幕宽度比例）
    SUN_HORIZON: 300,     // 山脊线 y（2026-09-16 设计者指示「初始位置在山后**半露**」：
                          //   太阳画在山后，t=0/周期末时圆心恰在山脊 → 上半露、下半被山遮）
    SUN_RISE: 330,        // 弧顶升起高度
    SUN_SIZE: 96,         // 太阳绘制尺寸（素材 60×60，放大带光晕）
    CLOUD_COUNT: 3,       // 同屏云数（要求 2~4 朵）
    CLOUD_BAND: [0.30, 0.58],   // 云散布的纵向区域（屏幕中间）
    CLOUD_CROSS: [60, 150],     // 单朵云贯穿屏幕耗时（秒）→ 速度 = W / 耗时
    MOUNTAIN_SRC: [1080, 592]   // mountain.png 原始尺寸（按宽等比缩放）
  };

  // ---- 素材懒加载缓存（file:// / http 均可用；加载未完成时跳过该层绘制） ----
  const _imgCache = {};
  function homeImg(name) {
    if (typeof Image === 'undefined') return null;    // 无头环境兜底
    let im = _imgCache[name];
    if (!im) {
      im = _imgCache[name] = new Image();
      im.src = 'assets/home/' + name + '.png';
    }
    return im.complete && im.naturalWidth > 0 ? im : null;
  }

  function makeCloud(rng, x) {
    const key = 'cloud_' + rng.int(1, 3);
    return {
      key: key,
      x: x,
      y: HX.C.DESIGN_H_PX * (HOME.CLOUD_BAND[0] + rng.next() * (HOME.CLOUD_BAND[1] - HOME.CLOUD_BAND[0])),
      speed: HX.C.DESIGN_W_PX / rng.between(HOME.CLOUD_CROSS[0], HOME.CLOUD_CROSS[1]),
      scale: 0.7 + rng.next() * 0.6,
      alpha: 0.82 + rng.next() * 0.18
    };
  }

  const HomeBg = {
    t: 0,
    clouds: [],
    _rng: null,
    _inited: false,

    // 推进云/太阳（多场景共用同一份状态；t 是连续的，不随场景切换重置）
    step(dt) {
      this.t += dt;
      if (!this._inited) {
        this._inited = true;
        this._rng = new HX.RNG(20260916);
        const W = HX.C.DESIGN_W_PX;
        for (let i = 0; i < HOME.CLOUD_COUNT; i++) {
          this.clouds.push(makeCloud(this._rng, W * (0.08 + 0.28 * i) + this._rng.between(-80, 80)));
        }
      }
      const W = HX.C.DESIGN_W_PX;
      for (let i = 0; i < this.clouds.length; i++) {
        const c = this.clouds[i];
        c.x += c.speed * dt;
        if (c.x > W + 80) this.clouds[i] = makeCloud(this._rng, -80 - this._rng.between(0, 300));
      }
    },

    render(ctx) {
      const W = HX.C.DESIGN_W_PX, H = HX.C.DESIGN_H_PX;

      // ① 背景最底层：天空渐变拉伸铺满（素材未加载完成时跳过，露出画布底色）
      drawHomeImg(ctx, homeImg('background'), 0, 0, W, H);

      // ② 太阳（山后绘制 → 会被山体遮挡）：
      //    周期 = 运动段 120s + **落山后等待 10s**（2026-09-16 设计者指示：完全落山后不能立即再现）。
      //    运动段轨迹（连续两段）：
      //      上升半段 p∈[0,.5]：从右侧山脊**半露**（圆心在山脊线）升到弧顶
      //      下降半段 p∈[.5,1]：从弧顶落到**完全没入**山脊下（圆底 = 山脊线）
      //    等待段不绘制太阳。
      const phase = this.t % (HOME.SUN_CYCLE + HOME.SUN_WAIT);
      if (phase < HOME.SUN_CYCLE) {
        const p = phase / HOME.SUN_CYCLE;
        const sx = W * (HOME.SUN_X_FROM + (HOME.SUN_X_TO - HOME.SUN_X_FROM) * p);
        let sy;
        if (p <= 0.5) sy = HOME.SUN_HORIZON - Math.sin(p * Math.PI) * HOME.SUN_RISE;          // 半露 → 弧顶
        else {
          const q = (p - 0.5) / 0.5;                     // 0 → 弧顶，1 → 完全没入
          sy = HOME.SUN_HORIZON + HOME.SUN_SIZE - Math.cos(q * Math.PI / 2) * (HOME.SUN_RISE + HOME.SUN_SIZE);
        }
        const glowR = HOME.SUN_SIZE * (1.3 + 0.7 * Math.sin(p * Math.PI));
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
        glow.addColorStop(0, 'rgba(255,244,170,0.55)');
        glow.addColorStop(1, 'rgba(255,244,170,0)');
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.5 * Math.sin(p * Math.PI);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drawHomeImg(ctx, homeImg('sun'), sx - HOME.SUN_SIZE / 2, sy - HOME.SUN_SIZE / 2, HOME.SUN_SIZE, HOME.SUN_SIZE);
      }

      // ③ 山（底部锚定、全宽、保持素材宽高比）
      const m = homeImg('mountain');
      if (m) {
        const mh = W * (HOME.MOUNTAIN_SRC[1] / HOME.MOUNTAIN_SRC[0]);
        drawHomeImg(ctx, m, 0, H - mh, W, mh);
      }

      // ④ 云（山前、UI 后）
      for (let i = 0; i < this.clouds.length; i++) {
        const c = this.clouds[i];
        const im = homeImg(c.key);
        if (!im) continue;
        const w = im.naturalWidth * c.scale;
        const h = im.naturalHeight * c.scale;
        ctx.save();
        ctx.globalAlpha = c.alpha;
        ctx.drawImage(im, c.x, c.y, w, h);
        ctx.restore();
      }
    }
  };

  function drawHomeImg(ctx, im, x, y, w, h) {
    if (im) ctx.drawImage(im, x, y, w, h);
  }

  HX.HomeBg = HomeBg;
})();
