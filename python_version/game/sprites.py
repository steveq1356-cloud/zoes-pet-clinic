"""All pixel art is generated here, in code. 100% original designs.

Everything is cached after first draw. Characters are 16x24, tiles 16x16.
"""
import random
import pygame
from . import data, font

OUTLINE = (52, 38, 64)
WHITE = (255, 255, 255)
DARK = (52, 38, 64)
PINK = (250, 150, 170)
_cache = {}


def darker(c, f=0.78):
    return tuple(max(0, min(255, int(v * f))) for v in c[:3])


def lighter(c, f=0.35):
    return tuple(max(0, min(255, int(v + (255 - v) * f))) for v in c[:3])


def new(w, h):
    return pygame.Surface((w, h), pygame.SRCALPHA)


def R(s, c, x, y, w, h):
    if w > 0 and h > 0:
        pygame.draw.rect(s, c, (x, y, w, h))


def P(s, x, y, c):
    s.set_at((x, y), c)


def outline(s, color=OUTLINE):
    w, h = s.get_size()
    out = s.copy()
    for y in range(h):
        for x in range(w):
            if s.get_at((x, y))[3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and s.get_at((nx, ny))[3] > 0:
                        out.set_at((x, y), color)
                        break
    return out


def grayscale(s):
    w, h = s.get_size()
    out = new(w, h)
    for y in range(h):
        for x in range(w):
            c = s.get_at((x, y))
            if c[3]:
                g = int(c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15)
                g = int(g * 0.8 + 30)
                out.set_at((x, y), (g, g, min(255, g + 8), c[3]))
    return out


def tint(s, color, amt=0.5):
    w, h = s.get_size()
    out = s.copy()
    for y in range(h):
        for x in range(w):
            c = s.get_at((x, y))
            if c[3]:
                out.set_at((x, y), tuple(int(c[i] * (1 - amt) + color[i] * amt) for i in range(3)) + (c[3],))
    return out


def silhouette(s, color):
    w, h = s.get_size()
    out = new(w, h)
    for y in range(h):
        for x in range(w):
            if s.get_at((x, y))[3]:
                out.set_at((x, y), color)
    return out


def cached(key, fn):
    v = _cache.get(key)
    if v is None:
        v = fn()
        _cache[key] = v
    return v


# =================================================================== PEOPLE
def zoe_spec(hair_mode, outfit_id):
    o = data.OUTFITS.get(outfit_id, data.OUTFITS["classic"])
    z = data.PEOPLE["zoe"]
    return dict(skin=z["skin"], hair=z["hair"], hair2=z["hair2"], style="long" if hair_mode == "long" else "bob",
                shirt=o["scrub"], coat=o.get("coat"), pants=o.get("pants", o["scrub"]), shoes=o["shoes"],
                patches=o.get("patches"), stars=o.get("stars"), overalls_z=o.get("overalls"), blonde=True)


def _draw_person(sp, d, frame):
    s = new(16, 24)
    skin, hair = sp["skin"], sp["hair"]
    hair2 = sp.get("hair2", darker(hair))
    style = sp.get("style", "short")
    shirt = sp.get("shirt", (200, 200, 200))
    coat = sp.get("coat")
    pants = sp.get("pants", shirt)
    shoes = sp.get("shoes", (80, 60, 60))
    side = d in ("left", "right")
    blink = frame == 3
    if frame == 3:
        frame = 0
    lo = -1 if frame == 1 else 0
    ro = -1 if frame == 2 else 0

    # -- long hair behind body
    if style == "long":
        if d == "down":
            R(s, hair2, 3, 6, 10, 11)
        elif side:
            R(s, hair2, 3, 6, 5, 11)
    # -- legs + shoes
    if side:
        fx = {0: 0, 1: 1, 2: -1}[frame]
        R(s, darker(pants), 7 - fx, 18, 2, 4)
        R(s, darker(shoes), 7 - fx, 22, 3, 2)
        R(s, pants, 7 + fx, 18, 2, 4)
        R(s, shoes, 7 + fx, 22, 3, 2)
    else:
        R(s, pants, 5, 18, 2, 4 + lo)
        R(s, shoes, 5, 22 + lo, 2, 2)
        R(s, pants, 9, 18, 2, 4 + ro)
        R(s, shoes, 9, 22 + ro, 2, 2)
    # -- torso
    tx, tw = (5, 6) if side else (4, 8)
    R(s, shirt, tx, 11, tw, 7)
    sleeve = coat if coat else shirt
    if coat:
        if d == "down":
            R(s, coat, 4, 11, 2, 7)
            R(s, coat, 10, 11, 2, 7)
            P(s, 7, 11, skin)
            P(s, 8, 11, skin)
            if sp.get("patches"):
                P(s, 4, 15, (240, 120, 120))
                P(s, 11, 14, (120, 180, 240))
            if sp.get("stars"):
                for p in ((4, 13), (10, 16), (11, 12)):
                    P(s, *p, (250, 230, 120))
        elif d == "up":
            R(s, coat, 4, 11, 8, 7)
            if sp.get("stars"):
                for p in ((5, 12), (9, 15), (7, 13)):
                    P(s, *p, (250, 230, 120))
        else:
            R(s, coat, 5, 11, 4, 7)
            if sp.get("patches"):
                P(s, 6, 15, (240, 120, 120))
    else:
        if d == "down":
            P(s, 7, 11, skin)
            P(s, 8, 11, skin)
    if sp.get("overalls") or sp.get("overalls_z"):
        oc = pants
        if side:
            R(s, oc, 5, 14, 6, 4)
            P(s, 8, 12, oc)
            P(s, 8, 13, oc)
        else:
            R(s, oc, 5, 14, 6, 4)
            R(s, oc, 5, 11, 1, 3)
            R(s, oc, 10, 11, 1, 3)
            if d == "down":
                P(s, 5, 12, (250, 220, 120))
                P(s, 10, 12, (250, 220, 120))
    if sp.get("apron") and d != "up":
        if side:
            R(s, sp["apron"], 9, 12, 2, 6)
        else:
            R(s, sp["apron"], 5, 13, 6, 6)
    # -- arms
    if side:
        ax = {0: 0, 1: 1, 2: -1}[frame]
        R(s, darker(sleeve, 0.9), 7 + ax, 12, 2, 4)
        R(s, skin, 7 + ax, 16, 2, 1)
    else:
        la = 1 if frame == 1 else 0
        ra = 1 if frame == 2 else 0
        R(s, sleeve, 3, 12 + la, 1, 4)
        P(s, 3, 16 + la, skin)
        R(s, sleeve, 12, 12 + ra, 1, 4)
        P(s, 12, 16 + ra, skin)
    # -- head
    R(s, skin, 4, 3, 8, 8)
    for p in ((4, 3), (11, 3), (4, 10), (11, 10)):
        P(s, *p, (0, 0, 0, 0))
    eye = (52, 40, 70)
    if d == "down":
        if blink:
            P(s, 6, 7, eye)
            P(s, 9, 7, eye)
        else:
            R(s, eye, 6, 6, 1, 2)
            R(s, eye, 9, 6, 1, 2)
        P(s, 5, 8, (250, 170, 170))
        P(s, 10, 8, (250, 170, 170))
        P(s, 7, 9, darker(skin, 0.75))
        P(s, 8, 9, darker(skin, 0.75))
        if sp.get("glasses"):
            R(s, (90, 90, 110), 5, 6, 2, 1)
            R(s, (90, 90, 110), 8, 6, 3, 1)
            P(s, 7, 6, (90, 90, 110))
        if sp.get("beard"):
            R(s, hair, 5, 9, 6, 2)
            P(s, 7, 9, darker(skin, 0.75))
    elif side:
        if blink:
            P(s, 9, 7, eye)
        else:
            R(s, eye, 9, 6, 1, 2)
        P(s, 10, 8, (250, 170, 170))
        P(s, 11, 9, darker(skin, 0.75))
        if sp.get("glasses"):
            R(s, (90, 90, 110), 8, 6, 3, 1)
        if sp.get("beard"):
            R(s, hair, 7, 9, 5, 2)
    # -- hair
    R(s, hair, 4, 2, 8, 3)
    R(s, hair, 5, 1, 6, 1)
    if d == "down":
        if style == "long":
            R(s, hair, 3, 4, 2, 12)
            R(s, hair, 11, 4, 2, 12)
            R(s, hair, 5, 5, 2, 1)
            P(s, 3, 16, hair2)
            P(s, 12, 16, hair2)
        elif style == "bob":
            R(s, hair, 3, 4, 2, 7)
            R(s, hair, 11, 4, 2, 7)
            R(s, hair, 5, 5, 3, 1)
            P(s, 4, 11, hair2)
            P(s, 11, 11, hair2)
        elif style in ("short", "cap"):
            R(s, hair, 4, 4, 1, 2)
            R(s, hair, 11, 4, 1, 2)
        elif style == "bun":
            R(s, hair, 4, 4, 1, 3)
            R(s, hair, 11, 4, 1, 3)
            R(s, hair2, 6, 0, 4, 2)
    elif d == "up":
        R(s, hair, 4, 2, 8, 9)
        if style == "long":
            R(s, hair, 3, 4, 10, 13)
            R(s, hair2, 7, 8, 1, 8)
        elif style == "bob":
            R(s, hair, 3, 4, 10, 7)
            R(s, hair2, 4, 11, 8, 1)
        elif style == "bun":
            R(s, hair2, 6, 0, 4, 2)
    else:
        R(s, hair, 4, 4, 3, 5)
        R(s, hair, 10, 4, 2, 1)
        if style == "long":
            R(s, hair, 3, 4, 4, 12)
            P(s, 3, 16, hair2)
        elif style == "bob":
            R(s, hair, 3, 4, 4, 7)
            P(s, 4, 11, hair2)
        elif style == "bun":
            R(s, hair2, 2, 2, 3, 3)
    if style == "cap":
        cap = sp.get("cap", (200, 90, 70))
        R(s, cap, 4, 1, 8, 3)
        if d == "down":
            R(s, darker(cap), 3, 4, 10, 1)
        elif side:
            R(s, darker(cap), 10, 4, 4, 1)
    elif sp.get("cap"):
        cap = sp["cap"]
        R(s, cap, 4, 1, 8, 2)
        if d == "down":
            R(s, darker(cap), 4, 3, 8, 1)
    # hair shine
    if d != "up":
        P(s, 6, 2, lighter(hair, 0.5))
        P(s, 7, 2, lighter(hair, 0.5))
    s = outline(s)
    return s


def person(key, spec, d="down", frame=0):
    """key identifies the spec for caching."""
    if d == "left":
        return cached(("person", key, "left", frame),
                      lambda: pygame.transform.flip(person(key, spec, "right", frame), True, False))
    return cached(("person", key, d, frame), lambda: _draw_person(spec, d, frame))


def zoe(hair_mode, outfit, d="down", frame=0):
    return person(("zoe", hair_mode, outfit), zoe_spec(hair_mode, outfit), d, frame)


def npc(name, d="down", frame=0):
    return person(("npc", name), data.PEOPLE[name], d, frame)


def owner(idx, d="down", frame=0):
    return person(("owner", idx), data.OWNER_LOOKS[idx % len(data.OWNER_LOOKS)], d, frame)


def portrait(key, spec):
    def mk():
        base = person(key, spec, "down", 0)
        head = new(12, 14)
        head.blit(base, (-2, 0))
        big = pygame.transform.scale(head, (24, 28))
        return big
    return cached(("portrait", key), mk)


def zoe_portrait(hair_mode, outfit):
    return portrait(("zoe", hair_mode, outfit), zoe_spec(hair_mode, outfit))


def npc_portrait(name):
    return portrait(("npc", name), data.PEOPLE[name])


# =================================================================== ANIMALS
def _draw_animal(kind, vi, size, frame, mood):
    info = data.ANIMALS[kind]
    v = info["variants"][vi % len(info["variants"])]
    body, belly, acc = v["body"], v["belly"], v["accent"]
    k = size / 24.0
    s = new(size, size)

    def E(x, y, w, h, c):
        pygame.draw.ellipse(s, c, (round(x * k), round(y * k), max(1, round(w * k)), max(1, round(h * k))))

    def Rc(x, y, w, h, c):
        pygame.draw.rect(s, c, (round(x * k), round(y * k), max(1, round(w * k)), max(1, round(h * k))))

    def Pl(pts, c):
        pygame.draw.polygon(s, c, [(round(x * k), round(y * k)) for x, y in pts])

    hy = 1 if frame == 1 else 0       # head bob
    oy = 0
    if kind == "bunny":
        oy = 3
    tail_up = frame == 1
    eye_y = 7 + oy + hy
    ex1, ex2 = 8, 14
    nose_c = DARK
    # ---- tails (behind)
    if kind == "dog":
        E(16, 12 if tail_up else 14, 7, 3, body)
    elif kind == "cat":
        E(16, 10 if tail_up else 12, 4, 10, body)
        E(17, 9 if tail_up else 11, 3, 3, acc)
    elif kind in ("fox", "moonfox"):
        E(14, 9 if tail_up else 11, 10, 11, body)
        E(19, 8 if tail_up else 10, 5, 5, belly)
    elif kind == "redpanda":
        E(14, 9 if tail_up else 11, 9, 13, body)
        for yy in (12, 16, 20):
            Rc(15, yy - (2 if tail_up else 0), 7, 1, darker(body, 0.7))
    elif kind == "bunny":
        E(17, 18, 5, 5, WHITE)
    # ---- ears behind head
    if kind == "bunny":
        for x in (7, 13):
            E(x, 0, 4, 11, body)
            E(x + 1, 2, 2, 7, acc)
    if kind in ("cat",):
        Pl([(5, 7 + hy), (5, 1 + hy), (10, 4 + hy)], body)
        Pl([(19, 7 + hy), (19, 1 + hy), (14, 4 + hy)], body)
        Pl([(6, 5 + hy), (6, 3 + hy), (8, 4 + hy)], PINK)
        Pl([(18, 5 + hy), (18, 3 + hy), (16, 4 + hy)], PINK)
    if kind in ("fox", "moonfox"):
        Pl([(4, 8 + hy), (4, 0 + hy), (10, 4 + hy)], body)
        Pl([(20, 8 + hy), (20, 0 + hy), (14, 4 + hy)], body)
        Pl([(5, 3 + hy), (4, 0 + hy), (6, 1 + hy)], acc)
        Pl([(19, 3 + hy), (20, 0 + hy), (18, 1 + hy)], acc)
    if kind == "redpanda":
        E(3, 2 + hy, 6, 6, acc)
        E(15, 2 + hy, 6, 6, acc)
        E(4, 3 + hy, 4, 4, body)
        E(16, 3 + hy, 4, 4, body)
    if kind == "hamster":
        E(4, 4 + hy, 5, 5, body)
        E(15, 4 + hy, 5, 5, body)
        E(5, 5 + hy, 3, 3, acc)
        E(16, 5 + hy, 3, 3, acc)
    # ---- body
    if kind == "hamster":
        E(3, 8, 18, 15, body)
        E(4, 4 + hy, 16, 13, body)
        E(7, 13, 10, 9, belly)
        E(5, 20, 4, 3, acc)
        E(15, 20, 4, 3, acc)
        eye_y = 8 + hy
        nose_c = (230, 120, 140)
    elif kind == "penguin":
        E(3, 12, 4, 8, darker(body, 0.85))
        E(17, 12, 4, 8, darker(body, 0.85))
        E(7, 20, 4, 3, acc)
        E(13, 20, 4, 3, acc)
        E(5, 3 + hy, 14, 20 - hy, body)
        E(7, 6 + hy, 10, 16 - hy, belly)
        Rc(11, 2 + hy, 2, 2, body)
        eye_y = 9 + hy
        ex1, ex2 = 9, 13
    elif kind == "hedgehog":
        # spikes
        sp = darker(acc, 0.9)
        E(2, 3 + hy, 20, 19, sp)
        for i in range(9):
            ang_x = 2 + i * 2.5
            Pl([(ang_x, 6 + hy + (i % 2) * 2), (ang_x + 1.5, 0 + hy + (i % 2)), (ang_x + 3, 6 + hy)], sp)
        Pl([(1, 14), (-1, 10), (3, 11)], sp)
        Pl([(23, 14), (25, 10), (21, 11)], sp)
        E(6, 6 + hy, 12, 10, belly)
        E(7, 15, 10, 7, belly)
        E(6, 4 + hy, 3, 3, belly)
        E(15, 4 + hy, 3, 3, belly)
        E(6, 20, 4, 3, darker(belly, 0.85))
        E(14, 20, 4, 3, darker(belly, 0.85))
        eye_y = 9 + hy
        ex1, ex2 = 9, 13
    else:
        E(5, 12 + oy // 2, 14, 11 - oy // 2, body)
        E(8, 14 + oy // 2, 8, 8 - oy // 2, belly)
        fc = acc if kind == "redpanda" else body
        if kind == "redpanda":
            fc = belly
        E(6, 20, 5, 4, darker(fc, 0.92))
        E(13, 20, 5, 4, darker(fc, 0.92))
        E(4, 3 + oy + hy, 16, 12, body)
        if kind in ("dog", "fox", "moonfox"):
            E(8, 9 + oy + hy, 8, 5, belly)
        if kind == "redpanda":
            E(6, 7 + hy, 4, 4, acc)
            E(14, 7 + hy, 4, 4, acc)
            E(8, 10 + hy, 8, 4, acc)
        if kind == "cat":
            Rc(11, 3 + hy, 2, 2, acc)
        if kind == "bunny":
            E(9, 9 + oy + hy, 6, 4, belly)
            nose_c = (240, 130, 150)
        if kind == "cat":
            nose_c = (240, 130, 150)
    # floppy dog ears in front
    if kind == "dog":
        E(2, 4 + hy, 5, 9, acc)
        E(17, 4 + hy, 5, 9, acc)
    # ---- face
    eye = (40, 30, 50)
    if mood in ("blink", "sick"):
        Rc(ex1, eye_y + 1, 2, 1, eye)
        Rc(ex2, eye_y + 1, 2, 1, eye)
    elif mood == "happy":
        Rc(ex1, eye_y + 1, 1, 1, eye)
        Rc(ex1 + 1, eye_y, 1, 1, eye)
        Rc(ex2, eye_y, 1, 1, eye)
        Rc(ex2 + 1, eye_y + 1, 1, 1, eye)
    else:
        Rc(ex1, eye_y, 2, 2, eye)
        Rc(ex2, eye_y, 2, 2, eye)
        if size >= 20:
            Rc(ex1, eye_y, 1, 1, WHITE)
            Rc(ex2, eye_y, 1, 1, WHITE)
        if mood == "angry":
            Rc(ex1 - 1, eye_y - 2, 2, 1, eye)
            Rc(ex2 + 1, eye_y - 2, 2, 1, eye)
    if kind == "penguin":
        Pl([(10.5, eye_y + 3), (13.5, eye_y + 3), (12, eye_y + 5)], acc)
    else:
        Rc(11, eye_y + 3, 2, 1, nose_c)
        Rc(11, eye_y + 4, 1, 1, darker(belly, 0.6))
        Rc(12, eye_y + 4, 1, 1, darker(belly, 0.6))
    if mood != "angry":
        Rc(ex1 - 2, eye_y + 3, 1, 1, (250, 160, 180))
        Rc(ex2 + 3, eye_y + 3, 1, 1, (250, 160, 180))
    if kind == "moonfox":
        Rc(11, 4 + hy, 2, 1, acc)
        Rc(12, 3 + hy, 1, 1, acc)
    s = outline(s)
    return s


def animal(kind, vi=0, size=24, frame=0, mood="normal"):
    return cached(("animal", kind, vi, size, frame, mood), lambda: _draw_animal(kind, vi, size, frame, mood))


def animal_dead(kind, vi=0, size=24):
    return cached(("animal_dead", kind, vi, size),
                  lambda: pygame.transform.rotate(grayscale(animal(kind, vi, size, 0, "blink")), 90))


def scaled(surf_key, surf, factor):
    return cached(("scaled", surf_key, factor),
                  lambda: pygame.transform.scale(surf, (surf.get_width() * factor, surf.get_height() * factor)))


def animal_big(kind, vi, frame, mood, factor=3):
    return scaled(("ab", kind, vi, frame, mood), animal(kind, vi, 24, frame, mood), factor)


# =================================================================== TILES
def _rng(seed):
    return random.Random(seed)


def _grass(v):
    s = new(16, 16)
    s.fill((126, 200, 104))
    r = _rng(100 + v)
    for _ in range(10):
        x, y = r.randrange(16), r.randrange(16)
        P(s, x, y, (150, 222, 120) if r.random() < 0.6 else (104, 176, 92))
    if v == 2:
        for x, y in ((4, 6), (11, 11)):
            P(s, x, y, (90, 160, 80))
            P(s, x + 1, y - 1, (90, 160, 80))
            P(s, x + 2, y, (90, 160, 80))
    return s


def _flowers(frame, v):
    s = _grass(v).copy()
    r = _rng(200 + v)
    cols = [(250, 140, 170), (255, 255, 255), (250, 220, 90), (190, 150, 250)]
    for _ in range(3):
        x, y = r.randrange(2, 13), r.randrange(3, 13)
        c = cols[r.randrange(len(cols))]
        dx = 1 if frame and r.random() < 0.5 else 0
        P(s, x, y + 1, (80, 150, 80))
        P(s, x + dx, y, c)
        P(s, x + dx - 1, y, c)
        P(s, x + dx + 1, y, c)
        P(s, x + dx, y - 1, c)
        P(s, x + dx, y + 0, (250, 220, 120) if c != (250, 220, 90) else (240, 140, 60))
    return s


def _path(v):
    s = new(16, 16)
    s.fill((234, 210, 156))
    r = _rng(300 + v)
    for _ in range(6):
        x, y = r.randrange(15), r.randrange(15)
        P(s, x, y, (214, 186, 130))
        P(s, x + 1, y, (214, 186, 130))
    for _ in range(4):
        P(s, r.randrange(16), r.randrange(16), (246, 230, 190))
    return s


def _water(frame):
    s = new(16, 16)
    s.fill((96, 172, 232))
    for i in range(3):
        y = 3 + i * 5
        x = (i * 5 + frame * 3) % 16
        for dx in range(4):
            P(s, (x + dx) % 16, y, (176, 222, 252))
        P(s, (x + 6) % 16, y + 2, (130, 196, 244))
    return s


def _water_edge(frame):
    s = _water(frame).copy()
    R(s, (200, 232, 252), 0, 0, 16, 2)
    return s


def _tree(v=0):
    s = new(16, 32)
    R(s, (140, 96, 60), 6, 20, 4, 10)
    P(s, 7, 22, (170, 120, 80))
    pygame.draw.ellipse(s, (66, 150, 82), (0, 2, 16, 20))
    pygame.draw.ellipse(s, (88, 180, 96), (2, 3, 12, 14))
    pygame.draw.ellipse(s, (120, 206, 112), (4, 4, 6, 6))
    if v == 1:
        for p in ((5, 12), (10, 9), (8, 15)):
            P(s, *p, (240, 100, 110))
    R(s, (100, 170, 90), 3, 30, 10, 2)
    return outline(s)


def _bush():
    s = new(16, 16)
    pygame.draw.ellipse(s, (70, 156, 84), (0, 4, 16, 12))
    pygame.draw.ellipse(s, (100, 186, 100), (2, 5, 10, 7))
    P(s, 5, 7, (250, 250, 250))
    P(s, 11, 9, (250, 150, 170))
    return outline(s)


def _fence(kind="h"):
    s = new(16, 16)
    wood, dk = (226, 186, 130), (176, 130, 86)
    if kind == "h":
        R(s, wood, 0, 7, 16, 2)
        R(s, wood, 0, 11, 16, 2)
        R(s, dk, 0, 9, 16, 1)
        for x in (1, 11):
            R(s, wood, x, 4, 3, 11)
            R(s, dk, x + 2, 5, 1, 10)
    else:
        R(s, wood, 6, 0, 3, 16)
        R(s, dk, 8, 0, 1, 16)
    return outline(s)


def _floor_wood():
    s = new(16, 16)
    s.fill((220, 172, 116))
    for y in (3, 7, 11, 15):
        R(s, (196, 146, 96), 0, y, 16, 1)
    P(s, 6, 1, (196, 146, 96))
    P(s, 12, 5, (196, 146, 96))
    P(s, 3, 9, (196, 146, 96))
    P(s, 9, 13, (196, 146, 96))
    return s


def _floor_tile(a=(240, 244, 250), b=(214, 228, 244)):
    s = new(16, 16)
    s.fill(a)
    R(s, b, 0, 0, 8, 8)
    R(s, b, 8, 8, 8, 8)
    return s


def _wall(base=(250, 224, 206), dot=(240, 196, 180), trim=(186, 128, 96)):
    s = new(16, 16)
    s.fill(base)
    for x, y in ((3, 3), (11, 7), (3, 11), (11, 15)):
        P(s, x, y, dot)
        P(s, x + 1, y, dot)
    return s


def _wall_trim(trim=(186, 128, 96)):
    s = _wall().copy()
    R(s, trim, 0, 12, 16, 4)
    R(s, lighter(trim), 0, 12, 16, 1)
    return s


def tile(name, frame=0):
    fns = {
        "grass": lambda: _grass(0), "grass1": lambda: _grass(1), "grass2": lambda: _grass(2),
        "flowers": lambda: _flowers(frame, 0), "flowers1": lambda: _flowers(frame, 1),
        "path": lambda: _path(0), "path1": lambda: _path(1),
        "water": lambda: _water(frame), "water_edge": lambda: _water_edge(frame),
        "tree": lambda: _tree(0), "tree1": lambda: _tree(1), "bush": _bush,
        "fence": lambda: _fence("h"), "fence_v": lambda: _fence("v"),
        "wood": _floor_wood, "tilefloor": _floor_tile,
        "storefloor": lambda: _floor_tile((236, 246, 226), (214, 236, 200)),
        "wall": _wall, "wall_trim": _wall_trim,
        "storewall": lambda: _wall((226, 240, 250), (200, 222, 240)),
    }
    return cached(("tile", name, frame), fns[name])


# =================================================================== BUILDINGS
def _building(w, h, roof, walls, sign=None, door_c=(150, 100, 70)):
    s = new(w, h)
    roof_h = h // 2
    # roof with shingles
    pygame.draw.polygon(s, roof, [(2, roof_h), (8, 2), (w - 9, 2), (w - 3, roof_h)])
    for y in range(6, roof_h, 4):
        pygame.draw.line(s, darker(roof), (4, y), (w - 5, y))
    pygame.draw.line(s, lighter(roof), (9, 3), (w - 10, 3))
    # walls
    R(s, walls, 4, roof_h, w - 8, h - roof_h)
    R(s, darker(walls, 0.88), 4, roof_h, w - 8, 2)
    R(s, darker(walls, 0.8), 4, h - 3, w - 8, 3)
    # door
    dx = w // 2 - 6
    R(s, door_c, dx, h - 16, 12, 16)
    R(s, lighter(door_c), dx + 1, h - 15, 10, 1)
    P(s, dx + 9, h - 8, (250, 220, 120))
    # windows
    for wx in (10, w - 22):
        R(s, (130, 200, 240), wx, roof_h + 5, 12, 9)
        R(s, (200, 236, 252), wx + 1, roof_h + 6, 4, 3)
        R(s, WHITE, wx + 5, roof_h + 5, 1, 9)
        R(s, darker(walls, 0.7), wx - 1, roof_h + 14, 14, 2)
    if sign:
        sign(s)
    return outline(s)


def building(name):
    def clinic():
        def sign(s):
            R(s, WHITE, 32, 8, 16, 14)
            R(s, (240, 110, 130), 38, 10, 4, 10)
            R(s, (240, 110, 130), 35, 13, 10, 4)
            pygame.draw.rect(s, (200, 70, 100), (32, 8, 16, 14), 1)
        return _building(80, 60, (120, 206, 196), (250, 248, 240), sign, (120, 170, 220))

    def hq():
        def sign(s):
            R(s, (250, 240, 200), 25, 10, 14, 8)
            s.blit(font.render("ZOE", (180, 90, 110)), (27, 12))
        return _building(64, 56, (240, 140, 150), (236, 210, 170), sign, (170, 110, 80))

    def store():
        def sign(s):
            R(s, (250, 250, 230), 20, 8, 32, 10)
            s.blit(font.render("SHOP", (90, 140, 80)), (28, 11))
            for i in range(9):
                R(s, (250, 250, 250) if i % 2 else (240, 120, 100), 6 + i * 7, 28, 7, 4)
        return _building(72, 56, (240, 190, 90), (248, 236, 220), sign, (110, 160, 110))

    return cached(("building", name), {"clinic": clinic, "hq": hq, "store": store}[name])


# =================================================================== OBJECTS / FURNITURE
def obj(name):
    def bed():
        s = new(16, 32)
        R(s, (176, 120, 80), 0, 0, 16, 32)
        R(s, (250, 250, 252), 2, 2, 12, 7)
        R(s, (246, 150, 180), 1, 10, 14, 20)
        R(s, (250, 190, 210), 1, 10, 14, 2)
        for y in (15, 21, 27):
            R(s, (230, 120, 160), 3, y, 10, 1)
        return outline(s)

    def mirror():
        s = new(16, 24)
        pygame.draw.ellipse(s, (226, 180, 80), (1, 0, 14, 22))
        pygame.draw.ellipse(s, (190, 226, 246), (3, 2, 10, 18))
        R(s, WHITE, 5, 5, 1, 5)
        R(s, WHITE, 6, 4, 1, 2)
        R(s, (176, 130, 60), 5, 22, 6, 2)
        return outline(s)

    def shelf():
        s = new(40, 24)
        R(s, (180, 126, 84), 0, 10, 40, 3)
        R(s, (180, 126, 84), 0, 21, 40, 3)
        R(s, (150, 100, 66), 0, 12, 40, 1)
        R(s, (150, 100, 66), 0, 23, 40, 1)
        R(s, (150, 100, 66), 1, 13, 2, 8)
        R(s, (150, 100, 66), 37, 13, 2, 8)
        return outline(s)

    def laptop():
        s = new(16, 20)
        R(s, (190, 140, 96), 0, 8, 16, 4)
        R(s, (150, 104, 70), 1, 12, 2, 8)
        R(s, (150, 104, 70), 13, 12, 2, 8)
        R(s, (90, 90, 110), 3, 1, 10, 7)
        R(s, (140, 220, 200), 4, 2, 8, 5)
        R(s, (250, 240, 120), 5, 3, 2, 2)
        R(s, (120, 120, 140), 2, 7, 12, 1)
        return outline(s)

    def planner():
        s = new(16, 20)
        R(s, (190, 140, 96), 0, 8, 16, 4)
        R(s, (150, 104, 70), 1, 12, 2, 8)
        R(s, (150, 104, 70), 13, 12, 2, 8)
        R(s, (120, 170, 230), 3, 3, 8, 5)
        R(s, (250, 250, 250), 4, 4, 6, 3)
        R(s, (240, 120, 120), 10, 1, 3, 7)
        R(s, (250, 220, 120), 10, 0, 3, 1)
        return outline(s)

    def counter():
        s = new(64, 20)
        R(s, (200, 150, 100), 0, 4, 64, 16)
        R(s, (230, 190, 140), 0, 2, 64, 4)
        R(s, (170, 120, 80), 0, 10, 64, 1)
        R(s, (250, 220, 120), 44, 0, 8, 3)
        return outline(s)

    def store_shelf():
        s = new(32, 28)
        R(s, (190, 140, 96), 0, 0, 32, 28)
        cols = [(240, 120, 120), (120, 180, 240), (250, 220, 120), (140, 210, 140), (220, 160, 240)]
        r = _rng(7)
        for y in (2, 11, 20):
            R(s, (150, 100, 66), 0, y + 7, 32, 2)
            x = 2
            while x < 28:
                w = r.randrange(3, 6)
                R(s, cols[r.randrange(len(cols))], x, y + r.randrange(0, 3), w, 7 - (y == 20))
                x += w + 1
        return outline(s)

    def kennel():
        s = new(40, 30)
        R(s, (226, 232, 240), 0, 0, 40, 30)
        R(s, (190, 200, 214), 2, 2, 36, 26)
        R(s, (250, 236, 210), 2, 20, 36, 8)
        return outline(s)

    def bars():
        s = new(40, 30)
        for x in range(4, 38, 5):
            R(s, (150, 160, 180), x, 2, 1, 26)
        R(s, (150, 160, 180), 2, 2, 36, 1)
        return s

    def desk():
        s = new(48, 28)
        R(s, (130, 190, 220), 0, 8, 48, 20)
        R(s, (190, 230, 246), 0, 6, 48, 4)
        R(s, (100, 160, 200), 0, 16, 48, 1)
        R(s, WHITE, 18, 12, 12, 8)
        R(s, (240, 110, 130), 23, 13, 2, 6)
        R(s, (240, 110, 130), 21, 15, 6, 2)
        R(s, (250, 220, 120), 36, 2, 6, 4)
        return outline(s)

    def chair():
        s = new(16, 16)
        R(s, (240, 160, 120), 2, 0, 12, 8)
        R(s, (250, 190, 150), 1, 8, 14, 4)
        R(s, (150, 100, 70), 2, 12, 2, 4)
        R(s, (150, 100, 70), 12, 12, 2, 4)
        return outline(s)

    def comfy_chair():
        s = new(16, 16)
        R(s, (180, 140, 230), 1, 0, 14, 9)
        R(s, (210, 180, 250), 0, 8, 16, 5)
        R(s, (150, 110, 200), 0, 3, 2, 10)
        R(s, (150, 110, 200), 14, 3, 2, 10)
        R(s, (110, 80, 60), 2, 13, 2, 3)
        R(s, (110, 80, 60), 12, 13, 2, 3)
        return outline(s)

    def cart():
        s = new(20, 14)
        R(s, (120, 130, 150), 1, 2, 18, 7)
        R(s, (160, 170, 190), 1, 2, 18, 2)
        pygame.draw.circle(s, (60, 60, 70), (5, 11), 2)
        pygame.draw.circle(s, (60, 60, 70), (15, 11), 2)
        R(s, (120, 130, 150), 18, 0, 2, 4)
        return outline(s)

    def table():
        s = new(96, 30)
        R(s, (200, 210, 226), 0, 6, 96, 10)
        R(s, (236, 242, 250), 0, 4, 96, 4)
        R(s, (150, 160, 180), 8, 16, 6, 14)
        R(s, (150, 160, 180), 82, 16, 6, 14)
        return outline(s)

    def tub():
        s = new(110, 40)
        pygame.draw.ellipse(s, (226, 240, 252), (0, 0, 110, 40))
        pygame.draw.ellipse(s, (150, 206, 240), (6, 4, 98, 22))
        R(s, (200, 220, 240), 4, 30, 102, 4)
        return outline(s)

    def doormat():
        s = new(32, 10)
        R(s, (200, 110, 90), 0, 0, 32, 10)
        R(s, (230, 150, 120), 2, 2, 28, 6)
        return s

    fns = dict(bed=bed, mirror=mirror, shelf=shelf, laptop=laptop, planner=planner, counter=counter,
               store_shelf=store_shelf, kennel=kennel, bars=bars, desk=desk, chair=chair,
               comfy_chair=comfy_chair, cart=cart, table=table, tub=tub, doormat=doormat)
    return cached(("obj", name), fns[name])


# =================================================================== DECOR
def _decor(name):
    w, h = data.DECOR[name]["size"]
    W, H = w * 16, h * 16
    extra = {"lamp": 10, "bookshelf": 10, "cattree": 14, "fishtank": 6, "sofa": 6, "starlamp": 10, "plant": 4}.get(name, 0)
    s = new(W, H + extra)
    b = extra  # baseline offset
    if name == "plant":
        R(s, (210, 120, 90), 4, b + 9, 8, 7)
        R(s, (230, 150, 110), 3, b + 8, 10, 2)
        for x, y, ww, hh in ((2, b - 2, 6, 10), (8, b - 3, 6, 11), (5, b - 4, 6, 9)):
            pygame.draw.ellipse(s, (90, 180, 100), (x, y, ww, hh))
        P(s, 7, b - 1, (150, 220, 140))
    elif name == "rug":
        pygame.draw.ellipse(s, (240, 160, 170), (0, 4, 32, 26))
        pygame.draw.ellipse(s, (250, 210, 160), (5, 8, 22, 18))
        pygame.draw.ellipse(s, (180, 210, 250), (10, 12, 12, 10))
        return s
    elif name == "lamp":
        R(s, (120, 100, 90), 7, 8, 2, H + extra - 10)
        R(s, (120, 100, 90), 4, H + extra - 2, 8, 2)
        pygame.draw.polygon(s, (250, 220, 150), [(3, 9), (13, 9), (11, 1), (5, 1)])
        R(s, (255, 245, 200), 5, 9, 6, 1)
    elif name == "bookshelf":
        R(s, (170, 116, 76), 0, 0, 32, H + extra)
        cols = [(220, 90, 90), (90, 140, 220), (240, 200, 90), (110, 190, 120), (190, 120, 220)]
        for i, y in enumerate((2, 10, 18)):
            R(s, (130, 86, 56), 1, y + 7, 30, 1)
            for j in range(7):
                R(s, cols[(i + j) % 5], 2 + j * 4, y + (j % 2), 3, 7 - (j % 2))
    elif name == "beanbag":
        pygame.draw.ellipse(s, (120, 200, 210), (0, 3, 16, 13))
        pygame.draw.ellipse(s, (160, 226, 230), (3, 4, 8, 5))
    elif name == "cattree":
        R(s, (220, 200, 170), 6, 4, 4, H + extra - 6)
        R(s, (190, 140, 110), 1, 2, 14, 4)
        R(s, (190, 140, 110), 0, 14, 10, 4)
        R(s, (190, 140, 110), 2, H + extra - 3, 12, 3)
        pygame.draw.circle(s, (240, 120, 140), (13, 12), 2)
    elif name == "fishtank":
        R(s, (150, 110, 80), 0, H + extra - 6, 32, 6)
        R(s, (150, 210, 246), 1, 2, 30, H + extra - 8)
        R(s, (230, 220, 160), 1, H + extra - 9, 30, 3)
        R(s, (250, 150, 60), 8, 8, 4, 3)
        R(s, (250, 230, 90), 20, 12, 4, 2)
        R(s, (90, 180, 100), 26, 6, 2, 10)
        P(s, 15, 5, WHITE)
        P(s, 16, 8, WHITE)
    elif name == "sofa":
        R(s, (230, 120, 110), 0, 0, 32, 14)
        R(s, (250, 160, 140), 2, 10, 28, 8)
        R(s, (210, 100, 96), 0, 6, 3, 14)
        R(s, (210, 100, 96), 29, 6, 3, 14)
        R(s, (120, 80, 60), 2, H + extra - 2, 3, 2)
        R(s, (120, 80, 60), 27, H + extra - 2, 3, 2)
    elif name == "poster":
        R(s, (252, 248, 236), 2, 0, 12, 14)
        pygame.draw.circle(s, (240, 130, 150), (8, 8), 3)
        for p in ((5, 4), (8, 3), (11, 4)):
            P(s, *p, (240, 130, 150))
        return outline(s)
    elif name == "starlamp":
        R(s, (90, 90, 140), 7, 9, 2, H + extra - 10)
        R(s, (90, 90, 140), 4, H + extra - 2, 8, 2)
        pygame.draw.polygon(s, (255, 230, 110), [(8, 0), (10, 4), (15, 4), (11, 7), (13, 11), (8, 8), (3, 11), (5, 7), (1, 4), (6, 4)])
    return outline(s)


def decor(name, rot=0):
    def mk():
        base = _decor(name)
        if rot % 2 == 1:
            return pygame.transform.flip(base, True, False)
        return base
    return cached(("decor", name, rot % 2), mk)


# =================================================================== ICONS (12x12)
def icon(name, color=None):
    def mk():
        s = new(12, 12)
        if name in ("steth", "steth_gold"):
            c = (240, 200, 80) if name == "steth_gold" else (120, 130, 160)
            pygame.draw.arc(s, c, (1, 0, 8, 9), 3.14, 6.28, 2) if hasattr(pygame.draw, "arc") else None
            R(s, c, 1, 0, 2, 5)
            R(s, c, 7, 0, 2, 5)
            R(s, c, 2, 5, 6, 2)
            R(s, c, 4, 6, 2, 3)
            pygame.draw.circle(s, (200, 210, 230), (8, 9), 3)
            pygame.draw.circle(s, c, (8, 9), 1)
        elif name == "thermo":
            R(s, (240, 240, 250), 5, 0, 3, 9)
            R(s, (230, 70, 80), 6, 4, 1, 6)
            pygame.draw.circle(s, (230, 70, 80), (6, 9), 2)
        elif name == "mag":
            pygame.draw.circle(s, (180, 140, 90), (5, 5), 4)
            pygame.draw.circle(s, (190, 230, 250), (5, 5), 3)
            P(s, 4, 3, WHITE)
            pygame.draw.line(s, (150, 100, 66), (8, 8), (11, 11), 2)
        elif name == "comb":
            R(s, (240, 150, 180), 1, 2, 10, 3)
            for x in range(1, 11, 2):
                R(s, (240, 150, 180), x, 5, 1, 5)
        elif name == "sponge":
            R(s, (250, 220, 90), 1, 3, 10, 7)
            R(s, (120, 200, 120), 1, 2, 10, 2)
            for p in ((3, 6), (7, 5), (8, 8)):
                P(s, *p, (220, 180, 60))
        elif name == "syringe":
            R(s, (230, 240, 250), 2, 4, 7, 4)
            R(s, (130, 210, 240), 3, 5, 4, 2)
            R(s, (150, 150, 170), 9, 5, 3, 2)
            R(s, (150, 150, 170), 0, 3, 2, 6)
        elif name == "bandage":
            pygame.draw.circle(s, (250, 246, 236), (6, 6), 5)
            pygame.draw.circle(s, (220, 210, 190), (6, 6), 2)
            R(s, (250, 246, 236), 6, 9, 6, 3)
        elif name == "shears":
            pygame.draw.circle(s, (240, 120, 120), (3, 9), 2)
            pygame.draw.circle(s, (240, 120, 120), (8, 9), 2)
            pygame.draw.line(s, (180, 190, 210), (3, 7), (9, 0), 2)
            pygame.draw.line(s, (180, 190, 210), (8, 7), (2, 0), 2)
        elif name == "scoop":
            pygame.draw.ellipse(s, (120, 190, 240), (0, 3, 8, 7))
            R(s, (90, 150, 200), 7, 5, 5, 2)
        elif name == "kennel":
            R(s, (200, 210, 226), 0, 2, 12, 10)
            for x in range(2, 11, 3):
                R(s, (130, 140, 160), x, 3, 1, 8)
        elif name == "chair":
            R(s, (180, 140, 230), 2, 0, 8, 6)
            R(s, (210, 180, 250), 1, 6, 10, 3)
            R(s, (110, 80, 60), 2, 9, 2, 3)
            R(s, (110, 80, 60), 8, 9, 2, 3)
        elif name == "desk":
            R(s, (130, 190, 220), 0, 4, 12, 8)
            R(s, (190, 230, 246), 0, 3, 12, 2)
            R(s, (250, 220, 120), 8, 0, 3, 3)
        elif name == "table":
            R(s, (236, 242, 250), 0, 3, 12, 3)
            R(s, (150, 160, 180), 1, 6, 2, 6)
            R(s, (150, 160, 180), 9, 6, 2, 6)
        elif name == "petbed":
            pygame.draw.ellipse(s, (240, 150, 120), (0, 4, 12, 8))
            pygame.draw.ellipse(s, (250, 220, 190), (2, 5, 8, 5))
        elif name == "outfit":
            c = color or (140, 196, 240)
            R(s, c, 2, 2, 8, 10)
            R(s, c, 0, 2, 2, 5)
            R(s, c, 10, 2, 2, 5)
            R(s, darker(c), 5, 2, 2, 3)
        elif name == "ball":
            pygame.draw.circle(s, (240, 90, 100), (6, 6), 5)
            pygame.draw.line(s, (250, 230, 120), (1, 6), (11, 6), 1)
            P(s, 4, 3, WHITE)
        elif name == "feather":
            pygame.draw.line(s, (150, 100, 70), (2, 11), (6, 6), 1)
            pygame.draw.ellipse(s, (130, 200, 240), (5, 0, 5, 8))
            pygame.draw.ellipse(s, (240, 150, 200), (6, 1, 3, 5))
        elif name == "biscuit":
            R(s, (220, 170, 100), 3, 4, 6, 4)
            pygame.draw.circle(s, (220, 170, 100), (3, 4), 2)
            pygame.draw.circle(s, (220, 170, 100), (3, 8), 2)
            pygame.draw.circle(s, (220, 170, 100), (9, 4), 2)
            pygame.draw.circle(s, (220, 170, 100), (9, 8), 2)
        elif name == "deluxe":
            pygame.draw.circle(s, (200, 110, 80), (6, 7), 4)
            R(s, (250, 250, 250), 3, 3, 6, 2)
            P(s, 6, 1, (240, 80, 90))
        elif name == "can":
            R(s, (200, 210, 226), 2, 2, 8, 9)
            R(s, (240, 150, 120), 2, 4, 8, 5)
            R(s, (250, 250, 250), 4, 5, 4, 3)
        elif name == "pill":
            R(s, (250, 250, 250), 2, 4, 4, 4)
            R(s, (240, 110, 130), 6, 4, 4, 4)
            pygame.draw.circle(s, (250, 250, 250), (2, 6), 2)
            pygame.draw.circle(s, (240, 110, 130), (9, 6), 2)
        elif name == "treat":
            pygame.draw.circle(s, (200, 130, 90), (6, 6), 5)
            pygame.draw.circle(s, (230, 170, 120), (5, 5), 2)
        elif name == "pilltreat":
            pygame.draw.circle(s, (200, 130, 90), (6, 6), 5)
            pygame.draw.circle(s, (230, 170, 120), (5, 5), 2)
            P(s, 7, 7, (240, 110, 130))
            P(s, 8, 7, (250, 250, 250))
        elif name == "towel":
            R(s, (250, 180, 200), 1, 1, 10, 10)
            R(s, (250, 220, 230), 1, 3, 10, 2)
            R(s, (250, 220, 230), 1, 8, 10, 1)
        elif name == "shower":
            R(s, (180, 190, 210), 1, 1, 7, 3)
            R(s, (180, 190, 210), 7, 1, 2, 9)
            for x in (1, 3, 5):
                P(s, x, 6, (120, 200, 250))
                P(s, x + 1, 9, (120, 200, 250))
        elif name == "brush":
            R(s, (180, 120, 80), 0, 5, 7, 3)
            R(s, (240, 220, 180), 7, 3, 4, 7)
            for y in (3, 5, 7, 9):
                P(s, 11, y, (200, 180, 140))
        elif name == "coin":
            pygame.draw.circle(s, (250, 210, 80), (6, 6), 5)
            pygame.draw.circle(s, (255, 236, 140), (6, 6), 3)
            R(s, (220, 160, 40), 5, 4, 2, 5)
        elif name == "heart":
            for p in ((2, 2), (3, 2), (7, 2), (8, 2)):
                pass
            pygame.draw.circle(s, (240, 80, 110), (4, 4), 3)
            pygame.draw.circle(s, (240, 80, 110), (8, 4), 3)
            pygame.draw.polygon(s, (240, 80, 110), [(1, 5), (11, 5), (6, 11)])
            P(s, 3, 3, (255, 200, 210))
        elif name == "heart_empty":
            pygame.draw.circle(s, (150, 130, 150), (4, 4), 3)
            pygame.draw.circle(s, (150, 130, 150), (8, 4), 3)
            pygame.draw.polygon(s, (150, 130, 150), [(1, 5), (11, 5), (6, 11)])
        elif name == "star":
            pygame.draw.polygon(s, color or (250, 210, 70), [(6, 0), (8, 4), (12, 4), (9, 7), (10, 11), (6, 9), (2, 11), (3, 7), (0, 4), (4, 4)])
        elif name == "star_empty":
            pygame.draw.polygon(s, (170, 160, 180), [(6, 0), (8, 4), (12, 4), (9, 7), (10, 11), (6, 9), (2, 11), (3, 7), (0, 4), (4, 4)])
        elif name == "bag":
            c = color or (176, 110, 60)
            R(s, (240, 230, 210), 2, 1, 8, 11)
            R(s, c, 2, 4, 8, 5)
            R(s, (210, 200, 180), 2, 1, 8, 1)
        elif name == "lock":
            R(s, (150, 150, 170), 2, 5, 8, 7)
            pygame.draw.rect(s, (150, 150, 170), (3, 1, 6, 6), 1)
        elif name == "check":
            pygame.draw.line(s, (80, 190, 100), (1, 6), (4, 9), 2)
            pygame.draw.line(s, (80, 190, 100), (4, 9), (10, 2), 2)
        elif name == "regular":
            pygame.draw.circle(s, (250, 210, 80), (6, 6), 5)
            s.blit(font.render("R", (150, 90, 30)), (5, 4))
        return outline(s)
    return cached(("icon", name, color), mk)


def big_icon(name, factor=2, color=None):
    return scaled(("bigicon", name, color), icon(name, color), factor)


def decor_icon(name):
    def mk():
        d = decor(name)
        w, h = d.get_size()
        f = min(12 / w, 12 / h)
        return pygame.transform.scale(d, (max(1, int(w * f)), max(1, int(h * f))))
    return cached(("decor_icon", name), mk)


def item_icon(item_id):
    it = data.STORE_ITEMS[item_id]
    if it["kind"] == "decor":
        return decor_icon(it["decor"])
    if it["kind"] == "outfit":
        return icon("outfit", data.OUTFITS[it["outfit"]]["scrub"])
    return icon(it["icon"])


# =================================================================== BADGES (16x16)
def badge(key, locked=False):
    def mk():
        b = data.BADGES[key]
        c1, c2 = b["c1"], b["c2"]
        s = new(16, 16)
        sh = b["shape"]
        if sh == "circle":
            pygame.draw.circle(s, c2, (8, 8), 7)
            pygame.draw.circle(s, c1, (8, 8), 5)
            R(s, c2, 7, 4, 2, 8)
        elif sh == "leaf":
            pygame.draw.ellipse(s, c1, (2, 1, 12, 14))
            pygame.draw.line(s, c2, (8, 2), (8, 14), 1)
            pygame.draw.line(s, c2, (8, 7), (5, 5), 1)
            pygame.draw.line(s, c2, (8, 10), (11, 8), 1)
        elif sh == "sun":
            for i in range(8):
                import math
                a = i * math.pi / 4
                pygame.draw.line(s, c2, (8, 8), (8 + int(7 * math.cos(a)), 8 + int(7 * math.sin(a))), 2)
            pygame.draw.circle(s, c1, (8, 8), 4)
        elif sh == "drop":
            pygame.draw.circle(s, c1, (8, 10), 5)
            pygame.draw.polygon(s, c1, [(3, 9), (13, 9), (8, 1)])
            P(s, 6, 9, WHITE)
        elif sh == "bolt":
            pygame.draw.polygon(s, c1, [(9, 0), (3, 9), (8, 9), (6, 15), (13, 6), (8, 6), (10, 0)])
        elif sh == "diamond":
            pygame.draw.polygon(s, c1, [(8, 1), (15, 7), (8, 15), (1, 7)])
            pygame.draw.polygon(s, c2, [(8, 1), (15, 7), (8, 7)])
        elif sh == "moon":
            pygame.draw.circle(s, c1, (8, 8), 7)
            pygame.draw.circle(s, (0, 0, 0, 0), (11, 6), 6)
            P(s, 12, 11, (255, 240, 150))
            P(s, 13, 3, (255, 240, 150))
        elif sh == "house":
            pygame.draw.polygon(s, c2, [(1, 7), (8, 1), (15, 7)])
            R(s, c1, 3, 7, 10, 8)
            R(s, c2, 7, 10, 3, 5)
        out = outline(s)
        if locked:
            out = silhouette(out, (150, 140, 160))
        else:
            out.set_at((5, 4), WHITE) if out.get_at((5, 4))[3] else None
        return out
    return cached(("badge", key, locked), mk)
