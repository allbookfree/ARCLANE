import type { Metadata } from 'next';
import MemoryWorkspace from '../_components/memory-workspace';

export const metadata: Metadata = { title: 'Idea Memory — Arclane Creator Studio' };

export default function MemoryPage() {
  return <MemoryWorkspace />;
}
