export type StudioStageId =
  | 'ideas'
  | 'research'
  | 'scripts'
  | 'voiceover'
  | 'visuals'
  | 'audio'
  | 'thumbnails'
  | 'description'
  | 'shorts';

type LegacyStageId = 'outline' | 'recording' | 'editing' | 'review' | 'publish' | 'analytics';

export type StudioStage = {
  id: StudioStageId;
  number: string;
  code: string;
  title: string;
  eyebrow: string;
  description: string;
  emptyCopy: string;
  symbol: string;
  tone: string;
  actionLabel: string;
  nextPath: string | null;
  nextLabel: string | null;
};

export const studioStages: StudioStage[] = [
  {
    id: 'ideas', number: '01', code: 'ID', title: 'Ideas', eyebrow: 'Global story discovery',
    description: 'Generate original, sourceable episode ideas for the Global Everyday History channel.',
    emptyCopy: 'Choose a connected AI model, then generate a focused set of channel-fit ideas.',
    symbol: '✦', tone: 'blue', actionLabel: 'Generate ideas', nextPath: '/studio/research', nextLabel: 'Research',
  },
  {
    id: 'research', number: '02', code: 'RS', title: 'Research', eyebrow: 'Grounded evidence brief',
    description: 'Turn the selected idea into a verified research brief, source map, and factual story direction.',
    emptyCopy: 'Select an idea first. Research will carry the approved topic and channel system automatically.',
    symbol: '⌕', tone: 'violet', actionLabel: 'Research selected idea', nextPath: '/studio/scripts', nextLabel: 'Script',
  },
  {
    id: 'scripts', number: '03', code: 'SC', title: 'Script', eyebrow: 'Long-form story draft',
    description: 'Write a complete documentary script at the natural length supported by the approved research.',
    emptyCopy: 'The selected idea and research brief will become the factual base for this script.',
    symbol: '¶', tone: 'coral', actionLabel: 'Write full script', nextPath: '/studio/voiceover', nextLabel: 'Voiceover',
  },
  {
    id: 'voiceover', number: '04', code: 'VO', title: 'Voiceover', eyebrow: 'Narration-ready text',
    description: 'Prepare the Final Script as one natural, copy-ready narration for your chosen class of voice model.',
    emptyCopy: 'Complete the script first, then prepare a clean version for your voice model.',
    symbol: '≋', tone: 'cyan', actionLabel: 'Prepare voiceover', nextPath: '/studio/visuals', nextLabel: 'Visuals',
  },
  {
    id: 'visuals', number: '05', code: 'VI', title: 'Visuals', eyebrow: 'Six-to-eight second shot plan',
    description: 'Break the narration into timed AI-video shots and create a detailed production prompt for every clip.',
    emptyCopy: 'The voiceover and script will be divided into precise, historically responsible visual segments.',
    symbol: '▦', tone: 'green', actionLabel: 'Build visual plan', nextPath: '/studio/audio', nextLabel: 'Audio',
  },
  {
    id: 'audio', number: '06', code: 'AU', title: 'Audio', eyebrow: 'Music and sound direction',
    description: 'Create a timeline-aware music, ambience, and sound-effects plan without inventing copyrighted tracks.',
    emptyCopy: 'The approved story and visual rhythm will shape a practical audio direction.',
    symbol: '♪', tone: 'amber', actionLabel: 'Create audio plan', nextPath: '/studio/thumbnails', nextLabel: 'Thumbnails',
  },
  {
    id: 'thumbnails', number: '07', code: 'TH', title: 'Thumbnails', eyebrow: 'Four packaging directions',
    description: 'Generate four distinct thumbnail concepts with composition, text, and high-quality image prompts.',
    emptyCopy: 'Four channel-fit packaging options will appear here for comparison.',
    symbol: '◩', tone: 'pink', actionLabel: 'Create thumbnail options', nextPath: '/studio/description', nextLabel: 'Description',
  },
  {
    id: 'description', number: '08', code: 'DS', title: 'Description', eyebrow: 'Upload metadata',
    description: 'Prepare title options, description, chapters, search language, pinned comment, and AI disclosure.',
    emptyCopy: 'The finished story will become a complete, honest YouTube upload package.',
    symbol: '≡', tone: 'blue', actionLabel: 'Build upload package', nextPath: '/studio/shorts', nextLabel: 'Shorts',
  },
  {
    id: 'shorts', number: '09', code: 'SH', title: 'Shorts', eyebrow: 'Vertical story adaptations',
    description: 'Turn the long-form story into three self-contained Shorts with hooks, scripts, and vertical visual prompts.',
    emptyCopy: 'Three short-form adaptations will be created from the approved long-form story.',
    symbol: '9:16', tone: 'lime', actionLabel: 'Create three Shorts', nextPath: null, nextLabel: null,
  },
];

const legacyStageMap: Record<LegacyStageId, StudioStageId> = {
  outline: 'scripts', recording: 'voiceover', editing: 'visuals',
  review: 'description', publish: 'description', analytics: 'ideas',
};

export function getStudioStage(id: StudioStageId | LegacyStageId) {
  const currentId = id in legacyStageMap ? legacyStageMap[id as LegacyStageId] : id as StudioStageId;
  return studioStages.find((stage) => stage.id === currentId)!;
}

export function getPreviousStage(id: StudioStageId) {
  const index = studioStages.findIndex((stage) => stage.id === id);
  return index > 0 ? studioStages[index - 1] : null;
}
