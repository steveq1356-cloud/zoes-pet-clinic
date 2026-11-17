/* Zoe's friends from Clery's: who meets her when, what they chat about on a walk,
 * and the bar banter between them. Pure data + schedule (no scene imports). */
import * as gstate from "./state";

export const GANG = ["stephen", "danny", "andrew", "jayden", "shteynie", "renee", "tish", "greg"];

export const NICE: Record<string, string> = {
  stephen: "Stephen", danny: "Danny", andrew: "Andrew", jayden: "Jayden",
  shteynie: "Shteynie", renee: "Renee", tish: "Tish", greg: "Greg",
};

const MORNING_ROT = ["renee", "danny", "greg", "tish", "andrew", "jayden", "stephen", "shteynie"];
const HOME_ROT = ["tish", "greg", "danny", "renee", "andrew", "jayden"];
const PREGAME_PAIRS = [["renee", "tish"], ["greg", "andrew"], ["danny", "jayden"], ["stephen", "shteynie"]];

/** Who's waiting outside 146 to walk Zoe to work today (or null). */
export function morning_walker(day: number): string | null {
  if (day < 2 || day % 3 !== 2) return null;
  return MORNING_ROT[Math.floor(day / 3) % MORNING_ROT.length];
}

/** Tonight's plan after the shift. */
export function evening_plan(day: number): { kind: string; names: string[] } | null {
  if (gstate.is_thursday(day)) return { kind: "turkey", names: ["shteynie", "stephen"] };
  if (day % 2 === 0) return { kind: "pregame", names: PREGAME_PAIRS[Math.floor(day / 2) % PREGAME_PAIRS.length] };
  if (day >= 3) return { kind: "walkhome", names: [HOME_ROT[Math.floor(day / 2) % HOME_ROT.length]] };
  return null;
}

// ---------------------------------------------------------------- Hillside homes
/** Who lives where on Hillside (Zoe is 146). Mabel keeps 138. */
export const HOUSES: Record<string, any> = {
  renee: { num: 140, house: "house2", floor: "herringbone", wall: "hqwall", decor: ["plant", "starlamp", "rug"], color: [240, 170, 196] },
  danny: { num: 142, house: "house3", floor: "darkplanks", wall: "darkbrick", decor: ["poster", "beanbag", "bookshelf"], color: [90, 90, 110] },
  andrew: { num: 144, house: "house4", floor: "planks", wall: "brickwall", decor: ["fishtank", "plant", "poster"], color: [110, 180, 110] },
  stephen: { num: 148, house: "house5", floor: "wood", wall: "wall", decor: ["bookshelf", "lamp", "plant"], color: [90, 130, 190] },
  shteynie: { num: 150, house: "house6", floor: "darkplanks", wall: "barwall", decor: ["poster", "beanbag", "lamp"], color: [180, 60, 60] },
  greg: { num: 152, house: "house1", floor: "cafefloor", wall: "cafewall", decor: ["plant", "fishtank", "lamp"], color: [70, 170, 160] },
  jayden: { num: 154, house: "house3", floor: "pressfloor", wall: "presswall", decor: ["plant", "beanbag", "poster"], color: [240, 200, 90] },
  tish: { num: 156, house: "house2", floor: "herringbone", wall: "subwaywall", decor: ["bookshelf", "starlamp", "plant"], color: [40, 50, 92] },
};

const GAME_HOSTS = ["greg", "danny", "renee", "andrew", "jayden", "tish", "stephen", "shteynie"];
const PREGAME_HOSTS: (string | null)[] = [null, "danny", null, "renee", null, "greg", null, "tish"]; // null = Zoe's place

/** Game night invite for today: host, game and who's coming. */
export function game_night(day: number): any {
  const host = GAME_HOSTS[day % GAME_HOSTS.length];
  const guest = GAME_HOSTS[(day + 3) % GAME_HOSTS.length];
  return { kind: "gamenight", host, game: day % 2 ? "kart" : "cards", names: [host, guest] };
}

/** Pregame invite (when Zoe chooses to go out): at 146 or a friend's place. */
export function pregame_plan(day: number): any {
  const pair = PREGAME_PAIRS[Math.floor(day / 2) % PREGAME_PAIRS.length];
  const h = PREGAME_HOSTS[Math.floor(day / 2) % PREGAME_HOSTS.length];
  if (h == null) return { kind: "pregame", host: "zoe", names: pair };
  const other = pair.includes(h) ? pair.find((n) => n !== h) : pair[0];
  return { kind: "pregame", host: h, names: [h, other] };
}

/** Tonight's plan as chosen by the player (Thursdays are always Turkey Thursday). */
export function tonight(st: any): any {
  if (st.phase !== "evening") return null;
  if (gstate.is_thursday(st.day)) return { kind: "turkey", names: ["shteynie", "stephen"] };
  const np = st.night_plan;
  if (!np || np.day !== st.day) return null;
  return np;
}

export function where(name: string): string {
  return name === "zoe" ? "146" : `${NICE[name]}'s (${HOUSES[name].num})`;
}

/** Is a walk-with still valid right now? */
export function walking(st: any): any {
  const w = st.walk_with;
  if (!w || w.day !== st.day || w.phase !== st.phase) return null;
  return w;
}

export function add_pts(st: any, name: string, n = 1) {
  if (!st.friend_pts) st.friend_pts = {};
  st.friend_pts[name] = (st.friend_pts[name] || 0) + n;
}

export function hearts(st: any, name: string): number {
  return Math.min(5, Math.floor(((st.friend_pts || {})[name] || 0) / 3));
}

export const MORNING_HELLO: Record<string, string[]> = {
  renee: ["Morning, Zoe! I'm walking you to work. I brought gossip AND a granola bar."],
  danny: ["Hey. Thought I'd walk you to the clinic. Mornings are less boring with company."],
  greg: ["Yo, Dr. Zoe! I was getting boba anyway. Walk you to work?"],
  tish: ["There she is! Come on, I'll walk you in. Coat stays on, it's chilly."],
  andrew: ["Zoe! Morning! I'm walking you to work. I've got NEW dog jokes."],
  jayden: ["Morning! I did a 5K already. Kidding. Walk you to work?"],
  stephen: ["Doc! Morning. I'll walk you over - I need the steps, honestly."],
  shteynie: ["Zoe! Walking you to work. Don't argue, I've already decided."],
};

export const WALK_LINES: Record<string, string[]> = {
  renee: ["Okay so Tish said WHAT to Danny?", "Those shoes are so cute on you.", "Coffee date at Pressed soon!", "Andrew's jokes are getting worse.", "You're literally a pet superhero."],
  danny: ["Pool tonight? I've been practicing.", "Stephen still owes me ten coins.", "This town is nice in the morning.", "Mags says hi, by the way.", "Bring a glove for Wildside."],
  greg: ["Have you tried the spicy wings?", "I'm learning to cook dumplings.", "Shteynie cheats at darts. I'm sure of it.", "Pool rematch tonight?", "Boba run later?"],
  tish: ["Yes, the coat is still new.", "Walk faster, I'm cold.", "Weirdest pet you've had this week?", "Renee is obsessed with your outfits.", "Clery's later. No excuses."],
  andrew: ["What do you call a cold dog? A chili dog!", "Why did the cat sit on the laptop? To keep an eye on the mouse!", "Okay that one was good.", "Renee never laughs. She will.", "Fish and chips tonight?"],
  jayden: ["Hydrate, doc. Vets need water.", "Group photo tonight!", "I'm basically undefeated at shots.", "You've got this today.", "Tip: feed pets before you bathe them."],
  stephen: ["I'm getting my darts crown back.", "Never tell Shteynie I lost.", "The middle part is a commitment.", "My cousin's dog loves you.", "Turkey Thursday is sacred."],
  shteynie: ["Darts rematch later. Prepare.", "Turkey Thursday is a lifestyle.", "I'd be a great vet. Probably.", "Stephen's darts are a cry for help.", "The crew's proud of you, Zoe."],
};

export const CLINIC_BYE: Record<string, string> = {
  renee: "Go get 'em! You're gonna crush it today!",
  danny: "Here you go. Good luck in there.",
  greg: "Go save some fluffballs, Doc!",
  tish: "Knock 'em dead. Not literally. You're a vet.",
  andrew: "Last one: why are dogs bad dancers? Two left feet! Okay bye!",
  jayden: "Deep breath. You've got this!",
  stephen: "Go be a hero, Doc.",
  shteynie: "Make us proud. See you at Clery's.",
};

export const HOME_HELLO: Record<string, string[]> = {
  tish: ["Rough day? Come on, I'll walk you home."],
  greg: ["Zoe! Long shift? Walk you home - I'll tell you about my dumpling disaster."],
  danny: ["Hey. You look wiped. I'll walk you back to 146."],
  renee: ["ZOE. You need to hear what happened at my work. Walking you home!"],
  andrew: ["Zoe! I'll walk you home. I've got jokes for the whole way."],
  jayden: ["Clinic's closed, Doc! Walk you home? We can stretch on the way."],
};

export const HOME_BYE: Record<string, string> = {
  tish: "Here's your stop. Change into something cute and come to Clery's!",
  greg: "Home sweet home! Catch you at Clery's later?",
  danny: "Get some rest. Or come play pool. Your call.",
  renee: "Okay go change, and then COME OUT. I'm serious!",
  andrew: "Night, Zoe! Clery's later? Fish and chips are calling.",
  jayden: "Stretch, hydrate, then come to Clery's!",
};

/** Friends talking to EACH OTHER around the bar, shown as little speech bubbles. */
export const BAR_BANTER: [string, string][] = [
  ["stephen", "Danny, that was a scratch."],
  ["danny", "It was NOT a scratch."],
  ["shteynie", "Bullseye! Jayden, pay up."],
  ["jayden", "Best of seven!"],
  ["renee", "Tish, tell them about your date!"],
  ["tish", "Only if Greg tells his dumpling story."],
  ["greg", "The smoke alarm was overreacting."],
  ["andrew", "Greg, shots? Loser buys chips."],
  ["greg", "You're on, Andrew."],
  ["stephen", "Shteynie, rematch after this."],
  ["shteynie", "You say that every week."],
  ["andrew", "Why don't dogs make good DJs? Ruff mixes!"],
  ["renee", "ANDREW. No."],
  ["danny", "Zoe's here! Rack 'em up!"],
  ["tish", "Mags, another round for the table!"],
];

export const PREGAME_LINES: Record<string, string[]> = {
  renee: ["Okay, outfit check! Spin for us.", "I made a playlist called 'Zoe Is Iconic'.", "Tish, which earrings?"],
  tish: ["I'm on aux. Don't fight me.", "Zoe, the black dress. Trust me.", "Renee, you've changed three times."],
  greg: ["I made popcorn. It's a little burnt. It's fine.", "Okay who's ready to lose at pool tonight?", "Your place is so cozy, Zoe."],
  andrew: ["Pregame joke: what's a dog's favorite pizza? Pupperoni!", "Are we walking or running to Clery's?", "Let's goooo!"],
  danny: ["Your fish tank is relaxing. Do you have a fish tank? Feels like you should.", "I'm saving my energy for pool.", "Alright, ten minutes then we go."],
  jayden: ["Group selfie before we leave!", "Hydration station is open. It's just water.", "Let's get there before the line gets long."],
  stephen: ["Doc! Love the place. Ready for Clery's?", "Shteynie's already planning his darts victory speech.", "One toast, then we roll out."],
  shteynie: ["To Zoe! Best vet in Pawsley!", "Stephen, your middle part is crooked.", "Okay crew, Clery's. Move out."],
};
