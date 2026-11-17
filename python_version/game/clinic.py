"""The clinic shift: arrivals, tickets, health, stations, kennels, Gus, summary."""
import json
import math
import random
import pygame
from . import config, data, font, sprites, ui, state as gstate
from .engine import Scene
from .minigames import STATION_GAMES, draw_symptoms

SLOT_X = [92 + i * 36 for i in range(6)]
FEET_Y = 122
DESK = (44, 124)
DOOR = (-6, 124)
TABS = ["lobby", "exam", "bath", "meds", "care", "kennel"]
DECOR_ORIGIN = (80, 48)
CLINIC_GRID = (14, 2)


# ======================================================================= patient
class Patient:
    _n = 0

    def __init__(self, kind, variant, name, personality, ailments, owner, regular=None, stray=False):
        Patient._n += 1
        self.id = Patient._n
        self.kind, self.variant, self.name = kind, variant, name
        self.personality = personality
        self.ailments = ailments
        self.owner = owner
        self.regular = regular
        self.stray = stray
        info = data.ANIMALS[kind]
        self.rare = info["rare"]
        self.legendary = info.get("legendary", False)
        self.health = 100.0
        self.diagnosed = False
        self.treated = set()
        self.scores = []
        self.status = "arriving"
        self.x, self.y = float(DOOR[0]), float(DOOR[1])
        self.target = DESK
        self.slot = None
        self.checkin = 0.0
        self.arrival = 0.0
        self.happy = 0
        self.gifts = 0
        self.used_toy = False
        self.recover = 0.0
        self.ticket = False
        self.anim = random.uniform(0, 5)
        self.owner_x = None
        self.severity = sum(data.AILMENTS[a]["severity"] for a in ailments) / len(ailments)

    @property
    def untreated(self):
        return set(self.ailments) - self.treated

    def stations(self):
        out = ["exam"]
        if self.diagnosed:
            for st in ("bath", "meds", "care"):
                if any(data.AILMENTS[a]["station"] == st for a in self.ailments):
                    out.append(st)
            out.append("kennel")
        return out

    def station_done(self, st):
        if st == "exam":
            return self.diagnosed
        if st == "kennel":
            return False
        return all(a in self.treated for a in self.ailments if data.AILMENTS[a]["station"] == st)

    def next_station(self):
        if not self.diagnosed:
            return "exam"
        for st in ("bath", "meds", "care"):
            if not self.station_done(st):
                return st
        return "kennel"

    def tasks_for(self, station):
        return [data.AILMENTS[a]["task"] for a in self.ailments
                if data.AILMENTS[a]["station"] == station and a not in self.treated]

    def complete(self, station):
        if station == "exam":
            self.diagnosed = True
            if "checkup" in self.ailments:
                self.treated.add("checkup")
        for a in self.ailments:
            if data.AILMENTS[a]["station"] == station:
                self.treated.add(a)


# ======================================================================= shift scene
class ShiftScene(Scene):
    music = "clinic"

    def __init__(self, game):
        super().__init__(game)
        st = self.st = game.state
        game.shift_snapshot = json.loads(json.dumps(st))
        self.tier = config.tier_for_day(st["day"])
        self.rush = bool(st.get("rush"))
        self.max_conc = self.tier["max_concurrent"] + (config.RUSH_EXTRA_CONCURRENT if self.rush else 0) \
            + (1 if gstate.has(st, "exam_table_2") else 0)
        self.clock = 0.0
        self.patients = []
        self.slots = [None] * 6
        self.next_arrival = 1.5
        self.view = "lobby"
        self.active = None
        self.mg = None
        self.placing = None
        self.kennels = [None] * gstate.kennel_count(st)
        self.particles = ui.Particles()
        self.dialogue = None
        self.gus = None
        self.gus_queue = []
        self.stats = dict(treated=0, lost=0, scores=[], stars=[], tips=0, coins=0, xp=0)
        self.unlocks = []
        self.start_xp = st["xp"]
        self.start_rank = gstate.rank_index(st["xp"])
        self.regulars_today = set()
        self.msg = None
        self.msg_t = 0
        self.selected_item = None
        self.closing = False
        self.ended = False
        self.result_pop = None
        self.t = 0.0
        if st["day"] == 1 and "shift" not in st["seen_tutorial"]:
            st["seen_tutorial"].append("shift")
            self.maple(data.TUTORIAL["shift"])
        elif self.rush:
            self.say_msg("RUSH DAY! Lots of patients - bigger payouts!", 3)

    # ----------------------------------------------------------- helpers
    def maple(self, lines, on_done=None, choices=None):
        port = sprites.npc_portrait("maple")
        self.dialogue = ui.DialogueBox(self.game, [("Dr. Maple", port, l) for l in lines], on_done, choices)

    def zoe(self, lines, on_done=None, choices=None):
        port = sprites.zoe_portrait(self.st["hair"], self.st["outfit"])
        self.dialogue = ui.DialogueBox(self.game, [("Zoe", port, l) for l in lines], on_done, choices)

    def say_msg(self, text, t=2.2):
        self.msg = text
        self.msg_t = t

    def announce(self, kind, key):
        if kind == "badges":
            self.game.toast("BADGE GET!", data.BADGES[key]["name"], "badge", key)
            self.unlocks.append("Badge: " + data.BADGES[key]["name"])
        else:
            self.game.toast("ACHIEVEMENT!", data.ACHIEVEMENTS[key]["name"])
            self.unlocks.append("Achievement: " + data.ACHIEVEMENTS[key]["name"])

    def award(self, kind, key):
        if gstate.award(self.st, kind, key):
            self.announce(kind, key)

    def check_general(self):
        for kind, key in gstate.check_general_achievements(self.st):
            self.announce(kind, key)

    def in_clinic(self):
        return [p for p in self.patients if p.status not in ("removed", "leaving")]

    def clock_text(self):
        mins = config.SHIFT_START_MIN + min(1.0, self.clock / config.SHIFT_SECONDS) * (config.SHIFT_END_MIN - config.SHIFT_START_MIN)
        mins = int(mins // 5 * 5)
        h, m = divmod(mins, 60)
        ap = "AM" if h < 12 else "PM"
        h12 = h % 12 or 12
        return f"{h12}:{m:02d} {ap}"

    # ----------------------------------------------------------- spawning
    def spawn(self):
        st = self.st
        free = [i for i, s in enumerate(self.slots) if s is None]
        if not free:
            return False
        rng = random
        regular = None
        if st["regulars"] and rng.random() < config.REGULAR_SPAWN_CHANCE:
            cands = [r for r in st["regulars"] if r["id"] not in self.regulars_today]
            if cands:
                regular = rng.choice(cands)
        present = {p.name for p in self.patients}
        if regular:
            self.regulars_today.add(regular["id"])
            kind, variant, name = regular["kind"], regular["variant"], regular["name"]
            pers, owner = regular["personality"], regular["owner"]
        else:
            moon = data.ANIMALS["moonfox"]
            if (gstate.rank_index(st["xp"]) >= moon["unlock_rank"] and not st.get("legendary_today")
                    and rng.random() < config.LEGENDARY_CHANCE):
                kind = "moonfox"
                st["legendary_today"] = True
            else:
                kinds = gstate.unlocked_animals(st)
                weights = [data.ANIMALS[k]["weight"] * (config.RARE_WEIGHT_MULT if data.ANIMALS[k]["rare"] else 1.0) for k in kinds]
                kind = rng.choices(kinds, weights)[0]
            variant = rng.randrange(len(data.ANIMALS[kind]["variants"]))
            names = [n for n in data.ANIMAL_NAMES if n not in present] or data.ANIMAL_NAMES
            name = rng.choice(names)
            pers = rng.choices(data.PERSONALITIES, self.tier["personalities"])[0]
            owner = rng.randrange(len(data.OWNER_LOOKS))
        n = 1
        while n < self.tier["max_ailments"] and rng.random() < self.tier["multi"]:
            n += 1
        pool = [a for a in data.ANIMALS[kind]["ailments"] if a != "checkup"]
        if n == 1 and "checkup" in data.ANIMALS[kind]["ailments"] and rng.random() < 0.12:
            ailments = ["checkup"]
        else:
            ailments = rng.sample(pool, min(n, len(pool)))
        stray = kind != "moonfox" and rng.random() < (config.STRAY_CHANCE_REGULAR if regular else config.STRAY_CHANCE)
        p = Patient(kind, variant, name, pers, ailments, owner, regular, stray)
        p.slot = free[0]
        self.slots[p.slot] = p
        p.arrival = self.clock
        p.checkin = 0.4 if gstate.has(st, "fast_checkin") else config.CHECKIN_SECONDS
        self.patients.append(p)
        self.game.audio.play("door", 0.5)
        return True

    # ----------------------------------------------------------- flow
    def select(self, p):
        if p.status == "dead":
            return
        if p.status == "kennel":
            self.view = "kennel"
            return
        if p.status not in ("waiting", "active"):
            return
        self.start_station(p, p.next_station())

    def start_station(self, p, station):
        if self.mg and self.mg.p is not p:
            self.abort_mg()
        if self.mg and self.mg.p is p and self.mg.station == station:
            self.view = station
            return
        if self.mg:
            self.abort_mg()
        self.view = station
        self.active = p
        if station == "kennel":
            self.placing = p
            if not any(k is None for k in self.kennels):
                self.say_msg("All kennels are full! Discharge someone first.")
        else:
            self.placing = None
            p.status = "active"
            self.mg = STATION_GAMES[station](self, p)
        if station not in self.st["seen_tutorial"]:
            self.st["seen_tutorial"].append(station)
            self.maple(data.TUTORIAL[station])
        self.game.audio.play("whoosh", 0.6)

    def abort_mg(self):
        if self.mg:
            if self.mg.p.status == "active":
                self.mg.p.status = "waiting"
            self.mg = None
        self.active = None

    def finish_mg(self):
        mg = self.mg
        p = mg.p
        score = mg.final
        p.scores.append(score)
        if mg.station == "bath":
            tasks = p.tasks_for("bath")
            if "scrub" in tasks or "fleas" in tasks:
                self.st["stats"]["baths"] += 1
            self.st["stats"]["fleas"] += getattr(mg, "fleas_caught", 0)
        p.complete(mg.station)
        p.health = min(100.0, p.health + config.STATION_REFILL)
        p.status = "waiting"
        self.mg = None
        self.active = None
        self.view = "lobby"
        if score >= 90:
            label, col = "PERFECT!", ui.GOLD
            self.game.audio.play("sparkle")
        elif score >= 70:
            label, col = "GREAT!", ui.GOOD
            self.game.audio.play("star")
        elif score >= 45:
            label, col = "GOOD", ui.INK
            self.game.audio.play("blip")
        else:
            label, col = "OKAY...", ui.MUTED
            self.game.audio.play("blip")
        self.result_pop = dict(label=label, score=score, col=col, t=0.0)
        sx = SLOT_X[p.slot] + 14
        if score >= 90:
            self.particles.burst("sparkle", sx, 100, 12, 30)
        self.particles.burst("heart", sx, 96, 2, 14)
        self.check_general()

    def place_in_kennel(self, p, i):
        self.kennels[i] = p
        p.status = "kennel"
        p.recover = config.RECOVERY_SECONDS
        self.slots[p.slot] = None
        p.slot_backup = p.slot
        p.slot = None
        self.placing = None
        self.active = None
        self.game.audio.play("select")
        if len(self.kennels) >= config.MAX_KENNELS and all(k is not None for k in self.kennels):
            self.award("badges", "full_house")

    def give_item(self, p, item_id):
        it = data.STORE_ITEMS[item_id]
        if self.st["consumables"].get(item_id, 0) <= 0:
            self.say_msg("You're out of those! Buy more at the shop.")
            return
        if p.gifts >= 2:
            self.say_msg(p.name + " is already super happy!")
            return
        self.st["consumables"][item_id] -= 1
        if self.st["consumables"][item_id] <= 0:
            del self.st["consumables"][item_id]
            self.selected_item = None
        p.happy += it["happy"]
        p.gifts += 1
        if it.get("toy"):
            p.used_toy = True
        i = self.kennels.index(p)
        kx, ky = self.kennel_rect(i).center
        self.particles.burst("heart", kx, ky - 4, 6, 24)
        self.game.audio.play("heart")
        if p.personality == "playful" and it.get("toy"):
            self.particles.text("SO PLAYFUL!", kx, ky - 20, ui.ACCENT)

    def discharge(self, p):
        st = self.st
        i = self.kennels.index(p)
        kx, ky = self.kennel_rect(i).center
        self.kennels[i] = None
        avg = (sum(p.scores) / len(p.scores) / 100.0) if p.scores else 0.8
        info = data.ANIMALS[p.kind]
        mult = gstate.pay_mult(st)
        pay = int(round(info["pay"] * avg * mult))
        tips = round(p.health / 100 * 8) + (6 if avg >= 0.9 else 3 if avg >= 0.75 else 0) + round(p.happy * 0.15)
        if p.personality == "playful" and p.used_toy:
            tips += 12
        if p.regular:
            tips += 3 * p.regular.get("visits", 1)
        if self.rush:
            tips = int(tips * config.RUSH_PAY_MULT)
        total = pay + tips
        s = 0.65 * avg + 0.25 * (p.health / 100) + 0.10 * min(1.0, p.happy / 40)
        stars = max(1, min(5, int(round(1 + s * 4))))
        xp = config.XP_PER_PATIENT + config.XP_PER_STAR * stars + (config.XP_RARE_BONUS if p.rare else 0) \
            + (config.XP_LEGENDARY_BONUS if p.legendary else 0)
        st["coins"] += total
        st["total_coins"] += total
        st["xp"] += xp
        st["stats"]["treated"] += 1
        if p.rare and not p.legendary:
            st["stats"]["rare"] += 1
        if p.legendary:
            st["stats"]["legendary"] += 1
        self.stats["treated"] += 1
        self.stats["scores"].append(avg * 100)
        self.stats["stars"].append(stars)
        self.stats["tips"] += tips
        self.stats["coins"] += total
        self.stats["xp"] += xp
        if self.clock - p.arrival <= 50:
            self.award("badges", "speed_vet")
        if stars == 5:
            self.award("achievements", "five_star")
        # regulars
        if p.regular:
            for r in st["regulars"]:
                if r["id"] == p.regular["id"]:
                    r["visits"] = r.get("visits", 1) + 1
                    if r["visits"] >= 3:
                        self.award("achievements", "old_friend")
        elif stars >= 3 and not p.legendary and not p.stray and random.random() < config.REGULAR_CHANCE:
            st["regulars"].append(dict(id=st.get("next_regular_id", 1), name=p.name, kind=p.kind, variant=p.variant,
                                       personality=p.personality, owner=p.owner, visits=1))
            st["next_regular_id"] = st.get("next_regular_id", 1) + 1
            st["regulars"] = st["regulars"][-12:]
            self.particles.text(p.name + " will be back!", kx, ky - 26, ui.ACCENT, 1.8)
        # juice
        self.game.audio.play("coin")
        for _ in range(min(12, 3 + total // 8)):
            self.particles.add("coin", kx, ky)
        self.particles.text(f"+{total}", kx, ky - 14, (200, 140, 30), 1.4)
        self.particles.burst("heart", kx, ky, 3, 20)
        stars_txt = font.STAR * stars
        self.particles.text(stars_txt, kx, ky + 8, ui.GOLD, 1.4)
        # leave with owner
        p.status = "leaving"
        p.x, p.y = DESK[0] + 10, FEET_Y + 2
        p.target = DOOR
        self.check_general()
        if p.stray:
            self.offer_adoption(p)

    def offer_adoption(self, p):
        st = self.st
        kname = data.ANIMALS[p.kind]["name"]
        if len(st["pets"]) >= gstate.max_pets(st):
            self.say_msg(f"{p.name} found a loving home with a neighbor!", 2.5)
            return

        def yes():
            st["pets"].append(dict(name=p.name, kind=p.kind, variant=p.variant))
            if p.regular:
                st["regulars"] = [r for r in st["regulars"] if r["id"] != p.regular["id"]]
            self.game.audio.play("chime")
            self.say_msg(f"{p.name} is coming home with you!", 2.5)
            self.check_general()

        def no():
            self.say_msg(f"{p.name} found a loving home with a neighbor!", 2.5)
        self.zoe([f"The neighbor who found {p.name} the {kname} can't keep them...",
                  f"Should I adopt {p.name}? They'd live at HQ and play in the park!"], None,
                 [("Adopt!", yes), ("No", no)])

    def die(self, p):
        p.status = "dead"
        p.health = 0
        if self.active is p:
            if self.mg:
                self.mg = None
            self.active = None
            self.placing = None
            self.view = "lobby"
        self.stats["lost"] += 1
        self.st["stats"]["lost"] += 1
        self.game.audio.play("sad")
        self.say_msg(f"{p.name} didn't make it...", 3)
        p.owner_x = float(SLOT_X[p.slot] - 4)
        self.gus_queue.append(p)

    # ----------------------------------------------------------- update
    def update(self, dt):
        self.t += dt
        self.particles.update(dt)
        if self.msg_t > 0:
            self.msg_t -= dt
        if self.result_pop:
            self.result_pop["t"] += dt
            if self.result_pop["t"] > 1.4:
                self.result_pop = None
        if self.dialogue:
            self.dialogue.update(dt)
            if self.dialogue.done:
                self.dialogue = None
            return
        if self.ended:
            return
        self.clock += dt
        if self.clock >= config.SHIFT_SECONDS and not self.closing:
            self.closing = True
            self.say_msg("5:00 PM - doors closed! Finish up your patients.", 3)
            self.game.audio.play("chime")
        # arrivals
        if not self.closing:
            self.next_arrival -= dt
            if self.next_arrival <= 0:
                if len(self.in_clinic()) < self.max_conc and self.spawn():
                    lo, hi = self.tier["arrival"]
                    m = config.RUSH_ARRIVAL_MULT if self.rush else 1.0
                    self.next_arrival = random.uniform(lo, hi) * m
                else:
                    self.next_arrival = 1.0
        # patients
        comfy = 0.8 if gstate.has(self.st, "comfy_waiting") else 1.0
        calm_desk = 0.9 if gstate.has(self.st, "fast_checkin") else 1.0
        for p in self.patients:
            p.anim += dt
            if p.status in ("arriving", "checkin", "waiting", "active"):
                base = 100.0 / (data.ANIMALS[p.kind]["patience"] * 1.8)
                rate = base * self.tier["drain"] * data.PERSONALITY_INFO[p.personality]["drain"] * p.severity * comfy * calm_desk
                if p.status == "active":
                    rate *= config.ACTIVE_DRAIN_FACTOR
                if self.view == "lobby" and self.dialogue:
                    rate = 0
                p.health -= rate * dt
                if p.health <= 0:
                    self.die(p)
                    continue
            if p.status == "arriving":
                if self._walk(p, DESK, 60, dt):
                    p.status = "checkin"
            elif p.status == "checkin":
                p.checkin -= dt
                if p.checkin <= 0:
                    p.status = "waiting"
                    p.ticket = True
                    self.game.audio.play("blip")
                    tag = " (Regular!)" if p.regular else ""
                    self.say_msg(f"{p.name} the {data.ANIMALS[p.kind]['name']} checked in!{tag}", 2)
                    if p.legendary:
                        self.say_msg("A glowing MOONFOX?! Treat it with care!", 3)
            elif p.status in ("waiting", "active") and p.slot is not None:
                self._walk(p, (SLOT_X[p.slot], FEET_Y), 60, dt)
            elif p.status == "kennel":
                if p.recover > 0:
                    p.recover -= dt
                    if p.recover <= 0:
                        self.game.audio.play("star", 0.6)
            elif p.status == "leaving":
                if self._walk(p, DOOR, 60, dt):
                    p.status = "removed"
            elif p.status == "dead" and p.owner_x is not None:
                p.owner_x -= 50 * dt
                if p.owner_x < -20:
                    p.owner_x = None
        # Gus
        self.update_gus(dt)
        # minigame
        if self.mg:
            self.mg.update(dt)
            if self.mg and self.mg.done:
                self.finish_mg()
        # end of day
        if self.closing and not self.in_clinic() and not self.gus and not self.gus_queue \
                and not any(p.status == "leaving" for p in self.patients):
            self.end_shift()

    def _walk(self, p, target, speed, dt):
        dx, dy = target[0] - p.x, target[1] - p.y
        d = math.hypot(dx, dy)
        if d < 1.5:
            p.x, p.y = float(target[0]), float(target[1])
            p.walking = False
            return True
        st = min(d, speed * dt)
        p.x += dx / d * st
        p.y += dy / d * st
        p.walking = True
        return False

    def update_gus(self, dt):
        g = self.gus
        if g is None:
            if self.gus_queue:
                p = self.gus_queue.pop(0)
                self.gus = dict(p=p, x=-24.0, phase="wait", t=1.2, dir="right")
            return
        p = g["p"]
        tx = SLOT_X[p.slot] - 12
        if g["phase"] == "wait":
            g["t"] -= dt
            if g["t"] <= 0:
                g["phase"] = "in"
        elif g["phase"] == "in":
            g["x"] += 45 * dt
            g["dir"] = "right"
            if g["x"] >= tx:
                g["x"] = tx
                g["phase"] = "pick"
                g["t"] = 1.0
        elif g["phase"] == "pick":
            g["t"] -= dt
            if g["t"] <= 0:
                g["phase"] = "out"
                self.slots[p.slot] = None
                p.carried = True
        elif g["phase"] == "out":
            g["x"] -= 45 * dt
            g["dir"] = "left"
            if g["x"] < -40:
                p.status = "removed"
                self.gus = None

    def end_shift(self):
        if self.ended:
            return
        self.ended = True
        st = self.st
        S = self.stats
        star_list = S["stars"] + [0] * S["lost"]
        avg_stars = sum(star_list) / len(star_list) if star_list else 0
        if S["lost"] == 0 and S["treated"] >= 3 and avg_stars >= 4.75:
            self.award("badges", "perfect_day")
        if self.rush:
            st["stats"]["rush_days"] += 1
            self.award("achievements", "rush_survivor")
        st["stats"]["days_worked"] += 1
        self.check_general()
        new_rank = gstate.rank_index(st["xp"])
        rank_ups = []
        for r in range(self.start_rank + 1, new_rank + 1):
            rank_ups.append((data.RANKS[r], data.RANK_UNLOCK_TEXT.get(r, "")))
        if gstate.legend_stars(st["xp"]) > gstate.legend_stars(self.start_xp) and gstate.legend_stars(self.start_xp) >= 1:
            rank_ups.append((gstate.rank_name(st["xp"]), "Another legendary star!"))
        st["phase"] = "evening"
        st["rush"] = False
        self.game.shift_snapshot = None
        self.game.save()
        summary = dict(day=st["day"], treated=S["treated"], lost=S["lost"],
                       avg=(sum(S["scores"]) / len(S["scores"])) if S["scores"] else 0,
                       tips=S["tips"], coins=S["coins"], stars=avg_stars, xp=S["xp"],
                       start_xp=self.start_xp, end_xp=st["xp"], rank_ups=rank_ups, unlocks=list(self.unlocks))
        self.game.transition(lambda: self.game.replace(SummaryScene(self.game, summary)))

    # ----------------------------------------------------------- input
    def ticket_list(self):
        return [p for p in self.patients if p.ticket and p.status in ("waiting", "active", "kennel", "dead")]

    def ticket_rect(self, i):
        return pygame.Rect(3 + i * 37, 2, 35, 28)

    def tab_rect(self, i):
        return pygame.Rect(i * 53 + 1, 169, 52, 11)

    def kennel_rect(self, i):
        c, r = i % 3, i // 3
        return pygame.Rect(22 + c * 96, 40 + r * 56, 84, 40)

    def discharge_rect(self, i):
        k = self.kennel_rect(i)
        return pygame.Rect(k.x + 12, k.bottom + 2, 60, 10)

    def item_rects(self):
        items = [k for k in ("toy_ball", "toy_feather", "treat_biscuit", "treat_deluxe")]
        return [(k, pygame.Rect(40 + j * 62, 154, 58, 13)) for j, k in enumerate(items)]

    def event(self, e):
        if self.dialogue:
            self.dialogue.event(e)
            if self.dialogue and self.dialogue.done:
                self.dialogue = None
            return
        if self.ended:
            return
        m = self.game.mpos
        if e.type == pygame.KEYDOWN and e.key == pygame.K_ESCAPE:
            from .menus import PauseMenu
            self.game.push(PauseMenu(self.game, in_shift=True))
            return
        if e.type == pygame.KEYDOWN and e.key == pygame.K_TAB:
            self.view = "lobby"
            return
        if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
            if m[1] < 32:
                for i, p in enumerate(self.ticket_list()[:6]):
                    if self.ticket_rect(i).collidepoint(m):
                        self.game.audio.play("select")
                        self.select(p)
                        return
                return
            if m[1] >= 168:
                for i, name in enumerate(TABS):
                    if self.tab_rect(i).collidepoint(m):
                        self.click_tab(name)
                        return
                return
            if self.view == "lobby":
                for p in self.patients:
                    if p.slot is not None and p.status in ("waiting", "active") and p.ticket:
                        r = pygame.Rect(SLOT_X[p.slot] - 4, 84, 36, 40)
                        if r.collidepoint(m):
                            self.game.audio.play("select")
                            self.select(p)
                            return
            if self.view == "kennel":
                self.kennel_click(m)
                return
        if self.mg and self.view == self.mg.station:
            self.mg.event(e)

    def click_tab(self, name):
        self.game.audio.play("blip")
        if name == "lobby":
            self.view = "lobby"
            return
        if self.mg and self.mg.station == name:
            self.view = name
            return
        cands = [p for p in self.patients if p.status == "waiting" and p.ticket and p.next_station() == name]
        if name == "kennel":
            self.view = "kennel"
            if cands and not self.placing:
                self.start_station(min(cands, key=lambda p: p.health), "kennel")
            return
        if cands:
            self.start_station(min(cands, key=lambda p: p.health), name)
        else:
            self.view = name
            if self.mg and self.mg.station != name:
                self.abort_mg()

    def kennel_click(self, m):
        for k, r in self.item_rects():
            if r.collidepoint(m):
                if self.st["consumables"].get(k, 0) > 0:
                    self.selected_item = None if self.selected_item == k else k
                    self.game.audio.play("blip")
                else:
                    self.say_msg("None left - buy more at the shop!")
                return
        for i in range(len(self.kennels)):
            p = self.kennels[i]
            if p and p.recover <= 0 and self.discharge_rect(i).collidepoint(m):
                self.discharge(p)
                return
            if self.kennel_rect(i).collidepoint(m):
                if p is None:
                    if self.placing and self.placing.status in ("waiting", "active"):
                        self.place_in_kennel(self.placing, i)
                    else:
                        self.say_msg("Click a patient's ticket when they're ready to recover.")
                elif self.selected_item:
                    self.give_item(p, self.selected_item)
                elif p.recover <= 0:
                    self.discharge(p)
                else:
                    self.say_msg("Select a toy or treat below to cheer them up!")
                return
        for i in range(len(self.kennels), config.MAX_KENNELS):
            if self.kennel_rect(i).collidepoint(m):
                self.say_msg("Buy more kennels at the Pet Supply Store!")

    # ----------------------------------------------------------- drawing
    def draw(self, s):
        if self.mg and self.view == self.mg.station:
            self.mg.draw(s)
        elif self.view == "lobby":
            self.draw_lobby(s)
        elif self.view == "kennel":
            self.draw_kennels(s)
        else:
            self.draw_empty_station(s)
        self.particles.draw(s)
        self.draw_rail(s)
        self.draw_tabs(s)
        if self.msg_t > 0 and self.msg:
            w = font.text_width(self.msg) + 12
            ui.panel(s, (160 - w // 2, 34 if self.view == "lobby" else 148, w, 11), (255, 250, 220), ui.BORDER)
            font.draw(s, self.msg, (160, 37 if self.view == "lobby" else 151), ui.INK, align="center")
        if self.result_pop:
            rp = self.result_pop
            k = rp["t"]
            sc = 2 if k > 0.12 else 3
            y = 60 - int(min(k, 0.3) * 30)
            font.draw(s, rp["label"], (160, y), rp["col"], sc, shadow=(255, 255, 255), align="center")
            font.draw(s, f"{rp['score']}%", (160, y + 14), ui.INK, shadow=(255, 255, 255), align="center")
        if self.dialogue:
            self.dialogue.draw(s)

    def draw_lobby(self, s, preview=False):
        draw_lobby_bg(s, self.st)
        # chairs
        chair = sprites.obj("comfy_chair" if gstate.has(self.st, "comfy_waiting") else "chair")
        for x in SLOT_X:
            s.blit(chair, (x - 4, 104))
        if preview:
            return
        t = self.t
        # patients
        for p in sorted(self.patients, key=lambda q: q.y):
            if p.status == "removed":
                continue
            ox, oy = int(p.x), int(p.y)
            walking = getattr(p, "walking", False)
            fr = [1, 0, 2, 0][int(p.anim * 8) % 4] if walking else 0
            if p.status == "dead":
                sx = SLOT_X[p.slot] if p.slot is not None else None
                if p.owner_x is not None:
                    s.blit(sprites.owner(p.owner, "left", [1, 0, 2, 0][int(p.anim * 8) % 4]), (int(p.owner_x), FEET_Y - 24))
                if sx is not None and not getattr(p, "carried", False):
                    s.blit(sprites.animal_dead(p.kind, p.variant), (sx + 4, FEET_Y - 20))
                continue
            if p.status == "kennel":
                continue
            d = "down"
            if walking:
                d = "right" if (p.target[0] if p.status == "leaving" else 0) >= p.x else "left"
                if p.status == "leaving":
                    d = "left"
                elif p.status == "arriving":
                    d = "right"
            if not (p.stray and p.status == "leaving"):
                s.blit(sprites.owner(p.owner, d, fr), (ox - 4, oy - 24))
            if p.status == "active":
                font.draw(s, "@" + data.STATION_NAMES[self.view if self.mg else "exam"].upper(), (ox + 14, oy - 14), ui.MUTED, align="center") \
                    if False else font.draw(s, "AWAY", (ox + 14, oy - 12), ui.MUTED, align="center")
            else:
                happy = p.status == "leaving"
                mood = "happy" if happy else ("blink" if int(p.anim * 0.7) % 6 == 0 else ("sick" if p.untreated - {"checkup"} and p.health < 40 else "normal"))
                bob = int(abs(math.sin(p.anim * 4))) if "paw" in p.untreated and not happy else 0
                fr2 = int(p.anim * 2) % 2
                ax, ay = ox + 6, oy - 22 + bob
                if p.kind == "moonfox":
                    r = 14 + int(math.sin(t * 3) * 2)
                    glow = pygame.Surface((r * 2, r * 2), pygame.SRCALPHA)
                    pygame.draw.circle(glow, (200, 220, 255, 70), (r, r), r)
                    s.blit(glow, (ax + 12 - r, ay + 12 - r))
                s.blit(sprites.animal(p.kind, p.variant, 24, fr2, mood), (ax, ay))
                if not happy:
                    draw_symptoms(s, p, ax, ay, 1, p.anim)
            if p.status in ("waiting",) and p.ticket and not walking:
                ui.hearts(s, ox - 1, oy - 36, p.health)
                ns = p.next_station()
                lab = data.STATION_NAMES[ns][0]
                pygame.draw.rect(s, (255, 255, 255), (ox + 31 - 9, oy - 44, 9, 8))
                pygame.draw.rect(s, ui.BORDER, (ox + 31 - 9, oy - 44, 9, 8), 1)
                font.draw(s, lab, (ox + 31 - 7, oy - 42), STATION_COLORS[ns])
                if p.regular:
                    font.draw(s, "REGULAR!", (ox + 12, oy - 50), ui.GOLD, shadow=(255, 255, 255), align="center")
        self.draw_gus(s)

    def draw_gus(self, s):
        g = self.gus
        if not g or g["phase"] == "wait":
            return
        p = g["p"]
        moving = g["phase"] in ("in", "out")
        fr = [1, 0, 2, 0][int(self.t * 8) % 4] if moving else 0
        gx = int(g["x"])
        cart = sprites.obj("cart")
        if g["dir"] == "right":
            s.blit(sprites.npc("gus", "right", fr), (gx, FEET_Y - 24))
            cx = gx + 12
            s.blit(cart, (cx, FEET_Y - 13))
        else:
            cx = gx - 16
            s.blit(pygame.transform.flip(cart, True, False), (cx, FEET_Y - 13))
            s.blit(sprites.npc("gus", "left", fr), (gx, FEET_Y - 24))
        if getattr(p, "carried", False):
            s.blit(sprites.animal_dead(p.kind, p.variant, 16), (cx + 2, FEET_Y - 24))

    def draw_empty_station(self, s):
        from .minigames import bg_room
        cols = dict(exam=((196, 236, 226), (236, 244, 250), (220, 234, 246)),
                    bath=((200, 228, 250), (236, 246, 252), (214, 232, 248)),
                    meds=((240, 230, 250), (246, 244, 250), (232, 228, 244)),
                    care=((250, 238, 210), (250, 244, 232), (240, 230, 214)))
        c = cols.get(self.view, cols["exam"])
        bg_room(s, *c)
        waiting = [p for p in self.patients if p.status == "waiting" and p.ticket and p.next_station() == self.view]
        txt = (f"{len(waiting)} patient(s) need this station - click their ticket!" if waiting
               else "No patients need this station right now.")
        ui.panel(s, (40, 86, 240, 24), (255, 250, 240), ui.BORDER)
        font.draw(s, data.STATION_NAMES[self.view].upper() + " STATION", (160, 90), ui.ACCENT, align="center")
        font.draw(s, txt, (160, 100), ui.INK, align="center")

    def draw_kennels(self, s):
        from .minigames import bg_room
        bg_room(s, (226, 236, 214), (244, 246, 236), (232, 236, 220))
        for i in range(config.MAX_KENNELS):
            r = self.kennel_rect(i)
            if i >= len(self.kennels):
                pygame.draw.rect(s, (170, 166, 176), r)
                pygame.draw.rect(s, ui.BORDER, r, 1)
                s.blit(sprites.icon("lock"), (r.centerx - 6, r.centery - 10))
                font.draw(s, "BUY AT SHOP", (r.centerx, r.centery + 6), (90, 80, 100), align="center")
                continue
            p = self.kennels[i]
            hov = r.collidepoint(self.game.mpos)
            pygame.draw.rect(s, (236, 240, 246), r)
            pygame.draw.rect(s, (196, 206, 220), r.inflate(-4, -4))
            pygame.draw.rect(s, (250, 232, 200), (r.x + 2, r.bottom - 12, r.w - 4, 10))
            if p:
                mood = "happy" if (p.recover <= 0 or p.happy > 0) else ("blink" if int(self.t) % 4 == 0 else "normal")
                s.blit(sprites.animal(p.kind, p.variant, 24, int(self.t * 1.5) % 2, mood), (r.centerx - 12, r.bottom - 28))
                font.draw(s, p.name, (r.x + 4, r.y + 4), ui.INK)
                if p.happy:
                    font.draw(s, font.HEART * min(3, 1 + p.happy // 25), (r.right - 4, r.y + 4), (240, 90, 120), align="right")
            for x in range(r.x + 4, r.right - 2, 6):
                pygame.draw.rect(s, (150, 160, 180), (x, r.y + 2, 1, r.h - 4))
            pygame.draw.rect(s, ui.BORDER if not hov else ui.ACCENT, r, 1)
            if p:
                if p.recover > 0:
                    k = 1 - p.recover / config.RECOVERY_SECONDS
                    pygame.draw.rect(s, ui.BORDER, (r.x + 12, r.bottom + 4, 60, 5))
                    pygame.draw.rect(s, ui.GOOD, (r.x + 13, r.bottom + 5, int(58 * k), 3))
                else:
                    dr = self.discharge_rect(i)
                    hv = dr.collidepoint(self.game.mpos)
                    pulse = int(self.t * 3) % 2
                    ui.panel(s, dr, (255, 236, 150) if (hv or pulse) else (250, 220, 120), ui.BORDER, shadow=False)
                    font.draw(s, "DISCHARGE", (dr.centerx, dr.y + 3), ui.INK, align="center")
            elif self.placing:
                if int(self.t * 3) % 2:
                    font.draw(s, "PLACE HERE", (r.centerx, r.centery - 2), ui.ACCENT, align="center")
        # toolbar
        font.draw(s, "TOYS:", (8, 158), ui.INK)
        for k, r in self.item_rects():
            n = self.st["consumables"].get(k, 0)
            sel = self.selected_item == k
            ui.panel(s, r, (250, 200, 214) if sel else ((255, 250, 240) if n else (220, 214, 222)), ui.BORDER, shadow=False)
            s.blit(sprites.icon(data.STORE_ITEMS[k]["icon"]), (r.x + 2, r.y + 1))
            font.draw(s, f"{data.STORE_ITEMS[k]['name'].split()[-1]} x{n}", (r.x + 16, r.y + 4), ui.INK if n else ui.MUTED)
        if self.placing:
            font.draw(s, f"CLICK AN EMPTY KENNEL FOR {self.placing.name.upper()}", (160, 34), ui.ACCENT, shadow=(255, 255, 255), align="center")

    def draw_rail(self, s):
        pygame.draw.rect(s, (176, 124, 84), (0, 0, 320, 32))
        pygame.draw.rect(s, (150, 100, 66), (0, 30, 320, 2))
        pygame.draw.rect(s, (200, 200, 210), (0, 1, 226, 2))
        tl = self.ticket_list()
        for i, p in enumerate(tl[:6]):
            r = self.ticket_rect(i)
            if p is self.active or (self.mg and self.mg.p is p):
                r = r.move(0, 1)
            dead = p.status == "dead"
            paper = (214, 210, 216) if dead else ((255, 236, 200) if p is self.active else (255, 252, 240))
            pygame.draw.rect(s, (60, 50, 70, 60), r.move(1, 1))
            pygame.draw.rect(s, paper, r)
            pygame.draw.rect(s, ui.ACCENT if (p is self.active) else ui.BORDER, r, 1)
            pygame.draw.rect(s, (150, 150, 170), (r.centerx - 1, r.y - 1, 3, 3))
            font.draw(s, p.name[:8], (r.x + 2, r.y + 3), ui.MUTED if dead else ui.INK)
            img = sprites.animal(p.kind, p.variant, 16, 0, "blink" if dead else "normal")
            if dead:
                img = sprites.cached(("graysmall", p.kind, p.variant), lambda: sprites.grayscale(img))
            s.blit(img, (r.x + 1, r.y + 9))
            if dead:
                font.draw(s, "X", (r.x + 22, r.y + 13), ui.BAD, 2)
                continue
            sts = p.stations()
            for j, stn in enumerate(sts[:5]):
                cx = r.x + 17 + (j % 3) * 6
                cy = r.y + 10 + (j // 3) * 7
                done = p.station_done(stn) or (stn == "kennel" and p.status == "kennel")
                pygame.draw.rect(s, (200, 240, 200) if done else (255, 255, 255), (cx, cy, 6, 7))
                font.draw(s, data.STATION_NAMES[stn][0], (cx + 1, cy + 1), ui.GOOD if done else STATION_COLORS[stn])
            if not p.diagnosed:
                font.draw(s, "?", (r.x + 24, r.y + 11), ui.MUTED)
            hc = (90, 200, 110) if p.health > 60 else ((240, 190, 70) if p.health > 30 else (236, 80, 90))
            if p.status == "kennel":
                hc = (130, 180, 240)
            pygame.draw.rect(s, (220, 214, 222), (r.x + 2, r.bottom - 4, r.w - 4, 2))
            pygame.draw.rect(s, hc, (r.x + 2, r.bottom - 4, int((r.w - 4) * max(0, p.health) / 100), 2))
            if p.regular:
                s.blit(sprites.icon("regular"), (r.right - 10, r.y - 3))
            if p.health < 30 and p.status in ("waiting", "active") and int(self.t * 4) % 2:
                pygame.draw.rect(s, ui.BAD, r, 1)
        if len(tl) > 6:
            font.draw(s, f"+{len(tl) - 6}", (222, 12), (255, 255, 255))
        # HUD
        hud = pygame.Rect(227, 1, 92, 30)
        ui.panel(s, hud, (255, 248, 236), ui.BORDER, shadow=False)
        font.draw(s, self.clock_text(), (hud.x + 4, hud.y + 3), ui.ACCENT if not self.closing else ui.BAD)
        font.draw(s, f"DAY {self.st['day']}", (hud.right - 4, hud.y + 3), ui.INK, align="right")
        s.blit(sprites.icon("coin"), (hud.x + 2, hud.y + 10))
        font.draw(s, str(self.st["coins"]), (hud.x + 16, hud.y + 13), (170, 120, 30))
        sl = self.stats["stars"] + [0] * self.stats["lost"]
        avg = sum(sl) / len(sl) if sl else 0
        ui.stars(s, hud.x + 4, hud.y + 21, int(round(avg)))
        if self.rush:
            font.draw(s, "RUSH", (hud.right - 4, hud.y + 21), ui.BAD, align="right")
        elif self.closing:
            font.draw(s, "CLOSED", (hud.right - 4, hud.y + 21), ui.BAD, align="right")
        # time progress
        k = min(1, self.clock / config.SHIFT_SECONDS)
        pygame.draw.rect(s, (220, 210, 200), (hud.x + 50, hud.y + 14, 38, 3))
        pygame.draw.rect(s, ui.ACCENT, (hud.x + 50, hud.y + 14, int(38 * k), 3))

    def draw_tabs(self, s):
        pygame.draw.rect(s, (52, 38, 64), (0, 168, 320, 12))
        for i, name in enumerate(TABS):
            r = self.tab_rect(i)
            cur = self.view == name
            n = len([p for p in self.patients if p.status == "waiting" and p.ticket and p.next_station() == name]) if name != "lobby" else 0
            if name == "kennel":
                n += len([p for p in self.kennels if p and p.recover <= 0])
            fill = (255, 236, 214) if cur else (120, 100, 140)
            pygame.draw.rect(s, fill, r)
            font.draw(s, data.STATION_NAMES[name].upper(), (r.centerx, r.y + 3), ui.INK if cur else (255, 240, 230), align="center")
            if n:
                pygame.draw.rect(s, ui.BAD, (r.right - 8, r.y, 8, 7))
                font.draw(s, str(min(9, n)), (r.right - 6, r.y + 1), (255, 255, 255))


STATION_COLORS = dict(exam=(80, 150, 200), bath=(70, 160, 220), meds=(170, 90, 200), care=(220, 130, 60),
                      kennel=(110, 170, 90), lobby=ui.INK)


def draw_lobby_bg(s, st):
    pygame.draw.rect(s, (196, 232, 220), (0, 32, 320, 32))
    for x in range(0, 320, 16):
        pygame.draw.rect(s, (184, 222, 210), (x, 32, 8, 32))
    pygame.draw.rect(s, (150, 196, 186), (0, 62, 320, 3))
    for y in range(65, 168, 10):
        for x in range(0, 320, 10):
            c = (240, 244, 250) if ((x // 10) + (y // 10)) % 2 else (222, 232, 246)
            pygame.draw.rect(s, c, (x, y, 10, 10))
    # window
    pygame.draw.rect(s, (250, 250, 252), (244, 36, 40, 22))
    pygame.draw.rect(s, (150, 210, 246), (246, 38, 36, 18))
    pygame.draw.rect(s, (250, 250, 252), (263, 38, 2, 18))
    pygame.draw.circle(s, (255, 240, 150), (252, 43), 3)
    # door
    pygame.draw.rect(s, (120, 170, 220), (0, 70, 12, 54))
    pygame.draw.rect(s, (90, 140, 190), (0, 70, 12, 54), 1)
    pygame.draw.rect(s, (250, 220, 120), (8, 98, 2, 3))
    # sign
    ui.panel(s, (128, 36, 64, 12), (255, 250, 236), (200, 100, 120), shadow=False)
    font.draw(s, "PAWSLEY VET", (160, 40), (200, 90, 110), align="center")
    # decor
    for d in st["layouts"]["clinic"]:
        info = data.DECOR[d["name"]]
        w, h = info["size"]
        img = sprites.decor(d["name"], d.get("rot", 0))
        x = DECOR_ORIGIN[0] + d["x"] * 16
        y = DECOR_ORIGIN[1] + (d["y"] + h) * 16 - img.get_height()
        s.blit(img, (x, y))
    s.blit(sprites.obj("desk"), (18, 82))
    s.blit(sprites.npc("maple" if st["day"] == 1 else "penny", "down", 0), (34, 64)) if False else None


# ======================================================================= summary
class SummaryScene(Scene):
    music = "town"

    def __init__(self, game, summary):
        super().__init__(game)
        self.s = summary
        self.t = 0.0
        self.coins_shown = 0.0
        self.xp_shown = float(summary["start_xp"])
        self.btn = ui.Button((120, 160, 80, 14), "Continue", self.cont, key=pygame.K_RETURN)
        self.particles = ui.Particles()
        self.played = set()

    def cont(self):
        from .world import town_after_shift
        self.game.transition(lambda: self.game.replace(town_after_shift(self.game)))

    def event(self, e):
        if self.t > 1.0:
            self.btn.handle(e, self.game)
            if e.type == pygame.KEYDOWN and e.key in (pygame.K_SPACE, pygame.K_e):
                self.cont()

    def update(self, dt):
        self.t += dt
        self.particles.update(dt)
        if self.t > 1.6:
            self.coins_shown = min(self.s["coins"], self.coins_shown + max(1, self.s["coins"]) * dt * 1.2)
        if self.t > 2.2:
            self.xp_shown = min(self.s["end_xp"], self.xp_shown + max(1, self.s["xp"]) * dt * 0.9)
        for i in range(8):
            if self.t > 0.3 + i * 0.25 and i not in self.played:
                self.played.add(i)
                self.game.audio.play("blip")
        if self.t > 2.4 and "stars" not in self.played:
            self.played.add("stars")
            if self.s["stars"] >= 4.5:
                self.particles.burst("sparkle", 160, 80, 16, 50)
                self.game.audio.play("sparkle")
        if self.s["rank_ups"] and self.t > 3.2 and "rank" not in self.played:
            self.played.add("rank")
            self.game.audio.play("chime")
            self.particles.burst("sparkle", 160, 120, 20, 60)

    def draw(self, s):
        s.fill((250, 220, 200))
        for y in range(0, 180, 12):
            pygame.draw.rect(s, (246, 210, 190), (0, y, 320, 6))
        r = pygame.Rect(30, 6, 260, 150)
        ui.panel(s, r, ui.PAPER, ui.BORDER)
        font.draw(s, f"DAY {self.s['day']} COMPLETE!", (160, 12), ui.ACCENT, 2, align="center")
        rows = [("Animals treated", str(self.s["treated"]), ui.INK),
                ("Animals lost", str(self.s["lost"]), ui.BAD if self.s["lost"] else ui.INK),
                ("Average score", f"{int(self.s['avg'])}%", ui.INK),
                ("Tips", str(self.s["tips"]), (170, 120, 30)),
                ("Coins earned", str(int(self.coins_shown)), (170, 120, 30))]
        y = 30
        for i, (a, b, c) in enumerate(rows):
            if self.t > 0.3 + i * 0.25:
                font.draw(s, a.upper(), (44, y), ui.INK)
                font.draw(s, b, (276, y), c, align="right")
                pygame.draw.rect(s, (230, 220, 214), (44, y + 7, 232, 1))
            y += 11
        if self.t > 1.8:
            font.draw(s, "STAR RATING", (44, y + 1), ui.INK)
            ui.stars(s, 246, y, int(round(self.s["stars"])), 5, 1) if False else None
            n = int(round(self.s["stars"]))
            for i in range(5):
                c = (250, 200, 60) if i < n else (190, 180, 196)
                font.draw(s, font.STAR, (216 + i * 12, y - 2), c, 2)
        y += 16
        if self.t > 2.2:
            xp = int(self.xp_shown)
            lo, hi = gstate.rank_bounds(xp)
            font.draw(s, gstate.rank_name(xp).upper(), (44, y), ui.ACCENT)
            font.draw(s, f"+{self.s['xp']} XP", (276, y), ui.GOOD, align="right")
            pygame.draw.rect(s, ui.BORDER, (44, y + 8, 232, 6))
            pygame.draw.rect(s, (250, 210, 230), (45, y + 9, 230, 4))
            pygame.draw.rect(s, ui.ACCENT, (45, y + 9, int(230 * (xp - lo) / max(1, hi - lo)), 4))
        y += 18
        extras = []
        for nm, txt in self.s["rank_ups"]:
            extras.append(("RANK UP! " + nm.upper(), ui.GOLD))
            if txt:
                extras.append((txt, ui.INK))
        for u in self.s["unlocks"]:
            extras.append((u, (140, 90, 190)))
        if self.t > 3.0:
            for i, (txt, col) in enumerate(extras[:5]):
                font.draw(s, txt, (160, y + i * 8), col, align="center")
            if len(extras) > 5:
                font.draw(s, f"...and {len(extras) - 5} more!", (160, y + 40), ui.MUTED, align="center")
        self.particles.draw(s)
        if self.t > 1.0:
            self.btn.draw(s, self.game.mpos)
