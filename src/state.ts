/* Game state, progression helpers, and the save system (one slot + autosave).
 *
 * Phase 1: saves live in the browser's localStorage. (Phase 3 adds cloud
 * saves on top of this; localStorage stays as the offline backup.)
 */
import * as data from "./data";
import * as config from "./config";

export const SAVE_VERSION = 1;

const SAVE_KEY = "zpc_save";
const SETTINGS_KEY = "zpc_settings";
const BACKUP_PREFIX = "zpc_save_backup_";

export const DEFAULT_SETTINGS: any = { music: 0.5, sfx: 0.7, fullscreen: false, scale: 4, muted: false };

function lsGet(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string): boolean {
  try {
    window.localStorage.setItem(k, v);
    return true;
  } catch (e) {
    console.warn("localStorage write failed:", e);
    return false;
  }
}
function lsDel(k: string) {
  try {
    window.localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/** Night-out outfits everyone owns (they live in Zoe's wardrobe). */
export function free_outfits(): string[] {
  return Object.keys(data.OUTFITS).filter((k) => data.OUTFITS[k].night);
}

/** "MON".."SUN"; Day 1 is a Monday. */
export function weekday(day: number): string {
  return data.WEEKDAYS[(((day - 1) % 7) + 7) % 7];
}

export function is_thursday(day: number): boolean {
  return weekday(day) === "THU";
}

/** Scrubs aren't allowed at Clery's. */
export function dressed_for_night(st: any): boolean {
  return !data.OUTFITS[st.outfit]?.work;
}

/** 0 = evening just started, 1 = full night (takes 30 seconds after the shift). */
export function night_k(st: any): number {
  if (st.phase !== "evening") return 0;
  return Math.max(0, Math.min(1, (st.evening_t ?? 30) / 30));
}

export function new_state(): any {
  return {
    version: SAVE_VERSION, day: 1, phase: "morning", coins: 60, xp: 0, total_coins: 0,
    hair: "long", outfit: "classic", owned: [], outfits: ["classic", ...free_outfits()],
    consumables: { toy_ball: 2, treat_biscuit: 2, pet_food: 3 },
    decor_inv: { plant: 1, poster: 1 },
    layouts: { hq: [], clinic: [] },
    badges: [], achievements: [],
    stats: {
      treated: 0, lost: 0, fleas: 0, baths: 0, rare: 0, purchases: 0, perfect_shots: 0,
      rush_days: 0, legendary: 0, days_worked: 0,
      shots: 0, meals: 0, bites: 0, wild_days: 0, challenges_won: 0,
    },
    buffs: {}, // food/drink buffs for the next shift: { fed: true, coffee: true, sweet: true }
    regulars: [], pets: [], rush: false, seen_tutorial: [], next_regular_id: 1,
    last_rank: 0, settings: { ...DEFAULT_SETTINGS },
    walk_with: null, friend_pts: {}, met_m: 0, met_e: 0, pregame_done: 0, turkey_day: 0,
  };
}

function isObj(v: any) {
  return v && typeof v === "object" && !Array.isArray(v);
}

/** Fill missing keys from defaults (handles older/partial saves). */
function _merge(def: any, loaded: any): any {
  const out: any = { ...def };
  for (const k of Object.keys(loaded)) {
    const v = loaded[k];
    if (k in def && isObj(def[k]) && isObj(v)) out[k] = { ...def[k], ...v };
    else out[k] = v;
  }
  return out;
}

function toInt(v: any, d = 0) {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : d;
}

function _sanitize(st: any): any {
  st.day = Math.max(1, toInt(st.day, 1));
  st.coins = Math.max(0, toInt(st.coins, 0));
  st.xp = Math.max(0, toInt(st.xp, 0));
  if (st.hair !== "long" && st.hair !== "bob") st.hair = "long";
  if (!(st.outfit in data.OUTFITS)) st.outfit = "classic";
  if (st.phase !== "morning" && st.phase !== "evening") st.phase = "morning";
  st.owned = (st.owned || []).filter((i: string) => i in data.STORE_ITEMS);
  st.outfits = (st.outfits || ["classic"]).filter((o: string) => o in data.OUTFITS);
  if (!st.outfits.length) st.outfits = ["classic"];
  for (const o of free_outfits()) if (!st.outfits.includes(o)) st.outfits.push(o); // wardrobe basics
  const cons: any = {};
  for (const [k, v] of Object.entries(st.consumables || {})) if (k in data.STORE_ITEMS && toInt(v) > 0) cons[k] = toInt(v);
  st.consumables = cons;
  const inv: any = {};
  for (const [k, v] of Object.entries(st.decor_inv || {})) if (k in data.DECOR && toInt(v) > 0) inv[k] = toInt(v);
  st.decor_inv = inv;
  const lay = st.layouts || {};
  st.layouts = {};
  for (const room of ["hq", "clinic"]) {
    st.layouts[room] = (lay[room] || []).filter((d: any) => isObj(d) && d.name in data.DECOR);
  }
  st.pets = (st.pets || []).filter((p: any) => isObj(p) && p.kind in data.ANIMALS);
  st.regulars = (st.regulars || []).filter((r: any) => isObj(r) && r.kind in data.ANIMALS);
  const buffs: any = {};
  for (const k of Object.keys(isObj(st.buffs) ? st.buffs : {})) if (k in data.BUFFS && st.buffs[k]) buffs[k] = true;
  st.buffs = buffs;
  return st;
}

// ------------------------------------------------------------------ save versioning
/**
 * MIGRATIONS[n] upgrades a save from version n to n+1. When the save format
 * changes in a future update: bump SAVE_VERSION and add a function here.
 * Old saves are upgraded step by step, so nobody loses progress.
 */
export const MIGRATIONS: Record<number, (s: any) => any> = {
  // 1: (s) => { s.new_field = 0; return s; },
};

export function migrate(raw: any): any {
  let v = toInt(raw.version ?? raw.save_version ?? 1, 1);
  while (v < SAVE_VERSION) {
    const fn = MIGRATIONS[v];
    if (fn) raw = fn(raw);
    v += 1;
    raw.version = v;
  }
  return raw;
}

/** Turn raw JSON-ish save data into a clean, current-version state. Throws on garbage. */
export function upgrade_and_clean(raw: any): any {
  if (!isObj(raw)) throw new Error("bad format");
  const migrated = migrate(JSON.parse(JSON.stringify(raw)));
  const st = _sanitize(_merge(new_state(), migrated));
  st.version = SAVE_VERSION;
  return st;
}

// ------------------------------------------------------------------ local save
export function save_game(st: any): boolean {
  st.version = SAVE_VERSION;
  st.saved_at = Date.now();
  return lsSet(SAVE_KEY, JSON.stringify(st));
}

/** Keep a damaged save around (never wipe it). */
export function backup_raw(text: string) {
  lsSet(BACKUP_PREFIX + Date.now(), text);
}

/** Returns [state or null, message or null]. A damaged save is backed up, never deleted. */
export function load_game(): [any, string | null] {
  const text = lsGet(SAVE_KEY);
  if (text == null) return [null, null];
  try {
    return [upgrade_and_clean(JSON.parse(text)), null];
  } catch (e) {
    console.warn("Save could not be loaded:", e);
    backup_raw(text);
    return [null, "Your save couldn't be loaded, so a backup copy was kept safe. Please let the game's creator know!"];
  }
}

export function has_save(): boolean {
  return lsGet(SAVE_KEY) != null;
}

export function delete_save() {
  // New Game: keep the old one as a backup just in case
  const text = lsGet(SAVE_KEY);
  if (text != null) lsSet(BACKUP_PREFIX + "last_erased", text);
  lsDel(SAVE_KEY);
}

export function load_settings(): any {
  const s: any = { ...DEFAULT_SETTINGS };
  try {
    const raw = JSON.parse(lsGet(SETTINGS_KEY) || "{}");
    for (const k of Object.keys(s)) if (k in raw) s[k] = raw[k];
  } catch {
    /* ignore */
  }
  s.scale = Math.max(1, Math.min(8, toInt(s.scale, 4)));
  return s;
}

export function save_settings(s: any) {
  lsSet(SETTINGS_KEY, JSON.stringify(s));
}

// ------------------------------------------------------------------ progression
export function rank_index(xp: number): number {
  let idx = 0;
  data.RANK_XP.forEach((t: number, i: number) => {
    if (xp >= t) idx = i;
  });
  return idx;
}

export function legend_stars(xp: number): number {
  const last = data.RANK_XP[data.RANK_XP.length - 1];
  if (xp < last) return 0;
  return 1 + Math.floor((xp - last) / data.LEGENDARY_STEP);
}

/** Continuous level: rank index plus extra legendary stars. */
export function rank_level(xp: number): number {
  return rank_index(xp) + Math.max(0, legend_stars(xp) - 1);
}

export function rank_name(xp: number): string {
  const i = rank_index(xp);
  if (i === data.RANKS.length - 1) {
    const st = legend_stars(xp);
    return "Legendary Vet" + (st >= 2 ? ` ^${st}` : "");
  }
  return data.RANKS[i];
}

export function rank_bounds(xp: number): [number, number] {
  const i = rank_index(xp);
  if (i < data.RANK_XP.length - 1) return [data.RANK_XP[i], data.RANK_XP[i + 1]];
  const base = data.RANK_XP[data.RANK_XP.length - 1] + (legend_stars(xp) - 1) * data.LEGENDARY_STEP;
  return [base, base + data.LEGENDARY_STEP];
}

export function has(st: any, item_id: string): boolean {
  return st.owned.includes(item_id);
}

export function kennel_count(st: any): number {
  return config.BASE_KENNELS + ["kennel_3", "kennel_4", "kennel_5", "kennel_6"].filter((k) => has(st, k)).length;
}

export function max_pets(st: any): number {
  return config.BASE_MAX_PETS + 2 * ["pet_bed_1", "pet_bed_2"].filter((k) => has(st, k)).length;
}

export function item_unlocked(st: any, item_id: string): boolean {
  const it = data.STORE_ITEMS[item_id];
  if (rank_index(st.xp) < (it.rank || 0)) return false;
  const req = it.requires;
  return !req || has(st, req);
}

export function unlocked_animals(st: any): string[] {
  const r = rank_index(st.xp);
  const out: string[] = [];
  for (const [k, a] of Object.entries<any>(data.ANIMALS)) {
    if (a.legendary) continue;
    if (st.day >= a.unlock_day && r >= a.unlock_rank) out.push(k);
  }
  return out;
}

/** kind: 'badges' or 'achievements'. Returns true if newly awarded. */
export function award(st: any, kind: string, key: string): boolean {
  if (st[kind].includes(key)) return false;
  st[kind].push(key);
  return true;
}

export function minigame_difficulty(st: any): number {
  const d = Math.min(config.MINIGAME_DIFF_CAP, 1.0 + config.MINIGAME_RANK_STEP * rank_level(st.xp));
  return st.buffs && st.buffs.coffee ? d * config.BUFF_COFFEE_DIFF : d;
}

export function pay_mult(st: any): number {
  let m = 1.0 + config.RANK_PAY_STEP * rank_level(st.xp);
  if (has(st, "exam_table_2")) m *= 1.1;
  if (st.rush) m *= config.RUSH_PAY_MULT;
  return m;
}

/** Returns list of [kind, key] newly unlocked by persistent stats. */
export function check_general_achievements(st: any): [string, string][] {
  const out: [string, string][] = [];
  const s = st.stats;
  let placed = 0;
  for (const v of Object.values<any>(st.layouts)) placed += v.length;
  const checks: [string, string, boolean][] = [
    ["badges", "first_patient", s.treated >= 1],
    ["badges", "hundred", s.treated >= 100],
    ["badges", "flea_fighter", s.fleas >= 100],
    ["badges", "rare_healer", s.rare >= 10],
    ["badges", "legendary", s.legendary >= 1],
    ["achievements", "bubbles", s.baths >= 10],
    ["achievements", "bullseye", s.perfect_shots >= 1],
    ["achievements", "first_adopt", st.pets.length >= 1],
    ["achievements", "shopaholic", s.purchases >= 10],
    ["achievements", "fashion", st.outfits.filter((o: string) => !data.OUTFITS[o]?.night).length >= 3],
    ["achievements", "coins_1000", st.total_coins >= 1000],
    ["achievements", "decorator", placed >= 8],
    ["achievements", "rank_vet", rank_index(st.xp) >= 3],
    ["achievements", "week", st.day >= 7],
    ["achievements", "party_animal", (s.challenges_won || 0) >= 3],
    ["achievements", "foodie", (s.meals || 0) >= 10],
    ["achievements", "wild_vet", (s.wild_days || 0) >= 1],
    ["achievements", "tough_hands", (s.bites || 0) >= 10],
  ];
  for (const [kind, key, cond] of checks) {
    if (cond && award(st, kind, key)) out.push([kind, key]);
  }
  return out;
}
