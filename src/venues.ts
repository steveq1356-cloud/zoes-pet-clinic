/* Town venues: the food & drink menu (Clery's + cafe) and the shot challenge. */
import * as pg from "./pg";
import { Rect, Surface } from "./pg";
import * as data from "./data";
import * as font from "./font";
import * as sprites from "./sprites";
import * as ui from "./ui";
import * as gstate from "./state";
import { Scene } from "./engine";
import * as props2 from "./props2";
import * as challenges from "./challenges";

const SW = 320, SH = 180;

function dim(s: Surface, a = 120) {
  const v = sprites.cached("venue_dim|" + a, () => {
    const d = new Surface([SW, SH], pg.SRCALPHA);
    d.fill([20, 14, 30, a]);
    return d;
  });
  s.blit(v, [0, 0]);
}

function announce_all(game: any) {
  for (const [kind, key] of gstate.check_general_achievements(game.state)) {
    if (kind === "badges") game.toast("BADGE GET!", data.BADGES[key].name, "badge", key);
    else game.toast("ACHIEVEMENT!", data.ACHIEVEMENTS[key].name);
  }
}

/** Little row of buff tags, e.g. [FED] [COFFEE]. Returns the width drawn. */
export function draw_buff_tags(s: Surface, x: number, y: number, st: any): number {
  let cx = x;
  const tags: [string, pg.Color][] = Object.keys(st.buffs || {}).map((k) => [data.BUFFS[k].short, data.BUFFS[k].color]);
  if ((st.tipsy || 0) > 0) tags.push(["TIPSY", [200, 120, 200]]);
  for (const [label, c] of tags) {
    const w = font.text_width(label) + 6;
    ui.panel(s, [cx, y, w, 9], sprites.lighter(c, 0.6), c, false);
    font.draw(s, label, [cx + 3, y + 2], sprites.darker(c, 0.6));
    cx += w + 2;
  }
  return cx - x;
}

// ====================================================================== food menu
export class FoodMenu extends Scene {
  overlay = true;

  constructor(game: any, title: string, menu: any[], keeper: string, task_id: string | null = null) {
    super(game);
    this.title = title;
    this.task_id = task_id;
    // Turkey Thursday (and any other day-specific prices)
    const thu = gstate.is_thursday(game.state.day);
    this.menu = menu.map((it: any) => ({ ...it, price: thu && it.thursday_price ? it.thursday_price : it.price, deal: thu && !!it.thursday_price }));
    this.keeper = keeper;
    this.sel = 0;
    this.msg = null;
    this.msg_t = 0;
    this.particles = new ui.Particles();
    this.buy_btn = new ui.Button([200, 118, 96, 14], "Buy", () => this.buy(), true, null, [250, 220, 140], pg.K_RETURN);
    this.close_btn = new ui.Button([134, 152, 52, 13], "Done", () => this.game.pop(), true, null, null, pg.K_ESCAPE);
  }

  row_rect(i: number): Rect {
    return new Rect(24, 32 + i * 21, 164, 19);
  }

  say(text: string, t = 2.4) {
    this.msg = text;
    this.msg_t = t;
  }

  buy() {
    const st = this.game.state;
    const it = this.menu[this.sel];
    if (st.coins < it.price) {
      this.game.audio.play("error");
      this.say("Not enough coins! Work a shift first.");
      return;
    }
    st.coins -= it.price;
    st.stats.meals = (st.stats.meals || 0) + 1;
    if (this.task_id) challenges.progress(this.game, this.task_id);
    const r = this.row_rect(this.sel);
    if (it.tipsy) {
      st.tipsy = Math.min(150, (st.tipsy || 0) + 35);
      st.stats.shots = (st.stats.shots || 0) + 1;
      this.say("Cheers! *hic* ...the floor feels wobbly.");
      this.game.audio.play("pop");
    } else {
      if (it.buff) {
        st.buffs = st.buffs || {};
        st.buffs[it.buff] = true;
        this.say(`${data.BUFFS[it.buff].name}! ${data.BUFFS[it.buff].desc}`, 3.2);
      }
      this.game.audio.play("buy");
    }
    this.particles.burst("heart", r.centerx, r.centery, 6, 24);
    this.particles.text("YUM!", r.right - 20, r.y, ui.ACCENT);
    announce_all(this.game);
    this.game.save();
  }

  event(e: any) {
    if (this.buy_btn.handle(e, this.game)) return;
    if (this.close_btn.handle(e, this.game)) return;
    if (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) {
      for (let i = 0; i < this.menu.length; i++) {
        if (this.row_rect(i).collidepoint(this.game.mpos)) {
          if (this.sel === i) this.buy();
          this.sel = i;
          this.game.audio.play("blip");
          return;
        }
      }
    }
    if (e.type === pg.KEYDOWN) {
      if (e.key === pg.K_UP || e.key === pg.K_w) this.sel = Math.max(0, this.sel - 1);
      if (e.key === pg.K_DOWN || e.key === pg.K_s) this.sel = Math.min(this.menu.length - 1, this.sel + 1);
    }
  }

  update(dt: number) {
    this.particles.update(dt);
    if (this.msg_t > 0) this.msg_t -= dt;
  }

  draw(s: Surface) {
    const st = this.game.state;
    const m = this.game.mpos;
    dim(s);
    ui.panel(s, [14, 8, 292, 162], [255, 248, 236], ui.BORDER);
    s.blit(sprites.npc_portrait(this.keeper), [20, 9]);
    font.draw(s, this.title, [50, 13], ui.ACCENT, 2);
    s.blit(sprites.icon("coin"), [250, 13]);
    font.draw(s, String(st.coins), [264, 16], [170, 120, 30]);
    this.menu.forEach((it: any, i: number) => {
      const r = this.row_rect(i);
      const hov = r.collidepoint(m);
      const sel = this.sel === i;
      ui.panel(s, r, sel ? [255, 226, 214] : hov ? [255, 250, 240] : [250, 242, 230], sel ? ui.ACCENT : ui.BORDER, false);
      s.blit(props2.food_icon(it.icon), [r.x + 3, r.y + 3]);
      font.draw(s, it.name.toUpperCase(), [r.x + 21, r.y + 4], ui.INK);
      const tag = it.buff ? data.BUFFS[it.buff].short : it.tipsy ? "FUN" : "";
      if (tag) font.draw(s, tag, [r.x + 21, r.y + 11], it.buff ? data.BUFFS[it.buff].color : [200, 120, 200]);
      font.draw(s, String(it.price), [r.right - 4, r.y + 7], st.coins >= it.price ? [170, 120, 30] : ui.BAD, 1, null, "right");
      if (it.deal) font.draw(s, "DEAL!", [r.right - 4, r.y + 1], ui.GOOD, 1, null, "right");
    });
    // details
    const it = this.menu[this.sel];
    ui.panel(s, [196, 32, 104, 82], [255, 255, 255], ui.BORDER, false);
    s.blit(sprites.scaled("foodbig|" + it.icon, props2.food_icon(it.icon), 2), [234, 36]);
    font.draw(s, it.name.toUpperCase(), [248, 66], ui.ACCENT, 1, null, "center");
    font.draw_wrapped(s, it.desc, [202, 76, 94, 40], ui.INK);
    this.buy_btn.text = `Buy - ${it.price}`;
    this.buy_btn.enabled = st.coins >= it.price;
    this.buy_btn.draw(s, m);
    font.draw(s, "BUFFS LAST FOR YOUR NEXT SHIFT:", [24, 141], ui.MUTED);
    const w = draw_buff_tags(s, 152, 139, st);
    if (!w) font.draw(s, "NONE YET", [152, 141], ui.MUTED);
    this.close_btn.draw(s, m);
    this.particles.draw(s);
    if (this.msg && this.msg_t > 0) {
      const tw = font.text_width(this.msg) + 12;
      ui.panel(s, [160 - Math.floor(tw / 2), 128, tw, 11], [255, 250, 214], [200, 150, 60]);
      font.draw(s, this.msg, [160, 131], ui.INK, 1, null, "center");
    }
  }
}

// ====================================================================== shot challenge
const WIN_LINES: Record<string, string> = {
  andrew: "No way! Rematch tomorrow, yeah?",
  jayden: "Okay okay, you're actually good at this.",
  stephen: "Unbelievable. Do NOT tell anyone about this.",
  danny: "...Respect. Drinks on me. Well, not literally.",
};
const LOSE_LINES: Record<string, string> = {
  andrew: "Ha! Even I won one! Mark the calendar!",
  jayden: "Undefeated! ...Today. Undefeated today.",
  stephen: "Told you, Doc. Pay up!",
  danny: "Better luck next time, Zoe.",
};

export class ShotChallenge extends Scene {
  overlay = true;

  constructor(game: any, rival: string, on_done: ((result: string, line: string) => void) | null = null) {
    super(game);
    this.rival = rival;
    this.info = data.SHOT_RIVALS[rival] || { skill: 0.5, bet: 10 };
    this.on_done = on_done;
    this.phase = "intro";
    this.round = 0;
    this.zoe_pts = 0;
    this.rival_pts = 0;
    this.results = [] as [boolean, boolean][];
    this.t = 0;
    this.phase_t = 0;
    this.particles = new ui.Particles();
    this.start_btn = new ui.Button([88, 142, 70, 14], "Let's go!", () => this.begin(), true, null, [250, 220, 140], pg.K_RETURN);
    this.nah_btn = new ui.Button([164, 142, 70, 14], "Nah", () => this.close("none"), true, null, null, pg.K_ESCAPE);
    this.ok_btn = new ui.Button([125, 150, 70, 14], "Done", () => this.close(this.outcome), true, null, null, pg.K_RETURN);
    this.outcome = "none";
  }

  get name(): string {
    return this.rival.charAt(0).toUpperCase() + this.rival.slice(1);
  }

  begin() {
    const st = this.game.state;
    if (st.coins < this.info.bet) {
      this.game.audio.play("error");
      this.flash = `You need ${this.info.bet} coins to bet!`;
      this.flash_t = 2;
      return;
    }
    this.phase = "aim";
    this.setup_round();
  }

  setup_round() {
    const st = this.game.state;
    this.mk = 0;
    this.mdir = 1;
    this.zc = pg.random.uniform(0.3, 0.7);
    this.zw = Math.max(0.08, 0.2 - this.round * 0.035);
    this.speed = 0.85 + this.round * 0.35 + Math.min(0.6, (st.tipsy || 0) / 200);
    this.phase_t = 0;
  }

  shoot() {
    const st = this.game.state;
    const hit = Math.abs(this.mk - this.zc) <= this.zw / 2;
    const rival_hit = pg.random.random() < this.info.skill;
    this.results.push([hit, rival_hit]);
    if (hit) this.zoe_pts += 1;
    if (rival_hit) this.rival_pts += 1;
    st.tipsy = Math.min(150, (st.tipsy || 0) + 15);
    st.stats.shots = (st.stats.shots || 0) + 1;
    this.game.audio.play(hit ? "star" : "error");
    if (!hit) this.game.shake(2, 0.2);
    this.particles.text(hit ? "SMOOTH!" : "BLEGH!", 90, 70, hit ? ui.GOOD : ui.BAD);
    this.particles.text(rival_hit ? "SMOOTH!" : "BLEGH!", 230, 70, rival_hit ? ui.GOOD : ui.BAD);
    this.phase = "result";
    this.phase_t = 0;
  }

  next() {
    this.round += 1;
    if (this.round >= 3) this.finish();
    else {
      this.phase = "aim";
      this.setup_round();
    }
  }

  finish() {
    const st = this.game.state;
    const bet = this.info.bet;
    if (this.zoe_pts > this.rival_pts) {
      st.coins += bet;
      st.total_coins += bet;
      st.stats.challenges_won = (st.stats.challenges_won || 0) + 1;
      this.outcome = "win";
      this.game.audio.play("coin");
      for (let i = 0; i < 10; i++) this.particles.add("coin", 160, 100);
      this.particles.burst("sparkle", 160, 90, 12, 40);
    } else if (this.zoe_pts < this.rival_pts) {
      st.coins = Math.max(0, st.coins - bet);
      this.outcome = "lose";
      this.game.audio.play("sad");
    } else {
      this.outcome = "draw";
      this.game.audio.play("blip");
    }
    this.phase = "final";
    announce_all(this.game);
    this.game.save();
  }

  close(result: string) {
    this.game.pop();
    const line = result === "win" ? WIN_LINES[this.rival] || "Okay, you got me. Rematch soon!" : result === "lose" ? LOSE_LINES[this.rival] || "Ha! Better luck next time, Zoe!" : result === "draw" ? "A draw! Nobody pays. Again sometime?" : "";
    if (this.on_done) this.on_done(result, line || "");
  }

  event(e: any) {
    if (this.phase === "intro") {
      if (this.start_btn.handle(e, this.game)) return;
      this.nah_btn.handle(e, this.game);
      return;
    }
    if (this.phase === "final") {
      this.ok_btn.handle(e, this.game);
      return;
    }
    const press = (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) || (e.type === pg.KEYDOWN && e.key === pg.K_SPACE);
    if (this.phase === "aim" && press && this.phase_t > 0.25) this.shoot();
  }

  update(dt: number) {
    this.t += dt;
    this.phase_t += dt;
    this.particles.update(dt);
    if (this.flash_t > 0) this.flash_t -= dt;
    if (this.phase === "aim") {
      this.mk += this.mdir * this.speed * dt;
      if (this.mk > 1) { this.mk = 1; this.mdir = -1; }
      if (this.mk < 0) { this.mk = 0; this.mdir = 1; }
      // tipsy: the target zone sways
      const sway = Math.min(0.12, (this.game.state.tipsy || 0) / 900);
      this.zc_draw = Math.max(0.1, Math.min(0.9, this.zc + Math.sin(this.t * 2.3) * sway));
    }
    if (this.phase === "result" && this.phase_t > 1.3) this.next();
  }

  draw(s: Surface) {
    const st = this.game.state;
    const m = this.game.mpos;
    dim(s, 150);
    ui.panel(s, [20, 10, 280, 160], [70, 44, 40], [40, 26, 24]);
    s.blit(props2.string_lights(276, this.t), [22, 11]);
    font.draw(s, "SHOT CHALLENGE!", [160, 20], [255, 220, 120], 2, [120, 60, 40], "center");
    // portraits
    const zp = sprites.zoe_portrait(st.hair, st.outfit);
    const rp = sprites.npc_portrait(this.rival);
    ui.panel(s, [40, 38, 32, 36], [250, 220, 230], ui.BORDER, false);
    s.blit(zp, [44, 42]);
    ui.panel(s, [248, 38, 32, 36], [220, 236, 250], ui.BORDER, false);
    s.blit(rp, [252, 42]);
    font.draw(s, "ZOE", [56, 77], [255, 240, 220], 1, null, "center");
    font.draw(s, this.name.toUpperCase(), [264, 77], [255, 240, 220], 1, null, "center");
    // glasses scoreboard
    for (let i = 0; i < 3; i++) {
      const res = this.results[i];
      this.draw_glass(s, 84 + i * 14, 50, res ? (res[0] ? "win" : "miss") : "full");
      this.draw_glass(s, 208 + i * 14, 50, res ? (res[1] ? "win" : "miss") : "full");
    }
    font.draw(s, `${this.zoe_pts} - ${this.rival_pts}`, [160, 50], [255, 255, 255], 2, null, "center");
    if (this.phase === "intro") {
      font.draw_wrapped(s, `${this.name} bets ${this.info.bet} coins. Best of 3 shots! Click when the marker is in the GREEN zone to take a smooth shot.`,
        [44, 92, 232, 40], [255, 240, 220]);
      font.draw(s, `YOU HAVE ${st.coins} COINS`, [160, 128], [255, 220, 120], 1, null, "center");
      this.start_btn.draw(s, m);
      this.nah_btn.draw(s, m);
    } else if (this.phase === "aim" || this.phase === "result") {
      font.draw(s, `ROUND ${this.round + 1} OF 3`, [160, 92], [255, 240, 220], 1, null, "center");
      const bar = new Rect(50, 104, 220, 14);
      pg.draw.rect(s, [40, 26, 24], bar.inflate(4, 4));
      pg.draw.rect(s, [230, 120, 110], bar);
      const zc = this.zc_draw ?? this.zc;
      const zx = bar.x + Math.trunc((zc - this.zw / 2) * bar.w);
      pg.draw.rect(s, [120, 220, 130], [zx, bar.y, Math.trunc(this.zw * bar.w), bar.h]);
      const mx = bar.x + Math.trunc(this.mk * bar.w);
      pg.draw.rect(s, [255, 255, 255], [mx - 1, bar.y - 3, 3, bar.h + 6]);
      pg.draw.rect(s, ui.INK, [mx - 1, bar.y - 3, 3, bar.h + 6], 1);
      if (this.phase === "aim") font.draw(s, "CLICK OR SPACE TO SHOOT!", [160, 126], [255, 220, 120], 1, null, "center");
    } else if (this.phase === "final") {
      const txt = this.outcome === "win" ? `YOU WIN ${this.info.bet} COINS!` : this.outcome === "lose" ? `YOU LOSE ${this.info.bet} COINS` : "IT'S A DRAW!";
      const col = this.outcome === "win" ? [255, 230, 120] : this.outcome === "lose" ? [250, 160, 160] : [230, 230, 240];
      font.draw(s, txt, [160, 106], col, 2, [60, 30, 30], "center");
      this.ok_btn.draw(s, m);
    }
    if (this.flash && this.flash_t > 0) font.draw(s, this.flash, [160, 132], [255, 160, 160], 1, null, "center");
    this.particles.draw(s);
  }

  draw_glass(s: Surface, x: number, y: number, state: string) {
    pg.draw.rect(s, [230, 240, 250], [x, y, 8, 12]);
    pg.draw.rect(s, ui.INK, [x, y, 8, 12], 1);
    if (state === "full") pg.draw.rect(s, [240, 190, 90], [x + 1, y + 4, 6, 7]);
    if (state === "win") font.draw(s, "✓", [x + 2, y + 4], ui.GOOD);
    if (state === "miss") font.draw(s, "X", [x + 2, y + 4], ui.BAD);
  }
}
