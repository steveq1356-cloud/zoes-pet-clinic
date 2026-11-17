/* Walkable overworld: Pawsley Town, Zoe's HQ, and the Pet Supply Store. */
import * as pg from "./pg";
import { Rect, Surface, SRCALPHA } from "./pg";
import * as config from "./config";
import * as data from "./data";
import * as font from "./font";
import * as sprites from "./sprites";
import * as ui from "./ui";
import * as gstate from "./state";
import { Scene } from "./engine";
import { PetMenu, PauseMenu, MirrorMenu, TrophyMenu, StoreMenu, DecorateMenu } from "./menus";
import { ShiftScene } from "./clinic";
import * as friends from "./friends";
import { PoolGame } from "./bargames";
import { CardGame } from "./cards";
import { KartGame } from "./kart";
import * as props from "./props";
import * as props2 from "./props2";
import { FoodMenu, ShotChallenge, draw_buff_tags } from "./venues";
import { SandwichGame, DartsGame } from "./minigames2";
import * as challenges from "./challenges";
import { TasksMenu } from "./challenges";

export const T = config.TILE;
export const SW = config.NATIVE_W;
export const SH = config.NATIVE_H;
export const DIRS: Record<string, number[]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** key for tile-coordinate sets (Python used (x, y) tuples) */
function tk(x: number, y: number): string {
  return x + "," + y;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

// ======================================================================= entities
export class Walker {
  x: number;
  y: number;
  dir: string;
  anim = 0.0;
  moving = false;
  [key: string]: any;

  constructor(x: number, y: number, d = "down") {
    this.x = x;
    this.y = y;
    this.dir = d;
    this.anim = 0.0;
    this.moving = false;
  }

  hitbox(x: number = null, y: number = null): Rect {
    x = x == null ? this.x : x;
    y = y == null ? this.y : y;
    return new Rect(Math.trunc(x) - 5, Math.trunc(y) - 5, 10, 5);
  }

  frame(t: number): number {
    if (this.moving) return [1, 0, 2, 0][pg.mod(Math.trunc(this.anim), 4)];
    return pg.mod(t, 4.0) < 0.15 ? 3 : 0;
  }
}

export class NPC extends Walker {
  name: string;
  home: number[];
  wander: number | null;
  patrol: number[] | null;
  target: number[] | null;
  wait: number;
  talking: boolean;
  speed: number;

  constructor(name: string, x: number, y: number, d = "down", wander: number = null, patrol: number[] = null) {
    super(x, y, d);
    this.name = name;
    this.home = [x, y];
    this.wander = wander; // radius in px
    this.patrol = patrol; // (x1, x2) horizontal patrol
    this.target = null;
    this.wait = pg.random.uniform(0.5, 3);
    this.talking = false;
    this.speed = patrol ? 55 : 26;
  }

  update(dt: number, scene: any) {
    if (this.talking) {
      this.moving = false;
      return;
    }
    if (this.patrol) {
      const tx = this.dir === "right" ? this.patrol[1] : this.patrol[0];
      const step = this.speed * dt * (tx > this.x ? 1 : -1);
      const nx = this.x + step;
      if (!scene.blocked(this.hitbox(nx, this.y), this)) {
        this.x = nx;
        this.moving = true;
      }
      if (Math.abs(this.x - tx) < 2 || scene.blocked(this.hitbox(nx, this.y), this)) {
        this.dir = this.dir === "right" ? "left" : "right";
      }
      this.anim += dt * 10;
      return;
    }
    if (!this.wander) {
      this.moving = false;
      return;
    }
    if (this.target == null) {
      this.wait -= dt;
      this.moving = false;
      if (this.wait <= 0) {
        const a = pg.random.uniform(0, 6.28);
        const r = pg.random.uniform(0, this.wander);
        this.target = [this.home[0] + Math.cos(a) * r, this.home[1] + Math.sin(a) * r];
      }
      return;
    }
    const dx = this.target[0] - this.x;
    const dy = this.target[1] - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) {
      this.target = null;
      this.wait = pg.random.uniform(1.5, 4);
      return;
    }
    const vx = (dx / dist) * this.speed * dt;
    const vy = (dy / dist) * this.speed * dt;
    this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    const nr = this.hitbox(this.x + vx, this.y + vy);
    if (scene.blocked(nr, this)) {
      this.target = null;
      this.wait = 1.0;
      return;
    }
    this.x += vx;
    this.y += vy;
    this.moving = true;
    this.anim += dt * 7;
  }

  sprite(t: number): Surface {
    return sprites.npc(this.name, this.dir, this.frame(t));
  }
}

/** A friend walking alongside Zoe: follows her breadcrumb trail, ignores collisions. */
export class Follower extends NPC {
  idx: number;
  constructor(name: string, x: number, y: number, idx: number) {
    super(name, x, y, "down");
    this.idx = idx;
    this.follower = true;
  }

  update(dt: number, scene: any) {
    if (this.talking) {
      this.moving = false;
      return;
    }
    const tr = scene.trail || [];
    const k = tr.length - 1 - (this.idx + 1) * 9;
    if (k < 0) {
      this.moving = false;
      return;
    }
    const [tx, ty] = tr[k];
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
    if (d < 1) {
      this.moving = false;
      return;
    }
    const sp = Math.min(d, Math.max(70, d * 5) * dt);
    this.x += (dx / d) * sp;
    this.y += (dy / d) * sp;
    this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    this.moving = true;
    this.anim += dt * 9;
  }
}

/** Little speech bubble over someone's head (world coords). */
function draw_bubble(s: Surface, text: string, x: number, y: number) {
  const w = font.text_width(text) + 8;
  const bx = Math.max(2, Math.min(SW - w - 2, Math.trunc(x) - Math.floor(w / 2)));
  ui.panel(s, [bx, Math.trunc(y), w, 11], [255, 255, 255], ui.BORDER, false);
  pg.draw.rect(s, [255, 255, 255], [Math.trunc(x) - 1, Math.trunc(y) + 10, 3, 2]);
  font.draw(s, text, [bx + 4, Math.trunc(y) + 3], ui.INK);
}

export class PetWalker {
  pet: any;
  x: number;
  y: number;
  area: Rect;
  target: number[] | null;
  wait: number;
  t: number;
  moving: boolean;
  [key: string]: any;

  constructor(pet: any, x: number, y: number, area: Rect) {
    this.pet = pet;
    this.x = x;
    this.y = y;
    this.area = area; // Rect of wander zone
    this.target = null;
    this.wait = pg.random.uniform(0.5, 2);
    this.t = pg.random.uniform(0, 5);
    this.moving = false;
  }

  hitbox(): Rect {
    return new Rect(Math.trunc(this.x) - 6, Math.trunc(this.y) - 5, 12, 5);
  }

  update(dt: number, scene: any) {
    this.t += dt;
    if (this.target == null) {
      this.moving = false;
      this.wait -= dt;
      if (this.wait <= 0) {
        this.target = [
          pg.random.uniform(this.area.left, this.area.right),
          pg.random.uniform(this.area.top, this.area.bottom),
        ];
      }
      return;
    }
    const dx = this.target[0] - this.x;
    const dy = this.target[1] - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) {
      this.target = null;
      this.wait = pg.random.uniform(1, 4);
      return;
    }
    const sp = 22;
    const nx = this.x + (dx / d) * sp * dt;
    const ny = this.y + (dy / d) * sp * dt;
    const r = new Rect(Math.trunc(nx) - 6, Math.trunc(ny) - 5, 12, 5);
    if (scene.blocked(r, this)) {
      this.target = null;
      this.wait = 1;
      return;
    }
    this.x = nx;
    this.y = ny;
    this.moving = true;
  }

  draw(s: Surface, cx: number, cy: number) {
    const p = this.pet;
    const frame = pg.mod(Math.trunc(this.t * 3), 2);
    const mood = (p.happy_t ?? 0) > 0 ? "happy" : "normal";
    const img = sprites.animal(p.kind, p.variant ?? 0, 16, frame, mood);
    const hop = this.moving ? Math.trunc(Math.abs(Math.sin(this.t * 10)) * 2) : 0;
    s.blit(img, [Math.trunc(this.x) - 8 - cx, Math.trunc(this.y) - 15 - hop - cy]);
  }
}

// ======================================================================= base scene
export class WorldScene extends Scene {
  music = "town";
  name = "world";

  constructor(game: any, spawn: number[] = null, facing = "down") {
    super(game);
    this.st = game.state;
    this.tiles = [];
    this.solid = new Set<string>(); // "x,y" tile keys
    this.objects = []; // dict(img, x, y, solid(rect or None), sort)
    this.interacts = []; // dict(rect, prompt, fn)
    this.doors = []; // dict(rect, fn, need_dir)
    this.npcs = [];
    this.pets = [];
    this.dialogue = null;
    this.particles = new ui.Particles();
    this.banner = null;
    this.anim_t = 0.0;
    this.build();
    const [sx, sy] = spawn ? spawn : this.default_spawn();
    this.player = new Walker(sx, sy, facing);
    this.cam = [0, 0];
    this._update_cam(true);
  }

  // -- override
  build() {}

  default_spawn(): number[] {
    return [Math.floor(SW / 2), Math.floor(SH / 2)];
  }

  get mw(): number {
    return this.tiles[0].length * T;
  }

  get mh(): number {
    return this.tiles.length * T;
  }

  add_obj(img: Surface, x: number, y: number, solid: any = null, sort: number = null): any {
    const o: any = {
      img, x, y, solid: solid ? new Rect(solid) : null,
      sort: sort != null ? sort : y + img.get_height(),
    };
    this.objects.push(o);
    return o;
  }

  spawn_pets(area: Rect) {
    this.pets = [];
    for (const p of this.st.pets) {
      this.pets.push(new PetWalker(p, pg.random.uniform(area.left, area.right),
        pg.random.uniform(area.top, area.bottom), area));
    }
  }

  // -- collision
  blocked(rect: Rect, who: any = null): boolean {
    const tx0 = Math.floor(rect.left / T), ty0 = Math.floor(rect.top / T);
    const tx1 = Math.floor((rect.right - 1) / T), ty1 = Math.floor((rect.bottom - 1) / T);
    for (let ty = ty0; ty < ty1 + 1; ty++) {
      for (let tx = tx0; tx < tx1 + 1; tx++) {
        if (tx < 0 || ty < 0 || ty >= this.tiles.length || tx >= this.tiles[0].length) return true;
        if (this.solid.has(tk(tx, ty))) return true;
      }
    }
    for (const o of this.objects) {
      if (o.solid != null && o.solid.colliderect(rect)) return true;
    }
    if (who == null || who !== this.player) {
      for (const n of this.npcs) {
        if (n !== who && n.hitbox().colliderect(rect)) return true;
      }
    }
    const player = this.player ?? null;
    if (who != null && who !== player && this.player !== undefined) {
      if (this.player.hitbox().colliderect(rect)) return true;
    }
    return false;
  }

  // -- helpers
  say(pages: any[], on_done: (() => void) = null, choices: any[] = null) {
    this.dialogue = new ui.DialogueBox(this.game, pages, on_done, choices);
  }

  zoe_portrait(): Surface {
    return sprites.zoe_portrait(this.st.hair, this.st.outfit);
  }

  npc_say(npc_name: string, lines: string[], on_done: (() => void) = null, choices: any[] = null, title: string = null) {
    const port = npc_name in data.PEOPLE ? sprites.npc_portrait(npc_name) : null;
    let nm = title || capitalize(npc_name);
    if (npc_name === "maple") nm = "Dr. Maple";
    if (npc_name === "bramble") nm = "Mr. Bramble";
    this.say(lines.map((l) => [nm, port, l]), on_done, choices);
  }

  zoe_say(lines: string[], on_done: (() => void) = null, choices: any[] = null) {
    this.say(lines.map((l) => ["Zoe", this.zoe_portrait(), l]), on_done, choices);
  }

  talk_npc(npc: NPC) {
    const rank = gstate.rank_index(this.st.xp);
    const pool = (data.NPC_LINES[npc.name] ?? [[0, "Hello!"]]).filter(([r]: any) => r <= rank).map(([, t]: any) => t);
    const key = "talks_" + npc.name;
    if (!this.st.talk_counts) this.st.talk_counts = {};
    const n = this.st.talk_counts[key] ?? 0;
    this.st.talk_counts[key] = n + 1;
    const line = pool[pg.mod(this.st.day + n, pool.length)];
    npc.talking = true;
    challenges.progress(this.game, "talk");
    const px = this.player.x, py = this.player.y;
    const dx = px - npc.x, dy = py - npc.y;
    npc.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";

    const done = () => {
      npc.talking = false;
    };
    this.npc_say(npc.name, [line], done);
  }

  interact_target(): [string, () => void] | null {
    const [dx, dy] = DIRS[this.player.dir];
    const probe = [this.player.x + dx * 11, this.player.y - 3 + dy * 11];
    const hb = this.player.hitbox().inflate(8, 8);
    for (const n of this.npcs) {
      const r = n.hitbox().inflate(6, 14).move(0, -6);
      if (r.collidepoint(probe)) return ["Talk", () => this.talk_npc(n)];
    }
    for (const p of this.pets) {
      if (p.hitbox().inflate(8, 14).move(0, -4).collidepoint(probe)) {
        return [p.pet.name, () => this.open_pet(p)];
      }
    }
    for (const it of this.interacts) {
      if (it.rect.collidepoint(probe) || (it.rect.colliderect(hb) && it.near)) return [it.prompt, it.fn];
    }
    return null;
  }

  open_pet(pw: PetWalker) {
    this.game.push(new PetMenu(this.game, pw, this));
  }

  // -- scene API
  event(e: any) {
    if (this.dialogue) {
      this.dialogue.event(e);
      if (this.dialogue && this.dialogue.done) this.dialogue = null;
      return;
    }
    if (e.type === pg.KEYDOWN) {
      if (e.key === pg.K_ESCAPE) {
        this.game.push(new PauseMenu(this.game));
      } else if (e.key === pg.K_t) {
        this.game.push(new TasksMenu(this.game));
      } else if (e.key === pg.K_e || e.key === pg.K_SPACE || e.key === pg.K_RETURN) {
        const tgt = this.interact_target();
        if (tgt) {
          this.game.audio.play("blip");
          tgt[1]();
        }
      }
    }
  }

  update(dt: number) {
    this.anim_t += dt;
    if (this.st.phase === "evening") this.st.evening_t = Math.min(999, (this.st.evening_t ?? 30) + dt);
    this.particles.update(dt);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > 3) this.banner = null;
    }
    for (const p of this.st.pets) {
      if ((p.happy_t ?? 0) > 0) p.happy_t = Math.max(0, p.happy_t - dt);
    }
    for (const n of this.npcs) n.update(dt, this);
    for (const p of this.pets) p.update(dt, this);
    if (this.dialogue) {
      this.dialogue.update(dt);
      if (this.dialogue.done) this.dialogue = null;
      this.player.moving = false;
      return;
    }
    const keys = pg.key.get_pressed();
    const vx = (keys[pg.K_d] || keys[pg.K_RIGHT] ? 1 : 0) - (keys[pg.K_a] || keys[pg.K_LEFT] ? 1 : 0);
    const vy = (keys[pg.K_s] || keys[pg.K_DOWN] ? 1 : 0) - (keys[pg.K_w] || keys[pg.K_UP] ? 1 : 0);
    const pl: Walker = this.player;
    pl.moving = !!(vx || vy);
    // tipsy after shots: a little sway while walking, and the odd hiccup
    const tipsy = this.st.tipsy || 0;
    if (tipsy > 0) {
      this.st.tipsy = Math.max(0, tipsy - dt);
      this.hic_t = (this.hic_t ?? 2) - dt;
      if (this.hic_t <= 0) {
        this.hic_t = pg.random.uniform(2.5, 5);
        this.particles.text("*hic*", pl.x, pl.y - 30, [200, 120, 200], 1.0);
        this.game.audio.play("pop", 0.4);
      }
    }
    if (pl.moving) {
      if (vx && !vy) {
        pl.dir = vx > 0 ? "right" : "left";
      } else if (vy && !vx) {
        pl.dir = vy > 0 ? "down" : "up";
      } else if (pl.dir !== (vx > 0 ? "right" : "left") && pl.dir !== (vy > 0 ? "down" : "up")) {
        pl.dir = vy > 0 ? "down" : "up";
      }
      let sp = 72 * dt;
      if (vx && vy) sp *= 0.7071;
      const sway = tipsy > 0 ? Math.sin(this.anim_t * 4.5) * Math.min(1, tipsy / 40) * 0.35 : 0;
      const nx = pl.x + vx * sp + (vy ? sway : 0);
      const stuck = this.blocked(pl.hitbox(), pl); // already overlapping something? let her walk free
      if (stuck || !this.blocked(pl.hitbox(nx, pl.y), pl)) pl.x = nx;
      const ny = pl.y + vy * sp + (vx && !vy ? sway : 0);
      if (stuck || !this.blocked(pl.hitbox(pl.x, ny), pl)) pl.y = ny;
      // keep inside the map
      pl.x = Math.max(8, Math.min(this.mw - 8, pl.x));
      pl.y = Math.max(16, Math.min(this.mh - 2, pl.y));
      pl.anim += dt * 8;
      for (const d of this.doors) {
        if (d.rect.colliderect(pl.hitbox()) && (d.dir == null || d.dir === pl.dir)) {
          d.fn();
          break;
        }
      }
    }
    this._update_cam();
  }

  _update_cam(snap = false) {
    let tx = this.player.x - SW / 2;
    let ty = this.player.y - 12 - SH / 2;
    tx = this.mw <= SW ? (this.mw - SW) / 2 : Math.max(0, Math.min(this.mw - SW, tx));
    ty = this.mh <= SH ? (this.mh - SH) / 2 : Math.max(0, Math.min(this.mh - SH, ty));
    this.cam = [tx, ty];
  }

  // -- drawing
  draw_tiles(s: Surface, cx: number, cy: number) {
    const frame = pg.mod(Math.trunc(this.anim_t * 2), 2);
    const x0 = Math.max(0, Math.floor(cx / T)), y0 = Math.max(0, Math.floor(cy / T));
    const x1 = Math.min(this.tiles[0].length, Math.floor((cx + SW) / T) + 2);
    const y1 = Math.min(this.tiles.length, Math.floor((cy + SH) / T) + 2);
    for (let ty = y0; ty < y1; ty++) {
      const row = this.tiles[ty];
      for (let tx = x0; tx < x1; tx++) {
        const name = row[tx];
        const animated = ["water", "water_edge", "flowers", "flowers1"].includes(name);
        s.blit(sprites.tile(name, animated ? frame : 0), [tx * T - cx, ty * T - cy]);
      }
    }
  }

  draw_extra_floor(s: Surface, cx: number, cy: number) {}

  /** Override: [goal text, world point to aim at (or null)] or null for no goal. */
  goal(): [string, number[] | null] | null {
    return null;
  }

  /** Override: extra always-on markers (EXIT signs etc.), drawn above objects. */
  draw_guides(s: Surface, cx: number, cy: number) {}

  draw_goal_arrow(s: Surface, cx: number, cy: number) {
    if (this.dialogue) return;
    const g = this.goal();
    if (!g || !g[1]) return;
    if (g[1] === this.exit_pos) return; // the EXIT marker already shows the way
    const [tx, ty] = g[1];
    if (Math.hypot(this.player.x - tx, this.player.y - ty) < 28) return; // close enough: the "E:" prompt takes over
    props.point_at(s, tx - cx, ty - cy, this.game.time, 28, SH);
  }

  draw(s: Surface) {
    const cx = Math.trunc(this.cam[0]), cy = Math.trunc(this.cam[1]);
    s.fill([30, 24, 40]);
    this.draw_tiles(s, cx, cy);
    this.draw_extra_floor(s, cx, cy);
    const drawables: [number, number, any][] = [];
    for (const o of this.objects) drawables.push([o.sort, 0, o]);
    for (const n of this.npcs) drawables.push([n.y, 1, n]);
    for (const p of this.pets) drawables.push([p.y, 2, p]);
    drawables.push([this.player.y, 3, this.player]);
    drawables.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const t = this.game.time;
    for (const [, kind, obj] of drawables) {
      if (kind === 0) {
        s.blit(obj.img, [obj.x - cx, obj.y - cy]);
      } else if (kind === 1) {
        s.blit(props.shadow(12), [Math.trunc(obj.x) - 6 - cx, Math.trunc(obj.y) - 3 - cy]);
        s.blit(obj.sprite(t), [Math.trunc(obj.x) - 8 - cx, Math.trunc(obj.y) - 24 - cy]);
      } else if (kind === 2) {
        s.blit(props.shadow(10), [Math.trunc(obj.x) - 5 - cx, Math.trunc(obj.y) - 2 - cy]);
        obj.draw(s, cx, cy);
      } else {
        const pl = this.player;
        s.blit(props.shadow(12), [Math.trunc(pl.x) - 6 - cx, Math.trunc(pl.y) - 3 - cy]);
        s.blit(sprites.zoe(this.st.hair, this.st.outfit, pl.dir, pl.frame(t)),
          [Math.trunc(pl.x) - 8 - cx, Math.trunc(pl.y) - 24 - cy]);
      }
    }
    this.draw_after(s, cx, cy);
    this.draw_guides(s, cx, cy);
    this.draw_goal_arrow(s, cx, cy);
    // particles are in world coords
    if (this.particles.items.length) {
      const tmp = this.particles;
      for (const p of tmp.items) {
        p.x -= cx;
        p.y -= cy;
      }
      tmp.draw(s);
      for (const p of tmp.items) {
        p.x += cx;
        p.y += cy;
      }
    }
    if (!this.dialogue) {
      const tgt = this.interact_target();
      if (tgt) {
        const label = "E: " + tgt[0];
        const w = font.text_width(label) + 8;
        const px = Math.trunc(this.player.x) - cx - Math.floor(w / 2);
        const py = Math.trunc(this.player.y) - cy - 36;
        ui.panel(s, [px, py, w, 10], [255, 255, 255], ui.BORDER, false);
        font.draw(s, label, [px + 4, py + 3], ui.INK);
      }
    }
    this.draw_hud(s);
    if (this.banner) this._draw_banner(s);
    if (this.dialogue) this.dialogue.draw(s);
  }

  draw_after(s: Surface, cx: number, cy: number) {}

  draw_hud(s: Surface) {
    const st = this.st;
    const label = `DAY ${st.day} ${gstate.weekday(st.day)}  ` + (st.phase === "morning" ? "MORNING" : gstate.night_k(st) >= 0.55 ? "NIGHT" : "EVENING");
    const w = Math.max(86, font.text_width(label) + 10);
    ui.panel(s, [3, 3, w, 22], [255, 248, 236], ui.BORDER);
    font.draw(s, label, [8, 7], ui.INK);
    s.blit(sprites.icon("coin"), [6, 13]);
    font.draw(s, String(st.coins), [20, 16], [170, 120, 30]);
    if (st.rush && st.phase === "morning") {
      ui.panel(s, [w + 6, 3, 56, 12], [255, 220, 120], [200, 120, 40]);
      font.draw(s, "RUSH DAY!", [w + 11, 7], [170, 70, 30]);
    }
    draw_buff_tags(s, 3, 27, st);
    font.draw(s, "ESC: MENU", [SW - 4, SH - 8], [255, 255, 255], 1, [52, 38, 64], "right");
    challenges.draw_hint(s, 4, SH - 8, st);
    const g = this.goal();
    if (g && !this.dialogue) props.goal_panel(s, g[0], this.game.time);
  }

  _draw_banner(s: Surface) {
    const b = this.banner;
    const k = b.t;
    const a = k < 2.5 ? Math.min(1, k * 3) : Math.max(0, 1 - (k - 2.5) * 2);
    if (a <= 0) return;
    const y = 50;
    const r = new Rect(60, y, 200, 34);
    ui.panel(s, r, [255, 246, 230], ui.BORDER);
    font.draw(s, b.title, [160, y + 6], ui.ACCENT, 2, null, "center");
    font.draw(s, b.sub, [160, y + 23], ui.INK, 1, null, "center");
  }
}

// ======================================================================= TOWN
export class TownScene extends WorldScene {
  name = "town";

  /* Layout (tiles; W x H = 54 x 30):
   *  rows 1-6   Main Street shopfronts: pocket garden, Rosa's bread stall, Shop, Clinic, Subway,
   *             Pressed, Wildside, Clery's (the night queue runs east along the sidewalk)
   *  rows 7-10  Main Street (sidewalk / cobble / sidewalk)
   *  rows 11-21 Dog Run (west), the Park with its pond (centre), the Plaza and the Playground (east)
   *  rows 22-24 Hillside homes (Zoe lives at 146), hedges along their back gardens
   *  rows 25-28 Hillside street; border trees all round.
   * Two sidewalk connectors (x14-15 and x38-39) and the park path link the two streets. */
  build() {
    const W = 54, H = 30;
    this.tw = W;
    const rnd = new pg.Random(42);
    const grass = ["grass", "grass1", "grass2"];
    this.tiles = [];
    for (let j = 0; j < H; j++) {
      const row: string[] = [];
      for (let i = 0; i < W; i++) row.push(grass[rnd.random() < 0.3 ? rnd.randrange(3) : 0]);
      this.tiles.push(row);
    }
    this.lights = [] as number[][]; // [x, y, radius] world coords, lit at night
    this.windows = [] as number[][]; // [x, y, w, h] lit at night

    const fill = (x0: number, y0: number, x1: number, y1: number, name: string) => {
      for (let y = y0; y < y1 + 1; y++) {
        for (let x = x0; x < x1 + 1; x++) {
          this.tiles[y][x] = name !== "path" ? name : (x + y) % 3 ? "path" : "path1";
        }
      }
    };

    // ---- streets: Main Street (cobblestone + sidewalks) and Hillside (homes, incl. Zoe's at 146)
    fill(1, 7, W - 2, 7, "sidewalk");
    fill(1, 8, W - 2, 9, "cobble");
    fill(1, 10, W - 2, 10, "sidewalk");
    fill(1, 25, W - 2, 25, "sidewalk");
    fill(1, 26, W - 2, 27, "cobble");
    fill(1, 28, W - 2, 28, "sidewalk");
    for (const x of [14, 15, 24, 25, 38, 39]) fill(x, 8, x, 9, "crosswalk");
    for (const x of [14, 15, 38, 39]) fill(x, 26, x, 27, "crosswalk");
    fill(14, 11, 15, 24, "sidewalk"); // west connector down to Hillside
    fill(38, 11, 39, 24, "sidewalk"); // east connector via the plaza
    fill(34, 12, 44, 19, "sidewalk"); // plaza
    // shop-front door steps
    fill(17, 6, 18, 6, "path"); // shop
    fill(24, 5, 25, 6, "path"); // clinic (it sits a little higher)
    fill(29, 6, 30, 6, "path"); // Subway
    fill(34, 6, 35, 6, "path"); // Pressed
    fill(40, 6, 41, 6, "path"); // Wildside
    fill(46, 6, 48, 6, "sidewalk"); // Clery's
    // park paths: in at the top, across east-west (dog run side to plaza), out the bottom toward home
    fill(24, 11, 25, 19, "path");
    fill(16, 18, 33, 19, "path");
    fill(25, 20, 26, 24, "path");
    fill(12, 16, 13, 17, "path"); // dog run gate
    fill(46, 12, 51, 17, "path"); // playground sand
    // flower patches (only on grass)
    for (const [x0, y0, x1, y1] of [[2, 2, 11, 6], [20, 13, 23, 15], [16, 15, 17, 17], [16, 20, 18, 20], [26, 13, 31, 13],
      [2, 19, 4, 20], [9, 13, 11, 14], [33, 20, 37, 20], [45, 18, 52, 20], [27, 22, 29, 23], [50, 1, 52, 6], [31, 20, 31, 20]]) {
      for (let y = y0; y < y1 + 1; y++) {
        for (let x = x0; x < x1 + 1; x++) {
          if (!this.tiles[y][x].startsWith("grass")) continue;
          if (rnd.random() < 0.6) this.tiles[y][x] = rnd.random() < 0.5 ? "flowers" : "flowers1";
        }
      }
    }
    // pond in park
    for (let y = 14; y < 18; y++) {
      for (let x = 26; x < 31; x++) {
        this.tiles[y][x] = y === 14 ? "water_edge" : "water";
        this.solid.add(tk(x, y));
      }
    }
    // park fence, with gates top, bottom, left and right so you can walk straight through
    for (let x = 19; x < 33; x++) {
      for (const y of [12, 21]) {
        if (y === 12 && (x === 24 || x === 25)) continue;
        if (y === 21 && x >= 21 && x <= 26) continue; // 146's back wall + the south gate
        this.add_fence(x, y, "fence");
      }
    }
    for (let y = 13; y < 21; y++) {
      if (y === 18 || y === 19) continue;
      this.add_fence(19, y, "fence_v");
      this.add_fence(32, y, "fence_v");
    }
    for (let x = 21; x < 25; x++) this.solid.add(tk(x, 21)); // 146 backs straight onto the park
    // dog run (west), gate on the east side facing the connector
    for (let x = 1; x < 13; x++) for (const y of [12, 21]) this.add_fence(x, y, "fence");
    for (let y = 13; y < 21; y++) {
      this.add_fence(1, y, "fence_v");
      if (y !== 16 && y !== 17) this.add_fence(12, y, "fence_v");
    }
    // back-garden hedges behind the Hillside homes
    for (const [x0, x1] of [[16, 18], [33, 37], [40, W - 2]]) {
      for (let x = x0; x <= x1; x++) {
        this.add_obj(props2.hedge(x % 3 === 0 ? 1 + (x % 2) : 0), x * T, 21 * T, [x * T, 21 * T + 4, 16, 12]);
      }
    }
    // border trees (mostly leafy, a few pines and blossoms)
    for (let x = 0; x < W; x++) for (const y of [0, H - 1]) this.add_tree(x, y, rnd);
    for (let y = 1; y < H - 1; y++) for (const x of [0, W - 1]) this.add_tree(x, y, rnd);
    // feature trees: [x, y, kind] kind: tree | tree1 | pine | blossom | apple
    for (const [x, y, kind] of [[2, 2, "tree"], [6, 1, "blossom"], [10, 2, "pine"], [14, 2, "tree1"], [13, 4, "pine"],
      [28, 2, "pine"], [33, 1, "tree"], [36, 2, "tree1"], [45, 1, "pine"], [49, 2, "tree"],
      [50, 5, "apple"], [52, 3, "pine"], [51, 1, "blossom"],
      [20, 16, "tree"], [22, 14, "blossom"], [20, 20, "apple"], [31, 13, "pine"], [31, 20, "tree"],
      [18, 16, "pine"], [11, 13, "tree"], [2, 20, "apple"], [52, 19, "blossom"], [45, 20, "tree1"]] as [number, number, string][]) {
      this.add_tree(x, y, rnd, kind);
    }
    for (const [x, y, v] of [[33, 13, 1], [33, 16, 2], [9, 5, 0], [16, 11, 2], [45, 12, 1], [13, 19, 0], [29, 22, 1]]) {
      const img = v === 0 && (x + y) % 2 ? sprites.tile("bush") : props2.shrub(v);
      this.add_obj(img, x * T, y * T, [x * T + 1, y * T + 6, 14, 10]);
    }
    // ---- buildings along Main Street (gaps between them are planted up so there are no back alleys)
    this.store_rect = this.add_building("store", 16 * T, 3 * T);
    this.clinic_rect = this.add_building("clinic", 22 * T, 2 * T - 4);
    this.subway_rect = this.add_building("subway", 28 * T, 3 * T);
    this.cafe_rect = this.add_building("cafe", 33 * T, 3 * T);
    this.wild_rect = this.add_building("wildclinic", 38 * T, 3 * T - 8);
    this.bar_rect = this.add_building("bar", 45 * T, 3 * T);
    const stall_x = 12 * T - 4, stall_y = 6 * T + 8 - 48;
    const order: Rect[] = [new Rect(stall_x, stall_y, 44, 48), this.store_rect, this.clinic_rect, this.subway_rect, this.cafe_rect, this.wild_rect, this.bar_rect];
    const kinds = ["pine", "blossom", "tree", "pine", "tree1", "apple"];
    for (let i = 0; i + 1 < order.length; i++) {
      const a = order[i], b = order[i + 1];
      const cx = Math.floor((a.right + b.left) / 2);
      this.add_obj(props.shadow(14, 5, 50), cx - 7, 6 * T + 2, null, -1);
      this.add_obj(this.tree_img(kinds[i]), cx - 8, 6 * T + 8 - 32, null, 4 * T);
      this.add_obj(props2.planter(), cx - 8, 6 * T - 4, [a.right - 4, 2 * T + 8, b.left - a.right + 8, 4 * T + 2], 6 * T + 10);
    }
    // the pocket garden and Rosa's bread stall at the west end of Main Street
    this.add_obj(props2.bench(), 4 * T + 8, 5 * T, [4 * T + 8, 5 * T + 6, 28, 8]);
    this.add_obj(props2.planter(), 3 * T, 6 * T + 2, [3 * T + 1, 6 * T + 8, 14, 8]);
    this.add_obj(props2.planter(), 7 * T, 6 * T + 2, [7 * T + 1, 6 * T + 8, 14, 8]);
    this.add_obj(props2.market_stall("BREAD"), stall_x, stall_y, [stall_x + 2, stall_y + 34, 40, 14]);
    // flower pots by the shop doors
    for (const r of [this.store_rect, this.subway_rect, this.cafe_rect, this.bar_rect] as Rect[]) {
      for (const [dx, v] of [[-17, r.x % 3], [8, (r.x + 1) % 3]]) {
        this.add_obj(props2.flower_pot(v), r.centerx + dx, r.bottom - 11, null, r.bottom + 1);
      }
    }
    // ---- Hillside: Zoe's house (146) and the neighbours, all facing the street
    this.hq_rect = this.add_building("hq", 21 * T, 22 * T - 8);
    this.add_obj(props2.mailbox("146"), this.hq_rect.x - 4, this.hq_rect.bottom - 8, null, this.hq_rect.bottom + 2);
    // the gang lives on Hillside too (Mabel has been at 138 forever)
    const homes: [number, string][] = [[2, "mabel"], [6, "renee"], [10, "danny"], [17, "andrew"], [30, "stephen"],
      [34, "shteynie"], [41, "greg"], [45, "jayden"], [49, "tish"]];
    for (const [hx, owner] of homes) {
      const info = friends.HOUSES[owner];
      const num = info ? info.num : 138;
      const r = this.add_building(info ? info.house : "house1", hx * T, 22 * T);
      this["house_" + owner] = r;
      this.interacts.push({
        rect: new Rect(r.centerx - 8, r.bottom - 14, 16, 18), prompt: info ? `${friends.NICE[owner]}'s` : "Knock",
        fn: () => (info ? this.visit(owner) : this.knock("Mabel", num)),
      });
      this.add_obj(props2.mailbox(String(num)), r.x - 4, r.bottom - 8, null, r.bottom + 2);
      if (info) {
        // a little name plate by the door so you know whose house it is
        const plate = sprites.cached(["nameplate", owner], () => {
          const nm = friends.NICE[owner].toUpperCase();
          const w = font.text_width(nm) + 6;
          const p = new Surface([w, 9], SRCALPHA);
          pg.draw.rect(p, info.color, [0, 0, w, 9]);
          pg.draw.rect(p, [52, 38, 64], [0, 0, w, 9], 1);
          font.draw(p, nm, [3, 2], [255, 255, 255]);
          return p;
        });
        this.add_obj(plate, r.centerx - Math.floor(plate.get_width() / 2), r.bottom - 32, null, r.bottom + 1);
      }
    }
    // community garden bench + bus stop on Hillside, and a bench looking over the pond
    this.add_obj(props2.bench(), 27 * T, 23 * T + 4, [27 * T, 23 * T + 10, 28, 8]);
    this.add_obj(props2.bus_stop(), 27 * T, 28 * T - 14, [27 * T + 2, 28 * T + 6, 28, 6]);
    this.add_obj(props2.bench(), 27 * T + 4, 20 * T - 2, [27 * T + 4, 20 * T + 4, 28, 8]);
    // ---- plaza: fountain, benches, town board
    this.fountain = this.add_obj(props2.fountain(0), 39 * T - 4, 13 * T + 4, [39 * T - 2, 14 * T + 8, 36, 12]);
    for (const [bx, by] of [[35 * T, 13 * T], [35 * T, 16 * T], [42 * T + 8, 13 * T], [42 * T + 8, 16 * T]]) {
      this.add_obj(props2.bench(), bx, by, [bx, by + 6, 28, 8]);
    }
    const board = props2.town_board();
    this.add_obj(board, 36 * T, 11 * T - 6, [36 * T + 2, 11 * T + 10, 24, 6]);
    this.interacts.push({ rect: new Rect(36 * T, 11 * T - 6, 28, 26), prompt: "Tasks", fn: () => this.game.push(new TasksMenu(this.game)) });
    // ---- playground (east of the plaza)
    this.add_obj(props2.swings(), 46 * T + 4, 12 * T + 2, [46 * T + 4, 12 * T + 26, 40, 6]);
    this.add_obj(props2.slide(), 49 * T + 4, 12 * T + 6, [49 * T + 4, 12 * T + 28, 34, 8]);
    this.add_obj(props2.sandbox(), 46 * T + 4, 15 * T + 8, [46 * T + 4, 15 * T + 16, 34, 14]);
    this.add_obj(props2.seesaw(), 49 * T + 6, 16 * T + 6, [49 * T + 8, 16 * T + 14, 30, 6]);
    this.add_obj(props2.bench(), 47 * T, 18 * T + 6, [47 * T, 18 * T + 12, 28, 8]);
    this.add_obj(props2.trash_bin(), 45 * T + 3, 17 * T + 2, [45 * T + 4, 17 * T + 10, 8, 6]);
    // picnic spot between the connector and the park
    this.add_obj(props2.picnic_table(), 16 * T + 2, 13 * T + 2, [16 * T + 2, 13 * T + 12, 32, 8]);
    // ---- dog run (Zoe's pets play here)
    this.add_obj(props2.dog_house(), 2 * T + 4, 13 * T - 2, [2 * T + 6, 13 * T + 10, 22, 12]);
    this.add_obj(props2.water_bowl(), 4 * T + 6, 14 * T + 10, null, 14 * T + 10);
    this.add_obj(props2.bench(), 6 * T, 13 * T, [6 * T, 13 * T + 6, 28, 8]);
    this.add_obj(props2.hurdle(), 4 * T, 18 * T + 4, [4 * T + 1, 18 * T + 12, 24, 6]);
    this.add_obj(props2.dog_tunnel(), 7 * T, 18 * T + 6, [7 * T, 18 * T + 12, 32, 10]);
    this.add_obj(props2.hydrant(), 10 * T + 4, 19 * T + 2, [10 * T + 5, 19 * T + 10, 8, 6]);
    // ---- street lamps
    const lamp = (tx: number, ty: number) => {
      const lx = tx * T + 3, ly = ty * T - 16;
      this.add_obj(props2.lamppost(), lx, ly, [lx + 2, ly + 24, 6, 6]);
      this.lights.push([lx + 5, ly + 6, 30]);
    };
    for (const x of [3, 9, 15, 21, 27, 32, 37, 44]) lamp(x, 7);
    for (const x of [4, 9, 20, 28, 48]) lamp(x, 11);
    for (const x of [5, 9, 13, 20, 29, 33, 37, 44, 48, 52]) lamp(x, 25);
    for (const [x, y] of [[34, 12], [44, 12], [34, 20], [44, 20]]) lamp(x, y);
    // trash bins along Main Street
    for (const x of [11, 31, 42]) this.add_obj(props2.trash_bin(), x * T + 3, 10 * T + 1, [x * T + 4, 10 * T + 9, 8, 6]);
    // ---- doors
    const hq: Rect = this.hq_rect, cl: Rect = this.clinic_rect, stx: Rect = this.store_rect;
    this.doors.push({ rect: new Rect(hq.centerx - 6, hq.bottom - 1, 12, 4), dir: "up", fn: () => this.go_inside("hq") });
    this.doors.push({ rect: new Rect(stx.centerx - 6, stx.bottom - 1, 12, 4), dir: "up", fn: () => this.go_inside("store") });
    this.interacts.push({ rect: new Rect(cl.centerx - 8, cl.bottom - 14, 16, 18), prompt: "Clinic", fn: () => this.clinic_door() });
    const br: Rect = this.bar_rect, cf: Rect = this.cafe_rect, wr: Rect = this.wild_rect, sw: Rect = this.subway_rect;
    this.doors.push({ rect: new Rect(br.centerx - 6, br.bottom - 1, 12, 4), dir: "up", fn: () => this.bar_door() });
    this.doors.push({ rect: new Rect(cf.centerx - 6, cf.bottom - 1, 12, 4), dir: "up", fn: () => this.go_inside("cafe") });
    this.doors.push({ rect: new Rect(sw.centerx - 6, sw.bottom - 1, 12, 4), dir: "up", fn: () => this.go_inside("subway") });
    this.interacts.push({ rect: new Rect(wr.centerx - 8, wr.bottom - 14, 16, 18), prompt: "Wildside", fn: () => this.wild_door() });
    // lit windows at night (every building uses the same two-window layout)
    for (const o of this.objects) {
      if (!o.building) continue;
      const w = o.img.get_width(), h = o.img.get_height(), rh = Math.floor(h / 2);
      for (const wx of [10, w - 22]) this.windows.push([o.x + wx, o.y + rh + 5, 12, 9]);
    }
    this.lights.push([br.centerx, br.bottom + 2, 34]); // Clery's door glow
    this.lights.push([stall_x + 22, stall_y + 30, 22]); // the bread stall's lantern
    // ---- welcome sign
    let sign = sprites.new_(16, 16);
    pg.draw.rect(sign, [150, 100, 66], [7, 8, 2, 8]);
    pg.draw.rect(sign, [226, 186, 130], [1, 2, 14, 8]);
    pg.draw.rect(sign, [176, 130, 86], [1, 9, 14, 1]);
    sign = sprites.outline(sign);
    this.add_obj(sign, 17 * T, 11 * T, [17 * T + 2, 11 * T + 10, 12, 6]);
    this.interacts.push({
      rect: new Rect(17 * T, 11 * T, 16, 16), prompt: "Read",
      fn: () => this.say([[null, null, "PAWSLEY TOWN - Home of happy, healthy pets! Main Street: Bread stall, Shop, Clinic, Subway, Pressed, Wildside and Clery's. South: Dog Run, Park, Plaza, Playground and Hillside, where Zoe lives at 146."]]),
    });
    // ---- direction signposts
    const signpost = (tx: number, ty: number, text: string) => {
      const bd = props.shop_sign(text, [236, 200, 150], [110, 70, 50]);
      const img = sprites.new_(Math.max(16, bd.get_width()), 22);
      const mid = Math.floor(img.get_width() / 2);
      pg.draw.rect(img, [52, 38, 64], [mid - 2, 9, 4, 13]);
      pg.draw.rect(img, [150, 100, 66], [mid - 1, 9, 2, 13]);
      img.blit(bd, [Math.floor((img.get_width() - bd.get_width()) / 2), 0]);
      const x = tx * T + 8 - mid, y = ty * T - 6;
      this.add_obj(img, x, y, [x + mid - 3, y + 16, 6, 6]);
    };
    signpost(22, 11, "PARK `");
    signpost(13, 11, "HOME 146 `");
    signpost(13, 15, "DOG RUN {");
    signpost(19, 10, "CLERY'S }");
    signpost(33, 10, "WILDSIDE }");
    signpost(37, 20, "HILLSIDE `");
    // ---- people
    const st = this.st;
    if (st.day === 1 && st.phase === "morning") this.npcs.push(new NPC("maple", this.hq_rect.right + 14, this.hq_rect.bottom + 12, "left"));
    else this.npcs.push(new NPC("maple", 27 * T, 11 * T + 8, "down", 10));
    this.npcs.push(new NPC("penny", 11 * T, 9 * T + 6, "down", 18));
    this.npcs.push(new NPC("otis", 29 * T, 18 * T + 6, "up"));
    this.npcs.push(new NPC("juniper", 50 * T, 18 * T + 10, "down", 12));
    this.npcs.push(new NPC("rosa", stall_x + 22, stall_y + 42, "down"));
    this.npcs.push(new NPC("theo", 4 * T, 8 * T + 12, "right", null, [3 * T, 30 * T]));
    this.npcs.push(new NPC("mabel", 4 * T, 26 * T + 8, "down", 14));
    this.npcs.push(new NPC("kenji", 36 * T, 9 * T + 10, "right", null, [33 * T, 50 * T]));
    this.npcs.push(new NPC("priya", 40 * T, 17 * T + 8, "up", 14));
    this.npcs.push(new NPC("rory", 22 * T, 19 * T, "down", 16));
    this.npcs.push(new NPC("bea", 48 * T + 8, 14 * T + 14, "down", 12));
    this.npcs.push(new NPC("hank", 8 * T, 16 * T + 8, "left", 18));
    this.npcs.push(new NPC("guest3", 30 * T, 27 * T, "right", null, [20 * T, 40 * T]));
    this.spawn_pets(new Rect(2 * T + 8, 15 * T + 6, 9 * T, 2 * T + 4));
    this.queue = [] as any[];
    this.night_on = false;
    this.dark = new Surface([SW, SH], SRCALPHA);
    if (gstate.night_k(st) >= 0.55) this.setup_night();
  }

  add_fence(x: number, y: number, kind: string) {
    this.solid.add(tk(x, y));
    this.add_obj(sprites.tile(kind), x * T, y * T, null, y * T + 12);
  }

  tree_img(kind: string): Surface {
    if (kind === "pine") return props2.tree_kind(0);
    if (kind === "blossom") return props2.tree_kind(1);
    if (kind === "apple") return props2.tree_kind(2);
    return sprites.tile(kind === "tree1" ? "tree1" : "tree");
  }

  add_tree(x: number, y: number, rnd: pg.Random, kind: string = null) {
    if (kind == null) {
      const r = rnd.random();
      kind = r < 0.12 ? "tree1" : r < 0.2 ? "pine" : r < 0.225 ? "blossom" : "tree";
    }
    this.solid.add(tk(x, y));
    this.add_obj(props.shadow(16, 6, 55), x * T, y * T + 10, null, -1);
    this.add_obj(this.tree_img(kind), x * T, y * T - 16, null, y * T + 14);
  }

  add_building(name: string, x: number, y: number): Rect {
    const img = sprites.building(name);
    const [w, h] = img.get_size();
    const r = new Rect(x, y, w, h);
    this.add_obj(props.shadow(w - 4, 7, 60), x + 2, y + h - 4, null, -1);
    const o = this.add_obj(img, x, y, [x + 4, y + 12, w - 8, h - 12]);
    o.building = name;
    return r;
  }

  default_spawn(): number[] {
    return [this.hq_rect.centerx, this.hq_rect.bottom + 8];
  }

  enter() {
    const st = this.st;
    this.setup_friends();
    if (st.phase === "morning") {
      if (st.day === 1 && !st.seen_tutorial.includes("intro")) {
        st.seen_tutorial.push("intro");
        this.npc_say("maple", data.TUTORIAL["intro"]);
      } else if (st.rush && st.rush_announced !== st.day) {
        st.rush_announced = st.day;
        this.npc_say("penny", data.RUSH_LINES);
      } else if (gstate.is_thursday(st.day) && st.thursday_told !== st.day) {
        st.thursday_told = st.day;
        this.npc_say("kenji", ["Dude! It's TURKEY THURSDAY! Turkey subs are only 5 coins at Subway today!"]);
      }
    }
  }

  // ------------------------------------------------------------- friends
  setup_friends() {
    const st = this.st, pl = this.player;
    this.trail = [] as number[][];
    for (let i = 14; i >= 0; i--) this.trail.push([pl.x, pl.y + 2 + i * 2]);
    this.followers = [] as Follower[];
    this.chat_t = 3;
    this.pending_meet = null;
    const w = friends.walking(st);
    if (w) this.spawn_followers(w.names);
    const after_shift = !!this.game._after_shift;
    this.game._after_shift = false;
    if (!w && st.phase === "morning" && st.met_m !== st.day) {
      const f = friends.morning_walker(st.day);
      const hq: Rect = this.hq_rect;
      if (f && Math.hypot(pl.x - hq.centerx, pl.y - hq.bottom) < 48) this.pending_meet = () => this.meet_morning(f);
    }
    if (!w && st.phase === "evening" && after_shift && st.met_e !== st.day) {
      if (gstate.is_thursday(st.day)) this.pending_meet = () => this.meet_evening(friends.tonight(st));
      else this.pending_meet = () => this.choose_night();
    }
  }

  spawn_followers(names: string[]) {
    const pl = this.player;
    this.npcs = this.npcs.filter((n: any) => !n.follower);
    this.followers = names.map((nm, i) => new Follower(nm, pl.x + (i % 2 ? 8 : -8), pl.y + 10 + i * 8, i));
    for (const f of this.followers) this.npcs.push(f);
  }

  clear_followers() {
    this.npcs = this.npcs.filter((n: any) => !n.follower);
    this.followers = [];
    this.st.walk_with = null;
  }

  meet_morning(f: string) {
    const st = this.st, pl = this.player;
    st.met_m = st.day;
    const n = new NPC(f, pl.x + 20, pl.y + 4, "left");
    n.talking = true;
    this.npcs.push(n);
    this.npc_say(f, friends.MORNING_HELLO[f] || ["Morning, Zoe! Walk you to work?"], () => { n.talking = false; }, [
      ["Let's walk!", () => {
        this.npcs = this.npcs.filter((x: any) => x !== n);
        st.walk_with = { names: [f], dest: "clinic", day: st.day, phase: st.phase };
        friends.add_pts(st, f);
        this.spawn_followers([f]);
        this.followers[0].x = n.x;
        this.followers[0].y = n.y;
      }],
      ["Rain check", () => {
        n.talking = false;
        n.wander = 24;
        this.particles.text("Have a good shift!", n.x, n.y - 30, ui.INK, 1.8);
      }],
    ]);
  }

  /** After the shift: the group chat asks - go out to Clery's, or game night at a friend's? */
  choose_night() {
    const st = this.st;
    st.met_e = st.day;
    const gn = friends.game_night(st.day);
    const game_name = gn.game === "kart" ? "PAW-PRIX racing" : "cards";
    const out = () => {
      if (st.day % 2 === 0) {
        const pg_plan = friends.pregame_plan(st.day);
        st.night_plan = { ...pg_plan, day: st.day };
        const [a, b] = pg_plan.names;
        const at = pg_plan.host === "zoe" ? "Pregame at yours? We're heading to 146!" : `Pregame at ${friends.where(pg_plan.host)} first!`;
        this.game.toast("TEXT FROM " + friends.NICE[a].toUpperCase(), at);
        this.game.audio.play("pop");
        this.zoe_say([pg_plan.host === "zoe" ? `${friends.NICE[a]} and ${friends.NICE[b]} are coming over to pregame! I should go home and change.`
          : `Pregame at ${friends.where(pg_plan.host)} on Hillside. I'll change at home first, then head over!`]);
      } else {
        st.night_plan = { kind: "out", day: st.day };
        const f = friends.HOME_HELLO ? Object.keys(friends.HOME_HELLO)[Math.floor(st.day / 2) % Object.keys(friends.HOME_HELLO).length] : null;
        if (f && st.day >= 3) this.meet_evening({ kind: "walkhome", names: [f] });
      }
    };
    const games = () => {
      st.night_plan = { ...gn, day: st.day };
      this.game.toast("GAME NIGHT!", `${game_name.toUpperCase()} at ${friends.where(gn.host)}`);
      this.game.audio.play("pop");
      this.zoe_say([`Game night at ${friends.where(gn.host)} with ${friends.NICE[gn.names[1]]}! No need to dress up for this one.`]);
    };
    this.say([
      [null, null, "*BZZT* The group chat is blowing up..."],
      [friends.NICE[gn.host], sprites.npc_portrait(gn.host), `Zoe!! Clery's tonight, or game night at mine? I've got ${game_name}!`],
    ], null, [["Go out!", out], ["Game night", games]]);
  }

  meet_evening(plan: any) {
    const st = this.st, pl = this.player;
    st.met_e = st.day;
    const made = plan.names.map((nm: string, i: number) => {
      const n = new NPC(nm, pl.x + 18 + i * 14, pl.y + 6, "left");
      n.talking = true;
      this.npcs.push(n);
      return n;
    });
    const go = (dest: string) => () => {
      this.npcs = this.npcs.filter((x: any) => !made.includes(x));
      st.walk_with = { names: plan.names, dest, day: st.day, phase: st.phase };
      for (const nm of plan.names) friends.add_pts(st, nm);
      this.spawn_followers(plan.names);
      made.forEach((n: NPC, i: number) => { this.followers[i].x = n.x; this.followers[i].y = n.y; });
    };
    const leave = () => {
      for (const n of made) { n.talking = false; n.wander = 30; }
    };
    const P = (n: string) => sprites.npc_portrait(n);
    if (plan.kind === "turkey") {
      this.say([
        ["Shteynie", P("shteynie"), "ZOE. Do you know what day it is?"],
        ["Stephen", P("stephen"), "It's TURKEY THURSDAY! Five-coin turkey subs, Doc!"],
        ["Shteynie", P("shteynie"), "The sacred tradition. Just the three of us. Subway. Now."],
      ], leave, [["Subway time!", go("subway")], ["Not tonight", () => {
        leave();
        this.particles.text("Noooo!", made[0].x, made[0].y - 30, ui.BAD, 1.6);
      }]]);
    } else {
      const f = plan.names[0];
      this.npc_say(f, friends.HOME_HELLO[f] || ["Walk you home, Zoe?"], leave, [["Sure!", go("hq")], ["I'm good", leave]]);
    }
  }

  update_friends(dt: number) {
    const pl = this.player;
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(pl.x - last[0], pl.y - last[1]) >= 2) {
      this.trail.push([pl.x, pl.y]);
      if (this.trail.length > 90) this.trail.shift();
    }
    if (this.pending_meet && !this.dialogue) {
      const f = this.pending_meet;
      this.pending_meet = null;
      f();
    }
    if (this.followers.length && !this.dialogue) {
      this.chat_t -= dt;
      if (this.chat_t <= 0) {
        this.chat_t = pg.random.uniform(6, 9);
        const f: Follower = pg.random.choice(this.followers);
        const lines = friends.WALK_LINES[f.name] || ["What a day!"];
        this.bubble = { who: f, text: pg.random.choice(lines), t: 2.8 };
      }
    }
    if (this.bubble) {
      this.bubble.t -= dt;
      if (this.bubble.t <= 0) this.bubble = null;
    }
  }

  /** At the clinic door: the friend who walked Zoe to work says bye and gives a pep talk. */
  friend_farewell(then: () => void): boolean {
    const w = friends.walking(this.st);
    if (!w || w.dest !== "clinic") return false;
    const f = w.names[0];
    this.clear_followers();
    this.st.buffs = this.st.buffs || {};
    this.st.buffs.pep = true;
    this.game.audio.play("chime");
    this.npc_say(f, [friends.CLINIC_BYE[f] || "Have a great shift!", "(PEP TALK! Hearts drain 10% slower today.)"], then);
    return true;
  }

  go_inside(where: string) {
    const ww = friends.walking(this.st);
    if (ww && ww.dest === where) ww.arrived = true;
    const go = () => {
      if (where === "hq") this.game.replace(new HQScene(this.game, null, "up"));
      else if (where === "bar") this.game.replace(new BarScene(this.game, null, "up"));
      else if (where === "cafe") this.game.replace(new CafeScene(this.game, null, "up"));
      else if (where === "subway") this.game.replace(new SubwayScene(this.game, null, "up"));
      else this.game.replace(new StoreScene(this.game, null, "up"));
    };
    this.game.transition(go);
  }

  /** Step back off a door you can't use yet. */
  bump() {
    this.player.y += 12;
    this.player.dir = "down";
  }

  bar_door() {
    const st = this.st;
    if (st.phase === "morning") {
      this.bump();
      this.zoe_say(["Clery's doesn't open until the evening. Work first, party later!"]);
      return;
    }
    if (!gstate.dressed_for_night(st)) {
      this.bump();
      if (this.night_on) {
        this.npc_say("bruno", ["Whoa, Dr. Zoe! No scrubs in Clery's.", "Head home and change at your Mirror into something fun - the gang's waiting!"], null, null, "Bruno");
      } else {
        this.zoe_say(["I can't go to Clery's in my scrubs! Let me go home and change at the Mirror first."]);
      }
      return;
    }
    const crew = friends.walking(st);
    if (crew && crew.dest === "bar") {
      st.bruno_day = st.day;
      this.bump();
      const names = crew.names.map((n: string) => friends.NICE[n]).join(" & ");
      this.npc_say("bruno", [`Zoe! And ${names} - the whole crew! Straight in, no line for you lot.`], () => {
        this.clear_followers();
        this.go_inside("bar");
      }, null, "Bruno");
      return;
    }
    if (this.night_on && st.bruno_day !== st.day) {
      st.bruno_day = st.day;
      this.bump();
      this.npc_say("bruno", ["Looking sharp, Zoe! You're on the list.", "Skip the line - your friends are inside."], () => this.go_inside("bar"), null, "Bruno");
      return;
    }
    this.go_inside("bar");
  }

  /** Knock on a friend's door. */
  visit(owner: string) {
    const st = this.st;
    const nm = friends.NICE[owner];
    if (st.phase === "morning") {
      this.say([[null, null, `${friends.where(owner)} Hillside. Nobody's home - ${nm} is at work.`]]);
      return;
    }
    const plan = friends.tonight(st);
    const hosting = plan && plan.host === owner && (plan.kind === "gamenight" || plan.kind === "pregame");
    if (hosting && plan.kind === "pregame" && !gstate.dressed_for_night(st)) {
      this.npc_say(owner, ["Zoe! You can't pregame in SCRUBS. Go home and change, then come back!"]);
      return;
    }
    const enter = () => this.game.transition(() => this.game.replace(new FriendHouseScene(this.game, owner)));
    if (hosting) {
      enter();
      return;
    }
    this.npc_say(owner, [pg.random.choice([`Oh hey Zoe! Come on in, I was just chilling.`, `Zoe! Perfect timing. Wanna hang for a bit?`])], null,
      [["Come in", enter], ["Just saying hi", () => {}]]);
  }

  knock(owner: string, num = 0) {
    const night = gstate.night_k(this.st) > 0.5;
    const where = num ? `${num} Hillside - ${owner}'s house.` : `${owner}'s house.`;
    const lines = night
      ? [`${where} The lights are on and you can hear a TV laughing.`]
      : [`${where} Nobody answers - they're probably out in town.`];
    this.say(lines.map((l) => [null, null, l]));
  }

  goal(): [string, number[] | null] | null {
    const st = this.st;
    const w = friends.walking(st);
    if (w) {
      const who = w.names.map((n: string) => friends.NICE[n]).join(" & ");
      const r: Rect = w.dest === "clinic" ? this.clinic_rect : w.dest === "subway" ? this.subway_rect : w.dest === "bar" ? this.bar_rect : this.hq_rect;
      const txt = w.dest === "clinic" ? `Walk to the clinic with ${who}` : w.dest === "subway" ? `TURKEY THURSDAY! Subway with ${who}`
        : w.dest === "bar" ? `Head to Clery's with ${who}` : `Walk home to 146 with ${who}`;
      return [txt, [r.centerx, r.bottom - 6]];
    }
    const plan = friends.tonight(st);
    const hq: Rect = this.hq_rect;
    if (plan && plan.kind === "pregame" && st.pregame_done !== st.day && st.bar_day !== st.day) {
      const who = plan.names.map((n: string) => friends.NICE[n]).join(" & ");
      if (plan.host === "zoe") return [`Go home - ${who} are pregaming at 146!`, [hq.centerx, hq.bottom - 4]];
      if (!gstate.dressed_for_night(st)) return [`Change at home, then pregame at ${friends.where(plan.host)}`, [hq.centerx, hq.bottom - 4]];
      const r: Rect = this["house_" + plan.host];
      return [`Pregame at ${friends.where(plan.host)} with ${who}!`, [r.centerx, r.bottom - 6]];
    }
    if (plan && plan.kind === "gamenight") {
      const r: Rect = this["house_" + plan.host];
      if (st.gamenight_done === st.day) return ["Game night was fun! Head home to sleep (or hit Clery's)", [hq.centerx, hq.bottom - 4]];
      return [`Game night at ${friends.where(plan.host)}! Knock on the door`, [r.centerx, r.bottom - 6]];
    }
    if (st.phase === "morning") {
      const cl: Rect = this.clinic_rect;
      return ["Go to a clinic and press E at its door", [cl.centerx, cl.bottom - 10]];
    }
    const br: Rect = this.bar_rect;
    if (st.bar_day === st.day) return ["Head home and sleep when you're ready", [hq.centerx, hq.bottom - 4]];
    if (!gstate.dressed_for_night(st)) return ["Go home and change for a night at Clery's", [hq.centerx, hq.bottom - 4]];
    return ["Clery's time! Your friends are waiting", [br.centerx, br.bottom - 4]];
  }

  wild_door() {
    const st = this.st;
    if (st.phase === "morning" && this.friend_farewell(() => this.wild_door())) return;
    if (st.phase === "morning") {
      const start = () => {
        this.game.transition(() => this.game.replace(new ShiftScene(this.game, "wild")));
      };
      this.zoe_say(["Wildside Rescue: strays, wild critters and FERAL patients that bite. Nearly double pay!",
        `Work a HECTIC shift here for Day ${st.day}?`], null, [["Let's go!", start], ["Not today", () => {}]]);
    } else {
      this.zoe_say(["Wildside's closed for the night. I can hear something growling in there..."]);
    }
  }

  clinic_door() {
    const st = this.st;
    if (st.phase === "morning" && this.friend_farewell(() => this.clinic_door())) return;
    if (st.phase === "morning") {
      const start = () => {
        this.game.transition(() => this.game.replace(new ShiftScene(this.game)));
      };
      const extra = st.rush ? " It's a RUSH DAY!" : "";
      this.zoe_say([`Ready to open the clinic for Day ${st.day}?${extra}`], null,
        [["Open!", start], ["Not yet", () => {}]]);
    } else {
      this.zoe_say(["The clinic is closed for today. Time to head home and get some rest!"]);
    }
  }

  // ------------------------------------------------------------- night life
  setup_night() {
    if (this.night_on) return;
    this.night_on = true;
    // kids and early birds head home
    this.npcs = this.npcs.filter((n: NPC) => !["bea", "mabel", "juniper", "otis", "maple"].includes(n.name));
    const br: Rect = this.bar_rect;
    this.npcs.push(new NPC("bruno", br.centerx - 18, br.bottom + 12, "down"));
    for (let i = 0; i < 5; i++) {
      const [qx, qy] = this.queue_spot(i);
      const g = new NPC("guest" + (1 + (i % 6)), qx, qy, "left");
      g.q = true;
      this.queue.push(g);
      this.npcs.push(g);
    }
    this.q_timer = 4;
    this.guest_i = 5;
    // couples out for an evening stroll around the plaza
    this.npcs.push(new NPC("guest4", 36 * T, 18 * T + 10, "right", 18));
    this.npcs.push(new NPC("guest5", 43 * T, 18 * T + 10, "left", 18));
  }

  queue_spot(i: number): number[] {
    const br: Rect = this.bar_rect;
    return [br.centerx + 20 + i * 13, 7 * T + 10];
  }

  update(dt: number) {
    super.update(dt);
    if (this.trail) this.update_friends(dt);
    if (!this.night_on && gstate.night_k(this.st) >= 0.55) this.setup_night();
    if (this.night_on) this.update_queue(dt);
    // butterflies by day
    if (this.st.phase === "morning" && pg.random.random() < dt * 0.8) {
      const bx = this.cam[0] + pg.random.uniform(0, SW), by = this.cam[1] + pg.random.uniform(30, SH);
      this.particles.add("butterfly", bx, by, 1, { vx: pg.random.uniform(-14, 14), vy: pg.random.uniform(-10, 4), life: 3.5,
        color: pg.random.choice([[250, 200, 90], [250, 160, 200], [160, 200, 250], [255, 255, 255]]) });
    }
    // fireflies in the park at night
    if (gstate.night_k(this.st) > 0.7 && pg.random.random() < dt * 2.5) {
      this.particles.add("sparkle", pg.random.uniform(20 * T, 32 * T), pg.random.uniform(13 * T, 21 * T), 1,
        { vx: pg.random.uniform(-8, 8), vy: pg.random.uniform(-8, 8), life: 1.6 });
    }
  }

  update_queue(dt: number) {
    const br: Rect = this.bar_rect;
    this.q_timer -= dt;
    if (this.q_timer <= 0 && !this.dialogue) {
      this.q_timer = pg.random.uniform(4, 7);
      const front = this.queue[0];
      if (front && !front.talking) {
        this.queue.shift();
        front.q_leaving = true;
        front.q_path = [[br.centerx, br.bottom + 2]];
      }
      if (this.queue.length < 6) {
        this.guest_i += 1;
        const g = new NPC("guest" + (1 + (this.guest_i % 6)), (this.tw - 2) * T, 9 * T + 4, "left");
        g.q = true;
        g.q_path = [[this.queue_spot(this.queue.length)[0], 9 * T + 4]];
        this.queue.push(g);
        this.npcs.push(g);
      }
    }
    // guests walk to their spot in line (they ignore collisions so the line never jams)
    for (const g of (this.npcs as any[]).slice()) {
      if (!g.q || g.talking) continue;
      let target: number[];
      if (g.q_path && g.q_path.length) target = g.q_path[0];
      else if (g.q_leaving) {
        this.npcs = this.npcs.filter((n: any) => n !== g); // went inside Clery's
        continue;
      } else target = this.queue_spot(this.queue.indexOf(g));
      const dx = target[0] - g.x, dy = target[1] - g.y;
      const d = Math.hypot(dx, dy);
      if (d < 1.5) {
        if (g.q_path && g.q_path.length) g.q_path.shift();
        g.moving = false;
        if (!g.q_leaving) g.dir = "left";
        continue;
      }
      const sp = Math.min(d, 40 * dt);
      g.x += (dx / d) * sp;
      g.y += (dy / d) * sp;
      g.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      g.moving = true;
      g.anim += dt * 8;
    }
  }

  draw(s: Surface) {
    if (this.fountain) this.fountain.img = props2.fountain(pg.mod(Math.trunc(this.anim_t * 3), 2));
    super.draw(s);
  }

  draw_after(s: Surface, cx: number, cy: number) {
    if (this.bubble && this.bubble.who && this.name === "town") draw_bubble(s, this.bubble.text, this.bubble.who.x - cx, this.bubble.who.y - cy - 40);
    if (this.st.phase !== "evening") return;
    const k = gstate.night_k(this.st);
    // golden-hour tint fades out as night falls
    const warm = Math.trunc(46 * (1 - k));
    if (warm > 2) {
      const veil = sprites.cached("town_warm|" + warm, () => {
        const v = new Surface([SW, SH], SRCALPHA);
        v.fill([250, 140, 90, warm]);
        return v;
      });
      s.blit(veil, [0, 0]);
    }
    const a = Math.trunc(165 * k);
    if (a < 4) return;
    // darkness with pools of lamplight carved out of it
    const dark: Surface = this.dark;
    dark.fill([14, 16, 46, a]);
    for (const [lx, ly, r] of this.lights) {
      const sx = lx - cx, sy = ly - cy;
      if (sx < -r || sy < -r || sx > SW + r || sy > SH + r) continue;
      // soft warm pool: many rings fading from night-blue to lamp-gold
      const steps = 7;
      for (let i = 0; i < steps; i++) {
        const f = i / (steps - 1); // 0 = outer edge, 1 = center
        const rr = Math.trunc(r * (1 - f * 0.8));
        const col = [Math.trunc(14 + 90 * f), Math.trunc(16 + 60 * f), Math.trunc(46 - 26 * f), Math.trunc(a * (0.9 - 0.8 * f))];
        pg.draw.circle(dark, col, [sx, sy + 8 - Math.trunc(f * 4)], Math.max(2, rr));
      }
    }
    for (const [wx, wy, ww, wh] of this.windows) {
      const sx = wx - cx, sy = wy - cy;
      if (sx < -30 || sy < -30 || sx > SW + 30 || sy > SH + 30) continue;
      pg.draw.rect(dark, [40, 30, 30, Math.trunc(a * 0.4)], [sx - 4, sy - 3, ww + 8, wh + 10]);
    }
    s.blit(dark, [0, 0]);
    // warm glows on top
    if (k > 0.35) {
      for (const [wx, wy, ww, wh] of this.windows) {
        const sx = wx - cx, sy = wy - cy;
        if (sx < -20 || sy < -20 || sx > SW + 20 || sy > SH + 20) continue;
        pg.draw.rect(s, [255, 222, 140], [sx, sy, ww, wh]);
        pg.draw.rect(s, [255, 244, 200], [sx + 1, sy + 1, 4, 3]);
        pg.draw.rect(s, [230, 180, 110], [sx + 5, sy, 1, wh]);
      }
      for (const [lx, ly] of this.lights) {
        const sx = lx - cx, sy = ly - cy;
        if (sx < -10 || sy < -10 || sx > SW + 10 || sy > SH + 10) continue;
        pg.draw.circle(s, [255, 240, 170], [sx, sy], 2);
      }
    }
  }
}

// ======================================================================= INTERIORS
export class RoomScene extends WorldScene {
  // Python class attributes; getters so they are visible while build() runs
  // inside the base constructor (field initializers would run too late).
  get room_w(): number { return 20; }
  get room_h(): number { return 12; }
  get floor(): string { return "wood"; }
  get wall(): string { return "wall"; }

  build_room() {
    this.tiles = [];
    for (let j = 0; j < this.room_h; j++) this.tiles.push(new Array(this.room_w).fill(this.floor));
    for (let x = 0; x < this.room_w; x++) {
      this.tiles[0][x] = this.wall;
      this.tiles[1][x] = this.wall + (this.wall === "wall" ? "_trim" : "");
      this.solid.add(tk(x, 0));
      this.solid.add(tk(x, 1));
      this.solid.add(tk(x, this.room_h - 1));
      this.tiles[this.room_h - 1][x] = this.wall;
    }
    for (let y = 0; y < this.room_h; y++) this.solid.add(tk(-1, y));
    const dx = Math.floor(this.room_w / 2) - 1;
    for (const x of [dx, dx + 1]) {
      this.solid.delete(tk(x, this.room_h - 1));
      this.tiles[this.room_h - 1][x] = this.floor;
    }
    this.add_obj(props.runner(3 * T), dx * T + 5, (this.room_h - 4) * T + 4, null, -2);
    this.add_obj(sprites.obj("doormat"), dx * T, (this.room_h - 1) * T + 2, null, 0);
    this.exit_pos = [dx * T + 16, (this.room_h - 1) * T + 4];
    this.doors.push({ rect: new Rect(dx * T, (this.room_h - 1) * T + 10, 32, 6), dir: "down", fn: () => this.exit_room() });
  }

  exit_room() {}

  get night_dim(): boolean { return true; }

  draw_guides(s: Surface, cx: number, cy: number) {
    const k = this.night_dim ? gstate.night_k(this.st) : 0;
    if (k > 0.05) {
      const a = Math.trunc(70 * k);
      s.blit(sprites.cached("room_night|" + a, () => {
        const v = new Surface([SW, SH], SRCALPHA);
        v.fill([24, 24, 70, a]);
        return v;
      }), [0, 0]);
    }
    // a permanent "EXIT" marker over the door
    const [ex, ey] = this.exit_pos;
    const bob = Math.trunc(Math.abs(Math.sin(this.game.time * 3)) * 2);
    font.draw(s, "EXIT", [ex - cx, ey - cy - 14 + bob], [255, 255, 255], 1, [52, 38, 64], "center");
    props.arrow(s, ex - cx, ey - cy - 2 + bob, "down", [140, 220, 150], 3);
  }

  default_spawn(): number[] {
    return [Math.floor(this.room_w / 2) * T, (this.room_h - 2) * T + 8];
  }
}

/** Pregame chat (at Zoe's or a friend's place): toast, or head to Clery's together. */
function pregame_talk(scene: any, npc: NPC) {
  const st = scene.st;
  const line = pg.random.choice(friends.PREGAME_LINES[npc.name] || ["Pregame!"]);
  npc.talking = true;
  const done = () => { npc.talking = false; };
  scene.npc_say(npc.name, [line], done, [
    ["Cheers!", () => {
      done();
      for (const n of scene.npcs) if (scene.pregame.includes(n.name)) scene.particles.burst("heart", n.x, n.y - 20, 3, 14);
      scene.particles.text("CHEERS!", scene.player.x, scene.player.y - 34, ui.ACCENT, 1.4);
      st.tipsy = Math.min(150, (st.tipsy || 0) + 6);
      friends.add_pts(st, npc.name);
      scene.game.audio.play("chime");
    }],
    ["Let's go!", () => {
      done();
      if (!gstate.dressed_for_night(st)) {
        scene.npc_say(npc.name, ["You can't go out in SCRUBS! Mirror. Now. We'll wait."]);
        return;
      }
      st.pregame_done = st.day;
      st.walk_with = { names: scene.pregame.slice(), dest: "bar", day: st.day, phase: st.phase };
      for (const nm of scene.pregame) friends.add_pts(st, nm);
      scene.npcs = scene.npcs.filter((n: NPC) => !scene.pregame.includes(n.name));
      scene.pregame = null;
      scene.zoe_say(["Clery's, here we come!"], () => scene.exit_room());
    }],
    ["Chat", done],
  ]);
}

/** Game night chat at a friend's: pick a game, or just hang out. */
function game_talk(scene: any, npc: NPC) {
  npc.talking = true;
  const done = () => { npc.talking = false; };
  const pool: string[] = friends.PREGAME_LINES[npc.name] || ["Game night!"];
  scene.npc_say(npc.name, [pg.random.choice(pool.concat(friends.WALK_LINES[npc.name] || []))], done, [
    ["Cards", () => { done(); scene.play("cards"); }],
    ["Paw-Prix", () => { done(); scene.play("kart"); }],
    ["Chat", done],
  ]);
}

/** Inside a friend's house on Hillside: pregames, game nights, or just hanging out. */
export class FriendHouseScene extends RoomScene {
  name = "friendhouse";
  get room_w(): number { return 20; }
  get room_h(): number { return 12; }
  get floor(): string { return (friends.HOUSES[this.owner] || {}).floor || "wood"; }
  get wall(): string { return (friends.HOUSES[this.owner] || {}).wall || "wall"; }

  constructor(game: any, owner: string) {
    (FriendHouseScene as any)._owner = owner;
    super(game, null, "up");
  }

  build() {
    this.owner = (FriendHouseScene as any)._owner;
    this.build_room();
    const st = this.st;
    const info = friends.HOUSES[this.owner];
    const nm = friends.NICE[this.owner];
    const nk = gstate.night_k(st);
    this.add_obj(props.window_(32, 18, [200, 200, 220], nk < 0.55, nk >= 0.55), 3 * T, 6, null, 2);
    this.add_obj(props.window_(32, 18, [200, 200, 220], nk < 0.55, nk >= 0.55), 15 * T, 6, null, 2);
    this.add_obj(props.shop_sign(`${nm.toUpperCase()}'S PLACE`, [255, 246, 230], info.color), 8 * T, 8, null, 2);
    // the TV + couch corner (racing game) and the card table
    this.add_obj(tv_art(), 3 * T, 2 * T - 2, [3 * T, 2 * T + 6, 40, 12]);
    this.interacts.push({ rect: new Rect(3 * T, 2 * T - 4, 40, 30), prompt: "Play Paw-Prix", fn: () => this.play("kart") });
    this.add_obj(sprites.decor("sofa"), 3 * T + 4, 4 * T + 6, [3 * T + 4, 4 * T + 10, 32, 10]);
    this.add_obj(props.rug(80, 36, info.color, sprites.darker(info.color, 0.8)), 2 * T, 4 * T, null, -1);
    this.add_obj(card_table_art(), 12 * T, 6 * T, [12 * T + 2, 6 * T + 8, 36, 12]);
    this.interacts.push({ rect: new Rect(12 * T, 5 * T + 8, 40, 30), prompt: "Play Cards", fn: () => this.play("cards") });
    // their own things
    const spots = [[17 * T, 2 * T - 6], [1 * T, 8 * T], [17 * T, 8 * T]];
    info.decor.forEach((d: string, i: number) => {
      const img = sprites.decor(d, 0);
      const [x, y] = spots[i % spots.length];
      if (d === "rug") this.add_obj(img, x, y, null, -1);
      else this.add_obj(img, x, y + 16 - img.get_height(), [x + 1, y + 6, img.get_width() - 2, 10]);
    });
    // who's here?
    const plan = friends.tonight(st);
    this.pregame = null;
    this.gamenight = false;
    let guests: string[] = [this.owner];
    if (plan && plan.host === this.owner && plan.kind === "pregame" && st.pregame_done !== st.day) {
      this.pregame = plan.names.slice();
      guests = plan.names;
    } else if (plan && plan.host === this.owner && plan.kind === "gamenight") {
      this.gamenight = true;
      guests = plan.names;
    }
    const pos = [[8 * T + 8, 7 * T + 4, "right"], [11 * T + 6, 8 * T + 10, "right"], [6 * T, 6 * T + 10, "down"]];
    guests.forEach((g, i) => this.npcs.push(new NPC(g, pos[i][0] as number, pos[i][1] as number, pos[i][2] as string)));
  }

  get night_dim(): boolean { return false; }

  enter() {
    const st = this.st;
    const P = (n: string) => sprites.npc_portrait(n);
    const nm = friends.NICE[this.owner];
    if (this.pregame && st.met_house !== st.day) {
      st.met_house = st.day;
      const other = this.pregame.find((n: string) => n !== this.owner) || this.owner;
      this.say([
        [nm, P(this.owner), `ZOE! Welcome to the pregame! Love the outfit.`],
        [friends.NICE[other], P(other), "Toast first, then we all walk to Clery's together!"],
      ]);
    } else if (this.gamenight && st.met_house !== st.day) {
      st.met_house = st.day;
      const plan = friends.tonight(st);
      const other = plan.names[1];
      this.say([
        [nm, P(this.owner), plan.game === "kart" ? "GAME NIGHT! Controllers are on the couch. Paw-Prix, three laps, no mercy." : "GAME NIGHT! Cards are on the table. House rules: no crying."],
        [friends.NICE[other], P(other), "Snacks are on the counter. Pick a game, Zoe!"],
      ]);
    }
  }

  goal(): [string, number[] | null] | null {
    if (this.pregame) return ["Toast with the crew, then say LET'S GO to head to Clery's", null];
    if (this.gamenight) {
      const plan = friends.tonight(this.st);
      if (this.st.gamenight_done === this.st.day) return ["Play again, or head home to sleep", this.exit_pos];
      return plan.game === "kart" ? ["Play Paw-Prix on the TV!", [3 * T + 20, 2 * T - 6]] : ["Sit down at the card table!", [12 * T + 20, 6 * T - 4]];
    }
    return [`Hanging out at ${friends.NICE[this.owner]}'s - play cards or Paw-Prix`, null];
  }

  talk_npc(npc: NPC) {
    if (this.pregame && this.pregame.includes(npc.name)) {
      pregame_talk(this, npc);
      return;
    }
    game_talk(this, npc);
  }

  /** Start a game with whoever is here. */
  play(kind: string) {
    if (this.pregame) {
      this.npc_say(this.owner, ["No games now - we're heading to Clery's! Let's go!"]);
      return;
    }
    const players = this.npcs.map((n: NPC) => n.name).filter((n: string) => friends.GANG.includes(n));
    const st = this.st;
    let scene: any = null;
    const done = (res: string, line: string) => {
      if (res === "win" || res === "lose") {
        for (const p of players) friends.add_pts(st, p);
        if (this.gamenight) st.gamenight_done = st.day;
      }
      const who = scene && scene.speaker && players.includes(scene.speaker) ? scene.speaker : players[0];
      if (line) this.npc_say(who, [line]);
    };
    scene = kind === "kart" ? new KartGame(this.game, players, done as any) : new CardGame(this.game, players, done as any);
    this.game.push(scene);
  }

  exit_room() {
    exit_to_town(this.game, "house_" + this.owner);
  }
}

function tv_art(): Surface {
  return sprites.cached("friend_tv", () => {
    const s = sprites.new_(40, 22);
    const R = (c: any, x: number, y: number, w: number, h: number) => pg.draw.rect(s, c, [x, y, w, h]);
    R([60, 50, 60], 2, 14, 36, 8); R([90, 76, 86], 2, 14, 36, 2); // stand
    R([30, 30, 40], 4, 0, 32, 15);
    R([90, 200, 120], 6, 2, 28, 11); R([120, 120, 130], 6, 9, 28, 4); // a race on screen
    R([250, 250, 250], 10, 10, 2, 1); R([250, 250, 250], 18, 10, 2, 1); R([250, 250, 250], 26, 10, 2, 1);
    R([240, 90, 110], 14, 7, 4, 3); R([90, 140, 240], 22, 6, 4, 3);
    R([200, 200, 210], 8, 17, 6, 2); R([200, 200, 210], 26, 17, 6, 2); // controllers
    return sprites.outline(s);
  });
}

function card_table_art(): Surface {
  return sprites.cached("card_table", () => {
    const s = sprites.new_(40, 24);
    const R = (c: any, x: number, y: number, w: number, h: number) => pg.draw.rect(s, c, [x, y, w, h]);
    R([120, 80, 56], 6, 16, 3, 8); R([120, 80, 56], 31, 16, 3, 8);
    pg.draw.ellipse(s, [110, 70, 50], [0, 4, 40, 16]);
    pg.draw.ellipse(s, [60, 140, 90], [3, 5, 34, 12]);
    for (const [x, y, c] of [[10, 8, [250, 250, 250]], [16, 7, [250, 250, 250]], [24, 9, [240, 90, 110]], [19, 11, [250, 250, 250]]] as any) {
      R(c, x, y, 5, 4); R([60, 50, 70], x, y, 5, 1);
    }
    return sprites.outline(s);
  });
}

export class HQScene extends RoomScene {
  name = "hq";
  get floor(): string { return "herringbone"; }
  get wall(): string { return "hqwall"; }
  /** Python set of (x, y) tuples -> Set of "x,y" strings */
  static fixed_tiles = new Set<string>(["1,2", "1,3", "13,2", "15,2", "9,10", "10,10", "9,9", "10,9", "2,2", "18,2", "1,9"]);
  get fixed_tiles(): Set<string> { return HQScene.fixed_tiles; }

  build() {
    this.build_room();
    this.add_obj(sprites.obj("bed"), 1 * T, 2 * T, [1 * T, 2 * T, 16, 32]);
    this.interacts.push({ rect: new Rect(1 * T, 2 * T, 18, 34), prompt: "Bed", fn: () => this.use_bed() });
    this.add_obj(sprites.obj("mirror"), 5 * T + 12, 8, null, 2 * T);
    this.interacts.push({ rect: new Rect(5 * T + 12, 8, 16, 26), prompt: "Mirror", fn: () => this.use_mirror() });
    this.shelf_pos = [7 * T, 4];
    this.add_obj(sprites.obj("shelf"), this.shelf_pos[0], this.shelf_pos[1], null, 2 * T);
    this.interacts.push({ rect: new Rect(7 * T, 4, 40, 28), prompt: "Trophies", fn: () => this.use_shelf() });
    this.add_obj(sprites.obj("laptop"), 13 * T, 2 * T - 4, [13 * T, 2 * T, 16, 14]);
    this.interacts.push({ rect: new Rect(13 * T, 2 * T - 4, 16, 20), prompt: "Order Online", fn: () => this.use_laptop() });
    this.add_obj(sprites.obj("planner"), 15 * T, 2 * T - 4, [15 * T, 2 * T, 16, 14]);
    // --- cozy details
    this.add_obj(props.bunting(320), 0, 0, null, 1);
    const nk = gstate.night_k(this.st);
    const eve = this.st.phase === "evening" && nk < 0.55, nite = nk >= 0.55;
    this.add_obj(props.window_(32, 18, [240, 150, 170], eve, nite), 10 * T + 8, 6, null, 2);
    this.add_obj(props.window_(32, 18, [240, 150, 170], eve, nite), 17 * T, 6, null, 2);
    this.add_obj(props.wall_clock(), 19 * T + 1, 8, null, 2);
    this.add_obj(props.picture("sun"), 13 * T + 8, 8, null, 2);
    this.add_obj(props.nightstand(), 2 * T + 1, 2 * T - 6, [2 * T + 1, 2 * T + 8, 14, 8]);
    this.add_obj(props.rug(112, 48, [246, 190, 196], [214, 120, 140]), 5 * T, 5 * T, null, -1);
    this.add_obj(sprites.decor("plant"), 18 * T, 2 * T - 6, [18 * T + 2, 2 * T + 4, 12, 10]);
    this.add_obj(sprites.decor("plant"), 1 * T, 9 * T - 6, [1 * T + 2, 9 * T + 4, 12, 10]);
    this.interacts.push({ rect: new Rect(15 * T, 2 * T - 4, 16, 20), prompt: "Decorate", fn: () => this.use_planner() });
    this.apply_decor();
    this.spawn_pets(new Rect(3 * T, 4 * T, 13 * T, 4 * T));
    // pregame at Zoe's
    const st = this.st;
    const plan = friends.tonight(st);
    this.pregame = null;
    if (plan && plan.kind === "pregame" && plan.host === "zoe" && st.pregame_done !== st.day && st.bar_day !== st.day && !friends.walking(st)) {
      this.pregame = plan.names;
      this.add_obj(props2.round_table([170, 110, 80]), 9 * T + 2, 6 * T + 6, [9 * T + 4, 6 * T + 12, 24, 8]);
      this.npcs.push(new NPC(plan.names[0], 8 * T + 4, 7 * T + 2, "right"));
      this.npcs.push(new NPC(plan.names[1], 12 * T + 2, 7 * T + 2, "left"));
    }
  }

  talk_npc(npc: NPC) {
    if (!this.pregame || !this.pregame.includes(npc.name)) {
      super.talk_npc(npc);
      return;
    }
    pregame_talk(this, npc);
  }

  apply_decor() {
    this.objects = this.objects.filter((o: any) => !o.decor);
    for (const d of this.st.layouts.hq) {
      const info = data.DECOR[d.name];
      const [w, h] = info.size;
      const img = sprites.decor(d.name, d.rot ?? 0);
      const x = d.x * T, y = d.y * T;
      const solid = info.solid ? [x + 1, y + 2, w * T - 2, h * T - 2] : null;
      let sort = !info.solid ? y : y + h * T - 2;
      if (d.name === "rug") sort = -1;
      const o = this.add_obj(img, x, y + h * T - img.get_height(), solid, sort);
      o.decor = true;
    }
  }

  default_spawn(): number[] {
    return [2 * T + 10, 4 * T + 10];
  }

  goal(): [string, number[] | null] | null {
    const st = this.st;
    if (this.pregame) {
      if (!gstate.dressed_for_night(st)) return ["Pregame! Change at the Mirror while the crew hypes you up", [5 * T + 20, 3 * T - 2]];
      return ["Talk to the crew and say LET'S GO!", [8 * T + 4, 6 * T]];
    }
    if (st.phase === "evening") {
      if (st.bar_day !== st.day && !gstate.dressed_for_night(st)) return ["Change outfits at the Mirror for Clery's", [5 * T + 20, 3 * T - 2]];
      if (st.bar_day !== st.day) return ["Head out to Clery's - or sleep in your bed", this.exit_pos];
      return ["Sleep in your bed to start the next day", [1 * T + 8, 3 * T + 8]];
    }
    return ["Walk out the door to go to town", this.exit_pos];
  }

  enter() {
    const st = this.st;
    const flag = st._new_day_banner ?? false;
    delete st._new_day_banner;
    if (flag) {
      const sub = st.rush ? "RUSH DAY! Big crowds today!" : gstate.rank_name(st.xp);
      this.banner = { t: 0.0, title: `DAY ${st.day}`, sub };
      this.game.audio.play("chime");
    }
    const w = friends.walking(st);
    if (w && w.dest === "hq") {
      const f = w.names[0];
      st.walk_with = null;
      this.npc_say(f, [friends.HOME_BYE[f] || "Night, Zoe!"]);
    } else if (this.pregame && st.met_e !== st.day) {
      st.met_e = st.day;
      const [a, b] = this.pregame;
      const P = (n: string) => sprites.npc_portrait(n);
      this.game.audio.play("sparkle");
      this.say([
        [friends.NICE[a], P(a), "SURPRISE! Pregame at Zoe's!"],
        [friends.NICE[b], P(b), "We let ourselves in. Your spare key is NOT well hidden."],
        [friends.NICE[a], P(a), "Get changed at the Mirror, have a toast with us, then we'll all walk to Clery's!"],
      ]);
    }
  }

  exit_room() {
    const go = () => {
      const t = new TownScene(this.game);
      this.game.replace(t);
    };
    this.game.transition(go);
  }

  use_bed() {
    const st = this.st;
    if (st.phase === "morning") {
      this.zoe_say(["It's morning! The clinic is waiting for me."]);
      return;
    }

    const sleep = () => {
      const doit = () => {
        start_new_day(this.game);
        this.game.replace(new HQScene(this.game));
      };
      this.game.transition(doit);
    };
    this.zoe_say(["What a day! Time for bed?"], null, [["Sleep", sleep], ["Not yet", () => {}]]);
  }

  use_mirror() {
    this.game.push(new MirrorMenu(this.game));
  }

  use_shelf() {
    this.game.push(new TrophyMenu(this.game));
  }

  use_laptop() {
    this.game.push(new StoreMenu(this.game, true));
  }

  use_planner() {
    this.game.push(new DecorateMenu(this.game, this));
  }

  draw_after(s: Surface, cx: number, cy: number) {
    if (this.bubble && this.bubble.who && this.name === "town") draw_bubble(s, this.bubble.text, this.bubble.who.x - cx, this.bubble.who.y - cy - 40);
    // badges on the physical shelf
    const x0 = this.shelf_pos[0] - cx, y0 = this.shelf_pos[1] - cy;
    const keys = Object.keys(data.BADGES);
    keys.forEach((k, i) => {
      const row = Math.floor(i / 4), col = i % 4;
      const bx = x0 + 2 + col * 9;
      const by = y0 - 4 + row * 11;
      const locked = !this.st.badges.includes(k);
      const img = sprites.badge(k, locked);
      const small = sprites.scaled("badge_small|" + k + "|" + locked, img, 1);
      s.blit(pg.transform.scale(small, [8, 8]), [bx, by + 6]);
    });
  }
}

export class StoreScene extends RoomScene {
  name = "store";
  get floor(): string { return "planks"; }
  get wall(): string { return "brickwall"; }

  build() {
    this.build_room();
    for (const x of [1, 4, 14, 17]) {
      this.add_obj(sprites.obj("store_shelf"), x * T - 4, 2, [x * T - 4, 2 * T, 32, 14]);
    }
    this.add_obj(sprites.obj("counter"), 7 * T - 8, 4 * T, [7 * T - 8, 4 * T + 4, 64, 16]);
    this.npcs.push(new NPC("bramble", 10 * T, 4 * T + 2, "down"));
    this.interacts.push({ rect: new Rect(7 * T - 8, 4 * T - 8, 64, 30), prompt: "Shop", fn: () => this.shop() });
    this.add_obj(sprites.decor("plant"), 2 * T, 8 * T, [2 * T + 2, 9 * T - 4, 12, 6]);
    this.add_obj(sprites.decor("plant"), 17 * T, 8 * T, [17 * T + 2, 9 * T - 4, 12, 6]);
    // --- shop details
    this.add_obj(props.bunting(320), 0, 0, null, 1);
    const sign = props.shop_sign("BRAMBLE'S PET SUPPLY", [255, 236, 180], [170, 90, 50]);
    this.add_obj(sign, 10 * T - Math.floor(sign.get_width() / 2), 6, null, 2);
    this.add_obj(props.shop_sign("OPEN", [180, 230, 170], [50, 120, 60]), 9 * T + 2, 19, null, 2);
    this.add_obj(props.rug(128, 22, [190, 220, 170], [130, 170, 110]), 6 * T, 6 * T + 2, null, -1);
    this.add_obj(props.food_sacks(), 4 * T + 4, 8 * T + 2, [4 * T + 4, 8 * T + 8, 24, 10]);
    this.add_obj(props.crate(), 14 * T, 8 * T + 4, [14 * T, 8 * T + 8, 16, 10]);
    this.add_obj(sprites.decor("fishtank"), 15 * T + 4, 6 * T, [15 * T + 4, 6 * T + 6, 32, 10]);
    this.add_obj(sprites.decor("cattree"), 2 * T, 5 * T + 4, [2 * T + 2, 6 * T + 4, 12, 10]);
    this.shopped = false;
  }

  goal(): [string, number[] | null] | null {
    if (!this.shopped) return ["Talk to Mr. Bramble to shop", [10 * T, 4 * T - 20]];
    return ["Walk out the door to go back to town", this.exit_pos];
  }

  talk_npc(npc: NPC) {
    this.shop();
  }

  shop() {
    this.npc_say("bramble", ["Welcome to Bramble's Pet Supply! Take a look around."],
      () => {
        this.shopped = true;
        this.game.push(new StoreMenu(this.game));
      });
  }

  exit_room() {
    const go = () => {
      const t = new TownScene(this.game);
      t.player.x = t.store_rect.centerx;
      t.player.y = t.store_rect.bottom + 8;
      t.player.dir = "down";
      t._update_cam(true);
      this.game.replace(t);
    };
    this.game.transition(go);
  }
}

/** Leave a venue and stand outside its door in town. */
function exit_to_town(game: any, rect_key: string) {
  const go = () => {
    const t = new TownScene(game);
    const r: Rect = t[rect_key];
    t.player.x = r.centerx;
    t.player.y = r.bottom + 8;
    t.player.dir = "down";
    t._update_cam(true);
    game.replace(t);
  };
  game.transition(go);
}

/** Picks an NPC's rotating line and turns them to face Zoe. */
function npc_line(scene: any, npc: NPC): string {
  const rank = gstate.rank_index(scene.st.xp);
  const pool = (data.NPC_LINES[npc.name] ?? [[0, "Hello!"]]).filter(([r]: any) => r <= rank).map(([, t]: any) => t);
  if (!scene.st.talk_counts) scene.st.talk_counts = {};
  const key = "talks_" + npc.name;
  const n = scene.st.talk_counts[key] ?? 0;
  scene.st.talk_counts[key] = n + 1;
  const dx = scene.player.x - npc.x, dy = scene.player.y - npc.y;
  npc.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  npc.talking = true;
  return pool[pg.mod(scene.st.day + n, pool.length)];
}

// ======================================================================= CLERY'S
export class BarScene extends RoomScene {
  name = "bar";
  get floor(): string { return "darkplanks"; }
  get wall(): string { return "darkbrick"; }
  get night_dim(): boolean { return false; }

  build() {
    this.build_room();
    this.add_obj(props2.string_lights(320, 0), 0, 0, null, 1);
    this.add_obj(props2.bottle_shelf(128), 2 * T, 3, null, 1);
    this.add_obj(props2.neon_sign("CLERY'S", [120, 240, 170], 0), 11 * T + 8, 5, null, 2);
    this.add_obj(props2.dartboard(), 17 * T + 10, 8, null, 2);
    this.interacts.push({ rect: new Rect(17 * T + 4, 2 * T, 28, 20), prompt: "Darts", fn: () => this.pick_rival(["shteynie", "jayden"], "darts") });
    this.add_obj(props.picture("heart", [200, 170, 90]), 15 * T + 12, 10, null, 2);
    this.add_obj(props2.bar_counter(128), 2 * T, 3 * T, [2 * T, 3 * T + 4, 128, 16]);
    this.interacts.push({ rect: new Rect(2 * T, 2 * T, 128, 34), prompt: "Order", fn: () => this.order() });
    for (const x of [3, 5, 7, 9]) this.add_obj(props2.stool(), x * T + 3, 4 * T + 10, null, 4 * T + 18);
    this.add_obj(props2.round_table(), 14 * T + 2, 5 * T + 6, [14 * T + 4, 5 * T + 12, 24, 8]);
    this.add_obj(props2.round_table([110, 70, 50]), 6 * T + 8, 6 * T + 12, [6 * T + 10, 6 * T + 18, 24, 8]);
    this.add_obj(props2.pool_table(), 12 * T + 4, 8 * T, [12 * T + 4, 8 * T + 4, 56, 24]);
    this.interacts.push({ rect: new Rect(12 * T + 4, 8 * T, 56, 30), prompt: "Pool", fn: () => this.pick_rival(["danny", "stephen"], "pool") });
    // cozy booth in the corner where Renee and Tish hold court
    this.add_obj(props2.round_table([150, 90, 110]), 2 * T + 8, 8 * T + 10, [2 * T + 10, 8 * T + 16, 24, 8]);
    this.jukebox = this.add_obj(props2.jukebox(0), 1 * T - 4, 6 * T, [1 * T - 4, 6 * T + 12, 18, 16]);
    this.interacts.push({ rect: new Rect(1 * T - 4, 6 * T, 20, 30), prompt: "Jukebox", fn: () => this.jukebox_play() });
    this.add_obj(sprites.decor("plant"), 18 * T, 9 * T - 6, [18 * T + 2, 9 * T + 4, 12, 10]);
    // the gang - everybody has their spot
    this.npcs.push(new NPC("mags", 6 * T, 3 * T + 2, "down"));
    this.npcs.push(new NPC("andrew", 5 * T + 11, 5 * T + 10, "up"));     // shots at the bar
    this.npcs.push(new NPC("greg", 7 * T + 11, 5 * T + 10, "up"));
    this.npcs.push(new NPC("shteynie", 17 * T + 12, 4 * T + 10, "up"));  // darts
    this.npcs.push(new NPC("jayden", 14 * T + 4, 4 * T + 8, "right"));
    this.npcs.push(new NPC("danny", 11 * T + 6, 9 * T + 4, "right"));    // pool
    this.npcs.push(new NPC("stephen", 16 * T + 10, 9 * T + 4, "left"));
    this.npcs.push(new NPC("renee", 1 * T + 12, 9 * T + 8, "right"));    // the corner booth
    this.npcs.push(new NPC("tish", 5 * T + 2, 9 * T + 8, "left"));
    this.music_i = 0;
    this.banter_i = pg.random.randrange(friends.BAR_BANTER.length);
    this.banter_t = 2.5;
    this.dart_t = 2;
  }

  enter() {
    const st = this.st;
    if (st.bar_day !== st.day) {
      st.bar_day = st.day;
      const P = (n: string) => sprites.npc_portrait(n);
      this.say([
        ["Everyone", null, "ZOE!!!"],
        ["Renee", P("renee"), "Yay, you made it! Okay, I LOVE that outfit."],
        ["Tish", P("tish"), "Grab a drink, sit down, tell us everything about today."],
        ["Shteynie", P("shteynie"), "Now the party can start. Darts later? You're going DOWN."],
        ["Greg", P("greg"), "Andrew and I are doing shots at the bar. Pull up a stool!"],
        ["Stephen", P("stephen"), "Danny and I have the pool table. Shteynie and Jayden are on darts. Pick your game!"],
      ]);
    }
  }

  darts_any() {
    const pool = this.npcs.filter((n: NPC) => n.name in data.SHOT_RIVALS).map((n: NPC) => n.name);
    const rival = pg.random.choice(pool) as string;
    this.start_darts(rival);
  }

  start_darts(rival: string) {
    this.game.push(new DartsGame(this.game, rival, (res: string, reply: string) => {
      if (res === "win") challenges.progress(this.game, "darts_win");
      if (reply) this.npc_say(rival, [reply]);
    }));
  }

  goal(): [string, number[] | null] | null {
    return ["Pool, darts, shots - or buy the gang a round!", null];
  }

  order() {
    this.npc_say("mags", ["Welcome to Clery's, love. What'll it be?"], null, [
      ["Food", () => this.game.push(new FoodMenu(this.game, "CLERY'S", data.BAR_MENU, "mags", null))],
      ["Round 20", () => this.buy_round()],
      ["Bye", () => {}],
    ], "Mags");
  }

  buy_round() {
    const st = this.st;
    if (st.coins < 20) {
      this.game.audio.play("error");
      this.npc_say("mags", ["A round for everyone is 20 coins, love."], null, null, "Mags");
      return;
    }
    st.coins -= 20;
    st.tipsy = Math.min(150, (st.tipsy || 0) + 8);
    this.game.audio.play("coin");
    this.game.audio.play("chime");
    for (const n of this.npcs as NPC[]) {
      if (!friends.GANG.includes(n.name)) continue;
      friends.add_pts(st, n.name);
      this.particles.burst("heart", n.x, n.y - 20, 3, 14);
    }
    this.particles.text("CHEERS!!", this.player.x, this.player.y - 34, ui.ACCENT, 1.6);
    this.bubble = { who: this.npcs.find((n: NPC) => n.name === "tish"), text: "ZOE IS THE BEST!", t: 2.5 };
  }

  pick_rival(names: string[], kind: string) {
    const start = (n: string) => () => (kind === "pool" ? this.start_pool(n) : this.start_darts(n));
    this.zoe_say([kind === "pool" ? "Who should I play pool against? (10 coin bet)" : "Who should I play darts against? (10 coin bet)"], null,
      names.map((n) => [friends.NICE[n], start(n)] as [string, () => void]).concat([["Nah", () => {}]]));
  }

  start_pool(rival: string) {
    this.game.push(new PoolGame(this.game, rival, (res: string, reply: string) => {
      if (res === "win" || res === "lose") friends.add_pts(this.st, rival);
      if (reply) this.npc_say(rival, [reply]);
    }));
  }


  jukebox_play() {
    const tracks = ["town", "title", "clinic"];
    this.music_i = (this.music_i + 1) % tracks.length;
    this.game.audio.music(tracks[this.music_i]);
    this.game.audio.play("chime", 0.5);
    this.particles.text("~ NEW SONG ~", this.player.x, this.player.y - 32, [255, 220, 120], 1.4);
  }

  talk_npc(npc: NPC) {
    if (npc.name === "mags") {
      this.order();
      return;
    }
    const line = npc_line(this, npc);
    const done = () => { npc.talking = false; };
    if (npc.name in data.SHOT_RIVALS) {
      const bet = data.SHOT_RIVALS[npc.name].bet;
      const shots: [string, () => void] = [`Shots ${bet}`, () => {
        npc.talking = false;
        this.game.push(new ShotChallenge(this.game, npc.name, (res: string, reply: string) => {
          if (res === "win") challenges.progress(this.game, "shots_win");
          if (res === "win" || res === "lose") friends.add_pts(this.st, npc.name);
          if (reply) this.npc_say(npc.name, [reply]);
        }));
      }];
      const darts: [string, () => void] = ["Darts 10", () => { npc.talking = false; this.start_darts(npc.name); }];
      const pool: [string, () => void] = ["Pool 10", () => { npc.talking = false; this.start_pool(npc.name); }];
      const station: Record<string, [string, () => void][]> = {
        danny: [pool, shots], stephen: [pool, shots], shteynie: [darts, shots], jayden: [darts, shots],
        renee: [shots, darts], tish: [shots, pool], andrew: [shots, darts], greg: [shots, pool],
      };
      this.npc_say(npc.name, [line], done, (station[npc.name] || [shots, darts]).concat([["Cheers!", done]]));
    } else {
      this.npc_say(npc.name, [line], done);
    }
  }

  update(dt: number) {
    super.update(dt);
    // friends chatting with each other
    if (!this.dialogue) {
      this.banter_t -= dt;
      if (this.banter_t <= 0) {
        this.banter_t = pg.random.uniform(3.5, 5.5);
        const [who, text] = friends.BAR_BANTER[this.banter_i % friends.BAR_BANTER.length];
        this.banter_i += 1;
        const n = this.npcs.find((x: NPC) => x.name === who);
        if (n && !n.talking) this.bubble = { who: n, text, t: 2.6 };
      }
    }
    if (this.bubble) {
      this.bubble.t -= dt;
      if (this.bubble.t <= 0) this.bubble = null;
    }
    // Shteynie keeps throwing darts
    this.dart_t -= dt;
    if (this.dart_t <= 0) {
      this.dart_t = pg.random.uniform(2.2, 3.6);
      this.dart_fly = 0;
    }
    if (this.dart_fly != null) {
      this.dart_fly += dt * 3;
      if (this.dart_fly >= 1) {
        this.dart_fly = null;
        this.particles.add("sparkle", 17 * T + 18, 16, 1, { life: 0.4 });
      }
    }
  }

  draw_after(s: Surface, cx: number, cy: number) {
    const t = this.anim_t;
    const find = (n: string) => this.npcs.find((x: NPC) => x.name === n);
    // pool cues
    for (const [n, side] of [["danny", 1], ["stephen", -1]] as [string, number][]) {
      const p = find(n);
      if (!p) continue;
      const jab = Math.trunc(Math.max(0, Math.sin(t * 2 + side)) * 3);
      const x0 = Math.trunc(p.x) - cx + side * (4 + jab), y0 = Math.trunc(p.y) - cy - 12;
      pg.draw.line(s, [190, 150, 100], [x0, y0], [x0 + side * 14, y0 + 2]);
      pg.draw.rect(s, [240, 240, 250], [x0 + side * 14, y0 + 2, 1, 1]);
    }
    // a dart in flight
    const sh = find("shteynie");
    if (sh && this.dart_fly != null) {
      const k = this.dart_fly;
      const x = Math.trunc(sh.x + (17 * T + 18 - sh.x) * k) - cx, y = Math.trunc(sh.y - 18 + (16 - (sh.y - 18)) * k - Math.sin(k * 3.14) * 6) - cy;
      pg.draw.line(s, [230, 80, 90], [x, y], [x + 2, y + 2]);
    }
    // shot glasses clinking at the bar
    const an = find("andrew"), gr = find("greg");
    if (an && gr && pg.mod(Math.trunc(t * 0.5), 3) === 0) {
      const mx = Math.trunc((an.x + gr.x) / 2) - cx, my = Math.trunc(an.y) - cy - 24;
      pg.draw.rect(s, [250, 240, 200], [mx - 4 + (pg.mod(Math.trunc(t * 4), 2)), my, 3, 4]);
      pg.draw.rect(s, [250, 240, 200], [mx + 2 - (pg.mod(Math.trunc(t * 4), 2)), my, 3, 4]);
    }
    if (this.bubble && this.bubble.who) draw_bubble(s, this.bubble.text, this.bubble.who.x - cx, this.bubble.who.y - cy - 40);
  }

  draw(s: Surface) {
    if (this.jukebox) this.jukebox.img = props2.jukebox(this.anim_t);
    super.draw(s);
  }

  exit_room() {
    exit_to_town(this.game, "bar_rect");
  }
}

// ======================================================================= SUNNY SIDE CAFE
export class CafeScene extends RoomScene {
  name = "cafe";
  get floor(): string { return "pressfloor"; }
  get wall(): string { return "presswall"; }
  get night_dim(): boolean { return false; }

  build() {
    this.build_room();
    this.add_obj(props.bunting(320), 0, 0, null, 1);
    this.add_obj(props2.chalkboard(["PRESSED", "COLD-PRESSED JUICE 11"]), 1 * T, 6, null, 2);
    for (const hx of [7 * T, 10 * T + 4]) this.add_obj(props2.hanging_plant(), hx, 2, null, 3);
    this.add_obj(props2.juicer(), 11 * T + 6, 3 * T - 10, null, 3 * T + 30);
    this.add_obj(props.window_(32, 18, [120, 190, 200], this.st.phase === "evening"), 12 * T, 6, null, 2);
    this.add_obj(props.window_(32, 18, [120, 190, 200], this.st.phase === "evening"), 16 * T, 6, null, 2);
    this.add_obj(props.wall_clock(), 14 * T + 9, 8, null, 2);
    this.add_obj(props2.pastry_counter(112), 5 * T, 3 * T - 2, [5 * T, 3 * T + 4, 112, 18]);
    this.interacts.push({ rect: new Rect(5 * T, 2 * T, 112, 36), prompt: "Order", fn: () => this.order() });
    for (const [tx, ty] of [[2 * T, 6 * T], [13 * T, 5 * T + 10], [14 * T + 8, 8 * T + 6], [3 * T, 8 * T + 8]]) {
      this.add_obj(props2.cafe_table(), tx, ty, [tx + 2, ty + 8, 32, 12]);
    }
    this.add_obj(props.rug(96, 20, [250, 220, 180], [220, 170, 130]), 5 * T + 8, 5 * T + 4, null, -1);
    this.add_obj(sprites.decor("plant"), 18 * T, 2 * T - 6, [18 * T + 2, 2 * T + 4, 12, 10]);
    this.add_obj(sprites.decor("plant"), 1 * T, 4 * T - 6, [1 * T + 2, 4 * T + 4, 12, 10]);
    this.add_obj(sprites.decor("bookshelf"), 17 * T, 5 * T, [17 * T, 5 * T + 8, 32, 8]);
    this.npcs.push(new NPC("lena", 8 * T + 8, 3 * T, "down"));
    this.npcs.push(new NPC("oliver", 12 * T + 12, 6 * T + 12, "right"));
  }

  goal(): [string, number[] | null] | null {
    return ["Order a treat at Pressed for a buff", [8 * T + 8, 3 * T - 16]];
  }

  order() {
    this.npc_say("lena", ["Hi hi! Welcome to Pressed! Everything's fresh!"],
      () => this.game.push(new FoodMenu(this.game, "PRESSED CAFE", data.CAFE_MENU, "lena", "eat_pressed")), null, "Lena");
  }

  talk_npc(npc: NPC) {
    if (npc.name === "lena") {
      this.order();
      return;
    }
    const line = npc_line(this, npc);
    this.npc_say(npc.name, [line], () => { npc.talking = false; });
  }

  exit_room() {
    exit_to_town(this.game, "cafe_rect");
  }
}

// ======================================================================= SUBWAY
export class SubwayScene extends RoomScene {
  name = "subway";
  get floor(): string { return "subwayfloor"; }
  get wall(): string { return "subwaywall"; }
  get night_dim(): boolean { return false; }

  build() {
    this.build_room();
    const thu = gstate.is_thursday(this.st.day);
    this.add_obj(props2.chalkboard(["SUBS  SIDES  DRINKS", thu ? "TURKEY SUB 5 TODAY!" : "TURKEY SUB 12"]), 2 * T, 4, null, 2);
    if (thu) {
      const banner = props.shop_sign("TURKEY THURSDAY!", [250, 210, 60], [60, 120, 60]);
      this.add_obj(banner, 13 * T, 8, null, 2);
    } else {
      this.add_obj(props.shop_sign("SUBWAY", [60, 150, 70], [250, 220, 70]), 14 * T, 8, null, 2);
    }
    this.add_obj(props2.sub_counter(160), 3 * T, 3 * T - 2, [3 * T, 3 * T + 6, 160, 18]);
    this.interacts.push({ rect: new Rect(3 * T, 2 * T, 160, 36), prompt: "Order", fn: () => this.order() });
    this.add_obj(props2.drinks_fridge(), 17 * T, 2 * T - 6, [17 * T, 2 * T + 10, 20, 14]);
    this.add_obj(props2.drinks_fridge(), 18 * T + 4, 2 * T - 6, [18 * T + 4, 2 * T + 10, 20, 14]);
    for (const [tx, ty] of [[2 * T, 7 * T], [13 * T, 6 * T + 4], [14 * T + 8, 8 * T + 8], [3 * T, 9 * T]]) {
      this.add_obj(props2.cafe_table(), tx, ty, [tx + 2, ty + 8, 32, 12]);
    }
    this.add_obj(sprites.decor("plant"), 1 * T, 4 * T, [1 * T + 2, 5 * T - 2, 12, 8]);
    this.npcs.push(new NPC("gio", 8 * T, 3 * T - 2, "down"));
    const st = this.st;
    const w = friends.walking(st);
    this.crew = thu && st.phase === "evening" && ((w && w.dest === "subway") || st.turkey_day === st.day);
    if (this.crew) {
      this.npcs.push(new NPC("shteynie", 12 * T + 14, 7 * T + 8, "right"));
      this.npcs.push(new NPC("stephen", 16 * T + 2, 7 * T + 8, "left"));
    } else {
      this.npcs.push(new NPC("kenji", 13 * T + 4, 7 * T + 10, "right"));
    }
  }

  enter() {
    const st = this.st;
    const w = friends.walking(st);
    if (this.crew && w && w.dest === "subway") {
      st.walk_with = null;
      st.turkey_day = st.day;
      const P = (n: string) => sprites.npc_portrait(n);
      this.say([
        ["Gio", P("gio"), "AYYY, the Turkey Thursday crew! Shteynie, Stephen, Doc Zoe!"],
        ["Shteynie", P("shteynie"), "Three turkey subs, Gio. The usual. This is a sacred night."],
        ["Stephen", P("stephen"), "Order up, Zoe, then come sit with us. Same table as always."],
      ]);
    }
  }

  goal(): [string, number[] | null] | null {
    const p = [8 * T, 3 * T - 22];
    if (this.crew) return ["Order a turkey sub, then hang with Shteynie & Stephen", p];
    if (gstate.is_thursday(this.st.day)) return ["TURKEY THURSDAY! Turkey subs are 5 coins", p];
    return ["Order a sub - or ask Gio about a side gig", p];
  }

  order() {
    this.npc_say("gio", [gstate.is_thursday(this.st.day) ? "Happy Turkey Thursday! Turkey subs are just 5 coins today!" : "Welcome to Subway! What can I make you?"],
      () => this.game.push(new FoodMenu(this.game, "SUBWAY", data.SUB_MENU, "gio", "eat_sub")), null, "Gio");
  }

  talk_npc(npc: NPC) {
    if (this.crew && (npc.name === "shteynie" || npc.name === "stephen")) {
      const L: Record<string, string[]> = {
        shteynie: ["Best day of the week. I said what I said.", "Five coins. FIVE. Gio is a hero.", "Turkey Thursday crew forever. Just us three.",
          "Next week I'm getting double turkey. Hold me to it.", "After this? Clery's. Darts. You're going down."],
        stephen: ["The turkey is perfect. The bread is perfect. Life is good.", "We've never missed a Turkey Thursday. Not once.",
          "Don't tell the others, but this is my favorite night.", "Shteynie gets extra pickles. Every time. It's a whole thing.", "Cheers, Doc. To turkey."],
      };
      npc.talking = true;
      this.npc_say(npc.name, [pg.random.choice(L[npc.name])], () => { npc.talking = false; }, [
        ["Sub cheers!", () => {
          npc.talking = false;
          friends.add_pts(this.st, npc.name);
          for (const n of this.npcs) if (n.name === "shteynie" || n.name === "stephen") this.particles.burst("heart", n.x, n.y - 20, 3, 14);
          this.particles.text("TURKEY THURSDAY!", this.player.x, this.player.y - 34, [250, 200, 60], 1.6);
          this.game.audio.play("chime");
        }],
        ["Nice", () => { npc.talking = false; }],
      ]);
      return;
    }
    if (npc.name !== "gio") {
      const line = npc_line(this, npc);
      this.npc_say(npc.name, [line], () => { npc.talking = false; });
      return;
    }
    this.npc_say("gio", ["Hey Zoe! Hungry? Or... I could REALLY use a hand behind the counter. I'll pay you!"], null, [
      ["Order", () => this.order()],
      ["Side gig!", () => this.game.push(new SandwichGame(this.game, (coins: number) => {
        if (coins > 0) challenges.progress(this.game, "sub_coins", coins);
      }))],
      ["Bye", () => {}],
    ], "Gio");
  }

  exit_room() {
    exit_to_town(this.game, "subway_rect");
  }
}

// ======================================================================= day helpers
export function start_new_day(game: any) {
  const st = game.state;
  st.day += 1;
  st.phase = "morning";
  st.rush = st.day >= config.RUSH_START_DAY && pg.random.random() < config.RUSH_CHANCE;
  st.legendary_today = false;
  st.tipsy = 0;
  st.evening_t = 0;
  st.walk_with = null;
  challenges.ensure(st);
  st._new_day_banner = true;
  for (const [kind, key] of gstate.check_general_achievements(st)) _announce(game, kind, key);
  game.save();
}

export function _announce(game: any, kind: string, key: string) {
  if (kind === "badges") game.toast("BADGE GET!", data.BADGES[key].name, "badge", key);
  else game.toast("ACHIEVEMENT!", data.ACHIEVEMENTS[key].name);
}

export function town_after_shift(game: any): TownScene {
  game._after_shift = true;
  const t = new TownScene(game);
  const r: Rect = game.last_clinic === "wild" ? t.wild_rect : t.clinic_rect;
  t.player.x = r.centerx;
  t.player.y = r.bottom + 10;
  t.player.dir = "down";
  t._update_cam(true);
  return t;
}
