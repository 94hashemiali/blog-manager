import { buildArticleRepresentation, inferArticleType, serializeArticleForPrompt } from './articleContext.js';
import { loadQualityThresholds, qualityGateDecision, BANNED_PROMPT_WORDS } from './config.js';
import { feedbackToDirection } from './feedback.js';
import { buildDifferencePlan, evaluateNoveltyAgainstHistory, hammingDistance, computeSha256 } from './novelty.js';
import { buildImagePrompt, sanitizePromptLanguage } from './promptBuilder.js';
import { selectStrategyDeterministic } from './strategies.js';
import type { ImageQualityEvaluation, NoveltyEvaluation, VisualConcept, VisualIntent, VisualStrategy } from './types.js';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    console.error(`fail  ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

run('article representation keeps title and headings, not a 300-char slice', () => {
  const article = {
    title: 'راهنمای انتخاب چادر چهار فصل',
    content: `مقدمه درباره چادر چهار فصل و تفاوت آن با چادر سه فصل در باد و برف.

## ساختار تیرک‌ها
چادر چهار فصل معمولاً ژئودزیک است و تیرک‌ها یکدیگر را قطع می‌کنند تا بار برف را تحمل کنند.

## بادبند و دامن برف
مهاربندها با زاویه حدود ۴۵ درجه به زمین می‌رسند و دامن برف از ورود پودر برف جلوگیری می‌کند.

## جمع‌بندی
اگر برنامه زمستانی دارید، چادر سه فصل مناسب نیست.`
  };
  const rep = buildArticleRepresentation(article);
  const serialized = serializeArticleForPrompt(rep);
  assert(serialized.includes('Title:'), 'missing title label');
  assert(serialized.includes('ساختار تیرک'), 'missing heading');
  assert(serialized.includes('Introduction:'), 'missing intro');
  assert(rep.equipment.includes('tent'), 'detected tent');
  assert(serialized.length > 300, 'representation should be richer than a title snippet');
});

run('article type mapping', () => {
  assert(inferArticleType('راهنمای انتخاب چادر چهار فصل', '') === 'buying_guide', 'buying guide');
  assert(inferArticleType('تفاوت کیسه خواب پر و الیاف', '') === 'comparison', 'comparison');
  assert(inferArticleType('چطور کوله پشتی کوهنوردی را تنظیم کنیم', '') === 'how_to', 'how to');
  assert(inferArticleType('روش صحیح استفاده از باتوم کوهنوردی', '') === 'tutorial', 'tutorial');
  assert(inferArticleType('بهترین کفش برای کوهنوردی', '') === 'buying_guide', 'best boots');
});

run('strategy selection is deterministic, not random', () => {
  const a = selectStrategyDeterministic({ imageType: 'COMPARISON', articleType: 'comparison' });
  const b = selectStrategyDeterministic({ imageType: 'COMPARISON', articleType: 'comparison' });
  assert(a.id === b.id, 'should be stable');
  assert(a.id === 'controlled_comparison', `expected controlled_comparison, got ${a.id}`);
  const next = selectStrategyDeterministic({
    imageType: 'COMPARISON',
    articleType: 'comparison',
    previousStrategyIds: [a.id]
  });
  assert(next.id !== a.id, 'regenerate differently should pick another strategy');
});

run('prompt is composition-first and not hype-driven', () => {
  const intent: VisualIntent = {
    visualPurpose: 'Show a four-season tent’s structure',
    mainSubject: 'four-season geodesic tent',
    secondarySubjects: ['guy lines'],
    action: 'standing under wind load',
    environment: 'exposed rocky alpine ridge',
    context: 'buying guide',
    importantDetails: ['crossing poles'],
    humanPresence: 'none',
    productImportance: 'dominant',
    technicalImportance: 'high',
    visualMessage: 'This is a winter-capable shelter, not a fair-weather dome',
    thingsToAvoid: ['sunset silhouette cliché']
  };
  const concept: VisualConcept = {
    subject: 'four-season geodesic tent',
    action: 'anchored on rocky ground',
    environment: 'exposed rocky ridge, overcast',
    camera: 'medium three-quarter at waist height',
    composition: 'tent on right third',
    foreground: 'fractured granite',
    background: 'soft receding ridge',
    lighting: 'overcast daylight',
    materials: ['ripstop nylon'],
    technicalDetails: ['guy lines at 45 degrees'],
    whatIsShown: 'A four-season tent with crossing poles and taut fly on exposed rock',
    whyItMatters: 'Shows structural traits of a 4-season tent',
    primarySubject: 'four-season geodesic tent',
    secondarySubjects: ['guy lines'],
    compositionIdea: 'product-dominant three-quarter'
  };
  const strategy: VisualStrategy = {
    id: 'product_in_context',
    name: 'Product in context',
    nameFa: 'محصول در زمینه',
    shotType: 'Product-dominant field photograph',
    cameraAngle: 'Three-quarter',
    lighting: 'Diffuse natural light',
    perspective: 'Product commanding the frame',
    compositionPattern: 'Product on a third',
    bestFor: ['HERO']
  };
  const prompt = buildImagePrompt({
    understanding: {
      title: 'راهنمای انتخاب چادر چهار فصل',
      primaryTopic: 'four-season tent',
      primaryKeyword: 'چادر چهار فصل',
      searchIntent: 'commercial',
      articleType: 'buying_guide',
      audience: '',
      products: [],
      equipment: ['tent'],
      importantEntities: [],
      importantInstructions: [],
      importantComparisons: [],
      problemsBeingSolved: [],
      keyConclusions: [],
      commercialIntent: 'high',
      oneVisualIdea: 'four-season tent structure on exposed rock'
    },
    intent,
    concept,
    composition: {
      imageType: 'HERO',
      strategyId: 'product_in_context',
      subjectPlacement: 'right third',
      cameraHeight: 'waist',
      cameraAngle: 'three-quarter',
      shotScale: 'medium',
      foreground: 'rocks',
      midground: 'tent',
      background: 'ridge',
      lighting: 'overcast',
      depthOfField: 'realistic',
      negativeSpace: 'quiet sky band',
      photographyStyle: 'Professional outdoor editorial photography'
    },
    strategy,
    imageType: 'HERO'
  });
  assert(/subject|Photograph of/i.test(prompt), 'subject');
  assert(/Camera/i.test(prompt), 'camera');
  assert(/Foreground/i.test(prompt), 'foreground');
  assert(/four-season/i.test(prompt), 'article-specific tent');
  const lower = prompt.toLowerCase();
  for (const banned of BANNED_PROMPT_WORDS) {
    assert(!lower.includes(banned), `banned word leaked: ${banned}`);
  }
  assert(sanitizePromptLanguage('cinematic epic tent') !== 'cinematic epic tent', 'sanitize');
});

run('quality gate uses configurable thresholds', () => {
  const quality: ImageQualityEvaluation = {
    overall: 60,
    articleRelevance: 80,
    specificity: 40,
    photographicRealism: 80,
    composition: 80,
    technicalAccuracy: 80,
    anatomy: 100,
    genericness: 85,
    novelty: 90,
    issues: ['generic'],
    shouldRegenerate: true,
    reason: 'too generic',
    nextStrategy: { strategyId: 'technical_demonstration' }
  };
  const novelty: NoveltyEvaluation = {
    exactDuplicate: false,
    sha256Match: false,
    perceptualSimilarity: 10,
    compositionSimilarity: 10,
    semanticSimilarity: 10,
    noveltyScore: 90,
    isAcceptable: true
  };
  const decision = qualityGateDecision(quality, novelty, false, loadQualityThresholds());
  assert(decision.shouldRegenerate, 'should regenerate generic image');
  assert(decision.keepConcept === false, 'genericness should change concept');
});

run('too generic feedback changes concept', () => {
  const dir = feedbackToDirection('too_generic');
  assert(dir.changeConcept, 'must change concept');
  assert(dir.increaseSpecificity, 'must increase specificity');
});

run('difference plan changes at least 3 dimensions', () => {
  const plan = buildDifferencePlan({
    previousStrategyId: 'environmental_editorial',
    newStrategyId: 'technical_demonstration',
    previousConcept: {
      camera: 'wide',
      action: 'static',
      environment: 'sunset ridge',
      composition: 'centered',
      lighting: 'sunset',
      foreground: 'none'
    },
    newConcept: {
      camera: 'ground-level',
      action: 'hiker tensioning guy line',
      environment: 'overcast rocky slope',
      composition: 'left third',
      lighting: 'overcast',
      foreground: 'rocks'
    },
    reason: 'regenerate differently'
  });
  assert(plan.changedDimensions.length >= 3, `expected >=3, got ${plan.changedDimensions.length}`);
});

run('novelty treats same framing as similar', () => {
  const bytes = Buffer.from('fake-image-bytes-aaaaaaaa');
  const concept = {
    subject: 'tent',
    primarySubject: 'tent',
    action: 'standing',
    environment: 'mountain sunset',
    camera: 'wide',
    composition: 'centered'
  };
  const first = evaluateNoveltyAgainstHistory({
    imageBytes: bytes,
    concept,
    strategyId: 'environmental_editorial',
    humanPresence: false,
    existing: []
  });
  const second = evaluateNoveltyAgainstHistory({
    imageBytes: bytes,
    concept,
    strategyId: 'environmental_editorial',
    humanPresence: false,
    existing: [
      {
        hash: computeSha256(bytes),
        perceptualHash: first.perceptualHash,
        strategy: { id: 'environmental_editorial' },
        visualConcept: concept,
        fingerprint: { humanPresence: false }
      }
    ]
  });
  assert(second.exactDuplicate, 'same bytes must be exact duplicate');
  assert(second.isAcceptable === false, 'same composition should be rejected');
  assert(hammingDistance('aaaa', 'aaab') === 1, 'hamming');
});

if (process.exitCode) {
  console.error('\nvisual intelligence tests failed');
} else {
  console.log('\nvisual intelligence tests passed');
}
