/* The clinic shift: arrivals, tickets, health, stations, kennels, Gus, summary. */
import * as pg from "./pg";
import { Rect, Surface, SRCALPHA } from "./pg";
import * as config from "./config";
import * as data from "./data";
import * as font from "./font";
import * as sprites from "./sprites";
import * as ui from "./ui";
import * as gstate from "./state";
import { Scene } from "./engine";
import { STATION_GAMES, draw_symptoms, bg_room } from "./minigames";
import * as mg_mod from "./minigames";
import { PauseMenu } from "./menus";
import { town_after_shift } from "./world";
import * as props from "./props";
import * as props2 from "./props2";
import * as challenges from "./challenges";

export const SLOT_X: number[] = pg.range(6).map((i) => 92 + i * 36);
export const FEET_Y = 122;
export const DESK: number[] = [44, 124];
export const DOOR: number[] = [-6, 124];
export const TABS: string[] = ["lobby", "exam", "bath", "meds", "care", "kennel"];
export const DECOR_ORIGIN: number[] = [80, 48];
export const CLINIC_GRID: number[] = [14, 2];

// config.py has XP_LEGENDARY_BONUS = 60, missing from config.ts
const XP_LEGENDARY_BONUS: number = (config as any).XP_LEGENDARY_BONUS ?? 60;

/** first element with the smallest key (like Python min(key=)) */
function min_by<T>(arr: T[], key: (v: T) => number): T {
  let best = arr[0];
  let bk = key(best);
  for (let i = 1; i < arr.length; i++) {
    const k = key(arr[i]);
    if (k < bk) {
      best = arr[i];
      bk = k;
    }
  }
  return best;
}

// ======================================================================= patient
export class Patient {
  static _n = 0;
  id: number;
  kind: string;
  variant: number;
  name: string;
  personality: string;
  ailments: string[];
  owner: number;
  regular: any;
  stray: boolean;
  rare: boolean;
  legendary: boolean;
  health: number;
  diagnosed: boolean;
  treated: Set<string>;
  scores: number[];
  status: string;
  x: number;
  y: number;
  target: number[];
  slot: number | null;
  checkin: number;
  arrival: number;
  happy: number;
  gifts: number;
  used_toy: boolean;
  recover: number;
  ticket: boolean;
  anim: number;
  owner_x: number | null;
  severity: number;
  walking?: boolean;
  carried?: boolean;
  slot_backup?: number | null;
  [key: string]: any;

  constructor(kind: string, variant: number, name: string, personality: string, ailments: string[], owner: number,
              regular: any = null, stray = false) {
    Patient._n += 1;
    this.id = Patient._n;
    this.kind = kind;
    this.variant = variant;
    this.name = name;
    this.personality = personality;
    this.ailments = ailments;
    this.owner = owner;
    this.regular = regular;
    this.stray = stray;
    const info = data.ANIMALS[kind];
    this.rare = info["rare"];
    this.legendary = info["legendary"] ?? false;
    this.health = 100.0;
    this.diagnosed = false;
    this.treated = new Set();
    this.scores = [];
    this.status = "arriving";
    this.x = DOOR[0];
    this.y = DOOR[1];
    this.target = DESK;
    this.slot = null;
    this.checkin = 0.0;
    this.arrival = 0.0;
    this.happy = 0;
    this.gifts = 0;
    this.used_toy = false;
    this.recover = 0.0;
    this.ticket = false;
    this.anim = pg.random.uniform(0, 5);
    this.owner_x = null;
    this.severity = pg.sum(ailments.map((a) => data.AILMENTS[a]["severity"])) / ailments.length;
  }

  /** set(ailments) - treated. Returned as an array (unique values, ailment order) that ALSO has
   *  Set-style `has()` and `size`, so callers may use either `.includes(x)` or `.has(x)`. */
  get untreated(): any {
    const out: any = [];
    for (const a of this.ailments) if (!this.treated.has(a) && !out.includes(a)) out.push(a);
    out.has = (x: string) => out.includes(x);
    out.size = out.length;
    return out;
  }

  stations(): string[] {
    const out = ["exam"];
    if (this.diagnosed) {
      for (const st of ["bath", "meds", "care"]) {
        if (this.ailments.some((a) => data.AILMENTS[a]["station"] === st)) out.push(st);
      }
      out.push("kennel");
    }
    return out;
  }

  station_done(st: string): boolean {
    if (st === "exam") return this.diagnosed;
    if (st === "kennel") return false;
    return this.ailments.filter((a) => data.AILMENTS[a]["station"] === st).every((a) => this.treated.has(a));
  }

  next_station(): string {
    if (!this.diagnosed) return "exam";
    for (const st of ["bath", "meds", "care"]) {
      if (!this.station_done(st)) return st;
    }
    return "kennel";
  }

  tasks_for(station: string): string[] {
    return this.ailments
      .filter((a) => data.AILMENTS[a]["station"] === station && !this.treated.has(a))
      .map((a) => data.AILMENTS[a]["task"]);
  }

  complete(station: string) {
    if (station === "exam") {
      this.diagnosed = true;
      if (this.ailments.includes("checkup")) this.treated.add("checkup");
    }
    for (const a of this.ailments) {
      if (data.AILMENTS[a]["station"] === station) this.treated.add(a);
    }
  }
}

// ======================================================================= the clinic floor
// Zoe walks around a top-down clinic: pets wait on cushions, she picks them up and
// carries them to the stations on the back wall, then to a recovery bed on the side
// walls, then to the front desk to go home. Pets can die or run off; each day has
// its own twist and goal.

export const SHIFT_LEN = 210; // real seconds for 9:00 AM -> 5:00 PM
const ROOM_TOP = 66, ROOM_BOTTOM = 164, ROOM_L = 10, ROOM_R = 310;
const DOOR_X = 160;
const STATION_XS = [64, 112, 160, 208, 256];
const CUSHIONS: number[][] = [[106, 104], [134, 104], [186, 104], [214, 104], [106, 134], [134, 134], [186, 134], [214, 134]];
const QUEUE: number[][] = [[146, 156], [174, 156], [128, 150], [192, 150]];
const DESK_RECT = new Rect(56, 140, 50, 18);
const DESK_PT = [81, 134];
const JAR_RECT = new Rect(222, 146, 26, 14);
const JAR_PT = [235, 140];
const MAX_STRIKES_BASE = 3;

export const DAY_MODS: any = {
  first: { name: "First Day Jitters", desc: "Take it easy - learn the ropes!", goal_add: 0 },
  normal: { name: "Business As Usual", desc: "A steady stream of patients.", goal_add: 0 },
  fleas: { name: "Flea Outbreak", desc: "Everyone's itchy! Lots of baths today.", goal_add: 0, force: "fleas" },
  mud: { name: "Mud Season", desc: "It rained all night. Muddy paws everywhere!", goal_add: 0, force: "mud" },
  heat: { name: "Heat Wave", desc: "Hearts drain 30% faster. Treat jar refills faster.", goal_add: 0, drain: 1.3, jar: 0.5 },
  escape: { name: "Escape Artists", desc: "Pets keep making a break for the door!", goal_add: 0, bolt: 3.0 },
  rushhr: { name: "Puppy Rush", desc: "Bigger waves of patients. +25% pay!", goal_add: 2, wave: 1, pay: 1.25 },
  vip: { name: "VIP Visit", desc: "A famous pet is coming! Worth 4x - don't lose them!", goal_add: 0, vip: true },
  leaky: { name: "Leaky Pipes", desc: "Puddles keep appearing. Mop them or slip!", goal_add: 0, leaky: true },
  short: { name: "Short Staffed", desc: "One recovery bed is broken today.", goal_add: -1, beds: -1 },
  speed: { name: "Speed Run", desc: "Short day! Same goal, double bonus.", goal_add: -1, len: 0.75, bonus: 2 },
  rush: { name: "RUSH DAY", desc: "The whole town is sick! Huge waves, big payouts.", goal_add: 3, wave: 1, arrive: 0.7 },
  wild: { name: "Wild Night Shift", desc: "Feral critters everywhere. They BITE when they growl!", goal_add: 0 },
};
const MOD_POOL = ["normal", "fleas", "mud", "heat", "escape", "rushhr", "vip", "leaky", "short", "speed"];

function station_art(kind: string, wild: boolean): Surface {
  return sprites.cached(["station_art", kind, wild], () => {
    const s = sprites.new_(44, 36);
    const R = (c: any, x: number, y: number, w: number, h: number) => pg.draw.rect(s, c, [x, y, w, h]);
    if (kind === "exam") {
      R([120, 130, 150], 6, 20, 3, 14); R([120, 130, 150], 35, 20, 3, 14);
      R([206, 214, 228], 2, 10, 40, 12); R([236, 240, 248], 2, 10, 40, 2);
      R([150, 220, 200], 5, 12, 34, 8); R([180, 236, 220], 5, 12, 34, 1);
      R([90, 100, 120], 2, 22, 40, 2);
      // little lamp
      R([100, 110, 130], 39, 0, 2, 10); R([250, 236, 160], 36, 0, 8, 3);
    } else if (kind === "bath") {
      pg.draw.ellipse(s, [210, 228, 244], [1, 8, 42, 26]);
      pg.draw.ellipse(s, [246, 250, 255], [3, 9, 38, 22]);
      pg.draw.ellipse(s, [140, 200, 240], [7, 13, 30, 14]);
      pg.draw.ellipse(s, [180, 226, 250], [10, 14, 18, 6]);
      for (const [x, y] of [[9, 12], [30, 11], [20, 9], [36, 16]]) pg.draw.circle(s, [255, 255, 255], [x, y], 2);
      R([180, 186, 196], 19, 0, 6, 3); R([160, 166, 176], 21, 3, 2, 6);
      R([120, 130, 140], 6, 31, 3, 4); R([120, 130, 140], 35, 31, 3, 4);
    } else if (kind === "meds") {
      R([226, 230, 240], 0, 0, 44, 18); R([200, 206, 220], 0, 17, 44, 2);
      R([246, 248, 252], 2, 2, 19, 13); R([246, 248, 252], 23, 2, 19, 13);
      for (const [x, c] of [[4, [240, 120, 140]], [9, [120, 190, 240]], [14, [250, 210, 90]], [25, [150, 220, 140]], [30, [200, 140, 230]], [36, [240, 160, 90]]] as any) {
        R(c, x, 6, 4, 7); R([255, 255, 255], x + 1, 7, 1, 2);
      }
      R([236, 80, 90], 19, 0, 6, 2);
      R([200, 160, 120], 0, 20, 44, 10); R([220, 184, 140], 0, 20, 44, 2); R([170, 130, 96], 0, 29, 44, 2);
      R([180, 230, 210], 6, 16, 32, 6); // treatment mat
    } else if (kind === "care") {
      R([200, 160, 120], 0, 14, 44, 16); R([220, 184, 140], 0, 14, 44, 2); R([170, 130, 96], 0, 29, 44, 2);
      R([250, 220, 170], 6, 18, 32, 8);
      pg.draw.ellipse(s, [240, 120, 120], [2, 8, 10, 6]); pg.draw.ellipse(s, [190, 130, 80], [4, 8, 6, 3]);
      pg.draw.ellipse(s, [120, 170, 230], [32, 8, 10, 6]); pg.draw.ellipse(s, [210, 170, 110], [34, 8, 6, 3]);
      R([250, 250, 250], 15, 4, 6, 8); R([230, 230, 236], 15, 10, 6, 2); // bandage roll
      R([240, 200, 110], 24, 2, 6, 10); R([200, 150, 70], 24, 2, 6, 2); // food bag
    } else if (kind === "shelf") {
      R([170, 120, 80], 0, 0, 44, 30); R([150, 100, 66], 0, 14, 44, 2); R([150, 100, 66], 0, 28, 44, 2);
      for (const [x, y, c] of [[3, 4, [240, 140, 160]], [12, 6, [130, 190, 240]], [22, 3, [250, 210, 90]], [32, 5, [140, 210, 150]],
        [4, 18, [250, 240, 230]], [16, 19, [200, 150, 230]], [28, 18, [240, 170, 110]]] as any) R(c, x, y, 8, 30 - y > 16 ? 10 : 9);
    }
    if (wild && kind !== "shelf") {
      for (const [x, y] of [[4, 30], [38, 28], [20, 33]]) R([130, 100, 70], x, y, 3, 2);
    }
    return sprites.outline(s);
  });
}

function bed_art(occupied_glow: boolean, locked: boolean, wild: boolean): Surface {
  return sprites.cached(["bed_art", occupied_glow, locked, wild], () => {
    const s = sprites.new_(34, 26);
    const R = (c: any, x: number, y: number, w: number, h: number) => pg.draw.rect(s, c, [x, y, w, h]);
    const frame = locked ? [150, 146, 156] : wild ? [150, 110, 76] : [196, 140, 100];
    R(frame, 0, 0, 34, 26); R(sprites.lighter(frame, 0.2), 0, 0, 34, 2);
    const cush = locked ? [186, 182, 190] : occupied_glow ? [200, 240, 210] : wild ? [190, 170, 120] : [150, 200, 240];
    R(cush, 3, 3, 28, 20); R(sprites.lighter(cush, 0.3), 3, 3, 28, 3);
    R([250, 250, 252], 4, 4, 9, 6); // pillow
    if (!locked) for (const y of [14, 18]) R(sprites.darker(cush, 0.9), 5, y, 24, 1);
    return sprites.outline(s);
  });
}

function cushion_art(wild: boolean): Surface {
  return sprites.cached(["cushion_art", wild], () => {
    const s = sprites.new_(24, 10);
    const c = wild ? [200, 170, 110] : [246, 170, 190];
    pg.draw.ellipse(s, sprites.darker(c, 0.8), [0, 1, 24, 9]);
    pg.draw.ellipse(s, c, [0, 0, 24, 8]);
    pg.draw.ellipse(s, sprites.lighter(c, 0.35), [4, 1, 14, 4]);
    return s;
  });
}

function jar_art(full: boolean): Surface {
  return sprites.cached(["jar_art", full], () => {
    const s = sprites.new_(26, 24);
    const R = (c: any, x: number, y: number, w: number, h: number) => pg.draw.rect(s, c, [x, y, w, h]);
    R([180, 130, 90], 0, 10, 26, 14); R([200, 150, 106], 0, 10, 26, 2);
    R([220, 236, 246], 7, 0, 12, 11); R([250, 250, 255], 8, 1, 2, 8); R([240, 120, 140], 6, 0, 14, 2);
    if (full) for (const [x, y] of [[9, 5], [13, 7], [12, 3], [15, 4]]) R([210, 150, 80], x, y, 3, 3);
    return sprites.outline(s);
  });
}

function puddle_art(kind: number): Surface {
  return sprites.cached(["puddle", kind], () => {
    const s = sprites.new_(20, 9);
    const c = kind === 0 ? [240, 220, 110, 210] : [140, 190, 240, 200];
    pg.draw.ellipse(s, c, [0, 1, 14, 7]);
    pg.draw.ellipse(s, c, [8, 0, 12, 6]);
    pg.draw.ellipse(s, [255, 255, 255, 150], [3, 2, 4, 2]);
    return s;
  });
}

class Owner {
  x: number; y: number; idx: number; dir = "up"; anim = 0; path: number[][]; on_arrive: (() => void) | null;
  pet: Patient | null; done = false; walking = true; wait = 0;
  constructor(idx: number, x: number, y: number, path: number[][], pet: Patient | null, on_arrive: (() => void) | null) {
    this.idx = idx; this.x = x; this.y = y; this.path = path; this.pet = pet; this.on_arrive = on_arrive;
  }
  update(dt: number) {
    this.anim += dt;
    if (this.wait > 0) { this.wait -= dt; this.walking = false; return; }
    if (!this.path.length) { this.walking = false; return; }
    const [tx, ty] = this.path[0];
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
    this.walking = true;
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? "right" : "left"; else this.dir = dy > 0 ? "down" : "up";
    const sp = 58 * dt;
    if (d <= sp) {
      this.x = tx; this.y = ty; this.path.shift();
      if (!this.path.length) {
        if (this.on_arrive) { const f = this.on_arrive; this.on_arrive = null; f(); }
        if (!this.path.length && this.y >= 178) this.done = true;
      }
    } else { this.x += (dx / d) * sp; this.y += (dy / d) * sp; }
  }
}

export class ShiftScene extends Scene {
  music = "clinic";

  /** mode: "town" = Pawsley Vet (normal), "wild" = Wildside Rescue (hectic, feral patients) */
  constructor(game: any, mode = "town") {
    super(game);
    const st = (this.st = game.state);
    game.shift_snapshot = pg.deepcopy(st);
    this.mode = mode;
    this.wild = mode === "wild";
    game.last_clinic = mode;
    this.tier = config.tier_for_day(st.day);
    this.ti = Math.max(0, config.DIFFICULTY_TIERS.indexOf(this.tier));
    this.rush = !!st.rush;
    // ---- today's twist
    let mod = "normal";
    if (st.day === 1) mod = "first";
    else if (this.wild) mod = "wild";
    else if (this.rush) mod = "rush";
    else mod = MOD_POOL[new pg.Random(st.day * 7919 + 13).randrange(MOD_POOL.length)];
    this.mod_id = mod;
    this.mod = DAY_MODS[mod];
    this.shift_len = SHIFT_LEN * (this.mod.len ?? 1);
    this.goal = Math.max(3, Math.min(16, 3 + Math.floor(st.day * 0.7) + (this.wild ? 1 : 0) + (this.mod.goal_add ?? 0)));
    this.goal_bonus = Math.trunc((25 + 6 * st.day) * (this.wild ? 1.5 : 1) * (this.mod.bonus ?? 1));
    this.max_present = Math.min(9, 3 + Math.floor(this.ti * 0.7) + (this.wild ? 1 : 0) + (this.rush ? 1 : 0) + (gstate.has(st, "exam_table_2") ? 1 : 0));
    // ---- world
    this.clock = 0.0;
    this.patients = [] as Patient[];
    this.owners = [] as Owner[];
    this.cushions = CUSHIONS.map(() => null) as (Patient | null)[];
    this.queue = QUEUE.map(() => null) as (Patient | null)[];
    const n_beds = Math.max(1, gstate.kennel_count(st) + (this.mod.beds ?? 0));
    this.beds = pg.range(6).map(() => null) as (Patient | null)[];
    this.bed_ok = pg.range(6).map((i) => i < n_beds);
    const kinds = ["exam", "bath", "meds", "care", gstate.has(st, "exam_table_2") ? "exam" : "shelf"];
    this.stations = STATION_XS.map((x, i) => ({ kind: kinds[i], x, pet: null as Patient | null, i }));
    this.messes = [] as any[];
    this.zx = 160; this.zy = 150; this.zdir = "down"; this.zanim = 0; this.zmoving = false;
    this.carry = null as Patient | null;
    this.treat = false;
    this.jar_cd = 0;
    this.stun = 0; this.slip = 0; this.slip_v = [0, 0]; this.mop = null;
    this.walk_to = null; this.click_target = null;
    this.mg = null;
    this.particles = new ui.Particles();
    this.dialogue = null;
    this.stats = { treated: 0, lost: 0, escaped: 0, scores: [], stars: [], tips: 0, coins: 0, xp: 0 };
    this.strikes = 0;
    this.max_strikes = MAX_STRIKES_BASE + (this.wild ? 1 : 0);
    this.combo = 0; this.last_discharge = -99;
    this.unlocks = [] as string[];
    this.start_xp = st.xp;
    this.start_rank = gstate.rank_index(st.xp);
    this.regulars_today = new Set();
    this.vip_spawned = false;
    this.msg = null; this.msg_t = 0;
    this.closing = false; this.ended = false; this.left_early = false;
    this.result_pop = null;
    this.t = 0.0;
    this.wave_n = 0;
    this.next_wave = 2.5;
    this.spawn_list = [] as number[]; // timers for staggered arrivals
    this.leak_t = 12;
    this.door_cd = 0;
    this.intro = true; // the day card
    const intro: string[] = [];
    if (this.wild && !st.seen_tutorial.includes("wild")) {
      st.seen_tutorial.push("wild");
      intro.push(...data.TUTORIAL.wild);
    }
    if (!st.seen_tutorial.includes("floor")) {
      st.seen_tutorial.push("floor");
      st.seen_tutorial.push("shift");
      intro.push(...data.TUTORIAL.floor);
    }
    if (intro.length) this.maple(intro);
  }

  // ----------------------------------------------------------- helpers
  maple(lines: string[], on_done: any = null, choices: any = null) {
    const port = sprites.npc_portrait("maple");
    this.dialogue = new ui.DialogueBox(this.game, lines.map((l) => ["Dr. Maple", port, l] as ui.Page), on_done, choices);
  }

  zoe(lines: string[], on_done: any = null, choices: any = null) {
    const port = sprites.zoe_portrait(this.st.hair, this.st.outfit);
    this.dialogue = new ui.DialogueBox(this.game, lines.map((l) => ["Zoe", port, l] as ui.Page), on_done, choices);
  }

  say_msg(text: string, t = 2.2) {
    this.msg = text;
    this.msg_t = t;
  }

  announce(kind: string, key: string) {
    if (kind === "badges") {
      this.game.toast("BADGE GET!", data.BADGES[key].name, "badge", key);
      this.unlocks.push("Badge: " + data.BADGES[key].name);
    } else {
      this.game.toast("ACHIEVEMENT!", data.ACHIEVEMENTS[key].name);
      this.unlocks.push("Achievement: " + data.ACHIEVEMENTS[key].name);
    }
  }

  award(kind: string, key: string) {
    if (gstate.award(this.st, kind, key)) this.announce(kind, key);
  }

  check_general() {
    for (const [kind, key] of gstate.check_general_achievements(this.st)) this.announce(kind, key);
  }

  present(): Patient[] {
    return this.patients.filter((p: Patient) => !["gone", "leaving", "dead"].includes(p.status));
  }

  in_clinic(): Patient[] {
    return this.present();
  }

  clock_text(): string {
    let mins = config.SHIFT_START_MIN + Math.min(1.0, this.clock / this.shift_len) * (config.SHIFT_END_MIN - config.SHIFT_START_MIN);
    mins = Math.trunc(Math.floor(mins / 5) * 5);
    const h = Math.floor(mins / 60), m = pg.mod(mins, 60);
    const h12 = pg.mod(h, 12) || 12;
    return `${h12}:${String(m).padStart(2, "0")}${h < 12 ? "AM" : "PM"}`;
  }

  name_of(p: Patient): string {
    return p.name;
  }

  /** where a pet currently is on screen (feet / center-bottom point) */
  pet_pos(p: Patient): number[] {
    if (p.status === "waiting" && p.cushion != null) return CUSHIONS[p.cushion];
    if (p.status === "queue" && p.qi != null) return QUEUE[p.qi];
    if (p.status === "station") return [this.stations[p.station_i].x, 60];
    if (p.status === "bed") return this.bed_pos(p.bed);
    if (p.status === "carried") return [this.zx, this.zy];
    return [p.x, p.y];
  }

  bed_rect(i: number): Rect {
    const left = i % 2 === 0, row = Math.floor(i / 2);
    return new Rect(left ? 4 : 282, 70 + row * 32, 34, 26);
  }

  bed_pos(i: number): number[] {
    const r = this.bed_rect(i);
    return [r.centerx + 2, r.bottom - 3];
  }

  bed_pt(i: number): number[] {
    const r = this.bed_rect(i);
    return [i % 2 === 0 ? r.right + 8 : r.x - 8, r.bottom - 2];
  }

  solids(): Rect[] {
    const out: Rect[] = [DESK_RECT, JAR_RECT];
    for (const s of this.stations) out.push(new Rect(s.x - 21, 30, 42, 32));
    for (let i = 0; i < 6; i++) out.push(this.bed_rect(i));
    return out;
  }

  blocked(x: number, y: number): boolean {
    if (x < ROOM_L || x > ROOM_R || y < ROOM_TOP || y > ROOM_BOTTOM) return true;
    const hb = new Rect(Math.trunc(x) - 5, Math.trunc(y) - 4, 10, 4);
    return this.solids().some((r) => r.colliderect(hb));
  }

  // ----------------------------------------------------------- spawning
  make_patient(): Patient {
    const st = this.st;
    const rng = pg.random;
    let regular: any = null;
    if (st.regulars.length && rng.random() < config.REGULAR_SPAWN_CHANCE) {
      const cands = st.regulars.filter((r: any) => !this.regulars_today.has(r.id));
      if (cands.length) regular = rng.choice(cands);
    }
    const present = new Set(this.patients.map((p: Patient) => p.name));
    let kind: string, variant: number, name: string, pers: string, owner: number;
    if (regular) {
      this.regulars_today.add(regular.id);
      ({ kind, variant, name, personality: pers, owner } = regular);
    } else {
      const moon = data.ANIMALS.moonfox;
      if (gstate.rank_index(st.xp) >= moon.unlock_rank && !st.legendary_today && rng.random() < config.LEGENDARY_CHANCE) {
        kind = "moonfox";
        st.legendary_today = true;
      } else {
        const kinds = this.wild
          ? Object.keys(data.ANIMALS).filter((k) => !data.ANIMALS[k].legendary)
          : gstate.unlocked_animals(st);
        const weights = kinds.map((k: string) => data.ANIMALS[k].weight * (data.ANIMALS[k].rare ? config.RARE_WEIGHT_MULT : 1.0));
        kind = rng.choices(kinds, weights)[0];
      }
      variant = rng.randrange(data.ANIMALS[kind].variants.length);
      let names = data.ANIMAL_NAMES.filter((n: string) => !present.has(n));
      if (!names.length) names = data.ANIMAL_NAMES;
      name = rng.choice(names) as string;
      const favs = (data.FAVORITE_NAMES || []).filter((n: string) => !present.has(n));
      if (favs.length && rng.random() < data.FAVORITE_NAME_CHANCE) name = rng.choice(favs) as string;
      pers = rng.choices(data.PERSONALITIES, this.tier.personalities)[0] as string;
      if (this.wild && rng.random() < config.WILD.feral_chance) pers = "feral";
      owner = rng.randrange(data.OWNER_LOOKS.length);
    }
    let n = 1;
    const multi = this.tier.multi + (this.wild ? 0.15 : 0) + (st.day >= 3 ? 0.1 : 0);
    const max_ail = this.tier.max_ailments;
    while (n < max_ail && rng.random() < multi) n += 1;
    const all = data.ANIMALS[kind].ailments as string[];
    const pool = all.filter((a: string) => a !== "checkup");
    let ailments: string[];
    if (n === 1 && all.includes("checkup") && rng.random() < 0.1) ailments = ["checkup"];
    else ailments = rng.sample(pool, Math.min(n, pool.length)) as string[];
    const force = this.mod.force;
    if (force && pool.includes(force) && !ailments.includes(force) && rng.random() < 0.75) {
      ailments = ailments.filter((a) => a !== "checkup");
      ailments.push(force);
    }
    const stray = kind !== "moonfox" && rng.random() < (regular ? config.STRAY_CHANCE_REGULAR : config.STRAY_CHANCE);
    const p = new Patient(kind, variant, name, pers, ailments, owner, regular, stray);
    if (this.mod.vip && !this.vip_spawned && this.wave_n >= 2) {
      this.vip_spawned = true;
      p.vip = true;
    }
    p.arrival = this.clock;
    p.growl = 0;
    p.growl_cd = rng.uniform(2, 5);
    p.antsy = 0;
    return p;
  }

  free_spot(): ["cushion" | "queue", number] | null {
    const c = this.cushions.findIndex((x: any) => x == null);
    if (c >= 0) return ["cushion", c];
    const q = this.queue.findIndex((x: any) => x == null);
    if (q >= 0) return ["queue", q];
    return null;
  }

  spawn_one(): boolean {
    if (this.present().length + this.owners.filter((o: Owner) => o.pet && o.pet.status === "entering").length >= this.max_present) return false;
    const spot = this.free_spot();
    if (!spot) return false;
    const p = this.make_patient();
    p.status = "entering";
    if (spot[0] === "cushion") this.cushions[spot[1]] = p; else this.queue[spot[1]] = p;
    const dest = spot[0] === "cushion" ? CUSHIONS[spot[1]] : QUEUE[spot[1]];
    p.x = DOOR_X; p.y = 182;
    const arrive = () => {
      p.x = dest[0]; p.y = dest[1];
      if (spot[0] === "cushion") { p.status = "waiting"; p.cushion = spot[1]; } else { p.status = "queue"; p.qi = spot[1]; }
      this.game.audio.play("blip", 0.6);
      o.path = [[dest[0] + (dest[0] < DOOR_X ? 10 : -10), dest[1] + 8], [DOOR_X, 170], [DOOR_X, 184]];
      o.pet = null;
    };
    const o = new Owner(p.owner, DOOR_X + pg.random.randint(-4, 4), 184, [[DOOR_X, 162], [dest[0] + (dest[0] < DOOR_X ? 10 : -10), dest[1] + 4]], p, arrive);
    if (p.stray) o.idx = -1; // a kind neighbour (drawn as Gus) drops off the stray
    this.owners.push(o);
    this.patients.push(p);
    this.game.audio.play("door", 0.5);
    if (p.vip) this.say_msg(`VIP ARRIVING: ${p.name}! Worth 4x - don't lose them!`, 3);
    else if (p.legendary) this.say_msg("A glowing MOONFOX?! Treat it with care!", 3);
    return true;
  }

  start_wave() {
    this.wave_n += 1;
    const late = Math.min(3, Math.floor(this.wave_n / 3));
    let size = 1 + Math.floor(this.ti * 0.6) + (this.wild ? 1 : 0) + (this.mod.wave ?? 0) + (pg.random.random() < 0.45 ? 1 : 0) + late;
    if (this.st.day === 1) size = Math.min(size, this.wave_n === 1 ? 1 : 2);
    size = Math.min(5, size);
    for (let i = 0; i < size; i++) this.spawn_list.push(i * 0.9);
    if (size >= 3) {
      this.say_msg(`WAVE ${this.wave_n}: ${size} patients incoming!`, 2.4);
      this.game.audio.play("chime", 0.6);
    }
    const base = Math.max(13, 30 - this.ti * 3 - Math.min(8, this.wave_n));
    this.next_wave = base * pg.random.uniform(0.85, 1.15) * (this.rush ? config.RUSH_ARRIVAL_MULT : 1) * (this.wild ? 0.75 : 1) * (this.mod.arrive ?? 1);
  }

  // ----------------------------------------------------------- interactions
  /** All the things Zoe could do right now, each with a point on the floor. */
  candidates(): any[] {
    const out: any[] = [];
    const carrying = this.carry;
    for (const p of this.patients as Patient[]) {
      if (!["waiting", "queue", "station", "bed", "loose", "floor"].includes(p.status)) continue;
      if (carrying) continue;
      const pos = p.status === "station" ? [this.stations[p.station_i].x, 68]
        : p.status === "bed" ? this.bed_pt(p.bed) : this.pet_pos(p);
      if (this.treat) out.push({ kind: "treat_pet", p, pt: pos, label: "Give treat" });
      else out.push({ kind: "pick", p, pt: pos, label: p.status === "loose" ? "CATCH!" : "Pick up" });
    }
    for (const s of this.stations) {
      if (s.kind === "shelf") continue;
      if (carrying) out.push({ kind: "station", s, pt: [s.x, 68], label: "Put on " + data.STATION_NAMES[s.kind] });
    }
    for (let i = 0; i < 6; i++) {
      if (carrying && this.beds[i] == null) out.push({ kind: "bed", i, pt: this.bed_pt(i), label: "Rest here" });
    }
    if (carrying) {
      this.cushions.forEach((c: any, i: number) => { if (c == null) out.push({ kind: "cushion", i, pt: CUSHIONS[i], label: "Put down" }); });
      out.push({ kind: "desk", pt: DESK_PT, label: "Send home" });
    }
    if (!carrying && !this.treat) out.push({ kind: "jar", pt: JAR_PT, label: this.jar_cd > 0 ? "Refilling..." : "Grab treat" });
    for (const m of this.messes) out.push({ kind: "mop", m, pt: [m.x + 8, m.y + 4], label: "Mop up" });
    return out;
  }

  interact_target(): any {
    const fx = this.zx + (this.zdir === "left" ? -6 : this.zdir === "right" ? 6 : 0);
    const fy = this.zy + (this.zdir === "up" ? -6 : this.zdir === "down" ? 4 : 0);
    let best: any = null, bd = 22;
    for (const c of this.candidates()) {
      const d = Math.hypot(c.pt[0] - fx, c.pt[1] - fy);
      const pri = c.kind === "pick" && c.p.status === "loose" ? -6 : c.kind === "mop" ? 4 : 0;
      if (d + pri < bd) { bd = d + pri; best = c; }
    }
    return best;
  }

  do_interact(c: any) {
    if (!c || this.stun > 0 || this.mop) return;
    if (c.kind === "pick") this.pick_up(c.p);
    else if (c.kind === "treat_pet") this.give_treat(c.p);
    else if (c.kind === "station") this.put_on_station(c.s);
    else if (c.kind === "bed") this.put_in_bed(c.i);
    else if (c.kind === "cushion") this.put_down_cushion(c.i);
    else if (c.kind === "desk") this.send_home();
    else if (c.kind === "jar") this.grab_treat();
    else if (c.kind === "mop") { this.mop = { m: c.m, t: 0.5 }; this.game.audio.play("scrub", 0.6); }
  }

  release_spot(p: Patient) {
    if (p.cushion != null) { if (this.cushions[p.cushion] === p) this.cushions[p.cushion] = null; p.cushion = null; }
    if (p.qi != null) { if (this.queue[p.qi] === p) this.queue[p.qi] = null; p.qi = null; }
    if (p.station_i != null) { const s = this.stations[p.station_i]; if (s.pet === p) s.pet = null; p.station_i = null; }
    if (p.bed != null) { if (this.beds[p.bed] === p) this.beds[p.bed] = null; p.bed = null; }
  }

  pick_up(p: Patient) {
    if (p.growl > 0 && (p.personality === "feral" || p.personality === "grumpy")) {
      const feral = p.personality === "feral";
      this.stun = feral ? 1.2 : 0.6;
      this.game.shake(feral ? 6 : 3, 0.3);
      this.game.audio.play("hiss");
      this.particles.text(feral ? "CHOMP!" : "NIP!", this.zx, this.zy - 34, ui.BAD, 1.2);
      this.bite_flash = 0.35;
      if (feral) this.st.stats.bites = (this.st.stats.bites || 0) + 1;
      this.say_msg(feral ? `${p.name} BIT you! Wait until they stop growling.` : `${p.name} hissed at you! Wait a sec...`, 2.4);
      return;
    }
    if (p.status === "bed" && p.recovering && p.recover > 0) {
      this.say_msg(`${p.name} is still resting... ${Math.ceil(p.recover)}s`, 1.4);
      return;
    }
    if (p.status === "station" && this.needs(p, this.stations[p.station_i].kind)) {
      this.start_mg(p, this.stations[p.station_i]);
      return;
    }
    if (p.status === "loose") {
      this.particles.burst("sparkle", p.x, p.y - 8, 8, 20);
      this.say_msg(`Gotcha, ${p.name}!`, 1.4);
    }
    this.release_spot(p);
    p.status = "carried";
    p.antsy = 0;
    this.carry = p;
    this.game.audio.play("pop", 0.7);
    this.promote_queue();
  }

  needs(p: Patient, kind: string): boolean {
    if (kind === "exam") return !p.diagnosed;
    return p.diagnosed && !p.station_done(kind);
  }

  promote_queue() {
    // pets waiting by the door hop onto a free cushion
    for (let qi = 0; qi < this.queue.length; qi++) {
      const p: Patient = this.queue[qi];
      if (!p || p.status !== "queue") continue;
      const c = this.cushions.findIndex((x: any) => x == null);
      if (c < 0) return;
      this.queue[qi] = null; p.qi = null;
      this.cushions[c] = p; p.cushion = c; p.status = "waiting";
      p.x = CUSHIONS[c][0]; p.y = CUSHIONS[c][1];
    }
  }

  put_on_station(s: any) {
    const p: Patient = this.carry;
    if (s.pet) {
      this.say_msg(`The ${data.STATION_NAMES[s.kind]} is busy - pick ${s.pet.name} up first.`, 2);
      this.game.audio.play("error", 0.5);
      return;
    }
    if (s.kind !== "exam" && !p.diagnosed) {
      this.say_msg(`${p.name} needs an EXAM first so you know what's wrong!`, 2.2);
      this.game.audio.play("error", 0.5);
      return;
    }
    if (s.kind === "exam" && p.diagnosed) {
      this.say_msg(`${p.name} was already examined.`, 1.8);
      this.game.audio.play("error", 0.5);
      return;
    }
    if (s.kind !== "exam" && p.station_done(s.kind)) {
      const ns = p.next_station();
      this.say_msg(ns === "kennel" ? `${p.name} is all treated - put them in a recovery bed!` : `${p.name} doesn't need ${data.STATION_NAMES[s.kind]}. Try ${data.STATION_NAMES[ns]}!`, 2.2);
      this.game.audio.play("error", 0.5);
      return;
    }
    this.carry = null;
    s.pet = p;
    p.status = "station";
    p.station_i = s.i;
    this.start_mg(p, s);
  }

  start_mg(p: Patient, s: any) {
    const station = s.kind;
    const make = (mg_mod as any).make_station_game;
    this.mg = make ? make(station, this, p) : new (STATION_GAMES as any)[station](this, p);
    this.mg_station = s;
    p.in_mg = true;
    this.game.audio.play("whoosh", 0.6);
    if (!this.st.seen_tutorial.includes(station)) {
      this.st.seen_tutorial.push(station);
      if (data.TUTORIAL[station]) this.maple(data.TUTORIAL[station]);
    }
  }

  abort_mg() {
    if (!this.mg) return;
    this.mg.p.in_mg = false;
    this.mg = null;
    this.say_msg("Stepped away. Press E on the pet to try again.", 2.4);
  }

  finish_mg() {
    const mg = this.mg;
    const p: Patient = mg.p;
    const score = mg.final ?? 50;
    p.scores.push(score);
    if (mg.station === "bath") {
      const tasks = p.tasks_for("bath");
      if (tasks.includes("scrub") || tasks.includes("fleas")) this.st.stats.baths += 1;
      this.st.stats.fleas += mg.fleas_caught ?? 0;
      if (mg.fleas_caught) challenges.progress(this.game, "fleas", mg.fleas_caught);
    }
    p.complete(mg.station);
    p.in_mg = false;
    p.health = Math.min(100.0, p.health + config.STATION_REFILL);
    this.mg = null;
    let label: string, col: any;
    if (score >= 90) { label = "PERFECT!"; col = ui.GOLD; this.game.audio.play("sparkle"); }
    else if (score >= 70) { label = "GREAT!"; col = ui.GOOD; this.game.audio.play("star"); }
    else if (score >= 45) { label = "GOOD"; col = ui.INK; this.game.audio.play("blip"); }
    else { label = "OKAY..."; col = ui.MUTED; this.game.audio.play("blip"); }
    this.result_pop = { label, score, col, t: 0.0 };
    const [sx, sy] = this.pet_pos(p);
    if (score >= 90) this.particles.burst("sparkle", sx, sy - 14, 12, 30);
    this.particles.burst("heart", sx, sy - 16, 3, 14);
    const ns = p.next_station();
    this.say_msg(ns === "kennel" ? `${p.name} is treated! Carry them to a recovery bed.` : `Next for ${p.name}: ${data.STATION_NAMES[ns].toUpperCase()}`, 2.6);
    this.check_general();
  }

  put_in_bed(i: number) {
    const p: Patient = this.carry;
    if (!this.bed_ok[i]) {
      this.say_msg(this.mod.beds && i === gstate.kennel_count(this.st) - 1 ? "This bed is broken today!" : "Locked - buy more beds (kennels) at the shop!", 2);
      this.game.audio.play("error", 0.5);
      return;
    }
    this.carry = null;
    this.beds[i] = p;
    p.bed = i;
    p.status = "bed";
    const ready = p.next_station() === "kennel";
    p.recovering = ready;
    if (ready && p.recover == null) p.recover = config.RECOVERY_SECONDS * (this.wild ? 0.8 : 1);
    this.game.audio.play("select");
    if (!ready) this.say_msg(`${p.name} can rest here, but still needs ${data.STATION_NAMES[p.next_station()]}.`, 2.2);
    else if (this.beds.filter((b: any, k: number) => b && this.bed_ok[k]).length >= config.MAX_KENNELS) this.award("badges", "full_house");
  }

  put_down_cushion(i: number) {
    const p: Patient = this.carry;
    this.carry = null;
    this.cushions[i] = p;
    p.cushion = i;
    p.status = "waiting";
    p.x = CUSHIONS[i][0]; p.y = CUSHIONS[i][1];
    this.game.audio.play("blip", 0.5);
  }

  send_home() {
    const p: Patient = this.carry;
    if (p.next_station() !== "kennel") {
      this.say_msg(`${p.name} isn't treated yet! Needs ${data.STATION_NAMES[p.next_station()]}.`, 2.2);
      this.game.audio.play("error", 0.5);
      return;
    }
    if (!(p.recover != null && p.recover <= 0)) {
      this.say_msg(`${p.name} needs to rest in a recovery bed first.`, 2.2);
      this.game.audio.play("error", 0.5);
      return;
    }
    this.carry = null;
    this.discharge(p);
  }

  grab_treat() {
    if (this.jar_cd > 0) {
      this.say_msg(`The treat jar is refilling... ${Math.ceil(this.jar_cd)}s`, 1.4);
      return;
    }
    this.treat = true;
    this.jar_cd = (gstate.has(this.st, "fast_checkin") ? 9 : 12) * (this.mod.jar ?? 1);
    this.game.audio.play("pop");
    this.say_msg("Got a treat! Give it to a pet low on hearts (+35).", 2);
  }

  give_treat(p: Patient) {
    this.treat = false;
    p.health = Math.min(100, p.health + 35);
    p.happy += 8;
    const [x, y] = this.pet_pos(p);
    this.particles.burst("heart", x, y - 14, 6, 22);
    this.particles.text("+HEARTS", x, y - 30, ui.GOOD, 1.0);
    this.game.audio.play("heart");
    if (p.growl > 0) p.growl = 0;
    p.antsy = 0;
  }

  discharge(p: Patient, quiet = false) {
    const st = this.st;
    const avg = p.scores.length ? pg.sum(p.scores) / p.scores.length / 100.0 : 0.8;
    const info = data.ANIMALS[p.kind];
    const mult = gstate.pay_mult(st) * (this.mod.pay ?? 1) * (p.vip ? 4 : 1);
    const pay = Math.trunc(pg.pyround(info.pay * avg * mult * (this.wild ? config.WILD.pay_mult : 1)));
    let tips = pg.pyround((p.health / 100) * 8) + (avg >= 0.9 ? 6 : avg >= 0.75 ? 3 : 0) + pg.pyround(p.happy * 0.15);
    if (p.personality === "playful" && p.used_toy) tips += 12;
    if (p.regular) tips += 3 * (p.regular.visits ?? 1);
    if (this.rush) tips = Math.trunc(tips * config.RUSH_PAY_MULT);
    if (this.wild) tips = Math.trunc(tips * config.WILD.pay_mult);
    if (st.buffs && st.buffs.sweet) tips = Math.trunc(tips * config.BUFF_SWEET_TIPS);
    // combo: send pets home back-to-back
    if (!quiet) {
      this.combo = this.clock - this.last_discharge <= 20 ? Math.min(5, this.combo + 1) : 1;
      this.last_discharge = this.clock;
      if (this.combo > 1) tips = Math.trunc(tips * (1 + 0.2 * (this.combo - 1)));
    }
    const total = pay + tips;
    const s = 0.65 * avg + 0.25 * (p.health / 100) + 0.10 * Math.min(1.0, p.happy / 40);
    const stars = Math.max(1, Math.min(5, Math.trunc(pg.pyround(1 + s * 4))));
    let xp = config.XP_PER_PATIENT + config.XP_PER_STAR * stars + (p.rare ? config.XP_RARE_BONUS : 0)
      + (p.legendary ? XP_LEGENDARY_BONUS : 0) + (p.vip ? 30 : 0);
    if (this.wild) xp = Math.trunc(xp * config.WILD.xp_mult);
    st.coins += total;
    st.total_coins += total;
    st.xp += xp;
    st.stats.treated += 1;
    if (p.rare && !p.legendary) st.stats.rare += 1;
    if (p.legendary) st.stats.legendary += 1;
    const S = this.stats;
    S.treated += 1;
    S.scores.push(avg * 100);
    S.stars.push(stars);
    S.tips += tips;
    S.coins += total;
    S.xp += xp;
    if (this.clock - p.arrival <= 45) this.award("badges", "speed_vet");
    if (stars === 5) this.award("achievements", "five_star");
    challenges.progress(this.game, "treat");
    challenges.progress(this.game, "kind:" + p.kind);
    if (stars === 5) challenges.progress(this.game, "five_star");
    const [kx, ky] = quiet ? this.pet_pos(p) : [DESK_PT[0], DESK_PT[1] - 10];
    if (p.regular) {
      for (const r of st.regulars) {
        if (r.id === p.regular.id) {
          r.visits = (r.visits ?? 1) + 1;
          if (r.visits >= 3) this.award("achievements", "old_friend");
        }
      }
    } else if (stars >= 3 && !p.legendary && !p.stray && pg.random.random() < config.REGULAR_CHANCE) {
      st.regulars.push({
        id: st.next_regular_id ?? 1, name: p.name, kind: p.kind, variant: p.variant,
        personality: p.personality, owner: p.owner, visits: 1,
      });
      st.next_regular_id = (st.next_regular_id ?? 1) + 1;
      st.regulars = st.regulars.slice(-12);
      this.particles.text(p.name + " will be back!", kx, ky - 26, ui.ACCENT, 1.8);
    }
    this.game.audio.play("coin");
    const ncoins = Math.min(12, 3 + Math.floor(total / 8));
    for (let k = 0; k < ncoins; k++) this.particles.add("coin", kx, ky);
    this.particles.text(`+${total}`, kx, ky - 14, [200, 140, 30], 1.4);
    this.particles.text(font.STAR.repeat(stars), kx, ky - 4, ui.GOLD, 1.4);
    if (this.combo > 1 && !quiet) this.particles.text(`COMBO x${this.combo}!`, kx + 30, ky - 24, ui.ACCENT, 1.6);
    this.release_spot(p);
    p.status = "leaving";
    // the owner comes in and takes them home
    if (!p.stray) {
      p.x = DESK_RECT.right + 8; p.y = DESK_RECT.bottom - 2;
      const o = new Owner(p.owner, DOOR_X, 184, [[DOOR_X, 160], [DESK_RECT.right + 14, DESK_RECT.bottom]], null, null);
      o.on_arrive = () => { o.pet = p; o.wait = 0.4; o.path = [[DOOR_X, 162], [DOOR_X, 186]]; };
      this.owners.push(o);
    } else {
      p.status = "gone";
    }
    this.check_general();
    if (p.stray) {
      if (quiet) this.say_msg(`${p.name} found a loving home with a neighbor!`, 2.5);
      else this.offer_adoption(p);
    }
  }

  offer_adoption(p: Patient) {
    const st = this.st;
    const kname = data.ANIMALS[p.kind].name;
    if (st.pets.length >= gstate.max_pets(st)) {
      this.say_msg(`${p.name} found a loving home with a neighbor!`, 2.5);
      return;
    }
    const yes = () => {
      st.pets.push({ name: p.name, kind: p.kind, variant: p.variant });
      if (p.regular) st.regulars = st.regulars.filter((r: any) => r.id !== p.regular.id);
      this.game.audio.play("chime");
      this.say_msg(`${p.name} is coming home with you!`, 2.5);
      this.check_general();
    };
    const no = () => this.say_msg(`${p.name} found a loving home with a neighbor!`, 2.5);
    this.zoe([`The neighbor who found ${p.name} the ${kname} can't keep them...`,
              `Should I adopt ${p.name}? They'd live at home and play in the park!`], null,
             [["Adopt!", yes], ["No", no]]);
  }

  add_strike(p: Patient, n = 1) {
    this.strikes += n;
    if (this.strikes >= this.max_strikes && !this.closing) {
      this.closing = true;
      this.failed = true;
      this.maple([`Zoe... we've lost too many patients today.`, `Let's close up early, send everyone home, and try again tomorrow.`],
        () => this.close_up(true));
    }
  }

  die(p: Patient) {
    if (this.carry === p) this.carry = null;
    if (this.mg && this.mg.p === p) this.mg = null;
    const [x, y] = this.pet_pos(p);
    this.release_spot(p);
    p.x = x; p.y = y;
    p.status = "dead";
    p.health = 0;
    p.dead_t = 0;
    this.stats.lost += 1;
    this.st.stats.lost += 1;
    this.game.audio.play("sad");
    this.game.shake(3, 0.3);
    this.say_msg(`${p.name} didn't make it...`, 3);
    this.add_strike(p, p.vip ? 2 : 1);
    this.promote_queue();
  }

  escape(p: Patient) {
    this.release_spot(p);
    p.status = "gone";
    this.stats.lost += 1;
    this.stats.escaped += 1;
    this.st.stats.lost += 1;
    this.game.audio.play("sad");
    this.say_msg(`${p.name} ran out the door and away!`, 3);
    this.add_strike(p, p.vip ? 2 : 1);
  }

  // ----------------------------------------------------------- update
  update(dt: number) {
    this.t += dt;
    this.particles.update(dt);
    if (this.msg_t > 0) this.msg_t -= dt;
    if (this.bite_flash > 0) this.bite_flash -= dt;
    if (this.result_pop) {
      this.result_pop.t += dt;
      if (this.result_pop.t > 1.4) this.result_pop = null;
    }
    if (this.dialogue) {
      this.dialogue.update(dt);
      if (this.dialogue.done) this.dialogue = null;
      return;
    }
    if (this.intro || this.ended) return;
    this.clock += dt;
    if (this.clock >= this.shift_len && !this.closing) {
      this.closing = true;
      this.say_msg(this.present().length ? "5:00 PM - closed! Finish up, or SEND HOME the rest." : "5:00 PM - closing time!", 4);
      this.game.audio.play("chime");
    }
    // waves
    if (!this.closing) {
      this.next_wave -= dt;
      if (!this.present().length && this.wave_n > 0) this.next_wave = Math.min(this.next_wave, 3);
      if (this.next_wave <= 0) this.start_wave();
      for (let i = this.spawn_list.length - 1; i >= 0; i--) {
        this.spawn_list[i] -= dt;
        if (this.spawn_list[i] <= 0) {
          if (this.spawn_one() || this.spawn_list.length > 4) this.spawn_list.splice(i, 1);
          else this.spawn_list[i] = 1.5;
        }
      }
      // leaky pipes
      if (this.mod.leaky) {
        this.leak_t -= dt;
        if (this.leak_t <= 0) {
          this.leak_t = pg.random.uniform(9, 15);
          this.add_mess(pg.random.uniform(60, 250), pg.random.uniform(80, 150), 1);
        }
      }
    }
    if (this.jar_cd > 0) this.jar_cd = Math.max(0, this.jar_cd - dt);
    this.update_zoe(dt);
    this.update_pets(dt);
    for (const o of this.owners) o.update(dt);
    for (const o of this.owners) if (o.done && o.pet) o.pet.status = "gone";
    this.owners = this.owners.filter((o: Owner) => !o.done);
    // minigame
    if (this.mg) {
      this.mg.update(dt);
      if (this.mg && this.mg.done) this.finish_mg();
    }
    if (this.closing && !this.present().length && !this.owners.length && !this.dialogue
        && !this.patients.some((p: Patient) => p.status === "dead" && p.dead_t < 2)) {
      this.end_shift();
    }
  }

  update_zoe(dt: number) {
    if (this.door_cd > 0) this.door_cd -= dt;
    if (this.stun > 0) { this.stun -= dt; this.zmoving = false; return; }
    if (this.mg) { this.zmoving = false; return; }
    if (this.mop) {
      this.mop.t -= dt;
      this.zmoving = false;
      if (pg.random.random() < dt * 20) this.particles.add("bubble", this.mop.m.x + pg.random.uniform(0, 18), this.mop.m.y + pg.random.uniform(0, 8), 1, { life: 0.4 });
      if (this.mop.t <= 0) {
        this.messes = this.messes.filter((m: any) => m !== this.mop.m);
        this.particles.burst("sparkle", this.mop.m.x + 9, this.mop.m.y + 4, 6, 18);
        this.mop = null;
        this.game.audio.play("star", 0.5);
      }
      return;
    }
    let vx = 0, vy = 0;
    if (this.slip > 0) {
      this.slip -= dt;
      [vx, vy] = this.slip_v;
    } else {
      const keys = pg.key.get_pressed();
      vx = (keys[pg.K_d] || keys[pg.K_RIGHT] ? 1 : 0) - (keys[pg.K_a] || keys[pg.K_LEFT] ? 1 : 0);
      vy = (keys[pg.K_s] || keys[pg.K_DOWN] ? 1 : 0) - (keys[pg.K_w] || keys[pg.K_UP] ? 1 : 0);
      if (vx || vy) { this.walk_to = null; this.click_target = null; }
      else if (this.walk_to) {
        const [tx, ty] = this.walk_to;
        const dx = tx - this.zx, dy = ty - this.zy, d = Math.hypot(dx, dy);
        const reach = this.click_target ? 14 : 2;
        if (d <= reach) {
          const c = this.click_target;
          this.walk_to = null; this.click_target = null;
          if (c) { this.face_point(c.pt); this.do_interact(this.refresh_target(c)); }
        } else { vx = dx / d; vy = dy / d; }
      }
    }
    this.zmoving = !!(vx || vy);
    if (!this.zmoving) return;
    if (this.slip <= 0) {
      if (Math.abs(vx) > Math.abs(vy)) this.zdir = vx > 0 ? "right" : "left"; else this.zdir = vy > 0 ? "down" : "up";
    }
    let sp = (this.slip > 0 ? 150 : this.carry ? 78 : 88) * dt;
    const len = Math.hypot(vx, vy);
    if (len > 1) { vx /= len; vy /= len; }
    const nx = this.zx + vx * sp, ny = this.zy + vy * sp;
    const stuck = this.blocked(this.zx, this.zy);
    let moved = false;
    if (stuck || !this.blocked(nx, this.zy)) { this.zx = nx; moved = true; }
    if (stuck || !this.blocked(this.zx, ny)) { this.zy = ny; moved = true; }
    if (!moved && this.walk_to) { this.walk_to = null; this.click_target = null; }
    this.zx = Math.max(ROOM_L, Math.min(ROOM_R, this.zx));
    this.zy = Math.max(ROOM_TOP, Math.min(ROOM_BOTTOM + 6, this.zy));
    this.zanim += dt * 9;
    // puddles: whoops!
    if (this.slip <= 0) {
      for (const m of this.messes) {
        if (Math.abs(this.zx - (m.x + 9)) < 9 && Math.abs(this.zy - (m.y + 4)) < 5) {
          this.slip = 0.45;
          this.slip_v = [vx || 0.0001, vy];
          this.particles.text("WHOA!", this.zx, this.zy - 34, ui.BAD, 1.0);
          this.game.audio.play("splash", 0.7);
          if (this.carry) {
            const p: Patient = this.carry;
            this.carry = null;
            p.status = "floor"; p.x = this.zx; p.y = this.zy + 2;
            p.health = Math.max(1, p.health - 6);
            this.say_msg(`You slipped and dropped ${p.name}! Mop puddles with E.`, 2.4);
          }
          break;
        }
      }
    }
    // walking out the front door = leave the clinic
    if (this.zy > ROOM_BOTTOM + 3 && Math.abs(this.zx - DOOR_X) < 12 && this.door_cd <= 0 && !this.left_early) {
      this.door_cd = 2;
      this.zy = ROOM_BOTTOM - 4;
      this.ask_close_up();
    }
  }

  face_point(pt: number[]) {
    const dx = pt[0] - this.zx, dy = pt[1] - this.zy;
    if (Math.abs(dx) > Math.abs(dy)) this.zdir = dx > 0 ? "right" : "left"; else this.zdir = dy > 0 ? "down" : "up";
  }

  refresh_target(c: any): any {
    // the situation may have changed while walking there - re-pick the same thing
    const all = this.candidates();
    const same = all.find((d) => d.kind === c.kind && d.p === c.p && d.s === c.s && d.i === c.i && d.m === c.m);
    return same ?? this.interact_target();
  }

  add_mess(x: number, y: number, kind = 0) {
    if (this.messes.length >= 5) return;
    if (this.solids().some((r) => r.inflate(8, 8).collidepoint([x, y]))) return;
    this.messes.push({ x: Math.trunc(x) - 9, y: Math.trunc(y) - 2, kind });
  }

  drain_rate(p: Patient): number {
    const base = 100.0 / (data.ANIMALS[p.kind].patience * 1.8) * 1.9;
    let rate = base * this.tier.drain * data.PERSONALITY_INFO[p.personality].drain * p.severity * (this.mod.drain ?? 1);
    if (this.wild) rate *= 1.1;
    if (this.st.buffs && this.st.buffs.fed) rate *= config.BUFF_FED_DRAIN;
    if (this.st.buffs && this.st.buffs.pep) rate *= 0.9;
    if (p.status === "waiting" && gstate.has(this.st, "comfy_waiting")) rate *= 0.8;
    if (p.status === "carried") rate *= 0.6;
    if (p.status === "station") rate *= p.in_mg ? config.ACTIVE_DRAIN_FACTOR : 0.7;
    if (p.status === "bed") rate *= 0.5;
    if (p.status === "loose") rate *= 1.2;
    if (p.untreated.length === 0 || (p.untreated.length === 1 && p.untreated[0] === "checkup")) rate *= 0.3;
    if (this.st.day === 1) rate *= 0.75;
    return rate;
  }

  update_pets(dt: number) {
    const rng = pg.random;
    for (const p of this.patients as Patient[]) {
      p.anim += dt;
      if (p.status === "dead") { p.dead_t += dt; continue; }
      if (["gone", "leaving", "entering"].includes(p.status)) continue;
      // hearts
      if (p.status === "bed" && p.recovering) {
        p.health = Math.min(100, p.health + 5 * dt);
        if (p.recover > 0) {
          p.recover -= dt;
          if (p.recover <= 0) {
            this.game.audio.play("star", 0.6);
            const [x, y] = this.pet_pos(p);
            this.particles.burst("sparkle", x, y - 12, 8, 20);
          }
        }
      } else if (!(this.dialogue)) {
        p.health -= this.drain_rate(p) * dt;
        if (p.health <= 0) { this.die(p); continue; }
      }
      // growls (feral bite, grumpy nip) - only matters when you pick them up
      if (p.personality === "feral" || p.personality === "grumpy") {
        if (p.growl > 0) p.growl -= dt;
        else {
          p.growl_cd -= dt;
          if (p.growl_cd <= 0) {
            p.growl = p.personality === "feral" ? 1.4 : 1.0;
            p.growl_cd = rng.uniform(2.5, 5) * (p.personality === "feral" ? 1 : 1.6);
            if (p.status !== "carried") this.game.audio.play("hiss", 0.35);
          }
        }
        if (p.status === "carried" && p.growl > 0 && p.personality === "feral" && rng.random() < dt * 0.5) {
          // a feral wriggles free sometimes
          this.carry = null;
          p.status = "loose"; p.x = this.zx; p.y = this.zy + 2; p.loose_t = 4; p.vx = rng.uniform(-40, 40); p.vy = rng.uniform(-30, 30);
          this.particles.text("WRIGGLE!", this.zx, this.zy - 34, ui.BAD, 1.0);
          this.say_msg(`${p.name} wriggled free! Catch them!`, 2);
          this.game.audio.play("hiss");
        }
      }
      // getting antsy and bolting for the door
      if ((p.status === "waiting" || p.status === "queue" || p.status === "floor") && this.st.day >= 2) {
        const bolty = ({ nervous: 1.0, playful: 0.7, feral: 1.3, grumpy: 0.3, calm: 0.1 } as any)[p.personality] ?? 0.3;
        if (p.antsy > 0) {
          p.antsy -= dt;
          if (p.antsy <= 0) {
            const [x, y] = this.pet_pos(p);
            this.release_spot(p);
            p.status = "loose"; p.x = x; p.y = y; p.loose_t = rng.uniform(7, 10);
            p.vx = rng.uniform(-45, 45); p.vy = rng.uniform(-35, 35);
            this.say_msg(`${p.name} bolted! CATCH them before they reach the door!`, 2.6);
            this.game.audio.play("whoosh");
            this.promote_queue();
          }
        } else if (!this.mg && rng.random() < dt * 0.006 * bolty * (this.mod.bolt ?? 1) * (this.wild ? 1.2 : 1) * (p.health < 50 ? 1.6 : 1)) {
          p.antsy = 3; // warning time
          this.game.audio.play("tick", 0.6);
        }
        // tummy trouble / nervous pee
        if ((p.untreated.includes("tummy") || p.personality === "nervous") && rng.random() < dt * 0.008) {
          const [x, y] = this.pet_pos(p);
          this.add_mess(x + rng.uniform(-14, 14), y + rng.uniform(4, 10), 0);
        }
      }
      if (p.status === "loose") this.update_loose(p, dt);
    }
  }

  update_loose(p: Patient, dt: number) {
    p.loose_t -= dt;
    let vx = p.vx, vy = p.vy;
    if (p.loose_t <= 0) {
      // head for the door!
      const dx = DOOR_X - p.x, dy = 180 - p.y, d = Math.hypot(dx, dy) || 1;
      vx = (dx / d) * 46; vy = (dy / d) * 46;
    } else if (pg.random.random() < dt * 1.5) {
      p.vx = pg.random.uniform(-50, 50); p.vy = pg.random.uniform(-40, 40);
    }
    // run away from Zoe a little
    const zx = p.x - this.zx, zy = p.y - this.zy, zd = Math.hypot(zx, zy);
    if (zd < 30 && zd > 0.1 && p.loose_t > 0) { vx += (zx / zd) * 30; vy += (zy / zd) * 30; }
    const nx = p.x + vx * dt, ny = p.y + vy * dt;
    const exiting = p.loose_t <= 0 && Math.abs(p.x - DOOR_X) < 14;
    if (exiting || !this.blocked(nx, p.y)) p.x = nx; else p.vx = -p.vx;
    if (exiting || !this.blocked(p.x, ny)) p.y = ny; else p.vy = -p.vy;
    if (p.y > 176) this.escape(p);
  }

  end_shift() {
    if (this.ended) return;
    this.ended = true;
    const st = this.st;
    const S = this.stats;
    const star_list: number[] = S.stars.concat(pg.range(S.lost).map(() => 0));
    const avg_stars = star_list.length ? pg.sum(star_list) / star_list.length : 0;
    if (S.lost === 0 && S.treated >= 3 && avg_stars >= 4.75) this.award("badges", "perfect_day");
    if (this.rush) {
      st.stats.rush_days += 1;
      this.award("achievements", "rush_survivor");
    }
    // the day goal
    const won = S.treated >= this.goal && !this.failed;
    if (won) {
      st.coins += this.goal_bonus;
      st.total_coins += this.goal_bonus;
      S.coins += this.goal_bonus;
      st.stats.goals_met = (st.stats.goals_met || 0) + 1;
      this.unlocks.unshift(`DAY GOAL MET! +${this.goal_bonus} coins`);
    } else {
      this.unlocks.unshift(`Day goal missed (${S.treated}/${this.goal} treated)`);
    }
    st.stats.days_worked += 1;
    if (this.wild) st.stats.wild_days = (st.stats.wild_days || 0) + 1;
    st.buffs = {};
    st.evening_t = 0;
    if (this.wild) challenges.progress(this.game, "wild_shift");
    if (S.lost === 0 && S.treated >= 1) challenges.progress(this.game, "no_loss");
    this.check_general();
    const new_rank = gstate.rank_index(st.xp);
    const rank_ups: [string, string][] = [];
    for (let r = this.start_rank + 1; r < new_rank + 1; r++) rank_ups.push([data.RANKS[r], data.RANK_UNLOCK_TEXT[r] ?? ""]);
    if (gstate.legend_stars(st.xp) > gstate.legend_stars(this.start_xp) && gstate.legend_stars(this.start_xp) >= 1) {
      rank_ups.push([gstate.rank_name(st.xp), "Another legendary star!"]);
    }
    st.phase = "evening";
    st.rush = false;
    this.game.shift_snapshot = null;
    this.game.save();
    const summary = {
      day: st.day, treated: S.treated, lost: S.lost,
      avg: S.scores.length ? pg.sum(S.scores) / S.scores.length : 0,
      tips: S.tips, coins: S.coins, stars: avg_stars, xp: S.xp,
      start_xp: this.start_xp, end_xp: st.xp, rank_ups, unlocks: this.unlocks.slice(),
      goal: this.goal, won, mod: this.mod.name,
    };
    this.game.transition(() => this.game.replace(new SummaryScene(this.game, summary)));
  }

  // ----------------------------------------------------------- input
  leave_rect(): Rect {
    return new Rect(270, 169, 48, 10);
  }

  event(e: pg.GameEvent) {
    if (this.dialogue) {
      this.dialogue.event(e);
      if (this.dialogue && this.dialogue.done) this.dialogue = null;
      return;
    }
    if (this.ended) return;
    const m = this.game.mpos;
    if (this.intro) {
      if ((e.type === pg.KEYDOWN && [pg.K_e, pg.K_SPACE, pg.K_RETURN].includes(e.key)) || (e.type === pg.MOUSEBUTTONDOWN && e.button === 1)) {
        this.intro = false;
        this.game.audio.play("chime");
        this.particles.text("GO!", 160, 90, ui.ACCENT, 1.0);
      } else if (e.type === pg.KEYDOWN && e.key === pg.K_ESCAPE) {
        this.game.push(new PauseMenu(this.game, true));
      }
      return;
    }
    if (this.mg) {
      if (e.type === pg.KEYDOWN && (e.key === pg.K_ESCAPE || e.key === pg.K_q)) {
        this.abort_mg();
        return;
      }
      this.mg.event(e);
      return;
    }
    if (e.type === pg.KEYDOWN && e.key === pg.K_ESCAPE) {
      this.game.push(new PauseMenu(this.game, true));
      return;
    }
    if (e.type === pg.KEYDOWN && [pg.K_e, pg.K_SPACE, pg.K_RETURN].includes(e.key)) {
      const c = this.interact_target();
      if (c) this.do_interact(c);
      else if (this.carry) this.say_msg("Walk up to a station, bed, cushion or the desk.", 1.6);
      return;
    }
    if (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) {
      if (!this.left_early && this.leave_rect().collidepoint(m)) {
        this.game.audio.play("select");
        this.ask_close_up();
        return;
      }
      // click something to walk there and use it
      let best: any = null, bd = 16;
      for (const c of this.candidates()) {
        let cp = c.pt;
        if (c.kind === "pick" || c.kind === "treat_pet") { const pp = this.pet_pos(c.p); cp = [pp[0], pp[1] - 8]; }
        if (c.kind === "station") cp = [c.s.x, 48];
        if (c.kind === "bed") cp = [this.bed_rect(c.i).centerx, this.bed_rect(c.i).centery];
        if (c.kind === "desk") cp = [DESK_RECT.centerx, DESK_RECT.centery - 4];
        if (c.kind === "jar") cp = [JAR_RECT.centerx, JAR_RECT.y];
        const d = Math.hypot(cp[0] - m[0], cp[1] - m[1]);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) {
        this.click_target = best;
        this.walk_to = best.pt.slice();
        if (best.kind === "pick" && best.p.status === "loose") this.walk_to = [best.p.x, best.p.y];
      } else {
        this.click_target = null;
        this.walk_to = [Math.max(ROOM_L, Math.min(ROOM_R, m[0])), Math.max(ROOM_TOP, Math.min(ROOM_BOTTOM, m[1] + 8))];
      }
    }
  }

  // ----------------------------------------------------------- guidance
  todo(): any {
    const c = this.carry as Patient;
    if (this.intro) return null;
    if (c) {
      const ns = c.next_station();
      if (ns === "kennel") {
        if (c.recover != null && c.recover <= 0) return { text: `Carry ${c.name} to the front desk to go home`, pt: [DESK_RECT.centerx, DESK_RECT.y - 4] };
        const b = this.beds.findIndex((x: any, i: number) => x == null && this.bed_ok[i]);
        if (b < 0) return { text: `Beds are full! Send a rested pet home first` };
        const r = this.bed_rect(b);
        return { text: `Put ${c.name} in a recovery bed (E)`, pt: [r.centerx, r.y] };
      }
      const s = this.stations.find((x: any) => x.kind === ns && !x.pet) ?? this.stations.find((x: any) => x.kind === ns);
      return { text: `Carry ${c.name} to the ${data.STATION_NAMES[ns].toUpperCase()} station (E)`, pt: [s.x, 26] };
    }
    if (this.treat) {
      const low = this.present().filter((p: Patient) => p.status !== "carried");
      if (low.length) {
        const p = min_by(low, (q: Patient) => q.health);
        const [x, y] = this.pet_pos(p);
        return { text: `Give the treat to ${p.name}`, pt: [x, y - 26] };
      }
    }
    const loose = this.present().filter((p: Patient) => p.status === "loose");
    if (loose.length) return { text: `CATCH ${loose[0].name}! They're running for the door!`, pt: [loose[0].x, loose[0].y - 26] };
    const ready = this.present().filter((p: Patient) => p.status === "bed" && p.recover != null && p.recover <= 0);
    if (ready.length) { const [x, y] = this.pet_pos(ready[0]); return { text: `${ready[0].name} is better! Pick them up, take to the desk`, pt: [x, y - 26] }; }
    const at_st = this.present().filter((p: Patient) => p.status === "station" && !p.in_mg);
    const waiting = this.present().filter((p: Patient) => ["waiting", "queue", "floor"].includes(p.status) || (p.status === "bed" && !p.recovering));
    const pool = at_st.concat(waiting);
    if (pool.length) {
      const p = min_by(pool, (q: Patient) => q.health - (q.status === "station" ? 30 : 0));
      const [x, y] = this.pet_pos(p);
      const ns = p.next_station();
      return { text: `Pick up ${p.name} (needs ${ns === "kennel" ? "a bed" : data.STATION_NAMES[ns].toUpperCase()})`, pt: [x, y - 26] };
    }
    if (this.present().some((p: Patient) => p.status === "bed")) return { text: "Pets are resting... grab a treat or mop up!" };
    if (this.closing) return { text: "All done for today! Closing up..." };
    return { text: `Next patients in ${Math.max(0, Math.ceil(this.next_wave))}s... get ready!` };
  }

  ask_close_up() {
    const n = this.present().length;
    const pets = `${n} patient${n === 1 ? "" : "s"}`;
    let first: string;
    if (this.closing) first = `It's after closing time. Send the ${pets} still here home and close up?`;
    else if (n) first = `Leave the clinic early and end the day? The ${pets} still here will go home.`;
    else first = "Close the clinic early and end the day? You'll keep everything you earned today.";
    const lines = [first];
    if (n) lines.push("Pets resting in a bed still pay. The others go home without paying.");
    this.zoe(lines, null, [[this.closing ? "Send home" : "Leave", () => this.close_up()], ["Stay", () => {}]]);
  }

  close_up(forced = false) {
    if (!forced && !this.closing) this.left_early = true;
    this.closing = true;
    this.mg = null;
    if (this.carry) { this.carry.status = "floor"; this.carry.x = this.zx; this.carry.y = this.zy; this.carry = null; }
    this.spawn_list = [];
    for (const o of this.owners as Owner[]) {
      if (o.pet && o.pet.status === "entering") {
        o.on_arrive = null;
        o.path = [[DOOR_X, 186]];
        o.pet.status = "leaving";
        this.release_spot(o.pet);
        for (let i = 0; i < this.cushions.length; i++) if (this.cushions[i] === o.pet) this.cushions[i] = null;
        for (let i = 0; i < this.queue.length; i++) if (this.queue[i] === o.pet) this.queue[i] = null;
      }
    }
    for (const p of this.present()) {
      if (p.status === "leaving") continue;
      if (p.status === "bed" && p.recovering) {
        p.recover = 0;
        this.discharge(p, true);
      } else {
        this.release_spot(p);
        p.status = "gone";
      }
    }
    this.say_msg("Everyone's headed home. Closing up!", 3);
  }

  // ----------------------------------------------------------- drawing
  draw(s: Surface) {
    if (this.mg) {
      this.mg.draw(s);
      this.draw_mg_strip(s);
    } else {
      this.draw_room(s);
      this.draw_hud(s);
      this.draw_hint(s);
    }
    this.particles.draw(s);
    if (this.bite_flash > 0) {
      const red = sprites.cached("bite_flash_room", () => { const v = new Surface([320, 180], SRCALPHA); v.fill([230, 40, 50, 80]); return v; });
      s.blit(red, [0, 0]);
    }
    if (this.msg_t > 0 && this.msg) {
      const y = this.mg ? 148 : 16;
      const w = font.text_width(this.msg) + 12;
      ui.panel(s, [160 - Math.floor(w / 2), y, w, 11], [255, 250, 220], ui.BORDER);
      font.draw(s, this.msg, [160, y + 3], ui.INK, 1, null, "center");
    }
    if (this.result_pop) {
      const rp = this.result_pop;
      const k = rp.t;
      const sc = k > 0.12 ? 2 : 3;
      const y = 70 - Math.trunc(Math.min(k, 0.3) * 30);
      font.draw(s, rp.label, [160, y], rp.col, sc, [255, 255, 255], "center");
      font.draw(s, `${rp.score}%`, [160, y + 14], ui.INK, 1, [255, 255, 255], "center");
    }
    if (this.intro && !this.dialogue) this.draw_intro(s);
    if (this.dialogue) this.dialogue.draw(s);
  }

  draw_intro(s: Surface) {
    const shade = sprites.cached("intro_shade", () => { const v = new Surface([320, 180], SRCALPHA); v.fill([40, 30, 50, 120]); return v; });
    s.blit(shade, [0, 0]);
    const r = new Rect(50, 34, 220, 108);
    ui.panel(s, r, ui.PAPER, ui.BORDER);
    pg.draw.rect(s, this.wild ? [200, 90, 60] : ui.ACCENT, [r.x, r.y, r.w, 14]);
    font.draw(s, `DAY ${this.st.day} - ${weekday_name(this.st.day)}`, [160, r.y + 4], [255, 255, 255], 1, null, "center");
    font.draw(s, this.mod.name.toUpperCase(), [160, r.y + 20], this.wild ? [200, 70, 40] : ui.ACCENT, 2, null, "center");
    font.draw_wrapped(s, this.mod.desc, [r.x + 10, r.y + 38, r.w - 20, 20], ui.INK);
    font.draw(s, `GOAL: TREAT ${this.goal} PETS`, [r.x + 12, r.y + 58], ui.INK);
    font.draw(s, `+${this.goal_bonus}`, [r.right - 24, r.y + 58], [170, 120, 30], 1, null, "right");
    s.blit(sprites.icon("coin"), [r.right - 22, r.y + 55]);
    font.draw(s, `LOSE ${this.max_strikes} PETS AND THE DAY IS OVER!`, [r.x + 12, r.y + 68], ui.BAD);
    font.draw(s, "WASD/ARROWS: WALK   E/SPACE: GRAB & DROP", [160, r.y + 80], ui.MUTED, 1, null, "center");
    font.draw(s, "OR JUST CLICK WHERE TO GO", [160, r.y + 88], ui.MUTED, 1, null, "center");
    if (pg.mod(Math.trunc(this.t * 2), 2)) font.draw(s, "PRESS E OR CLICK TO OPEN THE DOORS!", [160, r.bottom - 10], ui.ACCENT, 1, null, "center");
  }

  draw_room(s: Surface) {
    const wild = this.wild;
    // floor
    s.blit(sprites.cached(["clinic_floor", wild], () => {
      const f = new Surface([320, 180]);
      for (let y = 40; y < 180; y += 10) {
        for (let x = 0; x < 320; x += 10) {
          const a = pg.mod(Math.floor(x / 10) + Math.floor(y / 10), 2);
          const c = wild ? (a ? [190, 186, 176] : [178, 174, 166]) : (a ? [242, 244, 250] : [224, 232, 246]);
          pg.draw.rect(f, c, [x, y, 10, 10]);
        }
      }
      if (wild) {
        for (const [x1, y1, x2, y2] of [[30, 140, 52, 150], [230, 80, 244, 94], [262, 150, 290, 158], [90, 70, 100, 80]]) pg.draw.line(f, [150, 146, 140], [x1, y1], [x2, y2]);
        for (const [px, py] of [[120, 150], [128, 144], [136, 152], [200, 120], [208, 114]]) pg.draw.rect(f, [150, 116, 84], [px, py, 3, 2]);
      }
      // back wall
      const wc = wild ? [126, 88, 62] : [196, 232, 220];
      pg.draw.rect(f, wc, [0, 0, 320, 44]);
      if (wild) for (let x = 0; x < 320; x += 12) { pg.draw.rect(f, [112, 76, 54], [x, 0, 1, 44]); pg.draw.rect(f, [140, 100, 72], [x + 5, 18 + (x % 7), 1, 2]); }
      else for (let x = 0; x < 320; x += 16) pg.draw.rect(f, [184, 222, 210], [x, 14, 8, 30]);
      pg.draw.rect(f, wild ? [90, 60, 44] : [150, 196, 186], [0, 42, 320, 3]);
      pg.draw.rect(f, wild ? [70, 48, 36] : [170, 206, 196], [0, 45, 320, 2]);
      // side walls (seen from above)
      for (const x of [0, 316]) { pg.draw.rect(f, wild ? [100, 70, 50] : [170, 210, 198], [x, 44, 4, 136]); }
      // front wall + door gap
      pg.draw.rect(f, wild ? [100, 70, 50] : [170, 210, 198], [0, 166, 320, 14]);
      pg.draw.rect(f, wild ? [150, 140, 130] : [236, 232, 226], [DOOR_X - 14, 166, 28, 14]);
      pg.draw.rect(f, [200, 110, 90], [DOOR_X - 13, 160, 26, 7]); // doormat
      pg.draw.rect(f, [226, 140, 110], [DOOR_X - 11, 161, 22, 1]);
      // rug under the waiting area
      f.blit(props.rug(140, 52, wild ? [170, 140, 100] : [250, 214, 170], wild ? [140, 110, 76] : [226, 160, 120]), [90, 94]);
      return f;
    }), [0, 0]);
    const t = this.t;
    // wall decorations
    if (!wild) {
      s.blit(props.bunting(320), [0, 14]);
      s.blit(props.window_(30, 20), [12, 18]);
      s.blit(props.window_(30, 20), [278, 18]);
      s.blit(props.wall_clock(), [86, 20]);
      s.blit(props.picture("paw"), [228, 22]);
    } else {
      s.blit(props2.caution_sign("FERAL!"), [10, 20]);
      s.blit(props2.first_aid(), [292, 22]);
      const on = pg.mod(Math.trunc(t * 7), 11) !== 0;
      pg.draw.line(s, [60, 50, 50], [136, 0], [136, 8]);
      pg.draw.circle(s, on ? [255, 236, 150] : [150, 140, 110], [136, 10], 3);
    }
    // title sign
    const title = wild ? "WILDSIDE RESCUE" : "PAWSLEY VET";
    const tw = font.text_width(title) + 10;
    ui.panel(s, [160 - Math.floor(tw / 2), 2, tw, 10], [255, 250, 236], wild ? [150, 90, 60] : [200, 100, 120], false);
    font.draw(s, title, [160, 4], wild ? [170, 80, 50] : [200, 90, 110], 1, null, "center");
    // stations
    const want = this.carry ? this.carry.next_station() : null;
    for (const st of this.stations) {
      const art = station_art(st.kind, wild);
      s.blit(props.shadow(40, 5, 50), [st.x - 20, 58]);
      s.blit(art, [st.x - 22, 28]);
      // sign plaque
      if (st.kind !== "shelf") {
        const nm = data.STATION_NAMES[st.kind].toUpperCase();
        const w = font.text_width(nm) + 6;
        const glow = want === st.kind && !st.pet && pg.mod(Math.trunc(t * 3), 2);
        pg.draw.rect(s, glow ? [255, 236, 120] : STATION_COLORS[st.kind], [st.x - Math.floor(w / 2), 16, w, 9]);
        pg.draw.rect(s, ui.BORDER, [st.x - Math.floor(w / 2), 16, w, 9], 1);
        font.draw(s, nm, [st.x, 18], [255, 255, 255], 1, null, "center");
      } else {
        font.draw(s, "SUPPLIES", [st.x, 18], wild ? [240, 220, 200] : [110, 150, 140], 1, null, "center");
      }
    }
    // beds
    for (let i = 0; i < 6; i++) {
      const r = this.bed_rect(i);
      const p: Patient = this.beds[i];
      const ready = p && p.recover != null && p.recover <= 0;
      s.blit(bed_art(!!ready, !this.bed_ok[i], wild), r.topleft);
      if (!this.bed_ok[i]) {
        s.blit(sprites.icon("lock"), [r.centerx - 6, r.centery - 7]);
      } else if (!p && want === "kennel" && pg.mod(Math.trunc(t * 3), 2)) {
        pg.draw.rect(s, [255, 236, 120], r, 1);
      }
    }
    // desk + treat jar + messes
    s.blit(props.shadow(56, 5, 50), [DESK_RECT.x, DESK_RECT.bottom - 2]);
    s.blit(sprites.obj("desk"), [DESK_RECT.x + 1, DESK_RECT.y - 10]);
    font.draw(s, "HOME", [DESK_RECT.centerx, DESK_RECT.y + 6], [255, 255, 255], 1, null, "center");
    s.blit(jar_art(this.jar_cd <= 0), [JAR_RECT.x, JAR_RECT.y - 10]);
    if (this.jar_cd > 0) {
      const k = 1 - this.jar_cd / 12;
      pg.draw.rect(s, ui.BORDER, [JAR_RECT.x + 1, JAR_RECT.bottom + 1, 24, 3]);
      pg.draw.rect(s, ui.GOLD, [JAR_RECT.x + 2, JAR_RECT.bottom + 2, Math.max(0, Math.min(22, Math.trunc(22 * k))), 1]);
    }
    // corner greenery
    if (!wild) {
      s.blit(sprites.decor("plant"), [12, 50]);
      s.blit(props.water_cooler(), [296, 46]);
    } else {
      s.blit(props2.hay_bale(), [8, 52]);
      s.blit(props2.feed_bin(), [292, 50]);
    }
    // decor Zoe bought for the clinic lines the front wall
    this.draw_decor(s);
    for (const m of this.messes) s.blit(puddle_art(m.kind), [m.x, m.y]);
    for (let i = 0; i < CUSHIONS.length; i++) {
      const [x, y] = CUSHIONS[i];
      s.blit(cushion_art(wild), [x - 12, y - 6]);
    }
    // ---- sortable things: pets, owners, Zoe
    const items: [number, () => void][] = [];
    for (const p of this.patients as Patient[]) {
      if (["gone", "carried"].includes(p.status)) continue;
      if (p.status === "entering") continue; // drawn with their owner
      if (p.status === "leaving") {
        if (!this.owners.some((o: Owner) => o.pet === p)) {
          items.push([p.y, () => { s.blit(props.shadow(16, 4, 60), [p.x - 8, p.y - 3]); s.blit(sprites.animal(p.kind, p.variant, 24, pg.mod(Math.trunc(p.anim * 2), 2), "happy"), [p.x - 12, p.y - 22]); }]);
        }
        continue;
      }
      const [x, y] = this.pet_pos(p);
      const sort = p.status === "station" ? 62 : p.status === "bed" ? y - 4 : y;
      items.push([sort, () => this.draw_pet(s, p, x, y)]);
    }
    for (const o of this.owners as Owner[]) {
      items.push([o.y, () => {
        const fr = o.walking ? [1, 0, 2, 0][pg.mod(Math.trunc(o.anim * 8), 4)] : 0;
        s.blit(props.shadow(12), [Math.trunc(o.x) - 6, Math.trunc(o.y) - 3]);
        const img = o.idx < 0 ? sprites.npc("gus", o.dir, fr) : sprites.owner(o.idx, o.dir, fr);
        s.blit(img, [Math.trunc(o.x) - 8, Math.trunc(o.y) - 24]);
        if (o.pet) {
          const happy = o.pet.status === "leaving";
          s.blit(sprites.animal(o.pet.kind, o.pet.variant, 16, 0, happy ? "happy" : "sick"), [Math.trunc(o.x) - 8 + (o.dir === "left" ? -6 : 6), Math.trunc(o.y) - 18]);
          if (happy && pg.mod(Math.trunc(o.anim * 3), 2)) font.draw(s, font.HEART, [Math.trunc(o.x) + 4, Math.trunc(o.y) - 32], [240, 90, 120]);
        }
      }]);
    }
    items.push([this.zy, () => this.draw_zoe(s)]);
    items.sort((a, b) => a[0] - b[0]);
    for (const [, f] of items) f();
    // what you can interact with
    const c = !this.mop && this.stun <= 0 ? this.interact_target() : null;
    if (c) {
      const bob = Math.trunc(Math.abs(Math.sin(t * 5)) * 2);
      let [px, py] = c.pt;
      if (c.kind === "pick" || c.kind === "treat_pet") { const pp = this.pet_pos(c.p); px = pp[0]; py = pp[1] - (c.p.status === "station" ? 30 : 24); }
      if (c.kind === "station") py = 28;
      const label = "E: " + c.label.toUpperCase();
      const w = font.text_width(label) + 6;
      const lx = Math.max(2, Math.min(318 - w, px - Math.floor(w / 2)));
      const ly = Math.max(15, py - 12 - bob);
      ui.panel(s, [lx, ly, w, 9], [255, 255, 255], ui.BORDER, false);
      font.draw(s, label, [lx + 3, ly + 2], ui.INK);
    }
  }

  draw_decor(s: Surface) {
    const items = (this.st.layouts && this.st.layouts.clinic) || [];
    const ranges = [[110, 146], [176, 220], [252, 280]];
    let ri = 0, x = ranges[0][0];
    let poster = 0;
    for (const d of items) {
      if (!data.DECOR[d.name]) continue;
      const img = sprites.decor(d.name, d.rot ?? 0);
      if (d.name === "rug") continue;
      if (d.name === "poster") {
        const px = [40, 272][poster++];
        if (px != null) s.blit(img, [px, 22]);
        continue;
      }
      const w = img.get_width();
      while (ri < ranges.length && x + w > ranges[ri][1]) { ri++; if (ri < ranges.length) x = ranges[ri][0]; }
      if (ri >= ranges.length) break;
      s.blit(img, [x, 166 - img.get_height()]);
      x += w + 2;
    }
  }

  draw_pet(s: Surface, p: Patient, x: number, y: number) {
    const t = this.t;
    if (p.status === "dead") {
      const k = Math.min(1, p.dead_t / 2);
      if (k < 1) {
        s.blit(sprites.animal_dead(p.kind, p.variant, 24), [x - 12, y - 18]);
        const gy = y - 24 - Math.trunc(k * 30);
        if (pg.mod(Math.trunc(t * 6), 2)) font.draw(s, "o", [x - 2, gy - 6], [255, 240, 150]);
        s.blit(sprites.cached(["ghost", p.kind, p.variant], () => sprites.tint(sprites.grayscale(sprites.animal(p.kind, p.variant, 16, 0, "blink")), [255, 255, 255], 0.5)), [x - 8, gy]);
      }
      return;
    }
    const station = p.status === "station";
    const sz = station ? 24 : 24;
    const base_y = station ? 44 : p.status === "bed" ? y - 22 : y - 20;
    let ox = x - 12;
    if (p.antsy > 0) ox += pg.mod(Math.trunc(t * 30), 2) ? 1 : -1;
    if (p.status === "loose") ox += 0;
    if (p.status !== "station" && p.status !== "bed") s.blit(props.shadow(16, 4, 60), [x - 8, y - 3]);
    const unt = p.untreated;
    const sick = unt.filter((a: string) => a !== "checkup").length > 0;
    const growling = p.growl > 0 && (p.personality === "feral" || p.personality === "grumpy");
    const ready = p.status === "bed" && p.recover != null && p.recover <= 0;
    const mood = growling ? "angry" : ready || (!sick && p.status === "bed") ? "happy"
      : pg.mod(Math.trunc(p.anim * 0.7), 6) === 0 ? "blink" : (sick && p.health < 40 ? "sick" : "normal");
    const fr = p.status === "loose" ? pg.mod(Math.trunc(t * 8), 2) : pg.mod(Math.trunc(p.anim * 2), 2);
    const hop = p.status === "loose" ? Math.trunc(Math.abs(Math.sin(t * 14)) * 3) : 0;
    if (p.kind === "moonfox") {
      const r = 14 + Math.trunc(Math.sin(t * 3) * 2);
      const glow = sprites.cached(["moonglow", r], () => { const g = new Surface([r * 2, r * 2], SRCALPHA); pg.draw.circle(g, [200, 220, 255, 70], [r, r], r); return g; });
      s.blit(glow, [ox + 12 - r, base_y + 12 - r]);
    }
    s.blit(sprites.animal(p.kind, p.variant, sz, fr, mood), [ox, base_y - hop]);
    if (sick && !ready) draw_symptoms(s, p, ox, base_y - hop, 1, p.anim);
    if (p.vip) font.draw(s, "VIP", [x, base_y - 8], ui.GOLD, 1, [255, 255, 255], "center");
    if (growling) font.draw(s, p.personality === "feral" ? "GRR!" : "HSS!", [x + 12, base_y - 4 + pg.mod(Math.trunc(p.anim * 10), 2)], ui.BAD, 1, [255, 255, 255]);
    if (p.status === "loose") font.draw(s, "!!", [x, base_y - 10], ui.BAD, 1, [255, 255, 255], "center");
    else if (p.antsy > 0) font.draw(s, "!", [x, base_y - 10 - pg.mod(Math.trunc(t * 8), 2)], [250, 170, 60], 1, [255, 255, 255], "center");
    // status tag: health bar + next station
    if (p.status === "station" && p.in_mg) return;
    const bw = 20, bx = x - 10, by = base_y - 4;
    if (p.status === "bed" && p.recovering && p.recover > 0) {
      const k = 1 - p.recover / (config.RECOVERY_SECONDS * (this.wild ? 0.8 : 1));
      pg.draw.rect(s, ui.BORDER, [bx, by, bw, 4]);
      pg.draw.rect(s, [130, 180, 240], [bx + 1, by + 1, Math.trunc((bw - 2) * k), 2]);
      if (pg.mod(Math.trunc(t * 1.5), 2)) font.draw(s, "z", [x + 10, base_y - 2], [130, 150, 220]);
      return;
    }
    if (ready) {
      if (pg.mod(Math.trunc(t * 3), 2)) font.draw(s, "HOME!", [x, by - 4], ui.GOOD, 1, [255, 255, 255], "center");
      return;
    }
    const hc = p.health > 60 ? [90, 200, 110] : p.health > 30 ? [240, 190, 70] : [236, 80, 90];
    pg.draw.rect(s, ui.BORDER, [bx, by, bw, 4]);
    pg.draw.rect(s, [220, 214, 222], [bx + 1, by + 1, bw - 2, 2]);
    pg.draw.rect(s, hc, [bx + 1, by + 1, Math.trunc(((bw - 2) * Math.max(0, p.health)) / 100), 2]);
    if (p.health < 30 && pg.mod(Math.trunc(t * 4), 2)) pg.draw.rect(s, ui.BAD, [bx - 1, by - 1, bw + 2, 6], 1);
    const ns = p.next_station();
    const lab = !p.diagnosed ? "?" : ns === "kennel" ? "Z" : data.STATION_NAMES[ns][0];
    const col = !p.diagnosed ? STATION_COLORS.exam : STATION_COLORS[ns];
    pg.draw.rect(s, [255, 255, 255], [bx + bw + 1, by - 2, 7, 7]);
    pg.draw.rect(s, col, [bx + bw + 1, by - 2, 7, 7], 1);
    font.draw(s, lab, [bx + bw + 2, by - 1], col);
  }

  draw_zoe(s: Surface) {
    const x = Math.trunc(this.zx), y = Math.trunc(this.zy);
    const fr = this.zmoving ? [1, 0, 2, 0][pg.mod(Math.trunc(this.zanim), 4)] : (pg.mod(this.t, 4.0) < 0.15 ? 3 : 0);
    s.blit(props.shadow(12), [x - 6, y - 3]);
    const carried = this.carry as Patient;
    const draw_carry = () => {
      if (!carried) return;
      const off = this.zdir === "left" ? -3 : this.zdir === "right" ? 3 : 0;
      const bob = this.zmoving ? pg.mod(Math.trunc(this.zanim), 2) : 0;
      s.blit(sprites.animal(carried.kind, carried.variant, 16, 0, carried.growl > 0 ? "angry" : "normal"), [x - 8 + off, y - 21 + bob]);
      if (carried.growl > 0 && carried.personality === "feral") font.draw(s, "GRR!", [x + 8, y - 30], ui.BAD, 1, [255, 255, 255]);
      // tiny health bar
      const hc = carried.health > 60 ? [90, 200, 110] : carried.health > 30 ? [240, 190, 70] : [236, 80, 90];
      pg.draw.rect(s, ui.BORDER, [x - 8, y - 38, 16, 3]);
      pg.draw.rect(s, hc, [x - 7, y - 37, Math.trunc((14 * Math.max(0, carried.health)) / 100), 1]);
    };
    if (this.zdir === "up") draw_carry();
    let zx = x - 8;
    if (this.stun > 0) zx += pg.mod(Math.trunc(this.t * 30), 2) ? 1 : -1;
    s.blit(sprites.zoe(this.st.hair, this.st.outfit, this.zdir, fr), [zx, y - 24]);
    if (this.zdir !== "up") draw_carry();
    if (this.treat) s.blit(props2.food_icon("cookie"), [x + 4, y - 16]);
    if (this.stun > 0) for (let i = 0; i < 3; i++) {
      const a = this.t * 6 + i * 2.1;
      font.draw(s, "*", [x + Math.trunc(Math.cos(a) * 7) - 2, y - 30 + Math.trunc(Math.sin(a) * 2)], [250, 220, 90]);
    }
    if (this.mop) {
      pg.draw.line(s, [150, 110, 70], [x + 6, y - 14], [x + 12 + Math.trunc(Math.sin(this.t * 20) * 3), y]);
      pg.draw.rect(s, [230, 230, 236], [x + 9 + Math.trunc(Math.sin(this.t * 20) * 3), y - 1, 6, 3]);
    }
  }

  draw_hud(s: Surface) {
    // left: clock + day progress
    ui.panel(s, [2, 1, 70, 12], [255, 248, 236], ui.BORDER, false);
    font.draw(s, this.clock_text(), [5, 4], this.closing ? ui.BAD : ui.ACCENT);
    const k = Math.min(1, this.clock / this.shift_len);
    pg.draw.rect(s, [220, 210, 200], [44, 6, 25, 3]);
    pg.draw.rect(s, ui.ACCENT, [44, 6, Math.trunc(25 * k), 3]);
    // goal
    ui.panel(s, [74, 1, 40, 12], [255, 248, 236], ui.BORDER, false);
    const met = this.stats.treated >= this.goal;
    font.draw(s, `${this.stats.treated}/${this.goal}`, [94, 4], met ? ui.GOOD : ui.INK, 1, null, "center");
    // right: coins, strikes
    ui.panel(s, [222, 1, 96, 12], [255, 248, 236], ui.BORDER, false);
    s.blit(sprites.icon("coin"), [223, 0]);
    font.draw(s, String(this.st.coins), [236, 4], [170, 120, 30]);
    for (let i = 0; i < this.max_strikes; i++) {
      const lost = i < this.strikes;
      font.draw(s, lost ? "X" : font.HEART, [290 + i * 9, 4], lost ? ui.BAD : [240, 90, 120]);
    }
    if (this.combo > 1 && this.clock - this.last_discharge <= 20) font.draw(s, `x${this.combo}`, [270, 4], ui.ACCENT);
  }

  draw_hint(s: Surface) {
    if (this.dialogue || this.ended || this.intro) return;
    pg.draw.rect(s, [52, 38, 64], [0, 168, 320, 12]);
    const td = this.todo();
    const t = this.t;
    if (td) {
      const label = td.text.toUpperCase();
      let shown = label;
      while (font.text_width(shown) > 250 && shown.length > 4) shown = shown.slice(0, -2);
      if (shown !== label) shown = shown.slice(0, -1) + ".";
      font.draw(s, "!", [4, 171], pg.mod(Math.trunc(t * 2), 2) ? [230, 90, 100] : [250, 210, 120]);
      font.draw(s, shown, [10, 171], [255, 240, 220]);
      if (td.pt) {
        const bob = Math.trunc(Math.abs(Math.sin(t * 5)) * 2);
        props.arrow(s, Math.max(6, Math.min(314, td.pt[0])), Math.max(16, td.pt[1]) - bob, "down", [255, 220, 90], 4);
      }
    }
    const btn = this.leave_rect();
    const hov = btn.collidepoint(this.game.mpos);
    ui.panel(s, btn, hov ? [255, 210, 214] : [244, 170, 184], ui.BORDER, false);
    font.draw(s, this.closing ? "SEND HOME" : "LEAVE", [btn.centerx, btn.y + 3], ui.INK, 1, null, "center");
  }

  /** while a mini-game is open: a strip at the top showing everyone else's hearts */
  draw_mg_strip(s: Surface) {
    pg.draw.rect(s, [52, 38, 64], [0, 0, 320, 32]);
    const others = this.present().filter((p: Patient) => p !== this.mg.p);
    font.draw(s, data.STATION_NAMES[this.mg.station].toUpperCase() + ": " + this.mg.p.name.toUpperCase(), [4, 3], [255, 220, 150]);
    font.draw(s, "ESC: STEP AWAY", [316, 3], [200, 190, 210], 1, null, "right");
    others.slice(0, 9).forEach((p: Patient, i: number) => {
      const x = 4 + i * 35, y = 12;
      const danger = p.health < 30 || p.status === "loose";
      pg.draw.rect(s, danger && pg.mod(Math.trunc(this.t * 4), 2) ? [120, 40, 60] : [80, 64, 96], [x, y, 33, 18]);
      s.blit(sprites.animal(p.kind, p.variant, 16, 0, p.status === "loose" ? "angry" : "normal"), [x, y + 1]);
      const hc = p.health > 60 ? [90, 200, 110] : p.health > 30 ? [240, 190, 70] : [236, 80, 90];
      pg.draw.rect(s, [40, 30, 50], [x + 17, y + 12, 14, 3]);
      pg.draw.rect(s, hc, [x + 17, y + 12, Math.trunc((14 * Math.max(0, p.health)) / 100), 3]);
      if (p.status === "loose") font.draw(s, "!!", [x + 19, y + 3], ui.BAD);
      else if (p.status === "bed" && p.recover != null && p.recover <= 0) font.draw(s, "OK", [x + 19, y + 3], ui.GOOD);
    });
    if (!others.length) font.draw(s, "EVERYONE ELSE IS OK", [160, 18], [200, 190, 210], 1, null, "center");
    for (let i = 0; i < this.max_strikes; i++) font.draw(s, i < this.strikes ? "X" : font.HEART, [292 + i * 9, 22], i < this.strikes ? ui.BAD : [240, 90, 120]);
    pg.draw.rect(s, [52, 38, 64], [0, 168, 320, 12]);
    font.draw(s, "OTHER PETS' HEARTS KEEP DRAINING - BE QUICK!", [160, 171], [255, 220, 150], 1, null, "center");
  }
}

function weekday_name(day: number): string {
  const w = (gstate as any).weekday ? (gstate as any).weekday(day) : "";
  return String(w).toUpperCase();
}

export const STATION_COLORS: Record<string, pg.Color> = {
  exam: [80, 150, 200], bath: [70, 160, 220], meds: [170, 90, 200], care: [220, 130, 60],
  kennel: [110, 170, 90], lobby: ui.INK,
};

/** Wildside Rescue lobby: rough plank walls, concrete floor, cages and hay. */
export function draw_wild_bg(s: Surface, t = 0) {
  // walls: planks
  pg.draw.rect(s, [126, 88, 62], [0, 32, 320, 33]);
  for (let x = 0; x < 320; x += 12) {
    pg.draw.rect(s, [112, 76, 54], [x, 32, 1, 33]);
    pg.draw.rect(s, [140, 100, 72], [x + 4, 40 + (x % 5), 1, 2]);
  }
  pg.draw.rect(s, [90, 60, 44], [0, 62, 320, 3]);
  // floor: concrete slabs with cracks and muddy paw prints
  for (let y = 65; y < 168; y += 20) {
    for (let x = 0; x < 320; x += 20) {
      const c = pg.mod(Math.floor(x / 20) + Math.floor(y / 20), 2) ? [196, 192, 184] : [184, 180, 172];
      pg.draw.rect(s, c, [x, y, 20, 20]);
    }
  }
  for (const [x1, y1, x2, y2] of [[30, 140, 52, 152], [210, 76, 222, 92], [262, 150, 290, 158]]) pg.draw.line(s, [150, 146, 140], [x1, y1], [x2, y2]);
  for (const [px, py] of [[120, 150], [128, 144], [136, 152], [144, 146], [230, 140], [238, 134]]) {
    pg.draw.rect(s, [140, 110, 80], [px, py, 3, 2]);
    pg.draw.rect(s, [140, 110, 80], [px - 1, py - 2, 1, 1]);
    pg.draw.rect(s, [140, 110, 80], [px + 3, py - 2, 1, 1]);
  }
  // claw scratches on the wall
  for (const x of [100, 104, 108]) pg.draw.line(s, [80, 50, 36], [x, 44], [x - 4, 58]);
  // door
  pg.draw.rect(s, [110, 80, 60], [0, 70, 12, 54]);
  pg.draw.rect(s, [80, 56, 40], [0, 70, 12, 54], 1);
  pg.draw.rect(s, [200, 170, 90], [8, 98, 2, 3]);
  s.blit(props.rug(16, 6, [140, 110, 80], [100, 76, 56]), [0, 124]);
  // signs
  s.blit(props2.caution_sign("CAUTION: FERAL ANIMALS"), [118, 36]);
  ui.panel(s, [230, 36, 78, 22], [255, 250, 236], [120, 80, 60], false);
  font.draw(s, "DAYS WITHOUT", [269, 39], ui.INK, 1, null, "center");
  font.draw(s, "A BITE: 0", [269, 46], ui.BAD, 1, null, "center");
  s.blit(props2.first_aid(), [24, 42]);
  // flickering hanging bulb
  pg.draw.line(s, [60, 50, 50], [70, 32], [70, 40]);
  const on = pg.mod(Math.trunc(t * 7), 11) !== 0;
  pg.draw.circle(s, on ? [255, 236, 150] : [150, 140, 110], [70, 43], 3);
  // cages, feed and hay
  s.blit(props2.cage(), [294, 70]);
  s.blit(props2.cage([170, 140, 110]), [294, 88]);
  s.blit(props2.feed_bin(), [270, 70]);
  s.blit(props2.hay_bale(), [66, 70]);
  s.blit(props2.hay_bale(), [70, 62]);
  s.blit(sprites.obj("desk"), [18, 82]);
}

export function draw_lobby_bg(s: Surface, st: any) {
  pg.draw.rect(s, [196, 232, 220], [0, 32, 320, 32]);
  for (let x = 0; x < 320; x += 16) pg.draw.rect(s, [184, 222, 210], [x, 32, 8, 32]);
  pg.draw.rect(s, [150, 196, 186], [0, 62, 320, 3]);
  for (let y = 65; y < 168; y += 10) {
    for (let x = 0; x < 320; x += 10) {
      const c = pg.mod(Math.floor(x / 10) + Math.floor(y / 10), 2) ? [240, 244, 250] : [222, 232, 246];
      pg.draw.rect(s, c, [x, y, 10, 10]);
    }
  }
  // window
  pg.draw.rect(s, [250, 250, 252], [244, 36, 40, 22]);
  pg.draw.rect(s, [150, 210, 246], [246, 38, 36, 18]);
  pg.draw.rect(s, [250, 250, 252], [263, 38, 2, 18]);
  pg.draw.circle(s, [255, 240, 150], [252, 43], 3);
  // door
  pg.draw.rect(s, [120, 170, 220], [0, 70, 12, 54]);
  pg.draw.rect(s, [90, 140, 190], [0, 70, 12, 54], 1);
  pg.draw.rect(s, [250, 220, 120], [8, 98, 2, 3]);
  // sign
  ui.panel(s, [128, 36, 64, 12], [255, 250, 236], [200, 100, 120], false);
  font.draw(s, "PAWSLEY VET", [160, 40], [200, 90, 110], 1, null, "center");
  // --- extra details (props.ts)
  s.blit(props.bunting(320), [0, 32]);
  s.blit(props.picture("heart", [200, 120, 140]), [24, 42]);
  s.blit(props.wall_clock(), [100, 40]);
  s.blit(props.picture("paw"), [64, 42]);
  s.blit(props.bulletin_board(), [206, 38]);
  s.blit(props.picture("fish", [150, 180, 210]), [294, 40]);
  s.blit(props.rug(224, 16, [250, 214, 170], [226, 160, 120]), [82, 114]);
  s.blit(props.rug(16, 6, [150, 200, 150], [100, 150, 110]), [0, 124]); // welcome mat at the door
  s.blit(props.water_cooler(), [302, 78]);
  s.blit(sprites.decor("plant"), [66, 68]);
  // baseboard
  pg.draw.rect(s, [170, 206, 196], [0, 65, 320, 2]);
  // decor
  for (const d of st["layouts"]["clinic"]) {
    const info = data.DECOR[d["name"]];
    const h = info["size"][1];
    const img = sprites.decor(d["name"], d["rot"] ?? 0);
    const x = DECOR_ORIGIN[0] + d["x"] * 16;
    const y = DECOR_ORIGIN[1] + (d["y"] + h) * 16 - img.get_height();
    s.blit(img, [x, y]);
  }
  s.blit(sprites.obj("desk"), [18, 82]);
  // (Python: a Maple/Penny blit behind `if False`; never drawn)
}

// ======================================================================= summary
export class SummaryScene extends Scene {
  music = "town";

  constructor(game: any, summary: any) {
    super(game);
    this.s = summary;
    this.t = 0.0;
    this.coins_shown = 0.0;
    this.xp_shown = summary["start_xp"];
    this.btn = new ui.Button([120, 160, 80, 14], "Continue", () => this.cont(), true, null, null, pg.K_RETURN);
    this.particles = new ui.Particles();
    this.played = new Set<any>();
  }

  cont() {
    this.game.transition(() => this.game.replace(town_after_shift(this.game)));
  }

  event(e: pg.GameEvent) {
    if (this.t > 1.0) {
      this.btn.handle(e, this.game);
      if (e.type === pg.KEYDOWN && (e.key === pg.K_SPACE || e.key === pg.K_e)) this.cont();
    }
  }

  update(dt: number) {
    this.t += dt;
    this.particles.update(dt);
    if (this.t > 1.6) {
      this.coins_shown = Math.min(this.s["coins"], this.coins_shown + Math.max(1, this.s["coins"]) * dt * 1.2);
    }
    if (this.t > 2.2) {
      this.xp_shown = Math.min(this.s["end_xp"], this.xp_shown + Math.max(1, this.s["xp"]) * dt * 0.9);
    }
    for (let i = 0; i < 8; i++) {
      if (this.t > 0.3 + i * 0.25 && !this.played.has(i)) {
        this.played.add(i);
        this.game.audio.play("blip");
      }
    }
    if (this.t > 2.4 && !this.played.has("stars")) {
      this.played.add("stars");
      if (this.s["stars"] >= 4.5) {
        this.particles.burst("sparkle", 160, 80, 16, 50);
        this.game.audio.play("sparkle");
      }
    }
    if (this.s["rank_ups"].length && this.t > 3.2 && !this.played.has("rank")) {
      this.played.add("rank");
      this.game.audio.play("chime");
      this.particles.burst("sparkle", 160, 120, 20, 60);
    }
  }

  draw(s: Surface) {
    s.fill([250, 220, 200]);
    for (let y = 0; y < 180; y += 12) pg.draw.rect(s, [246, 210, 190], [0, y, 320, 6]);
    const r = new Rect(30, 6, 260, 150);
    ui.panel(s, r, ui.PAPER, ui.BORDER);
    font.draw(s, `DAY ${this.s["day"]} COMPLETE!`, [160, 12], ui.ACCENT, 2, null, "center");
    const rows: [string, string, pg.Color][] = [
      ["Animals treated", String(this.s["treated"]), ui.INK],
      ["Animals lost", String(this.s["lost"]), this.s["lost"] ? ui.BAD : ui.INK],
      ...(this.s["goal"] ? [["Day goal", `${this.s["treated"]}/${this.s["goal"]} ${this.s["won"] ? "MET!" : "MISSED"}`, this.s["won"] ? ui.GOOD : ui.BAD] as [string, string, pg.Color]] : []),
      ["Average score", `${Math.trunc(this.s["avg"])}%`, ui.INK],
      ["Tips", String(this.s["tips"]), [170, 120, 30]],
      ["Coins earned", String(Math.trunc(this.coins_shown)), [170, 120, 30]],
    ];
    let y = 30;
    rows.forEach(([a, b, c], i) => {
      if (this.t > 0.3 + i * 0.25) {
        font.draw(s, a.toUpperCase(), [44, y], ui.INK);
        font.draw(s, b, [276, y], c, 1, null, "right");
        pg.draw.rect(s, [230, 220, 214], [44, y + 7, 232, 1]);
      }
      y += 11;
    });
    if (this.t > 1.8) {
      font.draw(s, "STAR RATING", [44, y + 1], ui.INK);
      // (Python: a ui.stars call behind `if False`; never drawn)
      const n = Math.trunc(pg.pyround(this.s["stars"]));
      for (let i = 0; i < 5; i++) {
        const c = i < n ? [250, 200, 60] : [190, 180, 196];
        font.draw(s, font.STAR, [216 + i * 12, y - 2], c, 2);
      }
    }
    y += 16;
    if (this.t > 2.2) {
      const xp = Math.trunc(this.xp_shown);
      const [lo, hi] = gstate.rank_bounds(xp);
      font.draw(s, gstate.rank_name(xp).toUpperCase(), [44, y], ui.ACCENT);
      font.draw(s, `+${this.s["xp"]} XP`, [276, y], ui.GOOD, 1, null, "right");
      pg.draw.rect(s, ui.BORDER, [44, y + 8, 232, 6]);
      pg.draw.rect(s, [250, 210, 230], [45, y + 9, 230, 4]);
      pg.draw.rect(s, ui.ACCENT, [45, y + 9, Math.trunc((230 * (xp - lo)) / Math.max(1, hi - lo)), 4]);
    }
    y += 18;
    const extras: [string, pg.Color][] = [];
    for (const [nm, txt] of this.s["rank_ups"]) {
      extras.push(["RANK UP! " + nm.toUpperCase(), ui.GOLD]);
      if (txt) extras.push([txt, ui.INK]);
    }
    for (const u of this.s["unlocks"]) extras.push([u, [140, 90, 190]]);
    if (this.t > 3.0) {
      extras.slice(0, 4).forEach(([txt, col], i) => {
        font.draw(s, txt, [160, y + i * 8], col, 1, null, "center");
      });
      if (extras.length > 4) font.draw(s, `...and ${extras.length - 4} more!`, [160, y + 32], ui.MUTED, 1, null, "center");
    }
    this.particles.draw(s);
    if (this.t > 1.0) this.btn.draw(s, this.game.mpos);
  }
}
