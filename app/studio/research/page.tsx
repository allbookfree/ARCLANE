import type { Metadata } from 'next';
import ResearchWorkspace from '../_components/research-workspace';

export const metadata: Metadata = { title: 'Research — Arclane Creator Studio' };

export default function ResearchPage() {
  return <ResearchWorkspace />;
}
