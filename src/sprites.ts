/*
 * All pixel art is generated here, in code. 100% original designs.
 *
 * Everything is cached after first draw. Characters are 16x24, tiles 16x16.
 * (Port of python_version/game/sprites.py)
 */
import * as pg from "./pg";
import { Surface, SRCALPHA } from "./pg";
import * as data from "./data";
import * as font from "./font";

export const OUTLINE: number[] = [52, 38, 64];
export const WHITE: number[] = [255, 255, 255];
export const DARK: number[] = [52, 38, 64];
export const PINK: number[] = [250, 150, 170];
export const _cache: Map<string, any> = new Map();

/** Python dict.get(k, default) semantics: a present key (even if null) wins. */
function _get(d: any, k: string, def: any = null): any {
  return d && k in d ? d[k] : def;
}

function _eq(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function darker(c: number[], f = 0.78): number[] {
  return c.slice(0, 3).map((v) => Math.max(0, Math.min(255, Math.trunc(v * f))));
}

export function lighter(c: number[], f = 0.35): number[] {
  return c.slice(0, 3).map((v) => Math.max(0, Math.min(255, Math.trunc(v + (255 - v) * f))));
}

export function new_(w: number, h: number): Surface {
  return new Surface([w, h], SRCALPHA);
}
export { new_ as new };

export function R(s: Surface, c: number[], x: number, y: number, w: number, h: number) {
  if (w > 0 && h > 0) pg.draw.rect(s, c, [x, y, w, h]);
}

export function P(s: Surface, x: number, y: number, c: number[]) {
  s.set_at([x, y], c);
}

export function outline(s: Surface, color: number[] = OUTLINE): Surface {
  const [w, h] = s.get_size();
  const out = s.copy();
  const D = s.data;
  const alphaAt = (x: number, y: number) => D[(y * w + x) * 4 + 3];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alphaAt(x, y) === 0) {
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy;
          if (0 <= nx && nx < w && 0 <= ny && ny < h && alphaAt(nx, ny) > 0) {
            out.set_at([x, y], color);
            break;
          }
        }
      }
    }
  }
  return out;
}

export function grayscale(s: Surface): Surface {
  const [w, h] = s.get_size();
  const out = new_(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = s.get_at([x, y]);
      if (c[3]) {
        let g = Math.trunc(c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15);
        g = Math.trunc(g * 0.8 + 30);
        out.set_at([x, y], [g, g, Math.min(255, g + 8), c[3]]);
      }
    }
  }
  return out;
}

export function tint(s: Surface, color: number[], amt = 0.5): Surface {
  const [w, h] = s.get_size();
  const out = s.copy();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = s.get_at([x, y]);
      if (c[3]) {
        const nc = [0, 1, 2].map((i) => Math.trunc(c[i] * (1 - amt) + color[i] * amt));
        nc.push(c[3]);
        out.set_at([x, y], nc);
      }
    }
  }
  return out;
}

export function silhouette(s: Surface, color: number[]): Surface {
  const [w, h] = s.get_size();
  const out = new_(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (s.get_at([x, y])[3]) out.set_at([x, y], color);
    }
  }
  return out;
}

/** key may be a string or any JSON-able value (tuples become arrays). */
export function cached(key: any, fn: () => any): any {
  const k = typeof key === "string" ? key : JSON.stringify(key);
  let v = _cache.get(k);
  if (v === undefined || v === null) {
    v = fn();
    _cache.set(k, v);
  }
  return v;
}

// =================================================================== PEOPLE
export function zoe_spec(hair_mode: string, outfit_id: string): any {
  const o = _get(data.OUTFITS, outfit_id, data.OUTFITS["classic"]);
  const z = data.PEOPLE["zoe"];
  return {
    skin: z["skin"], hair: z["hair"], hair2: z["hair2"], style: hair_mode === "long" ? "long" : "bob",
    shirt: o["scrub"], coat: _get(o, "coat"), pants: _get(o, "pants", o["scrub"]), shoes: o["shoes"],
    patches: _get(o, "patches"), stars: _get(o, "stars"), overalls_z: _get(o, "overalls"), blonde: true,
    dress: _get(o, "dress"), pcoat: _get(o, "pcoat"),
  };
}

export function _draw_person(sp: any, d: string, frame: number): Surface {
  let s = new_(16, 24);
  const skin = sp["skin"], hair = sp["hair"];
  const hair2 = _get(sp, "hair2", darker(hair));
  const style = _get(sp, "style", "short");
  const shirt = _get(sp, "shirt", [200, 200, 200]);
  const coat = _get(sp, "coat");
  const dress = _get(sp, "dress");
  const pants = dress ? skin : _get(sp, "pants", shirt);
  const shoes = _get(sp, "shoes", [80, 60, 60]);
  const side = d === "left" || d === "right";
  const blink = frame === 3;
  if (frame === 3) frame = 0;
  const lo = frame === 1 ? -1 : 0;
  const ro = frame === 2 ? -1 : 0;
  const fmap: Record<number, number> = { 0: 0, 1: 1, 2: -1 };

  // -- long hair behind body
  if (style === "long") {
    if (d === "down") R(s, hair2, 3, 6, 10, 11);
    else if (side) R(s, hair2, 3, 6, 5, 11);
  }
  // -- legs + shoes
  if (side) {
    const fx = fmap[frame];
    R(s, darker(pants), 7 - fx, 18, 2, 4);
    R(s, darker(shoes), 7 - fx, 22, 3, 2);
    R(s, pants, 7 + fx, 18, 2, 4);
    R(s, shoes, 7 + fx, 22, 3, 2);
  } else {
    R(s, pants, 5, 18, 2, 4 + lo);
    R(s, shoes, 5, 22 + lo, 2, 2);
    R(s, pants, 9, 18, 2, 4 + ro);
    R(s, shoes, 9, 22 + ro, 2, 2);
  }
  // -- torso
  const [tx, tw] = side ? [5, 6] : [4, 8];
  R(s, shirt, tx, 11, tw, 7);
  if (dress) {
    if (side) {
      R(s, shirt, 4, 16, 7, 3);
      R(s, darker(shirt, 0.85), 4, 18, 8, 1);
    } else {
      R(s, shirt, 4, 16, 8, 3);
      R(s, darker(shirt, 0.85), 3, 18, 10, 1);
    }
  }
  if (_get(sp, "stars") && !coat && d !== "up") {
    for (const p of side ? [[6, 12], [9, 14], [7, 16]] : [[5, 12], [10, 13], [7, 15], [9, 16]]) P(s, p[0], p[1], [255, 240, 160]);
  }
  const sleeve = coat ? coat : shirt;
  if (coat && _get(sp, "pcoat")) {
    // double-breasted pea coat, a bit longer than a shirt
    const btn = [214, 190, 110];
    if (d === "down") {
      R(s, coat, 4, 11, 8, 9);
      P(s, 7, 11, skin);
      P(s, 8, 11, skin);
      P(s, 6, 11, lighter(coat, 0.3));
      P(s, 9, 11, lighter(coat, 0.3));
      for (const p of [[6, 13], [9, 13], [6, 16], [9, 16]]) P(s, p[0], p[1], btn);
    } else if (side) {
      R(s, coat, 5, 11, 6, 9);
      P(s, 9, 13, btn);
      P(s, 9, 16, btn);
    } else {
      R(s, coat, 4, 11, 8, 9);
      R(s, darker(coat), 7, 13, 2, 1);
    }
  } else if (coat) {
    if (d === "down") {
      R(s, coat, 4, 11, 2, 7);
      R(s, coat, 10, 11, 2, 7);
      P(s, 7, 11, skin);
      P(s, 8, 11, skin);
      if (_get(sp, "patches")) {
        P(s, 4, 15, [240, 120, 120]);
        P(s, 11, 14, [120, 180, 240]);
      }
      if (_get(sp, "stars")) {
        for (const p of [[4, 13], [10, 16], [11, 12]]) P(s, p[0], p[1], [250, 230, 120]);
      }
    } else if (d === "up") {
      R(s, coat, 4, 11, 8, 7);
      if (_get(sp, "stars")) {
        for (const p of [[5, 12], [9, 15], [7, 13]]) P(s, p[0], p[1], [250, 230, 120]);
      }
    } else {
      R(s, coat, 5, 11, 4, 7);
      if (_get(sp, "patches")) P(s, 6, 15, [240, 120, 120]);
    }
  } else {
    if (d === "down") {
      P(s, 7, 11, skin);
      P(s, 8, 11, skin);
    }
  }
  if (_get(sp, "overalls") || _get(sp, "overalls_z")) {
    const oc = pants;
    if (side) {
      R(s, oc, 5, 14, 6, 4);
      P(s, 8, 12, oc);
      P(s, 8, 13, oc);
    } else {
      R(s, oc, 5, 14, 6, 4);
      R(s, oc, 5, 11, 1, 3);
      R(s, oc, 10, 11, 1, 3);
      if (d === "down") {
        P(s, 5, 12, [250, 220, 120]);
        P(s, 10, 12, [250, 220, 120]);
      }
    }
  }
  if (_get(sp, "apron") && d !== "up") {
    if (side) R(s, sp["apron"], 9, 12, 2, 6);
    else R(s, sp["apron"], 5, 13, 6, 6);
  }
  // -- arms
  if (side) {
    const ax = fmap[frame];
    R(s, darker(sleeve, 0.9), 7 + ax, 12, 2, 4);
    R(s, skin, 7 + ax, 16, 2, 1);
  } else {
    const la = frame === 1 ? 1 : 0;
    const ra = frame === 2 ? 1 : 0;
    R(s, sleeve, 3, 12 + la, 1, 4);
    P(s, 3, 16 + la, skin);
    R(s, sleeve, 12, 12 + ra, 1, 4);
    P(s, 12, 16 + ra, skin);
  }
  // -- head
  R(s, skin, 4, 3, 8, 8);
  for (const p of [[4, 3], [11, 3], [4, 10], [11, 10]]) P(s, p[0], p[1], [0, 0, 0, 0]);
  const eye = [52, 40, 70];
  if (d === "down") {
    if (blink) {
      P(s, 6, 7, eye);
      P(s, 9, 7, eye);
    } else {
      R(s, eye, 6, 6, 1, 2);
      R(s, eye, 9, 6, 1, 2);
    }
    P(s, 5, 8, [250, 170, 170]);
    P(s, 10, 8, [250, 170, 170]);
    P(s, 7, 9, darker(skin, 0.75));
    P(s, 8, 9, darker(skin, 0.75));
    if (_get(sp, "glasses")) {
      R(s, [90, 90, 110], 5, 6, 2, 1);
      R(s, [90, 90, 110], 8, 6, 3, 1);
      P(s, 7, 6, [90, 90, 110]);
    }
    if (_get(sp, "beard")) {
      R(s, hair, 5, 9, 6, 2);
      P(s, 7, 9, darker(skin, 0.75));
    }
  } else if (side) {
    if (blink) P(s, 9, 7, eye);
    else R(s, eye, 9, 6, 1, 2);
    P(s, 10, 8, [250, 170, 170]);
    P(s, 11, 9, darker(skin, 0.75));
    if (_get(sp, "glasses")) R(s, [90, 90, 110], 8, 6, 3, 1);
    if (_get(sp, "beard")) R(s, hair, 7, 9, 5, 2);
  }
  // -- hair
  R(s, hair, 4, 2, 8, 3);
  R(s, hair, 5, 1, 6, 1);
  if (d === "down") {
    if (style === "long") {
      R(s, hair, 3, 4, 2, 12);
      R(s, hair, 11, 4, 2, 12);
      R(s, hair, 5, 5, 2, 1);
      P(s, 3, 16, hair2);
      P(s, 12, 16, hair2);
    } else if (style === "bob") {
      R(s, hair, 3, 4, 2, 7);
      R(s, hair, 11, 4, 2, 7);
      R(s, hair, 5, 5, 3, 1);
      P(s, 4, 11, hair2);
      P(s, 11, 11, hair2);
    } else if (style === "short" || style === "cap") {
      R(s, hair, 4, 4, 1, 2);
      R(s, hair, 11, 4, 1, 2);
    } else if (style === "middlepart") {
      R(s, hair, 4, 4, 3, 2);
      R(s, hair, 9, 4, 3, 2);
      P(s, 4, 6, hair2);
      P(s, 11, 6, hair2);
      P(s, 7, 2, hair2);
      P(s, 8, 2, hair2);
      P(s, 7, 4, skin);
      P(s, 8, 4, skin);
    } else if (style === "bun") {
      R(s, hair, 4, 4, 1, 3);
      R(s, hair, 11, 4, 1, 3);
      R(s, hair2, 6, 0, 4, 2);
    }
  } else if (d === "up") {
    R(s, hair, 4, 2, 8, 9);
    if (style === "long") {
      R(s, hair, 3, 4, 10, 13);
      R(s, hair2, 7, 8, 1, 8);
    } else if (style === "bob") {
      R(s, hair, 3, 4, 10, 7);
      R(s, hair2, 4, 11, 8, 1);
    } else if (style === "bun") {
      R(s, hair2, 6, 0, 4, 2);
    }
  } else {
    R(s, hair, 4, 4, 3, 5);
    R(s, hair, 10, 4, 2, 1);
    if (style === "long") {
      R(s, hair, 3, 4, 4, 12);
      P(s, 3, 16, hair2);
    } else if (style === "bob") {
      R(s, hair, 3, 4, 4, 7);
      P(s, 4, 11, hair2);
    } else if (style === "bun") {
      R(s, hair2, 2, 2, 3, 3);
    }
  }
  if (style === "cap") {
    const cap = _get(sp, "cap", [200, 90, 70]);
    R(s, cap, 4, 1, 8, 3);
    if (d === "down") R(s, darker(cap), 3, 4, 10, 1);
    else if (side) R(s, darker(cap), 10, 4, 4, 1);
  } else if (_get(sp, "cap")) {
    const cap = sp["cap"];
    R(s, cap, 4, 1, 8, 2);
    if (d === "down") R(s, darker(cap), 4, 3, 8, 1);
  }
  // hair shine
  if (d !== "up") {
    P(s, 6, 2, lighter(hair, 0.5));
    P(s, 7, 2, lighter(hair, 0.5));
  }
  s = outline(s);
  return s;
}

/** key identifies the spec for caching. */
export function person(key: any, spec: any, d = "down", frame = 0): Surface {
  if (d === "left") {
    return cached(["person", key, "left", frame], () =>
      pg.transform.flip(person(key, spec, "right", frame), true, false));
  }
  return cached(["person", key, d, frame], () => _draw_person(spec, d, frame));
}

export function zoe(hair_mode: string, outfit: string, d = "down", frame = 0): Surface {
  return person(["zoe", hair_mode, outfit], zoe_spec(hair_mode, outfit), d, frame);
}

export function npc(name: string, d = "down", frame = 0): Surface {
  return person(["npc", name], data.PEOPLE[name], d, frame);
}

export function owner(idx: number, d = "down", frame = 0): Surface {
  return person(["owner", idx], data.OWNER_LOOKS[pg.mod(idx, data.OWNER_LOOKS.length)], d, frame);
}

export function portrait(key: any, spec: any): Surface {
  const mk = () => {
    const base = person(key, spec, "down", 0);
    const head = new_(12, 14);
    head.blit(base, [-2, 0]);
    const big = pg.transform.scale(head, [24, 28]);
    return big;
  };
  return cached(["portrait", key], mk);
}

export function zoe_portrait(hair_mode: string, outfit: string): Surface {
  return portrait(["zoe", hair_mode, outfit], zoe_spec(hair_mode, outfit));
}

export function npc_portrait(name: string): Surface {
  return portrait(["npc", name], data.PEOPLE[name]);
}

// =================================================================== ANIMALS
export function _draw_animal(kind: string, vi: number, size: number, frame: number, mood: string): Surface {
  const info = data.ANIMALS[kind];
  const v = info["variants"][pg.mod(vi, info["variants"].length)];
  const body = v["body"], belly = v["belly"], acc = v["accent"];
  const k = size / 24.0;
  let s = new_(size, size);
  const rd = (n: number) => pg.pyround(n);

  const E = (x: number, y: number, w: number, h: number, c: number[]) => {
    pg.draw.ellipse(s, c, [rd(x * k), rd(y * k), Math.max(1, rd(w * k)), Math.max(1, rd(h * k))]);
  };
  const Rc = (x: number, y: number, w: number, h: number, c: number[]) => {
    pg.draw.rect(s, c, [rd(x * k), rd(y * k), Math.max(1, rd(w * k)), Math.max(1, rd(h * k))]);
  };
  const Pl = (pts: number[][], c: number[]) => {
    pg.draw.polygon(s, c, pts.map(([x, y]) => [rd(x * k), rd(y * k)]));
  };

  const hy = frame === 1 ? 1 : 0; // head bob
  let oy = 0;
  if (kind === "bunny") oy = 3;
  const tail_up = frame === 1;
  let eye_y = 7 + oy + hy;
  let ex1 = 8, ex2 = 14;
  let nose_c = DARK;
  // ---- tails (behind)
  if (kind === "dog") {
    E(16, tail_up ? 12 : 14, 7, 3, body);
  } else if (kind === "cat") {
    E(16, tail_up ? 10 : 12, 4, 10, body);
    E(17, tail_up ? 9 : 11, 3, 3, acc);
  } else if (kind === "fox" || kind === "moonfox") {
    E(14, tail_up ? 9 : 11, 10, 11, body);
    E(19, tail_up ? 8 : 10, 5, 5, belly);
  } else if (kind === "redpanda") {
    E(14, tail_up ? 9 : 11, 9, 13, body);
    for (const yy of [12, 16, 20]) Rc(15, yy - (tail_up ? 2 : 0), 7, 1, darker(body, 0.7));
  } else if (kind === "bunny") {
    E(17, 18, 5, 5, WHITE);
  }
  // ---- ears behind head
  if (kind === "bunny") {
    for (const x of [7, 13]) {
      E(x, 0, 4, 11, body);
      E(x + 1, 2, 2, 7, acc);
    }
  }
  if (kind === "cat") {
    Pl([[5, 7 + hy], [5, 1 + hy], [10, 4 + hy]], body);
    Pl([[19, 7 + hy], [19, 1 + hy], [14, 4 + hy]], body);
    Pl([[6, 5 + hy], [6, 3 + hy], [8, 4 + hy]], PINK);
    Pl([[18, 5 + hy], [18, 3 + hy], [16, 4 + hy]], PINK);
  }
  if (kind === "fox" || kind === "moonfox") {
    Pl([[4, 8 + hy], [4, 0 + hy], [10, 4 + hy]], body);
    Pl([[20, 8 + hy], [20, 0 + hy], [14, 4 + hy]], body);
    Pl([[5, 3 + hy], [4, 0 + hy], [6, 1 + hy]], acc);
    Pl([[19, 3 + hy], [20, 0 + hy], [18, 1 + hy]], acc);
  }
  if (kind === "redpanda") {
    E(3, 2 + hy, 6, 6, acc);
    E(15, 2 + hy, 6, 6, acc);
    E(4, 3 + hy, 4, 4, body);
    E(16, 3 + hy, 4, 4, body);
  }
  if (kind === "hamster") {
    E(4, 4 + hy, 5, 5, body);
    E(15, 4 + hy, 5, 5, body);
    E(5, 5 + hy, 3, 3, acc);
    E(16, 5 + hy, 3, 3, acc);
  }
  // ---- body
  if (kind === "hamster") {
    E(3, 8, 18, 15, body);
    E(4, 4 + hy, 16, 13, body);
    E(7, 13, 10, 9, belly);
    E(5, 20, 4, 3, acc);
    E(15, 20, 4, 3, acc);
    eye_y = 8 + hy;
    nose_c = [230, 120, 140];
  } else if (kind === "penguin") {
    E(3, 12, 4, 8, darker(body, 0.85));
    E(17, 12, 4, 8, darker(body, 0.85));
    E(7, 20, 4, 3, acc);
    E(13, 20, 4, 3, acc);
    E(5, 3 + hy, 14, 20 - hy, body);
    E(7, 6 + hy, 10, 16 - hy, belly);
    Rc(11, 2 + hy, 2, 2, body);
    eye_y = 9 + hy;
    ex1 = 9; ex2 = 13;
  } else if (kind === "hedgehog") {
    // spikes
    const sp = darker(acc, 0.9);
    E(2, 3 + hy, 20, 19, sp);
    for (let i = 0; i < 9; i++) {
      const ang_x = 2 + i * 2.5;
      Pl([[ang_x, 6 + hy + (i % 2) * 2], [ang_x + 1.5, 0 + hy + (i % 2)], [ang_x + 3, 6 + hy]], sp);
    }
    Pl([[1, 14], [-1, 10], [3, 11]], sp);
    Pl([[23, 14], [25, 10], [21, 11]], sp);
    E(6, 6 + hy, 12, 10, belly);
    E(7, 15, 10, 7, belly);
    E(6, 4 + hy, 3, 3, belly);
    E(15, 4 + hy, 3, 3, belly);
    E(6, 20, 4, 3, darker(belly, 0.85));
    E(14, 20, 4, 3, darker(belly, 0.85));
    eye_y = 9 + hy;
    ex1 = 9; ex2 = 13;
  } else {
    E(5, 12 + Math.floor(oy / 2), 14, 11 - Math.floor(oy / 2), body);
    E(8, 14 + Math.floor(oy / 2), 8, 8 - Math.floor(oy / 2), belly);
    let fc = kind === "redpanda" ? acc : body;
    if (kind === "redpanda") fc = belly;
    E(6, 20, 5, 4, darker(fc, 0.92));
    E(13, 20, 5, 4, darker(fc, 0.92));
    E(4, 3 + oy + hy, 16, 12, body);
    if (kind === "dog" || kind === "fox" || kind === "moonfox") E(8, 9 + oy + hy, 8, 5, belly);
    if (kind === "redpanda") {
      E(6, 7 + hy, 4, 4, acc);
      E(14, 7 + hy, 4, 4, acc);
      E(8, 10 + hy, 8, 4, acc);
    }
    if (kind === "cat") Rc(11, 3 + hy, 2, 2, acc);
    if (kind === "bunny") {
      E(9, 9 + oy + hy, 6, 4, belly);
      nose_c = [240, 130, 150];
    }
    if (kind === "cat") nose_c = [240, 130, 150];
  }
  // floppy dog ears in front
  if (kind === "dog") {
    E(2, 4 + hy, 5, 9, acc);
    E(17, 4 + hy, 5, 9, acc);
  }
  // ---- face
  const eye = [40, 30, 50];
  if (mood === "blink" || mood === "sick") {
    Rc(ex1, eye_y + 1, 2, 1, eye);
    Rc(ex2, eye_y + 1, 2, 1, eye);
  } else if (mood === "happy") {
    Rc(ex1, eye_y + 1, 1, 1, eye);
    Rc(ex1 + 1, eye_y, 1, 1, eye);
    Rc(ex2, eye_y, 1, 1, eye);
    Rc(ex2 + 1, eye_y + 1, 1, 1, eye);
  } else {
    Rc(ex1, eye_y, 2, 2, eye);
    Rc(ex2, eye_y, 2, 2, eye);
    if (size >= 20) {
      Rc(ex1, eye_y, 1, 1, WHITE);
      Rc(ex2, eye_y, 1, 1, WHITE);
    }
    if (mood === "angry") {
      Rc(ex1 - 1, eye_y - 2, 2, 1, eye);
      Rc(ex2 + 1, eye_y - 2, 2, 1, eye);
    }
  }
  if (kind === "penguin") {
    Pl([[10.5, eye_y + 3], [13.5, eye_y + 3], [12, eye_y + 5]], acc);
  } else {
    Rc(11, eye_y + 3, 2, 1, nose_c);
    Rc(11, eye_y + 4, 1, 1, darker(belly, 0.6));
    Rc(12, eye_y + 4, 1, 1, darker(belly, 0.6));
  }
  if (mood !== "angry") {
    Rc(ex1 - 2, eye_y + 3, 1, 1, [250, 160, 180]);
    Rc(ex2 + 3, eye_y + 3, 1, 1, [250, 160, 180]);
  }
  if (kind === "moonfox") {
    Rc(11, 4 + hy, 2, 1, acc);
    Rc(12, 3 + hy, 1, 1, acc);
  }
  s = outline(s);
  return s;
}

export function animal(kind: string, vi = 0, size = 24, frame = 0, mood = "normal"): Surface {
  return cached(["animal", kind, vi, size, frame, mood], () => _draw_animal(kind, vi, size, frame, mood));
}

export function animal_dead(kind: string, vi = 0, size = 24): Surface {
  return cached(["animal_dead", kind, vi, size], () =>
    pg.transform.rotate(grayscale(animal(kind, vi, size, 0, "blink")), 90));
}

export function scaled(surf_key: any, surf: Surface, factor: number): Surface {
  return cached(["scaled", surf_key, factor], () =>
    pg.transform.scale(surf, [surf.get_width() * factor, surf.get_height() * factor]));
}

export function animal_big(kind: string, vi: number, frame: number, mood: string, factor = 3): Surface {
  return scaled(["ab", kind, vi, frame, mood], animal(kind, vi, 24, frame, mood), factor);
}

// =================================================================== TILES
export function _rng(seed: any): pg.Random {
  return new pg.Random(seed);
}

export function _grass(v: number): Surface {
  const s = new_(16, 16);
  s.fill([126, 200, 104]);
  const r = _rng(100 + v);
  for (let i = 0; i < 10; i++) {
    const x = r.randrange(16), y = r.randrange(16);
    P(s, x, y, r.random() < 0.6 ? [150, 222, 120] : [104, 176, 92]);
  }
  if (v === 2) {
    for (const [x, y] of [[4, 6], [11, 11]]) {
      P(s, x, y, [90, 160, 80]);
      P(s, x + 1, y - 1, [90, 160, 80]);
      P(s, x + 2, y, [90, 160, 80]);
    }
  }
  return s;
}

export function _flowers(frame: number, v: number): Surface {
  const s = _grass(v).copy();
  const r = _rng(200 + v);
  const cols = [[250, 140, 170], [255, 255, 255], [250, 220, 90], [190, 150, 250]];
  for (let i = 0; i < 3; i++) {
    const x = r.randrange(2, 13), y = r.randrange(3, 13);
    const c = cols[r.randrange(cols.length)];
    const dx = frame && r.random() < 0.5 ? 1 : 0;
    P(s, x, y + 1, [80, 150, 80]);
    P(s, x + dx, y, c);
    P(s, x + dx - 1, y, c);
    P(s, x + dx + 1, y, c);
    P(s, x + dx, y - 1, c);
    P(s, x + dx, y + 0, !_eq(c, [250, 220, 90]) ? [250, 220, 120] : [240, 140, 60]);
  }
  return s;
}

export function _path(v: number): Surface {
  const s = new_(16, 16);
  s.fill([234, 210, 156]);
  const r = _rng(300 + v);
  for (let i = 0; i < 6; i++) {
    const x = r.randrange(15), y = r.randrange(15);
    P(s, x, y, [214, 186, 130]);
    P(s, x + 1, y, [214, 186, 130]);
  }
  for (let i = 0; i < 4; i++) {
    const px = r.randrange(16);
    const py = r.randrange(16);
    P(s, px, py, [246, 230, 190]);
  }
  return s;
}

export function _water(frame: number): Surface {
  const s = new_(16, 16);
  s.fill([96, 172, 232]);
  for (let i = 0; i < 3; i++) {
    const y = 3 + i * 5;
    const x = pg.mod(i * 5 + frame * 3, 16);
    for (let dx = 0; dx < 4; dx++) P(s, pg.mod(x + dx, 16), y, [176, 222, 252]);
    P(s, pg.mod(x + 6, 16), y + 2, [130, 196, 244]);
  }
  return s;
}

export function _water_edge(frame: number): Surface {
  const s = _water(frame).copy();
  R(s, [200, 232, 252], 0, 0, 16, 2);
  return s;
}

export function _tree(v = 0): Surface {
  const s = new_(16, 32);
  R(s, [140, 96, 60], 6, 20, 4, 10);
  P(s, 7, 22, [170, 120, 80]);
  pg.draw.ellipse(s, [66, 150, 82], [0, 2, 16, 20]);
  pg.draw.ellipse(s, [88, 180, 96], [2, 3, 12, 14]);
  pg.draw.ellipse(s, [120, 206, 112], [4, 4, 6, 6]);
  if (v === 1) {
    for (const p of [[5, 12], [10, 9], [8, 15]]) P(s, p[0], p[1], [240, 100, 110]);
  }
  R(s, [100, 170, 90], 3, 30, 10, 2);
  return outline(s);
}

export function _bush(): Surface {
  const s = new_(16, 16);
  pg.draw.ellipse(s, [70, 156, 84], [0, 4, 16, 12]);
  pg.draw.ellipse(s, [100, 186, 100], [2, 5, 10, 7]);
  P(s, 5, 7, [250, 250, 250]);
  P(s, 11, 9, [250, 150, 170]);
  return outline(s);
}

export function _fence(kind = "h"): Surface {
  const s = new_(16, 16);
  const wood = [226, 186, 130], dk = [176, 130, 86];
  if (kind === "h") {
    R(s, wood, 0, 7, 16, 2);
    R(s, wood, 0, 11, 16, 2);
    R(s, dk, 0, 9, 16, 1);
    for (const x of [1, 11]) {
      R(s, wood, x, 4, 3, 11);
      R(s, dk, x + 2, 5, 1, 10);
    }
  } else {
    R(s, wood, 6, 0, 3, 16);
    R(s, dk, 8, 0, 1, 16);
  }
  return outline(s);
}

// ---- extra floors/walls so every room looks different
export function _stripes(a: number[], b: number[]): Surface {
  const s = new_(16, 16);
  s.fill(a);
  for (const x of [2, 10]) R(s, b, x, 0, 4, 16);
  for (const y of [5, 13]) { P(s, 4, y, lighter(a, 0.6)); P(s, 12, y - 4, lighter(a, 0.6)); }
  return s;
}

export function _herringbone(a: number[], b: number[]): Surface {
  const s = new_(16, 16);
  s.fill(a);
  for (let i = 0; i < 16; i += 4) {
    for (let k = 0; k < 4; k++) {
      P(s, (i + k) % 16, k + (i % 8 === 0 ? 0 : 8), b);
      P(s, (i + 7 - k) % 16, k + (i % 8 === 0 ? 8 : 0) + 4, b);
    }
  }
  R(s, darker(a, 0.92), 0, 15, 16, 1);
  return s;
}

export function _planks(a: number[], b: number[]): Surface {
  const s = new_(16, 16);
  s.fill(a);
  // long boards: seams between rows, plus soft wood grain (no vertical joints, so it never looks like brick)
  for (const y of [0, 4, 8, 12]) R(s, b, 0, y, 16, 1);
  const g = lighter(a, 0.12);
  R(s, g, 2, 2, 5, 1); R(s, g, 9, 6, 6, 1); R(s, g, 1, 10, 4, 1); R(s, g, 11, 14, 4, 1);
  P(s, 13, 2, b); P(s, 5, 10, b);
  return s;
}

export function _bricks(a: number[], b: number[], mortar: number[]): Surface {
  const s = new_(16, 16);
  s.fill(mortar);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 4 : 0;
    for (let x = -off; x < 16; x += 8) R(s, row % 2 ? a : b, x + 1, row * 4 + 1, 7, 3);
  }
  return s;
}

export function _subway_wall(): Surface {
  const s = new_(16, 16);
  s.fill([240, 244, 236]);
  for (let y = 0; y < 16; y += 4) R(s, [214, 220, 210], 0, y, 16, 1);
  for (let x = 0; x < 16; x += 8) R(s, [214, 220, 210], x, 0, 1, 16);
  R(s, [60, 150, 70], 0, 12, 16, 2);
  R(s, [250, 210, 60], 0, 14, 16, 1);
  return s;
}

export function _cobble(): Surface {
  const s = new_(16, 16);
  s.fill([170, 160, 160]);
  const cs: number[][] = [[186, 176, 174], [160, 150, 150], [196, 186, 182]];
  let i = 0;
  for (let y = 0; y < 16; y += 4) {
    for (let x = (y / 4) % 2 ? -2 : 0; x < 16; x += 5) {
      R(s, cs[i++ % 3], x + 1, y + 1, 4, 3);
    }
  }
  return s;
}

export function _sidewalk(): Surface {
  const s = new_(16, 16);
  s.fill([222, 216, 206]);
  R(s, [200, 194, 184], 0, 0, 16, 1);
  R(s, [200, 194, 184], 0, 0, 1, 16);
  P(s, 9, 6, [206, 200, 190]);
  return s;
}

export function _crosswalk(): Surface {
  const s = _cobble();
  for (let y = 1; y < 16; y += 5) R(s, [250, 250, 246], 2, y, 12, 3);
  return s;
}

export function _road(): Surface {
  const s = new_(16, 16);
  s.fill([110, 108, 116]);
  P(s, 4, 3, [124, 122, 130]); P(s, 11, 9, [124, 122, 130]); P(s, 7, 13, [98, 96, 104]);
  return s;
}

export function _floor_wood(): Surface {
  const s = new_(16, 16);
  s.fill([220, 172, 116]);
  for (const y of [3, 7, 11, 15]) R(s, [196, 146, 96], 0, y, 16, 1);
  P(s, 6, 1, [196, 146, 96]);
  P(s, 12, 5, [196, 146, 96]);
  P(s, 3, 9, [196, 146, 96]);
  P(s, 9, 13, [196, 146, 96]);
  return s;
}

export function _floor_tile(a: number[] = [240, 244, 250], b: number[] = [214, 228, 244]): Surface {
  const s = new_(16, 16);
  s.fill(a);
  R(s, b, 0, 0, 8, 8);
  R(s, b, 8, 8, 8, 8);
  return s;
}

export function _wall(base: number[] = [250, 224, 206], dot: number[] = [240, 196, 180], trim: number[] = [186, 128, 96]): Surface {
  const s = new_(16, 16);
  s.fill(base);
  for (const [x, y] of [[3, 3], [11, 7], [3, 11], [11, 15]]) {
    P(s, x, y, dot);
    P(s, x + 1, y, dot);
  }
  return s;
}

export function _wall_trim(trim: number[] = [186, 128, 96]): Surface {
  const s = _wall().copy();
  R(s, trim, 0, 12, 16, 4);
  R(s, lighter(trim), 0, 12, 16, 1);
  return s;
}

export function tile(name: string, frame = 0): Surface {
  const fns: Record<string, () => Surface> = {
    "grass": () => _grass(0), "grass1": () => _grass(1), "grass2": () => _grass(2),
    "flowers": () => _flowers(frame, 0), "flowers1": () => _flowers(frame, 1),
    "path": () => _path(0), "path1": () => _path(1),
    "water": () => _water(frame), "water_edge": () => _water_edge(frame),
    "tree": () => _tree(0), "tree1": () => _tree(1), "bush": () => _bush(),
    "fence": () => _fence("h"), "fence_v": () => _fence("v"),
    "wood": () => _floor_wood(), "tilefloor": () => _floor_tile(),
    "storefloor": () => _floor_tile([236, 246, 226], [214, 236, 200]),
    "wall": () => _wall(), "wall_trim": () => _wall_trim(),
    "storewall": () => _wall([226, 240, 250], [200, 222, 240]),
    // new interiors
    "barwall": () => _wall([120, 64, 58], [104, 54, 50], [70, 40, 36]),
    "barfloor": () => _floor_tile([150, 104, 72], [128, 86, 60]),
    "cafewall": () => _wall([255, 236, 214], [248, 214, 196], [200, 140, 110]),
    "cafefloor": () => _floor_tile([252, 246, 236], [232, 220, 204]),
    "hqwall": () => _stripes([255, 228, 232], [250, 206, 216]),
    "herringbone": () => _herringbone([214, 160, 104], [190, 138, 88]),
    "planks": () => _planks([196, 150, 104], [170, 126, 84]),
    "darkplanks": () => _planks([120, 80, 58], [100, 64, 46]),
    "brickwall": () => _bricks([190, 96, 76], [160, 76, 60], [220, 200, 180]),
    "darkbrick": () => _bricks([110, 56, 50], [90, 44, 40], [70, 40, 36]),
    "presswall": () => _stripes([206, 226, 196], [190, 214, 180]),
    "pressfloor": () => _planks([236, 212, 172], [214, 188, 148]),
    "subwaywall": () => _subway_wall(),
    "subwayfloor": () => _floor_tile([210, 210, 214], [190, 190, 196]),
    "cobble": () => _cobble(),
    "sidewalk": () => _sidewalk(),
    "crosswalk": () => _crosswalk(),
    "road": () => _road(),
  };
  return cached(["tile", name, frame], fns[name]);
}

// =================================================================== BUILDINGS
export function _building(w: number, h: number, roof: number[], walls: number[],
                          sign: ((s: Surface) => void) | null = null, door_c: number[] = [150, 100, 70]): Surface {
  const s = new_(w, h);
  const roof_h = Math.floor(h / 2);
  // roof with shingles
  pg.draw.polygon(s, roof, [[2, roof_h], [8, 2], [w - 9, 2], [w - 3, roof_h]]);
  for (let y = 6; y < roof_h; y += 4) pg.draw.line(s, darker(roof), [4, y], [w - 5, y]);
  pg.draw.line(s, lighter(roof), [9, 3], [w - 10, 3]);
  // walls
  R(s, walls, 4, roof_h, w - 8, h - roof_h);
  R(s, darker(walls, 0.88), 4, roof_h, w - 8, 2);
  R(s, darker(walls, 0.8), 4, h - 3, w - 8, 3);
  // door
  const dx = Math.floor(w / 2) - 6;
  R(s, door_c, dx, h - 16, 12, 16);
  R(s, lighter(door_c), dx + 1, h - 15, 10, 1);
  P(s, dx + 9, h - 8, [250, 220, 120]);
  // windows
  for (const wx of [10, w - 22]) {
    R(s, [130, 200, 240], wx, roof_h + 5, 12, 9);
    R(s, [200, 236, 252], wx + 1, roof_h + 6, 4, 3);
    R(s, WHITE, wx + 5, roof_h + 5, 1, 9);
    R(s, darker(walls, 0.7), wx - 1, roof_h + 14, 14, 2);
  }
  if (sign) sign(s);
  return outline(s);
}

export function building(name: string): Surface {
  const clinic = () => {
    const sign = (s: Surface) => {
      R(s, WHITE, 32, 8, 16, 14);
      R(s, [240, 110, 130], 38, 10, 4, 10);
      R(s, [240, 110, 130], 35, 13, 10, 4);
      pg.draw.rect(s, [200, 70, 100], [32, 8, 16, 14], 1);
    };
    return _building(80, 60, [120, 206, 196], [250, 248, 240], sign, [120, 170, 220]);
  };

  const hq = () => {
    const sign = (s: Surface) => {
      R(s, [250, 240, 200], 25, 10, 14, 8);
      s.blit(font.render("146", [180, 90, 110]), [27, 12]);
    };
    return _building(64, 56, [240, 140, 150], [236, 210, 170], sign, [170, 110, 80]);
  };

  const store = () => {
    const sign = (s: Surface) => {
      R(s, [250, 250, 230], 20, 8, 32, 10);
      s.blit(font.render("SHOP", [90, 140, 80]), [28, 11]);
      for (let i = 0; i < 9; i++) R(s, i % 2 ? [250, 250, 250] : [240, 120, 100], 6 + i * 7, 28, 7, 4);
    };
    return _building(72, 56, [240, 190, 90], [248, 236, 220], sign, [110, 160, 110]);
  };

  const bar = () => {
    const sign = (s: Surface) => {
      R(s, [40, 30, 40], 18, 7, 44, 12);
      s.blit(font.render("CLERY'S", [120, 240, 170]), [24, 10]);
      R(s, [240, 200, 90], 18, 19, 44, 1);
      // little lanterns
      for (const x of [9, 68]) {
        R(s, [60, 50, 50], x, 20, 3, 1);
        R(s, [255, 210, 120], x, 21, 3, 3);
      }
    };
    return _building(80, 56, [70, 90, 80], [150, 82, 66], sign, [60, 110, 80]);
  };

  const cafe = () => {
    const sign = (s: Surface) => {
      R(s, [255, 250, 236], 12, 8, 40, 10);
      s.blit(font.render("PRESSED", [90, 140, 80]), [17, 11]);
      for (let i = 0; i < 8; i++) R(s, i % 2 ? [255, 255, 255] : [120, 190, 200], 6 + i * 7, 27, 7, 4);
      // coffee cup
      R(s, [255, 255, 255], 49, 9, 6, 6);
      R(s, [150, 100, 70], 50, 10, 4, 2);
      P(s, 55, 11, [255, 255, 255]);
    };
    return _building(64, 56, [120, 170, 110], [255, 240, 220], sign, [110, 150, 90]);
  };

  const subway = () => {
    const sign = (s: Surface) => {
      R(s, [60, 150, 70], 10, 7, 44, 12);
      s.blit(font.render("SUBWAY", [250, 220, 70]), [20, 10]);
      R(s, [250, 210, 60], 10, 19, 44, 1);
      for (let i = 0; i < 8; i++) R(s, i % 2 ? [250, 210, 60] : [60, 150, 70], 6 + i * 7, 27, 7, 3);
    };
    return _building(64, 56, [70, 120, 80], [240, 236, 220], sign, [60, 130, 70]);
  };

  const house = (roof: number[], walls: number[], door: number[]) => () => {
    const sign = (s: Surface) => {
      // chimney + flower boxes
      R(s, darker(walls, 0.7), 34, 2, 6, 8);
      R(s, [200, 120, 90], 9, 35, 14, 2);
      R(s, [200, 120, 90], 25, 35, 14, 2);
      for (const x of [10, 14, 18, 26, 30, 34]) P(s, x, 34, x % 8 ? [240, 120, 150] : [250, 220, 90]);
    };
    return _building(48, 48, roof, walls, sign, door);
  };

  const wildclinic = () => {
    const sign = (s: Surface) => {
      R(s, [255, 240, 200], 22, 8, 44, 12);
      s.blit(font.render("WILDSIDE", [170, 60, 40]), [27, 11]);
      R(s, [52, 38, 64], 22, 17, 44, 1);
      // claw marks
      for (const x of [12, 16, 20]) pg.draw.line(s, [90, 50, 40], [x, 30], [x - 3, 40]);
      for (const x of [70, 74, 78]) pg.draw.line(s, [90, 50, 40], [x, 30], [x - 3, 40]);
      // warning stripes
      for (let i = 0; i < 6; i++) R(s, i % 2 ? [52, 38, 64] : [250, 200, 60], 4 + i * 4, 60, 4, 2);
    };
    return _building(88, 64, [120, 80, 60], [196, 96, 74], sign, [110, 80, 60]);
  };

  const fns: Record<string, () => Surface> = {
    "clinic": clinic, "hq": hq, "store": store, bar, cafe, wildclinic, subway,
    house1: house([120, 150, 220], [250, 240, 220], [120, 90, 160]),
    house2: house([230, 160, 90], [240, 230, 250], [80, 140, 120]),
    house3: house([150, 200, 140], [255, 236, 210], [200, 90, 90]),
    house4: house([200, 110, 140], [236, 244, 250], [90, 110, 170]),
    house5: house([170, 140, 110], [250, 224, 200], [140, 100, 70]),
    house6: house([110, 170, 180], [255, 246, 232], [200, 140, 70]),
  };


  return cached(["building", name], fns[name]);
}

// =================================================================== OBJECTS / FURNITURE
export function obj(name: string): Surface {
  const bed = () => {
    const s = new_(16, 32);
    R(s, [176, 120, 80], 0, 0, 16, 32);
    R(s, [250, 250, 252], 2, 2, 12, 7);
    R(s, [246, 150, 180], 1, 10, 14, 20);
    R(s, [250, 190, 210], 1, 10, 14, 2);
    for (const y of [15, 21, 27]) R(s, [230, 120, 160], 3, y, 10, 1);
    return outline(s);
  };

  const mirror = () => {
    const s = new_(16, 24);
    pg.draw.ellipse(s, [226, 180, 80], [1, 0, 14, 22]);
    pg.draw.ellipse(s, [190, 226, 246], [3, 2, 10, 18]);
    R(s, WHITE, 5, 5, 1, 5);
    R(s, WHITE, 6, 4, 1, 2);
    R(s, [176, 130, 60], 5, 22, 6, 2);
    return outline(s);
  };

  const shelf = () => {
    const s = new_(40, 24);
    R(s, [180, 126, 84], 0, 10, 40, 3);
    R(s, [180, 126, 84], 0, 21, 40, 3);
    R(s, [150, 100, 66], 0, 12, 40, 1);
    R(s, [150, 100, 66], 0, 23, 40, 1);
    R(s, [150, 100, 66], 1, 13, 2, 8);
    R(s, [150, 100, 66], 37, 13, 2, 8);
    return outline(s);
  };

  const laptop = () => {
    const s = new_(16, 20);
    R(s, [190, 140, 96], 0, 8, 16, 4);
    R(s, [150, 104, 70], 1, 12, 2, 8);
    R(s, [150, 104, 70], 13, 12, 2, 8);
    R(s, [90, 90, 110], 3, 1, 10, 7);
    R(s, [140, 220, 200], 4, 2, 8, 5);
    R(s, [250, 240, 120], 5, 3, 2, 2);
    R(s, [120, 120, 140], 2, 7, 12, 1);
    return outline(s);
  };

  const planner = () => {
    const s = new_(16, 20);
    R(s, [190, 140, 96], 0, 8, 16, 4);
    R(s, [150, 104, 70], 1, 12, 2, 8);
    R(s, [150, 104, 70], 13, 12, 2, 8);
    R(s, [120, 170, 230], 3, 3, 8, 5);
    R(s, [250, 250, 250], 4, 4, 6, 3);
    R(s, [240, 120, 120], 10, 1, 3, 7);
    R(s, [250, 220, 120], 10, 0, 3, 1);
    return outline(s);
  };

  const counter = () => {
    const s = new_(64, 20);
    R(s, [200, 150, 100], 0, 4, 64, 16);
    R(s, [230, 190, 140], 0, 2, 64, 4);
    R(s, [170, 120, 80], 0, 10, 64, 1);
    R(s, [250, 220, 120], 44, 0, 8, 3);
    return outline(s);
  };

  const store_shelf = () => {
    const s = new_(32, 28);
    R(s, [190, 140, 96], 0, 0, 32, 28);
    const cols = [[240, 120, 120], [120, 180, 240], [250, 220, 120], [140, 210, 140], [220, 160, 240]];
    const r = _rng(7);
    for (const y of [2, 11, 20]) {
      R(s, [150, 100, 66], 0, y + 7, 32, 2);
      let x = 2;
      while (x < 28) {
        const w = r.randrange(3, 6);
        const c = cols[r.randrange(cols.length)];
        const yy = y + r.randrange(0, 3);
        R(s, c, x, yy, w, 7 - (y === 20 ? 1 : 0));
        x += w + 1;
      }
    }
    return outline(s);
  };

  const kennel = () => {
    const s = new_(40, 30);
    R(s, [226, 232, 240], 0, 0, 40, 30);
    R(s, [190, 200, 214], 2, 2, 36, 26);
    R(s, [250, 236, 210], 2, 20, 36, 8);
    return outline(s);
  };

  const bars = () => {
    const s = new_(40, 30);
    for (let x = 4; x < 38; x += 5) R(s, [150, 160, 180], x, 2, 1, 26);
    R(s, [150, 160, 180], 2, 2, 36, 1);
    return s;
  };

  const desk = () => {
    const s = new_(48, 28);
    R(s, [130, 190, 220], 0, 8, 48, 20);
    R(s, [190, 230, 246], 0, 6, 48, 4);
    R(s, [100, 160, 200], 0, 16, 48, 1);
    R(s, WHITE, 18, 12, 12, 8);
    R(s, [240, 110, 130], 23, 13, 2, 6);
    R(s, [240, 110, 130], 21, 15, 6, 2);
    R(s, [250, 220, 120], 36, 2, 6, 4);
    return outline(s);
  };

  const chair = () => {
    const s = new_(16, 16);
    R(s, [240, 160, 120], 2, 0, 12, 8);
    R(s, [250, 190, 150], 1, 8, 14, 4);
    R(s, [150, 100, 70], 2, 12, 2, 4);
    R(s, [150, 100, 70], 12, 12, 2, 4);
    return outline(s);
  };

  const comfy_chair = () => {
    const s = new_(16, 16);
    R(s, [180, 140, 230], 1, 0, 14, 9);
    R(s, [210, 180, 250], 0, 8, 16, 5);
    R(s, [150, 110, 200], 0, 3, 2, 10);
    R(s, [150, 110, 200], 14, 3, 2, 10);
    R(s, [110, 80, 60], 2, 13, 2, 3);
    R(s, [110, 80, 60], 12, 13, 2, 3);
    return outline(s);
  };

  const cart = () => {
    const s = new_(20, 14);
    R(s, [120, 130, 150], 1, 2, 18, 7);
    R(s, [160, 170, 190], 1, 2, 18, 2);
    pg.draw.circle(s, [60, 60, 70], [5, 11], 2);
    pg.draw.circle(s, [60, 60, 70], [15, 11], 2);
    R(s, [120, 130, 150], 18, 0, 2, 4);
    return outline(s);
  };

  const table = () => {
    const s = new_(96, 30);
    R(s, [200, 210, 226], 0, 6, 96, 10);
    R(s, [236, 242, 250], 0, 4, 96, 4);
    R(s, [150, 160, 180], 8, 16, 6, 14);
    R(s, [150, 160, 180], 82, 16, 6, 14);
    return outline(s);
  };

  const tub = () => {
    const s = new_(110, 40);
    pg.draw.ellipse(s, [226, 240, 252], [0, 0, 110, 40]);
    pg.draw.ellipse(s, [150, 206, 240], [6, 4, 98, 22]);
    R(s, [200, 220, 240], 4, 30, 102, 4);
    return outline(s);
  };

  const doormat = () => {
    const s = new_(32, 10);
    R(s, [200, 110, 90], 0, 0, 32, 10);
    R(s, [230, 150, 120], 2, 2, 28, 6);
    return s;
  };

  const fns: Record<string, () => Surface> = {
    bed, mirror, shelf, laptop, planner, counter,
    store_shelf, kennel, bars, desk, chair,
    comfy_chair, cart, table, tub, doormat,
  };
  return cached(["obj", name], fns[name]);
}

// =================================================================== DECOR
export function _decor(name: string): Surface {
  const [w, h] = data.DECOR[name]["size"];
  const W = w * 16, H = h * 16;
  const extras: Record<string, number> = { "lamp": 10, "bookshelf": 10, "cattree": 14, "fishtank": 6, "sofa": 6, "starlamp": 10, "plant": 4 };
  const extra = extras[name] ?? 0;
  const s = new_(W, H + extra);
  const b = extra; // baseline offset
  if (name === "plant") {
    R(s, [210, 120, 90], 4, b + 9, 8, 7);
    R(s, [230, 150, 110], 3, b + 8, 10, 2);
    for (const [x, y, ww, hh] of [[2, b - 2, 6, 10], [8, b - 3, 6, 11], [5, b - 4, 6, 9]]) {
      pg.draw.ellipse(s, [90, 180, 100], [x, y, ww, hh]);
    }
    P(s, 7, b - 1, [150, 220, 140]);
  } else if (name === "rug") {
    pg.draw.ellipse(s, [240, 160, 170], [0, 4, 32, 26]);
    pg.draw.ellipse(s, [250, 210, 160], [5, 8, 22, 18]);
    pg.draw.ellipse(s, [180, 210, 250], [10, 12, 12, 10]);
    return s;
  } else if (name === "lamp") {
    R(s, [120, 100, 90], 7, 8, 2, H + extra - 10);
    R(s, [120, 100, 90], 4, H + extra - 2, 8, 2);
    pg.draw.polygon(s, [250, 220, 150], [[3, 9], [13, 9], [11, 1], [5, 1]]);
    R(s, [255, 245, 200], 5, 9, 6, 1);
  } else if (name === "bookshelf") {
    R(s, [170, 116, 76], 0, 0, 32, H + extra);
    const cols = [[220, 90, 90], [90, 140, 220], [240, 200, 90], [110, 190, 120], [190, 120, 220]];
    [2, 10, 18].forEach((y, i) => {
      R(s, [130, 86, 56], 1, y + 7, 30, 1);
      for (let j = 0; j < 7; j++) R(s, cols[(i + j) % 5], 2 + j * 4, y + (j % 2), 3, 7 - (j % 2));
    });
  } else if (name === "beanbag") {
    pg.draw.ellipse(s, [120, 200, 210], [0, 3, 16, 13]);
    pg.draw.ellipse(s, [160, 226, 230], [3, 4, 8, 5]);
  } else if (name === "cattree") {
    R(s, [220, 200, 170], 6, 4, 4, H + extra - 6);
    R(s, [190, 140, 110], 1, 2, 14, 4);
    R(s, [190, 140, 110], 0, 14, 10, 4);
    R(s, [190, 140, 110], 2, H + extra - 3, 12, 3);
    pg.draw.circle(s, [240, 120, 140], [13, 12], 2);
  } else if (name === "fishtank") {
    R(s, [150, 110, 80], 0, H + extra - 6, 32, 6);
    R(s, [150, 210, 246], 1, 2, 30, H + extra - 8);
    R(s, [230, 220, 160], 1, H + extra - 9, 30, 3);
    R(s, [250, 150, 60], 8, 8, 4, 3);
    R(s, [250, 230, 90], 20, 12, 4, 2);
    R(s, [90, 180, 100], 26, 6, 2, 10);
    P(s, 15, 5, WHITE);
    P(s, 16, 8, WHITE);
  } else if (name === "sofa") {
    R(s, [230, 120, 110], 0, 0, 32, 14);
    R(s, [250, 160, 140], 2, 10, 28, 8);
    R(s, [210, 100, 96], 0, 6, 3, 14);
    R(s, [210, 100, 96], 29, 6, 3, 14);
    R(s, [120, 80, 60], 2, H + extra - 2, 3, 2);
    R(s, [120, 80, 60], 27, H + extra - 2, 3, 2);
  } else if (name === "poster") {
    R(s, [252, 248, 236], 2, 0, 12, 14);
    pg.draw.circle(s, [240, 130, 150], [8, 8], 3);
    for (const p of [[5, 4], [8, 3], [11, 4]]) P(s, p[0], p[1], [240, 130, 150]);
    return outline(s);
  } else if (name === "starlamp") {
    R(s, [90, 90, 140], 7, 9, 2, H + extra - 10);
    R(s, [90, 90, 140], 4, H + extra - 2, 8, 2);
    pg.draw.polygon(s, [255, 230, 110], [[8, 0], [10, 4], [15, 4], [11, 7], [13, 11], [8, 8], [3, 11], [5, 7], [1, 4], [6, 4]]);
  }
  return outline(s);
}

export function decor(name: string, rot = 0): Surface {
  const mk = () => {
    const base = _decor(name);
    if (pg.mod(rot, 2) === 1) return pg.transform.flip(base, true, false);
    return base;
  };
  return cached(["decor", name, pg.mod(rot, 2)], mk);
}

// =================================================================== ICONS (12x12)
const STAR_PTS = [[6, 0], [8, 4], [12, 4], [9, 7], [10, 11], [6, 9], [2, 11], [3, 7], [0, 4], [4, 4]];

export function icon(name: string, color: number[] | null = null): Surface {
  const mk = () => {
    const s = new_(12, 12);
    if (name === "steth" || name === "steth_gold") {
      const c = name === "steth_gold" ? [240, 200, 80] : [120, 130, 160];
      pg.draw.arc(s, c, [1, 0, 8, 9], 3.14, 6.28, 2);
      R(s, c, 1, 0, 2, 5);
      R(s, c, 7, 0, 2, 5);
      R(s, c, 2, 5, 6, 2);
      R(s, c, 4, 6, 2, 3);
      pg.draw.circle(s, [200, 210, 230], [8, 9], 3);
      pg.draw.circle(s, c, [8, 9], 1);
    } else if (name === "thermo") {
      R(s, [240, 240, 250], 5, 0, 3, 9);
      R(s, [230, 70, 80], 6, 4, 1, 6);
      pg.draw.circle(s, [230, 70, 80], [6, 9], 2);
    } else if (name === "mag") {
      pg.draw.circle(s, [180, 140, 90], [5, 5], 4);
      pg.draw.circle(s, [190, 230, 250], [5, 5], 3);
      P(s, 4, 3, WHITE);
      pg.draw.line(s, [150, 100, 66], [8, 8], [11, 11], 2);
    } else if (name === "comb") {
      R(s, [240, 150, 180], 1, 2, 10, 3);
      for (let x = 1; x < 11; x += 2) R(s, [240, 150, 180], x, 5, 1, 5);
    } else if (name === "sponge") {
      R(s, [250, 220, 90], 1, 3, 10, 7);
      R(s, [120, 200, 120], 1, 2, 10, 2);
      for (const p of [[3, 6], [7, 5], [8, 8]]) P(s, p[0], p[1], [220, 180, 60]);
    } else if (name === "syringe") {
      R(s, [230, 240, 250], 2, 4, 7, 4);
      R(s, [130, 210, 240], 3, 5, 4, 2);
      R(s, [150, 150, 170], 9, 5, 3, 2);
      R(s, [150, 150, 170], 0, 3, 2, 6);
    } else if (name === "bandage") {
      pg.draw.circle(s, [250, 246, 236], [6, 6], 5);
      pg.draw.circle(s, [220, 210, 190], [6, 6], 2);
      R(s, [250, 246, 236], 6, 9, 6, 3);
    } else if (name === "shears") {
      pg.draw.circle(s, [240, 120, 120], [3, 9], 2);
      pg.draw.circle(s, [240, 120, 120], [8, 9], 2);
      pg.draw.line(s, [180, 190, 210], [3, 7], [9, 0], 2);
      pg.draw.line(s, [180, 190, 210], [8, 7], [2, 0], 2);
    } else if (name === "scoop") {
      pg.draw.ellipse(s, [120, 190, 240], [0, 3, 8, 7]);
      R(s, [90, 150, 200], 7, 5, 5, 2);
    } else if (name === "kennel") {
      R(s, [200, 210, 226], 0, 2, 12, 10);
      for (let x = 2; x < 11; x += 3) R(s, [130, 140, 160], x, 3, 1, 8);
    } else if (name === "chair") {
      R(s, [180, 140, 230], 2, 0, 8, 6);
      R(s, [210, 180, 250], 1, 6, 10, 3);
      R(s, [110, 80, 60], 2, 9, 2, 3);
      R(s, [110, 80, 60], 8, 9, 2, 3);
    } else if (name === "desk") {
      R(s, [130, 190, 220], 0, 4, 12, 8);
      R(s, [190, 230, 246], 0, 3, 12, 2);
      R(s, [250, 220, 120], 8, 0, 3, 3);
    } else if (name === "table") {
      R(s, [236, 242, 250], 0, 3, 12, 3);
      R(s, [150, 160, 180], 1, 6, 2, 6);
      R(s, [150, 160, 180], 9, 6, 2, 6);
    } else if (name === "petbed") {
      pg.draw.ellipse(s, [240, 150, 120], [0, 4, 12, 8]);
      pg.draw.ellipse(s, [250, 220, 190], [2, 5, 8, 5]);
    } else if (name === "outfit") {
      const c = color || [140, 196, 240];
      R(s, c, 2, 2, 8, 10);
      R(s, c, 0, 2, 2, 5);
      R(s, c, 10, 2, 2, 5);
      R(s, darker(c), 5, 2, 2, 3);
    } else if (name === "ball") {
      pg.draw.circle(s, [240, 90, 100], [6, 6], 5);
      pg.draw.line(s, [250, 230, 120], [1, 6], [11, 6], 1);
      P(s, 4, 3, WHITE);
    } else if (name === "feather") {
      pg.draw.line(s, [150, 100, 70], [2, 11], [6, 6], 1);
      pg.draw.ellipse(s, [130, 200, 240], [5, 0, 5, 8]);
      pg.draw.ellipse(s, [240, 150, 200], [6, 1, 3, 5]);
    } else if (name === "biscuit") {
      R(s, [220, 170, 100], 3, 4, 6, 4);
      pg.draw.circle(s, [220, 170, 100], [3, 4], 2);
      pg.draw.circle(s, [220, 170, 100], [3, 8], 2);
      pg.draw.circle(s, [220, 170, 100], [9, 4], 2);
      pg.draw.circle(s, [220, 170, 100], [9, 8], 2);
    } else if (name === "deluxe") {
      pg.draw.circle(s, [200, 110, 80], [6, 7], 4);
      R(s, [250, 250, 250], 3, 3, 6, 2);
      P(s, 6, 1, [240, 80, 90]);
    } else if (name === "can") {
      R(s, [200, 210, 226], 2, 2, 8, 9);
      R(s, [240, 150, 120], 2, 4, 8, 5);
      R(s, [250, 250, 250], 4, 5, 4, 3);
    } else if (name === "pill") {
      R(s, [250, 250, 250], 2, 4, 4, 4);
      R(s, [240, 110, 130], 6, 4, 4, 4);
      pg.draw.circle(s, [250, 250, 250], [2, 6], 2);
      pg.draw.circle(s, [240, 110, 130], [9, 6], 2);
    } else if (name === "treat") {
      pg.draw.circle(s, [200, 130, 90], [6, 6], 5);
      pg.draw.circle(s, [230, 170, 120], [5, 5], 2);
    } else if (name === "pilltreat") {
      pg.draw.circle(s, [200, 130, 90], [6, 6], 5);
      pg.draw.circle(s, [230, 170, 120], [5, 5], 2);
      P(s, 7, 7, [240, 110, 130]);
      P(s, 8, 7, [250, 250, 250]);
    } else if (name === "towel") {
      R(s, [250, 180, 200], 1, 1, 10, 10);
      R(s, [250, 220, 230], 1, 3, 10, 2);
      R(s, [250, 220, 230], 1, 8, 10, 1);
    } else if (name === "shower") {
      R(s, [180, 190, 210], 1, 1, 7, 3);
      R(s, [180, 190, 210], 7, 1, 2, 9);
      for (const x of [1, 3, 5]) {
        P(s, x, 6, [120, 200, 250]);
        P(s, x + 1, 9, [120, 200, 250]);
      }
    } else if (name === "brush") {
      R(s, [180, 120, 80], 0, 5, 7, 3);
      R(s, [240, 220, 180], 7, 3, 4, 7);
      for (const y of [3, 5, 7, 9]) P(s, 11, y, [200, 180, 140]);
    } else if (name === "coin") {
      pg.draw.circle(s, [250, 210, 80], [6, 6], 5);
      pg.draw.circle(s, [255, 236, 140], [6, 6], 3);
      R(s, [220, 160, 40], 5, 4, 2, 5);
    } else if (name === "heart") {
      pg.draw.circle(s, [240, 80, 110], [4, 4], 3);
      pg.draw.circle(s, [240, 80, 110], [8, 4], 3);
      pg.draw.polygon(s, [240, 80, 110], [[1, 5], [11, 5], [6, 11]]);
      P(s, 3, 3, [255, 200, 210]);
    } else if (name === "heart_empty") {
      pg.draw.circle(s, [150, 130, 150], [4, 4], 3);
      pg.draw.circle(s, [150, 130, 150], [8, 4], 3);
      pg.draw.polygon(s, [150, 130, 150], [[1, 5], [11, 5], [6, 11]]);
    } else if (name === "star") {
      pg.draw.polygon(s, color || [250, 210, 70], STAR_PTS);
    } else if (name === "star_empty") {
      pg.draw.polygon(s, [170, 160, 180], STAR_PTS);
    } else if (name === "bag") {
      const c = color || [176, 110, 60];
      R(s, [240, 230, 210], 2, 1, 8, 11);
      R(s, c, 2, 4, 8, 5);
      R(s, [210, 200, 180], 2, 1, 8, 1);
    } else if (name === "lock") {
      R(s, [150, 150, 170], 2, 5, 8, 7);
      pg.draw.rect(s, [150, 150, 170], [3, 1, 6, 6], 1);
    } else if (name === "check") {
      pg.draw.line(s, [80, 190, 100], [1, 6], [4, 9], 2);
      pg.draw.line(s, [80, 190, 100], [4, 9], [10, 2], 2);
    } else if (name === "regular") {
      pg.draw.circle(s, [250, 210, 80], [6, 6], 5);
      s.blit(font.render("R", [150, 90, 30]), [5, 4]);
    }
    return outline(s);
  };
  return cached(["icon", name, color ?? null], mk);
}

export function big_icon(name: string, factor = 2, color: number[] | null = null): Surface {
  return scaled(["bigicon", name, color ?? null], icon(name, color), factor);
}

export function decor_icon(name: string): Surface {
  const mk = () => {
    const d = decor(name);
    const [w, h] = d.get_size();
    const f = Math.min(12 / w, 12 / h);
    return pg.transform.scale(d, [Math.max(1, Math.trunc(w * f)), Math.max(1, Math.trunc(h * f))]);
  };
  return cached(["decor_icon", name], mk);
}

export function item_icon(item_id: string): Surface {
  const it = data.STORE_ITEMS[item_id];
  if (it["kind"] === "decor") return decor_icon(it["decor"]);
  if (it["kind"] === "outfit") return icon("outfit", data.OUTFITS[it["outfit"]]["scrub"]);
  return icon(it["icon"]);
}

// =================================================================== BADGES (16x16)
export function badge(key: string, locked = false): Surface {
  const mk = () => {
    const b = data.BADGES[key];
    const c1 = b["c1"], c2 = b["c2"];
    const s = new_(16, 16);
    const sh = b["shape"];
    if (sh === "circle") {
      pg.draw.circle(s, c2, [8, 8], 7);
      pg.draw.circle(s, c1, [8, 8], 5);
      R(s, c2, 7, 4, 2, 8);
    } else if (sh === "leaf") {
      pg.draw.ellipse(s, c1, [2, 1, 12, 14]);
      pg.draw.line(s, c2, [8, 2], [8, 14], 1);
      pg.draw.line(s, c2, [8, 7], [5, 5], 1);
      pg.draw.line(s, c2, [8, 10], [11, 8], 1);
    } else if (sh === "sun") {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        pg.draw.line(s, c2, [8, 8], [8 + Math.trunc(7 * Math.cos(a)), 8 + Math.trunc(7 * Math.sin(a))], 2);
      }
      pg.draw.circle(s, c1, [8, 8], 4);
    } else if (sh === "drop") {
      pg.draw.circle(s, c1, [8, 10], 5);
      pg.draw.polygon(s, c1, [[3, 9], [13, 9], [8, 1]]);
      P(s, 6, 9, WHITE);
    } else if (sh === "bolt") {
      pg.draw.polygon(s, c1, [[9, 0], [3, 9], [8, 9], [6, 15], [13, 6], [8, 6], [10, 0]]);
    } else if (sh === "diamond") {
      pg.draw.polygon(s, c1, [[8, 1], [15, 7], [8, 15], [1, 7]]);
      pg.draw.polygon(s, c2, [[8, 1], [15, 7], [8, 7]]);
    } else if (sh === "moon") {
      pg.draw.circle(s, c1, [8, 8], 7);
      pg.draw.circle(s, [0, 0, 0, 0], [11, 6], 6);
      P(s, 12, 11, [255, 240, 150]);
      P(s, 13, 3, [255, 240, 150]);
    } else if (sh === "house") {
      pg.draw.polygon(s, c2, [[1, 7], [8, 1], [15, 7]]);
      R(s, c1, 3, 7, 10, 8);
      R(s, c2, 7, 10, 3, 5);
    }
    let out = outline(s);
    if (locked) out = silhouette(out, [150, 140, 160]);
    else if (out.get_at([5, 4])[3]) out.set_at([5, 4], WHITE);
    return out;
  };
  return cached(["badge", key, !!locked], mk);
}
