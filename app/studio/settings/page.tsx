import type { Metadata } from 'next';
import StudioRouter from '../_components/studio-router';

export const metadata: Metadata = {
  title: 'Settings — Arclane Creator Studio',
};

export default function SettingsPage() {
  return <StudioRouter initialView="settings" />;
}
