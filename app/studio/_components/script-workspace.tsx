'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StudioStageId } from '../_lib/stages';
import ScriptDocumentView, { getScriptSignals, normalizeScriptMarkdown } from './script-document-view';
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
  authMethod?: AuthMethod;
  headerName?: string;
  completionPath?: string;
};
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
type ScriptReview = {
  originalContent: string;
  status: 'pending' | 'approved';
  reviewedAt?: string;
  reviewerProviderName?: string;
  reviewerModelName?: string;
  attempts?: number;
};
type StageRecord = {
  content: string;
  sources?: Source[];
  grounded?: boolean;
  researchMode?: string;
  providerName: string;
  modelName: string;
  updatedAt: string;
  scriptReview?: ScriptReview;
};
type WorkflowState = {
  selectedIdea?: Idea;
  stages: Partial<Record<StudioStageId, StageRecord>>;
};
type ModelPreference = { providerId: ProviderId; modelId: string };
type ScriptOperationCheckpoint = { kind: 'write' | 'review'; startedAt: string };
type ViewMode = 'read' | 'edit';

const connectionStorageKey = 'arclane.model-connections.v1';
const workflowStorageKey = 'arclane.creator-workflow.v1';
const modelPreferenceKey = 'arclane.workflow-models.v1';
const scriptOperationKey = 'arclane.script-operation.v1';
const connectionChangeEvent = 'arclane:model-connections-changed';
const initialWorkflow: WorkflowState = { stages: {} };
const downstreamStages: StudioStageId[] = ['voiceover', 'visuals', 'audio', 'thumbnails', 'description', 'shorts'];

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
    const candidate = item as Partial<Selection>;
    return typeof candidate.providerId === 'string'
      && typeof candidate.providerName === 'string'
      && typeof candidate.apiKey === 'string'
      && Array.isArray(candidate.models);
  });
}

function providerMark(providerId: ProviderId) {
  if (providerId === 'openai') return 'O';
  if (providerId === 'anthropic') return 'A';
  if (providerId === 'gemini') return 'G';
  return '+';
}


function researchStatus(content: string) {
  return content.match(/Handoff status:\*{0,2}\s*(READY WITH CONDITIONS|READY|NOT READY)\b/i)?.[1]?.toUpperCase() ?? '';
}

function getScriptIssues(record: StageRecord | undefined, content: string, researchReady: boolean) {
  if (!record || !content.trim()) return ['No Script is available.'];
  const signals = getScriptSignals(content);
  const issues: string[] = [];
  if (!researchReady || !record.grounded) issues.push('The approved Research is no longer connected.');
  if (signals.status === 'NEEDS RESEARCH') issues.push('The reviewer says this story needs more Research before Voiceover.');
  if (signals.hasVerificationLeak) issues.push('The Script still contains an unresolved Research note.');
  return [...new Set(issues)];
}

export default function ScriptWorkspace() {
  const [connections, setConnections] = useState<Selection[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowState>(initialWorkflow);
  const [providerId, setProviderId] = useState<ProviderId | ''>('');
  const [modelId, setModelId] = useState('');
  const [draft, setDraft] = useState('');
  const [direction, setDirection] = useState('');
  const [researchOpen, setResearchOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('read');
  const [loading, setLoading] = useState(false);
  const [requestKind, setRequestKind] = useState<'write' | 'review' | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestInFlight = useRef(false);

  const selectedIdea = workflow.selectedIdea;
  const researchRecord = workflow.stages.research;
  const activeRecord = workflow.stages.scripts;
  const activeConnection = connections.find((item) => item.providerId === providerId);
  const activeModel = activeConnection?.models.find((model) => model.id === modelId);
  const researchSources = useMemo(() => {
    const seen = new Set<string>();
    return (researchRecord?.sources ?? []).filter((source) => {
      if (!/^https?:\/\//i.test(source.url) || seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    });
  }, [researchRecord?.sources]);
  const researchDecision = researchStatus(researchRecord?.content ?? '');
  const researchReady = Boolean(
    selectedIdea
    && researchRecord?.content.trim()
    && researchRecord.grounded
    && researchSources.length >= 3
    && (researchDecision === 'READY' || researchDecision === 'READY WITH CONDITIONS'),
  );
  const dirty = Boolean(activeRecord && draft !== activeRecord.content);
  const signals = useMemo(() => getScriptSignals(draft), [draft]);
  const scriptIssues = useMemo(() => getScriptIssues(activeRecord, draft, researchReady), [activeRecord, draft, researchReady]);
  const review = activeRecord?.scriptReview;
  const reviewApproved = Boolean(review?.status === 'approved' && !dirty);
  const finalReady = Boolean(activeRecord && !scriptIssues.length && reviewApproved && !dirty);
  const originalDraft = review?.originalContent || activeRecord?.content || '';
  const hasDistinctOriginal = Boolean(originalDraft.trim() && normalizeScriptMarkdown(originalDraft) !== normalizeScriptMarkdown(draft));

  const persistWorkflow = useCallback((next: WorkflowState) => {
    try {
      window.localStorage.setItem(workflowStorageKey, JSON.stringify(next));
      setWorkflow(next);
      return true;
    } catch {
      setError('This browser could not save more workflow data. Download or copy the Script before continuing.');
      return false;
    }
  }, []);

  const savePreference = useCallback((nextProviderId: ProviderId, nextModelId: string) => {
    const preferences = readJson<Partial<Record<StudioStageId, ModelPreference>>>(modelPreferenceKey, {});
    preferences.scripts = { providerId: nextProviderId, modelId: nextModelId };
    window.localStorage.setItem(modelPreferenceKey, JSON.stringify(preferences));
  }, []);

  useEffect(() => {
    const refreshConnections = () => setConnections(readConnections());
    const savedWorkflow = readJson<WorkflowState>(workflowStorageKey, initialWorkflow);
    const available = readConnections();
    const preference = readJson<Partial<Record<StudioStageId, ModelPreference>>>(modelPreferenceKey, {}).scripts;
    const interruptedOperation = readJson<ScriptOperationCheckpoint | null>(scriptOperationKey, null);
    const preferredConnection = available.find((item) => item.providerId === preference?.providerId) ?? available[0];
    const preferredModel = preferredConnection?.models.find((model) => model.id === preference?.modelId) ?? preferredConnection?.models[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate external browser-local state
    setConnections(available);
    setWorkflow({ ...savedWorkflow, stages: savedWorkflow.stages ?? {} });
    setDraft(savedWorkflow.stages?.scripts?.content ?? '');
    setProviderId(preferredConnection?.providerId ?? '');
    setModelId(preferredModel?.id ?? '');
    window.localStorage.removeItem('arclane.script-duration.v1');
    if (interruptedOperation?.kind === 'write' || interruptedOperation?.kind === 'review') {
      setNotice(`The previous Script ${interruptedOperation.kind === 'review' ? 'Recheck' : 'Draft'} request was interrupted before completion. Your last saved work is safe; click the same button when you are ready to retry.`);
      window.localStorage.removeItem(scriptOperationKey);
    }
    window.addEventListener('storage', refreshConnections);
    window.addEventListener(connectionChangeEvent, refreshConnections);
    return () => {
      window.removeEventListener('storage', refreshConnections);
      window.removeEventListener(connectionChangeEvent, refreshConnections);
    };
  }, []);

  useEffect(() => {
    if (!providerId) return;
    const connection = connections.find((item) => item.providerId === providerId);
    if (!connection) {
      const first = connections[0];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reconcile removed browser-local provider
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('run')) return;
    params.delete('run');
    const cleanUrl = `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', cleanUrl);
  }, []);

  const hasDownstreamWork = useCallback(() => downstreamStages.some((id) => Boolean(workflow.stages[id]?.content.trim())), [workflow.stages]);

  function clearDownstream(stages: WorkflowState['stages']) {
    const next = { ...stages };
    downstreamStages.forEach((id) => delete next[id]);
    return next;
  }


  const generateScript = useCallback(async () => {
    if (requestInFlight.current) {
      setNotice('A Script request is already running. No duplicate request was sent.');
      return;
    }
    const connection = connections.find((item) => item.providerId === providerId);
    const model = connection?.models.find((item) => item.id === modelId);
    if (!connection || !model) {
      setError('Connect an AI provider and choose a model before writing the Script.');
      return;
    }
    if (!selectedIdea || !researchRecord?.content.trim()) {
      setError('Select an idea and complete Research before writing the Script.');
      return;
    }
    if (!researchReady) {
      setError('Research has not completed its automatic evidence handoff. Return to Research and use Verify & continue.');
      return;
    }
    if (hasDownstreamWork() && !window.confirm('Replacing this Script will clear Voiceover and every later production output so old wording is not reused. Continue?')) return;

    requestInFlight.current = true;
    setLoading(true);
    setRequestKind('write');
    setError('');
    setNotice(activeRecord ? 'Writing a fresh Draft. The current version stays safe until its replacement is complete.' : 'Writing the first evidence-bound Draft.');
    try {
      window.localStorage.setItem(scriptOperationKey, JSON.stringify({ kind: 'write', startedAt: new Date().toISOString() } satisfies ScriptOperationCheckpoint));
      const response = await fetch('/api/automation/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 'scripts',
          provider: connection.providerId,
          providerName: connection.providerName,
          model: model.id,
          apiKey: connection.apiKey,
          baseUrl: connection.baseUrl,
          authMethod: connection.authMethod,
          headerName: connection.headerName,
          completionPath: connection.completionPath,
          webSearchEnabled: false,
          extraInstructions: direction,
          context: {
            selectedIdea,
            outputs: { research: researchRecord.content },
          },
        }),
      });
      const result = await response.json() as { output?: string; attempts?: number; error?: string };
      if (!response.ok || !result.output?.trim()) throw new Error(result.error || 'The model did not return a usable Script.');

      const normalized = normalizeScriptMarkdown(result.output);
      const record: StageRecord = {
        content: normalized,
        sources: researchSources,
        grounded: true,
        researchMode: researchRecord.researchMode,
        providerName: connection.providerName,
        modelName: model.name,
        updatedAt: new Date().toISOString(),
        scriptReview: {
          originalContent: normalized,
          status: 'pending',
        },
      };
      const nextWorkflow: WorkflowState = {
        ...workflow,
        stages: { ...clearDownstream(workflow.stages), scripts: record },
      };
      if (persistWorkflow(nextWorkflow)) {
        setDraft(normalized);
        setViewMode('read');
        const calls = result.attempts ?? 1;
        const generatedWords = getScriptSignals(normalized).wordCount;
        setNotice(`Draft saved · ${generatedWords.toLocaleString()} spoken words · about ${getScriptSignals(normalized).estimatedMinutes} minutes · ${calls} provider call${calls === 1 ? '' : 's'}. Length is automatic; Recheck remains manual.`);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Script generation failed. Please try again.');
      setNotice('');
    } finally {
      window.localStorage.removeItem(scriptOperationKey);
      requestInFlight.current = false;
      setLoading(false);
      setRequestKind('');
    }
  }, [activeRecord, connections, direction, hasDownstreamWork, modelId, persistWorkflow, providerId, researchReady, researchRecord, researchSources, selectedIdea, workflow]);

  const reviewScript = useCallback(async () => {
    if (requestInFlight.current) {
      setNotice('A Script request is already running. No duplicate request was sent.');
      return;
    }
    const connection = connections.find((item) => item.providerId === providerId);
    const model = connection?.models.find((item) => item.id === modelId);
    if (!connection || !model) {
      setError('Choose a connected AI model before starting the final Script review.');
      return;
    }
    if (!activeRecord || !draft.trim() || !selectedIdea || !researchRecord?.content.trim()) {
      setError('Write and save a Draft before starting the final Script review.');
      return;
    }
    if (dirty) {
      setError('Save your Script edits before Recheck & Polish so the original version remains reliable.');
      return;
    }
    if (!researchReady) {
      setError('The approved Research handoff is no longer available. Return to Research before reviewing this Script.');
      return;
    }
    if (hasDownstreamWork() && !window.confirm('A new final review will clear Voiceover and later outputs so they cannot use an older Script. Continue?')) return;

    requestInFlight.current = true;
    setLoading(true);
    setRequestKind('review');
    setError('');
    setNotice(connection.providerId === 'gemini'
      ? 'Rechecking the complete story against Research and storytelling quality. Gemini may need several minutes for a full-length editorial pass; keep this tab open. The Original Draft remains safe.'
      : 'Rechecking the complete story against Research and storytelling quality. The Original Draft remains safe.');
    try {
      window.localStorage.setItem(scriptOperationKey, JSON.stringify({ kind: 'review', startedAt: new Date().toISOString() } satisfies ScriptOperationCheckpoint));
      const response = await fetch('/api/automation/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 'script_review',
          provider: connection.providerId,
          providerName: connection.providerName,
          model: model.id,
          apiKey: connection.apiKey,
          baseUrl: connection.baseUrl,
          authMethod: connection.authMethod,
          headerName: connection.headerName,
          completionPath: connection.completionPath,
          webSearchEnabled: false,
          context: {
            selectedIdea,
            outputs: { research: researchRecord.content, scripts: draft },
          },
        }),
      });
      const result = await response.json() as { output?: string; attempts?: number; error?: string };
      if (!response.ok || !result.output?.trim()) throw new Error(result.error || 'The reviewer did not return a usable final Script.');

      const normalized = normalizeScriptMarkdown(result.output);
      const reviewedRecord: StageRecord = {
        ...activeRecord,
        content: normalized,
        grounded: true,
        updatedAt: new Date().toISOString(),
        scriptReview: {
          originalContent: activeRecord.scriptReview?.originalContent || draft,
          status: 'pending',
          reviewedAt: new Date().toISOString(),
          reviewerProviderName: connection.providerName,
          reviewerModelName: model.name,
          attempts: result.attempts ?? 1,
        },
      };
      const reviewedSignals = getScriptSignals(normalized);
      const qualityIssues = getScriptIssues(reviewedRecord, normalized, researchReady);
      reviewedRecord.scriptReview = { ...reviewedRecord.scriptReview!, status: !qualityIssues.length ? 'approved' : 'pending' };
      const nextWorkflow: WorkflowState = {
        ...workflow,
        stages: { ...clearDownstream(workflow.stages), scripts: reviewedRecord },
      };
      if (persistWorkflow(nextWorkflow)) {
        setDraft(normalized);
        setViewMode('read');
        if (reviewedRecord.scriptReview.status === 'approved') {
          setNotice(`Final Script ready · ${reviewedSignals.wordCount.toLocaleString()} spoken words · about ${reviewedSignals.estimatedMinutes} minutes. Length is informational only. Voiceover is now available.`);
        } else {
          setNotice('The reviewed version was saved, and the Original Draft is still available.');
          setError(qualityIssues[0] || 'The reviewer says this Script needs more Research before Voiceover.');
        }
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Script review failed. Please try again.');
      setNotice('The current Script and Original Draft were not replaced.');
    } finally {
      window.localStorage.removeItem(scriptOperationKey);
      requestInFlight.current = false;
      setLoading(false);
      setRequestKind('');
    }
  }, [activeRecord, connections, dirty, draft, hasDownstreamWork, modelId, persistWorkflow, providerId, researchReady, researchRecord, selectedIdea, workflow]);

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

  function saveDraft(showNotice = true) {
    if (!activeRecord) return false;
    if (!dirty) {
      if (showNotice) setNotice('The Script is already saved on this device.');
      return true;
    }
    if (hasDownstreamWork() && !window.confirm('Saving these Script edits will clear Voiceover and later outputs so they cannot use outdated wording. Continue?')) return false;
    const normalized = normalizeScriptMarkdown(draft);
    const record: StageRecord = {
      ...activeRecord,
      content: normalized,
      updatedAt: new Date().toISOString(),
      scriptReview: {
        originalContent: activeRecord.scriptReview?.originalContent || normalized,
        status: 'pending',
      },
    };
    const next: WorkflowState = { ...workflow, stages: { ...clearDownstream(workflow.stages), scripts: record } };
    if (!persistWorkflow(next)) return false;
    setDraft(normalized);
    if (showNotice) setNotice('Script edits saved locally. Recheck & Polish is required again before Voiceover.');
    setError('');
    return true;
  }

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(normalizeScriptMarkdown(draft));
      setNotice('Current Script copied to the clipboard.');
      setError('');
    } catch {
      setError('This browser blocked clipboard access. Please allow clipboard permission and try again.');
    }
  }

  function downloadScript() {
    if (!draft.trim()) return;
    const blob = new Blob([normalizeScriptMarkdown(draft)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `arclane-final-script-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice('Current Script downloaded as a Markdown document.');
  }

  function restoreOriginal() {
    if (!activeRecord || !originalDraft.trim() || !window.confirm('Use the Original Draft instead? It will become the current Script, and you can polish it again whenever you want.')) return;
    const record: StageRecord = {
      ...activeRecord,
      content: normalizeScriptMarkdown(originalDraft),
      updatedAt: new Date().toISOString(),
      scriptReview: {
        originalContent: normalizeScriptMarkdown(originalDraft),
        status: 'pending',
      },
    };
    const next: WorkflowState = { ...workflow, stages: { ...clearDownstream(workflow.stages), scripts: record } };
    if (persistWorkflow(next)) {
      setDraft(record.content);
      setViewMode('read');
      setError('');
      setNotice('Original Draft is now the current Script. Click Recheck & Polish when you want to make it final again.');
    }
  }

  function continueToVoiceover() {
    if (!activeRecord || !draft.trim()) {
      setError('Write the Script before continuing to Voiceover.');
      return;
    }
    if (dirty) {
      setError('Save your Script edits and run Recheck & Polish before Voiceover.');
      return;
    }
    if (!finalReady) {
      setError('Click Recheck & Polish once to make the current Script final, then Voiceover will open automatically.');
      return;
    }
    window.location.assign('/studio/voiceover');
  }


  return (
    <main className="module-shell module-coral script-shell">
      <StudioSidebar activeStageId="scripts" />
      <section className="module-main">
        <header className="module-topbar">
          <div><span>Creator Studio</span><i>/</i><strong>Script</strong></div>
          <div className="module-profile"><span>Local workspace</span><i>YC</i></div>
        </header>

        <div className="module-content script-content">
          <header className="script-heading">
            <div><p>03 · Evidence-led storytelling</p><h1>Write something<br />people forget to leave.</h1><span>One approved idea and one defensible Research dossier become a natural English documentary—then one clear Recheck turns it into the Final Script.</span></div>
            <div className="script-stats">
              <div><strong>{activeRecord ? signals.wordCount.toLocaleString() : '—'}</strong><span>Spoken words</span></div>
              <div><strong>{activeRecord ? `${signals.estimatedMinutes}m` : 'Auto'}</strong><span>Estimated runtime</span></div>
              <div><strong>{activeRecord ? signals.sectionCount : '—'}</strong><span>Story movements</span></div>
            </div>
          </header>

          <section className={`script-handoff${researchReady ? '' : ' blocked'}`}>
            <div className="script-handoff-mark">RS</div>
            {selectedIdea && researchRecord ? <>
              <div className="script-handoff-copy">
                <div><p>Research received</p><strong>{researchReady ? '✓ Approved evidence handoff' : 'Verification incomplete'}</strong></div>
                <h2>{selectedIdea.title}</h2>
                <span>{researchSources.length} source{researchSources.length === 1 ? '' : 's'} · {researchDecision || 'No handoff decision'} · {researchRecord.providerName} · {researchRecord.modelName}</span>
              </div>
              <div className="script-handoff-actions"><button type="button" aria-expanded={researchOpen} onClick={() => setResearchOpen((open) => !open)}>{researchOpen ? 'Hide research' : 'View research'}</button><a href="/studio/research">Back to Research</a></div>
              {researchOpen ? <div className="script-research-preview"><pre>{researchRecord.content}</pre></div> : null}
            </> : <>
              <div className="script-handoff-copy"><div><p>Research required</p></div><h2>No approved Research received</h2><span>Return to Ideas and Research before asking the writing model to create a story.</span></div>
              <a href="/studio/research">Open Research →</a>
            </>}
          </section>

          <section className="script-lab">
            <header><div><span>SC</span><div><p>Script engine</p><h2>One deliberate writing pass—only when you click.</h2></div></div><strong><i /> Research-bound</strong></header>
            {connections.length ? <div className="script-models">
              <label><span>AI provider</span><div><b>{providerId ? providerMark(providerId) : '—'}</b><select value={providerId} onChange={(event) => changeProvider(event.target.value as ProviderId)}>{connections.map((connection) => <option value={connection.providerId} key={connection.providerId}>{connection.providerName}</option>)}</select></div></label>
              <label><span>Model for Script & Recheck</span><div><select value={modelId} onChange={(event) => changeModel(event.target.value)}>{activeConnection?.models.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}</select></div></label>
              <div className="script-model-policy"><i /><span><strong>No new web search</strong><small>Uses approved Research and its claim ledger only</small></span></div>
            </div> : <div className="script-no-model"><span>◇</span><div><strong>No AI model connected</strong><small>Connect a provider and choose a strong long-form writing model.</small></div><a href="/studio/settings">Open Settings →</a></div>}

            <section className="script-duration-control" aria-label="Automatic Script length">
              <div className="script-duration-copy"><span>AUTO</span><div><p>Automatic length</p><h3>The story decides how long it needs</h3><small>No 10, 12 or 14-minute target. The Script ends when the evidence and story are complete—without padding.</small></div></div>
              <div className="script-duration-budget"><span>Information only</span><strong>{activeRecord ? `≈ ${signals.estimatedMinutes} min` : 'Automatic'}</strong><small>{activeRecord ? `${signals.wordCount.toLocaleString()} spoken words` : 'No word-count requirement'}</small></div>
            </section>

            <div className="script-method" aria-label="Automatic script method">
              <div><span>01</span><strong>Earn attention</strong><small>Promise matched immediately</small></div><i />
              <div><span>02</span><strong>Build causality</strong><small>Each beat changes the story</small></div><i />
              <div><span>03</span><strong>Open & repay</strong><small>Curiosity without false teasing</small></div><i />
              <div><span>04</span><strong>Land the meaning</strong><small>An ending that completes the opening</small></div>
            </div>

            <details className="script-direction"><summary><div><strong>Optional direction</strong><small>Leave blank for the complete automatic writing system</small></div><i>＋</i></summary><label><span>Use this only for a deliberate emphasis or exclusion. It cannot override the evidence.</span><textarea value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="Example: Keep the tone intimate and restrained; give extra space to the family’s winter routine." /></label></details>

            {!researchReady ? <div className="script-prerequisite"><span>!</span><div><strong>Research is not ready for Script</strong><p>Use the automatic verification action in Research first. Script generation remains manual after the evidence handoff passes.</p></div><a href="/studio/research">Return to Research</a></div> : null}
            {error ? <p className="script-message error" role="alert"><span>!</span>{error}</p> : null}
            {notice ? <p className="script-message success" role="status"><span>✓</span>{notice}</p> : null}

            <footer><div><strong>Writing protection</strong><span>Manual start · one request at a time · Research-only facts · Original Draft preserved</span></div><button type="button" disabled={!researchReady || !activeModel || loading} onClick={() => void generateScript()}>{loading && requestKind === 'write' ? <><i className="automation-spinner" /> Writing carefully…</> : <>{activeRecord ? 'Write a new Draft' : 'Write full Script'} <b>→</b></>}</button></footer>
          </section>

          {activeRecord ? <>
            <section className="script-output">
              <header><div><p>{reviewApproved ? 'Reviewed Script' : 'Production Draft'}</p><h2>{reviewApproved ? 'The final story, approved for voice.' : 'The story, ready for its final check.'}</h2><span>{dirty ? 'Unsaved edits' : `Saved ${new Date(activeRecord.updatedAt).toLocaleString()}`}</span></div><div className="script-output-meta"><span className={finalReady ? 'ready' : 'repair'}>{finalReady ? '✓ Final Script approved' : '↻ Recheck required'}</span><small>Writer: {activeRecord.providerName} · {activeRecord.modelName}</small></div></header>

              <div className="script-viewbar"><div><button className={viewMode === 'read' ? 'active' : ''} type="button" onClick={() => setViewMode('read')}>Read Script</button><button className={viewMode === 'edit' ? 'active' : ''} type="button" onClick={() => setViewMode('edit')}>Edit text</button></div><span>{signals.wordCount.toLocaleString()} spoken words · about {signals.estimatedMinutes} minutes · information only</span></div>
              {viewMode === 'read' ? <ScriptDocumentView content={draft} /> : <textarea className="script-editor" aria-label="Script editor" spellCheck value={draft} onChange={(event) => setDraft(event.target.value)} />}
              <footer className="script-actions"><div><span>{dirty ? 'Changes not saved' : finalReady ? 'Final version saved locally' : 'Draft saved locally · Recheck required'}</span><small>{finalReady ? 'Voiceover will receive this exact reviewed version.' : 'Editing the Script means it should be polished again before Voiceover.'}</small></div><button type="button" disabled={!dirty} onClick={() => saveDraft()}>Save edits</button><button type="button" onClick={() => void copyScript()}>Copy</button><button type="button" onClick={downloadScript}>Download .md</button><button className="primary" type="button" disabled={loading || !researchReady || !activeModel} onClick={() => void generateScript()}>{loading && requestKind === 'write' ? 'Writing…' : 'New Draft'}</button></footer>
            </section>

            <section className={`script-recheck${finalReady ? ' approved' : ''}`}>
              <header><div className="script-recheck-mark">FC</div><div><p>Final Script</p><h2>{finalReady ? 'Your polished Script is ready.' : 'One simple step before Voiceover.'}</h2><span>Click Recheck & Polish once. It improves the full Draft, keeps the Original safe, and makes the result your Final Script.</span></div><strong className={finalReady ? 'approved' : 'pending'}>{finalReady ? '✓ READY' : 'ONE STEP LEFT'}</strong></header>

              <section className={`script-quality${finalReady ? ' passed' : ' repair'}`}><div>{finalReady ? '✓' : '1'}</div><span><p>{finalReady ? 'Done' : 'What to do now'}</p><h3>{finalReady ? 'Voiceover is ready—continue below.' : 'Click Recheck & Polish below.'}</h3><small>{finalReady ? `Final Script saved · about ${signals.estimatedMinutes} minutes · length is informational only.` : 'There is no word-count test and no setting to choose. The website handles the check automatically.'}</small></span></section>

              <section className="script-recheck-explainer"><div><strong>What the reviewer protects</strong><span>Research facts · human dignity · original promise · causal story · natural English · complete payoffs</span></div><div><strong>What it may rebuild or add</strong><span>Stronger opening · approved Research material · transitions · contrast · payoff · natural spoken flow</span></div></section>

              {hasDistinctOriginal ? <details className="script-original"><summary><div><strong>Original Draft (backup)</strong><span>Preserved before the editorial pass · {getScriptSignals(originalDraft).wordCount.toLocaleString()} spoken words</span></div><i>＋</i></summary><ScriptDocumentView content={originalDraft} /><footer><span>The reviewed version remains active unless you restore this Draft.</span><button type="button" onClick={restoreOriginal}>Use Original Draft instead</button></footer></details> : null}

              <footer className="script-recheck-actions"><div><span>One manual editorial request</span><strong>{dirty ? 'Save edits before Recheck' : reviewApproved ? 'Run again only if you want another deliberate pass' : 'Original Draft will remain recoverable'}</strong><small>May use unused approved Research · no outside facts · no hidden quality loop</small></div><button type="button" disabled={loading || dirty || !researchReady || !activeModel} onClick={() => void reviewScript()}>{loading && requestKind === 'review' ? <><i className="automation-spinner" /> Rechecking carefully…</> : <>{reviewApproved ? 'Polish again (optional)' : 'Recheck & Polish'} <b>→</b></>}</button></footer>
            </section>
          </> : <section className="script-empty"><div>¶</div><p>READY FOR THE STORY</p><h2>Research is present. The Script will begin only when you decide.</h2><span>The engine will write narration—not visual prompts, music notes, voice cues, packaging or filler reserved for later stages.</span></section>}

          <footer className="script-next"><a href="/studio/research"><span>Previous stage</span><strong>← Research</strong></a><div><span>Current production idea</span><strong>{selectedIdea?.title ?? 'Nothing selected'}</strong></div><button type="button" disabled={!finalReady || loading || dirty} onClick={continueToVoiceover}><span>{finalReady ? 'Ready—click to continue' : activeRecord ? 'Click Recheck & Polish above' : 'Write the Script first'}</span><strong>Voiceover <i>→</i></strong></button></footer>
        </div>
      </section>
    </main>
  );
}
