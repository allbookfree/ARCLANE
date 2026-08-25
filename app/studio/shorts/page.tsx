import type { Metadata } from 'next';
import StageWorkspace from '../_components/stage-workspace';
import { getStudioStage } from '../_lib/stages';

export const metadata: Metadata = { title: 'Shorts — Arclane Creator Studio' };

export default function ShortsPage() {
  return <StageWorkspace stage={getStudioStage('shorts')} />;
}
