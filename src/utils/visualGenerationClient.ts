import type { ImageAsset } from '../types';

export const GENERATION_STAGE_LABELS: Record<string, string> = {
  understanding_article: 'درک مقاله',
  planning_visual_concept: 'طراحی کانسپت بصری',
  planning_composition: 'برنامه‌ریزی ترکیب‌بندی',
  generating_image: 'تولید تصویر',
  evaluating_image: 'ارزیابی کیفیت',
  checking_originality: 'بررسی اصالت',
  finalizing: 'نهایی‌سازی'
};

export interface VisualApiError {
  success: false;
  stage?: string;
  errorCode?: string;
  message: string;
  retryable?: boolean;
  fallbackImages?: Array<{ id: string; title: string; url: string; source: string; isAiGenerated: boolean }>;
}

export async function startVisualJob(body: Record<string, unknown>): Promise<{ jobId: string }> {
  const res = await fetch('/api/ai/visual-assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, async: true })
  });
  const data = await res.json();
  if (!res.ok || !data.jobId) {
    throw new Error(data.message || data.error || 'شروع تولید تصویر ناموفق بود');
  }
  return data;
}

export async function pollVisualJob(
  jobId: string,
  onStage?: (stage: string, detail?: string) => void
): Promise<any> {
  for (let i = 0; i < 180; i++) {
    const res = await fetch(`/api/ai/visual-jobs/${jobId}`);
    const job = await res.json();
    if (job.stage) onStage?.(job.stage, job.detail);
    if (job.status === 'COMPLETED') return job.result;
    if (job.status === 'FAILED') {
      const err: VisualApiError = job.result || {
        success: false,
        message: job.error || 'تولید تصویر ناموفق بود',
        stage: job.stage,
        retryable: true
      };
      throw Object.assign(new Error(err.message), err);
    }
    await new Promise((r) => setTimeout(r, 900));
  }
  throw new Error('زمان تولید تصویر به پایان رسید');
}

export function qualityDisplay(image: ImageAsset): {
  overall: number;
  genericness: number;
  novelty: number;
  issues: string[];
} {
  const overall = image.quality?.overall ?? 0;
  const scaled = overall <= 10 ? overall * 10 : overall;
  return {
    overall: Math.round(scaled),
    genericness: image.genericnessScore ?? image.quality?.genericness ?? 0,
    novelty: image.noveltyScore ?? 0,
    issues: image.issues || image.quality?.issues || image.quality?.problems || []
  };
}
