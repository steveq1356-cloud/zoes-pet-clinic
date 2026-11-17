/* Game loop, scene manager, fades, shake and toasts.
 * Phaser (see main.ts) owns the browser side: the animation-frame loop,
 * integer scaling, fullscreen and the sound system. Each frame we draw the
 * game into a 320x180 pixel Surface and hand it to Phaser as a texture.
 */
import * as pg from "./pg";
import { Rect, Surface, SRCALPHA, GameEvent } from "./pg";
import * as config from "./config";
import * as gstate from "./state";
import * as font from "./font";
import * as sprites from "./sprites";
import * as ui from "./ui";
import { Audio } from "./audio";

export const W = config.NATIVE_W;
export const H = config.NATIVE_H;

export class Scene {
  /** if true, the scene beneath is drawn too */
  overlay = false;
  /** track to play when this scene becomes top */
  music: string | null = null;
  game: Game;
  [key: string]: any;

  constructor(game: Game) {
    this.game = game;
  }
  enter() {}
  resume() {}
  event(_e: GameEvent) {}
  update(_dt: number) {}
  draw(_s: Surface) {}
}

export class Game {
  settings: any;
  native: Surface;
  audio: Audio;
  scenes: Scene[] = [];
  state: any = null;
  mpos: number[] = [0, 0];
  mouse_down = false;
  running = true;
  typing = false;
  time = 0.0;
  fade = 0.0;
  fade_dir = 0;
  fade_cb: (() => void) | null = null;
  shake_t = 0.0;
  shake_mag = 0;
  toasts: any[] = [];
  load_message: string | null = null;
  shift_snapshot: any = null;
  fullscreen = false;
  /** hooks provided by main.ts (Phaser side) */
  host: { toggleFullscreen: () => void; isFullscreen: () => boolean };
  /** current screen-shake offset in native pixels */
  shake_dx = 0;
  shake_dy = 0;
  private acc = 0;
  private veil: Surface;
  [key: string]: any;

  constructor(phaser: any, host: Game["host"]) {
    this.settings = gstate.load_settings();
    this.native = new Surface([W, H]);
    this.host = host;
    this.audio = new Audio(this.settings, phaser);
    this.veil = new Surface([W, H], SRCALPHA);
  }

  // ----------------------------------------------------------- window
  toggle_fullscreen() {
    this.host.toggleFullscreen();
  }

  set_window_scale(_sc: number) {
    /* the browser version always scales to fit the window */
  }

  // ----------------------------------------------------------- scenes
  get top(): Scene | null {
    return this.scenes.length ? this.scenes[this.scenes.length - 1] : null;
  }

  push(scene: Scene) {
    this.scenes.push(scene);
    scene.enter();
    this._music_for_top();
  }

  pop() {
    if (this.scenes.length) this.scenes.pop();
    if (this.scenes.length) this.scenes[this.scenes.length - 1].resume();
    this._music_for_top();
  }

  replace(scene: Scene) {
    this.scenes = [scene];
    scene.enter();
    this._music_for_top();
  }

  _music_for_top() {
    for (let i = this.scenes.length - 1; i >= 0; i--) {
      const sc = this.scenes[i];
      if (sc.music) {
        this.audio.music(sc.music);
        return;
      }
    }
  }

  /** Fade out, run fn (usually a scene change), fade in. */
  transition(fn: () => void) {
    if (this.fade_dir !== 0) return;
    this.fade_dir = 1;
    this.fade_cb = fn;
    this.audio.play("door", 0.6);
  }

  // ----------------------------------------------------------- juice
  shake(mag = 3, t = 0.25) {
    this.shake_mag = Math.max(this.shake_mag, mag);
    this.shake_t = Math.max(this.shake_t, t);
  }

  toast(title: string, text: string, kind = "achievement", key: string | null = null) {
    this.toasts.push({ title, text, kind, key, t: 0.0 });
    this.audio.play("chime");
  }

  save() {
    if (this.state) {
      this.state.settings = { ...this.settings };
      gstate.save_game(this.state);
    }
  }

  // ----------------------------------------------------------- loop
  /** Called by Phaser every animation frame with elapsed milliseconds. */
  frame(deltaMs: number) {
    const step = 1.0 / config.FPS;
    const dt = Math.min(0.1, deltaMs / 1000.0);
    this.acc += dt;
    while (this.acc >= step) {
      this.update(step);
      this.acc -= step;
    }
    this.render();
  }

  handle_event(e: GameEvent) {
    if (e.type === pg.KEYDOWN) {
      if (e.key === pg.K_F11 || (e.key === pg.K_f && !this.typing)) {
        this.toggle_fullscreen();
        return;
      }
      if (e.key === pg.K_m && !this.typing) {
        this.settings.muted = !this.settings.muted;
        this.audio.apply_volume();
        gstate.save_settings(this.settings);
        return;
      }
    }
    if (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) this.mouse_down = true;
    if (e.type === pg.MOUSEBUTTONUP && e.button === 1) this.mouse_down = false;
    if (e.pos && (e.type === pg.MOUSEBUTTONDOWN || e.type === pg.MOUSEBUTTONUP || e.type === pg.MOUSEMOTION)) {
      this.mpos = [e.pos[0], e.pos[1]];
    }
    if (this.fade_dir !== 0) return;
    if (this.top) this.top.event(e);
  }

  update(dt: number) {
    this.time += dt;
    this.audio.update();
    if (this.fade_dir === 1) {
      this.fade = Math.min(1.0, this.fade + dt * 4);
      if (this.fade >= 1.0) {
        const cb = this.fade_cb;
        this.fade_cb = null;
        if (cb) cb();
        this.fade_dir = -1;
      }
    } else if (this.fade_dir === -1) {
      this.fade = Math.max(0.0, this.fade - dt * 4);
      if (this.fade <= 0) this.fade_dir = 0;
    }
    if (this.shake_t > 0) {
      this.shake_t -= dt;
      if (this.shake_t <= 0) this.shake_mag = 0;
    }
    for (const t of this.toasts.slice(0, 1)) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < 3.2);
    if (this.top && this.fade_dir !== 1) this.top.update(dt);
  }

  render() {
    const s = this.native;
    s.fill([0, 0, 0]);
    let start = this.scenes.length - 1;
    while (start > 0 && this.scenes[start].overlay) start -= 1;
    for (const sc of this.scenes.slice(Math.max(0, start))) sc.draw(s);
    this._draw_toasts(s);
    if (this.fade > 0) {
      this.veil.fill([20, 14, 30, Math.trunc(255 * this.fade)]);
      s.blit(this.veil, [0, 0]);
    }
    this.shake_dx = this.shake_dy = 0;
    if (this.shake_t > 0 && this.shake_mag) {
      this.shake_dx = pg.random.randint(-this.shake_mag, this.shake_mag);
      this.shake_dy = pg.random.randint(-this.shake_mag, this.shake_mag);
    }
  }

  _draw_toasts(s: Surface) {
    if (!this.toasts.length) return;
    const t = this.toasts[0];
    const k = t.t;
    const y = k < 2.8 ? -24 + Math.min(1.0, k * 4) * 28 : 4 - (k - 2.8) * 70;
    const rect = new Rect(Math.floor(W / 2) - 80, Math.trunc(y), 160, 22);
    ui.panel(s, rect, [255, 246, 214], [200, 150, 60]);
    if (t.kind === "badge" && t.key) s.blit(sprites.badge(t.key), [rect.x + 4, rect.y + 3]);
    else s.blit(sprites.icon("star"), [rect.x + 6, rect.y + 5]);
    font.draw(s, t.title, [rect.x + 24, rect.y + 4], [170, 110, 30]);
    font.draw(s, t.text, [rect.x + 24, rect.y + 12], [90, 70, 100]);
  }
}
