'use client';

import { jsonrepair } from 'jsonrepair';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSpokenScriptText } from './script-document-view';
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
type Idea = { id: string; title: string; premise?: string; region?: string; period?: string; everydayLens?: string };
type Source = { title: string; url: string };
type StageRecord = {
  content: string;
  providerName: string;
  modelName: string;
  updatedAt: string;
  sources?: Source[];
  selectedThumbnailId?: string;
  selectedTitleId?: string;
  sourceIdeaId?: string;
  sourceResearchUpdatedAt?: string;
  sourceScriptUpdatedAt?: string;
  sourceThumbnailUpdatedAt?: string;
};
type WorkflowState = { selectedIdea?: Idea; stages: Record<string, StageRecord | undefined> };
type ModelPreference = { providerId: ProviderId; modelId: string };

type SelectedThumbnail = {
  id: string;
  conceptName: string;
  headline: string;
  textMode: 'text_led' | 'text_free';
  instantRead: string;
  visualTension: string;
  viewerPromise: string;
  titlePartner: string;
  thumbnailPrompt: string;
};
type TrafficFit = 'browse' | 'balanced' | 'search';
type TitleOption = {
  id: string;
  title: string;
  angle: string;
  trafficFit: TrafficFit;
  primarySearchPhrase: string;
  promise: string;
  thumbnailFit: string;
};
type DescriptionPlan = {
  version: 'ARCLANE_UPLOAD_PACKAGE_2026_08_V4';
  recommendedTitleId: string;
  recommendationReason: string;
  titles: TitleOption[];
  description: {
    openingLines: string[];
    body: string;
  };
};

const workflowStorageKey = 'arclane.creator-workflow.v1';
const connectionStorageKey = 'arclane.model-connections.v1';
const modelPreferenceKey = 'arclane.workflow-models.v1';
const connectionChangeEvent = 'arclane:model-connections-changed';
const planVersion = 'ARCLANE_UPLOAD_PACKAGE_2026_08_V4' as const;
const initialWorkflow: WorkflowState = { stages: {} };
const trafficFits = new Set<TrafficFit>(['browse', 'balanced', 'search']);

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringList(value: unknown, limit: number) {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean).slice(0, limit) : [];
}

function parseJsonObject(content: string, label: string) {
  const unfenced = content.replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`The AI did not return a usable ${label}. Your saved work is unchanged; try again or choose another model.`);
  const candidate = unfenced.slice(start, end + 1);
  try {
    return asRecord(JSON.parse(candidate) as unknown);
  } catch {
    try {
      return asRecord(JSON.parse(jsonrepair(candidate)) as unknown);
    } catch {
      throw new Error('The AI response was incomplete and could not be read safely. Your saved work is unchanged; try again or choose another model.');
    }
  }
}

function normalizeWords(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseDescriptionPlan(content: string, thumbnailHeadline: string): DescriptionPlan {
  const root = parseJsonObject(content, 'Titles & Description');
  if (stringValue(root.version) !== planVersion) throw new Error('The AI returned an older format. Your saved work is unchanged; click Create Titles & Description again.');

  const rawTitles = Array.isArray(root.titles) ? root.titles : [];
  if (rawTitles.length !== 3) throw new Error(`The AI returned ${rawTitles.length} title choices instead of 3. Your saved result is unchanged; try once more.`);
  const titles = rawTitles.map((value, index): TitleOption => {
    const item = asRecord(value);
    const title = stringValue(item.title).replace(/\s+/g, ' ');
    const fit = stringValue(item.trafficFit) as TrafficFit;
    const option: TitleOption = {
      id: `TITLE-${String(index + 1).padStart(2, '0')}`,
      title,
      angle: stringValue(item.angle),
      trafficFit: trafficFits.has(fit) ? fit : 'balanced',
      primarySearchPhrase: stringValue(item.primarySearchPhrase),
      promise: stringValue(item.promise),
      thumbnailFit: stringValue(item.thumbnailFit),
    };
    if (!option.title || option.title.length > 100 || !option.angle || !option.primarySearchPhrase || !option.promise || !option.thumbnailFit) {
      throw new Error(`Title choice ${index + 1} is incomplete or longer than YouTube's 100-character limit. Nothing was replaced.`);
    }
    if (thumbnailHeadline && normalizeWords(option.title) === normalizeWords(thumbnailHeadline)) {
      throw new Error(`Title choice ${index + 1} repeats the Thumbnail headline. Nothing was replaced; the title and Thumbnail must complement each other.`);
    }
    return option;
  });
  if (new Set(titles.map((item) => normalizeWords(item.title))).size !== 3) {
    throw new Error('The AI repeated a title choice. Your saved result is unchanged; try once more.');
  }

  const titleIds = new Set(titles.map((item) => item.id));
  const requestedRecommended = stringValue(root.recommendedTitleId).toUpperCase();
  const recommendedTitleId = titleIds.has(requestedRecommended) ? requestedRecommended : titles[0].id;

  const rawDescription = asRecord(root.description);
  const openingLines = stringList(rawDescription.openingLines, 2);
  const body = stringValue(rawDescription.body);
  const bodyWords = body.split(/\s+/).filter(Boolean).length;
  if (openingLines.length !== 2 || !body || bodyWords < 70 || bodyWords > 220) {
    throw new Error('The public description was incomplete or unnecessarily long. Your saved result is unchanged; try once more.');
  }

  const publicLength = openingLines.join('\n').length + body.length + 2;
  if (publicLength > 5000) throw new Error("The public description exceeds YouTube's 5,000-character limit. Your saved result is unchanged.");

  return {
    version: planVersion,
    recommendedTitleId,
    recommendationReason: stringValue(root.recommendationReason) || 'Strongest truthful balance of clarity, curiosity and selected-Thumbnail fit.',
    titles,
    description: { openingLines, body },
  };
}

function readSavedPlan(content: string, thumbnailHeadline: string) {
  try {
    return parseDescriptionPlan(content, thumbnailHeadline);
  } catch {
    return null;
  }
}

function readSelectedThumbnail(record: StageRecord | undefined): SelectedThumbnail | null {
  if (!record?.content) return null;
  try {
    const root = parseJsonObject(record.content, 'Thumbnail Plan');
    const selectedId = record.selectedThumbnailId || stringValue(root.selectedThumbnailId);
    const concepts = Array.isArray(root.concepts) ? root.concepts : [];
    const selected = concepts.map(asRecord).find((item) => stringValue(item.id) === selectedId);
    if (!selected) return null;
    return {
      id: selectedId,
      conceptName: stringValue(selected.conceptName),
      headline: stringValue(selected.headline),
      textMode: stringValue(selected.textMode) === 'text_free' ? 'text_free' : 'text_led',
      instantRead: stringValue(selected.instantRead),
      visualTension: stringValue(selected.visualTension),
      viewerPromise: stringValue(selected.viewerPromise),
      titlePartner: stringValue(selected.titlePartner),
      thumbnailPrompt: stringValue(selected.thumbnailPrompt),
    };
  } catch {
    return null;
  }
}

function compactDocument(value: string, limit: number) {
  if (value.length <= limit) return value;
  const segment = Math.floor((limit - 120) / 3);
  const middleStart = Math.max(0, Math.floor(value.length / 2) - Math.floor(segment / 2));
  return `${value.slice(0, segment)}\n\n[...middle of document...]\n\n${value.slice(middleStart, middleStart + segment)}\n\n[...ending of document...]\n\n${value.slice(-segment)}`;
}

function composePublicDescription(plan: DescriptionPlan) {
  return [
    ...plan.description.openingLines,
    '',
    plan.description.body,
  ].join('\n');
}

function providerMark(providerId: ProviderId) {
  if (providerId === 'openai') return 'O';
  if (providerId === 'anthropic') return 'A';
  if (providerId === 'gemini') return 'G';
  return '+';
}

function trafficLabel(fit: TrafficFit) {
  if (fit === 'browse') return 'Home feed focused';
  if (fit === 'search') return 'Search focused';
  return 'Home + Search';
}

export default function DescriptionWorkspace() {
  const [hydrated, setHydrated] = useState(false);
  const [connections, setConnections] = useState<Selection[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowState>(initialWorkflow);
  const [providerId, setProviderId] = useState<ProviderId | ''>('');
  const [modelId, setModelId] = useState('');
  const [direction, setDirection] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sourceOpen, setSourceOpen] = useState(false);

  const selectedIdea = workflow.selectedIdea;
  const researchRecord = workflow.stages.research;
  const scriptRecord = workflow.stages.scripts;
  const thumbnailRecord = workflow.stages.thumbnails;
  const descriptionRecord = workflow.stages.description;
  const selectedThumbnail = useMemo(() => readSelectedThumbnail(thumbnailRecord), [thumbnailRecord]);
  const spokenScript = useMemo(() => getSpokenScriptText(scriptRecord?.content ?? ''), [scriptRecord?.content]);
  const plan = useMemo(() => descriptionRecord?.content ? readSavedPlan(descriptionRecord.content, selectedThumbnail?.headline ?? '') : null, [descriptionRecord, selectedThumbnail?.headline]);
  const activeConnection = connections.find((item) => item.providerId === providerId);
  const activeModel = activeConnection?.models.find((item) => item.id === modelId);
  const selectedTitleId = descriptionRecord?.selectedTitleId ?? '';
  const selectedTitle = plan?.titles.find((item) => item.id === selectedTitleId);
  const finalistTitles = plan?.titles ?? [];
  const handoffReady = Boolean(selectedIdea && researchRecord?.content && scriptRecord?.content && selectedThumbnail);
  const planCurrent = Boolean(plan && descriptionRecord
    && descriptionRecord.sourceIdeaId === selectedIdea?.id
    && descriptionRecord.sourceResearchUpdatedAt === researchRecord?.updatedAt
    && descriptionRecord.sourceScriptUpdatedAt === scriptRecord?.updatedAt
    && descriptionRecord.sourceThumbnailUpdatedAt === thumbnailRecord?.updatedAt);
  const publicDescription = plan ? composePublicDescription(plan) : '';

  const persistWorkflow = useCallback((next: WorkflowState) => {
    try {
      window.localStorage.setItem(workflowStorageKey, JSON.stringify(next));
      setWorkflow(next);
      return true;
    } catch {
      setError('This browser could not save the result. Download or clear older local data, then try again.');
      return false;
    }
  }, []);

  const savePreference = useCallback((nextProviderId: ProviderId, nextModelId: string) => {
    const preferences = readJson<Record<string, ModelPreference>>(modelPreferenceKey, {});
    preferences.description = { providerId: nextProviderId, modelId: nextModelId };
    window.localStorage.setItem(modelPreferenceKey, JSON.stringify(preferences));
  }, []);

  useEffect(() => {
    const refreshConnections = () => setConnections(readConnections());
    const available = readConnections();
    const savedWorkflow = readJson<WorkflowState>(workflowStorageKey, initialWorkflow);
    const preference = readJson<Record<string, ModelPreference>>(modelPreferenceKey, {}).description;
    const preferredConnection = available.find((item) => item.providerId === preference?.providerId) ?? available[0];
    const preferredModel = preferredConnection?.models.find((item) => item.id === preference?.modelId) ?? preferredConnection?.models[0];
    // Hydrate browser-owned workflow and provider state after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnections(available);
    setWorkflow(savedWorkflow);
    setProviderId(preferredConnection?.providerId ?? '');
    setModelId(preferredModel?.id ?? '');
    setHydrated(true);
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
      // Keep a valid provider selected when connections change.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  function changeProvider(nextProviderId: ProviderId) {
    const connection = connections.find((item) => item.providerId === nextProviderId);
    const model = connection?.models[0];
    setProviderId(nextProviderId);
    setModelId(model?.id ?? '');
    if (model) savePreference(nextProviderId, model.id);
  }

  function changeModel(nextModelId: string) {
    setModelId(nextModelId);
    if (providerId) savePreference(providerId, nextModelId);
  }

  async function buildUploadPackage() {
    if (loading) return;
    if (!handoffReady || !selectedIdea || !researchRecord || !scriptRecord || !thumbnailRecord || !selectedThumbnail) {
      setError('Choose one Final Thumbnail before creating Titles & Description.');
      return;
    }
    const connection = connections.find((item) => item.providerId === providerId);
    const model = connection?.models.find((item) => item.id === modelId);
    if (!connection || !model) {
      setError('Choose a connected AI provider and model first.');
      return;
    }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/automation/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 'description',
          provider: connection.providerId,
          providerName: connection.providerName,
          model: model.id,
          apiKey: connection.apiKey,
          baseUrl: connection.baseUrl,
          authMethod: connection.authMethod,
          headerName: connection.headerName,
          completionPath: connection.completionPath,
          extraInstructions: direction,
          context: {
            selectedIdea,
            descriptionThumbnail: selectedThumbnail,
            outputs: {
              scripts: compactDocument(spokenScript, 30000),
            },
          },
        }),
      });
      const result = await response.json() as { output?: string; error?: string };
      if (!response.ok || !result.output) throw new Error(result.error || 'The model did not return usable Titles & Description.');
      const nextPlan = parseDescriptionPlan(result.output, selectedThumbnail.headline);
      const record: StageRecord = {
        content: JSON.stringify(nextPlan, null, 2),
        providerName: connection.providerName,
        modelName: model.name,
        updatedAt: new Date().toISOString(),
        selectedTitleId: nextPlan.recommendedTitleId,
        sourceIdeaId: selectedIdea.id,
        sourceResearchUpdatedAt: researchRecord.updatedAt,
        sourceScriptUpdatedAt: scriptRecord.updatedAt,
        sourceThumbnailUpdatedAt: thumbnailRecord.updatedAt,
      };
      const next: WorkflowState = { ...workflow, stages: { ...workflow.stages, description: record, shorts: undefined } };
      if (persistWorkflow(next)) {
        setNotice('Everything is ready. The recommended title is already selected; change it only if you want.');
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Titles & Description could not be created. Your saved result is unchanged.');
    } finally {
      setLoading(false);
    }
  }

  function selectTitle(id: string) {
    if (!descriptionRecord || !planCurrent || !plan) return;
    const nextRecord = { ...descriptionRecord, selectedTitleId: id, updatedAt: new Date().toISOString() };
    const next: WorkflowState = { ...workflow, stages: { ...workflow.stages, description: nextRecord, shorts: undefined } };
    if (persistWorkflow(next)) {
      setError('');
      setNotice(`${plan.titles.find((item) => item.id === id)?.title ?? 'Title'} selected as Final.`);
    }
  }

  async function copyText(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(message);
      setError('');
    } catch {
      setError('Copy was blocked by the browser. Select the text manually and copy it.');
    }
  }

  function downloadPackage() {
    if (!plan) return;
    const blob = new Blob([JSON.stringify({ ...plan, selectedTitleId }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `arclane-upload-package-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice('Backup downloaded.');
  }

  function continueToShorts() {
    if (!planCurrent || !selectedTitle) {
      setError('Choose one Final title before continuing to Shorts.');
      return;
    }
    window.location.assign('/studio/shorts');
  }

  if (!hydrated) {
    return <main className="module-shell module-blue description-shell"><StudioSidebar activeStageId="description" /><section className="module-main"><div className="description-loading">Loading your Titles & Description…</div></section></main>;
  }

  const titleCard = (option: TitleOption, finalist: boolean) => {
    const recommended = option.id === plan?.recommendedTitleId;
    const selected = option.id === selectedTitleId;
    return <article key={option.id} className={`description-title-card ${recommended ? 'recommended' : ''} ${selected ? 'selected' : ''}`}>
      <header><div><b>{trafficLabel(option.trafficFit)}</b></div>{recommended && <em>★ Recommended</em>}</header>
      <h3>{option.title}</h3>
      <p className="description-title-match">{option.thumbnailFit}</p>
      <details><summary>Why this title works <span>＋</span></summary><dl><div><dt>Viewer reason</dt><dd>{option.angle}</dd></div>{finalist && <><div><dt>Promise</dt><dd>{option.promise}</dd></div><div><dt>Likely search phrase</dt><dd>{option.primarySearchPhrase}</dd></div></>}</dl><small>{option.title.length}/100 characters</small></details>
      <footer><button type="button" onClick={() => copyText(option.title, 'Title copied.')}>Copy</button><button type="button" className="primary" onClick={() => selectTitle(option.id)}>{selected ? '✓ Using this title' : 'Use this title'}</button></footer>
    </article>;
  };

  return <main className="module-shell module-blue description-shell">
    <StudioSidebar activeStageId="description" />
    <section className="module-main">
      <header className="module-topbar"><div><span>Creator Studio</span><i>/</i><strong>Description</strong></div><div className="module-profile"><span>Local workspace</span><i>YC</i></div></header>
      <div className="module-content description-content">
        <div className="module-heading description-heading"><div><p>TITLE · DESCRIPTION · READY TO COPY</p><h1>Titles &amp; Description</h1><span>Create everything you need for the YouTube title and description, then copy it in three simple steps.</span></div><div className="module-number">08<small>/ 09</small></div></div>

        <section className={`description-handoff ${handoffReady ? 'ready' : ''}`}>
          <div className="description-handoff-icon">TH</div>
          <div><p>YOUR FINAL THUMBNAIL IS ALREADY HERE</p><h2>{selectedThumbnail?.conceptName || selectedIdea?.title || 'No Final Thumbnail selected'}</h2><span>{selectedThumbnail ? 'Nothing to do here. The system will automatically match every title to this Thumbnail.' : 'Return to Thumbnails and choose one Final direction first.'}</span></div>
          <div className="description-handoff-actions"><button type="button" disabled={!selectedThumbnail} onClick={() => setSourceOpen(true)}>View details</button><a href="/studio/thumbnails">Change Thumbnail</a></div>
        </section>

        <section className="description-standard" aria-label="Three simple steps">
          <div className={!plan ? 'current' : 'done'}><span>1</span><strong>Create</strong><small>Click once to make the titles and full description.</small></div>
          <div className={plan && !selectedTitle ? 'current' : selectedTitle ? 'done' : ''}><span>2</span><strong>Choose a title</strong><small>The recommended title is selected automatically; change it only if you want.</small></div>
          <div className={selectedTitle ? 'current' : ''}><span>3</span><strong>Copy &amp; publish</strong><small>Copy the Final title and full description into YouTube Studio.</small></div>
        </section>

        <section className="description-builder">
          <header><div><span>1</span><strong>Create Titles &amp; Description</strong></div><div><span>Action</span><strong>Click once</strong></div></header>
          <div className="description-model-bar">
            {connections.length ? <><label><span>AI provider</span><div><b>{providerId ? providerMark(providerId) : '—'}</b><select value={providerId} onChange={(event) => changeProvider(event.target.value as ProviderId)}>{connections.map((connection) => <option value={connection.providerId} key={connection.providerId}>{connection.providerName}</option>)}</select></div></label><label><span>Model for upload packaging</span><div><select value={modelId} onChange={(event) => changeModel(event.target.value)}>{activeConnection?.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></div></label><div className="description-model-note"><i />One focused request</div></> : <div className="description-no-model">No AI provider connected. <a href="/studio/settings">Add one in Settings →</a></div>}
          </div>
          <details className="description-direction"><summary><span>Optional: add a special instruction</span><small>Usually leave this closed</small></summary><label><span>Only write something when you want a specific change.</span><textarea value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="Example: Keep every title calm and documentary-like. Leave blank for automatic best fit." /></label></details>
          <div className="description-request-note"><span>AUTOMATIC</span><p>Your Final Script and selected Thumbnail are added automatically. Research evidence stays private; no source link is published.</p></div>
          {error && <div className="description-message error"><span>!</span><p>{error}</p></div>}
          {notice && <div className="description-message success"><span>✓</span><p>{notice}</p></div>}
          <div className="description-build-row"><div><strong>{handoffReady ? plan ? 'Create a fresh version only when needed' : 'Everything is ready' : 'Final Thumbnail required'}</strong><span>Your saved result changes only after a complete new result passes every check.</span></div><button type="button" disabled={loading || !handoffReady || !activeModel} onClick={buildUploadPackage}>{loading ? <><i className="description-spinner" /> Creating carefully…</> : <>{plan ? 'Create Fresh Version' : 'Create Titles & Description'} <span>→</span></>}</button></div>
        </section>

        {plan ? <>
          {!planCurrent && <div className="description-stale">Your earlier result is safe, but the Thumbnail or Script has changed. Click Create Fresh Version before continuing.</div>}
          <section className="description-titles">
            <header><div><p>STEP 2 · CHOOSE ONE</p><h2>Choose your Final title</h2><span>The starred recommendation is already selected. If you are unsure, simply keep it and continue.</span></div><b>{selectedTitle ? '✓ Final title ready' : 'Choose one title'}</b></header>
            <div className="description-recommendation"><span>If you are unsure</span><p>Keep the starred title. It is the strongest starting match for your selected Thumbnail. You may choose another one if it sounds better to you.</p></div>
            <div className="description-title-grid finalists">{finalistTitles.map((option) => titleCard(option, true))}</div>
          </section>

          <section className="description-copy">
            <header><div><p>STEP 3 · COPY TWO THINGS</p><h2>Ready for YouTube Studio</h2><span>Copy the Final title into YouTube&apos;s Title box. Then copy the full description into YouTube&apos;s Description box.</span></div></header>
            <div className="description-ready-grid">
              <article><span>1 · FINAL TITLE</span><strong>{selectedTitle?.title || 'Choose one title above'}</strong><button type="button" disabled={!planCurrent || !selectedTitle} onClick={() => selectedTitle && copyText(selectedTitle.title, 'Final title copied.')}>Copy Final title</button></article>
              <article><span>2 · FULL DESCRIPTION</span><p>Two strong opening lines and one concise unique summary are combined in the correct order. No source link is published.</p><button type="button" disabled={!planCurrent} onClick={() => copyText(publicDescription, 'Full public description copied.')}>Copy Full description</button></article>
            </div>
            <details className="description-preview"><summary><span>Preview exactly what “Copy Full description” contains</span><b>View</b></summary><div><div className="description-opening">{plan.description.openingLines.map((line) => <strong key={line}>{line}</strong>)}</div><p className="description-body">{plan.description.body}</p></div></details>          </section>

          <details className="description-optional">
            <summary><div><span>BEFORE PUBLISHING</span><strong>Three safety settings—not part of your public Description</strong></div><b>View</b></summary>
            <div className="description-support"><article><header><div><p>AI DISCLOSURE</p><h2>Use YouTube&apos;s Altered content setting</h2></div></header><p>Choose “Yes” when realistic AI-generated historical scenes could be mistaken for real footage. A sentence in the Description does not replace this setting.</p></article><article><header><div><p>CHAPTERS</p><h2>Keep Automatic chapters enabled</h2></div></header><p>Do not publish guessed timestamps. Add manual chapters only after the final edit provides exact times.</p></article><article><header><div><p>COPYRIGHT</p><h2>Rights must be verified separately</h2></div></header><p>Use only visuals and audio you own or can use commercially. A source link or credit does not grant permission.</p></article><article className="description-backup"><header><div><p>BACKUP</p><h2>Save this result</h2></div><button type="button" onClick={downloadPackage}>Download</button></header><p>Optional JSON backup for this computer. It is not uploaded to YouTube.</p></article></div>
          </details>
        </> : <section className="description-empty"><div>≡</div><p>STEP 1</p><h2>Create your Titles &amp; Description</h2><span>Choose the AI model above, then click Create Titles &amp; Description once. Your Script and selected Thumbnail are connected automatically; research evidence stays private.</span></section>}

        <section className="description-next"><a href="/studio/thumbnails"><span>Previous</span><strong>← Thumbnails</strong></a><div><span>Final title</span><strong>{selectedTitle?.title || 'Choose one title above'}</strong></div><button type="button" disabled={!planCurrent || !selectedTitle} onClick={continueToShorts}><span>Next section</span><strong>Shorts <i>→</i></strong></button></section>
      </div>
    </section>

    {sourceOpen && selectedThumbnail && <div className="description-modal" role="dialog" aria-modal="true" aria-label="Selected Thumbnail direction"><section><header><div><p>SELECTED THUMBNAIL</p><h2>{selectedThumbnail.conceptName}</h2></div><button type="button" onClick={() => setSourceOpen(false)} aria-label="Close">×</button></header><div><article><span>Thumbnail text mode</span><strong>{selectedThumbnail.textMode === 'text_free' ? 'Text-free · visual carries the promise' : `Text-led · “${selectedThumbnail.headline}”`}</strong></article><article><span>One-glance read</span><p>{selectedThumbnail.instantRead || selectedThumbnail.viewerPromise}</p></article><article><span>Visual tension</span><p>{selectedThumbnail.visualTension || selectedThumbnail.viewerPromise}</p></article><article><span>Viewer promise</span><p>{selectedThumbnail.viewerPromise}</p></article><article><span>Title relationship</span><p>{selectedThumbnail.titlePartner}</p></article><article className="wide"><span>Production prompt</span><p>{selectedThumbnail.thumbnailPrompt}</p></article></div></section></div>}
  </main>;
}
