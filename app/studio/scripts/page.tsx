import type { Metadata } from 'next';
import StudioRouter from '../_components/studio-router';

export const metadata: Metadata = { title: 'Scripts — Arclane Creator Studio' };

export default function ScriptsPage() {
  return <StudioRouter initialView="scripts" />;
}
