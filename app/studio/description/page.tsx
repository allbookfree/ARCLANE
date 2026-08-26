import type { Metadata } from 'next';
import DescriptionWorkspace from '../_components/description-workspace';
import './description.css';

export const metadata: Metadata = { title: 'Description — Arclane Creator Studio' };

export default function DescriptionPage() {
  return <DescriptionWorkspace />;
}
