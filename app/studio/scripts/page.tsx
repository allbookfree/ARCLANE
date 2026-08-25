import type { Metadata } from 'next';
import ScriptWorkspace from '../_components/script-workspace';

export const metadata: Metadata = { title: 'Scripts — Arclane Creator Studio' };

export default function ScriptsPage() {
  return <ScriptWorkspace />;
}
