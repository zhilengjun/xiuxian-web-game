// 单元测试 · 数学层（README §8）：向量运算 + 圆-圆碰撞（唯一碰撞实现）。
// 运行：浏览器打开 tests/run.html（零 Node）。
(function () {
  const HX = window.HX;
  const V = HX.Vec2, Col = HX.Collide;

  HX.test('vec: 实例运算 add/sub/scale', function () {
    const a = new V(3, 4);
    HX.assert(a.len() === 5, 'len 应为 5，实为 ' + a.len());
    a.add(new V(1, 1));
    HX.assert(a.x === 4 && a.y === 5, 'add 结果错误: ' + a.x + ',' + a.y);
    a.sub(new V(4, 5));
    HX.assert(a.x === 0 && a.y === 0, 'sub 未回到原点: ' + a.x + ',' + a.y);
    a.set(2, 0).scale(3);
    HX.assert(a.x === 6 && a.y === 0, 'scale 结果错误');
  });

  HX.test('vec: norm 归一化与零向量安全', function () {
    const a = new V(0, 10).norm();
    HX.assert(Math.abs(a.x) < 1e-9 && Math.abs(a.y - 1) < 1e-9, 'norm 方向错误');
    const z = new V(0, 0).norm();
    HX.assert(z.x === 0 && z.y === 0, '零向量 norm 必须保持 (0,0)，不得产生 NaN');
  });

  HX.test('vec: rotate 90° 与 clampLen 限速', function () {
    const a = new V(1, 0).rotate(Math.PI / 2);
    HX.assert(Math.abs(a.x) < 1e-9 && Math.abs(a.y - 1) < 1e-9, 'rotate 90° 应指向 +y');
    const b = new V(30, 40).clampLen(5);
    HX.assert(Math.abs(b.len() - 5) < 1e-9, 'clampLen 后长度应为 5，实为 ' + b.len());
    const c = new V(1, 0).clampLen(5);
    HX.assert(Math.abs(c.len() - 1) < 1e-9, '未超限时不应被改动');
  });

  HX.test('vec: 静态版不修改入参', function () {
    const a = new V(1, 1), b = new V(2, 2);
    const s = V.add(a, b);
    HX.assert(a.x === 1 && b.x === 2, '静态 add 不得改动原向量');
    HX.assert(s.x === 3 && s.y === 3, '静态 add 结果错误');
    HX.assert(Math.abs(V.dist(a, b) - Math.sqrt(2)) < 1e-9, 'dist 计算错误');
  });

  HX.test('collision: test 相切算命中、分离不命中', function () {
    HX.assert(Col.test(0, 0, 1, 2, 0, 1) === true, '相切应判定为命中（含相切）');
    HX.assert(Col.test(0, 0, 1, 2.001, 0, 1) === false, '分离不应命中');
    HX.assert(Col.test(0, 0, 0.5, 0, 0, 0.5) === true, '同心圆必须命中');
  });

  HX.test('collision: overlap 返回法线与穿透深度', function () {
    const o = Col.overlap(0, 0, 1, 1.5, 0, 1);
    HX.assert(o !== null, '应判定为重叠');
    HX.assert(Math.abs(o.nx - 1) < 1e-9 && Math.abs(o.ny) < 1e-9, '法线应由 a 指向 b（+x）');
    HX.assert(Math.abs(o.depth - 0.5) < 1e-9, '穿透深度应为 0.5，实为 ' + o.depth);
    HX.assert(Col.overlap(0, 0, 1, 5, 0, 1) === null, '分离时必须返回 null');
  });

  HX.test('collision: 完全重合不产生 NaN', function () {
    const o = Col.overlap(2, 2, 1, 2, 2, 1);
    HX.assert(o !== null && isFinite(o.nx) && isFinite(o.ny) && isFinite(o.depth), '同心重叠不得产生 NaN');
  });

  HX.test('collision: radiusOf 优先 solidR（GDD §14 判定半径）', function () {
    HX.assert(Col.radiusOf({ solidR: 0.35, r: 0.5 }) === 0.35, '实体应取 solidR');
    HX.assert(Col.radiusOf({ r: 0.12 }) === 0.12, '弹幕无 solidR 时回退 r');
    HX.assert(Col.radiusOf({}, 7) === 7, '缺省时应回退 fallback');
  });

  HX.test('collision: pointInCircle / circleRect', function () {
    HX.assert(Col.pointInCircle(1, 0, 0, 0, 1) === true, '边界点应算命中');
    HX.assert(Col.pointInCircle(1.5, 0, 0, 0, 1) === false, '圆外点不应命中');
    HX.assert(Col.circleRect(5, 5, 1, 0, 0, 10, 10) === true, '圆在矩形内应命中');
    HX.assert(Col.circleRect(20, 20, 1, 0, 0, 10, 10) === false, '圆在矩形外不应命中');
  });
})();
