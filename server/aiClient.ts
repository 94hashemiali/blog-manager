import { generateGeminiJson, GeminiCallError } from './geminiClient.js';

export { getAI, extractJson, GeminiCallError, TEXT_MODEL_CANDIDATES, IMAGE_MODEL_CANDIDATES } from './geminiClient.js';

export async function generateJsonContent(options: {
  prompt: string;
  systemInstruction?: string;
  stage: string;
  models?: string[];
}): Promise<{ data: any; modelUsed: string; rawText: string }> {
  const result = await generateGeminiJson<any>({
    prompt: options.prompt,
    systemInstruction: options.systemInstruction,
    stage: options.stage,
    models: options.models
  });
  return { data: result.data, modelUsed: result.modelUsed, rawText: result.raw };
}

export async function generateMultimodalJson(options: {
  prompt: string;
  images: Array<{ mimeType: string; data: string }>;
  systemInstruction?: string;
  stage: string;
  models?: string[];
}): Promise<{ data: any; modelUsed: string; rawText: string }> {
  const parts = [
    ...options.images.map((img) => ({
      inlineData: { mimeType: img.mimeType, data: img.data }
    })),
    { text: options.prompt }
  ];
  const result = await generateGeminiJson<any>({
    prompt: options.prompt,
    systemInstruction: options.systemInstruction,
    stage: options.stage,
    models: options.models,
    contents: { parts }
  });
  return { data: result.data, modelUsed: result.modelUsed, rawText: result.raw };
}

export function makeAiError(
  message: string,
  options: { errorCode: string; stage: string; retryable?: boolean }
): GeminiCallError {
  return new GeminiCallError(message, {
    stage: options.stage,
    errorCode: options.errorCode,
    retryable: options.retryable
  });
}
