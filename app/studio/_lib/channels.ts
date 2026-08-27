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
  status: 'active' | 'draft';
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
];

