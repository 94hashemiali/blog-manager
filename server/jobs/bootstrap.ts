import { registerJobHandler } from './registry.js';
import { contentProductionHandler } from './handlers/contentProduction.js';
import { researchHandler } from './handlers/research.js';
import { performanceSyncHandler } from './handlers/performanceSync.js';
import { intelligenceSyncHandler } from './handlers/intelligenceSync.js';
import { publishHandler } from './handlers/publish.js';

let bootstrapped = false;

export function bootstrapJobHandlers(): void {
  if (bootstrapped) return;
  registerJobHandler('CONTENT_PRODUCTION', contentProductionHandler);
  registerJobHandler('CONTENT_UPDATE', contentProductionHandler);
  registerJobHandler('RESEARCH', researchHandler);
  registerJobHandler('PERFORMANCE_SYNC', performanceSyncHandler);
  registerJobHandler('INTELLIGENCE_SYNC', intelligenceSyncHandler);
  registerJobHandler('PUBLISH', publishHandler);
  // VISUAL_GENERATION stays on legacy in-memory visual jobs — boundary documented in index.
  bootstrapped = true;
}
