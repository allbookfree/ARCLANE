import type { Metadata } from 'next';
import StudioRouter from '../_components/studio-router';

export const metadata: Metadata = { title: 'Description — Arclane Creator Studio' };

export default function DescriptionPage() {
  return <StudioRouter initialView="description" />;
}
