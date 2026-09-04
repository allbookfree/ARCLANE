'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';

type JsonRecord = Record<string, unknown>;
type SavedIdea = { key?: string; idea?: unknown; savedAt?: string; status?: string };

const workflowStorageKey = 'arclane.creator-workflow.v1';
const connectionStorageKey = 'arclane.model-connections.v1';
const researchToolsStorageKey = 'arclane.research-tools.v1';
const researchBalanceStorageKey = 'arclane.research-tools.balance.v1';
const workflowChangeEvent = 'arclane:workflow-reset';
const workflowStateChangeEvent = 'arclane:workflow-changed';
// Explicit keep-list instead of substring guessing: connections/keys and every
// creator preference survive a New Video reset; anything else under the
// arclane.* prefix (including future production keys) is cleared. When a new
// preference key is added to the app, register it here.
const keptKeys = new Set([
  connectionStorageKey,
  researchToolsStorageKey,
  researchBalanceStorageKey,
  'arclane.workflow-models.v1',
  'arclane.ideas-web-search.v1',
  'arclane.research-web-search.v1',
  'arclane.research-external-evidence.v1',
  'arclane.script-duration.v1',
  'arclane.script-operation.v1',
  'arclane.script-translation.v1',
  'arclane.audio-mode.v1',
  'arclane.visual-duration.v1',
  'arclane.visual-modesty.v1',
  'arclane.shorts-length.v1',
]);

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
  window.addEventListener(workflowStateChangeEvent, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(workflowChangeEvent, onChange);
    window.removeEventListener(workflowStateChangeEvent, onChange);
  };
}

function getWorkflowSnapshot() {
  if (typeof window === 'undefined') return '{}';
  return window.localStorage.getItem(workflowStorageKey) ?? '{}';
}

function getServerSnapshot() {
  return '{}';
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function ideaFingerprint(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const idea = value as JsonRecord;
  const normalize = (entry: unknown) => text(entry).normalize('NFKC').toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();
  const title = normalize(idea.title);
  return title ? [title, normalize(idea.region), normalize(idea.period)].join('|') : '';
}

function normalizeArchivedIdea(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const idea = value as JsonRecord;
  const title = text(idea.title);
  if (!title) return null;
  const premise = text(idea.premise) || text(idea.concept) || '(No premise was recorded for this idea.)';
  return { ...idea, title, premise };
}

function preserveMemory(workflow: JsonRecord) {
  const selectedIdea = workflow.selectedIdea;
  const selectedKey = ideaFingerprint(selectedIdea);
  const original = (Array.isArray(workflow.savedIdeas) ? workflow.savedIdeas : [])
    .filter((item): item is SavedIdea => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  let found = false;
  const savedIdeas = original.map((item) => {
    const key = text(item.key) || ideaFingerprint(item.idea);
    if (!selectedKey || key !== selectedKey) return item;
    found = true;
    return { ...item, key: selectedKey, status: 'used' };
  });
  const archived = normalizeArchivedIdea(selectedIdea);
  if (archived && selectedKey && !found) {
    savedIdeas.unshift({ key: selectedKey, idea: archived, savedAt: new Date().toISOString(), status: 'used' });
  }
  return savedIdeas;
}

export function executeNewVideoReset(currentWorkflow?: JsonRecord) {
  const raw = typeof window !== 'undefined' ? window.localStorage.getItem(workflowStorageKey) : null;
  const workflow = currentWorkflow || parseObject(raw);
  const nextWorkflow = { stages: {}, ideaBatches: [], savedIdeas: preserveMemory(workflow) };

  window.localStorage.setItem(workflowStorageKey, JSON.stringify(nextWorkflow));

  const removableKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith('arclane.') || key === workflowStorageKey || keptKeys.has(key)) continue;
    removableKeys.push(key);
  }
  removableKeys.forEach((key) => window.localStorage.removeItem(key));

  window.dispatchEvent(new Event(workflowChangeEvent));
  window.dispatchEvent(new Event(workflowStateChangeEvent));
  window.location.assign('/studio/ideas');
}

export function exportProjectBackup(workflow: JsonRecord) {
  const backup = {
    schema: 'arclane-video-project-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    workflow,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `arclane-video-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

type NewVideoModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function NewVideoModal({ isOpen, onClose }: NewVideoModalProps) {
  const rawWorkflow = useSyncExternalStore(subscribe, getWorkflowSnapshot, getServerSnapshot);
  const [error, setError] = useState('');
  const workflow = useMemo(() => parseObject(rawWorkflow), [rawWorkflow]);
  const stages = workflow.stages && typeof workflow.stages === 'object' && !Array.isArray(workflow.stages)
    ? workflow.stages as JsonRecord : {};
  const selectedIdea = workflow.selectedIdea && typeof workflow.selectedIdea === 'object' && !Array.isArray(workflow.selectedIdea)
    ? workflow.selectedIdea as JsonRecord : null;
  const selectedTitle = text(selectedIdea?.title);

  if (!isOpen) return null;

  function handleReset() {
    try {
      setError('');
      executeNewVideoReset(workflow);
    } catch {
      setError('Could not reset video project cleanly. Your API keys and Idea Memory remain safe.');
    }
  }

  return (
    <div
      className="new-video-dialog-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="new-video-dialog" role="dialog" aria-modal="true" aria-labelledby="new-video-confirm-title">
        <div className="new-video-dialog-mark">!</div>
        <p>Start a New Video Project</p>
        <h2 id="new-video-confirm-title">
          {selectedTitle ? `Clear "${selectedTitle}" & Start New?` : 'Start a Clean Video Production?'}
        </h2>
        <span>
          All production content (Ideas, Research, Script, Voiceover, Visuals, Audio, Thumbnails, Description and Shorts) will be cleared from this workspace and local storage.
        </span>

        <div className="new-video-preserve">
          <strong>Safe &amp; Preserved</strong>
          <span>✓ API Connections, custom models &amp; keys remain 100% saved</span>
          <span>✓ Idea Memory &amp; duplicate protection remain safe</span>
          <span>✓ Current Idea will be archived as &ldquo;Video made&rdquo;</span>
        </div>

        {Object.keys(stages).length > 0 || selectedTitle ? (
          <button className="new-video-backup" type="button" onClick={() => exportProjectBackup(workflow)}>
            Download project backup first (JSON)
          </button>
        ) : null}

        {error ? <p className="new-video-error" role="alert">{error}</p> : null}

        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={handleReset}>
            Delete &amp; Open Clean Ideas
          </button>
        </footer>
      </section>
    </div>
  );
}
