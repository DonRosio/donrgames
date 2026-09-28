/** What the server needs to know about a video, read from its MP4 header (no ffmpeg). */
export interface Mp4Info {
  durationMs: number;
  /** Sample entry types of the tracks, e.g. ['avc1', 'mp4a']. */
  codecs: string[];
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

/** Parses the boxes of an MP4 file. Throws on anything that does not look like a valid MP4. */
export function probeMp4(data: Uint8Array): Mp4Info {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const info: { durationMs: number | null; codecs: string[]; hasFtyp: boolean } = {
    durationMs: null,
    codecs: [],
    hasFtyp: false,
  };
  walk(view, 0, data.byteLength, info, 0);
  if (!info.hasFtyp) throw new Error('not an MP4 file (no ftyp box)');
  if (info.durationMs === null) throw new Error('no duration found (no mvhd box)');
  return { durationMs: info.durationMs, codecs: info.codecs };
}

function type(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function walk(
  view: DataView,
  start: number,
  end: number,
  info: { durationMs: number | null; codecs: string[]; hasFtyp: boolean },
  depth: number,
): void {
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    const boxType = type(view, offset + 4);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) throw new Error('truncated box');
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) throw new Error(`invalid size for box ${boxType}`);
    const body = offset + header;

    if (depth === 0 && boxType === 'ftyp') info.hasFtyp = true;
    if (boxType === 'mvhd') {
      const version = view.getUint8(body);
      const timescale = view.getUint32(body + (version === 1 ? 20 : 12));
      const duration =
        version === 1 ? Number(view.getBigUint64(body + 24)) : view.getUint32(body + 16);
      if (timescale === 0) throw new Error('invalid timescale');
      info.durationMs = Math.round((duration / timescale) * 1000);
    }
    if (boxType === 'stsd' && body + 16 <= end) info.codecs.push(type(view, body + 12));
    if (CONTAINERS.has(boxType)) walk(view, body, offset + size, info, depth + 1);
    offset += size;
  }
}
