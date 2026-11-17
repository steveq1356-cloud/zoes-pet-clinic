/* Side-gig mini-games: the Sandwich Artist counter gig and bar darts. */
import * as pg from "./pg";
import { Rect, Surface } from "./pg";
import * as data from "./data";
import * as font from "./font";
import * as sprites from "./sprites";
import * as ui from "./ui";
import * as gstate from "./state";
import { Scene } from "./engine";

const SW = 320, SH = 180;

function dim(s: Surface, a = 120) {
  const v = sprites.cached("mg2_dim|" + a, () => {
    const d = new Surface([SW, SH], pg.SRCALPHA);
    d.fill([20, 14, 30, a]);
    return d;
  });
  s.blit(v, [0, 0]);
}

function announce_all(game: any) {
  try {
    for (const [kind, key] of gstate.check_general_achievements(game.state)) {
      if (kind === "badges") game.toast("BADGE GET!", data.BADGES[key].name, "badge", key);
      else game.toast("ACHIEVEMENT!", data.ACHIEVEMENTS[key].name);
    }
  } catch (_e) { /* achievements are optional here */ }
}

/** Portrait that never throws, even for people not (yet) in data.PEOPLE. */
function safe_portrait(name: string): Surface | null {
  try {
    if (!data.PEOPLE || !data.PEOPLE[name]) return null;
    return sprites.npc_portrait(name);
  } catch (_e) {
    return null;
  }
}

function draw_portrait(s: Surface, p: Surface | null, x: number, y: number, fill: pg.Color) {
  ui.panel(s, [x, y, 32, 36], fill, ui.BORDER, false);
  if (p) s.blit(p, [x + 4, y + 4]);
  else font.draw(s, "?", [x + 16, y + 12], ui.MUTED, 2, null, "center");
}

function cap(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ====================================================================== sandwich artist
type Ing = { key: string; name: string; cat: string; c1: pg.Color; c2: pg.Color };

const INGS: Ing[] = [
  { key: "white", name: "White", cat: "bread", c1: [252, 242, 214], c2: [214, 168, 100] },
  { key: "wheat", name: "Wheat", cat: "bread", c1: [214, 164, 104], c2: [150, 98, 56] },
  { key: "turkey", name: "Turkey", cat: "meat", c1: [242, 206, 182], c2: [206, 156, 130] },
  { key: "ham", name: "Ham", cat: "meat", c1: [246, 160, 172], c2: [208, 112, 130] },
  { key: "chicken", name: "Chicken", cat: "meat", c1: [236, 206, 150], c2: [180, 132, 80] },
  { key: "cheddar", name: "Cheddar", cat: "cheese", c1: [250, 176, 60], c2: [210, 130, 30] },
  { key: "swiss", name: "Swiss", cat: "cheese", c1: [252, 240, 170], c2: [214, 196, 110] },
  { key: "lettuce", name: "Lettuce", cat: "veg", c1: [130, 210, 100], c2: [70, 150, 60] },
  { key: "tomato", name: "Tomato", cat: "veg", c1: [232, 72, 62], c2: [170, 40, 40] },
  { key: "onion", name: "Onion", cat: "veg", c1: [236, 218, 242], c2: [168, 104, 184] },
  { key: "pickles", name: "Pickles", cat: "veg", c1: [130, 170, 60], c2: [80, 116, 36] },
  { key: "peppers", name: "Peppers", cat: "veg", c1: [96, 186, 76], c2: [230, 200, 60] },
  { key: "mayo", name: "Mayo", cat: "sauce", c1: [252, 250, 236], c2: [214, 208, 180] },
  { key: "mustard", name: "Mustard", cat: "sauce", c1: [244, 204, 40], c2: [190, 150, 20] },
  { key: "chipotle", name: "Chipotle", cat: "sauce", c1: [222, 112, 62], c2: [160, 70, 40] },
];
const ING: Record<string, Ing> = {};
for (const it of INGS) ING[it.key] = it;

const CAT_TINT: Record<string, pg.Color> = {
  bread: [250, 232, 200], meat: [252, 222, 222], cheese: [252, 240, 200], veg: [220, 244, 214], sauce: [240, 228, 240],
};

const ORDER_TIME = 12;
const N_ORDERS = 3;

function ing_icon(key: string): Surface {
  return sprites.cached("mg2_ing|" + key, () => {
    const it = ING[key];
    const s = sprites.new_(14, 14);
    const c1 = it.c1, c2 = it.c2;
    const d = pg.draw;
    if (it.cat === "bread") {
      d.ellipse(s, c2, [1, 2, 12, 8]);
      d.rect(s, c2, [1, 6, 12, 6]);
      d.ellipse(s, c1, [3, 4, 8, 5]);
      d.rect(s, c1, [3, 6, 8, 4]);
      if (key === "wheat") {
        for (const [x, y] of [[4, 3], [7, 2], [10, 3], [5, 7], [9, 8]]) s.set_at([x, y], [250, 230, 170]);
      } else {
        d.line(s, sprites.lighter(c2, 0.4), [4, 3], [9, 3]);
      }
    } else if (it.cat === "meat") {
      d.circle(s, c2, [7, 7], 5);
      d.circle(s, c1, [7, 7], 4);
      if (key === "chicken") {
        d.line(s, c2, [4, 5], [9, 10]);
        d.line(s, c2, [6, 4], [10, 8]);
      } else if (key === "ham") {
        d.circle(s, sprites.lighter(c1, 0.5), [6, 6], 1);
        s.set_at([9, 8], sprites.lighter(c1, 0.5));
      } else {
        d.circle(s, sprites.lighter(c1, 0.4), [7, 7], 2);
      }
    } else if (it.cat === "cheese") {
      d.polygon(s, c1, [[1, 11], [12, 11], [12, 3]]);
      d.rect(s, c2, [1, 11, 12, 1]);
      if (key === "swiss") {
        s.set_at([9, 8], c2); s.set_at([10, 6], c2); s.set_at([6, 10], c2);
      } else {
        d.line(s, sprites.lighter(c1, 0.4), [5, 10], [11, 5]);
      }
    } else if (key === "lettuce") {
      d.ellipse(s, c2, [1, 3, 12, 9]);
      d.ellipse(s, c1, [2, 4, 10, 6]);
      d.line(s, c2, [3, 7], [11, 7]);
      s.set_at([6, 6], c2); s.set_at([9, 8], c2);
    } else if (key === "tomato") {
      d.circle(s, c2, [7, 8], 5);
      d.circle(s, c1, [7, 8], 4);
      d.circle(s, [250, 140, 120], [7, 8], 2);
      s.set_at([6, 8], [250, 230, 160]); s.set_at([8, 7], [250, 230, 160]);
      d.rect(s, [70, 150, 60], [6, 2, 3, 2]);
    } else if (key === "onion") {
      d.circle(s, c1, [7, 7], 5);
      d.circle(s, c2, [7, 7], 5, 1);
      d.circle(s, c2, [7, 7], 3, 1);
      s.set_at([7, 7], c2);
    } else if (key === "pickles") {
      d.ellipse(s, c2, [2, 3, 10, 8]);
      d.ellipse(s, c1, [3, 4, 8, 6]);
      for (const [x, y] of [[5, 6], [8, 5], [7, 8], [9, 7]]) s.set_at([x, y], [210, 230, 150]);
    } else if (key === "peppers") {
      d.ellipse(s, c1, [2, 4, 10, 9]);
      d.line(s, sprites.darker(c1, 0.75), [7, 5], [7, 11]);
      d.rect(s, [60, 110, 40], [6, 1, 2, 4]);
      s.set_at([4, 6], sprites.lighter(c1, 0.5));
    } else {
      // sauce bottle
      d.rect(s, c1, [4, 4, 6, 9]);
      d.rect(s, c2, [4, 4, 6, 1]);
      d.rect(s, [240, 240, 240], [5, 7, 4, 3]);
      d.rect(s, c2, [5, 2, 4, 2]);
      d.rect(s, c2, [6, 0, 2, 2]);
    }
    return sprites.outline(s);
  });
}

/** Draw one sandwich layer sitting on `y` (its bottom). Returns layer height. */
function draw_layer(s: Surface, key: string, cx: number, y: number, w = 64, top = false): number {
  const it = ING[key];
  const x0 = Math.round(cx - w / 2);
  const c1 = it.c1, c2 = it.c2;
  const d = pg.draw;
  if (it.cat === "bread") {
    if (top) {
      d.ellipse(s, c2, [x0, y - 12, w, 16]);
      d.ellipse(s, sprites.lighter(c2, 0.25), [x0 + 4, y - 11, w - 14, 6]);
      if (key === "wheat") for (let i = 0; i < 7; i++) s.set_at([x0 + 8 + i * 7, y - 9 + (i % 2) * 2], [250, 228, 170]);
      else for (let i = 0; i < 6; i++) d.rect(s, [255, 250, 236], [x0 + 9 + i * 8, y - 9 + (i % 2), 2, 1]);
      d.rect(s, c1, [x0 + 1, y - 3, w - 2, 3]);
      return 8;
    }
    d.rect(s, c2, [x0 + 2, y - 7, w - 4, 7]);
    d.rect(s, c2, [x0, y - 6, w, 5]);
    d.rect(s, c1, [x0 + 2, y - 7, w - 4, 3]);
    if (key === "wheat") for (let i = 0; i < 8; i++) s.set_at([x0 + 5 + i * 7, y - 6 + (i % 2)], sprites.darker(c1, 0.8));
    return 6;
  }
  if (it.cat === "meat") {
    for (let i = 0; i < 6; i++) {
      d.ellipse(s, c2, [x0 - 3 + i * 12, y - 5, 15, 5]);
      d.ellipse(s, c1, [x0 - 2 + i * 12, y - 5, 13, 4]);
    }
    return 4;
  }
  if (it.cat === "cheese") {
    d.rect(s, c1, [x0 - 2, y - 3, w + 4, 3]);
    d.rect(s, c2, [x0 - 2, y - 1, w + 4, 1]);
    d.polygon(s, c1, [[x0 + 6, y], [x0 + 12, y], [x0 + 9, y + 3]]);
    d.polygon(s, c1, [[x0 + w - 16, y], [x0 + w - 10, y], [x0 + w - 13, y + 2]]);
    if (key === "swiss") for (let i = 0; i < 5; i++) d.rect(s, c2, [x0 + 6 + i * 13, y - 2, 2, 1]);
    return 3;
  }
  if (key === "lettuce") {
    for (let i = 0; i <= w + 4; i += 4) {
      d.circle(s, (i / 4) % 2 ? c1 : c2, [x0 - 2 + i, y - 2], 2);
    }
    d.line(s, sprites.lighter(c1, 0.3), [x0, y - 2], [x0 + w, y - 2]);
    return 3;
  }
  if (key === "tomato") {
    for (let i = 0; i < 5; i++) {
      d.ellipse(s, c2, [x0 + 1 + i * 13, y - 3, 12, 3]);
      d.ellipse(s, [250, 130, 110], [x0 + 3 + i * 13, y - 3, 8, 2]);
    }
    return 3;
  }
  if (key === "onion") {
    for (let i = 0; i < 6; i++) {
      d.ellipse(s, c2, [x0 + 1 + (i % 2 ? 4 : 0) + i * 10, y - 3, 10, 3], 1);
    }
    return 2;
  }
  if (key === "pickles") {
    for (let i = 0; i < 7; i++) {
      d.ellipse(s, c2, [x0 + 2 + i * 9, y - 3, 8, 3]);
      s.set_at([x0 + 5 + i * 9, y - 2], [200, 226, 140]);
    }
    return 2;
  }
  if (key === "peppers") {
    for (let i = 0; i < 9; i++) {
      d.rect(s, i % 3 === 1 ? [220, 80, 60] : c1, [x0 + i * 7, y - 2 - (i % 2), 6, 2]);
    }
    return 2;
  }
  // sauce zigzag
  for (let i = 0; i < w; i += 3) {
    d.line(s, c1, [x0 + i, y - 1], [x0 + i + 2, y - 2 - ((i / 3) % 2)]);
  }
  d.line(s, c2, [x0 + 1, y], [x0 + w - 1, y]);
  return 2;
}

type Order = { items: string[]; idx: number; mistakes: number; t: number; customer: string; score: number; perfect: boolean; layers: { key: string; age: number }[]; timed_out: boolean };

const SUB_LINES: [number, string, string[]][] = [
  [90, "PERFECT SUB!", ["Perfection! You're a natural!", "Exactly how I like it!", "Best sub in town, Zoe!"]],
  [70, "TASTY!", ["Ooh, tasty! Thanks, Zoe!", "Nice and fresh. Thanks!"]],
  [40, "OKAY...", ["Hmm... it's a sandwich.", "It'll do, I guess."]],
  [-1, "BLEH...", ["Bleh. Stick to the pets, Doc.", "Is that... a pickle in my mayo?"]],
];

export class SandwichGame extends Scene {
  overlay = true;

  constructor(game: any, on_done: ((coins_earned: number) => void) | null = null) {
    super(game);
    this.on_done = on_done;
    this.phase = "intro"; // intro | play | review | final
    this.t = 0;
    this.phase_t = 0;
    this.order_i = 0;
    this.orders = [] as Order[];
    this.earned = 0;
    this.perfects = 0;
    this.closed = false;
    this.thursday = ((game.state?.day ?? 1) - 1) % 7 === 3;
    this.particles = new ui.Particles();
    this.start_btn = new ui.Button([88, 142, 70, 14], "Let's go!", () => this.begin(), true, null, [250, 220, 140], pg.K_RETURN);
    this.nah_btn = new ui.Button([164, 142, 70, 14], "Nah", () => this.close(), true, null, null, pg.K_ESCAPE);
    this.ok_btn = new ui.Button([125, 150, 70, 14], "Done", () => this.close(), true, null, null, pg.K_RETURN);
    this.customers = Object.keys(data.PEOPLE || {}).filter((k) => k !== "zoe");
    if (!this.customers.length) this.customers = ["stephen"];
  }

  bin_rect(i: number): Rect {
    const cats = ["bread", "meat", "cheese", "veg", "sauce"];
    const gap = cats.indexOf(INGS[i].cat);
    return new Rect(10 + i * 19 + gap * 4, 138, 18, 20);
  }

  make_order(): Order {
    const r = pg.random;
    const items: string[] = [];
    items.push(r.choice(["white", "wheat"]));
    items.push(this.thursday ? "turkey" : r.choice(["turkey", "ham", "chicken"]));
    const n = r.randint(4, 6);
    let mid = n - 3;
    if (mid >= 2 || r.random() < 0.5) {
      items.push(r.choice(["cheddar", "swiss"]));
      mid -= 1;
    }
    for (const v of r.sample(["lettuce", "tomato", "onion", "pickles", "peppers"], mid)) items.push(v);
    items.push(r.choice(["mayo", "mustard", "chipotle"]));
    let customer = r.choice(this.customers as string[]);
    const prev = this.orders.map((o: Order) => o.customer);
    for (let k = 0; k < 5 && prev.includes(customer); k++) customer = r.choice(this.customers as string[]);
    return { items, idx: 0, mistakes: 0, t: 0, customer, score: 0, perfect: false, layers: [], timed_out: false };
  }

  get order(): Order {
    return this.orders[this.order_i];
  }

  begin() {
    this.phase = "play";
    this.phase_t = 0;
    this.orders = [this.make_order()];
    this.order_i = 0;
    this.game.audio.play("door");
  }

  pick(key: string, bx: number, by: number) {
    const o = this.order;
    if (!o || this.phase !== "play") return;
    const want = o.items[o.idx];
    if (key === want) {
      o.layers.push({ key, age: 0 });
      o.idx += 1;
      this.game.audio.play(ING[key].cat === "sauce" ? "pour" : "pop", 0.8);
      this.particles.burst("puff", 163, this.stack_top() - 2, 4, 16);
      if (o.idx >= o.items.length) this.complete(false);
    } else {
      o.mistakes += 1;
      this.game.audio.play("error");
      this.game.shake(2, 0.15);
      this.particles.text("BLEH!", bx, by - 6, ui.BAD);
      this.particles.text("-15", 163, this.stack_top() - 10, ui.BAD, 0.9);
      this.particles.burst("mud", bx, by, 4, 14);
    }
  }

  stack_top(): number {
    const o = this.order;
    let y = 120;
    if (!o) return y;
    for (const l of o.layers) y -= this.layer_h(l.key);
    return y;
  }

  layer_h(key: string): number {
    const c = ING[key].cat;
    return c === "bread" ? 6 : c === "meat" ? 4 : c === "cheese" ? 3 : key === "lettuce" || key === "tomato" ? 3 : 2;
  }

  complete(timed_out: boolean) {
    const o = this.order;
    o.timed_out = timed_out;
    const missing = o.items.length - o.idx;
    let score = 100 - 15 * o.mistakes - Math.round(Math.min(o.t, ORDER_TIME) * 2) - missing * 10;
    score = Math.max(0, Math.min(100, score));
    o.score = score;
    o.perfect = score >= 90;
    const coins = Math.floor(score / 10) + (o.perfect ? 5 : 0);
    this.earned += coins;
    if (o.perfect) this.perfects += 1;
    this.phase = "review";
    this.phase_t = 0;
    const tier = SUB_LINES.find((t) => score >= t[0]) || SUB_LINES[SUB_LINES.length - 1];
    this.reaction = tier[1];
    this.reaction_line = pg.random.choice(tier[2]);
    if (o.perfect) {
      this.game.audio.play("star");
      this.particles.burst("sparkle", 163, 80, 16, 50);
      this.particles.burst("heart", 250, 44, 5, 20);
      this.particles.burst("heart", 288, 44, 5, 20);
    } else if (score >= 40) {
      this.game.audio.play("wrap");
    } else {
      this.game.audio.play("sad");
      this.game.shake(2, 0.2);
    }
    for (let i = 0; i < Math.min(8, coins); i++) this.particles.add("coin", 266, 84);
    this.particles.text(`+${coins}`, 266, 76, [200, 150, 40]);
  }

  next_order() {
    this.order_i += 1;
    if (this.order_i >= N_ORDERS) {
      this.finish();
      return;
    }
    this.orders.push(this.make_order());
    this.phase = "play";
    this.phase_t = 0;
    this.game.audio.play("chime", 0.6);
  }

  finish() {
    const st = this.game.state;
    st.stats = st.stats || {};
    st.coins = (st.coins || 0) + this.earned;
    st.total_coins = (st.total_coins || 0) + this.earned;
    st.stats.perfect_subs = (st.stats.perfect_subs || 0) + this.perfects;
    st.stats.subs_made = (st.stats.subs_made || 0) + N_ORDERS;
    this.phase = "final";
    this.phase_t = 0;
    this.game.audio.play("coin");
    for (let i = 0; i < 12; i++) this.particles.add("coin", 160, 100);
    if (this.perfects) this.particles.burst("sparkle", 160, 80, 14, 50);
    announce_all(this.game);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.game.pop();
    if (this.on_done) this.on_done(this.phase === "final" ? this.earned : 0);
    this.game.save();
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
    if (this.phase === "review") {
      const press = (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) || (e.type === pg.KEYDOWN && (e.key === pg.K_SPACE || e.key === pg.K_RETURN));
      if (press && this.phase_t > 0.6) this.next_order();
      return;
    }
    if (this.phase === "play" && e.type === pg.MOUSEBUTTONDOWN && e.button === 1 && this.phase_t > 0.15) {
      for (let i = 0; i < INGS.length; i++) {
        const r = this.bin_rect(i);
        if (r.collidepoint(this.game.mpos)) {
          this.pick(INGS[i].key, r.centerx, r.y);
          return;
        }
      }
    }
  }

  update(dt: number) {
    this.t += dt;
    this.phase_t += dt;
    this.particles.update(dt);
    const o = this.order;
    if (o) for (const l of o.layers) l.age += dt;
    if (this.phase === "play" && o) {
      o.t += dt;
      if (o.t >= ORDER_TIME) {
        this.game.audio.play("tick");
        this.particles.text("TOO SLOW!", 163, 60, ui.BAD);
        this.complete(true);
      } else if (o.t > ORDER_TIME - 3 && Math.floor(o.t) !== Math.floor(o.t - dt)) {
        this.game.audio.play("tick", 0.5);
      }
    }
    if (this.phase === "review" && this.phase_t > 2.6) this.next_order();
  }

  draw(s: Surface) {
    const st = this.game.state;
    const m = this.game.mpos;
    dim(s, 150);
    ui.panel(s, [6, 4, 308, 172], [250, 246, 230], [40, 90, 50]);
    pg.draw.rect(s, [56, 132, 74], [7, 5, 306, 16]);
    for (let x = 8; x < 312; x += 8) pg.draw.rect(s, [250, 210, 60], [x, 20, 4, 2]);
    font.draw(s, "SANDWICH ARTIST", [160, 8], [255, 224, 80], 2, [30, 80, 40], "center");
    s.blit(sprites.icon("coin"), [276, 9]);
    font.draw(s, String(st.coins), [290, 11], [255, 240, 200]);

    if (this.phase === "intro") {
      ui.panel(s, [30, 30, 260, 104], [255, 255, 255], ui.BORDER, false);
      if (this.thursday) font.draw(s, "TURKEY THURSDAY!", [160, 36], [210, 110, 50], 2, null, "center");
      else font.draw(s, "TODAY'S SIDE GIG", [160, 36], ui.ACCENT, 2, null, "center");
      font.draw_wrapped(s, `Make ${N_ORDERS} subs in a row! Read each ticket and click the ingredient bins in order: bread, meat, cheese, veggies, then sauce.`,
        [40, 52, 240, 30], ui.INK);
      font.draw_wrapped(s, "Wrong pick = -15 points. Every second counts. Score 90+ for a PERFECT SUB and a 5 coin tip!",
        [40, 82, 240, 30], ui.INK);
      for (let i = 0; i < INGS.length; i += 2) s.blit(ing_icon(INGS[i].key), [44 + i * 15, 112]);
      this.start_btn.draw(s, m);
      this.nah_btn.draw(s, m);
      this.particles.draw(s);
      return;
    }

    if (this.phase === "final") {
      ui.panel(s, [40, 30, 240, 110], [255, 255, 255], ui.BORDER, false);
      font.draw(s, "SHIFT OVER!", [160, 36], ui.ACCENT, 2, null, "center");
      this.orders.forEach((o: Order, i: number) => {
        const y = 56 + i * 14;
        const coins = Math.floor(o.score / 10) + (o.perfect ? 5 : 0);
        font.draw(s, `ORDER ${i + 1}`, [56, y], ui.INK);
        font.draw(s, `${o.score} PTS`, [150, y], o.perfect ? ui.GOOD : o.score >= 40 ? ui.INK : ui.BAD, 1, null, "center");
        if (o.perfect) font.draw(s, font.STAR, [176, y], ui.GOLD);
        font.draw(s, `+${coins}`, [262, y], [190, 140, 30], 1, null, "right");
      });
      font.draw(s, `YOU EARNED ${this.earned} COINS!`, [160, 104], [200, 140, 30], 2, [255, 240, 200], "center");
      if (this.perfects) font.draw(s, `${this.perfects} PERFECT SUB${this.perfects > 1 ? "S" : ""}!`, [160, 122], ui.GOOD, 1, null, "center");
      this.ok_btn.draw(s, m);
      this.particles.draw(s);
      return;
    }

    const o = this.order;
    // ---- ticket
    const tk = new Rect(12, 26, 88, 106);
    ui.panel(s, tk, [255, 255, 250], [170, 160, 150], false);
    for (let x = tk.x + 2; x < tk.right - 2; x += 4) s.set_at([x, tk.bottom - 2], [200, 190, 180]);
    if (this.thursday) font.draw(s, "TURKEY THURSDAY!", [tk.centerx, tk.y + 4], [210, 110, 50], 1, null, "center");
    else font.draw(s, `ORDER ${this.order_i + 1}/${N_ORDERS}`, [tk.centerx, tk.y + 4], ui.ACCENT, 1, null, "center");
    pg.draw.line(s, [210, 200, 190], [tk.x + 4, tk.y + 11], [tk.right - 5, tk.y + 11]);
    o.items.forEach((k: string, i: number) => {
      const y = tk.y + 14 + i * 13;
      const done = i < o.idx;
      const cur = i === o.idx && this.phase === "play";
      if (cur) {
        const bob = Math.floor(this.t * 6) % 2;
        pg.draw.rect(s, [255, 236, 200], [tk.x + 2, y - 1, tk.w - 4, 13]);
        font.draw(s, "}", [tk.x + 2 + bob, y + 4], ui.ACCENT);
      }
      s.blit(ing_icon(k), [tk.x + 9, y - 1]);
      font.draw(s, ING[k].name.toUpperCase(), [tk.x + 25, y + 4], done ? ui.MUTED : ui.INK);
      if (done) {
        pg.draw.line(s, ui.MUTED, [tk.x + 24, y + 6], [tk.x + 25 + font.text_width(ING[k].name), y + 6]);
        font.draw(s, "✓", [tk.right - 9, y + 4], ui.GOOD);
      }
    });
    if (this.thursday) font.draw(s, `ORDER ${this.order_i + 1}/${N_ORDERS}`, [tk.centerx, tk.bottom - 10], ui.MUTED, 1, null, "center");

    // ---- timer bar
    const frac = Math.max(0, 1 - o.t / ORDER_TIME);
    const bar = new Rect(108, 27, 112, 6);
    pg.draw.rect(s, [60, 50, 70], bar.inflate(2, 2));
    pg.draw.rect(s, [220, 214, 220], bar);
    const tcol: pg.Color = frac > 0.5 ? ui.GOOD : frac > 0.25 ? ui.GOLD : (Math.floor(this.t * 8) % 2 ? ui.BAD : [255, 150, 150]);
    pg.draw.rect(s, tcol, [bar.x, bar.y, Math.round(bar.w * frac), bar.h]);
    font.draw(s, `${Math.ceil(ORDER_TIME - Math.min(o.t, ORDER_TIME))}S`, [bar.centerx, bar.bottom + 3], ui.MUTED, 1, null, "center");

    // ---- cutting board + sandwich
    pg.draw.rect(s, [170, 120, 70], [110, 120, 106, 10]);
    pg.draw.rect(s, [200, 150, 96], [110, 120, 106, 3]);
    pg.draw.rect(s, [120, 82, 50], [110, 129, 106, 1]);
    pg.draw.ellipse(s, [210, 200, 190], [118, 117, 90, 5]);
    let y = 120;
    for (const l of o.layers) {
      const drop = Math.max(0, 1 - l.age / 0.14);
      const h = this.layer_h(l.key);
      draw_layer(s, l.key, 163, Math.round(y - drop * 24), 64);
      y -= h;
    }
    if (this.phase === "review" && !o.timed_out && o.layers.length) {
      const drop = Math.max(0, 1 - this.phase_t / 0.18);
      draw_layer(s, o.items[0], 163, Math.round(y + 1 - drop * 26), 64, true);
      // wrap flag
      if (this.phase_t > 0.3) {
        pg.draw.line(s, [120, 100, 80], [170, y - 10], [170, y - 20]);
        pg.draw.rect(s, [56, 132, 74], [171, y - 20, 8, 5]);
      }
    }

    // ---- customer + zoe
    const cust = o.customer;
    draw_portrait(s, safe_portrait(cust), 232, 26, [220, 236, 250]);
    draw_portrait(s, sprites.zoe_portrait(st.hair, st.outfit), 272, 26, [250, 220, 230]);
    font.draw(s, cap(cust).toUpperCase(), [248, 65], ui.INK, 1, null, "center");
    font.draw(s, "ZOE", [288, 65], ui.INK, 1, null, "center");
    s.blit(sprites.icon("coin"), [240, 76]);
    font.draw(s, `EARNED ${this.earned}`, [254, 79], [190, 140, 30]);
    for (let i = 0; i < N_ORDERS; i++) {
      const done = this.orders[i] && (i < this.order_i || this.phase === "review");
      const ox = 246 + i * 18;
      pg.draw.rect(s, done ? (this.orders[i].perfect ? ui.GOLD : [230, 220, 200]) : [236, 232, 226], [ox, 88, 14, 7]);
      pg.draw.rect(s, ui.BORDER, [ox, 88, 14, 7], 1);
      if (done && this.orders[i].perfect) font.draw(s, font.STAR, [ox + 5, 89], [200, 120, 20]);
    }

    if (this.phase === "review") {
      const pop = Math.min(1, this.phase_t / 0.2);
      const col: pg.Color = o.perfect ? [240, 170, 30] : o.score >= 70 ? ui.GOOD : o.score >= 40 ? ui.INK : ui.BAD;
      if (pop >= 1 || Math.floor(this.phase_t * 20) % 2) {
        font.draw(s, this.reaction, [163, 50], col, 2, [255, 255, 255], "center");
      }
      font.draw(s, `${o.score} PTS`, [163, 64], ui.MUTED, 1, null, "center");
      // speech bubble
      const bub = new Rect(224, 100, 88, 30);
      ui.panel(s, bub, [255, 255, 255], ui.BORDER, false);
      pg.draw.polygon(s, [255, 255, 255], [[244, 101], [250, 101], [247, 96]]);
      pg.draw.line(s, ui.BORDER, [244, 100], [247, 96]);
      pg.draw.line(s, ui.BORDER, [250, 100], [247, 96]);
      font.draw_wrapped(s, this.reaction_line, [bub.x + 4, bub.y + 4, bub.w - 8, 24], ui.INK);
      if (o.perfect && Math.floor(this.t * 4) % 2) {
        font.draw(s, font.HEART, [301, 30], [240, 90, 120]);
        font.draw(s, font.HEART, [234, 30], [240, 90, 120]);
      }
    } else if (o.mistakes) {
      font.draw(s, `OOPS X${o.mistakes}`, [268, 104], ui.BAD, 1, null, "center");
    }

    // ---- bins
    let hov = -1;
    for (let i = 0; i < INGS.length; i++) {
      const r = this.bin_rect(i);
      const h = this.phase === "play" && r.collidepoint(m);
      if (h) hov = i;
      const rr = h ? r.move(0, -1) : r;
      ui.panel(s, rr, h ? sprites.lighter(CAT_TINT[INGS[i].cat], 0.5) : CAT_TINT[INGS[i].cat], h ? ui.ACCENT : ui.BORDER, !h);
      pg.draw.rect(s, sprites.darker(INGS[i].c1, 0.9), [rr.x + 2, rr.bottom - 5, rr.w - 4, 3]);
      s.blit(ing_icon(INGS[i].key), [rr.x + 2, rr.y + 1]);
    }
    if (hov >= 0) {
      const r = this.bin_rect(hov);
      const name = INGS[hov].name.toUpperCase();
      const tw = font.text_width(name) + 6;
      const lx = Math.max(8, Math.min(312 - tw, r.centerx - Math.floor(tw / 2)));
      ui.panel(s, [lx, 128, tw, 9], [255, 250, 214], [200, 150, 60], false);
      font.draw(s, name, [lx + 3, 130], ui.INK);
    }
    const hint = this.phase === "review" ? "CLICK TO SERVE THE NEXT CUSTOMER" : "CLICK INGREDIENTS IN ORDER!";
    font.draw(s, hint, [160, 164], ui.MUTED, 1, null, "center");
    this.particles.draw(s);
  }
}

// ====================================================================== darts
const DART_SKILL: Record<string, number> = {
  andrew: 0.4, jayden: 0.5, stephen: 0.6, danny: 0.7, renee: 0.55, tish: 0.65, shteynie: 0.75, greg: 0.55,
};
const DART_BET = 10;
const DART_WIN_LINES: Record<string, string> = {
  andrew: "Wait, you were aiming? Okay, rematch!",
  jayden: "Fine, fine. You've got a good arm, Doc.",
  stephen: "That was luck. Pure luck. ...Nice throws.",
  danny: "Well played, Zoe. I owe you one.",
  renee: "Okay, you're on my team next time!",
  tish: "Wow! Where'd you learn to throw like that?",
  shteynie: "Hmph. Beginner's luck. Good game, though!",
};
const DART_LOSE_LINES: Record<string, string> = {
  andrew: "I won?! Somebody take a picture!",
  jayden: "Better luck next time! You're close!",
  stephen: "Told you I'm the darts king. Pay up!",
  danny: "Keep your elbow steady. You'll get me.",
  renee: "Good try! Wanna go again sometime?",
  tish: "Ha! Drinks are on you, Zoe!",
  shteynie: "Years of practice, my friend. Years.",
};

const BX = 234, BY = 90, BR = 50, RIM = 56;

function ring_score(dx: number, dy: number): number {
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= 4) return 50;
  if (d <= 10) return 25;
  if (d <= 22) return 15;
  if (d <= 36) return 10;
  if (d <= BR) return 5;
  return 0;
}

function dartboard(): Surface {
  return sprites.cached("mg2_dartboard", () => {
    const size = RIM * 2 + 1;
    const s = new Surface([size, size], pg.SRCALPHA);
    const c = RIM;
    const cream: pg.Color = [240, 226, 190], black: pg.Color = [44, 38, 44];
    const red: pg.Color = [214, 56, 56], green: pg.Color = [44, 148, 76];
    const wire: pg.Color = [190, 190, 200];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - c, dy = y - c;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > RIM + 0.5) continue;
        const seg = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 20 + 0.5) % 2;
        let col: pg.Color;
        if (d > BR + 0.5) col = d > RIM - 0.5 ? [20, 16, 20] : [30, 26, 32];
        else if (d <= 4) col = red;
        else if (d <= 10) col = green;
        else if (d <= 22) col = seg ? cream : black;
        else if (d <= 36) col = seg ? red : green;
        else col = seg ? cream : black;
        const edge = [4, 10, 22, 36, BR].some((r) => Math.abs(d - r) < 0.5);
        s.set_at([x, y], edge ? wire : col);
      }
    }
    // little number ticks on the rim
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      s.set_at([Math.round(c + Math.cos(a) * (RIM - 3)), Math.round(c + Math.sin(a) * (RIM - 3))], [220, 220, 230]);
    }
    return s;
  });
}

type Dart = { x: number; y: number; who: "zoe" | "rival"; score: number; t: number; fx: number; fy: number };

function draw_dart(s: Surface, d: Dart) {
  const k = Math.min(1, d.t / 0.14);
  const x = Math.round(d.fx + (d.x - d.fx) * k);
  const y = Math.round(d.fy + (d.y - d.fy) * k);
  const flight: pg.Color = d.who === "zoe" ? [240, 128, 160] : [100, 160, 240];
  const len = k < 1 ? 7 : 5;
  pg.draw.line(s, [150, 150, 160], [x, y], [x + len, y - len]);
  pg.draw.line(s, [80, 70, 90], [x + 1, y - 1], [x + 2, y - 2]);
  pg.draw.polygon(s, flight, [[x + len, y - len], [x + len + 3, y - len], [x + len, y - len - 3]]);
  pg.draw.line(s, sprites.darker(flight, 0.7), [x + len, y - len], [x + len + 2, y - len - 2]);
  s.set_at([x, y], [30, 26, 32]);
}

export class DartsGame extends Scene {
  overlay = true;

  constructor(game: any, rival: string, on_done: ((result: string, line: string) => void) | null = null) {
    super(game);
    this.rival = rival;
    this.skill = DART_SKILL[rival] ?? 0.5;
    this.on_done = on_done;
    this.phase = "intro"; // intro | aim | zoe_land | rival_aim | rival_land | final
    this.round = 0;
    this.zoe_pts = 0;
    this.rival_pts = 0;
    this.zoe_throws = [] as number[];
    this.rival_throws = [] as number[];
    this.darts = [] as Dart[];
    this.t = 0;
    this.phase_t = 0;
    this.aim_t = 0;
    this.cx = BX;
    this.cy = BY;
    this.outcome = "none";
    this.closed = false;
    this.particles = new ui.Particles();
    this.start_btn = new ui.Button([30, 146, 64, 14], "Let's go!", () => this.begin(), true, null, [250, 220, 140], pg.K_RETURN);
    this.nah_btn = new ui.Button([100, 146, 64, 14], "Nah", () => this.close("none"), true, null, null, pg.K_ESCAPE);
    this.ok_btn = new ui.Button([64, 146, 64, 14], "Done", () => this.close(this.outcome), true, null, null, pg.K_RETURN);
  }

  get name(): string {
    return cap(this.rival);
  }

  begin() {
    const st = this.game.state;
    if (st.coins < DART_BET) {
      this.game.audio.play("error");
      this.flash = `You need ${DART_BET} coins to bet!`;
      this.flash_t = 2;
      return;
    }
    this.phase = "aim";
    this.phase_t = 0;
    this.aim_t = pg.random.uniform(0, 10);
    this.game.audio.play("whoosh", 0.5);
  }

  crosshair(): [number, number] {
    const tipsy = Math.max(0, Math.min(150, this.game.state.tipsy || 0));
    const amp = 1 + tipsy / 100;
    const t = this.aim_t;
    const w = 1.7 + this.round * 0.15;
    const ox = BX + 6 * Math.sin(t * 0.53) + 3 * Math.sin(t * 1.9);
    const oy = BY + 5 * Math.cos(t * 0.41);
    const jit = (tipsy / 150) * 4;
    let x = ox + 30 * amp * Math.sin(t * w) + jit * Math.sin(t * 7.3);
    let y = oy + 14 * amp * Math.sin(2 * t * w) + jit * Math.cos(t * 6.1);
    x = Math.max(172, Math.min(300, x));
    y = Math.max(28, Math.min(160, y));
    return [x, y];
  }

  add_dart(x: number, y: number, who: "zoe" | "rival"): number {
    const rx = Math.round(x), ry = Math.round(y);
    const score = ring_score(rx - BX, ry - BY);
    this.darts.push({ x: rx, y: ry, who, score, t: 0, fx: rx + 26, fy: ry + 40 });
    this.game.audio.play("whoosh", 0.6);
    return score;
  }

  land_fx(d: Dart) {
    const col: pg.Color = d.score >= 50 ? [255, 220, 80] : d.score >= 15 ? ui.GOOD : d.score > 0 ? [255, 255, 255] : ui.BAD;
    const label = d.score >= 50 ? "BULLSEYE!" : d.score > 0 ? `+${d.score}` : "MISS!";
    this.particles.text(label, d.x, d.y - 10, col);
    if (d.score >= 50) {
      this.game.audio.play("star");
      this.particles.burst("sparkle", d.x, d.y, 18, 50);
      this.game.shake(1, 0.15);
    } else if (d.score === 0) {
      this.game.audio.play(d.who === "zoe" ? "error" : "tick");
      this.game.shake(3, 0.25);
      this.particles.burst("puff", d.x, d.y, 5, 14);
    } else {
      this.game.audio.play(d.score >= 15 ? "pop" : "tick");
      this.particles.burst("puff", d.x, d.y, 3, 10);
      if (d.score >= 25) this.particles.burst("sparkle", d.x, d.y, 6, 20);
    }
  }

  throw_zoe() {
    const [x, y] = this.crosshair();
    const sc = this.add_dart(x, y, "zoe");
    this.zoe_throws.push(sc);
    this.zoe_pts += sc;
    if (sc >= 50) {
      const st = this.game.state;
      st.stats = st.stats || {};
      st.stats.bullseyes = (st.stats.bullseyes || 0) + 1;
    }
    this.phase = "zoe_land";
    this.phase_t = 0;
    this.landed = false;
  }

  plan_rival() {
    // half-normal miss distance, tighter for better players
    const g = (pg.random.random() + pg.random.random() + pg.random.random() - 1.5) * 2;
    const sigma = (1 - this.skill) * 45;
    const r = Math.min(RIM + 4, Math.abs(g) * sigma);
    const a = pg.random.uniform(0, Math.PI * 2);
    this.rtx = BX + Math.cos(a) * r;
    this.rty = BY + Math.sin(a) * r;
    this.rsx = BX + pg.random.uniform(-40, 40);
    this.rsy = BY + pg.random.uniform(-30, 30);
  }

  rival_cross(): [number, number] {
    const k = Math.min(1, this.phase_t / 0.9);
    const e = 1 - (1 - k) * (1 - k);
    const wob = (1 - k) * 6;
    return [
      this.rsx + (this.rtx - this.rsx) * e + Math.sin(this.t * 9) * wob,
      this.rsy + (this.rty - this.rsy) * e + Math.cos(this.t * 7) * wob,
    ];
  }

  throw_rival() {
    const sc = this.add_dart(this.rtx, this.rty, "rival");
    this.rival_throws.push(sc);
    this.rival_pts += sc;
    this.phase = "rival_land";
    this.phase_t = 0;
    this.landed = false;
  }

  finish() {
    const st = this.game.state;
    st.stats = st.stats || {};
    if (this.zoe_pts > this.rival_pts) {
      st.coins += DART_BET;
      st.total_coins = (st.total_coins || 0) + DART_BET;
      st.stats.darts_won = (st.stats.darts_won || 0) + 1;
      this.outcome = "win";
      this.game.audio.play("coin");
      for (let i = 0; i < 10; i++) this.particles.add("coin", 96, 110);
      this.particles.burst("sparkle", 96, 100, 12, 40);
    } else if (this.zoe_pts < this.rival_pts) {
      st.coins = Math.max(0, st.coins - DART_BET);
      this.outcome = "lose";
      this.game.audio.play("sad");
    } else {
      this.outcome = "draw";
      this.game.audio.play("blip");
    }
    this.phase = "final";
    this.phase_t = 0;
    announce_all(this.game);
    this.game.save();
  }

  close(result: string) {
    if (this.closed) return;
    this.closed = true;
    this.game.pop();
    const line = result === "win" ? DART_WIN_LINES[this.rival] || "Nice throwing, Zoe! Good game."
      : result === "lose" ? DART_LOSE_LINES[this.rival] || "Ha! Got you this time. Good game!"
      : result === "draw" ? "A tie?! Nobody pays. Rematch soon!" : "";
    if (this.on_done) this.on_done(result, line);
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
    if (this.phase === "aim" && press && this.phase_t > 0.25) this.throw_zoe();
  }

  update(dt: number) {
    this.t += dt;
    this.phase_t += dt;
    this.particles.update(dt);
    if (this.flash_t > 0) this.flash_t -= dt;
    for (const d of this.darts as Dart[]) {
      const before = d.t;
      d.t += dt;
      if (before < 0.14 && d.t >= 0.14) this.land_fx(d);
    }
    if (this.phase === "aim") this.aim_t += dt;
    if (this.phase === "zoe_land" && this.phase_t > 1.0) {
      this.plan_rival();
      this.phase = "rival_aim";
      this.phase_t = 0;
    }
    if (this.phase === "rival_aim" && this.phase_t > 1.1) this.throw_rival();
    if (this.phase === "rival_land" && this.phase_t > 1.1) {
      this.round += 1;
      if (this.round >= 3) this.finish();
      else {
        this.phase = "aim";
        this.phase_t = 0;
      }
    }
  }

  draw(s: Surface) {
    const st = this.game.state;
    const m = this.game.mpos;
    dim(s, 150);
    ui.panel(s, [20, 10, 280, 160], [58, 40, 44], [34, 22, 26]);
    // wood wall behind board
    pg.draw.rect(s, [84, 56, 50], [172, 14, 124, 152]);
    for (let y = 22; y < 166; y += 12) pg.draw.line(s, [70, 46, 42], [172, y], [295, y]);
    pg.draw.circle(s, [20, 14, 18], [BX + 2, BY + 3], RIM + 1);
    s.blit(dartboard(), [BX - RIM, BY - RIM]);
    for (const d of this.darts as Dart[]) draw_dart(s, d);

    font.draw(s, "DARTS!", [96, 16], [255, 220, 120], 2, [120, 60, 40], "center");
    // portraits
    draw_portrait(s, sprites.zoe_portrait(st.hair, st.outfit), 30, 32, [250, 220, 230]);
    draw_portrait(s, safe_portrait(this.rival), 130, 32, [220, 236, 250]);
    font.draw(s, "ZOE", [46, 71], [255, 240, 220], 1, null, "center");
    font.draw(s, this.name.toUpperCase(), [146, 71], [255, 240, 220], 1, null, "center");
    font.draw(s, `${this.zoe_pts} - ${this.rival_pts}`, [97, 46], [255, 255, 255], 2, null, "center");
    font.draw(s, "VS", [97, 60], [200, 170, 160], 1, null, "center");
    // throw pips
    for (let i = 0; i < 3; i++) {
      this.draw_pip(s, 26 + i * 14, 80, this.zoe_throws[i], [240, 128, 160]);
      this.draw_pip(s, 126 + i * 14, 80, this.rival_throws[i], [100, 160, 240]);
    }

    if (this.phase === "intro") {
      font.draw_wrapped(s, `${this.name} bets ${DART_BET} coins! 3 darts each, highest total wins. The aim drifts - throw when it's on the bullseye!`,
        [28, 94, 140, 40], [255, 240, 220]);
      font.draw(s, "BULL 50  25  15  10  5", [97, 124], [200, 180, 170], 1, null, "center");
      font.draw(s, `YOU HAVE ${st.coins} COINS`, [97, 134], [255, 220, 120], 1, null, "center");
      this.start_btn.draw(s, m);
      this.nah_btn.draw(s, m);
    } else if (this.phase === "final") {
      const txt = this.outcome === "win" ? `YOU WIN ${DART_BET}!` : this.outcome === "lose" ? `YOU LOSE ${DART_BET}` : "IT'S A DRAW!";
      const col = this.outcome === "win" ? [255, 230, 120] : this.outcome === "lose" ? [250, 160, 160] : [230, 230, 240];
      font.draw(s, txt, [97, 104], col, 2, [60, 30, 30], "center");
      if (this.outcome === "win") font.draw(s, "COINS!", [97, 120], col, 1, null, "center");
      this.ok_btn.draw(s, m);
    } else {
      font.draw(s, `ROUND ${this.round + 1} OF 3`, [97, 96], [255, 240, 220], 1, null, "center");
      const zoe_turn = this.phase === "aim" || this.phase === "zoe_land";
      const turn = zoe_turn ? "YOUR THROW!" : `${this.name.toUpperCase()}'S THROW...`;
      const blink = this.phase === "aim" && Math.floor(this.t * 3) % 2 === 0;
      font.draw(s, turn, [97, 108], blink ? [255, 240, 200] : [255, 220, 120], 1, null, "center");
      if ((st.tipsy || 0) > 0) font.draw(s, "*HIC* THE BOARD IS WOBBLY...", [97, 120], [200, 140, 200], 1, null, "center");
      font.draw(s, "CLICK / SPACE TO THROW", [97, 158], [200, 180, 170], 1, null, "center");
      if (this.phase === "aim") {
        const [x, y] = this.crosshair();
        this.draw_cross(s, Math.round(x), Math.round(y), [255, 255, 255], [240, 90, 120]);
      } else if (this.phase === "rival_aim") {
        const [x, y] = this.rival_cross();
        this.draw_cross(s, Math.round(x), Math.round(y), [200, 220, 255], [90, 140, 230]);
      }
    }
    if (this.flash && this.flash_t > 0) font.draw(s, this.flash, [97, 136], [255, 160, 160], 1, null, "center");
    this.particles.draw(s);
  }

  draw_pip(s: Surface, x: number, y: number, v: number | undefined, c: pg.Color) {
    const has = v !== undefined;
    pg.draw.rect(s, has ? (v! >= 50 ? ui.GOLD : [250, 244, 236]) : [90, 66, 70], [x, y, 12, 9]);
    pg.draw.rect(s, has ? c : [120, 90, 96], [x, y, 12, 9], 1);
    if (has) font.draw(s, String(v), [x + 6, y + 2], v! > 0 ? ui.INK : ui.BAD, 1, null, "center");
  }

  draw_cross(s: Surface, x: number, y: number, c: pg.Color, c2: pg.Color) {
    const pulse = Math.floor(this.t * 8) % 2;
    const r = 5 + pulse;
    pg.draw.circle(s, c2, [x, y], r, 1);
    pg.draw.line(s, c, [x - r - 3, y], [x - 2, y]);
    pg.draw.line(s, c, [x + 2, y], [x + r + 3, y]);
    pg.draw.line(s, c, [x, y - r - 3], [x, y - 2]);
    pg.draw.line(s, c, [x, y + 2], [x, y + r + 3]);
    s.set_at([x, y], c2);
  }
}
