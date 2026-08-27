'use client';

import StudioSidebar from './studio-sidebar';
import ApiProviderSettings from '../settings/api-provider-settings';
import NewVideoReset from '../settings/new-video-reset';
import ResearchToolSettings from '../settings/research-tool-settings';

export default function SettingsWorkspace() {
  return (
    <main className="settings-shell">
      <StudioSidebar settingsActive />

      <section className="settings-main">
        <header className="module-topbar">
          <div><span>Creator Studio</span><i>/</i><strong>Settings</strong></div>
          <div className="module-profile"><span>Workspace 01</span><i>YC</i></div>
        </header>

        <div className="settings-content">
          <ApiProviderSettings />
          <ResearchToolSettings />
          <NewVideoReset />
        </div>
      </section>
    </main>
  );
}
