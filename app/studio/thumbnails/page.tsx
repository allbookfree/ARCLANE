import type { Metadata } from 'next';
import StageWorkspace from '../_components/stage-workspace';
import { getStudioStage } from '../_lib/stages';

export const metadata: Metadata = { title: 'Thumbnails — Arclane Creator Studio' };

export default function ThumbnailsPage() {
  return <StageWorkspace stage={getStudioStage('thumbnails')} />;
}
