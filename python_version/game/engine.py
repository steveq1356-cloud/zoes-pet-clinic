"""Game loop, crisp integer scaling, scene manager, fades, shake and toasts."""
import pygame
from . import config, state as gstate, font, sprites
from .audio import Audio

W, H = config.NATIVE_W, config.NATIVE_H


class Scene:
    overlay = False      # if True, the scene beneath is drawn too
    music = None         # track to play when this scene becomes top

    def __init__(self, game):
        self.game = game

    def enter(self):
        pass

    def resume(self):
        pass

    def event(self, e):
        pass

    def update(self, dt):
        pass

    def draw(self, s):
        pass


class Game:
    def __init__(self):
        pygame.init()
        self.settings = gstate.load_settings()
        pygame.display.set_caption(config.GAME_TITLE)
        self.windowed_size = (W * self.settings["scale"], H * self.settings["scale"])
        self.fullscreen = False
        self._make_window(self.settings.get("fullscreen", False))
        self.native = pygame.Surface((W, H))
        self.clock = pygame.time.Clock()
        self.audio = Audio(self.settings)
        self.scenes = []
        self.state = None
        self.mpos = (0, 0)
        self.mouse_down = False
        self.running = True
        self.typing = False
        self.time = 0.0
        self.fade = 0.0
        self.fade_dir = 0
        self.fade_cb = None
        self.shake_t = 0.0
        self.shake_mag = 0
        self.toasts = []
        self._view = (0, 0, 1)
        self.load_message = None
        self.shift_snapshot = None
        try:
            icon = sprites.zoe("long", "classic", "down", 0)
            pygame.display.set_icon(pygame.transform.scale(icon, (32, 48)))
        except Exception:
            pass

    # ----------------------------------------------------------- window
    def _make_window(self, fullscreen):
        if fullscreen:
            self.window = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
        else:
            self.window = pygame.display.set_mode(self.windowed_size, pygame.RESIZABLE)
        self.fullscreen = fullscreen

    def toggle_fullscreen(self):
        self.settings["fullscreen"] = not self.fullscreen
        self._make_window(self.settings["fullscreen"])
        gstate.save_settings(self.settings)

    def set_window_scale(self, sc):
        self.settings["scale"] = sc
        self.windowed_size = (W * sc, H * sc)
        if not self.fullscreen:
            self._make_window(False)
        gstate.save_settings(self.settings)

    # ----------------------------------------------------------- scenes
    @property
    def top(self):
        return self.scenes[-1] if self.scenes else None

    def push(self, scene):
        self.scenes.append(scene)
        scene.enter()
        self._music_for_top()

    def pop(self):
        if self.scenes:
            self.scenes.pop()
        if self.scenes:
            self.scenes[-1].resume()
        self._music_for_top()

    def replace(self, scene):
        self.scenes = [scene]
        scene.enter()
        self._music_for_top()

    def _music_for_top(self):
        for sc in reversed(self.scenes):
            if sc.music:
                self.audio.music(sc.music)
                return

    def transition(self, fn):
        """Fade out, run fn (usually a scene change), fade in."""
        if self.fade_dir != 0:
            return
        self.fade_dir = 1
        self.fade_cb = fn
        self.audio.play("door", 0.6)

    # ----------------------------------------------------------- juice
    def shake(self, mag=3, t=0.25):
        self.shake_mag = max(self.shake_mag, mag)
        self.shake_t = max(self.shake_t, t)

    def toast(self, title, text, kind="achievement", key=None):
        self.toasts.append(dict(title=title, text=text, kind=kind, key=key, t=0.0))
        self.audio.play("chime")

    def save(self):
        if self.state:
            self.state["settings"] = dict(self.settings)
            gstate.save_game(self.state)

    # ----------------------------------------------------------- loop
    def to_native(self, pos):
        ox, oy, sc = self._view
        return (int((pos[0] - ox) / sc), int((pos[1] - oy) / sc))

    def run(self):
        step = 1.0 / config.FPS
        acc = 0.0
        while self.running:
            dt = min(0.1, self.clock.tick(config.FPS) / 1000.0)
            acc += dt
            self.mpos = self.to_native(pygame.mouse.get_pos())
            for e in pygame.event.get():
                self.handle_event(e)
            while acc >= step:
                self.update(step)
                acc -= step
            self.render()
        pygame.quit()

    def handle_event(self, e):
        if e.type == pygame.QUIT:
            self.running = False
            return
        if e.type == pygame.VIDEORESIZE and not self.fullscreen:
            self.windowed_size = (max(W, e.w), max(H, e.h))
            return
        if e.type == pygame.KEYDOWN:
            if e.key == pygame.K_F11:
                self.toggle_fullscreen()
                return
            if e.key == pygame.K_m and not self.typing:
                self.settings["muted"] = not self.settings.get("muted")
                self.audio.apply_volume()
                gstate.save_settings(self.settings)
                return
        if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
            self.mouse_down = True
        if e.type == pygame.MOUSEBUTTONUP and e.button == 1:
            self.mouse_down = False
        if hasattr(e, "pos") and e.type in (pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP, pygame.MOUSEMOTION):
            self.mpos = self.to_native(e.pos)
        if self.fade_dir != 0:
            return
        if self.top:
            self.top.event(e)

    def update(self, dt):
        self.time += dt
        self.audio.update()
        if self.fade_dir == 1:
            self.fade = min(1.0, self.fade + dt * 4)
            if self.fade >= 1.0:
                cb, self.fade_cb = self.fade_cb, None
                if cb:
                    cb()
                self.fade_dir = -1
        elif self.fade_dir == -1:
            self.fade = max(0.0, self.fade - dt * 4)
            if self.fade <= 0:
                self.fade_dir = 0
        if self.shake_t > 0:
            self.shake_t -= dt
            if self.shake_t <= 0:
                self.shake_mag = 0
        for t in self.toasts[:1]:
            t["t"] += dt
        self.toasts = [t for t in self.toasts if t["t"] < 3.2]
        if self.top and self.fade_dir != 1:
            self.top.update(dt)

    def render(self):
        s = self.native
        s.fill((0, 0, 0))
        start = len(self.scenes) - 1
        while start > 0 and self.scenes[start].overlay:
            start -= 1
        for sc in self.scenes[max(0, start):]:
            sc.draw(s)
        self._draw_toasts(s)
        if self.fade > 0:
            veil = pygame.Surface((W, H), pygame.SRCALPHA)
            veil.fill((20, 14, 30, int(255 * self.fade)))
            s.blit(veil, (0, 0))
        win = pygame.display.get_surface()
        ww, wh = win.get_size()
        sc = max(1, min(ww // W, wh // H))
        ox, oy = (ww - W * sc) // 2, (wh - H * sc) // 2
        self._view = (ox, oy, sc)
        win.fill((14, 10, 20))
        dx = dy = 0
        if self.shake_t > 0 and self.shake_mag:
            import random
            dx = random.randint(-self.shake_mag, self.shake_mag)
            dy = random.randint(-self.shake_mag, self.shake_mag)
        win.blit(pygame.transform.scale(s, (W * sc, H * sc)), (ox + dx * sc, oy + dy * sc))
        pygame.display.flip()

    def _draw_toasts(self, s):
        if not self.toasts:
            return
        t = self.toasts[0]
        k = t["t"]
        y = -24 + min(1.0, k * 4) * 28 if k < 2.8 else 4 - (k - 2.8) * 70
        rect = pygame.Rect(W // 2 - 80, int(y), 160, 22)
        from . import ui
        ui.panel(s, rect, (255, 246, 214), (200, 150, 60))
        if t["kind"] == "badge" and t.get("key"):
            s.blit(sprites.badge(t["key"]), (rect.x + 4, rect.y + 3))
        else:
            s.blit(sprites.icon("star"), (rect.x + 6, rect.y + 5))
        font.draw(s, t["title"], (rect.x + 24, rect.y + 4), (170, 110, 30))
        font.draw(s, t["text"], (rect.x + 24, rect.y + 12), (90, 70, 100))
