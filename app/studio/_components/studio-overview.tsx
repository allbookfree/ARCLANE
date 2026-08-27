'use client';

import { defaultChannels } from '../_lib/channels';
import { studioNavigate } from '../_lib/navigation';

export default function StudioOverview() {
  return (
    <main className="studio-hub">
      <header className="studio-hub-header">
        <a className="studio-hub-brand" href="/" onClick={(e) => { e.preventDefault(); window.location.assign('/'); }}>
          <span>A</span>
          <strong>ARCLANE</strong>
          <small>Channel Hub</small>
        </a>
        <a className="studio-hub-back" href="/" onClick={(e) => { e.preventDefault(); window.location.assign('/'); }}>
          Back to website ↗
        </a>
      </header>

      <section className="studio-hub-hero">
        <div className="studio-hub-tag">
          <span>◆</span> Multi-Channel Production Fleet · Faceless YouTube Engine
        </div>
        <h1>Faceless Channel Studios.</h1>
        <p>
          Each box is an independent production studio customized for a specific channel niche.
          Enter a channel workspace below to run its connected 9-stage workflow from topic discovery to final upload package.
        </p>

        <div className="studio-hub-stats">
          <div className="studio-hub-stat">
            <strong>1 Active</strong>
            <span>Production Channel</span>
          </div>
          <div className="studio-hub-stat">
            <strong>9 Stages</strong>
            <span>Per Studio Workspace</span>
          </div>
          <div className="studio-hub-stat">
            <strong>0ms</strong>
            <span>Instant SPA Engine</span>
          </div>
          <div className="studio-hub-stat">
            <strong>10–12</strong>
            <span>Multi-Niche Capacity</span>
          </div>
        </div>
      </section>

      <section className="studio-hub-section" aria-label="Channel Workspaces">
        <div className="studio-hub-section-header">
          <h2>Your Channel Workspaces</h2>
          <span>Select a channel studio to enter its production pipeline</span>
        </div>

        <div className="channel-grid">
          {defaultChannels.map((channel) => {
            const isActive = channel.status === 'active';
            return (
              <article className={`channel-box ${isActive ? 'active' : 'upcoming'}`} key={channel.id}>
                <div className="channel-box-top">
                  <div className="channel-avatar">{channel.code}</div>
                  <span className="channel-badge">{channel.badge || (isActive ? '● Active Studio' : 'Expansion Slot')}</span>
                </div>

                <span className="channel-niche-pill">{channel.niche}</span>
                <h3>{channel.name}</h3>
                <p className="channel-tagline">{channel.tagline}</p>
                <p className="channel-description">{channel.description}</p>

                <div className="channel-specs">
                  <div className="channel-spec-row">
                    <span>Niche Standard</span>
                    <strong>{channel.systemPromptSummary}</strong>
                  </div>
                  <div className="channel-spec-row">
                    <span>Video Format</span>
                    <strong>{channel.format}</strong>
                  </div>
                  <div className="channel-spec-row">
                    <span>Workflow</span>
                    <strong>{channel.stagesCount} Connected Production Stages</strong>
                  </div>
                </div>

                {isActive ? (
                  <button
                    type="button"
                    className="channel-enter-btn"
                    onClick={(e) => studioNavigate(channel.route, e)}
                  >
                    <span>Enter Channel Studio</span>
                    <i>→</i>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="channel-enter-btn"
                    disabled
                  >
                    <span>Channel Slot Reserved</span>
                  </button>
                )}
              </article>
            );
          })}

          <article className="channel-add-box">
            <div className="channel-add-icon">＋</div>
            <h3>Add New Channel Niche</h3>
            <p>
              Scale your faceless empire to 10–12 independent channel studios under one unified Arclane roof.
              Each channel operates with its own locked audience tone, memory, and stage automation.
            </p>
            <span className="channel-add-badge">Multi-Channel Expansion Ready</span>
          </article>
        </div>
      </section>
    </main>
  );
}

