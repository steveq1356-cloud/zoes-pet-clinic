"""Game state, progression helpers, and the save system (one slot + autosave)."""
import json
import os
import sys
import shutil
from . import data, config

SAVE_VERSION = 1


# ------------------------------------------------------------------ paths
def app_dir():
    if sys.platform.startswith("win"):
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
    elif sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Application Support")
    else:
        base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    d = os.path.join(base, "ZoesPetClinic")
    try:
        os.makedirs(d, exist_ok=True)
    except OSError:
        d = os.path.abspath(".")
    return d


def save_path():
    return os.path.join(app_dir(), "save.json")


def settings_path():
    return os.path.join(app_dir(), "settings.json")


DEFAULT_SETTINGS = dict(music=0.5, sfx=0.7, fullscreen=False, scale=4, muted=False)


def new_state():
    return dict(
        version=SAVE_VERSION, day=1, phase="morning", coins=60, xp=0, total_coins=0,
        hair="long", outfit="classic", owned=[], outfits=["classic"],
        consumables={"toy_ball": 2, "treat_biscuit": 2, "pet_food": 3},
        decor_inv={"plant": 1, "poster": 1},
        layouts={"hq": [], "clinic": []},
        badges=[], achievements=[],
        stats=dict(treated=0, lost=0, fleas=0, baths=0, rare=0, purchases=0, perfect_shots=0,
                   rush_days=0, legendary=0, days_worked=0),
        regulars=[], pets=[], rush=False, seen_tutorial=[], next_regular_id=1,
        last_rank=0, settings=dict(DEFAULT_SETTINGS),
    )


def _merge(default, loaded):
    """Fill missing keys from defaults (handles older/partial saves)."""
    out = dict(default)
    for k, v in loaded.items():
        if k in default and isinstance(default[k], dict) and isinstance(v, dict):
            d2 = dict(default[k])
            d2.update(v)
            out[k] = d2
        else:
            out[k] = v
    return out


def _sanitize(st):
    st["day"] = max(1, int(st.get("day", 1)))
    st["coins"] = max(0, int(st.get("coins", 0)))
    st["xp"] = max(0, int(st.get("xp", 0)))
    if st.get("hair") not in ("long", "bob"):
        st["hair"] = "long"
    if st.get("outfit") not in data.OUTFITS:
        st["outfit"] = "classic"
    if st.get("phase") not in ("morning", "evening"):
        st["phase"] = "morning"
    st["owned"] = [i for i in st.get("owned", []) if i in data.STORE_ITEMS]
    st["outfits"] = [o for o in st.get("outfits", ["classic"]) if o in data.OUTFITS] or ["classic"]
    st["consumables"] = {k: int(v) for k, v in st.get("consumables", {}).items() if k in data.STORE_ITEMS and int(v) > 0}
    st["decor_inv"] = {k: int(v) for k, v in st.get("decor_inv", {}).items() if k in data.DECOR and int(v) > 0}
    lay = st.get("layouts", {})
    st["layouts"] = {room: [d for d in lay.get(room, []) if isinstance(d, dict) and d.get("name") in data.DECOR]
                     for room in ("hq", "clinic")}
    st["pets"] = [p for p in st.get("pets", []) if isinstance(p, dict) and p.get("kind") in data.ANIMALS]
    st["regulars"] = [r for r in st.get("regulars", []) if isinstance(r, dict) and r.get("kind") in data.ANIMALS]
    return st


def save_game(st):
    path = save_path()
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(st, f, indent=1)
        os.replace(tmp, path)
        return True
    except OSError as e:
        print("Save failed:", e)
        return False


def load_game():
    """Returns (state or None, message or None)."""
    path = save_path()
    if not os.path.exists(path):
        return None, None
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        if not isinstance(raw, dict):
            raise ValueError("bad format")
        return _sanitize(_merge(new_state(), raw)), None
    except Exception as e:
        try:
            shutil.copy(path, path + ".corrupt.bak")
            os.remove(path)
        except OSError:
            pass
        print("Save corrupted:", e)
        return None, "Your save file was damaged, so a backup was made. Please start a New Game."


def has_save():
    return os.path.exists(save_path())


def delete_save():
    try:
        os.remove(save_path())
    except OSError:
        pass


def load_settings():
    s = dict(DEFAULT_SETTINGS)
    try:
        with open(settings_path(), "r", encoding="utf-8") as f:
            raw = json.load(f)
        for k in s:
            if k in raw:
                s[k] = raw[k]
    except Exception:
        pass
    s["scale"] = max(1, min(8, int(s.get("scale", 4))))
    return s


def save_settings(s):
    try:
        with open(settings_path(), "w", encoding="utf-8") as f:
            json.dump(s, f, indent=1)
    except OSError:
        pass


# ------------------------------------------------------------------ progression
def rank_index(xp):
    idx = 0
    for i, t in enumerate(data.RANK_XP):
        if xp >= t:
            idx = i
    return idx


def legend_stars(xp):
    if xp < data.RANK_XP[-1]:
        return 0
    return 1 + (xp - data.RANK_XP[-1]) // data.LEGENDARY_STEP


def rank_level(xp):
    """Continuous level: rank index plus extra legendary stars."""
    return rank_index(xp) + max(0, legend_stars(xp) - 1)


def rank_name(xp):
    i = rank_index(xp)
    if i == len(data.RANKS) - 1:
        st = legend_stars(xp)
        return "Legendary Vet" + (f" ^{st}" if st >= 2 else "")
    return data.RANKS[i]


def rank_bounds(xp):
    i = rank_index(xp)
    if i < len(data.RANK_XP) - 1:
        return data.RANK_XP[i], data.RANK_XP[i + 1]
    base = data.RANK_XP[-1] + (legend_stars(xp) - 1) * data.LEGENDARY_STEP
    return base, base + data.LEGENDARY_STEP


def has(st, item_id):
    return item_id in st["owned"]


def kennel_count(st):
    return config.BASE_KENNELS + sum(1 for k in ("kennel_3", "kennel_4", "kennel_5", "kennel_6") if has(st, k))


def max_pets(st):
    return config.BASE_MAX_PETS + 2 * sum(1 for k in ("pet_bed_1", "pet_bed_2") if has(st, k))


def item_unlocked(st, item_id):
    it = data.STORE_ITEMS[item_id]
    if rank_index(st["xp"]) < it.get("rank", 0):
        return False
    req = it.get("requires")
    return not req or has(st, req)


def unlocked_animals(st):
    r = rank_index(st["xp"])
    out = []
    for k, a in data.ANIMALS.items():
        if a.get("legendary"):
            continue
        if st["day"] >= a["unlock_day"] and r >= a["unlock_rank"]:
            out.append(k)
    return out


def award(st, kind, key):
    """kind: 'badges' or 'achievements'. Returns True if newly awarded."""
    if key in st[kind]:
        return False
    st[kind].append(key)
    return True


def minigame_difficulty(st):
    return min(config.MINIGAME_DIFF_CAP, 1.0 + config.MINIGAME_RANK_STEP * rank_level(st["xp"]))


def pay_mult(st):
    m = 1.0 + config.RANK_PAY_STEP * rank_level(st["xp"])
    if has(st, "exam_table_2"):
        m *= 1.10
    if st.get("rush"):
        m *= config.RUSH_PAY_MULT
    return m


def check_general_achievements(st):
    """Returns list of (kind, key) newly unlocked by persistent stats."""
    out = []
    s = st["stats"]
    checks = [
        ("badges", "first_patient", s["treated"] >= 1),
        ("badges", "hundred", s["treated"] >= 100),
        ("badges", "flea_fighter", s["fleas"] >= 100),
        ("badges", "rare_healer", s["rare"] >= 10),
        ("badges", "legendary", s["legendary"] >= 1),
        ("achievements", "bubbles", s["baths"] >= 10),
        ("achievements", "bullseye", s["perfect_shots"] >= 1),
        ("achievements", "first_adopt", len(st["pets"]) >= 1),
        ("achievements", "shopaholic", s["purchases"] >= 10),
        ("achievements", "fashion", len(st["outfits"]) >= 3),
        ("achievements", "coins_1000", st["total_coins"] >= 1000),
        ("achievements", "decorator", sum(len(v) for v in st["layouts"].values()) >= 8),
        ("achievements", "rank_vet", rank_index(st["xp"]) >= 3),
        ("achievements", "week", st["day"] >= 7),
    ]
    for kind, key, cond in checks:
        if cond and award(st, kind, key):
            out.append((kind, key))
    return out
