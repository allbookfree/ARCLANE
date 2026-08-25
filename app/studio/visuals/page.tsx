import type { Metadata } from 'next';
import VisualsWorkspace from '../_components/visuals-workspace';

export const metadata: Metadata = { title: 'Visuals — Arclane Creator Studio' };

export default function VisualsPage() {
  return <VisualsWorkspace />;
}
