'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StudioStage, StudioStageId } from '../_lib/stages';
import { getPreviousStage, studioStages } from '../_lib/stages';
import { studioNavigate } from '../_lib/navigation';
import StudioSidebar from './studio-sidebar';

type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'custom';
type AuthMethod = 'bearer' | 'api-key';

type Model = { id: string; name: string; description?: string };
type Selection = {
  providerId: ProviderId;
  providerName: string;
  models: Model[];
  apiKey: string;
  baseUrl?: string;
  modelsPath?: string;
  authMethod?: AuthMethod;
  headerName?: string;
  completionPath?: string;
};

type Idea = {
  id: string;
  title: string;
  premise: string;
  hook: string;
  region: string;
  period: string;
  everydayLens: string;
  whyItFits: string;
  evidenceNeeded: string;
  visualOpportunity: string;
};

type Source = { title: string; url: string };
type StageRecord = {
  content: string;
  ideas?: Idea[];
  sources?: Source[];
  grounded?: boolean;
  researchMode?: string;
  providerName: string;
  modelName: string;
  updatedAt: string;
};
type WorkflowState = {
  selectedIdea?: Idea;
  stages: Partial<Record<StudioStageId, StageRecord>>;
};
type ModelPreference = { providerId: ProviderId; modelId: string };

const connectionStorageKey = 'arclane.model-connections.v1';
const workflowStorageKey = 'arclane.creator-workflow.v1';
const modelPreferenceKey = 'arclane.workflow-models.v1';
const connectionChangeEvent = 'arclane:model-connections-changed';
const initialWorkflow: WorkflowState = { stages: {} };

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function readConnections() {
  const value = readJson<unknown>(connectionStorageKey, []);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Selection => {
    if (!item || typeof item !== 'object') return false;
    const selection = item as Partial<Selection>;
    return typeof selection.providerId === 'string'
      && typeof selection.providerName === 'string'
      && typeof selection.apiKey === 'string'
      && Array.isArray(selection.models);
  });
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseIdeas(content: string): Idea[] {
  try {
    const unfenced = content.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    const parsed = JSON.parse(start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { ideas?: unknown }).ideas)
        ? (parsed as { ideas: unknown[] }).ideas
        : [];

    return list.map((entry, index) => {
      const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
      return {
        id: stringValue(item.id) || `idea-${index + 1}`,
        title: stringValue(item.title) || `Untitled idea ${index + 1}`,
        premise: stringValue(item.premise),
        hook: stringValue(item.hook),
        region: stringValue(item.region),
        period: stringValue(item.period),
        everydayLens: stringValue(item.everydayLens),
        whyItFits: stringValue(item.whyItFits),
        evidenceNeeded: stringValue(item.evidenceNeeded),
        visualOpportunity: stringValue(item.visualOpportunity),
      };
    }).filter((idea) => idea.title);
  } catch {
    return [];
  }
}

function providerMark(providerId: ProviderId) {
  if (providerId === 'openai') return 'O';
  if (providerId === 'anthropic') return 'A';
  if (providerId === 'gemini') return 'G';
  return '+';
}

export default function StageWorkspace({ stage }: { stage: StudioStage }) {
  const previousStage = getPreviousStage(stage.id);
  const [hydrated, setHydrated] = useState(false);
  const [connections, setConnections] = useState<Selection[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowState>(initialWorkflow);
  const [providerId, setProviderId] = useState<ProviderId | ''>('');
  const [modelId, setModelId] = useState('');
  const [draft, setDraft] = useState('');
  const [direction, setDirection] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const autoRunHandled = useRef(false);

  const activeRecord = workflow.stages[stage.id];
  const activeConnection = connections.find((item) => item.providerId === providerId);
  const activeModel = activeConnection?.models.find((model) => model.id === modelId);
  const prerequisiteReady = stage.id === 'ideas'
    ? true
    : stage.id === 'research'
      ? Boolean(workflow.selectedIdea)
      : Boolean(previousStage && workflow.stages[previousStage.id]?.content.trim());

  const persistWorkflow = useCallback((next: WorkflowState) => {
    setWorkflow(next);
    window.localStorage.setItem(workflowStorageKey, JSON.stringify(next));
  }, []);

  const savePreference = useCallback((nextProviderId: ProviderId, nextModelId: string) => {
    const preferences = readJson<Partial<Record<StudioStageId, ModelPreference>>>(modelPreferenceKey, {});
    preferences[stage.id] = { providerId: nextProviderId, modelId: nextModelId };
    window.localStorage.setItem(modelPreferenceKey, JSON.stringify(preferences));
  }, [stage.id]);

  useEffect(() => {
    const refreshConnections = () => setConnections(readConnections());
    const savedWorkflow = readJson<WorkflowState>(workflowStorageKey, initialWorkflow);
    const preferences = readJson<Partial<Record<StudioStageId, ModelPreference>>>(modelPreferenceKey, {});
    const preference = preferences[stage.id];
    const available = readConnections();
    const preferredConnection = available.find((item) => item.providerId === preference?.providerId);
    const firstConnection = preferredConnection ?? available[0];
    const preferredModel = firstConnection?.models.find((model) => model.id === preference?.modelId);
    const firstModel = preferredModel ?? firstConnection?.models[0];

    setConnections(available);
    setWorkflow(savedWorkflow);
    setDraft(savedWorkflow.stages?.[stage.id]?.content ?? '');
    setProviderId(firstConnection?.providerId ?? '');
    setModelId(firstModel?.id ?? '');
    setHydrated(true);

    window.addEventListener('storage', refreshConnections);
    window.addEventListener(connectionChangeEvent, refreshConnections);
    return () => {
      window.removeEventListener('storage', refreshConnections);
      window.removeEventListener(connectionChangeEvent, refreshConnections);
    };
  }, [stage.id]);

  useEffect(() => {
    if (!providerId) return;
    const connection = connections.find((item) => item.providerId === providerId);
    if (!connection) {
      const first = connections[0];
      setProviderId(first?.providerId ?? '');
      setModelId(first?.models[0]?.id ?? '');
      return;
    }
    if (!connection.models.some((model) => model.id === modelId)) {
      const firstModel = connection.models[0];
      setModelId(firstModel?.id ?? '');
      if (firstModel) savePreference(connection.providerId, firstModel.id);
    }
  }, [connections, modelId, providerId, savePreference]);

  const itemCount = stage.id === 'ideas' ? activeRecord?.ideas?.length ?? 0 : activeRecord?.content ? 1 : 0;

  const generateStage = useCallback(async () => {
    const connection = connections.find((item) => item.providerId === providerId);
    const model = connection?.models.find((item) => item.id === modelId);
    if (!connection || !model) {
      setError('Connect an AI provider and choose a model before generating.');
      return;
    }
    if (!prerequisiteReady) {
      setError(previousStage
        ? `Complete ${previousStage.title} before running this stage.`
        : 'Choose an idea before starting research.');
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');
    try {
      const outputs = Object.fromEntries(Object.entries(workflow.stages).map(([id, record]) => [id, record?.content ?? '']));
      const response = await fetch('/api/automation/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: stage.id,
          provider: connection.providerId,
          providerName: connection.providerName,
          model: model.id,
          apiKey: connection.apiKey,
          baseUrl: connection.baseUrl,
          authMethod: connection.authMethod,
          headerName: connection.headerName,
          completionPath: connection.completionPath,
          extraInstructions: direction,
          context: { selectedIdea: workflow.selectedIdea, outputs },
        }),
      });
      const result = await response.json() as {
        output?: string;
        sources?: Source[];
        grounded?: boolean;
        researchMode?: string;
        error?: string;
      };
      if (!response.ok || !result.output) throw new Error(result.error || 'The model did not return usable output.');

      const ideas = stage.id === 'ideas' ? parseIdeas(result.output) : undefined;
      if (stage.id === 'ideas' && ideas?.length === 0) {
        throw new Error('The model returned text instead of the required idea format. Please regenerate with this or another model.');
      }

      const record: StageRecord = {
        content: result.output,
        ideas,
        sources: result.sources,
        grounded: result.grounded,
        researchMode: result.researchMode,
        providerName: connection.providerName,
        modelName: model.name,
        updatedAt: new Date().toISOString(),
      };
      const nextWorkflow: WorkflowState = {
        ...workflow,
        selectedIdea: stage.id === 'ideas' && workflow.selectedIdea
          ? ideas?.find((idea) => idea.id === workflow.selectedIdea?.id)
          : workflow.selectedIdea,
        stages: { ...workflow.stages, [stage.id]: record },
      };
      persistWorkflow(nextWorkflow);
      setDraft(result.output);
      setNotice(`${stage.title} generated with ${connection.providerName} · ${model.name}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Generation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [connections, direction, modelId, persistWorkflow, prerequisiteReady, previousStage, providerId, stage.id, stage.title, workflow]);

  useEffect(() => {
    if (!hydrated || loading || autoRunHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('run') !== '1') return;
    autoRunHandled.current = true;
    params.delete('run');
    const cleanUrl = `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', cleanUrl);
    if (prerequisiteReady && activeConnection && activeModel) void generateStage();
  }, [activeConnection, activeModel, generateStage, hydrated, loading, prerequisiteReady]);

  function changeProvider(nextProviderId: ProviderId) {
    const connection = connections.find((item) => item.providerId === nextProviderId);
    const nextModel = connection?.models[0];
    setProviderId(nextProviderId);
    setModelId(nextModel?.id ?? '');
    if (nextModel) savePreference(nextProviderId, nextModel.id);
  }

  function changeModel(nextModelId: string) {
    setModelId(nextModelId);
    if (providerId) savePreference(providerId, nextModelId);
  }

  function selectIdea(idea: Idea) {
    persistWorkflow({ ...workflow, selectedIdea: idea });
    setNotice(`Selected: ${idea.title}`);
    setError('');
  }

  function saveDraft(showNotice = true) {
    if (!activeRecord) return;
    const nextRecord = { ...activeRecord, content: draft, updatedAt: new Date().toISOString() };
    persistWorkflow({ ...workflow, stages: { ...workflow.stages, [stage.id]: nextRecord } });
    if (showNotice) setNotice('Your edits were saved on this device.');
  }

  async function copyDraft() {
    await navigator.clipboard.writeText(draft);
    setNotice('Copied to clipboard.');
  }

  function goNext() {
    if (stage.id === 'ideas' && !workflow.selectedIdea) {
      setError('Choose one idea before continuing to Research.');
      return;
    }
    if (stage.id !== 'ideas' && !draft.trim()) {
      setError(`Generate or write the ${stage.title.toLowerCase()} output before continuing.`);
      return;
    }
    saveDraft(false);
    if (stage.nextPath) studioNavigate(stage.nextPath);
  }

  function clearWorkflow() {
    if (!window.confirm('Clear every generated stage and start a new channel workflow? Your saved API connections will not be deleted.')) return;
    persistWorkflow(initialWorkflow);
    setDraft('');
    setDirection('');
    setError('');
    setNotice('Workflow cleared. Your model connections are unchanged.');
  }

  return (
    <main className={`module-shell module-${stage.tone}`}>
      <StudioSidebar activeStageId={stage.id} />

      <section className="module-main">
        <header className="module-topbar">
          <div><span>Creator Studio</span><i>/</i><strong>{stage.title}</strong></div>
          <div className="module-profile"><span>Local workspace</span><i>YC</i></div>
        </header>

        <div className="module-content automation-content">
          <div className="module-heading automation-heading">
            <div>
              <p>{stage.eyebrow}</p>
              <h1>{stage.title}</h1>
              <span>{stage.description}</span>
            </div>
            <div className="module-number">{stage.number}<small>/ {String(studioStages.length).padStart(2, '0')}</small></div>
          </div>

          <section className="automation-niche" aria-label="Channel system prompt">
            <div className="automation-niche-mark">GEH</div>
            <div><p>Channel system · locked for every request</p><h2>Global Everyday History</h2><span>Cinematic English documentaries about how ordinary people across the world lived, worked, ate, travelled, healed, and survived before modern life.</span></div>
            <strong><i /> Active</strong>
          </section>

          <section className="module-tool automation-tool" aria-label={`${stage.title} automation workspace`}>
            <div className="module-tool-header automation-tool-header">
              <div><span>{stage.code}</span><strong>{stage.title} workspace</strong></div>
              <div><span>Items</span><strong>{itemCount}</strong></div>
            </div>

            <div className="automation-model-bar">
              {connections.length ? (
                <>
                  <label><span>AI provider</span><div><b>{providerId ? providerMark(providerId) : '—'}</b><select value={providerId} onChange={(event) => changeProvider(event.target.value as ProviderId)}>{connections.map((connection) => <option value={connection.providerId} key={connection.providerId}>{connection.providerName}</option>)}</select></div></label>
                  <label><span>Model for this stage</span><div><select value={modelId} onChange={(event) => changeModel(event.target.value)}>{activeConnection?.models.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}</select></div></label>
                  {stage.id === 'research' ? <div className={`automation-grounding ${providerId === 'custom' ? 'manual' : ''}`}><i />{providerId === 'custom' ? 'Verification plan' : 'Live web grounding'}</div> : null}
                </>
              ) : (
                <div className="automation-no-model"><span>◇</span><div><strong>No AI model connected</strong><small>Add an API provider and select at least one model. Your key stays in this browser and is never stored in a database.</small></div><a href="/studio/settings" onClick={(e) => studioNavigate('/studio/settings', e)}>Open Settings →</a></div>
              )}
            </div>

            <details className="automation-direction">
              <summary>Optional direction for this run <span>＋</span></summary>
              <label><span>Tell the model what to emphasize or avoid. The locked channel system still applies.</span><textarea value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="Example: Focus on the winter journey and avoid graphic descriptions." /></label>
            </details>

            {!prerequisiteReady && previousStage ? (
              <div className="automation-prerequisite">
                <span>←</span><div><strong>{stage.id === 'research' ? 'Choose an idea first' : `${previousStage.title} is not ready yet`}</strong><p>Complete the previous stage so its approved output can become this stage&apos;s context.</p></div><a href={`/studio/${previousStage.id}`} onClick={(e) => studioNavigate(`/studio/${previousStage.id}`, e)}>Open {previousStage.title}</a>
              </div>
            ) : null}

            {error ? <p className="automation-message error" role="alert"><span>!</span>{error}</p> : null}
            {notice ? <p className="automation-message success" role="status"><span>✓</span>{notice}</p> : null}

            {!activeRecord ? (
              <div className="automation-empty">
                <div className="automation-empty-symbol" aria-hidden="true">{stage.symbol}</div>
                <p>{stage.number} · READY WHEN YOU ARE</p>
                <h2>{stage.emptyCopy}</h2>
                <span>{stage.id === 'ideas' ? 'The model will return eight original directions. You decide which one enters production.' : 'The approved work from earlier stages is already prepared as context.'}</span>
                <button type="button" disabled={!connections.length || !activeModel || !prerequisiteReady || loading} onClick={() => void generateStage()}>{loading ? <><i className="automation-spinner" /> Working carefully…</> : <>{stage.actionLabel} <b>→</b></>}</button>
              </div>
            ) : stage.id === 'ideas' && activeRecord.ideas?.length ? (
              <div className="automation-ideas">
                <header><div><p>Model output</p><h2>Choose one story to develop</h2></div><span>Generated by {activeRecord.providerName} · {activeRecord.modelName}</span></header>
                <div className="automation-ideas-grid">
                  {activeRecord.ideas.map((idea, index) => {
                    const selected = workflow.selectedIdea?.id === idea.id;
                    return (
                      <button type="button" className={`automation-idea-card${selected ? ' selected' : ''}`} aria-pressed={selected} onClick={() => selectIdea(idea)} key={idea.id}>
                        <div><span>{String(index + 1).padStart(2, '0')}</span><i>{selected ? '✓ Selected' : 'Select idea'}</i></div>
                        <h3>{idea.title}</h3>
                        <p>{idea.premise}</p>
                        <dl><div><dt>Hook</dt><dd>{idea.hook}</dd></div><div><dt>Place & period</dt><dd>{[idea.region, idea.period].filter(Boolean).join(' · ')}</dd></div><div><dt>Everyday lens</dt><dd>{idea.everydayLens}</dd></div></dl>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="automation-output">
                <header><div><p>Generated output</p><h2>{stage.title} production document</h2></div><div>{activeRecord.grounded ? <span className="automation-source-badge">✓ Web-grounded</span> : null}<small>{activeRecord.providerName} · {activeRecord.modelName}</small></div></header>
                <textarea aria-label={`${stage.title} generated output`} spellCheck value={draft} onChange={(event) => setDraft(event.target.value)} />
                {stage.id === 'research' && activeRecord.sources?.length ? (
                  <section className="automation-sources"><h3>Sources returned by the research tool</h3><div>{activeRecord.sources.map((source, index) => <a href={source.url} target="_blank" rel="noreferrer" key={`${source.url}-${index}`}><span>{index + 1}</span><strong>{source.title || new URL(source.url).hostname}</strong><i>↗</i></a>)}</div></section>
                ) : null}
              </div>
            )}

            {activeRecord ? (
              <div className="automation-actions">
                <div><span>Saved locally</span><small>{new Date(activeRecord.updatedAt).toLocaleString()}</small></div>
                {stage.id !== 'ideas' ? <button type="button" onClick={() => saveDraft()}>Save edits</button> : null}
                {stage.id !== 'ideas' ? <button type="button" onClick={() => void copyDraft()}>Copy</button> : null}
                <button className="primary" type="button" disabled={loading || !activeModel || !prerequisiteReady} onClick={() => void generateStage()}>{loading ? 'Regenerating…' : 'Regenerate'}</button>
              </div>
            ) : null}
          </section>

          <footer className="automation-footer">
            <div><span>Current stage</span><strong>{stage.number} · {stage.title}</strong>{stage.id === 'ideas' ? <button type="button" onClick={clearWorkflow}>Clear workflow</button> : null}</div>
            {stage.nextPath && stage.nextLabel ? (
              <button type="button" onClick={goNext} disabled={loading || (stage.id === 'ideas' ? !workflow.selectedIdea : !draft.trim())}><span>Approve & continue</span><strong>{stage.nextLabel} <i>→</i></strong></button>
            ) : (
              <a href="/studio" onClick={(e) => studioNavigate('/studio', e)}><span>Workflow complete</span><strong>Studio overview <i>→</i></strong></a>
            )}
          </footer>
        </div>
      </section>
    </main>
  );
}
