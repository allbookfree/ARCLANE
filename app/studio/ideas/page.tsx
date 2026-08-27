import type { Metadata } from 'next';
import StudioRouter from '../_components/studio-router';

export const metadata: Metadata = { title: 'Ideas — Arclane Creator Studio' };

export default function IdeasPage() {
  return <StudioRouter initialView="ideas" />;
}
