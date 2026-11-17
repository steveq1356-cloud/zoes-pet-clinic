/* Clery's bar games: top-down pool against a friend. All pixel art is drawn in code. */
import * as pg from "./pg";
import { Surface } from "./pg";
import * as data from "./data";
import * as font from "./font";
import * as sprites from "./sprites";
import * as ui from "./ui";
import * as gstate from "./state";
import { Scene } from "./engine";

type Col = pg.Color;
type Done = ((result: string, line: string) => void) | null;

// ====================================================================== shared helpers
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function cap(name: string): string {
  const n = String(name || "friend");
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function lerp_col(a: Col, b: Col, k: number): Col {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k));
}

function gauss(): number {
  const u1 = 1 - pg.random.random();
  const u2 = pg.random.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function dim(s: Surface, a = 120) {
  const v = sprites.cached("bargames_dim|" + a, () => {
    const d = new Surface([320, 180], pg.SRCALPHA);
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

function stats_of(game: any): any {
  const st = game.state;
  st.stats = st.stats || {};
  return st.stats;
}

/** A look for anyone: the real one from data.PEOPLE, or a stable made-up one. */
const GUEST_LOOKS: any[] = [
  { skin: [240, 200, 170], hair: [90, 60, 40], style: "short", shirt: [200, 110, 90], pants: [60, 70, 100], shoes: [40, 40, 40] },
  { skin: [200, 150, 110], hair: [30, 24, 24], style: "short", shirt: [110, 170, 200], pants: [70, 60, 60], shoes: [240, 240, 240] },
  { skin: [250, 214, 190], hair: [220, 180, 90], style: "bob", shirt: [160, 120, 200], pants: [60, 60, 80], shoes: [90, 60, 50] },
  { skin: [170, 120, 90], hair: [50, 36, 30], style: "long", shirt: [240, 170, 80], pants: [80, 80, 110], shoes: [60, 40, 40] },
];

function has_person(name: string): boolean {
  try {
    return !!(data.PEOPLE && name && data.PEOPLE[name]);
  } catch (_e) {
    return false;
  }
}

function look_key(name: string): any[] {
  return has_person(name) ? ["npc", name] : ["bargames_guest", String(name)];
}

function look_of(name: string): any {
  if (has_person(name)) return data.PEOPLE[name];
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GUEST_LOOKS[h % GUEST_LOOKS.length];
}

function friend_sprite(name: string, d = "down", frame = 0): Surface | null {
  try {
    return sprites.person(look_key(name), look_of(name), d, frame);
  } catch (_e) {
    return null;
  }
}

function friend_portrait(name: string): Surface | null {
  try {
    return sprites.portrait(look_key(name), look_of(name));
  } catch (_e) {
    return null;
  }
}

function zoe_sprite(st: any, frame = 0): Surface | null {
  try {
    return sprites.zoe(st.hair, st.outfit, "down", frame);
  } catch (_e) {
    return null;
  }
}

function zoe_portrait(st: any): Surface | null {
  try {
    return sprites.zoe_portrait(st.hair, st.outfit);
  } catch (_e) {
    return null;
  }
}

function draw_portrait(s: Surface, p: Surface | null, x: number, y: number, fill: Col) {
  ui.panel(s, [x, y, 32, 36], fill, ui.BORDER, false);
  if (p) s.blit(p, [x + 4, y + 4]);
  else font.draw(s, "?", [x + 16, y + 12], ui.MUTED, 2, null, "center");
}

/** A little 12x13 head crop of a 16x24 person sprite (for HUDs). */
function draw_head(s: Surface, spr: Surface | null, x: number, y: number, fill: Col) {
  pg.draw.rect(s, ui.BORDER, [x - 1, y - 1, 14, 15]);
  pg.draw.rect(s, fill, [x, y, 12, 13]);
  if (spr) s.blit(spr, [x, y], [2, 0, 12, 13]);
}

function scale2(key: string, spr: Surface | null): Surface | null {
  if (!spr) return null;
  try {
    return sprites.scaled("bargames2x|" + key, spr, 2);
  } catch (_e) {
    return null;
  }
}

// ====================================================================== POOL
const POOL_SKILL: Record<string, number> = {
  andrew: 0.4, jayden: 0.55, stephen: 0.6, danny: 0.7, renee: 0.5, tish: 0.6, shteynie: 0.78, greg: 0.55,
};
const POOL_BET = 10;
const POOL_WIN_N = 3; // first to sink 3 of your own balls
const POOL_SHOTS = 8; // shots each before it goes to the count
const POOL_WIN_LINES: Record<string, string> = {
  andrew: "You ran the table on me! I didn't even get to chalk!",
  jayden: "Okay, Doc. Steady hands. I see why the pets trust you.",
  stephen: "The table's tilted. I'm sure of it. ...Good game.",
  danny: "Clean shooting, Zoe. You've been practicing.",
  renee: "Wow! You're basically a pool shark now!",
  tish: "Fine, you win. But I looked cooler losing.",
  shteynie: "Hmph. I let you win. That's my story, anyway.",
  greg: "Nice shooting! Remind me never to bet against you.",
};
const POOL_LOSE_LINES: Record<string, string> = {
  andrew: "I won?! I'm framing this cue.",
  jayden: "Better luck next rack, Doc!",
  stephen: "Pool king AND darts king. Pay up, Zoe!",
  danny: "Follow through on your stroke. You'll get me.",
  renee: "Good game! Want me to show you a trick shot?",
  tish: "Ha! That's another round on you!",
  shteynie: "Angles, my friend. It's all angles.",
  greg: "Ha! Good game though. Rematch whenever!",
};

const FX0 = 36, FY0 = 30, FX1 = 284, FY1 = 146; // felt = where ball centres live (+/- radius)
const FCX = 160, FCY = 88;
const BR = 3; // ball radius
const TABLE_X = 26, TABLE_Y = 20, TABLE_W = 268, TABLE_H = 136;
/** pocket centre x, y, capture radius, is-middle */
const POCKETS: [number, number, number, boolean][] = [
  [FX0 - 1, FY0 - 1, 8, false], [FCX, FY0 - 2, 6, true], [FX1 + 1, FY0 - 1, 8, false],
  [FX0 - 1, FY1 + 1, 8, false], [FCX, FY1 + 2, 6, true], [FX1 + 1, FY1 + 1, 8, false],
];
const FRIC_A = 30, FRIC_B = 0.6; // dv/dt = -(A + B v)
const BALL_E = 0.94, CUSH_E = 0.72;
const MIN_SPEED = 30, MAX_SPEED = 440;
const HEAD_X = FX0 + (FX1 - FX0) * 0.25, FOOT_X = FX0 + (FX1 - FX0) * 0.7;
const ZOE_BALL: Col = [236, 84, 128], RIVAL_BALL: Col = [70, 120, 230];

type Ball = {
  id: number; kind: "cue" | "zoe" | "rival" | "eight";
  x: number; y: number; vx: number; vy: number;
  sunk: boolean; sink_t: number; px: number; py: number; sx: number; sy: number;
};

function pool_table_surface(): Surface {
  return sprites.cached("bargames_pool_table", () => {
    const w = TABLE_W, h = TABLE_H;
    const s = new Surface([w, h], pg.SRCALPHA);
    const rng = new pg.Random(7);
    pg.draw.rect(s, [52, 30, 20], [0, 0, w, h]);
    pg.draw.rect(s, [128, 78, 46], [1, 1, w - 2, h - 2]);
    for (let i = 0; i < 110; i++) {
      const y = rng.randint(2, h - 3), x = rng.randint(2, w - 30), len = rng.randint(6, 28);
      pg.draw.line(s, rng.random() < 0.5 ? [112, 66, 38] : [142, 90, 54], [x, y], [x + len, y]);
    }
    pg.draw.line(s, [172, 116, 72], [2, 1], [w - 3, 1]);
    pg.draw.line(s, [84, 50, 30], [2, h - 2], [w - 3, h - 2]);
    const fx = FX0 - TABLE_X, fy = FY0 - TABLE_Y, fw = FX1 - FX0, fh = FY1 - FY0;
    pg.draw.rect(s, [72, 44, 26], [fx - 3, fy - 3, fw + 6, fh + 6]);
    pg.draw.rect(s, [28, 98, 56], [fx - 2, fy - 2, fw + 4, fh + 4]);
    // felt with an overhead-lamp glow and a little nap texture
    const edge: Col = [36, 116, 68], mid: Col = [62, 164, 100];
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const dx = (x - fw / 2) / (fw / 2), dy = (y - fh / 2) / (fh / 2);
        const k = clamp(1 - (dx * dx * 0.7 + dy * dy * 0.9) * 0.75, 0, 1);
        let c = lerp_col(edge, mid, k);
        const n = (x * 7 + y * 13 + ((x * y) % 7)) % 11;
        if (n === 0) c = sprites.darker(c, 0.93);
        else if (n === 5) c = sprites.lighter(c, 0.05);
        s.set_at([fx + x, fy + y], c);
      }
    }
    // head string + foot spot
    for (let y = fy + 2; y < fy + fh - 2; y += 3) s.set_at([HEAD_X - TABLE_X, y], [90, 186, 120]);
    s.set_at([FOOT_X - TABLE_X, FCY - TABLE_Y], [120, 210, 150]);
    // diamonds (sights) on the rails
    const dia = (x: number, y: number) => {
      s.set_at([x, y], [240, 228, 190]);
      s.set_at([x - 1, y], [200, 186, 150]);
      s.set_at([x + 1, y], [200, 186, 150]);
    };
    for (const k of [1, 2, 3, 5, 6, 7]) {
      const x = Math.round(fx + (fw * k) / 8);
      dia(x, 4);
      dia(x, h - 5);
    }
    for (const k of [1, 2, 3]) {
      const y = Math.round(fy + (fh * k) / 4);
      dia(4, y);
      dia(w - 5, y);
    }
    // pockets
    for (const [px, py, , middle] of POCKETS) {
      const x = px - TABLE_X, y = py - TABLE_Y;
      pg.draw.circle(s, [40, 28, 22], [x, y], middle ? 6 : 7);
      pg.draw.circle(s, [10, 8, 10], [x, y], middle ? 5 : 6);
      s.set_at([x - 2, y - 2], [44, 36, 40]);
    }
    return s;
  });
}

function ball_sprite(kind: string): Surface {
  return sprites.cached("bargames_ball|" + kind, () => {
    const s = new Surface([6, 6], pg.SRCALPHA);
    const base: Col = kind === "zoe" ? ZOE_BALL : kind === "eight" ? [28, 26, 32] : [246, 244, 236];
    pg.draw.circle(s, base, [3, 3], 3);
    if (kind === "rival") {
      for (let y = 2; y <= 3; y++) for (let x = 0; x < 6; x++) if (s.get_at([x, y])[3]) s.set_at([x, y], RIVAL_BALL);
    }
    // shade bottom-right, highlight top-left
    for (const [x, y] of [[4, 4], [3, 5], [5, 3], [2, 5]]) {
      const c = s.get_at([x, y]);
      if (c[3]) s.set_at([x, y], sprites.darker(c.slice(0, 3), 0.72));
    }
    if (kind === "eight") {
      s.set_at([3, 2], [240, 240, 240]);
      s.set_at([2, 1], [110, 110, 120]);
    } else s.set_at([2, 1], [255, 255, 255]);
    return s;
  });
}

function ball_shadow(): Surface {
  return sprites.cached("bargames_ball_shadow", () => {
    const s = new Surface([6, 6], pg.SRCALPHA);
    pg.draw.circle(s, [0, 20, 0, 90], [3, 3], 3);
    return s;
  });
}

function seg_dist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const L2 = dx * dx + dy * dy;
  let k = L2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / L2 : 0;
  k = clamp(k, 0, 1);
  const qx = x1 + dx * k - px, qy = y1 + dy * k - py;
  return Math.sqrt(qx * qx + qy * qy);
}

function ang_diff(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

export class PoolGame extends Scene {
  overlay = true;

  constructor(game: any, rival: string, on_done: Done = null) {
    super(game);
    this.rival = rival || "friend";
    this.skill = POOL_SKILL[this.rival] ?? 0.5;
    this.on_done = on_done;
    this.phase = "intro"; // intro | aim | roll | rival_think | rival_power | final
    this.t = 0;
    this.phase_t = 0;
    this.balls = [] as Ball[];
    this.score = { zoe: 0, rival: 0 };
    this.shots = { zoe: 0, rival: 0 };
    this.turn = "zoe";
    this.is_break = true;
    this.aim = 0;
    this.kb_aim = false;
    this.last_m = [-1, -1];
    this.charging = false;
    this.charge_t = 0;
    this.power = 0;
    this.roll_t = 0;
    this.shot_pots = [] as string[];
    this.scratch = false;
    this.snd_t = 0;
    this.banner = "";
    this.banner_t = 0;
    this.banner_col = [255, 230, 140];
    this.outcome = "none";
    this.reason = "";
    this.closed = false;
    this.particles = new ui.Particles();
    this.start_btn = new ui.Button([94, 134, 64, 14], "Let's go!", () => this.begin(), true, null, [250, 220, 140], pg.K_RETURN);
    this.nah_btn = new ui.Button([162, 134, 64, 14], "Nah", () => this.close("none"), true, null, null, pg.K_ESCAPE);
    this.ok_btn = new ui.Button([128, 118, 64, 14], "Done", () => this.close(this.outcome), true, null, null, pg.K_RETURN);
    this.rack();
  }

  get name(): string {
    return cap(this.rival);
  }

  get cue(): Ball {
    return (this.balls as Ball[])[0];
  }

  // ------------------------------------------------------------ setup
  rack() {
    const mk = (kind: Ball["kind"], x: number, y: number, id: number): Ball =>
      ({ id, kind, x, y, vx: 0, vy: 0, sunk: false, sink_t: 0, px: 0, py: 0, sx: 0, sy: 0 });
    const balls: Ball[] = [mk("cue", HEAD_X, FCY, 0)];
    const kinds: Ball["kind"][] = ["zoe", "zoe", "zoe", "zoe", "rival", "rival", "rival", "rival"];
    pg.random.shuffle(kinds);
    const rows = [1, 2, 3, 2, 1];
    const dx = 2 * BR * 0.866 + 0.15, dy = 2 * BR + 0.2;
    let id = 1;
    rows.forEach((n, r) => {
      for (let i = 0; i < n; i++) {
        const x = FOOT_X + r * dx, y = FCY + (i - (n - 1) / 2) * dy;
        const kind = r === 2 && i === 1 ? "eight" : kinds.pop()!;
        balls.push(mk(kind, x, y, id++));
      }
    });
    this.balls = balls;
  }

  begin() {
    const st = this.game.state;
    if ((st.coins || 0) < POOL_BET) {
      this.game.audio.play("error");
      this.flash = `You need ${POOL_BET} coins to bet!`;
      this.flash_t = 2;
      return;
    }
    this.game.audio.play("whoosh", 0.5);
    this.start_turn("zoe");
  }

  on_table(): Ball[] {
    return (this.balls as Ball[]).filter((b) => !b.sunk);
  }

  // ------------------------------------------------------------ turns
  start_turn(who: "zoe" | "rival") {
    this.turn = who;
    this.phase_t = 0;
    this.charging = false;
    this.power = 0;
    if (who === "zoe") {
      this.phase = "aim";
      this.set_banner(this.is_break ? "YOUR BREAK!" : "YOUR SHOT!", [255, 200, 220]);
    } else {
      this.plan_rival();
      this.phase = "rival_think";
      this.set_banner(`${this.name.toUpperCase()}'S SHOT`, [190, 214, 255]);
    }
  }

  set_banner(text: string, col: Col = [255, 230, 140], t = 1.3) {
    this.banner = text;
    this.banner_col = col;
    this.banner_t = t;
  }

  wobble(): number {
    const tipsy = clamp(this.game.state.tipsy || 0, 0, 150);
    if (tipsy <= 0) return 0;
    const amp = (tipsy / 150) * 0.11;
    return amp * Math.sin(this.t * 1.7) + amp * 0.45 * Math.sin(this.t * 4.3 + 1);
  }

  shoot(angle: number, power: number) {
    const cue = this.cue;
    const sp = MIN_SPEED + clamp(power, 0, 1) * (MAX_SPEED - MIN_SPEED);
    cue.vx = Math.cos(angle) * sp;
    cue.vy = Math.sin(angle) * sp;
    this.shots[this.turn] += 1;
    this.phase = "roll";
    this.phase_t = 0;
    this.roll_t = 0;
    this.shot_pots = [];
    this.scratch = false;
    this.charging = false;
    this.game.audio.play("shot", 0.4 + power * 0.6);
    this.particles.burst("puff", cue.x - Math.cos(angle) * 4, cue.y - Math.sin(angle) * 4, 3, 10);
    if (power > 0.85) this.game.shake(1, 0.12);
  }

  zoe_shoot() {
    const tipsy = clamp(this.game.state.tipsy || 0, 0, 150);
    const jitter = (tipsy / 150) * 0.03 * gauss();
    this.shoot(this.aim + this.wobble() + jitter, this.power);
  }

  /** Pick a pot (cut angle, clear paths), then add skill-based error. */
  plan_rival() {
    const cue = this.cue;
    const mine = this.on_table().filter((b) => b.kind === "rival");
    let best: any = null;
    for (const b of mine) {
      for (const [qx, qy, , middle] of POCKETS) {
        // aim the object ball at the pocket mouth (inside the felt), not the hole centre
        const px = middle ? qx : qx < FCX ? FX0 + 1.5 : FX1 - 1.5;
        const py = qy < FCY ? FY0 + 1.5 : FY1 - 1.5;
        const pdx = px - b.x, pdy = py - b.y;
        const d2 = Math.hypot(pdx, pdy);
        if (d2 < 0.5) continue;
        const ux = pdx / d2, uy = pdy / d2;
        if (middle && Math.abs(uy) < 0.55) continue;
        if (!middle && (Math.abs(ux) < 0.3 || Math.abs(uy) < 0.3) && d2 > 10) continue;
        const gx = b.x - ux * 2 * BR, gy = b.y - uy * 2 * BR;
        if (gx < FX0 + BR - 1 || gx > FX1 - BR + 1 || gy < FY0 + BR - 1 || gy > FY1 - BR + 1) continue;
        const ax = gx - cue.x, ay = gy - cue.y;
        const d1 = Math.hypot(ax, ay);
        if (d1 < 1) continue;
        const cos = (ax * ux + ay * uy) / d1;
        if (cos < 0.3) continue;
        if (!this.path_clear(cue.x, cue.y, gx, gy, [cue, b])) continue;
        if (!this.path_clear(b.x, b.y, px, py, [cue, b])) continue;
        const sc = cos * 1.2 - (d1 + d2) / 500 + (middle ? 0 : 0.05);
        if (!best || sc > best.sc) {
          const pw = clamp(0.2 + (d1 * 0.55 + d2 * 1.1) / (380 * Math.max(0.35, cos)), 0.22, 0.95);
          best = { sc, angle: Math.atan2(ay, ax), power: pw };
        }
      }
    }
    this.r_planned = !!best;
    if (!best) {
      // no clean pot: just roll into the nearest of my balls (or anything)
      const targets = mine.length ? mine : this.on_table().filter((b) => b.kind !== "cue");
      let pick: Ball | null = null, pd = 1e9;
      for (const b of targets) {
        const d = Math.hypot(b.x - cue.x, b.y - cue.y);
        const clear = this.path_clear(cue.x, cue.y, b.x, b.y, [cue, b]);
        const score = d + (clear ? 0 : 400);
        if (score < pd) {
          pd = score;
          pick = b;
        }
      }
      const angle = pick ? Math.atan2(pick.y - cue.y, pick.x - cue.x) : pg.random.uniform(-Math.PI, Math.PI);
      best = { angle, power: pg.random.uniform(0.45, 0.7) };
    }
    const sigma = 0.004 + (1 - this.skill) * 0.04;
    this.r_angle = best.angle + gauss() * sigma;
    this.r_power = clamp(best.power * (1 + gauss() * 0.08 * (1 - this.skill)), 0.15, 1);
    if (this.is_break) {
      this.r_angle = Math.atan2(FCY - cue.y, FOOT_X - cue.x) + gauss() * 0.01;
      this.r_power = 0.95;
    }
    this.r_from = this.aim;
  }

  path_clear(x1: number, y1: number, x2: number, y2: number, ignore: Ball[]): boolean {
    for (const o of this.on_table()) {
      if (ignore.includes(o)) continue;
      if (seg_dist(o.x, o.y, x1, y1, x2, y2) < 2 * BR - 0.3) return false;
    }
    return true;
  }

  free_spot(x: number, y: number): [number, number] {
    for (let r = 0; r < 120; r += 2) {
      const n = r === 0 ? 1 : 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const cx = clamp(x + Math.cos(a) * r, FX0 + BR, FX1 - BR), cy = clamp(y + Math.sin(a) * r, FY0 + BR, FY1 - BR);
        if (this.on_table().every((b) => Math.hypot(b.x - cx, b.y - cy) > 2 * BR + 0.5)) return [cx, cy];
      }
    }
    return [x, y];
  }

  respot(b: Ball, x: number, y: number) {
    b.sunk = false;
    b.vx = b.vy = 0;
    const [sx, sy] = this.free_spot(x, y);
    b.x = sx;
    b.y = sy;
  }

  settle() {
    const shooter: "zoe" | "rival" = this.turn;
    const other: "zoe" | "rival" = shooter === "zoe" ? "rival" : "zoe";
    const eight = (this.balls as Ball[]).find((b) => b.kind === "eight")!;
    const own = this.shot_pots.filter((k: string) => k === shooter).length;
    const was_break = this.is_break;
    this.is_break = false;
    for (const b of this.balls as Ball[]) b.vx = b.vy = 0;
    if (eight.sunk) {
      if (was_break) {
        this.respot(eight, FOOT_X, FCY);
        this.set_banner("LUCKY BREAK! THE 8 COMES BACK", [255, 230, 140], 1.6);
      } else {
        const who = shooter === "zoe" ? "YOU" : this.name.toUpperCase();
        this.finish(other, `${who} SANK THE 8 EARLY!`);
        return;
      }
    }
    const zw = this.score.zoe >= POOL_WIN_N, rw = this.score.rival >= POOL_WIN_N;
    if (zw || rw) {
      const w = zw && rw ? shooter : zw ? "zoe" : "rival";
      this.finish(w, w === "zoe" ? `YOU SANK ${POOL_WIN_N}!` : `${this.name.toUpperCase()} SANK ${POOL_WIN_N}!`);
      return;
    }
    let next: "zoe" | "rival" = other;
    if (this.scratch) {
      this.respot(this.cue, HEAD_X, FCY);
      this.game.audio.play("error", 0.6);
      this.set_banner("SCRATCH! TURN OVER", [255, 160, 160], 1.4);
      this.particles.text("SCRATCH!", this.cue.x, this.cue.y - 8, ui.BAD);
    } else if (own > 0) next = shooter;
    if (this.shots[next] >= POOL_SHOTS) next = next === "zoe" ? "rival" : "zoe";
    if (this.shots[next] >= POOL_SHOTS) {
      const z = this.score.zoe, r = this.score.rival;
      this.finish(z > r ? "zoe" : r > z ? "rival" : "tie", "OUT OF SHOTS!");
      return;
    }
    const keep_banner = this.banner_t > 0.3 && this.scratch;
    this.start_turn(next);
    if (next === shooter && !this.scratch && own > 0) {
      this.set_banner(shooter === "zoe" ? "NICE! SHOOT AGAIN" : `${this.name.toUpperCase()} GOES AGAIN`,
        shooter === "zoe" ? [255, 200, 220] : [190, 214, 255]);
    } else if (keep_banner) {
      this.set_banner("SCRATCH! TURN OVER", [255, 160, 160], 1.0);
    }
  }

  finish(winner: string, reason: string) {
    const st = this.game.state;
    const stats = stats_of(this.game);
    stats.pool_played = (stats.pool_played || 0) + 1;
    this.reason = reason;
    if (winner === "zoe") {
      st.coins = (st.coins || 0) + POOL_BET;
      st.total_coins = (st.total_coins || 0) + POOL_BET;
      stats.pool_won = (stats.pool_won || 0) + 1;
      this.outcome = "win";
      this.game.audio.play("coin");
      for (let i = 0; i < 10; i++) this.particles.add("coin", 160, 104);
      this.particles.burst("sparkle", 160, 80, 14, 50);
    } else if (winner === "rival") {
      st.coins = Math.max(0, (st.coins || 0) - POOL_BET);
      this.outcome = "lose";
      this.game.audio.play("sad");
    } else {
      this.outcome = "tie";
      this.game.audio.play("blip");
    }
    this.phase = "final";
    this.phase_t = 0;
    this.charging = false;
    announce_all(this.game);
    try {
      this.game.save();
    } catch (_e) { /* saving is best-effort */ }
  }

  close(result: string) {
    if (this.closed) return;
    this.closed = true;
    this.game.pop();
    let res = result, line = "";
    if (result === "win") line = POOL_WIN_LINES[this.rival] || "Nice shooting, Zoe! Good game.";
    else if (result === "lose") line = POOL_LOSE_LINES[this.rival] || "Got you this time! Good game.";
    else if (result === "tie") {
      res = "none";
      line = "Dead even! Nobody pays. Rematch soon!";
    } else res = "none";
    if (this.on_done) this.on_done(res, line);
  }

  // ------------------------------------------------------------ physics
  physics(dt: number) {
    const N = 8, h = dt / N;
    const balls = this.on_table();
    for (let step = 0; step < N; step++) {
      for (const b of balls) {
        if (b.sunk) continue;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 0) {
          let ns = sp - (FRIC_A + FRIC_B * sp) * h;
          if (ns < 1.5) ns = 0;
          b.vx *= ns / sp;
          b.vy *= ns / sp;
          b.x += b.vx * h;
          b.y += b.vy * h;
        }
      }
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (a.sunk) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (b.sunk) continue;
          let dx = b.x - a.x, dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 >= 4 * BR * BR) continue;
          // rewind both balls to the exact moment of contact (so cut angles come out true)
          const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
          const vv = rvx * rvx + rvy * rvy, dv = dx * rvx + dy * rvy;
          let back = 0;
          if (vv > 1e-6 && dv < 0) {
            const disc = dv * dv - vv * (d2 - 4 * BR * BR);
            if (disc >= 0) back = clamp((-dv - Math.sqrt(disc)) / vv, -h * 1.5, 0);
          }
          if (back < 0) {
            a.x += a.vx * back;
            a.y += a.vy * back;
            b.x += b.vx * back;
            b.y += b.vy * back;
            dx = b.x - a.x;
            dy = b.y - a.y;
            d2 = dx * dx + dy * dy;
          }
          if (d2 < 1e-6) {
            dx = 0.01;
            dy = 0;
            d2 = 1e-4;
          }
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          const push = (2 * BR - d) / 2;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (vn > 0) {
            const imp = (vn * (1 + BALL_E)) / 2;
            a.vx -= imp * nx;
            a.vy -= imp * ny;
            b.vx += imp * nx;
            b.vy += imp * ny;
            if (vn > 25 && this.snd_t <= 0) {
              this.game.audio.play("tick", clamp(vn / 250, 0.25, 1));
              this.snd_t = 0.04;
            }
          }
          if (back < 0) {
            a.x -= a.vx * back;
            a.y -= a.vy * back;
            b.x -= b.vx * back;
            b.y -= b.vy * back;
          }
        }
      }
      for (const b of balls) {
        if (b.sunk) continue;
        for (const [px, py, r] of POCKETS) {
          if (Math.hypot(b.x - px, b.y - py) < r) {
            this.sink(b, px, py);
            break;
          }
        }
        if (b.sunk) continue;
        let hit = 0;
        if (b.x < FX0 + BR) { b.x = FX0 + BR; hit = Math.abs(b.vx); b.vx = Math.abs(b.vx) * CUSH_E; }
        if (b.x > FX1 - BR) { b.x = FX1 - BR; hit = Math.abs(b.vx); b.vx = -Math.abs(b.vx) * CUSH_E; }
        if (b.y < FY0 + BR) { b.y = FY0 + BR; hit = Math.abs(b.vy); b.vy = Math.abs(b.vy) * CUSH_E; }
        if (b.y > FY1 - BR) { b.y = FY1 - BR; hit = Math.abs(b.vy); b.vy = -Math.abs(b.vy) * CUSH_E; }
        if (hit > 60 && this.snd_t <= 0) {
          this.game.audio.play("tick", clamp(hit / 400, 0.15, 0.5));
          this.snd_t = 0.05;
        }
      }
    }
  }

  sink(b: Ball, px: number, py: number) {
    b.sunk = true;
    b.sink_t = 0;
    b.sx = b.x;
    b.sy = b.y;
    b.px = px;
    b.py = py;
    b.vx = b.vy = 0;
    this.shot_pots.push(b.kind);
    if (b.kind === "cue") {
      this.scratch = true;
      this.particles.burst("puff", px, py, 5, 12);
      return;
    }
    if (b.kind === "eight") {
      this.game.audio.play(this.is_break ? "pop" : "error");
      this.particles.text("THE 8!", px, py - 6, [255, 255, 255]);
      this.particles.burst("puff", px, py, 6, 14);
      this.game.shake(2, 0.2);
      return;
    }
    this.score[b.kind] += 1;
    const mine = b.kind === this.turn;
    this.game.audio.play(b.kind === "zoe" ? "star" : "pop");
    if (b.kind === "zoe") this.particles.burst("sparkle", px, py, 10, 26);
    else this.particles.burst("puff", px, py, 4, 12);
    const label = b.kind === "zoe" ? (mine ? "NICE!" : "THANKS!") : mine ? "+1" : "OOPS!";
    this.particles.text(label, clamp(px, 50, 270), clamp(py - 8, 26, 150), b.kind === "zoe" ? [255, 190, 210] : [190, 214, 255]);
  }

  moving(): boolean {
    return this.on_table().some((b) => b.vx !== 0 || b.vy !== 0);
  }

  // ------------------------------------------------------------ aiming helpers
  /** First thing the cue ball would touch along angle a: [distance, ball or null]. */
  ray(a: number): [number, Ball | null] {
    const cue = this.cue;
    const dx = Math.cos(a), dy = Math.sin(a);
    const tx = dx > 1e-6 ? (FX1 - BR - cue.x) / dx : dx < -1e-6 ? (FX0 + BR - cue.x) / dx : 1e9;
    const ty = dy > 1e-6 ? (FY1 - BR - cue.y) / dy : dy < -1e-6 ? (FY0 + BR - cue.y) / dy : 1e9;
    let best = Math.max(0, Math.min(tx, ty));
    let hit: Ball | null = null;
    const R2 = 4 * BR * BR;
    for (const b of this.on_table()) {
      if (b === cue) continue;
      const ex = b.x - cue.x, ey = b.y - cue.y;
      const proj = ex * dx + ey * dy;
      if (proj <= 0) continue;
      const perp2 = ex * ex + ey * ey - proj * proj;
      if (perp2 >= R2) continue;
      const t = proj - Math.sqrt(R2 - perp2);
      if (t < best) {
        best = Math.max(0, t);
        hit = b;
      }
    }
    return [best, hit];
  }

  // ------------------------------------------------------------ input
  event(e: any) {
    if (this.phase === "intro") {
      if (this.start_btn.handle(e, this.game)) return;
      this.nah_btn.handle(e, this.game);
      return;
    }
    if (this.phase === "final") {
      if (this.ok_btn.handle(e, this.game)) return;
      if (e.type === pg.KEYDOWN && e.key === pg.K_ESCAPE) this.close(this.outcome);
      return;
    }
    if (e.type === pg.KEYDOWN && e.key === pg.K_ESCAPE) {
      this.close("none");
      return;
    }
    if (this.phase !== "aim") return;
    const down = (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) || (e.type === pg.KEYDOWN && e.key === pg.K_SPACE);
    const up = (e.type === pg.MOUSEBUTTONUP && e.button === 1) || (e.type === pg.KEYUP && e.key === pg.K_SPACE);
    if (e.type === pg.MOUSEBUTTONDOWN && e.button === 3 && this.charging) {
      this.charging = false;
      this.power = 0;
      this.game.audio.play("blip", 0.5);
      return;
    }
    if (down && !this.charging && this.phase_t > 0.25) {
      this.charging = true;
      this.charge_t = 0;
      this.power = 0;
      this.game.audio.play("tick", 0.6);
    } else if (up && this.charging) {
      this.zoe_shoot();
    }
  }

  // ------------------------------------------------------------ update
  update(dt: number) {
    this.t += dt;
    this.phase_t += dt;
    this.particles.update(dt);
    if (this.snd_t > 0) this.snd_t -= dt;
    if (this.banner_t > 0) this.banner_t -= dt;
    if (this.flash_t > 0) this.flash_t -= dt;
    for (const b of this.balls as Ball[]) if (b.sunk) b.sink_t += dt;

    if (this.phase === "aim") {
      const m = this.game.mpos;
      if (m[0] !== this.last_m[0] || m[1] !== this.last_m[1]) {
        this.last_m = [m[0], m[1]];
        this.kb_aim = false;
      }
      const P = pg.pressed;
      let turn = 0;
      if (P[pg.K_LEFT] || P[pg.K_a]) turn -= 1.1;
      if (P[pg.K_RIGHT] || P[pg.K_d]) turn += 1.1;
      if (P[pg.K_UP] || P[pg.K_w]) turn -= 0.12;
      if (P[pg.K_DOWN] || P[pg.K_s]) turn += 0.12;
      if (turn !== 0) {
        this.kb_aim = true;
        this.aim += turn * dt;
      } else if (!this.kb_aim) {
        const dx = m[0] - this.cue.x, dy = m[1] - this.cue.y;
        if (Math.hypot(dx, dy) > 2) this.aim = Math.atan2(dy, dx);
      }
      if (this.charging) {
        this.charge_t += dt;
        const ph = (this.charge_t / 0.85) % 2;
        this.power = ph < 1 ? ph : 2 - ph;
      }
    } else if (this.phase === "roll") {
      this.roll_t += dt;
      this.physics(dt);
      if (this.roll_t > 12) for (const b of this.balls as Ball[]) b.vx = b.vy = 0;
      if (!this.moving() && this.roll_t > 0.15) this.settle();
    } else if (this.phase === "rival_think") {
      const k = clamp(this.phase_t / 1.0, 0, 1);
      const e = 1 - (1 - k) * (1 - k);
      this.aim = this.r_from + ang_diff(this.r_angle, this.r_from) * e + (1 - k) * 0.04 * Math.sin(this.t * 9);
      if (this.phase_t > 1.15) {
        this.aim = this.r_angle;
        this.phase = "rival_power";
        this.phase_t = 0;
      }
    } else if (this.phase === "rival_power") {
      this.power = clamp(this.phase_t / 0.6, 0, 1) * this.r_power;
      if (this.phase_t > 0.75) {
        this.power = this.r_power;
        this.shoot(this.r_angle, this.r_power);
      }
    }
  }

  // ------------------------------------------------------------ draw
  draw(s: Surface) {
    const st = this.game.state;
    const m = this.game.mpos;
    dim(s, 170);
    s.blit(pool_table_surface(), [TABLE_X, TABLE_Y]);
    const shadow = ball_shadow();
    for (const b of this.on_table()) s.blit(shadow, [Math.round(b.x) - 2, Math.round(b.y) - 2]);
    for (const b of this.balls as Ball[]) {
      if (b.sunk) {
        if (b.sink_t < 0.22) {
          const k = b.sink_t / 0.22;
          const x = b.sx + (b.px - b.sx) * k, y = b.sy + (b.py - b.sy) * k;
          const base: Col = b.kind === "zoe" ? ZOE_BALL : b.kind === "rival" ? RIVAL_BALL : b.kind === "eight" ? [40, 40, 46] : [230, 230, 224];
          pg.draw.circle(s, sprites.darker(base, 1 - k * 0.5), [Math.round(x), Math.round(y)], Math.max(1, Math.round(3 * (1 - k))));
        }
        continue;
      }
      s.blit(ball_sprite(b.kind), [Math.round(b.x) - 3, Math.round(b.y) - 3]);
    }

    const aiming = this.phase === "aim" || this.phase === "rival_think" || this.phase === "rival_power";
    if (aiming && !this.cue.sunk) {
      const a = this.phase === "aim" ? this.aim + this.wobble() : this.aim;
      if (this.phase === "aim") this.draw_guide(s, a);
      this.draw_cue(s, a, this.phase === "aim" ? (this.charging ? this.power : 0) : this.phase === "rival_power" ? this.power : 0);
    }

    this.draw_hud(s, st);
    // power meter + hints
    const show_pow = this.phase === "aim" || this.phase === "rival_power" || this.phase === "rival_think";
    pg.draw.rect(s, [34, 22, 28], [0, 157, 320, 23]);
    pg.draw.line(s, [90, 60, 50], [0, 157], [319, 157]);
    if (this.phase !== "intro" && this.phase !== "final") {
      font.draw(s, "POWER", [104, 161], [230, 214, 200], 1, null, "right");
      pg.draw.rect(s, [20, 14, 18], [108, 159, 104, 9]);
      pg.draw.rect(s, [150, 120, 110], [108, 159, 104, 9], 1);
      if (show_pow) {
        const w = Math.round(this.power * 100);
        for (let x = 0; x < w; x++) {
          const k = x / 100;
          const c = k < 0.5 ? lerp_col([90, 200, 110], [250, 220, 90], k * 2) : lerp_col([250, 220, 90], [240, 80, 80], (k - 0.5) * 2);
          pg.draw.line(s, c, [110 + x, 161], [110 + x, 165]);
        }
      }
      if ((st.tipsy || 0) > 0) font.draw(s, "*HIC* WOBBLY CUE", [218, 161], [210, 150, 220]);
      const hint = this.phase === "aim"
        ? (this.charging ? "RELEASE TO SHOOT!  RIGHT-CLICK CANCELS" : "AIM: MOUSE OR ARROWS - HOLD CLICK/SPACE, RELEASE TO SHOOT")
        : this.phase === "roll" ? "ROLLING..." : `${this.name.toUpperCase()} IS LINING UP A SHOT...`;
      font.draw(s, hint, [160, 172], [200, 186, 176], 1, null, "center");
    }

    if (this.banner_t > 0 && this.banner && this.phase !== "final" && this.phase !== "intro") {
      const w = font.text_width(this.banner) + 14;
      const y = 33 - Math.round(Math.max(0, this.banner_t - 1.1) * 40);
      ui.panel(s, [160 - Math.floor(w / 2), y, w, 13], [44, 30, 44], this.banner_col, false);
      font.draw(s, this.banner, [160, y + 4], this.banner_col, 1, null, "center");
    }
    this.particles.draw(s);

    if (this.phase === "intro") this.draw_intro(s, st, m);
    else if (this.phase === "final") this.draw_final(s, m);
    if (this.flash && this.flash_t > 0) font.draw(s, this.flash, [160, 124], [255, 160, 160], 1, [60, 20, 20], "center");
  }

  draw_guide(s: Surface, a: number) {
    const cue = this.cue;
    const [t, hit] = this.ray(a);
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let i = BR + 2; i < t; i += 1) {
      if (Math.floor(i / 2) % 2 === 0) s.set_at([Math.round(cue.x + dx * i), Math.round(cue.y + dy * i)], [236, 246, 236]);
    }
    const gx = cue.x + dx * t, gy = cue.y + dy * t;
    pg.draw.circle(s, [230, 240, 230], [Math.round(gx) + 0, Math.round(gy) + 0], 3, 1);
    if (hit) {
      let nx = hit.x - gx, ny = hit.y - gy;
      const d = Math.hypot(nx, ny) || 1;
      nx /= d;
      ny /= d;
      const col: Col = hit.kind === "zoe" ? [255, 190, 210] : hit.kind === "eight" ? [255, 120, 120] : [190, 214, 255];
      for (let i = 4; i < 18; i++) if (i % 3 !== 0) s.set_at([Math.round(hit.x + nx * i), Math.round(hit.y + ny * i)], col);
    }
  }

  draw_cue(s: Surface, a: number, power: number) {
    const cue = this.cue;
    const bx = -Math.cos(a), by = -Math.sin(a);
    const pull = 2 + power * 14 + (this.charging ? Math.sin(this.t * 20) * 0.5 : 0);
    const p = (d: number) => [cue.x + bx * (BR + pull + d), cue.y + by * (BR + pull + d)];
    pg.draw.line(s, [110, 160, 230], p(0), p(1));
    pg.draw.line(s, [244, 240, 228], p(2), p(3));
    pg.draw.line(s, [226, 192, 140], p(4), p(32));
    pg.draw.line(s, [176, 120, 70], p(33), p(36));
    pg.draw.line(s, [110, 60, 40], p(37), p(54), 2);
    pg.draw.line(s, [40, 30, 30], p(55), p(56), 2);
  }

  draw_hud(s: Surface, st: any) {
    pg.draw.rect(s, [34, 22, 28], [0, 0, 320, 18]);
    pg.draw.line(s, [90, 60, 50], [0, 18], [319, 18]);
    const zturn = this.turn === "zoe" && this.phase !== "intro" && this.phase !== "final";
    const rturn = this.turn === "rival" && this.phase !== "intro" && this.phase !== "final";
    draw_head(s, zoe_sprite(st), 4, 3, zturn ? [255, 220, 230] : [120, 100, 110]);
    font.draw(s, "ZOE", [21, 3], zturn ? [255, 220, 230] : [200, 180, 190]);
    font.draw(s, `SHOTS ${Math.max(0, POOL_SHOTS - this.shots.zoe)}`, [21, 11], [170, 150, 150]);
    for (let i = 0; i < POOL_WIN_N; i++) {
      const x = 46 + i * 8, y = 3;
      if (this.score.zoe > i) s.blit(ball_sprite("zoe"), [x, y]);
      else pg.draw.circle(s, [120, 70, 90], [x + 3, y + 3], 3, 1);
    }
    draw_head(s, friend_sprite(this.rival), 304, 3, rturn ? [220, 236, 255] : [100, 110, 130]);
    font.draw(s, this.name.toUpperCase(), [300, 3], rturn ? [220, 236, 255] : [180, 190, 210], 1, null, "right");
    font.draw(s, `SHOTS ${Math.max(0, POOL_SHOTS - this.shots.rival)}`, [300, 11], [150, 156, 170], 1, null, "right");
    for (let i = 0; i < POOL_WIN_N; i++) {
      const x = 250 - i * 8, y = 3;
      if (this.score.rival > i) s.blit(ball_sprite("rival"), [x, y]);
      else pg.draw.circle(s, [70, 90, 140], [x + 3, y + 3], 3, 1);
    }
    const mid = this.phase === "intro" ? "8-BALL-ISH" : this.phase === "final" ? "GAME OVER"
      : zturn ? (this.is_break ? "YOUR BREAK!" : "YOUR SHOT!") : `${this.name.toUpperCase()}'S SHOT`;
    const blink = zturn && this.phase === "aim" && Math.floor(this.t * 3) % 2 === 0;
    font.draw(s, mid, [160, 3], blink ? [255, 250, 230] : [255, 220, 140], 1, null, "center");
    font.draw(s, `FIRST TO ${POOL_WIN_N}  -  BET ${POOL_BET}`, [160, 11], [170, 150, 140], 1, null, "center");
  }

  draw_intro(s: Surface, st: any, m: number[]) {
    ui.panel(s, [70, 26, 180, 128], [58, 40, 44], [34, 22, 26]);
    font.draw(s, "POOL!", [160, 31], [255, 220, 120], 2, [120, 60, 40], "center");
    draw_portrait(s, zoe_portrait(st), 92, 46, [250, 220, 230]);
    draw_portrait(s, friend_portrait(this.rival), 196, 46, [220, 236, 250]);
    font.draw(s, "VS", [160, 58], [200, 170, 160], 2, null, "center");
    s.blit(ball_sprite("zoe"), [105, 84]);
    s.blit(ball_sprite("rival"), [209, 84]);
    font.draw_wrapped(s, `${this.name} bets ${POOL_BET} coins! You're PINK, ${this.name} is STRIPES. ` +
      `First to sink ${POOL_WIN_N} wins. Don't sink the black 8!`, [78, 94, 164, 30], [255, 240, 220]);
    font.draw(s, `YOU HAVE ${st.coins || 0} COINS`, [160, 124], [255, 220, 120], 1, null, "center");
    this.start_btn.draw(s, m);
    this.nah_btn.draw(s, m);
  }

  draw_final(s: Surface, m: number[]) {
    ui.panel(s, [80, 46, 160, 92], [58, 40, 44], [34, 22, 26]);
    const txt = this.outcome === "win" ? `YOU WIN ${POOL_BET}!` : this.outcome === "lose" ? `YOU LOSE ${POOL_BET}` : "IT'S A TIE!";
    const col: Col = this.outcome === "win" ? [255, 230, 120] : this.outcome === "lose" ? [250, 160, 160] : [230, 230, 240];
    font.draw(s, txt, [160, 56], col, 2, [60, 30, 30], "center");
    font.draw(s, this.reason, [160, 76], [255, 240, 220], 1, null, "center");
    font.draw(s, `ZOE ${this.score.zoe}  -  ${this.score.rival} ${this.name.toUpperCase()}`, [160, 88], [220, 200, 200], 1, null, "center");
    if (this.outcome === "win") font.draw(s, "COINS!", [160, 100], col, 1, null, "center");
    this.ok_btn.draw(s, m);
  }
}

