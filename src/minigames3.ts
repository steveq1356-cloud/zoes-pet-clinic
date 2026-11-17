/* Fast quick-time variants of the treatment stations (picked by make_station_game in minigames.ts).
 *
 *   exam : Heartbeat (rhythm ECG, then diagnose)   XRay (flash-memory bone scan, then diagnose)
 *   bath : FleaFrenzy (whack hopping fleas / mud splats, combo counter)
 *   meds : PillToss (time the throw for the open mouth)   SteadyShot (hold a drifting needle on the vein)
 *   care : FeedingFrenzy (catch the right food, dodge chocolate & onions)   BandageSeq (arrow Simon-says)
 *   ChainGame runs several of these back to back when a patient needs more than one task at a station.
 *
 * minigames.ts imports this file, so to avoid a circular import the classes are built by
 * build_variants() from the base classes handed in at runtime (only types are imported here).
 */
import * as pg from "./pg";
import { Rect, Surface } from "./pg";
import * as data from "./data";
import * as font from "./font";
import * as sprites from "./sprites";
import * as ui from "./ui";
import type * as MG from "./minigames";

const random = pg.random;
const GO_T = 0.4; // same as minigames.GO_T (value import would be circular)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Kit = Pick<typeof MG, "Minigame" | "ExamGame" | "BathGame" | "MedsGame" | "CareGame" | "bg_room" | "time_scale">;

const KEYDIR: any = {
  [pg.K_UP]: "up", [pg.K_w]: "up", [pg.K_DOWN]: "down", [pg.K_s]: "down",
  [pg.K_LEFT]: "left", [pg.K_a]: "left", [pg.K_RIGHT]: "right", [pg.K_d]: "right",
};

function is_tap(e: any): boolean {
  return (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) || (e.type === pg.KEYDOWN && e.key === pg.K_SPACE);
}

function body_color(p: any, part = "body"): number[] {
  const vs = data.ANIMALS[p.kind]["variants"];
  return vs[pg.mod(p.variant, vs.length)][part];
}

export function build_variants(K: Kit) {
  const { Minigame, ExamGame, BathGame, MedsGame, CareGame, bg_room, time_scale } = K;

  const exam_bg = (s: Surface) => bg_room(s, [196, 236, 226], [236, 244, 250], [220, 234, 246], [184, 226, 214]);

  // ===================================================================== EXAM: HEARTBEAT
  class Heartbeat extends ExamGame {
    title = "Heartbeat Check";
    get hint(): string {
      if (this.phase === "beat") return "SPACE / CLICK AS EACH BEAT CROSSES THE LINE - NEVER TAP RED!";
      return "THE RHYTHM GAVE YOU CLUES - PICK THE DIAGNOSIS (1/2/3)";
    }

    constructor(scene: any, patient: any) {
      super(scene, patient);
      this.ax = 58;
      this.ay = 84;
      this.cursor_bites = false;
      this.phase = "beat";
      this.scr = new Rect(112, 44, 202, 68);
      this.zone_x = this.scr.x + 34;
      this.v = 60 * Math.sqrt(this.diff); // px per second
      const fever = (this.p.ailments as string[]).includes("fever");
      this.base_iv = (fever ? 0.46 : 0.6) / Math.pow(this.diff, 0.35);
      this.bpm = Math.round(60 / this.base_iv);
      const n = Math.min(13, 8 + Math.floor(this.level / 2));
      let t = (this.scr.right - this.zone_x) / this.v + 0.2;
      this.beats = [];
      const red_p = 0.08 + 0.08 * clamp(this.diff - 1, 0, 1);
      for (let i = 0; i < n; i++) {
        const red = i > 1 && random.random() < red_p;
        this.beats.push({ t, red, judged: false, hit: false, ticked: false, calm: false });
        let iv = this.base_iv * random.choice([1, 1, 1, 0.75, 1.5]);
        if (this.p.personality === "nervous") iv *= random.uniform(0.82, 1.18);
        t += iv;
      }
      this.duration = t;
      this.el = 0;
      this.win = 0.14 / Math.sqrt(this.diff);
      this.hits = 0;
      this.perfects = 0;
      this.misses = 0;
      this.combo = 0;
      this.best = 0;
      this.zone_flash = 0;
      this.zone_col = ui.GOOD;
      this.pulse = 0;
      this.revealed = new Set<string>();
      this.set_limit(7.5);
      this.limit += this.duration;
      this.time_left = this.limit;
      this.fixed_time = this.duration;
    }

    good_total(): number {
      return Math.max(1, this.beats.filter((b: any) => !b.red && !b.calm).length);
    }

    rhythm_frac(): number {
      return clamp((this.hits + 0.3 * this.perfects) / (1.3 * this.good_total()), 0, 1);
    }

    diag_score(): number {
      return 40 + 60 * this.rhythm_frac() - this.penalty;
    }

    current_raw(): number {
      return this.diag_score();
    }

    prog_frac(): number {
      return this.phase === "beat" ? 0.6 * clamp(this.el / this.duration, 0, 1) : 0.8;
    }

    beat_x(b: any): number {
      return this.zone_x + (b.t - this.el) * this.v;
    }

    tap() {
      const zp = [this.zone_x, this.scr.y + 12];
      if (this.angry_input(zp)) {
        this.combo = 0;
        return;
      }
      let best: any = null, bd = 99;
      for (const b of this.beats) {
        if (b.judged) continue;
        const d = Math.abs(b.t - this.el);
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      if (best && bd <= this.win) {
        best.judged = true;
        if (best.red || best.calm) {
          this.combo = 0;
          this.mistake(10, "RED BEAT!", zp);
          this.zone_flash = 0.2;
          this.zone_col = ui.BAD;
          return;
        }
        best.hit = true;
        this.hits += 1;
        this.combo += 1;
        this.best = Math.max(this.best, this.combo);
        const perfect = bd <= this.win * 0.4;
        if (perfect) this.perfects += 1;
        this.particles.text(perfect ? "PERFECT!" : "GOOD", this.zone_x, this.scr.y + 6, perfect ? ui.GOLD : [140, 240, 160], 0.6);
        this.particles.burst("sparkle", this.zone_x, this.scr.centery, perfect ? 6 : 3, 18);
        this.game.audio.play(perfect ? "star" : "blip", 0.7);
        if (this.combo > 0 && this.combo % 5 === 0) {
          this.particles.text(`COMBO x${this.combo}!`, this.scr.centerx, this.scr.y + 20, ui.GOLD, 0.9);
          this.game.audio.play("coin", 0.6);
        }
        this.zone_flash = 0.18;
        this.zone_col = perfect ? ui.GOLD : ui.GOOD;
      } else {
        this.combo = 0;
        this.penalty += 4;
        this.game.audio.play("error", 0.5);
        this.particles.text("OFF BEAT", this.zone_x, this.scr.y + 6, ui.BAD, 0.6);
      }
    }

    end_rhythm() {
      this.phase = "diag";
      const fr = this.rhythm_frac();
      this.revealed.add("steth");
      if (fr >= 0.4) this.revealed.add("thermo");
      if (fr >= 0.68) this.revealed.add("mag");
      this.particles.text(fr >= 0.68 ? "GREAT RHYTHM! ALL CLUES FOUND" : fr >= 0.4 ? "OKAY RHYTHM - 2 CLUES" : "SHAKY RHYTHM - ONLY 1 CLUE",
        213, 70, fr >= 0.4 ? ui.GOOD : ui.BAD, 1.6);
      this.make_cards();
      this.game.audio.play("chime", 0.5);
    }

    on_event(e: any) {
      if (this.phase === "beat") {
        if (is_tap(e)) this.tap();
      } else {
        if (this.guard(e)) return;
        this.card_event(e);
      }
    }

    tick(dt: number) {
      if (this.zone_flash > 0) this.zone_flash -= dt;
      if (this.pulse > 0) this.pulse -= dt;
      if (this.phase !== "beat") return;
      this.el += dt;
      for (const b of this.beats) {
        if (!b.ticked && this.el >= b.t) {
          b.ticked = true;
          if (this.hissing > 0) b.calm = true; // beats during a growl are "don't tap"
          if (!b.red && !b.calm) {
            this.pulse = 0.18;
            this.game.audio.play("tick", 0.8);
          }
        }
        if (!b.judged && this.el - b.t > this.win) {
          b.judged = true;
          if (!b.red && !b.calm) {
            this.misses += 1;
            this.combo = 0;
            this.particles.text("MISS", this.zone_x, this.scr.y + 6, ui.MUTED, 0.6);
          }
        }
      }
      if (this.el > this.duration + 0.15 && this.beats.every((b: any) => b.judged)) this.end_rhythm();
    }

    wave(d: number): number {
      if (d >= -12 && d < -6) return -Math.sin(((d + 12) / 6) * Math.PI) * 2;
      if (d >= -3 && d < -1) return 2;
      if (d === -1) return -7;
      if (d === 0) return -17;
      if (d === 1) return -6;
      if (d >= 2 && d <= 3) return 5 - (d - 2) * 2;
      if (d >= 6 && d <= 13) return -Math.sin(((d - 6) / 7) * Math.PI) * 3;
      return 0;
    }

    draw_monitor(s: Surface) {
      const r: Rect = this.scr;
      ui.panel(s, r.inflate(8, 8), [96, 102, 124], ui.BORDER);
      pg.draw.rect(s, [16, 36, 30], r);
      for (let x = r.x + 6; x < r.right; x += 10) pg.draw.rect(s, [24, 54, 44], [x, r.y, 1, r.h]);
      for (let y = r.y + 4; y < r.bottom; y += 10) pg.draw.rect(s, [24, 54, 44], [r.x, y, r.w, 1]);
      // hit zone
      const zf = this.zone_flash > 0;
      pg.draw.rect(s, zf ? sprites.darker(this.zone_col, 0.6) : [30, 80, 58], [this.zone_x - 3, r.y, 7, r.h]);
      for (let y = r.y; y < r.bottom; y += 3) pg.draw.rect(s, zf ? this.zone_col : [90, 200, 130], [this.zone_x, y, 1, 2]);
      // trace
      const y0 = r.centery + 8;
      const near = this.beats.map((b: any) => [Math.round(this.beat_x(b)), b]).filter(([bx]: any) => bx > r.x - 16 && bx < r.right + 16);
      let prev: number[] | null = null;
      for (let x = r.x; x < r.right; x++) {
        let dy = 0;
        let col: number[] = [90, 240, 140];
        for (const [bx, b] of near as any[]) {
          const d = x - bx;
          if (d >= -12 && d <= 13) {
            dy += this.wave(d);
            if (b.red || b.calm || (this.hissing > 0 && !b.ticked)) col = [250, 90, 90];
            else if (b.hit) col = [255, 220, 110];
          }
        }
        const y = Math.trunc(y0 + dy);
        if (prev) pg.draw.line(s, col, prev, [x, y]);
        prev = [x, y];
      }
      // heart + readout
      const big = this.pulse > 0;
      font.draw(s, font.HEART, [r.x + 4, r.y + 4], [250, 90, 120], big ? 2 : 1);
      font.draw(s, `BPM ${this.bpm}`, [r.x + 18, r.y + 4], [140, 240, 160]);
      font.draw(s, `HITS ${this.hits}/${this.good_total()}`, [r.x + 4, r.bottom - 8], [140, 240, 160]);
      if (this.combo >= 3) font.draw(s, `COMBO x${this.combo}`, [r.right - 4, r.y + 4], ui.GOLD, 1, null, "right");
      if (this.hissing > 0) font.draw(s, "DON'T TAP!", [r.right - 4, r.bottom - 8], [250, 110, 110], 1, null, "right");
    }

    draw(s: Surface) {
      exam_bg(s);
      s.blit(sprites.obj("table"), [this.ax - 48, 120]);
      this.draw_animal(s, this.pulse > 0 ? "happy" : null);
      if (this.phase === "beat") {
        this.draw_monitor(s);
        // a little stethoscope on the chest
        const [hx, hy] = this.upx(12, 16);
        s.blit(sprites.icon("steth"), [hx - 5, hy - 5 + (this.pulse > 0 ? -1 : 0)]);
      } else {
        const cb = new Rect(112, 42, 202, 62);
        this.draw_clipboard(s, cb, (k) => this.revealed.has(k));
        font.draw(s, `RHYTHM ${Math.round(this.rhythm_frac() * 100)}%`, [cb.right - 6, cb.y + 5], ui.ACCENT, 1, null, "right");
        this.draw_cards(s, 124);
      }
      this.draw_common(s);
    }
  }

  // ===================================================================== EXAM: X-RAY
  // Spots on the film (film-local px). Kept >= 20px apart so clicks are never ambiguous.
  const XR_SPOTS: number[][] = [[112, 24], [80, 42], [56, 46], [32, 42], [12, 28], [90, 70], [42, 60], [64, 66]];
  const XR_HIT = 11; // click radius
  const XR_LEAD = 0.9; // pause (banner only) before a sequence plays

  class XRay extends ExamGame {
    title = "X-Ray Scan";
    get hint(): string {
      if (this.phase === "show") return "WATCH! REMEMBER THE ORDER THE SPOTS LIGHT UP: 1, 2, 3...";
      if (this.phase === "input") {
        if (this.hissing > 0) return this.p.personality === "feral" ? "IT'S GROWLING - MOVE YOUR MOUSE AWAY & WAIT!" : "IT'S HISSING - WAIT A SECOND, THEN CLICK!";
        return this.round === 0 || this.fails >= 2 ? "CLICK THE NUMBERED SPOTS IN ORDER - 1 FIRST, THEN 2..." : "FROM MEMORY: CLICK THE SPOTS IN THE SAME ORDER (1, 2, 3...)";
      }
      return "THE X-RAY FOUND CLUES - PICK THE MATCHING DIAGNOSIS (1/2/3)";
    }

    constructor(scene: any, patient: any) {
      super(scene, patient);
      this.film = new Rect(66, 42, 140, 80);
      this.rounds = 2;
      this.round = 0;
      this.revealed = new Set<string>();
      const sd = Math.pow(Math.max(0.5, this.diff), 0.25);
      this.flash_on = 0.62 / sd;
      this.flash_gap = 0.24 / sd;
      this.scan = 0;
      this.free_retry = true;
      this.replay = false;
      this.hit_t = 0;
      this.hit_i = -1;
      this.miss_t = 0;
      this.miss_i = -1;
      this.start_round(true);
      let show = 0, clicks = 0;
      for (let r = 0; r < this.rounds; r++) {
        const len = this.round_len(r);
        show += this.show_dur(len);
        clicks += len;
      }
      this.set_limit(9 + clicks * 1.1);
      this.limit += show;
      this.time_left = this.limit;
      this.fixed_time = show;
    }

    arect(): Rect {
      return this.film.move(this.wiggle(), 0);
    }

    spot_pos(i: number): number[] {
      const r = this.arect();
      return [r.x + XR_SPOTS[i][0], r.y + XR_SPOTS[i][1]];
    }

    /** 2 then 3 spots (3 then 4 on hard days). */
    round_len(r: number): number {
      return 2 + r + (this.diff >= 1.5 ? 1 : 0);
    }

    show_dur(len: number): number {
      return XR_LEAD + len * (this.flash_on + this.flash_gap);
    }

    /** refund: share of the replay's watch time given back (never all of it after a real
     *  mistake, so spamming wrong spots can't stall the clock forever). */
    start_round(fresh: boolean, refund = 1) {
      if (fresh) {
        const len = this.round_len(this.round);
        const idx = pg.range(XR_SPOTS.length);
        random.shuffle(idx);
        this.seq = idx.slice(0, Math.min(len, idx.length));
        this.replay = false;
        this.fails = 0;
      } else {
        this.replay = true;
        this.fails += 1;
        this.time_left = Math.min(this.limit, this.time_left + this.show_dur(this.seq.length) * refund);
      }
      this.phase = "show";
      this.show_t = -XR_LEAD;
      this.si = 0;
      this.lit = -1;
      this.shown = 0; // how many spots of the sequence have lit so far
    }

    prog_frac(): number {
      if (this.phase === "diag") return 0.8;
      const part = this.phase === "input" ? this.si / this.seq.length : 0;
      return (0.7 * (this.round + part)) / this.rounds;
    }

    reveal_for_round() {
      const order = ["steth", "thermo", "mag"];
      const per = Math.ceil(order.length / this.rounds);
      for (const k of order.slice(this.round * per, (this.round + 1) * per)) this.revealed.add(k);
    }

    click_spot(i: number) {
      const [x, y] = this.spot_pos(i);
      if (this.seq.slice(0, this.si).includes(i)) return; // already ticked: ignore re-clicks
      const want = this.seq[this.si];
      if (i === want) {
        this.si += 1;
        this.game.audio.play("star", 0.6);
        this.particles.burst("sparkle", x, y, 4, 14);
        this.hit_t = 0.3;
        this.hit_i = i;
        if (this.si >= this.seq.length) {
          this.reveal_for_round();
          this.round += 1;
          this.game.audio.play("sparkle");
          this.particles.text("CLUE FOUND!", this.film.centerx, this.film.y + 22, ui.GOLD, 1.0);
          if (this.round >= this.rounds) {
            for (const k of ["steth", "thermo", "mag"]) this.revealed.add(k);
            this.phase = "diag";
            this.make_cards();
            this.game.audio.play("chime", 0.5);
          } else {
            this.start_round(true);
          }
        }
      } else {
        this.miss_t = 0.5;
        this.miss_i = i;
        const free = this.free_retry;
        if (free) {
          this.free_retry = false;
          this.game.audio.play("error", 0.5);
          this.particles.text("OOPS! FREE RETRY", x, y - 8, [255, 220, 150], 1.0);
          this.flash("No penalty this time - watch again!", ui.ACCENT);
        } else {
          this.mistake(10, "WRONG SPOT!", [x, y]);
          this.flash(this.fails >= 1 ? "Watch again - the numbers will stay on!" : "Watch again...", ui.BAD);
        }
        this.start_round(false, free ? 1 : 0.5);
      }
    }

    nearest_spot(): number {
      const [mx, my] = this.game.mpos;
      let best = -1, bd = XR_HIT;
      for (let i = 0; i < XR_SPOTS.length; i++) {
        const [x, y] = this.spot_pos(i);
        const d = Math.hypot(mx - x, my - y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return best;
    }

    on_event(e: any) {
      if (this.guard(e)) return;
      if (this.phase === "diag") {
        this.card_event(e);
        return;
      }
      if (this.phase !== "input" || !(e.type === pg.MOUSEBUTTONDOWN && e.button === 1)) return;
      const best = this.nearest_spot();
      if (best >= 0) this.click_spot(best); // clicks on empty film are simply ignored
    }

    tick(dt: number) {
      this.scan = (this.scan + dt * 90) % (this.film.w + 20);
      if (this.hit_t > 0) this.hit_t -= dt;
      if (this.miss_t > 0) this.miss_t -= dt;
      if (this.phase !== "show") return;
      this.show_t += dt;
      const step = this.flash_on + this.flash_gap;
      const k = Math.floor(this.show_t / step);
      const within = this.show_t - k * step;
      const lit = this.show_t >= 0 && k < this.seq.length && within < this.flash_on ? this.seq[k] : -1;
      if (lit >= 0 && lit !== this.lit) {
        this.game.audio.play("blip", 0.6);
        const [x, y] = this.spot_pos(lit);
        this.particles.add("sparkle", x, y, 2, { life: 0.3 });
        this.shown = Math.max(this.shown, k + 1);
      }
      this.lit = lit;
      if (this.show_t >= 0 && k >= this.seq.length) {
        this.phase = "input";
        this.si = 0;
        this.game.audio.play("select", 0.5);
      }
    }

    draw_skeleton(s: Surface, r: Rect) {
      const B = [214, 232, 250], D = [150, 176, 210];
      const P = (x: number, y: number) => [r.x + x, r.y + y];
      // spine + tail
      const spine: number[][] = [];
      for (let i = 0; i <= 10; i++) {
        const x = 100 - i * 7, y = 32 + Math.sin(i / 10 * Math.PI) * -4 + i * 0.6;
        spine.push([x, y]);
      }
      for (const [x, y] of spine) pg.draw.rect(s, B, [r.x + x - 2, r.y + y - 2, 4, 4]);
      pg.draw.lines(s, D, false, [P(30, 38), P(20, 34), P(12, 30), P(6, 24)], 2);
      // ribs
      for (let i = 0; i < 5; i++) {
        const x = 86 - i * 7;
        pg.draw.arc(s, B, [r.x + x - 6, r.y + 30, 12, 26], Math.PI * 1.05, Math.PI * 1.95, 1);
        pg.draw.line(s, B, P(x, 34), P(x - 2, 52));
      }
      // pelvis + legs
      pg.draw.ellipse(s, B, [r.x + 24, r.y + 36, 18, 12], 2);
      for (const lx of [36, 44, 84, 92]) {
        const top = lx < 60 ? 46 : 44;
        pg.draw.line(s, B, P(lx, top), P(lx - 2, 62), 2);
        pg.draw.circle(s, D, P(lx - 2, 62), 2);
        pg.draw.line(s, B, P(lx - 2, 62), P(lx, 76), 2);
        pg.draw.rect(s, B, [r.x + lx - 2, r.y + 76, 6, 2]);
      }
      // skull (facing right)
      const K = [24, 34, 56];
      pg.draw.ellipse(s, B, [r.x + 98, r.y + 10, 24, 22]);
      pg.draw.rect(s, B, [r.x + 112, r.y + 18, 16, 10]);
      pg.draw.circle(s, B, P(128, 23), 5);
      pg.draw.circle(s, K, P(110, 19), 4);
      pg.draw.circle(s, D, P(110, 19), 4, 1);
      pg.draw.rect(s, K, [r.x + 130, r.y + 20, 2, 2]);
      pg.draw.line(s, K, P(112, 27), P(132, 27));
      for (let i = 0; i < 5; i++) pg.draw.rect(s, K, [r.x + 116 + i * 3, r.y + 25, 1, 2]);
      pg.draw.arc(s, D, [r.x + 98, r.y + 10, 24, 22], Math.PI * 0.2, Math.PI * 0.9, 1);
    }

    /** Small numbered tag next to a spot. */
    draw_tag(s: Surface, n: number, x: number, y: number, fill: number[], ink: number[]) {
      const tx = x + 6, ty = y - 11;
      pg.draw.rect(s, ui.INK, [tx - 1, ty - 1, 7, 9]);
      pg.draw.rect(s, fill, [tx, ty, 5, 7]);
      font.draw(s, String(n), [tx + 1, ty + 1], ink);
    }

    draw_banner(s: Surface, r: Rect) {
      let txt: string, bg: number[], fg: number[];
      if (this.phase === "show") {
        const dots = ".".repeat(1 + pg.mod(Math.trunc(this.t * 4), 3));
        txt = (this.replay ? "WATCH AGAIN" : this.round === 0 ? "WATCH" : "SCAN 2: WATCH") + dots;
        bg = [70, 60, 120];
        fg = [255, 230, 150];
      } else if (this.hissing > 0) {
        txt = this.p.personality === "feral" ? "GRRR! WAIT..." : "HISS! WAIT...";
        bg = [150, 50, 60];
        fg = [255, 255, 255];
      } else {
        const nums = this.seq.map((_: any, j: number) => String(j + 1)).join(">");
        txt = "YOUR TURN! CLICK " + nums;
        bg = [40, 120, 70];
        fg = [255, 255, 255];
      }
      const w = font.text_width(txt) + 10;
      const bx = r.centerx - Math.floor(w / 2);
      pg.draw.rect(s, ui.INK, [bx - 1, r.y, w + 2, 11]);
      pg.draw.rect(s, bg, [bx, r.y + 1, w, 9]);
      font.draw(s, txt, [r.centerx, r.y + 3], fg, 1, null, "center");
    }

    draw_film(s: Surface) {
      const r = this.arect();
      ui.panel(s, r.inflate(8, 8), [210, 214, 226], ui.BORDER);
      pg.draw.rect(s, [24, 34, 56], r);
      pg.draw.rect(s, [34, 48, 76], [r.x + 4, r.y + 4, r.w - 8, r.h - 8]);
      pg.draw.rect(s, [24, 34, 56], [r.x + 4, r.y + 4, r.w - 8, r.h - 8], 1);
      this.draw_skeleton(s, r);
      // scan beam
      const sx = r.x - 10 + Math.trunc(this.scan);
      if (sx > r.x && sx < r.right && this.phase === "show") {
        pg.draw.rect(s, [90, 200, 230], [sx, r.y + 1, 1, r.h - 2]);
        pg.draw.rect(s, [50, 110, 150], [sx - 2, r.y + 1, 2, r.h - 2]);
      }
      if (this.phase !== "diag") {
        const hov = this.phase === "input" && this.hissing <= 0 ? this.nearest_spot() : -1;
        const ticked: number[] = this.phase === "input" ? this.seq.slice(0, this.si) : [];
        for (let i = 0; i < XR_SPOTS.length; i++) {
          const [x, y] = this.spot_pos(i);
          const n = this.seq.indexOf(i); // 0-based order, -1 = not in this scan
          const done = ticked.includes(i);
          if (this.phase === "show" && this.lit === i) {
            // glowing spot with its number
            const rr = 7 + Math.trunc(Math.sin(this.t * 30) * 1);
            pg.draw.circle(s, [255, 200, 90], [x, y], rr + 3, 1);
            pg.draw.circle(s, [255, 240, 140], [x, y], rr);
            pg.draw.circle(s, [255, 255, 230], [x, y], rr - 3);
            font.draw(s, String(n + 1), [x, y - 2], ui.INK, 1, null, "center");
          } else if (done) {
            pg.draw.circle(s, ui.INK, [x, y], 7);
            pg.draw.circle(s, ui.GOOD, [x, y], 6);
            font.draw(s, "✓", [x, y - 2], [255, 255, 255], 1, null, "center");
            this.draw_tag(s, n + 1, x, y, [200, 246, 200], ui.INK);
          } else {
            const isHov = hov === i;
            pg.draw.circle(s, isHov ? [255, 255, 255] : [96, 136, 184], [x, y], isHov ? 7 : 4, 1);
            if (isHov) pg.draw.circle(s, [150, 210, 255], [x, y], 3);
            else pg.draw.rect(s, [96, 136, 184], [x, y, 1, 1]);
          }
          // numbers stay on the spots while you watch (and in the first scan, while you click)
          const ghost = (this.phase === "show" && n >= 0 && n < this.shown && this.lit !== i)
            || (this.phase === "input" && (this.round === 0 || this.fails >= 2) && n >= 0 && !done);
          if (ghost) this.draw_tag(s, n + 1, x, y, [255, 230, 150], ui.INK);
          if (this.miss_t > 0 && this.miss_i === i && pg.mod(Math.trunc(this.t * 12), 2)) pg.draw.circle(s, ui.BAD, [x, y], 7, 2);
          if (this.hit_t > 0 && this.hit_i === i) pg.draw.circle(s, [200, 255, 200], [x, y], 9 - Math.trunc(this.hit_t * 8), 1);
        }
        this.draw_banner(s, r);
        // order strip: one numbered box per spot in the sequence
        for (let j = 0; j < this.seq.length; j++) {
          const bx = r.x + 6 + j * 11, by = r.bottom - 11;
          let fill: number[] = [70, 80, 110], ink: number[] = [150, 160, 190];
          if (this.phase === "show") {
            if (j < this.shown) { fill = j === this.shown - 1 && this.lit >= 0 ? [255, 230, 120] : [200, 190, 140]; ink = ui.INK; }
          } else if (j < this.si) {
            fill = ui.GOOD; ink = [255, 255, 255];
          } else if (j === this.si) {
            fill = pg.mod(Math.trunc(this.t * 4), 2) ? [255, 255, 255] : [200, 230, 255]; ink = ui.INK;
          }
          pg.draw.rect(s, ui.INK, [bx - 1, by - 1, 10, 10]);
          pg.draw.rect(s, fill, [bx, by, 8, 8]);
          font.draw(s, j < this.si && this.phase === "input" ? "✓" : String(j + 1), [bx + 4, by + 2], ink, 1, null, "center");
        }
        font.draw(s, `SCAN ${Math.min(this.round + 1, this.rounds)}/${this.rounds}`, [r.right - 6, r.bottom - 9], [170, 200, 240], 1, null, "right");
      }
      this.draw_growl(s, r);
    }

    draw(s: Surface) {
      exam_bg(s);
      // patient waiting on the side
      const fr = pg.mod(Math.trunc(this.t * 2), 2), md = this.mood();
      const img = sprites.scaled(["xr_pet", this.p.kind, this.p.variant, fr, md], sprites.animal(this.p.kind, this.p.variant, 24, fr, md), 2);
      s.blit(img, [8 + this.wiggle(), 84]);
      this.draw_film(s);
      this.draw_clipboard(s, new Rect(218, 40, 98, 74), (k) => this.revealed.has(k));
      this.draw_cards(s, 127);
      this.draw_common(s);
    }
  }

  // ===================================================================== BATH: FLEA FRENZY
  class FleaFrenzy extends Minigame {
    station = "bath";
    title = "Flea Frenzy";
    get hint(): string {
      if (this.flea_total && this.mud_total) return "CLICK THE FLEAS - AND CLICK MUD SPLATS UNTIL THEY'RE GONE!";
      if (this.mud_total) return "CLICK THE MUD SPLATS UNTIL THEY'RE GONE - QUICK!";
      return "WHACK THE FLEAS BEFORE THEY JUMP AWAY! CHAIN HITS FOR COMBOS";
    }

    constructor(scene: any, patient: any, tasks: string[] | null = null) {
      super(scene, patient);
      const tk = tasks ?? patient.tasks_for("bath");
      const fleas = tk.includes("fleas") || !tk.includes("scrub");
      const mud = tk.includes("scrub");
      this.title = fleas ? (mud ? "Bath Blitz" : "Flea Frenzy") : "Mud Blitz";
      this.ax = 160;
      this.ay = 86;
      this.flea_total = fleas ? Math.min(16, 8 + this.level + (this.p.personality === "nervous" ? 2 : 0)) : 0;
      this.mud_total = mud ? 4 + Math.min(3, Math.floor(this.level / 2)) : 0;
      this.fleas = [];
      this.muds = [];
      this.spawned = 0;
      this.mud_spawned = 0;
      this.caught = 0;
      this.points = 0;
      this.max_points = 0;
      this.escaped = 0;
      this.cleaned = 0;
      this.combo = 0;
      this.best = 0;
      this.fleas_caught = 0;
      this.spawn_cd = 0.2;
      this.mud_cd = 0.1;
      this.happy_t = 0;
      this.rad = 6 * (this.has("flea_comb") ? 1.6 : 1.0);
      this.set_limit(3 + this.flea_total * 0.9 + this.mud_total * 1.6);
    }

    resolved(): number {
      return this.caught + this.escaped;
    }

    prog_frac(): number {
      const tot = this.flea_total + this.mud_total;
      return tot ? (this.resolved() + this.cleaned) / tot : 1;
    }

    current_raw(): number {
      const parts: number[] = [];
      if (this.flea_total) parts.push((100 * this.points) / Math.max(1, this.max_points));
      if (this.mud_total) parts.push((100 * this.cleaned) / this.mud_total);
      const base = parts.length ? pg.sum(parts) / parts.length : 100;
      return base - this.penalty + Math.min(10, this.best);
    }

    flea_pos(f: any): number[] {
      const k = Math.min(1.0, f.hop_t / f.hop_dur);
      const ux = f.from[0] + (f.to[0] - f.from[0]) * k;
      const uy = f.from[1] + (f.to[1] - f.from[1]) * k - Math.sin(k * Math.PI) * 3;
      const p = this.upx(ux, uy);
      if (f.esc !== undefined) return [p[0] + f.esc * 60 * f.dir, p[1] - f.esc * 140 + f.esc * f.esc * 160];
      return p;
    }

    on_event(e: any) {
      if (this.guard(e)) return;
      if (!(e.type === pg.MOUSEBUTTONDOWN && e.button === 1)) return;
      const [mx, my] = this.game.mpos;
      // fleas first
      let best: any = null, bd = this.rad + 2;
      for (const f of this.fleas) {
        if (f.dead || f.esc !== undefined) continue;
        const [fx, fy] = this.flea_pos(f);
        const d = Math.hypot(mx - fx, my - fy);
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      if (best) {
        best.dead = true;
        const [fx, fy] = this.flea_pos(best);
        this.caught += 1;
        this.fleas_caught += 1;
        this.points += best.gold ? 3 : 1;
        this.combo += 1;
        this.best = Math.max(this.best, this.combo);
        this.happy_t = 0.4;
        this.game.audio.play("pop");
        this.particles.burst("sparkle", fx, fy, best.gold ? 8 : 4, 16);
        if (best.gold) {
          this.particles.add("coin", fx, fy, 3);
          this.game.audio.play("coin");
          this.particles.text("GOLDEN FLEA! +3", fx, fy - 8, ui.GOLD, 0.9);
        } else if (this.combo >= 3) {
          this.particles.text(`x${this.combo}`, fx, fy - 8, ui.GOLD, 0.6);
        }
        if (this.combo > 0 && this.combo % 5 === 0) {
          this.game.audio.play("star");
          this.particles.text(`${this.combo} COMBO!`, 160, 52, ui.GOLD, 1.0);
        }
        return;
      }
      for (const m of this.muds) {
        if (m.hp <= 0) continue;
        const [px, py] = this.upx(m.u[0], m.u[1]);
        if (Math.hypot(mx - px, my - py) < 6 + m.hp * 2) {
          m.hp -= 1;
          m.shake = 0.15;
          this.game.audio.play("scrub");
          this.particles.add("bubble", px, py, 4, { life: 0.6 });
          if (m.hp <= 0) {
            this.cleaned += 1;
            this.game.audio.play("blip");
            this.particles.burst("sparkle", px, py, 5, 16);
            this.happy_t = 0.4;
          }
          return;
        }
      }
      // whiff
      this.combo = 0;
      this.penalty += 2;
      this.game.audio.play("whoosh", 0.5);
      this.particles.add("puff", mx, my, 2, { life: 0.3 });
      this.particles.text("MISS", mx, my - 6, ui.MUTED, 0.5);
    }

    tick(dt: number) {
      if (this.happy_t > 0) this.happy_t -= dt;
      const D = this.diff;
      // spawn fleas
      const alive = this.fleas.filter((f: any) => !f.dead && f.esc === undefined);
      this.spawn_cd -= dt;
      const cap = 3 + Math.floor(D * 1.2);
      if (this.spawned < this.flea_total && this.spawn_cd <= 0 && alive.length < cap) {
        this.spawn_cd = random.uniform(0.25, 0.65) / D;
        const gold = random.random() < 0.12;
        const u = [random.uniform(5, 19), random.uniform(4, 17)];
        this.fleas.push({ from: u, to: u, hop_t: 1, hop_dur: 1, cd: 0.1, life: (2.6 / D + 0.6) * (gold ? 0.7 : 1), gold, dir: random.choice([-1, 1]) });
        this.spawned += 1;
        this.max_points += gold ? 3 : 1;
      }
      for (const f of this.fleas) {
        if (f.dead) continue;
        if (f.esc !== undefined) {
          f.esc += dt;
          continue;
        }
        f.life -= dt;
        f.hop_t += dt;
        if (f.hop_t >= f.hop_dur) {
          f.cd -= dt;
          if (f.cd <= 0) {
            f.from = f.to;
            f.to = [clamp(f.from[0] + random.uniform(-9, 9), 4, 20), clamp(f.from[1] + random.uniform(-9, 9), 3, 18)];
            f.hop_t = 0;
            f.hop_dur = random.uniform(0.18, 0.3) / D;
            f.cd = random.uniform(0.15, 0.45) / D * (f.gold ? 0.6 : 1);
          }
        }
        if (f.life <= 0) {
          f.from = f.to = this.flea_ux(f);
          f.hop_t = f.hop_dur = 1;
          f.esc = 0;
          this.escaped += 1;
          this.combo = 0;
          const [fx, fy] = this.flea_pos(f);
          this.particles.text("ESCAPED!", fx, fy, ui.MUTED, 0.7);
        }
      }
      this.fleas = this.fleas.filter((f: any) => !f.dead && !(f.esc !== undefined && f.esc > 0.6));
      // mud splats
      this.mud_cd -= dt;
      const live_mud = this.muds.filter((m: any) => m.hp > 0).length;
      if (this.mud_spawned < this.mud_total && this.mud_cd <= 0 && live_mud < 3) {
        this.mud_cd = random.uniform(0.5, 1.1) / D;
        this.muds.push({ u: [random.uniform(5, 19), random.uniform(5, 16)], hp: 3, age: 0, shake: 0 });
        this.mud_spawned += 1;
        this.game.audio.play("splash", 0.4);
      }
      for (const m of this.muds) {
        if (m.hp <= 0) continue;
        m.age += dt;
        if (m.shake > 0) m.shake -= dt;
        if (m.age > 3.2 / D && m.hp < 5) {
          m.age = 0;
          m.hp += 1; // it soaks in - harder to clean
          const [px, py] = this.upx(m.u[0], m.u[1]);
          this.particles.text("SOAKING IN!", px, py - 10, [160, 110, 70], 0.7);
        }
      }
      const fleas_done = this.spawned >= this.flea_total && this.resolved() >= this.flea_total;
      const mud_done = this.mud_spawned >= this.mud_total && this.cleaned >= this.mud_total;
      if (fleas_done && mud_done) {
        this.particles.burst("sparkle", this.ax, this.ay, 10, 30);
        this.game.audio.play("sparkle");
        this.finish(this.current_raw());
      }
    }

    flea_ux(f: any): number[] {
      const k = Math.min(1.0, f.hop_t / f.hop_dur);
      return [f.from[0] + (f.to[0] - f.from[0]) * k, f.from[1] + (f.to[1] - f.from[1]) * k];
    }

    draw(s: Surface) {
      bg_room(s, [200, 228, 250], [236, 246, 252], [214, 232, 248], [186, 216, 244]);
      this.draw_animal(s, this.happy_t > 0 ? "happy" : null, ["fleas", "mud"]);
      for (const m of this.muds) {
        if (m.hp <= 0) continue;
        const [px0, py] = this.upx(m.u[0], m.u[1]);
        const px = px0 + (m.shake > 0 ? random.randint(-1, 1) : 0);
        const rad = 3 + m.hp * 2;
        pg.draw.ellipse(s, [120, 84, 52], [px - rad - 1, py - Math.floor(rad * 0.7) - 1, rad * 2 + 2, Math.floor(rad * 1.4) + 2]);
        pg.draw.ellipse(s, [146, 104, 64], [px - rad, py - Math.floor(rad * 0.7), rad * 2, Math.floor(rad * 1.4)]);
        pg.draw.ellipse(s, [176, 132, 86], [px - Math.floor(rad / 2), py - Math.floor(rad / 2), rad, Math.floor(rad / 2) + 1]);
        pg.draw.circle(s, [120, 84, 52], [px + rad, py + 2], 2);
        pg.draw.circle(s, [120, 84, 52], [px - rad - 1, py - 1], 1);
      }
      for (const f of this.fleas) {
        if (f.dead) continue;
        const [fx, fy] = this.flea_pos(f);
        if (f.esc === undefined) pg.draw.rect(s, [70, 56, 70], [fx - 1, fy + 3, 3, 1]);
        const c = f.gold ? (pg.mod(Math.trunc(this.t * 10), 2) ? [250, 210, 80] : [255, 240, 160]) : [40, 30, 30];
        pg.draw.rect(s, c, [fx - 1, fy - 1, 3, 3]);
        pg.draw.rect(s, f.gold ? [200, 150, 40] : [120, 90, 80], [fx - 2, fy + 1, 1, 1]);
        pg.draw.rect(s, f.gold ? [200, 150, 40] : [120, 90, 80], [fx + 2, fy + 1, 1, 1]);
        if (f.life < 0.6 && f.esc === undefined && pg.mod(Math.trunc(this.t * 12), 2)) pg.draw.rect(s, ui.BAD, [fx, fy - 4, 1, 2]);
      }
      s.blit(sprites.obj("tub"), [105, 110]);
      // HUD
      if (this.flea_total) {
        ui.panel(s, [6, 42, 62, 12], [255, 250, 240], ui.BORDER, false);
        font.draw(s, `FLEAS ${this.caught}/${this.flea_total}`, [10, 45], ui.INK);
      }
      if (this.mud_total) {
        const y = this.flea_total ? 56 : 42;
        ui.panel(s, [6, y, 62, 12], [255, 250, 240], ui.BORDER, false);
        font.draw(s, `MUD ${this.cleaned}/${this.mud_total}`, [10, y + 3], [140, 100, 62]);
      }
      if (this.combo >= 2) {
        const sc = this.combo >= 5 ? 2 : 1;
        font.draw(s, `COMBO x${this.combo}`, [314, 44], ui.GOLD, sc, ui.INK, "right");
      }
      this.draw_tool_cursor(s, this.flea_total ? "comb" : "sponge");
      this.draw_common(s);
    }
  }

  // ===================================================================== MEDS: PILL TOSS
  class PillToss extends Minigame {
    station = "meds";
    title = "Pill Toss";
    get hint(): string {
      return "SPACE / CLICK TO TOSS - LAND IT WHEN THE RING CLOSES AND THE MOUTH OPENS!";
    }

    constructor(scene: any, patient: any, _tasks: string[] | null = null) {
      super(scene, patient);
      this.ax = 90;
      this.ay0 = 90;
      this.ay = this.ay0;
      this.cursor_bites = false;
      this.need = 3 + (this.diff >= 1.35 ? 1 : 0) + (this.diff >= 1.7 ? 1 : 0);
      this.pills = this.need + 2;
      this.doses = 0;
      this.perfects = 0;
      this.FLY = 0.42;
      this.launch = [262, 106];
      this.mstate = "closed";
      this.open_dur = Math.max(0.3, 0.6 / Math.sqrt(this.diff)) * (this.p.personality === "nervous" ? 0.85 : 1);
      this.new_cycle(0.9);
      this.flying = null;
      this.bouncers = [];
      this.cool = 0;
      this.bob_amp = this.diff > 1.15 ? Math.min(10, (this.diff - 1.15) * 16) : 0;
      this.gulp_t = 0;
      this.set_limit(3 + this.need * 2.3);
    }

    mouth(): number[] {
      const eye = ({ bunny: 10, hamster: 8, penguin: 9, hedgehog: 9 } as any)[this.p.kind] ?? 7;
      const [x, y] = this.upx(12, eye + 6.3);
      return [x, y];
    }

    new_cycle(closed: number | null = null) {
      this.mstate = "closed";
      this.closed_t = closed ?? random.uniform(0.55, 1.3) / Math.pow(this.diff, 0.6);
      this.fake = this.doses > 0 && random.random() < (this.diff >= 1.1 ? 0.22 : 0.1);
    }

    prog_frac(): number {
      return this.doses / this.need;
    }

    current_raw(): number {
      return (100 * this.doses) / this.need - this.penalty + 2 * this.perfects;
    }

    toss() {
      if (this.angry_input(this.mouth())) return;
      if (this.flying || this.cool > 0) return;
      if (this.pills <= 0) return;
      this.pills -= 1;
      this.flying = { t: 0 };
      this.cool = 0.15;
      this.game.audio.play("whoosh", 0.7);
    }

    land() {
      const [mx, my] = this.mouth();
      const open = this.mstate === "open" && !this.fake && this.hissing <= 0;
      if (open) {
        this.doses += 1;
        const k = this.open_el / this.open_dur;
        const perfect = k > 0.15 && k < 0.75;
        if (perfect) this.perfects += 1;
        this.game.audio.play("heart");
        this.particles.burst("heart", mx, my - 6, perfect ? 5 : 3, 18);
        this.particles.text(perfect ? "PERFECT GULP!" : "GULP!", mx, my - 22, perfect ? ui.GOLD : ui.GOOD, 0.9);
        this.gulp_t = 0.35;
        this.new_cycle();
        if (this.doses >= this.need) {
          this.game.audio.play("sparkle");
          this.finish(this.current_raw());
        }
      } else {
        this.mistake(10, this.fake ? "FAKE-OUT!" : "BONK!", [mx, my - 10]);
        this.bouncers.push({ x: mx + 4, y: my, vx: random.uniform(30, 70), vy: -90, t: 0 });
        if (this.pills <= 0 && this.doses < this.need) {
          this.flash("Out of pills!", ui.BAD);
          this.time_left = 0; // no speed bonus for running out
          this.finish(this.current_raw());
        }
      }
    }

    on_event(e: any) {
      if (is_tap(e)) this.toss();
    }

    tick(dt: number) {
      if (this.cool > 0) this.cool -= dt;
      if (this.gulp_t > 0) this.gulp_t -= dt;
      this.ay = this.ay0 + Math.sin(this.t * 2.3) * this.bob_amp;
      if (this.hissing > 0 && this.mstate === "open") this.new_cycle(0.5);
      if (this.mstate === "closed") {
        this.closed_t = Math.max(this.hissing > 0 ? 0.6 : -1, this.closed_t - dt);
        if (this.closed_t <= 0) {
          this.mstate = "open";
          this.open_el = 0;
          if (!this.fake) this.game.audio.play("pop", 0.5);
        }
      } else {
        this.open_el += dt;
        if (this.open_el >= (this.fake ? this.open_dur * 0.6 : this.open_dur)) this.new_cycle();
      }
      if (this.flying) {
        this.flying.t += dt;
        if (this.flying.t >= this.FLY) {
          this.flying = null;
          this.land();
        }
      }
      for (const b of this.bouncers) {
        b.t += dt;
        b.vy += 320 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.y > 140 && b.vy > 0) {
          b.y = 140;
          b.vy *= -0.45;
        }
      }
      this.bouncers = this.bouncers.filter((b: any) => b.t < 1.4);
    }

    draw(s: Surface) {
      bg_room(s, [240, 230, 250], [246, 244, 250], [232, 228, 244], [226, 214, 244]);
      pg.draw.rect(s, [200, 170, 130], [20, 128, 150, 6]);
      const open = this.mstate === "open";
      this.draw_animal(s, open && !this.fake ? "happy" : this.gulp_t > 0 ? "happy" : null, ["tummy"]);
      const [mx, my] = this.mouth();
      // mouth
      if (open) {
        const k = this.fake ? 0.35 : Math.min(1, this.open_el / 0.08);
        const w = Math.max(4, Math.trunc(14 * (this.fake ? 0.6 : 1))), h = Math.max(2, Math.trunc(11 * k));
        pg.draw.ellipse(s, ui.INK, [mx - Math.floor(w / 2) - 1, my - Math.floor(h / 2) - 1, w + 2, h + 2]);
        pg.draw.ellipse(s, [110, 30, 56], [mx - Math.floor(w / 2), my - Math.floor(h / 2), w, h]);
        if (h > 5) pg.draw.ellipse(s, [240, 120, 140], [mx - 4, my, 8, Math.floor(h / 2)]);
        pg.draw.rect(s, [255, 255, 255], [mx - 4, my - Math.floor(h / 2), 2, 2]);
        pg.draw.rect(s, [255, 255, 255], [mx + 2, my - Math.floor(h / 2), 2, 2]);
        if (this.fake) font.draw(s, "YAWN?", [mx, my - 30], ui.MUTED, 1, [255, 255, 255], "center");
      } else if (this.closed_t < 0.6 && this.hissing <= 0) {
        // approach ring: reaches the mouth exactly when it opens
        const rr = 6 + Math.trunc(this.closed_t * 40);
        pg.draw.circle(s, this.fake ? [170, 160, 180] : [255, 200, 90], [mx, my], rr, 1);
        if (!this.fake) pg.draw.circle(s, [255, 240, 170], [mx, my], rr + 1, 1);
      }
      // launcher (slingshot)
      const [lx, ly] = this.launch;
      pg.draw.rect(s, [150, 104, 70], [lx + 4, ly + 6, 4, 24]);
      pg.draw.line(s, [150, 104, 70], [lx + 6, ly + 8], [lx - 2, ly - 2], 3);
      pg.draw.line(s, [150, 104, 70], [lx + 6, ly + 8], [lx + 14, ly - 2], 3);
      const pull = this.flying ? 0 : this.cool > 0 ? 0 : 2;
      pg.draw.line(s, ui.BAD, [lx - 2, ly - 2], [lx + 6, ly + 2 + pull], 1);
      pg.draw.line(s, ui.BAD, [lx + 14, ly - 2], [lx + 6, ly + 2 + pull], 1);
      if (!this.flying && this.pills > 0) s.blit(sprites.icon("pill"), [lx + 1, ly - 4 + pull]);
      // flying pill
      if (this.flying) {
        const k = this.flying.t / this.FLY;
        const x = lx + 6 + (mx - lx - 6) * k;
        const y = ly + (my - ly) * k - Math.sin(k * Math.PI) * 30;
        s.blit(sprites.icon("pill"), [Math.trunc(x) - 5, Math.trunc(y) - 5]);
        if (pg.mod(Math.trunc(this.t * 30), 2)) this.particles.add("sparkle", x, y, 1, { life: 0.2, vx: 0, vy: 0 });
      }
      for (const b of this.bouncers) s.blit(sprites.icon("pill"), [Math.trunc(b.x) - 5, Math.trunc(b.y) - 5]);
      // HUD
      ui.panel(s, [200, 42, 116, 24], [255, 250, 240], ui.BORDER);
      font.draw(s, `DOSES ${this.doses}/${this.need}`, [206, 46], ui.INK);
      for (let i = 0; i < this.pills; i++) s.blit(sprites.icon("pill"), [204 + i * 11, 53]);
      this.draw_common(s);
    }
  }

  // ===================================================================== MEDS: STEADY SHOT
  class SteadyShot extends Minigame {
    station = "meds";
    title = "Steady Shot";
    get hint(): string {
      return "ARROWS / MOUSE: HOLD THE NEEDLE ON THE TARGET - SPACE / CLICK TO INJECT";
    }

    constructor(scene: any, patient: any, tasks: string[] | null = null) {
      super(scene, patient);
      const tk = (tasks ?? patient.tasks_for("meds")).filter((t: string) => t === "shot" || t === "syringe");
      this.labels = tk.map((t: string) => (t === "syringe" ? "FEVER MEDICINE" : "ANTIBIOTIC"));
      while (this.labels.length < (this.diff >= 1.4 ? 3 : 2)) this.labels.push("BOOSTER");
      this.n = this.labels.length;
      this.cur = 0;
      this.ax = 56;
      this.ay = 92;
      this.cursor_bites = false;
      this.panel = new Rect(116, 44, 198, 96);
      this.vphase = random.uniform(0, 6);
      this.R = 6 * (this.has("steady_syringe") ? 1.4 : 1.0);
      this.need_t = 0.6 * Math.sqrt(this.diff);
      this.shots = [];
      this.c = [this.panel.centerx, this.panel.y + 20];
      this.vel = [0, 0];
      this.kick_cd = 0.6;
      this.seeds = [random.uniform(0, 6), random.uniform(0, 6), random.uniform(0, 6)];
      this.keys = new Set<string>();
      this.last_m = this.game.mpos.slice();
      this.needle_t = 0;
      this.new_target();
      this.set_limit(3 + this.n * 2.8);
    }

    vein_y(x: number): number {
      return this.panel.centery + Math.sin((x - this.panel.x) / 28 + this.vphase) * 16;
    }

    new_target() {
      const x = random.uniform(this.panel.x + 30, this.panel.right - 30);
      this.tg = [x, this.vein_y(x)];
      this.steady = 0;
    }

    prog_frac(): number {
      return this.cur / this.n;
    }

    current_raw(): number {
      const sc = this.shots.length ? pg.sum(this.shots) / this.shots.length : 50;
      return sc * (this.shots.length / this.n) + 30 * (1 - this.shots.length / this.n) - this.penalty;
    }

    inject() {
      if (this.angry_input(this.c)) return;
      if (this.needle_t > 0) return;
      const d = Math.hypot(this.c[0] - this.tg[0], this.c[1] - this.tg[1]);
      if (d <= this.R * 1.25) {
        const sc = 55 + 45 * clamp(this.steady, 0, 1) - (d / this.R) * 12;
        this.shots.push(sc);
        const perfect = this.steady >= 1 && d < this.R * 0.5;
        if (perfect) {
          this.particles.text("BULLSEYE!", this.tg[0], this.tg[1] - 14, ui.GOLD);
          if (this.st["stats"]) this.st["stats"]["perfect_shots"] = (this.st["stats"]["perfect_shots"] || 0) + 1;
        } else {
          this.particles.text(this.steady >= 1 ? "NICE!" : "A BIT SHAKY...", this.tg[0], this.tg[1] - 14, this.steady >= 1 ? ui.GOOD : ui.MUTED);
        }
        this.game.audio.play("shot");
        this.particles.burst("sparkle", this.tg[0], this.tg[1], 6, 18);
        this.needle_t = 0.45;
      } else {
        this.mistake(15, "MISSED THE VEIN!", this.c);
        this.steady = 0;
        this.vel = [this.vel[0] + random.uniform(-60, 60), this.vel[1] + random.uniform(-60, 60)];
      }
    }

    on_event(e: any) {
      if (e.type === pg.KEYDOWN && e.key in KEYDIR) this.keys.add(KEYDIR[e.key]);
      else if (e.type === pg.KEYUP && e.key in KEYDIR) this.keys.delete(KEYDIR[e.key]);
      if (is_tap(e)) this.inject();
    }

    held(d: string): boolean {
      if (this.keys.has(d)) return true;
      const pr = pg.key.get_pressed();
      for (const [k, v] of Object.entries(KEYDIR)) if (v === d && pr[k]) return true;
      return false;
    }

    tick(dt: number) {
      if (this.needle_t > 0) {
        this.needle_t -= dt;
        if (this.needle_t <= 0) {
          this.cur += 1;
          if (this.cur >= this.n) {
            this.game.audio.play("sparkle");
            this.finish(this.current_raw());
            return;
          }
          this.game.audio.play("star");
          this.new_target();
        }
        return;
      }
      const D = this.diff, t = this.t, [a, b, c] = this.seeds;
      const drift = 30 * D;
      const fx = (Math.sin(t * 1.3 + a) + 0.6 * Math.sin(t * 2.9 + b)) * drift;
      const fy = (Math.cos(t * 1.1 + c) + 0.5 * Math.sin(t * 3.3 + a)) * drift;
      this.vel[0] += (fx - this.vel[0]) * Math.min(1, dt * 3);
      this.vel[1] += (fy - this.vel[1]) * Math.min(1, dt * 3);
      // flinches
      this.kick_cd -= dt;
      if (this.kick_cd <= 0) {
        const nerv = this.p.personality === "nervous";
        this.kick_cd = random.uniform(0.7, 1.5) / (nerv ? 1.8 : 1) / Math.sqrt(D);
        const ang = random.uniform(0, Math.PI * 2), mag = (45 + 25 * D) * (nerv ? 1.5 : 1);
        this.vel[0] += Math.cos(ang) * mag;
        this.vel[1] += Math.sin(ang) * mag;
        if (nerv && random.random() < 0.5) this.particles.text("FLINCH!", this.c[0], this.c[1] - 12, ui.MUTED, 0.5);
      }
      if (this.hissing > 0 && !this._was_hiss) {
        this.vel[0] += random.uniform(-120, 120);
        this.vel[1] += random.uniform(-90, 90);
      }
      this._was_hiss = this.hissing > 0;
      // player control
      const sp = 85;
      let ix = 0, iy = 0;
      if (this.held("left")) ix -= 1;
      if (this.held("right")) ix += 1;
      if (this.held("up")) iy -= 1;
      if (this.held("down")) iy += 1;
      const m = this.game.mpos;
      const mdx = m[0] - this.last_m[0], mdy = m[1] - this.last_m[1];
      this.last_m = m.slice();
      this.c[0] += this.vel[0] * dt + ix * sp * dt + clamp(mdx, -30, 30);
      this.c[1] += this.vel[1] * dt + iy * sp * dt + clamp(mdy, -30, 30);
      if (this.p.personality === "feral" && this.hissing > 0) {
        this.c[0] += random.uniform(-1.5, 1.5);
        this.c[1] += random.uniform(-1.5, 1.5);
      }
      const P: Rect = this.panel;
      this.c[0] = clamp(this.c[0], P.x + 2, P.right - 3);
      this.c[1] = clamp(this.c[1], P.y + 2, P.bottom - 3);
      const d = Math.hypot(this.c[0] - this.tg[0], this.c[1] - this.tg[1]);
      const was = this.steady >= 1;
      if (d <= this.R) this.steady = Math.min(1.25, this.steady + dt / this.need_t);
      else this.steady = Math.max(0, this.steady - dt * 1.6);
      if (!was && this.steady >= 1) this.game.audio.play("blip", 0.6);
    }

    draw(s: Surface) {
      bg_room(s, [240, 230, 250], [246, 244, 250], [232, 228, 244], [226, 214, 244]);
      this.draw_animal(s, null, ["infection"]);
      const P: Rect = this.panel;
      const fur = body_color(this.p), skin = sprites.lighter(body_color(this.p, "belly"), 0.3);
      ui.panel(s, P.inflate(6, 6), fur, ui.BORDER);
      pg.draw.rect(s, skin, P);
      for (let x = P.x; x < P.right; x += 6) pg.draw.rect(s, sprites.darker(fur, 0.9), [x, P.y, 3, 2 + pg.mod(x, 4)]);
      // vein
      let prev: number[] | null = null;
      for (let x = P.x; x < P.right; x += 2) {
        const y = Math.trunc(this.vein_y(x));
        if (prev) {
          pg.draw.line(s, [90, 110, 190], prev, [x, y], 6);
          pg.draw.line(s, [130, 160, 230], prev, [x, y], 3);
          pg.draw.line(s, [190, 210, 250], [prev[0], prev[1] - 1], [x, y - 1], 1);
        }
        prev = [x, y];
      }
      // target
      const [tx, ty] = this.tg.map(Math.trunc);
      const ready = this.steady >= 1;
      const pulse = Math.trunc(Math.sin(this.t * 10) * 1.5);
      pg.draw.circle(s, ready ? ui.GOOD : [250, 120, 140], [tx, ty], Math.trunc(this.R) + 2 + pulse, 1);
      pg.draw.rect(s, ready ? ui.GOOD : [250, 120, 140], [tx - 1, ty - 1, 3, 3]);
      if (ready) font.draw(s, "NOW!", [tx, ty - 16], ui.GOOD, 1, [255, 255, 255], "center");
      // needle + crosshair
      const [cx, cy] = this.c.map(Math.trunc);
      const push = this.needle_t > 0 ? Math.trunc((1 - this.needle_t / 0.45) * 5) : 0;
      const nx = cx + 3 - push, ny = cy - 3 + push;
      pg.draw.line(s, [170, 170, 190], [cx, cy], [nx + 6, ny - 6], 1);
      pg.draw.line(s, ui.BORDER, [nx + 6, ny - 6], [nx + 22, ny - 22], 7);
      pg.draw.line(s, [236, 244, 252], [nx + 7, ny - 7], [nx + 21, ny - 21], 4);
      pg.draw.line(s, [240, 120, 150], [nx + 8, ny - 8], [nx + 14 + (this.needle_t > 0 ? -4 : 0), ny - 14], 2);
      pg.draw.line(s, ui.BORDER, [nx + 22, ny - 22], [nx + 27, ny - 27], 2);
      pg.draw.line(s, ui.BORDER, [nx + 24, ny - 30], [nx + 30, ny - 24], 2);
      const cr = Math.trunc(this.R) + 4;
      const ccol = ready ? ui.GOOD : ui.INK;
      pg.draw.circle(s, ccol, [cx, cy], cr, 1);
      pg.draw.rect(s, ccol, [cx - cr - 3, cy, 4, 1]);
      pg.draw.rect(s, ccol, [cx + cr, cy, 4, 1]);
      pg.draw.rect(s, ccol, [cx, cy + cr, 1, 4]);
      // HUD
      font.draw(s, `DOSE ${Math.min(this.cur + 1, this.n)}/${this.n}: ${this.labels[Math.min(this.cur, this.n - 1)]}`, [P.x + 4, P.y + 4], ui.INK, 1, [255, 255, 255]);
      pg.draw.rect(s, ui.BORDER, [P.x, P.bottom + 5, P.w, 6]);
      pg.draw.rect(s, ready ? ui.GOOD : [250, 200, 90], [P.x + 1, P.bottom + 6, Math.trunc((P.w - 2) * clamp(this.steady, 0, 1)), 4]);
      font.draw(s, "STEADY", [P.x - 4, P.bottom + 5], ui.INK, 1, null, "right");
      this.draw_common(s);
    }
  }

  // ===================================================================== CARE: FEEDING FRENZY
  // Correct = the animal's own food (data.ANIMALS[kind].food, a data.FOODS key) + golden treats.
  // Everything in FF_BAD is wrong for every animal. The KEY panel and the falling items use the
  // exact same ff_icon() surfaces, so what you see in the key is what drops.
  const FF_BAD = ["choc", "onion", "grapes", "sock"];
  const BAD_ITEMS: any = {
    choc: "NO CHOCOLATE!", onion: "NO ONIONS!", grapes: "NO GRAPES!", sock: "THAT'S A SOCK!",
  };
  const BAD_LABEL: any = { choc: "CHOC", onion: "ONION", grapes: "GRAPES", sock: "SOCK" };
  const FF_PLAY_R = 248; // right edge of the play area (the KEY panel sits to the right)
  const FF_INTRO = 2.6; // longer READY so the key can be read first

  /** 16x16 outlined icon for a falling item: a data.FOODS id, "gold" (treat) or a FF_BAD kind. */
  function ff_icon(id: string): Surface {
    return sprites.cached("ff_icon|" + id, () => {
      const s = sprites.new_(16, 16);
      const R = (c: number[], x: number, y: number, w: number, h: number) => pg.draw.rect(s, c, [x, y, w, h]);
      const base: number[] = (data.FOODS[id] && data.FOODS[id]["color"]) || [210, 170, 100];
      const dk = sprites.darker(base, 0.72), lt = sprites.lighter(base, 0.5);
      switch (id) {
        case "kibble":
          for (const [x, y] of [[5, 5], [11, 6], [8, 11]]) {
            pg.draw.circle(s, dk, [x, y], 4);
            pg.draw.circle(s, base, [x, y], 3);
            R(lt, x - 2, y - 2, 2, 1);
            R(sprites.darker(base, 0.5), x, y, 1, 1);
          }
          break;
        case "fish":
          pg.draw.polygon(s, dk, [[10, 8], [14, 4], [14, 12]]);
          pg.draw.ellipse(s, base, [1, 4, 11, 8]);
          pg.draw.polygon(s, dk, [[4, 4], [7, 2], [8, 4]]);
          R(lt, 3, 5, 6, 1);
          R(dk, 4, 10, 5, 1);
          R([255, 255, 255], 2, 6, 2, 2);
          R([30, 30, 40], 3, 7, 1, 1);
          R(dk, 8, 6, 1, 4);
          break;
        case "veggies": {
          const or = [240, 140, 50];
          pg.draw.polygon(s, or, [[2, 5], [9, 5], [5, 15]]);
          R(sprites.darker(or, 0.75), 4, 8, 3, 1);
          R(sprites.darker(or, 0.75), 4, 11, 2, 1);
          R(sprites.lighter(or, 0.4), 3, 6, 1, 3);
          pg.draw.line(s, base, [3, 1], [5, 5], 2);
          pg.draw.line(s, base, [6, 0], [6, 5], 2);
          pg.draw.line(s, base, [9, 1], [7, 5], 2);
          pg.draw.ellipse(s, base, [9, 6, 6, 9]); // lettuce leaf
          pg.draw.line(s, dk, [12, 7], [12, 13]);
          break;
        }
        case "seeds": {
          const dark = [92, 86, 100];
          for (const [x, y, d] of [[4, 2, 0], [8, 3, 1], [1, 8, 1], [6, 9, 0], [11, 8, 0]]) {
            pg.draw.ellipse(s, d ? dark : base, [x, y, 4, 6]);
            R(d ? [230, 230, 236] : sprites.darker(base, 0.7), x + 1, y + 1, 1, 4);
          }
          break;
        }
        case "mealworms":
          for (const [oy, x0, ph] of [[4, 2, 0], [11, 3, 0]]) {
            for (let i = 0; i < 5; i++) {
              const x = x0 + i * 2.2, y = oy + Math.sin(i * 1.6 + ph) * 1.0;
              pg.draw.circle(s, i === 4 ? dk : base, [x, y], 2);
              R(lt, Math.trunc(x) - 1, Math.trunc(y) - 2, 1, 1);
              if (i < 4) R(dk, Math.trunc(x) + 1, Math.trunc(y) - 1, 1, 2);
            }
          }
          break;
        case "bamboo":
          R(base, 3, 1, 4, 14);
          R(sprites.lighter(base, 0.45), 4, 1, 1, 14);
          R(dk, 2, 5, 6, 1);
          R(dk, 2, 10, 6, 1);
          R(sprites.darker(base, 0.85), 9, 4, 3, 11);
          R(dk, 8, 8, 5, 1);
          pg.draw.polygon(s, [90, 170, 70], [[7, 3], [14, 1], [11, 5]]);
          break;
        case "berries": // a big strawberry
          pg.draw.ellipse(s, base, [2, 4, 12, 7]);
          pg.draw.polygon(s, base, [[2, 7], [13, 7], [8, 15]]);
          for (const [x, y] of [[5, 6], [9, 6], [7, 9], [11, 8], [4, 8], [8, 12]]) R([255, 230, 120], x, y, 1, 1);
          R(sprites.lighter(base, 0.4), 4, 5, 2, 1);
          pg.draw.polygon(s, [90, 170, 70], [[4, 4], [8, 2], [12, 4], [8, 5]]);
          R([90, 140, 60], 7, 0, 2, 3);
          break;
        case "gold": { // golden bone treat
          const g = [244, 200, 80], gl = [255, 240, 170], gd = [200, 150, 40];
          for (const [x, y] of [[3, 5], [3, 10], [12, 5], [12, 10]]) pg.draw.circle(s, g, [x, y], 3);
          R(g, 3, 5, 10, 6);
          R(gl, 3, 6, 9, 1);
          R(gd, 4, 10, 8, 1);
          R(gl, 2, 3, 2, 1);
          break;
        }
        case "choc":
          R([110, 66, 40], 2, 2, 12, 10);
          for (const [x, y] of [[3, 3], [8, 3], [3, 7], [8, 7]]) R([146, 94, 58], x, y, 4, 3);
          R([230, 230, 240], 2, 11, 12, 1);
          R([200, 60, 70], 2, 12, 12, 3);
          R([250, 120, 120], 3, 13, 4, 1);
          break;
        case "onion":
          pg.draw.ellipse(s, [210, 160, 210], [2, 4, 12, 11]);
          pg.draw.ellipse(s, [240, 214, 240], [4, 6, 5, 7]);
          pg.draw.line(s, [170, 110, 170], [8, 5], [8, 14]);
          pg.draw.line(s, [110, 180, 80], [8, 5], [6, 0], 2);
          pg.draw.line(s, [110, 180, 80], [8, 5], [11, 1], 1);
          R([150, 110, 80], 6, 14, 4, 1);
          break;
        case "grapes":
          for (const [x, y] of [[4, 5], [8, 5], [12, 5], [6, 8], [10, 8], [8, 11], [6, 13]]) {
            pg.draw.circle(s, [110, 60, 140], [x, y], 2);
            R([150, 100, 190], x - 1, y - 1, 1, 1);
          }
          R([120, 90, 60], 8, 0, 1, 4);
          pg.draw.ellipse(s, [100, 170, 70], [9, 0, 5, 3]);
          break;
        case "sock":
          R([244, 244, 250], 4, 1, 6, 10);
          R([244, 244, 250], 4, 8, 10, 5);
          R([230, 80, 90], 4, 3, 6, 2);
          R([230, 80, 90], 4, 6, 6, 1);
          R([200, 200, 214], 11, 9, 3, 4);
          R([200, 200, 214], 4, 11, 3, 2);
          break;
        default: // unknown food id: little pile in its FOODS colour
          for (const [x, y] of [[5, 6], [10, 6], [8, 10]]) {
            pg.draw.circle(s, dk, [x, y], 3);
            pg.draw.circle(s, base, [x, y], 2);
          }
      }
      return sprites.outline(s);
    });
  }

  function ff_icon2(id: string): Surface {
    return sprites.scaled(["ff_icon2", id], ff_icon(id), 2);
  }

  /** Red "don't" cross over an icon at (x, y) of size sz. */
  function red_x(s: Surface, x: number, y: number, sz: number, w: number) {
    pg.draw.line(s, ui.INK, [x, y], [x + sz - 1, y + sz - 1], w + 2);
    pg.draw.line(s, ui.INK, [x + sz - 1, y], [x, y + sz - 1], w + 2);
    pg.draw.line(s, [236, 60, 70], [x, y], [x + sz - 1, y + sz - 1], w);
    pg.draw.line(s, [236, 60, 70], [x + sz - 1, y], [x, y + sz - 1], w);
  }

  class FeedingFrenzy extends Minigame {
    station = "care";
    title = "Feeding Frenzy";
    get hint(): string {
      if (this.hissing > 0) return "GRRR! KEEP THE BOWL AWAY FROM ITS FACE FOR A SECOND!";
      return "MOVE THE BOWL: CATCH " + this.food_name() + " & TREATS - NOT THE RED-X ITEMS!";
    }

    constructor(scene: any, patient: any, _tasks: string[] | null = null) {
      super(scene, patient);
      this.food = data.ANIMALS[this.p.kind]["food"];
      this.intro = FF_INTRO;
      this.ax = 40;
      this.ay = 104;
      this.cursor_bites = false;
      this.growl_text = "GRRR! BOWL AWAY!";
      this.need = 7 + Math.min(5, this.level);
      this.caught = 0;
      this.missed = 0;
      this.golds = 0;
      this.combo = 0;
      this.items = [];
      this.spawn_cd = 0.3;
      this.n_spawn = 0;
      this.bw = 34;
      this.by = 138;
      this.bx = 170;
      this.last_m = this.game.mpos.slice();
      this.keys = new Set<string>();
      this.yum_t = 0;
      this.splat_t = 0;
      this.nip_done = false;
      this.danger_x = 114;
      this.pops = [];
      this.key_flash = null; // {id, good, t}
      this.set_limit(4 + this.need * 1.05);
    }

    food_name(): string {
      const f = data.FOODS[this.food];
      return (f ? f["name"] : String(this.food)).toUpperCase();
    }

    animal_name(): string {
      return String(data.ANIMALS[this.p.kind]["name"] ?? this.p.kind).toUpperCase();
    }

    prog_frac(): number {
      return this.caught / this.need;
    }

    current_raw(): number {
      return 100 * Math.min(1, this.caught / this.need) - this.penalty - this.missed * 3 + Math.min(10, this.golds * 5);
    }

    on_event(e: any) {
      if (e.type === pg.KEYDOWN && e.key in KEYDIR) this.keys.add(KEYDIR[e.key]);
      else if (e.type === pg.KEYUP && e.key in KEYDIR) this.keys.delete(KEYDIR[e.key]);
    }

    held(d: string): boolean {
      if (this.keys.has(d)) return true;
      const pr = pg.key.get_pressed();
      for (const [k, v] of Object.entries(KEYDIR)) if (v === d && pr[k]) return true;
      return false;
    }

    spawn() {
      const D = this.diff;
      const r = random.random();
      let kind: string;
      if (r < 0.06) kind = "gold";
      else if (r < 0.67) kind = "good";
      else kind = random.choice(FF_BAD);
      const x = random.random() < 0.18 ? random.uniform(90, 112) : random.uniform(94, FF_PLAY_R - 8);
      const vy = (40 + 22 * (this.n_spawn / 14)) * D * random.uniform(0.85, 1.2);
      this.items.push({ kind, x, x0: x, y: 44, vy, sway: D > 1.2 ? random.uniform(4, 10) : 0, ph: random.uniform(0, 6) });
      this.n_spawn += 1;
    }

    pop(text: string, col: number[], x: number) {
      this.pops.push({ text, col, x: clamp(x, 106, FF_PLAY_R - 20), t: 0 });
    }

    tick(dt: number) {
      const D = this.diff;
      if (this.yum_t > 0) this.yum_t -= dt;
      if (this.splat_t > 0) this.splat_t -= dt;
      if (this.key_flash) {
        this.key_flash.t -= dt;
        if (this.key_flash.t <= 0) this.key_flash = null;
      }
      for (const p of this.pops) p.t += dt;
      this.pops = this.pops.filter((p: any) => p.t < 0.7);
      // bowl control
      const m = this.game.mpos;
      if (m[0] !== this.last_m[0] || m[1] !== this.last_m[1]) this.bx = m[0];
      this.last_m = m.slice();
      if (this.held("left")) this.bx -= 150 * dt;
      if (this.held("right")) this.bx += 150 * dt;
      this.bx = clamp(this.bx, 86 + this.bw / 2, FF_PLAY_R - this.bw / 2);
      // spawning
      this.spawn_cd -= dt;
      if (this.spawn_cd <= 0) {
        this.spawn_cd = random.uniform(0.45, 0.8) / Math.pow(D, 0.7);
        this.spawn();
        if (random.random() < 0.15 * D) this.spawn();
      }
      for (const it of this.items) {
        it.y += it.vy * dt;
        if (it.sway) it.x = clamp(it.x0 + Math.sin(this.t * 3 + it.ph) * it.sway, 90, FF_PLAY_R - 8);
        if (!it.done && it.y >= this.by - 6 && it.y <= this.by + 6 && Math.abs(it.x - this.bx) <= this.bw / 2 + 4) {
          it.done = true;
          this.catch_item(it);
        } else if (!it.done && it.y > 152) {
          it.done = true;
          if (it.kind === "good" || it.kind === "gold") {
            this.missed += 1;
            this.combo = 0;
            this.particles.add("mud", it.x, 150, 3, { life: 0.4 });
            this.particles.text("MISSED", it.x, 144, ui.MUTED, 0.5);
          }
        }
      }
      this.items = this.items.filter((it: any) => !it.done);
      // growl: keep the bowl away from the animal's face
      const near = this.bx - this.bw / 2 < this.danger_x;
      if (this.hissing > 0) {
        if (this.p.personality === "feral") {
          this.bite_t = near ? (this.bite_t || 0) + dt : 0;
          if (this.bite_t >= 0.35) this.bite([this.bx, this.by - 8]);
        } else if (near && !this.nip_done) {
          this.nip_done = true;
          this.mistake(8, "NIP!", [this.bx, this.by - 8]);
          this.game.audio.play("hiss");
        }
      } else {
        this.nip_done = false;
      }
      if (this.caught >= this.need) {
        this.game.audio.play("sparkle");
        this.particles.burst("heart", this.ax, this.ay - 30, 6, 20);
        this.finish(this.current_raw());
      }
    }

    catch_item(it: any) {
      if (it.kind === "good" || it.kind === "gold") {
        this.caught += 1;
        this.combo += 1;
        this.yum_t = 0.35;
        this.key_flash = { id: it.kind, good: true, t: 0.35 };
        if (it.kind === "gold") {
          this.golds += 1;
          this.game.audio.play("coin");
          this.particles.add("coin", it.x, this.by - 6, 3);
          this.pop("+TREAT!", ui.GOLD, it.x);
        } else {
          this.game.audio.play(this.combo % 4 === 0 ? "star" : "blip");
          this.particles.add("heart", it.x, this.by - 6, 1);
          this.pop("+YUM!", [110, 220, 120], it.x);
          if (this.combo >= 3) this.particles.text(`x${this.combo}`, it.x + 16, this.by - 8, ui.GOLD, 0.5);
        }
      } else {
        this.combo = 0;
        this.splat_t = 0.4;
        this.key_flash = { id: it.kind, good: false, t: 0.6 };
        this.pop("YUCK!", [250, 90, 100], it.x);
        this.mistake(12, BAD_ITEMS[it.kind] ?? "YUCK!", [it.x, this.by - 2]);
      }
    }

    draw_item(s: Surface, it: any) {
      const x = Math.trunc(it.x), y = Math.trunc(it.y);
      const id = it.kind === "good" ? this.food : it.kind;
      s.blit(ff_icon(id), [x - 8, y - 8]);
      if (it.kind === "gold" && pg.mod(Math.trunc(this.t * 8), 2)) {
        pg.draw.rect(s, [255, 250, 200], [x + 6, y - 9, 1, 3]);
        pg.draw.rect(s, [255, 250, 200], [x + 5, y - 8, 3, 1]);
      }
    }

    /** The always-visible KEY: what this animal eats, and what to avoid. */
    draw_key(s: Surface) {
      const head = font.wrap(this.animal_name() + " EATS:", 62);
      const K = new Rect(250, 40, 68, 97 + head.length * 7);
      ui.panel(s, K, [255, 250, 240], ui.BORDER);
      let y = K.y + 3;
      for (const ln of head) {
        font.draw(s, ln, [K.x + 3, y], [40, 130, 60]);
        y += 7;
      }
      const kf = this.key_flash;
      const rows: [string, string, number[]][] = [[this.food, this.food_name(), ui.INK], ["gold", "TREAT +5", [190, 130, 20]]];
      for (const [id, name, col] of rows) {
        const lit = kf && kf.good && (kf.id === id || (kf.id === "good" && id === this.food));
        if (lit) pg.draw.rect(s, [200, 246, 200], [K.x + 2, y - 1, K.w - 4, 17]);
        s.blit(ff_icon(id), [K.x + 3, y]);
        const lines = font.wrap(name, K.w - 24);
        let ty = y + 8 - lines.length * 3;
        for (const ln of lines) {
          font.draw(s, ln, [K.x + 21, ty], col);
          ty += 7;
        }
        y += 17;
      }
      pg.draw.rect(s, [220, 206, 200], [K.x + 3, y, K.w - 6, 1]);
      y += 3;
      font.draw(s, "AVOID:", [K.x + 3, y], ui.BAD);
      y += 9;
      FF_BAD.forEach((id, i) => {
        const cx = K.x + 3 + (i % 2) * 31, cy = y + Math.floor(i / 2) * 23;
        const lit = kf && !kf.good && kf.id === id;
        if (lit) pg.draw.rect(s, pg.mod(Math.trunc(this.t * 12), 2) ? [255, 190, 190] : [255, 225, 225], [cx, cy - 1, 31, 23]);
        s.blit(ff_icon(id), [cx + 7, cy]);
        red_x(s, cx + 8, cy + 1, 14, 1);
        font.draw(s, BAD_LABEL[id], [cx + 15, cy + 16], lit ? ui.BAD : [120, 90, 100], 1, null, "center");
      });
    }

    /** Big READY card showing the key before play starts (replaces the plain intro band). */
    draw_intro(s: Surface) {
      if (this.intro <= 0 || this.done) return;
      const C = new Rect(8, 40, 238, 106);
      ui.panel(s, C, [255, 250, 240], ui.BORDER);
      font.draw(s, this.title.toUpperCase(), [C.centerx, C.y + 4], ui.ACCENT, 1, null, "center");
      pg.draw.rect(s, [230, 216, 206], [126, C.y + 14, 1, C.h - 20]);
      // left: what it eats
      const lx = 67;
      font.draw(s, this.animal_name() + " EATS:", [lx, C.y + 15], [40, 130, 60], 1, null, "center");
      s.blit(ff_icon2(this.food), [lx - 16, C.y + 24]);
      font.draw(s, this.food_name(), [lx, C.y + 58], ui.INK, 1, null, "center");
      s.blit(ff_icon("gold"), [lx - 30, C.y + 66]);
      font.draw(s, "+ TREATS = BONUS", [lx - 12, C.y + 71], [190, 130, 20]);
      // right: what to avoid
      const rx = 186;
      font.draw(s, "AVOID (RED X):", [rx, C.y + 15], ui.BAD, 1, null, "center");
      FF_BAD.forEach((id, i) => {
        const x = rx - 40 + (i % 2) * 48, y = C.y + 24 + Math.floor(i / 2) * 40;
        s.blit(ff_icon2(id), [x, y]);
        red_x(s, x + 2, y + 2, 28, 2);
        font.draw(s, BAD_LABEL[id], [x + 16, y + 33], [120, 90, 100], 1, null, "center");
      });
      // READY / GO
      if (this.intro > GO_T) {
        const dots = ".".repeat(1 + pg.mod(Math.trunc((FF_INTRO - this.intro) * 4), 3));
        font.draw(s, "READY" + dots, [lx - 26, C.y + 88], ui.INK, 2);
      } else {
        font.draw(s, "GO!", [lx, C.y + 86], ui.GOLD, 3, ui.INK, "center");
      }
    }

    draw(s: Surface) {
      bg_room(s, [250, 238, 210], [250, 244, 232], [240, 230, 214], [240, 222, 190]);
      pg.draw.rect(s, [230, 210, 170], [84, 44, 1, 108]);
      if (this.hissing > 0) {
        const c = pg.mod(Math.trunc(this.t * 8), 2) ? [250, 170, 170] : [244, 200, 190];
        for (let y = 120; y < 152; y += 4) pg.draw.rect(s, c, [86, y, this.danger_x - 86, 2]);
      }
      const mood = this.yum_t > 0 ? "happy" : this.splat_t > 0 ? "sick" : null;
      this.draw_animal(s, mood, ["hungry"]);
      // HUD first so falling items are never hidden behind it
      ui.panel(s, [90, 42, 74, 12], [255, 250, 240], ui.BORDER, false);
      font.draw(s, `BOWL ${this.caught}/${this.need}`, [94, 45], ui.INK);
      for (const it of this.items) {
        if (it.y > this.by - 30) pg.draw.ellipse(s, [210, 196, 170], [Math.trunc(it.x) - 5, 150, 10, 3]);
        this.draw_item(s, it);
      }
      // bowl
      const bx = Math.trunc(this.bx), by = this.by;
      const w = this.bw;
      const fill = clamp(this.caught / this.need, 0, 1);
      const sh = this.splat_t > 0 ? random.randint(-1, 1) : 0;
      pg.draw.ellipse(s, [200, 186, 160], [bx - Math.floor(w / 2) - 2, by + 10, w + 4, 5]);
      pg.draw.ellipse(s, ui.INK, [bx - Math.floor(w / 2) - 1 + sh, by - 2, w + 2, 8]);
      const fc = (data.FOODS[this.food] && data.FOODS[this.food]["color"]) || [210, 170, 100];
      if (fill > 0) {
        const fh = 2 + Math.trunc(fill * 6);
        pg.draw.ellipse(s, sprites.darker(fc, 0.8), [bx - Math.floor(w / 2) + 3 + sh, by - fh + 2, w - 6, fh + 3]);
        for (let i = 0; i < Math.trunc(fill * 8); i++) pg.draw.rect(s, fc, [bx - 10 + ((i * 7) % 20) + sh, by - fh + 3 + (i % 2), 2, 2]);
      }
      pg.draw.polygon(s, ui.INK, [[bx - w / 2 - 1 + sh, by + 1], [bx + w / 2 + 1 + sh, by + 1], [bx + w / 2 - 4 + sh, by + 11], [bx - w / 2 + 4 + sh, by + 11]]);
      pg.draw.polygon(s, this.splat_t > 0 ? [160, 110, 80] : [240, 120, 120], [[bx - w / 2 + sh, by + 2], [bx + w / 2 + sh, by + 2], [bx + w / 2 - 5 + sh, by + 10], [bx - w / 2 + 5 + sh, by + 10]]);
      pg.draw.rect(s, [255, 170, 170], [bx - Math.floor(w / 2) + 3 + sh, by + 3, w - 6, 1]);
      // +YUM / YUCK pops
      for (const p of this.pops) {
        const k = p.t / 0.7;
        const py = by - 22 - Math.trunc(k * 16);
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) font.draw(s, p.text, [p.x + ox, py + oy], ui.INK, 2, null, "center");
        font.draw(s, p.text, [p.x, py], p.col, 2, null, "center");
      }
      if (this.combo >= 3) font.draw(s, `COMBO x${this.combo}`, [FF_PLAY_R - 2, 44], ui.GOLD, 1, ui.INK, "right");
      this.draw_key(s);
      this.draw_common(s);
    }
  }

  // ===================================================================== CARE: BANDAGE SEQUENCE
  const DIRS = ["up", "down", "left", "right"];
  const GLYPH: any = { up: "|", down: "`", left: "{", right: "}" };
  const DIR_SND: any = { up: "blip", down: "wrap", left: "tick", right: "select" };

  class BandageSeq extends Minigame {
    station = "care";
    title = "Bandage Sequence";
    get hint(): string {
      if (this.phase === "show") return "WATCH THE ARROWS...";
      return "REPEAT IT! ARROW KEYS / WASD OR CLICK THE PADS";
    }

    constructor(scene: any, patient: any, _tasks: string[] | null = null) {
      super(scene, patient);
      this.ax = 46;
      this.ay = 94;
      this.cursor_bites = false;
      this.l0 = 3 + (this.diff >= 1.4 ? 1 : 0);
      this.rounds = 3;
      this.seq = pg.range(this.l0 + this.rounds).map(() => random.choice(DIRS));
      this.round = 0;
      this.on = 0.36 / Math.sqrt(this.diff);
      this.gap = 0.1 / Math.sqrt(this.diff);
      this.plimit = 1.6 / Math.sqrt(this.diff);
      this.layers = 0;
      this.pads = {
        up: new Rect(250, 58, 22, 20), down: new Rect(250, 104, 22, 20),
        left: new Rect(226, 81, 22, 20), right: new Rect(274, 81, 22, 20),
      };
      this.press_t = {};
      let show_total = 0, inputs = 0;
      for (let r = 0; r < this.rounds; r++) {
        const L = this.l0 + r;
        show_total += L * (this.on + this.gap) + 0.3;
        inputs += L;
      }
      this.set_limit(4 + inputs * 0.7);
      this.limit += show_total;
      this.time_left = this.limit;
      this.fixed_time = show_total;
      this.start_round();
    }

    get len(): number {
      return this.l0 + this.round;
    }

    start_round() {
      this.phase = "show";
      this.show_t = -0.3;
      this.lit = null;
      this.pi = 0;
      this.ptime = this.plimit;
    }

    prog_frac(): number {
      return (this.round + (this.phase === "input" ? this.pi / this.len : 0)) / this.rounds;
    }

    current_raw(): number {
      return 100 - this.penalty;
    }

    unravel(text: string, amount: number, pos: number[]) {
      this.mistake(amount, text, pos);
      this.layers = Math.max(0, this.layers - this.pi);
      this.flash("Bandage slipped! Watch again...", ui.BAD);
      this.start_round();
    }

    input(d: string) {
      const pad: Rect = this.pads[d];
      if (this.angry_input([pad.centerx, pad.y])) return;
      if (this.phase !== "input") return;
      this.press_t[d] = 0.15;
      if (d === this.seq[this.pi]) {
        this.pi += 1;
        this.layers += 1;
        this.ptime = this.plimit;
        this.game.audio.play(DIR_SND[d]);
        this.particles.add("sparkle", 150 + random.randint(-14, 14), 96 + random.randint(-10, 10), 2);
        if (this.pi >= this.len) {
          this.round += 1;
          this.game.audio.play("star");
          this.particles.burst("sparkle", 150, 96, 8, 24);
          if (this.round >= this.rounds) {
            this.game.audio.play("sparkle");
            this.particles.burst("heart", 150, 90, 5, 20);
            this.finish(100 - this.penalty);
            return;
          }
          this.particles.text(`ROUND ${this.round + 1}!`, 150, 60, ui.GOLD, 0.9);
          this.start_round();
        }
      } else {
        this.unravel("WRONG WAY!", 10, [pad.centerx, pad.y]);
      }
    }

    on_event(e: any) {
      if (e.type === pg.KEYDOWN && e.key in KEYDIR) {
        this.input(KEYDIR[e.key]);
      } else if (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) {
        for (const d of DIRS) {
          if (this.pads[d].collidepoint(this.game.mpos)) {
            this.input(d);
            return;
          }
        }
      }
    }

    tick(dt: number) {
      for (const d of DIRS) if (this.press_t[d] > 0) this.press_t[d] -= dt;
      if (this.phase === "show") {
        this.show_t += dt;
        const step = this.on + this.gap;
        const k = Math.floor(this.show_t / step);
        const lit = this.show_t >= 0 && k < this.len && this.show_t - k * step < this.on ? this.seq[k] : null;
        if (lit && (lit !== this.lit || k !== this.lit_k)) this.game.audio.play(DIR_SND[lit], 0.8);
        this.lit = lit;
        this.lit_k = lit ? k : -1;
        if (k >= this.len) {
          this.phase = "input";
          this.pi = 0;
          this.ptime = this.plimit;
        }
      } else {
        this.ptime -= dt;
        if (this.ptime <= 0) this.unravel("TOO SLOW!", 8, [150, 70]);
      }
    }

    draw(s: Surface) {
      bg_room(s, [250, 238, 210], [250, 244, 232], [240, 230, 214], [240, 222, 190]);
      this.draw_animal(s, null, ["paw"]);
      // big paw
      const px = 150 + this.wiggle(), py = 100;
      const body = body_color(this.p);
      pg.draw.ellipse(s, sprites.darker(body, 0.7), [px - 27, py - 19, 54, 50]);
      pg.draw.ellipse(s, body, [px - 26, py - 18, 52, 48]);
      pg.draw.ellipse(s, [250, 170, 180], [px - 12, py + 2, 24, 16]);
      [-17, -6, 6, 17].forEach((ox, i) => {
        pg.draw.circle(s, [250, 170, 180], [px + ox, py - 8 + (i === 0 || i === 3 ? 3 : 0)], 5);
      });
      if (this.layers < 3) pg.draw.circle(s, [240, 90, 100], [px + 4, py + 8], 3);
      const total = this.l0 * this.rounds + 3;
      for (let i = 0; i < Math.min(this.layers, 12); i++) {
        const yy = py - 14 + Math.trunc((i * 40) / Math.min(12, total));
        pg.draw.rect(s, [252, 250, 244], [px - 25, yy, 50, 4]);
        pg.draw.rect(s, [220, 214, 200], [px - 25, yy + 3, 50, 1]);
      }
      // pads
      for (const d of DIRS) {
        const r: Rect = this.pads[d];
        const lit = (this.phase === "show" && this.lit === d) || this.press_t[d] > 0;
        const hov = this.phase === "input" && r.collidepoint(this.game.mpos);
        ui.panel(s, r.move(0, lit ? 1 : 0), lit ? [255, 220, 120] : hov ? [255, 244, 220] : [255, 250, 240], ui.BORDER);
        font.draw(s, GLYPH[d], [r.centerx + 1, r.y + 5 + (lit ? 1 : 0)], lit ? ui.BAD : ui.ACCENT, 2, null, "center");
      }
      // progress
      for (let j = 0; j < this.len; j++) {
        const c = this.phase === "input" && j < this.pi ? ui.GOOD : [214, 206, 216];
        pg.draw.rect(s, c, [226 + j * 10, 132, 8, 5]);
      }
      font.draw(s, `ROUND ${this.round + 1}/${this.rounds}`, [261, 44], ui.INK, 1, null, "center");
      if (this.phase === "show") {
        font.draw(s, "WATCH!", [261, 142], ui.ACCENT, 1, [255, 255, 255], "center");
      } else {
        pg.draw.rect(s, ui.BORDER, [226, 142, 70, 4]);
        pg.draw.rect(s, this.ptime > this.plimit * 0.35 ? ui.GOOD : ui.BAD, [227, 143, Math.trunc(68 * clamp(this.ptime / this.plimit, 0, 1)), 2]);
      }
      this.draw_common(s);
    }
  }

  // ===================================================================== CHAIN
  /** Runs several station games back to back (one patient, several tasks). Score = average. */
  class ChainGame extends Minigame {
    constructor(scene: any, patient: any, station: string, makers: (() => any)[]) {
      super(scene, patient);
      this.station = station;
      this.makers = makers;
      this.idx = 0;
      this.scores = [];
      this._fleas = 0;
      this.intro = 0;
      this.cur = makers[0]();
      this.title = this.cur.title;
    }

    get fleas_caught(): number {
      return this._fleas + (this.cur && !this.cur.done ? this.cur.fleas_caught ?? 0 : 0);
    }

    get hint(): string {
      return this.cur ? this.cur.hint : "";
    }

    event(e: any) {
      if (!this.done && this.cur) this.cur.event(e);
    }

    update(dt: number) {
      if (this.done) return;
      this.t += dt;
      this.cur.update(dt);
      if (!this.cur.done) return;
      this.scores.push(this.cur.final ?? 5);
      this._fleas += this.cur.fleas_caught ?? 0;
      this.idx += 1;
      if (this.idx < this.makers.length) {
        this.cur = this.makers[this.idx]();
        this.title = this.cur.title;
        this.game.audio.play("whoosh", 0.6);
      } else {
        this.final = Math.max(5, Math.min(100, Math.round(pg.sum(this.scores) / this.scores.length)));
        this.cur = null;
        this.done = true;
      }
    }

    draw(s: Surface) {
      if (!this.cur) return;
      this.cur.draw(s);
      const txt = `PART ${this.idx + 1}/${this.makers.length}`;
      const w = font.text_width(txt) + 8;
      ui.panel(s, [316 - w, 146, w, 10], [255, 246, 214], [200, 150, 60], false);
      font.draw(s, txt, [312, 148], [170, 110, 30], 1, null, "right");
    }
  }

  return { Heartbeat, XRay, FleaFrenzy, PillToss, SteadyShot, FeedingFrenzy, BandageSeq, ChainGame, ExamGame, BathGame, MedsGame, CareGame };
}
