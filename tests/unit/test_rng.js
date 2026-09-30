// 单元测试 · 核心（README §8）：种子 RNG 确定性 + 对象池行为。
// 这两项是「相同种子 + 相同输入 → 相同对局」的前提（AGENTS §4）。
(function () {
  const HX = window.HX;

  HX.test('rng: 同种子产生完全相同的序列', function () {
    const a = new HX.RNG(12345), b = new HX.RNG(12345);
    for (let i = 0; i < 200; i++) {
      HX.assert(a.next() === b.next(), '第 ' + i + ' 个随机数不一致');
    }
  });

  HX.test('rng: 不同种子产生不同序列', function () {
    const a = new HX.RNG(1), b = new HX.RNG(2);
    let same = 0;
    for (let i = 0; i < 50; i++) if (a.next() === b.next()) same++;
    HX.assert(same < 3, '不同种子不应高度重合（重合 ' + same + '/50）');
  });

  HX.test('rng: next 值域 [0,1) 且分布不退化', function () {
    const r = new HX.RNG(2026);
    let sum = 0, min = 1, max = 0;
    for (let i = 0; i < 20000; i++) {
      const v = r.next();
      HX.assert(v >= 0 && v < 1, 'next 越界: ' + v);
      sum += v; if (v < min) min = v; if (v > max) max = v;
    }
    const mean = sum / 20000;
    HX.assert(Math.abs(mean - 0.5) < 0.02, '均值应接近 0.5，实为 ' + mean.toFixed(4));
    HX.assert(min < 0.01 && max > 0.99, '值域覆盖不足');
  });

  HX.test('rng: int 为闭区间、between 落界内', function () {
    const r = new HX.RNG(7);
    let saw3 = false, saw5 = false;
    for (let i = 0; i < 2000; i++) {
      const n = r.int(3, 5);
      HX.assert(n >= 3 && n <= 5, 'int 越界: ' + n);
      HX.assert(n === Math.floor(n), 'int 必须为整数');
      if (n === 3) saw3 = true;
      if (n === 5) saw5 = true;
      const f = r.between(2, 4);
      HX.assert(f >= 2 && f <= 4, 'between 越界: ' + f);
    }
    HX.assert(saw3 && saw5, 'int 应覆盖闭区间两端（3 与 5 都需出现）');
  });

  HX.test('rng: reset 后序列可复现（重开同一种子对局场景）', function () {
    const r = new HX.RNG(99);
    const first = [r.next(), r.next(), r.next()];
    r.reset(99);
    HX.assert(r.next() === first[0] && r.next() === first[1] && r.next() === first[2], 'reset 后序列不一致');
  });

  HX.test('rng: fork 出的子流彼此独立且可复现', function () {
    const a = new HX.RNG(5).fork(), b = new HX.RNG(5).fork();
    const sa = [a.next(), a.next(), a.next()];
    const sb = [b.next(), b.next(), b.next()];
    HX.assert(sa[0] === sb[0] && sa[1] === sb[1], '同种子 fork 应可复现');
  });

  HX.test('pool: obtain/release/sweep 循环复用', function () {
    let created = 0;
    const pool = new HX.Pool({
      max: 4,
      create() { created++; return { alive: false, n: 0 }; },
      reset(o, n) { o.n = n; }
    });
    const a = pool.obtain(1), b = pool.obtain(2);
    HX.assert(a.n === 1 && b.n === 2, 'reset 未正确写参');
    HX.assert(pool.active.length === 2, 'active 计数错误');

    pool.release(a);
    pool.sweep();
    HX.assert(pool.active.length === 1, 'sweep 后 active 应为 1');
    HX.assert(pool.free.length === 1, 'sweep 后 free 应为 1');

    const c = pool.obtain(3);
    HX.assert(c === a, 'obtain 应复用已释放对象（不得新建）');
    HX.assert(created === 2, '不应新建对象，实建 ' + created);
  });

  HX.test('pool: 达上限时返回 null（调用方须判空）', function () {
    const pool = new HX.Pool({ max: 2, create() { return { alive: false }; } });
    HX.assert(pool.obtain() !== null, '第 1 个应成功');
    HX.assert(pool.obtain() !== null, '第 2 个应成功');
    HX.assert(pool.obtain() === null, '超上限必须返回 null');
  });

  HX.test('pool: release 幂等，重复释放不污染 free', function () {
    const pool = new HX.Pool({ max: 2, create() { return { alive: false }; } });
    const a = pool.obtain();
    pool.release(a);
    pool.release(a);
    pool.sweep();
    HX.assert(pool.active.length === 0, 'active 应清空');
    HX.assert(pool.free.length === 1, '重复释放不得重复入池，实为 ' + pool.free.length);
  });
})();
