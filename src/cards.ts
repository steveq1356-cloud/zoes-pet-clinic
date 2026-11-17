/* Game night cards: "PAW PILE", a quick Crazy-Eights-style shedding game.
 * Zoe vs 1-3 friends around a felt table. Match the SUIT or the NUMBER;
 * 8 = wild (pick a suit), 2 = next player draws 2, S = skip the next player.
 * First to empty their hand wins. All art is drawn in code.
 */
import * as pg from "./pg";
import { Surface } from "./pg";
import * as data from "./data";
import * as font from "./font";
import * as sprites from "./sprites";
import * as ui from "./ui";
import * as gstate from "./state";
import { Scene } from "./engine";

type Col = pg.Color;
type Result = "win" | "lose" | "none";
type Done = ((result: Result, line: string) => void) | null;

type Card = { id: number; suit: number; rank: number; hidden?: boolean };
type Seat = "bottom" | "left" | "top" | "right";
type Player = {
  name: string; zoe: boolean; seat: Seat; hand: Card[];
  bubble: string; bubble_t: number; skill: number; spicy: number;
};
type RectN = [number, number, number, number];
type Flyer = {
  card: Card | null; face: boolean; flip: boolean;
  from: RectN; to: () => RectN; t: number; dur: number; delay: number;
  cb: (() => void) | null;
};

// ====================================================================== tuning
const PRIZE = 15;
const HAND_N = 5;
const MAX_TURNS = 90; // safety net: fewest cards wins after this many turns
const WILD = 8, DRAW2 = 2, SKIP = 10;
const CW = 22, CH = 30; // card size
const SW = 9, SH = 13; // friend's face-down mini card
const DECK_X = 122, DECK_Y = 60, DISC_X = 176, DISC_Y = 60;
const HAND_Y = 146;
const TOKEN_X = 212, TOKEN_Y = 75;

// ====================================================================== suits (pixel bitmaps)
// '#' = suit colour, 'g' = leaf green, 'w' = white
const BM_PAW = ["..#.#..", "#.#.#.#", "#.....#", "..###..", ".#####.", ".#####.", "..###.."];
const BM_BONE = ["##...##", "##...##", ".#####.", "##...##", "##...##"];
const BM_FISH = [".###..#", "#w####.", "######.", ".###..#"];
const BM_CARROT = ["g.g.g", ".ggg.", "#####", ".###.", ".###.", "..#..", "..#.."];
const BM_SKIP = ["..###..", ".#...#.", "#...#.#", "#..#..#", "#.#...#", ".#...#.", "..###.."];

const SUITS: { name: string; col: Col; bm: string[] }[] = [
  { name: "PAWS", col: [214, 78, 146], bm: BM_PAW },
  { name: "BONES", col: [150, 98, 52], bm: BM_BONE },
  { name: "FISH", col: [54, 116, 210], bm: BM_FISH },
  { name: "CARROTS", col: [234, 116, 26], bm: BM_CARROT },
];
const LEAF: Col = [70, 158, 64];

// ====================================================================== friends
type Pal = { skill: number; spicy: number; skip: string[]; plus2: string[]; wild: string[]; last: string[]; hit: string[] };
const DEFAULT_PAL: Pal = {
  skill: 0.5, spicy: 0.4,
  skip: ["Skip!", "Sit this one out!"], plus2: ["Draw two!", "Plus two for you!"],
  wild: ["Wild card!", "Switching it up!"], last: ["LAST CARD!"], hit: ["Oh no!", "Aw, cards!"],
};
const PALS: Record<string, Pal> = {
  stephen: {
    skill: 0.65, spicy: 0.6,
    skip: ["SKIP! Sit tight.", "Skipped. Nothing personal."], plus2: ["Plus two! Enjoy!", "Two more. Science."],
    wild: ["Wild! I call the shots.", "Crazy eight, baby."], last: ["LAST CARD! Fear me."], hit: ["This deck is rigged.", "Hmph. Noted."],
  },
  danny: {
    skill: 0.8, spicy: 0.3,
    skip: ["Sorry, gotta skip ya.", "Skip. Patience."], plus2: ["Two for you. Easy.", "Draw two, friend."],
    wild: ["Wild. Changing lanes.", "Eight. New suit."], last: ["LAST CARD. Steady..."], hit: ["Fair enough.", "Okay, okay."],
  },
  andrew: {
    skill: 0.35, spicy: 0.75,
    skip: ["Skip! Did I do it right?", "SKIP! Whoa!"], plus2: ["Plus two! Is that mean?", "Two! Sorry! Sort of!"],
    wild: ["WILD! I love eights!", "Eight! Eight! Eight!"], last: ["LAST CARD!! Oh wow!"], hit: ["Aw, man!", "Not the draw two!"],
  },
  jayden: {
    skill: 0.55, spicy: 0.5,
    skip: ["Skip, Doc!", "Take a breather, Doc."], plus2: ["Two for you, Doc!", "Doctor's orders: draw two!"],
    wild: ["Wild card, baby!", "Eight! Suit change!"], last: ["LAST CARD, Doc!"], hit: ["Oof. Okay.", "Dang it!"],
  },
  shteynie: {
    skill: 0.85, spicy: 0.45,
    skip: ["Skipped. Obviously.", "Skip. As planned."], plus2: ["Draw two. Calculated.", "Plus two. Predictable."],
    wild: ["Wild. All part of it.", "I choose... wisely."], last: ["LAST CARD. Naturally."], hit: ["A minor setback.", "Hmph."],
  },
  renee: {
    skill: 0.5, spicy: 0.5,
    skip: ["Skip! Sorry not sorry!", "Skippy skip!"], plus2: ["Plus two! Hehe!", "Two for you! Sorry!"],
    wild: ["Ooh, wild! Pretty!", "Eight! My fave!"], last: ["LAST CARD! Eee!"], hit: ["Aww, okay!", "Hey, no fair!"],
  },
  tish: {
    skill: 0.6, spicy: 0.65,
    skip: ["Skip. Bye!", "You're skipped, babe."], plus2: ["Two for you, hon.", "Plus two. Keep up."],
    wild: ["Wild. Try to keep up.", "Eight. Obviously."], last: ["LAST CARD. Looking good."], hit: ["Rude!", "Wow. Okay."],
  },
  greg: {
    skill: 0.55, spicy: 0.4,
    skip: ["Skip! Sorry, pal!", "Skipping ya, buddy!"], plus2: ["Draw two, buddy!", "Plus two! Ha!"],
    wild: ["Crazy eight!", "Wild one!"], last: ["LAST CARD! Ha!"], hit: ["Ha, fair play!", "Ouch! Nice one."],
  },
};

const WIN_LINES: Record<string, string> = {
  stephen: "You emptied your hand THAT fast? I demand a recount.",
  danny: "Clean game, Zoe. You read that table like a pro.",
  andrew: "Wait, it's over? I still had so many cards!",
  jayden: "Doc's got card skills too? That's not fair, Doc.",
  shteynie: "I was clearly holding back. Clearly.",
  renee: "Yay, Zoe! That was so fun, even losing!",
  tish: "Fine, you win. My cards were ugly anyway.",
  greg: "Ha! Well played, Zoe. Next round's on me.",
};
const LOSE_LINES: Record<string, string> = {
  stephen: "Card king of game night! You may bow, Zoe.",
  danny: "Watch what folks discard. You'll get me next time.",
  andrew: "I WON? Somebody take a picture!",
  jayden: "Sorry, Doc! Visiting hours are over.",
  shteynie: "Eights are a resource, Zoe. Hoard them.",
  renee: "I won! Want me to shuffle for a rematch?",
  tish: "And that's how it's done. Stick around, you'll learn.",
  greg: "Ha! Good game! The cards just liked me tonight.",
};
const TIE_LINE = "Wow, nobody could finish! Let's call it a draw.";

// ====================================================================== helpers
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function cap(name: string): string {
  const n = String(name || "friend");
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function short(name: string, n = 8): string {
  const s = String(name || "friend").toUpperCase();
  return s.length > n ? s.slice(0, n) : s;
}

function pick<T>(arr: T[], fallback: T): T {
  return arr && arr.length ? arr[Math.floor(pg.random.random() * arr.length)] : fallback;
}

function lerp_col(a: Col, b: Col, k: number): Col {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k));
}

function pal_of(name: string): Pal {
  return PALS[name] || DEFAULT_PAL;
}

function announce_all(game: any) {
  try {
    for (const [kind, key] of gstate.check_general_achievements(game.state)) {
      if (kind === "badges") game.toast("BADGE GET!", data.BADGES[key].name, "badge", key);
      else game.toast("ACHIEVEMENT!", data.ACHIEVEMENTS[key].name);
    }
  } catch (_e) { /* achievements are optional here */ }
}

const GUEST_LOOKS: any[] = [
  { skin: [240, 200, 170], hair: [90, 60, 40], style: "short", shirt: [200, 110, 90], pants: [60, 70, 100], shoes: [40, 40, 40] },
  { skin: [200, 150, 110], hair: [30, 24, 24], style: "short", shirt: [110, 170, 200], pants: [70, 60, 60], shoes: [240, 240, 240] },
  { skin: [250, 214, 190], hair: [220, 180, 90], style: "bob", shirt: [160, 120, 200], pants: [60, 60, 80], shoes: [90, 60, 50] },
  { skin: [170, 120, 90], hair: [50, 36, 30], style: "long", shirt: [240, 170, 80], pants: [80, 80, 110], shoes: [60, 40, 40] },
];

function has_person(name: string): boolean {
  try {
    return !!(data.PEOPLE && name && data.PEOPLE[name]);
  } catch (_e) {
    return false;
  }
}

function friend_portrait(name: string): Surface | null {
  try {
    if (has_person(name)) return sprites.portrait(["npc", name], data.PEOPLE[name]);
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return sprites.portrait(["cards_guest", String(name)], GUEST_LOOKS[h % GUEST_LOOKS.length]);
  } catch (_e) {
    return null;
  }
}

function zoe_portrait(st: any): Surface | null {
  try {
    return sprites.zoe_portrait(st?.hair, st?.outfit);
  } catch (_e) {
    return null;
  }
}

// ====================================================================== art
function icon(bm: string[], col: Col, scale = 1): Surface {
  return sprites.cached("cards_icon|" + bm.join("/") + "|" + col.join(",") + "|" + scale, () => {
    const w = bm[0].length, h = bm.length;
    const s = new Surface([w * scale, h * scale], pg.SRCALPHA);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = bm[y][x];
        if (ch === ".") continue;
        const c = ch === "g" ? LEAF : ch === "w" ? [255, 255, 255] : col;
        pg.draw.rect(s, c, [x * scale, y * scale, scale, scale]);
      }
    }
    return s;
  });
}

function suit_icon(suit: number, scale = 1, col: Col | null = null): Surface {
  const sd = SUITS[suit] || SUITS[0];
  return icon(sd.bm, col || sd.col, scale);
}

/** blit an icon centred inside a box */
function blit_in(s: Surface, ic: Surface, x: number, y: number, w: number, h: number) {
  s.blit(ic, [x + Math.floor((w - ic.get_width()) / 2), y + Math.floor((h - ic.get_height()) / 2)]);
}

function card_face(c: Card): Surface {
  const wild = c.rank === WILD;
  const key = wild ? "cards_face|wild" : `cards_face|${c.suit}|${c.rank}`;
  return sprites.cached(key, () => {
    const s = new Surface([CW, CH], pg.SRCALPHA);
    const sd = SUITS[c.suit] || SUITS[0];
    pg.draw.rect(s, wild ? [196, 140, 40] : [74, 58, 88], [0, 0, CW, CH]);
    pg.draw.rect(s, wild ? [255, 246, 222] : [252, 248, 238], [1, 1, CW - 2, CH - 2]);
    pg.draw.line(s, [255, 255, 255], [2, 1], [CW - 3, 1]);
    pg.draw.line(s, wild ? [240, 220, 180] : [228, 220, 208], [2, CH - 2], [CW - 3, CH - 2]);
    for (const p of [[0, 0], [CW - 1, 0], [0, CH - 1], [CW - 1, CH - 1]]) s.set_at(p, [0, 0, 0, 0]);
    if (wild) {
      // rainbow band + all four suits
      const band: Col[] = [[250, 150, 170], [250, 210, 120], [150, 210, 150], [140, 180, 240]];
      band.forEach((bc, i) => pg.draw.line(s, bc, [8, 3 + i], [CW - 3, 3 + i]));
      font.draw(s, "8", [3, 2], [120, 60, 150]);
      for (let i = 0; i < 4; i++) blit_in(s, suit_icon(i), 3 + (i % 2) * 9, 10 + Math.floor(i / 2) * 9, 7, 7);
      font.draw(s, "8", [3, CH - 7], [120, 60, 150]);
      return s;
    }
    const label = c.rank === SKIP ? "S" : String(c.rank);
    const ink = sprites.darker(sd.col, 0.85);
    font.draw(s, label, [2, 2], ink);
    blit_in(s, suit_icon(c.suit), 1, 8, 7, 7);
    font.draw(s, label, [2, CH - 7], ink);
    if (c.rank === DRAW2) {
      font.draw(s, "+2", [14, 14], ink, 2, null, "center");
      blit_in(s, suit_icon(c.suit), 10, 3, 9, 7);
    } else if (c.rank === SKIP) {
      blit_in(s, icon(BM_SKIP, sd.col, 2), 7, 14, 14, 14);
    } else {
      blit_in(s, suit_icon(c.suit, 2), 7, 14, 14, 14);
    }
    return s;
  });
}

function draw_back(s: Surface, x: number, y: number, w: number, h: number) {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.max(3, Math.round(w));
  h = Math.max(4, Math.round(h));
  pg.draw.rect(s, [58, 36, 76], [x, y, w, h]);
  pg.draw.rect(s, [146, 86, 178], [x + 1, y + 1, w - 2, h - 2]);
  if (w >= 12) {
    pg.draw.rect(s, [206, 160, 226], [x + 2, y + 2, w - 4, h - 4], 1);
    if (w >= 16) blit_in(s, icon(BM_PAW, [250, 230, 250]), x, y, w, h);
  } else {
    pg.draw.line(s, [196, 140, 220], [x + 1, y + 1], [x + w - 2, y + 1]);
    s.set_at([x + Math.floor(w / 2), y + Math.floor(h / 2)], [250, 230, 250]);
  }
}

function felt_surface(): Surface {
  return sprites.cached("cards_felt", () => {
    const W = 320, H = 180;
    const s = new Surface([W, H]);
    const rng = new pg.Random(11);
    s.fill([78, 48, 30]);
    for (let i = 0; i < 160; i++) {
      const y = rng.randint(0, H - 1), x = rng.randint(0, W - 30), len = rng.randint(6, 30);
      pg.draw.line(s, rng.random() < 0.5 ? [66, 40, 24] : [94, 60, 38], [x, y], [x + len, y]);
    }
    const fx = 4, fy = 3, fw = W - 8, fh = H - 6, R = 10;
    const edge: Col = [24, 84, 54], mid: Col = [52, 146, 92];
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        // rounded corners
        const cx = x < R ? R - x : x >= fw - R ? x - (fw - R - 1) : 0;
        const cy = y < R ? R - y : y >= fh - R ? y - (fh - R - 1) : 0;
        if (cx * cx + cy * cy > R * R) continue;
        const dx = (x - fw / 2) / (fw / 2), dy = (y - fh * 0.45) / (fh / 2);
        const k = clamp(1 - (dx * dx * 0.8 + dy * dy) * 0.7, 0, 1);
        let c = lerp_col(edge, mid, k);
        const n = (x * 7 + y * 13 + ((x * y) % 5)) % 13;
        if (n === 0) c = sprites.darker(c, 0.92);
        else if (n === 6) c = sprites.lighter(c, 0.04);
        s.set_at([fx + x, fy + y], c);
      }
    }
    // stitched border
    for (let x = fx + R; x < fx + fw - R; x += 4) {
      s.set_at([x, fy + 2], [96, 176, 120]);
      s.set_at([x, fy + fh - 3], [30, 100, 64]);
    }
    for (let y = fy + R; y < fy + fh - R; y += 4) {
      s.set_at([fx + 2, y], [70, 150, 100]);
      s.set_at([fx + fw - 3, y], [70, 150, 100]);
    }
    // a soft ring where the piles sit
    pg.draw.ellipse(s, [64, 160, 104], [100, 50, 136, 52], 1);
    return s;
  });
}

// ====================================================================== the game
export class CardGame extends Scene {
  overlay = true;

  constructor(game: any, players: string[], on_done: Done = null) {
    super(game);
    this.on_done = on_done;
    this.phase = "intro"; // intro | deal | busy | zoe | suit | final
    this.t = 0;
    this.turn = 0;
    this.turns = 0;
    this.deck = [] as Card[];
    this.discard = [] as Card[];
    this.cur_suit = 0;
    this.drew = false;
    this.drawn = null as Card | null;
    this.sel = -1;
    this.kb = false;
    this.last_m = [-1, -1];
    this.timers = [] as { t: number; fn: () => void }[];
    this.flyers = [] as Flyer[];
    this.banner = "";
    this.banner_t = 0;
    this.banner_col = [255, 230, 140];
    this.stuck_t = 0;
    this.dry = 0;
    this.errors = 0;
    this.outcome = "none";
    this.winner = -1;
    this.reason = "";
    this.speaker = "";
    this.closed = false;
    this.started = false;
    this.particles = new ui.Particles();

    let names: string[] = [];
    try {
      for (const p of Array.isArray(players) ? players : []) {
        const n = String(p ?? "").trim().toLowerCase();
        if (n && n !== "zoe" && !names.includes(n)) names.push(n);
      }
    } catch (_e) { names = []; }
    names = names.slice(0, 3);
    if (!names.length) names = ["friend"];
    const seats: Seat[] = names.length === 1 ? ["top"] : names.length === 2 ? ["left", "right"] : ["left", "top", "right"];
    const mk = (name: string, zoe: boolean, seat: Seat): Player => {
      const pal = pal_of(name);
      return { name, zoe, seat, hand: [], bubble: "", bubble_t: 0, skill: pal.skill, spicy: pal.spicy };
    };
    this.players = [mk("zoe", true, "bottom"), ...names.map((n, i) => mk(n, false, seats[i]))] as Player[];
    this.portraits = (this.players as Player[]).map((p) => (p.zoe ? zoe_portrait(this.game.state) : friend_portrait(p.name)));

    this.start_btn = new ui.Button([94, 140, 64, 14], "Let's go!", () => this.begin(), true, null, [250, 220, 140], pg.K_RETURN);
    this.nah_btn = new ui.Button([162, 140, 64, 14], "Nah", () => this.close("none"), true, null, null, pg.K_ESCAPE);
    this.ok_btn = new ui.Button([128, 122, 64, 14], "Done", () => this.close(this.outcome), true, null, null, pg.K_RETURN);
    const keys = [pg.K_1, pg.K_2, pg.K_3, pg.K_4];
    this.suit_btns = SUITS.map((sd, i) =>
      new ui.Button([54 + i * 54, 114, 50, 16], sd.name, () => this.zoe_suit(i), true, suit_icon(i), lighter_of(sd.col), keys[i]));
  }

  // ------------------------------------------------------------ small utils
  get P(): Player[] {
    return this.players as Player[];
  }

  next(i: number): number {
    return (i + 1) % this.P.length;
  }

  disp(i: number): string {
    const p = this.P[i];
    return !p ? "?" : p.zoe ? "YOU" : short(p.name);
  }

  later(t: number, fn: () => void) {
    (this.timers as any[]).push({ t, fn });
  }

  top_card(): Card | null {
    const d = this.discard as Card[];
    return d.length ? d[d.length - 1] : null;
  }

  playable(c: Card): boolean {
    const top = this.top_card();
    if (!c) return false;
    if (!top || c.rank === WILD) return true;
    return c.suit === this.cur_suit || c.rank === top.rank;
  }

  zoe_can(c: Card): boolean {
    return this.phase === "zoe" && this.turn === 0 && this.playable(c) && (!this.drew || c === this.drawn);
  }

  set_banner(text: string, col: Col = [255, 230, 140], t = 1.3) {
    this.banner = text;
    this.banner_col = col;
    this.banner_t = t;
  }

  say(i: number, text: string, t = 1.8) {
    const p = this.P[i];
    if (!p || !text) return;
    p.bubble = text;
    p.bubble_t = t;
  }

  oops(err: any) {
    this.errors += 1;
    try { console.warn("CardGame:", err); } catch (_e) { /* ignore */ }
    if (this.errors > 8 && !this.closed) this.close("none");
  }

  // ------------------------------------------------------------ setup
  begin() {
    this.started = true;
    this.phase = "deal";
    this.game.audio.play("whoosh", 0.5);
    const deck: Card[] = [];
    let id = 0;
    for (let s = 0; s < 4; s++) for (const r of [1, 2, 3, 4, 5, 6, 7, 8, 9, SKIP]) deck.push({ id: id++, suit: s, rank: r });
    pg.random.shuffle(deck);
    this.deck = deck;
    this.discard = [];
    const n = this.P.length;
    let k = 0;
    for (let r = 0; r < HAND_N; r++) {
      for (let j = 1; j <= n; j++) {
        const pi = j % n; // dealer is Zoe: deal to her left first
        const delay = k * 0.075;
        k += 1;
        this.later(delay, () => this.draw_one(pi, null, 0.22));
      }
    }
    this.later(k * 0.075 + 0.45, () => this.flip_starter());
  }

  flip_starter() {
    const deck = this.deck as Card[];
    let idx = -1;
    for (let i = deck.length - 1; i >= 0; i--) {
      const r = deck[i].rank;
      if (r !== WILD && r !== DRAW2 && r !== SKIP) {
        idx = i;
        break;
      }
    }
    if (idx < 0) idx = deck.length - 1;
    if (idx < 0) {
      this.start_turn(0);
      return;
    }
    const c = deck.splice(idx, 1)[0];
    this.phase = "deal";
    this.fly(c, [DECK_X, DECK_Y, CW, CH], () => [DISC_X, DISC_Y, CW, CH], true, true, 0.3, 0, () => {
      (this.discard as Card[]).push(c);
      this.cur_suit = c.suit;
      this.game.audio.play("tick");
      this.later(0.35, () => this.start_turn(0));
    });
  }

  // ------------------------------------------------------------ deck & flying cards
  fly(card: Card | null, from: RectN, to: () => RectN, face: boolean, flip: boolean, dur: number, delay: number, cb: (() => void) | null) {
    (this.flyers as Flyer[]).push({ card, face, flip, from, to, t: 0, dur, delay, cb });
  }

  take_from_deck(): Card | null {
    let deck = this.deck as Card[];
    if (!deck.length) {
      const disc = this.discard as Card[];
      if (disc.length > 1) {
        const top = disc.pop()!;
        deck = disc.slice();
        pg.random.shuffle(deck);
        this.deck = deck;
        this.discard = [top];
        this.set_banner("RESHUFFLE!", [220, 240, 255], 1.0);
        this.game.audio.play("whoosh", 0.4);
      }
    }
    return (this.deck as Card[]).pop() || null;
  }

  insert(p: Player, c: Card) {
    if (!p.zoe) {
      p.hand.push(c);
      return;
    }
    const key = (x: Card) => (x.rank === WILD ? 1000 : x.suit * 20 + x.rank);
    let i = 0;
    while (i < p.hand.length && key(p.hand[i]) <= key(c)) i++;
    p.hand.splice(i, 0, c);
  }

  /** Draw one card for player pi, animate it, then cb(card or null). */
  draw_one(pi: number, cb: ((c: Card | null) => void) | null, dur = 0.24) {
    const p = this.P[pi];
    const c = p ? this.take_from_deck() : null;
    if (!c || !p) {
      this.dry += 1;
      if (cb) cb(null);
      return;
    }
    this.dry = 0;
    c.hidden = true;
    this.insert(p, c);
    this.game.audio.play("tick", 0.5);
    this.fly(c, [DECK_X, DECK_Y, CW, CH], () => this.slot_rect(pi, c), p.zoe, true, dur, 0, () => {
      c.hidden = false;
      if (cb) cb(c);
    });
  }

  give(pi: number, n: number, cb: () => void) {
    if (n <= 0) {
      cb();
      return;
    }
    this.draw_one(pi, (c) => {
      if (!c) cb();
      else this.later(0.05, () => this.give(pi, n - 1, cb));
    }, 0.2);
  }

  // ------------------------------------------------------------ layout
  hand_rect(i: number, n: number): RectN {
    const spacing = n > 1 ? Math.min(24, (270 - CW) / (n - 1)) : 0;
    const total = CW + spacing * (n - 1);
    const x0 = Math.round(176 - total / 2);
    return [x0 + Math.round(i * spacing), HAND_Y, CW, CH];
  }

  fan_rect(pi: number, i: number, n: number): RectN {
    const p = this.P[pi];
    const m = clamp(n, 1, 10);
    const k = clamp(i, 0, m - 1);
    if (!p || p.seat === "left") return [6 + k * 3, 90, SW, SH];
    if (p.seat === "right") return [314 - SW - (m - 1) * 3 + k * 3, 90, SW, SH];
    return [180 + k * 3, 12, SW, SH];
  }

  slot_rect(pi: number, c: Card): RectN {
    const p = this.P[pi];
    if (!p) return [DISC_X, DISC_Y, CW, CH];
    const idx = Math.max(0, p.hand.indexOf(c));
    return p.zoe ? this.hand_rect(idx, p.hand.length) : this.fan_rect(pi, idx, p.hand.length);
  }

  portrait_pos(seat: Seat): [number, number] {
    if (seat === "left") return [4, 44];
    if (seat === "right") return [284, 44];
    if (seat === "top") return [144, 4];
    return [2, 140];
  }

  lift(i: number, hover: number): number {
    const c = this.P[0].hand[i];
    if (!c || !this.zoe_can(c)) return 0;
    return i === hover ? 7 : 4;
  }

  /** index of Zoe's card under the mouse (rightmost on top), or -1 */
  hand_hit(m: number[]): number {
    const h = this.P[0].hand;
    for (let i = h.length - 1; i >= 0; i--) {
      const [x, y, w, hh] = this.hand_rect(i, h.length);
      if (m[0] >= x && m[0] < x + w && m[1] >= y - 8 && m[1] < y + hh) return i;
    }
    return -1;
  }

  deck_hit(m: number[]): boolean {
    return m[0] >= DECK_X - 4 && m[0] < DECK_X + CW + 2 && m[1] >= DECK_Y - 4 && m[1] < DECK_Y + CH + 2;
  }

  // ------------------------------------------------------------ turns
  start_turn(i: number) {
    if (this.phase === "final" || this.closed) return;
    this.turns += 1;
    this.stuck_t = 0;
    if (this.turns > MAX_TURNS) {
      this.finish_by_count("TIME!");
      return;
    }
    if (this.dry >= this.P.length) {
      this.finish_by_count("STUCK!");
      return;
    }
    this.turn = clamp(i, 0, this.P.length - 1);
    this.drew = false;
    this.drawn = null;
    const p = this.P[this.turn];
    if (p.zoe) {
      this.phase = "zoe";
      this.sel = -1;
    } else {
      this.phase = "busy";
      this.later(pg.random.uniform(0.55, 0.95), () => this.ai_turn(this.turn));
    }
  }

  play(pi: number, card: Card) {
    const p = this.P[pi];
    const idx = p ? p.hand.indexOf(card) : -1;
    if (idx < 0) {
      this.later(0.2, () => this.start_turn(this.next(pi)));
      return;
    }
    const from = p.zoe ? this.hand_rect(idx, p.hand.length) : this.fan_rect(pi, idx, p.hand.length);
    if (p.zoe) from[1] -= 5;
    p.hand.splice(idx, 1);
    this.dry = 0;
    this.phase = "busy";
    this.sel = -1;
    this.game.audio.play("whoosh", 0.45);
    this.fly(card, from, () => [DISC_X, DISC_Y, CW, CH], true, !p.zoe, 0.28, 0, () => this.land(pi, card));
  }

  land(pi: number, card: Card) {
    const p = this.P[pi];
    (this.discard as Card[]).push(card);
    this.cur_suit = card.suit;
    this.game.audio.play(card.rank === WILD || card.rank === DRAW2 || card.rank === SKIP ? "pop" : "tick", 0.8);
    this.particles.burst("puff", DISC_X + CW / 2, DISC_Y + CH / 2, 3, 10);
    if (p.hand.length === 0) {
      this.phase = "busy";
      this.later(0.45, () => this.finish(pi === 0 ? "win" : "lose", pi, pi === 0 ? "YOU EMPTIED YOUR HAND!" : `${short(p.name)} WENT OUT FIRST!`));
      return;
    }
    const last = p.hand.length === 1;
    if (last) {
      this.say(pi, p.zoe ? "LAST CARD!" : pick(pal_of(p.name).last, "LAST CARD!"), 2.0);
      this.game.audio.play("star", 0.6);
      const [px, py] = this.portrait_pos(p.seat);
      this.particles.burst("sparkle", px + 16, py + 18, 8, 22);
    }
    if (card.rank === WILD) {
      if (p.zoe) {
        this.phase = "suit";
        return;
      }
      this.set_suit(pi, this.ai_suit(p), last);
      return;
    }
    this.after_effects(pi, card, last);
  }

  zoe_suit(s: number) {
    if (this.phase !== "suit") return;
    this.set_suit(0, s, this.P[0].hand.length === 1);
  }

  set_suit(pi: number, s: number, quiet: boolean) {
    const p = this.P[pi];
    this.cur_suit = clamp(s, 0, 3);
    const sd = SUITS[this.cur_suit];
    this.set_banner(`WILD! NOW ${sd.name}`, lighter_of(sd.col), 1.3);
    if (!p.zoe && !quiet && pg.random.random() < 0.85) this.say(pi, pick(pal_of(p.name).wild, "Wild!"));
    this.particles.burst("sparkle", TOKEN_X, TOKEN_Y, 10, 26);
    this.phase = "busy";
    const top = this.top_card();
    this.later(0.5, () => this.after_effects(pi, top || { id: -1, suit: s, rank: WILD }, true));
  }

  after_effects(pi: number, card: Card, quiet: boolean) {
    const p = this.P[pi];
    const nx = this.next(pi);
    const victim = this.P[nx];
    const pal = pal_of(p.name);
    if (card.rank === DRAW2) {
      this.set_banner(victim.zoe ? "+2! YOU DRAW 2" : `+2 FOR ${this.disp(nx)}!`, [255, 200, 150], 1.3);
      if (!p.zoe && !quiet && pg.random.random() < 0.85) this.say(pi, pick(pal.plus2, "Draw two!"));
      if (victim.zoe) this.game.shake(1, 0.15);
      this.give(nx, 2, () => {
        if (!victim.zoe && pg.random.random() < 0.7) this.say(nx, pick(pal_of(victim.name).hit, "Oh no!"));
        this.later(0.35, () => this.start_turn(this.next(nx)));
      });
    } else if (card.rank === SKIP) {
      this.set_banner(victim.zoe ? "YOU'RE SKIPPED!" : `${this.disp(nx)} IS SKIPPED!`, [200, 220, 255], 1.2);
      if (!p.zoe && !quiet && pg.random.random() < 0.85) this.say(pi, pick(pal.skip, "Skip!"));
      const [vx, vy] = this.portrait_pos(victim.seat);
      this.particles.text("SKIP!", vx + 16, vy + 14, [255, 120, 120]);
      this.game.audio.play("blip", 0.6);
      this.later(0.75, () => this.start_turn(this.next(nx)));
    } else {
      this.later(0.25, () => this.start_turn(nx));
    }
  }

  // ------------------------------------------------------------ AI
  ai_turn(i: number) {
    if (this.phase !== "busy" || this.turn !== i) return;
    const c = this.ai_pick(i);
    if (c) {
      this.play(i, c);
      return;
    }
    this.draw_one(i, (d) => {
      if (d && this.playable(d) && pg.random.random() < 0.92) this.later(0.35, () => this.play(i, d));
      else this.later(0.3, () => this.start_turn(this.next(i)));
    });
  }

  ai_pick(i: number): Card | null {
    const p = this.P[i];
    const ok = p.hand.filter((c) => this.playable(c));
    if (!ok.length) return null;
    const plain = ok.filter((c) => c.rank !== WILD);
    if (!plain.length) return ok[0];
    if (pg.random.random() > p.skill + 0.25) return pick(plain, plain[0]);
    const nx = this.P[this.next(i)];
    let best = plain[0], bs = -1e9;
    for (const c of plain) {
      let sc = p.hand.filter((h) => h.suit === c.suit && h.rank !== WILD).length * 1.5;
      if (c.rank === DRAW2 || c.rank === SKIP) {
        sc += p.spicy * 2.5;
        if (nx.hand.length <= 2) sc += 6 * p.skill;
      }
      sc += pg.random.random() * 1.2;
      if (sc > bs) {
        bs = sc;
        best = c;
      }
    }
    return best;
  }

  ai_suit(p: Player): number {
    const n = [0, 0, 0, 0];
    for (const c of p.hand) if (c.rank !== WILD) n[clamp(c.suit, 0, 3)] += 1 + pg.random.random() * 0.5;
    let b = pg.random.randint(0, 3);
    for (let s = 0; s < 4; s++) if (n[s] > n[b]) b = s;
    return b;
  }

  // ------------------------------------------------------------ Zoe
  zoe_play(i: number) {
    const c = this.P[0].hand[i];
    if (!c || !this.zoe_can(c)) {
      if (c && this.phase === "zoe") {
        this.game.audio.play("error", 0.5);
        this.particles.text(this.drew ? "PLAY THE NEW CARD OR PASS" : "NO MATCH!", 176, 128, [255, 170, 170], 0.9);
      }
      return;
    }
    this.play(0, c);
  }

  zoe_deck() {
    if (this.phase !== "zoe" || this.turn !== 0) return;
    if (this.drew) {
      this.game.audio.play("blip", 0.6);
      this.phase = "busy";
      this.later(0.2, () => this.start_turn(this.next(0)));
      return;
    }
    this.phase = "busy";
    this.draw_one(0, (d) => {
      if (d && this.playable(d)) {
        this.drew = true;
        this.drawn = d;
        this.phase = "zoe";
        this.sel = this.P[0].hand.indexOf(d);
      } else {
        if (!d) this.set_banner("NO CARDS LEFT TO DRAW", [230, 230, 240], 1.0);
        this.later(0.4, () => this.start_turn(this.next(0)));
      }
    });
  }

  // ------------------------------------------------------------ ending
  finish_by_count(why = "TIME!") {
    const counts = this.P.map((p) => p.hand.length);
    const lo = Math.min(...counts);
    const leaders = counts.map((c, i) => (c === lo ? i : -1)).filter((i) => i >= 0);
    if (leaders.length === 1 && leaders[0] === 0) this.finish("win", 0, `${why} YOU HAVE THE FEWEST CARDS`);
    else if (!leaders.includes(0)) this.finish("lose", leaders[0], `${why} ${short(this.P[leaders[0]].name)} HAS THE FEWEST`);
    else this.finish("tie", -1, `${why} IT'S A DEAD HEAT`);
  }

  finish(result: string, winner: number, reason: string) {
    if (this.phase === "final") return;
    this.timers = [];
    this.phase = "final";
    this.reason = reason;
    this.winner = winner;
    this.outcome = result;
    const friends = this.P.slice(1);
    this.speaker = result === "lose" && winner > 0 ? this.P[winner].name : friends[0]?.name || "";
    const st = this.game.state;
    try {
      if (st) {
        st.stats = st.stats || {};
        st.stats.cards_played = (st.stats.cards_played || 0) + 1;
        if (result === "win") {
          st.coins = (st.coins || 0) + PRIZE;
          st.total_coins = (st.total_coins || 0) + PRIZE;
          st.stats.cards_won = (st.stats.cards_won || 0) + 1;
        }
      }
    } catch (_e) { /* state is best-effort */ }
    if (result === "win") {
      this.game.audio.play("coin");
      for (let i = 0; i < 12; i++) this.particles.add("coin", 160, 100);
      this.particles.burst("sparkle", 160, 70, 16, 60);
    } else if (result === "lose") {
      this.game.audio.play("sad");
      const w = this.P[winner];
      if (w) this.say(winner, "I'M OUT!", 3);
    } else {
      this.game.audio.play("blip");
    }
    announce_all(this.game);
    try {
      this.game.save();
    } catch (_e) { /* saving is best-effort */ }
  }

  close(result: string) {
    if (this.closed) return;
    this.closed = true;
    try {
      this.game.pop();
    } catch (_e) { /* ignore */ }
    let res: Result = "none", line = "";
    if (result === "win") {
      res = "win";
      line = WIN_LINES[this.speaker] || "Well played, Zoe! You're a natural.";
    } else if (result === "lose") {
      res = "lose";
      line = LOSE_LINES[this.speaker] || "Got you this time! Good game.";
    } else if (result === "tie") {
      line = TIE_LINE;
    }
    try {
      if (this.on_done) this.on_done(res, line);
    } catch (e) {
      try { console.warn("CardGame on_done:", e); } catch (_e) { /* ignore */ }
    }
  }

  // ------------------------------------------------------------ input
  event(e: any) {
    try {
      this._event(e);
    } catch (err) {
      this.oops(err);
    }
  }

  _event(e: any) {
    if (this.closed) return;
    if (this.phase === "intro") {
      if (this.start_btn.handle(e, this.game)) return;
      this.nah_btn.handle(e, this.game);
      return;
    }
    if (this.phase === "final") {
      if (this.ok_btn.handle(e, this.game)) return;
      if (e.type === pg.KEYDOWN && e.key === pg.K_ESCAPE) this.close(this.outcome);
      return;
    }
    if (e.type === pg.KEYDOWN && e.key === pg.K_ESCAPE) {
      this.close("none");
      return;
    }
    if (this.phase === "suit") {
      for (const b of this.suit_btns) if (b.handle(e, this.game)) return;
      return;
    }
    if (this.phase !== "zoe") return;
    const hand = this.P[0].hand;
    if (e.type === pg.MOUSEBUTTONDOWN && e.button === 1) {
      const m = this.game.mpos;
      const i = this.hand_hit(m);
      if (i >= 0) {
        this.kb = false;
        this.zoe_play(i);
      } else if (this.deck_hit(m)) this.zoe_deck();
      return;
    }
    if (e.type === pg.KEYDOWN) {
      const n = hand.length;
      if ((e.key === pg.K_LEFT || e.key === pg.K_a) && n) {
        this.kb = true;
        this.sel = this.sel < 0 ? n - 1 : (this.sel - 1 + n) % n;
        this.game.audio.play("tick", 0.4);
      } else if ((e.key === pg.K_RIGHT || e.key === pg.K_d) && n) {
        this.kb = true;
        this.sel = this.sel < 0 ? 0 : (this.sel + 1) % n;
        this.game.audio.play("tick", 0.4);
      } else if ((e.key === pg.K_RETURN || e.key === pg.K_SPACE) && this.sel >= 0) {
        this.zoe_play(this.sel);
      } else if (e.key === pg.K_DOWN || e.key === pg.K_s || e.key === pg.K_TAB) {
        this.zoe_deck();
      }
    }
  }

  // ------------------------------------------------------------ update
  update(dt: number) {
    try {
      this._update(dt);
    } catch (err) {
      this.oops(err);
    }
  }

  _update(dt: number) {
    this.t += dt;
    this.particles.update(dt);
    if (this.banner_t > 0) this.banner_t -= dt;
    for (const p of this.P) if (p.bubble_t > 0) p.bubble_t -= dt;
    const m = this.game.mpos;
    if (m[0] !== this.last_m[0] || m[1] !== this.last_m[1]) {
      this.last_m = [m[0], m[1]];
      this.kb = false;
    }
    if (this.phase === "intro" || this.phase === "final") return;

    // flying cards
    const fl = this.flyers as Flyer[];
    const landed: Flyer[] = [];
    for (const f of fl) {
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.t += dt;
      if (f.t >= f.dur) landed.push(f);
    }
    if (landed.length) {
      this.flyers = fl.filter((f) => !landed.includes(f));
      for (const f of landed) {
        try {
          if (f.cb) f.cb();
        } catch (err) {
          this.oops(err);
        }
      }
    }
    // timers
    const tm = this.timers as { t: number; fn: () => void }[];
    const due: { t: number; fn: () => void }[] = [];
    for (const x of tm) {
      x.t -= dt;
      if (x.t <= 0) due.push(x);
    }
    if (due.length) {
      this.timers = (this.timers as any[]).filter((x) => !due.includes(x));
      for (const x of due) {
        if (this.phase === "final" || this.closed) break;
        try {
          x.fn();
        } catch (err) {
          this.oops(err);
        }
      }
    }
    // watchdog: if nothing is pending while busy, move the game along
    const idle = (this.phase === "busy" || this.phase === "deal") && !(this.flyers as any[]).length && !(this.timers as any[]).length;
    if (idle) {
      this.stuck_t += dt;
      if (this.stuck_t > 2.5) {
        this.stuck_t = 0;
        if (!(this.discard as Card[]).length) this.flip_starter();
        else this.start_turn(this.next(this.turn));
      }
    } else this.stuck_t = 0;
  }

  // ------------------------------------------------------------ draw
  draw(s: Surface) {
    try {
      this._draw(s);
    } catch (err) {
      this.errors += 0.05;
      try { console.warn("CardGame draw:", err); } catch (_e) { /* ignore */ }
    }
  }

  _draw(s: Surface) {
    const m = this.game.mpos;
    s.blit(felt_surface(), [0, 0]);
    if (this.phase === "intro") {
      this.draw_intro(s, m);
      return;
    }
    this.draw_piles(s, m);
    for (let i = 1; i < this.P.length; i++) this.draw_seat(s, i);
    this.draw_zoe(s, m);
    this.draw_flyers(s);
    this.draw_status(s);
    if (this.banner_t > 0 && this.banner && this.phase !== "suit") {
      const w = font.text_width(this.banner) + 14;
      const y = 117 - Math.round(Math.max(0, this.banner_t - 1.1) * 30);
      ui.panel(s, [160 - Math.floor(w / 2), y, w, 13], [44, 30, 54], this.banner_col, false);
      font.draw(s, this.banner, [160, y + 4], this.banner_col, 1, null, "center");
    }
    if (this.phase === "suit") {
      font.draw(s, "PICK A SUIT!  (1-4)", [160, 106], [255, 240, 200], 1, [30, 60, 40], "center");
      for (const b of this.suit_btns) b.draw(s, m);
    }
    for (let i = 0; i < this.P.length; i++) this.draw_bubble(s, i);
    this.particles.draw(s);
    if (this.phase === "final") this.draw_final(s, m);
  }

  draw_piles(s: Surface, m: number[]) {
    // deck
    const deck = this.deck as Card[];
    const layers = deck.length ? clamp(Math.ceil(deck.length / 7), 1, 4) : 0;
    const can_draw = this.phase === "zoe" && this.turn === 0;
    if (!deck.length) {
      pg.draw.rect(s, [36, 110, 70], [DECK_X, DECK_Y, CW, CH], 1);
      font.draw(s, "EMPTY", [DECK_X + CW / 2, DECK_Y + 12], [120, 190, 140], 1, null, "center");
    }
    for (let k = layers - 1; k >= 0; k--) draw_back(s, DECK_X - k, DECK_Y - k, CW, CH);
    if (can_draw) {
      const hov = this.deck_hit(m);
      const pulse = Math.floor(this.t * 4) % 2 === 0;
      const gc: Col = hov ? [255, 250, 200] : pulse ? [255, 220, 120] : [230, 190, 90];
      const o = layers > 0 ? layers - 1 : 0;
      pg.draw.rect(s, gc, [DECK_X - o - 2, DECK_Y - o - 2, CW + o + 4, CH + o + 4], 1);
      const lbl = this.drew ? "PASS" : "DRAW";
      const w = font.text_width(lbl) + 6;
      ui.panel(s, [DECK_X + CW / 2 - Math.floor(w / 2), DECK_Y + CH - 6, w, 11], [255, 236, 200], [150, 100, 40], false);
      font.draw(s, lbl, [DECK_X + CW / 2, DECK_Y + CH - 3], ui.INK, 1, null, "center");
    }
    font.draw(s, String(deck.length), [DECK_X - 6, DECK_Y + CH - 6], [150, 210, 170], 1, null, "right");
    // discard pile
    const disc = this.discard as Card[];
    const n = disc.length;
    for (let k = Math.max(0, n - 3); k < n; k++) {
      const c = disc[k];
      const off = k === n - 1 ? [0, 0] : [((c.id * 7) % 5) - 2, ((c.id * 3) % 3) - 1];
      s.blit(card_face(c), [DISC_X + off[0], DISC_Y + off[1]]);
    }
    if (!n) pg.draw.rect(s, [36, 110, 70], [DISC_X, DISC_Y, CW, CH], 1);
    // current suit token
    if (n) {
      const sd = SUITS[this.cur_suit] || SUITS[0];
      const top = this.top_card();
      const wild = top && top.rank === WILD;
      const r = wild ? 9 + (Math.floor(this.t * 3) % 2) : 8;
      pg.draw.circle(s, sd.col, [TOKEN_X, TOKEN_Y], r + 1);
      pg.draw.circle(s, [252, 248, 238], [TOKEN_X, TOKEN_Y], r - 1);
      blit_in(s, suit_icon(this.cur_suit), TOKEN_X - 4, TOKEN_Y - 4, 8, 8);
      font.draw(s, sd.name, [TOKEN_X, TOKEN_Y + 12], lighter_of(sd.col), 1, [20, 50, 30], "center");
    }
  }

  draw_portrait_box(s: Surface, i: number, x: number, y: number) {
    const active = this.turn === i && this.phase !== "final" && this.phase !== "deal";
    const pulse = Math.floor(this.t * 3) % 2 === 0;
    const won = this.phase === "final" && this.winner === i;
    const border: Col = won ? [255, 220, 90] : active ? (pulse ? [255, 230, 120] : [240, 190, 80]) : ui.BORDER;
    if (active || won) pg.draw.rect(s, border, [x - 2, y - 2, 36, 40], 1);
    ui.panel(s, [x, y, 32, 36], i === 0 ? [250, 220, 230] : [220, 236, 250], border, false);
    const p = this.portraits[i];
    if (p) s.blit(p, [x + 4, y + 4]);
    else font.draw(s, "?", [x + 16, y + 12], ui.MUTED, 2, null, "center");
    // card-count badge
    const n = this.P[i].hand.filter((c) => !c.hidden).length;
    const bx = x + 30, by = y + 2;
    const bc: Col = n === 1 && this.phase !== "deal" ? [230, 70, 90] : [70, 56, 90];
    pg.draw.circle(s, [255, 250, 240], [bx, by], 5);
    pg.draw.circle(s, bc, [bx, by], 4);
    font.draw(s, String(n), [bx + 1, by - 2], [255, 255, 255], 1, null, "center");
  }

  draw_seat(s: Surface, i: number) {
    const p = this.P[i];
    const [x, y] = this.portrait_pos(p.seat);
    this.draw_portrait_box(s, i, x, y);
    const nm = short(p.name);
    const active = this.turn === i && (this.phase === "busy" || this.phase === "zoe");
    const col: Col = active ? [255, 236, 150] : [220, 240, 226];
    if (p.seat === "top") font.draw(s, nm, [x + 16, y + 39], col, 1, [20, 50, 30], "center");
    else font.draw(s, nm, [x + 16, y + 39], col, 1, [20, 50, 30], "center");
    if (active) {
      // little arrow pointing at the active friend
      const bob = Math.floor(this.t * 4) % 2;
      const ax = p.seat === "left" ? x + 40 + bob : p.seat === "right" ? x - 6 - bob : x + 16;
      const ay = p.seat === "top" ? y + 47 + bob : y + 16;
      if (p.seat === "left") pg.draw.polygon(s, [255, 230, 120], [[ax, ay], [ax + 4, ay - 3], [ax + 4, ay + 3]]);
      else if (p.seat === "right") pg.draw.polygon(s, [255, 230, 120], [[ax, ay], [ax - 4, ay - 3], [ax - 4, ay + 3]]);
      else pg.draw.polygon(s, [255, 230, 120], [[ax, ay - 1], [ax - 3, ay + 3], [ax + 3, ay + 3]]);
    }
    const vis = p.hand.filter((c) => !c.hidden);
    const total = p.hand.length;
    for (let k = 0; k < Math.min(vis.length, 10); k++) {
      const [fx, fy] = this.fan_rect(i, k, total);
      draw_back(s, fx, fy, SW, SH);
    }
    if (vis.length > 10) {
      const [fx, fy] = this.fan_rect(i, 9, total);
      font.draw(s, "+" + (vis.length - 10), [fx + SW + 2, fy + 4], [230, 240, 230]);
    }
  }

  draw_zoe(s: Surface, m: number[]) {
    const [px, py] = this.portrait_pos("bottom");
    this.draw_portrait_box(s, 0, px, py);
    const hand = this.P[0].hand;
    const hover = this.phase === "zoe" ? (this.kb ? this.sel : this.hand_hit(m)) : -1;
    const myturn = this.phase === "zoe";
    for (let i = 0; i < hand.length; i++) {
      const c = hand[i];
      if (c.hidden) continue;
      const [x, y] = this.hand_rect(i, hand.length);
      const ok = this.zoe_can(c);
      const ly = y - this.lift(i, hover);
      if (ok) {
        const glow: Col = i === hover ? [255, 250, 200] : Math.floor(this.t * 3) % 2 === 0 ? [255, 226, 120] : [244, 200, 90];
        pg.draw.rect(s, glow, [x - 1, ly - 1, CW + 2, CH + 2], 1);
      }
      s.blit(card_face(c), [x, ly]);
      if (myturn && !ok) {
        const v = sprites.cached("cards_dim", () => {
          const d = new Surface([CW, CH], pg.SRCALPHA);
          d.fill([20, 30, 40, 70]);
          for (const q of [[0, 0], [CW - 1, 0], [0, CH - 1], [CW - 1, CH - 1]]) d.set_at(q, [0, 0, 0, 0]);
          return d;
        });
        s.blit(v, [x, ly]);
      }
      if (this.drew && c === this.drawn && myturn) font.draw(s, "NEW", [x + CW / 2, ly - 7], [255, 240, 160], 1, [40, 30, 20], "center");
    }
  }

  draw_flyers(s: Surface) {
    for (const f of this.flyers as Flyer[]) {
      if (f.delay > 0) continue;
      const k = clamp(f.t / Math.max(0.01, f.dur), 0, 1);
      const e = 1 - (1 - k) * (1 - k);
      let to: RectN;
      try {
        to = f.to();
      } catch (_e) {
        to = [DISC_X, DISC_Y, CW, CH];
      }
      const x = f.from[0] + (to[0] - f.from[0]) * e;
      const y = f.from[1] + (to[1] - f.from[1]) * e - Math.sin(k * Math.PI) * 6;
      const w = f.from[2] + (to[2] - f.from[2]) * e;
      const h = f.from[3] + (to[3] - f.from[3]) * e;
      const show_face = f.face && f.card && (!f.flip || k > 0.55);
      if (show_face) {
        // a quick "flip": squash horizontally around the halfway point
        if (f.flip && k < 0.75) {
          const sq = Math.max(2, Math.round(CW * ((k - 0.55) / 0.2)));
          const face = card_face(f.card!);
          const cx = Math.round(x + w / 2);
          pg.draw.rect(s, [74, 58, 88], [cx - Math.floor(sq / 2), Math.round(y), sq, CH]);
          s.blit(face, [cx - Math.floor(sq / 2), Math.round(y)], [Math.floor((CW - sq) / 2), 0, sq, CH]);
        } else s.blit(card_face(f.card!), [Math.round(x + (w - CW) / 2), Math.round(y + (h - CH) / 2)]);
      } else {
        const sq = f.face && f.flip && k > 0.35 ? Math.max(0.15, 1 - (k - 0.35) / 0.2) : 1;
        draw_back(s, x + (w * (1 - sq)) / 2, y, w * sq, h);
      }
    }
  }

  draw_status(s: Surface) {
    let txt = "", sub = "", col: Col = [255, 240, 200];
    if (this.phase === "deal") {
      txt = "DEALING...";
      col = [220, 240, 226];
    } else if (this.phase === "zoe") {
      const any = this.P[0].hand.some((c) => this.zoe_can(c));
      const blink = Math.floor(this.t * 2.5) % 2 === 0;
      txt = "YOUR TURN!";
      col = blink ? [255, 250, 220] : [255, 220, 130];
      if (this.drew) sub = any ? "PLAY THE NEW CARD, OR CLICK DECK TO PASS" : "CLICK THE DECK TO PASS";
      else sub = any ? "CLICK A GLOWING CARD - OR DRAW FROM THE DECK" : "NO MATCH - CLICK THE DECK TO DRAW";
    } else if (this.phase === "suit") {
      txt = "";
    } else if (this.phase === "busy") {
      const p = this.P[this.turn];
      if (p && !p.zoe) {
        txt = `${short(p.name)}'S TURN`;
        col = [200, 224, 255];
      }
    }
    if (txt) font.draw(s, txt, [166, 98], col, 1, [20, 50, 30], "center");
    if (sub) font.draw(s, sub, [166, 106], [190, 226, 200], 1, null, "center");
    // tiny turn counter / goal
    font.draw(s, "EMPTY YOUR HAND!", [314, 172], [120, 180, 140], 1, null, "right");
  }

  draw_bubble(s: Surface, i: number) {
    const p = this.P[i];
    if (!p || p.bubble_t <= 0 || !p.bubble) return;
    const lines = font.wrap(p.bubble, 76).slice(0, 3);
    const w = Math.max(...lines.map((l) => font.text_width(l))) + 8;
    const h = lines.length * 7 + 5;
    const [px, py] = this.portrait_pos(p.seat);
    let x = 0, y = 0;
    let tail: [number, number][] = [];
    if (p.seat === "left") {
      x = px + 38; y = py - 2;
      tail = [[x, y + 5], [x - 4, y + 7], [x, y + 9]];
    } else if (p.seat === "right") {
      x = px - 6 - w; y = py - 2;
      tail = [[x + w - 1, y + 5], [x + w + 3, y + 7], [x + w - 1, y + 9]];
    } else if (p.seat === "top") {
      x = px - 6 - w; y = py + 4;
      tail = [[x + w - 1, y + 4], [x + w + 3, y + 6], [x + w - 1, y + 8]];
    } else {
      x = px + 2; y = py - h - 6;
      tail = [[x + 10, y + h - 1], [x + 14, y + h + 3], [x + 16, y + h - 1]];
    }
    x = clamp(x, 2, 318 - w);
    const pop = p.bubble_t > 1.6 ? 1 : 0;
    const last = /LAST CARD/i.test(p.bubble);
    const fill: Col = last ? [255, 236, 170] : [255, 252, 244];
    const border: Col = last ? [220, 120, 40] : ui.BORDER;
    pg.draw.rect(s, border, [x, y - pop, w, h]);
    pg.draw.rect(s, fill, [x + 1, y + 1 - pop, w - 2, h - 2]);
    pg.draw.polygon(s, border, tail.map(([a, b]) => [a, b - pop]));
    lines.forEach((l, k) => font.draw(s, l, [x + 4, y + 3 + k * 7 - pop], last ? [170, 60, 20] : ui.INK));
  }

  draw_intro(s: Surface, m: number[]) {
    ui.panel(s, [48, 14, 224, 148], [58, 40, 60], [34, 22, 40]);
    font.draw(s, "PAW PILE!", [160, 20], [255, 220, 120], 2, [120, 60, 40], "center");
    font.draw(s, "GAME NIGHT CARDS", [160, 33], [210, 190, 220], 1, null, "center");
    const n = this.P.length - 1;
    const total = 32 + 18 + n * 32 + (n - 1) * 4;
    let x = 160 - Math.floor(total / 2);
    const y = 42;
    const draw_one = (i: number, px: number) => {
      ui.panel(s, [px, y, 32, 36], i === 0 ? [250, 220, 230] : [220, 236, 250], ui.BORDER, false);
      const p = this.portraits[i];
      if (p) s.blit(p, [px + 4, y + 4]);
      else font.draw(s, "?", [px + 16, y + 12], ui.MUTED, 2, null, "center");
      font.draw(s, short(this.P[i].name, 7), [px + 16, y + 38], [255, 240, 220], 1, null, "center");
    };
    draw_one(0, x);
    font.draw(s, "VS", [x + 41, y + 14], [200, 170, 190], 1, null, "center");
    x += 50;
    for (let i = 1; i <= n; i++) {
      draw_one(i, x);
      x += 36;
    }
    // sample special cards
    const ex: Card[] = [{ id: 0, suit: 2, rank: 5 }, { id: 1, suit: 0, rank: WILD }, { id: 2, suit: 3, rank: DRAW2 }, { id: 3, suit: 1, rank: SKIP }];
    const tips = ["MATCH", "WILD", "DRAW 2", "SKIP"];
    ex.forEach((c, i) => {
      const cx = 62 + i * 26;
      s.blit(card_face(c), [cx, 92]);
      font.draw(s, tips[i], [cx + 11, 124], [230, 220, 200], 1, null, "center");
    });
    font.draw_wrapped(s, "Match the SUIT or NUMBER. 8 = WILD, you pick the suit. " +
      "2 = next player draws 2. S = skip them!", [170, 92, 96, 40], [255, 240, 220]);
    font.draw(s, `FIRST TO EMPTY THEIR HAND WINS - PRIZE ${PRIZE} COINS`, [160, 132], [255, 220, 120], 1, null, "center");
    this.start_btn.draw(s, m);
    this.nah_btn.draw(s, m);
  }

  draw_final(s: Surface, m: number[]) {
    ui.panel(s, [64, 44, 192, 98], [58, 40, 60], [34, 22, 40]);
    const w = this.P[this.winner];
    const txt = this.outcome === "win" ? `YOU WIN ${PRIZE}!` : this.outcome === "lose" ? `${w ? short(w.name) : "THEY"} WINS!` : "IT'S A DRAW!";
    const col: Col = this.outcome === "win" ? [255, 230, 120] : this.outcome === "lose" ? [250, 170, 170] : [230, 230, 240];
    font.draw(s, txt, [160, 52], col, 2, [60, 30, 30], "center");
    font.draw(s, this.reason, [160, 70], [255, 240, 220], 1, null, "center");
    font.draw(s, "CARDS LEFT", [160, 82], [190, 170, 200], 1, null, "center");
    const parts = this.P.map((p) => `${p.zoe ? "ZOE" : short(p.name)} ${p.hand.length}`);
    font.draw(s, parts.join("   "), [160, 91], [230, 220, 230], 1, null, "center");
    if (this.outcome === "win") font.draw(s, `+${PRIZE} COINS!`, [160, 105], col, 1, null, "center");
    else if (this.outcome === "lose") font.draw(s, "NO COINS LOST - IT'S JUST FOR FUN", [160, 105], [200, 190, 210], 1, null, "center");
    this.ok_btn.draw(s, m);
  }
}

function lighter_of(c: Col): Col {
  return sprites.lighter(c, 0.45);
}
