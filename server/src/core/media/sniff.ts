/** File types accepted for uploads (recordings, pictures), identified by their magic bytes. */
export type SniffedMime = 'audio/webm' | 'audio/ogg' | 'audio/mp4' | 'image/png';

/** Real type of an uploaded file, whatever its declared Content-Type says. */
export function sniffMime(data: Uint8Array): SniffedMime | null {
  if (
    data.length >= 4 &&
    data[0] === 0x1a &&
    data[1] === 0x45 &&
    data[2] === 0xdf &&
    data[3] === 0xa3
  ) {
    return 'audio/webm';
  }
  if (
    data.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => data[index] === byte)
  ) {
    return 'image/png';
  }
  const ascii = (start: number, end: number) => String.fromCharCode(...data.subarray(start, end));
  if (data.length >= 4 && ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (data.length >= 8 && ascii(4, 8) === 'ftyp') return 'audio/mp4';
  return null;
}
