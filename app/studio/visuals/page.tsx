import type { Metadata } from 'next';
import StudioRouter from '../_components/studio-router';

export const metadata: Metadata = { title: 'Visuals — Arclane Creator Studio' };

export default function VisualsPage() {
  return <StudioRouter initialView="visuals" />;
}
