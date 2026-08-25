import type { Metadata } from 'next';
import ThumbnailWorkspace from '../_components/thumbnail-workspace';
import './thumbnails.css';

export const metadata: Metadata = { title: 'Thumbnails — Arclane Creator Studio' };

export default function ThumbnailsPage() {
  return <ThumbnailWorkspace />;
}