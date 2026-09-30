// 装配部件定义（GDD v1.19 §4.2 / §7 换肤系统重构）：
//   唯一裸模（assets/skin/role.png）+ 三槽可装备部件 —— 武器 / 法袍 / 法器，每槽三系：
//   御剑（蓝）/ 南明（红）/ 九霄（紫）。自由配对；三件同系激活套装（最大生命 +50）。
// 部件外观 = assets/skin/*.png 分层贴图：role（裸模 256×475）+ cloth/weapon/aura（128×128）。
// 技能归属（GDD §7）：武器 → 普通攻击；法袍 → 护身技；法器 → 大招（数值仍在本目录 skins.js 的
//   SKINS[系].normal/guard/ult —— 部件只做「选择哪一套技能 + 哪一套外观」）。
// 全局装配状态存 HX.Equip（跨场景共享：主页「开始」以当前装配进关，GDD §4.1）。
(function () {
  const HX = window.HX || (window.HX = {});

  // ---- 三系部件表（外观贴图文件名见 img；技能数值见 SKINS[sys]） ----
  HX.PARTS = {
    yujian: {
      name: '御剑系', color: 'yujian',
      weapon: { name: '御剑武器', skill: '御剑术', img: 'weapon_blue' },
      cloth:  { name: '御剑法袍', skill: '本命法剑', img: 'cloth_blue' },
      aura:   { name: '御剑法器', skill: '万剑归宗', img: 'aura_blue' }
    },
    nanming: {
      name: '南明系', color: 'nanming',
      weapon: { name: '南明武器', skill: '离火术', img: 'weapon_red' },
      cloth:  { name: '南明法袍', skill: '踏焰留痕', img: 'cloth_red' },
      aura:   { name: '南明法器', skill: '火凤燎原', img: 'aura_red' }
    },
    jiuxiao: {
      name: '九霄系', color: 'jiuxiao',
      weapon: { name: '九霄武器', skill: '雷链术', img: 'weapon_purple' },
      cloth:  { name: '九霄法袍', skill: '雷池', img: 'cloth_purple' },
      aura:   { name: '九霄法器', skill: '雷霆万钧', img: 'aura_purple' }
    }
  };

  HX.EQUIP_ORDER = ['yujian', 'nanming', 'jiuxiao'];
  HX.EQUIP_SLOTS = ['weapon', 'cloth', 'aura'];
  HX.EQUIP_SLOT_NAME = { weapon: '武器', cloth: '法袍', aura: '法器' };

  // ---- 全局装配状态（Demo 无存档：跨场景内存共享，重开页面回默认） ----
  HX.Equip = {
    weapon: 'yujian',
    cloth: 'yujian',
    aura: 'yujian',

    set(slot, sys) {
      if (!HX.PARTS[sys] || HX.EQUIP_SLOTS.indexOf(slot) < 0) return;
      this[slot] = sys;
    },

    // 三件同系 = 套装激活（GDD §7.5：最大生命 +50）
    kitMatch() { return this.weapon === this.cloth && this.cloth === this.aura; },
    kitSys() { return this.kitMatch() ? this.weapon : null; },
    kitName() {
      const sys = this.kitSys();
      return sys ? HX.PARTS[sys].name.replace('系', '') + '套装' : null;
    },

    // 当前装配的最大生命（GDD §7.5：基础 200 + 套装 50）
    maxHp() {
      const base = HX.BAL.player.maxHp;
      return this.kitMatch() ? base + 50 : base;
    },

    // 生成玩家实体用的装配快照（battle.enter 调用）
    snapshot() { return { weapon: this.weapon, cloth: this.cloth, aura: this.aura }; },

    // 描述文本（主页底部 / 装配提示用）
    summary() {
      const kit = this.kitName();
      const names = HX.PARTS[this.weapon].weapon.name + ' + ' +
                    HX.PARTS[this.cloth].cloth.name + ' + ' +
                    HX.PARTS[this.aura].aura.name;
      return names + (kit ? '（' + kit + '：最大生命 +50）' : '（自由配搭）');
    }
  };

  // ---- 部件贴图懒加载（仿 home_bg：file:// / http 均可用；未加载完成返回 null） ----
  const _imgCache = {};
  HX.partImg = function (name) {
    if (typeof Image === 'undefined') return null;    // 无头环境兜底
    let im = _imgCache[name];
    if (!im) {
      im = _imgCache[name] = new Image();
      im.src = 'assets/skin/' + name + '.png';
    }
    return im.complete && im.naturalWidth > 0 ? im : null;
  };
})();
