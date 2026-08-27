import type { Metadata } from 'next';
import StudioRouter from '../_components/studio-router';

export const metadata: Metadata = { title: 'Thumbnails — Arclane Creator Studio' };

export default function ThumbnailsPage() {
  return <StudioRouter initialView="thumbnails" />;
}