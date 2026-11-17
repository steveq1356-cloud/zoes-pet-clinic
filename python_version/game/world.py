"""Walkable overworld: Pawsley Town, Zoe's HQ, and the Pet Supply Store."""
import math
import random
import pygame
from . import config, data, font, sprites, ui, state as gstate
from .engine import Scene

T = config.TILE
SW, SH = config.NATIVE_W, config.NATIVE_H
DIRS = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}


# ======================================================================= entities
class Walker:
    def __init__(self, x, y, d="down"):
        self.x, self.y = float(x), float(y)
        self.dir = d
        self.anim = 0.0
        self.moving = False

    def hitbox(self, x=None, y=None):
        x = self.x if x is None else x
        y = self.y if y is None else y
        return pygame.Rect(int(x) - 5, int(y) - 5, 10, 5)

    def frame(self, t):
        if self.moving:
            return [1, 0, 2, 0][int(self.anim) % 4]
        return 3 if (t % 4.0) < 0.15 else 0


class NPC(Walker):
    def __init__(self, name, x, y, d="down", wander=None, patrol=None):
        super().__init__(x, y, d)
        self.name = name
        self.home = (x, y)
        self.wander = wander      # radius in px
        self.patrol = patrol      # (x1, x2) horizontal patrol
        self.target = None
        self.wait = random.uniform(0.5, 3)
        self.talking = False
        self.speed = 55 if patrol else 26

    def update(self, dt, scene):
        if self.talking:
            self.moving = False
            return
        if self.patrol:
            tx = self.patrol[1] if self.dir == "right" else self.patrol[0]
            step = self.speed * dt * (1 if tx > self.x else -1)
            nx = self.x + step
            if not scene.blocked(self.hitbox(nx, self.y), self):
                self.x = nx
                self.moving = True
            if abs(self.x - tx) < 2 or scene.blocked(self.hitbox(nx, self.y), self):
                self.dir = "left" if self.dir == "right" else "right"
            self.anim += dt * 10
            return
        if not self.wander:
            self.moving = False
            return
        if self.target is None:
            self.wait -= dt
            self.moving = False
            if self.wait <= 0:
                a = random.uniform(0, 6.28)
                r = random.uniform(0, self.wander)
                self.target = (self.home[0] + math.cos(a) * r, self.home[1] + math.sin(a) * r)
            return
        dx, dy = self.target[0] - self.x, self.target[1] - self.y
        dist = math.hypot(dx, dy)
        if dist < 2:
            self.target = None
            self.wait = random.uniform(1.5, 4)
            return
        vx, vy = dx / dist * self.speed * dt, dy / dist * self.speed * dt
        self.dir = ("right" if dx > 0 else "left") if abs(dx) > abs(dy) else ("down" if dy > 0 else "up")
        nr = self.hitbox(self.x + vx, self.y + vy)
        if scene.blocked(nr, self):
            self.target = None
            self.wait = 1.0
            return
        self.x += vx
        self.y += vy
        self.moving = True
        self.anim += dt * 7

    def sprite(self, t):
        return sprites.npc(self.name, self.dir, self.frame(t))


class PetWalker:
    def __init__(self, pet, x, y, area):
        self.pet = pet
        self.x, self.y = float(x), float(y)
        self.area = area     # pygame.Rect of wander zone
        self.target = None
        self.wait = random.uniform(0.5, 2)
        self.t = random.uniform(0, 5)
        self.moving = False

    def hitbox(self):
        return pygame.Rect(int(self.x) - 6, int(self.y) - 5, 12, 5)

    def update(self, dt, scene):
        self.t += dt
        if self.target is None:
            self.moving = False
            self.wait -= dt
            if self.wait <= 0:
                self.target = (random.uniform(self.area.left, self.area.right),
                               random.uniform(self.area.top, self.area.bottom))
            return
        dx, dy = self.target[0] - self.x, self.target[1] - self.y
        d = math.hypot(dx, dy)
        if d < 2:
            self.target = None
            self.wait = random.uniform(1, 4)
            return
        sp = 22
        nx, ny = self.x + dx / d * sp * dt, self.y + dy / d * sp * dt
        r = pygame.Rect(int(nx) - 6, int(ny) - 5, 12, 5)
        if scene.blocked(r, self):
            self.target = None
            self.wait = 1
            return
        self.x, self.y = nx, ny
        self.moving = True

    def draw(self, s, cx, cy):
        p = self.pet
        frame = int(self.t * 3) % 2
        mood = "happy" if p.get("happy_t", 0) > 0 else "normal"
        img = sprites.animal(p["kind"], p.get("variant", 0), 16, frame, mood)
        hop = int(abs(math.sin(self.t * 10)) * 2) if self.moving else 0
        s.blit(img, (int(self.x) - 8 - cx, int(self.y) - 15 - hop - cy))


# ======================================================================= base scene
class WorldScene(Scene):
    music = "town"
    name = "world"

    def __init__(self, game, spawn=None, facing="down"):
        super().__init__(game)
        self.st = game.state
        self.tiles = []
        self.solid = set()
        self.objects = []        # dict(img, x, y, solid(rect or None), sort)
        self.interacts = []      # dict(rect, prompt, fn)
        self.doors = []          # dict(rect, fn, need_dir)
        self.npcs = []
        self.pets = []
        self.dialogue = None
        self.particles = ui.Particles()
        self.banner = None
        self.anim_t = 0.0
        self.build()
        sx, sy = spawn if spawn else self.default_spawn()
        self.player = Walker(sx, sy, facing)
        self.cam = [0, 0]
        self._update_cam(snap=True)

    # -- override
    def build(self):
        pass

    def default_spawn(self):
        return (SW // 2, SH // 2)

    @property
    def mw(self):
        return len(self.tiles[0]) * T

    @property
    def mh(self):
        return len(self.tiles) * T

    def add_obj(self, img, x, y, solid=None, sort=None):
        o = dict(img=img, x=x, y=y, solid=pygame.Rect(solid) if solid else None,
                 sort=sort if sort is not None else y + img.get_height())
        self.objects.append(o)
        return o

    def spawn_pets(self, area):
        self.pets = []
        for p in self.st["pets"]:
            self.pets.append(PetWalker(p, random.uniform(area.left, area.right),
                                       random.uniform(area.top, area.bottom), area))

    # -- collision
    def blocked(self, rect, who=None):
        tx0, ty0 = rect.left // T, rect.top // T
        tx1, ty1 = (rect.right - 1) // T, (rect.bottom - 1) // T
        for ty in range(ty0, ty1 + 1):
            for tx in range(tx0, tx1 + 1):
                if tx < 0 or ty < 0 or ty >= len(self.tiles) or tx >= len(self.tiles[0]):
                    return True
                if (tx, ty) in self.solid:
                    return True
        for o in self.objects:
            if o["solid"] is not None and o["solid"].colliderect(rect):
                return True
        for n in self.npcs:
            if n is not who and n.hitbox().colliderect(rect):
                return True
        if who is not None and who is not getattr(self, "player", None) and hasattr(self, "player"):
            if self.player.hitbox().colliderect(rect):
                return True
        return False

    # -- helpers
    def say(self, pages, on_done=None, choices=None):
        self.dialogue = ui.DialogueBox(self.game, pages, on_done, choices)

    def zoe_portrait(self):
        return sprites.zoe_portrait(self.st["hair"], self.st["outfit"])

    def npc_say(self, npc_name, lines, on_done=None, choices=None, title=None):
        port = sprites.npc_portrait(npc_name) if npc_name in data.PEOPLE else None
        nm = title or npc_name.capitalize()
        if npc_name == "maple":
            nm = "Dr. Maple"
        if npc_name == "bramble":
            nm = "Mr. Bramble"
        self.say([(nm, port, l) for l in lines], on_done, choices)

    def zoe_say(self, lines, on_done=None, choices=None):
        self.say([("Zoe", self.zoe_portrait(), l) for l in lines], on_done, choices)

    def talk_npc(self, npc):
        rank = gstate.rank_index(self.st["xp"])
        pool = [t for r, t in data.NPC_LINES.get(npc.name, [(0, "Hello!")]) if r <= rank]
        key = "talks_" + npc.name
        n = self.st.setdefault("talk_counts", {}).get(key, 0)
        self.st["talk_counts"][key] = n + 1
        line = pool[(self.st["day"] + n) % len(pool)]
        npc.talking = True
        px, py = self.player.x, self.player.y
        dx, dy = px - npc.x, py - npc.y
        npc.dir = ("right" if dx > 0 else "left") if abs(dx) > abs(dy) else ("down" if dy > 0 else "up")

        def done():
            npc.talking = False
        self.npc_say(npc.name, [line], done)

    def interact_target(self):
        dx, dy = DIRS[self.player.dir]
        probe = (self.player.x + dx * 11, self.player.y - 3 + dy * 11)
        hb = self.player.hitbox().inflate(8, 8)
        for n in self.npcs:
            r = n.hitbox().inflate(6, 14).move(0, -6)
            if r.collidepoint(probe):
                return ("Talk", lambda n=n: self.talk_npc(n))
        for p in self.pets:
            if p.hitbox().inflate(8, 14).move(0, -4).collidepoint(probe):
                return (p.pet["name"], lambda p=p: self.open_pet(p))
        for it in self.interacts:
            if it["rect"].collidepoint(probe) or it["rect"].colliderect(hb) and it.get("near"):
                return (it["prompt"], it["fn"])
        return None

    def open_pet(self, pw):
        from .menus import PetMenu
        self.game.push(PetMenu(self.game, pw, self))

    # -- scene API
    def event(self, e):
        if self.dialogue:
            self.dialogue.event(e)
            if self.dialogue and self.dialogue.done:
                self.dialogue = None
            return
        if e.type == pygame.KEYDOWN:
            if e.key == pygame.K_ESCAPE:
                from .menus import PauseMenu
                self.game.push(PauseMenu(self.game))
            elif e.key in (pygame.K_e, pygame.K_SPACE, pygame.K_RETURN):
                tgt = self.interact_target()
                if tgt:
                    self.game.audio.play("blip")
                    tgt[1]()

    def update(self, dt):
        self.anim_t += dt
        self.particles.update(dt)
        if self.banner:
            self.banner["t"] += dt
            if self.banner["t"] > 3:
                self.banner = None
        for p in self.st["pets"]:
            if p.get("happy_t", 0) > 0:
                p["happy_t"] = max(0, p["happy_t"] - dt)
        for n in self.npcs:
            n.update(dt, self)
        for p in self.pets:
            p.update(dt, self)
        if self.dialogue:
            self.dialogue.update(dt)
            if self.dialogue.done:
                self.dialogue = None
            self.player.moving = False
            return
        keys = pygame.key.get_pressed()
        vx = (keys[pygame.K_d] or keys[pygame.K_RIGHT]) - (keys[pygame.K_a] or keys[pygame.K_LEFT])
        vy = (keys[pygame.K_s] or keys[pygame.K_DOWN]) - (keys[pygame.K_w] or keys[pygame.K_UP])
        pl = self.player
        pl.moving = bool(vx or vy)
        if pl.moving:
            if vx and not vy:
                pl.dir = "right" if vx > 0 else "left"
            elif vy and not vx:
                pl.dir = "down" if vy > 0 else "up"
            elif pl.dir not in (("right" if vx > 0 else "left"), ("down" if vy > 0 else "up")):
                pl.dir = "down" if vy > 0 else "up"
            sp = 72 * dt
            if vx and vy:
                sp *= 0.7071
            nx = pl.x + vx * sp
            if not self.blocked(pl.hitbox(nx, pl.y), pl):
                pl.x = nx
            ny = pl.y + vy * sp
            if not self.blocked(pl.hitbox(pl.x, ny), pl):
                pl.y = ny
            pl.anim += dt * 8
            for d in self.doors:
                if d["rect"].colliderect(pl.hitbox()) and (d.get("dir") is None or d["dir"] == pl.dir):
                    d["fn"]()
                    break
        self._update_cam()

    def _update_cam(self, snap=False):
        tx = self.player.x - SW / 2
        ty = self.player.y - 12 - SH / 2
        tx = (self.mw - SW) / 2 if self.mw <= SW else max(0, min(self.mw - SW, tx))
        ty = (self.mh - SH) / 2 if self.mh <= SH else max(0, min(self.mh - SH, ty))
        self.cam = [tx, ty]

    # -- drawing
    def draw_tiles(self, s, cx, cy):
        frame = int(self.anim_t * 2) % 2
        x0, y0 = max(0, cx // T), max(0, cy // T)
        x1 = min(len(self.tiles[0]), (cx + SW) // T + 2)
        y1 = min(len(self.tiles), (cy + SH) // T + 2)
        for ty in range(y0, y1):
            row = self.tiles[ty]
            for tx in range(x0, x1):
                name = row[tx]
                s.blit(sprites.tile(name, frame if name in ("water", "water_edge", "flowers", "flowers1") else 0),
                       (tx * T - cx, ty * T - cy))

    def draw_extra_floor(self, s, cx, cy):
        pass

    def draw(self, s):
        cx, cy = int(self.cam[0]), int(self.cam[1])
        s.fill((30, 24, 40))
        self.draw_tiles(s, cx, cy)
        self.draw_extra_floor(s, cx, cy)
        drawables = []
        for o in self.objects:
            drawables.append((o["sort"], 0, o))
        for n in self.npcs:
            drawables.append((n.y, 1, n))
        for p in self.pets:
            drawables.append((p.y, 2, p))
        drawables.append((self.player.y, 3, self.player))
        drawables.sort(key=lambda d: (d[0], d[1]))
        t = self.game.time
        for _, kind, obj in drawables:
            if kind == 0:
                s.blit(obj["img"], (obj["x"] - cx, obj["y"] - cy))
            elif kind == 1:
                s.blit(obj.sprite(t), (int(obj.x) - 8 - cx, int(obj.y) - 24 - cy))
            elif kind == 2:
                obj.draw(s, cx, cy)
            else:
                pl = self.player
                s.blit(sprites.zoe(self.st["hair"], self.st["outfit"], pl.dir, pl.frame(t)),
                       (int(pl.x) - 8 - cx, int(pl.y) - 24 - cy))
        self.draw_after(s, cx, cy)
        # particles are in world coords
        if self.particles.items:
            tmp = self.particles
            for p in tmp.items:
                p["x"] -= cx
                p["y"] -= cy
            tmp.draw(s)
            for p in tmp.items:
                p["x"] += cx
                p["y"] += cy
        if not self.dialogue:
            tgt = self.interact_target()
            if tgt:
                label = "E: " + tgt[0]
                w = font.text_width(label) + 8
                px = int(self.player.x) - cx - w // 2
                py = int(self.player.y) - cy - 36
                ui.panel(s, (px, py, w, 10), (255, 255, 255), ui.BORDER, shadow=False)
                font.draw(s, label, (px + 4, py + 3), ui.INK)
        self.draw_hud(s)
        if self.banner:
            self._draw_banner(s)
        if self.dialogue:
            self.dialogue.draw(s)

    def draw_after(self, s, cx, cy):
        pass

    def draw_hud(self, s):
        st = self.st
        label = f"DAY {st['day']}  " + ("MORNING" if st["phase"] == "morning" else "EVENING")
        w = max(86, font.text_width(label) + 10)
        ui.panel(s, (3, 3, w, 22), (255, 248, 236), ui.BORDER)
        font.draw(s, label, (8, 7), ui.INK)
        s.blit(sprites.icon("coin"), (6, 13))
        font.draw(s, str(st["coins"]), (20, 16), (170, 120, 30))
        if st.get("rush") and st["phase"] == "morning":
            ui.panel(s, (w + 6, 3, 56, 12), (255, 220, 120), (200, 120, 40))
            font.draw(s, "RUSH DAY!", (w + 11, 7), (170, 70, 30))
        font.draw(s, "ESC: MENU", (SW - 4, SH - 8), (255, 255, 255), shadow=(52, 38, 64), align="right")

    def _draw_banner(self, s):
        b = self.banner
        k = b["t"]
        a = min(1, k * 3) if k < 2.5 else max(0, 1 - (k - 2.5) * 2)
        if a <= 0:
            return
        y = 50
        r = pygame.Rect(60, y, 200, 34)
        ui.panel(s, r, (255, 246, 230), ui.BORDER)
        font.draw(s, b["title"], (160, y + 6), ui.ACCENT, scale=2, align="center")
        font.draw(s, b["sub"], (160, y + 23), ui.INK, align="center")


# ======================================================================= TOWN
class TownScene(WorldScene):
    name = "town"

    def build(self):
        W, H = 40, 30
        rnd = random.Random(42)
        self.tiles = [[("grass", "grass1", "grass2")[rnd.randrange(3) if rnd.random() < 0.3 else 0] for _ in range(W)] for _ in range(H)]

        def fill(x0, y0, x1, y1, name):
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    self.tiles[y][x] = name if name != "path" else ("path" if (x + y) % 3 else "path1")

        # streets
        fill(2, 9, 37, 10, "path")
        fill(2, 22, 21, 23, "path")
        fill(15, 11, 16, 21, "path")
        fill(6, 7, 7, 8, "path")         # HQ door
        fill(26, 7, 27, 8, "path")       # clinic door
        fill(7, 19, 8, 21, "path")       # store door
        fill(26, 11, 27, 14, "path")     # park entrance
        fill(18, 11, 37, 11, "path") if False else None
        # flower patches
        for (x0, y0, x1, y1) in ((10, 5, 13, 7), (19, 4, 21, 7), (3, 12, 6, 14), (31, 5, 35, 7), (9, 25, 14, 27), (23, 21, 26, 24)):
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    if rnd.random() < 0.6:
                        self.tiles[y][x] = "flowers" if rnd.random() < 0.5 else "flowers1"
        # pond in park
        for y in range(16, 21):
            for x in range(28, 34):
                self.tiles[y][x] = "water_edge" if y == 16 else "water"
                self.solid.add((x, y))
        # park fence
        for x in range(22, 36):
            for y in (13, 25):
                if y == 13 and x in (26, 27):
                    continue
                self.add_fence(x, y, "fence")
        for y in range(14, 25):
            self.add_fence(22, y, "fence_v")
            self.add_fence(35, y, "fence_v")
        # border trees
        for x in range(0, W):
            for y in (0, H - 1):
                self.add_tree(x, y, rnd)
        for y in range(1, H - 1):
            for x in (0, W - 1):
                self.add_tree(x, y, rnd)
        for (x, y) in ((2, 2), (3, 2), (14, 3), (17, 2), (22, 2), (35, 3), (37, 4), (12, 15), (13, 18), (3, 18),
                       (4, 26), (18, 26), (20, 15), (36, 15), (37, 20), (36, 26), (23, 26), (30, 27), (28, 23), (33, 23),
                       (10, 13), (20, 19)):
            self.add_tree(x, y, rnd)
        for (x, y) in ((11, 8), (20, 8), (30, 8), (34, 8), (13, 21), (2, 15)):
            self.add_obj(sprites.tile("bush"), x * T, y * T, (x * T + 1, y * T + 6, 14, 10))
        # buildings
        self.hq_rect = self.add_building("hq", 5 * T, 4 * T)
        self.clinic_rect = self.add_building("clinic", 24 * T, 3 * T - 4)
        self.store_rect = self.add_building("store", 6 * T, 15 * T + 4)
        # doors
        hq, cl, stx = self.hq_rect, self.clinic_rect, self.store_rect
        self.doors.append(dict(rect=pygame.Rect(hq.centerx - 6, hq.bottom - 1, 12, 4), dir="up",
                               fn=lambda: self.go_inside("hq")))
        self.doors.append(dict(rect=pygame.Rect(stx.centerx - 6, stx.bottom - 1, 12, 4), dir="up",
                               fn=lambda: self.go_inside("store")))
        self.interacts.append(dict(rect=pygame.Rect(cl.centerx - 8, cl.bottom - 14, 16, 18),
                                   prompt="Clinic", fn=self.clinic_door))
        # welcome sign
        sign = sprites.new(16, 16)
        pygame.draw.rect(sign, (150, 100, 66), (7, 8, 2, 8))
        pygame.draw.rect(sign, (226, 186, 130), (1, 2, 14, 8))
        pygame.draw.rect(sign, (176, 130, 86), (1, 9, 14, 1))
        sign = sprites.outline(sign)
        self.add_obj(sign, 18 * T, 11 * T, (18 * T + 2, 11 * T + 10, 12, 6))
        self.interacts.append(dict(rect=pygame.Rect(18 * T, 11 * T, 16, 16), prompt="Read",
                                   fn=lambda: self.say([(None, None, "PAWSLEY TOWN - Home of happy, healthy pets! North: Clinic & HQ. South: Shop & Park.")])))
        # NPCs
        st = self.st
        if st["day"] == 1 and st["phase"] == "morning":
            self.npcs.append(NPC("maple", 9 * T + 8, 11 * T + 4, "up"))
        else:
            self.npcs.append(NPC("maple", 21 * T, 11 * T + 6, "down", wander=10))
        self.npcs.append(NPC("penny", 12 * T, 10 * T + 6, "down", wander=18))
        self.npcs.append(NPC("otis", 30 * T + 8, 22 * T + 4, "up"))
        self.npcs.append(NPC("juniper", 25 * T, 18 * T, "down", wander=28))
        self.npcs.append(NPC("rosa", 12 * T, 20 * T, "down", wander=14))
        self.npcs.append(NPC("theo", 4 * T, 9 * T + 12, "right", patrol=(3 * T, 36 * T)))
        self.spawn_pets(pygame.Rect(23 * T + 4, 14 * T + 6, 4 * T, 10 * T))

    def add_fence(self, x, y, kind):
        self.solid.add((x, y))
        self.add_obj(sprites.tile(kind), x * T, y * T, sort=y * T + 12)

    def add_tree(self, x, y, rnd):
        self.solid.add((x, y))
        self.add_obj(sprites.tile("tree1" if rnd.random() < 0.15 else "tree"), x * T, y * T - 16, sort=y * T + 14)

    def add_building(self, name, x, y):
        img = sprites.building(name)
        w, h = img.get_size()
        r = pygame.Rect(x, y, w, h)
        self.add_obj(img, x, y, (x + 4, y + 12, w - 8, h - 12))
        return r

    def default_spawn(self):
        return (self.hq_rect.centerx, self.hq_rect.bottom + 8)

    def enter(self):
        st = self.st
        if st["phase"] == "morning":
            if st["day"] == 1 and "intro" not in st["seen_tutorial"]:
                st["seen_tutorial"].append("intro")
                self.npc_say("maple", data.TUTORIAL["intro"])
            elif st.get("rush") and st.get("rush_announced") != st["day"]:
                st["rush_announced"] = st["day"]
                self.npc_say("penny", data.RUSH_LINES)

    def go_inside(self, where):
        def go():
            if where == "hq":
                self.game.replace(HQScene(self.game, None, "up"))
            else:
                self.game.replace(StoreScene(self.game, None, "up"))
        self.game.transition(go)

    def clinic_door(self):
        st = self.st
        if st["phase"] == "morning":
            def start():
                from .clinic import ShiftScene
                self.game.transition(lambda: self.game.replace(ShiftScene(self.game)))
            extra = " It's a RUSH DAY!" if st.get("rush") else ""
            self.zoe_say([f"Ready to open the clinic for Day {st['day']}?{extra}"], None,
                         [("Open!", start), ("Not yet", lambda: None)])
        else:
            self.zoe_say(["The clinic is closed for today. Time to head home and get some rest!"])

    def draw(self, s):
        super().draw(s)

    def draw_after(self, s, cx, cy):
        if self.st["phase"] == "evening":
            veil = pygame.Surface((SW, SH), pygame.SRCALPHA)
            veil.fill((250, 140, 90, 46))
            s.blit(veil, (0, 0))


# ======================================================================= INTERIORS
class RoomScene(WorldScene):
    room_w, room_h = 20, 12
    floor = "wood"
    wall = "wall"

    def build_room(self):
        self.tiles = [[self.floor] * self.room_w for _ in range(self.room_h)]
        for x in range(self.room_w):
            self.tiles[0][x] = self.wall
            self.tiles[1][x] = self.wall + ("_trim" if self.wall == "wall" else "")
            self.solid.add((x, 0))
            self.solid.add((x, 1))
            self.solid.add((x, self.room_h - 1))
            self.tiles[self.room_h - 1][x] = self.wall
        for y in range(self.room_h):
            self.solid.add((-1, y))
        dx = self.room_w // 2 - 1
        for x in (dx, dx + 1):
            self.solid.discard((x, self.room_h - 1))
            self.tiles[self.room_h - 1][x] = self.floor
        self.add_obj(sprites.obj("doormat"), dx * T, (self.room_h - 1) * T + 2, sort=0)
        self.doors.append(dict(rect=pygame.Rect(dx * T, (self.room_h - 1) * T + 10, 32, 6), dir="down",
                               fn=self.exit_room))

    def exit_room(self):
        pass

    def default_spawn(self):
        return (self.room_w // 2 * T, (self.room_h - 2) * T + 8)


class HQScene(RoomScene):
    name = "hq"
    fixed_tiles = {(1, 2), (1, 3), (13, 2), (15, 2), (9, 10), (10, 10), (9, 9), (10, 9)}

    def build(self):
        self.build_room()
        self.add_obj(sprites.obj("bed"), 1 * T, 2 * T, (1 * T, 2 * T, 16, 32))
        self.interacts.append(dict(rect=pygame.Rect(1 * T, 2 * T, 18, 34), prompt="Bed", fn=self.use_bed))
        self.add_obj(sprites.obj("mirror"), 4 * T, 8, sort=2 * T)
        self.interacts.append(dict(rect=pygame.Rect(4 * T, 8, 16, 26), prompt="Mirror", fn=self.use_mirror))
        self.shelf_pos = (7 * T, 4)
        self.add_obj(sprites.obj("shelf"), self.shelf_pos[0], self.shelf_pos[1], sort=2 * T)
        self.interacts.append(dict(rect=pygame.Rect(7 * T, 4, 40, 28), prompt="Trophies", fn=self.use_shelf))
        self.add_obj(sprites.obj("laptop"), 13 * T, 2 * T - 4, (13 * T, 2 * T, 16, 14))
        self.interacts.append(dict(rect=pygame.Rect(13 * T, 2 * T - 4, 16, 20), prompt="Order Online", fn=self.use_laptop))
        self.add_obj(sprites.obj("planner"), 15 * T, 2 * T - 4, (15 * T, 2 * T, 16, 14))
        self.interacts.append(dict(rect=pygame.Rect(15 * T, 2 * T - 4, 16, 20), prompt="Decorate", fn=self.use_planner))
        self.apply_decor()
        self.spawn_pets(pygame.Rect(3 * T, 4 * T, 13 * T, 4 * T))

    def apply_decor(self):
        self.objects = [o for o in self.objects if not o.get("decor")]
        for d in self.st["layouts"]["hq"]:
            info = data.DECOR[d["name"]]
            w, h = info["size"]
            img = sprites.decor(d["name"], d.get("rot", 0))
            x, y = d["x"] * T, d["y"] * T
            solid = (x + 1, y + 2, w * T - 2, h * T - 2) if info["solid"] else None
            sort = y if not info["solid"] else y + h * T - 2
            if d["name"] == "rug":
                sort = -1
            o = self.add_obj(img, x, y + h * T - img.get_height(), solid, sort=sort)
            o["decor"] = True

    def default_spawn(self):
        return (2 * T + 10, 4 * T + 10)

    def enter(self):
        st = self.st
        if st.pop("_new_day_banner", False):
            sub = "RUSH DAY! Big crowds today!" if st.get("rush") else gstate.rank_name(st["xp"])
            self.banner = dict(t=0.0, title=f"DAY {st['day']}", sub=sub)
            self.game.audio.play("chime")

    def exit_room(self):
        def go():
            t = TownScene(self.game)
            self.game.replace(t)
        self.game.transition(go)

    def use_bed(self):
        st = self.st
        if st["phase"] == "morning":
            self.zoe_say(["It's morning! The clinic is waiting for me."])
            return

        def sleep():
            def do():
                start_new_day(self.game)
                self.game.replace(HQScene(self.game))
            self.game.transition(do)
        self.zoe_say(["What a day! Time for bed?"], None, [("Sleep", sleep), ("Not yet", lambda: None)])

    def use_mirror(self):
        from .menus import MirrorMenu
        self.game.push(MirrorMenu(self.game))

    def use_shelf(self):
        from .menus import TrophyMenu
        self.game.push(TrophyMenu(self.game))

    def use_laptop(self):
        from .menus import StoreMenu
        self.game.push(StoreMenu(self.game, online=True))

    def use_planner(self):
        from .menus import DecorateMenu
        self.game.push(DecorateMenu(self.game, self))

    def draw_after(self, s, cx, cy):
        # badges on the physical shelf
        x0, y0 = self.shelf_pos[0] - cx, self.shelf_pos[1] - cy
        keys = list(data.BADGES.keys())
        for i, k in enumerate(keys):
            row, col = divmod(i, 4)
            bx = x0 + 2 + col * 9
            by = y0 - 4 + row * 11
            img = sprites.badge(k, locked=k not in self.st["badges"])
            small = sprites.scaled(("badge_small", k, k not in self.st["badges"]), img, 1)
            s.blit(pygame.transform.scale(small, (8, 8)) if True else small, (bx, by + 6))


class StoreScene(RoomScene):
    name = "store"
    floor = "storefloor"
    wall = "storewall"

    def build(self):
        self.build_room()
        for x in (1, 4, 14, 17):
            self.add_obj(sprites.obj("store_shelf"), x * T - 4, 2, (x * T - 4, 2 * T, 32, 14))
        self.add_obj(sprites.obj("counter"), 7 * T - 8, 4 * T, (7 * T - 8, 4 * T + 4, 64, 16))
        self.npcs.append(NPC("bramble", 10 * T, 4 * T + 2, "down"))
        self.interacts.append(dict(rect=pygame.Rect(7 * T - 8, 4 * T - 8, 64, 30), prompt="Shop", fn=self.shop))
        self.add_obj(sprites.decor("plant"), 2 * T, 8 * T, (2 * T + 2, 9 * T - 4, 12, 6))
        self.add_obj(sprites.decor("plant"), 17 * T, 8 * T, (17 * T + 2, 9 * T - 4, 12, 6))

    def talk_npc(self, npc):
        self.shop()

    def shop(self):
        from .menus import StoreMenu
        self.npc_say("bramble", ["Welcome to Bramble's Pet Supply! Take a look around."],
                     lambda: self.game.push(StoreMenu(self.game)))

    def exit_room(self):
        def go():
            t = TownScene(self.game)
            t.player.x, t.player.y = t.store_rect.centerx, t.store_rect.bottom + 8
            t.player.dir = "down"
            t._update_cam(True)
            self.game.replace(t)
        self.game.transition(go)


# ======================================================================= day helpers
def start_new_day(game):
    st = game.state
    st["day"] += 1
    st["phase"] = "morning"
    st["rush"] = st["day"] >= config.RUSH_START_DAY and random.random() < config.RUSH_CHANCE
    st["legendary_today"] = False
    st["_new_day_banner"] = True
    for kind, key in gstate.check_general_achievements(st):
        _announce(game, kind, key)
    game.save()


def _announce(game, kind, key):
    if kind == "badges":
        game.toast("BADGE GET!", data.BADGES[key]["name"], "badge", key)
    else:
        game.toast("ACHIEVEMENT!", data.ACHIEVEMENTS[key]["name"])


def town_after_shift(game):
    t = TownScene(game)
    t.player.x, t.player.y = t.clinic_rect.centerx, t.clinic_rect.bottom + 10
    t.player.dir = "down"
    t._update_cam(True)
    return t
