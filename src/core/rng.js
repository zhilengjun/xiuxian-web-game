// 种子 RNG（确定性）——逻辑层唯一随机源。
// 依据：AGENTS §4「固定步长与确定性」——相同 seed + 相同输入 → 完全相同对局；
//       逻辑层禁止 Math.random()，全部随机走本模块。
// 算法：mulberry32（32 位状态、无外部依赖、分布质量足够 gameplay 使用）。
(function () {
  const HX = window.HX || (window.HX = {});

  function RNG(seed) {
    this.reset(seed);
  }

  RNG.prototype.reset = function (seed) {
    // 默认种子取 GDD 定稿日期，保证「不传种子」也可复现
    this.seed = (seed === undefined || seed === null) ? 20260915 : (seed >>> 0);
    this.s = this.seed >>> 0;
    this.calls = 0;
  };

  // 返回 [0, 1)
  RNG.prototype.next = function () {
    this.calls++;
    let t = (this.s += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  RNG.prototype.between = function (a, b) { return a + (b - a) * this.next(); };
  RNG.prototype.int = function (a, b) { return Math.floor(a + (b - a + 1) * this.next()); }; // 闭区间 [a, b]
  RNG.prototype.chance = function (p) { return this.next() < p; };
  RNG.prototype.pick = function (arr) { return arr[Math.min(arr.length - 1, Math.floor(this.next() * arr.length))]; };
  RNG.prototype.angle = function () { return this.next() * Math.PI * 2; };
  RNG.prototype.sign = function () { return this.next() < 0.5 ? -1 : 1; };
  // 派生独立子流：用于「互不干扰」的子系统随机（如掉落 vs 弹幕摆动）
  RNG.prototype.fork = function () { return new RNG((this.next() * 4294967296) >>> 0); };

  HX.RNG = RNG;
})();
