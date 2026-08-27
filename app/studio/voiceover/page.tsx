import type { Metadata } from 'next';
import StudioRouter from '../_components/studio-router';

export const metadata: Metadata = { title: 'Voiceover — Arclane Creator Studio' };

export default function VoiceoverPage() {
  return <StudioRouter initialView="voiceover" />;
}
