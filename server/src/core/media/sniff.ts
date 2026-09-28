/** Audio containers accepted for recordings, identified by their magic bytes. */
export type AudioContainer = 'audio/webm' | 'audio/ogg' | 'audio/mp4';

/** Real type of an uploaded file, whatever its declared Content-Type says. */
export function sniffAudio(data: Uint8Array): AudioContainer | null {
  if (
    data.length >= 4 &&
    data[0] === 0x1a &&
    data[1] === 0x45 &&
    data[2] === 0xdf &&
    data[3] === 0xa3
  ) {
    return 'audio/webm';
  }
  const ascii = (start: number, end: number) => String.fromCharCode(...data.subarray(start, end));
  if (data.length >= 4 && ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (data.length >= 8 && ascii(4, 8) === 'ftyp') return 'audio/mp4';
  return null;
}
