import { useSyncExternalStore } from 'react';
import type { SimonColor } from '@mini-jeux/shared/games/defusal-data';
import { audioContext } from '../../core/media/audio.ts';
import type { BombSound, TickKind } from './sound-events.ts';

// All the sounds of the game are made here, on the fly: no audio file, no third party. They are
// scheduled on the audio clock. The page must have had a click first (the briefing's "Je suis
// prêt" button calls resumeAudio()); until then the audio context is suspended and nothing plays.

const STORAGE_KEY = 'mini-jeux:defusal-sound';
const MASTER = 0.22;

// Whether the player wants the sound: a convenience kept in this browser only.
const listeners = new Set<() => void>();
let enabled = (() => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
})();

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Private window or blocked storage: the choice only lasts for this page.
  }
  for (const listener of listeners) listener();
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => enabled,
  );
}

/** The audio context, when sound is wanted and the browser lets it run; null otherwise. */
function ready(): AudioContext | null {
  if (!enabled) return null;
  try {
    const context = audioContext();
    return context.state === 'running' ? context : null;
  } catch {
    return null;
  }
}

interface Tone {
  frequency: number;
  /** Seconds after now. */
  at?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  /** Frequency reached at the end, for a slide. */
  to?: number;
}

function play(context: AudioContext, tones: readonly Tone[], volume = 1): void {
  const output = context.createGain();
  output.gain.value = MASTER * volume;
  output.connect(context.destination);
  let end = 0;
  for (const tone of tones) {
    const start = context.currentTime + 0.02 + (tone.at ?? 0);
    const stop = start + tone.duration;
    end = Math.max(end, (tone.at ?? 0) + tone.duration);
    const oscillator = context.createOscillator();
    oscillator.type = tone.type ?? 'sine';
    oscillator.frequency.setValueAtTime(tone.frequency, start);
    if (tone.to) oscillator.frequency.exponentialRampToValueAtTime(tone.to, stop);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(tone.gain ?? 1, start + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, stop);
    oscillator.connect(envelope).connect(output);
    oscillator.start(start);
    oscillator.stop(stop + 0.02);
  }
  window.setTimeout(() => output.disconnect(), (end + 0.5) * 1000);
}

/** White noise through a filter that closes: the roar of the explosion. */
function playRoar(context: AudioContext, seconds: number): void {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  const start = context.currentTime + 0.02;
  filter.frequency.setValueAtTime(3200, start);
  filter.frequency.exponentialRampToValueAtTime(90, start + seconds);
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(1, start);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
  const output = context.createGain();
  output.gain.value = MASTER * 2.2;
  source.connect(filter).connect(envelope).connect(output).connect(context.destination);
  source.start(start);
  window.setTimeout(() => output.disconnect(), (seconds + 0.5) * 1000);
}

const TICK: Record<TickKind, { frequency: number; gain: number }> = {
  normal: { frequency: 900, gain: 0.35 },
  fast: { frequency: 1250, gain: 0.5 },
  urgent: { frequency: 1800, gain: 0.7 },
};

/** The clock, once a second. */
export function playTick(kind: TickKind): void {
  const context = ready();
  if (!context) return;
  const { frequency, gain } = TICK[kind];
  play(context, [{ frequency, duration: 0.045, type: 'square', gain }]);
}

/** An error: a harsh, low buzz that falls. */
export function playStrike(): void {
  const context = ready();
  if (!context) return;
  play(context, [
    { frequency: 190, to: 110, duration: 0.5, type: 'sawtooth', gain: 0.9 },
    { frequency: 143, to: 80, duration: 0.5, type: 'square', gain: 0.5 },
  ]);
}

/** A module defused: two rising notes. */
export function playSolved(): void {
  const context = ready();
  if (!context) return;
  play(context, [
    { frequency: 784, duration: 0.18, type: 'triangle' },
    { frequency: 1175, at: 0.12, duration: 0.35, type: 'triangle' },
  ]);
}

/** The purge woke up: two sharp beeps, repeated by the caller until it is answered. */
export function playPurgeBeep(): void {
  const context = ready();
  if (!context) return;
  play(context, [
    { frequency: 1000, duration: 0.12, type: 'square', gain: 0.7 },
    { frequency: 1000, at: 0.2, duration: 0.12, type: 'square', gain: 0.7 },
  ]);
}

/** BOUM: a low drop and a roar. */
export function playExplosion(): void {
  const context = ready();
  if (!context) return;
  play(context, [{ frequency: 140, to: 28, duration: 1.4, type: 'sine', gain: 1.4 }]);
  playRoar(context, 1.6);
}

/** The bomb is defused: a short rising arpeggio. */
export function playDefused(): void {
  const context = ready();
  if (!context) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  play(
    context,
    notes.map((frequency, i) => ({
      frequency,
      at: i * 0.12,
      duration: i === 3 ? 0.7 : 0.25,
      type: 'triangle',
    })),
  );
}

/** Each colour of the colours module has its own note. */
const SIMON_NOTES: Record<SimonColor, number> = { red: 262, blue: 330, green: 392, yellow: 523 };

export function playSimon(color: SimonColor): void {
  const context = ready();
  if (!context) return;
  play(context, [{ frequency: SIMON_NOTES[color], duration: 0.4, type: 'triangle', gain: 0.9 }]);
}

/** The sound that goes with something heard about the bomb. */
export function playBomb(sound: BombSound): void {
  if (sound === 'strike') playStrike();
  else if (sound === 'solved') playSolved();
  else playPurgeBeep();
}
