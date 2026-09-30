// 配色表（资源代码化）：全部视觉资源由代码绘制，颜色集中在此，改色不动绘制逻辑。
// 供 src/render/art.js 与 src/ui/hud.js 使用；渲染层只读。
(function () {
  const HX = window.HX || (window.HX = {});

  HX.PAL = {
    // 云海仙山（GDD §4.1 背景）
    bg: {
      sky0: '#070b18',
      sky1: '#0d1730',
      sky2: '#16233f',
      mountainFar: '#101a33',
      mountainNear: '#0a1225',
      cloud: 'rgba(150,185,235,0.075)',
      cloudWarm: 'rgba(220,190,140,0.05)',
      grid: 'rgba(140,175,225,0.055)',
      gridMajor: 'rgba(150,190,240,0.10)',
      barrier: 'rgba(120,200,255,0.16)'
    },

    // 三套皮肤主色（GDD §7）
    skins: {
      yujian:  { robe: '#2f6fd0', robeDark: '#1a3f7d', accent: '#9fe8ff', aura: 'rgba(110,200,255,0.34)', bullet: '#8fe9ff' },
      nanming: { robe: '#c8391f', robeDark: '#7a1d0f', accent: '#ffc45e', aura: 'rgba(255,140,60,0.34)',  bullet: '#ff9a3c' },
      jiuxiao: { robe: '#4b2a7a', robeDark: '#2a1349', accent: '#c58cff', aura: 'rgba(180,120,255,0.34)', bullet: '#c9a6ff' }
    },

    // 敌方（GDD §11 / §13）
    enemy: {
      spider: '#a3222c', spiderDark: '#5d0f18', spiderTelegraph: '#ff4a4a',
      wizard: '#3b2a55', wizardDark: '#1e1430', wizardAccent: '#b06bff',
      bullet: '#ff6a8a', track: '#ff9d4d', trackCore: '#ffe2b0'
    },
    boss: {
      body: '#3a2140', bodyDark: '#160b1d', accent: '#b04bff', glow: 'rgba(176,75,255,0.28)',
      enrage: '#ff2b2b', enrageDark: '#5a0000'
    },

    // 石柱两态（GDD §13.3：初始暗色 → 点燃火焰亮起）
    pillar: { dark: '#4a4f63', darkEdge: '#2b2f3f', lit: '#ff9b3d', litEdge: '#ffd98a', glow: 'rgba(255,155,61,0.35)' },

    // 地面危险区（地火预警）
    hazard: { warn: 'rgba(255,60,60,0.22)', warnEdge: 'rgba(255,120,90,0.75)', fire: 'rgba(255,120,40,0.42)' },

    pickup: { ring: '#7fe6c0', core: '#e9fff8', glow: 'rgba(127,230,192,0.35)' },

    // HUD（GDD §4.3）
    hud: {
      text: '#e8ecf8', dim: '#7c88a8', faint: 'rgba(124,136,168,0.45)',
      panel: 'rgba(8,12,22,0.72)', panelEdge: 'rgba(140,175,225,0.22)',
      hp: '#e2483f', hpLow: '#ff5a4d', hpBack: 'rgba(255,255,255,0.10)',
      exp: '#57c1ff', energy: '#f0c24b', bossHp: '#c8324f'
    },

    fx: { white: 'rgba(255,255,255,0.9)', hit: 'rgba(255,240,200,0.9)', text: '#ffe9a8' }
  };
})();
