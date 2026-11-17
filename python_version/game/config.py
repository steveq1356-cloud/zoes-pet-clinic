"""Global config + ALL difficulty tuning lives here. Tweak freely."""

GAME_TITLE = "Zoe's Pet Clinic"
NATIVE_W, NATIVE_H = 320, 180
DEFAULT_WINDOW = (1280, 720)
FPS = 60
TILE = 16

# ---------------- Shift timing ----------------
SHIFT_SECONDS = 300            # real seconds for 9:00 AM -> 5:00 PM
SHIFT_START_MIN = 9 * 60
SHIFT_END_MIN = 17 * 60

# ---------------- Patient care tuning ----------------
ACTIVE_DRAIN_FACTOR = 0.35     # drain multiplier while patient is at a station
STATION_REFILL = 18            # health restored after finishing a station
RECOVERY_SECONDS = 10          # kennel recovery timer
CHECKIN_SECONDS = 2.0          # time at desk before ticket appears
BASE_KENNELS = 2
MAX_KENNELS = 6
BASE_MAX_PETS = 2
STRAY_CHANCE = 0.10            # chance a discharged animal has no home
STRAY_CHANCE_REGULAR = 0.22
REGULAR_CHANCE = 0.30          # chance a new happy patient becomes a regular
REGULAR_SPAWN_CHANCE = 0.25    # chance an arrival is a returning regular

# ---------------- Difficulty ramp ----------------
# Each tier applies from `from_day` on. arrival = (min, max) seconds between arrivals.
# personalities weights = (calm, nervous, grumpy, playful)
DIFFICULTY_TIERS = [
    dict(from_day=1,  max_concurrent=1, arrival=(16, 22), multi=0.00, max_ailments=1, drain=0.45, personalities=(6, 1, 0, 3)),
    dict(from_day=2,  max_concurrent=2, arrival=(15, 21), multi=0.00, max_ailments=1, drain=0.55, personalities=(5, 2, 1, 3)),
    dict(from_day=4,  max_concurrent=3, arrival=(12, 18), multi=0.30, max_ailments=2, drain=0.70, personalities=(4, 2, 2, 3)),
    dict(from_day=7,  max_concurrent=4, arrival=(10, 16), multi=0.45, max_ailments=2, drain=0.85, personalities=(3, 3, 2, 3)),
    dict(from_day=11, max_concurrent=5, arrival=(9, 14),  multi=0.55, max_ailments=3, drain=1.00, personalities=(2, 3, 3, 3)),
    dict(from_day=15, max_concurrent=6, arrival=(8, 12),  multi=0.65, max_ailments=3, drain=1.15, personalities=(2, 4, 4, 3)),
]

# Mini-game difficulty: multiplier = 1 + MINIGAME_RANK_STEP * rank_index (capped)
MINIGAME_RANK_STEP = 0.10
MINIGAME_DIFF_CAP = 1.8

# Rush days
RUSH_START_DAY = 4
RUSH_CHANCE = 0.22
RUSH_ARRIVAL_MULT = 0.65
RUSH_PAY_MULT = 1.5
RUSH_EXTRA_CONCURRENT = 1

# Rare / legendary
RARE_WEIGHT_MULT = 0.35        # rare animal spawn weight relative to commons
LEGENDARY_CHANCE = 0.03        # per arrival, once rank allows, max one per day

# Economy
RANK_PAY_STEP = 0.08           # +8% pay per rank
XP_PER_PATIENT = 10
XP_PER_STAR = 5
XP_RARE_BONUS = 15
XP_LEGENDARY_BONUS = 60


def tier_for_day(day):
    t = DIFFICULTY_TIERS[0]
    for tier in DIFFICULTY_TIERS:
        if day >= tier["from_day"]:
            t = tier
    return t
