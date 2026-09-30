import { audioContext } from './audio.ts';

/**
 * Plays a short two-tone alarm (about 2.4 s), generated on the fly: no audio file. Scheduled on
 * the audio clock, so it plays in full even when the tab is in the background. The page must have
 * had a click first (see resumeAudio()), otherwise browsers keep the audio context suspended.
 */
export function playAlarm(volume = 0.25): void {
  const context = audioContext();
  const start = context.currentTime + 0.05;
  const output = context.createGain();
  output.gain.value = volume;
  output.connect(context.destination);

  const beeps = 6;
  const beep = 0.32;
  const gap = 0.08;
  for (let i = 0; i < beeps; i++) {
    const at = start + i * (beep + gap);
    const oscillator = context.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.value = i % 2 === 0 ? 880 : 660;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(1, at + 0.02);
    envelope.gain.setValueAtTime(1, at + beep - 0.04);
    envelope.gain.linearRampToValueAtTime(0, at + beep);
    oscillator.connect(envelope).connect(output);
    oscillator.start(at);
    oscillator.stop(at + beep);
  }
  setTimeout(() => output.disconnect(), (beeps * (beep + gap) + 0.5) * 1000);
}
