'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { StudioStageId } from '../_lib/stages';
import { studioNavigate } from '../_lib/navigation';
import StudioSidebar from './studio-sidebar';

type Idea = {
  id: string;
  title: string;
  premise: string;
  region: string;
  period: string;
  everydayLens: string;
  batchId?: string;
};
type Source = { title: string; url: string };
type StageRecord = {
  content: string;
  ideas?: Idea[];
  sources?: Source[];
  grounded?: boolean;
  providerName: string;
  modelName: string;
  updatedAt: string;
};
type IdeaBatch = {
  id: string;
  ideas: Idea[];
  content: string;
  sources?: Source[];
  grounded?: boolean;
  providerName: string;
  modelName: string;
  createdAt: string;
};
type IdeaStatus = 'saved' | 'used';
type SavedIdea = { key: string; idea: Idea; savedAt: string; status: IdeaStatus };
type WorkflowState = {
  selectedIdea?: Idea;
  stages: Partial<Record<StudioStageId, StageRecord>>;
  ideaBatches?: IdeaBatch[];
  savedIdeas?: SavedIdea[];
};
type IdeaLibraryFile = {
  schema: 'arclane-idea-memory';
  version: 1;
  exportedAt: string;
  channel: 'Global Everyday History';
  ideas: SavedIdea[];
};
type StatusFilter = 'all' | IdeaStatus;

const workflowStorageKey = 'arclane.creator-workflow.v1';
const initialWorkflow: WorkflowState = { stages: {}, ideaBatches: [], savedIdeas: [] };
const pageSize = 5;

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeIdea(value: unknown, index: number): Idea {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    id: stringValue(item.id) || `idea-${index + 1}`,
    title: stringValue(item.title) || stringValue(item.workingTitle) || `Untitled idea ${index + 1}`,
    premise: stringValue(item.premise) || stringValue(item.concept),
    region: stringValue(item.region) || stringValue(item.place),
    period: stringValue(item.period) || stringValue(item.timePeriod),
    everydayLens: stringValue(item.everydayLens) || stringValue(item.everydayTheme) || 'Everyday life',
    batchId: stringValue(item.batchId) || undefined,
  };
}

function ideaFingerprint(idea: Idea) {
  const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();
  return [normalize(idea.title), normalize(idea.region), normalize(idea.period)].join('|');
}

function normalizeSavedIdea(value: unknown, index: number): SavedIdea | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const idea = normalizeIdea(item.idea ?? value, index);
  if (!idea.title || !idea.premise) return null;
  return {
    key: ideaFingerprint(idea),
    idea,
    savedAt: stringValue(item.savedAt) || new Date().toISOString(),
    status: item.status === 'used' ? 'used' : 'saved',
  };
}

function dedupeSavedIdeas(items: SavedIdea[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = ideaFingerprint(item.idea);
    if (seen.has(key)) return false;
    seen.add(key);
    item.key = key;
    return true;
  });
}

export default function MemoryWorkspace() {
  const [hydrated, setHydrated] = useState(false);
  const [workflow, setWorkflow] = useState<WorkflowState>(initialWorkflow);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [copiedKey, setCopiedKey] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SavedIdea | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const refresh = () => {
      const savedWorkflow = readJson<WorkflowState>(workflowStorageKey, initialWorkflow);
      const savedIdeas = dedupeSavedIdeas((savedWorkflow.savedIdeas ?? [])
        .map(normalizeSavedIdea).filter((item): item is SavedIdea => Boolean(item)));
      setWorkflow({
        ...savedWorkflow,
        stages: savedWorkflow.stages ?? {},
        ideaBatches: savedWorkflow.ideaBatches ?? [],
        savedIdeas,
      });
    };
    refresh();
    setHydrated(true);
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  const savedIdeas = workflow.savedIdeas ?? [];
  const usedCount = savedIdeas.filter((item) => item.status === 'used').length;
  const filteredIdeas = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return [...savedIdeas]
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
      .filter((item) => statusFilter === 'all' || item.status === statusFilter)
      .filter((item) => !normalizedQuery || [
        item.idea.title,
        item.idea.premise,
        item.idea.region,
        item.idea.period,
        item.idea.everydayLens,
      ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
  }, [query, savedIdeas, statusFilter]);
  const visibleIdeas = filteredIdeas.slice(0, visibleCount);
  const hasMore = visibleCount < filteredIdeas.length;

  function persistWorkflow(next: WorkflowState) {
    try {
      window.localStorage.setItem(workflowStorageKey, JSON.stringify(next));
      setWorkflow(next);
      return true;
    } catch {
      setError('This browser could not save more memory data. Download a backup, then remove older browser data before continuing.');
      return false;
    }
  }

  function resetList(nextQuery = query, nextStatus = statusFilter) {
    setQuery(nextQuery);
    setStatusFilter(nextStatus);
    setVisibleCount(pageSize);
  }

  function toggleStatus(saved: SavedIdea) {
    const nextStatus: IdeaStatus = saved.status === 'used' ? 'saved' : 'used';
    const nextSaved = savedIdeas.map((item) => item.key === saved.key ? { ...item, status: nextStatus } : item);
    if (persistWorkflow({ ...workflow, savedIdeas: nextSaved })) {
      setError('');
      setNotice(nextStatus === 'used'
        ? `Marked “${saved.idea.title}” as a completed video.`
        : `Moved “${saved.idea.title}” back to reserved ideas.`);
    }
  }

  async function copyIdea(saved: SavedIdea) {
    const text = [
      saved.idea.title,
      saved.idea.premise,
      `Region: ${saved.idea.region || 'Global'}`,
      `Period: ${saved.idea.period || 'Any period'}`,
      `Video type: ${saved.idea.everydayLens || 'Everyday life'}`,
    ].filter(Boolean).join('\n\n');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const field = document.createElement('textarea');
        field.value = text;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        if (!copied) throw new Error('Copy was blocked');
      }
      setCopiedKey(saved.key);
      setError('');
      setNotice(`Copied “${saved.idea.title}” to the clipboard.`);
      window.setTimeout(() => setCopiedKey((current) => current === saved.key ? '' : current), 1800);
    } catch {
      setError('This browser blocked clipboard access. Please allow clipboard permission and try again.');
    }
  }

  function useIdea(saved: SavedIdea) {
    const batches = workflow.ideaBatches ?? [];
    const sourceBatch = batches.find((batch) => batch.id === saved.idea.batchId);
    const now = new Date().toISOString();
    const batch: IdeaBatch = sourceBatch ?? {
      id: `memory-${Date.now()}`,
      ideas: [{ ...saved.idea }],
      content: JSON.stringify({ ideas: [saved.idea] }),
      grounded: false,
      providerName: 'Idea Memory',
      modelName: 'Portable library',
      createdAt: now,
    };
    const selectedIdea = { ...saved.idea, batchId: batch.id };
    const ideaRecord: StageRecord = {
      content: batch.content,
      ideas: batch.ideas,
      sources: batch.sources,
      grounded: batch.grounded,
      providerName: batch.providerName,
      modelName: batch.modelName,
      updatedAt: batch.createdAt,
    };
    const next: WorkflowState = {
      ...workflow,
      selectedIdea,
      stages: { ideas: ideaRecord },
      ideaBatches: batches.some((item) => item.id === batch.id) ? batches : [batch, ...batches],
      savedIdeas,
    };
    if (persistWorkflow(next)) studioNavigate('/studio/ideas');
  }

  function removeIdea() {
    if (!deleteTarget) return;
    const nextSaved = savedIdeas.filter((item) => item.key !== deleteTarget.key);
    const title = deleteTarget.idea.title;
    if (persistWorkflow({ ...workflow, savedIdeas: nextSaved })) {
      setError('');
      setNotice(`Removed “${title}” from Idea Memory. It can now appear in future discovery again.`);
      setVisibleCount((current) => Math.max(pageSize, Math.min(current, nextSaved.length || pageSize)));
    }
    setDeleteTarget(null);
  }

  function exportMemory() {
    if (!savedIdeas.length) {
      setError('Save at least one idea before downloading Idea Memory.');
      return;
    }
    const payload: IdeaLibraryFile = {
      schema: 'arclane-idea-memory',
      version: 1,
      exportedAt: new Date().toISOString(),
      channel: 'Global Everyday History',
      ideas: savedIdeas.map((item) => ({
        ...item,
        key: ideaFingerprint(item.idea),
        idea: { ...item.idea, batchId: undefined },
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `arclane-idea-memory-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setError('');
    setNotice(`Downloaded ${savedIdeas.length} remembered idea${savedIdeas.length === 1 ? '' : 's'}. API keys are never included.`);
  }

  async function importMemory(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5_000_000) {
      setError('Idea Memory files must be smaller than 5 MB.');
      return;
    }
    try {
      const parsed = JSON.parse(await file.text()) as Partial<IdeaLibraryFile>;
      if (parsed.schema !== 'arclane-idea-memory' || parsed.version !== 1 || !Array.isArray(parsed.ideas)) {
        throw new Error('This is not a valid Arclane Idea Memory file.');
      }
      if (parsed.ideas.length > 5000) throw new Error('This Idea Memory file contains too many records.');
      const imported = parsed.ideas.map(normalizeSavedIdea).filter((item): item is SavedIdea => Boolean(item));
      if (!imported.length && parsed.ideas.length) throw new Error('No valid ideas were found in this file.');
      const merged = dedupeSavedIdeas([...savedIdeas, ...imported]);
      const added = merged.length - savedIdeas.length;
      if (persistWorkflow({ ...workflow, savedIdeas: merged })) {
        setError('');
        setNotice(added
          ? `Imported ${added} new idea${added === 1 ? '' : 's'}; duplicates were skipped automatically.`
          : 'Import complete. Every idea was already protected in this library.');
        resetList('', 'all');
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'The Idea Memory file could not be imported.');
    }
  }

  return (
    <main className="module-shell module-blue memory-shell">
      <StudioSidebar memoryActive />
      <section className="module-main">
        <header className="module-topbar">
          <div><span>Creator Studio</span><i>/</i><strong>Idea Memory</strong></div>
          <div className="module-profile"><span>Local workspace</span><i>YC</i></div>
        </header>

        <div className="module-content memory-content">
          <header className="memory-heading">
            <div><p>Long-term channel intelligence</p><h1>One library.<br />No repeated stories.</h1><span>Every saved subject stays protected from exact future repetition—separate from your daily Ideas workspace.</span></div>
            <div className="memory-stats" aria-label="Idea Memory summary">
              <div><strong>{hydrated ? savedIdeas.length : '—'}</strong><span>Total memory</span></div>
              <div><strong>{hydrated ? savedIdeas.length - usedCount : '—'}</strong><span>Reserved</span></div>
              <div><strong>{hydrated ? usedCount : '—'}</strong><span>Videos made</span></div>
            </div>
          </header>

          <section className="memory-backup">
            <div className="memory-backup-mark">▤</div>
            <div><p>Portable without a database</p><h2>Your channel memory belongs to you.</h2><span>Download a clean backup before changing computers, then import it here to restore duplicate protection.</span></div>
            <div className="memory-backup-actions">
              <button type="button" onClick={() => importInputRef.current?.click()}>↑ Import memory</button>
              <button className="primary" type="button" disabled={!savedIdeas.length} onClick={exportMemory}>↓ Download backup</button>
              <input ref={importInputRef} type="file" accept=".json,application/json" onChange={(event) => void importMemory(event)} />
            </div>
          </section>

          {error ? <p className="memory-message error" role="alert"><span>!</span>{error}</p> : null}
          {notice ? <p className="memory-message success" role="status"><span>✓</span>{notice}</p> : null}

          <section className="memory-library">
            <header>
              <div><p>Saved subjects</p><h2>Idea Library</h2><span>Only five records appear at first, keeping this workspace calm even after years of use.</span></div>
              <a href="/studio/ideas" onClick={(e) => studioNavigate('/studio/ideas', e)}>＋ Discover new ideas</a>
            </header>

            <div className="memory-toolbar">
              <label className="memory-search"><span>⌕</span><input value={query} onChange={(event) => resetList(event.target.value, statusFilter)} placeholder="Search title, place, period or video type" /></label>
              <div className="memory-filters" aria-label="Filter Idea Memory">
                <button className={statusFilter === 'all' ? 'active' : ''} type="button" onClick={() => resetList(query, 'all')}>All</button>
                <button className={statusFilter === 'saved' ? 'active' : ''} type="button" onClick={() => resetList(query, 'saved')}>Reserved</button>
                <button className={statusFilter === 'used' ? 'active' : ''} type="button" onClick={() => resetList(query, 'used')}>Video made</button>
              </div>
            </div>

            {savedIdeas.length ? (
              filteredIdeas.length ? (
                <>
                  <div className="memory-list">
                    {visibleIdeas.map((saved, index) => (
                      <article key={saved.key}>
                        <div className="memory-index">{String(index + 1).padStart(2, '0')}</div>
                        <div className="memory-record">
                          <div className="memory-record-top"><span className={saved.status === 'used' ? 'used' : ''}>{saved.status === 'used' ? '✓ Video made' : 'Reserved idea'}</span><small>Saved {new Date(saved.savedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</small></div>
                          <div className="memory-record-meta"><span>{saved.idea.region || 'Global'}</span><i>·</i><span>{saved.idea.period || 'Any period'}</span><i>·</i><span>{saved.idea.everydayLens || 'Everyday life'}</span></div>
                          <h3>{saved.idea.title}</h3>
                          <p>{saved.idea.premise}</p>
                        </div>
                        <footer>
                          <button type="button" onClick={() => toggleStatus(saved)}>{saved.status === 'used' ? 'Move to reserved' : 'Mark video made'}</button>
                          <button type="button" onClick={() => void copyIdea(saved)}>{copiedKey === saved.key ? '✓ Copied' : '⧉ Copy'}</button>
                          <button className="primary" type="button" onClick={() => useIdea(saved)}>Use in Ideas →</button>
                          <button className="remove" type="button" onClick={() => setDeleteTarget(saved)}>Delete</button>
                        </footer>
                      </article>
                    ))}
                  </div>
                  <footer className="memory-pagination">
                    <span>Showing {visibleIdeas.length} of {filteredIdeas.length}</span>
                    <div>
                      {visibleCount > pageSize ? <button type="button" onClick={() => setVisibleCount(pageSize)}>Show first five</button> : null}
                      {hasMore ? <button className="primary" type="button" onClick={() => setVisibleCount((count) => count + pageSize)}>Show {Math.min(pageSize, filteredIdeas.length - visibleCount)} more <b>↓</b></button> : null}
                    </div>
                  </footer>
                </>
              ) : <div className="memory-empty"><span>⌕</span><strong>No matching ideas</strong><p>Try a different search phrase or status filter.</p><button type="button" onClick={() => resetList('', 'all')}>Clear filters</button></div>
            ) : <div className="memory-empty"><span>✦</span><strong>Your long-term memory starts with one saved idea.</strong><p>Generate ideas, then use Save on the subjects you want protected from future duplication.</p><a href="/studio/ideas" onClick={(e) => studioNavigate('/studio/ideas', e)}>Go to Ideas →</a></div>}
          </section>

          {deleteTarget ? (
            <div className="memory-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}>
              <article className="memory-dialog" role="dialog" aria-modal="true" aria-labelledby="memory-delete-title">
                <div>!</div><p>Idea Memory</p><h2 id="memory-delete-title">Remove this protected idea?</h2>
                <strong>{deleteTarget.idea.title}</strong>
                <span>After removal, this subject may appear in a future discovery batch again.</span>
                <footer><button type="button" autoFocus onClick={() => setDeleteTarget(null)}>Keep in memory</button><button className="danger" type="button" onClick={removeIdea}>Yes, remove idea</button></footer>
              </article>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
