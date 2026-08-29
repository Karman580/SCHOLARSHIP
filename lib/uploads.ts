export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 3;

const MAGIC: { mime: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    mime: 'image/webp',
    test: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

export type UploadCheck =
  | { ok: true; mime: string; dataUrl: string }
  | { ok: false; code: 'UPLOAD_TOO_LARGE' | 'UPLOAD_UNSUPPORTED' };

/**
 * Images are held in memory for the life of the request. Never written to disk,
 * object storage, logs or the database. There is no file storage in this app.
 */
export async function checkImage(file: File): Promise<UploadCheck> {
  if (file.size > MAX_FILE_BYTES) return { ok: false, code: 'UPLOAD_TOO_LARGE' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hit = MAGIC.find((m) => m.test(bytes));
  if (!hit) return { ok: false, code: 'UPLOAD_UNSUPPORTED' };
  const base64 = Buffer.from(bytes).toString('base64');
  return { ok: true, mime: hit.mime, dataUrl: `data:${hit.mime};base64,${base64}` };
}
