// 向量运算（README §6 math/）。逻辑层与渲染层共用；全项目统一 px（见 config/constants.js 头注释）。
// 设计：Vec2 实例承载可变状态（实体 pos/vel），静态版返回新对象（临时计算用，避免误改实体）。
(function () {
  const HX = window.HX || (window.HX = {});

  function Vec2(x, y) {
    this.x = x || 0;
    this.y = y || 0;
  }

  const P = Vec2.prototype;

  P.set = function (x, y) { this.x = x; this.y = y; return this; };
  P.copy = function (v) { this.x = v.x; this.y = v.y; return this; };
  P.clone = function () { return new Vec2(this.x, this.y); };
  P.add = function (v) { this.x += v.x; this.y += v.y; return this; };
  P.addScaled = function (v, s) { this.x += v.x * s; this.y += v.y * s; return this; };
  P.sub = function (v) { this.x -= v.x; this.y -= v.y; return this; };
  P.scale = function (s) { this.x *= s; this.y *= s; return this; };
  P.lenSq = function () { return this.x * this.x + this.y * this.y; };
  P.len = function () { return Math.sqrt(this.x * this.x + this.y * this.y); };
  P.distSq = function (v) { const dx = v.x - this.x, dy = v.y - this.y; return dx * dx + dy * dy; };
  P.dist = function (v) { return Math.sqrt(this.distSq(v)); };
  P.angle = function () { return Math.atan2(this.y, this.x); };
  P.norm = function () {
    const l = this.len();
    if (l > 1e-9) { this.x /= l; this.y /= l; }
    return this;
  };
  P.rotate = function (a) {
    const c = Math.cos(a), s = Math.sin(a), x = this.x;
    this.x = x * c - this.y * s;
    this.y = x * s + this.y * c;
    return this;
  };
  // 限速：把长度夹到 m 以内（移速上限、弹速规范化）
  P.clampLen = function (m) {
    const l = this.len();
    if (l > m && l > 1e-9) this.scale(m / l);
    return this;
  };
  P.isZero = function () { return this.x * this.x + this.y * this.y < 1e-12; };

  Vec2.of = function (x, y) { return new Vec2(x, y); };
  Vec2.fromAngle = function (a, l) { const n = (l === undefined ? 1 : l); return new Vec2(Math.cos(a) * n, Math.sin(a) * n); };
  Vec2.add = function (a, b) { return new Vec2(a.x + b.x, a.y + b.y); };
  Vec2.sub = function (a, b) { return new Vec2(a.x - b.x, a.y - b.y); };
  Vec2.scale = function (v, s) { return new Vec2(v.x * s, v.y * s); };
  Vec2.len = function (v) { return Math.sqrt(v.x * v.x + v.y * v.y); };
  Vec2.distSq = function (a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
  Vec2.dist = function (a, b) { return Math.sqrt(Vec2.distSq(a, b)); };
  Vec2.norm = function (v) {
    const l = Math.sqrt(v.x * v.x + v.y * v.y);
    return l > 1e-9 ? new Vec2(v.x / l, v.y / l) : new Vec2(0, 0);
  };
  Vec2.lerp = function (a, b, t) { return new Vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); };
  Vec2.dot = function (a, b) { return a.x * b.x + a.y * b.y; };
  // 求 a→b 的夹角（弧度，-PI~PI），用于扇形弹幕瞄准
  Vec2.angleBetween = function (a, b) { return Math.atan2(b.y - a.y, b.x - a.x); };

  HX.Vec2 = Vec2;
})();
