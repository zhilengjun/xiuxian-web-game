// 圆-圆碰撞（README §6：这是全工程**唯一**碰撞实现，其他地方不得另写几何判定）。
// GDD §14：所有实体碰撞形状一律为圆；碰撞半径 = 外观半径 × 0.7（见 config/constants.js）。
// 半径取值约定：实体的碰撞半径字段名为 `solidR`；若传入的是普通对象（子弹/地火等）用 `r`。
(function () {
  const HX = window.HX || (window.HX = {});

  const EPS = 1e-9;

  const Collide = {
    // 取半径：优先 solidR（实体），回退 r（弹幕/区域），再回退 fallback
    radiusOf(o, fallback) {
      if (o.solidR !== undefined && o.solidR !== null) return o.solidR;
      if (o.r !== undefined && o.r !== null) return o.r;
      return fallback === undefined ? 0 : fallback;
    },

    // 基础判定：两圆是否相交（含相切）
    test(ax, ay, ar, bx, by, br) {
      const dx = bx - ax, dy = by - ay, r = ar + br;
      return dx * dx + dy * dy <= r * r;
    },

    // 便捷重载：传入两个带位置的圆对象
    circles(a, b, ra, rb) {
      return Collide.test(
        a.x, a.y, ra === undefined ? Collide.radiusOf(a, 0) : ra,
        b.x, b.y, rb === undefined ? Collide.radiusOf(b, 0) : rb
      );
    },

    // 重叠信息：无重叠返回 null，否则 { nx, ny, depth }
    // nx/ny = 从 a 指向 b 的单位法线；depth = 穿透深度（用于分离力/推挤）
    overlap(ax, ay, ar, bx, by, br) {
      const dx = bx - ax, dy = by - ay, r = ar + br;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) return null;
      const d = Math.sqrt(d2);
      if (d < EPS) return { nx: 1, ny: 0, depth: r }; // 完全重合：任取方向，防 NaN
      return { nx: dx / d, ny: dy / d, depth: r - d };
    },

    // 圆-点（拾取范围、点选卡片等）
    pointInCircle(px, py, cx, cy, r) {
      const dx = px - cx, dy = py - cy;
      return dx * dx + dy * dy <= r * r;
    },

    // 圆-矩形（镜头/世界边界裁剪用；矩形以左上角 + 宽高表达）
    circleRect(cx, cy, r, rx, ry, rw, rh) {
      const nx = Math.max(rx, Math.min(cx, rx + rw));
      const ny = Math.max(ry, Math.min(cy, ry + rh));
      const dx = cx - nx, dy = cy - ny;
      return dx * dx + dy * dy <= r * r;
    }
  };

  HX.Collide = Collide;
})();
