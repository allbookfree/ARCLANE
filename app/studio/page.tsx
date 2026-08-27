import type { Metadata } from 'next';
import StudioRouter from './_components/studio-router';

export const metadata: Metadata = {
  title: 'Creator Studio — Arclane',
  description: 'A connected AI production workflow for the Global Everyday History channel.',
};

export default function StudioPage() {
  return <StudioRouter initialView="overview" />;
}

