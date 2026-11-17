"""Tiny original 3x5-ish bitmap pixel font rendered in code (uppercase)."""
import pygame

_G = {
    "A": [".#.", "#.#", "###", "#.#", "#.#"], "B": ["##.", "#.#", "##.", "#.#", "##."],
    "C": [".##", "#..", "#..", "#..", ".##"], "D": ["##.", "#.#", "#.#", "#.#", "##."],
    "E": ["###", "#..", "##.", "#..", "###"], "F": ["###", "#..", "##.", "#..", "#.."],
    "G": [".##", "#..", "#.#", "#.#", ".##"], "H": ["#.#", "#.#", "###", "#.#", "#.#"],
    "I": ["###", ".#.", ".#.", ".#.", "###"], "J": ["..#", "..#", "..#", "#.#", ".#."],
    "K": ["#.#", "#.#", "##.", "#.#", "#.#"], "L": ["#..", "#..", "#..", "#..", "###"],
    "M": ["#...#", "##.##", "#.#.#", "#...#", "#...#"], "N": ["#..#", "##.#", "#.##", "#..#", "#..#"],
    "O": [".#.", "#.#", "#.#", "#.#", ".#."], "P": ["##.", "#.#", "##.", "#..", "#.."],
    "Q": [".#.", "#.#", "#.#", "##.", ".##"], "R": ["##.", "#.#", "##.", "#.#", "#.#"],
    "S": [".##", "#..", ".#.", "..#", "##."], "T": ["###", ".#.", ".#.", ".#.", ".#."],
    "U": ["#.#", "#.#", "#.#", "#.#", "###"], "V": ["#.#", "#.#", "#.#", "#.#", ".#."],
    "W": ["#...#", "#...#", "#.#.#", "##.##", "#...#"], "X": ["#.#", "#.#", ".#.", "#.#", "#.#"],
    "Y": ["#.#", "#.#", ".#.", ".#.", ".#."], "Z": ["###", "..#", ".#.", "#..", "###"],
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
    ">": ["#..", ".#.", "..#", ".#.", "#.."], "_": ["...", "...", "...", "...", "###"],
    "$": [".##", "##.", ".#.", ".##", "##."], "[": ["##", "#.", "#.", "#.", "##"], "]": ["##", ".#", ".#", ".#", "##"],
    "~": [".#.#.", "#####", "#####", ".###.", "..#.."],   # heart
    "^": ["..#..", ".###.", "#####", ".###.", "#...#"],   # star
    "@": ["##", "##", "..", "..", ".."],                  # degree-ish
    "{": [".....", ".#...", "#####", ".#...", "....."],   # left arrow
    "}": [".....", "...#.", "#####", "...#.", "....."],   # right arrow
    "|": [".#.", "###", ".#.", ".#.", ".#."],             # up arrow
    "`": [".#.", ".#.", ".#.", "###", ".#."],             # down arrow
}
HEART, STAR = "~", "^"
LINE_H = 7
_cache = {}


def _char(c):
    if c in _G:
        return _G[c]
    u = c.upper()
    return _G.get(u, _G["?"])


def text_width(text, scale=1):
    if not text:
        return 0
    return (sum(len(_char(c)[0]) + 1 for c in text) - 1) * scale


def render(text, color=(40, 32, 56), scale=1, shadow=None):
    key = (text, tuple(color), scale, tuple(shadow) if shadow else None)
    s = _cache.get(key)
    if s is not None:
        return s
    w = max(1, text_width(text, 1))
    off = 1 if shadow else 0
    surf = pygame.Surface((w + off, 5 + off), pygame.SRCALPHA)
    layers = [(shadow, 1)] if shadow else []
    layers.append((color, 0))
    for col, o in layers:
        x = 0
        for c in text:
            g = _char(c)
            for gy, row in enumerate(g):
                for gx, ch in enumerate(row):
                    if ch == "#":
                        surf.set_at((x + gx + o, gy + o), col)
            x += len(g[0]) + 1
    if scale != 1:
        surf = pygame.transform.scale(surf, (surf.get_width() * scale, surf.get_height() * scale))
    if len(_cache) > 3000:
        _cache.clear()
    _cache[key] = surf
    return surf


def draw(surf, text, pos, color=(40, 32, 56), scale=1, shadow=None, align="left"):
    img = render(text, color, scale, shadow)
    x, y = pos
    if align == "center":
        x -= img.get_width() // 2
    elif align == "right":
        x -= img.get_width()
    surf.blit(img, (int(x), int(y)))
    return img.get_width()


def wrap(text, max_w, scale=1):
    lines = []
    for para in text.split("\n"):
        cur = ""
        for word in para.split(" "):
            t = word if not cur else cur + " " + word
            if text_width(t, scale) <= max_w or not cur:
                cur = t
            else:
                lines.append(cur)
                cur = word
        lines.append(cur)
    return lines


def draw_wrapped(surf, text, rect, color=(40, 32, 56), scale=1, line_h=None, align="left"):
    lh = line_h or (LINE_H * scale)
    y = rect[1]
    for line in wrap(text, rect[2], scale):
        x = rect[0] + rect[2] // 2 if align == "center" else rect[0]
        draw(surf, line, (x, y), color, scale, align=align)
        y += lh
    return y
