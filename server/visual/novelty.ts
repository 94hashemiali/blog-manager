import crypto from 'crypto';
import zlib from 'zlib';
import type { CompositionFingerprint, NoveltyEvaluation } from './types.js';

export function computeSha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

export function hammingDistance(h1: string, h2: string): number {
  const a = h1 || '';
  const b = h2 || '';
  let diff = 0;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) diff++;
  }
  return diff;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePngToGrayThumb(buffer: Buffer, size = 8): number[] | null {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end > buffer.length) break;
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(start);
      height = buffer.readUInt32BE(start + 4);
      bitDepth = buffer[start + 8];
      colorType = buffer[start + 9];
      const interlace = buffer[start + 12];
      if (interlace !== 0 || bitDepth !== 8 || width > 4096 || height > 4096) return null;
    } else if (type === 'IDAT') {
      idat.push(buffer.subarray(start, end));
    } else if (type === 'IEND') {
      break;
    }
    offset = end + 4;
  }

  if (!width || !height || idat.length === 0) return null;
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 0 ? 1 : colorType === 4 ? 2 : 0;
  if (!channels) return null;

  let inflated: Buffer;
  try {
    inflated = zlib.inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }

  const stride = width * channels;
  const rows: Buffer[] = [];
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = inflated[pos++];
    const raw = inflated.subarray(pos, pos + stride);
    pos += stride;
    if (raw.length < stride) return null;
    const out = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const x = raw[i];
      const a = i >= channels ? out[i - channels] : 0;
      const b = y > 0 ? rows[y - 1][i] : 0;
      const c = y > 0 && i >= channels ? rows[y - 1][i - channels] : 0;
      let val = 0;
      if (filter === 0) val = x;
      else if (filter === 1) val = x + a;
      else if (filter === 2) val = x + b;
      else if (filter === 3) val = x + Math.floor((a + b) / 2);
      else if (filter === 4) val = x + paeth(a, b, c);
      else return null;
      out[i] = val & 255;
    }
    rows.push(out);
  }

  const thumb: number[] = [];
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      const x = Math.min(width - 1, Math.floor(((tx + 0.5) * width) / size));
      const y = Math.min(height - 1, Math.floor(((ty + 0.5) * height) / size));
      const row = rows[y];
      const i = x * channels;
      let gray = row[i];
      if (channels >= 3) {
        gray = Math.round(0.299 * row[i] + 0.587 * row[i + 1] + 0.114 * row[i + 2]);
      }
      thumb.push(gray);
    }
  }
  return thumb;
}

export function computePerceptualHashFromBytes(buffer: Buffer, mimeType = 'image/png'): string {
  if (mimeType.includes('png') || buffer.toString('ascii', 1, 4) === 'PNG') {
    const thumb = decodePngToGrayThumb(buffer, 8);
    if (thumb) {
      const avg = thumb.reduce((s, n) => s + n, 0) / thumb.length;
      const bits = thumb.map((n) => (n >= avg ? '1' : '0')).join('');
      return BigInt('0b' + bits).toString(16).padStart(16, '0');
    }
  }
  return computeSha256(buffer).slice(0, 16);
}

export function computePerceptualHashFromImage(dataUrlOrHashInput: string): string {
  const parsed = dataUrlOrHashInput.startsWith('data:') ? parseDataUrl(dataUrlOrHashInput) : null;
  if (parsed) {
    return computePerceptualHashFromBytes(parsed.buffer, parsed.mimeType);
  }
  return computeSha256(dataUrlOrHashInput).slice(0, 16);
}

export function environmentClass(environment: string): string {
  const text = (environment || '').toLowerCase();
  if (/forest|جنگل|hyrcanian/.test(text)) return 'forest';
  if (/snow|winter|برف/.test(text)) return 'snow';
  if (/desert|کویر|steppe/.test(text)) return 'arid';
  if (/ridge|alpine|mountain|کوه|alborz|zagros/.test(text)) return 'mountain';
  if (/camp|چادر|tent site/.test(text)) return 'camp';
  if (/trail|path|مسیر/.test(text)) return 'trail';
  return 'outdoor_generic';
}

export function buildFingerprint(input: {
  subject: string;
  strategyId: string;
  camera: string;
  shotType: string;
  environment: string;
  subjectPlacement: string;
  humanPresence: boolean;
  action?: string;
}): CompositionFingerprint {
  return {
    dominantSubject: input.subject,
    visualStrategy: input.strategyId,
    cameraStrategy: input.camera,
    shotType: input.shotType,
    environmentClass: environmentClass(input.environment),
    subjectPlacement: input.subjectPlacement,
    humanPresence: input.humanPresence,
    composition: `${input.strategyId}|${input.subjectPlacement}|${input.camera}`,
    visualHierarchy: input.subject,
    subject: input.subject,
    cameraAngle: input.camera,
    environment: input.environment,
    dominantObjects: [input.subject]
  };
}

export function compositionSimilarity(a: CompositionFingerprint, b: CompositionFingerprint): number {
  if (!a || !b) return 0;
  let score = 0;
  if (a.visualStrategy && a.visualStrategy === b.visualStrategy) score += 28;
  if (a.dominantSubject && normalizeSubject(a.dominantSubject) === normalizeSubject(b.dominantSubject)) score += 28;
  if (a.environmentClass && a.environmentClass === b.environmentClass) score += 18;
  if (a.shotType && a.shotType === b.shotType) score += 10;
  if (a.subjectPlacement && tokenize(a.subjectPlacement) === tokenize(b.subjectPlacement)) score += 10;
  if (a.humanPresence === b.humanPresence) score += 6;
  return Math.min(100, score);
}

function normalizeSubject(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, ' ').trim();
}

function tokenize(value: string): string {
  return normalizeSubject(value).split(' ').slice(0, 6).join(' ');
}

export function buildDifferencePlan(params: {
  previousStrategyId?: string;
  newStrategyId: import('./types.js').VisualStrategyId;
  previousConcept?: { camera?: string; action?: string; environment?: string; composition?: string; lighting?: string; foreground?: string };
  newConcept: { camera?: string; action?: string; environment?: string; composition?: string; lighting?: string; foreground?: string };
  reason: string;
}): import('./types.js').DifferencePlan {
  const changed: string[] = [];
  if (params.previousStrategyId && params.previousStrategyId !== params.newStrategyId) {
    changed.push(`visual strategy ${params.previousStrategyId} → ${params.newStrategyId}`);
  }
  const prev = params.previousConcept || {};
  const next = params.newConcept;
  if (prev.camera !== next.camera) changed.push(`camera ${prev.camera || ''} → ${next.camera || ''}`);
  if (prev.action !== next.action) changed.push(`action ${prev.action || ''} → ${next.action || ''}`);
  if (prev.environment !== next.environment) changed.push(`environment → ${next.environment || ''}`);
  if (prev.composition !== next.composition) changed.push(`composition → ${next.composition || ''}`);
  if (prev.lighting !== next.lighting) changed.push(`lighting → ${next.lighting || ''}`);
  if (prev.foreground !== next.foreground) changed.push(`foreground → ${next.foreground || ''}`);
  while (changed.length < 3) {
    changed.push(['shot scale', 'camera height', 'subject placement', 'weather'][changed.length] || 'framing');
  }
  return {
    previousStrategyId: params.previousStrategyId,
    newStrategyId: params.newStrategyId,
    changedDimensions: changed.slice(0, 6),
    reason: params.reason
  };
}

export function evaluateNoveltyAgainstHistory(options: {
  imageBytes: Buffer;
  concept: {
    subject?: string;
    primarySubject?: string;
    action?: string;
    environment?: string;
    camera?: string;
    composition?: string;
    lighting?: string;
    foreground?: string;
    background?: string;
    whatIsShown?: string;
  };
  strategyId: string;
  humanPresence: string | boolean;
  existing: Array<{
    hash?: string;
    perceptualHash?: string;
    strategy?: { id?: string };
    visualConcept?: any;
    fingerprint?: CompositionFingerprint;
  }>;
}): NoveltyEvaluation {
  const sha256 = computeSha256(options.imageBytes);
  const perceptualHash = computePerceptualHashFromBytes(options.imageBytes);
  let exact = false;
  let minHamming = 16;
  let maxComposition = 0;

  const currentSubject = normalizeSubject(options.concept.primarySubject || options.concept.subject || '');
  const currentCamera = tokenize(options.concept.camera || options.concept.composition || '');
  const currentEnv = environmentClass(options.concept.environment || '');

  for (const prev of options.existing) {
    if (prev.hash && prev.hash === sha256) exact = true;
    if (prev.perceptualHash) {
      const dist = hammingDistance(perceptualHash, prev.perceptualHash);
      if (dist < minHamming) minHamming = dist;
    }
    const prevSubject = normalizeSubject(prev.visualConcept?.primarySubject || prev.visualConcept?.subject || prev.fingerprint?.subject || '');
    const prevStrategy = prev.strategy?.id || prev.fingerprint?.visualStrategy;
    const prevCamera = tokenize(prev.visualConcept?.camera || prev.visualConcept?.composition || prev.fingerprint?.cameraAngle || '');
    const prevEnv = environmentClass(prev.visualConcept?.environment || prev.fingerprint?.environment || '');
    let sim = 0;
    if (prevStrategy && prevStrategy === options.strategyId) sim += 30;
    if (prevSubject && prevSubject === currentSubject) sim += 30;
    if (prevCamera && prevCamera === currentCamera) sim += 22;
    if (prevEnv && prevEnv === currentEnv) sim += 18;
    if (sim > maxComposition) maxComposition = sim;
  }

  const noveltyFromPixels = Math.round((minHamming / 16) * 100);
  const noveltyFromComposition = Math.max(0, 100 - maxComposition);
  const noveltyScore = exact ? 0 : Math.round(noveltyFromPixels * 0.3 + noveltyFromComposition * 0.7);
  const tooSimilar = exact || maxComposition >= 70 || noveltyScore < 70;

  return {
    exactDuplicate: exact,
    sha256Match: exact,
    sha256,
    perceptualHash,
    perceptualSimilarity: Math.max(0, Math.round((1 - minHamming / 16) * 100)),
    compositionSimilarity: maxComposition,
    semanticSimilarity: maxComposition,
    noveltyScore,
    isAcceptable: !tooSimilar,
    tooSimilar,
    reason: exact
      ? 'Exact image duplicate'
      : tooSimilar
        ? 'Same subject, framing and environment class — lighting-only changes are not novel.'
        : 'ok',
    comparedAgainst: options.existing.length,
    rejectionReason: tooSimilar ? 'Too similar to a previous generation' : undefined
  };
}
