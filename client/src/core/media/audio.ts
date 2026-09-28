let context: AudioContext | null = null;

/** Single AudioContext of the page (takes playback, level meter). */
export function audioContext(): AudioContext {
  context ??= new AudioContext();
  return context;
}

/** To call from a click: browsers only let an AudioContext run after a user gesture. */
export function resumeAudio(): Promise<void> {
  return audioContext().state === 'suspended' ? audioContext().resume() : Promise.resolve();
}
