// 对象池——子弹 / 粒子 / 飘字复用，压住 GC 抖动（README §9）。
// 约定：池内对象一律带 `alive` 布尔；系统只遍历 active，死亡对象置 alive=false，
//       每帧末尾调用 sweep() 批量回收。池为空且已达上限时 obtain() 返回 null（调用方须判空）。
(function () {
  const HX = window.HX || (window.HX = {});

  function Pool(opts) {
    opts = opts || {};
    this.create = opts.create;             // 必填：工厂函数
    this.reset = opts.reset || null;       // 可选：reset(obj, ...args)
    this.max = opts.max || 512;            // 上限（同屏实体封顶，防雪崩）
    this.active = [];
    this.free = [];
  }

  Pool.prototype.obtain = function () {
    let o = this.free.pop();
    if (!o) {
      if (this.active.length >= this.max) return null;
      o = this.create();
    }
    o.alive = true;
    if (this.reset) this.reset.apply(null, [o].concat(Array.prototype.slice.call(arguments)));
    this.active.push(o);
    return o;
  };

  Pool.prototype.release = function (o) {
    if (!o || !o.alive) return;
    o.alive = false;
  };

  // 每帧末尾调用：把 alive=false 的对象移回 free
  Pool.prototype.sweep = function () {
    const act = this.active;
    let w = 0;
    for (let i = 0; i < act.length; i++) {
      const o = act[i];
      if (o.alive) act[w++] = o;
      else this.free.push(o);
    }
    act.length = w;
  };

  Pool.prototype.clear = function () {
    for (let i = 0; i < this.active.length; i++) {
      this.active[i].alive = false;
      this.free.push(this.active[i]);
    }
    this.active.length = 0;
  };

  Pool.prototype.forEach = function (fn) {
    const act = this.active;
    for (let i = 0; i < act.length; i++) if (act[i].alive) fn(act[i], i);
  };

  Pool.prototype.stats = function () {
    return { active: this.active.length, free: this.free.length, max: this.max };
  };

  HX.Pool = Pool;
})();
