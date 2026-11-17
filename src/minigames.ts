/* Treatment station mini-games. Each scores 0-100.
 *
 * Station -> mini-games:
 *   exam  : ExamGame (tools reveal clues, pick diagnosis)
 *   bath  : BathGame (scrub mud, catch fleas, rinse, dry, trim, brush tangles)
 *   meds  : MedsGame (fill syringe, pill-in-treat, timed shot)
 *   care  : CareGame (choose & pour food, wrap bandage)
 *
 * Fast variants (Heartbeat, X-Ray, Flea Frenzy, Pill Toss, Steady Shot, Feeding Frenzy,
 * Bandage Sequence) live in minigames3.ts; make_station_game() picks one per visit.
 * Every game has a 1 s "READY... GO!" intro and a countdown (set_limit): finishing early earns
 * a SPEED bonus, running out of time ends the game with partial credit.
 * Subclasses implement tick(dt) / on_event(e) / draw(s); base update()/event() wrap them.
 */
import * as pg from "./pg";
import { Rect, Surface } from "./pg";
import * as data from "./data";
import * as font from "./font";
import * as sprites from "./sprites";
import * as ui from "./ui";
import * as gstate from "./state";
import * as config from "./config";
import * as challenges from "./challenges";
import { build_variants } from "./minigames3";

const random = pg.random;

export const SW = 320, SH = 180;
export const AREA = new Rect(0, 32, 320, 136);

// p.untreated is a Python set; accept a Set or an array.
function _ut_has(um: any, k: string): boolean {
  if (!um) return false;
  if (um instanceof Set) return um.has(k);
  if (Array.isArray(um)) return um.includes(k);
  return k in um;
}
function _ut_list(um: any): string[] {
  if (!um) return [];
  if (um instanceof Set) return Array.from(um);
  if (Array.isArray(um)) return um;
  return Object.keys(um);
}

// ----------------------------------------------------------------- symptom overlays
/** Draw visible symptoms on an animal sprite of size 24*f at (x, y). */
export function draw_symptoms(s: Surface, p: any, x: number, y: number, f: number, t: number, skip: string[] = []) {
  const um = p.untreated;
  const hf = Math.floor(f / 2) || 1;
  if (_ut_has(um, "fleas") && !skip.includes("fleas")) {
    const pts = [[9, 15], [14, 13], [12, 19]];
    pts.forEach(([ux, uy], i) => {
      const hop = Math.abs(Math.sin(t * 7 + i * 2.1)) * 3;
      pg.draw.rect(s, [50, 40, 40], [x + Math.trunc(ux * f), y + Math.trunc((uy - hop) * f), Math.max(1, f), Math.max(1, f)]);
    });
  }
  if (_ut_has(um, "mud") && !skip.includes("mud")) {
    for (const [ux, uy, w, h] of [[6, 15, 4, 3], [14, 17, 5, 3], [9, 6, 3, 2]]) {
      pg.draw.ellipse(s, [140, 100, 62], [x + Math.trunc(ux * f), y + Math.trunc(uy * f), Math.max(2, Math.trunc(w * f)), Math.max(2, Math.trunc(h * f))]);
    }
  }
  if (_ut_has(um, "matted") && !skip.includes("matted")) {
    for (const [ux, uy] of [[5, 13], [17, 14], [8, 4], [15, 4]]) {
      const pts = pg.range(4).map((i) => [x + Math.trunc((ux + i) * f), y + Math.trunc((uy + (i % 2) * 1.2) * f)]);
      pg.draw.lines(s, [90, 70, 60], false, pts, Math.max(1, hf));
    }
  }
  if (_ut_has(um, "fever")) {
    for (const ux of [5.5, 16.5]) {
      pg.draw.ellipse(s, [240, 90, 100], [x + Math.trunc(ux * f), y + Math.trunc(10 * f), Math.max(2, Math.trunc(2 * f)), Math.max(1, Math.trunc(1.5 * f))]);
    }
    const dy = Math.trunc((Math.sin(t * 3) + 1) * f);
    pg.draw.circle(s, [130, 200, 250], [x + Math.trunc(19 * f), y + Math.trunc(5 * f) + dy], Math.max(1, Math.trunc(1.2 * f)));
  }
  if (_ut_has(um, "infection") && !skip.includes("infection")) {
    const cx = x + Math.trunc(16 * f), cy = y + Math.trunc(15 * f);
    pg.draw.line(s, [220, 60, 70], [cx, cy], [cx + Math.trunc(3 * f), cy + Math.trunc(3 * f)], Math.max(1, hf));
    pg.draw.line(s, [220, 60, 70], [cx + Math.trunc(1 * f), cy], [cx + Math.trunc(4 * f), cy + Math.trunc(3 * f)], Math.max(1, hf));
  }
  if (_ut_has(um, "paw") && !skip.includes("paw")) {
    pg.draw.circle(s, [240, 90, 100], [x + Math.trunc(8 * f), y + Math.trunc(22 * f)], Math.max(1, Math.trunc(1.2 * f)));
  }
  if (_ut_has(um, "tummy") && !skip.includes("tummy")) {
    if (pg.mod(Math.trunc(t * 2), 2) === 0) {
      font.draw(s, "~", [x + Math.trunc(10 * f), y + Math.trunc(16 * f)], [110, 190, 90], Math.max(1, Math.floor(f / 2)));
    }
  }
  if (_ut_has(um, "hungry") && !skip.includes("hungry")) {
    const bx = x + Math.trunc(18 * f), by = y + Math.trunc(1 * f);
    const w = Math.max(9, Math.trunc(8 * f));
    pg.draw.ellipse(s, [255, 255, 255], [bx, by, w, Math.max(7, Math.trunc(6 * f))]);
    pg.draw.ellipse(s, ui.BORDER, [bx, by, w, Math.max(7, Math.trunc(6 * f))], 1);
    pg.draw.rect(s, [200, 140, 90], [bx + Math.floor(w / 4), by + Math.max(3, Math.trunc(3 * f)), Math.floor(w / 2), Math.max(2, Math.trunc(1.5 * f))]);
  }
}

// ----------------------------------------------------------------- base
/** Length of the "READY... GO!" intro (s) and when "GO!" appears. */
export const INTRO_T = 1.0;
export const GO_T = 0.4;
/** Max SPEED bonus (points) for finishing with the whole timer left. */
export const SPEED_BONUS = 20;

/** Time-limit multiplier for a difficulty: 1.0 at diff 1, ~0.76 at diff 1.8, ~1.06 for calm day-1 pets. */
export function time_scale(diff: number): number {
  return 1 / (0.6 + 0.4 * Math.max(0.5, diff));
}

export class Minigame {
  station = "exam";
  title = "Station";
  get hint(): string {
    return "";
  }
  [key: string]: any;

  constructor(scene: any, patient: any) {
    this.scene = scene;
    this.game = scene.game;
    this.st = scene.game.state;
    this.p = patient;
    this.t = 0.0;
    this.done = false;
    this.score = 100.0;
    this.penalty = 0.0;
    const pi = data.PERSONALITY_INFO[patient.personality] ?? { speed: 1.0 };
    this.diff = gstate.minigame_difficulty(this.st) * pi["speed"];
    this.level = gstate.rank_level(this.st["xp"]);
    this.ax = 160;
    this.ay = 90;
    this.hissing = 0.0;
    this.hiss_cd = random.uniform(2.5, 4.5);
    this.particles = scene.particles;
    this.msg = null;
    this.msg_t = 0;
    // countdown timer (0 = no limit). Subclasses call set_limit().
    this.limit = 0;
    this.time_left = 0;
    this.intro = INTRO_T;
    this.timed_out = false;
    this.speed_bonus = 0;
    /** feral: leaving the cursor on the growling animal makes it bite (mouse games). */
    this.cursor_bites = true;
  }

  // helpers
  has(item: string): boolean {
    return gstate.has(this.st, item);
  }

  flash(text: string, color: any = ui.INK) {
    this.msg = [text, color];
    this.msg_t = 1.4;
  }

  /** Station time limit: base seconds at difficulty 1, shrinking as the game gets harder. */
  set_limit(base: number) {
    let lim = base * time_scale(this.diff);
    if (this.p.personality === "feral") lim = lim * 1.15 + 1.0; // growls eat into your time
    else if (this.p.personality === "grumpy") lim += 1.0;
    this.limit = Math.max(5, lim);
    this.time_left = this.limit;
  }

  wiggle(): number {
    if (this.p.personality === "feral" && this.hissing > 0) {
      return Math.trunc(Math.sin(this.t * 40) * 2); // shaking with rage
    }
    if (this.p.personality === "nervous") {
      return Math.trunc(Math.sin(this.t * 8) * 3 + Math.sin(this.t * 13) * 1.5);
    }
    return 0;
  }

  arect(): Rect {
    return new Rect(this.ax - 36 + this.wiggle(), this.ay - 36, 72, 72);
  }

  upx(ux: number, uy: number): number[] {
    const r = this.arect();
    return [r.x + ux * 3, r.y + uy * 3];
  }

  mistake(amount: number, text = "Oops!", pos: number[] | null = null) {
    this.penalty += amount;
    this.game.shake(3, 0.2);
    this.game.audio.play("error");
    const [mx, my] = pos ?? this.game.mpos;
    this.particles.text(text, mx, my - 6, ui.BAD);
  }

  /** A feral patient bites: big score penalty, screen shake, red flash. */
  bite(pos: number[] | null = null) {
    this.hissing = 0;
    this.bite_t = 0;
    this.mistake(config.WILD.bite_penalty, "CHOMP!", pos);
    this.game.shake(6, 0.35);
    this.game.audio.play("hiss");
    this.bit_flash = 0.4;
    if (this.st["stats"]) this.st["stats"]["bites"] = (this.st["stats"]["bites"] || 0) + 1;
    this.flash("OUCH! It bit you! Hold still when it GROWLS.", ui.BAD);
  }

  /** Grumpy hiss: clicking the animal while it hisses gets you nipped. Feral ones BITE. */
  guard(e: any): boolean {
    if (this.hissing > 0 && e.type === pg.MOUSEBUTTONDOWN && e.button === 1) {
      if (this.p.personality === "feral" && this.arect().inflate(10, 10).collidepoint(this.game.mpos)) {
        this.bite();
        return true;
      }
      if (this.arect().inflate(10, 10).collidepoint(this.game.mpos)) {
        this.mistake(8, "NIP!");
        this.game.audio.play("hiss");
        return true;
      }
    }
    return false;
  }

  /** For "press anywhere" games: acting while the animal hisses / growls is punished.
   *  Returns true if the input was eaten. */
  angry_input(pos: number[] | null = null): boolean {
    if (this.hissing <= 0) return false;
    if (this.p.personality === "feral") {
      this.bite(pos);
      return true;
    }
    this.mistake(8, "NIP!", pos);
    this.game.audio.play("hiss");
    this.hissing = Math.min(this.hissing, 0.3);
    return true;
  }

  base_update(dt: number) {
    this.t += dt;
    if (this.msg_t > 0) this.msg_t -= dt;
    if (this.bit_flash > 0) this.bit_flash -= dt;
    if (this.p.personality === "feral") {
      if (this.hissing > 0) {
        this.hissing -= dt;
        if (this.hissing <= 0) challenges.progress(this.game, "bites_dodged");
        // leave your cursor on a growling feral animal and it lunges
        if (this.cursor_bites) {
          const over = this.arect().inflate(8, 8).collidepoint(this.game.mpos);
          this.bite_t = over ? (this.bite_t || 0) + dt : 0;
          if (this.bite_t >= config.WILD.bite_delay) this.bite();
        }
      } else {
        this.hiss_cd -= dt;
        if (this.hiss_cd <= 0) {
          this.hissing = config.WILD.growl_time;
          this.bite_t = 0;
          this.hiss_cd = random.uniform(1.8, 3.8) / Math.max(1, this.diff * 0.7);
          this.game.audio.play("hiss", 0.8);
          this.game.shake(1, 0.15);
        }
      }
    } else if (this.p.personality === "grumpy") {
      if (this.hissing > 0) {
        this.hissing -= dt;
      } else {
        this.hiss_cd -= dt;
        if (this.hiss_cd <= 0) {
          this.hissing = 1.1;
          this.hiss_cd = random.uniform(3.5, 6.5) / Math.max(1, this.diff * 0.8);
          this.game.audio.play("hiss", 0.6);
        }
      }
    }
  }

  /** Penalty points from mistake()/bite() since the current step began (multi-step games). */
  step_mistakes(): number {
    return this.penalty - (this._pen0 ?? 0);
  }

  /** 0..1: how far through the task the player got (used for the time-out score). */
  prog_frac(): number {
    return 0;
  }

  /** Score right now if the task ended (accuracy only). */
  current_raw(): number {
    return this.score - this.penalty;
  }

  /** Running out of time: partial credit, scaled by progress. finish() clamps to >= 5. */
  timeout_score(): number {
    const prog = Math.max(0, Math.min(1, this.prog_frac() || 0));
    return Math.max(5, this.current_raw()) * (0.2 + 0.4 * prog);
  }

  time_up() {
    this.timed_out = true;
    this.time_left = 0;
    this.game.audio.play("error");
    this.game.audio.play("sad", 0.6);
    this.game.shake(4, 0.3);
    this.particles.text("TIME'S UP!", 160, 96, ui.BAD, 1.6);
    this.finish(this.timeout_score(), true);
  }

  /** score: accuracy 0-100. Unless timed out, blends in a SPEED bonus for the time left. */
  finish(score: number | null = null, timeout = false) {
    if (this.done) return;
    if (score === null || score === undefined) score = this.score - this.penalty;
    if (!Number.isFinite(score)) score = 5;
    if (!timeout && this.limit > 0) {
      // fixed_time: seconds the player cannot skip (rhythm tracks, shown sequences)
      const frac = Math.max(0, Math.min(1, this.time_left / Math.max(1, this.limit - (this.fixed_time || 0))));
      const bonus = Math.round(SPEED_BONUS * frac);
      this.speed_bonus = bonus;
      score = score * (1 - SPEED_BONUS / 100 * 0.75) + bonus;
      if (bonus > 0 && this.particles) this.particles.text(`SPEED BONUS +${bonus}`, 160, 66, ui.GOLD, 1.5);
    }
    this.final = Math.max(5, Math.min(100, Math.trunc(pg.pyround(score))));
    this.done = true;
  }

  mood(def: string | null = null): string {
    if (this.hissing > 0) return "angry";
    if (def) return def;
    return _ut_list(this.p.untreated).some((a) => a !== "checkup") ? "sick" : "normal";
  }

  /** Growl rings / HISS! label around an animal rect. */
  draw_growl(s: Surface, r: Rect) {
    if (this.hissing > 0) {
      if (this.p.personality === "feral") {
        const k = Math.max(r.w, r.h) / 2 - 2 + Math.trunc(Math.sin(this.t * 14) * 3);
        pg.draw.circle(s, ui.BAD, r.center, k + 8, 1);
        pg.draw.circle(s, [255, 150, 150], r.center, k + 10, 1);
        font.draw(s, this.growl_text ?? (this.cursor_bites ? "GRRR! MOVE AWAY!" : "GRRR! HOLD STILL!"), [r.centerx, Math.max(40, r.y - 6)], ui.BAD, 1, [255, 255, 255], "center");
      } else {
        font.draw(s, "HISS!", [r.right - 4, r.y + 2], ui.BAD, 1, [255, 255, 255]);
      }
    }
    if (this.p.personality === "feral") font.draw(s, "FERAL", [r.x - 2, r.y + 2], [200, 70, 40], 1, [255, 255, 255]);
  }

  draw_animal(s: Surface, mood: string | null = null, skip: string[] = [], frame: number | null = null) {
    const r = this.arect();
    const fr = frame === null || frame === undefined ? pg.mod(Math.trunc(this.t * 2), 2) : frame;
    const img = sprites.animal_big(this.p.kind, this.p.variant, fr, this.mood(mood));
    s.blit(img, r.topleft);
    draw_symptoms(s, this.p, r.x, r.y, 3, this.t, skip);
    this.draw_growl(s, r);
  }

  draw_timer(s: Surface) {
    if (this.limit <= 0) return;
    const frac = Math.max(0, Math.min(1, this.time_left / this.limit));
    const x = 30, y = 32, w = 260, h = 6;
    const low = this.time_left <= 3 && !this.done && this.intro <= 0;
    const pulse = low && pg.mod(Math.trunc(this.t * 8), 2) === 0;
    if (pulse) {
      pg.draw.rect(s, ui.BAD, [0, 32, 320, 136], 1);
      pg.draw.rect(s, [255, 150, 150], [1, 33, 318, 134], 1);
    }
    const bx = pulse ? x - 1 : x, bw = pulse ? w + 2 : w;
    pg.draw.rect(s, ui.BORDER, [bx, y, bw, h]);
    pg.draw.rect(s, [76, 60, 92], [bx + 1, y + 1, bw - 2, h - 2]);
    const col = low ? (pulse ? [255, 130, 130] : [226, 60, 72]) : frac > 0.5 ? [120, 210, 130] : [246, 196, 80];
    const fw = Math.trunc((bw - 2) * frac);
    if (fw > 0) {
      pg.draw.rect(s, col, [bx + 1, y + 1, fw, h - 2]);
      pg.draw.rect(s, sprites.lighter(col, 0.45), [bx + 1, y + 1, fw, 1]);
    }
    for (let i = 1; i < Math.floor(this.limit); i++) {
      const tx = x + 1 + Math.trunc(((w - 2) * i) / this.limit);
      pg.draw.rect(s, [52, 38, 64], [tx, y + h - 2, 1, 1]);
    }
    // little stopwatch
    const cx = 22, cy = 35;
    pg.draw.circle(s, pulse ? [255, 200, 200] : [255, 255, 255], [cx, cy], 3);
    pg.draw.circle(s, ui.BORDER, [cx, cy], 3, 1);
    const a = (1 - frac) * Math.PI * 2;
    pg.draw.line(s, ui.BAD, [cx, cy], [cx + Math.round(Math.sin(a) * 2), cy - Math.round(Math.cos(a) * 2)]);
    const secs = String(Math.max(0, Math.ceil(this.time_left)));
    font.draw(s, secs, [x + w + 5, y], low ? ui.BAD : [255, 255, 255], 1, ui.INK);
    if (low && this.time_left > 0) {
      font.draw(s, secs, [300, 44], pulse ? ui.BAD : [255, 160, 160], 2, [255, 255, 255], "center");
    }
  }

  draw_intro(s: Surface) {
    if (this.intro <= 0 || this.done) return;
    const band = sprites.cached("mg_intro_band", () => {
      const v = new Surface([SW, 34], pg.SRCALPHA);
      v.fill([40, 28, 56, 175]);
      return v;
    });
    s.blit(band, [0, 80]);
    pg.draw.rect(s, [255, 200, 120], [0, 80, 320, 1]);
    pg.draw.rect(s, [255, 200, 120], [0, 113, 320, 1]);
    font.draw(s, this.title.toUpperCase(), [160, 84], [255, 220, 150], 1, null, "center");
    if (this.intro > GO_T) {
      const dots = ".".repeat(1 + pg.mod(Math.trunc((INTRO_T - this.intro) * 8), 3));
      font.draw(s, "READY" + dots, [160, 95], [255, 255, 255], 2, ui.INK, "center");
    } else {
      const sc = this.intro > GO_T - 0.12 ? 4 : 3;
      font.draw(s, "GO!", [160, sc === 4 ? 91 : 94], ui.GOLD, sc, ui.INK, "center");
    }
  }

  draw_common(s: Surface) {
    if (this.bit_flash > 0) {
      const red = sprites.cached("bite_flash", () => {
        const v = new Surface([SW, SH], pg.SRCALPHA);
        v.fill([230, 40, 50, 90]);
        return v;
      });
      s.blit(red, [0, 0]);
    }
    if (this.msg && this.msg_t > 0) {
      font.draw(s, this.msg[0], [160, 150], this.msg[1], 1, [255, 255, 255], "center");
    }
    const hint = this.hint;
    if (hint) {
      ui.panel(s, [2, 158, 316, 9], [52, 38, 64], [52, 38, 64], false);
      font.draw(s, hint, [160, 160], [255, 240, 220], 1, null, "center");
    }
    this.draw_timer(s);
    this.draw_intro(s);
  }

  draw_tool_cursor(s: Surface, name: string) {
    const [mx, my] = this.game.mpos;
    const img = sprites.big_icon(name, 2);
    s.blit(img, [mx - 12, my - 12]);
  }

  // ---- lifecycle: subclasses implement on_event() / tick() / draw()
  /** Do not override: handles the intro, inputs are ignored until "GO!". */
  event(e: any) {
    if (this.done || this.intro > 0) return;
    this.on_event(e);
  }

  /** Do not override: intro, personality (hiss / growl), the game's tick() and the countdown. */
  update(dt: number) {
    if (this.done) return;
    if (this.intro > 0) {
      if (!this._intro_snd) {
        this._intro_snd = true;
        this.game.audio.play("blip");
      }
      const before = this.intro;
      this.intro -= dt;
      this.t += dt;
      if (this.msg_t > 0) this.msg_t -= dt;
      if (before > GO_T && this.intro <= GO_T) this.game.audio.play("select");
      return;
    }
    this.base_update(dt);
    if (this.done) return;
    this.tick(dt);
    if (this.done || this.limit <= 0) return;
    this.time_left -= dt;
    if (this.time_left <= 3 && this.time_left > 0) {
      const sec = Math.ceil(this.time_left);
      if (sec !== this._tick_s) {
        this._tick_s = sec;
        this.game.audio.play("tick", 1.0);
        this.game.audio.play("blip", 0.4);
      }
    }
    if (this.time_left <= 0) this.time_up();
  }

  on_event(_e: any) {}

  tick(_dt: number) {}

  draw(_s: Surface) {}
}

export function bg_room(s: Surface, wall: any, floor_a: any, floor_b: any, wall_line: any = null) {
  pg.draw.rect(s, wall, [0, 32, 320, 48]);
  if (wall_line) {
    for (let x = 0; x < 320; x += 12) pg.draw.rect(s, wall_line, [x, 32, 1, 48]);
  }
  pg.draw.rect(s, sprites.darker(wall, 0.85), [0, 78, 320, 3]);
  for (let y = 81; y < 168; y += 10) {
    for (let x = 0; x < 320; x += 10) {
      const c = (Math.floor(x / 10) + Math.floor(y / 10)) % 2 ? floor_a : floor_b;
      pg.draw.rect(s, c, [x, y, 10, 10]);
    }
  }
}

export function step_chips(s: Surface, steps: string[], idx: number) {
  const total = pg.sum(steps.map((n) => font.text_width(n.toUpperCase()) + 10)) + 4 * (steps.length - 1);
  let x = 160 - Math.floor(total / 2);
  steps.forEach((n, i) => {
    const w = font.text_width(n.toUpperCase()) + 10;
    const col = i === idx ? [250, 200, 214] : i < idx ? [200, 236, 200] : [240, 236, 244];
    ui.panel(s, [x, 39, w, 11], col, ui.BORDER, false);
    font.draw(s, n.toUpperCase(), [x + 5, 42], ui.INK);
    x += w + 4;
  });
}

// ======================================================================= EXAM
export class ExamGame extends Minigame {
  station = "exam";
  title = "Exam & Diagnosis";
  get hint(): string {
    if (this.cards && this.cards.length) return "QUICK! CLICK THE DIAGNOSIS (OR PRESS 1/2/3)";
    return "DRAG TOOLS OVER THE GLOWING SPOTS - DON'T LET GO TOO SOON!";
  }
  static TOOLS: any[] = [["steth", "Stethoscope", [12, 16]], ["thermo", "Thermometer", [6, 6]], ["mag", "Magnifier", [18, 12]]];
  TOOLS: any[] = ExamGame.TOOLS;

  constructor(scene: any, patient: any) {
    super(scene, patient);
    this.ax = 150;
    this.ay = 90;
    this.progress = {};
    for (const [k] of this.TOOLS) this.progress[k] = 0.0;
    this.drag = null;
    this.tray = {};
    this.TOOLS.forEach(([k], i) => {
      this.tray[k] = new Rect(10, 42 + i * 36, 30, 30);
    });
    this.cards = null;
    this.wrong = new Set<number>();
    this.rate = 1.35 * (this.has("golden_steth") ? 1.9 : 1.0);
    this.set_limit(15);
  }

  prog_frac(): number {
    if (this.cards) return 0.8;
    const v = Object.values(this.progress) as number[];
    return v.length ? (pg.sum(v) / v.length) * 0.7 : 0;
  }

  clues(): any {
    const out: any = {};
    for (const [k] of this.TOOLS) {
      const lines = (this.p.ailments as string[]).filter((a) => data.AILMENTS[a]["clues"][k]).map((a) => data.AILMENTS[a]["clues"][k]);
      out[k] = lines.length ? lines.join(" / ") : data.NORMAL_CLUES[k];
    }
    return out;
  }

  make_cards() {
    const correct: string[] = [...this.p.ailments].sort();
    const ckey = correct.join("|");
    const opts = new Map<string, string[]>();
    opts.set(ckey, correct);
    const pool = Object.keys(data.AILMENTS).filter((a) => a !== "checkup");
    let tries = 0;
    while (opts.size < 3 && tries < 200) {
      tries += 1;
      let cand: string[];
      if (correct.length === 1 && correct[0] === "checkup") {
        cand = [random.choice(pool)];
      } else if (correct.length === 1 && random.random() < 0.25) {
        cand = ["checkup"];
      } else {
        const c = correct.slice();
        c[random.randrange(c.length)] = random.choice(pool.filter((a) => !c.includes(a)));
        cand = Array.from(new Set(c)).sort();
      }
      opts.set(cand.join("|"), cand);
    }
    const list = Array.from(opts.values());
    random.shuffle(list);
    this.cards = list.map((o, i) => ({ opt: o, rect: new Rect(46 + i * 78, 134, 74, 22), correct: o.join("|") === ckey }));
  }

  static label(opt: string[]): string {
    if (opt.length === 1 && opt[0] === "checkup") return "Healthy! (Check-up)";
    return opt.map((a) => data.AILMENTS[a]["name"]).join(" + ");
  }
  label(opt: string[]): string {
    return ExamGame.label(opt);
  }

  hotspot(k: string): number[] {
    for (const [key, , [ux, uy]] of this.TOOLS) {
      if (key === k) return this.upx(ux, uy);
    }
    return undefined;
  }

  /** Accuracy score when the right card is picked (variants override). */
  diag_score(): number {
    return 100 - this.penalty;
  }

  pick(i: number) {
    const c = this.cards ? this.cards[i] : null;
    if (!c) return;
    if (this.wrong.has(i)) return;
    if (c["correct"]) {
      this.game.audio.play("sparkle");
      this.particles.burst("sparkle", c["rect"].centerx, c["rect"].centery, 8, 24);
      this.finish(this.diag_score());
    } else {
      this.wrong.add(i);
      this.mistake(25, "Not quite!", [c["rect"].centerx, c["rect"].y]);
    }
  }

  /** Card clicks / 1-2-3 keys. Returns true if the event was used. */
  card_event(e: any): boolean {
    if (!(this.cards && this.cards.length)) return false;
    if (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) {
      for (let i = 0; i < this.cards.length; i++) {
        if (this.cards[i]["rect"].collidepoint(this.game.mpos)) {
          this.pick(i);
          return true;
        }
      }
    } else if (e.type === pg.KEYDOWN && [pg.K_1, pg.K_2, pg.K_3].includes(e.key)) {
      this.pick({ [pg.K_1]: 0, [pg.K_2]: 1, [pg.K_3]: 2 }[e.key]);
      return true;
    }
    return false;
  }

  on_event(e: any) {
    if (this.guard(e)) return;
    if (this.card_event(e)) return;
    if (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) {
      for (const [k, r] of Object.entries(this.tray) as [string, Rect][]) {
        if (r.collidepoint(this.game.mpos)) {
          this.drag = k;
          this.game.audio.play("blip");
          return;
        }
      }
    } else if (e.type === pg.MOUSEBUTTONUP && e.button === 1) {
      this.drag = null;
    }
  }

  tick(dt: number) {
    let applying: string | null = null;
    if (this.drag && this.progress[this.drag] < 1 && this.hissing <= 0) {
      const [hx, hy] = this.hotspot(this.drag);
      const [mx, my] = this.game.mpos;
      if (Math.hypot(mx - hx, my - hy) < 12) {
        applying = this.drag;
        this.progress[this.drag] += dt * this.rate;
        if (pg.mod(Math.trunc(this.t * 10), 3) === 0) {
          this.particles.add("sparkle", hx + random.randint(-6, 6), hy + random.randint(-6, 6), 1, { life: 0.4 });
        }
        if (this.progress[this.drag] >= 1) {
          this.progress[this.drag] = 1;
          this.game.audio.play("star");
          this.particles.burst("sparkle", hx, hy, 6, 20);
        }
      }
    }
    // half-finished readings fade if you wander off
    for (const [k] of this.TOOLS) {
      if (k !== applying && this.progress[k] > 0 && this.progress[k] < 1) {
        this.progress[k] = Math.max(0, this.progress[k] - dt * 0.3);
      }
    }
    if (this.cards === null && Object.values(this.progress).every((v: any) => v >= 1)) {
      this.make_cards();
      this.game.audio.play("chime", 0.5);
    }
  }

  /** Clipboard of clues. revealed(k) says which tool's clue is visible. */
  draw_clipboard(s: Surface, cb: Rect, revealed: (k: string) => boolean, show_owner = true) {
    ui.panel(s, cb, [252, 250, 240], [150, 110, 80]);
    pg.draw.rect(s, [190, 190, 200], [cb.centerx - 10, cb.y - 2, 20, 5]);
    font.draw(s, "CLUES", [cb.x + 6, cb.y + 5], ui.ACCENT);
    const clues = this.clues();
    let y = cb.y + 14;
    for (const [k] of this.TOOLS) {
      s.blit(sprites.icon(k), [cb.x + 4, y]);
      const ok = revealed(k);
      const txt = ok ? clues[k] : "???";
      y = font.draw_wrapped(s, txt, [cb.x + 18, y + 3, cb.w - 22, 30], ok ? ui.INK : ui.MUTED) + 3;
    }
    if (show_owner) {
      const sym = data.AILMENTS[this.p.ailments[0]]["symptom"];
      font.draw_wrapped(s, "OWNER: " + sym, [cb.x, cb.bottom + 4, cb.w, 20], [110, 90, 120]);
    }
  }

  draw_cards(s: Surface, title_y = 126) {
    if (!(this.cards && this.cards.length)) return;
    font.draw(s, "WHAT'S THE DIAGNOSIS?", [120, title_y], ui.ACCENT, 1, [255, 255, 255], "center");
    this.cards.forEach((c: any, i: number) => {
      const hov = c["rect"].collidepoint(this.game.mpos) && !this.wrong.has(i);
      const col = this.wrong.has(i) ? [214, 206, 216] : hov ? [255, 236, 180] : [255, 250, 236];
      ui.panel(s, c["rect"].move(0, hov ? -1 : 0), col, ui.BORDER);
      font.draw(s, String(i + 1), [c["rect"].x + 3, c["rect"].y + 3], ui.ACCENT);
      font.draw_wrapped(s, this.label(c["opt"]), [c["rect"].x + 9, c["rect"].y + 4, 62, 20],
        this.wrong.has(i) ? ui.MUTED : ui.INK);
      if (this.wrong.has(i)) {
        pg.draw.line(s, ui.BAD, [c["rect"].x + 4, c["rect"].y + 4], [c["rect"].right - 5, c["rect"].bottom - 5], 1);
      }
    });
  }

  draw(s: Surface) {
    bg_room(s, [196, 236, 226], [236, 244, 250], [220, 234, 246], [184, 226, 214]);
    s.blit(sprites.obj("table"), [102, 120]);
    this.draw_animal(s);
    // hotspots
    for (const [k] of this.TOOLS) {
      if (this.progress[k] >= 1) continue;
      const [hx, hy] = this.hotspot(k);
      if (this.drag === k) {
        const r = 9 + Math.trunc(Math.sin(this.t * 8) * 2);
        pg.draw.circle(s, [255, 240, 120], [hx, hy], r, 1);
      } else if (pg.mod(Math.trunc(this.t * 2), 2)) {
        pg.draw.circle(s, [255, 255, 255], [hx, hy], 3, 1);
      }
      if (this.progress[k] > 0) {
        pg.draw.rect(s, ui.BORDER, [hx - 10, hy + 12, 20, 3]);
        pg.draw.rect(s, ui.GOOD, [hx - 10, hy + 12, Math.trunc(20 * this.progress[k]), 3]);
      }
    }
    // tray
    ui.panel(s, [6, 38, 38, 112], [255, 246, 236], ui.BORDER);
    for (const [k, r] of Object.entries(this.tray) as [string, Rect][]) {
      const done = this.progress[k] >= 1;
      pg.draw.rect(s, done ? [220, 246, 220] : [246, 236, 246], r);
      if (this.drag !== k) s.blit(sprites.big_icon(k, 2), [r.x + 3, r.y + 3]);
      if (done) s.blit(sprites.icon("check"), [r.right - 11, r.y]);
    }
    this.draw_clipboard(s, new Rect(214, 40, 102, 90), (k) => this.progress[k] >= 1);
    this.draw_cards(s);
    if (this.drag) this.draw_tool_cursor(s, this.drag);
    this.draw_common(s);
  }
}

// ======================================================================= BATH & GROOM
export class BathGame extends Minigame {
  station = "bath";
  title = "Bath & Grooming";
  static HINTS: any = {
    scrub: "HOLD & RUB THE SPONGE OVER THE MUD", fleas: "CLICK THE FLEAS BEFORE THEY HOP AWAY!",
    rinse: "HOLD THE MOUSE TO SPRAY AWAY ALL THE SUDS", dry: "HOLD & RUB THE TOWEL BACK AND FORTH",
    trim: "HOLD & TRACE THE DOTTED LINE FROM START TO END", tangles: "HOLD & BRUSH EACH KNOT UNTIL IT'S GONE",
  };
  static TOOLS: any = { scrub: "sponge", fleas: "comb", rinse: "shower", dry: "towel", trim: "shears", tangles: "brush" };
  HINTS: any = BathGame.HINTS;
  TOOLS: any = BathGame.TOOLS;

  static BUDGET: any = { scrub: 7, fleas: 8, rinse: 4.5, dry: 4, trim: 7, tangles: 6 };

  constructor(scene: any, patient: any, tasks_override: string[] | null = null) {
    super(scene, patient);
    const tasks: string[] = tasks_override ?? patient.tasks_for("bath");
    this.steps = [];
    if (tasks.includes("scrub")) this.steps.push("scrub");
    if (tasks.includes("fleas")) this.steps.push("fleas");
    if (this.steps.length) this.steps.push("rinse", "dry");
    if (tasks.includes("groom")) this.steps.push("trim", "tangles");
    this.idx = -1;
    this.step_scores = [];
    this.last_m = this.game.mpos;
    this.fleas_caught = 0;
    this.ax = 160;
    this.ay = 86;
    this.set_limit(pg.sum(this.steps.map((x: string) => BathGame.BUDGET[x] ?? 6)) || 6);
    this.next_step();
  }

  prog_frac(): number {
    return this.steps.length ? Math.max(0, this.idx) / this.steps.length : 1;
  }

  current_raw(): number {
    const sc = this.step_scores.concat(this.step ? [Math.max(5, Math.min(100, this.step_score()))] : []);
    return sc.length ? pg.sum(sc) / sc.length : 50;
  }

  get step(): string {
    return this.steps[this.idx];
  }

  get hint(): string {
    return this.HINTS[this.step] ?? "";
  }

  next_step() {
    if (this.idx >= 0) {
      this.step_scores.push(Math.max(5, Math.min(100, this.step_score())));
    }
    this.idx += 1;
    this._pen0 = this.penalty;
    this.step_t = 0.0;
    this.step_pen = 0.0;
    if (this.idx >= this.steps.length) {
      this.finish(this.step_scores.length ? pg.sum(this.step_scores) / this.step_scores.length : 100);
      return;
    }
    const st = this.step;
    if (st !== this.steps[0]) this.game.audio.play("star");
    if (st === "scrub") {
      const spots = [[8, 15], [15, 17], [11, 19], [7, 8], [16, 9], [12, 12], [13, 5], [5, 12]];
      random.shuffle(spots);
      const n = Math.min(spots.length, 3 + Math.trunc(this.diff));
      this.patches = spots.slice(0, n).map((u) => ({ u, dirt: 1.0 }));
    } else if (st === "fleas") {
      this.flea_total = Math.min(14, 5 + this.level + (this.p.personality === "nervous" ? 2 : 0));
      this.flea_spawned = 0;
      this.fleas = [];
      this.spawn_cd = 0.3;
      this.missed = 0;
    } else if (st === "rinse") {
      this.suds = new Map<string, number>();
      for (let gx = 0; gx < 8; gx++) {
        for (let gy = 0; gy < 8; gy++) {
          const ux = 1.5 + gx * 2.7, uy = 2 + gy * 2.5;
          if (((ux - 12) / 10) ** 2 + ((uy - 12) / 10.5) ** 2 < 1) {
            this.suds.set(gx + "," + gy, 1.0);
          }
        }
      }
      this.suds_total = this.suds.size;
    } else if (st === "dry") {
      this.dry = 0.0;
    } else if (st === "trim") {
      this.path = [];
      const n = 22;
      for (let i = 0; i < n + 1; i++) {
        const a = Math.PI * (1.1 + (0.8 * i) / n);
        const rr = 12.5 + Math.sin(i * 1.3) * 0.8;
        this.path.push([12 + Math.cos(a) * rr, 13 + Math.sin(a) * rr]);
      }
      this.trim_i = 0;
      this.mistakes = 0;
      this.snip_cd = 0;
      this.tol = 6 * (this.has("pro_shears") ? 1.6 : 1.0);
    } else if (st === "tangles") {
      const spots = [[6, 12], [17, 13], [10, 18], [14, 7], [8, 5], [16, 19]];
      random.shuffle(spots);
      const n = Math.min(spots.length, 2 + Math.floor(this.level / 2));
      this.knots = spots.slice(0, n).map((u) => ({ u, prog: 0.0 }));
    }
  }

  step_score(): number {
    const st = this.step;
    if (st === "fleas") {
      const base = (100 * this.fleas_hit) / Math.max(1, this.flea_total);
      return base - this.step_pen - this.step_mistakes();
    }
    return 100 - this.step_pen - this.step_mistakes();
  }

  get fleas_hit(): number {
    return this._fh ?? 0;
  }

  on_event(e: any) {
    if (this.done || this.guard(e)) return;
    if (e.type === pg.MOUSEBUTTONDOWN && e.button === 1 && this.step === "fleas") {
      const [mx, my] = this.game.mpos;
      const rad = 5 * (this.has("flea_comb") ? 1.9 : 1.0);
      for (const f of this.fleas) {
        if (f["dead"] || f["gone"]) continue;
        const [fx, fy] = this.flea_pos(f);
        if (Math.hypot(mx - fx, my - fy) < rad + 2) {
          f["dead"] = true;
          this._fh = this.fleas_hit + 1;
          this.fleas_caught += 1;
          this.game.audio.play("pop");
          this.particles.burst("sparkle", fx, fy, 4, 14);
          return;
        }
      }
      this.step_pen += 2;
    }
  }

  flea_pos(f: any): number[] {
    const k = Math.min(1.0, f["hop_t"] / f["hop_dur"]);
    const ux = f["from"][0] + (f["to"][0] - f["from"][0]) * k;
    const uy = f["from"][1] + (f["to"][1] - f["from"][1]) * k - Math.sin(k * Math.PI) * 3;
    return this.upx(ux, uy);
  }

  tick(dt: number) {
    this.step_t += dt;
    const m = this.game.mpos;
    const moved = Math.hypot(m[0] - this.last_m[0], m[1] - this.last_m[1]);
    this.last_m = m;
    const held = this.game.mouse_down && this.hissing <= 0;
    const st = this.step;
    if (st === "scrub") {
      const rate = 0.014 * (this.has("super_sponge") ? 2.0 : 1.0);
      for (const pch of this.patches) {
        if (pch["dirt"] <= 0) continue;
        const [px, py] = this.upx(pch["u"][0], pch["u"][1]);
        if (held && Math.hypot(m[0] - px, m[1] - py) < 14) {
          pch["dirt"] -= moved * rate + dt * 0.15;
          if (random.random() < 0.3) {
            this.particles.add("bubble", m[0] + random.randint(-6, 6), m[1] + random.randint(-6, 6), 1, { life: 0.6 });
          }
          if (moved > 2 && pg.mod(Math.trunc(this.t * 12), 3) === 0) this.game.audio.play("scrub", 0.5);
          if (pch["dirt"] <= 0) this.game.audio.play("blip");
        }
      }
      if (this.patches.every((p: any) => p["dirt"] <= 0)) this.next_step();
    } else if (st === "fleas") {
      this.spawn_cd -= dt;
      const alive = this.fleas.filter((f: any) => !f["dead"] && !f["gone"]);
      if (this.spawn_cd <= 0 && this.flea_spawned < this.flea_total && alive.length < 5) {
        this.spawn_cd = random.uniform(0.3, 0.75) / this.diff;
        const u = [random.uniform(6, 18), random.uniform(6, 20)];
        this.fleas.push({ from: u, to: u, hop_t: 1, hop_dur: 1, cd: 0.15, life: 3.4 / this.diff });
        this.flea_spawned += 1;
      }
      for (const f of alive) {
        f["life"] -= dt;
        f["hop_t"] += dt;
        if (f["hop_t"] >= f["hop_dur"]) {
          f["cd"] -= dt;
          if (f["cd"] <= 0) {
            f["from"] = f["to"];
            f["to"] = [random.uniform(5, 19), random.uniform(5, 20)];
            f["hop_t"] = 0;
            f["hop_dur"] = random.uniform(0.2, 0.36) / this.diff;
            f["cd"] = random.uniform(0.22, 0.55) / this.diff;
          }
        }
        if (f["life"] <= 0) {
          f["gone"] = true;
          this.missed += 1;
          const [fx, fy] = this.flea_pos(f);
          this.particles.text("Escaped!", fx, fy, ui.MUTED, 0.8);
        }
      }
      if (this.flea_spawned >= this.flea_total && !this.fleas.some((f: any) => !f["dead"] && !f["gone"])) {
        this.next_step();
      }
    } else if (st === "rinse") {
      if (held) {
        for (const [key, v] of Array.from(this.suds.entries()) as [string, number][]) {
          const [gx, gy] = key.split(",").map(Number);
          const [cx, cy] = this.upx(1.5 + gx * 2.7, 2 + gy * 2.5);
          if (Math.hypot(m[0] - cx, m[1] - cy) < 15) {
            this.suds.set(key, v - dt * 4);
            if (this.suds.get(key) <= 0) this.suds.delete(key);
          }
        }
        this.particles.add("drop", m[0] + random.randint(-5, 5), m[1] + 6, 1, { vx: 0, vy: 90, life: 0.3 });
        if (pg.mod(Math.trunc(this.t * 10), 4) === 0) this.game.audio.play("splash", 0.25);
      }
      if (this.suds.size <= this.suds_total * 0.08) this.next_step();
    } else if (st === "dry") {
      if (held && this.arect().inflate(20, 10).collidepoint(m)) {
        this.dry += moved / 600;
        if (moved > 3 && random.random() < 0.2) {
          this.particles.add("drop", m[0], m[1], 1, { life: 0.4, vy: -20 });
        }
      }
      if (this.dry >= 1) {
        this.particles.burst("sparkle", this.ax, this.ay, 10, 30);
        this.next_step();
      }
    } else if (st === "trim") {
      this.snip_cd -= dt;
      if (held && this.trim_i < this.path.length) {
        let best: number | null = null;
        for (let j = this.trim_i; j < Math.min(this.path.length, this.trim_i + 3); j++) {
          const [px, py] = this.upx(this.path[j][0], this.path[j][1]);
          const d = Math.hypot(m[0] - px, m[1] - py);
          if (d < this.tol * 1.4) best = j;
        }
        if (best !== null) {
          if (best >= this.trim_i) {
            this.trim_i = best + 1;
            if (this.trim_i % 3 === 0) this.game.audio.play("tick");
            const [px, py] = this.upx(this.path[best][0], this.path[best][1]);
            this.particles.add("puff", px, py, 1, { life: 0.4 });
          }
        } else {
          const near = Math.min(...this.path.map((q: number[]) => {
            const u = this.upx(q[0], q[1]);
            return Math.hypot(m[0] - u[0], m[1] - u[1]);
          }));
          if (near > this.tol * 2.2 && this.trim_i > 0 && this.snip_cd <= 0) {
            this.snip_cd = 0.5;
            this.mistakes += 1;
            this.step_pen += 8;
            this.particles.text("Off the line!", m[0], m[1] - 8, ui.BAD, 0.8);
            this.game.audio.play("error", 0.6);
          }
        }
      }
      if (this.trim_i >= this.path.length) this.next_step();
    } else if (st === "tangles") {
      for (const k of this.knots) {
        if (k["prog"] >= 1) continue;
        const [kx, ky] = this.upx(k["u"][0], k["u"][1]);
        if (held && Math.hypot(m[0] - kx, m[1] - ky) < 11) {
          k["prog"] += moved * 0.012 + dt * 0.1;
          if (random.random() < 0.15) this.particles.add("puff", kx, ky, 1, { life: 0.5 });
          if (k["prog"] >= 1) {
            this.game.audio.play("pop");
            this.particles.burst("sparkle", kx, ky, 5, 16);
          }
        }
      }
      if (this.knots.every((k: any) => k["prog"] >= 1)) this.next_step();
    }
  }

  draw(s: Surface) {
    if (this.done) return;
    const st = this.step;
    const grooming = st === "trim" || st === "tangles";
    if (grooming) {
      bg_room(s, [250, 226, 236], [250, 246, 240], [240, 232, 226], [244, 210, 224]);
      s.blit(sprites.obj("table"), [112, 120]);
    } else {
      bg_room(s, [200, 228, 250], [236, 246, 252], [214, 232, 248], [186, 216, 244]);
    }
    const skip = ["fleas", "mud", "matted"];
    this.draw_animal(s, null, skip);
    if (st === "scrub") {
      for (const pch of this.patches) {
        if (pch["dirt"] > 0) {
          const [px, py] = this.upx(pch["u"][0], pch["u"][1]);
          const rad = Math.trunc(4 + 6 * pch["dirt"]);
          pg.draw.ellipse(s, [140, 100, 62], [px - rad, py - Math.floor((rad * 2) / 3), rad * 2, Math.floor((rad * 4) / 3)]);
          pg.draw.ellipse(s, [166, 124, 80], [px - Math.floor(rad / 2), py - Math.floor(rad / 2), rad, Math.floor(rad / 2) + 1]);
        }
      }
    } else if (st === "fleas") {
      for (const f of this.fleas) {
        if (f["dead"] || f["gone"]) continue;
        const [fx, fy] = this.flea_pos(f);
        pg.draw.rect(s, [40, 30, 30], [fx - 1, fy - 1, 3, 3]);
        pg.draw.rect(s, [120, 90, 80], [fx - 2, fy + 1, 1, 1]);
        pg.draw.rect(s, [120, 90, 80], [fx + 2, fy + 1, 1, 1]);
      }
      font.draw(s, `FLEAS: ${this.fleas_hit}/${this.flea_total}`, [8, 50], ui.INK);
    } else if (st === "rinse") {
      for (const [key, v] of this.suds.entries() as IterableIterator<[string, number]>) {
        const [gx, gy] = key.split(",").map(Number);
        const [cx, cy] = this.upx(1.5 + gx * 2.7, 2 + gy * 2.5);
        const rad = Math.max(1, Math.trunc(4 * v));
        pg.draw.circle(s, [255, 255, 255], [cx, cy], rad);
        pg.draw.circle(s, [210, 230, 250], [cx + 1, cy - 1], Math.max(1, Math.floor(rad / 2)));
      }
    } else if (st === "dry") {
      for (let i = 0; i < 6; i++) {
        if (this.dry < (i + 1) / 6) {
          const ux = 5 + ((i * 3.1) % 15), uy = 6 + ((i * 5.3) % 14);
          const [px, py] = this.upx(ux, uy);
          pg.draw.rect(s, [130, 200, 250], [px, py, 2, 3]);
        }
      }
      pg.draw.rect(s, ui.BORDER, [110, 140, 100, 6]);
      pg.draw.rect(s, [250, 180, 200], [111, 141, Math.trunc(98 * Math.min(1, this.dry)), 4]);
      font.draw(s, "DRY", [90, 141], ui.INK);
    } else if (st === "trim") {
      const variants = data.ANIMALS[this.p.kind]["variants"];
      this.path.forEach((q: number[], j: number) => {
        const [px, py] = this.upx(q[0], q[1]);
        if (j >= this.trim_i) {
          const col = sprites.darker(variants[pg.mod(this.p.variant, variants.length)]["body"], 0.75);
          pg.draw.line(s, col, [px, py], [px + (j % 3) - 1, py - 5], 2);
          if (j % 2 === 0) pg.draw.rect(s, [255, 255, 255], [px, py, 1, 1]);
        }
      });
      const sp = this.path[Math.min(this.trim_i, this.path.length - 1)];
      const [sx, sy] = this.upx(sp[0], sp[1]);
      if (this.trim_i === 0) font.draw(s, "START", [sx - 8, sy + 4], ui.ACCENT, 1, [255, 255, 255]);
      pg.draw.circle(s, [255, 230, 120], [sx, sy], 4 + Math.trunc(Math.sin(this.t * 8)), 1);
    } else if (st === "tangles") {
      for (const k of this.knots) {
        if (k["prog"] >= 1) continue;
        const [kx, ky] = this.upx(k["u"][0], k["u"][1]);
        const rad = Math.trunc(3 + 5 * (1 - k["prog"]));
        for (let a = 0; a < 360; a += 50) {
          const ang = ((a + this.t * 40) * Math.PI) / 180;
          pg.draw.line(s, [90, 70, 60], [kx, ky],
            [kx + Math.trunc(Math.cos(ang) * rad), ky + Math.trunc(Math.sin(ang) * rad)], 1);
        }
      }
    }
    if (!grooming) s.blit(sprites.obj("tub"), [105, 110]);
    step_chips(s, this.steps, this.idx);
    this.draw_tool_cursor(s, this.TOOLS[st]);
    this.draw_common(s);
  }
}

// ======================================================================= MEDS
export class MedsGame extends Minigame {
  station = "meds";
  title = "Medicine & Shots";
  static HINTS: any = {
    syringe: "HOLD MOUSE / SPACE TO FILL - RELEASE IN THE GREEN ZONE",
    pill: "DRAG THE PILL INTO THE TREAT - THEN FEED IT WHILE THEY SNIFF",
    shot: "CLICK / SPACE WHEN THE MARKER IS IN THE SWEET SPOT",
  };
  static NAMES: any = { syringe: "Fill", pill: "Pill", shot: "Shot" };
  HINTS: any = MedsGame.HINTS;
  NAMES: any = MedsGame.NAMES;

  static BUDGET: any = { syringe: 6.5, pill: 9, shot: 6 };

  constructor(scene: any, patient: any, tasks_override: string[] | null = null) {
    super(scene, patient);
    const order = ["syringe", "pill", "shot"];
    const tasks: string[] = tasks_override ?? patient.tasks_for("meds");
    this.steps = order.filter((t) => tasks.includes(t));
    this.idx = -1;
    this.step_scores = [];
    this.ax = 96;
    this.ay = 92;
    this.steady = this.has("steady_syringe") ? 1.45 : 1.0;
    this.holding = false;
    this.set_limit(pg.sum(this.steps.map((x: string) => MedsGame.BUDGET[x] ?? 6)) || 6);
    this.next_step();
  }

  prog_frac(): number {
    return this.steps.length ? Math.max(0, this.idx) / this.steps.length : 1;
  }

  current_raw(): number {
    const sc = this.step_scores.concat(this.step ? [Math.max(5, 100 - (this.pen ?? 0) - this.step_mistakes())] : []);
    return sc.length ? pg.sum(sc) / sc.length : 50;
  }

  get step(): string {
    return this.steps[this.idx];
  }

  get hint(): string {
    return this.HINTS[this.step] ?? "";
  }

  next_step(score: number | null = null) {
    if (score !== null && score !== undefined) {
      // mistakes / nips / bites made during the step count against it
      this.step_scores.push(Math.max(5, Math.min(100, score - this.step_mistakes())));
    }
    this.idx += 1;
    this._pen0 = this.penalty;
    this.step_t = 0.0;
    this.pen = 0.0;
    this.attempts = 0;
    if (this.idx >= this.steps.length) {
      this.finish(this.step_scores.length ? pg.sum(this.step_scores) / this.step_scores.length : 100);
      return;
    }
    const st = this.step;
    if (st === "syringe") {
      this.level_f = 0.0;
      this.hold_t = 0.0;
      this.zw = 0.11 * this.steady;
      this.z0 = random.uniform(0.35, 0.8 - this.zw);
    } else if (st === "pill") {
      this.items = { pill: [new Rect(232, 70, 24, 24), [232, 70]], treat: [new Rect(276, 70, 24, 24), [276, 70]] };
      this.combined = false;
      this.drag = null;
      this.sniff = false;
      this.sniff_t = 0.9;
    } else if (st === "shot") {
      this.mk = 0.0;
      this.mdir = 1;
      this.zw = 0.1 * this.steady;
      this.zc = random.uniform(0.25, 0.75);
      this.needle_t = 0;
    }
  }

  zone_c(): number {
    let c = this.zc;
    if (this.p.personality === "nervous") c += Math.sin(this.t * 2.6) * 0.12;
    return Math.max(this.zw / 2, Math.min(1 - this.zw / 2, c));
  }

  release_fill() {
    const lv = this.level_f;
    if (this.z0 <= lv && lv <= this.z0 + this.zw) {
      const c = this.z0 + this.zw / 2;
      const sc = 100 - (Math.abs(lv - c) / (this.zw / 2)) * 25 - this.pen;
      this.game.audio.play("sparkle");
      this.particles.text(sc > 90 ? "Perfect dose!" : "Good dose!", 250, 50, ui.GOOD);
      this.next_step(sc);
    } else if (lv > 0.02) {
      this.attempts += 1;
      this.mistake(20, lv > this.z0 ? "Too much!" : "Too little!");
      this.level_f = 0;
      if (this.attempts >= 3) this.next_step(25);
    }
  }

  shot_click() {
    if (this.needle_t > 0) return;
    const c = this.zone_c();
    if (Math.abs(this.mk - c) <= this.zw / 2) {
      const acc = Math.abs(this.mk - c) / (this.zw / 2);
      const sc = 100 - acc * 20 - this.pen;
      if (acc < 0.3) {
        this.st["stats"]["perfect_shots"] += 1;
        this.particles.text("BULLSEYE!", this.ax, this.ay - 40, ui.GOLD);
      }
      this.game.audio.play("shot");
      this.needle_t = 0.6;
      this._pending = sc;
    } else {
      this.attempts += 1;
      this.mistake(20, "Ouch!");
      if (this.attempts >= 3) {
        this.game.audio.play("shot");
        this.needle_t = 0.6;
        this._pending = 30;
      }
    }
  }

  on_event(e: any) {
    if (this.done || this.guard(e)) return;
    const st = this.step;
    const down = (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) || (e.type === pg.KEYDOWN && e.key === pg.K_SPACE);
    const up = (e.type === pg.MOUSEBUTTONUP && e.button === 1) || (e.type === pg.KEYUP && e.key === pg.K_SPACE);
    if (st === "syringe") {
      if (down) {
        this.holding = true;
        this.hold_t = 0;
      } else if (up && this.holding) {
        this.holding = false;
        this.release_fill();
      }
    } else if (st === "shot") {
      if (down) this.shot_click();
    } else if (st === "pill") {
      const m = this.game.mpos;
      if (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) {
        for (const [k, [r]] of Object.entries(this.items) as [string, any][]) {
          if (r.collidepoint(m)) {
            this.drag = k;
            this.off = [m[0] - r.x, m[1] - r.y];
            this.game.audio.play("blip");
            return;
          }
        }
      } else if (e.type === pg.MOUSEBUTTONUP && e.button === 1 && this.drag) {
        const k = this.drag;
        this.drag = null;
        const [r, home] = this.items[k];
        const mouth = new Rect(0, 0, 30, 24);
        mouth.center = this.upx(12, 12);
        if (k === "pill" && this.items["treat"][0].colliderect(r) && !this.combined) {
          this.combined = true;
          delete this.items["pill"];
          this.game.audio.play("pop");
          this.particles.burst("sparkle", r.centerx, r.centery, 5, 16);
          return;
        }
        if (mouth.colliderect(r)) {
          if (k === "pill") {
            this.mistake(15, "Ptooey!");
            this.flash("Hide the pill inside the treat first!", ui.BAD);
          } else if (k === "treat" && !this.combined) {
            this.flash("The pill goes in the treat first!", ui.BAD);
          } else if (!this.sniff) {
            this.mistake(12, "Not now!");
            this.flash("Wait until they sniff the treat!", ui.BAD);
          } else {
            this.game.audio.play("heart");
            this.particles.burst("heart", r.centerx, r.centery, 4, 18);
            this.next_step(100 - this.pen);
            return;
          }
        }
        r.topleft = home;
      }
    }
  }

  tick(dt: number) {
    this.step_t += dt;
    const st = this.step;
    if (st === "syringe" && this.holding) {
      this.hold_t += dt;
      this.level_f += dt * 0.36 * this.diff * (1 + this.hold_t * 0.6);
      if (pg.mod(Math.trunc(this.t * 20), 4) === 0) this.game.audio.play("pour", 0.3);
      if (this.level_f >= 1) {
        this.holding = false;
        this.level_f = 1;
        this.release_fill();
      }
    } else if (st === "shot") {
      if (this.needle_t > 0) {
        this.needle_t -= dt;
        if (this.needle_t <= 0) {
          this.particles.burst("sparkle", this.ax + 20, this.ay, 6, 20);
          this.next_step(this._pending);
        }
        return;
      }
      this.mk += this.mdir * dt * 1.05 * this.diff;
      if (this.mk >= 1) {
        this.mk = 1;
        this.mdir = -1;
      } else if (this.mk <= 0) {
        this.mk = 0;
        this.mdir = 1;
      }
    } else if (st === "pill") {
      this.sniff_t -= dt;
      if (this.sniff_t <= 0) {
        this.sniff = !this.sniff;
        const base = this.p.personality === "nervous" ? 0.7 : 1.0;
        this.sniff_t = (this.sniff ? base : random.uniform(0.9, 1.6)) / Math.max(1, this.diff * 0.7);
      }
      if (this.drag) {
        const m = this.game.mpos;
        this.items[this.drag][0].topleft = [m[0] - this.off[0], m[1] - this.off[1]];
      }
    }
  }

  draw(s: Surface) {
    if (this.done) return;
    bg_room(s, [240, 230, 250], [246, 244, 250], [232, 228, 244], [226, 214, 244]);
    pg.draw.rect(s, [200, 170, 130], [20, 128, 150, 6]);
    const st = this.step;
    let mood: string | null = null;
    if (st === "pill") mood = this.sniff ? "happy" : "blink";
    this.draw_animal(s, mood, st === "pill" ? ["tummy"] : []);
    step_chips(s, this.steps.map((x: string) => this.NAMES[x]), this.idx);
    if (st === "syringe") {
      const bx = 236, by = 50, bw = 22, bh = 96;
      ui.panel(s, [bx - 8, by - 6, bw + 16, bh + 16], [255, 255, 255], ui.BORDER);
      pg.draw.rect(s, [230, 240, 250], [bx, by, bw, bh]);
      const zy0 = by + bh - Math.trunc(bh * (this.z0 + this.zw));
      pg.draw.rect(s, [160, 230, 160], [bx, zy0, bw, Math.trunc(bh * this.zw)]);
      const fh = Math.trunc(bh * this.level_f);
      pg.draw.rect(s, [240, 120, 150], [bx + 3, by + bh - fh, bw - 6, fh]);
      for (let i = 1; i < 10; i++) pg.draw.rect(s, ui.BORDER, [bx, by + Math.floor((bh * i) / 10), 4, 1]);
      pg.draw.rect(s, ui.BORDER, [bx, by, bw, bh], 1);
      pg.draw.rect(s, [150, 150, 170], [bx + Math.floor(bw / 2) - 1, by + bh, 2, 8]);
      font.draw(s, "MEDICINE", [bx + Math.floor(bw / 2), by - 12], ui.INK, 1, null, "center");
      if (this.holding) {
        this.particles.add("drop", bx + Math.floor(bw / 2), by + bh - fh - 2, 1, { vx: random.uniform(-10, 10), vy: -20, life: 0.3 });
      }
    } else if (st === "pill") {
      const mouth = this.upx(12, 12);
      if (this.sniff) {
        font.draw(s, "SNIFF SNIFF", [mouth[0], this.ay - 46], ui.GOOD, 1, [255, 255, 255], "center");
        pg.draw.circle(s, [255, 240, 120], mouth, 13 + Math.trunc(Math.sin(this.t * 9) * 2), 1);
      } else {
        font.draw(s, "HMPH!", [mouth[0], this.ay - 46], ui.MUTED, 1, [255, 255, 255], "center");
      }
      ui.panel(s, [222, 58, 90, 46], [255, 250, 240], ui.BORDER);
      for (const [k, [r]] of Object.entries(this.items) as [string, any][]) {
        const name = k === "pill" ? "pill" : this.combined ? "pilltreat" : "treat";
        s.blit(sprites.big_icon(name, 2), r.topleft);
      }
      if ("pill" in this.items) font.draw(s, "PILL", [244, 96], ui.INK, 1, null, "center");
      font.draw(s, "TREAT", [288, 96], ui.INK, 1, null, "center");
    } else if (st === "shot") {
      const mx0 = 60, mw = 200;
      ui.panel(s, [mx0 - 4, 136, mw + 8, 14], [255, 255, 255], ui.BORDER);
      const c = this.zone_c();
      const zx = mx0 + Math.trunc((c - this.zw / 2) * mw);
      pg.draw.rect(s, [250, 220, 120], [zx - 4, 139, Math.trunc(this.zw * mw) + 8, 8]);
      pg.draw.rect(s, [130, 220, 130], [zx, 139, Math.trunc(this.zw * mw), 8]);
      const kx = mx0 + Math.trunc(this.mk * mw);
      pg.draw.polygon(s, ui.BAD, [[kx - 3, 133], [kx + 3, 133], [kx, 138]]);
      pg.draw.rect(s, ui.INK, [kx, 138, 1, 10]);
      const sx = this.needle_t <= 0 ? 200 : Math.trunc(200 - ((0.6 - this.needle_t) / 0.6) * 70);
      s.blit(sprites.big_icon("syringe", 3), [sx, 70]);
      font.draw(s, `TRIES LEFT: ${3 - this.attempts}`, [260, 52], ui.INK, 1, null, "center");
    }
    this.draw_common(s);
  }
}

// ======================================================================= CARE
export class CareGame extends Minigame {
  station = "care";
  title = "Food & Bandages";
  static HINTS: any = {
    food: "CLICK THE RIGHT FOOD - THEN HOLD TO POUR UP TO THE LINE",
    bandage: "DRAG IN THE ARROW'S DIRECTION (OR PRESS ARROW KEYS / WASD)",
  };
  static NAMES: any = { food: "Food", bandage: "Bandage" };
  static DIRV: any = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  static GLYPH: any = { up: "|", down: "`", left: "{", right: "}" };
  HINTS: any = CareGame.HINTS;
  NAMES: any = CareGame.NAMES;
  DIRV: any = CareGame.DIRV;
  GLYPH: any = CareGame.GLYPH;

  constructor(scene: any, patient: any, tasks_override: string[] | null = null) {
    super(scene, patient);
    const tasks: string[] = tasks_override ?? patient.tasks_for("care");
    this.steps = ["food", "bandage"].filter((t) => tasks.includes(t));
    this.idx = -1;
    this.step_scores = [];
    this.ax = 84;
    this.ay = 92;
    const nb = 6 + Math.min(4, Math.floor(this.level / 2));
    this.set_limit(pg.sum(this.steps.map((x: string) => (x === "food" ? 8 : 2.5 + nb * 1.1))) || 6);
    this.next_step();
  }

  prog_frac(): number {
    return this.steps.length ? Math.max(0, this.idx) / this.steps.length : 1;
  }

  current_raw(): number {
    const sc = this.step_scores.concat(this.step ? [Math.max(5, 100 - (this.pen ?? 0) - this.step_mistakes())] : []);
    return sc.length ? pg.sum(sc) / sc.length : 50;
  }

  get step(): string {
    return this.steps[this.idx];
  }

  get hint(): string {
    if (this.step === "food" && (this.phase ?? "") === "pour") {
      return "HOLD MOUSE / SPACE TO POUR - RELEASE AT THE DOTTED LINE";
    }
    return this.HINTS[this.step] ?? "";
  }

  next_step(score: number | null = null) {
    if (score !== null && score !== undefined) {
      // mistakes / nips / bites made during the step count against it
      this.step_scores.push(Math.max(5, Math.min(100, score - this.step_mistakes())));
    }
    this.idx += 1;
    this._pen0 = this.penalty;
    this.step_t = 0.0;
    this.pen = 0.0;
    if (this.idx >= this.steps.length) {
      this.finish(this.step_scores.length ? pg.sum(this.step_scores) / this.step_scores.length : 100);
      return;
    }
    if (this.step === "food") {
      const right = data.ANIMALS[this.p.kind]["food"];
      const others = Object.keys(data.FOODS).filter((f) => f !== right);
      random.shuffle(others);
      const opts = [right].concat(others.slice(0, 3));
      random.shuffle(opts);
      this.bags = opts.map((f, i) => ({ food: f, rect: new Rect(150 + i * 42, 53, 36, 40), wrong: false }));
      this.phase = "choose";
      this.fill = 0.0;
      this.target = random.uniform(0.55, 0.8);
      this.pouring = false;
      this.food = right;
    } else {
      const n = 6 + Math.min(4, Math.floor(this.level / 2));
      const dirs = Object.keys(this.DIRV);
      this.prompts = pg.range(n).map(() => random.choice(dirs));
      this.pi = 0;
      this.plimit = (2.0 * (this.has("silk_bandage") ? 1.45 : 1.0)) / this.diff;
      this.ptime = this.plimit;
      this.drag0 = null;
    }
  }

  bandage_input(d: string) {
    const want = this.prompts[this.pi];
    if (d === want) {
      this.pi += 1;
      this.ptime = this.plimit;
      this.game.audio.play("wrap");
      this.particles.add("sparkle", 230, 110, 3);
      if (this.pi >= this.prompts.length) {
        this.game.audio.play("sparkle");
        this.next_step(100 - this.pen);
      }
    } else {
      this.mistake(10, "Wrong way!");
    }
  }

  release_pour() {
    this.pouring = false;
    const diff = this.fill - this.target;
    if (diff > 0.11) {
      this.mistake(25, "Too much!");
      this.fill = 0;
    } else if (diff < -0.11) {
      this.flash("A little more...", ui.INK);
    } else {
      const sc = 100 - Math.abs(diff) * 200 - this.pen;
      this.game.audio.play("heart");
      this.particles.burst("heart", this.ax, this.ay - 30, 5, 20);
      this.next_step(sc);
    }
  }

  on_event(e: any) {
    if (this.done || this.guard(e)) return;
    const m = this.game.mpos;
    if (this.step === "food") {
      if (this.phase === "choose") {
        if (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) {
          for (const b of this.bags) {
            if (b["rect"].collidepoint(m) && !b["wrong"]) {
              if (b["food"] === this.food) {
                this.phase = "pour";
                this.game.audio.play("select");
              } else {
                b["wrong"] = true;
                this.mistake(20, "Not for a " + data.ANIMALS[this.p.kind]["name"] + "!");
              }
              return;
            }
          }
        }
      } else {
        const down = (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) || (e.type === pg.KEYDOWN && e.key === pg.K_SPACE);
        const up = (e.type === pg.MOUSEBUTTONUP && e.button === 1) || (e.type === pg.KEYUP && e.key === pg.K_SPACE);
        if (down) {
          this.pouring = true;
        } else if (up && this.pouring) {
          this.release_pour();
        }
      }
    } else {
      const keymap: any = {
        [pg.K_UP]: "up", [pg.K_w]: "up", [pg.K_DOWN]: "down", [pg.K_s]: "down",
        [pg.K_LEFT]: "left", [pg.K_a]: "left", [pg.K_RIGHT]: "right", [pg.K_d]: "right",
      };
      if (e.type === pg.KEYDOWN && e.key in keymap) {
        this.bandage_input(keymap[e.key]);
      } else if (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) {
        this.drag0 = m;
      } else if ((e.type === pg.MOUSEMOTION || e.type === pg.MOUSEBUTTONUP) && this.drag0) {
        const dx = m[0] - this.drag0[0], dy = m[1] - this.drag0[1];
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= 16) {
          const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
          this.drag0 = null;
          this.bandage_input(d);
        } else if (e.type === pg.MOUSEBUTTONUP) {
          this.drag0 = null;
        }
      }
    }
  }

  tick(dt: number) {
    this.step_t += dt;
    if (this.step === "food") {
      if (this.phase === "pour" && this.pouring) {
        const rate = 0.38 * this.diff * (this.has("smart_scoop") ? 0.7 : 1.0);
        this.fill += dt * rate;
        if (pg.mod(Math.trunc(this.t * 20), 4) === 0) {
          this.game.audio.play("pour", 0.3);
          this.particles.add("mud", 232 + random.randint(-3, 3), 100, 1, { vx: 0, vy: 60, life: 0.3 });
        }
        if (this.fill >= 1) {
          this.fill = 1;
          this.release_pour();
        }
      }
    } else {
      this.ptime -= dt;
      if (this.ptime <= 0) {
        this.ptime = this.plimit;
        this.mistake(10, "Too slow!");
      }
    }
  }

  draw(s: Surface) {
    if (this.done) return;
    bg_room(s, [250, 238, 210], [250, 244, 232], [240, 230, 214], [240, 222, 190]);
    const st = this.step;
    this.draw_animal(s, st === "food" && this.phase === "pour" && this.pouring ? "happy" : null,
      st === "food" ? ["hungry"] : ["paw"]);
    step_chips(s, this.steps.map((x: string) => this.NAMES[x]), this.idx);
    if (st === "food") {
      if (this.phase === "choose") {
        font.draw(s, "WHAT DOES A " + data.ANIMALS[this.p.kind]["name"].toUpperCase() + " EAT?", [234, 98], ui.ACCENT,
          1, [255, 255, 255], "center");
        for (const b of this.bags) {
          const r: Rect = b["rect"];
          const hov = r.collidepoint(this.game.mpos) && !b["wrong"];
          ui.panel(s, r.move(0, hov ? -1 : 0), b["wrong"] ? [214, 206, 216] : hov ? [255, 240, 200] : [255, 252, 244], ui.BORDER);
          s.blit(sprites.big_icon("bag", 2, data.FOODS[b["food"]]["color"]), [r.x + 6, r.y + 3]);
          font.draw_wrapped(s, data.FOODS[b["food"]]["name"], [r.x + 2, r.y + 28, 34, 14], ui.INK, 1, null, "center");
        }
      } else {
        const bowl = new Rect(200, 112, 64, 26);
        const ty = bowl.bottom - 4 - Math.trunc(this.target * 22);
        const fy = bowl.bottom - 4 - Math.trunc(this.fill * 22);
        pg.draw.ellipse(s, [240, 120, 120], [bowl.x, bowl.y + 10, bowl.w, 16]);
        pg.draw.rect(s, sprites.darker(data.FOODS[this.food]["color"]), [bowl.x + 6, fy, bowl.w - 12, bowl.bottom - 6 - fy]);
        for (let y = fy; y < bowl.bottom - 6; y += 3) {
          for (let x = bowl.x + 7; x < bowl.right - 7; x += 4) {
            pg.draw.rect(s, data.FOODS[this.food]["color"], [x + pg.mod(y, 2), y, 2, 2]);
          }
        }
        pg.draw.rect(s, [240, 120, 120], [bowl.x + 4, bowl.bottom - 8, bowl.w - 8, 6]);
        for (let x = bowl.x - 6; x < bowl.right + 6; x += 4) pg.draw.rect(s, ui.INK, [x, ty, 2, 1]);
        font.draw(s, "LINE", [bowl.right + 8, ty - 2], ui.INK);
        s.blit(sprites.big_icon("scoop", 2), [220, 80 + (this.pouring ? 4 : 0)]);
        s.blit(sprites.big_icon("bag", 2, data.FOODS[this.food]["color"]), [264, 50]);
      }
    } else {
      // big paw
      const px = 232, py = 108;
      const variants = data.ANIMALS[this.p.kind]["variants"];
      const body = variants[pg.mod(this.p.variant, variants.length)]["body"];
      pg.draw.ellipse(s, body, [px - 22, py - 14, 44, 40]);
      pg.draw.ellipse(s, sprites.darker(body), [px - 22, py - 14, 44, 40], 1);
      pg.draw.ellipse(s, [250, 170, 180], [px - 10, py + 2, 20, 14]);
      [-14, -5, 5, 14].forEach((ox, i) => {
        pg.draw.circle(s, [250, 170, 180], [px + ox, py - 6 + (i === 0 || i === 3 ? 2 : 0)], 4);
      });
      pg.draw.circle(s, [240, 90, 100], [px + 3, py + 6], 3);
      for (let i = 0; i < this.pi; i++) {
        const yy = py - 14 + 6 + i * 5;
        pg.draw.rect(s, [252, 250, 244], [px - 21, yy, 42, 4]);
        pg.draw.rect(s, [220, 214, 200], [px - 21, yy + 3, 42, 1]);
      }
      if (this.pi < this.prompts.length) {
        const d = this.prompts[this.pi];
        const bx = 290;
        ui.panel(s, [bx - 16, 52, 32, 32], [255, 250, 236], ui.BORDER);
        font.draw(s, this.GLYPH[d], [bx, 60], ui.ACCENT, 3, null, "center");
        pg.draw.rect(s, ui.BORDER, [bx - 15, 86, 30, 3]);
        pg.draw.rect(s, this.ptime > this.plimit * 0.35 ? ui.GOOD : ui.BAD,
          [bx - 15, 86, Math.trunc((30 * Math.max(0, this.ptime)) / this.plimit), 3]);
        for (let j = this.pi + 1; j < Math.min(this.prompts.length, this.pi + 4); j++) {
          font.draw(s, this.GLYPH[this.prompts[j]], [bx - 10 + (j - this.pi - 1) * 10, 94], ui.MUTED);
        }
        font.draw(s, `WRAP ${this.pi + 1}/${this.prompts.length}`, [232, 140], ui.INK, 1, null, "center");
      }
    }
    this.draw_common(s);
  }
}

export const STATION_GAMES: any = { exam: ExamGame, bath: BathGame, meds: MedsGame, care: CareGame };

// ======================================================================= PICKER
let _variants: any = null;
/** All game classes by name (originals + variants), e.g. variant_classes().PillToss. */
export function variant_classes(): any {
  return variants();
}

function variants(): any {
  if (!_variants) {
    _variants = build_variants({ Minigame, ExamGame, BathGame, MedsGame, CareGame, bg_room, time_scale });
  }
  return _variants;
}

/** Last pick per station, so the same game doesn't come up twice in a row as often. */
const _last_pick: Record<string, string[]> = {};

function weighted(station: string, opts: [string, number][]): string {
  const last = _last_pick[station] ?? [];
  const ws = opts.map(([n, w]) => (opts.length > 1 && last.includes(n) ? w * 0.35 : w));
  let r = random.random() * pg.sum(ws);
  for (let i = 0; i < opts.length; i++) {
    r -= ws[i];
    if (r <= 0) return opts[i][0];
  }
  return opts[opts.length - 1][0];
}

/** Variant options for one task: [class name, weight]. */
const TASK_VARIANTS: Record<string, [string, number][]> = {
  syringe: [["MedsGame", 1], ["SteadyShot", 2]],
  shot: [["MedsGame", 1], ["SteadyShot", 2]],
  pill: [["MedsGame", 1], ["PillToss", 2]],
  food: [["CareGame", 1], ["FeedingFrenzy", 2]],
  bandage: [["CareGame", 1], ["BandageSeq", 2]],
};

/** Build the mini-game for a station, choosing randomly among the variants that fit the
 *  patient's tasks there. Several tasks may be split over a chain of games (scores averaged).
 *  station: "exam" | "bath" | "meds" | "care". The caller still does p.complete(station) after .done. */
export function make_station_game(station: string, scene: any, p: any): Minigame {
  const V = variants();
  if (station === "exam") {
    const name = weighted("exam", [["ExamGame", 1], ["Heartbeat", 1], ["XRay", 1]]);
    _last_pick["exam"] = [name];
    return new V[name](scene, p);
  }
  const classic: any = { bath: BathGame, meds: MedsGame, care: CareGame }[station];
  if (!classic) return new (STATION_GAMES[station] ?? ExamGame)(scene, p);
  const tasks: string[] = p.tasks_for(station);
  // segments: [class name, tasks] in play order
  const segs: [string, string[]][] = [];
  const add = (name: string, t: string) => {
    const seg = segs.find((sg) => sg[0] === name);
    if (seg) seg[1].push(t);
    else segs.push([name, [t]]);
  };
  if (station === "bath") {
    const flea_like = tasks.filter((t) => t === "fleas" || t === "scrub");
    const style = flea_like.length ? weighted("bath", [["BathGame", 1], ["FleaFrenzy", tasks.includes("fleas") ? 2.2 : 1]]) : "BathGame";
    if (style === "FleaFrenzy") {
      segs.push(["FleaFrenzy", flea_like]);
      if (tasks.includes("groom")) segs.push(["BathGame", ["groom"]]);
    } else {
      segs.push(["BathGame", tasks.slice()]);
    }
  } else {
    for (const t of tasks) {
      const opts = TASK_VARIANTS[t];
      add(opts ? weighted(station, opts) : ({ bath: "BathGame", meds: "MedsGame", care: "CareGame" } as any)[station], t);
    }
  }
  _last_pick[station] = segs.map((sg) => sg[0]);
  const make = (sg: [string, string[]]) => () => new (V[sg[0]] ?? classic)(scene, p, sg[1]);
  if (segs.length === 0) return new classic(scene, p);
  if (segs.length === 1) return make(segs[0])();
  return new V.ChainGame(scene, p, station, segs.map(make));
}
