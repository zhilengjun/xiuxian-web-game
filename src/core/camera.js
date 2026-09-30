// 相机（GDD §5）：缓冲区跟随 + 边界停镜。
// 规则（GDD §5 原文）：
//   - 角色处于屏幕中央 50%~60% 范围内移动时镜头不动（死区 deadzone）。
//   - 靠近地图边界时镜头停止，角色不再居中，可继续移动到边缘。
// 相机状态为「视口左上角的世界坐标（px）」。全项目已统一为像素，故无需再做单位换算。
// 屏幕抖动（shake）只影响渲染偏移，不改变逻辑坐标。
(function () {
  const HX = window.HX || (window.HX = {});

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function Camera(opts) {
    opts = opts || {};
    this.w = opts.w || 1920;                 // 视口宽（px）
    this.h = opts.h || 1080;                 // 视口高（px）
    this.mapW = opts.mapW || 5760;           // 地图宽（px）
    this.mapH = opts.mapH || 3240;           // 地图高（px）
    this.deadzone = opts.deadzone === undefined ? 0.55 : opts.deadzone; // 死区占屏比（GDD：50%~60%）
    // 瞄准点纵向偏移（px）：跟随/居中时把目标点上移这么多。
    // 用途：立绘从脚下锚点向上站立，若瞄准点就是脚下，角色走到死区上沿会头顶出画
    //       （见 config/constants.js CAMERA.yOffset 的推导）。属于**构图**，不改死区规则。
    this.yOffset = opts.yOffset || 0;
    this.x = 0;                              // 视口左上角世界坐标（px）
    this.y = 0;
    this.shakeAmp = 0;                       // 抖幅（px）—— 抖幅本身就是 px，与逻辑同单位但在渲染时才施加
    this.shakeTime = 0;
    this.shakeDur = 0;
    this.ox = 0;                             // 抖动像素偏移（只进渲染）
    this.oy = 0;
    this._rng = new HX.RNG(1337);            // 抖动也走种子 RNG，禁 Math.random
  }

  Camera.prototype.setViewport = function (w, h) {
    this.w = w; this.h = h;
    this.clampToMap();
  };

  Camera.prototype.clampToMap = function () {
    this.x = clamp(this.x, 0, Math.max(0, this.mapW - this.w));
    this.y = clamp(this.y, 0, Math.max(0, this.mapH - this.h));
  };

  Camera.prototype.center = function () {
    return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
  };

  Camera.prototype.centerOn = function (px, py) {
    this.x = px - this.w / 2;
    this.y = (py - this.yOffset) - this.h / 2;   // yOffset：瞄准点上移（见构造注释）
    this.clampToMap();
  };

  // 缓冲区跟随：目标越出死区时，镜头按最小位移跟上去（不做平滑，语义最纯）
  Camera.prototype.follow = function (px, py, dt) {
    py -= this.yOffset;                          // 瞄准点上移：把"脚下"换成"胸口"
    const hw = this.w * this.deadzone / 2;
    const hh = this.h * this.deadzone / 2;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    let nx = this.x, ny = this.y;
    if (px < cx - hw) nx = px - (this.w / 2 - hw);
    else if (px > cx + hw) nx = px - (this.w / 2 + hw);
    if (py < cy - hh) ny = py - (this.h / 2 - hh);
    else if (py > cy + hh) ny = py - (this.h / 2 + hh);
    this.x = nx; this.y = ny;
    this.clampToMap();
    return dt; // 预留：后续若改为阻尼跟随，这里做 lerp
  };

  // flat = true 时全程满幅（不衰减），到时瞬间归零还原 —— 石柱召唤用（"100px 范围内随机
  // 移动，结束后还原位置"）；默认衰减式（狂暴红震用）。
  Camera.prototype.shake = function (ampPx, durSec, flat) {
    this.shakeAmp = Math.max(this.shakeAmp, ampPx);
    this.shakeDur = Math.max(this.shakeDur, durSec);
    this.shakeTime = this.shakeDur;
    this.shakeFlat = flat === true;
  };

  Camera.prototype.update = function (dt) {
    if (this.shakeTime <= 0) { this.ox = 0; this.oy = 0; this.shakeFlat = false; return; }
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    const k = this.shakeDur > 0 ? this.shakeTime / this.shakeDur : 0;
    const a = this.shakeFlat ? this.shakeAmp : this.shakeAmp * k * k; // 衰减式：二次收尾；满幅式：全程恒定
    this.ox = (this._rng.next() * 2 - 1) * a;
    this.oy = (this._rng.next() * 2 - 1) * a;
    if (this.shakeTime === 0) { this.ox = 0; this.oy = 0; this.shakeAmp = 0; this.shakeFlat = false; }
  };

  // 施加世界→屏幕变换（世界坐标已是 px，直接按视口平移即可）
  Camera.prototype.apply = function (ctx) {
    ctx.translate(-Math.round(this.x + this.ox), -Math.round(this.y + this.oy));
  };

  Camera.prototype.toScreen = function (wx, wy) {
    return { x: wx - this.x - this.ox, y: wy - this.y - this.oy };
  };

  Camera.prototype.toWorld = function (sx, sy) {
    return { x: sx + this.x + this.ox, y: sy + this.y + this.oy };
  };

  // 视口矩形（世界坐标），用于剔除
  Camera.prototype.viewRect = function () {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  };

  HX.Camera = Camera;
})();
