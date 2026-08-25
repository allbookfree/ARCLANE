import Link from 'next/link';
import type { StudioStage } from '../_lib/stages';
import { studioStages } from '../_lib/stages';

type StudioSidebarProps = {
  activeStageId?: StudioStage['id'];
  memoryActive?: boolean;
  settingsActive?: boolean;
};

export default function StudioSidebar({ activeStageId, memoryActive = false, settingsActive = false }: StudioSidebarProps) {
  return (
    <aside className="module-rail">
      <Link className="module-brand" href="/" aria-label="Back to Arclane homepage">
        <span>A</span>
        <div><strong>ARCLANE</strong><small>Creator Studio</small></div>
      </Link>

      <Link className="module-overview-link" href="/studio">
        <span aria-hidden="true">⌂</span> Studio overview
      </Link>

      <div className="module-sequence-label">Production sequence</div>
      <div className="module-sequence" aria-label="Production sequence">
        {studioStages.map((item) => (
          <Link
            className={item.id === activeStageId ? 'active' : ''}
            href={`/studio/${item.id}`}
            aria-current={item.id === activeStageId ? 'page' : undefined}
            key={item.id}
          >
            <span>{item.number}</span>
            <strong>{item.title}</strong>
            <i />
          </Link>
        ))}
      </div>

      <Link
        className={`module-settings-link${memoryActive ? ' active' : ''}`}
        href="/studio/memory"
        aria-current={memoryActive ? 'page' : undefined}
      >
        <span aria-hidden="true">▤</span>
        <strong>Idea Memory</strong>
      </Link>

      <Link
        className={`module-settings-link${settingsActive ? ' active' : ''}`}
        href="/studio/settings"
        aria-current={settingsActive ? 'page' : undefined}
        style={{ marginTop: 2 }}
      >
        <span aria-hidden="true">⚙</span>
        <strong>Settings</strong>
      </Link>
    </aside>
  );
}
