import type { Metadata } from 'next';
import AudioWorkspace from '../_components/audio-workspace';
import './audio.css';

export const metadata: Metadata = { title: 'Audio — Arclane Creator Studio' };

export default function AudioPage() {
  return <AudioWorkspace />;
}
