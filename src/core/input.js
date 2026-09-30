// 输入（GDD §6）：WASD 移动 · R 大招 · 空格冲刺 · 普攻自动（无按键）· 鼠标点击菜单。
// 依据：AGENTS §4——输入只提供「状态读取」，不直接改世界；逻辑层每步自己查。
// 边沿（justPressed）由主循环在**每帧末尾**调用 endFrame() 清空，保证一次按键只被消费一次。
(function () {
  const HX = window.HX || (window.HX = {});

  // 关注键位白名单：避免拦截浏览器快捷键（F5/F12 等）
  const WATCHED = {
    KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1,
    ArrowUp: 1, ArrowLeft: 1, ArrowDown: 1, ArrowRight: 1,
    KeyR: 1, Space: 1, Enter: 1, Escape: 1, KeyF: 1,
    F1: 1, F2: 1, F3: 1,
    Digit1: 1, Digit2: 1, Digit3: 1
  };

  const Input = {
    enabled: true,
    canvas: null,
    down: {},                 // 持续按住
    edge: {},                 // 本帧新按下
    pointer: { x: 0, y: 0, inside: false, down: false, clicked: false },
    _bound: null,

    attach(canvas) {
      this.canvas = canvas;
      if (!canvas || !canvas.addEventListener) return;
      this._bound = true;

      window.addEventListener('keydown', (e) => {
        if (!this.enabled) return;
        if (WATCHED[e.code]) e.preventDefault();
        if (WATCHED[e.code] || e.key === ' ') {
          const code = WATCHED[e.code] ? e.code : 'Space';
          if (!this.down[code]) this.edge[code] = true;
          this.down[code] = true;
        }
      });

      window.addEventListener('keyup', (e) => {
        const code = WATCHED[e.code] ? e.code : (e.key === ' ' ? 'Space' : null);
        if (code) this.down[code] = false;
      });

      // 失焦清键，防止「按键卡住」
      window.addEventListener('blur', () => { this.down = {}; });

      canvas.addEventListener('pointermove', (e) => {
        const p = (HX.View && HX.View.toCanvas) ? HX.View.toCanvas(e.clientX, e.clientY) : { x: e.clientX, y: e.clientY };
        this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.inside = true;
      });
      canvas.addEventListener('pointerleave', () => { this.pointer.inside = false; });
      canvas.addEventListener('pointerdown', (e) => {
        const p = (HX.View && HX.View.toCanvas) ? HX.View.toCanvas(e.clientX, e.clientY) : { x: e.clientX, y: e.clientY };
        this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.down = true; this.pointer.clicked = true;
        if (e.button === 2) e.preventDefault();
      });
      canvas.addEventListener('pointerup', () => { this.pointer.down = false; });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    isDown(code) { return !!this.down[code]; },

    // 边沿触发（不消费）：同一帧内多处查询都会得到 true
    justPressed(code) { return !!this.edge[code]; },

    // 消费式边沿：只有第一个调用者拿到 true（同一动作别被两处响应）
    consume(code) {
      if (this.edge[code]) { this.edge[code] = false; return true; }
      return false;
    },

    // GDD §6：WASD / 方向键 → 归一化移动向量（斜向不加速）
    moveVector(out) {
      let x = 0, y = 0;
      if (this.down.KeyA || this.down.ArrowLeft) x -= 1;
      if (this.down.KeyD || this.down.ArrowRight) x += 1;
      if (this.down.KeyW || this.down.ArrowUp) y -= 1;
      if (this.down.KeyS || this.down.ArrowDown) y += 1;
      const l = Math.hypot(x, y);
      if (l > 1e-9) { x /= l; y /= l; }
      const o = out || { x: 0, y: 0 };
      o.x = x; o.y = y;
      return o;
    },

    // 每帧末尾由主循环调用
    endFrame() {
      this.edge = {};
      this.pointer.clicked = false;
    },

    reset() {
      this.down = {}; this.edge = {};
      this.pointer.down = false; this.pointer.clicked = false;
    }
  };

  HX.Input = Input;
})();
