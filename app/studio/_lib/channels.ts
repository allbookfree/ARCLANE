export type ChannelStudio = {
  id: string;
  name: string;
  code: string;
  tagline: string;
  description: string;
  niche: string;
  language: string;
  format: string;
  stagesCount: number;
  status: 'active' | 'upcoming' | 'draft';
  route: string;
  accentColor: string;
  badge?: string;
  systemPromptSummary: string;
};

export const defaultChannels: ChannelStudio[] = [
  {
    id: 'global-everyday-history',
    name: 'Global Everyday History',
    code: 'GEH',
    tagline: 'Cinematic English Historical Documentaries',
    description: 'Human-scale stories about how ordinary people across the world lived, worked, ate, travelled, and survived before modern life.',
    niche: 'History & Everyday Life',
    language: 'English (International)',
    format: '16:9 Documentary + 9:16 Shorts',
    stagesCount: 9,
    status: 'active',
    route: '/studio/ideas',
    accentColor: '#3b82f6',
    badge: '● Active Channel Studio',
    systemPromptSummary: 'Grounded truthfulness, modest visual depiction, faith-safe audio option, research-locked facts.',
  },
  {
    id: 'mystery-unsolved-chronicles',
    name: 'Unsolved Chronicles',
    code: 'UCH',
    tagline: 'Deep Investigative Mysteries & Curiosities',
    description: 'Fact-first narrative mysteries, archaeological discoveries, lost civilizations, and historical enigmas.',
    niche: 'Mystery & Investigation',
    language: 'English (International)',
    format: '16:9 Documentary + 9:16 Shorts',
    stagesCount: 9,
    status: 'upcoming',
    route: '#',
    accentColor: '#8b5cf6',
    badge: 'Reserved Channel Slot',
    systemPromptSummary: 'Suspense pacing, forensic evidence discipline, ethical true-mystery standards.',
  },
  {
    id: 'frontier-horizons-science',
    name: 'Frontier Horizons',
    code: 'FRH',
    tagline: 'Science, Engineering & Nature Documentaries',
    description: 'Deep dives into engineering marvels, megaprojects, astronomy, nature discoveries, and futuristic science.',
    niche: 'Science & Engineering',
    language: 'English (International)',
    format: '16:9 Long-form + 9:16 Vertical',
    stagesCount: 9,
    status: 'upcoming',
    route: '#',
    accentColor: '#10b981',
    badge: 'Reserved Channel Slot',
    systemPromptSummary: 'Technical clarity, accurate visual schematics, educational pacing.',
  },
];
