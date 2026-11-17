/* Global config + ALL difficulty tuning lives here. Tweak freely. */

export const GAME_TITLE: any = "Zoe's Pet Clinic"
export const NATIVE_W = 320;
export const NATIVE_H = 180;
export const DEFAULT_WINDOW: any = [1280, 720]
export const FPS: any = 60
export const TILE: any = 16

// ---------------- Shift timing ----------------
export const SHIFT_SECONDS: any = 300            // real seconds for 9:00 AM -> 5:00 PM
export const SHIFT_START_MIN: any = 9 * 60
export const SHIFT_END_MIN: any = 17 * 60

// ---------------- Patient care tuning ----------------
export const ACTIVE_DRAIN_FACTOR: any = 0.35     // drain multiplier while patient is at a station
export const STATION_REFILL: any = 18            // health restored after finishing a station
export const RECOVERY_SECONDS: any = 10          // kennel recovery timer
export const CHECKIN_SECONDS: any = 2.0          // time at desk before ticket appears
export const BASE_KENNELS: any = 2
export const MAX_KENNELS: any = 6
export const BASE_MAX_PETS: any = 2
export const STRAY_CHANCE: any = 0.10            // chance a discharged animal has no home
export const STRAY_CHANCE_REGULAR: any = 0.22
export const REGULAR_CHANCE: any = 0.30          // chance a new happy patient becomes a regular
export const REGULAR_SPAWN_CHANCE: any = 0.25    // chance an arrival is a returning regular

// ---------------- Difficulty ramp ----------------
// Each tier applies from `from_day` on. arrival = (min, max) seconds between arrivals.
// personalities weights = (calm, nervous, grumpy, playful)
export const DIFFICULTY_TIERS: any = [
    {from_day:1,  max_concurrent:1, arrival:[16, 22], multi:0.00, max_ailments:1, drain:0.45, personalities:[6, 1, 0, 3]},
    {from_day:2,  max_concurrent:2, arrival:[15, 21], multi:0.00, max_ailments:1, drain:0.55, personalities:[5, 2, 1, 3]},
    {from_day:4,  max_concurrent:3, arrival:[12, 18], multi:0.30, max_ailments:2, drain:0.70, personalities:[4, 2, 2, 3]},
    {from_day:7,  max_concurrent:4, arrival:[10, 16], multi:0.45, max_ailments:2, drain:0.85, personalities:[3, 3, 2, 3]},
    {from_day:11, max_concurrent:5, arrival:[9, 14],  multi:0.55, max_ailments:3, drain:1.00, personalities:[2, 3, 3, 3]},
    {from_day:15, max_concurrent:6, arrival:[8, 12],  multi:0.65, max_ailments:3, drain:1.15, personalities:[2, 4, 4, 3]},
]

// Mini-game difficulty: multiplier = 1 + MINIGAME_RANK_STEP * rank_index (capped)
export const MINIGAME_RANK_STEP: any = 0.10
export const MINIGAME_DIFF_CAP: any = 1.8

// Rush days
export const RUSH_START_DAY: any = 4
export const RUSH_CHANCE: any = 0.22
export const RUSH_ARRIVAL_MULT: any = 0.65
export const RUSH_PAY_MULT: any = 1.5
export const RUSH_EXTRA_CONCURRENT: any = 1

// Rare / legendary
export const RARE_WEIGHT_MULT: any = 0.35        // rare animal spawn weight relative to commons
export const LEGENDARY_CHANCE: any = 0.03        // per arrival, once rank allows, max one per day

// Economy
export const RANK_PAY_STEP: any = 0.08           // +8% pay per rank
export const XP_PER_PATIENT: any = 10
export const XP_PER_STAR: any = 5
export const XP_RARE_BONUS: any = 15
export const XP_LEGENDARY_BONUS: any = 60

export function tier_for_day(day: number): any {
  let t = DIFFICULTY_TIERS[0];
  for (const tier of DIFFICULTY_TIERS) {
    if (day >= tier.from_day) t = tier;
  }
  return t;
}

// ---------------- Wildside Rescue (the hectic second clinic) ----------------
export const WILD: any = {
  drain_mult: 1.45,        // hearts drain this much faster
  arrival_mult: 0.55,      // time between arrivals is multiplied by this (smaller = more patients)
  extra_concurrent: 2,     // extra patients at once
  multi_bonus: 0.3,        // extra chance of multi-ailment patients
  feral_chance: 0.65,      // chance a patient is FERAL (growls + bites)
  pay_mult: 1.8,           // pay and tips multiplier
  xp_mult: 1.5,
  bite_penalty: 15,        // mini-game score lost per bite
  growl_time: 1.2,         // how long a growl lasts (seconds)
  bite_delay: 0.35,        // cursor on a growling animal this long = BITE
};

// Food & drink buffs (from Clery's and the cafe), applied to the next shift
export const BUFF_FED_DRAIN = 0.85;
export const BUFF_COFFEE_DIFF = 0.85;
export const BUFF_SWEET_TIPS = 1.25;
