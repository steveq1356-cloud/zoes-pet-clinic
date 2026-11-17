/*
 * pg.ts - a tiny, pixel-exact stand-in for the parts of pygame the original
 * game used (Surface, Rect, draw, transform, events, keys, random).
 *
 * Every Surface is a raw RGBA pixel buffer, so all the hand-written sprite
 * code from the Python version ports over line for line and looks identical:
 * no anti-aliasing, no smoothing. The engine copies the 320x180 screen
 * surface into a Phaser texture once per frame.
 */

export type Color = number[]; // [r,g,b] or [r,g,b,a]
export type Point = number[]; // [x,y]
export type RectLike = Rect | number[];

// ------------------------------------------------------------------ Python helpers
/** Python floor division (a // b). */
export function idiv(a: number, b: number): number {
  return Math.floor(a / b);
}
/** Python modulo (always has the sign of b). */
export function mod(a: number, b: number): number {
  const r = a % b;
  return r !== 0 && (r < 0) !== (b < 0) ? r + b : r;
}
/** Python int(): truncate toward zero. */
export function int(v: number): number {
  return Math.trunc(v);
}
/** Python round() (banker's rounding for .5). */
export function pyround(v: number, nd = 0): number {
  const m = Math.pow(10, nd);
  const x = v * m;
  const r = Math.round(x);
  const isHalf = Math.abs(x % 1) === 0.5;
  const out = isHalf ? 2 * Math.round(x / 2) : r;
  return out / m;
}
export function range(a: number, b?: number, step = 1): number[] {
  if (b === undefined) {
    b = a;
    a = 0;
  }
  const out: number[] = [];
  if (step > 0) for (let i = a; i < b; i += step) out.push(i);
  else for (let i = a; i > b; i += step) out.push(i);
  return out;
}
export function sum(arr: number[]): number {
  let s = 0;
  for (const v of arr) s += v;
  return s;
}
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
/** Deep copy of plain JSON data (like json.loads(json.dumps(x))). */
export function deepcopy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

// ------------------------------------------------------------------ random
function hashSeed(seed: any): number {
  const s = typeof seed === "number" ? String(seed) : JSON.stringify(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Same API as Python's random.Random (the subset the game uses). */
export class Random {
  private s: number;
  private useMath: boolean;
  constructor(seed?: any) {
    this.useMath = seed === undefined;
    this.s = this.useMath ? 0 : hashSeed(seed);
  }
  seed(seed: any) {
    this.useMath = false;
    this.s = hashSeed(seed);
  }
  random(): number {
    if (this.useMath) return Math.random();
    // mulberry32
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  uniform(a: number, b: number): number {
    return a + (b - a) * this.random();
  }
  /** Inclusive on both ends, like Python. */
  randint(a: number, b: number): number {
    return a + Math.floor(this.random() * (b - a + 1));
  }
  randrange(a: number, b?: number): number {
    if (b === undefined) {
      b = a;
      a = 0;
    }
    return a + Math.floor(this.random() * (b - a));
  }
  choice<T>(arr: T[]): T {
    return arr[Math.floor(this.random() * arr.length)];
  }
  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
  }
  sample<T>(arr: T[], k: number): T[] {
    const c = arr.slice();
    this.shuffle(c);
    return c.slice(0, k);
  }
  /** random.choices(population, weights, k=1) -> list */
  choices<T>(arr: T[], weights?: number[], k = 1): T[] {
    const out: T[] = [];
    const w = weights || arr.map(() => 1);
    const total = sum(w);
    for (let n = 0; n < k; n++) {
      let r = this.random() * total;
      let pick = arr[arr.length - 1];
      for (let i = 0; i < arr.length; i++) {
        r -= w[i];
        if (r < 0) {
          pick = arr[i];
          break;
        }
      }
      out.push(pick);
    }
    return out;
  }
}
/** Module-level random, like `import random`. */
export const random = new Random();

// ------------------------------------------------------------------ Rect
export class Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  constructor(a: any, b?: any, c?: number, d?: number) {
    if (a instanceof Rect) {
      this.x = a.x;
      this.y = a.y;
      this.w = a.w;
      this.h = a.h;
    } else if (Array.isArray(a) && Array.isArray(b)) {
      this.x = a[0];
      this.y = a[1];
      this.w = b[0];
      this.h = b[1];
    } else if (Array.isArray(a)) {
      this.x = a[0];
      this.y = a[1];
      this.w = a[2];
      this.h = a[3];
    } else {
      this.x = a;
      this.y = b;
      this.w = c;
      this.h = d;
    }
    this.x = Math.trunc(this.x);
    this.y = Math.trunc(this.y);
    this.w = Math.trunc(this.w);
    this.h = Math.trunc(this.h);
  }
  // tuple-style access: r[0], r[1], r[2], r[3] and destructuring
  get 0() { return this.x; }
  get 1() { return this.y; }
  get 2() { return this.w; }
  get 3() { return this.h; }
  get length() { return 4; }
  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
    yield this.w;
    yield this.h;
  }
  get width() { return this.w; }
  set width(v) { this.w = Math.trunc(v); }
  get height() { return this.h; }
  set height(v) { this.h = Math.trunc(v); }
  get left() { return this.x; }
  set left(v) { this.x = Math.trunc(v); }
  get top() { return this.y; }
  set top(v) { this.y = Math.trunc(v); }
  get right() { return this.x + this.w; }
  set right(v) { this.x = Math.trunc(v) - this.w; }
  get bottom() { return this.y + this.h; }
  set bottom(v) { this.y = Math.trunc(v) - this.h; }
  get centerx() { return this.x + idiv(this.w, 2); }
  set centerx(v) { this.x = Math.trunc(v) - idiv(this.w, 2); }
  get centery() { return this.y + idiv(this.h, 2); }
  set centery(v) { this.y = Math.trunc(v) - idiv(this.h, 2); }
  get center(): number[] { return [this.centerx, this.centery]; }
  set center(p: number[]) { this.centerx = p[0]; this.centery = p[1]; }
  get topleft(): number[] { return [this.x, this.y]; }
  set topleft(p: number[]) { this.x = Math.trunc(p[0]); this.y = Math.trunc(p[1]); }
  get topright(): number[] { return [this.right, this.y]; }
  set topright(p: number[]) { this.right = p[0]; this.y = Math.trunc(p[1]); }
  get bottomleft(): number[] { return [this.x, this.bottom]; }
  set bottomleft(p: number[]) { this.x = Math.trunc(p[0]); this.bottom = p[1]; }
  get bottomright(): number[] { return [this.right, this.bottom]; }
  set bottomright(p: number[]) { this.right = p[0]; this.bottom = p[1]; }
  get midtop(): number[] { return [this.centerx, this.y]; }
  set midtop(p: number[]) { this.centerx = p[0]; this.y = Math.trunc(p[1]); }
  get midbottom(): number[] { return [this.centerx, this.bottom]; }
  set midbottom(p: number[]) { this.centerx = p[0]; this.bottom = p[1]; }
  get midleft(): number[] { return [this.x, this.centery]; }
  set midleft(p: number[]) { this.x = Math.trunc(p[0]); this.centery = p[1]; }
  get midright(): number[] { return [this.right, this.centery]; }
  set midright(p: number[]) { this.right = p[0]; this.centery = p[1]; }
  get size(): number[] { return [this.w, this.h]; }
  set size(p: number[]) { this.w = Math.trunc(p[0]); this.h = Math.trunc(p[1]); }

  copy() { return new Rect(this.x, this.y, this.w, this.h); }
  move(dx: number, dy?: number) {
    if (Array.isArray(dx)) { dy = dx[1]; dx = dx[0]; }
    return new Rect(this.x + dx, this.y + dy, this.w, this.h);
  }
  move_ip(dx: number, dy?: number) {
    if (Array.isArray(dx)) { dy = dx[1]; dx = dx[0]; }
    this.x += Math.trunc(dx);
    this.y += Math.trunc(dy);
  }
  inflate(dx: number, dy?: number) {
    if (Array.isArray(dx)) { dy = dx[1]; dx = dx[0]; }
    return new Rect(this.x - Math.trunc(dx / 2), this.y - Math.trunc(dy / 2), this.w + dx, this.h + dy);
  }
  inflate_ip(dx: number, dy: number) {
    const r = this.inflate(dx, dy);
    this.x = r.x; this.y = r.y; this.w = r.w; this.h = r.h;
  }
  collidepoint(a: any, b?: number): boolean {
    const px = Array.isArray(a) ? a[0] : a;
    const py = Array.isArray(a) ? a[1] : b;
    return px >= this.x && px < this.x + this.w && py >= this.y && py < this.y + this.h;
  }
  colliderect(o: RectLike): boolean {
    const r = toRect(o);
    if (this.w === 0 || this.h === 0 || r.w === 0 || r.h === 0) return false;
    return this.x < r.x + r.w && r.x < this.x + this.w && this.y < r.y + r.h && r.y < this.y + this.h;
  }
  contains(o: RectLike): boolean {
    const r = toRect(o);
    return r.x >= this.x && r.y >= this.y && r.right <= this.right && r.bottom <= this.bottom;
  }
  clamp(o: RectLike): Rect {
    const r = toRect(o);
    const out = this.copy();
    if (out.w >= r.w) out.x = r.x + idiv(r.w - out.w, 2);
    else if (out.x < r.x) out.x = r.x;
    else if (out.right > r.right) out.x = r.right - out.w;
    if (out.h >= r.h) out.y = r.y + idiv(r.h - out.h, 2);
    else if (out.y < r.y) out.y = r.y;
    else if (out.bottom > r.bottom) out.y = r.bottom - out.h;
    return out;
  }
  clamp_ip(o: RectLike) {
    const r = this.clamp(o);
    this.x = r.x; this.y = r.y;
  }
  clip(o: RectLike): Rect {
    const r = toRect(o);
    const x1 = Math.max(this.x, r.x), y1 = Math.max(this.y, r.y);
    const x2 = Math.min(this.right, r.right), y2 = Math.min(this.bottom, r.bottom);
    if (x2 <= x1 || y2 <= y1) return new Rect(this.x, this.y, 0, 0);
    return new Rect(x1, y1, x2 - x1, y2 - y1);
  }
  union(o: RectLike): Rect {
    const r = toRect(o);
    const x1 = Math.min(this.x, r.x), y1 = Math.min(this.y, r.y);
    const x2 = Math.max(this.right, r.right), y2 = Math.max(this.bottom, r.bottom);
    return new Rect(x1, y1, x2 - x1, y2 - y1);
  }
  toArray(): number[] { return [this.x, this.y, this.w, this.h]; }
}

export function toRect(r: RectLike): Rect {
  return r instanceof Rect ? r : new Rect(r as number[]);
}

// ------------------------------------------------------------------ Surface
export const SRCALPHA = 1;

let _surfId = 0;

export class Surface {
  w: number;
  h: number;
  alpha: boolean;
  data: Uint8ClampedArray;
  id: number;
  /** increments on every change (used to know when to re-upload) */
  version = 0;

  constructor(size: number[], flags = 0) {
    this.w = Math.max(0, Math.trunc(size[0]));
    this.h = Math.max(0, Math.trunc(size[1]));
    this.alpha = (flags & SRCALPHA) !== 0;
    this.data = new Uint8ClampedArray(this.w * this.h * 4);
    this.id = ++_surfId;
    if (!this.alpha) {
      // plain surfaces start opaque black, like pygame
      for (let i = 3; i < this.data.length; i += 4) this.data[i] = 255;
    }
  }

  get_width() { return this.w; }
  get_height() { return this.h; }
  get_size(): number[] { return [this.w, this.h]; }
  get_rect(kw?: Record<string, any>): Rect {
    const r = new Rect(0, 0, this.w, this.h);
    if (kw) for (const k of Object.keys(kw)) (r as any)[k] = kw[k];
    return r;
  }

  copy(): Surface {
    const s = new Surface([this.w, this.h], this.alpha ? SRCALPHA : 0);
    s.data.set(this.data);
    return s;
  }

  /** Write one pixel (no blending, like pygame draw). */
  _put(x: number, y: number, r: number, g: number, b: number, a: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const d = this.data;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = this.alpha ? a : 255;
  }

  _hline(x1: number, x2: number, y: number, c: Color) {
    if (y < 0 || y >= this.h) return;
    if (x1 > x2) { const t = x1; x1 = x2; x2 = t; }
    x1 = Math.max(0, x1);
    x2 = Math.min(this.w - 1, x2);
    if (x2 < x1) return;
    const a = this.alpha ? (c.length > 3 ? c[3] : 255) : 255;
    const d = this.data;
    let i = (y * this.w + x1) * 4;
    for (let x = x1; x <= x2; x++, i += 4) {
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = a;
    }
  }

  fill(color: Color, rect?: RectLike) {
    let x1 = 0, y1 = 0, x2 = this.w, y2 = this.h;
    if (rect) {
      const r = toRect(rect);
      x1 = Math.max(0, r.x);
      y1 = Math.max(0, r.y);
      x2 = Math.min(this.w, r.x + r.w);
      y2 = Math.min(this.h, r.y + r.h);
    }
    for (let y = y1; y < y2; y++) this._hline(x1, x2 - 1, y, color);
    this.version++;
    return new Rect(x1, y1, Math.max(0, x2 - x1), Math.max(0, y2 - y1));
  }

  set_at(p: Point, c: Color) {
    const x = Math.trunc(p[0]), y = Math.trunc(p[1]);
    this._put(x, y, c[0], c[1], c[2], c.length > 3 ? c[3] : 255);
    this.version++;
  }

  get_at(p: Point): number[] {
    const x = Math.trunc(p[0]), y = Math.trunc(p[1]);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) throw new Error("pixel index out of range");
    const i = (y * this.w + x) * 4;
    const d = this.data;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }

  /** Alpha-blit src onto this surface at pos (optionally only `area` of src). */
  blit(src: Surface, pos: any, area?: RectLike): Rect {
    if (!src) return new Rect(0, 0, 0, 0);
    let dx: number, dy: number;
    if (pos instanceof Rect) { dx = pos.x; dy = pos.y; } else { dx = Math.trunc(pos[0]); dy = Math.trunc(pos[1]); }
    let sx = 0, sy = 0, sw = src.w, sh = src.h;
    if (area) {
      const a = toRect(area);
      sx = Math.max(0, a.x);
      sy = Math.max(0, a.y);
      sw = Math.min(src.w - sx, a.w - (sx - a.x));
      sh = Math.min(src.h - sy, a.h - (sy - a.y));
    }
    // clip against destination
    if (dx < 0) { sx -= dx; sw += dx; dx = 0; }
    if (dy < 0) { sy -= dy; sh += dy; dy = 0; }
    if (dx + sw > this.w) sw = this.w - dx;
    if (dy + sh > this.h) sh = this.h - dy;
    if (sw <= 0 || sh <= 0) return new Rect(dx, dy, 0, 0);
    const S = src.data, D = this.data;
    const dstAlpha = this.alpha;
    for (let y = 0; y < sh; y++) {
      let si = ((sy + y) * src.w + sx) * 4;
      let di = ((dy + y) * this.w + dx) * 4;
      for (let x = 0; x < sw; x++, si += 4, di += 4) {
        const a = src.alpha ? S[si + 3] : 255;
        if (a === 0) continue;
        if (a === 255) {
          D[di] = S[si];
          D[di + 1] = S[si + 1];
          D[di + 2] = S[si + 2];
          D[di + 3] = 255;
          continue;
        }
        const da = dstAlpha ? D[di + 3] : 255;
        if (dstAlpha && da === 0) {
          D[di] = S[si];
          D[di + 1] = S[si + 1];
          D[di + 2] = S[si + 2];
          D[di + 3] = a;
          continue;
        }
        const f = a / 255;
        D[di] = D[di] + (S[si] - D[di]) * f;
        D[di + 1] = D[di + 1] + (S[si + 1] - D[di + 1]) * f;
        D[di + 2] = D[di + 2] + (S[si + 2] - D[di + 2]) * f;
        D[di + 3] = dstAlpha ? a + da - (a * da) / 255 : 255;
      }
    }
    this.version++;
    return new Rect(dx, dy, sw, sh);
  }

  /** Multiply every pixel's alpha by a/255 (approximates Surface.set_alpha). */
  set_alpha(a: number) {
    const f = Math.max(0, Math.min(255, a)) / 255;
    if (!this.alpha) {
      this.alpha = true;
    }
    for (let i = 3; i < this.data.length; i += 4) this.data[i] = this.data[i] * f;
    this.version++;
  }
}

// ------------------------------------------------------------------ draw
function colorOf(c: Color): Color {
  return c;
}

export const draw = {
  rect(s: Surface, color: Color, rect: RectLike, width = 0): Rect {
    const r = toRect(rect);
    if (r.w <= 0 || r.h <= 0) return new Rect(r.x, r.y, 0, 0);
    const c = colorOf(color);
    if (width <= 0 || width * 2 >= r.w || width * 2 >= r.h) {
      for (let y = r.y; y < r.y + r.h; y++) s._hline(r.x, r.x + r.w - 1, y, c);
    } else {
      for (let k = 0; k < width; k++) {
        s._hline(r.x, r.x + r.w - 1, r.y + k, c);
        s._hline(r.x, r.x + r.w - 1, r.y + r.h - 1 - k, c);
      }
      for (let y = r.y + width; y < r.y + r.h - width; y++) {
        s._hline(r.x, r.x + width - 1, y, c);
        s._hline(r.x + r.w - width, r.x + r.w - 1, y, c);
      }
    }
    s.version++;
    return r;
  },

  circle(s: Surface, color: Color, center: Point, radius: number, width = 0): Rect {
    const x0 = Math.trunc(center[0]), y0 = Math.trunc(center[1]);
    radius = Math.trunc(radius);
    if (radius < 1) return new Rect(x0, y0, 0, 0);
    const c = colorOf(color);
    const outer = circleSpans(radius);
    if (width <= 0 || width >= radius) {
      for (let i = 0; i < outer.length; i++) {
        const [dy, half] = outer[i];
        s._hline(x0 - half, x0 + half - 1, y0 + dy, c);
      }
    } else {
      const inner = new Map<number, number>();
      for (const [dy, half] of circleSpans(radius - width)) inner.set(dy, half);
      for (const [dy, half] of outer) {
        const ih = inner.get(dy);
        if (ih === undefined || ih <= 0) {
          s._hline(x0 - half, x0 + half - 1, y0 + dy, c);
        } else {
          s._hline(x0 - half, x0 - ih - 1, y0 + dy, c);
          s._hline(x0 + ih, x0 + half - 1, y0 + dy, c);
        }
      }
    }
    s.version++;
    return new Rect(x0 - radius, y0 - radius, radius * 2, radius * 2);
  },

  ellipse(s: Surface, color: Color, rect: RectLike, width = 0): Rect {
    const r = toRect(rect);
    if (r.w <= 0 || r.h <= 0) return new Rect(r.x, r.y, 0, 0);
    const c = colorOf(color);
    const outer = ellipseSpans(r.w, r.h);
    if (width <= 0 || width * 2 >= r.w || width * 2 >= r.h) {
      for (let row = 0; row < r.h; row++) {
        const sp = outer[row];
        if (sp) s._hline(r.x + sp[0], r.x + sp[1], r.y + row, c);
      }
    } else {
      const iw = r.w - 2 * width, ih = r.h - 2 * width;
      const inner = ellipseSpans(iw, ih);
      for (let row = 0; row < r.h; row++) {
        const sp = outer[row];
        if (!sp) continue;
        const ir = row - width;
        const isp = ir >= 0 && ir < ih ? inner[ir] : null;
        if (!isp) {
          s._hline(r.x + sp[0], r.x + sp[1], r.y + row, c);
        } else {
          s._hline(r.x + sp[0], r.x + width + isp[0] - 1, r.y + row, c);
          s._hline(r.x + width + isp[1] + 1, r.x + sp[1], r.y + row, c);
        }
      }
    }
    s.version++;
    return r;
  },

  line(s: Surface, color: Color, start: Point, end: Point, width = 1): Rect {
    const c = colorOf(color);
    let x1 = Math.trunc(start[0]), y1 = Math.trunc(start[1]);
    let x2 = Math.trunc(end[0]), y2 = Math.trunc(end[1]);
    if (width < 1) return new Rect(x1, y1, 0, 0);
    const steep = Math.abs(y2 - y1) > Math.abs(x2 - x1);
    const lo = -Math.trunc((width - 1) / 2);
    const hi = lo + width - 1;
    for (let o = lo; o <= hi; o++) {
      if (steep) bresenham(s, x1 + o, y1, x2 + o, y2, c);
      else bresenham(s, x1, y1 + o, x2, y2 + o, c);
    }
    s.version++;
    return new Rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1) + 1, Math.abs(y2 - y1) + 1);
  },

  lines(s: Surface, color: Color, closed: boolean, points: Point[], width = 1) {
    for (let i = 0; i < points.length - 1; i++) draw.line(s, color, points[i], points[i + 1], width);
    if (closed && points.length > 2) draw.line(s, color, points[points.length - 1], points[0], width);
  },

  polygon(s: Surface, color: Color, points: Point[], width = 0): void {
    if (points.length < 2) return;
    const c = colorOf(color);
    if (width > 0) {
      draw.lines(s, c, true, points, width);
      return;
    }
    const pts = points.map((p) => [Math.trunc(p[0]), Math.trunc(p[1])]);
    let miny = Infinity, maxy = -Infinity;
    for (const p of pts) {
      miny = Math.min(miny, p[1]);
      maxy = Math.max(maxy, p[1]);
    }
    const n = pts.length;
    for (let y = miny; y <= maxy; y++) {
      const xs: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        let ya = a[1], yb = b[1], xa = a[0], xb = b[0];
        if (ya === yb) continue;
        if (ya > yb) { [ya, yb] = [yb, ya]; [xa, xb] = [xb, xa]; }
        if (y >= ya && y < yb) xs.push(xa + ((y - ya) * (xb - xa)) / (yb - ya));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) s._hline(Math.ceil(xs[i]), Math.floor(xs[i + 1]), y, c);
    }
    // pygame also draws the outline so edges are always included
    draw.lines(s, c, true, pts, 1);
    s.version++;
  },

  arc(s: Surface, color: Color, rect: RectLike, start: number, stop: number, width = 1): void {
    const r = toRect(rect);
    const c = colorOf(color);
    const rx = r.w / 2, ry = r.h / 2;
    const cx = r.x + rx, cy = r.y + ry;
    if (stop < start) stop += Math.PI * 2;
    const steps = Math.max(8, Math.ceil((stop - start) * Math.max(rx, ry) * 2));
    for (let w = 0; w < width; w++) {
      for (let i = 0; i <= steps; i++) {
        const t = start + ((stop - start) * i) / steps;
        const px = Math.floor(cx + Math.cos(t) * (rx - 0.5 - w));
        const py = Math.floor(cy - Math.sin(t) * (ry - 0.5 - w));
        s._put(px, py, c[0], c[1], c[2], c.length > 3 ? c[3] : 255);
      }
    }
    s.version++;
  },
};

function bresenham(s: Surface, x0: number, y0: number, x1: number, y1: number, c: Color) {
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const a = c.length > 3 ? c[3] : 255;
  for (;;) {
    s._put(x0, y0, c[0], c[1], c[2], a);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

const _circleCache = new Map<number, number[][]>();
/** Rows of a filled circle as [dy, halfWidth]; covers x0-half .. x0+half-1 (pygame 2 style). */
function circleSpans(radius: number): number[][] {
  let out = _circleCache.get(radius);
  if (out) return out;
  out = [];
  for (let dy = -radius; dy < radius; dy++) {
    const yc = dy + 0.5;
    const half = Math.round(Math.sqrt(Math.max(0, radius * radius - yc * yc)));
    if (half > 0) out.push([dy, half]);
  }
  _circleCache.set(radius, out);
  return out;
}

/** For each row of a w x h ellipse box: [x1, x2] inclusive, or null. */
function ellipseSpans(w: number, h: number): (number[] | null)[] {
  const out: (number[] | null)[] = [];
  const a = w / 2, b = h / 2;
  for (let row = 0; row < h; row++) {
    const yy = (row + 0.5 - b) / b;
    const t = 1 - yy * yy;
    if (t < 0) { out.push(null); continue; }
    const half = a * Math.sqrt(t);
    let x1 = Math.round(a - half), x2 = Math.round(a + half) - 1;
    if (x2 < x1) { x1 = Math.floor(a - 0.5); x2 = x1; }
    out.push([Math.max(0, x1), Math.min(w - 1, x2)]);
  }
  return out;
}

// ------------------------------------------------------------------ transform
export const transform = {
  scale(src: Surface, size: number[]): Surface {
    const w = Math.max(0, Math.trunc(size[0])), h = Math.max(0, Math.trunc(size[1]));
    const out = new Surface([w, h], src.alpha ? SRCALPHA : 0);
    if (w === 0 || h === 0 || src.w === 0 || src.h === 0) return out;
    const S = src.data, D = out.data;
    for (let y = 0; y < h; y++) {
      const sy = Math.floor((y * src.h) / h);
      for (let x = 0; x < w; x++) {
        const sx = Math.floor((x * src.w) / w);
        const si = (sy * src.w + sx) * 4, di = (y * w + x) * 4;
        D[di] = S[si];
        D[di + 1] = S[si + 1];
        D[di + 2] = S[si + 2];
        D[di + 3] = S[si + 3];
      }
    }
    return out;
  },
  scale_by(src: Surface, f: number): Surface {
    return transform.scale(src, [src.w * f, src.h * f]);
  },
  flip(src: Surface, fx: boolean, fy: boolean): Surface {
    const out = new Surface([src.w, src.h], src.alpha ? SRCALPHA : 0);
    const S = src.data, D = out.data;
    for (let y = 0; y < src.h; y++) {
      const sy = fy ? src.h - 1 - y : y;
      for (let x = 0; x < src.w; x++) {
        const sx = fx ? src.w - 1 - x : x;
        const si = (sy * src.w + sx) * 4, di = (y * src.w + x) * 4;
        D[di] = S[si];
        D[di + 1] = S[si + 1];
        D[di + 2] = S[si + 2];
        D[di + 3] = S[si + 3];
      }
    }
    return out;
  },
  /** Rotate counter-clockwise by a multiple of 90 degrees (like pygame). */
  rotate(src: Surface, angle: number): Surface {
    const q = mod(Math.round(angle / 90), 4);
    if (q === 0) return src.copy();
    const nw = q % 2 ? src.h : src.w, nh = q % 2 ? src.w : src.h;
    const out = new Surface([nw, nh], src.alpha ? SRCALPHA : 0);
    const S = src.data, D = out.data;
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        let nx: number, ny: number;
        if (q === 1) { nx = y; ny = src.w - 1 - x; }
        else if (q === 2) { nx = src.w - 1 - x; ny = src.h - 1 - y; }
        else { nx = src.h - 1 - y; ny = x; }
        const si = (y * src.w + x) * 4, di = (ny * nw + nx) * 4;
        D[di] = S[si];
        D[di + 1] = S[si + 1];
        D[di + 2] = S[si + 2];
        D[di + 3] = S[si + 3];
      }
    }
    return out;
  },
};

// ------------------------------------------------------------------ events & keys
export const QUIT = 256;
export const KEYDOWN = 768;
export const KEYUP = 769;
export const MOUSEMOTION = 1024;
export const MOUSEBUTTONDOWN = 1025;
export const MOUSEBUTTONUP = 1026;
export const MOUSEWHEEL = 1027;
export const TEXTINPUT = 771;
export const VIDEORESIZE = 32769;

export interface GameEvent {
  type: number;
  key?: string;
  button?: number;
  pos?: number[];
  rel?: number[];
  text?: string;
  unicode?: string;
  x?: number;
  y?: number;
  mod?: number;
}

export const K_ESCAPE = "escape";
export const K_SPACE = "space";
export const K_RETURN = "return";
export const K_BACKSPACE = "backspace";
export const K_DELETE = "delete";
export const K_TAB = "tab";
export const K_UP = "up";
export const K_DOWN = "down";
export const K_LEFT = "left";
export const K_RIGHT = "right";
export const K_F11 = "f11";
export const K_a = "a", K_b = "b", K_c = "c", K_d = "d", K_e = "e", K_f = "f", K_g = "g", K_h = "h";
export const K_i = "i", K_j = "j", K_k = "k", K_l = "l", K_m = "m", K_n = "n", K_o = "o", K_p = "p";
export const K_q = "q", K_r = "r", K_s = "s", K_t = "t", K_u = "u", K_v = "v", K_w = "w", K_x = "x";
export const K_y = "y", K_z = "z";
export const K_0 = "0", K_1 = "1", K_2 = "2", K_3 = "3", K_4 = "4", K_5 = "5", K_6 = "6", K_7 = "7";
export const K_8 = "8", K_9 = "9";

/** Translate a browser KeyboardEvent.code to our pygame-style key name. */
export function keyFromCode(code: string, key: string): string {
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad") && /^\d$/.test(code.slice(6))) return code.slice(6);
  switch (code) {
    case "Escape": return K_ESCAPE;
    case "Space": return K_SPACE;
    case "Enter":
    case "NumpadEnter": return K_RETURN;
    case "Backspace": return K_BACKSPACE;
    case "Delete": return K_DELETE;
    case "Tab": return K_TAB;
    case "ArrowUp": return K_UP;
    case "ArrowDown": return K_DOWN;
    case "ArrowLeft": return K_LEFT;
    case "ArrowRight": return K_RIGHT;
  }
  return (key || code).toLowerCase();
}

/** Currently held keys, indexable by K_* constants (like pygame.key.get_pressed()). */
export const pressed: Record<string, boolean> = {};
export const key = {
  get_pressed(): Record<string, boolean> {
    return pressed;
  },
  start_text_input() {},
  stop_text_input() {},
};

export const mouse = {
  pos: [0, 0] as number[],
  get_pos(): number[] {
    return [mouse.pos[0], mouse.pos[1]];
  },
};
