'use client';

import { jsonrepair } from 'jsonrepair';
import Link from 'next/link';
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
type Chapter = { timestamp: string; label: string };
type DescriptionPlan = {
  version: 'ARCLANE_UPLOAD_PACKAGE_2026_08_V1';
  recommendedTitleId: string;
  finalistTitleIds: string[];
  recommendationReason: string;
  titles: TitleOption[];
  description: {
    openingLines: string[];
    body: string;
    chapters: Chapter[];
    sourceUrls: string[];
    aiDisclosure: string;
    hashtags: string[];
  };
  pinnedComment: string;
  searchPhrases: string[];
};

const workflowStorageKey = 'arclane.creator-workflow.v1';
const connectionStorageKey = 'arclane.model-connections.v1';
const modelPreferenceKey = 'arclane.workflow-models.v1';
const connectionChangeEvent = 'arclane:model-connections-changed';
const planVersion = 'ARCLANE_UPLOAD_PACKAGE_2026_08_V1' as const;
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

function timestampSeconds(value: string) {
  const parts = value.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part)) || parts.length < 2 || parts.length > 3) return Number.NaN;
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function parseDescriptionPlan(content: string, verifiedSources: Source[], thumbnailHeadline: string): DescriptionPlan {
  const root = parseJsonObject(content, 'Upload Package');
  if (stringValue(root.version) !== planVersion) throw new Error('The AI returned an outdated Upload Package. Your saved work is unchanged; click Build Upload Package again.');

  const rawTitles = Array.isArray(root.titles) ? root.titles : [];
  if (rawTitles.length !== 12) throw new Error(`The AI returned ${rawTitles.length} title options instead of 12. Your saved work is unchanged; click Build Upload Package again.`);
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
      throw new Error(`Title option ${index + 1} is incomplete or longer than YouTube's 100-character limit. Nothing was replaced.`);
    }
    if (normalizeWords(option.title) === normalizeWords(thumbnailHeadline)) {
      throw new Error(`Title option ${index + 1} repeats the Thumbnail headline. Nothing was replaced; the title and Thumbnail must complement each other.`);
    }
    return option;
  });
  if (new Set(titles.map((item) => normalizeWords(item.title))).size !== 12) {
    throw new Error('The AI repeated one or more title options. Your saved work is unchanged; click Build Upload Package again.');
  }

  const titleIds = new Set(titles.map((item) => item.id));
  const finalistTitleIds = stringList(root.finalistTitleIds, 3).map((id) => id.toUpperCase()).filter((id) => titleIds.has(id));
  if (finalistTitleIds.length !== 3 || new Set(finalistTitleIds).size !== 3) {
    throw new Error('The AI did not choose three valid, different title finalists. Your saved work is unchanged.');
  }
  const requestedRecommended = stringValue(root.recommendedTitleId).toUpperCase();
  const recommendedTitleId = finalistTitleIds.includes(requestedRecommended) ? requestedRecommended : finalistTitleIds[0];

  const rawDescription = asRecord(root.description);
  const openingLines = stringList(rawDescription.openingLines, 2);
  const body = stringValue(rawDescription.body);
  if (openingLines.length !== 2 || !body) throw new Error('The public description is incomplete. Your saved work is unchanged; click Build Upload Package again.');

  const rawChapters = Array.isArray(rawDescription.chapters) ? rawDescription.chapters : [];
  const chapters = rawChapters.map((value) => {
    const item = asRecord(value);
    return { timestamp: stringValue(item.timestamp), label: stringValue(item.label) };
  }).filter((item) => item.timestamp && item.label && Number.isFinite(timestampSeconds(item.timestamp))).slice(0, 8);
  if (chapters.length < 3 || timestampSeconds(chapters[0].timestamp) !== 0 || chapters.some((chapter, index) => index > 0 && timestampSeconds(chapter.timestamp) <= timestampSeconds(chapters[index - 1].timestamp))) {
    throw new Error('The AI did not return a valid chapter list beginning at 00:00. Your saved work is unchanged.');
  }

  const allowedUrls = new Set(verifiedSources.map((source) => source.url));
  const sourceUrls = stringList(rawDescription.sourceUrls, 6).filter((url) => allowedUrls.has(url));
  const hashtags = stringList(rawDescription.hashtags, 3).map((tag) => tag.startsWith('#') ? tag : `#${tag.replace(/\s+/g, '')}`);
  const aiDisclosure = stringValue(rawDescription.aiDisclosure);
  const pinnedComment = stringValue(root.pinnedComment);
  const searchPhrases = stringList(root.searchPhrases, 8);
  if (!aiDisclosure || !pinnedComment || searchPhrases.length < 5) {
    throw new Error('The Upload Package is missing its disclosure, pinned comment, or private search guide. Nothing was replaced.');
  }

  const publicLength = openingLines.join('\n').length
    + body.length
    + chapters.reduce((total, chapter) => total + chapter.timestamp.length + chapter.label.length + 2, 0)
    + sourceUrls.reduce((total, url) => total + url.length + 4, 0)
    + aiDisclosure.length
    + hashtags.join(' ').length
    + 48;
  if (publicLength > 5000) {
    throw new Error("The public description exceeds YouTube's 5,000-character limit. Your saved work is unchanged.");
  }
  return {
    version: planVersion,
    recommendedTitleId,
    finalistTitleIds,
    recommendationReason: stringValue(root.recommendationReason) || 'Strongest truthful balance of clarity, curiosity and selected-Thumbnail fit.',
    titles,
    description: { openingLines, body, chapters, sourceUrls, aiDisclosure, hashtags },
    pinnedComment,
    searchPhrases,
  };
}

function readSavedPlan(content: string, sources: Source[], thumbnailHeadline: string) {
  try {
    return parseDescriptionPlan(content, sources, thumbnailHeadline);
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

function composePublicDescription(plan: DescriptionPlan, sources: Source[]) {
  const sourceMap = new Map(sources.map((source) => [source.url, source.title]));
  const chapters = plan.description.chapters.map((chapter) => `${chapter.timestamp} ${chapter.label}`).join('\n');
  const sourceLines = plan.description.sourceUrls.map((url) => `• ${sourceMap.get(url) || 'Source'}: ${url}`).join('\n');
  return [
    ...plan.description.openingLines,
    '',
    plan.description.body,
    '',
    'CHAPTERS',
    chapters,
    sourceLines ? `\nSOURCES\n${sourceLines}` : '',
    `\n${plan.description.aiDisclosure}`,
    plan.description.hashtags.length ? `\n${plan.description.hashtags.join(' ')}` : '',
  ].filter((part) => part !== '').join('\n');
}

function providerMark(providerId: ProviderId) {
  if (providerId === 'openai') return 'O';
  if (providerId === 'anthropic') return 'A';
  if (providerId === 'gemini') return 'G';
  return '+';
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
  const [showAllTitles, setShowAllTitles] = useState(false);

  const selectedIdea = workflow.selectedIdea;
  const researchRecord = workflow.stages.research;
  const scriptRecord = workflow.stages.scripts;
  const thumbnailRecord = workflow.stages.thumbnails;
  const descriptionRecord = workflow.stages.description;
  const verifiedSources = useMemo(() => (researchRecord?.sources ?? []).filter((source) => source.title && /^https?:\/\//i.test(source.url)), [researchRecord?.sources]);
  const selectedThumbnail = useMemo(() => readSelectedThumbnail(thumbnailRecord), [thumbnailRecord]);
  const spokenScript = useMemo(() => getSpokenScriptText(scriptRecord?.content ?? ''), [scriptRecord?.content]);
  const plan = useMemo(() => descriptionRecord?.content ? readSavedPlan(descriptionRecord.content, verifiedSources, selectedThumbnail?.headline ?? '') : null, [descriptionRecord, selectedThumbnail?.headline, verifiedSources]);
  const activeConnection = connections.find((item) => item.providerId === providerId);
  const activeModel = activeConnection?.models.find((item) => item.id === modelId);
  const selectedTitleId = descriptionRecord?.selectedTitleId ?? '';
  const selectedTitle = plan?.titles.find((item) => item.id === selectedTitleId);
  const finalistTitles = plan?.finalistTitleIds.map((id) => plan.titles.find((item) => item.id === id)).filter((item): item is TitleOption => Boolean(item)) ?? [];
  const reserveTitles = plan?.titles.filter((item) => !plan.finalistTitleIds.includes(item.id)) ?? [];
  const handoffReady = Boolean(selectedIdea && researchRecord?.content && scriptRecord?.content && selectedThumbnail);
  const planCurrent = Boolean(plan && descriptionRecord
    && descriptionRecord.sourceIdeaId === selectedIdea?.id
    && descriptionRecord.sourceResearchUpdatedAt === researchRecord?.updatedAt
    && descriptionRecord.sourceScriptUpdatedAt === scriptRecord?.updatedAt
    && descriptionRecord.sourceThumbnailUpdatedAt === thumbnailRecord?.updatedAt);
  const publicDescription = plan ? composePublicDescription(plan, verifiedSources) : '';

  const persistWorkflow = useCallback((next: WorkflowState) => {
    try {
      window.localStorage.setItem(workflowStorageKey, JSON.stringify(next));
      setWorkflow(next);
      return true;
    } catch {
      setError('This browser could not save the Upload Package. Download or clear older local data, then try again.');
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
      setError('Select one Final Thumbnail direction before building the Upload Package.');
      return;
    }
    const connection = connections.find((item) => item.providerId === providerId);
    const model = connection?.models.find((item) => item.id === modelId);
    if (!connection || !model) {
      setError('Connect an AI provider and choose a capable model before building the Upload Package.');
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
            descriptionSources: verifiedSources,
            outputs: {
              scripts: compactDocument(spokenScript, 30000),
            },
          },
        }),
      });
      const result = await response.json() as { output?: string; error?: string };
      if (!response.ok || !result.output) throw new Error(result.error || 'The model did not return a usable Upload Package.');
      const nextPlan = parseDescriptionPlan(result.output, verifiedSources, selectedThumbnail.headline);
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
        setShowAllTitles(false);
        setNotice('Upload Package saved. The editorial recommendation is preselected; you can choose any other title.');
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Upload Package generation failed. Your saved work is unchanged.');
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
    setNotice('Complete Upload Package downloaded.');
  }

  function continueToShorts() {
    if (!planCurrent || !selectedTitle) {
      setError('Choose one Final title before continuing to Shorts.');
      return;
    }
    window.location.assign('/studio/shorts');
  }

  if (!hydrated) {
    return <main className="module-shell module-blue description-shell"><StudioSidebar activeStageId="description" /><section className="module-main"><div className="description-loading">Loading the Upload Package handoff…</div></section></main>;
  }

  const titleCard = (option: TitleOption, finalist: boolean) => {
    const recommended = option.id === plan?.recommendedTitleId;
    const selected = option.id === selectedTitleId;
    return <article key={option.id} className={`description-title-card ${recommended ? 'recommended' : ''} ${selected ? 'selected' : ''}`}>
      <header><div><span>{option.id}</span><b>{option.trafficFit}</b></div>{recommended && <em>Best starting point</em>}</header>
      <h3>{option.title}</h3>
      <small>{option.title.length}/100 characters</small>
      <dl><div><dt>Viewer entry</dt><dd>{option.angle}</dd></div>{finalist && <><div><dt>Honest promise</dt><dd>{option.promise}</dd></div><div><dt>Works with Thumbnail</dt><dd>{option.thumbnailFit}</dd></div></>}</dl>
      <footer><button type="button" onClick={() => copyText(option.title, 'Title copied.')}>Copy title</button><button type="button" className="primary" onClick={() => selectTitle(option.id)}>{selected ? '✓ Final title' : 'Choose as Final'}</button></footer>
    </article>;
  };

  return <main className="module-shell module-blue description-shell">
    <StudioSidebar activeStageId="description" />
    <section className="module-main">
      <header className="module-topbar"><div><span>Creator Studio</span><i>/</i><strong>Description</strong></div><div className="module-profile"><span>Local workspace</span><i>YC</i></div></header>
      <div className="module-content description-content">
        <div className="module-heading description-heading"><div><p>TITLE · DESCRIPTION · CHAPTERS · SOURCES</p><h1>Upload Package</h1><span>Package the approved story for the right viewer—clear, truthful, searchable and ready to copy into YouTube Studio.</span></div><div className="module-number">08<small>/ 09</small></div></div>

        <section className={`description-handoff ${handoffReady ? 'ready' : ''}`}>
          <div className="description-handoff-icon">TH</div>
          <div><p>SELECTED THUMBNAIL HANDOFF</p><h2>{selectedThumbnail?.conceptName || selectedIdea?.title || 'No Final Thumbnail selected'}</h2><span>{selectedThumbnail ? `On-image text: “${selectedThumbnail.headline}”` : 'Return to Thumbnails and choose one Final direction first.'}</span></div>
          <div className="description-handoff-actions"><button type="button" disabled={!selectedThumbnail} onClick={() => setSourceOpen(true)}>View selected Thumbnail</button><Link href="/studio/thumbnails">← Back to Thumbnails</Link></div>
        </section>

        <section className="description-standard" aria-label="Upload package standard">
          <div><span>12</span><strong>Title options</strong><small>Three meaningfully different finalists</small></div>
          <div><span>100</span><strong>Character ceiling</strong><small>YouTube title limit, not a target</small></div>
          <div><span>2</span><strong>Opening lines</strong><small>Useful before “Show more”</small></div>
          <div><span>✓</span><strong>Truth before hype</strong><small>No fake volume, ranking or viral claim</small></div>
        </section>

        <section className="description-builder">
          <header><div><span>DS</span><strong>Upload packaging engine</strong></div><div><span>Output</span><strong>One complete upload package</strong></div></header>
          <div className="description-model-bar">
            {connections.length ? <><div className="description-provider-tabs">{connections.map((connection) => <button type="button" key={connection.providerId} className={providerId === connection.providerId ? 'active' : ''} onClick={() => changeProvider(connection.providerId)}><i>{providerMark(connection.providerId)}</i><span>{connection.providerName}</span></button>)}</div><label><span>Model</span><select value={modelId} onChange={(event) => changeModel(event.target.value)}>{activeConnection?.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label></> : <div className="description-no-model">No AI provider connected. <Link href="/studio/settings">Add one in Settings →</Link></div>}
          </div>
          <label className="description-direction"><span>Optional direction</span><textarea value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="Only add a real editorial preference. Leave blank for the automatic best-fit package." /></label>
          <div className="description-request-note"><span>1 request</span><p>The AI receives the selected Idea, Final Script, selected Thumbnail and verified source URLs. It does not receive Visual or Audio plans because they are not needed here.</p></div>
          {error && <div className="description-message error"><span>!</span><p>{error}</p></div>}
          {notice && <div className="description-message success"><span>✓</span><p>{notice}</p></div>}
          <div className="description-build-row"><div><strong>{handoffReady ? 'Ready when you are' : 'Final Thumbnail required'}</strong><span>Opening this page never sends an AI request.</span></div><button type="button" disabled={loading || !handoffReady || !activeModel} onClick={buildUploadPackage}>{loading ? <><i className="description-spinner" /> Building carefully…</> : <>Build Upload Package <span>→</span></>}</button></div>
        </section>

        {plan ? <>
          {!planCurrent && <div className="description-stale">This older package is preserved, but its source handoff has changed. Build a fresh package before continuing.</div>}
          <section className="description-titles">
            <header><div><p>TITLE LAB</p><h2>Three finalists</h2><span>These test three different viewer-entry ideas with the same selected Thumbnail. “Best” is an editorial starting point, not a view guarantee.</span></div><b>{selectedTitle ? 'Final chosen' : 'Choose one Final'}</b></header>
            <div className="description-recommendation"><span>Why this starts first</span><p>{plan.recommendationReason}</p></div>
            <div className="description-title-grid finalists">{finalistTitles.map((option) => titleCard(option, true))}</div>
            <button type="button" className="description-show-more" onClick={() => setShowAllTitles((value) => !value)}>{showAllTitles ? 'Hide the other 9 options' : 'View the other 9 strong options'} <span>{showAllTitles ? '↑' : '↓'}</span></button>
            {showAllTitles && <div className="description-title-grid reserve">{reserveTitles.map((option) => titleCard(option, false))}</div>}
          </section>

          <section className="description-copy">
            <header><div><p>COPY-READY PUBLIC DESCRIPTION</p><h2>Paste into YouTube Studio</h2><span>Chapter times are careful Script-based estimates. Check them once against the final edited video before publishing.</span></div><div><button type="button" onClick={() => copyText(publicDescription, 'Full public description copied.')}>Copy description</button><button type="button" onClick={downloadPackage}>Download package</button></div></header>
            <div className="description-opening">{plan.description.openingLines.map((line) => <strong key={line}>{line}</strong>)}</div>
            <p className="description-body">{plan.description.body}</p>
            <div className="description-extras"><article><span>Chapters</span>{plan.description.chapters.map((chapter) => <p key={`${chapter.timestamp}-${chapter.label}`}><b>{chapter.timestamp}</b>{chapter.label}</p>)}</article><article><span>Verified sources used</span>{plan.description.sourceUrls.length ? plan.description.sourceUrls.map((url) => <a href={url} target="_blank" rel="noreferrer" key={url}>{verifiedSources.find((source) => source.url === url)?.title || url}</a>) : <p>No verified source URL was available to include.</p>}</article><article><span>AI reconstruction note</span><p>{plan.description.aiDisclosure}</p>{plan.description.hashtags.length > 0 && <p className="description-hashtags">{plan.description.hashtags.join(' ')}</p>}</article></div>
          </section>

          <section className="description-support"><article><header><div><p>PINNED COMMENT</p><h2>Start a real conversation</h2></div><button type="button" onClick={() => copyText(plan.pinnedComment, 'Pinned comment copied.')}>Copy</button></header><p>{plan.pinnedComment}</p></article><article><header><div><p>PRIVATE SEARCH GUIDE</p><h2>Planning language only</h2></div></header><span>Do not paste this as a keyword block.</span><div>{plan.searchPhrases.map((phrase) => <b key={phrase}>{phrase}</b>)}</div></article></section>
        </> : <section className="description-empty"><div>≡</div><p>NO UPLOAD PACKAGE YET</p><h2>Your approved story is waiting.</h2><span>Review the selected Thumbnail above, choose the AI model, then click Build Upload Package once. Existing work is never replaced unless the complete new package passes every check.</span></section>}

        <section className="description-next"><Link href="/studio/thumbnails"><span>Previous</span><strong>← Thumbnails</strong></Link><div><span>Final title</span><strong>{selectedTitle?.title || 'Choose one title above'}</strong></div><button type="button" disabled={!planCurrent || !selectedTitle} onClick={continueToShorts}><span>Next section</span><strong>Shorts <i>→</i></strong></button></section>
      </div>
    </section>

    {sourceOpen && selectedThumbnail && <div className="description-modal" role="dialog" aria-modal="true" aria-label="Selected Thumbnail direction"><section><header><div><p>SELECTED THUMBNAIL</p><h2>{selectedThumbnail.conceptName}</h2></div><button type="button" onClick={() => setSourceOpen(false)} aria-label="Close">×</button></header><div><article><span>Exact on-image text</span><strong>{selectedThumbnail.headline}</strong></article><article><span>Viewer promise</span><p>{selectedThumbnail.viewerPromise}</p></article><article><span>Title relationship</span><p>{selectedThumbnail.titlePartner}</p></article><article className="wide"><span>Production prompt</span><p>{selectedThumbnail.thumbnailPrompt}</p></article></div></section></div>}
  </main>;
}
