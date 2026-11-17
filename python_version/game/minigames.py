"""Treatment station mini-games. Each scores 0-100.

Station -> mini-games:
  exam  : ExamGame (tools reveal clues, pick diagnosis)
  bath  : BathGame (scrub mud, catch fleas, rinse, dry, trim, brush tangles)
  meds  : MedsGame (fill syringe, pill-in-treat, timed shot)
  care  : CareGame (choose & pour food, wrap bandage)
"""
import math
import random
import pygame
from . import data, font, sprites, ui, state as gstate

SW, SH = 320, 180
AREA = pygame.Rect(0, 32, 320, 136)


# ----------------------------------------------------------------- symptom overlays
def draw_symptoms(s, p, x, y, f, t, skip=()):
    """Draw visible symptoms on an animal sprite of size 24*f at (x, y)."""
    um = p.untreated
    if "fleas" in um and "fleas" not in skip:
        for i, (ux, uy) in enumerate(((9, 15), (14, 13), (12, 19))):
            hop = abs(math.sin(t * 7 + i * 2.1)) * 3
            pygame.draw.rect(s, (50, 40, 40), (x + int(ux * f), y + int((uy - hop) * f), max(1, f), max(1, f)))
    if "mud" in um and "mud" not in skip:
        for ux, uy, w, h in ((6, 15, 4, 3), (14, 17, 5, 3), (9, 6, 3, 2)):
            pygame.draw.ellipse(s, (140, 100, 62), (x + int(ux * f), y + int(uy * f), max(2, int(w * f)), max(2, int(h * f))))
    if "matted" in um and "matted" not in skip:
        for ux, uy in ((5, 13), (17, 14), (8, 4), (15, 4)):
            pts = [(x + int((ux + i) * f), y + int((uy + (i % 2) * 1.2) * f)) for i in range(4)]
            pygame.draw.lines(s, (90, 70, 60), False, pts, max(1, f // 2 or 1))
    if "fever" in um:
        for ux in (5.5, 16.5):
            pygame.draw.ellipse(s, (240, 90, 100), (x + int(ux * f), y + int(10 * f), max(2, int(2 * f)), max(1, int(1.5 * f))))
        dy = int((math.sin(t * 3) + 1) * f)
        pygame.draw.circle(s, (130, 200, 250), (x + int(19 * f), y + int(5 * f) + dy), max(1, int(1.2 * f)))
    if "infection" in um and "infection" not in skip:
        cx, cy = x + int(16 * f), y + int(15 * f)
        pygame.draw.line(s, (220, 60, 70), (cx, cy), (cx + int(3 * f), cy + int(3 * f)), max(1, f // 2 or 1))
        pygame.draw.line(s, (220, 60, 70), (cx + int(1 * f), cy), (cx + int(4 * f), cy + int(3 * f)), max(1, f // 2 or 1))
    if "paw" in um and "paw" not in skip:
        pygame.draw.circle(s, (240, 90, 100), (x + int(8 * f), y + int(22 * f)), max(1, int(1.2 * f)))
    if "tummy" in um and "tummy" not in skip:
        if int(t * 2) % 2 == 0:
            font.draw(s, "~", (x + int(10 * f), y + int(16 * f)), (110, 190, 90), max(1, f // 2))
    if "hungry" in um and "hungry" not in skip:
        bx, by = x + int(18 * f), y + int(1 * f)
        w = max(9, int(8 * f))
        pygame.draw.ellipse(s, (255, 255, 255), (bx, by, w, max(7, int(6 * f))))
        pygame.draw.ellipse(s, ui.BORDER, (bx, by, w, max(7, int(6 * f))), 1)
        pygame.draw.rect(s, (200, 140, 90), (bx + w // 4, by + max(3, int(3 * f)), w // 2, max(2, int(1.5 * f))))


# ----------------------------------------------------------------- base
class Minigame:
    station = "exam"
    title = "Station"
    hint = ""

    def __init__(self, scene, patient):
        self.scene = scene
        self.game = scene.game
        self.st = scene.game.state
        self.p = patient
        self.t = 0.0
        self.done = False
        self.score = 100.0
        self.penalty = 0.0
        pi = data.PERSONALITY_INFO[patient.personality]
        self.diff = gstate.minigame_difficulty(self.st) * pi["speed"]
        self.level = gstate.rank_level(self.st["xp"])
        self.ax, self.ay = 160, 90
        self.hissing = 0.0
        self.hiss_cd = random.uniform(2.5, 4.5)
        self.particles = scene.particles
        self.msg = None
        self.msg_t = 0

    # helpers
    def has(self, item):
        return gstate.has(self.st, item)

    def flash(self, text, color=ui.INK):
        self.msg = (text, color)
        self.msg_t = 1.4

    def wiggle(self):
        if self.p.personality == "nervous":
            return int(math.sin(self.t * 8) * 3 + math.sin(self.t * 13) * 1.5)
        return 0

    def arect(self):
        return pygame.Rect(self.ax - 36 + self.wiggle(), self.ay - 36, 72, 72)

    def upx(self, ux, uy):
        r = self.arect()
        return (r.x + ux * 3, r.y + uy * 3)

    def mistake(self, amount, text="Oops!"):
        self.penalty += amount
        self.game.shake(3, 0.2)
        self.game.audio.play("error")
        mx, my = self.game.mpos
        self.particles.text(text, mx, my - 6, ui.BAD)

    def guard(self, e):
        """Grumpy hiss: clicking the animal while it hisses gets you nipped."""
        if self.hissing > 0 and e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
            if self.arect().inflate(10, 10).collidepoint(self.game.mpos):
                self.mistake(8, "NIP!")
                self.game.audio.play("hiss")
                return True
        return False

    def base_update(self, dt):
        self.t += dt
        if self.msg_t > 0:
            self.msg_t -= dt
        if self.p.personality == "grumpy":
            if self.hissing > 0:
                self.hissing -= dt
            else:
                self.hiss_cd -= dt
                if self.hiss_cd <= 0:
                    self.hissing = 1.1
                    self.hiss_cd = random.uniform(3.5, 6.5) / max(1, self.diff * 0.8)
                    self.game.audio.play("hiss", 0.6)

    def finish(self, score=None):
        if self.done:
            return
        if score is None:
            score = self.score - self.penalty
        self.final = max(5, min(100, int(round(score))))
        self.done = True

    def mood(self, default=None):
        if self.hissing > 0:
            return "angry"
        if default:
            return default
        return "sick" if self.p.untreated - {"checkup"} else "normal"

    def draw_animal(self, s, mood=None, skip=(), frame=None):
        r = self.arect()
        fr = int(self.t * 2) % 2 if frame is None else frame
        img = sprites.animal_big(self.p.kind, self.p.variant, fr, self.mood(mood))
        s.blit(img, r.topleft)
        draw_symptoms(s, self.p, r.x, r.y, 3, self.t, skip)
        if self.hissing > 0:
            font.draw(s, "HISS!", (r.right - 4, r.y + 2), ui.BAD, shadow=(255, 255, 255))

    def draw_common(self, s):
        if self.msg and self.msg_t > 0:
            font.draw(s, self.msg[0], (160, 150), self.msg[1], shadow=(255, 255, 255), align="center")
        if self.hint:
            ui.panel(s, (2, 158, 316, 9), (52, 38, 64), (52, 38, 64), shadow=False)
            font.draw(s, self.hint, (160, 160), (255, 240, 220), align="center")

    def draw_tool_cursor(self, s, name):
        mx, my = self.game.mpos
        img = sprites.big_icon(name, 2)
        s.blit(img, (mx - 12, my - 12))

    def event(self, e):
        pass

    def update(self, dt):
        self.base_update(dt)

    def draw(self, s):
        pass


def bg_room(s, wall, floor_a, floor_b, wall_line=None):
    pygame.draw.rect(s, wall, (0, 32, 320, 48))
    if wall_line:
        for x in range(0, 320, 12):
            pygame.draw.rect(s, wall_line, (x, 32, 1, 48))
    pygame.draw.rect(s, sprites.darker(wall, 0.85), (0, 78, 320, 3))
    for y in range(81, 168, 10):
        for x in range(0, 320, 10):
            c = floor_a if ((x // 10) + (y // 10)) % 2 else floor_b
            pygame.draw.rect(s, c, (x, y, 10, 10))


def step_chips(s, steps, idx):
    total = sum(font.text_width(n.upper()) + 10 for n in steps) + 4 * (len(steps) - 1)
    x = 160 - total // 2
    for i, n in enumerate(steps):
        w = font.text_width(n.upper()) + 10
        col = (250, 200, 214) if i == idx else ((200, 236, 200) if i < idx else (240, 236, 244))
        ui.panel(s, (x, 35, w, 11), col, ui.BORDER, shadow=False)
        font.draw(s, n.upper(), (x + 5, 38), ui.INK)
        x += w + 4


# ======================================================================= EXAM
class ExamGame(Minigame):
    station = "exam"
    title = "Exam & Diagnosis"
    hint = "DRAG TOOLS OVER THE GLOWING SPOTS - THEN CLICK A DIAGNOSIS (1/2/3)"
    TOOLS = [("steth", "Stethoscope", (12, 16)), ("thermo", "Thermometer", (6, 6)), ("mag", "Magnifier", (18, 12))]

    def __init__(self, scene, patient):
        super().__init__(scene, patient)
        self.ax, self.ay = 150, 90
        self.progress = {k: 0.0 for k, _, _ in self.TOOLS}
        self.drag = None
        self.tray = {k: pygame.Rect(10, 42 + i * 36, 30, 30) for i, (k, _, _) in enumerate(self.TOOLS)}
        self.cards = None
        self.wrong = set()
        self.rate = (1 / 1.0) * (1.9 if self.has("golden_steth") else 1.0)

    def clues(self):
        out = {}
        for k, _, _ in self.TOOLS:
            lines = [data.AILMENTS[a]["clues"][k] for a in self.p.ailments if data.AILMENTS[a]["clues"][k]]
            out[k] = " / ".join(lines) if lines else data.NORMAL_CLUES[k]
        return out

    def make_cards(self):
        correct = tuple(sorted(self.p.ailments))
        opts = {correct}
        pool = [a for a in data.AILMENTS if a != "checkup"]
        tries = 0
        while len(opts) < 3 and tries < 200:
            tries += 1
            if correct == ("checkup",):
                cand = (random.choice(pool),)
            elif len(correct) == 1 and random.random() < 0.25:
                cand = ("checkup",)
            else:
                c = list(correct)
                c[random.randrange(len(c))] = random.choice([a for a in pool if a not in c])
                cand = tuple(sorted(set(c)))
            opts.add(cand)
        opts = list(opts)
        random.shuffle(opts)
        self.cards = [dict(opt=o, rect=pygame.Rect(46 + i * 78, 134, 74, 22), correct=o == correct) for i, o in enumerate(opts)]

    @staticmethod
    def label(opt):
        if opt == ("checkup",):
            return "Healthy! (Check-up)"
        return " + ".join(data.AILMENTS[a]["name"] for a in opt)

    def hotspot(self, k):
        for key, _, (ux, uy) in self.TOOLS:
            if key == k:
                return self.upx(ux, uy)

    def pick(self, i):
        c = self.cards[i]
        if i in self.wrong:
            return
        if c["correct"]:
            self.game.audio.play("sparkle")
            over = max(0, self.t - 14) * 1.5
            self.finish(100 - self.penalty - min(30, over))
        else:
            self.wrong.add(i)
            self.mistake(25, "Not quite!")

    def event(self, e):
        if self.guard(e):
            return
        if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
            if self.cards:
                for i, c in enumerate(self.cards):
                    if c["rect"].collidepoint(self.game.mpos):
                        self.pick(i)
                        return
            for k, r in self.tray.items():
                if r.collidepoint(self.game.mpos):
                    self.drag = k
                    self.game.audio.play("blip")
                    return
        elif e.type == pygame.MOUSEBUTTONUP and e.button == 1:
            self.drag = None
        elif e.type == pygame.KEYDOWN and self.cards and e.key in (pygame.K_1, pygame.K_2, pygame.K_3):
            self.pick({pygame.K_1: 0, pygame.K_2: 1, pygame.K_3: 2}[e.key])

    def update(self, dt):
        super().update(dt)
        if self.drag and self.progress[self.drag] < 1:
            hx, hy = self.hotspot(self.drag)
            mx, my = self.game.mpos
            if math.hypot(mx - hx, my - hy) < 13:
                self.progress[self.drag] += dt * self.rate
                if int(self.t * 10) % 3 == 0:
                    self.particles.add("sparkle", hx + random.randint(-6, 6), hy + random.randint(-6, 6), life=0.4)
                if self.progress[self.drag] >= 1:
                    self.progress[self.drag] = 1
                    self.game.audio.play("star")
                    self.particles.burst("sparkle", hx, hy, 6, 20)
        if self.cards is None and all(v >= 1 for v in self.progress.values()):
            self.make_cards()
            self.game.audio.play("chime", 0.5)

    def draw(self, s):
        bg_room(s, (196, 236, 226), (236, 244, 250), (220, 234, 246), (184, 226, 214))
        s.blit(sprites.obj("table"), (102, 120))
        self.draw_animal(s)
        # hotspots
        for k, _, _ in self.TOOLS:
            if self.progress[k] >= 1:
                continue
            hx, hy = self.hotspot(k)
            if self.drag == k:
                r = 9 + int(math.sin(self.t * 8) * 2)
                pygame.draw.circle(s, (255, 240, 120), (hx, hy), r, 1)
                if self.progress[k] > 0:
                    pygame.draw.rect(s, ui.BORDER, (hx - 10, hy + 12, 20, 3))
                    pygame.draw.rect(s, ui.GOOD, (hx - 10, hy + 12, int(20 * self.progress[k]), 3))
            elif int(self.t * 2) % 2:
                pygame.draw.circle(s, (255, 255, 255), (hx, hy), 3, 1)
        # tray
        ui.panel(s, (6, 38, 38, 112), (255, 246, 236), ui.BORDER)
        for k, r in self.tray.items():
            done = self.progress[k] >= 1
            pygame.draw.rect(s, (220, 246, 220) if done else (246, 236, 246), r)
            if self.drag != k:
                s.blit(sprites.big_icon(k, 2), (r.x + 3, r.y + 3))
            if done:
                s.blit(sprites.icon("check"), (r.right - 11, r.y))
        # clipboard
        cb = pygame.Rect(214, 38, 102, 92)
        ui.panel(s, cb, (252, 250, 240), (150, 110, 80))
        pygame.draw.rect(s, (190, 190, 200), (cb.centerx - 10, cb.y - 2, 20, 5))
        font.draw(s, "CLUES", (cb.x + 6, cb.y + 5), ui.ACCENT)
        clues = self.clues()
        y = cb.y + 14
        for k, name, _ in self.TOOLS:
            s.blit(sprites.icon(k), (cb.x + 4, y))
            txt = clues[k] if self.progress[k] >= 1 else "???"
            y = font.draw_wrapped(s, txt, (cb.x + 18, y + 3, 80, 30), ui.INK if self.progress[k] >= 1 else ui.MUTED) + 3
        sym = data.AILMENTS[self.p.ailments[0]]["symptom"]
        font.draw_wrapped(s, "OWNER: " + sym, (214, 134, 102, 20), (110, 90, 120))
        if self.cards:
            font.draw(s, "WHAT'S THE DIAGNOSIS?", (120, 126), ui.ACCENT, shadow=(255, 255, 255), align="center")
            for i, c in enumerate(self.cards):
                hov = c["rect"].collidepoint(self.game.mpos) and i not in self.wrong
                col = (214, 206, 216) if i in self.wrong else ((255, 236, 180) if hov else (255, 250, 236))
                ui.panel(s, c["rect"].move(0, -1 if hov else 0), col, ui.BORDER)
                font.draw(s, str(i + 1), (c["rect"].x + 3, c["rect"].y + 3), ui.ACCENT)
                font.draw_wrapped(s, self.label(c["opt"]), (c["rect"].x + 9, c["rect"].y + 4, 62, 20),
                                  ui.MUTED if i in self.wrong else ui.INK)
        if self.drag:
            self.draw_tool_cursor(s, self.drag)
        self.draw_common(s)


# ======================================================================= BATH & GROOM
class BathGame(Minigame):
    station = "bath"
    title = "Bath & Grooming"
    HINTS = dict(scrub="HOLD & RUB THE SPONGE OVER THE MUD", fleas="CLICK THE FLEAS BEFORE THEY HOP AWAY!",
                 rinse="HOLD THE MOUSE TO SPRAY AWAY ALL THE SUDS", dry="HOLD & RUB THE TOWEL BACK AND FORTH",
                 trim="HOLD & TRACE THE DOTTED LINE FROM START TO END", tangles="HOLD & BRUSH EACH KNOT UNTIL IT'S GONE")
    TOOLS = dict(scrub="sponge", fleas="comb", rinse="shower", dry="towel", trim="shears", tangles="brush")

    def __init__(self, scene, patient):
        super().__init__(scene, patient)
        tasks = patient.tasks_for("bath")
        self.steps = []
        if "scrub" in tasks:
            self.steps.append("scrub")
        if "fleas" in tasks:
            self.steps.append("fleas")
        if self.steps:
            self.steps += ["rinse", "dry"]
        if "groom" in tasks:
            self.steps += ["trim", "tangles"]
        self.idx = -1
        self.step_scores = []
        self.last_m = self.game.mpos
        self.fleas_caught = 0
        self.ax, self.ay = 160, 86
        self.next_step()

    @property
    def step(self):
        return self.steps[self.idx]

    @property
    def hint(self):
        return self.HINTS.get(self.step, "")

    def next_step(self):
        if self.idx >= 0:
            self.step_scores.append(max(5, min(100, self.step_score())))
        self.idx += 1
        self.step_t = 0.0
        self.step_pen = 0.0
        if self.idx >= len(self.steps):
            self.finish(sum(self.step_scores) / len(self.step_scores) if self.step_scores else 100)
            return
        st = self.step
        if st != self.steps[0]:
            self.game.audio.play("star")
        if st == "scrub":
            spots = [(8, 15), (15, 17), (11, 19), (7, 8), (16, 9), (12, 12), (13, 5), (5, 12)]
            random.shuffle(spots)
            n = min(len(spots), 3 + int(self.diff))
            self.patches = [dict(u=u, dirt=1.0) for u in spots[:n]]
        elif st == "fleas":
            self.flea_total = min(12, 4 + self.level + (2 if self.p.personality == "nervous" else 0))
            self.flea_spawned = 0
            self.fleas = []
            self.spawn_cd = 0.3
            self.missed = 0
        elif st == "rinse":
            self.suds = {}
            for gx in range(8):
                for gy in range(8):
                    ux, uy = 1.5 + gx * 2.7, 2 + gy * 2.5
                    if ((ux - 12) / 10) ** 2 + ((uy - 12) / 10.5) ** 2 < 1:
                        self.suds[(gx, gy)] = 1.0
            self.suds_total = len(self.suds)
        elif st == "dry":
            self.dry = 0.0
        elif st == "trim":
            self.path = []
            n = 22
            for i in range(n + 1):
                a = math.pi * (1.1 + 0.8 * i / n)
                rr = 12.5 + math.sin(i * 1.3) * 0.8
                self.path.append((12 + math.cos(a) * rr, 13 + math.sin(a) * rr))
            self.trim_i = 0
            self.mistakes = 0
            self.snip_cd = 0
            self.tol = 7 * (1.6 if self.has("pro_shears") else 1.0)
        elif st == "tangles":
            spots = [(6, 12), (17, 13), (10, 18), (14, 7), (8, 5), (16, 19)]
            random.shuffle(spots)
            n = min(len(spots), 2 + self.level // 2)
            self.knots = [dict(u=u, prog=0.0) for u in spots[:n]]

    def step_score(self):
        st = self.step
        if st == "fleas":
            base = 100 * self.fleas_hit / max(1, self.flea_total)
            return base - self.step_pen
        par = dict(scrub=8, rinse=6, dry=5, trim=10, tangles=8).get(st, 8)
        return 100 - self.step_pen - max(0, self.step_t - par) * 3

    @property
    def fleas_hit(self):
        return getattr(self, "_fh", 0)

    def event(self, e):
        if self.done or self.guard(e):
            return
        if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1 and self.step == "fleas":
            mx, my = self.game.mpos
            rad = 5 * (1.9 if self.has("flea_comb") else 1.0)
            for f in self.fleas:
                if f.get("dead") or f.get("gone"):
                    continue
                fx, fy = self.flea_pos(f)
                if math.hypot(mx - fx, my - fy) < rad + 2:
                    f["dead"] = True
                    self._fh = self.fleas_hit + 1
                    self.fleas_caught += 1
                    self.game.audio.play("pop")
                    self.particles.burst("sparkle", fx, fy, 4, 14)
                    return
            self.step_pen += 2

    def flea_pos(self, f):
        k = min(1.0, f["hop_t"] / f["hop_dur"])
        ux = f["from"][0] + (f["to"][0] - f["from"][0]) * k
        uy = f["from"][1] + (f["to"][1] - f["from"][1]) * k - math.sin(k * math.pi) * 3
        return self.upx(ux, uy)

    def update(self, dt):
        super().update(dt)
        if self.done:
            return
        self.step_t += dt
        m = self.game.mpos
        moved = math.hypot(m[0] - self.last_m[0], m[1] - self.last_m[1])
        self.last_m = m
        held = self.game.mouse_down and self.hissing <= 0
        st = self.step
        if st == "scrub":
            rate = 0.014 * (2.0 if self.has("super_sponge") else 1.0)
            for pch in self.patches:
                if pch["dirt"] <= 0:
                    continue
                px, py = self.upx(*pch["u"])
                if held and math.hypot(m[0] - px, m[1] - py) < 14:
                    pch["dirt"] -= moved * rate + dt * 0.15
                    if random.random() < 0.3:
                        self.particles.add("bubble", m[0] + random.randint(-6, 6), m[1] + random.randint(-6, 6), life=0.6)
                    if moved > 2 and int(self.t * 12) % 3 == 0:
                        self.game.audio.play("scrub", 0.5)
                    if pch["dirt"] <= 0:
                        self.game.audio.play("blip")
            if all(p["dirt"] <= 0 for p in self.patches):
                self.next_step()
        elif st == "fleas":
            self.spawn_cd -= dt
            alive = [f for f in self.fleas if not f.get("dead") and not f.get("gone")]
            if self.spawn_cd <= 0 and self.flea_spawned < self.flea_total and len(alive) < 4:
                self.spawn_cd = random.uniform(0.4, 1.0) / self.diff
                u = (random.uniform(6, 18), random.uniform(6, 20))
                self.fleas.append(dict(**{"from": u, "to": u}, hop_t=1, hop_dur=1, cd=0.2, life=5.5 / self.diff))
                self.flea_spawned += 1
            for f in alive:
                f["life"] -= dt
                f["hop_t"] += dt
                if f["hop_t"] >= f["hop_dur"]:
                    f["cd"] -= dt
                    if f["cd"] <= 0:
                        f["from"] = f["to"]
                        f["to"] = (random.uniform(5, 19), random.uniform(5, 20))
                        f["hop_t"] = 0
                        f["hop_dur"] = random.uniform(0.25, 0.45) / self.diff
                        f["cd"] = random.uniform(0.3, 0.7) / self.diff
                if f["life"] <= 0:
                    f["gone"] = True
                    self.missed += 1
                    fx, fy = self.flea_pos(f)
                    self.particles.text("Escaped!", fx, fy, ui.MUTED, 0.8)
            if self.flea_spawned >= self.flea_total and not any(not f.get("dead") and not f.get("gone") for f in self.fleas):
                self.next_step()
        elif st == "rinse":
            if held:
                for (gx, gy), v in list(self.suds.items()):
                    cx, cy = self.upx(1.5 + gx * 2.7, 2 + gy * 2.5)
                    if math.hypot(m[0] - cx, m[1] - cy) < 15:
                        self.suds[(gx, gy)] = v - dt * 4
                        if self.suds[(gx, gy)] <= 0:
                            del self.suds[(gx, gy)]
                self.particles.add("drop", m[0] + random.randint(-5, 5), m[1] + 6, vx=0, vy=90, life=0.3)
                if int(self.t * 10) % 4 == 0:
                    self.game.audio.play("splash", 0.25)
            if len(self.suds) <= self.suds_total * 0.08:
                self.next_step()
        elif st == "dry":
            if held and self.arect().inflate(20, 10).collidepoint(m):
                self.dry += moved / 520
                if moved > 3 and random.random() < 0.2:
                    self.particles.add("drop", m[0], m[1], life=0.4, vy=-20)
            if self.dry >= 1:
                self.particles.burst("sparkle", self.ax, self.ay, 10, 30)
                self.next_step()
        elif st == "trim":
            self.snip_cd -= dt
            if held and self.trim_i < len(self.path):
                best = None
                for j in range(self.trim_i, min(len(self.path), self.trim_i + 3)):
                    px, py = self.upx(*self.path[j])
                    d = math.hypot(m[0] - px, m[1] - py)
                    if d < self.tol * 1.4:
                        best = j
                if best is not None:
                    if best >= self.trim_i:
                        self.trim_i = best + 1
                        if self.trim_i % 3 == 0:
                            self.game.audio.play("tick")
                        px, py = self.upx(*self.path[best])
                        self.particles.add("puff", px, py, life=0.4)
                else:
                    near = min(math.hypot(m[0] - self.upx(*q)[0], m[1] - self.upx(*q)[1]) for q in self.path)
                    if near > self.tol * 2.2 and self.trim_i > 0 and self.snip_cd <= 0:
                        self.snip_cd = 0.5
                        self.mistakes += 1
                        self.step_pen += 8
                        self.particles.text("Off the line!", m[0], m[1] - 8, ui.BAD, 0.8)
                        self.game.audio.play("error", 0.6)
            if self.trim_i >= len(self.path):
                self.next_step()
        elif st == "tangles":
            for k in self.knots:
                if k["prog"] >= 1:
                    continue
                kx, ky = self.upx(*k["u"])
                if held and math.hypot(m[0] - kx, m[1] - ky) < 11:
                    k["prog"] += moved * 0.012 + dt * 0.1
                    if random.random() < 0.15:
                        self.particles.add("puff", kx, ky, life=0.5)
                    if k["prog"] >= 1:
                        self.game.audio.play("pop")
                        self.particles.burst("sparkle", kx, ky, 5, 16)
            if all(k["prog"] >= 1 for k in self.knots):
                self.next_step()

    def draw(self, s):
        if self.done:
            return
        st = self.step
        grooming = st in ("trim", "tangles")
        if grooming:
            bg_room(s, (250, 226, 236), (250, 246, 240), (240, 232, 226), (244, 210, 224))
            s.blit(sprites.obj("table"), (112, 120))
        else:
            bg_room(s, (200, 228, 250), (236, 246, 252), (214, 232, 248), (186, 216, 244))
        skip = ("fleas", "mud", "matted")
        self.draw_animal(s, skip=skip)
        r = self.arect()
        if st == "scrub":
            for pch in self.patches:
                if pch["dirt"] > 0:
                    px, py = self.upx(*pch["u"])
                    rad = int(4 + 6 * pch["dirt"])
                    pygame.draw.ellipse(s, (140, 100, 62), (px - rad, py - rad * 2 // 3, rad * 2, rad * 4 // 3))
                    pygame.draw.ellipse(s, (166, 124, 80), (px - rad // 2, py - rad // 2, rad, rad // 2 + 1))
        elif st == "fleas":
            for f in self.fleas:
                if f.get("dead") or f.get("gone"):
                    continue
                fx, fy = self.flea_pos(f)
                pygame.draw.rect(s, (40, 30, 30), (fx - 1, fy - 1, 3, 3))
                pygame.draw.rect(s, (120, 90, 80), (fx - 2, fy + 1, 1, 1))
                pygame.draw.rect(s, (120, 90, 80), (fx + 2, fy + 1, 1, 1))
            font.draw(s, f"FLEAS: {self.fleas_hit}/{self.flea_total}", (8, 50), ui.INK)
        elif st == "rinse":
            for (gx, gy), v in self.suds.items():
                cx, cy = self.upx(1.5 + gx * 2.7, 2 + gy * 2.5)
                rad = max(1, int(4 * v))
                pygame.draw.circle(s, (255, 255, 255), (cx, cy), rad)
                pygame.draw.circle(s, (210, 230, 250), (cx + 1, cy - 1), max(1, rad // 2))
        elif st == "dry":
            for i in range(6):
                if self.dry < (i + 1) / 6:
                    ux, uy = 5 + (i * 3.1) % 15, 6 + (i * 5.3) % 14
                    px, py = self.upx(ux, uy)
                    pygame.draw.rect(s, (130, 200, 250), (px, py, 2, 3))
            pygame.draw.rect(s, ui.BORDER, (110, 140, 100, 6))
            pygame.draw.rect(s, (250, 180, 200), (111, 141, int(98 * min(1, self.dry)), 4))
            font.draw(s, "DRY", (90, 141), ui.INK)
        elif st == "trim":
            for j, q in enumerate(self.path):
                px, py = self.upx(*q)
                if j >= self.trim_i:
                    col = sprites.darker(data.ANIMALS[self.p.kind]["variants"][self.p.variant % len(data.ANIMALS[self.p.kind]["variants"])]["body"], 0.75)
                    pygame.draw.line(s, col, (px, py), (px + (j % 3) - 1, py - 5), 2)
                    if j % 2 == 0:
                        pygame.draw.rect(s, (255, 255, 255), (px, py, 1, 1))
            sx, sy = self.upx(*self.path[min(self.trim_i, len(self.path) - 1)])
            if self.trim_i == 0:
                font.draw(s, "START", (sx - 8, sy + 4), ui.ACCENT, shadow=(255, 255, 255))
            pygame.draw.circle(s, (255, 230, 120), (sx, sy), 4 + int(math.sin(self.t * 8)), 1)
        elif st == "tangles":
            for k in self.knots:
                if k["prog"] >= 1:
                    continue
                kx, ky = self.upx(*k["u"])
                rad = int(3 + 5 * (1 - k["prog"]))
                for a in range(0, 360, 50):
                    ang = math.radians(a + self.t * 40)
                    pygame.draw.line(s, (90, 70, 60), (kx, ky),
                                     (kx + int(math.cos(ang) * rad), ky + int(math.sin(ang) * rad)), 1)
        if not grooming:
            s.blit(sprites.obj("tub"), (105, 110))
        step_chips(s, self.steps, self.idx)
        self.draw_tool_cursor(s, self.TOOLS[st])
        self.draw_common(s)


# ======================================================================= MEDS
class MedsGame(Minigame):
    station = "meds"
    title = "Medicine & Shots"
    HINTS = dict(syringe="HOLD MOUSE / SPACE TO FILL - RELEASE IN THE GREEN ZONE",
                 pill="DRAG THE PILL INTO THE TREAT - THEN FEED IT WHILE THEY SNIFF",
                 shot="CLICK / SPACE WHEN THE MARKER IS IN THE SWEET SPOT")
    NAMES = dict(syringe="Fill", pill="Pill", shot="Shot")

    def __init__(self, scene, patient):
        super().__init__(scene, patient)
        order = ["syringe", "pill", "shot"]
        tasks = patient.tasks_for("meds")
        self.steps = [t for t in order if t in tasks]
        self.idx = -1
        self.step_scores = []
        self.ax, self.ay = 96, 92
        self.steady = 1.45 if self.has("steady_syringe") else 1.0
        self.holding = False
        self.next_step()

    @property
    def step(self):
        return self.steps[self.idx]

    @property
    def hint(self):
        return self.HINTS.get(self.step, "")

    def next_step(self, score=None):
        if score is not None:
            self.step_scores.append(max(5, min(100, score)))
        self.idx += 1
        self.step_t = 0.0
        self.pen = 0.0
        self.attempts = 0
        if self.idx >= len(self.steps):
            self.finish(sum(self.step_scores) / len(self.step_scores) if self.step_scores else 100)
            return
        st = self.step
        if st == "syringe":
            self.level_f = 0.0
            self.hold_t = 0.0
            self.zw = 0.14 * self.steady
            self.z0 = random.uniform(0.35, 0.78 - self.zw)
        elif st == "pill":
            self.items = dict(pill=[pygame.Rect(232, 70, 24, 24), (232, 70)], treat=[pygame.Rect(276, 70, 24, 24), (276, 70)])
            self.combined = False
            self.drag = None
            self.sniff = False
            self.sniff_t = 1.2
        elif st == "shot":
            self.mk = 0.0
            self.mdir = 1
            self.zw = 0.12 * self.steady
            self.zc = random.uniform(0.3, 0.7)
            self.needle_t = 0

    def zone_c(self):
        c = self.zc
        if self.p.personality == "nervous":
            c += math.sin(self.t * 2.6) * 0.12
        return max(self.zw / 2, min(1 - self.zw / 2, c))

    def release_fill(self):
        lv = self.level_f
        if self.z0 <= lv <= self.z0 + self.zw:
            c = self.z0 + self.zw / 2
            sc = 100 - abs(lv - c) / (self.zw / 2) * 25 - self.pen - max(0, self.step_t - 8) * 2
            self.game.audio.play("sparkle")
            self.particles.text("Perfect dose!" if sc > 90 else "Good dose!", 250, 50, ui.GOOD)
            self.next_step(sc)
        elif lv > 0.02:
            self.attempts += 1
            self.mistake(20, "Too much!" if lv > self.z0 else "Too little!")
            self.level_f = 0
            if self.attempts >= 3:
                self.next_step(25)

    def shot_click(self):
        if self.needle_t > 0:
            return
        c = self.zone_c()
        if abs(self.mk - c) <= self.zw / 2:
            acc = abs(self.mk - c) / (self.zw / 2)
            sc = 100 - acc * 20 - self.pen
            if acc < 0.3:
                self.st["stats"]["perfect_shots"] += 1
                self.particles.text("BULLSEYE!", self.ax, self.ay - 40, ui.GOLD)
            self.game.audio.play("shot")
            self.needle_t = 0.6
            self._pending = sc
        else:
            self.attempts += 1
            self.mistake(20, "Ouch!")
            if self.attempts >= 3:
                self.game.audio.play("shot")
                self.needle_t = 0.6
                self._pending = 30

    def event(self, e):
        if self.done or self.guard(e):
            return
        st = self.step
        down = (e.type == pygame.MOUSEBUTTONDOWN and e.button == 1) or (e.type == pygame.KEYDOWN and e.key == pygame.K_SPACE)
        up = (e.type == pygame.MOUSEBUTTONUP and e.button == 1) or (e.type == pygame.KEYUP and e.key == pygame.K_SPACE)
        if st == "syringe":
            if down:
                self.holding = True
                self.hold_t = 0
            elif up and self.holding:
                self.holding = False
                self.release_fill()
        elif st == "shot":
            if down:
                self.shot_click()
        elif st == "pill":
            m = self.game.mpos
            if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
                for k, (r, home) in self.items.items():
                    if r.collidepoint(m):
                        self.drag = k
                        self.off = (m[0] - r.x, m[1] - r.y)
                        self.game.audio.play("blip")
                        return
            elif e.type == pygame.MOUSEBUTTONUP and e.button == 1 and self.drag:
                k = self.drag
                self.drag = None
                r, home = self.items[k]
                mouth = pygame.Rect(0, 0, 30, 24)
                mouth.center = self.upx(12, 12)
                if k == "pill" and self.items["treat"][0].colliderect(r) and not self.combined:
                    self.combined = True
                    del self.items["pill"]
                    self.game.audio.play("pop")
                    self.particles.burst("sparkle", r.centerx, r.centery, 5, 16)
                    return
                if mouth.colliderect(r):
                    if k == "pill":
                        self.mistake(15, "Ptooey!")
                        self.flash("Hide the pill inside the treat first!", ui.BAD)
                    elif k == "treat" and not self.combined:
                        self.flash("The pill goes in the treat first!", ui.BAD)
                    elif not self.sniff:
                        self.mistake(12, "Not now!")
                        self.flash("Wait until they sniff the treat!", ui.BAD)
                    else:
                        self.game.audio.play("heart")
                        self.particles.burst("heart", r.centerx, r.centery, 4, 18)
                        self.next_step(100 - self.pen - max(0, self.step_t - 10) * 2)
                        return
                r.topleft = home

    def update(self, dt):
        super().update(dt)
        if self.done:
            return
        self.step_t += dt
        st = self.step
        if st == "syringe" and self.holding:
            self.hold_t += dt
            self.level_f += dt * 0.30 * self.diff * (1 + self.hold_t * 0.5)
            if int(self.t * 20) % 4 == 0:
                self.game.audio.play("pour", 0.3)
            if self.level_f >= 1:
                self.holding = False
                self.level_f = 1
                self.release_fill()
        elif st == "shot":
            if self.needle_t > 0:
                self.needle_t -= dt
                if self.needle_t <= 0:
                    self.particles.burst("sparkle", self.ax + 20, self.ay, 6, 20)
                    self.next_step(self._pending)
                return
            self.mk += self.mdir * dt * 0.85 * self.diff
            if self.mk >= 1:
                self.mk, self.mdir = 1, -1
            elif self.mk <= 0:
                self.mk, self.mdir = 0, 1
        elif st == "pill":
            self.sniff_t -= dt
            if self.sniff_t <= 0:
                self.sniff = not self.sniff
                base = 0.85 if self.p.personality == "nervous" else 1.3
                self.sniff_t = (base if self.sniff else random.uniform(0.9, 1.6)) / max(1, self.diff * 0.7)
            if self.drag:
                m = self.game.mpos
                self.items[self.drag][0].topleft = (m[0] - self.off[0], m[1] - self.off[1])

    def draw(self, s):
        if self.done:
            return
        bg_room(s, (240, 230, 250), (246, 244, 250), (232, 228, 244), (226, 214, 244))
        pygame.draw.rect(s, (200, 170, 130), (20, 128, 150, 6))
        st = self.step
        mood = None
        if st == "pill":
            mood = "happy" if self.sniff else "blink"
        self.draw_animal(s, mood=mood, skip=("tummy",) if st == "pill" else ())
        step_chips(s, [self.NAMES[x] for x in self.steps], self.idx)
        if st == "syringe":
            bx, by, bw, bh = 236, 50, 22, 96
            ui.panel(s, (bx - 8, by - 6, bw + 16, bh + 16), (255, 255, 255), ui.BORDER)
            pygame.draw.rect(s, (230, 240, 250), (bx, by, bw, bh))
            zy0 = by + bh - int(bh * (self.z0 + self.zw))
            pygame.draw.rect(s, (160, 230, 160), (bx, zy0, bw, int(bh * self.zw)))
            fh = int(bh * self.level_f)
            pygame.draw.rect(s, (240, 120, 150), (bx + 3, by + bh - fh, bw - 6, fh))
            for i in range(1, 10):
                pygame.draw.rect(s, ui.BORDER, (bx, by + bh * i // 10, 4, 1))
            pygame.draw.rect(s, ui.BORDER, (bx, by, bw, bh), 1)
            pygame.draw.rect(s, (150, 150, 170), (bx + bw // 2 - 1, by + bh, 2, 8))
            font.draw(s, "MEDICINE", (bx + bw // 2, by - 12), ui.INK, align="center")
            if self.holding:
                self.particles.add("drop", bx + bw // 2, by + bh - fh - 2, vx=random.uniform(-10, 10), vy=-20, life=0.3)
        elif st == "pill":
            mouth = self.upx(12, 12)
            if self.sniff:
                font.draw(s, "SNIFF SNIFF", (mouth[0], self.ay - 46), ui.GOOD, shadow=(255, 255, 255), align="center")
                pygame.draw.circle(s, (255, 240, 120), mouth, 13 + int(math.sin(self.t * 9) * 2), 1)
            else:
                font.draw(s, "HMPH!", (mouth[0], self.ay - 46), ui.MUTED, shadow=(255, 255, 255), align="center")
            ui.panel(s, (222, 58, 90, 46), (255, 250, 240), ui.BORDER)
            for k, (r, home) in self.items.items():
                name = "pill" if k == "pill" else ("pilltreat" if self.combined else "treat")
                s.blit(sprites.big_icon(name, 2), r.topleft)
            font.draw(s, "PILL", (244, 96), ui.INK, align="center") if "pill" in self.items else None
            font.draw(s, "TREAT", (288, 96), ui.INK, align="center")
        elif st == "shot":
            mx0, mw = 60, 200
            ui.panel(s, (mx0 - 4, 136, mw + 8, 14), (255, 255, 255), ui.BORDER)
            c = self.zone_c()
            zx = mx0 + int((c - self.zw / 2) * mw)
            pygame.draw.rect(s, (250, 220, 120), (zx - 4, 139, int(self.zw * mw) + 8, 8))
            pygame.draw.rect(s, (130, 220, 130), (zx, 139, int(self.zw * mw), 8))
            kx = mx0 + int(self.mk * mw)
            pygame.draw.polygon(s, ui.BAD, [(kx - 3, 133), (kx + 3, 133), (kx, 138)])
            pygame.draw.rect(s, ui.INK, (kx, 138, 1, 10))
            sx = 200 if self.needle_t <= 0 else int(200 - (0.6 - self.needle_t) / 0.6 * 70)
            s.blit(sprites.big_icon("syringe", 3), (sx, 70))
            font.draw(s, f"TRIES LEFT: {3 - self.attempts}", (260, 52), ui.INK, align="center")
        self.draw_common(s)


# ======================================================================= CARE
class CareGame(Minigame):
    station = "care"
    title = "Food & Bandages"
    HINTS = dict(food="CLICK THE RIGHT FOOD - THEN HOLD TO POUR UP TO THE LINE",
                 bandage="DRAG IN THE ARROW'S DIRECTION (OR PRESS ARROW KEYS / WASD)")
    NAMES = dict(food="Food", bandage="Bandage")
    DIRV = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}
    GLYPH = {"up": "|", "down": "`", "left": "{", "right": "}"}

    def __init__(self, scene, patient):
        super().__init__(scene, patient)
        tasks = patient.tasks_for("care")
        self.steps = [t for t in ("food", "bandage") if t in tasks]
        self.idx = -1
        self.step_scores = []
        self.ax, self.ay = 84, 92
        self.next_step()

    @property
    def step(self):
        return self.steps[self.idx]

    @property
    def hint(self):
        if self.step == "food" and getattr(self, "phase", "") == "pour":
            return "HOLD MOUSE / SPACE TO POUR - RELEASE AT THE DOTTED LINE"
        return self.HINTS.get(self.step, "")

    def next_step(self, score=None):
        if score is not None:
            self.step_scores.append(max(5, min(100, score)))
        self.idx += 1
        self.step_t = 0.0
        self.pen = 0.0
        if self.idx >= len(self.steps):
            self.finish(sum(self.step_scores) / len(self.step_scores) if self.step_scores else 100)
            return
        if self.step == "food":
            right = data.ANIMALS[self.p.kind]["food"]
            others = [f for f in data.FOODS if f != right]
            random.shuffle(others)
            opts = [right] + others[:3]
            random.shuffle(opts)
            self.bags = [dict(food=f, rect=pygame.Rect(150 + i * 42, 46, 36, 40), wrong=False) for i, f in enumerate(opts)]
            self.phase = "choose"
            self.fill = 0.0
            self.target = random.uniform(0.55, 0.8)
            self.pouring = False
            self.food = right
        else:
            n = 5 + min(3, self.level // 2)
            self.prompts = [random.choice(list(self.DIRV)) for _ in range(n)]
            self.pi = 0
            self.limit = 2.8 * (1.45 if self.has("silk_bandage") else 1.0) / self.diff
            self.ptime = self.limit
            self.drag0 = None

    def bandage_input(self, d):
        want = self.prompts[self.pi]
        if d == want:
            self.pi += 1
            self.ptime = self.limit
            self.game.audio.play("wrap")
            self.particles.add("sparkle", 230, 110, 3)
            if self.pi >= len(self.prompts):
                self.game.audio.play("sparkle")
                self.next_step(100 - self.pen - max(0, self.step_t - 12) * 1.5)
        else:
            self.mistake(10, "Wrong way!")

    def release_pour(self):
        self.pouring = False
        diff = self.fill - self.target
        if diff > 0.14:
            self.mistake(25, "Too much!")
            self.fill = 0
        elif diff < -0.14:
            self.flash("A little more...", ui.INK)
        else:
            sc = 100 - abs(diff) * 180 - self.pen - max(0, self.step_t - 12) * 1.5
            self.game.audio.play("heart")
            self.particles.burst("heart", self.ax, self.ay - 30, 5, 20)
            self.next_step(sc)

    def event(self, e):
        if self.done or self.guard(e):
            return
        m = self.game.mpos
        if self.step == "food":
            if self.phase == "choose":
                if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
                    for b in self.bags:
                        if b["rect"].collidepoint(m) and not b["wrong"]:
                            if b["food"] == self.food:
                                self.phase = "pour"
                                self.game.audio.play("select")
                            else:
                                b["wrong"] = True
                                self.mistake(20, "Not for a " + data.ANIMALS[self.p.kind]["name"] + "!")
                            return
            else:
                down = (e.type == pygame.MOUSEBUTTONDOWN and e.button == 1) or (e.type == pygame.KEYDOWN and e.key == pygame.K_SPACE)
                up = (e.type == pygame.MOUSEBUTTONUP and e.button == 1) or (e.type == pygame.KEYUP and e.key == pygame.K_SPACE)
                if down:
                    self.pouring = True
                elif up and self.pouring:
                    self.release_pour()
        else:
            keymap = {pygame.K_UP: "up", pygame.K_w: "up", pygame.K_DOWN: "down", pygame.K_s: "down",
                      pygame.K_LEFT: "left", pygame.K_a: "left", pygame.K_RIGHT: "right", pygame.K_d: "right"}
            if e.type == pygame.KEYDOWN and e.key in keymap:
                self.bandage_input(keymap[e.key])
            elif e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
                self.drag0 = m
            elif e.type in (pygame.MOUSEMOTION, pygame.MOUSEBUTTONUP) and self.drag0:
                dx, dy = m[0] - self.drag0[0], m[1] - self.drag0[1]
                if max(abs(dx), abs(dy)) >= 16:
                    d = ("right" if dx > 0 else "left") if abs(dx) > abs(dy) else ("down" if dy > 0 else "up")
                    self.drag0 = None
                    self.bandage_input(d)
                elif e.type == pygame.MOUSEBUTTONUP:
                    self.drag0 = None

    def update(self, dt):
        super().update(dt)
        if self.done:
            return
        self.step_t += dt
        if self.step == "food":
            if self.phase == "pour" and self.pouring:
                rate = 0.32 * self.diff * (0.7 if self.has("smart_scoop") else 1.0)
                self.fill += dt * rate
                if int(self.t * 20) % 4 == 0:
                    self.game.audio.play("pour", 0.3)
                    self.particles.add("mud", 232 + random.randint(-3, 3), 100, vx=0, vy=60, life=0.3)
                if self.fill >= 1:
                    self.fill = 1
                    self.release_pour()
        else:
            self.ptime -= dt
            if self.ptime <= 0:
                self.ptime = self.limit
                self.mistake(10, "Too slow!")

    def draw(self, s):
        if self.done:
            return
        bg_room(s, (250, 238, 210), (250, 244, 232), (240, 230, 214), (240, 222, 190))
        st = self.step
        self.draw_animal(s, mood="happy" if (st == "food" and self.phase == "pour" and self.pouring) else None,
                         skip=("hungry",) if st == "food" else ("paw",))
        step_chips(s, [self.NAMES[x] for x in self.steps], self.idx)
        if st == "food":
            if self.phase == "choose":
                font.draw(s, "WHAT DOES A " + data.ANIMALS[self.p.kind]["name"].upper() + " EAT?", (234, 92), ui.ACCENT,
                          shadow=(255, 255, 255), align="center")
                for b in self.bags:
                    r = b["rect"]
                    hov = r.collidepoint(self.game.mpos) and not b["wrong"]
                    ui.panel(s, r.move(0, -1 if hov else 0), (214, 206, 216) if b["wrong"] else ((255, 240, 200) if hov else (255, 252, 244)), ui.BORDER)
                    s.blit(sprites.big_icon("bag", 2, data.FOODS[b["food"]]["color"]), (r.x + 6, r.y + 3))
                    font.draw_wrapped(s, data.FOODS[b["food"]]["name"], (r.x + 2, r.y + 28, 34, 14), ui.INK, align="center")
            else:
                bowl = pygame.Rect(200, 112, 64, 26)
                ty = bowl.bottom - 4 - int(self.target * 22)
                fy = bowl.bottom - 4 - int(self.fill * 22)
                pygame.draw.ellipse(s, (240, 120, 120), (bowl.x, bowl.y + 10, bowl.w, 16))
                pygame.draw.rect(s, sprites.darker(data.FOODS[self.food]["color"]), (bowl.x + 6, fy, bowl.w - 12, bowl.bottom - 6 - fy))
                for y in range(fy, bowl.bottom - 6, 3):
                    for x in range(bowl.x + 7, bowl.right - 7, 4):
                        pygame.draw.rect(s, data.FOODS[self.food]["color"], (x + (y % 2), y, 2, 2))
                pygame.draw.rect(s, (240, 120, 120), (bowl.x + 4, bowl.bottom - 8, bowl.w - 8, 6))
                for x in range(bowl.x - 6, bowl.right + 6, 4):
                    pygame.draw.rect(s, ui.INK, (x, ty, 2, 1))
                font.draw(s, "LINE", (bowl.right + 8, ty - 2), ui.INK)
                s.blit(sprites.big_icon("scoop", 2), (220, 80 + (4 if self.pouring else 0)))
                s.blit(sprites.big_icon("bag", 2, data.FOODS[self.food]["color"]), (264, 50))
        else:
            # big paw
            px, py = 232, 108
            body = data.ANIMALS[self.p.kind]["variants"][self.p.variant % len(data.ANIMALS[self.p.kind]["variants"])]["body"]
            pygame.draw.ellipse(s, body, (px - 22, py - 14, 44, 40))
            pygame.draw.ellipse(s, sprites.darker(body), (px - 22, py - 14, 44, 40), 1)
            pygame.draw.ellipse(s, (250, 170, 180), (px - 10, py + 2, 20, 14))
            for i, ox in enumerate((-14, -5, 5, 14)):
                pygame.draw.circle(s, (250, 170, 180), (px + ox, py - 6 + (2 if i in (0, 3) else 0)), 4)
            pygame.draw.circle(s, (240, 90, 100), (px + 3, py + 6), 3)
            for i in range(self.pi):
                yy = py - 14 + 6 + i * 5
                pygame.draw.rect(s, (252, 250, 244), (px - 21, yy, 42, 4))
                pygame.draw.rect(s, (220, 214, 200), (px - 21, yy + 3, 42, 1))
            if self.pi < len(self.prompts):
                d = self.prompts[self.pi]
                bx = 290
                ui.panel(s, (bx - 16, 52, 32, 32), (255, 250, 236), ui.BORDER)
                font.draw(s, self.GLYPH[d], (bx, 60), ui.ACCENT, scale=3, align="center")
                pygame.draw.rect(s, ui.BORDER, (bx - 15, 86, 30, 3))
                pygame.draw.rect(s, ui.GOOD if self.ptime > self.limit * 0.35 else ui.BAD,
                                 (bx - 15, 86, int(30 * max(0, self.ptime) / self.limit), 3))
                for j in range(self.pi + 1, min(len(self.prompts), self.pi + 4)):
                    font.draw(s, self.GLYPH[self.prompts[j]], (bx - 10 + (j - self.pi - 1) * 10, 94), ui.MUTED)
                font.draw(s, f"WRAP {self.pi + 1}/{len(self.prompts)}", (232, 140), ui.INK, align="center")
        self.draw_common(s)


STATION_GAMES = dict(exam=ExamGame, bath=BathGame, meds=MedsGame, care=CareGame)
