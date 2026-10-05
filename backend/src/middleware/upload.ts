import multer from 'multer';
import { AppError } from '../utils/app-error.js';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm']);

export function assertMediaSignature(file: Express.Multer.File) {
  const bytes = file.buffer;
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString('ascii');
  const matches =
    (file.mimetype === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (file.mimetype === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
    (file.mimetype === 'image/webp' && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') ||
    (['image/heic', 'image/heif', 'video/mp4', 'video/quicktime'].includes(file.mimetype) && ascii(4, 8) === 'ftyp') ||
    (file.mimetype === 'video/webm' && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])));
  if (!matches) throw new AppError(415, `${file.originalname} does not match its declared media type`);
}

const media = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) return callback(new AppError(415, `Unsupported media type: ${file.mimetype}`));
    callback(null, true);
  },
});

export const uploadMedia = media.array('files', 10);
/** Live capture sends one file per request, so a retry never re-sends a batch. */
export const uploadMediaSingle = media.array('file', 1);
