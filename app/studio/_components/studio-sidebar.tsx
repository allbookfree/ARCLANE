import type { StudioStage } from '../_lib/stages';
import { studioStages } from '../_lib/stages';
import { studioNavigate } from '../_lib/navigation';

type StudioSidebarProps = {
  activeStageId?: StudioStage['id'];
  memoryActive?: boolean;
  settingsActive?: boolean;
};

export default function StudioSidebar({ activeStageId, memoryActive = false, settingsActive = false }: StudioSidebarProps) {
  return (
    <aside className="module-rail">
      <a className="module-brand" href="/" aria-label="Back to Arclane homepage">
        <span>A</span>
        <div><strong>ARCLANE</strong><small>Creator Studio</small></div>
      </a>

      <a
        className="module-overview-link"
        href="/studio"
        onClick={(e) => studioNavigate('/studio', e)}
      >
        <span aria-hidden="true">⌂</span> Studio overview
      </a>

      <div className="module-sequence-label">Production sequence</div>
      <div className="module-sequence" aria-label="Production sequence">
        {studioStages.map((item) => (
          <a
            className={item.id === activeStageId ? 'active' : ''}
            href={`/studio/${item.id}`}
            aria-current={item.id === activeStageId ? 'page' : undefined}
            key={item.id}
            onClick={(e) => studioNavigate(`/studio/${item.id}`, e)}
          >
            <span>{item.number}</span>
            <strong>{item.title}</strong>
            <i />
          </a>
        ))}
      </div>

      <a
        className={`module-settings-link${memoryActive ? ' active' : ''}`}
        href="/studio/memory"
        aria-current={memoryActive ? 'page' : undefined}
        onClick={(e) => studioNavigate('/studio/memory', e)}
      >
        <span aria-hidden="true">▤</span>
        <strong>Idea Memory</strong>
      </a>

      <a
        className="module-settings-link"
        href="/studio/settings#new-video-reset"
        style={{ marginTop: 2 }}
        onClick={(e) => studioNavigate('/studio/settings#new-video-reset', e)}
      >
        <span aria-hidden="true">＋</span>
        <strong>New video</strong>
      </a>
      <a
        className={`module-settings-link${settingsActive ? ' active' : ''}`}
        href="/studio/settings"
        aria-current={settingsActive ? 'page' : undefined}
        style={{ marginTop: 2 }}
        onClick={(e) => studioNavigate('/studio/settings', e)}
      >
        <span aria-hidden="true">⚙</span>
        <strong>Settings</strong>
      </a>
    </aside>
  );
}
