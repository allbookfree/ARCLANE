import type { Metadata } from 'next';
import StudioRouter from '../_components/studio-router';

export const metadata: Metadata = { title: 'Audio — Arclane Creator Studio' };

export default function AudioPage() {
  return <StudioRouter initialView="audio" />;
}
