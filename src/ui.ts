/* UI widgets: panels, buttons, sliders, dialogue box, particles, text input. */
import * as pg from "./pg";
import { Rect, Surface, SRCALPHA, draw as pdraw, random, Color, GameEvent } from "./pg";
import * as font from "./font";
import * as sprites from "./sprites";

export const INK: Color = [52, 38, 64];
export const PAPER: Color = [255, 248, 236];
export const BORDER: Color = [96, 74, 120];
export const ACCENT: Color = [240, 128, 160];
export const GOOD: Color = [90, 190, 110];
export const BAD: Color = [230, 90, 100];
export const GOLD: Color = [240, 190, 70];
export const MUTED: Color = [150, 136, 160];

const _shadowCache = new Map<string, Surface>();

export function panel(s: Surface, rect: any, fill: Color = PAPER, border: Color = BORDER, shadow = true): Rect {
  const r = new Rect(rect);
  if (shadow) {
    const k = r.w + "x" + r.h;
    let sh = _shadowCache.get(k);
    if (!sh) {
      sh = new Surface([r.w, r.h], SRCALPHA);
      sh.fill([0, 0, 0, 60]);
      if (_shadowCache.size > 200) _shadowCache.clear();
      _shadowCache.set(k, sh);
    }
    s.blit(sh, [r.x + 2, r.y + 2]);
  }
  pdraw.rect(s, border, r);
  const inner = r.inflate(-2, -2);
  pdraw.rect(s, fill, inner);
  pdraw.rect(s, sprites.lighter(fill, 0.5), [inner.x, inner.y, inner.w, 1]);
  return inner;
}

export function hearts(s: Surface, x: number, y: number, health: number, max_h = 100, n = 5) {
  const per = max_h / n;
  for (let i = 0; i < n; i++) {
    const lo = i * per;
    let c: Color;
    if (health >= lo + per * 0.75) c = [236, 70, 100];
    else if (health > lo + per * 0.25) c = [246, 160, 180];
    else c = [160, 146, 166];
    font.draw(s, font.HEART, [x + i * 6, y], c);
  }
}

export function stars(s: Surface, x: number, y: number, n: number, total = 5, scale = 1) {
  for (let i = 0; i < total; i++) {
    const c: Color = i < n ? [250, 200, 60] : [180, 170, 190];
    font.draw(s, font.STAR, [x + i * 6 * scale, y], c, scale);
  }
}

export class Button {
  rect: Rect;
  text: string;
  cb: (() => void) | null;
  enabled: boolean;
  icon: Surface | null;
  color: Color;
  selected = false;
  key: string | null;
  visible = true;
  small: boolean;

  constructor(rect: any, text: string, cb: (() => void) | null = null, enabled = true, icon: Surface | null = null,
              color: Color | null = null, key: string | null = null, small = false) {
    this.rect = new Rect(rect);
    this.text = text;
    this.cb = cb;
    this.enabled = enabled;
    this.icon = icon;
    this.color = color || [255, 236, 214];
    this.key = key;
    this.small = small;
  }

  hover(mpos: number[]) {
    return this.rect.collidepoint(mpos);
  }

  handle(e: GameEvent, game: any): boolean {
    if (!(this.visible && this.enabled)) return false;
    let hit = false;
    if (e.type === pg.MOUSEBUTTONDOWN && e.button === 1 && this.hover(game.mpos)) hit = true;
    if (e.type === pg.KEYDOWN && this.key != null && e.key === this.key) hit = true;
    if (hit) {
      game.audio.play("select");
      if (this.cb) this.cb();
      return true;
    }
    return false;
  }

  draw(s: Surface, mpos: number[]) {
    if (!this.visible) return;
    const hov = this.enabled && this.hover(mpos);
    let fill = this.color;
    if (this.selected) fill = [250, 200, 214];
    if (hov) fill = sprites.lighter(fill, 0.4);
    if (!this.enabled) fill = [214, 206, 216];
    const r = hov ? this.rect.move(0, -1) : this.rect;
    panel(s, r, fill, BORDER, !hov);
    const col = this.enabled ? INK : MUTED;
    const tx = r.centerx;
    if (this.icon != null) {
      const iw = this.icon.get_width();
      const total = iw + 3 + font.text_width(this.text);
      const ix = r.centerx - Math.floor(total / 2);
      s.blit(this.icon, [ix, r.centery - Math.floor(this.icon.get_height() / 2)]);
      font.draw(s, this.text, [ix + iw + 3, r.centery - 2], col);
    } else {
      font.draw(s, this.text, [tx, r.centery - 2], col, 1, null, "center");
    }
  }
}

export class Slider {
  rect: Rect;
  value: number;
  on_change: (v: number) => void;
  drag = false;

  constructor(rect: any, value: number, on_change: (v: number) => void) {
    this.rect = new Rect(rect);
    this.value = value;
    this.on_change = on_change;
  }

  handle(e: GameEvent, game: any): boolean {
    if (e.type === pg.MOUSEBUTTONDOWN && e.button === 1 && this.rect.inflate(6, 8).collidepoint(game.mpos)) {
      this.drag = true;
      this._set(game);
      return true;
    }
    if (e.type === pg.MOUSEBUTTONUP && e.button === 1) {
      if (this.drag) game.audio.play("blip");
      this.drag = false;
    }
    if (e.type === pg.MOUSEMOTION && this.drag) this._set(game);
    if (e.type === pg.KEYDOWN && this.rect.collidepoint(game.mpos)) {
      if (e.key === pg.K_LEFT || e.key === pg.K_a) {
        this.value = Math.max(0.0, this.value - 0.1);
        this.on_change(this.value);
      }
      if (e.key === pg.K_RIGHT || e.key === pg.K_d) {
        this.value = Math.min(1.0, this.value + 0.1);
        this.on_change(this.value);
      }
    }
    return false;
  }

  _set(game: any) {
    const v = (game.mpos[0] - this.rect.x) / Math.max(1, this.rect.w);
    this.value = Math.max(0.0, Math.min(1.0, v));
    this.on_change(this.value);
  }

  draw(s: Surface, _mpos: number[]) {
    const r = this.rect;
    pdraw.rect(s, BORDER, [r.x, r.centery - 1, r.w, 3]);
    pdraw.rect(s, ACCENT, [r.x, r.centery - 1, Math.trunc(r.w * this.value), 3]);
    const kx = r.x + Math.trunc(r.w * this.value);
    pdraw.rect(s, BORDER, [kx - 3, r.centery - 4, 6, 9]);
    pdraw.rect(s, PAPER, [kx - 2, r.centery - 3, 4, 7]);
    font.draw(s, `${Math.trunc(this.value * 100)}%`, [r.right + 6, r.centery - 2], INK);
  }
}

/** A dialogue page: [speaker, portrait surface or null, text] */
export type Page = [string | null, Surface | null, string];

/** Classic RPG box: typewriter text, blinking arrow, optional choices. */
export class DialogueBox {
  game: any;
  pages: Page[];
  i = 0;
  chars = 0.0;
  on_done: (() => void) | null;
  choices: [string, () => void][];
  done = false;
  buttons: Button[] = [];
  tick = 0;
  rect = new Rect(6, 132, 308, 44);

  constructor(game: any, pages: Page[], on_done: (() => void) | null = null, choices: [string, () => void][] | null = null) {
    this.game = game;
    this.pages = pages;
    this.on_done = on_done;
    this.choices = choices || [];
  }

  get page(): Page {
    return this.pages[this.i];
  }

  _full() {
    return this.chars >= this.page[2].length;
  }

  _advance() {
    if (!this._full()) {
      this.chars = this.page[2].length;
      return;
    }
    if (this.i < this.pages.length - 1) {
      this.i += 1;
      this.chars = 0;
      this.game.audio.play("blip", 0.6);
    } else if (!this.choices.length) {
      this.finish();
    }
  }

  finish(choice: (() => void) | null = null) {
    this.done = true;
    if (choice) choice();
    else if (this.on_done) this.on_done();
  }

  _make_buttons() {
    if (this.buttons.length || !this.choices.length) return;
    const n = this.choices.length;
    const bw = 60;
    const x0 = this.rect.right - 6 - n * (bw + 4);
    this.choices.forEach(([label, cb], j) => {
      this.buttons.push(new Button([x0 + j * (bw + 4), this.rect.y - 16, bw, 14], label, () => this.finish(cb)));
    });
  }

  event(e: GameEvent) {
    if (this.done) return;
    const last = this.i === this.pages.length - 1;
    if (last && this.choices.length && this._full()) {
      this._make_buttons();
      for (const b of this.buttons) if (b.handle(e, this.game)) return;
      if (e.type === pg.KEYDOWN && (e.key === pg.K_1 || e.key === pg.K_y)) this.finish(this.choices[0][1]);
      else if (e.type === pg.KEYDOWN && this.choices.length > 1 && (e.key === pg.K_2 || e.key === pg.K_n || e.key === pg.K_ESCAPE))
        this.finish(this.choices[1][1]);
      return;
    }
    if (e.type === pg.KEYDOWN && (e.key === pg.K_e || e.key === pg.K_SPACE || e.key === pg.K_RETURN)) this._advance();
    else if (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) this._advance();
  }

  update(dt: number) {
    if (this.done) return;
    const before = Math.trunc(this.chars);
    this.chars = Math.min(this.page[2].length, this.chars + dt * 45);
    if (Math.trunc(this.chars) !== before && Math.trunc(this.chars) % 3 === 0) this.game.audio.play("tick", 0.5);
  }

  draw(s: Surface) {
    if (this.done) return;
    const [name, portrait, text] = this.page;
    const inner = panel(s, this.rect, PAPER, BORDER);
    let tx = inner.x + 4;
    if (portrait != null) {
      const pr = new Rect(inner.x + 3, inner.y + 3, 30, 34);
      pdraw.rect(s, [250, 220, 230], pr);
      pdraw.rect(s, BORDER, pr, 1);
      s.blit(portrait, [pr.x + 3, pr.y + 3]);
      tx = pr.right + 5;
    }
    if (name) {
      const nw = font.text_width(name) + 8;
      const nr = new Rect(tx - 2, this.rect.y - 7, nw, 10);
      panel(s, nr, [250, 214, 226], BORDER, false);
      font.draw(s, name, [nr.x + 4, nr.y + 3], INK);
    }
    const shown = text.slice(0, Math.trunc(this.chars));
    font.draw_wrapped(s, shown, [tx, inner.y + 6, inner.right - tx - 8, 40], INK);
    if (this._full()) {
      if (this.i === this.pages.length - 1 && this.choices.length) {
        this._make_buttons();
        for (const b of this.buttons) b.draw(s, this.game.mpos);
      } else if (Math.trunc(this.game.time * 3) % 2 === 0) {
        const ax = inner.right - 8, ay = inner.bottom - 7;
        pdraw.polygon(s, ACCENT, [[ax, ay], [ax + 5, ay], [ax + 2, ay + 3]]);
      }
    }
  }
}

export class Particles {
  items: any[] = [];

  /** kw: life, vx, vy, g, text, color */
  add(kind: string, x: number, y: number, n = 1, kw: any = {}) {
    for (let k = 0; k < n; k++) {
      const p: any = {
        kind, x, y, t: 0.0, life: kw.life ?? 0.8,
        vx: kw.vx ?? random.uniform(-30, 30), vy: kw.vy ?? random.uniform(-60, -20),
        g: kw.g ?? 0.0, text: kw.text ?? null, color: kw.color ?? [255, 255, 255],
      };
      if (kind === "coin") {
        Object.assign(p, { vx: random.uniform(-40, 40), vy: random.uniform(-110, -70), g: 260, life: 1.1, floor: y + 6 });
      }
      this.items.push(p);
    }
  }

  burst(kind: string, x: number, y: number, n = 8, spread = 40) {
    for (let k = 0; k < n; k++) {
      this.add(kind, x + random.uniform(-spread / 4, spread / 4), y + random.uniform(-spread / 4, spread / 4), 1, {
        vx: random.uniform(-spread, spread), vy: random.uniform(-spread * 1.5, -spread * 0.2),
      });
    }
  }

  text(txt: string, x: number, y: number, color: Color = INK, life = 1.2) {
    this.items.push({ kind: "text", x, y, t: 0.0, life, vx: 0, vy: -18, g: 0, text: txt, color });
  }

  update(dt: number) {
    for (const p of this.items) {
      p.t += dt;
      if (p.kind === "butterfly") p.vy = Math.sin(p.t * 5) * 14 - 3;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "coin" && p.y > (p.floor ?? 999)) {
        p.y = p.floor;
        p.vy *= -0.5;
        p.vx *= 0.6;
      }
    }
    this.items = this.items.filter((p) => p.t < p.life);
  }

  draw(s: Surface) {
    for (const p of this.items) {
      const x = Math.trunc(p.x), y = Math.trunc(p.y);
      const k = p.kind;
      const fade = 1 - p.t / p.life;
      if (k === "sparkle") {
        const c: Color = Math.trunc(p.t * 12) % 2 ? [255, 250, 200] : [255, 220, 120];
        const r = fade > 0.5 ? 2 : 1;
        pdraw.line(s, c, [x - r, y], [x + r, y]);
        pdraw.line(s, c, [x, y - r], [x, y + r]);
      } else if (k === "heart") {
        font.draw(s, font.HEART, [x - 2, y - 2], [240, 90, 120]);
      } else if (k === "coin") {
        const w = Math.max(1, Math.trunc(Math.abs(Math.cos(p.t * 10)) * 5));
        pdraw.ellipse(s, [250, 210, 80], [x - Math.floor(w / 2), y - 3, w, 6]);
      } else if (k === "bubble") {
        pdraw.circle(s, [230, 246, 255], [x, y], 2, 1);
      } else if (k === "drop") {
        pdraw.rect(s, [120, 200, 250], [x, y, 1, 2]);
      } else if (k === "puff") {
        pdraw.circle(s, [240, 236, 230], [x, y], Math.max(1, Math.trunc(3 * fade)));
      } else if (k === "mud") {
        pdraw.rect(s, [140, 100, 60], [x, y, 2, 2]);
      } else if (k === "butterfly") {
        const flap = Math.trunc(p.t * 10) % 2;
        const c = p.color;
        pdraw.rect(s, [60, 40, 50], [x, y, 1, 2]);
        if (flap) {
          pdraw.rect(s, c, [x - 2, y - 1, 2, 2]);
          pdraw.rect(s, c, [x + 1, y - 1, 2, 2]);
        } else {
          pdraw.rect(s, c, [x - 1, y - 2, 1, 3]);
          pdraw.rect(s, c, [x + 1, y - 2, 1, 3]);
        }
      } else if (k === "text") {
        font.draw(s, p.text, [x, y], p.color, 1, [255, 255, 255], "center");
      }
    }
  }
}

export class TextInput {
  rect: Rect;
  text: string;
  max_len: number;

  constructor(rect: any, text = "", max_len = 12) {
    this.rect = new Rect(rect);
    this.text = text;
    this.max_len = max_len;
  }

  handle(e: GameEvent): boolean {
    if (e.type === pg.KEYDOWN) {
      if (e.key === pg.K_BACKSPACE) {
        this.text = this.text.slice(0, -1);
        return true;
      }
    }
    if (e.type === pg.TEXTINPUT) {
      for (const ch of e.text || "") {
        if (this.text.length < this.max_len && (/^[\p{L}\p{N}]$/u.test(ch) || " '-!.".includes(ch))) this.text += ch;
      }
      return true;
    }
    return false;
  }

  draw(s: Surface, t: number) {
    panel(s, this.rect, [255, 255, 255], BORDER, false);
    font.draw(s, this.text, [this.rect.x + 4, this.rect.y + Math.floor(this.rect.h / 2) - 2], INK);
    if (Math.trunc(t * 2) % 2 === 0) {
      const cx = this.rect.x + 5 + font.text_width(this.text);
      pdraw.rect(s, INK, [cx, this.rect.y + 3, 1, this.rect.h - 6]);
    }
  }
}
