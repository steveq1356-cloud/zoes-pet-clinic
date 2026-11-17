/* Daily challenges: 3 new tasks every morning, with coin rewards.
 * Open the list anywhere in town with T, or at the Town Board in the plaza. */
import * as pg from "./pg";
import { Surface } from "./pg";

import * as font from "./font";
import * as sprites from "./sprites";
import * as ui from "./ui";
import { Scene } from "./engine";

/** id: what to report with progress(); goal: how many; reward: coins. */
export const POOL: any[] = [
  { id: "treat", text: "Treat {n} patients", goals: [3, 5, 7], reward: 25 },
  { id: "kind:cat", text: "Treat a cat", goals: [1], reward: 15 },
  { id: "kind:dog", text: "Treat {n} dogs", goals: [2], reward: 20 },
  { id: "kind:bunny", text: "Treat a bunny", goals: [1], reward: 15 },
  { id: "five_star", text: "Get a 5-star rating", goals: [1], reward: 25 },
  { id: "no_loss", text: "Finish a shift with no losses", goals: [1], reward: 30 },
  { id: "wild_shift", text: "Survive a shift at Wildside", goals: [1], reward: 40 },
  { id: "shots_win", text: "Win a shot challenge at Clery's", goals: [1], reward: 20 },
  { id: "darts_win", text: "Beat a friend at darts", goals: [1], reward: 20 },
  { id: "sub_coins", text: "Earn {n} coins at the Subway gig", goals: [15, 25], reward: 15 },
  { id: "eat_pressed", text: "Grab something at Pressed Cafe", goals: [1], reward: 10 },
  { id: "eat_sub", text: "Eat a sub at Subway", goals: [1], reward: 10 },
  { id: "buy", text: "Buy something at Bramble's", goals: [1], reward: 10 },
  { id: "talk", text: "Chat with {n} townsfolk", goals: [4, 6], reward: 15 },
  { id: "fleas", text: "Catch {n} fleas", goals: [10, 20], reward: 20 },
  { id: "bites_dodged", text: "Dodge {n} feral growls", goals: [3], reward: 25 },
];

/** Make sure today's tasks exist (re-rolled each day, same tasks for the same day). */
export function ensure(st: any) {
  if (st.tasks_day === st.day && Array.isArray(st.tasks)) return;
  const rng = new pg.Random("tasks" + st.day);
  const pool = POOL.slice();
  rng.shuffle(pool);
  const picked: any[] = [];
  for (const t of pool) {
    if (picked.length >= 3) break;
    if (picked.some((p) => p.id.split(":")[0] === t.id.split(":")[0])) continue;
    const goal = rng.choice(t.goals) as number;
    picked.push({ id: t.id, text: t.text.replace("{n}", String(goal)), goal, prog: 0, reward: t.reward + (goal > 3 ? 5 : 0), done: false });
  }
  st.tasks = picked;
  st.tasks_day = st.day;
}

/** Report progress, e.g. progress(game, "treat") or progress(game, "kind:cat"). */
export function progress(game: any, id: string, amount = 1) {
  const st = game.state;
  if (!st) return;
  ensure(st);
  for (const t of st.tasks) {
    if (t.done || t.id !== id) continue;
    t.prog = Math.min(t.goal, t.prog + amount);
    if (t.prog >= t.goal) {
      t.done = true;
      st.coins += t.reward;
      st.total_coins += t.reward;
      st.stats.tasks_done = (st.stats.tasks_done || 0) + 1;
      game.toast("TASK DONE! +" + t.reward, t.text);
      game.audio.play("buy");
    }
  }
}

export function done_count(st: any): number {
  ensure(st);
  return st.tasks.filter((t: any) => t.done).length;
}

export class TasksMenu extends Scene {
  overlay = true;

  constructor(game: any) {
    super(game);
    ensure(game.state);
    this.close_btn = new ui.Button([134, 138, 52, 13], "Close", () => this.game.pop(), true, null, null, pg.K_ESCAPE);
  }

  event(e: any) {
    if (e.type === pg.KEYDOWN && e.key === pg.K_t) {
      this.game.pop();
      return;
    }
    this.close_btn.handle(e, this.game);
  }

  draw(s: Surface) {
    const st = this.game.state;
    const v = sprites.cached("tasks_dim", () => {
      const d = new Surface([320, 180], pg.SRCALPHA);
      d.fill([20, 14, 30, 120]);
      return d;
    });
    s.blit(v, [0, 0]);
    ui.panel(s, [40, 26, 240, 128], [255, 250, 230], [200, 150, 60]);
    font.draw(s, "TODAY'S TASKS", [160, 32], ui.ACCENT, 2, null, "center");
    font.draw(s, `DAY ${st.day} - NEW TASKS EVERY MORNING`, [160, 46], ui.MUTED, 1, null, "center");
    st.tasks.forEach((t: any, i: number) => {
      const y = 58 + i * 25;
      ui.panel(s, [50, y, 220, 21], t.done ? [214, 246, 210] : [255, 255, 255], t.done ? ui.GOOD : ui.BORDER, false);
      font.draw(s, t.done ? "✓" : String(i + 1), [56, y + 4], t.done ? ui.GOOD : ui.ACCENT);
      font.draw(s, t.text.toUpperCase(), [64, y + 4], ui.INK);
      pg.draw.rect(s, [220, 214, 222], [64, y + 13, 120, 4]);
      pg.draw.rect(s, t.done ? ui.GOOD : ui.GOLD, [64, y + 13, Math.trunc((120 * t.prog) / t.goal), 4]);
      font.draw(s, `${t.prog}/${t.goal}`, [190, y + 12], ui.MUTED);
      s.blit(sprites.icon("coin"), [226, y + 4]);
      font.draw(s, String(t.reward), [240, y + 7], [170, 120, 30]);
    });
    this.close_btn.draw(s, this.game.mpos);
  }
}

/** A tiny "T: TASKS 1/3" hint for HUDs. */
export function draw_hint(s: Surface, x: number, y: number, st: any) {
  const n = done_count(st);
  const label = `T: TASKS ${n}/3`;
  font.draw(s, label, [x, y], n === 3 ? [180, 255, 180] : [255, 255, 255], 1, [52, 38, 64]);
}


