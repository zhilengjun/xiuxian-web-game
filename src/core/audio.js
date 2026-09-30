// 程序化音效（资源代码化）：全部音色由 WebAudio 现场合成，**零音频文件**。
// 对应 GDD 附录 B-4「音效（占位）」：普攻 / 护身 / 大招 / 受击 / 石柱点燃 / 狂暴 / 胜负。
// 设计：音效 = 数据配方（recipes），引擎只负责把配方渲染成振荡器/噪声。
//       后续要改音色，只改 recipes 数据，不动引擎。
// 注意：浏览器自动播放策略——必须在首次用户手势里 init()/resume()；未就绪时 play() 静默返回。
(function () {
  const HX = window.HX || (window.HX = {});

  const Audio2 = {
    enabled: true,
    ready: false,
    ctx: null,
    master: null,
    volume: 0.45,
    _noiseBuf: null,

    init() {
      if (this.ready || !this.enabled) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      try { this.ctx = new AC(); } catch (e) { this.enabled = false; return; }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.ready = true;
    },

    resume() {
      if (this.ctx && this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume();
    },

    setEnabled(on) {
      this.enabled = !!on;
      if (this.master) this.master.gain.value = this.enabled ? this.volume : 0;
    },

    // 缓存的 1 秒白噪声缓冲（爆炸/雷/风声基底）
    _noise() {
      if (this._noiseBuf) return this._noiseBuf;
      const sr = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, sr, sr);
      const d = buf.getChannelData(0);
      // 这里允许用确定性伪随机（非游戏逻辑随机，仅音频纹理）
      let s = 991;
      for (let i = 0; i < d.length; i++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        d[i] = (s / 0x3fffffff) - 1;
      }
      this._noiseBuf = buf;
      return buf;
    },

    // 单音配方：{ f0, f1, dur, wave, vol, attack, delay }
    tone(o) {
      if (!this.ready || !this.enabled) return;
      const ctx = this.ctx;
      const t0 = ctx.currentTime + (o.delay || 0);
      const dur = o.dur || 0.16;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = o.wave || 'triangle';
      osc.frequency.setValueAtTime(Math.max(1, o.f0), t0);
      if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + dur);
      const vol = Math.max(0.0002, o.vol === undefined ? 0.22 : o.vol);
      const atk = Math.max(0.002, o.attack === undefined ? 0.006 : o.attack);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(this.master);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    },

    // 噪声配方：{ dur, vol, f0, f1, q, type, delay }
    noise(o) {
      if (!this.ready || !this.enabled) return;
      const ctx = this.ctx;
      const t0 = ctx.currentTime + (o.delay || 0);
      const dur = o.dur || 0.3;
      const src = ctx.createBufferSource();
      src.buffer = this._noise();
      const flt = ctx.createBiquadFilter();
      flt.type = o.type || 'lowpass';
      flt.frequency.setValueAtTime(Math.max(40, o.f0 || 1200), t0);
      if (o.f1 && o.f1 !== o.f0) flt.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1), t0 + dur);
      flt.Q.value = o.q === undefined ? 1 : o.q;
      const g = ctx.createGain();
      const vol = Math.max(0.0002, o.vol === undefined ? 0.18 : o.vol);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(flt); flt.connect(g); g.connect(this.master);
      src.start(t0); src.stop(t0 + dur + 0.02);
    },

    // 复合配方：{ parts: [ {kind:'tone'|'noise', ...} ] }
    play(name, overrides) {
      if (!this.ready || !this.enabled) return;
      const r = this.recipes[name];
      if (!r) return;
      const parts = r.parts || [r];
      for (let i = 0; i < parts.length; i++) {
        const p = overrides ? Object.assign({}, parts[i], overrides) : parts[i];
        if ((p.kind || 'tone') === 'noise') this.noise(p); else this.tone(p);
      }
    },

    // ==== 音效配方表（资源即代码，GDD 附录 B-4「音效（占位）」全表） ====
    // 命名分三类：ui* 界面 ｜ 战斗 ｜ 事件（石柱/狂暴/胜负）
    // 想调音色只改这里的数据，不动引擎。
    recipes: {
      // ---------- 界面 ----------
      uiMove:    { kind: 'tone', wave: 'square',   f0: 620, f1: 660, dur: 0.05, vol: 0.09 },
      uiConfirm: { parts: [
        { kind: 'tone', wave: 'triangle', f0: 520, f1: 700,  dur: 0.10, vol: 0.16 },
        { kind: 'tone', wave: 'sine',     f0: 780, f1: 1040, dur: 0.16, vol: 0.10, delay: 0.07 }
      ] },
      uiBack:    { kind: 'tone', wave: 'triangle', f0: 420, f1: 260, dur: 0.13, vol: 0.13 },
      start:     { parts: [
        { kind: 'tone',  wave: 'sine',   f0: 180, f1: 520, dur: 0.45, vol: 0.16, attack: 0.05 },
        { kind: 'noise', f0: 300, f1: 2600, dur: 0.35, vol: 0.07, type: 'bandpass', q: 0.8 }
      ] },

      // ---------- 普攻（三套皮肤各一种音色，GDD §7 / 附录 B-4） ----------
      sword:  { parts: [                                   // 御剑：剑气破空
        { kind: 'tone',  wave: 'sawtooth', f0: 1500, f1: 3200, dur: 0.11, vol: 0.10 },
        { kind: 'noise', f0: 2600, f1: 6200, dur: 0.10, vol: 0.07, type: 'bandpass', q: 1.4 }
      ] },
      fire:   { parts: [                                   // 离火：火球出膛
        { kind: 'noise', f0: 320, f1: 1500, dur: 0.20, vol: 0.13, type: 'lowpass' },
        { kind: 'tone',  wave: 'triangle', f0: 240, f1: 130, dur: 0.16, vol: 0.10 }
      ] },
      thunder:{ parts: [                                   // 雷链：电花
        { kind: 'noise', f0: 5200, f1: 1400, dur: 0.13, vol: 0.10, type: 'highpass' },
        { kind: 'tone',  wave: 'square', f0: 1900, f1: 700, dur: 0.10, vol: 0.07 }
      ] },

      // ---------- 命中 / 死亡 / 受击 ----------
      hit:      { kind: 'tone', wave: 'square', f0: 900, f1: 500, dur: 0.05, vol: 0.07 },
      enemyDie: { parts: [
        { kind: 'tone',  wave: 'sawtooth', f0: 420, f1: 110, dur: 0.26, vol: 0.13 },
        { kind: 'noise', f0: 1600, f1: 260, dur: 0.24, vol: 0.10, type: 'lowpass' }
      ] },
      playerHit:{ parts: [                                 // 自己挨打：低频闷响，比命中明显
        { kind: 'tone',  wave: 'sine',  f0: 200, f1: 70, dur: 0.30, vol: 0.22 },
        { kind: 'noise', f0: 900, f1: 180, dur: 0.20, vol: 0.14, type: 'lowpass' }
      ] },
      dash:     { kind: 'noise', f0: 500, f1: 2800, dur: 0.16, vol: 0.10, type: 'bandpass', q: 0.9 },

      // ---------- 护身技（GDD §9：拾取灵石 → 触发） ----------
      guard: { parts: [                                    // 灵石入体：上行清音
        { kind: 'tone', wave: 'sine',     f0: 660, f1: 1320, dur: 0.28, vol: 0.14 },
        { kind: 'tone', wave: 'triangle', f0: 990, f1: 1980, dur: 0.22, vol: 0.08, delay: 0.06 }
      ] },

      // ---------- 大招（按皮肤分三色，GDD §7 / §10） ----------
      ult_yujian: { parts: [                               // 万剑归宗：万剑齐鸣
        { kind: 'noise', f0: 1200, f1: 7000, dur: 0.55, vol: 0.16, type: 'bandpass', q: 0.7 },
        { kind: 'tone',  wave: 'sawtooth', f0: 300, f1: 1800, dur: 0.50, vol: 0.12, attack: 0.12 }
      ] },
      ult_nanming: { parts: [                              // 火凤燎原：爆燃
        { kind: 'noise', f0: 240, f1: 2400, dur: 0.70, vol: 0.18, type: 'lowpass' },
        { kind: 'tone',  wave: 'sawtooth', f0: 140, f1: 520, dur: 0.65, vol: 0.13, attack: 0.15 }
      ] },
      ult_jiuxiao: { parts: [                              // 雷霆万钧：落雷
        { kind: 'noise', f0: 6000, f1: 900, dur: 0.60, vol: 0.17, type: 'highpass' },
        { kind: 'tone',  wave: 'square', f0: 90, f1: 60, dur: 0.55, vol: 0.12 }
      ] },

      // ---------- 事件音（GDD 附录 B-4） ----------
      waveStart: { parts: [
        { kind: 'tone', wave: 'triangle', f0: 300, f1: 300, dur: 0.22, vol: 0.12 },
        { kind: 'tone', wave: 'triangle', f0: 450, f1: 450, dur: 0.28, vol: 0.11, delay: 0.16 }
      ] },
      bossSpawn: { parts: [
        { kind: 'tone',  wave: 'sawtooth', f0: 70, f1: 44, dur: 1.30, vol: 0.20, attack: 0.25 },
        { kind: 'noise', f0: 420, f1: 120, dur: 1.10, vol: 0.12, type: 'lowpass' }
      ] },
      pillarLit: { parts: [                                // 石柱点燃：轰 + 上升火声
        { kind: 'tone',  wave: 'sine',  f0: 150, f1: 60, dur: 0.40, vol: 0.20 },
        { kind: 'noise', f0: 400, f1: 2200, dur: 0.45, vol: 0.14, type: 'bandpass', q: 0.8 },
        { kind: 'tone',  wave: 'triangle', f0: 900, f1: 1400, dur: 0.30, vol: 0.09, delay: 0.12 }
      ] },
      enrage: { parts: [                                   // 狂暴：下坠巨吼
        { kind: 'tone',  wave: 'sawtooth', f0: 160, f1: 38, dur: 1.10, vol: 0.24, attack: 0.06 },
        { kind: 'noise', f0: 1800, f1: 90, dur: 1.00, vol: 0.16, type: 'lowpass' }
      ] },
      win: { parts: [                                      // 诛魔救世：上行三音
        { kind: 'tone', wave: 'triangle', f0: 523, f1: 523, dur: 0.22, vol: 0.16 },
        { kind: 'tone', wave: 'triangle', f0: 659, f1: 659, dur: 0.22, vol: 0.16, delay: 0.16 },
        { kind: 'tone', wave: 'triangle', f0: 784, f1: 784, dur: 0.60, vol: 0.18, delay: 0.32 },
        { kind: 'tone', wave: 'sine',     f0: 1046, f1: 1046, dur: 0.70, vol: 0.10, delay: 0.40 }
      ] },
      lose: { parts: [                                     // 人间倾覆：下行三音
        { kind: 'tone', wave: 'sawtooth', f0: 392, f1: 392, dur: 0.30, vol: 0.15 },
        { kind: 'tone', wave: 'sawtooth', f0: 311, f1: 311, dur: 0.34, vol: 0.15, delay: 0.22 },
        { kind: 'tone', wave: 'sawtooth', f0: 196, f1: 130, dur: 0.95, vol: 0.18, delay: 0.46 }
      ] }
    }
  };

  HX.Audio = Audio2;
})();
