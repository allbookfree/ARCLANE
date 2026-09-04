'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { executeNewVideoReset, exportProjectBackup } from '../_components/new-video-modal';

type JsonRecord = Record<string, unknown>;

const workflowStorageKey = 'arclane.creator-workflow.v1';
const workflowChangeEvent = 'arclane:workflow-reset';

function parseObject(value: string | null): JsonRecord {
  try {
    const parsed = value ? JSON.parse(value) as unknown : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : {};
  } catch {
    return {};
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(workflowChangeEvent, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(workflowChangeEvent, onChange);
  };
}

function getWorkflowSnapshot() {
  return window.localStorage.getItem(workflowStorageKey) ?? '{}';
}

function getServerSnapshot() {
  return '{}';
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export default function NewVideoReset() {
  const rawWorkflow = useSyncExternalStore(subscribe, getWorkflowSnapshot, getServerSnapshot);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState('');
  const workflow = useMemo(() => parseObject(rawWorkflow), [rawWorkflow]);
  const stages = workflow.stages && typeof workflow.stages === 'object' && !Array.isArray(workflow.stages)
    ? workflow.stages as JsonRecord : {};
  const batches = Array.isArray(workflow.ideaBatches) ? workflow.ideaBatches : [];
  const savedIdeas = Array.isArray(workflow.savedIdeas) ? workflow.savedIdeas : [];
  const selectedIdea = workflow.selectedIdea && typeof workflow.selectedIdea === 'object' && !Array.isArray(workflow.selectedIdea)
    ? workflow.selectedIdea as JsonRecord : null;
  const selectedTitle = text(selectedIdea?.title);
  const hasCurrentProject = Boolean(selectedIdea || Object.keys(stages).length || batches.length);

  function downloadBackup() {
    exportProjectBackup(workflow);
  }

  function resetCurrentVideo() {
    try {
      // One shared, explicit-registry reset: production content is cleared,
      // Idea Memory/API connections/preferences stay, the current idea is
      // archived as "Video made" and the workspace event fires.
      executeNewVideoReset(workflow);
    } catch {
      setError('The browser could not start a clean video safely. Nothing in Idea Memory or your API connections was intentionally removed.');
    }
  }

  return (
    <section className="new-video-settings" id="new-video-reset" aria-labelledby="new-video-title">
      <header>
        <div><p>Workspace reset</p><h2 id="new-video-title">Start a new video cleanly.</h2><span>Remove the current production so its Idea, Research, Script and later outputs cannot influence the next video.</span></div>
        <strong><i /> Safe two-step action</strong>
      </header>

      <div className="new-video-card">
        <div className="new-video-mark">NEW</div>
        <div className="new-video-copy"><strong>{hasCurrentProject ? selectedTitle || 'Current video workspace' : 'The workspace is already clean'}</strong><p>{hasCurrentProject ? `${Object.keys(stages).length} completed section${Object.keys(stages).length === 1 ? '' : 's'} and ${batches.length} generated Idea batch${batches.length === 1 ? '' : 'es'} will be removed.` : 'There is no selected Idea or generated production to remove.'}</p></div>
        <div className="new-video-kept"><span>KEPT SAFE</span><strong>API connections &amp; research key</strong><strong>{savedIdeas.length} Memory idea{savedIdeas.length === 1 ? '' : 's'}</strong></div>
        <button type="button" onClick={() => { setError(''); setDialogOpen(true); }}>Start New Video Project</button>
      </div>

      <div className="new-video-policy"><span>✓</span><p><strong>Duplicate protection stays active</strong><small>The current selected Idea is automatically marked “Video made” in Memory before the production is cleared. API keys, including the research key, remain on this device.</small></p></div>
      {error ? <p className="new-video-error" role="alert">{error}</p> : null}

      {dialogOpen ? <div className="new-video-dialog-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}>
        <section className="new-video-dialog" role="dialog" aria-modal="true" aria-labelledby="new-video-confirm-title">
          <div className="new-video-dialog-mark">!</div><p>Start another production</p><h2 id="new-video-confirm-title">Delete this video workspace?</h2>
          <span>Idea, Research, Script, Voiceover, Visuals, Audio, Thumbnail, Description and Shorts will be removed from this device. This cannot be undone inside the website.</span>
          <div className="new-video-preserve"><strong>Will remain</strong><span>✓ API connections and keys</span><span>✓ Idea Memory and duplicate protection</span><span>✓ Current Idea marked as Video made</span></div>
          <button className="new-video-backup" type="button" onClick={downloadBackup}>Download project backup first</button>
          <footer><button type="button" onClick={() => setDialogOpen(false)}>Cancel</button><button type="button" onClick={resetCurrentVideo}>Delete &amp; open clean Ideas</button></footer>
        </section>
      </div> : null}
    </section>
  );
}
