"""Zoe's Pet Clinic - entry point.  Run:  python main.py"""
import os
import sys

# Make the bundled "game" package importable when frozen with PyInstaller
if getattr(sys, "frozen", False):
    sys.path.insert(0, getattr(sys, "_MEIPASS", os.path.dirname(sys.executable)))
else:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pygame  # noqa: E402

try:
    pygame.mixer.pre_init(22050, -16, 1, 512)
except Exception:
    pass

from game.engine import Game  # noqa: E402
from game.menus import TitleScene  # noqa: E402


def main():
    game = Game()
    game.shift_snapshot = None
    game.replace(TitleScene(game))
    game.run()


if __name__ == "__main__":
    main()
