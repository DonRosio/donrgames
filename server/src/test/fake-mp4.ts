/** Builds a minimal MP4: ftyp + moov(mvhd + trak/mdia/minf/stbl/stsd for each codec). */
export function fakeMp4(durationMs: number, codecs = ['avc1', 'mp4a']): Buffer {
  const box = (name: string, ...parts: Buffer[]) => {
    const body = Buffer.concat(parts);
    const header = Buffer.alloc(8);
    header.writeUInt32BE(8 + body.length);
    header.write(name, 4, 'latin1');
    return Buffer.concat([header, body]);
  };
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(1000, 12); // timescale
  mvhd.writeUInt32BE(durationMs, 16); // duration
  const trak = (codec: string) => {
    const stsd = Buffer.alloc(16);
    stsd.writeUInt32BE(1, 4);
    stsd.writeUInt32BE(8, 8);
    stsd.write(codec, 12, 'latin1');
    return box('trak', box('mdia', box('minf', box('stbl', box('stsd', stsd)))));
  };
  return Buffer.concat([
    box('ftyp', Buffer.from('isom0000isomavc1', 'latin1')),
    box('moov', box('mvhd', mvhd), ...codecs.map(trak)),
    box('mdat', Buffer.alloc(16)),
  ]);
}
