import { ImageType, ManagedSite, ImagePromptVariables } from '../types';

export interface VisualStyleOption {
  id: string;
  label: string;
  en: string;
  desc: string;
}

export interface TerrainOption {
  id: string;
  label: string;
  en: string;
  desc: string;
}

export interface LightingOption {
  id: string;
  label: string;
  en: string;
  desc: string;
}

export interface OpticsOption {
  id: string;
  label: string;
  en: string;
  desc: string;
}

export const VISUAL_STYLES: VisualStyleOption[] = [
  {
    id: 'EDITORIAL_DOCUMENTARY',
    label: 'مستند میدانی نشنال جئوگرافیک',
    en: 'National Geographic style authentic editorial documentary',
    desc: 'عکاسی ژورنالیستی و واقع‌گرایانه در طبیعت واقعی بدون اغراق رنگی و فیلترهای هالیوودی'
  },
  {
    id: 'TECHNICAL_MACRO',
    label: 'بررسی فنی و ماکرو متریال',
    en: 'Technical gear review macro craftsmanship photography',
    desc: 'کلوزآپ بسیار دقیق از دوخت‌ها، بافت الیاف ضدپارگی، عاج زیره کفش و اتصالات فلزی'
  },
  {
    id: 'ALPINE_EXPEDITION',
    label: 'ماجراجویی اصیل آلپی',
    en: 'Authentic high-altitude alpine expedition action photograph',
    desc: 'ثبت پویای تجهیزات در حال استفاده واقعی توسط کوهنورد در شیب‌های تند و خط‌الرأس'
  },
  {
    id: 'TECHNICAL_FLATLAY',
    label: 'چیدمان مهندسی تخت (Knolling)',
    en: 'Technical knolling outdoor gear flatlay arrangement',
    desc: 'چیدمان متقارن و زاویه‌دار قطعات با زاویه دید عمود بر سطح سنگ طبیعی یا چوب کوهستان'
  },
  {
    id: 'PRACTICAL_TUTORIAL',
    label: 'آموزش گام‌به‌گام با دست‌ها',
    en: 'Instructional field demonstration focusing tightly on hands and mechanisms',
    desc: 'نمای نزدیک از دست‌های باتجربه و کاربلد در حال گره‌زدن، ریگلاژ بندها یا برپایی چادر'
  }
];

export const TERRAIN_PRESETS: TerrainOption[] = [
  {
    id: 'ALBORZ_RIDGE',
    label: 'خط‌الرأس گرانیتی و صخره‌های البرز',
    en: 'Windswept jagged granite ridgeline in the rugged Alborz mountain range with dark scree, sharp crests, and distant alpine horizon',
    desc: 'صخره‌های تیره‌رنگ، بادگیر شدید، یال‌های باریک و سنگ‌ریزه‌های گرانیتی'
  },
  {
    id: 'ZAGROS_LIMESTONE',
    label: 'دیواره‌های آهکی و کارستی زاگرس',
    en: 'Massive weathered limestone cliffs and crags of the Zagros mountains with alpine meadow patches and steep limestone ravines',
    desc: 'صخره‌های آهکی خاکستری روشن، دره‌های عمیق، بوته‌های گون و مراتع کوهستانی'
  },
  {
    id: 'HYRCANIAN_FOREST',
    label: 'جنگل مه‌آلود هیرکانی با بستر خزه',
    en: 'Dense, misty ancient Hyrcanian beech forest with moss-covered boulders, damp rich loam soil, and mountain ferns',
    desc: 'درختان کهنسال راش، مه غلیظ، برگ‌های خیس و رطوبت طبیعی جنگل‌های شمال'
  },
  {
    id: 'ALPINE_SNOWPACK',
    label: 'برف‌چال‌ها و یال زمستانی آلپی',
    en: 'High-altitude wind-packed snowpack along a knife-edge winter alpine crest with drifting spindrift and exposed frozen rock',
    desc: 'برف سفت بادکوب، نقاب‌های برفی، سرما و شرایط سخت زمستانی کوهستان'
  },
  {
    id: 'DESERT_STEPPE',
    label: 'دره‌های خشک و استپ کوهستانی',
    en: 'Arid rocky mountain steppe with sun-baked sandstone blocks, low thorny scrub, and wide rugged canyon vistas',
    desc: 'فلات‌های بادخیز، بوته‌های خشک کویری و سنگ‌های آفتاب‌سوخته'
  }
];

export const LIGHTING_PRESETS: LightingOption[] = [
  {
    id: 'DIFFUSE_ALPINE',
    label: 'نور روز ابری و شفاف (بدون فیلتر)',
    en: 'Crisp diffuse alpine daylight under thin high-altitude overcast skies with soft realistic shadows and zero artificial tint',
    desc: 'نور طبیعی یکنواخت که بافت و رنگ واقعی پارچه و فلزات را دقیق نشان می‌دهد'
  },
  {
    id: 'GOLDEN_CREST',
    label: 'نور زاویه‌دار طلوع/غروب ارتفاعات',
    en: 'Low-angle golden dawn light grazing the sharp crest edges and textile weave with authentic physical warmth without fake neon glow',
    desc: 'پرتوهای گرم مایل آفتاب روی یال کوه که عمق هندسی تجهیزات را برجسته می‌کند'
  },
  {
    id: 'BLUE_HOUR_CAMP',
    label: 'گرگ‌ومیش با درخشش ملایم چراغ کمپ',
    en: 'Deep blue-hour alpine twilight with warm ambient glow radiating from a low-lumen camp lantern inside the vestibule',
    desc: 'تضاد دلنشین سرمای گرگ‌ومیش کوهستان و نور ملایم نارنجی داخل چادر'
  },
  {
    id: 'SUMMIT_SUN',
    label: 'آفتاب تند قله با سایه‌های تیز',
    en: 'High-contrast high-altitude summit sunlight carving crisp, physically accurate geometric shadows into rock and gear',
    desc: 'روشنایی شدید ارتفاع بالا با سایه‌های تیز و عمق میدان واقع‌گرایانه'
  },
  {
    id: 'MORNING_MIST',
    label: 'مه رقیق صبحگاهی و نور لطیف',
    en: 'Cool morning mountain mist diffusing soft ambient light with visible atmospheric depth across depth planes',
    desc: 'پراکندگی ملایم نور در لایه‌های مه با عمق اتمسفری بالا'
  }
];

export const OPTICS_PRESETS: OpticsOption[] = [
  {
    id: '35MM_CONTEXT',
    label: 'لنز ۳۵mm (محیطی با پرسپکتیو انسانی)',
    en: 'Shot on 35mm prime lens at f/4.0 for expansive environmental mountain context with crisp edge-to-edge depth',
    desc: 'نمایش همزمان تجهیزات و محیط پیرامون با پرسپکتیو واقعی چشم کوهنورد'
  },
  {
    id: '50MM_NATURAL',
    label: 'لنز ۵۰mm (دید طبیعی و استاندارد)',
    en: 'Shot on 50mm f/2.8 lens reproducing natural human optical perspective without wide-angle barrel distortion',
    desc: 'بدون هیچ‌گونه اعوجاج کناره‌ها، مناسب عکاسی مستند و بررسی کالا'
  },
  {
    id: '90MM_MACRO',
    label: 'لنز ۹۰mm (ماکرو و تفکیک بافت)',
    en: 'Shot on 90mm macro lens at f/2.8 with shallow depth of field isolating critical mechanical seams, lugs, and fabric weaves',
    desc: 'تمرکز بالا روی جزئیات ریز مهندسی محصول با بوکه نرم در پس‌زمینه'
  }
];

export const COMMON_GEAR_MATERIALS = [
  'Ripstop Silicone-Nylon',
  'Dyneema Reflective Guyouts',
  'DAC Featherlite Aluminum Poles',
  'Vibram Megagrip Rubber Lugs',
  'Gore-Tex Pro 3-Layer Membrane',
  'Cordura 500D Ballistic Fabric',
  'YKK Aquaguard Zippers',
  'Taped Waterproof Bartack Seams',
  '800+ FP Hydrophobic Down Baffles',
  'Anodized Aircraft Aluminum Buckles',
  'Pertex Quantum Windproof Shell',
  'High-Tenacity Hypalon Reinforcements'
];

/**
 * Intelligent Prompt Variables Generator
 * Synthesizes activeSite brand colors, brand voice, article topic, and outdoor environment
 */
export function generateEngineeredPromptVariables(params: {
  activeSite: ManagedSite;
  topic: string;
  contentSample?: string;
  imageType: ImageType;
  selectedStyleId: string;
  selectedTerrainId: string;
  selectedLightingId: string;
  selectedOpticsId: string;
  activeMaterials: string[];
  customTerrain?: string;
  customColorDescription?: string;
}): ImagePromptVariables {
  const {
    activeSite,
    topic,
    contentSample = '',
    imageType,
    selectedStyleId,
    selectedTerrainId,
    selectedLightingId,
    selectedOpticsId,
    activeMaterials,
    customTerrain,
    customColorDescription
  } = params;

  const styleObj = VISUAL_STYLES.find((s) => s.id === selectedStyleId) || VISUAL_STYLES[0];
  const terrainObj = TERRAIN_PRESETS.find((t) => t.id === selectedTerrainId) || TERRAIN_PRESETS[0];
  const lightingObj = LIGHTING_PRESETS.find((l) => l.id === selectedLightingId) || LIGHTING_PRESETS[0];
  const opticsObj = OPTICS_PRESETS.find((o) => o.id === selectedOpticsId) || OPTICS_PRESETS[0];

  const primaryColor = activeSite.brand?.primaryColor || '#15803d';
  const secondaryColor = activeSite.brand?.secondaryColor || '#b45309';
  const brandName = activeSite.brand?.name || activeSite.name || 'مدنی کمپ';

  const defaultColorApp = customColorDescription?.trim()
    ? customColorDescription.trim()
    : `Harmonized with ${brandName}'s brand identity: earthy outdoor tones with organic accents of brand primary (${primaryColor}) on structural fabric or seams and secondary (${secondaryColor}) on pull-cords or webbing highlights, set against natural granite slate neutrals without fluorescent or neon color cast.`;

  const natureDesc = customTerrain?.trim()
    ? customTerrain.trim()
    : terrainObj.en;

  const negativeConstraints = [
    'absolutely no Persian calligraphy or typography',
    'no English text or fake brand logos',
    'no distorted hands or extra fingers',
    'no plastic mannequin sheen or CGI video-game aesthetic',
    'no fantasy landscapes or unrealistic neon sunset filters',
    'no floating or physically ungrounded objects'
  ];

  return {
    visualStyle: styleObj.en,
    brandColorPalette: {
      primaryColor,
      secondaryColor,
      brandName,
      colorApplication: defaultColorApp
    },
    natureElements: natureDesc,
    lightingAtmosphere: lightingObj.en,
    technicalGearMaterials: activeMaterials.length > 0 ? activeMaterials : ['Ripstop Silicone-Nylon', 'DAC Featherlite Aluminum Poles'],
    cameraOptics: opticsObj.en,
    negativeConstraints
  };
}

/**
 * Compiles a professional, composition-first English prompt from structured variables
 */
export function compileEngineeredPromptString(params: {
  topic: string;
  imageType: ImageType;
  variables: ImagePromptVariables;
  contentSample?: string;
}): string {
  const { topic, imageType, variables, contentSample = '' } = params;
  const lines: string[] = [];

  // 1. Scene statement
  let subjectFocus = topic.trim() || 'technical mountaineering equipment';
  let framingContext = 'in authentic field deployment';

  if (imageType === 'HERO') {
    framingContext = 'commanding the landscape on an exposed high-altitude terrain, demonstrating structural stability against mountain winds';
  } else if (imageType === 'PRODUCT') {
    framingContext = 'close-up craftsmanship view highlighting technical contact surfaces, stitching, and ergonomic build';
  } else if (imageType === 'COMPARISON') {
    framingContext = 'side-by-side technical evaluation under identical mountain light showing mechanical differences';
  } else if (imageType === 'TUTORIAL') {
    framingContext = 'instructional hands-only demonstration displaying correct mechanical adjustment and tensioning in sequence';
  } else {
    framingContext = 'in authentic documentary field usage along a remote alpine trail';
  }

  lines.push(
    `Authentic ${variables.visualStyle} photograph depicting ${subjectFocus} ${framingContext}.`
  );

  // 2. Camera & Optics
  lines.push(`Framing & Optics: ${variables.cameraOptics}.`);

  // 3. Terrain & Nature Environment
  lines.push(`Environmental Terrain: ${variables.natureElements}.`);

  // 4. Lighting & Atmosphere
  lines.push(`Atmospheric Lighting: ${variables.lightingAtmosphere}.`);

  // 5. Brand Color Palette Harmony
  lines.push(
    `Color Palette & Visual Harmony: ${variables.brandColorPalette.colorApplication}`
  );

  // 6. Technical Gear Materials
  if (variables.technicalGearMaterials && variables.technicalGearMaterials.length > 0) {
    lines.push(
      `Gear Materials & Accuracy: Display authentic mechanical construction including ${variables.technicalGearMaterials.join(', ')}. Authentic fabric tension, natural material wrinkles, and physical ground contact.`
    );
  }

  // 7. Human Presence & Safety
  if (imageType === 'TUTORIAL') {
    lines.push(
      `Human depiction: Only show weathered, experienced outdoor hands performing manual adjustment with natural skin texture and anatomically correct fingers.`
    );
  } else if (imageType === 'PRODUCT') {
    lines.push(`Human depiction: No visible human faces; focus strictly on the equipment craftsmanship and terrain.`);
  } else {
    lines.push(
      `Human depiction: Realistic mountaineer in functional alpine layering, authentic mountaineering posture, no fashion poses.`
    );
  }

  // 8. Strict Negative Constraints
  lines.push(`Strict constraints: ${variables.negativeConstraints?.join(', ')}.`);

  return lines.join(' ');
}

/**
 * Heuristically infers relevant presets based on article topic and content
 */
export function inferPresetsFromContext(
  topic: string,
  content: string = ''
): {
  suggestedStyleId: string;
  suggestedTerrainId: string;
  suggestedLightingId: string;
  suggestedOpticsId: string;
  suggestedMaterials: string[];
} {
  const combined = `${topic} ${content}`.toLowerCase();

  let suggestedStyleId = 'EDITORIAL_DOCUMENTARY';
  let suggestedTerrainId = 'ALBORZ_RIDGE';
  let suggestedLightingId = 'DIFFUSE_ALPINE';
  let suggestedOpticsId = '35MM_CONTEXT';
  const suggestedMaterials: string[] = [];

  // Topic-based inference
  if (combined.includes('چادر') || combined.includes('tent') || combined.includes('کمپ') || combined.includes('کمپینگ')) {
    suggestedStyleId = 'EDITORIAL_DOCUMENTARY';
    suggestedTerrainId = 'ALBORZ_RIDGE';
    suggestedLightingId = 'BLUE_HOUR_CAMP';
    suggestedOpticsId = '35MM_CONTEXT';
    suggestedMaterials.push('Ripstop Silicone-Nylon', 'DAC Featherlite Aluminum Poles', 'Dyneema Reflective Guyouts', 'Taped Waterproof Bartack Seams');
  } else if (combined.includes('کفش') || combined.includes('پوتین') || combined.includes('بوت') || combined.includes('boot')) {
    suggestedStyleId = 'TECHNICAL_MACRO';
    suggestedTerrainId = 'ZAGROS_LIMESTONE';
    suggestedLightingId = 'DIFFUSE_ALPINE';
    suggestedOpticsId = '90MM_MACRO';
    suggestedMaterials.push('Vibram Megagrip Rubber Lugs', 'Gore-Tex Pro 3-Layer Membrane', 'Cordura 500D Ballistic Fabric');
  } else if (combined.includes('کیسه خواب') || combined.includes('sleeping bag') || combined.includes('پر') || combined.includes('عایق')) {
    suggestedStyleId = 'EDITORIAL_DOCUMENTARY';
    suggestedTerrainId = 'ALPINE_SNOWPACK';
    suggestedLightingId = 'BLUE_HOUR_CAMP';
    suggestedOpticsId = '50MM_NATURAL';
    suggestedMaterials.push('800+ FP Hydrophobic Down Baffles', 'Pertex Quantum Windproof Shell', 'YKK Aquaguard Zippers');
  } else if (combined.includes('کوله') || combined.includes('backpack') || combined.includes('پک')) {
    suggestedStyleId = 'TECHNICAL_FLATLAY';
    suggestedTerrainId = 'ALBORZ_RIDGE';
    suggestedLightingId = 'DIFFUSE_ALPINE';
    suggestedOpticsId = '50MM_NATURAL';
    suggestedMaterials.push('Cordura 500D Ballistic Fabric', 'Anodized Aircraft Aluminum Buckles', 'YKK Aquaguard Zippers');
  } else if (combined.includes('برف') || combined.includes('یخچال') || combined.includes('زمستان') || combined.includes('کرامپون')) {
    suggestedStyleId = 'ALPINE_EXPEDITION';
    suggestedTerrainId = 'ALPINE_SNOWPACK';
    suggestedLightingId = 'SUMMIT_SUN';
    suggestedOpticsId = '35MM_CONTEXT';
    suggestedMaterials.push('Gore-Tex Pro 3-Layer Membrane', 'Anodized Aircraft Aluminum Buckles', 'High-Tenacity Hypalon Reinforcements');
  } else if (combined.includes('جنگل') || combined.includes('طبیعت') || combined.includes('باران') || combined.includes('مه')) {
    suggestedStyleId = 'EDITORIAL_DOCUMENTARY';
    suggestedTerrainId = 'HYRCANIAN_FOREST';
    suggestedLightingId = 'MORNING_MIST';
    suggestedOpticsId = '35MM_CONTEXT';
    suggestedMaterials.push('Ripstop Silicone-Nylon', 'Taped Waterproof Bartack Seams', 'Gore-Tex Pro 3-Layer Membrane');
  } else {
    // Default high-altitude kit
    suggestedMaterials.push('Ripstop Silicone-Nylon', 'DAC Featherlite Aluminum Poles', 'Vibram Megagrip Rubber Lugs', 'Dyneema Reflective Guyouts');
  }

  return {
    suggestedStyleId,
    suggestedTerrainId,
    suggestedLightingId,
    suggestedOpticsId,
    suggestedMaterials
  };
}
