// 程序化美术 —— **平面层与场景**（资源代码化：零图片文件）。
//
// 【分层约定，见 GDD §3.3】
//   本文件负责「斜俯视的**地面平面**」：天幕、仙山地面、灵气格网、地面标记（地火预警/火痕/范围圈）、
//   弹幕（在地面高度飞行的密集物体，保持平面绘制以便读距）、特效原语、屏幕后处理。
//   角色 / 怪物 / BOSS / 石柱 / 灵石这些**侧视立绘**在 src/render/sprites.js（billboard 层），
//   本文件只保留同名转调函数，保证渲染层的调用点不变。
//
// 坐标约定：**全项目统一 px**（见 config/constants.js 头注释）。调用前渲染层已应用相机变换，
//           因此这里一律使用世界像素坐标，数值与逻辑层同源，无需换算。
// 纪律（AGENTS §5）：本文件只读状态、只画不收，绝不修改任何实体。
(function () {
  const HX = window.HX || (window.HX = {});

  const TAU = Math.PI * 2;

  // 斜俯视投影下地面圆的纵向压缩比
  function squash() { return HX.C.PLANE_SQUASH === undefined ? 0.55 : HX.C.PLANE_SQUASH; }

  const Art = {
    // ---------- 屏幕空间：天幕（2026-09-16 简化：纯色填充） ----------
    // 原为三段渐变 + 星点 + 三层视差云带；设计者指示只保留纯色。
    // 取原渐变中段色 sky1（#0d1730，主色调）。首页/换肤背景走 assets/home 素材（HX.HomeBg），与本函数无关。
    drawSky(ctx, cam, t, W, H) {
      ctx.fillStyle = HX.PAL.bg.sky1;
      ctx.fillRect(0, 0, W, H);
    },

    // ---------- 世界空间：仙山地面 + 灵气屏障（GDD §5） ----------
    // 注意：这是**地面平面**（斜俯视），所有实体立绘都站在它上面。
    drawArena(ctx, cam, t) {
      const C = HX.C, P = HX.PAL.bg;
      const w = C.ARENA.w, h = C.ARENA.h;

      const g = ctx.createLinearGradient(0, 0, w * 0.35, h);
      g.addColorStop(0, '#0c1426');
      g.addColorStop(1, '#080d1a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // 仙山剪影（两层，纯几何）
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = P.mountainFar;
      for (let i = 0; i < 12; i++) {
        const bx = i * (w / 11) - 200;
        const bh = 260 + ((i * 37) % 5) * 90;
        ctx.beginPath();
        ctx.moveTo(bx, h * 0.62);
        ctx.lineTo(bx + 320, h * 0.62 - bh);
        ctx.lineTo(bx + 640, h * 0.62);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = P.mountainNear;
      for (let i = 0; i < 9; i++) {
        const bx = i * (w / 8) - 120;
        const bh = 190 + ((i * 53) % 4) * 70;
        ctx.beginPath();
        ctx.moveTo(bx, h * 0.86);
        ctx.lineTo(bx + 300, h * 0.86 - bh);
        ctx.lineTo(bx + 600, h * 0.86);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // 灵气格网（640px 一格 = 玩家直径的 2.5 倍；贴地网格 = 判断走位与尺度的参照）
      const cell = 640;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = P.grid;
      ctx.beginPath();
      for (let x = 0; x <= w + 1; x += cell) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = 0; y <= h + 1; y += cell) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
      ctx.strokeStyle = P.gridMajor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= w + 1; x += cell * 3) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = 0; y <= h + 1; y += cell * 3) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
      ctx.restore();

      // 灵气屏障（空气墙，GDD §5）
      ctx.save();
      ctx.strokeStyle = P.barrier;
      ctx.lineWidth = 6;
      ctx.setLineDash([26, 18]);
      ctx.lineDashOffset = -t * 40;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.restore();
    },

    // ---------- 通用辉光 ----------
    glow(ctx, x, y, r, color, alpha) {
      if (!(r > 0)) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalAlpha = alpha === undefined ? 1 : alpha;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.restore();
    },

    // 调试用圆形（保留：排查锚点/判定半径时很顺手）
    drawBlob(ctx, x, y, r, fill, stroke, label) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.lineWidth = Math.max(2, r * 0.08);
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
      if (label) {
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.font = '600 ' + Math.round(r * 0.7) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
        ctx.restore();
      }
    },

    // ==================== 地面层（斜俯视平面） ====================

    // 地火：预警红圈（平面）→ 成型后「贴地灼烧痕 + 向上窜的火舌」。
    // 字段：{ pos, r, delay, age, kind:'warn'|'fire', dmg }
    drawHazard(ctx, hz, t) {
      const x = hz.pos.x, y = hz.pos.y;
      const r = hz.r, sq = squash();
      const P = HX.PAL.hazard;

      if (hz.kind === 'fire') {
        // 贴地灼烧痕
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,190,110,0.55)');
        g.addColorStop(0.6, 'rgba(255,110,30,0.38)');
        g.addColorStop(1, 'rgba(120,30,0,0)');
        ctx.save();
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * sq, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
        // 火舌（侧视，向上）
        for (let i = 0; i < 7; i++) {
          const a = i * 2.1 + t * 2.6;
          const fx = x + Math.sin(a) * r * 0.55;
          const fy = y + Math.cos(a * 0.7) * r * sq * 0.45;
          const fh = r * (0.42 + 0.30 * (0.5 + 0.5 * Math.sin(a * 1.8)));
          ctx.save();
          ctx.globalAlpha = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(a * 2.2));
          ctx.fillStyle = i % 3 === 0 ? '#ffe6b0' : (i % 3 === 1 ? '#ff9b3d' : '#ff6a1e');
          ctx.beginPath();
          ctx.ellipse(fx, fy - fh * 0.5, r * 0.13, fh * 0.5, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
        return;
      }

      // 预警环：外圈 + 随延迟推进的填充
      const k = hz.delay > 0 ? Math.max(0, Math.min(1, hz.age / hz.delay)) : 1;
      ctx.save();
      ctx.fillStyle = P.warn;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * sq, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,80,60,0.34)';
      ctx.beginPath();
      ctx.ellipse(x, y, r * k, r * k * sq, 0, 0, TAU);
      ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.06);
      ctx.strokeStyle = P.warnEdge;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 9);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * sq, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    },

    // 地面残火（南明「踏焰留痕」火痕 / 火凤燎原残留，GDD §7.2）：灼痕 + 小火舌
    // 字段：{ pos, r, age, life }
    drawFire(ctx, f, t) {
      const x = f.pos.x, y = f.pos.y, r = f.r;
      const sq = squash();
      const fade = f.life > 0 ? Math.max(0, 1 - f.age / f.life) : 1;
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.4 * fade;
      ctx.fillStyle = 'rgba(255,110,30,0.45)';
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * sq, 0, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + i * 2.1 + (x + y) * 0.01;
        const fh = r * (0.5 + 0.35 * (0.5 + 0.5 * Math.sin(a)));
        ctx.globalAlpha = (0.5 + 0.4 * fade) * (0.7 + 0.3 * Math.sin(a * 1.7));
        ctx.fillStyle = i % 2 ? '#ffc45e' : '#ff8a2b';
        ctx.beginPath();
        ctx.ellipse(x + Math.sin(a) * r * 0.35, y - fh * 0.45, r * 0.22, fh * 0.45, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    },

    // ==================== 实体层：转调侧视立绘（render/sprites.js） ====================
    drawPlayer(ctx, player, skinId, t) { HX.Sprites.player(ctx, player, skinId, t); },
    drawEnemy(ctx, e, t) { if (e.typeId === 'spider') HX.Sprites.spider(ctx, e, t); else HX.Sprites.wizard(ctx, e, t); },
    drawBoss(ctx, b, t) {
      // 召唤施法（石柱阶段）：金色脉冲光晕罩在 BOSS 身上，全程持续到施法结束（2026-09-16 设计者指示）
      if (b.casting) {
        const pulse = 0.65 + 0.3 * Math.sin(t * 9);
        this.glow(ctx, b.pos.x, b.pos.y - b.visualR * 0.6, b.visualR * (2.3 + 0.15 * Math.sin(t * 9)), '#ffd98a', pulse);
      }
      HX.Sprites.boss(ctx, b, t);
    },
    drawPillar(ctx, p, t) { HX.Sprites.pillar(ctx, p, t); },

    // 石柱结界边框（2026-09-16 设计者指示：4 柱连成矩形把玩家围在中间）。
    // 淡紫发光描边沿柱心连线（即结界边界），透明度随石柱出土进度淡入；点燃越多越亮。
    drawPillarBarrier(ctx, world, t) {
      const r = world.pillarRect;
      const ps = world.pillars;
      if (!r || ps.length === 0) return;
      let k = 0;
      for (let i = 0; i < ps.length; i++) k += (ps[i].emerge === undefined ? 1 : ps[i].emerge);
      k /= ps.length;                                   // 出土进度 0~1
      if (k <= 0) return;
      const lit = ps.filter(function (pl) { return pl.lit; }).length;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.save();
      ctx.globalAlpha = (0.25 + 0.35 * k) * (0.8 + 0.2 * pulse) + lit * 0.06;
      ctx.strokeStyle = HX.PAL.pillar.litEdge;
      ctx.lineWidth = 3;
      ctx.setLineDash([26, 18]);
      ctx.lineDashOffset = -t * 40;                     // 结界流动感
      ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
      ctx.globalAlpha *= 0.5;
      ctx.lineWidth = 9;
      ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
      ctx.restore();
    },
    drawPickup(ctx, p, t) { HX.Sprites.pickup(ctx, p, t); },
    drawGuard(ctx, player, skinId, t) { HX.Sprites.guard(ctx, player, skinId, t); },

    // 万剑归宗·悬停飞剑（2026-09-16 v2）：现身未起飞的 20 把剑，原地悬浮 + 轻微上下浮动
    drawUltSwords(ctx, world, t) {
      const p = world.player;
      const q = p && p.ultSwordQueue;
      if (!q) return;
      const sk = HX.PAL.skins.yujian;
      for (let i = 0; i < q.swords.length; i++) {
        const sw = q.swords[i];
        if (sw.launched) continue;
        const bob = Math.sin(t * 6 + i * 1.3) * 4;       // 悬浮浮动
        // 待发微光
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 5 + i);
        ctx.fillStyle = sk.accent;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y + bob, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 剑体（竖直悬立，剑尖朝上）
        HX.Sprites.drawSword(ctx, sw.x, sw.y + 26 + bob, sw.x, sw.y - 26 + bob, sk);
      }
    },

    // ==================== 弹幕层（保持平面绘制） ====================
    // 判断依据：弹幕是**在地面高度飞行**的物体，数量可达数百；画成竖立立绘会互相遮挡，
    // 且玩家真正需要判断的是「它与我的地面距离」（判定是平面的，GDD §14）。
    // 所以一律画在地面平面上，用沿运动方向的拖尾 + 顶部高光提示方向。
    drawBullets(ctx, world, t) {
      const sq = squash();
      const draw = (list) => {
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (!b.alive) continue;
          const x = b.pos.x, y = b.pos.y, R = b.visualR;
          const a = Math.atan2(b.vel.y, b.vel.x);
          ctx.save();
          ctx.translate(x, y);
          switch (b.style) {
            case 'sword': {
              // 飞行飞剑（2026-09-16）：与立绘剑同一形状（path1.svg 剪影 → Sprites.drawSword），
              // 颜色沿用御剑配色；飞行方向 = 剑尖朝前。
              // ⚠ drawBullets 已 translate 到弹幕位置 —— 这里用**相对坐标**
              const fx = Math.cos(a), fy = Math.sin(a);
              HX.Sprites.drawSword(ctx,
                -fx * R * 3.0, -fy * R * 3.0,            // 柄底（后方）
                fx * R * 2.6, fy * R * 2.6,              // 剑尖（前方）
                HX.PAL.skins.yujian);
              break;
            }
            case 'fire': {
              ctx.globalAlpha = 0.5;
              ctx.fillStyle = HX.PAL.skins.nanming.bullet;
              ctx.beginPath(); ctx.arc(-Math.cos(a) * R * 0.9, -Math.sin(a) * R * 0.9, R * 1.3, 0, TAU); ctx.fill();
              ctx.globalAlpha = 1;
              ctx.beginPath(); ctx.arc(0, 0, R * 1.6, 0, TAU);
              ctx.fillStyle = HX.PAL.skins.nanming.accent; ctx.fill();
              ctx.beginPath(); ctx.arc(0, 0, R * 0.9, 0, TAU);
              ctx.fillStyle = '#fff3d6'; ctx.fill();
              break;
            }
            case 'thunder': {
              ctx.globalAlpha = 0.6;
              ctx.strokeStyle = HX.PAL.skins.jiuxiao.bullet;
              ctx.lineWidth = Math.max(1.5, R * 0.3);
              for (let k = 0; k < 3; k++) {
                const ka = t * 14 + k * 2.1;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(ka) * R * 2.4, Math.sin(ka) * R * 2.4);
                ctx.stroke();
              }
              ctx.globalAlpha = 1;
              ctx.beginPath(); ctx.arc(0, 0, R * 1.5, 0, TAU);
              ctx.fillStyle = HX.PAL.skins.jiuxiao.accent; ctx.fill();
              ctx.beginPath(); ctx.arc(0, 0, R * 0.75, 0, TAU);
              ctx.fillStyle = '#fff'; ctx.fill();
              break;
            }
            case 'tracking': {
              // BOSS 追踪弹：醒目橙 + 亮核 + 脉冲外圈（提示"被它打到会点燃石柱"）
              ctx.globalAlpha = 0.55;
              ctx.fillStyle = HX.PAL.enemy.track;
              ctx.beginPath();
              ctx.ellipse(-Math.cos(a) * R * 2.2, -Math.sin(a) * R * 2.2 * sq, R * 2.4, R * 1.0, a, 0, TAU);
              ctx.fill();
              ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 12);
              ctx.strokeStyle = HX.PAL.enemy.trackCore;
              ctx.lineWidth = Math.max(1.5, R * 0.28);
              ctx.beginPath(); ctx.arc(0, 0, R * 2.0, 0, TAU); ctx.stroke();
              ctx.globalAlpha = 1;
              ctx.beginPath(); ctx.arc(0, 0, R * 1.35, 0, TAU);
              ctx.fillStyle = HX.PAL.enemy.track; ctx.fill();
              ctx.beginPath(); ctx.arc(0, 0, R * 0.7, 0, TAU);
              ctx.fillStyle = HX.PAL.enemy.trackCore; ctx.fill();
              break;
            }
            case 'phoenix': {
              // 火凤凰（南明大招 v2）：大火焰团 768×768 —— 长尾焰（后方）+ 双翼火舌 + 金红凤身
              ctx.rotate(a);
              const tail = function (d, s, alpha) {           // 尾焰：后方逐级缩小的火团（轻微波动）
                ctx.globalAlpha = alpha;
                ctx.fillStyle = HX.PAL.skins.nanming.bullet;
                ctx.beginPath(); ctx.arc(-d, Math.sin(t * 9 + d * 0.01) * R * 0.06, s, 0, TAU); ctx.fill();
              };
              tail(R * 1.5, R * 0.7, 0.4); tail(R * 2.3, R * 0.52, 0.28); tail(R * 3.0, R * 0.34, 0.18);
              // 双翼（垂直于飞行方向的火舌）
              ctx.globalAlpha = 0.7;
              ctx.fillStyle = HX.PAL.skins.nanming.bullet;
              ctx.beginPath(); ctx.ellipse(R * 0.2, -R * 0.7, R * 0.32, R * 0.65, 0, 0, TAU); ctx.fill();
              ctx.beginPath(); ctx.ellipse(R * 0.2, R * 0.7, R * 0.32, R * 0.65, 0, 0, TAU); ctx.fill();
              // 凤身（金红三层）
              ctx.globalAlpha = 1;
              ctx.beginPath(); ctx.arc(0, 0, R * 0.62, 0, TAU); ctx.fillStyle = HX.PAL.skins.nanming.accent; ctx.fill();
              ctx.beginPath(); ctx.arc(R * 0.12, 0, R * 0.4, 0, TAU); ctx.fillStyle = '#ffd98a'; ctx.fill();
              ctx.beginPath(); ctx.arc(R * 0.24, 0, R * 0.2, 0, TAU); ctx.fillStyle = '#fff3d6'; ctx.fill();
              break;
            }
            default: {
              const col = b.side === 'player' ? HX.PAL.skins.yujian.bullet : HX.PAL.enemy.bullet;
              // 地面阴影暗示高度
              ctx.globalAlpha = 0.30;
              ctx.fillStyle = 'rgba(0,0,0,0.8)';
              ctx.beginPath();
              ctx.ellipse(0, R * 0.75, R * 1.1, R * 0.6 * sq, 0, 0, TAU);
              ctx.fill();
              ctx.globalAlpha = 0.45;
              ctx.fillStyle = col;
              ctx.beginPath();
              ctx.arc(-Math.cos(a) * R * 0.8, -Math.sin(a) * R * 0.8, R * 1.5, 0, TAU);
              ctx.fill();
              ctx.globalAlpha = 1;
              ctx.beginPath(); ctx.arc(0, 0, R * 1.25, 0, TAU);
              ctx.fillStyle = col; ctx.fill();
              ctx.beginPath(); ctx.arc(-R * 0.2, -R * 0.2, R * 0.55, 0, TAU);
              ctx.fillStyle = '#fff'; ctx.fill();
            }
          }
          ctx.restore();
        }
      };
      if (world.bullets) draw(world.bullets);
      if (world.ebullets) draw(world.ebullets);
    },

    // ==================== 特效层 ====================
    // 特效字段统一：{ type, pos, age, life, alive }
    //   spark 粒子 { pos, vel, r, color } ｜ ring 冲击环 { pos, r0, r1, color }
    //   text  飘字 { pos, text, color }    ｜ arc  电弧 { points:[{x,y}], color }
    //   ignite 点火火球 { from, to, color }
    drawEffects(ctx, world, t) {
      const sq = squash();
      const list = world.effects;
      if (!list) return;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.alive) continue;
        if (e.delay > 0) continue;                       // 延迟启动的特效（重播副本）尚未出现
        const k = e.life > 0 ? Math.max(0, Math.min(1, e.age / e.life)) : 0;
        const fade = 1 - k;
        switch (e.type) {
          case 'spark': {
            ctx.save();
            ctx.globalAlpha = fade;
            ctx.fillStyle = e.color || HX.PAL.fx.hit;
            ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.r * (0.4 + fade), 0, TAU); ctx.fill();
            ctx.restore();
            break;
          }
          case 'ring': {
            const r = e.r0 + (e.r1 - e.r0) * k;
            ctx.save();
            ctx.globalAlpha = fade * 0.9;
            ctx.strokeStyle = e.color || HX.PAL.fx.white;
            ctx.lineWidth = Math.max(1.5, 2 * fade);
            ctx.beginPath();
            ctx.ellipse(e.pos.x, e.pos.y, r, r * sq, 0, 0, TAU);
            ctx.stroke();
            ctx.restore();
            break;
          }
          case 'text': {
            // 伤害飘字是「可读信息」而不是场景物体：不随实体等比缩到 7px（会看不清），
            // 取约原值 2/3 = 14px 作为可读性下限。
            ctx.save();
            ctx.globalAlpha = Math.max(0, 1 - k * k);
            ctx.font = '700 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = e.color || HX.PAL.fx.text;
            ctx.fillText(e.text, e.pos.x, e.pos.y - k * 26);
            ctx.restore();
            break;
          }
          case 'arc': {
            // 雷链传导（GDD §7.3）：折线电弧
            ctx.save();
            ctx.globalAlpha = fade;
            ctx.strokeStyle = e.color || HX.PAL.skins.jiuxiao.accent;
            ctx.lineWidth = Math.max(1.5, 1.7 * fade);
            ctx.beginPath();
            for (let j = 0; j < e.points.length; j++) {
              const p = e.points[j];
              const jitter = (j > 0 && j < e.points.length - 1) ? Math.sin(t * 40 + j * 3) * 2.3 : 0;
              if (j === 0) ctx.moveTo(p.x, p.y + jitter);
              else ctx.lineTo(p.x, p.y + jitter);
            }
            ctx.stroke();
            ctx.restore();
            break;
          }
          case 'ignite': {
            // 命中玩家后飞向石柱的火球（GDD §13.3）
            const x = e.from.x + (e.to.x - e.from.x) * k;
            const y = e.from.y + (e.to.y - e.from.y) * k - Math.sin(k * Math.PI) * 20;
            ctx.save();
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = HX.PAL.pillar.lit;
            ctx.beginPath(); ctx.arc(x, y, 4.3, 0, TAU); ctx.fill();
            ctx.fillStyle = HX.PAL.pillar.litEdge;
            ctx.beginPath(); ctx.arc(x, y, 2.3, 0, TAU); ctx.fill();
            ctx.restore();
            break;
          }
          default: break;
        }
      }
    }
  };

  HX.Art = Art;
})();
