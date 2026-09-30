// 侧视立绘层（billboard sprites）—— 表现层重构的核心文件。
//
// 【为什么需要这一层】GDD §3.3 表现层约定：
//   地面是**斜俯视平面**（走位、碰撞、地面标记都在这层），
//   而角色 / 怪物 / 障碍 / 可拾取物是**侧视立绘**（类似《饥荒》）——
//   从**地面锚点**向屏幕上方生长，脚下带落地阴影。
//   实体的 pos 是「脚下站位（地面锚点）」，不是立绘中心；碰撞仍是锚点处的圆（GDD §14）。
//
// 【坐标约定】**全项目统一 px**（见 config/constants.js 头注释），这里不再做任何单位换算。
//   billboard() 负责：画阴影 → 平移到锚点 → 处理悬浮/缩放/水平镜像 → 调用 body。
//   body(ctx, w, h, face) 在局部坐标系里作画，约定：
//       脚在 (0, 0)，头顶在 (0, -h)，身体水平居中于 x=0
//   立绘内部一律用 w / h 的比例表达，因此改尺寸不必改绘制代码。
//   面向左右用 ctx.scale(-1,1) 镜像（body 里只需按「朝右」画一遍）。
//   朝向**只有左右两侧**（2026-09-15 设计者指示）：上下移动保持原本的左右朝向平移，
//   不再有正面 / 背面两套画法 —— 由 systems 维护的实体 `side`（±1）决定。
(function () {
  const HX = window.HX || (window.HX = {});
  const TAU = Math.PI * 2;

  // 地面平面上的圆，在斜俯视投影下的纵向压缩比（俯视角的「扁平程度」）
  function squash() { return HX.C.PLANE_SQUASH === undefined ? 0.55 : HX.C.PLANE_SQUASH; }

  const Sprites = {
    FACE: { LEFT: 'left', RIGHT: 'right' },

    // 朝向（2026-09-15 设计者指示）：**只做左右两侧**。
    // 上下移动时不切换立绘，保持原本的左右朝向平移即可 —— 因此不再有正面/背面两套画法。
    // 左右由 systems 层维护在实体上的 `side` 字段决定（+1 = 朝右，-1 = 朝左，默认朝右）：
    //   systems 只在有**水平**移动分量时更新 side，纯上下移动不动它 → 自然实现"保持原朝向"。
    //   side 属于实体数据（entity），由 systems 写入；本层只读 —— 维持 AGENTS §5 的分层纪律。
    faceOf(o) {
      return (o && o.side < 0) ? this.FACE.LEFT : this.FACE.RIGHT;
    },

    // 落地阴影（画在立绘之前、地面平面上）。wPx/hPx 为阴影椭圆的宽高（px）
    shadow(ctx, x, y, wPx, hPx, alpha) {
      const a = alpha === undefined ? 0.34 : alpha;
      if (a <= 0) return;
      const rx = wPx * 0.5, ry = hPx * 0.5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      g.addColorStop(0, 'rgba(0,0,0,' + a.toFixed(3) + ')');
      g.addColorStop(0.65, 'rgba(0,0,0,' + (a * 0.55).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, ry / Math.max(rx, 1e-6));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, TAU);
      ctx.fill();
      ctx.restore();
    },

    // 立绘通用外壳。
    // opt.lift  = 悬浮高度，**按立绘高度 h 的比例**表达（0 = 贴地，0.14 = 浮起 14% 身高）
    // opt.scale = 整体缩放（狂暴放大用）
    billboard(ctx, x, y, vis, face, opt, body) {
      opt = opt || {};
      const scale = opt.scale === undefined ? 1 : opt.scale;
      const w = vis.w * scale;
      const h = vis.h * scale;

      // 1) 地面阴影
      if (vis.shadowW) {
        this.shadow(ctx, x, y + vis.shadowH * 0.18 * scale,
          vis.shadowW * scale, vis.shadowH * scale, opt.shadowAlpha);
      }

      // 2) 立绘本体
      ctx.save();
      ctx.translate(x, y - (opt.lift || 0) * h);
      if (face === this.FACE.LEFT) ctx.scale(-1, 1);
      body(ctx, w, h, face);
      ctx.restore();
    },

    // ==================== 玩家（GDD v1.19 §7 装配分层：role + cloth + weapon + aura） ====================
    // 底图 = assets/skin/role.png（唯一裸模，256×475）；法袍/武器/光环 = 128×128 部件贴图叠加。
    // 贴图未加载完成（或无头环境）→ 回退旧矢量立绘（playerVector）。
    // 布局（暂定，可调）：裸模按 vis.h 等比缩放、水平居中、底对齐；
    //   光环在**脑后**（最先画，环心与头部同心）、法袍盖住躯干、武器悬浮身前。
    player(ctx, p, skinId, t) {
      const vis = HX.C.VISUAL.player;
      const eq = p.equip || { weapon: skinId, cloth: skinId, aura: skinId };
      const roleImg = HX.partImg ? HX.partImg('role') : null;
      const clothImg = HX.partImg ? HX.partImg(HX.PARTS[eq.cloth].cloth.img) : null;
      const weaponImg = HX.partImg ? HX.partImg(HX.PARTS[eq.weapon].weapon.img) : null;
      const auraImg = HX.partImg ? HX.partImg(HX.PARTS[eq.aura].aura.img) : null;
      const usePng = !!(roleImg && clothImg && weaponImg && auraImg);

      const face = this.faceOf(p);
      const moving = p.vel && Math.hypot(p.vel.x, p.vel.y) > 30;
      const gait = moving ? Math.sin(t * 10) : Math.sin(t * 1.6) * 0.25;
      const sk = HX.PAL.skins[eq.weapon] || HX.PAL.skins[skinId] || HX.PAL.skins.yujian;

      // 剑气拖尾（保留矢量：武器系配色，朝移动反方向）
      if (moving) {
        const sp = Math.hypot(p.vel.x, p.vel.y);
        const dx = p.vel.x / sp, dy = p.vel.y / sp;
        const bw = vis.w;
        ctx.save();
        ctx.strokeStyle = sk.accent;
        ctx.lineCap = 'round';
        for (let i = 1; i <= 3; i++) {
          ctx.globalAlpha = 0.20 - i * 0.05;
          ctx.lineWidth = bw * 0.10 * (1 - i * 0.18);
          ctx.beginPath();
          ctx.moveTo(p.pos.x - dx * bw * 0.45 * i, p.pos.y - dy * bw * 0.45 * i + bw * 0.12);
          ctx.lineTo(p.pos.x - dx * bw * (0.75 + i * 0.42), p.pos.y - dy * bw * (0.75 + i * 0.42) + bw * 0.12);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 落地阴影（贴图分层不走 billboard 的内置阴影，这里手画）
      if (vis.shadowW) {
        this.shadow(ctx, p.pos.x, p.pos.y + vis.shadowH * 0.18,
          vis.shadowW, vis.shadowH, p.invuln > 0 ? 0.20 : 0.36);
      }

      const H = vis.h;
      const bob = 0.03 * Math.abs(gait) * H;           // 步态起伏（沿用原呼吸/步态）
      const top = p.pos.y - H - bob;                   // 立绘顶 y（底 = 脚下锚点）

      if (usePng) {
        ctx.save();
        if (p.invuln > 0) ctx.globalAlpha = (Math.sin(t * 24) > 0 ? 0.55 : 1);  // 无敌闪烁
        const roleW = H * (roleImg.naturalWidth / roleImg.naturalHeight);
        const cx = p.pos.x;
        // 0) 法器光环（**脑后**：最先画，环心与头部同心，中段被头/身体遮住；尺寸 ×2，设计者指示）
        const auraW = roleW * 1.44;
        ctx.drawImage(auraImg, cx - auraW / 2, top + H * 0.10 - auraW / 2, auraW, auraW);
        // 1) 裸模（按高度等比、水平居中、底对齐；朝左时镜像）
        ctx.save();
        ctx.translate(cx, 0);
        if (face === this.FACE.LEFT) ctx.scale(-1, 1);
        ctx.drawImage(roleImg, -roleW / 2, top, roleW, H);
        // 2) 法袍（盖住躯干：宽 ≈ 裸模 ×1.15，上沿在 24% 高度处再上移 10px 后下移 4px，盖住白短衣）
        const clothW = roleW * 1.15;
        ctx.drawImage(clothImg, -clothW / 2, top + H * 0.24 - 6, clothW, clothW);
        // 3) 武器（悬浮身前侧，腰胸高度）
        const wpnW = roleW * 0.72;
        ctx.drawImage(weaponImg, roleW * 0.34, top + H * 0.34, wpnW, wpnW);
        ctx.restore();
        ctx.restore();

        // 受击闪白（覆盖人体矩形，简化）
        if (p.hurtFlash > 0) {
          ctx.save();
          ctx.globalAlpha = Math.min(0.6, p.hurtFlash * 8);
          ctx.fillStyle = '#fff';
          ctx.fillRect(cx - roleW / 2, top + H * 0.22, roleW, H * 0.78);
          ctx.restore();
        }
        if (p.hp < p.maxHp) this.hpBar(ctx, p.pos.x, top - 14, vis.w * 0.9, p.hp / p.maxHp);
        return;
      }

      // ---- 回退：旧矢量立绘（贴图未就绪时） ----
      this.playerVector(ctx, p, skinId, t);
    },

    // 旧矢量立绘（装配贴图未加载时的兜底；不再日常使用）
    playerVector(ctx, p, skinId, t) {
      const vis = HX.C.VISUAL.player;
      const sk = HX.PAL.skins[skinId] || HX.PAL.skins[HX.DEFAULT_SKIN];
      const face = this.faceOf(p);
      const moving = p.vel && Math.hypot(p.vel.x, p.vel.y) > 30;
      const gait = moving ? Math.sin(t * 10) : Math.sin(t * 1.6) * 0.25;

      this.billboard(ctx, p.pos.x, p.pos.y, vis, face, {
        shadowAlpha: p.invuln > 0 ? 0.20 : 0.36,
        lift: 0.03 * Math.abs(gait)
      }, function (c, w, h, f) {
        const side = (f === 'left' || f === 'right');
        const H = h;
        const bodyGrad = c.createLinearGradient(-w * 0.3, -H, w * 0.4, 0);
        bodyGrad.addColorStop(0, sk.robe);
        bodyGrad.addColorStop(1, sk.robeDark);

        // 脚下道韵光环（地面平面）
        c.save();
        c.globalAlpha = 0.30;
        c.strokeStyle = sk.accent;
        c.lineWidth = w * 0.05;
        c.beginPath();
        c.ellipse(0, 0, w * 0.46, w * 0.46 * squash(), 0, 0, TAU);
        c.stroke();
        c.restore();

        // 长袍（钟形；袍摆随步态摆动）
        const sway = gait * w * 0.06;
        c.beginPath();
        c.moveTo(-w * 0.40 + sway, 0);
        c.quadraticCurveTo(-w * 0.34, -H * 0.34, -w * 0.24, -H * 0.55);
        c.lineTo(w * 0.24, -H * 0.55);
        c.quadraticCurveTo(w * 0.34, -H * 0.34, w * 0.40 - sway, 0);
        c.quadraticCurveTo(0, -H * 0.06, -w * 0.40 + sway, 0);
        c.closePath();
        c.fillStyle = bodyGrad;
        c.fill();
        c.strokeStyle = sk.accent;
        c.lineWidth = Math.max(1.5, w * 0.028);
        c.stroke();

        // 腰带
        c.fillStyle = sk.accent;
        c.globalAlpha = 0.9;
        c.fillRect(-w * 0.26, -H * 0.56, w * 0.52, H * 0.028);
        c.globalAlpha = 1;

        // 肩 / 颈
        c.beginPath();
        c.moveTo(-w * 0.22, -H * 0.55);
        c.lineTo(-w * 0.17, -H * 0.72);
        c.lineTo(w * 0.17, -H * 0.72);
        c.lineTo(w * 0.22, -H * 0.55);
        c.closePath();
        c.fillStyle = sk.robe;
        c.fill();

        // 头
        const headR = H * 0.115;
        const headY = -H * 0.83;
        c.beginPath();
        c.arc(0, headY, headR, 0, TAU);
        c.fillStyle = '#f0e2cf';
        c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.22)';
        c.lineWidth = 1.5;
        c.stroke();

        if (side) {
          // 侧面：发髻在后脑 + 一只眼 + 前伸手持剑
          c.beginPath();
          c.arc(-headR * 0.55, headY - headR * 0.5, headR * 0.52, 0, TAU);
          c.fillStyle = sk.robeDark;
          c.fill();
          c.beginPath();
          c.arc(headR * 0.42, headY - headR * 0.05, headR * 0.13, 0, TAU);
          c.fillStyle = '#2a2f3a';
          c.fill();
          c.strokeStyle = sk.robe;
          c.lineWidth = w * 0.11;
          c.lineCap = 'round';
          c.beginPath();
          c.moveTo(w * 0.14, -H * 0.68);
          c.lineTo(w * 0.38, -H * 0.63);
          c.stroke();
          drawSword(c, w * 0.34, -H * 0.62, w * 0.62, -H * 0.80, sk);
        } else if (f === 'front') {
          c.fillStyle = '#2a2f3a';
          c.beginPath(); c.arc(-headR * 0.36, headY, headR * 0.14, 0, TAU); c.fill();
          c.beginPath(); c.arc(headR * 0.36, headY, headR * 0.14, 0, TAU); c.fill();
          c.beginPath();
          c.arc(0, headY - headR * 0.42, headR * 0.62, 0, TAU);
          c.fillStyle = sk.robeDark;
          c.fill();
          drawSword(c, w * 0.34, -H * 0.50, w * 0.34, -H * 1.02, sk);
        } else {
          c.beginPath();
          c.arc(0, headY - headR * 0.15, headR * 0.72, 0, TAU);
          c.fillStyle = sk.robeDark;
          c.fill();
          drawSword(c, w * 0.34, -H * 0.50, w * 0.34, -H * 1.02, sk);
        }

        // 受击闪白
        if (p.hurtFlash > 0) {
          c.globalAlpha = Math.min(0.72, p.hurtFlash * 8);
          c.fillStyle = '#fff';
          c.beginPath();
          c.moveTo(-w * 0.40, 0);
          c.quadraticCurveTo(-w * 0.30, -H * 0.55, -w * 0.18, -H * 0.75);
          c.lineTo(w * 0.18, -H * 0.75);
          c.quadraticCurveTo(w * 0.30, -H * 0.55, w * 0.40, 0);
          c.closePath();
          c.fill();
          c.globalAlpha = 1;
        }
      });
    },

    // ==================== 血魔蛛（侧视，GDD §11.1） ====================
    spider(ctx, e, t) {
      const P = HX.PAL.enemy;
      const vis = HX.C.VISUAL.spider;
      const face = this.faceOf(e);
      const tele = e.telegraphing ? Math.max(0, Math.min(1, e.telegraph / (e.attack.telegraph || 0.5))) : 0;
      const blink = tele > 0 ? (0.5 + 0.5 * Math.sin(t * 30)) * tele : 0;
      const moving = Math.hypot(e.vel.x, e.vel.y) > 30;
      const gait = Math.sin(t * 12);

      this.billboard(ctx, e.pos.x, e.pos.y, vis, face, { shadowAlpha: 0.3 }, function (c, w, h) {
        const body = blink > 0.4 ? P.spiderTelegraph : P.spider;

        // 8 条腿：侧面看到 4 条前 + 4 条后，折线两段
        c.strokeStyle = blink > 0.4 ? P.spiderTelegraph : P.spiderDark;
        c.lineWidth = Math.max(2, w * 0.075);
        c.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          const ph = (i % 2 === 0 ? gait : -gait) * 0.22;
          const bx = (-0.28 + i * 0.19) * w;
          for (let s = 0; s < 2; s++) {
            const dir = s === 0 ? 1 : -1;           // 前后两侧
            const kx = bx + dir * (0.30 + ph) * w * 0.5;
            const ky = -h * 0.35 + (0.1 - i * 0.05) * h + dir * h * 0.10;
            c.beginPath();
            c.moveTo(bx, -h * 0.42);
            c.lineTo(kx, ky);
            c.lineTo(kx + dir * w * 0.28, 0);
            c.stroke();
          }
        }

        // 腹部（后）+ 头胸（前）
        c.beginPath();
        c.ellipse(-w * 0.14, -h * 0.52, w * 0.30, h * 0.34, 0, 0, TAU);
        c.fillStyle = P.spiderDark;
        c.fill();
        c.beginPath();
        c.ellipse(w * 0.22, -h * 0.46, w * 0.19, h * 0.24, 0, 0, TAU);
        c.fillStyle = body;
        c.fill();
        // 前螯 + 眼
        c.strokeStyle = P.spiderDark;
        c.lineWidth = Math.max(2, w * 0.06);
        for (let s = -1; s <= 1; s += 2) {
          c.beginPath();
          c.moveTo(w * 0.36, -h * 0.46 + s * h * 0.06);
          c.lineTo(w * 0.52, -h * 0.34 + s * h * 0.12);
          c.stroke();
        }
        c.fillStyle = blink > 0.4 ? '#ffffff' : '#ff5a5a';
        c.beginPath(); c.arc(w * 0.31, -h * 0.56, w * 0.045, 0, TAU); c.fill();
        c.beginPath(); c.arc(w * 0.35, -h * 0.48, w * 0.038, 0, TAU); c.fill();
      });

      if (e.hp < e.maxHp) this.hpBar(ctx, e.pos.x, e.pos.y - vis.h - 10, vis.w * 0.9, e.hp / e.maxHp);
      this.statusOverlay(ctx, e.pos.x, e.pos.y, vis, e, t);
    },

    // ==================== 邪修术士（侧视漂浮，GDD §11.2） ====================
    wizard(ctx, e, t) {
      const P = HX.PAL.enemy;
      const vis = HX.C.VISUAL.wizard;
      const face = this.faceOf(e);
      const bob = Math.sin(t * 2.1 + e.pos.x * 0.003) * 0.06;

      this.billboard(ctx, e.pos.x, e.pos.y, vis, face, {
        lift: 0.143 + bob,                    // 漂浮离地（按身高比例）
        shadowAlpha: 0.24                     // 离地越高阴影越淡
      }, function (c, w, h, f) {
        // 残破法幡（身后）
        c.strokeStyle = '#5b4a3a';
        c.lineWidth = Math.max(2, w * 0.07);
        c.beginPath();
        c.moveTo(-w * 0.30, 0);
        c.lineTo(-w * 0.42, -h * 1.05);
        c.stroke();
        c.beginPath();
        c.moveTo(-w * 0.42, -h * 1.05);
        c.lineTo(-w * 0.78, -h * 0.92);
        c.lineTo(-w * 0.52, -h * 0.72);
        c.lineTo(-w * 0.72, -h * 0.56);
        c.lineTo(-w * 0.40, -h * 0.62);
        c.closePath();
        c.fillStyle = 'rgba(60,30,80,0.94)';
        c.fill();
        c.strokeStyle = P.wizardAccent;
        c.lineWidth = 1.6;
        c.stroke();

        // 长袍（钟形，底边参差如破布）
        const g = c.createLinearGradient(0, -h, 0, 0);
        g.addColorStop(0, P.wizard);
        g.addColorStop(1, P.wizardDark);
        c.beginPath();
        c.moveTo(-w * 0.38, 0);
        c.lineTo(-w * 0.30, -h * 0.14);
        c.lineTo(-w * 0.38, -h * 0.24);
        c.lineTo(-w * 0.24, -h * 0.34);
        c.lineTo(-w * 0.22, -h * 0.62);
        c.lineTo(w * 0.22, -h * 0.62);
        c.lineTo(w * 0.24, -h * 0.34);
        c.lineTo(w * 0.38, -h * 0.24);
        c.lineTo(w * 0.30, -h * 0.14);
        c.lineTo(w * 0.38, 0);
        c.closePath();
        c.fillStyle = g;
        c.fill();
        c.strokeStyle = 'rgba(176,107,255,0.5)';
        c.lineWidth = 1.6;
        c.stroke();

        // 兜帽（尖顶）
        const hoodR = h * 0.15;
        const hoodY = -h * 0.74;
        c.beginPath();
        c.moveTo(-hoodR * 1.05, hoodY + hoodR * 0.5);
        c.quadraticCurveTo(-hoodR * 0.6, hoodY - hoodR * 1.5, hoodR * 0.15, hoodY - hoodR * 1.35);
        c.quadraticCurveTo(hoodR * 0.9, hoodY - hoodR * 0.8, hoodR * 0.95, hoodY + hoodR * 0.5);
        c.closePath();
        c.fillStyle = P.wizardDark;
        c.fill();
        // 兜帽暗处 + 紫光双眼
        c.fillStyle = 'rgba(0,0,0,0.85)';
        c.beginPath();
        c.ellipse(hoodR * 0.2, hoodY + hoodR * 0.15, hoodR * 0.55, hoodR * 0.42, 0, 0, TAU);
        c.fill();
        c.fillStyle = P.wizardAccent;
        if (f === 'front' || f === 'back') {
          c.beginPath(); c.arc(hoodR * 0.05, hoodY + hoodR * 0.12, hoodR * 0.13, 0, TAU); c.fill();
          if (f === 'front') { c.beginPath(); c.arc(hoodR * 0.42, hoodY + hoodR * 0.12, hoodR * 0.13, 0, TAU); c.fill(); }
        } else {
          c.beginPath(); c.arc(hoodR * 0.42, hoodY + hoodR * 0.14, hoodR * 0.15, 0, TAU); c.fill();
        }
        // 袍内幽光
        c.globalAlpha = 0.5 + 0.3 * Math.sin(t * 3.2);
        c.fillStyle = P.wizardAccent;
        c.beginPath(); c.arc(0, -h * 0.45, w * 0.07, 0, TAU); c.fill();
        c.globalAlpha = 1;
      });

      if (e.hp < e.maxHp) this.hpBar(ctx, e.pos.x, e.pos.y - vis.h - 14, vis.w * 0.9, e.hp / e.maxHp);
      this.statusOverlay(ctx, e.pos.x, e.pos.y, vis, e, t);
    },

    // ==================== 吞天老祖（侧视巨型，GDD §13） ====================
    boss(ctx, b, t) {
      const P = HX.PAL.boss;
      const vis = HX.C.VISUAL.boss;
      const rage = b.phase === HX.BOSS.PHASE.ENRAGE;
      const face = this.faceOf(b);
      const bob = Math.sin(t * 1.4) * 0.05;

      this.billboard(ctx, b.pos.x, b.pos.y, vis, face, {
        scale: b.scale || 1,
        lift: 0.05 + bob,
        shadowAlpha: 0.42
      }, function (c, w, h, f) {
        const body = rage ? P.enrage : P.body;
        const dark = rage ? P.enrageDark : P.bodyDark;
        const glowCol = rage ? 'rgba(255,90,90,0.85)' : 'rgba(176,75,255,0.72)';

        // 背后残破法轮：斜俯视下画成竖立的窄椭圆 + 缺口 + 辐条
        c.save();
        c.translate(-w * 0.42, -h * 0.62);
        c.scale(0.30, 1);
        c.rotate(t * (rage ? 0.9 : 0.22));
        c.strokeStyle = glowCol;
        c.lineWidth = Math.max(4, w * 0.10);
        for (let i = 0; i < 5; i++) {
          const a0 = (i / 5) * TAU, a1 = a0 + TAU / 5 * 0.6;
          c.beginPath(); c.arc(0, 0, h * 0.42, a0, a1); c.stroke();
        }
        c.lineWidth = Math.max(3, w * 0.05);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          c.beginPath();
          c.moveTo(Math.cos(a) * h * 0.16, Math.sin(a) * h * 0.16);
          c.lineTo(Math.cos(a) * h * 0.38, Math.sin(a) * h * 0.38);
          c.stroke();
        }
        c.restore();

        // 躯干（侧视：略微前倾的梯形）
        const g = c.createLinearGradient(0, -h, 0, 0);
        g.addColorStop(0, body);
        g.addColorStop(1, dark);
        c.beginPath();
        c.moveTo(-w * 0.26, 0);
        c.quadraticCurveTo(-w * 0.36, -h * 0.35, -w * 0.24, -h * 0.66);
        c.lineTo(w * 0.20, -h * 0.66);
        c.quadraticCurveTo(w * 0.34, -h * 0.35, w * 0.30, 0);
        c.closePath();
        c.fillStyle = g;
        c.fill();

        // 前伸双臂（朝朝向）
        c.strokeStyle = rage ? '#ff7b7b' : P.accent;
        c.lineWidth = Math.max(5, w * 0.055);
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(w * 0.16, -h * 0.58);
        c.quadraticCurveTo(w * 0.46, -h * 0.52, w * 0.52, -h * 0.30);
        c.stroke();
        c.beginPath();
        c.moveTo(-w * 0.04, -h * 0.56);
        c.quadraticCurveTo(w * 0.20, -h * 0.46, w * 0.24, -h * 0.26);
        c.stroke();

        // 头 + 眼
        const headR = h * 0.085;
        const headY = -h * 0.75;
        c.beginPath();
        c.arc(0, headY, headR, 0, TAU);
        c.fillStyle = dark;
        c.fill();
        c.fillStyle = rage ? '#ffdede' : '#e7c8ff';
        if (f === 'left' || f === 'right') {
          c.beginPath(); c.arc(headR * 0.45, headY, headR * 0.2, 0, TAU); c.fill();
        } else {
          c.beginPath(); c.arc(-headR * 0.35, headY, headR * 0.2, 0, TAU); c.fill();
          if (f === 'front') { c.beginPath(); c.arc(headR * 0.35, headY, headR * 0.2, 0, TAU); c.fill(); }
        }
        // 头冠 / 残角
        c.strokeStyle = rage ? '#ff9b9b' : P.accent;
        c.lineWidth = Math.max(3, w * 0.03);
        for (let s = -1; s <= 1; s += 2) {
          c.beginPath();
          c.moveTo(s * headR * 0.5, headY - headR * 0.7);
          c.quadraticCurveTo(s * headR * 1.5, headY - headR * 1.9, s * headR * 0.7, headY - headR * 2.4);
          c.stroke();
        }

        // 狂暴红光脉冲 / 无敌苍白描边
        if (rage) {
          c.globalAlpha = 0.20 + 0.16 * Math.sin(t * 12);
          c.fillStyle = P.enrage;
          c.beginPath();
          c.ellipse(0, -h * 0.4, w * 0.45, h * 0.55, 0, 0, TAU);
          c.fill();
          c.globalAlpha = 1;
        }
        if (b.invuln) {
          c.globalAlpha = 0.45 + 0.3 * Math.sin(t * 10);
          c.strokeStyle = '#fff';
          c.lineWidth = Math.max(3, w * 0.018);
          c.beginPath();
          c.ellipse(0, -h * 0.4, w * 0.44, h * 0.55, 0, 0, TAU);
          c.stroke();
          c.globalAlpha = 1;
        }
        if (b.hitFlash > 0) {
          c.globalAlpha = Math.min(0.6, b.hitFlash * 6);
          c.fillStyle = '#fff';
          c.beginPath();
          c.moveTo(-w * 0.26, 0);
          c.lineTo(-w * 0.24, -h * 0.66);
          c.lineTo(w * 0.20, -h * 0.66);
          c.lineTo(w * 0.30, 0);
          c.closePath();
          c.fill();
          c.globalAlpha = 1;
        }
      });
    },

    // ==================== 石柱（侧视立柱，GDD §13.3） ====================
    // 升起（2026-09-16 设计者指示）：石柱开局不存在，BOSS 65% 血召唤时**单轴缩放**升起 ——
    //   p.emerge ∈ [0,1]（0 = 完全在地下）：竖直方向 scale 0→1、底边锚定（宽度不变），
    //   时长 2s 与 BOSS 召唤施法同步；阴影随升起进度淡入；升起完成前无碰撞。
    pillar(ctx, p, t) {
      const P = HX.PAL.pillar;
      const vis = HX.C.VISUAL.pillar;
      const face = this.FACE.RIGHT;   // 石柱无朝向，固定一侧（避免镜像导致符文错位）
      const k = p.emerge === undefined ? 1 : Math.max(0, Math.min(1, p.emerge));
      if (k <= 0) return;             // 完全在地下：不绘制

      ctx.save();
      // 裁剪到"地面以上"区域（锚点下方留 40px 余量给基座底边）
      ctx.beginPath();
      ctx.rect(p.pos.x - vis.w * 1.2, p.pos.y - vis.h * 1.4, vis.w * 2.4, vis.h * 1.4 + 40);
      ctx.clip();
      // 落地阴影：随升起进度淡入（不参与缩放，铺在地面锚定位置）
      if (k > 0) {
        this.shadow(ctx, p.pos.x, p.pos.y + vis.shadowH * 0.18,
          vis.shadowW, vis.shadowH, (p.lit ? 0.42 : 0.34) * k);
      }
      // 单轴缩放：以脚下锚点为不动点，竖直方向 0→1（宽度不变）
      ctx.translate(p.pos.x, p.pos.y);
      ctx.scale(1, k);
      ctx.translate(-p.pos.x, -p.pos.y);

      this.billboard(ctx, p.pos.x, p.pos.y, vis, face, {
        shadowAlpha: 0                                 // 阴影不参与缩放，随 k 淡入另画（见下）
      }, function (c, w, h) {
        // 基座
        c.beginPath();
        c.moveTo(-w * 0.5, 0);
        c.lineTo(-w * 0.38, -h * 0.10);
        c.lineTo(w * 0.38, -h * 0.10);
        c.lineTo(w * 0.5, 0);
        c.closePath();
        c.fillStyle = p.lit ? '#5b4636' : P.darkEdge;
        c.fill();

        // 柱身（下宽上窄）
        const g = c.createLinearGradient(-w * 0.3, 0, w * 0.3, 0);
        g.addColorStop(0, P.darkEdge);
        g.addColorStop(0.42, p.lit ? '#8a6a4a' : P.dark);
        g.addColorStop(1, P.darkEdge);
        c.beginPath();
        c.moveTo(-w * 0.34, -h * 0.10);
        c.lineTo(-w * 0.24, -h * 0.88);
        c.lineTo(w * 0.24, -h * 0.88);
        c.lineTo(w * 0.34, -h * 0.10);
        c.closePath();
        c.fillStyle = g;
        c.fill();
        c.strokeStyle = p.lit ? P.litEdge : P.darkEdge;
        c.lineWidth = Math.max(2, w * 0.035);
        c.stroke();

        // 顶盖（厚板）
        c.beginPath();
        c.moveTo(-w * 0.30, -h * 0.88);
        c.lineTo(-w * 0.38, -h * 0.98);
        c.lineTo(w * 0.38, -h * 0.98);
        c.lineTo(w * 0.30, -h * 0.88);
        c.closePath();
        c.fillStyle = p.lit ? '#a8794f' : P.dark;
        c.fill();
        c.stroke();

        // 符文横线（暗态也可见，点亮后发光）
        c.globalAlpha = p.lit ? 0.95 : 0.32;
        c.strokeStyle = p.lit ? P.lit : '#7d8aa8';
        c.lineWidth = Math.max(1.5, w * 0.028);
        for (let i = 0; i < 3; i++) {
          const yy = -h * (0.34 + i * 0.19);
          c.beginPath();
          c.moveTo(-w * 0.13, yy);
          c.lineTo(w * 0.13, yy);
          c.stroke();
        }
        c.globalAlpha = 1;

        // 点燃：顶端火焰（向上窜）+ 光晕
        if (p.lit) {
          const age = p.litAt ? Math.min(1, 0.5 + (t - p.litAt) * 2.5) : 1;
          const fg = c.createRadialGradient(0, -h * 0.98, 0, 0, -h * 0.98, w * 0.85);
          fg.addColorStop(0, 'rgba(255,210,140,0.85)');
          fg.addColorStop(1, 'rgba(255,120,40,0)');
          c.fillStyle = fg;
          c.globalAlpha = 0.9 * age;
          c.beginPath();
          c.arc(0, -h * 0.98, w * 0.85, 0, TAU);
          c.fill();
          c.globalAlpha = 1;
          for (let i = 0; i < 5; i++) {
            const a = t * 4.5 + i * 1.7;
            const fh = (0.22 + 0.16 * (0.5 + 0.5 * Math.sin(a * 1.6))) * h * age;
            c.globalAlpha = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(a * 2.3));
            c.fillStyle = i % 2 ? P.lit : P.litEdge;
            c.beginPath();
            c.ellipse(Math.sin(a) * w * 0.13, -h * 0.98 - fh * 0.5, w * 0.075, fh * 0.5, 0, 0, TAU);
            c.fill();
          }
          c.globalAlpha = 1;
          // 上升火星
          c.fillStyle = '#fff2d0';
          for (let i = 0; i < 4; i++) {
            const a = t * 2.2 + i * 2.1;
            const fy = -h * 1.05 - (((t * 60 + i * 47) % 90) / 90) * h * 0.5;
            c.globalAlpha = 0.85 - (((t * 60 + i * 47) % 90) / 90) * 0.7;
            c.fillRect(Math.sin(a) * w * 0.22, fy, 3, 3);
          }
          c.globalAlpha = 1;
        }
        if (p.hitFlash > 0) {
          c.globalAlpha = Math.min(0.7, p.hitFlash * 6);
          c.fillStyle = '#fff';
          c.fillRect(-w * 0.34, -h * 0.98, w * 0.68, h * 0.98);
          c.globalAlpha = 1;
        }
      });
      ctx.restore();
    },

    // ==================== 护身灵石（侧视悬浮，GDD §9） ====================
    pickup(ctx, p, t) {
      const P = HX.PAL.pickup;
      const vis = HX.C.VISUAL.pickup;
      const bob = Math.sin(t * (p.bobSpeed || 3) + (p.phase || 0));
      const face = this.FACE.RIGHT;

      this.billboard(ctx, p.pos.x, p.pos.y, vis, face, {
        lift: 0.26 + bob * (p.bobAmp || 0.05),
        shadowAlpha: 0.20
      }, function (c, w, h) {
        // 地面环绕虚线圈（俯视圆的斜投影）
        c.save();
        c.strokeStyle = P.ring;
        c.lineWidth = Math.max(2, w * 0.06);
        c.globalAlpha = 0.75;
        c.setLineDash([w * 0.16, w * 0.12]);
        c.lineDashOffset = t * 26;
        c.beginPath();
        c.ellipse(0, 0, w * 0.72, w * 0.72 * squash(), 0, 0, TAU);
        c.stroke();
        c.restore();

        // 悬浮菱形灵石
        const g = c.createLinearGradient(0, -h, 0, 0);
        g.addColorStop(0, P.core);
        g.addColorStop(1, P.ring);
        c.save();
        c.translate(0, -h * 0.5);
        c.rotate(Math.sin(t * 1.5 + (p.phase || 0)) * 0.22);
        c.beginPath();
        c.moveTo(0, -h * 0.42);
        c.lineTo(w * 0.30, 0);
        c.lineTo(0, h * 0.42);
        c.lineTo(-w * 0.30, 0);
        c.closePath();
        c.fillStyle = g;
        c.fill();
        c.strokeStyle = '#ffffff';
        c.lineWidth = Math.max(1.4, w * 0.05);
        c.stroke();
        c.restore();

        // 灵光
        const fg = c.createRadialGradient(0, -h * 0.5, 0, 0, -h * 0.5, w * 0.75);
        fg.addColorStop(0, P.glow);
        fg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = fg;
        c.beginPath();
        c.arc(0, -h * 0.5, w * 0.75, 0, TAU);
        c.fill();
      });
    },

    // ==================== 护身技视觉（GDD §7 / §9） ====================
    // 判据：技能与角色的**空间关系**发生在地面平面上（环绕、范围圈），
    //       所以这部分用平面 + 斜投影椭圆；而剑本身是竖直物体 → 从平面位置向上画一小段立绘。
    guard(ctx, player, skinId, t) {
      if (!player.guardTimer) return;
      const x = player.pos.x, y = player.pos.y;
      const skin = HX.SKINS[skinId] || HX.SKINS[HX.DEFAULT_SKIN];
      const gd = skin.guard;
      const sq = squash();

      if (skinId === 'yujian') {
        // 3 把飞剑沿地面圆环绕行（椭圆 = 俯视圆的斜投影），每把剑竖直向上画。
        // ⚠ 角度用**逻辑层维护的 player.guardAngle**（systems/skill.js guardOrbit 每步推进）
        //   —— 之前误写成 player.guardOrbit（那是系统方法名，取到 undefined），
        //   cos(NaN) 导致三把剑根本画不出来（2026-09-16 玩家实测 BUG）。
        const orb = gd.orbitR || 65;
        const n = gd.count || 3;
        const ang = player.guardAngle || 0;
        for (let i = 0; i < n; i++) {
          const a = ang + (i / n) * TAU;
          const sx = x + Math.cos(a) * orb;
          const sy = y + Math.sin(a) * orb * sq;
          const bladeH = player.visualR * 1.5;
          ctx.save();
          ctx.globalAlpha = 0.95;
          drawSword(ctx, sx, sy, sx, sy - bladeH, HX.PAL.skins.yujian);
          ctx.restore();
        }
      } else if (skinId === 'jiuxiao') {
        // 雷池：地面平面上的范围圈（椭圆）+ 电弧
        const r = gd.radius || 512;
        ctx.save();
        ctx.globalAlpha = 0.20 + 0.07 * Math.sin(t * 4);
        ctx.fillStyle = HX.PAL.skins.jiuxiao.accent;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * sq, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = HX.PAL.skins.jiuxiao.accent;
        ctx.lineWidth = 3;
        ctx.setLineDash([16, 12]);
        ctx.lineDashOffset = -t * 50;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * sq, 0, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 9; i++) {
          const a0 = (i / 9) * TAU + t * 0.9;
          const r0 = r * 0.72, r1 = r * 0.98;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a0) * r0, y + Math.sin(a0) * r0 * sq);
          ctx.lineTo(x + Math.cos(a0 + 0.45) * r1, y + Math.sin(a0 + 0.45) * r1 * sq);
          ctx.lineTo(x + Math.cos(a0 + 0.12) * r1, y + Math.sin(a0 + 0.12) * r1 * sq);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        // 南明：脚下离火环（火痕本身由 world.fires 逐个绘制）
        const rr = player.visualR * 1.9;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, 'rgba(255,140,60,0.42)');
        g.addColorStop(1, 'rgba(255,140,60,0)');
        ctx.save();
        ctx.globalAlpha = 0.55 + 0.18 * Math.sin(t * 6);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, rr, rr * sq, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    },

    // ==================== 共用小件 ====================
    hpBar(ctx, x, y, w, ratio) {
      const h = 6;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - w / 2, y, w, h);
      ctx.fillStyle = '#e2483f';
      ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, ratio)), h);
      ctx.restore();
    },

    // 受击闪白 / 雷池麻痹：套在立绘位置上的状态指示
    statusOverlay(ctx, x, y, vis, e, t) {
      const w = vis.w, h = vis.h;
      if (e.paraTimer > 0) {
        ctx.save();
        ctx.strokeStyle = HX.PAL.skins.jiuxiao.accent;
        ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          const a = t * 12 + i * 2.1;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * w * 0.9, y - h * 0.5 + Math.sin(a) * h * 0.6);
          ctx.lineTo(x + Math.cos(a + 1.2) * w * 0.3, y - h * 0.5 + Math.sin(a + 1.2) * h * 0.3);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (e.hitFlash > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.7, e.hitFlash * 8);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(x, y - h * 0.45, w * 0.5, h * 0.5, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  };

  // 一把立绘用的剑：从 (x0,y0)（柄底）指向 (x1,y1)（剑尖），含十字护手与光晕。
  // 形状（2026-09-16）：**逐点采用设计者提供 path1.svg 的路径数据**（不做取整/对称化）——
  //   原路径（相对坐标起点 m 86.529562,71.514138，减去 svg 原点 83.261414,50.136251 后）：
  //     尖 (13.213767,0) → (22.101056,21.377887) → (17.265576,77.367609) → (25.664036,77.367609)
  //     → (23.119046,85.002559) → (17.265576,85.002559) → (17.265576,101.290479) → (8.621622,101.290479)
  //     → (8.621622,85.002559) → (2.015824,85.002559) → (0,77.367609) → (8.612622,77.367609) → 闭合
  //   归一化：t = y/101.290479（轴向，t=0 为剑尖）、o = (x−12.832018)/101.290479（横向半宽）。
  //   注意原路径**左右并不对称**（刃根右 0.04376793 / 左 −0.04155811），按原值保留。
  // 颜色沿用皮肤配色：sk.bullet 剑身 / sk.accent 护手描边与光晕（不引入新色）。
  // 绘制顺序 = SVG 路径点序；t=0 对应调用方 (x1,y1)（剑尖），t=1 对应 (x0,y0)（柄底）。
  function drawSword(ctx, x0, y0, x1, y1, sk) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.max(1e-6, Math.hypot(dx, dy));
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    const P = (t, o) => [x1 - ux * len * t + nx * o * len, y1 - uy * len * t + ny * o * len];
    const SVG_PTS = [
      [0.21104824, -0.09441022],   // path 起点 (3.268148, 21.377887)
      [0,           0.00376864],   // 剑尖 (13.213767, 0)
      [0.21104824,  0.09150524],   // (22.101056, 21.377887) 右肩
      [0.76383477,  0.04376793],   // (17.265576, 77.367609) 右刃根
      [0.76383477,  0.12668383],   // (25.664036, 77.367609) 右护手端
      [0.83919152,  0.10155952],   // (23.119046, 85.002559) 护手根右
      [0.83919152,  0.04376793],   // (17.265576, 85.002559) 握柄右上
      [1,           0.04376793],   // (17.265576, 101.290479) 柄底右
      [1,          -0.04155811],   // (8.621622, 101.290479) 柄底左
      [0.83919152, -0.04155811],   // (8.621622, 85.002559) 握柄左上
      [0.83919152, -0.10677154],   // (2.015824, 85.002559) 护手根左
      [0.76383477, -0.12668383],   // (0, 77.367609) 左护手端
      [0.76383477, -0.04155811]    // (8.612622, 77.367609) 左刃根（闭合回起点）
    ];

    ctx.save();
    // 剑气光晕
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = sk.accent;
    ctx.lineWidth = len * 0.11;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();

    // 剑体（刃 + 十字护手 + 握柄，一个剪影多边形，点序 = path1.svg 原始点序）。
    // ⚠ 只做填充、不加描边 —— 剪影必须严格等于 path 轮廓（描边会把形状撑大 ~8px，
    //   像素比对探针实测多出 346 个轮廓外采样点）。
    ctx.globalAlpha = 1;
    ctx.beginPath();
    const s0 = P(SVG_PTS[0][0], SVG_PTS[0][1]);
    ctx.moveTo(s0[0], s0[1]);
    for (let i = 1; i < SVG_PTS.length; i++) {
      const q = P(SVG_PTS[i][0], SVG_PTS[i][1]);
      ctx.lineTo(q[0], q[1]);
    }
    ctx.closePath();
    ctx.fillStyle = sk.bullet;
    ctx.fill();
    ctx.restore();
  }

  HX.Sprites = Sprites;
  HX.Sprites.drawSword = drawSword;
})();
