// 战斗场景（GDD §12 关卡流程的承载者）。
//
// 本文件只负责**场景层**的三件事（AGENTS §5 分层）：
//   ① 把 HX.Input 的按键状态翻译成 intent —— 这是全工程**唯一**允许读输入的地方
//      （逻辑层不读输入，理由见 systems/world.js 头注释：无头模拟要能脚本化驱动）
//   ② 调 HX.World.step 推进世界
//   ③ 把世界交给 render 层绘制
//
// 玩法规则与状态全在 src/systems/{world,spawn,movement,enemy,skill,combat}.js，本文件不含任何玩法数值。
(function () {
  const HX = window.HX || (window.HX = {});
  HX.Scenes = HX.Scenes || {};

  HX.Scenes.battle = {
    name: 'battle',
    world: null,

    enter(game, params) {
      const skinId = (params && params.seed !== undefined) ? HX.DEFAULT_SKIN
        : (HX.Equip ? HX.Equip.weapon : (game.skinId || HX.DEFAULT_SKIN));  // 武器系 = 普攻/弹幕色
      const seed = (params && params.seed !== undefined) ? params.seed : HX.C.SEED;
      game.skinId = skinId;
      this.world = HX.World.create({ seed: seed, skinId: skinId });
      // 装配（GDD v1.19 §7）：以主页的武器/法袍/法器三部件进关；三件同系激活套装（最大生命 +50）。
      // player.skinId = 武器系（决定普攻弹幕与武器外观）；护身技/大招分别读 cloth/aura 槽。
      if (HX.Equip) {
        this.world.player.equip = HX.Equip.snapshot();
        this.world.player.hp = this.world.player.maxHp = HX.Equip.maxHp();
      }
      // 注意：胜负三态（win / rage / down）自阶段 3 起全部为**真实判定**，
      // 不再需要开发期 F2 预览键；石柱也由 BOSS 65% 血真实召唤（不再用 F3）。
    },

    leave(game) {
      this.world = null;
    },

    // 输入 → intent。dash/ult 用 consume（一次按键只被消费一次）
    readIntent() {
      const mv = HX.Input.moveVector();
      return {
        moveX: mv.x,
        moveY: mv.y,
        dash: HX.Input.consume('Space'),
        ult: HX.Input.consume('KeyR')     // 大招：能量满 + 冷却好时释放（GDD §10）
      };
    },

    update(dt, game) {
      const w = this.world;
      if (!w) return;

      HX.World.step(w, dt, this.readIntent());

      // 真实胜负判定产出即进结算（GDD §15：win=石柱全燃前击杀 / rage=四柱全燃 / down=阵亡）
      if (w.outcome) {
        game.setScene('result', { outcome: w.outcome, stats: w.stats });
        return;
      }

      if (HX.Input.consume('Escape')) { HX.Audio.play('uiBack'); game.setScene('menu'); return; }
    },

    render(ctx, game) {
      const w = this.world;
      if (!w) return;
      HX.Renderer.drawWorld(ctx, w, w.cam, game);
      HX.Hud.draw(ctx, w, game);
    }
  };
})();
