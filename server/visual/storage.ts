import fs from 'fs';
import path from 'path';
import { parseDataUrl } from './novelty.js';

const IMAGE_DIR = path.join(process.cwd(), 'data', 'generated-images');

function ensureDir() {
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }
}

export function persistImageDataUrl(id: string, dataUrl: string): string | null {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  ensureDir();
  const ext = parsed.mimeType.includes('jpeg') || parsed.mimeType.includes('jpg') ? 'jpg' : 'png';
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(IMAGE_DIR, filename), parsed.buffer);
  return `/api/media/generated/${filename}`;
}

export function resolveGeneratedImagePath(filename: string): string | null {
  const safe = path.basename(filename);
  const full = path.join(IMAGE_DIR, safe);
  if (fs.existsSync(full)) return full;
  return null;
}
