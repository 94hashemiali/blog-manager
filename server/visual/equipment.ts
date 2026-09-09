export const EQUIPMENT_REALISM: Record<string, string[]> = {
  tent: [
    'Believable geodesic or tunnel proportions, not a cartoon dome',
    'Visible pole structure with realistic crossovers and clips or sleeves',
    'Fabric under tension with natural wrinkles, not inflated CGI',
    'Guy lines going to real ground anchors at plausible angles',
    'Doors, vestibules, seams and zippers that could exist on a real tent',
    'For four-season tents: lower profile, stronger pole geometry, storm skirt or extra anchors, not a casual 3-season backyard tent'
  ],
  backpack: [
    'Realistic pack volume and torso length',
    'Visible shoulder straps, hip belt, buckles and load-lifter straps',
    'Load sitting on the hips, not floating like a fashion prop',
    'Compression straps and attachment points that make mechanical sense'
  ],
  trekking_pole: [
    'Correct grip in the hand with a wrist strap actually around the wrist',
    'Realistic pole length for the terrain',
    'Tip contacting the ground at a believable angle',
    'No extra shafts, melted locks, or floating baskets'
  ],
  hiking_boot: [
    'Realistic lug sole interacting with dirt or rock',
    'Believable laces and eyelets',
    'Ankle and foot orientation that matches the terrain',
    'No melted rubber, extra tongues, or mirrored pairs fused together'
  ],
  sleeping_bag: [
    'Believable loft volume, not a perfectly smooth sausage',
    'Visible zipper, draft tube and hood geometry if shown',
    'Correct mummy or rectangular proportions',
    'For down vs synthetic: baffle chambers vs continuous sheet-like fill should be distinguishable if comparison is the topic'
  ],
  camp_stove: [
    'Believable burner head, pot supports and fuel connection',
    'Correct scale relative to the canister or bottle',
    'Pot sitting stably, no hovering cookware',
    'No fantasy sci-fi valves'
  ]
};

export function equipmentConstraintsFor(equipment: string[]): string[] {
  const lines: string[] = [];
  for (const item of equipment) {
    const extra = EQUIPMENT_REALISM[item];
    if (extra) lines.push(...extra);
  }
  if (lines.length === 0) {
    lines.push('Prefer conservative realistic outdoor equipment over imaginative gear.');
  }
  return lines;
}

export const BASE_NEGATIVES = [
  'no text',
  'no watermark',
  'no random logos',
  'no UI overlays',
  'no duplicated objects',
  'no floating objects'
];

export function contextNegatives(options: {
  imageType: string;
  humanPresence: string;
  articleType: string;
  extra?: string[];
}): string[] {
  const negatives = [...BASE_NEGATIVES];
  negatives.push('no fantasy architecture', 'no impossible equipment');
  if (options.humanPresence !== 'none') {
    negatives.push('no distorted hands', 'no extra fingers', 'no impossible joints');
  } else {
    negatives.push('no random unrelated people dominating the frame');
  }
  if (options.imageType === 'COMPARISON') {
    negatives.push('no fake labels or arrows inside the photograph');
  }
  if (options.imageType === 'HERO' || options.imageType === 'ENVIRONMENTAL') {
    negatives.push('no generic stock mountain wallpaper', 'no excessive cinematic grading', 'no oversaturation');
  }
  if (options.articleType === 'how_to' || options.articleType === 'tutorial') {
    negatives.push('no posed fashion stance that hides the technique');
  }
  for (const extra of options.extra || []) {
    if (extra && !negatives.includes(extra)) negatives.push(extra);
  }
  return negatives;
}

export const GENERIC_CLICHE_SCENES = [
  'mountain + tent + sunset + hiker',
  'generic alpine wallpaper with a tiny unspecified tent',
  'golden-hour campsite that could illustrate any outdoor article',
  'fashion-pose hiker on a ridge with no article-specific gear action'
];

export type EquipmentKind =
  | 'four_season_tent'
  | 'tent'
  | 'sleeping_bag'
  | 'backpack'
  | 'trekking_poles'
  | 'hiking_boots'
  | 'camp_stove'
  | 'unknown';

export function detectEquipmentKind(title: string, content = ''): EquipmentKind {
  const text = `${title} ${content}`;
  if (/چادر.{0,24}چهار فصل|چهار فصل.{0,24}چادر|four[-\s]?season tent/i.test(text)) return 'four_season_tent';
  if (/چادر|tent/i.test(text)) return 'tent';
  if (/کیسه خواب|sleeping bag/i.test(text)) return 'sleeping_bag';
  if (/کوله|backpack|rucksack/i.test(text)) return 'backpack';
  if (/باتوم|عصا|trekking pole/i.test(text)) return 'trekking_poles';
  if (/کفش|پوتین|boot|footwear/i.test(text)) return 'hiking_boots';
  if (/سرشعله|اجاق|stove/i.test(text)) return 'camp_stove';
  return 'unknown';
}

export function equipmentLabel(kind: EquipmentKind): string {
  switch (kind) {
    case 'four_season_tent':
      return 'four-season mountaineering tent';
    case 'tent':
      return 'backpacking tent';
    case 'sleeping_bag':
      return 'sleeping bag';
    case 'backpack':
      return 'trekking backpack';
    case 'trekking_poles':
      return 'trekking poles';
    case 'hiking_boots':
      return 'hiking boots';
    case 'camp_stove':
      return 'camp stove';
    default:
      return 'outdoor equipment named by the article';
  }
}

const KIND_TO_REALISM: Record<EquipmentKind, string> = {
  four_season_tent: 'tent',
  tent: 'tent',
  sleeping_bag: 'sleeping_bag',
  backpack: 'backpack',
  trekking_poles: 'trekking_pole',
  hiking_boots: 'hiking_boot',
  camp_stove: 'camp_stove',
  unknown: 'unknown'
};

export function equipmentConstraints(kind: EquipmentKind): string[] {
  const key = KIND_TO_REALISM[kind];
  if (key === 'tent' && kind === 'four_season_tent') {
    return EQUIPMENT_REALISM.tent;
  }
  return EQUIPMENT_REALISM[key] || ['Prefer conservative realistic outdoor equipment over imaginative gear.'];
}
