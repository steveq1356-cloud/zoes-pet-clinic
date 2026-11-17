/* Tiny original 3x5-ish bitmap pixel font rendered in code (uppercase). */
import { Surface, SRCALPHA, transform, Color } from "./pg";

const _G: Record<string, string[]> = {
  A: [".#.", "#.#", "###", "#.#", "#.#"], B: ["##.", "#.#", "##.", "#.#", "##."],
  C: [".##", "#..", "#..", "#..", ".##"], D: ["##.", "#.#", "#.#", "#.#", "##."],
  E: ["###", "#..", "##.", "#..", "###"], F: ["###", "#..", "##.", "#..", "#.."],
  G: [".##", "#..", "#.#", "#.#", ".##"], H: ["#.#", "#.#", "###", "#.#", "#.#"],
  I: ["###", ".#.", ".#.", ".#.", "###"], J: ["..#", "..#", "..#", "#.#", ".#."],
  K: ["#.#", "#.#", "##.", "#.#", "#.#"], L: ["#..", "#..", "#..", "#..", "###"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"], N: ["#..#", "##.#", "#.##", "#..#", "#..#"],
  O: [".#.", "#.#", "#.#", "#.#", ".#."], P: ["##.", "#.#", "##.", "#..", "#.."],
  Q: [".#.", "#.#", "#.#", "##.", ".##"], R: ["##.", "#.#", "##.", "#.#", "#.#"],
  S: [".##", "#..", ".#.", "..#", "##."], T: ["###", ".#.", ".#.", ".#.", ".#."],
  U: ["#.#", "#.#", "#.#", "#.#", "###"], V: ["#.#", "#.#", "#.#", "#.#", ".#."],
  W: ["#...#", "#...#", "#.#.#", "##.##", "#...#"], X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
  Y: ["#.#", "#.#", ".#.", ".#.", ".#."], Z: ["###", "..#", ".#.", "#..", "###"],
  "0": ["###", "#.#", "#.#", "#.#", "###"], "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["##.", "..#", ".#.", "#..", "###"], "3": ["##.", "..#", ".#.", "..#", "##."],
  "4": ["#.#", "#.#", "###", "..#", "..#"], "5": ["###", "#..", "##.", "..#", "##."],
  "6": [".##", "#..", "###", "#.#", "###"], "7": ["###", "..#", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "###", "#.#", "###"], "9": ["###", "#.#", "###", "..#", "##."],
  " ": ["..", "..", "..", "..", ".."], ".": [".", ".", ".", ".", "#"], ",": [".", ".", ".", "#", "#"],
  "!": ["#", "#", "#", ".", "#"], "?": ["##.", "..#", ".#.", "...", ".#."], "'": ["#", "#", ".", ".", "."],
  '"': ["#.#", "#.#", "...", "...", "..."], ":": [".", "#", ".", "#", "."], ";": [".", "#", ".", "#", "#"],
  "-": ["...", "...", "###", "...", "..."], "+": ["...", ".#.", "###", ".#.", "..."],
  "/": ["..#", "..#", ".#.", "#..", "#.."], "(": [".#", "#.", "#.", "#.", ".#"], ")": ["#.", ".#", ".#", ".#", "#."],
  "%": ["#.#", "..#", ".#.", "#..", "#.#"], "*": ["...", "#.#", ".#.", "#.#", "..."],
  "#": ["#.#", "###", "#.#", "###", "#.#"], "&": [".#.", "#.#", ".#.", "#.#", ".##"],
  "=": ["...", "###", "...", "###", "..."], "<": ["..#", ".#.", "#..", ".#.", "..#"],
  ">": ["#..", ".#.", "..#", ".#.", "#.."], _: ["...", "...", "...", "...", "###"],
  $: [".##", "##.", ".#.", ".##", "##."], "[": ["##", "#.", "#.", "#.", "##"], "]": ["##", ".#", ".#", ".#", "##"],
  "~": [".#.#.", "#####", "#####", ".###.", "..#.."], // heart
  "^": ["..#..", ".###.", "#####", ".###.", "#...#"], // star
  "@": ["##", "##", "..", "..", ".."], // degree-ish
  "{": [".....", ".#...", "#####", ".#...", "....."], // left arrow
  "}": [".....", "...#.", "#####", "...#.", "....."], // right arrow
  "|": [".#.", "###", ".#.", ".#.", ".#."], // up arrow
  "`": [".#.", ".#.", ".#.", "###", ".#."], // down arrow
  "✓": ["....#", "...#.", "#.#..", ".#...", "....."], // check mark
};

export const HEART = "~";
export const STAR = "^";
export const LINE_H = 7;
const _cache = new Map<string, Surface>();

function _char(c: string): string[] {
  if (c in _G) return _G[c];
  const u = c.toUpperCase();
  return _G[u] || _G["?"];
}

export function text_width(text: string, scale = 1): number {
  if (!text) return 0;
  let w = 0;
  for (const c of text) w += _char(c)[0].length + 1;
  return (w - 1) * scale;
}

export function render(text: string, color: Color = [40, 32, 56], scale = 1, shadow: Color | null = null): Surface {
  text = String(text);
  const key = text + "|" + color.join(",") + "|" + scale + "|" + (shadow ? shadow.join(",") : "");
  const hit = _cache.get(key);
  if (hit) return hit;
  const w = Math.max(1, text_width(text, 1));
  const off = shadow ? 1 : 0;
  let surf = new Surface([w + off, 5 + off], SRCALPHA);
  const layers: [Color, number][] = shadow ? [[shadow, 1]] : [];
  layers.push([color, 0]);
  for (const [col, o] of layers) {
    let x = 0;
    for (const c of text) {
      const g = _char(c);
      for (let gy = 0; gy < g.length; gy++) {
        const row = g[gy];
        for (let gx = 0; gx < row.length; gx++) {
          if (row[gx] === "#") surf.set_at([x + gx + o, gy + o], col);
        }
      }
      x += g[0].length + 1;
    }
  }
  if (scale !== 1) surf = transform.scale(surf, [surf.w * scale, surf.h * scale]);
  if (_cache.size > 3000) _cache.clear();
  _cache.set(key, surf);
  return surf;
}

export function draw(
  surf: Surface, text: string, pos: number[], color: Color = [40, 32, 56], scale = 1,
  shadow: Color | null = null, align: "left" | "center" | "right" = "left",
): number {
  const img = render(text, color, scale, shadow);
  let x = pos[0];
  const y = pos[1];
  if (align === "center") x -= Math.floor(img.w / 2);
  else if (align === "right") x -= img.w;
  surf.blit(img, [Math.trunc(x), Math.trunc(y)]);
  return img.w;
}

export function wrap(text: string, max_w: number, scale = 1): string[] {
  const lines: string[] = [];
  for (const para of String(text).split("\n")) {
    let cur = "";
    for (const word of para.split(" ")) {
      const t = !cur ? word : cur + " " + word;
      if (text_width(t, scale) <= max_w || !cur) cur = t;
      else {
        lines.push(cur);
        cur = word;
      }
    }
    lines.push(cur);
  }
  return lines;
}

export function draw_wrapped(
  surf: Surface, text: string, rect: any, color: Color = [40, 32, 56], scale = 1,
  line_h: number | null = null, align: "left" | "center" = "left",
): number {
  const lh = line_h || LINE_H * scale;
  let y = rect[1];
  for (const line of wrap(text, rect[2], scale)) {
    const x = align === "center" ? rect[0] + Math.floor(rect[2] / 2) : rect[0];
    draw(surf, line, [x, y], color, scale, null, align);
    y += lh;
  }
  return y;
}
