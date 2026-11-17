"""All game content in easy-to-edit dicts. Add animals/items/badges here."""

# ---------------------------------------------------------------- ANIMALS
# variants: body / belly / accent colors. food must be a key of FOODS.
ANIMALS = {
    "dog": dict(name="Dog", rare=False, unlock_day=1, unlock_rank=0, food="kibble",
                ailments=["fleas", "mud", "matted", "fever", "infection", "tummy", "paw", "hungry", "checkup"],
                patience=100, pay=30, weight=10,
                variants=[dict(body=(222, 170, 92), belly=(250, 226, 180), accent=(160, 108, 58)),
                          dict(body=(150, 98, 62), belly=(214, 170, 130), accent=(96, 60, 40)),
                          dict(body=(238, 234, 226), belly=(255, 255, 255), accent=(70, 66, 72))]),
    "cat": dict(name="Cat", rare=False, unlock_day=1, unlock_rank=0, food="fish",
                ailments=["fleas", "matted", "fever", "infection", "tummy", "paw", "hungry", "checkup"],
                patience=90, pay=30, weight=10,
                variants=[dict(body=(238, 150, 70), belly=(252, 222, 180), accent=(196, 100, 40)),
                          dict(body=(150, 150, 168), belly=(214, 214, 226), accent=(100, 100, 120)),
                          dict(body=(64, 60, 76), belly=(110, 104, 124), accent=(40, 36, 50))]),
    "bunny": dict(name="Bunny", rare=False, unlock_day=2, unlock_rank=0, food="veggies",
                  ailments=["mud", "matted", "fever", "tummy", "paw", "hungry", "checkup"],
                  patience=85, pay=26, weight=8,
                  variants=[dict(body=(246, 244, 248), belly=(255, 226, 236), accent=(250, 180, 200)),
                            dict(body=(176, 130, 96), belly=(232, 200, 170), accent=(240, 170, 180)),
                            dict(body=(160, 160, 170), belly=(220, 220, 228), accent=(240, 170, 190))]),
    "hamster": dict(name="Hamster", rare=False, unlock_day=3, unlock_rank=0, food="seeds",
                    ailments=["mud", "fever", "tummy", "paw", "hungry", "checkup"],
                    patience=80, pay=22, weight=7,
                    variants=[dict(body=(236, 178, 104), belly=(255, 240, 216), accent=(250, 170, 170)),
                              dict(body=(244, 240, 232), belly=(255, 255, 255), accent=(250, 170, 180)),
                              dict(body=(150, 140, 132), belly=(226, 218, 210), accent=(240, 160, 170))]),
    "hedgehog": dict(name="Hedgehog", rare=True, unlock_day=1, unlock_rank=2, food="mealworms",
                     ailments=["mud", "fever", "infection", "tummy", "paw", "hungry", "checkup"],
                     patience=85, pay=50, weight=10,
                     variants=[dict(body=(122, 92, 72), belly=(240, 214, 182), accent=(80, 58, 44)),
                               dict(body=(200, 180, 160), belly=(250, 236, 220), accent=(150, 130, 112))]),
    "fox": dict(name="Fox", rare=True, unlock_day=1, unlock_rank=3, food="berries",
                ailments=["fleas", "mud", "matted", "fever", "infection", "paw", "hungry", "checkup"],
                patience=80, pay=55, weight=10,
                variants=[dict(body=(232, 120, 48), belly=(255, 246, 236), accent=(60, 44, 40))]),
    "redpanda": dict(name="Red Panda", rare=True, unlock_day=1, unlock_rank=4, food="bamboo",
                     ailments=["fleas", "matted", "fever", "infection", "tummy", "paw", "hungry", "checkup"],
                     patience=80, pay=60, weight=9,
                     variants=[dict(body=(196, 84, 44), belly=(70, 40, 36), accent=(255, 246, 236))]),
    "penguin": dict(name="Baby Penguin", rare=True, unlock_day=1, unlock_rank=5, food="fish",
                    ailments=["mud", "fever", "infection", "tummy", "paw", "hungry", "checkup"],
                    patience=75, pay=65, weight=8,
                    variants=[dict(body=(120, 128, 150), belly=(240, 244, 250), accent=(250, 170, 60))]),
    "moonfox": dict(name="Moonfox", rare=True, legendary=True, unlock_day=1, unlock_rank=6, food="berries",
                    ailments=["fever", "infection", "matted", "paw", "hungry"],
                    patience=95, pay=220, weight=0,
                    variants=[dict(body=(196, 214, 255), belly=(250, 250, 255), accent=(255, 230, 120))]),
}

ANIMAL_NAMES = ["Biscuit", "Mochi", "Pepper", "Noodle", "Clover", "Waffles", "Pip", "Juniper", "Toast",
                "Maple", "Bean", "Sprout", "Ziggy", "Olive", "Pudding", "Sunny", "Button", "Pickles",
                "Luna", "Nugget", "Cocoa", "Tater", "Fig", "Pebble", "Rusty", "Hazel", "Dumpling",
                "Marble", "Truffle", "Scout", "Peaches", "Bubbles", "Gizmo", "Wren", "Socks", "Taffy",
                "Kiwi", "Sesame", "Bramble", "Pumpkin", "Daisy", "Tofu", "Chip", "Poppy", "Mango"]

PERSONALITIES = ["calm", "nervous", "grumpy", "playful"]
PERSONALITY_INFO = {
    "calm": dict(name="Calm", drain=0.75, speed=0.85, color=(110, 200, 140)),
    "nervous": dict(name="Nervous", drain=1.4, speed=1.0, color=(240, 200, 80)),
    "grumpy": dict(name="Grumpy", drain=1.0, speed=1.0, color=(220, 90, 90)),
    "playful": dict(name="Playful", drain=1.0, speed=1.0, color=(130, 170, 250)),
}

# ---------------------------------------------------------------- AILMENTS
# station: which station treats it. task: the mini-game task id.
# clues: what each exam tool reveals (None = looks normal).
AILMENTS = {
    "fleas": dict(name="Fleas", station="bath", task="fleas", severity=1.0, symptom="Can't stop scratching!",
                  clues=dict(steth="Restless, twitchy", thermo=None, mag="Tiny jumping bugs!")),
    "mud": dict(name="Muddy", station="bath", task="scrub", severity=0.8, symptom="Rolled in a puddle...",
                clues=dict(steth=None, thermo=None, mag="Caked in dried mud")),
    "matted": dict(name="Matted Fur", station="bath", task="groom", severity=0.9, symptom="Fur is a big knot!",
                   clues=dict(steth=None, thermo=None, mag="Fur tangled & overgrown")),
    "fever": dict(name="Fever", station="meds", task="syringe", severity=1.4, symptom="Feels hot and sleepy",
                  clues=dict(steth="Fast heartbeat", thermo="104F - Too hot!", mag=None)),
    "infection": dict(name="Infection", station="meds", task="shot", severity=1.3, symptom="Has a sore scratch",
                      clues=dict(steth=None, thermo="102F - A bit warm", mag="Swollen red scratch")),
    "tummy": dict(name="Upset Tummy", station="meds", task="pill", severity=1.1, symptom="Won't eat breakfast",
                  clues=dict(steth="Gurgly tummy sounds", thermo=None, mag="Bloated belly")),
    "paw": dict(name="Hurt Paw", station="care", task="bandage", severity=1.1, symptom="Limping a little",
                clues=dict(steth=None, thermo=None, mag="Swollen paw pad")),
    "hungry": dict(name="Hungry", station="care", task="food", severity=1.0, symptom="Tummy keeps rumbling",
                   clues=dict(steth="Empty, rumbly stomach", thermo=None, mag="Dry nose, low energy")),
    "checkup": dict(name="Check-up", station=None, task=None, severity=0.6, symptom="Just a routine visit!",
                    clues=dict(steth=None, thermo=None, mag=None)),
}
NORMAL_CLUES = dict(steth="Heart & lungs: OK", thermo="101F - Normal", mag="Skin & fur look OK")

STATION_ORDER = ["exam", "bath", "meds", "care", "kennel"]
STATION_NAMES = dict(lobby="Lobby", exam="Exam", bath="Bath", meds="Meds", care="Care", kennel="Kennel")
TASK_ORDER = ["scrub", "fleas", "groom", "syringe", "pill", "shot", "food", "bandage"]

FOODS = {
    "kibble": dict(name="Kibble", color=(176, 110, 60)),
    "fish": dict(name="Fish Bits", color=(120, 170, 220)),
    "veggies": dict(name="Veggies", color=(110, 190, 90)),
    "seeds": dict(name="Seed Mix", color=(230, 200, 120)),
    "mealworms": dict(name="Mealworms", color=(200, 150, 90)),
    "bamboo": dict(name="Bamboo", color=(150, 210, 110)),
    "berries": dict(name="Berries", color=(200, 70, 120)),
}

# ---------------------------------------------------------------- OUTFITS
OUTFITS = {
    "classic": dict(name="Classic Scrubs", scrub=(140, 196, 240), coat=(250, 250, 252), shoes=(240, 240, 245)),
    "pink": dict(name="Pink Scrubs", scrub=(246, 160, 196), coat=(250, 250, 252), shoes=(250, 220, 230)),
    "mint": dict(name="Mint Scrubs", scrub=(140, 220, 190), coat=(250, 250, 252), shoes=(230, 245, 240)),
    "patches": dict(name="Patchy Lab Coat", scrub=(150, 150, 200), coat=(236, 236, 230), shoes=(120, 90, 70), patches=True),
    "sweater": dict(name="Cozy Sweater", scrub=(232, 150, 90), coat=None, shoes=(130, 90, 60), pants=(90, 110, 160)),
    "overalls": dict(name="Comfy Overalls", scrub=(250, 236, 140), coat=None, shoes=(200, 80, 80), pants=(110, 150, 210), overalls=True),
    "starry": dict(name="Starry Coat", scrub=(70, 70, 140), coat=(40, 44, 100), shoes=(250, 220, 120), stars=True),
}

# ---------------------------------------------------------------- STORE ITEMS
# cat: tools | clinic | style | toys.  kind: upgrade | outfit | decor | consumable
STORE_ITEMS = {
    # Vet tools (permanent mini-game helpers)
    "golden_steth": dict(cat="tools", kind="upgrade", name="Golden Stethoscope", price=120, rank=0, icon="steth_gold",
                         desc="Exam tools reveal clues much faster."),
    "flea_comb": dict(cat="tools", kind="upgrade", name="Flea Comb", price=100, rank=0, icon="comb",
                      desc="Catch fleas in a much bigger area."),
    "super_sponge": dict(cat="tools", kind="upgrade", name="Super Sponge", price=100, rank=0, icon="sponge",
                         desc="Scrub mud away twice as fast."),
    "steady_syringe": dict(cat="tools", kind="upgrade", name="Steady Syringe", price=150, rank=1, icon="syringe",
                           desc="Wider sweet spot for shots and fills."),
    "silk_bandage": dict(cat="tools", kind="upgrade", name="Silk Bandages", price=140, rank=1, icon="bandage",
                         desc="More time for each bandage wrap."),
    "pro_shears": dict(cat="tools", kind="upgrade", name="Pro Shears", price=130, rank=2, icon="shears",
                       desc="Trimming is more forgiving."),
    "smart_scoop": dict(cat="tools", kind="upgrade", name="Smart Scoop", price=120, rank=2, icon="scoop",
                        desc="Food pours slower and smoother."),
    # Clinic upgrades
    "kennel_3": dict(cat="clinic", kind="upgrade", name="Kennel #3", price=150, rank=0, icon="kennel",
                     desc="A third recovery kennel."),
    "kennel_4": dict(cat="clinic", kind="upgrade", name="Kennel #4", price=260, rank=1, icon="kennel", requires="kennel_3",
                     desc="A fourth recovery kennel."),
    "kennel_5": dict(cat="clinic", kind="upgrade", name="Kennel #5", price=380, rank=3, icon="kennel", requires="kennel_4",
                     desc="A fifth recovery kennel."),
    "kennel_6": dict(cat="clinic", kind="upgrade", name="Kennel #6", price=520, rank=4, icon="kennel", requires="kennel_5",
                     desc="Sixth kennel. Fill them all for a badge!"),
    "comfy_waiting": dict(cat="clinic", kind="upgrade", name="Comfy Waiting Room", price=240, rank=0, icon="chair",
                          desc="Waiting patients lose patience 20% slower."),
    "fast_checkin": dict(cat="clinic", kind="upgrade", name="Speedy Check-in Desk", price=200, rank=1, icon="desk",
                         desc="Instant check-in. Patients arrive calmer."),
    "exam_table_2": dict(cat="clinic", kind="upgrade", name="Second Exam Table", price=320, rank=2, icon="table",
                         desc="+1 patient capacity and +10% pay."),
    "pet_bed_1": dict(cat="clinic", kind="upgrade", name="Extra Pet Beds", price=180, rank=1, icon="petbed",
                      desc="Adopt up to 2 more pets."),
    "pet_bed_2": dict(cat="clinic", kind="upgrade", name="Pet Bed Deluxe", price=360, rank=3, icon="petbed", requires="pet_bed_1",
                      desc="Adopt up to 2 more pets."),
    # Outfits
    "outfit_pink": dict(cat="style", kind="outfit", outfit="pink", name="Pink Scrubs", price=80, rank=0, icon="outfit",
                        desc="Cute pink scrubs."),
    "outfit_mint": dict(cat="style", kind="outfit", outfit="mint", name="Mint Scrubs", price=80, rank=0, icon="outfit",
                        desc="Fresh minty scrubs."),
    "outfit_sweater": dict(cat="style", kind="outfit", outfit="sweater", name="Cozy Sweater", price=100, rank=1, icon="outfit",
                           desc="Warm and snuggly."),
    "outfit_patches": dict(cat="style", kind="outfit", outfit="patches", name="Patchy Lab Coat", price=120, rank=1, icon="outfit",
                           desc="A coat with fun patches."),
    "outfit_overalls": dict(cat="style", kind="outfit", outfit="overalls", name="Comfy Overalls", price=110, rank=2, icon="outfit",
                            desc="Ready for farm calls!"),
    "outfit_starry": dict(cat="style", kind="outfit", outfit="starry", name="Starry Coat", price=300, rank=5, icon="outfit",
                          desc="Sparkles like the night sky."),
    # Decor (buy multiples; place in HQ or Clinic)
    "decor_plant": dict(cat="style", kind="decor", decor="plant", name="Potted Plant", price=25, rank=0, desc="A leafy friend."),
    "decor_rug": dict(cat="style", kind="decor", decor="rug", name="Round Rug", price=40, rank=0, desc="Soft under paws."),
    "decor_lamp": dict(cat="style", kind="decor", decor="lamp", name="Floor Lamp", price=35, rank=0, desc="Warm cozy light."),
    "decor_bookshelf": dict(cat="style", kind="decor", decor="bookshelf", name="Bookshelf", price=60, rank=0, desc="Full of vet books."),
    "decor_beanbag": dict(cat="style", kind="decor", decor="beanbag", name="Beanbag", price=45, rank=1, desc="Flop down after a shift."),
    "decor_cattree": dict(cat="style", kind="decor", decor="cattree", name="Cat Tree", price=70, rank=1, desc="Pets love climbing it."),
    "decor_fishtank": dict(cat="style", kind="decor", decor="fishtank", name="Fish Tank", price=90, rank=2, desc="Bubbly and calming."),
    "decor_sofa": dict(cat="style", kind="decor", decor="sofa", name="Little Sofa", price=110, rank=2, desc="Seats two (or six pets)."),
    "decor_poster": dict(cat="style", kind="decor", decor="poster", name="Paw Poster", price=20, rank=0, desc="'Be kind to animals!'"),
    "decor_starlamp": dict(cat="style", kind="decor", decor="starlamp", name="Star Lamp", price=150, rank=4, desc="Twinkly star light."),
    # Toys & treats (consumables)
    "toy_ball": dict(cat="toys", kind="consumable", name="Squeaky Ball", price=10, rank=0, icon="ball", happy=25, toy=True,
                     desc="Toy: +happiness. Playful pets tip big!"),
    "toy_feather": dict(cat="toys", kind="consumable", name="Feather Wand", price=14, rank=1, icon="feather", happy=35, toy=True,
                        desc="Toy: +lots of happiness."),
    "treat_biscuit": dict(cat="toys", kind="consumable", name="Yummy Biscuit", price=8, rank=0, icon="biscuit", happy=20, toy=False,
                          desc="Treat: +happiness and +tips."),
    "treat_deluxe": dict(cat="toys", kind="consumable", name="Deluxe Treat", price=20, rank=2, icon="deluxe", happy=45, toy=False,
                         desc="Treat: +huge happiness."),
    "pet_food": dict(cat="toys", kind="consumable", name="Pet Food Can", price=5, rank=0, icon="can", happy=0, toy=False, petfood=True,
                     desc="Feed your adopted pets at home."),
}
STORE_TABS = [("tools", "Vet Tools"), ("clinic", "Clinic"), ("style", "Style"), ("toys", "Toys")]

# Decor footprint in tiles (w, h) and whether it blocks walking.
DECOR = {
    "plant": dict(size=(1, 1), solid=True),
    "rug": dict(size=(2, 2), solid=False),
    "lamp": dict(size=(1, 1), solid=True),
    "bookshelf": dict(size=(2, 1), solid=True),
    "beanbag": dict(size=(1, 1), solid=True),
    "cattree": dict(size=(1, 1), solid=True),
    "fishtank": dict(size=(2, 1), solid=True),
    "sofa": dict(size=(2, 1), solid=True),
    "poster": dict(size=(1, 1), solid=False),
    "starlamp": dict(size=(1, 1), solid=True),
}

# ---------------------------------------------------------------- RANKS
RANKS = ["Vet Student", "Intern", "Junior Vet", "Vet", "Senior Vet", "Head Vet", "Master Vet", "Legendary Vet"]
RANK_XP = [0, 200, 600, 1300, 2200, 3400, 4900, 6800]
LEGENDARY_STEP = 2500   # XP per extra legendary star after max rank
RANK_UNLOCK_TEXT = {
    1: "Steady Syringe, Silk Bandages & more in the store!",
    2: "Hedgehogs can now visit! New tools & decor.",
    3: "Foxes can now visit! Kennel #5 unlocked.",
    4: "Red Pandas can now visit! Star Lamp & Kennel #6.",
    5: "Baby Penguins can now visit! Starry Coat unlocked.",
    6: "Rumors of a glowing Moonfox...",
    7: "You are a LEGEND. Patients pay more forever!",
}

# ---------------------------------------------------------------- BADGES (8 main)
BADGES = {
    "first_patient": dict(name="Sprout Badge", desc="Treat your very first patient.", shape="leaf", c1=(120, 210, 110), c2=(60, 140, 70)),
    "hundred": dict(name="Century Badge", desc="Treat 100 patients.", shape="circle", c1=(250, 210, 90), c2=(200, 140, 40)),
    "perfect_day": dict(name="Sunrise Badge", desc="Perfect Day: no losses and a 5-star average.", shape="sun", c1=(255, 170, 90), c2=(230, 100, 60)),
    "flea_fighter": dict(name="Flea Fighter Badge", desc="Catch 100 fleas.", shape="drop", c1=(120, 200, 240), c2=(60, 120, 200)),
    "speed_vet": dict(name="Zoom Badge", desc="Discharge a patient within 50s of arrival.", shape="bolt", c1=(250, 240, 110), c2=(220, 170, 40)),
    "rare_healer": dict(name="Gem Badge", desc="Treat 10 rare animals.", shape="diamond", c1=(220, 140, 250), c2=(150, 80, 200)),
    "legendary": dict(name="Moon Badge", desc="Treat the legendary Moonfox.", shape="moon", c1=(200, 220, 255), c2=(120, 140, 220)),
    "full_house": dict(name="Full House Badge", desc="Have all 6 kennels in use at once.", shape="house", c1=(250, 140, 160), c2=(200, 80, 110)),
}

# Smaller achievements: popups only
ACHIEVEMENTS = {
    "bubbles": dict(name="Bubble Trouble", desc="Give 10 baths."),
    "bullseye": dict(name="Bullseye!", desc="Land a perfect shot."),
    "first_adopt": dict(name="New Family", desc="Adopt your first pet."),
    "shopaholic": dict(name="Shopaholic", desc="Buy 10 things."),
    "fashion": dict(name="Fashionista", desc="Own 3 outfits."),
    "old_friend": dict(name="Old Friend", desc="Treat a regular on their 3rd visit."),
    "rush_survivor": dict(name="Rush Survivor", desc="Finish a Rush Day."),
    "coins_1000": dict(name="Piggy Bank", desc="Earn 1000 coins total."),
    "decorator": dict(name="Interior Designer", desc="Place 8 decorations."),
    "rank_vet": dict(name="Doctor Zoe", desc="Reach the rank of Vet."),
    "five_star": dict(name="Gold Star", desc="Earn a 5-star rating."),
    "week": dict(name="One Week In", desc="Reach Day 7."),
}

# ---------------------------------------------------------------- NPC PEOPLE
PEOPLE = {
    "zoe": dict(skin=(255, 214, 186), hair=(250, 214, 110), hair2=(222, 176, 70)),
    "maple": dict(skin=(244, 200, 170), hair=(214, 214, 222), hair2=(170, 170, 184), style="bun",
                  shirt=(120, 170, 120), pants=(130, 100, 80), shoes=(90, 70, 60), glasses=True),
    "gus": dict(skin=(214, 160, 120), hair=(110, 80, 60), hair2=(80, 56, 40), style="cap", cap=(200, 90, 70),
                shirt=(230, 220, 200), pants=(90, 120, 170), shoes=(80, 60, 50), overalls=True),
    "bramble": dict(skin=(250, 206, 170), hair=(150, 90, 60), hair2=(110, 64, 40), style="short",
                    shirt=(240, 190, 90), pants=(120, 90, 70), shoes=(80, 60, 50), apron=(130, 180, 120), beard=True),
    "penny": dict(skin=(200, 140, 100), hair=(60, 40, 40), hair2=(40, 26, 26), style="bob",
                  shirt=(110, 140, 220), pants=(70, 80, 130), shoes=(60, 50, 60), cap=(110, 140, 220)),
    "otis": dict(skin=(236, 190, 150), hair=(220, 220, 220), hair2=(180, 180, 180), style="cap", cap=(90, 140, 90),
                 shirt=(220, 170, 80), pants=(110, 100, 80), shoes=(70, 60, 50), beard=True),
    "juniper": dict(skin=(160, 110, 80), hair=(40, 30, 30), hair2=(20, 14, 14), style="long",
                    shirt=(250, 150, 170), pants=(120, 90, 160), shoes=(240, 240, 240)),
    "rosa": dict(skin=(250, 210, 180), hair=(190, 70, 50), hair2=(150, 50, 36), style="bun",
                 shirt=(250, 250, 250), pants=(200, 120, 120), shoes=(120, 80, 70), apron=(250, 200, 200)),
    "theo": dict(skin=(226, 170, 130), hair=(240, 180, 80), hair2=(200, 140, 50), style="short",
                 shirt=(240, 110, 90), pants=(60, 70, 90), shoes=(250, 250, 250)),
}

OWNER_LOOKS = [
    dict(skin=(255, 214, 186), hair=(90, 60, 40), hair2=(60, 40, 26), style="short", shirt=(110, 170, 230), pants=(70, 80, 110), shoes=(60, 50, 60)),
    dict(skin=(200, 140, 100), hair=(40, 30, 30), hair2=(20, 14, 14), style="long", shirt=(240, 160, 90), pants=(90, 110, 160), shoes=(240, 240, 240)),
    dict(skin=(240, 196, 160), hair=(200, 80, 60), hair2=(150, 56, 40), style="bob", shirt=(150, 210, 150), pants=(110, 90, 70), shoes=(80, 60, 50)),
    dict(skin=(150, 100, 70), hair=(30, 24, 24), hair2=(10, 8, 8), style="short", shirt=(250, 220, 100), pants=(60, 60, 80), shoes=(250, 250, 250)),
    dict(skin=(255, 220, 196), hair=(230, 230, 230), hair2=(190, 190, 190), style="bun", shirt=(200, 150, 220), pants=(110, 100, 140), shoes=(90, 70, 70)),
    dict(skin=(226, 170, 130), hair=(250, 200, 120), hair2=(210, 160, 80), style="long", shirt=(120, 200, 200), pants=(200, 120, 150), shoes=(80, 60, 60)),
]

# Dialogue. Each NPC: list of (min_rank, text). Rotates daily.
NPC_LINES = {
    "maple": [(0, "Remember, Zoe: a calm vet makes a calm patient."),
              (0, "Nervous animals wiggle. Watch them closely during shots!"),
              (0, "Grumpy patients hiss sometimes. Wait it out instead of rushing."),
              (0, "Playful pets LOVE a toy in recovery. Their owners tip well!"),
              (2, "You're a natural. I hear hedgehogs are visiting now!"),
              (4, "Head Vet material, I'd say. I'm proud of you."),
              (6, "On moonlit nights, some say a glowing fox appears..."),
              (7, "A Legendary Vet! You've surpassed even me.")],
    "penny": [(0, "Mail's here! Nothing but seed catalogs today."),
              (0, "The pet shop restocks every single day, you know."),
              (1, "Everyone in town is talking about the new Intern!"),
              (3, "My cousin says your clinic is the best around."),
              (5, "Head Vet Zoe! I'll have to deliver your fan mail.")],
    "otis": [(0, "The fish aren't biting. Neither are the ducks, thankfully."),
             (0, "Tip: a full kennel is a busy kennel. Discharge quickly!"),
             (2, "Saw a hedgehog snuffling by the pond. Cute fella."),
             (4, "Is it true a red panda came to your clinic? In THIS town?")],
    "juniper": [(0, "I'm going to be a vet like you when I grow up!"),
                (0, "Did you know hamsters stuff food in their cheeks?"),
                (1, "Can I see your stethoscope? Pleeease?"),
                (3, "A FOX! You treated a real FOX?!")],
    "rosa": [(0, "Fresh bread! ...Not for the pets, sorry."),
             (0, "A comfy waiting room keeps patients patient!"),
             (2, "You look tired, dear. Treat yourself to a new outfit!"),
             (5, "My dog Pretzel still talks about you. Well, barks.")],
    "theo": [(0, "Hup! Hup! Can't stop, jogging!"),
             (0, "Speed is key! But accuracy pays better tips."),
             (2, "Twenty laps around the park! Want to join?"),
             (6, "Even I can't keep up with a Master Vet!")],
    "bramble": [(0, "Welcome to Bramble's Pet Supply! Take a look around.")],
}
RUSH_LINES = ["Big news, Zoe! It's a RUSH DAY!", "Half the town's pets need a vet today.",
              "Expect lots of patients - and bigger payouts!"]

TUTORIAL = {
    "intro": ["Good morning, Zoe! Welcome to Pawsley Town.",
              "I'm Dr. Maple. I ran the clinic for forty years before I retired.",
              "It's all yours now! Walk to the clinic and press E at the door to start your first shift."],
    "shift": ["This is your clinic lobby. Patients check in at the desk on the left.",
              "Each patient gets a TICKET on the rail at the top. Click a ticket to treat that patient.",
              "Watch the hearts! They drain while patients wait. If they run out... well, let's not let that happen.",
              "Every patient starts with an EXAM. After that, the ticket shows which stations they need."],
    "exam": ["Drag each tool - stethoscope, thermometer, magnifier - over the glowing spot.",
             "Each tool reveals a clue on the clipboard. Then pick the diagnosis that matches the clues!"],
    "bath": ["Bath time! Follow the steps at the top: scrub mud, click fleas, rinse, and dry.",
             "Matted fur? Trace the dotted line to trim, then brush out each knot."],
    "meds": ["Medicine station! Hold to fill and release in the green zone.",
             "For shots, click when the marker hits the sweet spot. Pills go inside a tasty treat!"],
    "care": ["Care station! Pick the right food for this animal, then pour to the line.",
             "For hurt paws, follow the arrows to wrap the bandage."],
    "kennel": ["Recovery! Click an empty kennel to place your patient.",
               "Give a toy or treat while they rest for extra happiness, then click DISCHARGE when ready."],
}
