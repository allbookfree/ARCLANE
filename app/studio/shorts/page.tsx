import type { Metadata } from 'next';
import StudioRouter from '../_components/studio-router';

export const metadata: Metadata = { title: 'Shorts — Arclane Creator Studio' };

export default function ShortsPage() {
  return <StudioRouter initialView="shorts" />;
}
