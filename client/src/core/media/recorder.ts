import { audioContext } from './audio.ts';

/** Container formats by order of preference (Chrome and Brave produce WebM/Opus). */
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];

export function supportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export type MicrophoneError = 'denied' | 'unavailable' | 'unsupported';

/** Opens the microphone chosen in the browser settings. */
export async function openMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia || !supportedMimeType()) {
    throw new MicrophoneFailure('unsupported');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (error) {
    const name = (error as DOMException).name;
    throw new MicrophoneFailure(
      name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable',
    );
  }
}

export class MicrophoneFailure extends Error {
  readonly reason: MicrophoneError;

  constructor(reason: MicrophoneError) {
    super(reason);
    this.reason = reason;
  }
}

/** Stops the microphone: the browser's recording indicator goes off. */
export function closeMicrophone(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

export interface RecordedTake {
  blob: Blob;
  /** Container type without codec parameters, as expected by the server. */
  mime: string;
  /** Position in the recording at which the first video frame was shown (may be negative). */
  offsetMs: number;
  durationMs: number;
}

/** Instant (performance.now() time base) at which the first frame of `video` is shown. */
function firstFrameTime(video: HTMLVideoElement): Promise<number> {
  return new Promise((resolve) => {
    if ('requestVideoFrameCallback' in video) {
      video.requestVideoFrameCallback((now, metadata) => resolve(metadata.presentationTime ?? now));
    } else {
      (video as HTMLVideoElement).addEventListener('playing', () => resolve(performance.now()), {
        once: true,
      });
    }
  });
}

/**
 * Records the microphone while the video plays muted from the start, and stops at its end.
 * The gap between the start of the recorder and the first video frame is measured, so that the
 * take can be played back in sync with the video.
 */
export async function recordOverVideo(
  video: HTMLVideoElement,
  stream: MediaStream,
  signal: AbortSignal,
): Promise<RecordedTake> {
  const mimeType = supportedMimeType()!;
  const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 96_000 });
  const chunks: Blob[] = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  const started = new Promise<number>((resolve) =>
    recorder.addEventListener('start', () => resolve(performance.now()), { once: true }),
  );
  const stopped = new Promise<void>((resolve) =>
    recorder.addEventListener('stop', () => resolve(), { once: true }),
  );

  video.pause();
  video.muted = true;
  video.currentTime = 0;
  recorder.start();
  const recorderStart = await started;
  const frame = firstFrameTime(video);
  await video.play();
  const videoStart = await frame;

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      video.pause();
      reject(new DOMException('Recording cancelled', 'AbortError'));
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    video.addEventListener('ended', () => resolve(), { once: true });
  }).finally(() => {
    if (recorder.state !== 'inactive') recorder.stop();
  });
  await stopped;

  const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
  return {
    blob,
    mime: (recorder.mimeType || mimeType).split(';')[0]!,
    offsetMs: Math.max(-1000, Math.min(2000, Math.round(videoStart - recorderStart))),
    durationMs: Math.round(performance.now() - recorderStart),
  };
}

/**
 * Plays a take over the muted video, aligned so that the first video frame matches `offsetMs`
 * in the recording. The Web Audio clock gives a sample-accurate start.
 */
export async function playTakeOverVideo(
  video: HTMLVideoElement,
  take: Blob,
  offsetMs: number,
): Promise<{ stop(): void; ended: Promise<void> }> {
  const context = audioContext();
  const buffer = await context.decodeAudioData(await take.arrayBuffer());
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);

  video.pause();
  video.muted = true;
  video.currentTime = 0;
  const frame = firstFrameTime(video);
  await video.play();
  await frame;
  const offset = offsetMs / 1000;
  if (offset >= 0) source.start(context.currentTime, offset);
  else source.start(context.currentTime - offset);

  let finish = () => {};
  const ended = new Promise<void>((resolve) => {
    finish = resolve;
    video.addEventListener('ended', () => resolve(), { once: true });
  });
  return {
    ended,
    stop() {
      finish();
      video.pause();
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    },
  };
}

/** Live microphone level (0 to 1) and loudest level since the last reset. */
export function monitorLevel(stream: MediaStream): {
  level(): number;
  peak(): number;
  resetPeak(): void;
  stop(): void;
} {
  const context = audioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let peak = 0;
  const level = () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    // RMS scaled so that normal speech reaches roughly the middle of the meter.
    const value = Math.min(1, Math.sqrt(sum / samples.length) * 4);
    peak = Math.max(peak, value);
    return value;
  };
  return {
    level,
    peak: () => peak,
    resetPeak: () => {
      peak = 0;
    },
    stop: () => source.disconnect(),
  };
}
