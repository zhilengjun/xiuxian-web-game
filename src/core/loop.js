// 固定步长循环（README §9）：逻辑恒定 60Hz 固定步长，渲染每帧一次。
// 依据：AGENTS §4——逻辑层禁用 Date.now()/performance.now()，位移一律 pos += vel * dt。
//      本文件是**唯一**允许读时钟的地方（它属于驱动层，不属于逻辑）。
// 防雪崩：单帧时间夹到 maxFrameDt；追帧步数封顶 maxSteps，超出则丢弃累积时间。
(function () {
  const HX = window.HX || (window.HX = {});

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function Loop(opts) {
    opts = opts || {};
    this.fixedDt = opts.fixedDt || 1 / 60;      // 逻辑步长（秒）
    this.maxSteps = opts.maxSteps || 5;         // 单帧最多追几步
    this.maxFrameDt = opts.maxFrameDt || 0.25;  // 单帧最大计入时间（切标签页回来不雪崩）
    this.update = opts.update;                  // update(dt) —— 固定步长逻辑
    this.render = opts.render;                  // render(alpha) —— alpha 供插值（当前渲染不插值）
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this.steps = 0;   // 累计逻辑步数（调试面板用）
    this.frames = 0;  // 累计渲染帧数
    this.rafId = 0;
    this._frame = this._frame.bind(this);
  }

  Loop.prototype._frame = function (t) {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this._frame);

    let dt = (t - this.last) / 1000;
    this.last = t;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > this.maxFrameDt) dt = this.maxFrameDt;

    this.acc += dt;
    let n = 0;
    while (this.acc >= this.fixedDt && n < this.maxSteps) {
      this.update(this.fixedDt);
      this.acc -= this.fixedDt;
      n++;
      this.steps++;
    }
    if (n >= this.maxSteps) this.acc = 0; // 落后太多：丢时间，不追债

    this.frames++;
    this.render(this.acc / this.fixedDt);
  };

  Loop.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.last = now();
    this.acc = 0;
    this.rafId = requestAnimationFrame(this._frame);
  };

  Loop.prototype.stop = function () {
    this.running = false;
    if (this.rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  };

  // 无浏览器环境（无头 sim / 测试）用：手动推进 n 个固定步长，保证与线上同一 dt
  Loop.prototype.stepManual = function (n) {
    const k = n === undefined ? 1 : n;
    for (let i = 0; i < k; i++) { this.update(this.fixedDt); this.steps++; }
  };

  HX.Loop = Loop;
})();
