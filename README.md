# Zoe's Pet Clinic

A cozy pixel-art vet management game that runs in the browser.
Built with Phaser 3 + TypeScript + Vite. All art and sound are generated in code.

## Run it locally

You need [Node.js](https://nodejs.org/) (version 20 or newer).

```bash
npm install
npm run dev
```

Then open the link it prints (usually http://localhost:5173).

Other commands:

- `npm run build`: type-checks and builds the game into `dist/`
- `npm run preview`: serves the built `dist/` folder locally

## Controls

- **Town/HQ:** WASD or arrow keys to walk, E or Space to interact, Esc for the pause menu
- **Clinic:** walk with WASD/arrows (or click where to go), E/Space picks a pet up and puts it down on a station, bed, cushion or the HOME desk. Esc steps away from a station.
- **Exam cards:** 1/2/3. **Decorating:** R rotates, Delete/Backspace puts an item back
- **F (or F11):** fullscreen. **M:** mute

## Tweaking the game

- Difficulty, timing, economy: `src/config.ts`
- Animals, ailments, store items, badges, NPC dialogue: `src/data.ts`

## Project layout

| File | What it does |
|---|---|
| `src/main.ts` | Boots Phaser, handles scaling, fullscreen, mouse and keyboard |
| `src/pg.ts` | Tiny pixel-exact drawing layer (surfaces, rects, shapes) |
| `src/engine.ts` | Game loop, scene stack, fades, screen shake, popups |
| `src/sprites.ts` | All pixel art, drawn in code |
| `src/world.ts` | Town, HQ and store (walking around) |
| `src/clinic.ts` | The clinic shift: walk-around floor, waves, day twists, recovery beds, summary |
| `src/minigames.ts` | Exam, Bath, Meds and Care mini-games |
| `src/menus.ts` | Title, settings, pause, store, mirror, trophies, pets, decorating |
| `src/ui.ts`, `src/font.ts` | Buttons, dialogue boxes, particles, the pixel font |
| `src/audio.ts` | Synthesized sound effects and chiptune music |
| `src/state.ts` | Save data, save versioning/migrations, rank and progression helpers |

Saves are currently stored in the browser (localStorage). Cloud saves with accounts come next.

`python_version/` is the original pygame version, kept for reference.
