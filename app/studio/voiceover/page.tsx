import type { Metadata } from 'next';
import VoiceoverWorkspace from '../_components/voiceover-workspace';

export const metadata: Metadata = { title: 'Voiceover — Arclane Creator Studio' };

export default function VoiceoverPage() {
  return <VoiceoverWorkspace />;
}
