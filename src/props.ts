/* Extra room props and on-screen guidance (goal panel, bouncing arrows).
 * All pixel art is drawn in code, like sprites.ts. */
import * as pg from "./pg";
import { Surface, Color } from "./pg";
import * as sprites from "./sprites";
import * as font from "./font";
import * as ui from "./ui";

const R = (s: Surface, c: Color, x: number, y: number, w: number, h: number) => {
  if (w > 0 && h > 0) pg.draw.rect(s, c, [x, y, w, h]);
};
const cached = (key: string, fn: () => Surface) => sprites.cached("props|" + key, fn);

// ------------------------------------------------------------------ wall props
/** A window with curtains. w x h, sky color can be tinted for evening. */
export function window_(w = 32, h = 22, curtain: Color = [240, 150, 170], evening = false, night = false): Surface {
  return cached(`win|${w}|${h}|${curtain}|${evening}|${night}`, () => {
    const s = sprites.new_(w, h + 3);
    R(s, [250, 250, 252], 0, 0, w, h);
    const sky: Color = night ? [30, 36, 80] : evening ? [250, 170, 130] : [150, 210, 246];
    const sky2: Color = night ? [44, 50, 100] : evening ? [240, 140, 120] : [178, 224, 250];
    R(s, sky, 2, 2, w - 4, h - 4);
    R(s, sky2, 2, 2, w - 4, Math.floor((h - 4) / 2));
    if (night) {
      // moon and stars
      pg.draw.circle(s, [250, 246, 220], [w - 9, 7], 3);
      for (const [x, y] of [[6, 5], [11, 12], [8, 15], [w - 14, 14]]) R(s, [255, 255, 230], x, y, 1, 1);
    } else {
      // little cloud / sun
      pg.draw.circle(s, evening ? [255, 220, 140] : [255, 246, 180], [w - 9, 7], 3);
      R(s, [255, 255, 255], 5, 9, 7, 2);
      R(s, [255, 255, 255], 7, 8, 4, 1);
    }
    // cross bars
    R(s, [250, 250, 252], Math.floor(w / 2) - 1, 2, 2, h - 4);
    R(s, [250, 250, 252], 2, Math.floor(h / 2) - 1, w - 4, 2);
    // curtains
    const cd = sprites.darker(curtain, 0.85);
    for (const x of [0, w - 6]) {
      R(s, curtain, x, 0, 6, h + 1);
      R(s, cd, x + 2, 0, 1, h + 1);
      R(s, cd, x + 4, 2, 1, h - 1);
    }
    R(s, sprites.darker(curtain, 0.7), 0, 0, w, 2); // rod
    // sill
    R(s, [214, 176, 130], -1, h, w + 2, 3);
    R(s, [186, 140, 100], -1, h + 2, w + 2, 1);
    return sprites.outline(s);
  });
}

export function wall_clock(): Surface {
  return cached("clock", () => {
    const s = sprites.new_(14, 14);
    pg.draw.circle(s, [200, 120, 90], [7, 7], 7);
    pg.draw.circle(s, [255, 252, 240], [7, 7], 5);
    R(s, [52, 38, 64], 7, 3, 1, 4);
    R(s, [52, 38, 64], 7, 7, 3, 1);
    for (const [x, y] of [[7, 2], [12, 7], [7, 12], [2, 7]]) R(s, [150, 136, 160], x, y, 1, 1);
    return sprites.outline(s);
  });
}

/** A little framed picture: kind = "paw" | "heart" | "sun" | "fish" */
export function picture(kind = "paw", frame: Color = [196, 150, 96]): Surface {
  return cached(`pic|${kind}|${frame}`, () => {
    const s = sprites.new_(16, 13);
    R(s, frame, 0, 0, 16, 13);
    const bg: Color = kind === "fish" ? [170, 220, 246] : kind === "sun" ? [190, 230, 250] : [255, 246, 230];
    R(s, bg, 2, 2, 12, 9);
    if (kind === "paw") {
      pg.draw.circle(s, [240, 130, 150], [8, 8], 2);
      for (const [x, y] of [[5, 5], [8, 4], [11, 5]]) R(s, [240, 130, 150], x - 1, y - 1, 2, 2);
    } else if (kind === "heart") {
      font.draw(s, font.HEART, [6, 4], [236, 90, 120]);
    } else if (kind === "sun") {
      R(s, [120, 200, 110], 2, 8, 12, 3);
      pg.draw.circle(s, [255, 210, 90], [10, 5], 2);
    } else {
      pg.draw.ellipse(s, [250, 160, 80], [4, 5, 7, 4]);
      R(s, [250, 160, 80], 11, 5, 2, 4);
      R(s, [52, 38, 64], 5, 6, 1, 1);
    }
    return sprites.outline(s);
  });
}

/** Paper-garland bunting w px wide. */
export function bunting(w: number): Surface {
  return cached(`bunt|${w}`, () => {
    const s = sprites.new_(w, 8);
    const cols: Color[] = [[240, 128, 160], [250, 210, 90], [130, 200, 240], [140, 210, 140]];
    pg.draw.line(s, [150, 120, 120], [0, 1], [w - 1, 1]);
    for (let x = 2, i = 0; x < w - 5; x += 8, i++) {
      pg.draw.polygon(s, cols[i % cols.length], [[x, 2], [x + 5, 2], [x + 2, 7]]);
    }
    return s;
  });
}

export function bulletin_board(): Surface {
  return cached("board", () => {
    const s = sprites.new_(30, 20);
    R(s, [176, 124, 84], 0, 0, 30, 20);
    R(s, [214, 170, 120], 2, 2, 26, 16);
    const notes: [number, number, Color][] = [[4, 4, [255, 250, 200]], [13, 3, [200, 236, 255]], [21, 5, [255, 214, 226]], [6, 11, [214, 246, 210]], [16, 11, [255, 250, 236]]];
    for (const [x, y, c] of notes) {
      R(s, c, x, y, 7, 6);
      R(s, [150, 136, 160], x + 1, y + 2, 5, 1);
      R(s, [236, 80, 90], x + 3, y, 1, 1);
    }
    return sprites.outline(s);
  });
}

export function shop_sign(text: string, bg: Color = [255, 236, 180], fg: Color = [170, 90, 50]): Surface {
  return cached(`sign|${text}|${bg}`, () => {
    const w = font.text_width(text) + 10;
    const s = sprites.new_(w, 11);
    R(s, bg, 0, 0, w, 11);
    R(s, sprites.darker(bg, 0.85), 0, 9, w, 2);
    font.draw(s, text, [5, 3], fg);
    return sprites.outline(s);
  });
}

// ------------------------------------------------------------------ floor props
/** A rectangular rug with a border; w, h in pixels. */
export function rug(w: number, h: number, c1: Color, c2: Color): Surface {
  return cached(`rug|${w}|${h}|${c1}|${c2}`, () => {
    const s = sprites.new_(w, h);
    R(s, c2, 0, 0, w, h);
    R(s, c1, 2, 2, w - 4, h - 4);
    R(s, sprites.lighter(c1, 0.25), 4, 4, w - 8, h - 8);
    // diamond pattern
    for (let x = 8; x < w - 8; x += 10) {
      const cy = Math.floor(h / 2);
      pg.draw.polygon(s, c2, [[x, cy - 3], [x + 3, cy], [x, cy + 3], [x - 3, cy]]);
    }
    // fringe
    for (let x = 2; x < w - 2; x += 3) {
      R(s, [250, 244, 230], x, 0, 1, 1);
      R(s, [250, 244, 230], x, h - 1, 1, 1);
    }
    return s;
  });
}

/** A path of tiles leading to the door (shows "this way out"). */
export function runner(h: number, c: Color = [214, 120, 120]): Surface {
  return cached(`runner|${h}|${c}`, () => {
    const s = sprites.new_(22, h);
    R(s, sprites.darker(c, 0.85), 0, 0, 22, h);
    R(s, c, 2, 0, 18, h);
    for (let y = 3; y < h; y += 8) pg.draw.polygon(s, [255, 236, 214], [[7, y], [15, y], [11, y + 4]]);
    return s;
  });
}

export function nightstand(): Surface {
  return cached("nightstand", () => {
    const s = sprites.new_(14, 24);
    // lamp
    pg.draw.polygon(s, [255, 226, 150], [[3, 0], [10, 0], [12, 7], [1, 7]]);
    R(s, [240, 200, 110], 1, 6, 12, 1);
    R(s, [150, 110, 80], 6, 8, 2, 5);
    // table
    R(s, [196, 140, 92], 0, 12, 14, 12);
    R(s, [170, 118, 74], 0, 12, 14, 2);
    R(s, [150, 100, 66], 2, 16, 10, 1);
    R(s, [250, 220, 120], 6, 18, 2, 1);
    return sprites.outline(s);
  });
}

export function water_cooler(): Surface {
  return cached("cooler", () => {
    const s = sprites.new_(12, 28);
    R(s, [170, 220, 250], 2, 0, 8, 10);
    R(s, [210, 240, 255], 3, 1, 2, 7);
    R(s, [236, 240, 246], 0, 10, 12, 18);
    R(s, [200, 210, 222], 0, 26, 12, 2);
    R(s, [90, 150, 220], 2, 14, 2, 2);
    R(s, [236, 90, 100], 8, 14, 2, 2);
    return sprites.outline(s);
  });
}

export function food_sacks(): Surface {
  return cached("sacks", () => {
    const s = sprites.new_(24, 16);
    const sack = (x: number, c: Color) => {
      R(s, c, x, 3, 10, 13);
      R(s, sprites.darker(c, 0.85), x, 3, 10, 2);
      R(s, [255, 250, 236], x + 2, 8, 6, 4);
      R(s, [240, 128, 160], x + 4, 9, 2, 2);
    };
    sack(0, [214, 176, 120]);
    sack(12, [176, 200, 140]);
    return sprites.outline(s);
  });
}

export function crate(): Surface {
  return cached("crate", () => {
    const s = sprites.new_(16, 14);
    R(s, [200, 150, 96], 0, 0, 16, 14);
    R(s, [170, 120, 74], 0, 0, 16, 2);
    R(s, [170, 120, 74], 0, 6, 16, 1);
    R(s, [170, 120, 74], 7, 0, 2, 14);
    pg.draw.circle(s, [240, 90, 110], [4, 10], 2); // a ball peeking out
    return sprites.outline(s);
  });
}

// ------------------------------------------------------------------ guidance
/** Filled arrow with its tip at (x, y). dir: down | up | left | right */
export function arrow(s: Surface, x: number, y: number, dir = "down", col: Color = [255, 220, 90], size = 5) {
  x = Math.trunc(x);
  y = Math.trunc(y);
  let pts: number[][];
  const k = size;
  if (dir === "down") pts = [[x - k, y - k], [x + k, y - k], [x, y]];
  else if (dir === "up") pts = [[x - k, y + k], [x + k, y + k], [x, y]];
  else if (dir === "left") pts = [[x + k, y - k], [x + k, y + k], [x, y]];
  else pts = [[x - k, y - k], [x - k, y + k], [x, y]];
  // outline by drawing a bigger dark arrow first
  const o = pts.map(([px, py]) => [px + Math.sign(px - x) * 1, py + Math.sign(py - y) * 1]);
  pg.draw.polygon(s, ui.INK, o);
  pg.draw.polygon(s, col, pts);
  // stem
  if (dir === "down") { R(s, ui.INK, x - 2, y - k - 5, 5, 6); R(s, col, x - 1, y - k - 4, 3, 5); }
  if (dir === "up") { R(s, ui.INK, x - 2, y + k, 5, 6); R(s, col, x - 1, y + k, 3, 5); }
  if (dir === "left") { R(s, ui.INK, x + k, y - 2, 6, 5); R(s, col, x + k, y - 1, 5, 3); }
  if (dir === "right") { R(s, ui.INK, x - k - 5, y - 2, 6, 5); R(s, col, x - k - 4, y - 1, 5, 3); }
}

/**
 * Points at a screen position: a bouncing arrow above it when visible,
 * or an arrow at the screen edge pointing the way when it's off-screen.
 */
export function point_at(s: Surface, sx: number, sy: number, t: number, top = 28, bottom = 180) {
  const W = s.get_width();
  const bob = Math.trunc(Math.abs(Math.sin(t * 5)) * 3);
  const margin = 10;
  if (sx >= margin && sx <= W - margin && sy >= top + 2 && sy <= bottom - 4) {
    arrow(s, sx, sy - 4 - bob, "down");
    return;
  }
  // off-screen: arrow on the edge
  const cx = Math.max(margin, Math.min(W - margin, sx));
  const cy = Math.max(top + 10, Math.min(bottom - 12, sy));
  const dx = sx - cx, dy = sy - cy;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  const off = bob * (dir === "left" || dir === "up" ? -1 : 1);
  if (dir === "left" || dir === "right") arrow(s, cx + off, cy, dir);
  else arrow(s, cx, cy + off, dir);
}

/** Small "GOAL: ..." panel in the top-right corner. */
export function goal_panel(s: Surface, text: string, t: number, y = 3) {
  const label = text.toUpperCase();
  const w = font.text_width(label) + 22;
  const x = s.get_width() - 3 - w;
  ui.panel(s, [x, y, w, 13], [255, 250, 214], [200, 150, 60]);
  const blink = Math.trunc(t * 2) % 2 === 0;
  font.draw(s, "!", [x + 5, y + 4], blink ? [230, 90, 100] : [200, 150, 60]);
  font.draw(s, label, [x + 11, y + 4], ui.INK);
}

/** Soft oval ground shadow (drawn under people, pets, trees and buildings). */
export function shadow(w: number, h = 4, alpha = 70): Surface {
  return cached(`shadow|${w}|${h}|${alpha}`, () => {
    const s = new Surface([w, h], pg.SRCALPHA);
    pg.draw.ellipse(s, [30, 24, 40, Math.trunc(alpha * 0.55)], [0, 0, w, h]);
    if (w > 4 && h > 2) pg.draw.ellipse(s, [30, 24, 40, alpha], [2, 1, w - 4, h - 2]);
    return s;
  });
}
