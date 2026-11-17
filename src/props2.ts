/* More props: town plaza, Clery's bar, the cafe, Wildside Rescue, and food icons.
 * All pixel art is drawn in code. */
import * as pg from "./pg";
import { Surface, Color } from "./pg";
import * as sprites from "./sprites";
import * as font from "./font";

const R = (s: Surface, c: Color, x: number, y: number, w: number, h: number) => {
  if (w > 0 && h > 0) pg.draw.rect(s, c, [x, y, w, h]);
};
const P = (s: Surface, x: number, y: number, c: Color) => s.set_at([x, y], c);
const cached = (key: string, fn: () => Surface) => sprites.cached("props2|" + key, fn);
const dk = (c: Color, f = 0.8) => sprites.darker(c, f);
const lt = (c: Color, f = 0.35) => sprites.lighter(c, f);

// ================================================================== town
export function fountain(frame = 0): Surface {
  return cached(`fountain|${frame}`, () => {
    const s = sprites.new_(40, 34);
    pg.draw.ellipse(s, [176, 176, 190], [0, 16, 40, 18]);
    pg.draw.ellipse(s, [120, 190, 240], [3, 18, 34, 13]);
    pg.draw.ellipse(s, [170, 220, 250], [8, 20, 24, 7]);
    R(s, [196, 196, 206], 17, 6, 6, 16);
    pg.draw.ellipse(s, [196, 196, 206], [11, 4, 18, 6]);
    // water spray (animated)
    const c: Color = [220, 244, 255];
    const o = frame % 2;
    for (const [x, y] of [[20, 1], [14 - o, 4], [26 + o, 4], [11 - o, 9], [29 + o, 9], [9, 14 + o], [31, 14 + o]]) P(s, x, y, c);
    R(s, c, 19, 0, 2, 4);
    for (const x of [8 + o * 2, 18, 28 - o * 2]) P(s, x, 24, [255, 255, 255]);
    return sprites.outline(s);
  });
}

export function bench(): Surface {
  return cached("bench", () => {
    const s = sprites.new_(28, 16);
    R(s, [176, 120, 74], 0, 2, 28, 4);
    R(s, [196, 140, 92], 0, 8, 28, 4);
    R(s, [70, 60, 70], 2, 12, 2, 4);
    R(s, [70, 60, 70], 24, 12, 2, 4);
    R(s, [150, 100, 62], 0, 5, 28, 1);
    return sprites.outline(s);
  });
}

export function lamppost(): Surface {
  return cached("lamppost", () => {
    const s = sprites.new_(10, 30);
    R(s, [60, 60, 76], 4, 8, 2, 20);
    R(s, [60, 60, 76], 2, 27, 6, 3);
    R(s, [60, 60, 76], 1, 2, 8, 2);
    R(s, [255, 236, 160], 2, 4, 6, 5);
    R(s, [255, 250, 220], 3, 5, 2, 2);
    return sprites.outline(s);
  });
}

export function planter(): Surface {
  return cached("planter", () => {
    const s = sprites.new_(16, 14);
    R(s, [180, 110, 80], 1, 6, 14, 8);
    R(s, [150, 90, 64], 1, 6, 14, 2);
    for (const [x, c] of [[3, [240, 120, 150]], [7, [250, 210, 90]], [11, [160, 140, 240]]] as [number, Color][]) {
      R(s, [90, 170, 90], x + 1, 3, 1, 4);
      pg.draw.circle(s, c, [x + 1, 3], 2);
    }
    return sprites.outline(s);
  });
}

// ================================================================== Clery's
export function bottle_shelf(w: number): Surface {
  return cached(`bottles|${w}`, () => {
    const s = sprites.new_(w, 28);
    R(s, [90, 52, 40], 0, 0, w, 28);
    const cols: Color[] = [[120, 200, 120], [200, 90, 80], [240, 200, 100], [130, 170, 230], [220, 140, 200], [250, 250, 240]];
    for (const row of [0, 1]) {
      const y = 2 + row * 13;
      R(s, [140, 90, 62], 0, y + 10, w, 2);
      for (let x = 3, i = row * 3; x < w - 4; x += 6, i++) {
        const c = cols[i % cols.length];
        const h = 6 + (i % 3);
        R(s, c, x, y + 10 - h, 4, h);
        R(s, c, x + 1, y + 10 - h - 2, 2, 2);
        P(s, x + 1, y + 10 - h + 1, lt(c, 0.6));
      }
    }
    return sprites.outline(s);
  });
}

export function bar_counter(w: number): Surface {
  return cached(`barcounter|${w}`, () => {
    const s = sprites.new_(w, 22);
    R(s, [120, 74, 50], 0, 0, w, 6);
    R(s, [150, 96, 64], 0, 0, w, 2);
    R(s, [96, 58, 40], 0, 6, w, 16);
    for (let x = 6; x < w - 4; x += 16) R(s, [80, 48, 34], x, 8, 10, 11);
    R(s, [200, 170, 90], 0, 19, w, 1); // brass foot rail
    // a couple of glasses on top
    for (const x of [14, w - 30]) {
      R(s, [230, 240, 250], x, -2 + 2, 3, 3);
      R(s, [240, 200, 100], x, 1 + 2, 3, 1);
    }
    return sprites.outline(s);
  });
}

export function stool(): Surface {
  return cached("stool", () => {
    const s = sprites.new_(10, 14);
    pg.draw.ellipse(s, [200, 60, 70], [0, 0, 10, 5]);
    R(s, [70, 60, 70], 4, 4, 2, 9);
    R(s, [70, 60, 70], 2, 12, 6, 2);
    return sprites.outline(s);
  });
}

export function round_table(c: Color = [140, 90, 60]): Surface {
  return cached(`rtable|${c}`, () => {
    const s = sprites.new_(28, 20);
    pg.draw.ellipse(s, c, [0, 0, 28, 10]);
    pg.draw.ellipse(s, lt(c, 0.2), [3, 1, 22, 6]);
    R(s, dk(c), 12, 8, 4, 10);
    R(s, dk(c), 8, 17, 12, 3);
    // drinks
    R(s, [240, 200, 100], 7, 2, 3, 3);
    R(s, [200, 90, 80], 17, 2, 3, 3);
    return sprites.outline(s);
  });
}

export function pool_table(): Surface {
  return cached("pool", () => {
    const s = sprites.new_(56, 32);
    R(s, [110, 66, 44], 0, 0, 56, 26);
    R(s, [60, 150, 90], 3, 3, 50, 20);
    R(s, [80, 50, 34], 4, 26, 4, 6);
    R(s, [80, 50, 34], 48, 26, 4, 6);
    for (const [x, y] of [[3, 3], [27, 3], [52, 3], [3, 22], [27, 22], [52, 22]]) R(s, [30, 30, 30], x - 1, y - 1, 2, 2);
    const balls: [number, number, Color][] = [[14, 12, [255, 255, 255]], [36, 10, [240, 200, 60]], [39, 13, [220, 60, 60]], [36, 15, [60, 90, 200]], [42, 12, [30, 30, 30]]];
    for (const [x, y, c] of balls) R(s, c, x, y, 2, 2);
    pg.draw.line(s, [230, 200, 150], [4, 18], [13, 13]);
    return sprites.outline(s);
  });
}

export function jukebox(t = 0): Surface {
  const f = Math.trunc(t * 3) % 3;
  return cached(`juke|${f}`, () => {
    const s = sprites.new_(18, 28);
    R(s, [180, 60, 80], 0, 6, 18, 22);
    pg.draw.ellipse(s, [180, 60, 80], [0, 0, 18, 14]);
    const glow: Color[] = [[255, 220, 120], [140, 230, 200], [240, 140, 220]];
    pg.draw.ellipse(s, glow[f], [3, 3, 12, 9]);
    R(s, [60, 40, 50], 4, 14, 10, 6);
    for (let x = 5; x < 13; x += 2) R(s, glow[(f + 1) % 3], x, 15, 1, 4);
    R(s, [240, 200, 100], 3, 22, 12, 2);
    return sprites.outline(s);
  });
}

export function dartboard(): Surface {
  return cached("darts", () => {
    const s = sprites.new_(16, 16);
    pg.draw.circle(s, [40, 40, 40], [8, 8], 8);
    pg.draw.circle(s, [230, 220, 190], [8, 8], 6);
    pg.draw.circle(s, [200, 60, 60], [8, 8], 4);
    pg.draw.circle(s, [60, 150, 80], [8, 8], 2);
    P(s, 10, 6, [240, 200, 60]);
    P(s, 11, 5, [240, 200, 60]);
    return sprites.outline(s);
  });
}

export function neon_sign(text: string, c: Color, t = 0): Surface {
  const on = Math.trunc(t * 1.3) % 7 !== 0; // flickers now and then
  return cached(`neon|${text}|${c}|${on}`, () => {
    const w = font.text_width(text, 2) + 12;
    const s = sprites.new_(w, 18);
    R(s, [40, 30, 40], 0, 0, w, 18);
    const col: Color = on ? c : dk(c, 0.5);
    if (on) font.draw(s, text, [6, 5], dk(c, 0.55), 2);
    font.draw(s, text, [6, 4], col, 2);
    return sprites.outline(s);
  });
}

export function string_lights(w: number, t = 0): Surface {
  const f = Math.trunc(t * 2) % 2;
  return cached(`lights|${w}|${f}`, () => {
    const s = sprites.new_(w, 7);
    const cols: Color[] = [[255, 220, 120], [255, 140, 160], [140, 220, 255], [160, 240, 160]];
    for (let x = 0; x < w; x++) P(s, x, 1 + Math.round(Math.sin(x / 10) * 1 + 1), [60, 50, 60]);
    for (let x = 4, i = 0; x < w - 2; x += 10, i++) {
      const y = 2 + Math.round(Math.sin(x / 10) * 1 + 1);
      R(s, cols[(i + f) % cols.length], x, y, 2, 3);
    }
    return s;
  });
}

// ================================================================== cafe
export function pastry_counter(w: number): Surface {
  return cached(`pastry|${w}`, () => {
    const s = sprites.new_(w, 24);
    R(s, [214, 160, 120], 0, 4, w, 20);
    R(s, [236, 190, 150], 0, 4, w, 2);
    R(s, [200, 236, 250], 4, 8, w - 30, 10);
    R(s, [255, 255, 255], 5, 9, 3, 1);
    const treats: Color[] = [[220, 150, 80], [240, 160, 190], [150, 100, 70], [250, 220, 120]];
    for (let x = 8, i = 0; x < w - 32; x += 9, i++) {
      pg.draw.ellipse(s, treats[i % treats.length], [x, 12, 7, 5]);
    }
    // espresso machine on the end
    R(s, [180, 186, 196], w - 22, 0, 16, 12);
    R(s, [90, 96, 110], w - 20, 2, 12, 3);
    R(s, [60, 60, 70], w - 16, 8, 4, 3);
    R(s, [255, 255, 255], w - 16, 11, 4, 2);
    return sprites.outline(s);
  });
}

export function chalkboard(lines: string[]): Surface {
  return cached(`chalk|${lines.join("/")}`, () => {
    const w = Math.max(...lines.map((l) => font.text_width(l))) + 10;
    const h = lines.length * 7 + 8;
    const s = sprites.new_(w, h);
    R(s, [150, 100, 62], 0, 0, w, h);
    R(s, [50, 70, 60], 2, 2, w - 4, h - 4);
    lines.forEach((l, i) => font.draw(s, l, [5, 4 + i * 7], [236, 240, 230]));
    return sprites.outline(s);
  });
}

export function cafe_table(): Surface {
  return cached("ctable", () => {
    const s = sprites.new_(36, 22);
    // chairs
    for (const x of [0, 28]) {
      R(s, [200, 120, 90], x, 6, 8, 3);
      R(s, [200, 120, 90], x + (x ? 6 : 0), 0, 2, 9);
      R(s, [150, 90, 70], x + 1, 9, 1, 8);
      R(s, [150, 90, 70], x + 6, 9, 1, 8);
    }
    pg.draw.ellipse(s, [255, 255, 255], [7, 4, 22, 8]);
    R(s, [170, 170, 180], 17, 10, 2, 9);
    R(s, [170, 170, 180], 13, 18, 10, 2);
    R(s, [255, 255, 255], 12, 3, 4, 3);
    R(s, [150, 100, 70], 13, 3, 2, 1);
    return sprites.outline(s);
  });
}

// ================================================================== Wildside
export function hay_bale(): Surface {
  return cached("hay", () => {
    const s = sprites.new_(20, 14);
    R(s, [236, 200, 110], 0, 0, 20, 14);
    R(s, [214, 176, 90], 0, 4, 20, 1);
    R(s, [214, 176, 90], 0, 9, 20, 1);
    R(s, [180, 110, 60], 6, 0, 2, 14);
    R(s, [180, 110, 60], 13, 0, 2, 14);
    for (const [x, y] of [[2, 2], [17, 6], [10, 12], [4, 11]]) P(s, x, y, [250, 230, 150]);
    return sprites.outline(s);
  });
}

export function cage(c: Color = [150, 156, 170]): Surface {
  return cached(`cage|${c}`, () => {
    const s = sprites.new_(24, 18);
    R(s, [70, 64, 76], 0, 0, 24, 18);
    R(s, [230, 220, 200], 2, 2, 20, 14);
    for (let x = 2; x < 23; x += 3) R(s, c, x, 1, 1, 16);
    R(s, c, 0, 0, 24, 1);
    R(s, c, 0, 17, 24, 1);
    R(s, [240, 200, 60], 20, 8, 2, 3);
    return sprites.outline(s);
  });
}

export function caution_sign(text: string): Surface {
  return cached(`caution|${text}`, () => {
    const w = font.text_width(text) + 12;
    const s = sprites.new_(w, 14);
    R(s, [250, 210, 60], 0, 0, w, 14);
    for (let x = 0; x < w; x += 6) {
      R(s, [52, 38, 64], x, 0, 3, 2);
      R(s, [52, 38, 64], x + 3, 12, 3, 2);
    }
    font.draw(s, text, [6, 5], [52, 38, 64]);
    return sprites.outline(s);
  });
}

export function first_aid(): Surface {
  return cached("firstaid", () => {
    const s = sprites.new_(16, 12);
    R(s, [255, 255, 255], 0, 0, 16, 12);
    R(s, [230, 70, 80], 7, 2, 2, 8);
    R(s, [230, 70, 80], 4, 5, 8, 2);
    return sprites.outline(s);
  });
}

export function feed_bin(): Surface {
  return cached("feedbin", () => {
    const s = sprites.new_(16, 18);
    R(s, [120, 150, 110], 0, 4, 16, 14);
    R(s, [100, 126, 92], 0, 2, 16, 3);
    R(s, [240, 236, 220], 3, 8, 10, 5);
    font.draw(s, "FEED", [3, 8], [80, 60, 40]);
    return sprites.outline(s);
  });
}

// ================================================================== food icons (14x14)
export function food_icon(id: string): Surface {
  return cached(`food|${id}`, () => {
    const s = sprites.new_(14, 14);
    const plate = () => pg.draw.ellipse(s, [240, 240, 246], [0, 8, 14, 6]);
    const mug = (c: Color, top: Color) => {
      R(s, c, 3, 4, 7, 9);
      R(s, top, 4, 4, 5, 2);
      R(s, c, 10, 6, 2, 1);
      R(s, c, 11, 6, 1, 4);
      R(s, c, 10, 9, 2, 1);
    };
    switch (id) {
      case "pie":
        plate();
        pg.draw.ellipse(s, [200, 130, 70], [2, 4, 10, 8]);
        pg.draw.ellipse(s, [240, 220, 150], [3, 4, 8, 4]);
        break;
      case "fishchips":
        plate();
        pg.draw.ellipse(s, [230, 170, 80], [1, 6, 8, 4]);
        for (const x of [9, 11, 12]) R(s, [250, 220, 110], x, 4, 1, 6);
        break;
      case "wings":
        plate();
        for (const [x, y] of [[2, 6], [6, 5], [9, 7]]) pg.draw.ellipse(s, [210, 90, 50], [x, y, 5, 4]);
        break;
      case "shot":
        R(s, [230, 240, 250], 4, 4, 6, 9);
        R(s, [240, 190, 90], 5, 7, 4, 5);
        R(s, [255, 255, 255], 5, 5, 1, 3);
        break;
      case "cider":
        R(s, [230, 240, 250], 3, 2, 8, 11);
        R(s, [240, 180, 70], 4, 5, 6, 7);
        R(s, [255, 250, 230], 4, 3, 6, 2);
        break;
      case "latte":
        mug([255, 255, 255], [220, 180, 140]);
        P(s, 6, 4, [255, 255, 255]);
        break;
      case "espresso":
        mug([200, 120, 90], [90, 56, 40]);
        break;
      case "croissant":
        plate();
        pg.draw.ellipse(s, [230, 170, 80], [1, 4, 12, 7]);
        for (const x of [4, 7, 10]) R(s, [200, 130, 60], x, 5, 1, 5);
        break;
      case "scone":
        plate();
        pg.draw.polygon(s, [230, 190, 130], [[3, 10], [11, 10], [7, 3]]);
        for (const [x, y] of [[6, 7], [8, 8], [7, 5]]) P(s, x, y, [160, 60, 120]);
        break;
      case "cocoa":
        mug([120, 180, 230], [120, 80, 60]);
        R(s, [255, 255, 255], 5, 3, 2, 2);
        R(s, [255, 255, 255], 7, 2, 2, 2);
        break;
      case "juice":
        R(s, [230, 240, 250], 4, 2, 6, 11);
        R(s, [120, 200, 90], 5, 5, 4, 7);
        R(s, [250, 250, 250], 8, 0, 1, 4);
        break;
      case "sub_turkey":
      case "sub_meatball":
      case "sub_veggie": {
        const fill: Color = id === "sub_turkey" ? [240, 200, 170] : id === "sub_meatball" ? [170, 70, 50] : [120, 200, 90];
        pg.draw.ellipse(s, [226, 180, 110], [0, 4, 14, 8]);
        R(s, fill, 1, 7, 12, 2);
        R(s, [120, 200, 90], 2, 6, 10, 1);
        R(s, [210, 160, 90], 1, 9, 12, 2);
        break;
      }
      case "cookie":
        pg.draw.circle(s, [210, 160, 90], [7, 7], 5);
        for (const [x, y] of [[5, 5], [8, 6], [6, 9], [9, 9]]) P(s, x, y, [90, 56, 40]);
        break;
      case "soda":
        R(s, [60, 150, 70], 4, 3, 7, 10);
        R(s, [250, 250, 250], 5, 6, 5, 3);
        R(s, [250, 210, 60], 8, 0, 1, 4);
        break;
      default:
        pg.draw.circle(s, [240, 200, 100], [7, 7], 5);
    }
    return sprites.outline(s);
  });
}

// ================================================================== more town & venue props
export function mailbox(label = ""): Surface {
  return cached("mailbox|" + label, () => {
    const w = Math.max(10, font.text_width(label) + 4);
    const s = sprites.new_(w + 2, 18);
    R(s, [90, 70, 60], Math.floor(w / 2) - 1, 9, 2, 9);
    R(s, [90, 120, 200], 0, 0, w, 9);
    R(s, [120, 150, 230], 1, 1, w - 2, 1);
    R(s, [230, 70, 80], w, 1, 2, 4);
    if (label) font.draw(s, label, [2, 3], [255, 255, 255]);
    return sprites.outline(s);
  });
}

export function bus_stop(): Surface {
  return cached("busstop", () => {
    const s = sprites.new_(32, 30);
    R(s, [70, 80, 100], 2, 4, 2, 26);
    R(s, [70, 80, 100], 28, 4, 2, 26);
    R(s, [90, 160, 210], 0, 0, 32, 5);
    R(s, [200, 230, 250], 4, 6, 24, 12);
    R(s, [176, 120, 74], 4, 20, 24, 3);
    R(s, [250, 250, 250], 10, 1, 12, 3);
    return sprites.outline(s);
  });
}

export function town_board(): Surface {
  return cached("townboard", () => {
    const s = sprites.new_(28, 26);
    R(s, [120, 80, 56], 4, 16, 3, 10);
    R(s, [120, 80, 56], 21, 16, 3, 10);
    R(s, [176, 124, 84], 0, 0, 28, 18);
    R(s, [214, 170, 120], 2, 2, 24, 14);
    font.draw(s, "TASKS", [4, 3], [120, 60, 40]);
    for (const [x, y, c] of [[4, 9, [255, 250, 200]], [12, 9, [200, 236, 255]], [20, 9, [255, 214, 226]]] as [number, number, Color][]) {
      R(s, c, x, y, 5, 5);
      R(s, [236, 80, 90], x + 2, y, 1, 1);
    }
    return sprites.outline(s);
  });
}

export function sub_counter(w: number): Surface {
  return cached(`subcounter|${w}`, () => {
    const s = sprites.new_(w, 26);
    R(s, [190, 196, 204], 0, 8, w, 18);
    R(s, [214, 220, 228], 0, 8, w, 2);
    R(s, [60, 150, 70], 0, 22, w, 4);
    // sneeze guard
    R(s, [210, 236, 250], 2, 0, w - 4, 8);
    R(s, [240, 250, 255], 4, 1, 6, 2);
    // ingredient trays
    const cols: Color[] = [[120, 200, 90], [230, 80, 70], [250, 220, 110], [240, 200, 170], [170, 70, 50], [250, 250, 240], [90, 160, 80]];
    for (let x = 4, i = 0; x < w - 10; x += 10, i++) {
      R(s, [160, 166, 176], x, 10, 9, 6);
      R(s, cols[i % cols.length], x + 1, 11, 7, 4);
    }
    return sprites.outline(s);
  });
}

export function drinks_fridge(): Surface {
  return cached("fridge", () => {
    const s = sprites.new_(20, 30);
    R(s, [220, 226, 232], 0, 0, 20, 30);
    R(s, [170, 220, 240], 2, 3, 16, 22);
    for (let y = 5; y < 24; y += 7) {
      R(s, [200, 206, 214], 2, y + 5, 16, 1);
      for (let x = 3, i = 0; x < 17; x += 4, i++) R(s, [[60, 150, 70], [230, 80, 70], [250, 210, 60], [90, 130, 220]][(i + y) % 4] as Color, x, y, 2, 5);
    }
    R(s, [60, 150, 70], 0, 26, 20, 4);
    return sprites.outline(s);
  });
}

export function juicer(): Surface {
  return cached("juicer", () => {
    const s = sprites.new_(16, 18);
    R(s, [200, 206, 214], 2, 8, 12, 10);
    R(s, [120, 200, 90], 4, 2, 8, 8);
    R(s, [250, 160, 60], 5, 3, 3, 3);
    R(s, [230, 80, 120], 8, 5, 3, 3);
    R(s, [60, 60, 70], 6, 12, 4, 2);
    return sprites.outline(s);
  });
}

export function hanging_plant(): Surface {
  return cached("hangplant", () => {
    const s = sprites.new_(14, 18);
    R(s, [150, 120, 100], 6, 0, 1, 6);
    R(s, [200, 130, 90], 3, 6, 8, 5);
    for (const [x, y] of [[2, 10], [4, 13], [10, 11], [11, 14], [7, 15], [1, 13]]) R(s, [90, 170, 90], x, y, 2, 3);
    return sprites.outline(s);
  });
}

// ================================================================== town greenery & street life
/** Trimmed hedge segment (tiles side by side); v: 0 plain, 1 pink flowers, 2 white flowers. */
export function hedge(v = 0): Surface {
  return cached("hedge|" + v, () => {
    const s = sprites.new_(16, 16);
    R(s, [64, 140, 76], 0, 4, 16, 11);
    R(s, [84, 166, 88], 0, 4, 16, 3);
    R(s, [104, 186, 100], 1, 4, 14, 1);
    R(s, [54, 120, 66], 0, 13, 16, 2);
    for (const [x, y] of [[3, 8], [9, 10], [13, 7], [6, 12]]) P(s, x, y, [100, 180, 96]);
    if (v) {
      const c: Color = v === 1 ? [250, 150, 180] : [255, 255, 255];
      for (const [x, y] of [[2, 6], [7, 9], [12, 5], [10, 12], [4, 11], [14, 9]]) P(s, x, y, c);
    }
    return sprites.outline(s);
  });
}

/** Round garden shrubs: 0 berries, 1 lilac, 2 yellow blooms. */
export function shrub(v = 0): Surface {
  return cached("shrub|" + v, () => {
    const s = sprites.new_(16, 16);
    pg.draw.ellipse(s, [62, 142, 80], [1, 4, 14, 12]);
    pg.draw.ellipse(s, [92, 176, 96], [3, 5, 9, 6]);
    const c: Color = ([[220, 60, 80], [180, 140, 240], [250, 210, 80]] as Color[])[v % 3];
    for (const [x, y] of [[4, 9], [8, 7], [11, 10], [6, 12], [10, 13]]) {
      P(s, x, y, c);
      if (v) P(s, x + 1, y, lt(c, 0.4));
    }
    return sprites.outline(s);
  });
}

/** Tree variants, same 16x32 footprint as sprites.tile("tree"): 0 pine, 1 cherry blossom, 2 apple. */
export function tree_kind(v: number): Surface {
  return cached("treek|" + v, () => {
    const s = sprites.new_(16, 32);
    R(s, [140, 96, 60], 6, 20, 4, 10);
    P(s, 7, 22, [170, 120, 80]);
    if (v === 0) {
      for (const [y, w] of [[2, 6], [7, 10], [12, 14], [16, 16]]) {
        pg.draw.polygon(s, [52, 120, 84], [[8, y], [8 - w / 2, y + 7], [8 + w / 2, y + 7]]);
      }
      for (const [x, y] of [[7, 6], [6, 11], [5, 16], [9, 13]]) P(s, x, y, [86, 160, 110]);
    } else {
      const base: Color = v === 1 ? [236, 150, 186] : [66, 150, 82];
      pg.draw.ellipse(s, base, [0, 2, 16, 20]);
      pg.draw.ellipse(s, v === 1 ? [248, 182, 210] : [88, 180, 96], [2, 3, 12, 14]);
      pg.draw.ellipse(s, v === 1 ? [255, 222, 236] : [120, 206, 112], [4, 4, 6, 6]);
      if (v === 2) for (const [x, y] of [[4, 11], [10, 8], [8, 15], [12, 13], [6, 6]]) R(s, [220, 60, 70], x, y, 2, 2);
      else for (const [x, y] of [[3, 14], [11, 12], [7, 18]]) P(s, x, y, [255, 255, 255]);
    }
    R(s, v === 1 ? [240, 190, 210] : [100, 170, 90], 3, 30, 10, 2);
    return sprites.outline(s);
  });
}

export function flower_pot(v = 0): Surface {
  return cached("fpot|" + v, () => {
    const s = sprites.new_(10, 13);
    R(s, [196, 110, 80], 1, 7, 8, 6);
    R(s, [220, 136, 100], 0, 6, 10, 2);
    R(s, [80, 160, 84], 2, 3, 6, 4);
    const c: Color = ([[240, 110, 140], [250, 210, 90], [170, 140, 240]] as Color[])[v % 3];
    for (const [x, y] of [[2, 2], [5, 1], [7, 3]]) R(s, c, x, y, 2, 2);
    return sprites.outline(s);
  });
}

export function trash_bin(): Surface {
  return cached("bin", () => {
    const s = sprites.new_(10, 14);
    R(s, [70, 130, 96], 1, 3, 8, 11);
    R(s, [90, 156, 116], 2, 4, 2, 9);
    R(s, [60, 110, 80], 0, 1, 10, 3);
    R(s, [200, 200, 210], 4, 0, 2, 1);
    return sprites.outline(s);
  });
}

export function hydrant(): Surface {
  return cached("hydrant", () => {
    const s = sprites.new_(10, 14);
    R(s, [220, 60, 60], 2, 3, 6, 10);
    R(s, [240, 100, 90], 3, 4, 1, 8);
    R(s, [220, 60, 60], 0, 6, 10, 3);
    R(s, [190, 40, 50], 3, 0, 4, 3);
    R(s, [190, 40, 50], 1, 12, 8, 2);
    return sprites.outline(s);
  });
}

/** Striped agility jump for the dog run. */
export function hurdle(): Surface {
  return cached("hurdle", () => {
    const s = sprites.new_(26, 14);
    for (const x of [1, 22]) R(s, [240, 240, 240], x, 1, 3, 13);
    for (let i = 0; i < 6; i++) R(s, i % 2 ? [255, 255, 255] : [240, 90, 80], 4 + i * 3, 5, 3, 3);
    R(s, [90, 170, 220], 1, 0, 3, 2);
    R(s, [90, 170, 220], 22, 0, 3, 2);
    return sprites.outline(s);
  });
}

export function dog_tunnel(): Surface {
  return cached("tunnel", () => {
    const s = sprites.new_(32, 16);
    R(s, [90, 150, 230], 2, 2, 28, 13);
    for (let x = 4; x < 30; x += 5) R(s, [70, 120, 200], x, 2, 1, 13);
    R(s, [130, 186, 250], 2, 3, 28, 2);
    pg.draw.ellipse(s, [52, 38, 64], [0, 3, 7, 12]);
    pg.draw.ellipse(s, [90, 150, 230], [25, 2, 7, 13]);
    return sprites.outline(s);
  });
}

export function dog_house(): Surface {
  return cached("doghouse", () => {
    const s = sprites.new_(26, 24);
    R(s, [200, 150, 96], 3, 10, 20, 14);
    R(s, [180, 130, 80], 3, 15, 20, 1);
    R(s, [180, 130, 80], 3, 19, 20, 1);
    pg.draw.polygon(s, [210, 80, 80], [[13, 1], [0, 12], [26, 12]]);
    R(s, [240, 110, 100], 6, 9, 14, 1);
    pg.draw.ellipse(s, [52, 38, 64], [9, 14, 8, 12]);
    R(s, [250, 240, 200], 10, 11, 6, 2);
    return sprites.outline(s);
  });
}

export function water_bowl(): Surface {
  return cached("wbowl", () => {
    const s = sprites.new_(12, 6);
    pg.draw.ellipse(s, [90, 120, 220], [0, 0, 12, 6]);
    pg.draw.ellipse(s, [150, 210, 250], [2, 1, 8, 3]);
    return sprites.outline(s);
  });
}

export function picnic_table(): Surface {
  return cached("picnic", () => {
    const s = sprites.new_(32, 20);
    R(s, [176, 120, 74], 0, 13, 32, 3); // bench
    R(s, [196, 140, 92], 2, 4, 28, 7); // top
    R(s, [150, 100, 62], 2, 10, 28, 1);
    for (let x = 4; x < 30; x += 6) R(s, [210, 156, 104], x, 5, 4, 1);
    for (const x of [5, 25]) R(s, [130, 86, 56], x, 11, 2, 9);
    // a gingham cloth and a basket
    R(s, [240, 100, 100], 10, 4, 12, 5);
    for (let x = 10; x < 22; x += 2) R(s, [255, 255, 255], x, 5 + (x % 4 ? 0 : 2), 1, 1);
    R(s, [200, 150, 80], 13, 1, 6, 4);
    return sprites.outline(s);
  });
}

/** Little market stall with a striped awning, tall enough for a vendor to stand behind the
 * counter (vendor feet ~42px below the stall's top); goods: "bread" | "flowers". */
export function market_stall(sign: string, goods = "bread"): Surface {
  return cached("stall|" + sign + "|" + goods, () => {
    const s = sprites.new_(44, 48);
    for (const x of [3, 39]) R(s, [130, 90, 60], x, 8, 2, 40);
    for (let i = 0; i < 8; i++) {
      R(s, i % 2 ? [255, 255, 255] : [230, 110, 100], 1 + Math.round(i * 5.25), 6, 6, 6);
      R(s, i % 2 ? [236, 236, 236] : [200, 84, 80], 1 + Math.round(i * 5.25), 12, 6, 2);
    }
    R(s, [255, 244, 210], 6, 0, 32, 7);
    font.draw(s, sign, [22 - Math.floor(font.text_width(sign) / 2), 1], [150, 80, 50]);
    R(s, [196, 140, 92], 2, 34, 40, 14); // counter
    R(s, [214, 160, 110], 2, 34, 40, 2);
    R(s, [160, 110, 70], 2, 41, 40, 1);
    if (goods === "bread") {
      for (const [x, c] of [[5, [220, 160, 80]], [14, [200, 130, 60]], [23, [230, 180, 100]], [31, [210, 150, 70]]] as [number, Color][]) {
        pg.draw.ellipse(s, c, [x, 30, 9, 6]);
        P(s, x + 3, 31, lt(c, 0.4));
        P(s, x + 5, 32, lt(c, 0.4));
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const c: Color = ([[240, 110, 140], [250, 210, 90], [170, 140, 240], [255, 255, 255], [250, 150, 90]] as Color[])[i];
        R(s, [120, 170, 200], 5 + i * 7, 30, 6, 5);
        R(s, [80, 160, 84], 7 + i * 7, 27, 2, 3);
        R(s, c, 6 + i * 7, 25, 4, 3);
      }
    }
    return sprites.outline(s);
  });
}

export function swings(): Surface {
  return cached("swings", () => {
    const s = sprites.new_(40, 30);
    const post: Color = [200, 90, 80];
    pg.draw.line(s, post, [2, 29], [7, 2], 2);
    pg.draw.line(s, post, [12, 29], [7, 2], 2);
    pg.draw.line(s, post, [28, 29], [33, 2], 2);
    pg.draw.line(s, post, [38, 29], [33, 2], 2);
    R(s, [240, 200, 90], 6, 1, 28, 3);
    for (const x of [13, 23]) {
      R(s, [150, 150, 160], x, 4, 1, 16);
      R(s, [150, 150, 160], x + 5, 4, 1, 16);
      R(s, [90, 150, 230], x - 1, 20, 8, 3);
    }
    return sprites.outline(s);
  });
}

export function slide(): Surface {
  return cached("slide", () => {
    const s = sprites.new_(34, 30);
    for (const x of [1, 8]) R(s, [150, 150, 170], x, 4, 2, 26);
    for (let y = 8; y < 29; y += 5) R(s, [180, 180, 196], 2, y, 7, 1);
    R(s, [240, 200, 90], 0, 2, 12, 4);
    pg.draw.polygon(s, [240, 120, 150], [[10, 3], [14, 3], [33, 26], [33, 29], [29, 29]]);
    pg.draw.line(s, [255, 170, 196], [12, 4], [31, 27]);
    return sprites.outline(s);
  });
}

export function sandbox(): Surface {
  return cached("sandbox", () => {
    const s = sprites.new_(34, 22);
    R(s, [170, 110, 70], 0, 2, 34, 20);
    R(s, [244, 222, 160], 3, 5, 28, 14);
    for (const [x, y] of [[6, 8], [20, 14], [26, 7], [12, 16]]) R(s, [226, 200, 138], x, y, 3, 1);
    pg.draw.ellipse(s, [226, 200, 138], [8, 9, 10, 5]); // sandcastle mound
    R(s, [240, 90, 80], 22, 9, 5, 5); // bucket
    R(s, [255, 130, 110], 22, 9, 5, 1);
    R(s, [90, 150, 230], 27, 13, 1, 4); // spade
    R(s, [90, 150, 230], 26, 16, 3, 2);
    R(s, [196, 140, 92], 0, 2, 34, 2);
    return sprites.outline(s);
  });
}

export function seesaw(): Surface {
  return cached("seesaw", () => {
    const s = sprites.new_(34, 14);
    pg.draw.polygon(s, [150, 150, 170], [[17, 6], [12, 13], [22, 13]]);
    pg.draw.line(s, [90, 170, 110], [1, 9], [33, 3], 2);
    for (const [x, y] of [[4, 6], [29, 1]]) R(s, [240, 200, 90], x, y, 2, 3);
    return sprites.outline(s);
  });
}
