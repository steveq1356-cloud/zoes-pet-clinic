"""Procedural chiptune SFX + music. No audio files needed."""
import array
import math
import random
import threading
import pygame

NOTE_INDEX = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6,
              "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def midi(name):
    n, octv = name[:-1], int(name[-1])
    return 12 * (octv + 1) + NOTE_INDEX[n]


def mfreq(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


class Synth:
    def __init__(self, sr):
        self.sr = sr
        self.rng = random.Random(3)

    def buf(self, seconds):
        return array.array("f", [0.0]) * int(seconds * self.sr + 1)

    def note(self, b, start, dur, freq, wave="sq", vol=0.3, slide=None, attack=0.004, decay_pow=0.7):
        sr = self.sr
        n = int(dur * sr)
        s0 = int(start * sr)
        if s0 + n >= len(b):
            n = len(b) - s0 - 1
        if n <= 0:
            return
        att = max(1, int(attack * sr))
        phase = 0.0
        rnd = self.rng.random
        noise_v = 0.0
        for i in range(n):
            f = freq if slide is None else freq + (slide - freq) * (i / n)
            phase += f / sr
            ph = phase - int(phase)
            if wave == "sq":
                v = 1.0 if ph < 0.5 else -1.0
            elif wave == "pulse":
                v = 1.0 if ph < 0.25 else -1.0
            elif wave == "tri":
                v = 4.0 * abs(ph - 0.5) - 1.0
            elif wave == "sine":
                v = math.sin(ph * 6.2832)
            else:  # noise (sample & hold)
                if i % 3 == 0:
                    noise_v = rnd() * 2 - 1
                v = noise_v
            env = (i / att if i < att else 1.0) * (1.0 - i / n) ** decay_pow
            b[s0 + i] += v * vol * env


class Audio:
    def __init__(self, settings):
        self.settings = settings
        self.ok = False
        self.sounds = {}
        self.tracks = {}
        self.current = None
        self.pending = None
        try:
            if not pygame.mixer.get_init():
                pygame.mixer.init(22050, -16, 1, 512)
            init = pygame.mixer.get_init()
            if not init:
                return
            self.freq, _, self.channels = init
            pygame.mixer.set_num_channels(16)
            if hasattr(pygame.mixer, "set_reserved"):
                pygame.mixer.set_reserved(1)
            self.music_ch = pygame.mixer.Channel(0)
            self.synth = Synth(self.freq)
            self._build_sfx()
            self.ok = True
            threading.Thread(target=self._build_music, daemon=True).start()
        except Exception as e:  # no audio device etc.
            print("Audio disabled:", e)
            self.ok = False

    # ------------------------------------------------------------ helpers
    def _to_sound(self, b):
        ints = array.array("h", (int(max(-1.0, min(1.0, v)) * 30000) for v in b))
        if self.channels == 2:
            st = array.array("h", [0]) * (len(ints) * 2)
            st[0::2] = ints
            st[1::2] = ints
            ints = st
        return pygame.mixer.Sound(buffer=ints.tobytes())

    def _build_sfx(self):
        S = self.synth
        defs = {}

        def mk(name, length, fn):
            b = S.buf(length)
            fn(b)
            defs[name] = b

        mk("blip", 0.06, lambda b: S.note(b, 0, 0.05, 880, "sq", 0.18))
        mk("select", 0.12, lambda b: (S.note(b, 0, 0.04, 660, "sq", 0.18), S.note(b, 0.05, 0.06, 990, "sq", 0.18)))
        mk("coin", 0.22, lambda b: (S.note(b, 0, 0.06, 988, "sq", 0.2), S.note(b, 0.06, 0.15, 1319, "sq", 0.2)))
        mk("sparkle", 0.3, lambda b: [S.note(b, i * 0.05, 0.08, f, "tri", 0.3) for i, f in enumerate((1047, 1319, 1568, 2093))])
        mk("error", 0.22, lambda b: S.note(b, 0, 0.2, 220, "sq", 0.18, slide=140))
        mk("pop", 0.08, lambda b: S.note(b, 0, 0.07, 500, "sine", 0.4, slide=1300))
        mk("shot", 0.18, lambda b: (S.note(b, 0, 0.1, 0, "noise", 0.15), S.note(b, 0.08, 0.08, 1200, "tri", 0.25)))
        mk("splash", 0.3, lambda b: S.note(b, 0, 0.28, 0, "noise", 0.2, decay_pow=1.5))
        mk("scrub", 0.08, lambda b: S.note(b, 0, 0.07, 0, "noise", 0.08, decay_pow=1.2))
        mk("heart", 0.2, lambda b: (S.note(b, 0, 0.08, 784, "tri", 0.35), S.note(b, 0.08, 0.1, 1175, "tri", 0.35)))
        mk("chime", 0.8, lambda b: [S.note(b, i * 0.1, 0.4, f, "tri", 0.3) for i, f in enumerate((523, 659, 784, 1047, 1319))])
        mk("door", 0.15, lambda b: S.note(b, 0, 0.12, 330, "sq", 0.15, slide=220))
        mk("sad", 0.5, lambda b: (S.note(b, 0, 0.22, 392, "tri", 0.3), S.note(b, 0.22, 0.28, 311, "tri", 0.3)))
        mk("tick", 0.03, lambda b: S.note(b, 0, 0.02, 1400, "sq", 0.06))
        mk("whoosh", 0.15, lambda b: S.note(b, 0, 0.14, 0, "noise", 0.12, decay_pow=0.5))
        mk("hiss", 0.3, lambda b: S.note(b, 0, 0.28, 0, "noise", 0.18, decay_pow=0.3))
        mk("pour", 0.1, lambda b: S.note(b, 0, 0.09, 300, "tri", 0.15, slide=380))
        mk("wrap", 0.1, lambda b: S.note(b, 0, 0.08, 500, "sq", 0.12, slide=700))
        mk("buy", 0.35, lambda b: [S.note(b, i * 0.06, 0.1, f, "sq", 0.18) for i, f in enumerate((784, 988, 1175, 1568))])
        mk("star", 0.18, lambda b: S.note(b, 0, 0.16, 1568, "tri", 0.3, slide=2093))
        for k, b in defs.items():
            self.sounds[k] = self._to_sound(b)

    def _song(self, bpm, melody, bass, hats=True, mel_wave="tri", bass_wave="pulse"):
        S = self.synth
        eighth = 60.0 / bpm / 2
        total = sum(l for _, l in melody) * eighth
        b = S.buf(total + 0.05)
        t = 0.0
        for n, l in melody:
            if n:
                S.note(b, t, l * eighth * 0.95, mfreq(midi(n)), mel_wave, 0.22, decay_pow=0.4)
            t += l * eighth
        t = 0.0
        for n, l in bass:
            if n:
                S.note(b, t, l * eighth * 0.85, mfreq(midi(n)), bass_wave, 0.09, decay_pow=0.8)
            t += l * eighth
        if hats:
            steps = int(total / eighth)
            for i in range(steps):
                S.note(b, i * eighth, 0.03, 0, "noise", 0.05 if i % 2 else 0.08, decay_pow=2)
        return b

    def _build_music(self):
        try:
            town_mel = [("E5", 2), ("G5", 2), ("C6", 2), ("G5", 2), ("A5", 3), ("G5", 1), ("E5", 2), ("C5", 2),
                        ("F5", 2), ("A5", 2), ("C6", 2), ("A5", 2), ("G5", 4), ("D5", 2), ("B4", 2),
                        ("E5", 2), ("G5", 2), ("E5", 1), ("D5", 1), ("C5", 2), ("A4", 2), ("C5", 2), ("E5", 4),
                        ("F5", 2), ("E5", 2), ("D5", 2), ("C5", 2), ("D5", 4), ("G4", 2), ("B4", 2)]
            roots = ["C3", "A2", "F2", "G2"] * 2
            fifths = {"C3": "G3", "A2": "E3", "F2": "C3", "G2": "D3"}
            town_bass = []
            for r in roots:
                town_bass += [(r, 2), (fifths[r], 2), (r, 2), (fifths[r], 2)]
            self.tracks["town"] = self._to_sound(self._song(108, town_mel, town_bass))

            clinic_mel = [("A4", 1), ("C5", 1), ("F5", 2), ("E5", 1), ("F5", 1), ("G5", 2),
                          ("A5", 2), ("F5", 2), ("D5", 2), ("F5", 2),
                          ("Bb4", 1), ("D5", 1), ("F5", 2), ("A5", 2), ("G5", 2),
                          ("G5", 2), ("E5", 2), ("C5", 2), ("E5", 2),
                          ("F5", 1), ("F5", 1), ("A5", 2), ("C6", 2), ("A5", 2),
                          ("D5", 2), ("F5", 2), ("A5", 3), ("G5", 1),
                          ("Bb5", 2), ("A5", 2), ("G5", 2), ("F5", 2),
                          ("E5", 2), ("G5", 2), ("F5", 4)]
            croots = ["F2", "D2", "Bb2", "C3"] * 2
            cf = {"F2": "C3", "D2": "A2", "Bb2": "F3", "C3": "G3"}
            cb = []
            for r in croots:
                cb += [(r, 1), (None, 1), (cf[r], 1), (r, 1), (r, 1), (None, 1), (cf[r], 2)]
            self.tracks["clinic"] = self._to_sound(self._song(140, clinic_mel, cb, mel_wave="sq"))

            title_mel = [("C5", 2), ("E5", 2), ("G5", 4), ("A5", 2), ("G5", 2), ("E5", 4),
                         ("F5", 2), ("E5", 2), ("D5", 4), ("G4", 4), ("B4", 4),
                         ("C5", 2), ("E5", 2), ("G5", 4), ("C6", 2), ("B5", 2), ("A5", 4),
                         ("G5", 2), ("F5", 2), ("D5", 4), ("C5", 8)]
            tb = []
            for r in ["C3", "C3", "F2", "G2", "C3", "A2", "F2", "C3"]:
                tb += [(r, 4), (r, 4)]
            self.tracks["title"] = self._to_sound(self._song(96, title_mel, tb, hats=False))
        except Exception as e:
            print("Music generation failed:", e)

    # ------------------------------------------------------------ API
    def play(self, name, vol=1.0):
        if not self.ok or self.settings.get("muted"):
            return
        s = self.sounds.get(name)
        if s:
            s.set_volume(max(0.0, min(1.0, self.settings.get("sfx", 0.7) * vol)))
            s.play()

    def music(self, name):
        if not self.ok:
            return
        if name == self.current:
            return
        self.current = name
        self.pending = name
        self._try_start()

    def _try_start(self):
        if self.pending and self.pending in self.tracks:
            self.music_ch.stop()
            self.music_ch.play(self.tracks[self.pending], loops=-1)
            self.pending = None
            self.apply_volume()

    def stop_music(self):
        if self.ok:
            self.music_ch.stop()
        self.current = None
        self.pending = None

    def apply_volume(self):
        if not self.ok:
            return
        v = 0.0 if self.settings.get("muted") else self.settings.get("music", 0.5) * 0.6
        self.music_ch.set_volume(v)

    def update(self):
        if self.ok and self.pending:
            self._try_start()
