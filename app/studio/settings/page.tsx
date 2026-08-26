import type { Metadata } from 'next';
import StudioSidebar from '../_components/studio-sidebar';
import ApiProviderSettings from './api-provider-settings';
import NewVideoReset from './new-video-reset';
import ResearchToolSettings from './research-tool-settings';

export const metadata: Metadata = {
  title: 'Settings — Arclane Creator Studio',
};

export default function SettingsPage() {
  return (
    <main className="settings-shell">
      <StudioSidebar settingsActive />

      <section className="settings-main">
        <header className="module-topbar">
          <div><span>Creator Studio</span><i>/</i><strong>Settings</strong></div>
          <div className="module-profile"><span>Workspace 01</span><i>YC</i></div>
        </header>

        <div className="settings-content"><ApiProviderSettings /><ResearchToolSettings /><NewVideoReset /></div>
      </section>
    </main>
  );
}
