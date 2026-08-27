'use client';

import Link from 'next/link';
import { defaultChannels } from '../_lib/channels';
import { studioNavigate } from '../_lib/navigation';

export default function StudioOverview() {
  return (
    <main className="studio-hub">
      <header className="studio-hub-header">
        <Link className="studio-hub-brand" href="/">
          <span>A</span>
          <strong>ARCLANE</strong>
          <i>/</i>
          <small>Studio</small>
        </Link>
        <Link className="studio-hub-back" href="/">
          Website ↗
        </Link>
      </header>

      <div className="studio-hub-container">
        <section className="studio-hub-hero">
          <div className="studio-hub-pill">
            <span /> Channel Workspaces
          </div>
          <h1>Creator Studio</h1>
          <p>Select a channel to enter its dedicated production environment.</p>
        </section>

        <section className="channel-grid" aria-label="Available Channels">
          {defaultChannels.map((channel) => (
            <article className="channel-card" key={channel.id}>
              <div className="channel-card-head">
                <div className="channel-mark">{channel.code}</div>
                <div className="channel-status">
                  <span className="status-dot" />
                  Active
                </div>
              </div>

              <div className="channel-card-body">
                <span className="channel-category">{channel.niche}</span>
                <h2>{channel.name}</h2>
                <p>{channel.description}</p>
              </div>

              <div className="channel-tags">
                <span>{channel.format}</span>
                <span>{channel.stagesCount} Stages</span>
                <span>{channel.language}</span>
              </div>

              <Link
                href={channel.route}
                className="channel-action-btn"
                onClick={(e) => studioNavigate(channel.route, e)}
              >
                <span>Open Studio</span>
                <i>→</i>
              </Link>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}



