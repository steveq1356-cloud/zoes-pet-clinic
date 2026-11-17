"""Title screen and every menu/overlay: settings, pause, store, mirror, trophies, pets, decorating."""
import math
import random
import pygame
from . import config, data, font, sprites, ui, state as gstate
from .engine import Scene

SW, SH = config.NATIVE_W, config.NATIVE_H


def dim(s, a=120):
    v = pygame.Surface((SW, SH), pygame.SRCALPHA)
    v.fill((30, 20, 40, a))
    s.blit(v, (0, 0))


# ======================================================================= confirm
class ConfirmMenu(Scene):
    overlay = True

    def __init__(self, game, text, on_yes, yes="Yes", no="No"):
        super().__init__(game)
        self.text = text
        self.on_yes = on_yes
        self.buttons = [ui.Button((96, 104, 60, 14), yes, self.yes, key=pygame.K_y),
                        ui.Button((164, 104, 60, 14), no, self.game.pop, key=pygame.K_n)]

    def yes(self):
        self.game.pop()
        self.on_yes()

    def event(self, e):
        if e.type == pygame.KEYDOWN and e.key == pygame.K_ESCAPE:
            self.game.pop()
            return
        for b in self.buttons:
            if b.handle(e, self.game):
                return

    def draw(self, s):
        dim(s)
        ui.panel(s, (70, 62, 180, 62))
        font.draw_wrapped(s, self.text, (82, 72, 156, 30), ui.INK, align="center")
        for b in self.buttons:
            b.draw(s, self.game.mpos)


# ======================================================================= title
class TitleScene(Scene):
    music = "title"

    def __init__(self, game):
        super().__init__(game)
        self.t = 0.0
        self.critters = []
        kinds = ["dog", "cat", "bunny", "hamster"]
        for i in range(6):
            self.critters.append(dict(kind=kinds[i % 4], v=i % 3, x=-30 - i * 70.0, y=150 + (i % 2) * 6, sp=30 + (i % 3) * 6))
        self.hair = "long"
        self.build()

    def build(self):
        has = gstate.has_save()
        x, w = 214, 90
        self.buttons = [
            ui.Button((x, 84, w, 15), "Continue", self.cont, enabled=has),
            ui.Button((x, 102, w, 15), "New Game", self.new_game),
            ui.Button((x, 120, w, 15), "Settings", lambda: self.game.push(SettingsMenu(self.game))),
            ui.Button((x, 138, w, 15), "Quit", self.quit),
        ]

    def resume(self):
        self.build()

    def quit(self):
        self.game.running = False

    def cont(self):
        st, msg = gstate.load_game()
        if st is None:
            self.game.load_message = msg or "No save found."
            self.build()
            return
        self.game.state = st
        from .world import HQScene, town_after_shift

        def go():
            if st["phase"] == "evening":
                self.game.replace(town_after_shift(self.game))
            else:
                self.game.replace(HQScene(self.game))
        self.game.transition(go)

    def new_game(self):
        if gstate.has_save():
            self.game.push(ConfirmMenu(self.game, "This will erase your save. Are you sure?", self.start_new, "Erase", "Cancel"))
        else:
            self.start_new()

    def start_new(self):
        gstate.delete_save()
        st = gstate.new_state()
        st["_new_day_banner"] = True
        self.game.state = st
        self.game.save()
        from .world import HQScene
        self.game.transition(lambda: self.game.replace(HQScene(self.game)))

    def event(self, e):
        for b in self.buttons:
            if b.handle(e, self.game):
                return
        if e.type == pygame.KEYDOWN and e.key == pygame.K_h:
            self.hair = "bob" if self.hair == "long" else "long"

    def update(self, dt):
        self.t += dt
        for c in self.critters:
            c["x"] += c["sp"] * dt
            if c["x"] > SW + 30:
                c["x"] = -40
        if int(self.t) % 6 == 5 and int((self.t - dt)) % 6 == 4:
            self.hair = "bob" if self.hair == "long" else "long"

    def draw(self, s):
        for y in range(0, SH, 4):
            k = y / SH
            c = (int(170 + 70 * k), int(220 + 20 * k), int(250 - 20 * k))
            pygame.draw.rect(s, c, (0, y, SW, 4))
        for i, (cx, cy) in enumerate(((40, 30), (130, 20), (250, 36))):
            x = (cx + self.t * (4 + i)) % (SW + 60) - 30
            for dx, dy, r in ((0, 0, 8), (9, 2, 7), (-8, 3, 6), (4, -4, 7)):
                pygame.draw.circle(s, (255, 255, 255), (int(x + dx), cy + dy), r)
        pygame.draw.rect(s, (126, 200, 104), (0, 140, SW, 40))
        for x in range(0, SW, 16):
            s.blit(sprites.tile("grass" if x % 32 else "flowers", int(self.t * 2) % 2), (x, 140))
            s.blit(sprites.tile("grass1"), (x, 156))
            s.blit(sprites.tile("path"), (x, 172)) if x % 48 == 0 else None
        s.blit(sprites.building("clinic"), (116, 82))
        s.blit(sprites.tile("tree"), (90, 110))
        s.blit(sprites.tile("tree1"), (200, 108))
        # logo
        bob = int(math.sin(self.t * 2) * 2)
        font.draw(s, "ZOE'S", (160, 10 + bob), (255, 255, 255), 2, shadow=(200, 90, 120), align="center")
        font.draw(s, "PET CLINIC", (161, 26 + bob), (200, 90, 120), 4, align="center")
        font.draw(s, "PET CLINIC", (160, 25 + bob), (255, 236, 120), 4, align="center")
        font.draw(s, font.HEART, (96, 30 + bob), (240, 90, 120), 2)
        font.draw(s, font.HEART, (214, 30 + bob), (240, 90, 120), 2)
        # zoe
        fr = 3 if (self.t % 3) < 0.15 else 0
        z = sprites.scaled(("title_zoe", self.hair), sprites.zoe(self.hair, "classic", "down", 0), 3)
        zb = sprites.scaled(("title_zoe_b", self.hair), sprites.zoe(self.hair, "classic", "down", 3), 3)
        s.blit(zb if fr == 3 else z, (34, 92 + int(math.sin(self.t * 3))))
        for c in self.critters:
            hop = int(abs(math.sin(self.t * 8 + c["x"] * 0.1)) * 3)
            s.blit(sprites.animal(c["kind"], c["v"], 24, int(self.t * 3) % 2, "happy"), (int(c["x"]), c["y"] - hop))
        ui.panel(s, (206, 76, 106, 84), (255, 248, 236, ), ui.BORDER)
        for b in self.buttons:
            b.draw(s, self.game.mpos)
        if self.game.load_message:
            ui.panel(s, (10, 62, 190, 26), (255, 230, 230), ui.BAD)
            font.draw_wrapped(s, self.game.load_message, (16, 67, 178, 20), ui.INK)
        font.draw(s, "ORIGINAL GAME - F11 FULLSCREEN - M MUTE", (160, 173), (60, 100, 60), align="center")


# ======================================================================= settings
class SettingsMenu(Scene):
    overlay = True

    def __init__(self, game):
        super().__init__(game)
        st = game.settings
        a = game.audio

        def setm(v):
            st["music"] = v
            a.apply_volume()

        def setf(v):
            st["sfx"] = v

        self.sliders = [("Music", ui.Slider((130, 58, 110, 6), st.get("music", 0.5), setm)),
                        ("Sound FX", ui.Slider((130, 74, 110, 6), st.get("sfx", 0.7), setf))]
        self.buttons = [ui.Button((130, 88, 110, 13), "", self.toggle_fs),
                        ui.Button((130, 104, 110, 13), "", self.toggle_mute)]
        self.scales = [ui.Button((130 + i * 23, 120, 21, 13), f"{sc}X", (lambda sc=sc: self.set_scale(sc))) for i, sc in enumerate((2, 3, 4, 5))]
        self.back = ui.Button((120, 142, 80, 14), "Back", self.close, key=pygame.K_ESCAPE)
        self.relabel()

    def relabel(self):
        st = self.game.settings
        self.buttons[0].text = "Fullscreen: " + ("ON" if self.game.fullscreen else "OFF")
        self.buttons[1].text = "Muted: " + ("YES" if st.get("muted") else "NO")
        for b, sc in zip(self.scales, (2, 3, 4, 5)):
            b.selected = st.get("scale") == sc

    def toggle_fs(self):
        self.game.toggle_fullscreen()
        self.relabel()

    def toggle_mute(self):
        self.game.settings["muted"] = not self.game.settings.get("muted")
        self.game.audio.apply_volume()
        self.relabel()

    def set_scale(self, sc):
        self.game.set_window_scale(sc)
        self.relabel()

    def close(self):
        gstate.save_settings(self.game.settings)
        self.game.pop()

    def event(self, e):
        for _, sl in self.sliders:
            sl.handle(e, self.game)
        for b in self.buttons + self.scales + [self.back]:
            if b.handle(e, self.game):
                return
        if e.type == pygame.MOUSEBUTTONUP:
            self.game.audio.play("blip") if False else None

    def draw(self, s):
        dim(s)
        ui.panel(s, (60, 30, 200, 132))
        font.draw(s, "SETTINGS", (160, 38), ui.ACCENT, 2, align="center")
        for (label, sl), y in zip(self.sliders, (56, 72)):
            font.draw(s, label.upper(), (72, y), ui.INK)
            sl.draw(s, self.game.mpos)
        font.draw(s, "DISPLAY", (72, 92), ui.INK)
        font.draw(s, "AUDIO", (72, 108), ui.INK)
        font.draw(s, "WINDOW", (72, 124), ui.INK)
        for b in self.buttons + self.scales + [self.back]:
            b.draw(s, self.game.mpos)


# ======================================================================= pause
class PauseMenu(Scene):
    overlay = True

    def __init__(self, game, in_shift=False):
        super().__init__(game)
        self.in_shift = in_shift
        self.buttons = [ui.Button((110, 66, 100, 15), "Resume", self.game.pop),
                        ui.Button((110, 85, 100, 15), "Settings", lambda: self.game.push(SettingsMenu(self.game))),
                        ui.Button((110, 104, 100, 15), "Save & Quit to Title", self.quit)]

    def quit(self):
        g = self.game
        snap = getattr(g, "shift_snapshot", None)
        if snap is not None:
            g.state = snap
            g.shift_snapshot = None
        g.save()
        g.transition(lambda: g.replace(TitleScene(g)))

    def event(self, e):
        if e.type == pygame.KEYDOWN and e.key == pygame.K_ESCAPE:
            self.game.pop()
            return
        for b in self.buttons:
            if b.handle(e, self.game):
                return

    def draw(self, s):
        dim(s)
        ui.panel(s, (96, 40, 128, 100 if self.in_shift else 88))
        font.draw(s, "PAUSED", (160, 48), ui.ACCENT, 2, align="center")
        for b in self.buttons:
            b.draw(s, self.game.mpos)
        if self.in_shift:
            font.draw_wrapped(s, "Quitting mid-shift restarts today's shift.", (104, 124, 112, 16), ui.MUTED, align="center")


# ======================================================================= store
class StoreMenu(Scene):
    overlay = True
    ROW_H = 14
    VISIBLE = 8

    def __init__(self, game, online=False):
        super().__init__(game)
        self.online = online
        self.tab = "tools"
        self.scroll = 0
        self.sel = None
        self.particles = ui.Particles()
        self.tabs = [ui.Button((14 + i * 56, 22, 54, 12), name, (lambda k=k: self.set_tab(k))) for i, (k, name) in enumerate(data.STORE_TABS)]
        self.buy_btn = ui.Button((190, 140, 70, 14), "Buy", self.buy)
        self.close_btn = ui.Button((290, 8, 18, 12), "X", self.close, key=pygame.K_ESCAPE)
        self.set_tab("tools")

    def set_tab(self, k):
        self.tab = k
        self.scroll = 0
        items = self.items()
        self.sel = items[0] if items else None
        for b, (key, _) in zip(self.tabs, data.STORE_TABS):
            b.selected = key == k

    def items(self):
        st = self.game.state
        out = []
        for k, it in data.STORE_ITEMS.items():
            if it["cat"] != self.tab:
                continue
            if it.get("requires") and not gstate.has(st, it["requires"]) and not gstate.has(st, k):
                continue
            out.append(k)
        return out

    def owned(self, k):
        st = self.game.state
        it = data.STORE_ITEMS[k]
        if it["kind"] == "outfit":
            return it["outfit"] in st["outfits"]
        if it["kind"] == "upgrade":
            return gstate.has(st, k)
        return False

    def count(self, k):
        st = self.game.state
        it = data.STORE_ITEMS[k]
        if it["kind"] == "decor":
            placed = sum(1 for room in st["layouts"].values() for d in room if d["name"] == it["decor"])
            return st["decor_inv"].get(it["decor"], 0) + placed
        if it["kind"] == "consumable":
            return st["consumables"].get(k, 0)
        return None

    def buy(self):
        st = self.game.state
        k = self.sel
        if not k:
            return
        it = data.STORE_ITEMS[k]
        if not gstate.item_unlocked(st, k):
            self.game.audio.play("error")
            return
        if self.owned(k):
            return
        if st["coins"] < it["price"]:
            self.game.audio.play("error")
            self.game.shake(2, 0.15)
            self.particles.text("Not enough coins!", 225, 130, ui.BAD)
            return
        st["coins"] -= it["price"]
        kind = it["kind"]
        if kind == "upgrade":
            st["owned"].append(k)
        elif kind == "outfit":
            st["outfits"].append(it["outfit"])
            st["owned"].append(k)
        elif kind == "decor":
            st["decor_inv"][it["decor"]] = st["decor_inv"].get(it["decor"], 0) + 1
        elif kind == "consumable":
            st["consumables"][k] = st["consumables"].get(k, 0) + 1
        st["stats"]["purchases"] += 1
        self.game.audio.play("buy")
        self.particles.burst("sparkle", 225, 100, 10, 30)
        for _ in range(4):
            self.particles.add("coin", 225, 120)
        for kind2, key in gstate.check_general_achievements(st):
            from .world import _announce
            _announce(self.game, kind2, key)
        self.game.save()   # autosave after purchases
        items = self.items()
        if k not in items and items:
            self.sel = items[0]

    def close(self):
        self.game.pop()

    def event(self, e):
        if self.close_btn.handle(e, self.game):
            return
        for b in self.tabs:
            if b.handle(e, self.game):
                return
        if self.buy_btn.handle(e, self.game):
            return
        items = self.items()
        m = self.game.mpos
        if e.type == pygame.MOUSEWHEEL:
            self.scroll = max(0, min(max(0, len(items) - self.VISIBLE), self.scroll - e.y))
        elif e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
            for i, k in enumerate(items[self.scroll:self.scroll + self.VISIBLE]):
                r = pygame.Rect(14, 40 + i * self.ROW_H, 156, self.ROW_H - 1)
                if r.collidepoint(m):
                    self.sel = k
                    self.game.audio.play("blip")
                    return
            if pygame.Rect(14, 40, 156, self.ROW_H * self.VISIBLE).collidepoint(m):
                return
            if e.button == 4:
                self.scroll = max(0, self.scroll - 1)
        elif e.type == pygame.KEYDOWN and items:
            idx = items.index(self.sel) if self.sel in items else 0
            if e.key in (pygame.K_DOWN, pygame.K_s):
                idx = min(len(items) - 1, idx + 1)
            elif e.key in (pygame.K_UP, pygame.K_w):
                idx = max(0, idx - 1)
            elif e.key in (pygame.K_RETURN, pygame.K_SPACE):
                self.buy()
                return
            else:
                return
            self.sel = items[idx]
            if idx < self.scroll:
                self.scroll = idx
            elif idx >= self.scroll + self.VISIBLE:
                self.scroll = idx - self.VISIBLE + 1

    def update(self, dt):
        self.particles.update(dt)

    def draw(self, s):
        st = self.game.state
        dim(s, 140)
        ui.panel(s, (8, 6, 304, 168))
        font.draw(s, "ONLINE CATALOG" if self.online else "BRAMBLE'S PET SUPPLY", (16, 11), ui.ACCENT)
        s.blit(sprites.icon("coin"), (230, 8))
        font.draw(s, str(st["coins"]), (244, 11), (170, 120, 30))
        self.close_btn.draw(s, self.game.mpos)
        for b in self.tabs:
            b.draw(s, self.game.mpos)
        items = self.items()
        pygame.draw.rect(s, (246, 238, 228), (12, 38, 160, self.ROW_H * self.VISIBLE + 4))
        for i, k in enumerate(items[self.scroll:self.scroll + self.VISIBLE]):
            it = data.STORE_ITEMS[k]
            r = pygame.Rect(14, 40 + i * self.ROW_H, 156, self.ROW_H - 1)
            hov = r.collidepoint(self.game.mpos)
            col = (250, 210, 222) if k == self.sel else ((255, 250, 240) if hov else (255, 255, 252))
            pygame.draw.rect(s, col, r)
            s.blit(sprites.item_icon(k), (r.x + 1, r.y + 1))
            unlocked = gstate.item_unlocked(st, k)
            font.draw(s, it["name"], (r.x + 16, r.y + 4), ui.INK if unlocked else ui.MUTED)
            if self.owned(k):
                font.draw(s, "OWNED", (r.right - 3, r.y + 4), ui.GOOD, align="right")
            elif not unlocked:
                s.blit(sprites.icon("lock"), (r.right - 13, r.y + 1))
            else:
                font.draw(s, str(it["price"]), (r.right - 3, r.y + 4), (170, 120, 30) if st["coins"] >= it["price"] else ui.BAD, align="right")
        if len(items) > self.VISIBLE:
            font.draw(s, "SCROLL FOR MORE", (92, 155), ui.MUTED, align="center")
        # detail
        if self.sel:
            k = self.sel
            it = data.STORE_ITEMS[k]
            dr = pygame.Rect(178, 38, 128, 118)
            ui.panel(s, dr, (255, 255, 252), ui.BORDER, shadow=False)
            big = sprites.scaled(("store_big", k), sprites.item_icon(k), 3)
            s.blit(big, (dr.centerx - big.get_width() // 2, dr.y + 6))
            if it["kind"] == "outfit":
                prev = sprites.scaled(("store_outfit", st["hair"], it["outfit"]), sprites.zoe(st["hair"], it["outfit"], "down", 0), 2)
                s.blit(prev, (dr.right - 36, dr.y + 2))
            font.draw(s, it["name"].upper(), (dr.centerx, dr.y + 46), ui.ACCENT, align="center")
            font.draw_wrapped(s, it["desc"], (dr.x + 6, dr.y + 56, dr.w - 12, 30), ui.INK, align="center")
            c = self.count(k)
            if c is not None:
                font.draw(s, f"YOU HAVE: {c}", (dr.centerx, dr.y + 84), ui.MUTED, align="center")
            unlocked = gstate.item_unlocked(st, k)
            if self.owned(k):
                font.draw(s, "OWNED!", (dr.centerx, dr.y + 96), ui.GOOD, align="center")
                self.buy_btn.visible = False
            elif not unlocked:
                need = data.RANKS[min(len(data.RANKS) - 1, it.get("rank", 0))]
                txt = f"UNLOCKS AT {need.upper()}"
                if it.get("requires") and not gstate.has(st, it["requires"]):
                    txt = "BUY " + data.STORE_ITEMS[it["requires"]]["name"].upper() + " FIRST"
                font.draw_wrapped(s, txt, (dr.x + 6, dr.y + 94, dr.w - 12, 20), ui.BAD, align="center")
                self.buy_btn.visible = False
            else:
                self.buy_btn.visible = True
                self.buy_btn.enabled = st["coins"] >= it["price"]
                self.buy_btn.text = f"Buy - {it['price']}"
                self.buy_btn.rect = pygame.Rect(dr.centerx - 36, dr.bottom - 20, 72, 14)
                self.buy_btn.draw(s, self.game.mpos)
        self.particles.draw(s)
        font.draw(s, "CLICK AN ITEM - ESC TO CLOSE", (160, 166), ui.MUTED, align="center")


# ======================================================================= mirror
class MirrorMenu(Scene):
    overlay = True

    def __init__(self, game):
        super().__init__(game)
        self.t = 0.0
        st = game.state
        self.hair_btns = [ui.Button((128, 46, 74, 14), "Long Hair", lambda: self.set_hair("long")),
                          ui.Button((206, 46, 74, 14), "Bob", lambda: self.set_hair("bob"))]
        self.outfit_btns = []
        for i, o in enumerate(st["outfits"]):
            col, row = i % 2, i // 2
            self.outfit_btns.append((o, ui.Button((128 + col * 78, 80 + row * 16, 74, 14), data.OUTFITS[o]["name"],
                                                  (lambda o=o: self.set_outfit(o)),
                                                  icon=sprites.icon("outfit", data.OUTFITS[o]["scrub"]))))
        self.done = ui.Button((168, 150, 70, 14), "Done", self.close, key=pygame.K_ESCAPE)
        self.particles = ui.Particles()
        self.relabel()

    def relabel(self):
        st = self.game.state
        self.hair_btns[0].selected = st["hair"] == "long"
        self.hair_btns[1].selected = st["hair"] == "bob"
        for o, b in self.outfit_btns:
            b.selected = st["outfit"] == o

    def set_hair(self, h):
        self.game.state["hair"] = h
        self.particles.burst("sparkle", 70, 90, 10, 30)
        self.game.audio.play("sparkle")
        self.relabel()

    def set_outfit(self, o):
        self.game.state["outfit"] = o
        self.particles.burst("sparkle", 70, 90, 10, 30)
        self.game.audio.play("sparkle")
        self.relabel()

    def close(self):
        self.game.save()
        self.game.pop()

    def event(self, e):
        for b in self.hair_btns + [b for _, b in self.outfit_btns] + [self.done]:
            if b.handle(e, self.game):
                return

    def update(self, dt):
        self.t += dt
        self.particles.update(dt)

    def draw(self, s):
        st = self.game.state
        dim(s)
        ui.panel(s, (20, 20, 280, 150))
        font.draw(s, "MIRROR", (160, 26), ui.ACCENT, 2, align="center")
        pygame.draw.ellipse(s, (226, 180, 80), (32, 38, 76, 110))
        pygame.draw.ellipse(s, (200, 232, 250), (36, 42, 68, 102))
        d = ["down", "right", "up", "left"][int(self.t / 1.2) % 4]
        fr = [1, 0, 2, 0][int(self.t * 6) % 4]
        img = sprites.scaled(("mirror", st["hair"], st["outfit"], d, fr), sprites.zoe(st["hair"], st["outfit"], d, fr), 3)
        s.blit(img, (46, 56))
        font.draw(s, "HAIR (FREE!)", (128, 38), ui.INK)
        font.draw(s, "OUTFITS", (128, 72), ui.INK)
        for b in self.hair_btns + [b for _, b in self.outfit_btns] + [self.done]:
            b.draw(s, self.game.mpos)
        if len(st["outfits"]) < len(data.OUTFITS):
            font.draw(s, "MORE OUTFITS AT THE SHOP!", (204, 140), ui.MUTED, align="center")
        self.particles.draw(s)


# ======================================================================= trophies
class TrophyMenu(Scene):
    overlay = True

    def __init__(self, game):
        super().__init__(game)
        self.close_btn = ui.Button((134, 156, 52, 13), "Close", self.game.pop, key=pygame.K_ESCAPE)

    def event(self, e):
        self.close_btn.handle(e, self.game)

    def draw(self, s):
        st = self.game.state
        dim(s)
        ui.panel(s, (8, 8, 304, 164))
        font.draw(s, "TROPHY SHELF", (160, 13), ui.ACCENT, 2, align="center")
        m = self.game.mpos
        tip = None
        # badges
        pygame.draw.rect(s, (200, 150, 104), (16, 28, 150, 100))
        for i, k in enumerate(data.BADGES):
            c, r = i % 4, i // 4
            x, y = 22 + c * 36, 32 + r * 48
            got = k in st["badges"]
            img = sprites.scaled(("badge_big", k, got), sprites.badge(k, not got), 2)
            s.blit(img, (x, y))
            pygame.draw.rect(s, (160, 110, 70), (x - 4, y + 34, 40, 3))
            rect = pygame.Rect(x, y, 32, 32)
            if rect.collidepoint(m):
                tip = (data.BADGES[k]["name"] if got else "??? Badge", data.BADGES[k]["desc"])
        font.draw(s, f"BADGES {len(st['badges'])}/{len(data.BADGES)}", (91, 130), ui.INK, align="center")
        # achievements
        font.draw(s, "ACHIEVEMENTS", (174, 30), ui.INK)
        for i, (k, a) in enumerate(data.ACHIEVEMENTS.items()):
            y = 40 + i * 9
            got = k in st["achievements"]
            font.draw(s, font.STAR, (174, y), ui.GOLD if got else (190, 180, 196))
            font.draw(s, a["name"] if got else "???", (182, y), ui.INK if got else ui.MUTED)
            if pygame.Rect(174, y - 1, 130, 8).collidepoint(m):
                tip = (a["name"], a["desc"])
        s_ = st["stats"]
        font.draw(s, f"TREATED {s_['treated']} - FLEAS {s_['fleas']} - RARE {s_['rare']} - DAYS {s_['days_worked']}",
                  (160, 144), ui.MUTED, align="center")
        self.close_btn.draw(s, m)
        if tip:
            w = max(font.text_width(tip[0]), font.text_width(tip[1])) + 10
            x = min(SW - w - 2, m[0] + 6)
            y = min(SH - 22, m[1] + 8)
            ui.panel(s, (x, y, w, 20), (255, 255, 230), ui.BORDER)
            font.draw(s, tip[0], (x + 5, y + 4), ui.ACCENT)
            font.draw(s, tip[1], (x + 5, y + 12), ui.INK)


# ======================================================================= pets
class PetMenu(Scene):
    overlay = True

    def __init__(self, game, walker, world):
        super().__init__(game)
        self.w = walker
        self.pet = walker.pet
        self.world = world
        self.t = 0.0
        self.particles = ui.Particles()
        self.renaming = None
        x = 160
        self.buttons = [ui.Button((x, 60, 70, 14), "Pet", self.do_pet),
                        ui.Button((x, 78, 70, 14), "Feed", self.do_feed),
                        ui.Button((x, 96, 70, 14), "Play", self.do_play),
                        ui.Button((x, 114, 70, 14), "Rename", self.do_rename),
                        ui.Button((x, 136, 70, 14), "Bye!", self.close, key=pygame.K_ESCAPE)]
        self.msg = ""

    def hearts(self, n=6):
        self.particles.burst("heart", 104, 92, n, 30)
        self.game.audio.play("heart")
        self.pet["happy_t"] = 3.0

    def do_pet(self):
        self.hearts(5)
        self.msg = f"{self.pet['name']} loves the pats!"

    def do_feed(self):
        st = self.game.state
        if st["consumables"].get("pet_food", 0) <= 0:
            self.msg = "No pet food! Buy cans at the shop."
            self.game.audio.play("error")
            return
        st["consumables"]["pet_food"] -= 1
        if st["consumables"]["pet_food"] <= 0:
            del st["consumables"]["pet_food"]
        self.hearts(9)
        self.msg = "Nom nom nom! So happy!"

    def do_play(self):
        self.hearts(7)
        self.particles.burst("sparkle", 104, 80, 8, 30)
        self.msg = f"{self.pet['name']} zooms around!"

    def do_rename(self):
        self.renaming = ui.TextInput((70, 140, 80, 14), self.pet["name"], 10)
        self.game.typing = True
        try:
            pygame.key.start_text_input()
        except Exception:
            pass

    def finish_rename(self):
        if self.renaming and self.renaming.text.strip():
            self.pet["name"] = self.renaming.text.strip()[:10]
            self.msg = f"Hello, {self.pet['name']}!"
            self.hearts(4)
        self.renaming = None
        self.game.typing = False

    def close(self):
        if self.renaming:
            self.finish_rename()
        self.game.save()
        self.game.pop()

    def event(self, e):
        if self.renaming:
            if e.type == pygame.KEYDOWN and e.key in (pygame.K_RETURN, pygame.K_ESCAPE):
                self.finish_rename()
                return
            if self.renaming.handle(e):
                return
        for b in self.buttons:
            if b.handle(e, self.game):
                return

    def update(self, dt):
        self.t += dt
        self.particles.update(dt)

    def draw(self, s):
        dim(s)
        ui.panel(s, (60, 40, 184, 116))
        font.draw(s, self.pet["name"].upper(), (104, 46), ui.ACCENT, align="center")
        mood = "happy" if self.pet.get("happy_t", 0) > 0 else "normal"
        img = sprites.animal_big(self.pet["kind"], self.pet.get("variant", 0), int(self.t * 2) % 2, mood, 2)
        hop = int(abs(math.sin(self.t * 6)) * 3) if mood == "happy" else 0
        s.blit(img, (80, 66 - hop))
        font.draw(s, data.ANIMALS[self.pet["kind"]]["name"].upper(), (104, 118), ui.MUTED, align="center")
        if self.msg:
            font.draw_wrapped(s, self.msg, (66, 126, 86, 14), ui.INK, align="center")
        for b in self.buttons:
            b.draw(s, self.game.mpos)
        if self.renaming:
            ui.panel(s, (64, 132, 92, 24), (255, 250, 236), ui.BORDER)
            self.renaming.draw(s, self.t)
            font.draw(s, "TYPE + ENTER", (110, 134), ui.MUTED, align="center")
        self.particles.draw(s)


# ======================================================================= decorating
class DecorateMenu(Scene):
    overlay = True

    def __init__(self, game, hq_scene):
        super().__init__(game)
        self.hq = hq_scene
        self.room = "hq"
        self.held = None       # dict(name, rot, from_layout)
        self.t = 0.0
        self.room_btns = [ui.Button((216, 150, 30, 12), "HQ", lambda: self.set_room("hq")),
                          ui.Button((248, 150, 40, 12), "CLINIC", lambda: self.set_room("clinic"))]
        self.done_btn = ui.Button((290, 150, 28, 12), "OK", self.close)
        self.hq.cam = [0, 0]
        self.set_room("hq")

    def set_room(self, r):
        self.return_held()
        self.room = r
        self.room_btns[0].selected = r == "hq"
        self.room_btns[1].selected = r == "clinic"

    # grid geometry
    def origin(self):
        if self.room == "hq":
            return (-int(self.hq.cam[0]), -int(self.hq.cam[1]))
        from .clinic import DECOR_ORIGIN
        return DECOR_ORIGIN

    def bounds(self):
        if self.room == "hq":
            return (1, 2, 18, 8)
        from .clinic import CLINIC_GRID
        return (0, 0, CLINIC_GRID[0] - 1, CLINIC_GRID[1] - 1)

    def tile_at(self, m):
        ox, oy = self.origin()
        return ((m[0] - ox) // 16, (m[1] - oy) // 16)

    def footprint(self, name, x, y):
        w, h = data.DECOR[name]["size"]
        return [(x + i, y + j) for i in range(w) for j in range(h)]

    def valid(self, name, x, y):
        x0, y0, x1, y1 = self.bounds()
        cells = self.footprint(name, x, y)
        layer = 0 if name == "rug" else 1
        if self.room == "hq":
            from .world import HQScene
            fixed = HQScene.fixed_tiles
            pt = (int(self.hq.player.x) // 16, int(self.hq.player.y - 2) // 16)
        else:
            fixed, pt = set(), None
        taken = set()
        for d in self.game.state["layouts"][self.room]:
            if (0 if d["name"] == "rug" else 1) == layer:
                taken.update(self.footprint(d["name"], d["x"], d["y"]))
        for c in cells:
            if not (x0 <= c[0] <= x1 and y0 <= c[1] <= y1):
                return False
            if c in fixed or c in taken:
                return False
            if pt and c == pt and data.DECOR[name]["solid"]:
                return False
        return True

    def inv_items(self):
        return [k for k in data.DECOR if self.game.state["decor_inv"].get(k, 0) > 0]

    def inv_rects(self):
        return [(k, pygame.Rect(4 + i * 21, 148, 20, 20)) for i, k in enumerate(self.inv_items()[:10])]

    def return_held(self):
        if self.held:
            inv = self.game.state["decor_inv"]
            inv[self.held["name"]] = inv.get(self.held["name"], 0) + 1
            self.held = None

    def refresh(self):
        self.hq.apply_decor()
        for kind, key in gstate.check_general_achievements(self.game.state):
            from .world import _announce
            _announce(self.game, kind, key)

    def close(self):
        self.return_held()
        self.refresh()
        self.game.save()
        self.game.pop()

    def event(self, e):
        st = self.game.state
        m = self.game.mpos
        if e.type == pygame.KEYDOWN:
            if e.key == pygame.K_ESCAPE:
                if self.held:
                    self.return_held()
                else:
                    self.close()
                return
            if e.key == pygame.K_r and self.held:
                self.held["rot"] = (self.held["rot"] + 1) % 4
                self.game.audio.play("blip")
                return
            if e.key in (pygame.K_s, pygame.K_DELETE, pygame.K_BACKSPACE) and self.held:
                self.return_held()
                self.game.audio.play("whoosh")
                return
        for b in self.room_btns + [self.done_btn]:
            if b.handle(e, self.game):
                return
        if e.type == pygame.MOUSEBUTTONDOWN and e.button == 3 and self.held:
            self.return_held()
            self.game.audio.play("whoosh")
            return
        if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
            for k, r in self.inv_rects():
                if r.collidepoint(m):
                    self.return_held()
                    st["decor_inv"][k] -= 1
                    if st["decor_inv"][k] <= 0:
                        del st["decor_inv"][k]
                    self.held = dict(name=k, rot=0)
                    self.game.audio.play("select")
                    return
            if m[1] >= 146:
                return
            tx, ty = self.tile_at(m)
            if self.held:
                if self.valid(self.held["name"], tx, ty):
                    st["layouts"][self.room].append(dict(name=self.held["name"], x=tx, y=ty, rot=self.held["rot"]))
                    self.held = None
                    self.game.audio.play("pop")
                    self.refresh()
                else:
                    self.game.audio.play("error")
            else:
                lay = st["layouts"][self.room]
                for d in sorted(lay, key=lambda d: d["name"] == "rug"):
                    if (tx, ty) in self.footprint(d["name"], d["x"], d["y"]):
                        lay.remove(d)
                        self.held = dict(name=d["name"], rot=d.get("rot", 0))
                        self.game.audio.play("select")
                        self.refresh()
                        return

    def update(self, dt):
        self.t += dt

    def draw(self, s):
        st = self.game.state
        if self.room == "clinic":
            from .clinic import draw_lobby_bg
            s.fill((0, 0, 0))
            draw_lobby_bg(s, st)
            pygame.draw.rect(s, (176, 124, 84), (0, 0, 320, 32))
            font.draw(s, "DECORATING: CLINIC LOBBY", (160, 12), (255, 240, 220), align="center")
        else:
            ui.panel(s, (60, 2, 200, 11), (255, 250, 236), ui.BORDER, shadow=False)
            font.draw(s, "DECORATING: ZOE'S HQ", (160, 5), ui.ACCENT, align="center")
        ox, oy = self.origin()
        x0, y0, x1, y1 = self.bounds()
        grid = pygame.Surface((SW, SH), pygame.SRCALPHA)
        for ty in range(y0, y1 + 1):
            for tx in range(x0, x1 + 1):
                pygame.draw.rect(grid, (255, 255, 255, 50), (ox + tx * 16, oy + ty * 16, 16, 16), 1)
        s.blit(grid, (0, 0))
        m = self.game.mpos
        if self.held and m[1] < 146:
            tx, ty = self.tile_at(m)
            ok = self.valid(self.held["name"], tx, ty)
            w, h = data.DECOR[self.held["name"]]["size"]
            col = (120, 230, 120, 110) if ok else (240, 90, 90, 110)
            ov = pygame.Surface((w * 16, h * 16), pygame.SRCALPHA)
            ov.fill(col)
            s.blit(ov, (ox + tx * 16, oy + ty * 16))
            img = sprites.decor(self.held["name"], self.held["rot"])
            s.blit(img, (ox + tx * 16, oy + (ty + h) * 16 - img.get_height()))
        # inventory strip
        ui.panel(s, (0, 145, 320, 35), (255, 248, 236), ui.BORDER, shadow=False)
        for k, r in self.inv_rects():
            pygame.draw.rect(s, (246, 236, 246), r)
            pygame.draw.rect(s, ui.BORDER, r, 1)
            ic = sprites.decor_icon(k)
            s.blit(ic, (r.centerx - ic.get_width() // 2, r.y + 2))
            font.draw(s, f"{st['decor_inv'].get(k, 0)}", (r.right - 2, r.bottom - 6), ui.INK, align="right")
        if not self.inv_items():
            font.draw(s, "NO DECOR IN STORAGE - BUY SOME AT THE SHOP!", (108, 156), ui.MUTED, align="center")
        for b in self.room_btns + [self.done_btn]:
            b.draw(s, self.game.mpos)
        font.draw(s, "CLICK ITEM TO PICK UP - R ROTATE - RIGHT CLICK/S STORE", (160, 172), ui.MUTED, align="center")
