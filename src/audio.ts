/* Procedural chiptune SFX + music. No audio files needed.
 * Same synth as the Python version: square/pulse/triangle/sine/noise voices
 * rendered into sample buffers, then handed to Phaser's sound system.
 */
import { Random } from "./pg";

const SR = 22050;

const NOTE_INDEX: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

export function midi(name: string): number {
  const n = name.slice(0, -1), octv = parseInt(name.slice(-1), 10);
  return 12 * (octv + 1) + NOTE_INDEX[n];
}

export function mfreq(m: number): number {
  return 440.0 * Math.pow(2, (m - 69) / 12.0);
}

export class Synth {
  sr: number;
  rng: Random;
  constructor(sr: number) {
    this.sr = sr;
    this.rng = new Random(3);
  }

  buf(seconds: number): Float32Array {
    return new Float32Array(Math.trunc(seconds * this.sr + 1));
  }

  note(b: Float32Array, start: number, dur: number, freq: number, wave = "sq", vol = 0.3,
       slide: number | null = null, attack = 0.004, decay_pow = 0.7) {
    const sr = this.sr;
    let n = Math.trunc(dur * sr);
    const s0 = Math.trunc(start * sr);
    if (s0 + n >= b.length) n = b.length - s0 - 1;
    if (n <= 0) return;
    const att = Math.max(1, Math.trunc(attack * sr));
    let phase = 0.0;
    let noise_v = 0.0;
    for (let i = 0; i < n; i++) {
      const f = slide == null ? freq : freq + (slide - freq) * (i / n);
      phase += f / sr;
      const ph = phase - Math.trunc(phase);
      let v: number;
      if (wave === "sq") v = ph < 0.5 ? 1.0 : -1.0;
      else if (wave === "pulse") v = ph < 0.25 ? 1.0 : -1.0;
      else if (wave === "tri") v = 4.0 * Math.abs(ph - 0.5) - 1.0;
      else if (wave === "sine") v = Math.sin(ph * 6.2832);
      else {
        // noise (sample & hold)
        if (i % 3 === 0) noise_v = this.rng.random() * 2 - 1;
        v = noise_v;
      }
      const env = (i < att ? i / att : 1.0) * Math.pow(1.0 - i / n, decay_pow);
      b[s0 + i] += v * vol * env;
    }
  }
}

type Notes = [string | null, number][];

export class Audio {
  settings: any;
  ok = false;
  phaser: any;
  ctx: AudioContext | null = null;
  sounds: Record<string, string> = {}; // name -> phaser cache key
  tracks: Record<string, string> = {};
  current: string | null = null;
  pending: string | null = null;
  music_snd: any = null;
  synth: Synth;

  constructor(settings: any, phaser: any) {
    this.settings = settings;
    this.phaser = phaser;
    this.synth = new Synth(SR);
    try {
      const sm = phaser && phaser.sound;
      this.ctx = sm && sm.context ? sm.context : null;
      if (!this.ctx) {
        console.warn("Audio disabled: Web Audio not available");
        return;
      }
      this._build_sfx();
      this.ok = true;
      // music takes a moment to synthesize: do it after the first frames render
      setTimeout(() => this._build_music(), 30);
    } catch (e) {
      console.warn("Audio disabled:", e);
      this.ok = false;
    }
  }

  // ------------------------------------------------------------ helpers
  _to_sound(key: string, b: Float32Array): string {
    const ctx = this.ctx!;
    const ab = ctx.createBuffer(1, b.length, SR);
    const ch = ab.getChannelData(0);
    for (let i = 0; i < b.length; i++) ch[i] = Math.max(-1.0, Math.min(1.0, b[i])) * (30000 / 32768);
    const ck = "zpc_" + key;
    this.phaser.cache.audio.add(ck, ab);
    return ck;
  }

  _build_sfx() {
    const S = this.synth;
    const mk = (name: string, length: number, fn: (b: Float32Array) => void) => {
      const b = S.buf(length);
      fn(b);
      this.sounds[name] = this._to_sound("sfx_" + name, b);
    };
    mk("blip", 0.06, (b) => S.note(b, 0, 0.05, 880, "sq", 0.18));
    mk("select", 0.12, (b) => { S.note(b, 0, 0.04, 660, "sq", 0.18); S.note(b, 0.05, 0.06, 990, "sq", 0.18); });
    mk("coin", 0.22, (b) => { S.note(b, 0, 0.06, 988, "sq", 0.2); S.note(b, 0.06, 0.15, 1319, "sq", 0.2); });
    mk("sparkle", 0.3, (b) => [1047, 1319, 1568, 2093].forEach((f, i) => S.note(b, i * 0.05, 0.08, f, "tri", 0.3)));
    mk("error", 0.22, (b) => S.note(b, 0, 0.2, 220, "sq", 0.18, 140));
    mk("pop", 0.08, (b) => S.note(b, 0, 0.07, 500, "sine", 0.4, 1300));
    mk("shot", 0.18, (b) => { S.note(b, 0, 0.1, 0, "noise", 0.15); S.note(b, 0.08, 0.08, 1200, "tri", 0.25); });
    mk("splash", 0.3, (b) => S.note(b, 0, 0.28, 0, "noise", 0.2, null, 0.004, 1.5));
    mk("scrub", 0.08, (b) => S.note(b, 0, 0.07, 0, "noise", 0.08, null, 0.004, 1.2));
    mk("heart", 0.2, (b) => { S.note(b, 0, 0.08, 784, "tri", 0.35); S.note(b, 0.08, 0.1, 1175, "tri", 0.35); });
    mk("chime", 0.8, (b) => [523, 659, 784, 1047, 1319].forEach((f, i) => S.note(b, i * 0.1, 0.4, f, "tri", 0.3)));
    mk("door", 0.15, (b) => S.note(b, 0, 0.12, 330, "sq", 0.15, 220));
    mk("sad", 0.5, (b) => { S.note(b, 0, 0.22, 392, "tri", 0.3); S.note(b, 0.22, 0.28, 311, "tri", 0.3); });
    mk("tick", 0.03, (b) => S.note(b, 0, 0.02, 1400, "sq", 0.06));
    mk("whoosh", 0.15, (b) => S.note(b, 0, 0.14, 0, "noise", 0.12, null, 0.004, 0.5));
    mk("hiss", 0.3, (b) => S.note(b, 0, 0.28, 0, "noise", 0.18, null, 0.004, 0.3));
    mk("pour", 0.1, (b) => S.note(b, 0, 0.09, 300, "tri", 0.15, 380));
    mk("wrap", 0.1, (b) => S.note(b, 0, 0.08, 500, "sq", 0.12, 700));
    mk("buy", 0.35, (b) => [784, 988, 1175, 1568].forEach((f, i) => S.note(b, i * 0.06, 0.1, f, "sq", 0.18)));
    mk("star", 0.18, (b) => S.note(b, 0, 0.16, 1568, "tri", 0.3, 2093));
  }

  _song(bpm: number, melody: Notes, bass: Notes, hats = true, mel_wave = "tri", bass_wave = "pulse"): Float32Array {
    const S = this.synth;
    const eighth = 60.0 / bpm / 2;
    let total = 0;
    for (const [, l] of melody) total += l;
    total *= eighth;
    const b = S.buf(total + 0.05);
    let t = 0.0;
    for (const [n, l] of melody) {
      if (n) S.note(b, t, l * eighth * 0.95, mfreq(midi(n)), mel_wave, 0.22, null, 0.004, 0.4);
      t += l * eighth;
    }
    t = 0.0;
    for (const [n, l] of bass) {
      if (n) S.note(b, t, l * eighth * 0.85, mfreq(midi(n)), bass_wave, 0.09, null, 0.004, 0.8);
      t += l * eighth;
    }
    if (hats) {
      const steps = Math.trunc(total / eighth);
      for (let i = 0; i < steps; i++) S.note(b, i * eighth, 0.03, 0, "noise", i % 2 ? 0.05 : 0.08, null, 0.004, 2);
    }
    return b;
  }

  _build_music() {
    try {
      const town_mel: Notes = [["E5", 2], ["G5", 2], ["C6", 2], ["G5", 2], ["A5", 3], ["G5", 1], ["E5", 2], ["C5", 2],
        ["F5", 2], ["A5", 2], ["C6", 2], ["A5", 2], ["G5", 4], ["D5", 2], ["B4", 2],
        ["E5", 2], ["G5", 2], ["E5", 1], ["D5", 1], ["C5", 2], ["A4", 2], ["C5", 2], ["E5", 4],
        ["F5", 2], ["E5", 2], ["D5", 2], ["C5", 2], ["D5", 4], ["G4", 2], ["B4", 2]];
      const roots = ["C3", "A2", "F2", "G2", "C3", "A2", "F2", "G2"];
      const fifths: Record<string, string> = { C3: "G3", A2: "E3", F2: "C3", G2: "D3" };
      const town_bass: Notes = [];
      for (const r of roots) town_bass.push([r, 2], [fifths[r], 2], [r, 2], [fifths[r], 2]);
      this.tracks.town = this._to_sound("music_town", this._song(108, town_mel, town_bass));

      const clinic_mel: Notes = [["A4", 1], ["C5", 1], ["F5", 2], ["E5", 1], ["F5", 1], ["G5", 2],
        ["A5", 2], ["F5", 2], ["D5", 2], ["F5", 2],
        ["Bb4", 1], ["D5", 1], ["F5", 2], ["A5", 2], ["G5", 2],
        ["G5", 2], ["E5", 2], ["C5", 2], ["E5", 2],
        ["F5", 1], ["F5", 1], ["A5", 2], ["C6", 2], ["A5", 2],
        ["D5", 2], ["F5", 2], ["A5", 3], ["G5", 1],
        ["Bb5", 2], ["A5", 2], ["G5", 2], ["F5", 2],
        ["E5", 2], ["G5", 2], ["F5", 4]];
      const croots = ["F2", "D2", "Bb2", "C3", "F2", "D2", "Bb2", "C3"];
      const cf: Record<string, string> = { F2: "C3", D2: "A2", Bb2: "F3", C3: "G3" };
      const cb: Notes = [];
      for (const r of croots) cb.push([r, 1], [null, 1], [cf[r], 1], [r, 1], [r, 1], [null, 1], [cf[r], 2]);
      this.tracks.clinic = this._to_sound("music_clinic", this._song(140, clinic_mel, cb, true, "sq"));

      const title_mel: Notes = [["C5", 2], ["E5", 2], ["G5", 4], ["A5", 2], ["G5", 2], ["E5", 4],
        ["F5", 2], ["E5", 2], ["D5", 4], ["G4", 4], ["B4", 4],
        ["C5", 2], ["E5", 2], ["G5", 4], ["C6", 2], ["B5", 2], ["A5", 4],
        ["G5", 2], ["F5", 2], ["D5", 4], ["C5", 8]];
      const tb: Notes = [];
      for (const r of ["C3", "C3", "F2", "G2", "C3", "A2", "F2", "C3"]) tb.push([r, 4], [r, 4]);
      this.tracks.title = this._to_sound("music_title", this._song(96, title_mel, tb, false));
    } catch (e) {
      console.warn("Music generation failed:", e);
    }
  }

  // ------------------------------------------------------------ API
  play(name: string, vol = 1.0) {
    if (!this.ok || this.settings.muted) return;
    const key = this.sounds[name];
    if (!key || this.phaser.sound.locked) return;
    const v = Math.max(0.0, Math.min(1.0, (this.settings.sfx ?? 0.7) * vol));
    try {
      this.phaser.sound.play(key, { volume: v });
    } catch {
      /* ignore */
    }
  }

  music(name: string) {
    if (!this.ok) return;
    if (name === this.current) return;
    this.current = name;
    this.pending = name;
    this._try_start();
  }

  _try_start() {
    if (!this.pending || !(this.pending in this.tracks)) return;
    if (this.phaser.sound.locked) return; // waits for the first click/key press
    if (this.music_snd) {
      this.music_snd.stop();
      this.music_snd.destroy();
    }
    this.music_snd = this.phaser.sound.add(this.tracks[this.pending], { loop: true });
    this.music_snd.play();
    this.pending = null;
    this.apply_volume();
  }

  stop_music() {
    if (this.ok && this.music_snd) this.music_snd.stop();
    this.current = null;
    this.pending = null;
  }

  apply_volume() {
    if (!this.ok || !this.music_snd) return;
    const v = this.settings.muted ? 0.0 : (this.settings.music ?? 0.5) * 0.6;
    this.music_snd.setVolume(v);
  }

  update() {
    if (this.ok && this.pending) this._try_start();
  }
}
