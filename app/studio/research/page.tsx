import type { Metadata } from 'next';
import StudioRouter from '../_components/studio-router';

export const metadata: Metadata = { title: 'Research — Arclane Creator Studio' };

export default function ResearchPage() {
  return <StudioRouter initialView="research" />;
}
