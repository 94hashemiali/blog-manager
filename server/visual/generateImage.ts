import { getAI, IMAGE_MODEL_CANDIDATES, GeminiCallError, formatGeminiError } from '../geminiClient.js';

export interface GeneratedGeminiImage {
  success: true;
  imageUrl: string;
  bytes: Buffer;
  mimeType: string;
  modelUsed: string;
}

export interface FailedGeminiImage {
  success: false;
  error: string;
  errorCode: string;
  retryable: boolean;
}

export async function generateGeminiImage(params: {
  prompt: string;
  aspectRatio?: string;
  referenceImage?: string;
}): Promise<GeneratedGeminiImage | FailedGeminiImage> {
  const ai = getAI();
  if (!ai) {
    return {
      success: false,
      error: 'GEMINI_API_KEY is not configured on the server.',
      errorCode: 'missing_api_key',
      retryable: false
    };
  }

  const aspectRatio = params.aspectRatio || '16:9';
  const contentsParts: Array<Record<string, unknown>> = [{ text: params.prompt }];

  if (params.referenceImage) {
    try {
      const attached = await toInlineImage(params.referenceImage);
      if (attached) {
        contentsParts.unshift({
          inlineData: {
            mimeType: attached.mimeType,
            data: attached.data
          }
        });
        contentsParts.push({
          text: 'Use the attached product photograph as identity reference. Keep product silhouette, proportions and construction; the scene around it may change.'
        });
      }
    } catch (err) {
      console.warn('Could not attach reference image:', err instanceof Error ? err.message : err);
    }
  }

  let lastError: unknown = null;

  for (const model of IMAGE_MODEL_CANDIDATES) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: { parts: contentsParts },
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: aspectRatio as '1:1' | '3:4' | '4:3' | '9:16' | '16:9'
          }
        }
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mimeType = part.inlineData.mimeType || 'image/png';
          const bytes = Buffer.from(part.inlineData.data, 'base64');
          return {
            success: true,
            imageUrl: `data:${mimeType};base64,${part.inlineData.data}`,
            bytes,
            mimeType,
            modelUsed: model
          };
        }
      }
      lastError = new Error(`Model ${model} returned no image part.`);
    } catch (err) {
      lastError = err;
      console.warn(`Image model ${model} failed:`, err instanceof Error ? err.message : err);
    }
  }

  const message = formatGeminiError(lastError) || 'No image was returned by Gemini image models.';
  const retryable = /429|RESOURCE_EXHAUSTED|unavailable|503|500|timeout|quota exceeded/i.test(message);
  return {
    success: false,
    error: message,
    errorCode: retryable ? 'quota_or_unavailable' : 'image_generation_failed',
    retryable
  };
}

export async function toInlineImage(reference: string): Promise<{ mimeType: string; data: string } | null> {
  if (reference.startsWith('data:')) {
    const matches = reference.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return null;
    return { mimeType: matches[1], data: matches[2] };
  }
  if (reference.startsWith('http')) {
    const imgFetch = await fetch(reference);
    if (!imgFetch.ok) {
      throw new GeminiCallError(`Failed to fetch reference image (${imgFetch.status})`, {
        stage: 'image_generation',
        errorCode: 'reference_fetch_failed',
        retryable: true
      });
    }
    const buffer = await imgFetch.arrayBuffer();
    return {
      mimeType: imgFetch.headers.get('content-type') || 'image/jpeg',
      data: Buffer.from(buffer).toString('base64')
    };
  }
  return null;
}

export function dataUrlToBytes(url: string): Buffer | null {
  const matches = url.match(/^data:[^;]+;base64,(.+)$/);
  if (!matches) return null;
  return Buffer.from(matches[1], 'base64');
}
