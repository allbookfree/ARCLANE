import type { Metadata } from 'next';
import IdeasWorkspace from '../_components/ideas-workspace';

export const metadata: Metadata = { title: 'Ideas — Arclane Creator Studio' };

export default function IdeasPage() {
  return <IdeasWorkspace />;
}
