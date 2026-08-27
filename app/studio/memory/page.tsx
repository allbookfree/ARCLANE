import type { Metadata } from 'next';
import StudioRouter from '../_components/studio-router';

export const metadata: Metadata = { title: 'Idea Memory — Arclane Creator Studio' };

export default function MemoryPage() {
  return <StudioRouter initialView="memory" />;
}
