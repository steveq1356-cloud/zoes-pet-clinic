/* Browser entry point: boots Phaser, wires up input, scaling and fullscreen. */
import Phaser from "phaser";
import * as pg from "./pg";
import * as config from "./config";
import { Game } from "./engine";
import { TitleScene } from "./menus";

const W = config.NATIVE_W;
const H = config.NATIVE_H;

/** Biggest whole-number zoom that fits the window (pixel-perfect). */
function fitZoom(): number {
  return Math.max(1, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H)));
}

class MainScene extends Phaser.Scene {
  zpc!: Game;
  tex!: Phaser.Textures.CanvasTexture;
  img!: Phaser.GameObjects.Image;
  imageData!: ImageData;

  constructor() {
    super("main");
  }

  create() {
    this.cameras.main.setBackgroundColor("#0e0a14");
    this.tex = this.textures.createCanvas("screen", W, H)!;
    this.img = this.add.image(0, 0, "screen").setOrigin(0, 0);

    const phaserGame = this.game;
    const host = {
      toggleFullscreen: () => {
        if (phaserGame.scale.isFullscreen) phaserGame.scale.stopFullscreen();
        else phaserGame.scale.startFullscreen();
      },
      isFullscreen: () => phaserGame.scale.isFullscreen,
    };
    this.zpc = new Game(phaserGame, host);
    this.imageData = new ImageData(this.zpc.native.data as any, W, H);
    if (import.meta.env.DEV) (window as any).zpc = this.zpc; // handy for debugging in the console

    wireInput(this.zpc, phaserGame.canvas);
    const fsBtn = document.getElementById("fsbtn");
    if (fsBtn) fsBtn.addEventListener("click", () => host.toggleFullscreen());

    this.zpc.replace(new TitleScene(this.zpc));
  }

  update(_time: number, delta: number) {
    const g = this.zpc;
    g.frame(delta);
    const ctx = this.tex.getContext();
    ctx.putImageData(this.imageData, 0, 0);
    this.tex.refresh();
    this.img.setPosition(g.shake_dx, g.shake_dy);
  }
}

function wireInput(g: Game, canvas: HTMLCanvasElement) {
  const toNative = (cx: number, cy: number): number[] => {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor(((cx - r.left) * W) / Math.max(1, r.width));
    const y = Math.floor(((cy - r.top) * H) / Math.max(1, r.height));
    return [x, y];
  };
  const isFormField = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

  const btn = (b: number) => (b === 2 ? 3 : b === 1 ? 2 : 1); // DOM -> pygame numbering
  const down = new Set<number>();

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    const pos = toNative(e.clientX, e.clientY);
    pg.mouse.pos = pos;
    const b = btn(e.button);
    down.add(b);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    // let focused HTML inputs (login forms) lose focus when clicking the game
    if (document.activeElement instanceof HTMLElement && isFormField(document.activeElement)) {
      document.activeElement.blur();
    }
    g.handle_event({ type: pg.MOUSEBUTTONDOWN, button: b, pos });
    e.preventDefault();
  });
  window.addEventListener("pointerup", (e) => {
    const pos = toNative(e.clientX, e.clientY);
    pg.mouse.pos = pos;
    const b = btn(e.button);
    if (!down.has(b)) return;
    down.delete(b);
    g.handle_event({ type: pg.MOUSEBUTTONUP, button: b, pos });
  });
  window.addEventListener("pointermove", (e) => {
    const pos = toNative(e.clientX, e.clientY);
    const rel = [pos[0] - pg.mouse.pos[0], pos[1] - pg.mouse.pos[1]];
    pg.mouse.pos = pos;
    g.handle_event({ type: pg.MOUSEMOTION, pos, rel });
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : e.deltaY > 0 ? -1 : 0;
      if (!dir) return;
      const pos = pg.mouse.get_pos();
      g.handle_event({ type: pg.MOUSEWHEEL, x: 0, y: dir });
      // pygame also reports wheel as buttons 4 (up) / 5 (down)
      g.handle_event({ type: pg.MOUSEBUTTONDOWN, button: dir > 0 ? 4 : 5, pos });
      g.handle_event({ type: pg.MOUSEBUTTONUP, button: dir > 0 ? 4 : 5, pos });
    },
    { passive: false },
  );

  const NO_SCROLL = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab", "Backspace", "F11"]);
  window.addEventListener("keydown", (e) => {
    if (isFormField(e.target)) return; // typing into an HTML form field
    const k = pg.keyFromCode(e.code, e.key);
    if (NO_SCROLL.has(e.code)) e.preventDefault();
    if (!e.repeat) {
      pg.pressed[k] = true;
      g.handle_event({ type: pg.KEYDOWN, key: k, unicode: e.key.length === 1 ? e.key : "" });
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      g.handle_event({ type: pg.TEXTINPUT, text: e.key });
    }
  });
  window.addEventListener("keyup", (e) => {
    if (isFormField(e.target)) return;
    const k = pg.keyFromCode(e.code, e.key);
    pg.pressed[k] = false;
    g.handle_event({ type: pg.KEYUP, key: k });
  });
  window.addEventListener("blur", () => {
    for (const k of Object.keys(pg.pressed)) pg.pressed[k] = false;
  });
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: W,
  height: H,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: "#0e0a14",
  banner: false,
  disableContextMenu: true,
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: fitZoom(),
  },
  audio: { disableWebAudio: false },
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  scene: [MainScene],
});

if (import.meta.env.DEV) {
  // Debug helper (browser console, dev server only): zpcStep(120) advances 2 seconds of game time.
  (window as any).zpcStep = (frames = 60) => {
    let t = performance.now();
    for (let i = 0; i < frames; i++) game.step((t += 1000 / 60), 1000 / 60);
  };
}

/** Rescale, and only show the HTML fullscreen button where it won't cover the game. */
const onResize = () => {
  const z = fitZoom();
  game.scale.setZoom(z);
  const btn = document.getElementById("fsbtn");
  if (btn) {
    const spareX = (window.innerWidth - W * z) / 2;
    const spareY = (window.innerHeight - H * z) / 2;
    btn.style.display = spareY >= 30 || spareX >= 110 ? "block" : "none";
  }
};
onResize();
window.addEventListener("resize", onResize);
document.addEventListener("fullscreenchange", () => setTimeout(onResize, 50));
