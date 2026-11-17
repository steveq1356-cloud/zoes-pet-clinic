/* PAWSLEY PAW-PRIX: a top-down kart race Zoe plays on a friend's TV at game night.
 * Zoe + 1-3 friends, 3 laps, items, drifting, boost pads. All art is drawn in code;
 * the track is rendered once into a big cached Surface and the camera blits a window of it.
 */
import * as pg from "./pg";
import { Surface } from "./pg";
import * as data from "./data";
import * as font from "./font";
import * as sprites from "./sprites";
import * as ui from "./ui";
import * as gstate from "./state";
import { Scene } from "./engine";

type Col = number[];
export type KartResult = "win" | "lose" | "none";
type Done = ((result: KartResult, line: string) => void) | null;

// ====================================================================== tuning
const SW = 320, SH = 180;
const SP = 4; // centerline sample spacing (px)
const ROAD_R = 17; // half road width
const CURB_W = 3;
const LAPS = 3;
const TIME_CAP = 200; // seconds: race always ends
const AFTER_FINISH_WAIT = 7; // seconds to let others cross the line
const LAST_ONE_WAIT = 25; // seconds Zoe gets once every friend has finished
const MAX_SPD = 104;
const ACCEL = 92;
const BRAKE = 160;
const REVERSE_MAX = 32;
const TURN = 2.75;
const GRIP = 11;
const DRIFT_GRIP = 2.4;
const KART_R = 4.5;

const T_GRASS = 0, T_CURB = 1, T_ROAD = 2, T_SOLID = 3, T_WATER = 4;

const KART_SKILL: Record<string, number> = {
  stephen: 0.6, danny: 0.55, andrew: 0.4, jayden: 0.68, shteynie: 0.5, renee: 0.45, tish: 0.58, greg: 0.5,
};

/** Zoe won: the best-placed friend says this. */
const KART_WIN_LINES: Record<string, string> = {
  stephen: "Hold on, was my controller even plugged in? ...Okay, great race, Zoe.",
  danny: "Smooth lines, Zoe. You drive like you've done this before.",
  andrew: "You drifted past me like I was parked! Rematch. Later. After snacks.",
  jayden: "Okay, Doc! Steady hands on the wheel too. Respect.",
  shteynie: "Hmph. My kart had a wobbly wheel. That's my story.",
  renee: "Woo! Zoe, you're a natural! Do the victory honk!",
  tish: "Fine, you win. But my kart looked cooler.",
  greg: "Turbo Pepper to the face. Never betting against you again.",
};
/** Zoe didn't win: the winning friend (or the friend just ahead) says this. */
const KART_LOSE_LINES: Record<string, string> = {
  stephen: "I'd like to thank my thumbs. And the Pillow Bomb.",
  danny: "Good race, Zoe. You were right on my bumper.",
  andrew: "I WON? Somebody screenshot this! Nobody'll believe me!",
  jayden: "Checkered flag, baby! Next race you'll get me, Doc.",
  shteynie: "As expected. The slime puddle was a strategic masterpiece.",
  renee: "Sorry Zoe! I just held the gas and prayed!",
  tish: "Too fast, too fabulous. Better luck next lap, babe.",
  greg: "Close one! One more lap and you'd have had me.",
};

// ====================================================================== helpers
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function cap(name: string): string {
  const n = String(name || "friend");
  return n.charAt(0).toUpperCase() + n.slice(1);
}
function ang_diff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function shade(c: Col, d: number): Col {
  return [clamp(Math.round(c[0] + d), 0, 255), clamp(Math.round(c[1] + d), 0, 255), clamp(Math.round(c[2] + d), 0, 255)];
}
function mix(a: Col, b: Col, k: number): Col {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k));
}
function hash2(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function ordinal(n: number): string {
  return n === 1 ? "1ST" : n === 2 ? "2ND" : n === 3 ? "3RD" : `${n}TH`;
}
function fmt_time(t: number): string {
  if (!isFinite(t) || t < 0) return "--:--";
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}
function dim(s: Surface, a = 120) {
  const v = sprites.cached("kart_dim|" + a, () => {
    const d = new Surface([SW, SH], pg.SRCALPHA);
    d.fill([20, 14, 30, a]);
    return d;
  });
  s.blit(v, [0, 0]);
}

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
function look_of(name: string): any {
  if (has_person(name)) return data.PEOPLE[name];
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GUEST_LOOKS[h % GUEST_LOOKS.length];
}
function friend_portrait(name: string): Surface | null {
  try {
    return has_person(name) ? sprites.npc_portrait(name) : sprites.portrait(["kart_guest", name], look_of(name));
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
function zoe_look(st: any): any {
  try {
    return sprites.zoe_spec(st.hair, st.outfit);
  } catch (_e) {
    return { skin: [255, 214, 186], hair: [250, 214, 110], shirt: [240, 150, 180] };
  }
}
function draw_portrait(s: Surface, p: Surface | null, x: number, y: number, fill: Col) {
  ui.panel(s, [x, y, 32, 36], fill, ui.BORDER, false);
  if (p) s.blit(p, [x + 4, y + 4]);
  else font.draw(s, "?", [x + 16, y + 12], ui.MUTED, 2, null, "center");
}

// ====================================================================== tracks
interface TrackDef {
  id: string;
  name: string;
  theme: "hill" | "clinic";
  w: number;
  h: number;
  pts: number[][];
  boosts: number[]; // fractions of the lap
  boxes: number[];
  ponds?: number[][]; // [x, y, r]
  blocks?: any[][]; // [x, y, w, h, kind]
}

const TRACKS: TrackDef[] = [
  {
    id: "hill", name: "HILLSIDE LOOP", theme: "hill", w: 900, h: 650,
    pts: [[300, 568], [420, 572], [600, 545], [705, 470], [765, 360], [800, 240], [745, 130], [625, 108],
      [545, 190], [470, 290], [380, 285], [320, 175], [230, 100], [120, 140], [88, 280], [108, 440], [180, 560]],
    boosts: [0.07, 0.47, 0.83],
    boxes: [0.2, 0.62],
    ponds: [[575, 395, 48], [260, 400, 30]],
  },
  {
    id: "clinic", name: "CLINIC CIRCUIT", theme: "clinic", w: 900, h: 650,
    pts: [[330, 575], [480, 578], [620, 560], [700, 500], [722, 400], [782, 320], [802, 200], [742, 108],
      [600, 88], [470, 108], [430, 200], [330, 250], [222, 210], [172, 110], [92, 150], [80, 320], [100, 470], [160, 572]],
    boosts: [0.08, 0.43, 0.88],
    boxes: [0.24, 0.66],
    blocks: [[345, 385, 170, 86, "clinic"], [595, 245, 92, 62, "house"], [222, 330, 72, 52, "house"],
      [560, 140, 0, 0, "none"], [20, 14, 120, 40, "house"], [300, 10, 140, 38, "shop"], [840, 400, 50, 120, "house"],
      [250, 615, 120, 30, "shop"], [560, 612, 140, 30, "house"]],
  },
];

interface Track {
  def: TrackDef;
  w: number;
  h: number;
  N: number;
  px: Float32Array;
  py: Float32Array;
  tx: Float32Array;
  ty: Float32Array;
  type: Uint8Array;
  surf: Surface;
  mini: Surface;
  mscale: number;
  mox: number;
  moy: number;
  pads: { x: number; y: number; a: number }[];
  box_spots: { x: number; y: number }[];
  length: number;
}

const _tracks = new Map<string, Track>();

function spline_closed(pts: number[][], per = 24): number[][] {
  const out: number[][] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

function build_track(def: TrackDef): Track {
  const dense = spline_closed(def.pts);
  dense.push(dense[0]);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const L = cum[cum.length - 1];
  const N = Math.max(40, Math.round(L / SP));
  const step = L / N;
  const px = new Float32Array(N), py = new Float32Array(N), tx = new Float32Array(N), ty = new Float32Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const d = i * step;
    while (j < cum.length - 2 && cum[j + 1] < d) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const k = (d - cum[j]) / seg;
    px[i] = dense[j][0] + (dense[j + 1][0] - dense[j][0]) * k;
    py[i] = dense[j][1] + (dense[j + 1][1] - dense[j][1]) * k;
  }
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    const dx = px[b] - px[a], dy = py[b] - py[a];
    const l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l;
    ty[i] = dy / l;
  }
  const W = def.w, H = def.h;
  const type = new Uint8Array(W * H);
  const stripe = new Uint8Array(W * H);
  const stamp = (cx: number, cy: number, r: number, fn: (idx: number) => void) => {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        if (dx * dx + dy * dy <= r2) fn(y * W + x);
      }
    }
  };
  // ponds (water) under everything
  for (const p of def.ponds || []) stamp(p[0], p[1], p[2], (i) => (type[i] = T_WATER));
  // curbs then road
  for (let i = 0; i < N; i++) {
    const sv = (i >> 1) & 1;
    stamp(px[i], py[i], ROAD_R + CURB_W, (k) => {
      if (type[k] !== T_ROAD) {
        type[k] = T_CURB;
        stripe[k] = sv;
      }
    });
  }
  for (let i = 0; i < N; i++) stamp(px[i], py[i], ROAD_R, (k) => (type[k] = T_ROAD));
  // world border hedge
  const BORDER = 6;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x < BORDER || y < BORDER || x >= W - BORDER || y >= H - BORDER) type[y * W + x] = T_SOLID;
    }
  }

  const min_dist = (x: number, y: number): number => {
    let best = 1e9;
    for (let i = 0; i < N; i += 2) {
      const d = (px[i] - x) * (px[i] - x) + (py[i] - y) * (py[i] - y);
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
  const rect_dist = (x: number, y: number, w: number, h: number): number => {
    let best = 1e9;
    for (let i = 0; i < N; i += 2) {
      const cx = clamp(px[i], x, x + w), cy = clamp(py[i], y, y + h);
      const d = Math.hypot(px[i] - cx, py[i] - cy);
      if (d < best) best = d;
    }
    return best;
  };
  const CLEAR = ROAD_R + CURB_W + 5;

  // ---------------------------------------------------------------- base pixels
  const surf = new Surface([W, H]);
  const D = surf.data;
  const hill = def.theme === "hill";
  const grassA: Col = hill ? [106, 178, 92] : [118, 186, 104];
  const grassB: Col = hill ? [94, 164, 84] : [104, 172, 94];
  const roadC: Col = hill ? [104, 98, 108] : [94, 96, 112];
  const curbA: Col = hill ? [222, 76, 72] : [238, 120, 160];
  const curbB: Col = [246, 242, 236];
  const water: Col = [86, 150, 214];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, o = i * 4;
      const t = type[i];
      const n = hash2(x, y);
      let c: Col;
      if (t === T_ROAD) {
        const sp = n < 0.08 ? -10 : n > 0.94 ? 8 : 0;
        c = shade(roadC, sp + ((hash2(x >> 2, y >> 2) * 6) | 0) - 3);
      } else if (t === T_CURB) {
        c = stripe[i] ? curbA : curbB;
      } else if (t === T_WATER) {
        const wv = Math.sin(x * 0.21 + Math.sin(y * 0.13) * 2.2 + y * 0.05);
        c = wv > 0.92 ? [180, 220, 250] : shade(water, wv * 6);
      } else {
        let base: Col;
        if (hill) {
          const wv = Math.sin(x * 0.045 + Math.sin(y * 0.03) * 2) + Math.sin(y * 0.05 + x * 0.012);
          base = wv > 0.4 ? grassA : grassB;
          base = shade(base, wv * 4);
        } else {
          base = (((x + y) >> 4) & 1) ? grassA : grassB;
        }
        const sp = n < 0.05 ? -14 : n > 0.97 ? 14 : (n * 6) | 0;
        c = shade(base, sp);
      }
      D[o] = c[0];
      D[o + 1] = c[1];
      D[o + 2] = c[2];
      D[o + 3] = 255;
    }
  }
  // thin white line on the road edge, just inside the curb
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (type[i] !== T_ROAD) continue;
      if (type[i - 1] === T_CURB || type[i + 1] === T_CURB || type[i - W] === T_CURB || type[i + W] === T_CURB) {
        const o = i * 4;
        D[o] = 214; D[o + 1] = 212; D[o + 2] = 214;
      }
    }
  }
  const put = (x: number, y: number, c: Col) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
    const o = (yi * W + xi) * 4;
    D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2];
  };
  // pond rims
  for (const p of def.ponds || []) {
    pg.draw.circle(surf, [72, 128, 196], [p[0], p[1]], p[2], 2);
    pg.draw.circle(surf, [214, 200, 150], [p[0], p[1]], p[2] + 3, 3);
    // lily pads
    const rr = sprites._rng("pond" + p[0]);
    for (let k = 0; k < 5; k++) {
      const a = rr.uniform(0, Math.PI * 2), d = rr.uniform(0, p[2] - 10);
      const lx = p[0] + Math.cos(a) * d, ly = p[1] + Math.sin(a) * d;
      pg.draw.circle(surf, [70, 150, 80], [lx, ly], 4);
      put(lx + 1, ly - 1, [250, 190, 210]);
    }
  }

  // ---------------------------------------------------------------- start line + grid
  {
    const nx = -ty[0], ny = tx[0];
    for (let u = 0; u < 6; u += 0.5) {
      for (let v = -ROAD_R; v <= ROAD_R; v += 0.5) {
        const chk = ((Math.floor(u / 3) + Math.floor((v + ROAD_R) / 3)) & 1) === 0;
        put(px[0] + tx[0] * (u - 3) + nx * v, py[0] + ty[0] * (u - 3) + ny * v, chk ? [250, 250, 250] : [36, 32, 44]);
      }
    }
    for (let g = 0; g < 4; g++) {
      const si = (N - 5 - g * 4) % N;
      const lane = g % 2 === 0 ? -8 : 8;
      const gx = px[si] + -ty[si] * lane + tx[si] * 6, gy = py[si] + tx[si] * lane + ty[si] * 6;
      for (let v = -5; v <= 5; v += 0.5) put(gx + -ty[si] * v, gy + tx[si] * v, [230, 230, 236]);
    }
  }
  // ---------------------------------------------------------------- boost pads
  const pads: Track["pads"] = [];
  for (const f of def.boosts) {
    const si = Math.floor(f * N) % N;
    const a = Math.atan2(ty[si], tx[si]);
    pads.push({ x: px[si], y: py[si], a });
    const nx = -ty[si], ny = tx[si];
    for (let u = -8; u <= 8; u += 0.5) {
      for (let v = -7; v <= 7; v += 0.5) {
        const edge = Math.abs(u) > 7.2 || Math.abs(v) > 6.2;
        const ch = ((u - Math.abs(v) * 0.9 + 100) % 5) < 2.4;
        const c = edge ? [120, 60, 40] : ch ? [255, 226, 90] : [246, 130, 50];
        put(px[si] + tx[si] * u + nx * v, py[si] + ty[si] * u + ny * v, c);
      }
    }
  }
  // ---------------------------------------------------------------- item box spots
  const box_spots: Track["box_spots"] = [];
  for (const f of def.boxes) {
    const si = Math.floor(f * N) % N;
    for (const lane of [-10, 0, 10]) box_spots.push({ x: px[si] - ty[si] * lane, y: py[si] + tx[si] * lane });
  }

  // ---------------------------------------------------------------- decorations
  const rng = sprites._rng("kart_track_" + def.id);
  const solid_circle = (x: number, y: number, r: number) => stamp(x, y, r, (k) => {
    if (type[k] === T_GRASS || type[k] === T_WATER) type[k] = T_SOLID;
  });
  const tree = (x: number, y: number, big: boolean) => {
    const r = big ? 9 : 7;
    pg.draw.ellipse(surf, [60, 110, 60], [x - r + 2, y - 2, r * 2, r + 4]);
    pg.draw.rect(surf, [110, 76, 50], [x - 1, y - 1, 3, 5]);
    pg.draw.circle(surf, [40, 96, 56], [x, y - 4], r + 1);
    pg.draw.circle(surf, [62, 136, 70], [x, y - 4], r);
    pg.draw.circle(surf, [92, 168, 88], [x - 2, y - 6], r - 3);
    put(x - 3, y - 8, [150, 210, 130]);
    if (hash2(x, y) < 0.3) { put(x + 2, y - 2, [230, 80, 80]); put(x - 4, y - 3, [230, 80, 80]); }
    solid_circle(x, y, 4);
  };
  const bush = (x: number, y: number) => {
    pg.draw.circle(surf, [50, 110, 60], [x, y], 5);
    pg.draw.circle(surf, [80, 150, 80], [x - 1, y - 1], 4);
    put(x - 2, y - 2, [130, 196, 120]);
  };
  const flowers = (x: number, y: number) => {
    const cols: Col[] = [[250, 240, 120], [250, 160, 190], [240, 240, 250], [190, 150, 240]];
    for (let k = 0; k < 6; k++) {
      const fx = x + rng.randint(-6, 6), fy = y + rng.randint(-4, 4);
      put(fx, fy + 1, [60, 120, 60]);
      put(fx, fy, cols[rng.randint(0, 3)]);
    }
  };
  const rock = (x: number, y: number) => {
    pg.draw.ellipse(surf, [96, 92, 100], [x - 5, y - 3, 10, 7]);
    pg.draw.ellipse(surf, [150, 146, 156], [x - 4, y - 4, 8, 5]);
    put(x - 2, y - 3, [196, 192, 200]);
    solid_circle(x, y, 4);
  };
  const lamp = (x: number, y: number) => {
    pg.draw.circle(surf, [70, 80, 96], [x, y], 2);
    pg.draw.circle(surf, [255, 240, 180], [x, y - 1], 1);
    solid_circle(x, y, 2);
  };
  const building = (x: number, y: number, w: number, h: number, kind: string) => {
    const roofs: Record<string, Col> = { clinic: [240, 150, 170], house: [200, 110, 90], shop: [110, 150, 200] };
    const roof = roofs[kind] || [180, 130, 100];
    pg.draw.rect(surf, [60, 70, 60], [x + 3, y + 4, w, h]); // shadow
    pg.draw.rect(surf, [52, 38, 64], [x - 1, y - 1, w + 2, h + 2]);
    pg.draw.rect(surf, roof, [x, y, w, h]);
    for (let yy = y + 3; yy < y + h; yy += 4) pg.draw.line(surf, shade(roof, -18), [x, yy], [x + w - 1, yy]);
    pg.draw.rect(surf, shade(roof, 30), [x, y, w, 2]);
    if (kind === "clinic") {
      // big paw-print sign on the roof
      const cx = x + w / 2, cy = y + h / 2 + 2;
      pg.draw.circle(surf, [255, 248, 236], [cx, cy], 16);
      pg.draw.circle(surf, [96, 74, 120], [cx, cy], 16, 1);
      pg.draw.ellipse(surf, [96, 74, 120], [cx - 7, cy - 2, 14, 10]);
      for (const [ox, oy] of [[-8, -6], [-3, -10], [3, -10], [8, -6]]) pg.draw.circle(surf, [96, 74, 120], [cx + ox, cy + oy], 3);
      // parking lot stripes
      for (let k = 0; k < 6; k++) pg.draw.rect(surf, [240, 240, 240], [x + 8 + k * 14, y + h + 6, 1, 8]);
    } else {
      pg.draw.rect(surf, [250, 240, 200], [x + 4, y + 4, 5, 4]);
      if (w > 30) pg.draw.rect(surf, [250, 240, 200], [x + w - 9, y + 4, 5, 4]);
    }
    for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) {
        const k = yy * W + xx;
        if (type[k] === T_GRASS || type[k] === T_WATER) type[k] = T_SOLID;
      }
    }
  };
  if (!hill) {
    for (const b of def.blocks || []) {
      const [bx, by, bw, bh, kind] = b;
      if (bw <= 0 || kind === "none") continue;
      if (rect_dist(bx, by, bw, bh) < CLEAR + 4) continue;
      building(bx, by, bw, bh, kind);
    }
  }
  // scatter: try many spots, keep the clear ones
  let placed = 0;
  for (let k = 0; k < 900 && placed < (hill ? 150 : 90); k++) {
    const x = rng.randint(14, W - 14), y = rng.randint(16, H - 12);
    const ti = type[y * W + x];
    if (ti !== T_GRASS) continue;
    const g = (dx: number, dy: number) => type[clamp(y + dy, 0, H - 1) * W + clamp(x + dx, 0, W - 1)] === T_GRASS;
    if (!(g(-10, -12) && g(10, -12) && g(-10, 8) && g(10, 8))) continue;
    const md = min_dist(x, y);
    const roll = rng.random();
    if (hill) {
      if (roll < 0.45 && md > CLEAR + 10) { tree(x, y, rng.random() < 0.4); placed++; }
      else if (roll < 0.65 && md > CLEAR + 4) { bush(x, y); placed++; }
      else if (roll < 0.9 && md > CLEAR) { flowers(x, y); placed++; }
      else if (md > CLEAR + 8) { rock(x, y); placed++; }
    } else {
      if (roll < 0.3 && md > CLEAR + 10) { tree(x, y, false); placed++; }
      else if (roll < 0.55 && md > CLEAR + 1) { flowers(x, y); placed++; }
      else if (roll < 0.75 && md > CLEAR + 3) { bush(x, y); placed++; }
    }
  }
  if (!hill) {
    // lamp posts along the outside of the road
    for (let i = 0; i < N; i += 28) {
      for (const side of [-1, 1]) {
        const lx = px[i] - ty[i] * side * (ROAD_R + 10), ly = py[i] + tx[i] * side * (ROAD_R + 10);
        if (lx < 10 || ly < 10 || lx > W - 10 || ly > H - 10) continue;
        if (min_dist(lx, ly) < ROAD_R + 8) continue;
        const ti = type[Math.round(ly) * W + Math.round(lx)];
        if (ti === T_GRASS) lamp(lx, ly);
      }
    }
  }
  // hedge border
  pg.draw.rect(surf, [44, 100, 56], [0, 0, W, BORDER]);
  pg.draw.rect(surf, [44, 100, 56], [0, H - BORDER, W, BORDER]);
  pg.draw.rect(surf, [44, 100, 56], [0, 0, BORDER, H]);
  pg.draw.rect(surf, [44, 100, 56], [W - BORDER, 0, BORDER, H]);
  for (let x = 0; x < W; x += 4) {
    pg.draw.circle(surf, [62, 128, 66], [x + 2, BORDER - 1], 3);
    pg.draw.circle(surf, [62, 128, 66], [x + 2, H - BORDER], 3);
  }
  for (let y = 0; y < H; y += 4) {
    pg.draw.circle(surf, [62, 128, 66], [BORDER - 1, y + 2], 3);
    pg.draw.circle(surf, [62, 128, 66], [W - BORDER, y + 2], 3);
  }

  // ---------------------------------------------------------------- minimap
  const MW = 64, MH = 46;
  const mscale = Math.min((MW - 6) / W, (MH - 6) / H);
  const mox = (MW - W * mscale) / 2, moy = (MH - H * mscale) / 2;
  const mini = new Surface([MW, MH], pg.SRCALPHA);
  mini.fill([30, 24, 44, 170]);
  pg.draw.rect(mini, [96, 74, 120, 255], [0, 0, MW, MH], 1);
  const mp: number[][] = [];
  for (let i = 0; i < N; i += 3) mp.push([mox + px[i] * mscale, moy + py[i] * mscale]);
  pg.draw.lines(mini, [20, 16, 28, 255], true, mp, 3);
  pg.draw.lines(mini, [220, 214, 230, 255], true, mp, 1);
  const s0x = mox + px[0] * mscale, s0y = moy + py[0] * mscale;
  pg.draw.rect(mini, [255, 230, 120, 255], [Math.round(s0x) - 1, Math.round(s0y) - 1, 3, 3]);

  return { def, w: W, h: H, N, px, py, tx, ty, type, surf, mini, mscale, mox, moy, pads, box_spots, length: L };
}

function get_track(id: string): Track {
  let t = _tracks.get(id);
  if (!t) {
    const def = TRACKS.find((d) => d.id === id) || TRACKS[0];
    t = build_track(def);
    _tracks.set(def.id, t);
  }
  return t;
}

// ====================================================================== kart art
const ANGLES = 32;

function make_kart_frames(body: Col, skin: Col, hair: Col): Surface[] {
  // base drawing facing +x on a 16x16 grid, centred at (8,8)
  const B = 16;
  const base = new Surface([B, B], pg.SRCALPHA);
  const tire: Col = [40, 36, 46];
  const dark = shade(body, -60), light = shade(body, 50);
  pg.draw.rect(base, tire, [3, 2, 3, 2]);
  pg.draw.rect(base, tire, [3, 12, 3, 2]);
  pg.draw.rect(base, tire, [10, 2, 3, 2]);
  pg.draw.rect(base, tire, [10, 12, 3, 2]);
  pg.draw.rect(base, dark, [2, 4, 12, 8]);
  pg.draw.rect(base, body, [3, 5, 10, 6]);
  pg.draw.rect(base, light, [11, 7, 3, 2]); // nose stripe
  pg.draw.rect(base, dark, [14, 6, 1, 4]); // front bumper
  pg.draw.rect(base, [60, 54, 70], [1, 6, 1, 4]); // rear bumper
  pg.draw.rect(base, shade(body, -30), [4, 6, 2, 4]); // seat back
  // driver's head seen from above: hair dome, face toward the front
  for (let y = 0; y < B; y++) {
    for (let x = 0; x < B; x++) {
      const dx = x + 0.5 - 7.5, dy = y + 0.5 - 8;
      if (dx * dx + dy * dy <= 6.6) base.set_at([x, y], dx > 0.9 ? skin : hair);
    }
  }
  const frames: Surface[] = [];
  const O = 18;
  for (let f = 0; f < ANGLES; f++) {
    const a = (f / ANGLES) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const out = new Surface([O, O], pg.SRCALPHA);
    const S = base.data, Dd = out.data;
    for (let y = 0; y < O; y++) {
      for (let x = 0; x < O; x++) {
        const dx = x + 0.5 - O / 2, dy = y + 0.5 - O / 2;
        const sx = Math.floor(ca * dx + sa * dy + B / 2), sy = Math.floor(-sa * dx + ca * dy + B / 2);
        if (sx < 0 || sy < 0 || sx >= B || sy >= B) continue;
        const si = (sy * B + sx) * 4, di = (y * O + x) * 4;
        if (S[si + 3] === 0) continue;
        Dd[di] = S[si]; Dd[di + 1] = S[si + 1]; Dd[di + 2] = S[si + 2]; Dd[di + 3] = 255;
      }
    }
    frames.push(sprites.outline(out, [36, 26, 46]));
  }
  return frames;
}

function kart_shadow(): Surface {
  return sprites.cached("kart_shadow", () => {
    const s = new Surface([14, 10], pg.SRCALPHA);
    pg.draw.ellipse(s, [20, 30, 20, 80], [0, 0, 14, 10]);
    return s;
  });
}

function item_icon(kind: string): Surface {
  return sprites.cached("kart_item|" + kind, () => {
    const s = new Surface([14, 14], pg.SRCALPHA);
    if (kind === "pepper") {
      pg.draw.ellipse(s, [150, 30, 30], [2, 4, 10, 8]);
      pg.draw.ellipse(s, [226, 52, 40], [3, 4, 8, 7]);
      pg.draw.polygon(s, [226, 52, 40], [[10, 6], [13, 11], [9, 10]]);
      pg.draw.rect(s, [255, 160, 140], [4, 5, 2, 1]);
      pg.draw.rect(s, [70, 150, 60], [5, 1, 2, 4]);
      pg.draw.rect(s, [70, 150, 60], [3, 2, 6, 2]);
    } else if (kind === "slime") {
      pg.draw.ellipse(s, [40, 120, 50], [1, 5, 12, 8]);
      pg.draw.ellipse(s, [110, 210, 90], [2, 5, 10, 6]);
      pg.draw.circle(s, [110, 210, 90], [7, 5], 3);
      pg.draw.rect(s, [220, 255, 200], [5, 4, 2, 2]);
      pg.draw.rect(s, [40, 120, 50], [8, 7, 1, 1]);
      pg.draw.rect(s, [40, 120, 50], [5, 8, 1, 1]);
    } else if (kind === "pillow") {
      pg.draw.rect(s, [150, 150, 190], [1, 3, 12, 9]);
      pg.draw.rect(s, [250, 248, 255], [2, 3, 10, 8]);
      pg.draw.rect(s, [200, 200, 236], [2, 9, 10, 2]);
      for (const [x, y] of [[1, 2], [12, 2], [1, 11], [12, 11]]) pg.draw.rect(s, [250, 248, 255], [x, y, 1, 1]);
      pg.draw.line(s, [240, 130, 160], [4, 6], [9, 6]);
      pg.draw.line(s, [240, 130, 160], [6, 4], [7, 8]);
    } else if (kind === "shield") {
      pg.draw.circle(s, [120, 200, 240], [7, 7], 6);
      pg.draw.circle(s, [200, 240, 255], [7, 7], 5);
      pg.draw.circle(s, [150, 220, 250], [7, 7], 4);
      pg.draw.rect(s, [255, 255, 255], [4, 4, 2, 2]);
    }
    return s;
  });
}
const ITEM_NAMES: Record<string, string> = {
  pepper: "TURBO PEPPER", slime: "SLIME PUDDLE", pillow: "PILLOW BOMB", shield: "BUBBLE SHIELD",
};
const ITEM_KINDS = ["pepper", "slime", "pillow", "shield"];

function item_box_frame(f: number): Surface {
  return sprites.cached("kart_box|" + f, () => {
    const s = new Surface([12, 12], pg.SRCALPHA);
    const cols: Col[] = [[250, 160, 200], [200, 170, 250], [140, 210, 240], [160, 230, 180]];
    const c = cols[f % 4];
    pg.draw.rect(s, [70, 50, 100], [0, 0, 12, 12]);
    pg.draw.rect(s, c, [1, 1, 10, 10]);
    pg.draw.rect(s, shade(c, 30), [1, 1, 10, 3]);
    pg.draw.rect(s, shade(c, -30), [1, 9, 10, 2]);
    // paw print
    const W: Col = [255, 255, 255];
    pg.draw.rect(s, W, [4, 6, 4, 3]);
    pg.draw.rect(s, W, [3, 4, 1, 2]);
    pg.draw.rect(s, W, [5, 3, 1, 2]);
    pg.draw.rect(s, W, [7, 3, 1, 2]);
    pg.draw.rect(s, W, [9, 4, 1, 2]);
    return s;
  });
}

function slime_surf(): Surface {
  return sprites.cached("kart_slime", () => {
    const s = new Surface([14, 10], pg.SRCALPHA);
    pg.draw.ellipse(s, [40, 120, 50], [0, 1, 14, 9]);
    pg.draw.ellipse(s, [100, 200, 80], [1, 1, 12, 7]);
    pg.draw.circle(s, [100, 200, 80], [3, 2], 2);
    pg.draw.circle(s, [100, 200, 80], [11, 3], 2);
    pg.draw.rect(s, [210, 250, 190], [4, 3, 3, 1]);
    pg.draw.rect(s, [210, 250, 190], [9, 5, 1, 1]);
    return s;
  });
}

function shield_surf(): Surface {
  return sprites.cached("kart_bubble", () => {
    const s = new Surface([22, 22], pg.SRCALPHA);
    pg.draw.circle(s, [160, 220, 255, 70], [11, 11], 10);
    pg.draw.circle(s, [200, 240, 255, 200], [11, 11], 10, 1);
    pg.draw.rect(s, [255, 255, 255, 230], [6, 5, 2, 2]);
    return s;
  });
}

// ====================================================================== racers
interface Kart {
  id: string;
  name: string;
  is_zoe: boolean;
  skill: number;
  col: Col;
  frames: Surface[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  fwd: number;
  drift: number;
  drift_t: number;
  boost_t: number;
  spin_t: number;
  spin_a: number;
  shield_t: number;
  hop: number;
  item: string | null;
  roll_t: number;
  seg: number;
  lap: number;
  best_lap: number;
  finished: boolean;
  finish_time: number;
  finish_order: number;
  lane: number;
  lane_target: number;
  lane_t: number;
  ai_item_t: number;
  stuck_t: number;
  reverse_t: number;
  terrain: number;
  wrong_t: number;
  bump_t: number;
  spd_mult: number;
}

interface Particle { x: number; y: number; vx: number; vy: number; t: number; life: number; col: Col; size: number; }
interface Puddle { x: number; y: number; t: number; owner: Kart; }
interface Pillow { x: number; y: number; vx: number; vy: number; t: number; owner: Kart; target: Kart | null; }
interface Box { x: number; y: number; t: number; }

// ====================================================================== the scene
export class KartGame extends Scene {
  overlay = true;

  constructor(game: any, players: string[], on_done: Done = null) {
    super(game);
    this.on_done = on_done;
    const seen = new Set<string>();
    const friends: string[] = [];
    for (const p of Array.isArray(players) ? players : []) {
      const n = String(p || "").toLowerCase();
      if (!n || n === "zoe" || seen.has(n)) continue;
      seen.add(n);
      friends.push(n);
      if (friends.length >= 3) break;
    }
    if (!friends.length) friends.push("danny");
    this.friends = friends;
    this.track_i = 0;
    this.phase = "intro"; // intro | count | race | finish | results
    this.t = 0;
    this.phase_t = 0;
    this.race_t = 0;
    this.closed = false;
    this.outcome = "none" as KartResult;
    this.speaker = "";
    this.line = "";
    this.prize = 0;
    this.rewarded = false;
    this.autopilot = false;
    this.banner = "";
    this.banner_t = 0;
    this.banner_col = [255, 230, 140];
    this.cam = [0, 0];
    this.karts = [] as Kart[];
    this.parts = [] as Particle[];
    this.puddles = [] as Puddle[];
    this.pillows = [] as Pillow[];
    this.boxes = [] as Box[];
    this.finish_count = 0;
    this.zoe_finish_t = -1;
    this.go_snd = -1;
    this.start_btn = new ui.Button([94, 150, 64, 14], "Let's go!", () => this.begin(), true, null, [250, 220, 140], pg.K_RETURN);
    this.nah_btn = new ui.Button([162, 150, 64, 14], "Nah", () => this.close("none"), true, null, null, pg.K_ESCAPE);
    this.prev_btn = new ui.Button([70, 106, 14, 14], "<", () => this.pick_track(-1), true, null, null, pg.K_LEFT, true);
    this.next_btn = new ui.Button([236, 106, 14, 14], ">", () => this.pick_track(1), true, null, null, pg.K_RIGHT, true);
    this.ok_btn = new ui.Button([128, 156, 64, 14], "Done", () => this.close(this.outcome), true, null, null, pg.K_RETURN);
  }

  get track(): Track {
    return get_track(TRACKS[this.track_i].id);
  }

  pick_track(d: number) {
    this.track_i = (this.track_i + d + TRACKS.length) % TRACKS.length;
  }

  // ------------------------------------------------------------ setup
  begin() {
    try {
      this.setup_race();
    } catch (e) {
      console.warn("kart setup failed", e);
      this.close("none");
      return;
    }
    this.overlay = false;
    this.phase = "count";
    this.phase_t = 0;
    this.game.audio.play("whoosh", 0.5);
  }

  setup_race() {
    const tr = this.track;
    const st = this.game.state || {};
    const roster: { id: string; zoe: boolean }[] = this.friends.map((f: string) => ({ id: f, zoe: false }));
    roster.push({ id: "zoe", zoe: true }); // Zoe starts at the back of the grid
    this.karts = roster.map((r, gi) => {
      let col: Col, skin: Col, hair: Col;
      if (r.zoe) {
        const lk = zoe_look(st);
        col = lk.shirt || [240, 150, 180];
        skin = lk.skin || [255, 214, 186];
        hair = lk.hair || [250, 214, 110];
      } else {
        const lk = look_of(r.id);
        col = lk.shirt || [200, 120, 120];
        skin = lk.skin || [240, 200, 170];
        hair = lk.style === "cap" && lk.cap ? lk.cap : lk.hair || [80, 60, 40];
      }
      const key = `kart_frames|${r.id}|${col.join(",")}|${hair.join(",")}`;
      const frames: Surface[] = sprites.cached(key, () => make_kart_frames(col, skin, hair));
      const si = ((tr.N - 5 - gi * 4) % tr.N + tr.N) % tr.N;
      const lane = gi % 2 === 0 ? -8 : 8;
      const k: Kart = {
        id: r.id, name: r.zoe ? "Zoe" : cap(r.id), is_zoe: r.zoe,
        skill: r.zoe ? 0.7 : clamp(KART_SKILL[r.id] ?? 0.5, 0, 1),
        col, frames,
        x: tr.px[si] - tr.ty[si] * lane, y: tr.py[si] + tr.tx[si] * lane, vx: 0, vy: 0,
        a: Math.atan2(tr.ty[si], tr.tx[si]), fwd: 0,
        drift: 0, drift_t: 0, boost_t: 0, spin_t: 0, spin_a: 0, shield_t: 0, hop: 0,
        item: null, roll_t: 0, seg: si, lap: -1, best_lap: 0,
        finished: false, finish_time: 0, finish_order: 0,
        lane: lane * 0.6, lane_target: lane * 0.6, lane_t: 0, ai_item_t: 0, stuck_t: 0, reverse_t: 0,
        terrain: T_ROAD, wrong_t: 0, bump_t: 0, spd_mult: 1,
      };
      return k;
    });
    this.zoe = this.karts.find((k: Kart) => k.is_zoe);
    this.boxes = tr.box_spots.map((b) => ({ x: b.x, y: b.y, t: 0 }));
    this.parts = [];
    this.puddles = [];
    this.pillows = [];
    this.finish_count = 0;
    this.race_t = 0;
    this.lap_start = 0;
    this.zoe_lap = -1;
    this.last_out_t = -1;
    this.cam = [this.zoe.x - SW / 2, this.zoe.y - SH / 2];
    this.clamp_cam();
  }

  clamp_cam() {
    const tr = this.track;
    this.cam[0] = clamp(this.cam[0], 0, tr.w - SW);
    this.cam[1] = clamp(this.cam[1], 0, tr.h - SH);
  }

  // ------------------------------------------------------------ helpers
  terrain_at(x: number, y: number): number {
    const tr = this.track;
    const xi = Math.floor(x), yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= tr.w || yi >= tr.h) return T_SOLID;
    return tr.type[yi * tr.w + xi];
  }

  progress(k: Kart): number {
    return k.lap * this.track.N + k.seg;
  }

  standings(): Kart[] {
    const ks = (this.karts as Kart[]).slice();
    ks.sort((a, b) => {
      if (a.finished && b.finished) return a.finish_order - b.finish_order;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return this.progress(b) - this.progress(a);
    });
    return ks;
  }

  place_of(k: Kart): number {
    return this.standings().indexOf(k) + 1;
  }

  set_banner(text: string, col: Col = [255, 230, 140], t = 1.4) {
    this.banner = text;
    this.banner_col = col;
    this.banner_t = t;
  }

  puff(x: number, y: number, col: Col, n = 4, spd = 30, life = 0.5, size = 1) {
    if (this.parts.length > 260) return;
    for (let i = 0; i < n; i++) {
      const a = pg.random.uniform(0, Math.PI * 2), v = pg.random.uniform(spd * 0.3, spd);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: life * pg.random.uniform(0.6, 1.2), col, size });
    }
  }

  near_view(x: number, y: number, pad = 20): boolean {
    return x > this.cam[0] - pad && x < this.cam[0] + SW + pad && y > this.cam[1] - pad && y < this.cam[1] + SH + pad;
  }

  // ------------------------------------------------------------ input
  event(e: any) {
    if (this.phase === "intro") {
      if (this.start_btn.handle(e, this.game)) return;
      if (this.prev_btn.handle(e, this.game)) return;
      if (this.next_btn.handle(e, this.game)) return;
      this.nah_btn.handle(e, this.game);
      return;
    }
    if (this.phase === "results") {
      if (this.ok_btn.handle(e, this.game)) return;
      if (e.type === pg.KEYDOWN && (e.key === pg.K_ESCAPE || e.key === pg.K_SPACE)) this.close(this.outcome);
      return;
    }
    if (e.type === pg.KEYDOWN && e.key === pg.K_ESCAPE) {
      // quitting mid-race forfeits; after Zoe finished keep the earned result
      this.close(this.rewarded ? this.outcome : "none");
      return;
    }
    if (this.phase === "race" && e.type === pg.KEYDOWN && e.key === pg.K_SPACE && this.zoe && !this.zoe.finished && !this.autopilot) {
      this.use_item(this.zoe);
    }
  }

  player_input(k: Kart): { thr: number; steer: number; drift: boolean; brake: boolean } {
    const P = pg.key.get_pressed();
    const up = !!(P[pg.K_UP] || P[pg.K_w]);
    const down = !!(P[pg.K_DOWN] || P[pg.K_s]);
    let steer = 0;
    if (P[pg.K_LEFT] || P[pg.K_a]) steer -= 1;
    if (P[pg.K_RIGHT] || P[pg.K_d]) steer += 1;
    const shift = !!(P["shift"] || P[pg.K_x]);
    const thr = up ? 1 : down ? -1 : 0;
    // drift: SHIFT (or X), or hold brake while turning at speed
    const drift = shift || (down && steer !== 0 && (k.drift !== 0 || k.fwd > 55));
    return { thr, steer, drift, brake: down };
  }

  ai_input(k: Kart, dt: number): { thr: number; steer: number; drift: boolean; brake: boolean } {
    const tr = this.track, N = tr.N;
    const spd = Math.abs(k.fwd);
    // lane wandering + dodging
    k.lane_t -= dt;
    if (k.lane_t <= 0) {
      k.lane_t = pg.random.uniform(1.2, 3.2);
      k.lane_target = pg.random.uniform(-7, 7);
    }
    for (const p of this.puddles as Puddle[]) {
      const dx = p.x - k.x, dy = p.y - k.y;
      const d = Math.hypot(dx, dy);
      if (d < 45 && dx * Math.cos(k.a) + dy * Math.sin(k.a) > 0) {
        const si = k.seg;
        const side = (dx * -tr.ty[si] + dy * tr.tx[si]);
        k.lane_target = side > 0 ? -11 : 11;
        k.lane_t = 0.6;
      }
    }
    k.lane += (k.lane_target - k.lane) * Math.min(1, dt * 2);
    const la = Math.round(5 + spd * 0.11);
    const ti = (k.seg + la) % N;
    const tx = tr.px[ti] - tr.ty[ti] * k.lane, ty = tr.py[ti] + tr.tx[ti] * k.lane;
    const want = Math.atan2(ty - k.y, tx - k.x);
    const d = ang_diff(want, k.a);
    const sloppy = (1 - k.skill) * 0.22 * Math.sin(this.t * 1.3 + k.id.length * 1.7);
    let steer = clamp(d * 2.4 + sloppy, -1, 1);
    // upcoming bend
    const ai = k.seg, bi = (k.seg + 22) % N;
    const bend = Math.abs(ang_diff(Math.atan2(tr.ty[bi], tr.tx[bi]), Math.atan2(tr.ty[ai], tr.tx[ai])));
    const corner_v = MAX_SPD * k.spd_mult * (1 - clamp(bend - 0.7, 0, 1.4) * 0.28);
    let thr = 1;
    let brake = false;
    if (k.fwd > corner_v + 10 && k.boost_t <= 0) {
      thr = -1;
      brake = true;
    }
    if (Math.abs(d) > 1.5 && k.fwd > 40) {
      thr = -1;
      brake = true;
    }
    let drift = false;
    if (k.skill > 0.35 && (k.drift !== 0 ? bend > 0.35 : bend > 1.0) && k.fwd > 60) {
      drift = true;
      thr = 1;
      brake = false;
    }
    // stuck: back up
    if (k.reverse_t > 0) {
      k.reverse_t -= dt;
      return { thr: -1, steer: -Math.sign(d || 1), drift: false, brake: true };
    }
    if (this.phase === "race" && Math.abs(k.fwd) < 8 && k.spin_t <= 0) k.stuck_t += dt;
    else k.stuck_t = Math.max(0, k.stuck_t - dt * 2);
    if (k.stuck_t > 1.1) {
      k.stuck_t = 0;
      k.reverse_t = 0.6;
    }
    return { thr, steer, drift, brake };
  }

  // ------------------------------------------------------------ items
  roll_item(k: Kart): string {
    const n = this.karts.length;
    const place = this.place_of(k);
    const rel = n <= 1 ? 0 : (place - 1) / (n - 1); // 0 = leader, 1 = last
    const w = {
      pepper: 5 + rel * 45,
      pillow: 12 + rel * 30,
      slime: 45 - rel * 38,
      shield: 30 - rel * 18,
    };
    const tot = w.pepper + w.pillow + w.slime + w.shield;
    let r = pg.random.random() * tot;
    for (const kind of ITEM_KINDS) {
      r -= (w as any)[kind];
      if (r <= 0) return kind;
    }
    return "pepper";
  }

  use_item(k: Kart) {
    if (!k.item || k.roll_t > 0 || k.spin_t > 0) return;
    const kind = k.item;
    k.item = null;
    const audible = k.is_zoe || this.near_view(k.x, k.y, 0);
    if (kind === "pepper") {
      k.boost_t = Math.max(k.boost_t, 1.3);
      k.fwd = Math.max(k.fwd, MAX_SPD * 0.9);
      this.puff(k.x - Math.cos(k.a) * 6, k.y - Math.sin(k.a) * 6, [255, 120, 60], 6, 40, 0.4);
      if (audible) this.game.audio.play("whoosh", 0.6);
    } else if (kind === "slime") {
      this.puddles.push({ x: k.x - Math.cos(k.a) * 12, y: k.y - Math.sin(k.a) * 12, t: 0, owner: k });
      if (audible) this.game.audio.play("splash", 0.4);
    } else if (kind === "pillow") {
      // target: the nearest racer ahead on track
      let target: Kart | null = null, best = 1e9;
      for (const o of this.karts as Kart[]) {
        if (o === k || o.finished) continue;
        const gap = this.progress(o) - this.progress(k);
        if (gap > 0 && gap < 70 && gap < best) {
          best = gap;
          target = o;
        }
      }
      const sp = 190;
      this.pillows.push({ x: k.x + Math.cos(k.a) * 8, y: k.y + Math.sin(k.a) * 8, vx: Math.cos(k.a) * sp, vy: Math.sin(k.a) * sp, t: 0, owner: k, target });
      if (audible) this.game.audio.play("pop", 0.6);
    } else if (kind === "shield") {
      k.shield_t = 8;
      if (audible) this.game.audio.play("sparkle", 0.5);
    }
  }

  hit(k: Kart, by: string) {
    if (k.finished) return;
    if (k.shield_t > 0) {
      k.shield_t = 0;
      this.puff(k.x, k.y, [200, 240, 255], 8, 40, 0.5);
      if (k.is_zoe || this.near_view(k.x, k.y, 0)) this.game.audio.play("pop", 0.5);
      return;
    }
    k.spin_t = 1.0;
    k.drift = 0;
    k.drift_t = 0;
    k.boost_t = 0;
    k.vx *= 0.35;
    k.vy *= 0.35;
    k.fwd *= 0.35;
    k.hop = by === "pillow" ? 1 : 0.4;
    if (k.is_zoe) {
      this.game.shake(2, 0.25);
      this.game.audio.play(by === "slime" ? "splash" : "hiss", 0.6);
    }
  }

  ai_items(k: Kart, dt: number) {
    if (!k.item || k.roll_t > 0) return;
    k.ai_item_t -= dt;
    if (k.ai_item_t > 0) return;
    const tr = this.track;
    const kind = k.item;
    let go = false;
    if (kind === "pepper") {
      const bi = (k.seg + 25) % tr.N;
      const bend = Math.abs(ang_diff(Math.atan2(tr.ty[bi], tr.tx[bi]), Math.atan2(tr.ty[k.seg], tr.tx[k.seg])));
      go = bend < 0.35 || k.terrain === T_GRASS;
    } else if (kind === "slime") {
      for (const o of this.karts as Kart[]) {
        const gap = this.progress(k) - this.progress(o);
        if (o !== k && gap > 1 && gap < 14) go = true;
      }
      if (k.ai_item_t < -7) go = true;
    } else if (kind === "pillow") {
      for (const o of this.karts as Kart[]) {
        const gap = this.progress(o) - this.progress(k);
        if (o !== k && !o.finished && gap > 4 && gap < 45) {
          const ang = Math.atan2(o.y - k.y, o.x - k.x);
          if (Math.abs(ang_diff(ang, k.a)) < 0.6) go = true;
        }
      }
      if (k.ai_item_t < -10) go = true;
    } else {
      go = true;
    }
    if (go) {
      this.use_item(k);
      k.ai_item_t = pg.random.uniform(0.4, 1.4);
    }
  }

  // ------------------------------------------------------------ physics
  drive(k: Kart, inp: { thr: number; steer: number; drift: boolean; brake: boolean }, dt: number) {
    const terrain = this.terrain_at(k.x, k.y);
    k.terrain = terrain;
    let maxs = MAX_SPD * k.spd_mult;
    if (terrain === T_GRASS) maxs *= k.boost_t > 0 ? 0.8 : 0.55;
    else if (terrain === T_WATER) maxs *= k.boost_t > 0 ? 0.7 : 0.42;
    else if (terrain === T_CURB) maxs *= 0.96;
    if (k.boost_t > 0) maxs *= 1.42;

    let thr = inp.thr, steer = inp.steer;
    if (k.spin_t > 0) {
      thr = 0;
      steer = 0;
    }
    // drifting
    const want_drift = inp.drift && k.spin_t <= 0;
    if (k.drift === 0 && want_drift && Math.abs(steer) > 0.3 && k.fwd > 55) {
      k.drift = Math.sign(steer);
      k.drift_t = 0;
      k.hop = Math.max(k.hop, 0.25);
    }
    if (k.drift !== 0) {
      if (!want_drift || k.fwd < 35 || terrain === T_WATER) {
        if (k.drift_t >= 1.2) {
          k.boost_t = Math.max(k.boost_t, 1.0);
          this.puff(k.x, k.y, [255, 170, 70], 6, 35, 0.35);
          if (k.is_zoe) this.game.audio.play("whoosh", 0.4);
        } else if (k.drift_t >= 0.55) {
          k.boost_t = Math.max(k.boost_t, 0.55);
          this.puff(k.x, k.y, [130, 200, 255], 4, 30, 0.3);
          if (k.is_zoe) this.game.audio.play("whoosh", 0.3);
        }
        k.drift = 0;
        k.drift_t = 0;
      } else {
        thr = Math.max(thr, 0.75); // holding brake to drift doesn't brake
        k.drift_t += dt * (steer * k.drift > 0 ? 1.25 : 0.8) * (terrain === T_GRASS ? 0.4 : 1);
      }
    }
    const spdk = clamp(Math.abs(k.fwd) / 45, 0, 1);
    const dir = k.fwd >= -1 ? 1 : -1;
    let turn: number;
    if (k.drift !== 0) turn = TURN * 1.12 * spdk * (0.55 * k.drift + 0.6 * steer);
    else turn = TURN * steer * spdk * dir * (k.fwd > 80 ? 0.92 : 1);
    if (k.spin_t > 0) {
      k.spin_t -= dt;
      k.spin_a += dt * 15;
      if (k.spin_t <= 0) k.spin_a = 0;
    }
    k.a += turn * dt;

    const ca = Math.cos(k.a), sa = Math.sin(k.a);
    let fwd = k.vx * ca + k.vy * sa;
    let lat = -k.vx * sa + k.vy * ca;
    if (thr > 0) {
      const acc = ACCEL * (k.boost_t > 0 ? 2.2 : 1) * (fwd < 30 ? 1.25 : 1);
      if (fwd < maxs) fwd = Math.min(maxs, fwd + acc * dt * thr);
    } else if (thr < 0) {
      if (fwd > 0) fwd = Math.max(0, fwd - BRAKE * dt);
      else fwd = Math.max(-REVERSE_MAX, fwd - ACCEL * 0.6 * dt);
    } else {
      fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 38 * dt);
    }
    if (fwd > maxs) fwd -= (fwd - maxs) * Math.min(1, 2.6 * dt);
    if (fwd < -REVERSE_MAX) fwd = -REVERSE_MAX;
    const grip = k.spin_t > 0 ? 3 : k.drift !== 0 ? DRIFT_GRIP : terrain === T_GRASS ? 7 : GRIP;
    lat *= Math.exp(-grip * dt);
    k.fwd = fwd;
    k.vx = fwd * ca - lat * sa;
    k.vy = fwd * sa + lat * ca;

    if (k.boost_t > 0) k.boost_t -= dt;
    if (k.shield_t > 0) k.shield_t -= dt;
    if (k.hop > 0) k.hop = Math.max(0, k.hop - dt * 3);
    if (k.bump_t > 0) k.bump_t -= dt;

    // move with solid collision (axis-separated so karts slide along walls)
    const nx = k.x + k.vx * dt, ny = k.y + k.vy * dt;
    const solid = (x: number, y: number) =>
      this.terrain_at(x, y) === T_SOLID || this.terrain_at(x + 3, y) === T_SOLID || this.terrain_at(x - 3, y) === T_SOLID ||
      this.terrain_at(x, y + 3) === T_SOLID || this.terrain_at(x, y - 3) === T_SOLID;
    let bumped = false;
    if (!solid(nx, k.y)) k.x = nx;
    else { k.vx *= -0.3; bumped = true; }
    if (!solid(k.x, ny)) k.y = ny;
    else { k.vy *= -0.3; bumped = true; }
    if (bumped) {
      k.fwd = k.vx * Math.cos(k.a) + k.vy * Math.sin(k.a);
      if (k.bump_t <= 0) {
        k.bump_t = 0.35;
        this.puff(k.x, k.y, [230, 220, 200], 3, 20, 0.3);
        if (k.is_zoe) {
          this.game.audio.play("tick", 0.6);
          this.game.shake(1, 0.12);
        }
      }
    }
    // if somehow inside a solid (pushed by another kart), nudge toward the road
    if (this.terrain_at(k.x, k.y) === T_SOLID) {
      const tr = this.track;
      k.x += (tr.px[k.seg] - k.x) * 0.2;
      k.y += (tr.py[k.seg] - k.y) * 0.2;
    }
    // dust / sparks
    if (this.near_view(k.x, k.y) && this.parts.length < 220) {
      const rx = k.x - ca * 6, ry = k.y - sa * 6;
      if ((terrain === T_GRASS || terrain === T_WATER) && Math.abs(k.fwd) > 30 && pg.random.random() < 0.4) {
        this.parts.push({ x: rx, y: ry, vx: -k.vx * 0.1, vy: -k.vy * 0.1 - 8, t: 0, life: 0.4,
          col: terrain === T_WATER ? [200, 230, 255] : [150, 120, 80], size: 1 });
      }
      if (k.boost_t > 0 && pg.random.random() < 0.8) {
        this.parts.push({ x: rx + pg.random.uniform(-1, 1), y: ry + pg.random.uniform(-1, 1), vx: -ca * 30, vy: -sa * 30, t: 0, life: 0.22,
          col: pg.random.random() < 0.5 ? [255, 220, 90] : [255, 120, 50], size: 2 });
      }
    }
  }

  collide_karts() {
    const ks = this.karts as Kart[];
    for (let i = 0; i < ks.length; i++) {
      for (let j = i + 1; j < ks.length; j++) {
        const a = ks[i], b = ks[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = KART_R * 2;
        if (d >= min || d < 0.001) continue;
        const nx = dx / d, ny = dy / d;
        const push = (min - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const imp = -rv * 0.65;
          a.vx -= nx * imp; a.vy -= ny * imp;
          b.vx += nx * imp; b.vy += ny * imp;
          if ((a.is_zoe || b.is_zoe) && a.bump_t <= 0 && b.bump_t <= 0) {
            this.game.audio.play("tick", 0.5);
            a.bump_t = b.bump_t = 0.3;
          }
        }
      }
    }
  }

  track_progress(k: Kart) {
    const tr = this.track, N = tr.N;
    let best = 1e9, bi = k.seg;
    for (let o = -14; o <= 20; o++) {
      const i = (k.seg + o + N) % N;
      const d = (tr.px[i] - k.x) ** 2 + (tr.py[i] - k.y) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    if (best > 70 * 70) {
      // lost: global search, but only accept a nearby index so shortcuts can't skip a lap
      let gb = 1e9, gi = bi;
      for (let i = 0; i < N; i++) {
        const d = (tr.px[i] - k.x) ** 2 + (tr.py[i] - k.y) ** 2;
        if (d < gb) { gb = d; gi = i; }
      }
      let delta = gi - k.seg;
      if (delta > N / 2) delta -= N;
      if (delta < -N / 2) delta += N;
      if (Math.abs(delta) < 45) bi = gi;
    }
    const old = k.seg;
    if (old > N * 0.75 && bi < N * 0.25) this.on_lap(k);
    else if (old < N * 0.25 && bi > N * 0.75) k.lap -= 1;
    k.seg = bi;
    // wrong way (Zoe only matters)
    const dot = Math.cos(k.a) * tr.tx[bi] + Math.sin(k.a) * tr.ty[bi];
    if (dot < -0.4 && Math.abs(k.fwd) > 15) k.wrong_t += 1 / 60;
    else k.wrong_t = 0;
  }

  on_lap(k: Kart) {
    k.lap += 1;
    if (k.finished) return;
    if (k.lap >= LAPS) {
      k.finished = true;
      k.finish_time = this.race_t;
      this.finish_count += 1;
      k.finish_order = this.finish_count;
      if (k.is_zoe) this.zoe_finished();
      return;
    }
    if (k.is_zoe && k.lap >= 1) {
      if (k.lap === LAPS - 1) this.set_banner("FINAL LAP!", [255, 170, 120]);
      else this.set_banner(`LAP ${k.lap + 1}`, [220, 236, 255]);
      this.game.audio.play("chime", 0.5);
    }
  }

  zoe_finished() {
    const place = this.zoe.finish_order;
    this.award(place);
    this.phase = "finish";
    this.phase_t = 0;
    this.autopilot = true;
    this.set_banner(place === 1 ? "YOU WIN!" : `${ordinal(place)} PLACE!`, place === 1 ? [255, 230, 120] : [220, 236, 255], 3);
    this.game.audio.play(place === 1 ? "star" : "chime", 0.8);
  }

  award(place: number) {
    if (this.rewarded) return;
    this.rewarded = true;
    const st = this.game.state;
    this.outcome = place === 1 ? "win" : "lose";
    this.prize = place === 1 ? 20 : place === 2 ? 8 : 0;
    if (st) {
      try {
        st.stats = st.stats || {};
        st.stats.races = (st.stats.races || 0) + 1;
        if (place === 1) st.stats.races_won = (st.stats.races_won || 0) + 1;
        else st.stats.races_won = st.stats.races_won || 0;
        if (this.prize) {
          st.coins = (st.coins || 0) + this.prize;
          st.total_coins = (st.total_coins || 0) + this.prize;
        }
      } catch (_e) { /* best effort */ }
      try {
        for (const [kind, key] of gstate.check_general_achievements(st)) {
          if (kind === "badges") this.game.toast("BADGE GET!", data.BADGES[key].name, "badge", key);
          else this.game.toast("ACHIEVEMENT!", data.ACHIEVEMENTS[key].name);
        }
      } catch (_e) { /* optional */ }
      try {
        this.game.save();
      } catch (_e) { /* saving is best-effort */ }
    }
    // banter
    const order = this.standings();
    if (place === 1) {
      const f = order.find((k) => !k.is_zoe);
      this.speaker = f ? f.id : this.friends[0];
      this.line = KART_WIN_LINES[this.speaker] || "Wow, Zoe! You smoked us. Great race!";
    } else {
      const f = order[0] && !order[0].is_zoe ? order[0] : order.find((k) => !k.is_zoe);
      this.speaker = f ? f.id : this.friends[0];
      this.line = KART_LOSE_LINES[this.speaker] || "Good race, Zoe! Rematch next game night?";
    }
  }

  force_finish() {
    // time cap / error: rank everyone still out there by progress
    for (const k of this.standings()) {
      if (!k.finished) {
        k.finished = true;
        k.finish_time = -1;
        this.finish_count += 1;
        k.finish_order = this.finish_count;
      }
    }
    if (!this.rewarded) this.award(this.zoe ? this.zoe.finish_order : this.karts.length);
    this.to_results();
  }

  to_results() {
    // anyone not finished yet is placed by progress
    for (const k of this.standings()) {
      if (!k.finished) {
        k.finished = true;
        k.finish_time = -1;
        this.finish_count += 1;
        k.finish_order = this.finish_count;
      }
    }
    this.phase = "results";
    this.phase_t = 0;
    this.overlay = false;
  }

  close(result: KartResult) {
    if (this.closed) return;
    this.closed = true;
    try {
      this.game.pop();
    } catch (_e) { /* ignore */ }
    let line = "";
    if (result === "win" || result === "lose") line = this.line;
    else line = "Maybe next race! The controllers will be warm.";
    if (this.on_done) this.on_done(result === "win" || result === "lose" ? result : "none", line);
  }

  // ------------------------------------------------------------ update
  update(dt: number) {
    try {
      this._update(dt);
    } catch (e) {
      console.warn("kart update error", e);
      if (!this.err) {
        this.err = true;
        try {
          if (this.phase === "intro") this.close("none");
          else this.force_finish();
        } catch (_e) {
          this.close("none");
        }
      }
    }
  }

  _update(dt: number) {
    this.t += dt;
    this.phase_t += dt;
    if (this.banner_t > 0) this.banner_t -= dt;
    if (this.phase === "intro") return;
    if (this.phase === "count") {
      const n = Math.ceil(3 - this.phase_t);
      if (n !== this.go_snd && n >= 1 && n <= 3) {
        this.go_snd = n;
        this.game.audio.play("tick", 0.8);
      }
      if (this.phase_t >= 3) {
        this.phase = "race";
        this.phase_t = 0;
        this.set_banner("GO!", [140, 255, 150], 0.9);
        this.game.audio.play("chime", 0.8);
      }
      this.follow_cam(dt);
      return;
    }
    if (this.phase === "results") {
      this.step_world(dt * 0.5, true);
      return;
    }
    this.race_t += dt;
    this.step_world(dt, false);
    this.follow_cam(dt);
    if (this.phase === "finish") {
      const all = (this.karts as Kart[]).every((k) => k.finished);
      if (all && this.phase_t > 2.5) this.to_results();
      else if (this.phase_t > AFTER_FINISH_WAIT) this.to_results();
    }
    if (this.phase === "race" && this.zoe && !this.zoe.finished) {
      const others = (this.karts as Kart[]).filter((k) => !k.is_zoe);
      if (others.length && others.every((k) => k.finished)) {
        if (this.last_out_t < 0) this.last_out_t = this.race_t;
        if (this.race_t - this.last_out_t > LAST_ONE_WAIT) {
          this.set_banner("TIME!", [255, 200, 120], 2);
          this.force_finish();
          return;
        }
      }
    }
    if (this.race_t > TIME_CAP && this.phase === "race") {
      this.set_banner("TIME!", [255, 200, 120], 2);
      this.force_finish();
    }
  }

  follow_cam(dt: number) {
    const z = this.zoe as Kart;
    if (!z) return;
    const tx = z.x + z.vx * 0.5 - SW / 2, ty = z.y + z.vy * 0.45 - SH / 2;
    const k = Math.min(1, dt * 5);
    this.cam[0] += (tx - this.cam[0]) * k;
    this.cam[1] += (ty - this.cam[1]) * k;
    this.clamp_cam();
  }

  step_world(dt: number, idle: boolean) {
    const tr = this.track;
    const ks = this.karts as Kart[];
    const zp = this.zoe ? this.progress(this.zoe) : 0;
    for (const k of ks) {
      // rubber band: AI speed tracks Zoe's progress
      if (!k.is_zoe) {
        const gap_px = (zp - this.progress(k)) * SP;
        const rubber = this.zoe && this.zoe.finished ? 1 : 1 + clamp(gap_px / 650, -0.11, 0.13);
        k.spd_mult = (0.86 + 0.15 * k.skill) * rubber;
      } else {
        k.spd_mult = 1;
      }
      let inp;
      if (idle) inp = { thr: 0, steer: 0, drift: false, brake: true };
      else if (k.is_zoe && !this.autopilot && !k.finished) inp = this.player_input(k);
      else inp = this.ai_input(k, dt);
      if (k.finished && !idle) inp.thr = Math.min(inp.thr, 0.6);
      this.drive(k, inp, dt);
      if (!k.is_zoe || this.autopilot) {
        if (!k.finished && !idle) this.ai_items(k, dt);
      }
      if (k.roll_t > 0) {
        k.roll_t -= dt;
        if (k.roll_t <= 0 && k.is_zoe && k.item) this.game.audio.play("blip", 0.5);
      }
      this.track_progress(k);
    }
    this.collide_karts();

    // boost pads
    for (const p of tr.pads) {
      for (const k of ks) {
        if ((k.x - p.x) ** 2 + (k.y - p.y) ** 2 < 11 * 11 && k.spin_t <= 0) {
          if (k.boost_t < 0.5 && k.is_zoe) this.game.audio.play("whoosh", 0.5);
          k.boost_t = Math.max(k.boost_t, 0.9);
        }
      }
    }
    // item boxes
    for (const b of this.boxes as Box[]) {
      if (b.t > 0) { b.t -= dt; continue; }
      for (const k of ks) {
        if ((k.x - b.x) ** 2 + (k.y - b.y) ** 2 < 8 * 8) {
          b.t = 3;
          this.puff(b.x, b.y, [255, 220, 250], 6, 35, 0.4);
          if (!k.item && !k.finished) {
            k.item = this.roll_item(k);
            k.roll_t = 0.9;
            k.ai_item_t = pg.random.uniform(0.6, 2.2) * (1.4 - k.skill);
            if (k.is_zoe) this.game.audio.play("pop", 0.6);
          }
          break;
        }
      }
    }
    // slime puddles
    this.puddles = (this.puddles as Puddle[]).filter((p) => {
      p.t += dt;
      if (p.t > 25) return false;
      for (const k of ks) {
        if (k === p.owner && p.t < 0.8) continue;
        if ((k.x - p.x) ** 2 + (k.y - p.y) ** 2 < 7 * 7) {
          this.hit(k, "slime");
          this.puff(p.x, p.y, [110, 210, 90], 6, 30, 0.4);
          return false;
        }
      }
      return true;
    });
    // pillow bombs
    this.pillows = (this.pillows as Pillow[]).filter((p) => {
      p.t += dt;
      if (p.target && !p.target.finished) {
        const want = Math.atan2(p.target.y - p.y, p.target.x - p.x);
        const cur = Math.atan2(p.vy, p.vx);
        const na = cur + clamp(ang_diff(want, cur), -3.2 * dt, 3.2 * dt);
        const sp = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(na) * sp;
        p.vy = Math.sin(na) * sp;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      let boom = p.t > 2.2 || this.terrain_at(p.x, p.y) === T_SOLID;
      if (!boom) {
        for (const k of ks) {
          if (k === p.owner && p.t < 0.4) continue;
          if ((k.x - p.x) ** 2 + (k.y - p.y) ** 2 < 8 * 8) boom = true;
        }
      }
      if (boom) {
        for (const k of ks) {
          if (k === p.owner && p.t < 0.4) continue;
          if ((k.x - p.x) ** 2 + (k.y - p.y) ** 2 < 14 * 14) this.hit(k, "pillow");
        }
        this.puff(p.x, p.y, [255, 255, 255], 14, 50, 0.8, 2);
        this.puff(p.x, p.y, [240, 200, 220], 6, 40, 0.6, 1);
        if (this.near_view(p.x, p.y, 0)) this.game.audio.play("pop", 0.7);
        return false;
      }
      return true;
    });
    // particles
    this.parts = (this.parts as Particle[]).filter((q) => {
      q.t += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.94;
      q.vy *= 0.94;
      return q.t < q.life;
    });
  }

  // ------------------------------------------------------------ draw
  draw(s: Surface) {
    try {
      this._draw(s);
    } catch (e) {
      if (!this.draw_err) {
        this.draw_err = true;
        console.warn("kart draw error", e);
      }
    }
  }

  _draw(s: Surface) {
    const st = this.game.state || {};
    const m = this.game.mpos;
    if (this.phase === "intro") {
      this.draw_intro(s, st, m);
      return;
    }
    this.draw_world(s);
    if (this.phase === "results") {
      this.draw_results(s, m);
      return;
    }
    this.draw_hud(s);
  }

  draw_world(s: Surface) {
    const tr = this.track;
    const cx = Math.round(this.cam[0]), cy = Math.round(this.cam[1]);
    s.blit(tr.surf, [0, 0], [cx, cy, SW, SH]);
    const bob = Math.round(Math.sin(this.t * 4) * 1.2);
    for (const b of this.boxes as Box[]) {
      if (b.t > 0 || !this.near_view(b.x, b.y)) continue;
      s.blit(kart_shadow(), [Math.round(b.x - cx) - 6, Math.round(b.y - cy) - 1]);
      s.blit(item_box_frame(Math.floor(this.t * 3 + b.x * 0.1)), [Math.round(b.x - cx) - 6, Math.round(b.y - cy) - 9 + bob]);
    }
    for (const p of this.puddles as Puddle[]) {
      if (!this.near_view(p.x, p.y)) continue;
      s.blit(slime_surf(), [Math.round(p.x - cx) - 7, Math.round(p.y - cy) - 5]);
    }
    const ks = (this.karts as Kart[]).slice().sort((a, b) => a.y - b.y);
    for (const k of ks) {
      if (!this.near_view(k.x, k.y)) continue;
      const sx = Math.round(k.x - cx), sy = Math.round(k.y - cy);
      s.blit(kart_shadow(), [sx - 7, sy - 4]);
    }
    for (const k of ks) {
      if (!this.near_view(k.x, k.y)) continue;
      const sx = Math.round(k.x - cx), sy = Math.round(k.y - cy);
      const lift = Math.round(Math.sin(k.hop * Math.PI) * (k.hop > 0.5 ? 5 : 2));
      let a = k.a + k.spin_a + (k.drift !== 0 ? k.drift * 0.32 : 0);
      a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const fi = Math.round((a / (Math.PI * 2)) * ANGLES) % ANGLES;
      // drift sparks
      if (k.drift !== 0 && k.drift_t > 0.15) {
        const c = k.drift_t >= 1.2 ? [255, 160, 60] : k.drift_t >= 0.55 ? [120, 190, 255] : [230, 230, 230];
        const ca = Math.cos(k.a), sa = Math.sin(k.a);
        for (const side of [-1, 1]) {
          if ((Math.floor(this.t * 20) + side) % 2 === 0) continue;
          const x = sx - ca * 6 - sa * side * 4, y = sy - sa * 6 + ca * side * 4;
          pg.draw.rect(s, c, [Math.round(x) - 1, Math.round(y) - 1, 2, 2]);
        }
      }
      s.blit(k.frames[fi], [sx - 9, sy - 9 - lift]);
      if (k.shield_t > 0 && (k.shield_t > 1.5 || Math.floor(this.t * 10) % 2 === 0)) s.blit(shield_surf(), [sx - 11, sy - 11 - lift]);
      if (k.is_zoe) {
        const ay = sy - 14 - lift + Math.round(Math.sin(this.t * 5));
        pg.draw.polygon(s, [255, 120, 170], [[sx - 3, ay], [sx + 3, ay], [sx, ay + 3]]);
      } else if (this.phase === "count") {
        font.draw(s, k.name.toUpperCase(), [sx, sy - 18], [255, 255, 255], 1, [40, 30, 50], "center");
      }
    }
    for (const p of this.pillows as Pillow[]) {
      const sx = Math.round(p.x - cx), sy = Math.round(p.y - cy);
      const z = Math.round(Math.sin(Math.min(1, p.t / 0.6) * Math.PI) * 6 + 3);
      s.blit(kart_shadow(), [sx - 7, sy - 4]);
      s.blit(item_icon("pillow"), [sx - 7, sy - 7 - z]);
    }
    for (const q of this.parts as Particle[]) {
      const sx = Math.round(q.x - cx), sy = Math.round(q.y - cy);
      if (sx < -2 || sy < -2 || sx > SW + 2 || sy > SH + 2) continue;
      pg.draw.rect(s, q.col, [sx, sy, q.size, q.size]);
    }
  }

  draw_hud(s: Surface) {
    const z = this.zoe as Kart;
    if (!z) return;
    const order = this.standings();
    const place = order.indexOf(z) + 1;
    // place
    ui.panel(s, [3, 3, 46, 22], [255, 248, 236], ui.BORDER, false);
    const pc: Col = place === 1 ? [220, 150, 30] : place === 2 ? [120, 130, 160] : place === 3 ? [190, 110, 70] : [130, 110, 140];
    font.draw(s, ordinal(place), [26, 6], pc, 2, null, "center");
    font.draw(s, `OF ${order.length}`, [26, 18], ui.MUTED, 1, null, "center");
    // standings list
    order.forEach((k, i) => {
      const y = 29 + i * 8;
      pg.draw.rect(s, [36, 26, 46], [3, y, 6, 6]);
      pg.draw.rect(s, k.col, [4, y + 1, 4, 4]);
      const c: Col = k.is_zoe ? [255, 200, 220] : [240, 236, 244];
      font.draw(s, `${i + 1} ${k.name.toUpperCase()}`, [11, y], c, 1, [36, 26, 46]);
    });
    // lap + time
    const lap = clamp(z.lap + 1, 1, LAPS);
    ui.panel(s, [128, 3, 64, 16], [255, 248, 236], ui.BORDER, false);
    font.draw(s, z.finished ? "FINISHED" : `LAP ${lap}/${LAPS}`, [160, 5], ui.INK, 1, null, "center");
    font.draw(s, fmt_time(z.finished ? z.finish_time : this.race_t), [160, 12], ui.MUTED, 1, null, "center");
    // item slot
    ui.panel(s, [294, 3, 22, 22], [255, 248, 236], ui.BORDER, false);
    if (z.item) {
      const kind = z.roll_t > 0 ? ITEM_KINDS[Math.floor(this.t * 14) % ITEM_KINDS.length] : z.item;
      s.blit(item_icon(kind), [298, 7]);
      if (z.roll_t <= 0 && !z.finished) {
        font.draw(s, ITEM_NAMES[z.item], [290, 7], [255, 255, 255], 1, [36, 26, 46], "right");
        font.draw(s, "SPACE", [290, 15], [255, 230, 140], 1, [36, 26, 46], "right");
      }
    }
    // minimap
    const tr = this.track;
    const mx = SW - tr.mini.w - 3, my = SH - tr.mini.h - 3;
    s.blit(tr.mini, [mx, my]);
    for (const k of (this.karts as Kart[]).slice().reverse()) {
      const dx = Math.round(mx + tr.mox + k.x * tr.mscale), dy = Math.round(my + tr.moy + k.y * tr.mscale);
      if (k.is_zoe) {
        pg.draw.rect(s, [255, 255, 255], [dx - 2, dy - 2, 4, 4]);
        pg.draw.rect(s, [255, 110, 160], [dx - 1, dy - 1, 2, 2]);
      } else {
        pg.draw.rect(s, [20, 16, 28], [dx - 1, dy - 1, 3, 3]);
        pg.draw.rect(s, k.col, [dx, dy, 1, 1]);
      }
    }
    // speed / drift meter
    const spd = clamp(Math.abs(z.fwd) / (MAX_SPD * 1.42), 0, 1);
    pg.draw.rect(s, [36, 26, 46], [3, SH - 9, 52, 6]);
    pg.draw.rect(s, z.boost_t > 0 ? [255, 170, 60] : [120, 220, 140], [4, SH - 8, Math.round(50 * spd), 4]);
    if (z.drift !== 0) {
      const dc = z.drift_t >= 1.2 ? [255, 160, 60] : z.drift_t >= 0.55 ? [120, 190, 255] : [230, 230, 230];
      font.draw(s, z.drift_t >= 1.2 ? "DRIFT!!" : z.drift_t >= 0.55 ? "DRIFT!" : "DRIFT", [3, SH - 17], dc, 1, [36, 26, 46]);
    } else if (z.terrain === T_GRASS && Math.abs(z.fwd) > 10) {
      font.draw(s, "GRASS!", [3, SH - 17], [200, 240, 160], 1, [36, 26, 46]);
    }
    if (z.wrong_t > 1 && !z.finished && Math.floor(this.t * 3) % 2 === 0) {
      font.draw(s, "WRONG WAY!", [160, 40], [255, 120, 120], 2, [60, 20, 20], "center");
    }
    // countdown
    if (this.phase === "count") {
      const n = Math.ceil(3 - this.phase_t);
      const k = this.phase_t % 1;
      const col: Col = n === 3 ? [255, 120, 120] : n === 2 ? [255, 210, 110] : [255, 250, 150];
      font.draw(s, String(clamp(n, 1, 3)), [160, 62 - Math.round((1 - k) * 4)], col, 4, [60, 30, 40], "center");
      font.draw(s, TRACKS[this.track_i].name, [160, 24], [255, 255, 255], 1, [40, 30, 50], "center");
      const hint = "ARROWS/WASD DRIVE  SHIFT DRIFT  SPACE ITEM";
      font.draw(s, hint, [160, 150], [255, 240, 220], 1, [40, 30, 50], "center");
    }
    if (this.banner_t > 0 && this.banner) {
      const sc = this.banner.length <= 4 ? 4 : 2;
      font.draw(s, this.banner, [160, sc === 4 ? 58 : 64], this.banner_col, sc, [50, 30, 40], "center");
    }
    if (this.phase === "finish") {
      font.draw(s, "WAITING FOR THE OTHERS...", [160, 84], [255, 255, 255], 1, [40, 30, 50], "center");
    }
    if (this.phase === "race" && this.last_out_t >= 0 && !z.finished) {
      const left = Math.max(0, LAST_ONE_WAIT - (this.race_t - this.last_out_t));
      font.draw(s, `EVERYONE'S DONE!  ${Math.ceil(left)}s LEFT`, [160, 22], [255, 220, 160], 1, [40, 30, 50], "center");
    }
    if (this.autopilot && this.phase === "race") font.draw(s, "AUTOPILOT", [160, 22], [200, 230, 255], 1, [40, 30, 50], "center");
  }

  draw_intro(s: Surface, st: any, m: number[]) {
    dim(s, 170);
    ui.panel(s, [40, 14, 240, 156], [255, 248, 236], ui.BORDER);
    // checkered strip
    for (let x = 42; x < 278; x += 4) {
      pg.draw.rect(s, (x >> 2) & 1 ? [52, 38, 64] : [255, 255, 255], [x, 16, 4, 2]);
      pg.draw.rect(s, (x >> 2) & 1 ? [255, 255, 255] : [52, 38, 64], [x, 18, 4, 2]);
    }
    font.draw(s, "PAWSLEY PAW-PRIX", [160, 24], [236, 110, 150], 2, [90, 50, 80], "center");
    font.draw(s, "GAME NIGHT GRAND PRIX - 3 LAPS", [160, 38], ui.MUTED, 1, null, "center");
    const all = ["zoe", ...this.friends];
    const pw = 36, total = all.length * pw - 4;
    let x = 160 - Math.floor(total / 2);
    for (const n of all) {
      const zoe = n === "zoe";
      draw_portrait(s, zoe ? zoe_portrait(st) : friend_portrait(n), x, 48, zoe ? [250, 220, 230] : [220, 236, 250]);
      font.draw(s, zoe ? "ZOE" : n.toUpperCase(), [x + 16, 86], ui.INK, 1, null, "center");
      x += pw;
    }
    // track picker
    const td = TRACKS[this.track_i];
    pg.draw.rect(s, [250, 236, 214], [86, 106, 148, 14]);
    font.draw(s, td.name, [160, 110], [90, 70, 110], 1, null, "center");
    this.prev_btn.draw(s, m);
    this.next_btn.draw(s, m);
    font.draw(s, "1ST +20 COINS   2ND +8 COINS", [160, 125], [200, 150, 40], 1, null, "center");
    font.draw(s, "ARROWS/WASD DRIVE - SHIFT DRIFT - SPACE ITEM", [160, 135], ui.MUTED, 1, null, "center");
    this.start_btn.draw(s, m);
    this.nah_btn.draw(s, m);
  }

  draw_results(s: Surface, m: number[]) {
    dim(s, 140);
    ui.panel(s, [56, 14, 208, 160], [255, 248, 236], ui.BORDER);
    const win = this.outcome === "win";
    font.draw(s, win ? "YOU WIN!" : "RACE OVER", [160, 20], win ? [220, 150, 30] : [120, 110, 150], 2, null, "center");
    font.draw(s, TRACKS[this.track_i].name, [160, 34], ui.MUTED, 1, null, "center");
    const order = this.standings();
    order.forEach((k, i) => {
      const y = 46 + i * 15;
      const fill: Col = k.is_zoe ? [250, 220, 230] : [240, 236, 244];
      pg.draw.rect(s, fill, [66, y, 188, 13]);
      const pc: Col = i === 0 ? [220, 150, 30] : i === 1 ? [120, 130, 160] : i === 2 ? [190, 110, 70] : [130, 110, 140];
      font.draw(s, ordinal(i + 1), [70, y + 3], pc);
      s.blit(k.frames[0], [88, y - 3]);
      font.draw(s, k.name.toUpperCase(), [110, y + 3], ui.INK);
      font.draw(s, k.finish_time > 0 ? fmt_time(k.finish_time) : "--:--", [250, y + 3], ui.MUTED, 1, null, "right");
    });
    const by = 46 + order.length * 15 + 2;
    if (this.prize > 0) font.draw(s, `+${this.prize} COINS!`, [160, by], [220, 150, 30], 1, null, "center");
    if (this.line) {
      const who = cap(this.speaker);
      const lines = font.wrap(`${who}: "${this.line}"`, 196);
      lines.slice(0, 3).forEach((ln, i) => font.draw(s, ln, [160, by + 10 + i * 8], [90, 70, 110], 1, null, "center"));
    }
    this.ok_btn.draw(s, m);
  }
}
