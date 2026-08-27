'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StudioStageId } from '../_lib/stages';
import { studioNavigate } from '../_lib/navigation';
import ResearchDocumentView, { getResearchSignals, normalizeResearchMarkdown } from './research-document-view';
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
type StageRecord = {
  content: string;
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
  ideaBatches?: unknown[];
  savedIdeas?: unknown[];
};
type ModelPreference = { providerId: ProviderId; modelId: string };
type ViewMode = 'read' | 'edit';
type ResearchRunOptions = {
  evidenceMode?: 'current' | 'native' | 'external';
  continueWhenReady?: boolean;
};
type ResearchToolsConfig = {
  firecrawl?: {
    apiKey: string;
    savedAt?: string;
    usage?: { remainingCredits: number; planCredits: number; billingPeriodStart?: string; billingPeriodEnd?: string; checkedAt: string };
    lastRunCreditsUsed?: number;
    lastRunAt?: string;
  };
};
type EvidenceResult = {
  evidencePack?: string;
  sources?: Source[];
  attempts?: number;
  creditsUsed?: number;
  searchesCompleted?: number;
  searchesPlanned?: number;
  warnings?: string[];
  error?: string;
};

const connectionStorageKey = 'arclane.model-connections.v1';
const workflowStorageKey = 'arclane.creator-workflow.v1';
const modelPreferenceKey = 'arclane.workflow-models.v1';
const searchPreferenceKey = 'arclane.research-web-search.v1';
const externalSearchPreferenceKey = 'arclane.research-external-evidence.v1';
const researchToolsStorageKey = 'arclane.research-tools.v1';
const connectionChangeEvent = 'arclane:model-connections-changed';
const researchToolsChangeEvent = 'arclane:research-tools-changed';
const initialWorkflow: WorkflowState = { stages: {} };
const downstreamStages: StudioStageId[] = ['scripts', 'voiceover', 'visuals', 'audio', 'thumbnails', 'description', 'shorts'];

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

function readResearchTools(): ResearchToolsConfig {
  const value = readJson<ResearchToolsConfig>(researchToolsStorageKey, {});
  if (!value || typeof value !== 'object') return {};
  if (value.firecrawl && typeof value.firecrawl.apiKey !== 'string') return {};
  return value;
}

function providerMark(providerId: ProviderId) {
  if (providerId === 'openai') return 'O';
  if (providerId === 'anthropic') return 'A';
  if (providerId === 'gemini') return 'G';
  return '+';
}

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source';
  }
}

function getResearchHandoffIssues(record: StageRecord | undefined, content: string, sources: Source[]) {
  if (!record || !content.trim()) return ['No Research dossier is available.'];
  const signals = getResearchSignals(content, sources);
  const issues: string[] = [];
  if (!record.grounded) issues.push('No verified source-search result was attached.');
  if (signals.sectionCount < 12) issues.push('The Research document is incomplete.');
  if (sources.length < 3) issues.push('The source trail is too small for a reliable Script handoff.');
  if (signals.claimCount < 3) issues.push('The claim ledger is incomplete.');
  if (record.researchMode === 'external-evidence' && signals.evidenceReferenceCount < 1) issues.push('External evidence was not connected to the claims.');
  if (signals.unresolvedEvidenceCount > 0) issues.push('One or more evidence references do not match the returned sources.');
  const handoffLine = content.split(/\r?\n/).find((line) => /Handoff status:/i.test(line));
  const handoffStatus = handoffLine?.match(/Handoff status:\*{0,2}\s*(READY WITH CONDITIONS|READY|NOT READY)\b/i)?.[1]?.toUpperCase();
  if (!handoffStatus) issues.push('The final Research decision is missing.');
  else if (handoffStatus === 'NOT READY') issues.push('The Research editor determined that the evidence is not ready.');
  return [...new Set(issues)];
}

export default function ResearchWorkspace() {
  const [connections, setConnections] = useState<Selection[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowState>(initialWorkflow);
  const [providerId, setProviderId] = useState<ProviderId | ''>('');
  const [modelId, setModelId] = useState('');
  const [draft, setDraft] = useState('');
  const [direction, setDirection] = useState('');
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('read');
  const [searchPreferences, setSearchPreferences] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [researchTools, setResearchTools] = useState<ResearchToolsConfig>({});
  const [externalEvidenceEnabled, setExternalEvidenceEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestInFlight = useRef(false);

  const activeRecord = workflow.stages.research;
  const selectedIdea = workflow.selectedIdea;
  const activeConnection = connections.find((item) => item.providerId === providerId);
  const activeModel = activeConnection?.models.find((model) => model.id === modelId);
  const firecrawlApiKey = researchTools.firecrawl?.apiKey.trim() ?? '';
  const externalEvidenceActive = externalEvidenceEnabled && Boolean(firecrawlApiKey);
  const webSearchCapable = Boolean(providerId && providerId !== 'custom');
  const webSearchEnabled = webSearchCapable && !externalEvidenceActive && Boolean(providerId && searchPreferences[providerId] !== false);
  const dirty = Boolean(activeRecord && draft !== activeRecord.content);
  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const sources = useMemo(() => {
    const seen = new Set<string>();
    return (activeRecord?.sources ?? []).filter((source) => {
      if (!/^https?:\/\//i.test(source.url) || seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    });
  }, [activeRecord?.sources]);
  const handoffGateIssues = useMemo(() => getResearchHandoffIssues(activeRecord, draft, sources), [activeRecord, draft, sources]);
  const researchReadyForScript = Boolean(activeRecord && handoffGateIssues.length === 0);
  const automaticEvidenceMode: 'native' | 'external' | null = firecrawlApiKey ? 'external' : providerId && providerId !== 'custom' ? 'native' : null;
  const automaticRepairLabel = automaticEvidenceMode === 'external' ? 'Verify with Firecrawl & continue' : automaticEvidenceMode === 'native' ? 'Verify with Live Search & continue' : 'Connect a verification source';

  const persistWorkflow = useCallback((next: WorkflowState) => {
    try {
      window.localStorage.setItem(workflowStorageKey, JSON.stringify(next));
      setWorkflow(next);
      return true;
    } catch {
      setError('This browser could not save more workflow data. Download or copy the current research before continuing.');
      return false;
    }
  }, []);

  const savePreference = useCallback((nextProviderId: ProviderId, nextModelId: string) => {
    const preferences = readJson<Partial<Record<StudioStageId, ModelPreference>>>(modelPreferenceKey, {});
    preferences.research = { providerId: nextProviderId, modelId: nextModelId };
    window.localStorage.setItem(modelPreferenceKey, JSON.stringify(preferences));
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- these effects hydrate and reconcile the browser-local workspace after mount */
  useEffect(() => {
    const refreshConnections = () => setConnections(readConnections());
    const refreshResearchTools = () => {
      const next = readResearchTools();
      setResearchTools(next);
      if (!next.firecrawl?.apiKey) setExternalEvidenceEnabled(false);
    };
    const savedWorkflow = readJson<WorkflowState>(workflowStorageKey, initialWorkflow);
    const available = readConnections();
    const tools = readResearchTools();
    const preference = readJson<Partial<Record<StudioStageId, ModelPreference>>>(modelPreferenceKey, {}).research;
    const savedSearchPreferences = readJson<Partial<Record<ProviderId, boolean>>>(searchPreferenceKey, {});
    const savedExternalPreference = readJson<boolean>(externalSearchPreferenceKey, false);
    const preferredConnection = available.find((item) => item.providerId === preference?.providerId) ?? available[0];
    const preferredModel = preferredConnection?.models.find((model) => model.id === preference?.modelId) ?? preferredConnection?.models[0];

    setConnections(available);
    setResearchTools(tools);
    setWorkflow({ ...savedWorkflow, stages: savedWorkflow.stages ?? {} });
    setDraft(savedWorkflow.stages?.research?.content ?? '');
    setProviderId(preferredConnection?.providerId ?? '');
    setModelId(preferredModel?.id ?? '');
    setSearchPreferences(savedSearchPreferences);
    setExternalEvidenceEnabled(savedExternalPreference && Boolean(tools.firecrawl?.apiKey));
    window.addEventListener('storage', refreshConnections);
    window.addEventListener('storage', refreshResearchTools);
    window.addEventListener(connectionChangeEvent, refreshConnections);
    window.addEventListener(researchToolsChangeEvent, refreshResearchTools);
    return () => {
      window.removeEventListener('storage', refreshConnections);
      window.removeEventListener('storage', refreshResearchTools);
      window.removeEventListener(connectionChangeEvent, refreshConnections);
      window.removeEventListener(researchToolsChangeEvent, refreshResearchTools);
    };
  }, []);

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
  /* eslint-enable react-hooks/set-state-in-effect */

  const hasDownstreamWork = useCallback(() => {
    return downstreamStages.some((id) => Boolean(workflow.stages[id]?.content.trim()));
  }, [workflow.stages]);

  function clearDownstream(stages: WorkflowState['stages']) {
    const next = { ...stages };
    downstreamStages.forEach((id) => delete next[id]);
    return next;
  }

  const generateResearch = useCallback(async (options: ResearchRunOptions = {}) => {
    if (requestInFlight.current) {
      setNotice('A Research request is already running. No duplicate request was sent.');
      return;
    }
    const connection = connections.find((item) => item.providerId === providerId);
    const model = connection?.models.find((item) => item.id === modelId);
    if (!selectedIdea) {
      setError('Select one idea before starting Research.');
      return;
    }
    if (!connection || !model) {
      setError('Connect an AI provider and choose a model before starting Research.');
      return;
    }
    const useExternalEvidence = options.evidenceMode === 'external'
      ? Boolean(firecrawlApiKey)
      : options.evidenceMode === 'native'
        ? false
        : externalEvidenceActive;
    const useNativeSearch = options.evidenceMode === 'native'
      ? connection.providerId !== 'custom'
      : !useExternalEvidence && webSearchEnabled;
    if (options.evidenceMode === 'external' && !firecrawlApiKey) {
      setError('Connect Firecrawl in Settings before automatic external verification.');
      return;
    }
    if (options.evidenceMode === 'native' && connection.providerId === 'custom') {
      setError('This custom model has no verified native search. Connect Firecrawl or choose OpenAI, Anthropic, or Gemini.');
      return;
    }
    if (hasDownstreamWork() && !window.confirm('Replacing this Research will clear the current Script and every later production output so stale facts are not reused. Continue?')) return;

    requestInFlight.current = true;
    setLoading(true);
    setError('');
    setNotice(activeRecord ? 'Building a fresh Research version. The current version stays safe until the replacement is ready.' : 'Building the first Research version.');
    try {
      let externalEvidence = '';
      let externalSources: Source[] = [];
      let evidenceAttempts = 0;
      let searchesCompleted = 0;
      let searchesPlanned = 0;
      let evidenceWarnings: string[] = [];
      let creditsUsed: number | undefined;

      if (useExternalEvidence) {
        setNotice('Firecrawl is collecting and extracting source evidence. The AI model has not been called yet.');
        const evidenceResponse = await fetch('/api/research/evidence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'firecrawl', apiKey: firecrawlApiKey, idea: selectedIdea }),
        });
        const evidence = await evidenceResponse.json() as EvidenceResult;
        if (!evidenceResponse.ok || !evidence.evidencePack?.trim() || !evidence.sources?.length) {
          throw new Error(evidence.error || 'Firecrawl returned no usable evidence. The AI model was not called.');
        }
        externalEvidence = evidence.evidencePack.trim();
        externalSources = evidence.sources;
        evidenceAttempts = evidence.attempts ?? 1;
        searchesCompleted = evidence.searchesCompleted ?? 1;
        searchesPlanned = evidence.searchesPlanned ?? searchesCompleted;
        evidenceWarnings = evidence.warnings ?? [];
        creditsUsed = evidence.creditsUsed;
        setNotice(`${externalSources.length} source candidates collected across ${searchesCompleted}/${searchesPlanned} evidence lanes. Your AI model is now building the dossier.`);
      }

      const response = await fetch('/api/automation/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 'research',
          provider: connection.providerId,
          providerName: connection.providerName,
          model: model.id,
          apiKey: connection.apiKey,
          baseUrl: connection.baseUrl,
          authMethod: connection.authMethod,
          headerName: connection.headerName,
          completionPath: connection.completionPath,
          webSearchEnabled: useExternalEvidence ? false : useNativeSearch,
          extraInstructions: direction,
          context: { selectedIdea, outputs: {}, externalEvidence: externalEvidence || undefined },
        }),
      });
      const result = await response.json() as {
        output?: string;
        sources?: Source[];
        grounded?: boolean;
        researchMode?: string;
        attempts?: number;
        retryAfterSeconds?: number;
        errorCode?: string;
        error?: string;
      };
      if (!response.ok || !result.output?.trim()) throw new Error(result.error || 'The model did not return a usable research brief.');

      const seenSources = new Set<string>();
      const combinedSources = [...externalSources, ...(result.sources ?? [])].filter((source) => {
        if (!/^https?:\/\//i.test(source.url) || seenSources.has(source.url)) return false;
        seenSources.add(source.url);
        return true;
      });
      const record: StageRecord = {
        content: normalizeResearchMarkdown(result.output),
        sources: combinedSources,
        grounded: Boolean(externalSources.length || result.grounded),
        researchMode: useExternalEvidence ? 'external-evidence' : result.researchMode,
        providerName: connection.providerName,
        modelName: model.name,
        updatedAt: new Date().toISOString(),
      };
      const nextWorkflow: WorkflowState = {
        ...workflow,
        stages: { ...clearDownstream(workflow.stages), research: record },
      };
      if (persistWorkflow(nextWorkflow)) {
        setDraft(record.content);
        setViewMode('read');
        const modelCalls = result.attempts ?? 1;
        if (useExternalEvidence) {
          if (creditsUsed !== undefined) {
            const savedTools = readResearchTools();
            if (savedTools.firecrawl) {
              const nextTools: ResearchToolsConfig = {
                ...savedTools,
                firecrawl: { ...savedTools.firecrawl, lastRunCreditsUsed: creditsUsed, lastRunAt: new Date().toISOString() },
              };
              window.localStorage.setItem(researchToolsStorageKey, JSON.stringify(nextTools));
              window.dispatchEvent(new Event(researchToolsChangeEvent));
              setResearchTools(nextTools);
            }
          }
          const creditText = creditsUsed !== undefined ? ` · ${creditsUsed} Firecrawl credit${creditsUsed === 1 ? '' : 's'} reported` : ' · Firecrawl did not report a complete credit total';
          const partialText = evidenceWarnings.length ? ` · ${evidenceWarnings.length} evidence lane warning${evidenceWarnings.length === 1 ? '' : 's'}` : '';
          setNotice(`${activeRecord ? 'New Research saved; the previous version was replaced. ' : ''}External Evidence dossier completed with Firecrawl + ${connection.providerName} · ${model.name}. ${searchesCompleted}/${searchesPlanned} search lanes · ${evidenceAttempts} total search attempt${evidenceAttempts === 1 ? '' : 's'} · ${modelCalls} AI call${modelCalls === 1 ? '' : 's'}${creditText}${partialText}.`);
        } else {
          setNotice(`${activeRecord ? 'New Research saved; the previous version was replaced. ' : ''}${record.grounded ? 'Native web-grounded research' : 'Verification plan'} completed with ${connection.providerName} · ${model.name}. ${modelCalls} provider call${modelCalls === 1 ? '' : 's'} used.`);
        }
        if (options.continueWhenReady) {
          const nextIssues = getResearchHandoffIssues(record, record.content, combinedSources);
          if (!nextIssues.length) {
            studioNavigate('/studio/scripts');
            return;
          }
          setError('Automatic verification finished, but the selected service did not return a complete and traceable evidence base. Nothing was sent to Script. Try Firecrawl or another search-capable model.');
        }
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Research generation failed. Please try again.');
      setNotice('');
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }, [activeRecord, connections, direction, externalEvidenceActive, firecrawlApiKey, hasDownstreamWork, modelId, persistWorkflow, providerId, selectedIdea, webSearchEnabled, workflow]);


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

  function toggleWebSearch() {
    if (!providerId || providerId === 'custom') return;
    const nextEnabled = !webSearchEnabled;
    const next = { ...searchPreferences, [providerId]: nextEnabled };
    try {
      window.localStorage.setItem(searchPreferenceKey, JSON.stringify(next));
      if (nextEnabled) {
        window.localStorage.setItem(externalSearchPreferenceKey, JSON.stringify(false));
        setExternalEvidenceEnabled(false);
      }
      setSearchPreferences(next);
      setError('');
      setNotice(`Native Live Search ${nextEnabled ? 'enabled' : 'disabled'} for ${activeConnection?.providerName ?? providerId}.${nextEnabled ? ' External Evidence was turned off.' : ''}`);
    } catch {
      setError('This browser could not save the search preference.');
    }
  }

  function toggleExternalEvidence() {
    if (!firecrawlApiKey) {
      setError('Connect Firecrawl in Settings before turning on External Evidence.');
      return;
    }
    const nextEnabled = !externalEvidenceActive;
    try {
      window.localStorage.setItem(externalSearchPreferenceKey, JSON.stringify(nextEnabled));
      setExternalEvidenceEnabled(nextEnabled);
      if (providerId) {
        const nextSearchPreferences = { ...searchPreferences, [providerId]: false };
        window.localStorage.setItem(searchPreferenceKey, JSON.stringify(nextSearchPreferences));
        setSearchPreferences(nextSearchPreferences);
      }
      setError('');
      setNotice(`Firecrawl External Evidence ${nextEnabled ? 'enabled' : 'disabled'}.${nextEnabled ? ' Native Live Search was turned off.' : ' Both search modes are now off.'}`);
    } catch {
      setError('This browser could not save the External Evidence preference.');
    }
  }

  function saveDraft(showNotice = true) {
    if (!activeRecord) return false;
    if (!dirty) {
      if (showNotice) setNotice('Research is already saved on this device.');
      return true;
    }
    if (hasDownstreamWork() && !window.confirm('Saving these Research edits will clear the current Script and later outputs so they cannot use outdated facts. Continue?')) return false;
    const record = { ...activeRecord, content: draft, updatedAt: new Date().toISOString() };
    const next: WorkflowState = { ...workflow, stages: { ...clearDownstream(workflow.stages), research: record } };
    if (!persistWorkflow(next)) return false;
    if (showNotice) setNotice('Research edits saved locally. Later stages now use this version.');
    setError('');
    return true;
  }

  async function copyResearch() {
    try {
      await navigator.clipboard.writeText(normalizeResearchMarkdown(draft));
      setError('');
      setNotice('Research brief copied to the clipboard.');
    } catch {
      setError('This browser blocked clipboard access. Please allow clipboard permission and try again.');
    }
  }

  function downloadResearch() {
    if (!draft.trim()) return;
    const blob = new Blob([normalizeResearchMarkdown(draft)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `arclane-research-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice('Research brief downloaded as a Markdown document.');
  }

  async function continueToScript() {
    if (!draft.trim()) {
      setError('Build the Research document before continuing to Script.');
      return;
    }
    if (!researchReadyForScript) {
      if (!automaticEvidenceMode) {
        setError('This model cannot verify sources by itself. Connect Firecrawl in Settings or choose a search-capable AI provider.');
        return;
      }
      await generateResearch({ evidenceMode: automaticEvidenceMode, continueWhenReady: true });
      return;
    }
    if (!saveDraft(false)) return;
    studioNavigate('/studio/scripts');
  }

  return (
    <main className="module-shell module-violet research-shell">
      <StudioSidebar activeStageId="research" />
      <section className="module-main">
        <header className="module-topbar">
          <div><span>Creator Studio</span><i>/</i><strong>Research</strong></div>
          <div className="module-profile"><span>Local workspace</span><i>YC</i></div>
        </header>

        <div className="module-content research-content">
          <header className="research-heading">
            <div><p>02 · Grounded evidence brief</p><h1>Research before<br />you write.</h1><span>Turn one approved idea into a defensible story foundation—facts, uncertainty, sources and narrative direction together.</span></div>
            <div className="research-stats">
              <div><strong>{activeRecord ? sources.length : '—'}</strong><span>Sources returned</span></div>
              <div><strong>{activeRecord ? wordCount.toLocaleString() : '—'}</strong><span>Research words</span></div>
              <div><strong>{activeRecord ? activeRecord.researchMode === 'external-evidence' ? 'External' : activeRecord.grounded ? 'Native' : 'Plan' : '—'}</strong><span>Evidence mode</span></div>
            </div>
          </header>

          <section className={`research-idea${selectedIdea ? '' : ' empty'}`}>
            <div className="research-idea-mark">ID</div>
            {selectedIdea ? <>
              <div className="research-idea-copy">
                <div className="research-idea-status"><p>Idea received from Ideas</p><strong>✓ Selected</strong></div>
                <h2>{selectedIdea.title}</h2>
                {ideaOpen ? <div className="research-idea-details">
                  <div className="wide"><span>Original premise</span><p>{selectedIdea.premise}</p></div>
                  <div><span>World coverage</span><strong>{selectedIdea.region || 'Global'}</strong></div>
                  <div><span>Historical range</span><strong>{selectedIdea.period || 'Any period'}</strong></div>
                  <div><span>Video type</span><strong>{selectedIdea.everydayLens || 'Everyday life'}</strong></div>
                </div> : <span className="research-idea-confirmation">The original selected topic is here. Review its full context before starting Research.</span>}
              </div>
              <div className="research-idea-actions"><button type="button" aria-expanded={ideaOpen} onClick={() => setIdeaOpen((open) => !open)}>{ideaOpen ? 'Hide full idea' : 'View full idea'}</button><a href="/studio/ideas" onClick={(e) => studioNavigate('/studio/ideas', e)}>Change idea</a></div>
            </> : <>
              <div><p>Research requires one decision</p><h2>No production idea selected</h2><span>Choose one idea first so Research receives a precise subject instead of guessing.</span></div>
              <a href="/studio/ideas" onClick={(e) => studioNavigate('/studio/ideas', e)}>Choose an idea →</a>
            </>}
          </section>

          <section className="research-lab">
            <header><div><span>RS</span><div><p>Research setup</p><h2>One careful pass, with the right evidence mode</h2></div></div><strong><i /> Automatic deep brief</strong></header>

            {connections.length ? (
              <div className="research-models">
                <label><span>AI provider</span><div><b>{providerId ? providerMark(providerId) : '—'}</b><select value={providerId} onChange={(event) => changeProvider(event.target.value as ProviderId)}>{connections.map((connection) => <option value={connection.providerId} key={connection.providerId}>{connection.providerName}</option>)}</select></div></label>
                <label><span>Model for Research</span><div><select value={modelId} onChange={(event) => changeModel(event.target.value)}>{activeConnection?.models.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}</select></div></label>
                <div className="research-search-modes">
                  <div className={`research-search-control native${webSearchCapable ? webSearchEnabled ? ' enabled' : ' disabled' : ' unavailable'}`}>
                    <div><i /><span><strong>{webSearchCapable ? webSearchEnabled ? 'Native Live Search on' : 'Native Live Search off' : 'Native Live Search unavailable'}</strong><small>{providerId === 'custom' ? 'This custom AI connection has no native search tool' : webSearchEnabled ? `${activeConnection?.providerName ?? 'Provider'} web tool · plan limits may apply` : 'Uses the selected AI provider when enabled'}</small></span></div>
                    <button type="button" role="switch" aria-checked={webSearchEnabled} disabled={!webSearchCapable} onClick={toggleWebSearch} aria-label="Toggle Native Live Search"><i /></button>
                  </div>
                  <div className={`research-search-control external${firecrawlApiKey ? externalEvidenceActive ? ' enabled' : ' disabled' : ' unavailable'}`}>
                    <div><i /><span><strong>{firecrawlApiKey ? externalEvidenceActive ? 'External Evidence on' : 'External Evidence off' : 'External Evidence unavailable'}</strong><small>{firecrawlApiKey ? externalEvidenceActive ? 'Firecrawl searches first · native search stays off' : 'Firecrawl evidence pack · Research only' : <>Connect Firecrawl in <a href="/studio/settings" onClick={(e) => studioNavigate('/studio/settings', e)}>Settings</a></>}</small></span></div>
                    <button type="button" role="switch" aria-checked={externalEvidenceActive} disabled={!firecrawlApiKey} onClick={toggleExternalEvidence} aria-label="Toggle Firecrawl External Evidence"><i /></button>
                  </div>
                </div>
              </div>
            ) : <div className="research-no-model"><span>◇</span><div><strong>No AI model connected</strong><small>Connect a provider and select a model before building the research brief.</small></div><a href="/studio/settings" onClick={(e) => studioNavigate('/studio/settings', e)}>Open Settings →</a></div>}

            <div className="research-method" aria-label="Automatic research method">
              <div><span>01</span><strong>Define scope</strong><small>Time, place and people</small></div><i />
              <div><span>02</span><strong>Test evidence</strong><small>Claims and sources</small></div><i />
              <div><span>03</span><strong>Flag uncertainty</strong><small>Disputes and traps</small></div><i />
              <div><span>04</span><strong>Shape the story</strong><small>Evidence-led beats</small></div>
            </div>

            <details className="research-direction">
              <summary><div><strong>Optional direction</strong><small>Leave blank for the complete automatic research system</small></div><i>＋</i></summary>
              <label><span>Only use this when you deliberately want a special emphasis or exclusion.</span><textarea value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="Example: Focus on winter travel and avoid graphic descriptions." /></label>
            </details>

            {error ? <p className="research-message error" role="alert"><span>!</span>{error}</p> : null}
            {notice ? <p className="research-message success" role="status"><span>✓</span>{notice}</p> : null}

            <footer><div><strong>Research protection</strong><span>Single job · one search engine at a time · bounded safe retry · unsupported claims must be labelled</span></div><button type="button" disabled={!selectedIdea || !activeModel || loading} onClick={() => void generateResearch()}>{loading ? <><i className="automation-spinner" /> Researching carefully…</> : <>{activeRecord ? 'Rebuild research brief' : 'Build research brief'} <b>→</b></>}</button></footer>
          </section>

          {activeRecord ? (
            <section className="research-output">
              <header>
                <div><p>Research document</p><h2>Evidence before narration.</h2><span>{dirty ? 'Unsaved edits' : `Saved ${new Date(activeRecord.updatedAt).toLocaleString()}`}</span></div>
                <div className="research-output-meta"><span className={activeRecord.grounded ? 'grounded' : 'plan'}>{activeRecord.researchMode === 'external-evidence' ? '✓ External evidence' : activeRecord.grounded ? '✓ Native web-grounded' : '◇ Verification plan'}</span><small>{activeRecord.providerName} · {activeRecord.modelName}</small></div>
              </header>

              <section className={`research-handoff-gate${researchReadyForScript ? ' passed' : ' blocked'}`}>
                <div className="research-handoff-gate-mark">{researchReadyForScript ? '✓' : '↻'}</div>
                <div><p>Automatic Research check</p><h3>{researchReadyForScript ? 'Research is ready for Script' : 'One automatic verification pass is needed'}</h3><span>{researchReadyForScript ? 'The evidence structure and source trail passed automatically. The linked sources remain available whenever you want to inspect them.' : automaticEvidenceMode ? `You do not need to check technical scores. Use “${automaticRepairLabel}” below; the system will rebuild, replace this draft, check it and continue only if it is safe.` : 'Connect Firecrawl or choose a search-capable AI model. This draft stays safe and will not be sent to Script.'}</span></div>
              </section>

              <div className="research-viewbar">
                <div><button className={viewMode === 'read' ? 'active' : ''} type="button" onClick={() => setViewMode('read')}>Read document</button><button className={viewMode === 'edit' ? 'active' : ''} type="button" onClick={() => setViewMode('edit')}>Edit text</button></div>
                <span>{wordCount.toLocaleString()} words · {sources.length} source{sources.length === 1 ? '' : 's'}</span>
              </div>

              {viewMode === 'read' ? <ResearchDocumentView content={draft} sources={sources} /> : <textarea className="research-editor" aria-label="Research document editor" spellCheck value={draft} onChange={(event) => setDraft(event.target.value)} />}

              <section className="research-sources">
                <header><div><p>Source trail</p><h3>{sources.length ? `${sources.length} sources used by automatic verification` : 'This draft has no verified source links yet'}</h3></div><span>{sources.length ? 'Optional transparency—open any source when you want' : 'The next action can repair this automatically'}</span></header>
                {sources.length ? <div>{sources.map((source, index) => <a href={source.url} target="_blank" rel="noreferrer" key={`${source.url}-${index}`}><span>{activeRecord.researchMode === 'external-evidence' ? `E${index + 1}` : String(index + 1).padStart(2, '0')}</span><div><strong>{source.title || sourceHost(source.url)}</strong><small>{sourceHost(source.url)}</small></div><i>↗</i></a>)}</div> : <div className="research-sources-empty"><span>↻</span><p>This version remains a safe draft. “{automaticRepairLabel}” will build a new verified version and replace it only after the new result is saved.</p></div>}
              </section>

              <footer className="research-actions"><div><span>{dirty ? 'Changes not saved' : researchReadyForScript ? 'Saved locally · ready for Script' : 'Saved locally · automatic verification available'}</span><small>{researchReadyForScript ? 'The system has completed its handoff checks.' : 'You do not need to inspect technical scores; the next action will handle them.'}</small></div><button type="button" disabled={!dirty} onClick={() => saveDraft()}>Save edits</button><button type="button" onClick={() => void copyResearch()}>Copy</button><button type="button" onClick={downloadResearch}>Download .md</button></footer>
            </section>
          ) : <section className="research-empty"><div>⌕</div><p>READY FOR EVIDENCE</p><h2>The selected idea will become a fact map—not a premature script.</h2><span>Scope, verified claims, uncertainty, material life, source trails and an evidence-led story direction will appear here.</span></section>}

          <footer className="research-next">
            <a href="/studio/ideas" onClick={(e) => studioNavigate('/studio/ideas', e)}><span>Previous stage</span><strong>← Ideas</strong></a>
            <div><span>Current production idea</span><strong>{selectedIdea?.title ?? 'Nothing selected'}</strong></div>
            <button type="button" disabled={!activeRecord || loading} onClick={() => void continueToScript()}><span>{loading ? 'Working automatically…' : researchReadyForScript ? 'Continue automatically' : automaticRepairLabel}</span><strong>Script <i>→</i></strong></button>
          </footer>
        </div>
      </section>
    </main>
  );
}
