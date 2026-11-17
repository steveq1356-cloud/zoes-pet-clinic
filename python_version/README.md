# Zoe's Pet Clinic

## Run
    pip install -r requirements.txt
    python main.py

## Build a double-clickable app (optional)
    pip install pyinstaller
    pyinstaller --onefile --windowed --name ZoesPetClinic main.py
(The app ends up in dist/.)

## Controls
- Town/HQ: WASD/arrows walk, E/Space interact, Esc pause
- Clinic: click tickets or animals, click station buttons, Tab cycles patients
- Exam cards: 1/2/3. Decorating: R rotates, Delete/Backspace stores.
- F11 fullscreen, M mute

## Tweaking
- Difficulty, timing, economy: game/config.py
- Animals, ailments, store items, badges, NPC dialogue: game/data.py

Saves go to your app-data folder (%APPDATA%/ZoesPetClinic on Windows,
~/Library/Application Support/ZoesPetClinic on Mac).
