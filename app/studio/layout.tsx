import './automation.css';
import './overview.css';
import './ideas/ideas.css';
import './ideas/ideas-focus.css';
import './research/research.css';
import './research/research-handoff.css';
import './research/research-evidence-modes.css';
import './research/research-document-pro.css';
import './research/research-handoff-gate-pro.css';
import './scripts/script.css';
import './scripts/script-review.css';
import './voiceover/voiceover.css';
import './visuals/visuals.css';
import './audio/audio.css';
import './thumbnails/thumbnails.css';
import './description/description.css';
import './shorts/shorts.css';
import './memory/memory.css';
import './settings/research-tools.css';
import './settings/research-tools-balance.css';
import './settings/new-video-reset.css';
import './settings/backup-restore.css';
import './access-gate.css';
import AccessGate from './_components/access-gate';

export default function StudioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AccessGate>
      {children}
    </AccessGate>
  );
}
