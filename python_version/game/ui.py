"""UI widgets: panels, buttons, sliders, dialogue box, particles, text input."""
import math
import random
import pygame
from . import font, sprites

INK = (52, 38, 64)
PAPER = (255, 248, 236)
BORDER = (96, 74, 120)
ACCENT = (240, 128, 160)
GOOD = (90, 190, 110)
BAD = (230, 90, 100)
GOLD = (240, 190, 70)
MUTED = (150, 136, 160)


def panel(s, rect, fill=PAPER, border=BORDER, shadow=True):
    r = pygame.Rect(rect)
    if shadow:
        sh = pygame.Surface((r.w, r.h), pygame.SRCALPHA)
        sh.fill((0, 0, 0, 60))
        s.blit(sh, (r.x + 2, r.y + 2))
    pygame.draw.rect(s, border, r)
    inner = r.inflate(-2, -2)
    pygame.draw.rect(s, fill, inner)
    pygame.draw.rect(s, sprites.lighter(fill, 0.5), (inner.x, inner.y, inner.w, 1))
    # cut corners for a soft pixel look
    for (x, y) in ((r.x, r.y), (r.right - 1, r.y), (r.x, r.bottom - 1), (r.right - 1, r.bottom - 1)):
        s.set_at((x, y), (0, 0, 0, 0)) if False else None
    return inner


def hearts(s, x, y, health, max_h=100, n=5):
    per = max_h / n
    for i in range(n):
        lo = i * per
        if health >= lo + per * 0.75:
            c = (236, 70, 100)
        elif health > lo + per * 0.25:
            c = (246, 160, 180)
        else:
            c = (160, 146, 166)
        font.draw(s, font.HEART, (x + i * 6, y), c)


def stars(s, x, y, n, total=5, scale=1):
    for i in range(total):
        c = (250, 200, 60) if i < n else (180, 170, 190)
        font.draw(s, font.STAR, (x + i * 6 * scale, y), c, scale)


class Button:
    def __init__(self, rect, text, cb=None, enabled=True, icon=None, color=None, key=None, small=False):
        self.rect = pygame.Rect(rect)
        self.text = text
        self.cb = cb
        self.enabled = enabled
        self.icon = icon
        self.color = color or (255, 236, 214)
        self.selected = False
        self.key = key
        self.visible = True

    def hover(self, mpos):
        return self.rect.collidepoint(mpos)

    def handle(self, e, game):
        if not (self.visible and self.enabled):
            return False
        hit = False
        if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1 and self.hover(game.mpos):
            hit = True
        if e.type == pygame.KEYDOWN and self.key is not None and e.key == self.key:
            hit = True
        if hit:
            game.audio.play("select")
            if self.cb:
                self.cb()
            return True
        return False

    def draw(self, s, mpos):
        if not self.visible:
            return
        hov = self.enabled and self.hover(mpos)
        fill = self.color
        if self.selected:
            fill = (250, 200, 214)
        if hov:
            fill = sprites.lighter(fill, 0.4)
        if not self.enabled:
            fill = (214, 206, 216)
        r = self.rect.move(0, -1) if hov else self.rect
        panel(s, r, fill, BORDER, shadow=not hov)
        col = INK if self.enabled else MUTED
        tx = r.centerx
        if self.icon is not None:
            iw = self.icon.get_width()
            total = iw + 3 + font.text_width(self.text)
            ix = r.centerx - total // 2
            s.blit(self.icon, (ix, r.centery - self.icon.get_height() // 2))
            font.draw(s, self.text, (ix + iw + 3, r.centery - 2), col)
        else:
            font.draw(s, self.text, (tx, r.centery - 2), col, align="center")


class Slider:
    def __init__(self, rect, value, on_change):
        self.rect = pygame.Rect(rect)
        self.value = value
        self.on_change = on_change
        self.drag = False

    def handle(self, e, game):
        if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1 and self.rect.inflate(6, 8).collidepoint(game.mpos):
            self.drag = True
            self._set(game)
            return True
        if e.type == pygame.MOUSEBUTTONUP and e.button == 1:
            if self.drag:
                game.audio.play("blip")
            self.drag = False
        if e.type == pygame.MOUSEMOTION and self.drag:
            self._set(game)
        if e.type == pygame.KEYDOWN and self.rect.collidepoint(game.mpos):
            if e.key in (pygame.K_LEFT, pygame.K_a):
                self.value = max(0.0, self.value - 0.1)
                self.on_change(self.value)
            if e.key in (pygame.K_RIGHT, pygame.K_d):
                self.value = min(1.0, self.value + 0.1)
                self.on_change(self.value)
        return False

    def _set(self, game):
        v = (game.mpos[0] - self.rect.x) / max(1, self.rect.w)
        self.value = max(0.0, min(1.0, v))
        self.on_change(self.value)

    def draw(self, s, mpos):
        r = self.rect
        pygame.draw.rect(s, BORDER, (r.x, r.centery - 1, r.w, 3))
        pygame.draw.rect(s, ACCENT, (r.x, r.centery - 1, int(r.w * self.value), 3))
        kx = r.x + int(r.w * self.value)
        pygame.draw.rect(s, BORDER, (kx - 3, r.centery - 4, 6, 9))
        pygame.draw.rect(s, PAPER, (kx - 2, r.centery - 3, 4, 7))
        font.draw(s, f"{int(self.value * 100)}%", (r.right + 6, r.centery - 2), INK)


class DialogueBox:
    """Classic RPG box: typewriter text, blinking arrow, optional choices."""

    def __init__(self, game, pages, on_done=None, choices=None):
        # pages: list of (speaker, portrait_surface or None, text)
        self.game = game
        self.pages = pages
        self.i = 0
        self.chars = 0.0
        self.on_done = on_done
        self.choices = choices or []
        self.done = False
        self.buttons = []
        self.tick = 0
        self.rect = pygame.Rect(6, 132, 308, 44)

    @property
    def page(self):
        return self.pages[self.i]

    def _full(self):
        return self.chars >= len(self.page[2])

    def _advance(self):
        if not self._full():
            self.chars = len(self.page[2])
            return
        if self.i < len(self.pages) - 1:
            self.i += 1
            self.chars = 0
            self.game.audio.play("blip", 0.6)
        elif not self.choices:
            self.finish()

    def finish(self, choice=None):
        self.done = True
        if choice:
            choice()
        elif self.on_done:
            self.on_done()

    def _make_buttons(self):
        if self.buttons or not self.choices:
            return
        n = len(self.choices)
        bw = 60
        x0 = self.rect.right - 6 - n * (bw + 4)
        for j, (label, cb) in enumerate(self.choices):
            self.buttons.append(Button((x0 + j * (bw + 4), self.rect.y - 16, bw, 14), label,
                                       (lambda c=cb: self.finish(c))))

    def event(self, e):
        if self.done:
            return
        last = self.i == len(self.pages) - 1
        if last and self.choices and self._full():
            self._make_buttons()
            for b in self.buttons:
                if b.handle(e, self.game):
                    return
            if e.type == pygame.KEYDOWN and e.key in (pygame.K_1, pygame.K_y):
                self.finish(self.choices[0][1])
            elif e.type == pygame.KEYDOWN and len(self.choices) > 1 and e.key in (pygame.K_2, pygame.K_n, pygame.K_ESCAPE):
                self.finish(self.choices[1][1])
            return
        if e.type == pygame.KEYDOWN and e.key in (pygame.K_e, pygame.K_SPACE, pygame.K_RETURN):
            self._advance()
        elif e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
            self._advance()

    def update(self, dt):
        if self.done:
            return
        before = int(self.chars)
        self.chars = min(len(self.page[2]), self.chars + dt * 45)
        if int(self.chars) != before and int(self.chars) % 3 == 0:
            self.game.audio.play("tick", 0.5)

    def draw(self, s):
        if self.done:
            return
        name, portrait, text = self.page
        inner = panel(s, self.rect, PAPER, BORDER)
        tx = inner.x + 4
        if portrait is not None:
            pr = pygame.Rect(inner.x + 3, inner.y + 3, 30, 34)
            pygame.draw.rect(s, (250, 220, 230), pr)
            pygame.draw.rect(s, BORDER, pr, 1)
            s.blit(portrait, (pr.x + 3, pr.y + 3))
            tx = pr.right + 5
        if name:
            nw = font.text_width(name) + 8
            nr = pygame.Rect(tx - 2, self.rect.y - 7, nw, 10)
            panel(s, nr, (250, 214, 226), BORDER, shadow=False)
            font.draw(s, name, (nr.x + 4, nr.y + 3), INK)
        shown = text[:int(self.chars)]
        font.draw_wrapped(s, shown, (tx, inner.y + 6, inner.right - tx - 8, 40), INK)
        if self._full():
            if self.i == len(self.pages) - 1 and self.choices:
                self._make_buttons()
                for b in self.buttons:
                    b.draw(s, self.game.mpos)
            elif int(self.game.time * 3) % 2 == 0:
                ax, ay = inner.right - 8, inner.bottom - 7
                pygame.draw.polygon(s, ACCENT, [(ax, ay), (ax + 5, ay), (ax + 2, ay + 3)])


class Particles:
    def __init__(self):
        self.items = []

    def add(self, kind, x, y, n=1, **kw):
        for _ in range(n):
            p = dict(kind=kind, x=float(x), y=float(y), t=0.0, life=kw.get("life", 0.8),
                     vx=kw.get("vx", random.uniform(-30, 30)), vy=kw.get("vy", random.uniform(-60, -20)),
                     g=kw.get("g", 0.0), text=kw.get("text"), color=kw.get("color", (255, 255, 255)))
            if kind == "coin":
                p.update(vx=random.uniform(-40, 40), vy=random.uniform(-110, -70), g=260, life=1.1, floor=y + 6)
            self.items.append(p)

    def burst(self, kind, x, y, n=8, spread=40):
        for _ in range(n):
            self.add(kind, x + random.uniform(-spread / 4, spread / 4), y + random.uniform(-spread / 4, spread / 4),
                     vx=random.uniform(-spread, spread), vy=random.uniform(-spread * 1.5, -spread * 0.2))

    def text(self, txt, x, y, color=INK, life=1.2):
        self.items.append(dict(kind="text", x=float(x), y=float(y), t=0.0, life=life, vx=0, vy=-18, g=0,
                               text=txt, color=color))

    def update(self, dt):
        for p in self.items:
            p["t"] += dt
            p["vy"] += p["g"] * dt
            p["x"] += p["vx"] * dt
            p["y"] += p["vy"] * dt
            if p["kind"] == "coin" and p["y"] > p.get("floor", 999):
                p["y"] = p["floor"]
                p["vy"] *= -0.5
                p["vx"] *= 0.6
        self.items = [p for p in self.items if p["t"] < p["life"]]

    def draw(self, s):
        for p in self.items:
            x, y = int(p["x"]), int(p["y"])
            k = p["kind"]
            fade = 1 - p["t"] / p["life"]
            if k == "sparkle":
                c = (255, 250, 200) if int(p["t"] * 12) % 2 else (255, 220, 120)
                r = 2 if fade > 0.5 else 1
                pygame.draw.line(s, c, (x - r, y), (x + r, y))
                pygame.draw.line(s, c, (x, y - r), (x, y + r))
            elif k == "heart":
                font.draw(s, font.HEART, (x - 2, y - 2), (240, 90, 120))
            elif k == "coin":
                w = max(1, int(abs(math.cos(p["t"] * 10)) * 5))
                pygame.draw.ellipse(s, (250, 210, 80), (x - w // 2, y - 3, w, 6))
            elif k == "bubble":
                pygame.draw.circle(s, (230, 246, 255), (x, y), 2, 1)
            elif k == "drop":
                pygame.draw.rect(s, (120, 200, 250), (x, y, 1, 2))
            elif k == "puff":
                pygame.draw.circle(s, (240, 236, 230), (x, y), max(1, int(3 * fade)))
            elif k == "mud":
                pygame.draw.rect(s, (140, 100, 60), (x, y, 2, 2))
            elif k == "text":
                font.draw(s, p["text"], (x, y), p["color"], shadow=(255, 255, 255), align="center")


class TextInput:
    def __init__(self, rect, text="", max_len=12):
        self.rect = pygame.Rect(rect)
        self.text = text
        self.max_len = max_len

    def handle(self, e):
        if e.type == pygame.KEYDOWN:
            if e.key == pygame.K_BACKSPACE:
                self.text = self.text[:-1]
                return True
        if e.type == pygame.TEXTINPUT:
            for ch in e.text:
                if len(self.text) < self.max_len and (ch.isalnum() or ch in " '-!."):
                    self.text += ch
            return True
        return False

    def draw(self, s, t):
        panel(s, self.rect, (255, 255, 255), BORDER, shadow=False)
        font.draw(s, self.text, (self.rect.x + 4, self.rect.y + self.rect.h // 2 - 2), INK)
        if int(t * 2) % 2 == 0:
            cx = self.rect.x + 5 + font.text_width(self.text)
            pygame.draw.rect(s, INK, (cx, self.rect.y + 3, 1, self.rect.h - 6))
