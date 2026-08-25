import type { Metadata } from 'next';
import StageWorkspace from '../_components/stage-workspace';
import { getStudioStage } from '../_lib/stages';

export const metadata: Metadata = { title: 'Audio — Arclane Creator Studio' };

export default function AudioPage() {
  return <StageWorkspace stage={getStudioStage('audio')} />;
}
