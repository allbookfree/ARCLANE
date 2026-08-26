import type { Metadata } from 'next';
import ShortsWorkspace from '../_components/shorts-workspace';
import './shorts.css';

export const metadata: Metadata = { title: 'Shorts — Arclane Creator Studio' };

export default function ShortsPage() {
  return <ShortsWorkspace />;
}
