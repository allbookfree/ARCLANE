import type { Metadata } from 'next';
import StageWorkspace from '../_components/stage-workspace';
import { getStudioStage } from '../_lib/stages';

export const metadata: Metadata = { title: 'Description — Arclane Creator Studio' };

export default function DescriptionPage() {
  return <StageWorkspace stage={getStudioStage('description')} />;
}
