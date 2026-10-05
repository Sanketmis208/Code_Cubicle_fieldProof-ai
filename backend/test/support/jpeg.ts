/**
 * Builds a small JPEG whose APP1 segment carries real EXIF (camera, time,
 * offset, GPS, software), so tests exercise the same parser as production
 * without binary fixtures in the repository.
 */
type Entry = { tag: number; type: 2 | 4 | 5; count: number; data: Buffer };

const ascii = (tag: number, value: string): Entry => {
  const data = Buffer.from(`${value}\0`, 'latin1');
  return { tag, type: 2, count: data.length, data };
};
const long = (tag: number, value: number): Entry => {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(value);
  return { tag, type: 4, count: 1, data };
};
const rationals = (tag: number, pairs: Array<[number, number]>): Entry => {
  const data = Buffer.alloc(8 * pairs.length);
  pairs.forEach(([numerator, denominator], index) => {
    data.writeUInt32LE(numerator, index * 8);
    data.writeUInt32LE(denominator, index * 8 + 4);
  });
  return { tag, type: 5, count: pairs.length, data };
};

const ifdSize = (entries: Entry[]) => 2 + entries.length * 12 + 4;

/** Serializes one IFD that starts at absolute TIFF offset `offset`. */
function writeIfd(entries: Entry[], offset: number) {
  const sorted = [...entries].sort((a, b) => a.tag - b.tag);
  const header = Buffer.alloc(ifdSize(sorted));
  header.writeUInt16LE(sorted.length, 0);
  let dataOffset = offset + header.length;
  const blobs: Buffer[] = [];
  sorted.forEach((entry, index) => {
    const position = 2 + index * 12;
    header.writeUInt16LE(entry.tag, position);
    header.writeUInt16LE(entry.type, position + 2);
    header.writeUInt32LE(entry.count, position + 4);
    if (entry.data.length <= 4) entry.data.copy(header, position + 8);
    else {
      header.writeUInt32LE(dataOffset, position + 8);
      const padded = entry.data.length % 2 ? Buffer.concat([entry.data, Buffer.alloc(1)]) : entry.data;
      blobs.push(padded);
      dataOffset += padded.length;
    }
  });
  return Buffer.concat([header, ...blobs]);
}

function dms(value: number): Array<[number, number]> {
  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minutes = Math.floor((abs - degrees) * 60);
  const seconds = Math.round(((abs - degrees) * 60 - minutes) * 60 * 100);
  return [[degrees, 1], [minutes, 1], [seconds, 100]];
}

export type JpegExif = {
  make?: string;
  model?: string;
  software?: string;
  /** "YYYY:MM:DD HH:MM:SS" */
  dateTimeOriginal?: string;
  offset?: string;
  latitude?: number;
  longitude?: number;
  /** Makes otherwise identical files hash differently. */
  seed?: string;
};

export function jpegWithExif(options: JpegExif = {}) {
  const exifEntries: Entry[] = [];
  if (options.dateTimeOriginal) exifEntries.push(ascii(0x9003, options.dateTimeOriginal));
  if (options.offset) exifEntries.push(ascii(0x9011, options.offset));
  const gpsEntries: Entry[] = [];
  if (options.latitude !== undefined && options.longitude !== undefined) {
    gpsEntries.push(ascii(0x0001, options.latitude >= 0 ? 'N' : 'S'), rationals(0x0002, dms(options.latitude)));
    gpsEntries.push(ascii(0x0003, options.longitude >= 0 ? 'E' : 'W'), rationals(0x0004, dms(options.longitude)));
  }
  const ifd0: Entry[] = [];
  if (options.make) ifd0.push(ascii(0x010f, options.make));
  if (options.model) ifd0.push(ascii(0x0110, options.model));
  if (options.software) ifd0.push(ascii(0x0131, options.software));
  // Pointer values are patched after sizes are known; sizes do not depend on them.
  if (exifEntries.length) ifd0.push(long(0x8769, 0));
  if (gpsEntries.length) ifd0.push(long(0x8825, 0));

  const ifd0Offset = 8;
  const ifd0Length = writeIfd(ifd0, ifd0Offset).length;
  const exifOffset = ifd0Offset + ifd0Length;
  const exifBlock = exifEntries.length ? writeIfd(exifEntries, exifOffset) : Buffer.alloc(0);
  const gpsOffset = exifOffset + exifBlock.length;
  const gpsBlock = gpsEntries.length ? writeIfd(gpsEntries, gpsOffset) : Buffer.alloc(0);
  for (const entry of ifd0) {
    if (entry.tag === 0x8769) entry.data.writeUInt32LE(exifOffset);
    if (entry.tag === 0x8825) entry.data.writeUInt32LE(gpsOffset);
  }
  const tiff = Buffer.concat([
    Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]),
    writeIfd(ifd0, ifd0Offset),
    exifBlock,
    gpsBlock,
  ]);
  const app1Body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([(app1Body.length + 2) >> 8, (app1Body.length + 2) & 0xff]), app1Body]);
  const comment = Buffer.from(options.seed ?? `${Math.random()}`, 'latin1');
  const com = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from([(comment.length + 2) >> 8, (comment.length + 2) & 0xff]), comment]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, com, Buffer.from([0xff, 0xd9])]);
}

export function jpegFile(name: string, options: JpegExif = {}) {
  return new File([jpegWithExif(options)], name, { type: 'image/jpeg' });
}
