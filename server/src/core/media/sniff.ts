/** File types accepted for uploads (recordings, pictures), identified by their magic bytes. */
export type SniffedMime = 'audio/webm' | 'audio/ogg' | 'audio/mp4' | 'image/png';

/**
 * Largest side of an accepted picture. A small PNG can declare huge dimensions (a
 * "decompression bomb") and exhaust the memory of the browsers that decode it.
 */
export const MAX_IMAGE_SIDE = 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A PNG whose first chunk is a well-formed IHDR with reasonable dimensions. */
function isAcceptablePng(data: Uint8Array): boolean {
  if (data.length < 24 || !PNG_SIGNATURE.every((byte, index) => data[index] === byte)) {
    return false;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const ihdr = String.fromCharCode(...data.subarray(12, 16));
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return (
    view.getUint32(8) === 13 &&
    ihdr === 'IHDR' &&
    width > 0 &&
    height > 0 &&
    width <= MAX_IMAGE_SIDE &&
    height <= MAX_IMAGE_SIDE
  );
}

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
  if (isAcceptablePng(data)) return 'image/png';
  const ascii = (start: number, end: number) => String.fromCharCode(...data.subarray(start, end));
  if (data.length >= 4 && ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (data.length >= 8 && ascii(4, 8) === 'ftyp') return 'audio/mp4';
  return null;
}
