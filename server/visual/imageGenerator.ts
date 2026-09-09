import {
  generateGeminiImage as generateGeminiImageCore,
  type FailedGeminiImage,
  type GeneratedGeminiImage
} from './generateImage.js';

function isFailedGeminiImage(result: GeneratedGeminiImage | FailedGeminiImage): result is FailedGeminiImage {
  return result.success === false;
}

export async function generateGeminiImage(
  prompt: string,
  options: {
    aspectRatio?: string;
    referenceImage?: string;
    imageSize?: string;
    allowPeople?: boolean;
  } = {}
): Promise<{
  success: boolean;
  imageUrl?: string;
  modelUsed?: string;
  error?: string;
  errorCode?: string;
  retryable?: boolean;
  bytes?: Buffer;
}> {
  const result = await generateGeminiImageCore({
    prompt,
    aspectRatio: options.aspectRatio,
    referenceImage: options.referenceImage
  });
  if (isFailedGeminiImage(result)) {
    return {
      success: false,
      error: result.error,
      errorCode: result.errorCode,
      retryable: result.retryable
    };
  }
  return {
    success: true,
    imageUrl: result.imageUrl,
    modelUsed: result.modelUsed,
    bytes: result.bytes
  };
}

export { toInlineImage, dataUrlToBytes } from './generateImage.js';
