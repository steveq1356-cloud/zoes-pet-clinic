/* Title screen and every menu/overlay: settings, pause, store, mirror, trophies, pets, decorating. */
import * as pg from "./pg";
import { Rect, Surface, SRCALPHA } from "./pg";
import * as config from "./config";
import * as data from "./data";
import * as font from "./font";
import * as sprites from "./sprites";
import * as ui from "./ui";
import * as gstate from "./state";
import * as challenges from "./challenges";
import { Scene } from "./engine";
import { APP_VERSION } from "./version";
import { HQScene, town_after_shift, _announce } from "./world";
import { DECOR_ORIGIN, CLINIC_GRID, draw_lobby_bg } from "./clinic";

export const SW = config.NATIVE_W;
export const SH = config.NATIVE_H;

export function dim(s: Surface, a = 120) {
  const v = new Surface([SW, SH], SRCALPHA);
  v.fill([30, 20, 40, a]);
  s.blit(v, [0, 0]);
}

// ======================================================================= confirm
export class ConfirmMenu extends Scene {
  overlay = true;

  constructor(game: any, text: string, on_yes: () => void, yes = "Yes", no = "No") {
    super(game);
    this.text = text;
    this.on_yes = on_yes;
    this.buttons = [new ui.Button([96, 104, 60, 14], yes, () => this.yes(), true, null, null, pg.K_y),
                    new ui.Button([164, 104, 60, 14], no, () => this.game.pop(), true, null, null, pg.K_n)];
  }

  yes() {
    this.game.pop();
    this.on_yes();
  }

  event(e: any) {
    if (e.type === pg.KEYDOWN && e.key === pg.K_ESCAPE) {
      this.game.pop();
      return;
    }
    for (const b of this.buttons) {
      if (b.handle(e, this.game)) return;
    }
  }

  draw(s: Surface) {
    dim(s);
    ui.panel(s, [70, 62, 180, 62]);
    font.draw_wrapped(s, this.text, [82, 72, 156, 30], ui.INK, 1, null, "center");
    for (const b of this.buttons) b.draw(s, this.game.mpos);
  }
}

// ======================================================================= title
/** Hook for a future version label: right-aligned anchor (bottom-right corner) used in TitleScene.draw. */
export const TITLE_VERSION_POS = [SW - 3, SH - 7];

export class TitleScene extends Scene {
  music = "title";

  constructor(game: any) {
    super(game);
    this.t = 0.0;
    this.critters = [];
    const kinds = ["dog", "cat", "bunny", "hamster"];
    for (let i = 0; i < 6; i++) {
      this.critters.push({ kind: kinds[i % 4], v: i % 3, x: -30 - i * 70.0, y: 150 + (i % 2) * 6, sp: 30 + (i % 3) * 6 });
    }
    this.hair = "long";
    this.build();
  }

  build() {
    const has = gstate.has_save();
    // Browser: no Quit button. The 3 remaining buttons sit in a shorter panel
    // centred where the old 4-button panel was (old panel y 76..160, centre 118).
    const x = 214, w = 90;
    this.buttons = [
      new ui.Button([x, 93, w, 15], "Continue", () => this.cont(), has),
      new ui.Button([x, 111, w, 15], "New Game", () => this.new_game()),
      new ui.Button([x, 129, w, 15], "Settings", () => this.game.push(new SettingsMenu(this.game))),
    ];
  }

  resume() {
    this.build();
  }

  cont() {
    const [st, msg] = gstate.load_game();
    if (st == null) {
      this.game.load_message = msg || "No save found.";
      this.build();
      return;
    }
    this.game.state = st;
    const go = () => {
      if (st["phase"] === "evening") this.game.replace(town_after_shift(this.game));
      else this.game.replace(new HQScene(this.game));
    };
    this.game.transition(go);
  }

  new_game() {
    if (gstate.has_save()) {
      this.game.push(new ConfirmMenu(this.game, "This will erase your save. Are you sure?", () => this.start_new(), "Erase", "Cancel"));
    } else {
      this.start_new();
    }
  }

  start_new() {
    gstate.delete_save();
    const st = gstate.new_state();
    st["_new_day_banner"] = true;
    this.game.state = st;
    this.game.save();
    this.game.transition(() => this.game.replace(new HQScene(this.game)));
  }

  event(e: any) {
    for (const b of this.buttons) {
      if (b.handle(e, this.game)) return;
    }
    if (e.type === pg.KEYDOWN && e.key === pg.K_h) {
      this.hair = this.hair === "long" ? "bob" : "long";
    }
  }

  update(dt: number) {
    this.t += dt;
    for (const c of this.critters) {
      c["x"] += c["sp"] * dt;
      if (c["x"] > SW + 30) c["x"] = -40;
    }
    if (Math.trunc(this.t) % 6 === 5 && Math.trunc(this.t - dt) % 6 === 4) {
      this.hair = this.hair === "long" ? "bob" : "long";
    }
  }

  draw(s: Surface) {
    for (let y = 0; y < SH; y += 4) {
      const k = y / SH;
      const c = [Math.trunc(170 + 70 * k), Math.trunc(220 + 20 * k), Math.trunc(250 - 20 * k)];
      pg.draw.rect(s, c, [0, y, SW, 4]);
    }
    const clouds = [[40, 30], [130, 20], [250, 36]];
    clouds.forEach(([cx, cy], i) => {
      const x = pg.mod(cx + this.t * (4 + i), SW + 60) - 30;
      for (const [dx, dy, r] of [[0, 0, 8], [9, 2, 7], [-8, 3, 6], [4, -4, 7]]) {
        pg.draw.circle(s, [255, 255, 255], [Math.trunc(x + dx), cy + dy], r);
      }
    });
    pg.draw.rect(s, [126, 200, 104], [0, 140, SW, 40]);
    for (let x = 0; x < SW; x += 16) {
      s.blit(sprites.tile(x % 32 ? "grass" : "flowers", Math.trunc(this.t * 2) % 2), [x, 140]);
      s.blit(sprites.tile("grass1"), [x, 156]);
      if (x % 48 === 0) s.blit(sprites.tile("path"), [x, 172]);
    }
    s.blit(sprites.building("clinic"), [116, 82]);
    s.blit(sprites.tile("tree"), [90, 110]);
    s.blit(sprites.tile("tree1"), [200, 108]);
    // logo
    const bob = Math.trunc(Math.sin(this.t * 2) * 2);
    font.draw(s, "ZOE'S", [160, 10 + bob], [255, 255, 255], 2, [200, 90, 120], "center");
    font.draw(s, "PET CLINIC", [161, 26 + bob], [200, 90, 120], 4, null, "center");
    font.draw(s, "PET CLINIC", [160, 25 + bob], [255, 236, 120], 4, null, "center");
    font.draw(s, font.HEART, [96, 30 + bob], [240, 90, 120], 2);
    font.draw(s, font.HEART, [214, 30 + bob], [240, 90, 120], 2);
    // zoe
    const fr = (this.t % 3) < 0.15 ? 3 : 0;
    const z = sprites.scaled(["title_zoe", this.hair], sprites.zoe(this.hair, "classic", "down", 0), 3);
    const zb = sprites.scaled(["title_zoe_b", this.hair], sprites.zoe(this.hair, "classic", "down", 3), 3);
    s.blit(fr === 3 ? zb : z, [34, 92 + Math.trunc(Math.sin(this.t * 3))]);
    for (const c of this.critters) {
      const hop = Math.trunc(Math.abs(Math.sin(this.t * 8 + c["x"] * 0.1)) * 3);
      s.blit(sprites.animal(c["kind"], c["v"], 24, Math.trunc(this.t * 3) % 2, "happy"), [Math.trunc(c["x"]), c["y"] - hop]);
    }
    // Browser: panel shortened from 84 to 66 px (Quit removed), same centre.
    ui.panel(s, [206, 85, 106, 66], [255, 248, 236], ui.BORDER);
    for (const b of this.buttons) b.draw(s, this.game.mpos);
    if (this.game.load_message) {
      ui.panel(s, [10, 62, 190, 26], [255, 230, 230], ui.BAD);
      font.draw_wrapped(s, this.game.load_message, [16, 67, 178, 20], ui.INK);
    }
    font.draw(s, "ORIGINAL GAME - F FULLSCREEN - M MUTE", [160, 173], [60, 100, 60], 1, null, "center");
    // ---- version label (bottom-right), set at build time ----------------------
    font.draw(s, "V" + APP_VERSION, TITLE_VERSION_POS, [60, 100, 60], 1, null, "right");
  }
}

// ======================================================================= settings
export class SettingsMenu extends Scene {
  overlay = true;

  constructor(game: any) {
    super(game);
    const st = game.settings;
    const a = game.audio;

    const setm = (v: number) => {
      st["music"] = v;
      a.apply_volume();
    };
    const setf = (v: number) => {
      st["sfx"] = v;
    };

    this.sliders = [["Music", new ui.Slider([130, 58, 110, 6], st["music"] ?? 0.5, setm)],
                    ["Sound FX", new ui.Slider([130, 74, 110, 6], st["sfx"] ?? 0.7, setf)]];
    this.buttons = [new ui.Button([130, 88, 110, 13], "", () => this.toggle_fs()),
                    new ui.Button([130, 104, 110, 13], "", () => this.toggle_mute())];
    // Browser: window-scale buttons removed; Back moved up into the freed row.
    this.back = new ui.Button([120, 124, 80, 14], "Back", () => this.close(), true, null, null, pg.K_ESCAPE);
    this.relabel();
  }

  is_fullscreen(): boolean {
    const h = this.game.host;
    if (h && h.isFullscreen) return !!h.isFullscreen();
    return !!this.game.fullscreen;
  }

  relabel() {
    const st = this.game.settings;
    this.buttons[0].text = "Fullscreen: " + (this.is_fullscreen() ? "ON" : "OFF");
    this.buttons[1].text = "Muted: " + (st["muted"] ? "YES" : "NO");
  }

  toggle_fs() {
    this.game.toggle_fullscreen();
    this.relabel();
  }

  toggle_mute() {
    this.game.settings["muted"] = !this.game.settings["muted"];
    this.game.audio.apply_volume();
    this.relabel();
  }

  close() {
    gstate.save_settings(this.game.settings);
    this.game.pop();
  }

  event(e: any) {
    for (const [, sl] of this.sliders) sl.handle(e, this.game);
    for (const b of [...this.buttons, this.back]) {
      if (b.handle(e, this.game)) return;
    }
  }

  update(_dt: number) {
    // Browser fullscreen changes asynchronously (and via F/F11/Esc), so keep the label live.
    this.relabel();
  }

  draw(s: Surface) {
    dim(s);
    ui.panel(s, [60, 30, 200, 114]);
    font.draw(s, "SETTINGS", [160, 38], ui.ACCENT, 2, null, "center");
    this.sliders.forEach(([label, sl]: [string, any], i: number) => {
      const y = [56, 72][i];
      font.draw(s, label.toUpperCase(), [72, y], ui.INK);
      sl.draw(s, this.game.mpos);
    });
    font.draw(s, "DISPLAY", [72, 92], ui.INK);
    font.draw(s, "AUDIO", [72, 108], ui.INK);
    for (const b of [...this.buttons, this.back]) b.draw(s, this.game.mpos);
  }
}

// ======================================================================= pause
export class PauseMenu extends Scene {
  overlay = true;

  constructor(game: any, in_shift = false) {
    super(game);
    this.in_shift = in_shift;
    this.buttons = [new ui.Button([110, 66, 100, 15], "Resume", () => this.game.pop()),
                    new ui.Button([110, 85, 100, 15], "Settings", () => this.game.push(new SettingsMenu(this.game))),
                    new ui.Button([110, 104, 100, 15], "Save & Quit to Title", () => this.quit())];
  }

  quit() {
    const g = this.game;
    const snap = g.shift_snapshot ?? null;
    if (snap != null) {
      g.state = snap;
      g.shift_snapshot = null;
    }
    g.save();
    g.transition(() => g.replace(new TitleScene(g)));
  }

  event(e: any) {
    if (e.type === pg.KEYDOWN && e.key === pg.K_ESCAPE) {
      this.game.pop();
      return;
    }
    for (const b of this.buttons) {
      if (b.handle(e, this.game)) return;
    }
  }

  draw(s: Surface) {
    dim(s);
    ui.panel(s, [96, 40, 128, this.in_shift ? 100 : 88]);
    font.draw(s, "PAUSED", [160, 48], ui.ACCENT, 2, null, "center");
    for (const b of this.buttons) b.draw(s, this.game.mpos);
    if (this.in_shift) {
      font.draw_wrapped(s, "Quitting mid-shift restarts today's shift.", [104, 124, 112, 16], ui.MUTED, 1, null, "center");
    }
  }
}

// ======================================================================= store
export class StoreMenu extends Scene {
  overlay = true;
  ROW_H = 14;
  VISIBLE = 8;
  static ROW_H = 14;
  static VISIBLE = 8;

  constructor(game: any, online = false) {
    super(game);
    this.online = online;
    this.tab = "tools";
    this.scroll = 0;
    this.sel = null;
    this.particles = new ui.Particles();
    this.tabs = data.STORE_TABS.map(([k, name]: [string, string], i: number) =>
      new ui.Button([14 + i * 56, 22, 54, 12], name, () => this.set_tab(k)));
    this.buy_btn = new ui.Button([190, 140, 70, 14], "Buy", () => this.buy());
    this.close_btn = new ui.Button([290, 8, 18, 12], "X", () => this.close(), true, null, null, pg.K_ESCAPE);
    this.set_tab("tools");
  }

  set_tab(k: string) {
    this.tab = k;
    this.scroll = 0;
    const items = this.items();
    this.sel = items.length ? items[0] : null;
    this.tabs.forEach((b: any, i: number) => {
      b.selected = data.STORE_TABS[i][0] === k;
    });
  }

  items(): string[] {
    const st = this.game.state;
    const out: string[] = [];
    for (const [k, it] of Object.entries<any>(data.STORE_ITEMS)) {
      if (it["cat"] !== this.tab) continue;
      if (it["requires"] && !gstate.has(st, it["requires"]) && !gstate.has(st, k)) continue;
      out.push(k);
    }
    return out;
  }

  owned(k: string): boolean {
    const st = this.game.state;
    const it = data.STORE_ITEMS[k];
    if (it["kind"] === "outfit") return st["outfits"].includes(it["outfit"]);
    if (it["kind"] === "upgrade") return gstate.has(st, k);
    return false;
  }

  count(k: string): number | null {
    const st = this.game.state;
    const it = data.STORE_ITEMS[k];
    if (it["kind"] === "decor") {
      let placed = 0;
      for (const room of Object.values<any>(st["layouts"])) {
        for (const d of room) if (d["name"] === it["decor"]) placed += 1;
      }
      return (st["decor_inv"][it["decor"]] ?? 0) + placed;
    }
    if (it["kind"] === "consumable") return st["consumables"][k] ?? 0;
    return null;
  }

  buy() {
    const st = this.game.state;
    const k = this.sel;
    if (!k) return;
    const it = data.STORE_ITEMS[k];
    if (!gstate.item_unlocked(st, k)) {
      this.game.audio.play("error");
      return;
    }
    if (this.owned(k)) return;
    if (st["coins"] < it["price"]) {
      this.game.audio.play("error");
      this.game.shake(2, 0.15);
      this.particles.text("Not enough coins!", 225, 130, ui.BAD);
      return;
    }
    st["coins"] -= it["price"];
    const kind = it["kind"];
    if (kind === "upgrade") {
      st["owned"].push(k);
    } else if (kind === "outfit") {
      st["outfits"].push(it["outfit"]);
      st["owned"].push(k);
    } else if (kind === "decor") {
      st["decor_inv"][it["decor"]] = (st["decor_inv"][it["decor"]] ?? 0) + 1;
    } else if (kind === "consumable") {
      st["consumables"][k] = (st["consumables"][k] ?? 0) + 1;
    }
    st["stats"]["purchases"] += 1;
    this.game.audio.play("buy");
    this.particles.burst("sparkle", 225, 100, 10, 30);
    for (let i = 0; i < 4; i++) this.particles.add("coin", 225, 120);
    for (const [kind2, key] of gstate.check_general_achievements(st)) {
      _announce(this.game, kind2, key);
    }
    challenges.progress(this.game, "buy");
    this.game.save(); // autosave after purchases
    const items = this.items();
    if (!items.includes(k) && items.length) this.sel = items[0];
  }

  close() {
    this.game.pop();
  }

  event(e: any) {
    if (this.close_btn.handle(e, this.game)) return;
    for (const b of this.tabs) {
      if (b.handle(e, this.game)) return;
    }
    if (this.buy_btn.handle(e, this.game)) return;
    const items = this.items();
    const m = this.game.mpos;
    if (e.type === pg.MOUSEWHEEL) {
      this.scroll = Math.max(0, Math.min(Math.max(0, items.length - this.VISIBLE), this.scroll - e.y));
    } else if (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) {
      const vis = items.slice(this.scroll, this.scroll + this.VISIBLE);
      for (let i = 0; i < vis.length; i++) {
        const r = new Rect(14, 40 + i * this.ROW_H, 156, this.ROW_H - 1);
        if (r.collidepoint(m)) {
          this.sel = vis[i];
          this.game.audio.play("blip");
          return;
        }
      }
      if (new Rect(14, 40, 156, this.ROW_H * this.VISIBLE).collidepoint(m)) return;
      if (e.button === 4) this.scroll = Math.max(0, this.scroll - 1);
    } else if (e.type === pg.KEYDOWN && items.length) {
      let idx = items.includes(this.sel) ? items.indexOf(this.sel) : 0;
      if (e.key === pg.K_DOWN || e.key === pg.K_s) {
        idx = Math.min(items.length - 1, idx + 1);
      } else if (e.key === pg.K_UP || e.key === pg.K_w) {
        idx = Math.max(0, idx - 1);
      } else if (e.key === pg.K_RETURN || e.key === pg.K_SPACE) {
        this.buy();
        return;
      } else {
        return;
      }
      this.sel = items[idx];
      if (idx < this.scroll) this.scroll = idx;
      else if (idx >= this.scroll + this.VISIBLE) this.scroll = idx - this.VISIBLE + 1;
    }
  }

  update(dt: number) {
    this.particles.update(dt);
  }

  draw(s: Surface) {
    const st = this.game.state;
    dim(s, 140);
    ui.panel(s, [8, 6, 304, 168]);
    font.draw(s, this.online ? "ONLINE CATALOG" : "BRAMBLE'S PET SUPPLY", [16, 11], ui.ACCENT);
    s.blit(sprites.icon("coin"), [230, 8]);
    font.draw(s, String(st["coins"]), [244, 11], [170, 120, 30]);
    this.close_btn.draw(s, this.game.mpos);
    for (const b of this.tabs) b.draw(s, this.game.mpos);
    const items = this.items();
    pg.draw.rect(s, [246, 238, 228], [12, 38, 160, this.ROW_H * this.VISIBLE + 4]);
    items.slice(this.scroll, this.scroll + this.VISIBLE).forEach((k, i) => {
      const it = data.STORE_ITEMS[k];
      const r = new Rect(14, 40 + i * this.ROW_H, 156, this.ROW_H - 1);
      const hov = r.collidepoint(this.game.mpos);
      const col = k === this.sel ? [250, 210, 222] : (hov ? [255, 250, 240] : [255, 255, 252]);
      pg.draw.rect(s, col, r);
      s.blit(sprites.item_icon(k), [r.x + 1, r.y + 1]);
      const unlocked = gstate.item_unlocked(st, k);
      font.draw(s, it["name"], [r.x + 16, r.y + 4], unlocked ? ui.INK : ui.MUTED);
      if (this.owned(k)) {
        font.draw(s, "OWNED", [r.right - 3, r.y + 4], ui.GOOD, 1, null, "right");
      } else if (!unlocked) {
        s.blit(sprites.icon("lock"), [r.right - 13, r.y + 1]);
      } else {
        font.draw(s, String(it["price"]), [r.right - 3, r.y + 4], st["coins"] >= it["price"] ? [170, 120, 30] : ui.BAD, 1, null, "right");
      }
    });
    if (items.length > this.VISIBLE) {
      font.draw(s, "SCROLL FOR MORE", [92, 155], ui.MUTED, 1, null, "center");
    }
    // detail
    if (this.sel) {
      const k = this.sel;
      const it = data.STORE_ITEMS[k];
      const dr = new Rect(178, 38, 128, 118);
      ui.panel(s, dr, [255, 255, 252], ui.BORDER, false);
      const big = sprites.scaled(["store_big", k], sprites.item_icon(k), 3);
      s.blit(big, [dr.centerx - Math.floor(big.get_width() / 2), dr.y + 6]);
      if (it["kind"] === "outfit") {
        const prev = sprites.scaled(["store_outfit", st["hair"], it["outfit"]], sprites.zoe(st["hair"], it["outfit"], "down", 0), 2);
        s.blit(prev, [dr.right - 36, dr.y + 2]);
      }
      font.draw(s, it["name"].toUpperCase(), [dr.centerx, dr.y + 46], ui.ACCENT, 1, null, "center");
      font.draw_wrapped(s, it["desc"], [dr.x + 6, dr.y + 56, dr.w - 12, 30], ui.INK, 1, null, "center");
      const c = this.count(k);
      if (c != null) {
        font.draw(s, `YOU HAVE: ${c}`, [dr.centerx, dr.y + 84], ui.MUTED, 1, null, "center");
      }
      const unlocked = gstate.item_unlocked(st, k);
      if (this.owned(k)) {
        font.draw(s, "OWNED!", [dr.centerx, dr.y + 96], ui.GOOD, 1, null, "center");
        this.buy_btn.visible = false;
      } else if (!unlocked) {
        const need = data.RANKS[Math.min(data.RANKS.length - 1, it["rank"] ?? 0)];
        let txt = `UNLOCKS AT ${need.toUpperCase()}`;
        if (it["requires"] && !gstate.has(st, it["requires"])) {
          txt = "BUY " + data.STORE_ITEMS[it["requires"]]["name"].toUpperCase() + " FIRST";
        }
        font.draw_wrapped(s, txt, [dr.x + 6, dr.y + 94, dr.w - 12, 20], ui.BAD, 1, null, "center");
        this.buy_btn.visible = false;
      } else {
        this.buy_btn.visible = true;
        this.buy_btn.enabled = st["coins"] >= it["price"];
        this.buy_btn.text = `Buy - ${it["price"]}`;
        this.buy_btn.rect = new Rect(dr.centerx - 36, dr.bottom - 20, 72, 14);
        this.buy_btn.draw(s, this.game.mpos);
      }
    }
    this.particles.draw(s);
    font.draw(s, "CLICK AN ITEM - ESC TO CLOSE", [160, 166], ui.MUTED, 1, null, "center");
  }
}

// ======================================================================= mirror
export class MirrorMenu extends Scene {
  overlay = true;

  constructor(game: any) {
    super(game);
    this.t = 0.0;
    const st = game.state;
    this.hair_btns = [new ui.Button([128, 46, 74, 14], "Long Hair", () => this.set_hair("long")),
                      new ui.Button([206, 46, 74, 14], "Bob", () => this.set_hair("bob"))];
    this.outfit_btns = [];
    st["outfits"].forEach((o: string, i: number) => {
      const col = i % 3, row = Math.floor(i / 3);
      const info = data.OUTFITS[o];
      const b = new ui.Button([126 + col * 57, 80 + row * 14, 55, 12], info["short"] || info["name"],
                              () => this.set_outfit(o), true, null, info["work"] ? null : [236, 226, 250]);
      this.outfit_btns.push([o, b]);
    });
    this.done = new ui.Button([168, 150, 70, 14], "Done", () => this.close(), true, null, null, pg.K_ESCAPE);
    this.particles = new ui.Particles();
    this.relabel();
  }

  relabel() {
    const st = this.game.state;
    this.hair_btns[0].selected = st["hair"] === "long";
    this.hair_btns[1].selected = st["hair"] === "bob";
    for (const [o, b] of this.outfit_btns) b.selected = st["outfit"] === o;
  }

  set_hair(h: string) {
    this.game.state["hair"] = h;
    this.particles.burst("sparkle", 70, 90, 10, 30);
    this.game.audio.play("sparkle");
    this.relabel();
  }

  set_outfit(o: string) {
    this.game.state["outfit"] = o;
    this.particles.burst("sparkle", 70, 90, 10, 30);
    this.game.audio.play("sparkle");
    this.relabel();
  }

  close() {
    this.game.save();
    this.game.pop();
  }

  _all_buttons(): any[] {
    return [...this.hair_btns, ...this.outfit_btns.map(([, b]: [string, any]) => b), this.done];
  }

  event(e: any) {
    for (const b of this._all_buttons()) {
      if (b.handle(e, this.game)) return;
    }
  }

  update(dt: number) {
    this.t += dt;
    this.particles.update(dt);
  }

  draw(s: Surface) {
    const st = this.game.state;
    dim(s);
    ui.panel(s, [20, 20, 280, 150]);
    font.draw(s, "MIRROR", [160, 26], ui.ACCENT, 2, null, "center");
    pg.draw.ellipse(s, [226, 180, 80], [32, 38, 76, 110]);
    pg.draw.ellipse(s, [200, 232, 250], [36, 42, 68, 102]);
    const d = ["down", "right", "up", "left"][Math.trunc(this.t / 1.2) % 4];
    const fr = [1, 0, 2, 0][Math.trunc(this.t * 6) % 4];
    const img = sprites.scaled(["mirror", st["hair"], st["outfit"], d, fr], sprites.zoe(st["hair"], st["outfit"], d, fr), 3);
    s.blit(img, [46, 56]);
    font.draw(s, "HAIR (FREE!)", [128, 38], ui.INK);
    font.draw(s, "OUTFITS", [128, 72], ui.INK);
    const nice = gstate.dressed_for_night(st);
    font.draw(s, nice ? "READY FOR CLERY'S!" : "SCRUBS: NOT ALLOWED AT CLERY'S", [296, 72], nice ? ui.GOOD : ui.MUTED, 1, null, "right");
    font.draw(s, data.OUTFITS[st["outfit"]]["name"].toUpperCase(), [70, 148], ui.ACCENT, 1, null, "center");
    for (const b of this._all_buttons()) b.draw(s, this.game.mpos);
    if (st["outfits"].length < Object.keys(data.OUTFITS).length) {
      font.draw(s, "MORE OUTFITS AT THE SHOP!", [212, 140], ui.MUTED, 1, null, "center");
    }
    this.particles.draw(s);
  }
}

// ======================================================================= trophies
export class TrophyMenu extends Scene {
  overlay = true;

  constructor(game: any) {
    super(game);
    this.close_btn = new ui.Button([134, 156, 52, 13], "Close", () => this.game.pop(), true, null, null, pg.K_ESCAPE);
  }

  event(e: any) {
    this.close_btn.handle(e, this.game);
  }

  draw(s: Surface) {
    const st = this.game.state;
    dim(s);
    ui.panel(s, [8, 8, 304, 164]);
    font.draw(s, "TROPHY SHELF", [160, 13], ui.ACCENT, 2, null, "center");
    const m = this.game.mpos;
    let tip: [string, string] | null = null;
    // badges
    pg.draw.rect(s, [200, 150, 104], [16, 28, 150, 100]);
    Object.keys(data.BADGES).forEach((k, i) => {
      const c = i % 4, r = Math.floor(i / 4);
      const x = 22 + c * 36, y = 32 + r * 48;
      const got = st["badges"].includes(k);
      const img = sprites.scaled(["badge_big", k, got], sprites.badge(k, !got), 2);
      s.blit(img, [x, y]);
      pg.draw.rect(s, [160, 110, 70], [x - 4, y + 34, 40, 3]);
      const rect = new Rect(x, y, 32, 32);
      if (rect.collidepoint(m)) {
        tip = [got ? data.BADGES[k]["name"] : "??? Badge", data.BADGES[k]["desc"]];
      }
    });
    font.draw(s, `BADGES ${st["badges"].length}/${Object.keys(data.BADGES).length}`, [91, 130], ui.INK, 1, null, "center");
    // achievements
    font.draw(s, "ACHIEVEMENTS", [174, 30], ui.INK);
    Object.entries<any>(data.ACHIEVEMENTS).forEach(([k, a], i) => {
      const y = 39 + i * 6; // 6px rows so all achievements fit
      const got = st["achievements"].includes(k);
      font.draw(s, font.STAR, [174, y], got ? ui.GOLD : [190, 180, 196]);
      font.draw(s, got ? a["name"] : "???", [182, y], got ? ui.INK : ui.MUTED);
      if (new Rect(174, y - 1, 130, 6).collidepoint(m)) tip = [a["name"], a["desc"]];
    });
    const s_ = st["stats"];
    font.draw(s, `TREATED ${s_["treated"]} - FLEAS ${s_["fleas"]} - RARE ${s_["rare"]} - DAYS ${s_["days_worked"]}`,
              [160, 144], ui.MUTED, 1, null, "center");
    this.close_btn.draw(s, m);
    if (tip) {
      const w = Math.max(font.text_width(tip[0]), font.text_width(tip[1])) + 10;
      const x = Math.min(SW - w - 2, m[0] + 6);
      const y = Math.min(SH - 22, m[1] + 8);
      ui.panel(s, [x, y, w, 20], [255, 255, 230], ui.BORDER);
      font.draw(s, tip[0], [x + 5, y + 4], ui.ACCENT);
      font.draw(s, tip[1], [x + 5, y + 12], ui.INK);
    }
  }
}

// ======================================================================= pets
export class PetMenu extends Scene {
  overlay = true;

  constructor(game: any, walker: any, world: any) {
    super(game);
    this.w = walker;
    this.pet = walker.pet;
    this.world = world;
    this.t = 0.0;
    this.particles = new ui.Particles();
    this.renaming = null;
    const x = 160;
    this.buttons = [new ui.Button([x, 60, 70, 14], "Pet", () => this.do_pet()),
                    new ui.Button([x, 78, 70, 14], "Feed", () => this.do_feed()),
                    new ui.Button([x, 96, 70, 14], "Play", () => this.do_play()),
                    new ui.Button([x, 114, 70, 14], "Rename", () => this.do_rename()),
                    new ui.Button([x, 136, 70, 14], "Bye!", () => this.close(), true, null, null, pg.K_ESCAPE)];
    this.msg = "";
  }

  hearts(n = 6) {
    this.particles.burst("heart", 104, 92, n, 30);
    this.game.audio.play("heart");
    this.pet["happy_t"] = 3.0;
  }

  do_pet() {
    this.hearts(5);
    this.msg = `${this.pet["name"]} loves the pats!`;
  }

  do_feed() {
    const st = this.game.state;
    if ((st["consumables"]["pet_food"] ?? 0) <= 0) {
      this.msg = "No pet food! Buy cans at the shop.";
      this.game.audio.play("error");
      return;
    }
    st["consumables"]["pet_food"] -= 1;
    if (st["consumables"]["pet_food"] <= 0) delete st["consumables"]["pet_food"];
    this.hearts(9);
    this.msg = "Nom nom nom! So happy!";
  }

  do_play() {
    this.hearts(7);
    this.particles.burst("sparkle", 104, 80, 8, 30);
    this.msg = `${this.pet["name"]} zooms around!`;
  }

  do_rename() {
    this.renaming = new ui.TextInput([70, 140, 80, 14], this.pet["name"], 10);
    this.game.typing = true;
    try {
      pg.key.start_text_input();
    } catch (_e) {
      /* ignore */
    }
  }

  finish_rename() {
    if (this.renaming && this.renaming.text.trim()) {
      this.pet["name"] = this.renaming.text.trim().slice(0, 10);
      this.msg = `Hello, ${this.pet["name"]}!`;
      this.hearts(4);
    }
    this.renaming = null;
    this.game.typing = false;
  }

  close() {
    if (this.renaming) this.finish_rename();
    this.game.save();
    this.game.pop();
  }

  event(e: any) {
    if (this.renaming) {
      if (e.type === pg.KEYDOWN && (e.key === pg.K_RETURN || e.key === pg.K_ESCAPE)) {
        this.finish_rename();
        return;
      }
      if (this.renaming.handle(e)) return;
    }
    for (const b of this.buttons) {
      if (b.handle(e, this.game)) return;
    }
  }

  update(dt: number) {
    this.t += dt;
    this.particles.update(dt);
  }

  draw(s: Surface) {
    dim(s);
    ui.panel(s, [60, 40, 184, 116]);
    font.draw(s, this.pet["name"].toUpperCase(), [104, 46], ui.ACCENT, 1, null, "center");
    const mood = (this.pet["happy_t"] ?? 0) > 0 ? "happy" : "normal";
    const img = sprites.animal_big(this.pet["kind"], this.pet["variant"] ?? 0, Math.trunc(this.t * 2) % 2, mood, 2);
    const hop = mood === "happy" ? Math.trunc(Math.abs(Math.sin(this.t * 6)) * 3) : 0;
    s.blit(img, [80, 66 - hop]);
    font.draw(s, data.ANIMALS[this.pet["kind"]]["name"].toUpperCase(), [104, 118], ui.MUTED, 1, null, "center");
    if (this.msg) {
      font.draw_wrapped(s, this.msg, [66, 126, 86, 14], ui.INK, 1, null, "center");
    }
    for (const b of this.buttons) b.draw(s, this.game.mpos);
    if (this.renaming) {
      ui.panel(s, [64, 132, 92, 24], [255, 250, 236], ui.BORDER);
      this.renaming.draw(s, this.t);
      font.draw(s, "TYPE + ENTER", [110, 134], ui.MUTED, 1, null, "center");
    }
    this.particles.draw(s);
  }
}

// ======================================================================= decorating
export class DecorateMenu extends Scene {
  overlay = true;

  constructor(game: any, hq_scene: any) {
    super(game);
    this.hq = hq_scene;
    this.room = "hq";
    this.held = null; // {name, rot}
    this.t = 0.0;
    this.room_btns = [new ui.Button([216, 150, 30, 12], "HQ", () => this.set_room("hq")),
                      new ui.Button([248, 150, 40, 12], "CLINIC", () => this.set_room("clinic"))];
    this.done_btn = new ui.Button([290, 150, 28, 12], "OK", () => this.close());
    this.hq.cam = [0, 0];
    this.set_room("hq");
  }

  set_room(r: string) {
    this.return_held();
    this.room = r;
    this.room_btns[0].selected = r === "hq";
    this.room_btns[1].selected = r === "clinic";
  }

  // grid geometry
  origin(): number[] {
    if (this.room === "hq") return [-Math.trunc(this.hq.cam[0]), -Math.trunc(this.hq.cam[1])];
    return DECOR_ORIGIN;
  }

  bounds(): number[] {
    if (this.room === "hq") return [1, 2, 18, 8];
    return [0, 0, CLINIC_GRID[0] - 1, CLINIC_GRID[1] - 1];
  }

  tile_at(m: number[]): number[] {
    const [ox, oy] = this.origin();
    return [Math.floor((m[0] - ox) / 16), Math.floor((m[1] - oy) / 16)];
  }

  footprint(name: string, x: number, y: number): number[][] {
    const [w, h] = data.DECOR[name]["size"];
    const out: number[][] = [];
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.push([x + i, y + j]);
    return out;
  }

  valid(name: string, x: number, y: number): boolean {
    const [x0, y0, x1, y1] = this.bounds();
    const cells = this.footprint(name, x, y);
    const layer = name === "rug" ? 0 : 1;
    let fixed: Set<string>;
    let pt: number[] | null;
    if (this.room === "hq") {
      fixed = HQScene.fixed_tiles; // static Set<string> of "x,y" keys
      pt = [Math.floor(Math.trunc(this.hq.player.x) / 16), Math.floor(Math.trunc(this.hq.player.y - 2) / 16)];
    } else {
      fixed = new Set();
      pt = null;
    }
    const taken = new Set<string>();
    for (const d of this.game.state["layouts"][this.room]) {
      if ((d["name"] === "rug" ? 0 : 1) === layer) {
        for (const c of this.footprint(d["name"], d["x"], d["y"])) taken.add(`${c[0]},${c[1]}`);
      }
    }
    for (const c of cells) {
      if (!(x0 <= c[0] && c[0] <= x1 && y0 <= c[1] && c[1] <= y1)) return false;
      const key = c[0] + "," + c[1];
      if (fixed.has(key) || taken.has(key)) return false;
      if (pt && c[0] === pt[0] && c[1] === pt[1] && data.DECOR[name]["solid"]) return false;
    }
    return true;
  }

  inv_items(): string[] {
    return Object.keys(data.DECOR).filter((k) => (this.game.state["decor_inv"][k] ?? 0) > 0);
  }

  inv_rects(): [string, Rect][] {
    return this.inv_items().slice(0, 10).map((k, i) => [k, new Rect(4 + i * 21, 148, 20, 20)] as [string, Rect]);
  }

  return_held() {
    if (this.held) {
      const inv = this.game.state["decor_inv"];
      inv[this.held["name"]] = (inv[this.held["name"]] ?? 0) + 1;
      this.held = null;
    }
  }

  refresh() {
    this.hq.apply_decor();
    for (const [kind, key] of gstate.check_general_achievements(this.game.state)) {
      _announce(this.game, kind, key);
    }
  }

  close() {
    this.return_held();
    this.refresh();
    this.game.save();
    this.game.pop();
  }

  event(e: any) {
    const st = this.game.state;
    const m = this.game.mpos;
    if (e.type === pg.KEYDOWN) {
      if (e.key === pg.K_ESCAPE) {
        if (this.held) this.return_held();
        else this.close();
        return;
      }
      if (e.key === pg.K_r && this.held) {
        this.held["rot"] = (this.held["rot"] + 1) % 4;
        this.game.audio.play("blip");
        return;
      }
      if ((e.key === pg.K_s || e.key === pg.K_DELETE || e.key === pg.K_BACKSPACE) && this.held) {
        this.return_held();
        this.game.audio.play("whoosh");
        return;
      }
    }
    for (const b of [...this.room_btns, this.done_btn]) {
      if (b.handle(e, this.game)) return;
    }
    if (e.type === pg.MOUSEBUTTONDOWN && e.button === 3 && this.held) {
      this.return_held();
      this.game.audio.play("whoosh");
      return;
    }
    if (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) {
      for (const [k, r] of this.inv_rects()) {
        if (r.collidepoint(m)) {
          this.return_held();
          st["decor_inv"][k] -= 1;
          if (st["decor_inv"][k] <= 0) delete st["decor_inv"][k];
          this.held = { name: k, rot: 0 };
          this.game.audio.play("select");
          return;
        }
      }
      if (m[1] >= 146) return;
      const [tx, ty] = this.tile_at(m);
      if (this.held) {
        if (this.valid(this.held["name"], tx, ty)) {
          st["layouts"][this.room].push({ name: this.held["name"], x: tx, y: ty, rot: this.held["rot"] });
          this.held = null;
          this.game.audio.play("pop");
          this.refresh();
        } else {
          this.game.audio.play("error");
        }
      } else {
        const lay: any[] = st["layouts"][this.room];
        // Python: sorted(lay, key=lambda d: d["name"] == "rug") -> stable, non-rugs first
        const order = lay.map((d, i) => [d, i] as [any, number])
          .sort((a, b) => (Number(a[0]["name"] === "rug") - Number(b[0]["name"] === "rug")) || (a[1] - b[1]))
          .map(([d]) => d);
        for (const d of order) {
          if (this.footprint(d["name"], d["x"], d["y"]).some((c) => c[0] === tx && c[1] === ty)) {
            lay.splice(lay.indexOf(d), 1);
            this.held = { name: d["name"], rot: d["rot"] ?? 0 };
            this.game.audio.play("select");
            this.refresh();
            return;
          }
        }
      }
    }
  }

  update(dt: number) {
    this.t += dt;
  }

  draw(s: Surface) {
    const st = this.game.state;
    if (this.room === "clinic") {
      s.fill([0, 0, 0]);
      draw_lobby_bg(s, st);
      pg.draw.rect(s, [176, 124, 84], [0, 0, 320, 32]);
      font.draw(s, "DECORATING: CLINIC LOBBY", [160, 12], [255, 240, 220], 1, null, "center");
    } else {
      ui.panel(s, [60, 2, 200, 11], [255, 250, 236], ui.BORDER, false);
      font.draw(s, "DECORATING: ZOE'S HQ", [160, 5], ui.ACCENT, 1, null, "center");
    }
    const [ox, oy] = this.origin();
    const [x0, y0, x1, y1] = this.bounds();
    const grid = new Surface([SW, SH], SRCALPHA);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        pg.draw.rect(grid, [255, 255, 255, 50], [ox + tx * 16, oy + ty * 16, 16, 16], 1);
      }
    }
    s.blit(grid, [0, 0]);
    const m = this.game.mpos;
    if (this.held && m[1] < 146) {
      const [tx, ty] = this.tile_at(m);
      const ok = this.valid(this.held["name"], tx, ty);
      const [w, h] = data.DECOR[this.held["name"]]["size"];
      const col = ok ? [120, 230, 120, 110] : [240, 90, 90, 110];
      const ov = new Surface([w * 16, h * 16], SRCALPHA);
      ov.fill(col);
      s.blit(ov, [ox + tx * 16, oy + ty * 16]);
      const img = sprites.decor(this.held["name"], this.held["rot"]);
      s.blit(img, [ox + tx * 16, oy + (ty + h) * 16 - img.get_height()]);
    }
    // inventory strip
    ui.panel(s, [0, 145, 320, 35], [255, 248, 236], ui.BORDER, false);
    for (const [k, r] of this.inv_rects()) {
      pg.draw.rect(s, [246, 236, 246], r);
      pg.draw.rect(s, ui.BORDER, r, 1);
      const ic = sprites.decor_icon(k);
      s.blit(ic, [r.centerx - Math.floor(ic.get_width() / 2), r.y + 2]);
      font.draw(s, `${st["decor_inv"][k] ?? 0}`, [r.right - 2, r.bottom - 6], ui.INK, 1, null, "right");
    }
    if (!this.inv_items().length) {
      font.draw(s, "NO DECOR IN STORAGE - BUY SOME AT THE SHOP!", [108, 156], ui.MUTED, 1, null, "center");
    }
    for (const b of [...this.room_btns, this.done_btn]) b.draw(s, this.game.mpos);
    font.draw(s, "CLICK ITEM TO PICK UP - R ROTATE - RIGHT CLICK/S STORE", [160, 172], ui.MUTED, 1, null, "center");
  }
}
