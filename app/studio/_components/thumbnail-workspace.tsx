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
type Idea = {
  id: string;
  title: string;
  premise?: string;
  hook?: string;
  region?: string;
  period?: string;
  everydayLens?: string;
};
type StageRecord = {
  content: string;
  providerName: string;
  modelName: string;
  updatedAt: string;
  selectedThumbnailId?: string;
  sourceIdeaId?: string;
  sourceResearchUpdatedAt?: string;
  sourceScriptUpdatedAt?: string;
  sourceAudioUpdatedAt?: string;
  visualModestyMode?: 'evidence_led' | 'strict';
};
type WorkflowState = {
  selectedIdea?: Idea;
  stages: Record<string, StageRecord | undefined>;
};
type ModelPreference = { providerId: ProviderId; modelId: string };


type ThumbnailTextMode = 'text_led' | 'text_free';
type ThumbnailTextPlacement = 'none' | 'top_left' | 'middle_left' | 'bottom_left' | 'top_center' | 'top_right' | 'middle_right';
type ThumbnailConcept = {
  id: string;
  angleType: string;
  conceptName: string;
  curiosity: string;
  viewerPromise: string;
  audienceBridge: string;
  titlePartner: string;
  testHypothesis: string;
  instantRead: string;
  visualTension: string;
  textMode: ThumbnailTextMode;
  headline: string;
  textPlacement: ThumbnailTextPlacement;
  textColor: string;
  accentColor: string;
  outlineColor: string;
  emphasisWord: string;
  textReason: string;
  subject: string;
  setting: string;
  composition: string;
  colorAndLight: string;
  truthAnchor: string;
  mobileRead: string;
  textStyle: string;
  thumbnailPrompt: string;
  negativePrompt: string;
};
type ThumbnailPlan = {
  version: 'ARCLANE_THUMBNAIL_PLAN_2026_08_V5';
  recommendedId: string;
  recommendationReason: string;
  migratedFrom?: string;
  concepts: ThumbnailConcept[];
};

const workflowStorageKey = 'arclane.creator-workflow.v1';
const connectionStorageKey = 'arclane.model-connections.v1';
const modelPreferenceKey = 'arclane.workflow-models.v1';
const connectionChangeEvent = 'arclane:model-connections-changed';
const planVersion = 'ARCLANE_THUMBNAIL_PLAN_2026_08_V5' as const;
const legacyPlanVersions = new Set(['ARCLANE_THUMBNAIL_PLAN_2026_08_V1', 'ARCLANE_THUMBNAIL_PLAN_2026_08_V2', 'ARCLANE_THUMBNAIL_PLAN_2026_08_V3', 'ARCLANE_THUMBNAIL_PLAN_2026_08_V4']);
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function parseJsonObject(content: string) {
  const unfenced = content.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model returned no usable Thumbnail Plan. Your saved work is unchanged; try again or choose another model.');
  return asRecord(JSON.parse(jsonrepair(unfenced.slice(start, end + 1))));
}

function conciseHeadline(value: unknown) {
  const words = stringValue(value).replace(/["“”]/g, '').split(/\s+/).filter(Boolean);
  return words.slice(0, 5).join(' ');
}

const textPlacements = new Set<ThumbnailTextPlacement>(['none', 'top_left', 'middle_left', 'bottom_left', 'top_center', 'top_right', 'middle_right']);

function placementValue(value: unknown, textMode: ThumbnailTextMode): ThumbnailTextPlacement {
  if (textMode === 'text_free') return 'none';
  const placement = stringValue(value) as ThumbnailTextPlacement;
  return textPlacements.has(placement) && placement !== 'none' ? placement : 'top_left';
}

function colorValue(value: unknown, fallback: string) {
  const color = stringValue(value).toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : fallback;
}

function parseThumbnailPlan(content: string, allowLegacy = false): ThumbnailPlan {
  const root = parseJsonObject(content);
  const returnedVersion = stringValue(root.version);
  const legacy = legacyPlanVersions.has(returnedVersion);
  if (returnedVersion !== planVersion && !(allowLegacy && legacy)) {
    throw new Error('The model returned an outdated Thumbnail format. Your saved work is unchanged; click Create 3 Options again.');
  }
  const rawConcepts = Array.isArray(root.concepts) ? root.concepts : [];
  if (rawConcepts.length !== 3) {
    throw new Error('The model must return exactly 3 genuinely different Thumbnail options. Your previous options are unchanged; click Create 3 Options again.');
  }

  const concepts = rawConcepts.map((value, index): ThumbnailConcept => {
    const raw = asRecord(value);
    const headline = conciseHeadline(raw.headline);
    const requestedMode = stringValue(raw.textMode) as ThumbnailTextMode;
    const textMode: ThumbnailTextMode = legacy ? 'text_led' : (requestedMode === 'text_free' || requestedMode === 'text_led' ? requestedMode : (headline ? 'text_led' : 'text_free'));
    const concept: ThumbnailConcept = {
      id: `THUMB-${String(index + 1).padStart(2, '0')}`,
      angleType: stringValue(raw.angleType) || `Direction ${index + 1}`,
      conceptName: stringValue(raw.conceptName),
      curiosity: stringValue(raw.curiosity),
      viewerPromise: stringValue(raw.viewerPromise),
      audienceBridge: stringValue(raw.audienceBridge),
      titlePartner: stringValue(raw.titlePartner),
      testHypothesis: stringValue(raw.testHypothesis),
      instantRead: stringValue(raw.instantRead),
      visualTension: stringValue(raw.visualTension),
      textMode,
      headline: textMode === 'text_led' ? headline : '',
      textPlacement: placementValue(raw.textPlacement, textMode),
      textColor: colorValue(raw.textColor, '#FFFFFF'),
      accentColor: colorValue(raw.accentColor, '#F6C453'),
      outlineColor: colorValue(raw.outlineColor, '#160F13'),
      emphasisWord: textMode === 'text_led' ? stringValue(raw.emphasisWord) : '',
      textReason: stringValue(raw.textReason),
      subject: stringValue(raw.subject),
      setting: stringValue(raw.setting),
      composition: stringValue(raw.composition),
      colorAndLight: stringValue(raw.colorAndLight),
      truthAnchor: stringValue(raw.truthAnchor),
      mobileRead: stringValue(raw.mobileRead),
      textStyle: textMode === 'text_led' ? stringValue(raw.textStyle) : '',
      thumbnailPrompt: stringValue(raw.thumbnailPrompt) || stringValue(raw.imagePrompt),
      negativePrompt: stringValue(raw.negativePrompt),
    };
    if (legacy) {
      concept.viewerPromise ||= 'The truthful viewing experience described by the selected episode and Final Script.';
      concept.audienceBridge ||= 'A clear human, object or process-led idea that does not require prior regional knowledge.';
      concept.titlePartner ||= 'Use a concise title that supplies context without repeating the Thumbnail.';
      concept.testHypothesis ||= 'Legacy text-led direction preserved from the previous Thumbnail system.';
      concept.instantRead ||= concept.subject || concept.conceptName;
      concept.visualTension ||= concept.curiosity;
      concept.headline ||= conciseHeadline(concept.conceptName) || 'HIDDEN HISTORY';
      concept.textPlacement = placementValue(raw.textPlacement, 'text_led');
      concept.emphasisWord ||= concept.headline.split(/\s+/)[0] ?? '';
      concept.textReason ||= 'Legacy text-led option preserved with a concise, readable overlay.';
      concept.textStyle ||= 'Bold documentary sans-serif, heavy weight, clean outline or restrained shadow; readable at phone size.';
      if (concept.thumbnailPrompt && !stringValue(raw.thumbnailPrompt)) {
        concept.thumbnailPrompt = `Create a complete, finished YouTube Thumbnail using this visual direction: ${concept.thumbnailPrompt}`;
      }
    }
    if (!concept.setting) concept.setting = 'Use the historically supported environment described in the Final Script.';
    if (!concept.colorAndLight) concept.colorAndLight = 'Strong figure-ground separation, story-appropriate cinematic light and restrained colour contrast.';
    if (!concept.mobileRead) concept.mobileRead = 'One dominant subject and one immediately understandable visual question at phone-feed size.';
    if (!concept.negativePrompt) concept.negativePrompt = 'logos, watermark, modern objects, fantasy, gore, sexualized imagery, distorted anatomy, crowded collage, tiny clues, inaccurate clothing, generic stock-photo look';

    const commonMissing = [concept.conceptName, concept.curiosity, concept.viewerPromise, concept.audienceBridge, concept.titlePartner, concept.testHypothesis, concept.instantRead, concept.visualTension, concept.textReason, concept.subject, concept.composition, concept.truthAnchor, concept.mobileRead, concept.thumbnailPrompt].some((field) => !field);
    if (commonMissing || concept.thumbnailPrompt.length < 160) {
      throw new Error(`Option ${index + 1} is incomplete. Nothing was replaced; click Create 3 Options again or choose another model.`);
    }

    if (concept.textMode === 'text_led') {
      const headlineWords = concept.headline.toLowerCase().split(/\s+/).filter(Boolean);
      if (!legacy && (headlineWords.length < 1 || headlineWords.length > 5)) {
        throw new Error(`Option ${index + 1} needs one to five exact Thumbnail words—or must be marked text-free. Nothing was replaced.`);
      }
      if (!concept.textStyle) throw new Error(`Option ${index + 1} is missing its text treatment. Nothing was replaced.`);
      if (!headlineWords.includes(concept.emphasisWord.toLowerCase())) concept.emphasisWord = concept.headline.split(/\s+/)[0] ?? '';
      const normalizedHeadline = concept.headline.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const normalizedTitlePartner = concept.titlePartner.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (normalizedHeadline && normalizedHeadline === normalizedTitlePartner) {
        throw new Error(`Option ${index + 1} repeats the same words in its title and Thumbnail. Nothing was replaced; create a complementary pair.`);
      }
    }
    return concept;
  });

  const distinctKeys = new Set(concepts.map((concept) => `${concept.angleType}|${concept.subject}|${concept.composition}|${concept.testHypothesis}`.toLowerCase().replace(/\s+/g, ' ')));
  if (distinctKeys.size !== 3) {
    throw new Error('The model repeated a Thumbnail direction. Your previous options are unchanged; create three new options with a capable model.');
  }
  if (!legacy) {
    const modes = new Set(concepts.map((concept) => concept.textMode));
    if (!modes.has('text_free') || !modes.has('text_led')) {
      throw new Error('The three options must include at least one text-free and one text-led hypothesis. Your previous options are unchanged.');
    }
  }

  const requestedRecommendation = stringValue(root.recommendedId).toUpperCase();
  const recommendedId = concepts.some((concept) => concept.id === requestedRecommendation) ? requestedRecommendation : concepts[0].id;
  return {
    version: planVersion,
    recommendedId,
    recommendationReason: stringValue(root.recommendationReason) || 'Best initial balance of truthful curiosity, one-glance clarity and selected-story fit.',
    migratedFrom: legacy ? returnedVersion : undefined,
    concepts,
  };
}

function readSavedPlan(content: string): ThumbnailPlan | null {
  try {
    const root = parseJsonObject(content);
    if (root.version !== planVersion && !legacyPlanVersions.has(stringValue(root.version))) return null;
    return parseThumbnailPlan(content, true);
  } catch {
    return null;
  }
}
function providerMark(providerId: ProviderId) {
  if (providerId === 'openai') return 'O';
  if (providerId === 'anthropic') return 'A';
  if (providerId === 'gemini') return 'G';
  return '+';
}

function compactDocument(value: string, limit: number) {
  if (value.length <= limit) return value;
  const segment = Math.floor((limit - 120) / 3);
  const middleStart = Math.max(0, Math.floor(value.length / 2) - Math.floor(segment / 2));
  return `${value.slice(0, segment)}\n\n[...middle of document...]\n\n${value.slice(middleStart, middleStart + segment)}\n\n[...ending of document...]\n\n${value.slice(-segment)}`;
}

export default function ThumbnailWorkspace() {
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
  const audioRecord = workflow.stages.audio;
  const visualRecord = workflow.stages.visuals;
  const thumbnailRecord = workflow.stages.thumbnails;
  const activeConnection = connections.find((item) => item.providerId === providerId);
  const activeModel = activeConnection?.models.find((item) => item.id === modelId);
  const plan = useMemo(() => thumbnailRecord?.content ? readSavedPlan(thumbnailRecord.content) : null, [thumbnailRecord]);
  const selectedThumbnailId = thumbnailRecord?.selectedThumbnailId ?? '';
  const selectedConcept = plan?.concepts.find((concept) => concept.id === selectedThumbnailId);
  const handoffReady = Boolean(selectedIdea && researchRecord?.content && scriptRecord?.content && audioRecord?.content);
  const planCurrent = Boolean(plan && !plan.migratedFrom && thumbnailRecord
    && thumbnailRecord.sourceIdeaId === selectedIdea?.id
    && thumbnailRecord.sourceResearchUpdatedAt === researchRecord?.updatedAt
    && thumbnailRecord.sourceScriptUpdatedAt === scriptRecord?.updatedAt
    && thumbnailRecord.sourceAudioUpdatedAt === audioRecord?.updatedAt);
  const legacyPlanPreserved = Boolean(thumbnailRecord?.content && !plan);
  const spokenScript = useMemo(() => getSpokenScriptText(scriptRecord?.content ?? ''), [scriptRecord?.content]);

  const persistWorkflow = useCallback((next: WorkflowState) => {
    try {
      window.localStorage.setItem(workflowStorageKey, JSON.stringify(next));
      setWorkflow(next);
      return true;
    } catch {
      setError('This browser could not save the Thumbnail Plan. Download or clear older local data, then try again.');
      return false;
    }
  }, []);

  const savePreference = useCallback((nextProviderId: ProviderId, nextModelId: string) => {
    const preferences = readJson<Record<string, ModelPreference>>(modelPreferenceKey, {});
    preferences.thumbnails = { providerId: nextProviderId, modelId: nextModelId };
    window.localStorage.setItem(modelPreferenceKey, JSON.stringify(preferences));
  }, []);

  useEffect(() => {
    const refreshConnections = () => setConnections(readConnections());
    const available = readConnections();
    const savedWorkflow = readJson<WorkflowState>(workflowStorageKey, initialWorkflow);
    const preference = readJson<Record<string, ModelPreference>>(modelPreferenceKey, {}).thumbnails;
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
      // Keep a valid provider selected when connections change in another tab.
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
    const nextModel = connection?.models[0];
    setProviderId(nextProviderId);
    setModelId(nextModel?.id ?? '');
    if (nextModel) savePreference(nextProviderId, nextModel.id);
  }

  function changeModel(nextModelId: string) {
    setModelId(nextModelId);
    if (providerId) savePreference(providerId, nextModelId);
  }

  async function buildThumbnailPlan() {
    if (loading) return;
    if (!handoffReady || !selectedIdea || !researchRecord || !scriptRecord || !audioRecord) {
      setError('Finish the selected Idea, Research, Final Script and current Audio Plan before creating Thumbnails.');
      return;
    }
    const connection = connections.find((item) => item.providerId === providerId);
    const model = connection?.models.find((item) => item.id === modelId);
    if (!connection || !model) {
      setError('Connect an AI provider and choose a capable model before creating Thumbnail options.');
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
          stage: 'thumbnails',
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
            visualModesty: { mode: visualRecord?.visualModestyMode === 'strict' ? 'strict' : 'evidence_led' },
            outputs: {
              research: compactDocument(researchRecord.content, 9000),
              scripts: compactDocument(spokenScript, 30000),
            },
          },
        }),
      });
      const result = await response.json() as { output?: string; error?: string };
      if (!response.ok || !result.output) throw new Error(result.error || 'The model did not return a usable Thumbnail Plan.');
      const nextPlan = parseThumbnailPlan(result.output);
      const record: StageRecord = {
        content: JSON.stringify(nextPlan, null, 2),
        providerName: connection.providerName,
        modelName: model.name,
        updatedAt: new Date().toISOString(),
        selectedThumbnailId: '',
        sourceIdeaId: selectedIdea.id,
        sourceResearchUpdatedAt: researchRecord.updatedAt,
        sourceScriptUpdatedAt: scriptRecord.updatedAt,
        sourceAudioUpdatedAt: audioRecord.updatedAt,
      };
      const next: WorkflowState = {
        ...workflow,
        stages: { ...workflow.stages, thumbnails: record, description: undefined, shorts: undefined },
      };
      if (persistWorkflow(next)) {
        setNotice('Three complete text-free/text-led Thumbnail hypotheses are saved. Choose one Final direction below.');
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Thumbnail planning failed. Your saved work is unchanged.');
    } finally {
      setLoading(false);
    }
  }

  function selectConcept(id: string) {
    if (!thumbnailRecord || !planCurrent) return;
    const nextRecord = { ...thumbnailRecord, content: JSON.stringify({ ...plan, selectedThumbnailId: id }, null, 2), selectedThumbnailId: id, updatedAt: new Date().toISOString() };
    const next = { ...workflow, stages: { ...workflow.stages, thumbnails: nextRecord, description: undefined, shorts: undefined } };
    if (persistWorkflow(next)) {
      setError('');
      setNotice(`${plan?.concepts.find((concept) => concept.id === id)?.conceptName ?? 'Thumbnail'} selected as Final.`);
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

  function fullPrompt(concept: ThumbnailConcept) {
    const textLock = concept.textMode === 'text_led'
      ? `TEXT LOCK: Render only this exact on-image headline: "${concept.headline}". Preserve its spelling, capitalization and word order. Do not add any other visible words, letters, numbers, logos or interface text.`
      : 'TEXT-FREE LOCK: Render no words, letters, numbers, captions, logos, watermarks or interface text anywhere in the Thumbnail. The image must be a complete, compelling visual story—not an unfinished background.';
    return `${concept.thumbnailPrompt}\n\n${textLock}\n\nNEGATIVE INSTRUCTIONS: ${concept.negativePrompt}`;
  }

  function downloadPlan() {
    if (!plan) return;
    const blob = new Blob([JSON.stringify({ ...plan, selectedThumbnailId }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `arclane-thumbnail-plan-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice('Complete Thumbnail Plan downloaded.');
  }

  function continueToDescription() {
    if (!planCurrent || !selectedConcept) {
      setError('Select one Final Thumbnail direction before continuing to Description.');
      return;
    }
    window.location.assign('/studio/description');
  }

  if (!hydrated) {
    return <main className="module-shell module-pink thumbnail-shell"><StudioSidebar activeStageId="thumbnails" /><section className="module-main"><div className="thumbnail-loading">Loading the Thumbnail handoff…</div></section></main>;
  }

  return (
    <main className="module-shell module-pink thumbnail-shell">
      <StudioSidebar activeStageId="thumbnails" />
      <section className="module-main">
        <header className="module-topbar"><div><span>Creator Studio</span><i>/</i><strong>Thumbnails</strong></div><div className="module-profile"><span>Local workspace</span><i>YC</i></div></header>
        <div className="module-content thumbnail-content">
          <div className="module-heading thumbnail-heading"><div><p>RIGHT VIEWER · HONEST CURIOSITY · THREE HYPOTHESES</p><h1>Thumbnails</h1><span>Turn the approved story into three materially different title-and-thumbnail hypotheses—each truthful, globally clear and ready to produce.</span></div><div className="module-number">07<small>/ 09</small></div></div>

          <section className="thumbnail-handoff">
            <div className="thumbnail-handoff-icon">TH</div>
            <div><p>APPROVED EPISODE HANDOFF</p><h2>{selectedIdea?.title ?? 'No episode selected'}</h2><span>Thumbnail generation uses the selected idea, verified research and Final Script. Audio is checked only as the completed workflow handoff; it is not added to the AI request.</span><div className="thumbnail-handoff-badges"><b className={researchRecord ? 'ready' : ''}>Research {researchRecord ? 'ready' : 'missing'}</b><b className={scriptRecord ? 'ready' : ''}>Final Script {scriptRecord ? 'ready' : 'missing'}</b><b className={audioRecord ? 'ready' : ''}>Audio {audioRecord ? 'ready' : 'missing'}</b><b className="ready">{visualRecord?.visualModestyMode === 'strict' ? 'Strict covering carried forward' : 'Evidence-led modesty'}</b></div></div>
            <div className="thumbnail-handoff-actions"><button type="button" disabled={!selectedIdea || !scriptRecord} onClick={() => setSourceOpen(true)}>View story source</button><a href="/studio/audio">← Back to Audio</a></div>
          </section>

          <section className="thumbnail-standard" aria-label="Thumbnail production standard">
            <div><span>3</span><strong>Different hypotheses</strong><small>Not three recolors of one concept</small></div>
            <div><span>16:9</span><strong>Long-form frame</strong><small>3840 × 2160 production target</small></div>
            <div><span>0–5</span><strong>Text only when earned</strong><small>Every set tests text-free and text-led packaging</small></div>
            <div><span>✓</span><strong>Right-viewer fit</strong><small>Truth and viewing satisfaction before raw CTR</small></div>
          </section>

          <section className="thumbnail-builder">
            <header><div><span>TH</span><strong>Thumbnail packaging engine</strong></div><div><span>Output</span><strong>Exactly 3 test hypotheses</strong></div></header>
            <div className="thumbnail-model-bar">
              {connections.length ? <>
                <label><span>AI provider</span><div><b>{providerId ? providerMark(providerId) : '—'}</b><select value={providerId} onChange={(event) => changeProvider(event.target.value as ProviderId)}>{connections.map((connection) => <option value={connection.providerId} key={connection.providerId}>{connection.providerName}</option>)}</select></div></label>
                <label><span>Model for Thumbnail strategy</span><div><select value={modelId} onChange={(event) => changeModel(event.target.value)}>{activeConnection?.models.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}</select></div></label>
                <div className="thumbnail-request-note"><i />One focused request</div>
              </> : <div className="thumbnail-no-model"><span>◇</span><div><strong>No AI model connected</strong><small>Add one provider and choose a capable model. Your key remains in this browser.</small></div><a href="/studio/settings">Open Settings →</a></div>}
            </div>
            <details className="thumbnail-direction"><summary>Optional direction for these three options <span>＋</span></summary><label><span>Use only for a special need. Truthfulness, mobile clarity and three genuinely different concepts cannot be overridden.</span><textarea value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="Example: Avoid close-up faces; explore an object-led mystery as one option." /></label></details>
            {!handoffReady ? <div className="thumbnail-prerequisite"><span>!</span><div><strong>The production handoff is incomplete</strong><p>Finish Research, Final Script and one current Audio Plan first.</p></div><a href="/studio/audio">Open Audio</a></div> : null}
            {error ? <p className="thumbnail-message error" role="alert"><span>!</span>{error}</p> : null}
            {notice ? <p className="thumbnail-message success" role="status"><span>✓</span>{notice}</p> : null}
            <div className="thumbnail-build-row"><div><strong>{plan ? 'Create a fresh complete-prompt set without risking this one' : 'Ready for three truthful packaging directions'}</strong><span>A new result replaces saved options only after all three complete Thumbnail prompts pass automatic checks.</span></div><button type="button" disabled={loading || !handoffReady || !activeModel} onClick={() => void buildThumbnailPlan()}>{loading ? <><i className="thumbnail-spinner" /> Designing carefully…</> : <>{plan ? 'Create 3 New Options' : 'Create 3 Options'} <b>→</b></>}</button></div>
          </section>

          {plan ? <section className="thumbnail-results">
            <header><div><p>THREE COMPLETE THUMBNAIL PROMPTS</p><h2>Choose what you will generate</h2><span>Each prompt is a finished 16:9 direction. Text appears only when it strengthens the idea; every set includes a visual-only option that lets the image carry the promise.</span></div><div><button type="button" onClick={downloadPlan}>Download plan</button><small>{thumbnailRecord?.providerName} · {thumbnailRecord?.modelName}</small></div></header>
            {plan.migratedFrom ? <p className="thumbnail-stale"><span>!</span>Your older plan is preserved. Create 3 New Options once to receive the current V5 text-free/text-led experiment set.</p> : !planCurrent ? <p className="thumbnail-stale"><span>!</span>This saved plan belongs to older source work. Create three current options before continuing.</p> : null}
            <div className="thumbnail-use-guide"><span>1</span><p><strong>Generate all three directions</strong>Copy each full prompt into your preferred image model. They test genuinely different viewer-entry ideas, not simple recolours.</p><span>2</span><p><strong>Check at phone size</strong>For text-led options, verify exact spelling. For every option, confirm the subject and visual question remain clear when reduced.</p></div>
            <div className="thumbnail-grid">
              {plan.concepts.map((concept, index) => {
                const selected = selectedThumbnailId === concept.id;
                const recommended = plan.recommendedId === concept.id;

                const headlineWords = concept.headline.split(/\s+/).filter(Boolean);
                return <article className={`thumbnail-card${selected ? ' selected' : ''}${recommended ? ' recommended' : ''}`} key={concept.id}>
                  <div className={`thumbnail-mock ${concept.textPlacement} ${concept.textMode}`} aria-label={`${concept.textMode === 'text_led' ? 'Text-led' : 'Text-free'} layout blueprint for ${concept.conceptName}`}><span>{String(index + 1).padStart(2, '0')}</span><i />{concept.textMode === 'text_led' ? <b style={{ color: concept.textColor, WebkitTextStroke: `1px ${concept.outlineColor}` }}>{headlineWords.map((word, wordIndex) => <em key={`${word}-${wordIndex}`} style={word.replace(/[^a-z0-9]/gi, '').toLowerCase() === concept.emphasisWord.replace(/[^a-z0-9]/gi, '').toLowerCase() ? { color: concept.accentColor } : undefined}>{word}{wordIndex < headlineWords.length - 1 ? ' ' : ''}</em>)}</b> : null}<small>{concept.textMode === 'text_led' ? 'TEXT-LED BLUEPRINT' : 'TEXT-FREE BLUEPRINT'}</small></div>
                  <header><div><p>{concept.angleType}</p><h3>{concept.conceptName}</h3></div><div className="thumbnail-card-badges"><b>{concept.textMode === 'text_led' ? 'Text-led' : 'Text-free'}</b>{recommended ? <span>★ Best starting pick</span> : null}</div></header>
                  <div className="thumbnail-core"><p>THE ONE VISUAL QUESTION</p><strong>{concept.curiosity}</strong><span><b>VIEWER PROMISE</b>{concept.viewerPromise}</span></div>
                  <div className="thumbnail-package"><div><span>One-glance read</span><strong>{concept.instantRead}</strong></div><div><span>Visual tension</span><p>{concept.visualTension}</p></div><div><span>Title partner</span><strong>{concept.titlePartner}</strong></div><div><span>Global audience bridge</span><p>{concept.audienceBridge}</p></div><div><span>What this tests</span><p>{concept.testHypothesis}</p></div></div><dl><div><dt>Dominant subject</dt><dd>{concept.subject}</dd></div><div><dt>Setting</dt><dd>{concept.setting}</dd></div><div><dt>Composition</dt><dd>{concept.composition}</dd></div><div><dt>Color &amp; light</dt><dd>{concept.colorAndLight}</dd></div><div><dt>Truth anchor</dt><dd>{concept.truthAnchor}</dd></div><div><dt>Mobile check</dt><dd>{concept.mobileRead}</dd></div></dl>
                  {concept.textMode === 'text_led' ? <div className="thumbnail-headline"><span>Exact text inside the generated Thumbnail</span><strong>{concept.headline}</strong><small>{concept.textReason}</small><div><b style={{ background: concept.textColor }} /><b style={{ background: concept.accentColor }} /><em>{concept.textPlacement.replaceAll('_', ' ')} · highlight “{concept.emphasisWord}”</em></div><p>{concept.textStyle}</p></div> : <div className="thumbnail-headline text-free"><span>No text inside the generated Thumbnail</span><strong>Visual only</strong><small>{concept.textReason}</small><p>The title supplies the verbal context; this image supplies the subject, tension and curiosity.</p></div>}
                  <details className="thumbnail-prompt"><summary>View complete Thumbnail prompt <span>＋</span></summary><p>{fullPrompt(concept)}</p></details>
                  <div className="thumbnail-card-actions"><button type="button" onClick={() => void copyText(fullPrompt(concept), `${concept.conceptName} complete Thumbnail prompt copied.`)}>Copy full Thumbnail prompt</button><button type="button" className={selected ? 'selected' : 'primary'} disabled={!planCurrent} onClick={() => selectConcept(concept.id)}>{selected ? '✓ Final selected' : 'Select as Final'}</button></div>
                </article>;
              })}
            </div>
            <div className="thumbnail-recommendation"><span>Editorial starting recommendation</span><strong>{plan.concepts.find((concept) => concept.id === plan.recommendedId)?.conceptName}</strong><p>{plan.recommendationReason}</p><small>This is not a prediction of views. The right viewers&apos; watch-time response—or your deliberate editorial choice—decides the final package.</small></div>
          </section> : <section className="thumbnail-empty"><div>◩</div><p>STORY SOURCE READY</p><h2>{legacyPlanPreserved ? 'Your older text output is preserved.' : 'No Thumbnail options have been created.'}</h2><span>Click Create 3 Options. You will receive three distinct, script-grounded, complete Thumbnail prompts, including both text-free and text-led packaging.</span></section>}

          <footer className="thumbnail-next"><a href="/studio/audio"><span>Previous stage</span><strong>← Audio</strong></a><div><span>Final direction</span><strong>{selectedConcept?.conceptName ?? 'Choose one option above'}</strong></div><button type="button" disabled={!planCurrent || !selectedConcept || loading} onClick={continueToDescription}><span>{selectedConcept ? 'Final Thumbnail direction saved' : 'Select one Final direction first'}</span><strong>Description <i>→</i></strong></button></footer>
        </div>
      </section>

      {sourceOpen ? <div className="thumbnail-modal" role="dialog" aria-modal="true" aria-label="Thumbnail story source" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourceOpen(false); }}><section><header><div><p>APPROVED SOURCE</p><h2>{selectedIdea?.title}</h2></div><button type="button" onClick={() => setSourceOpen(false)} aria-label="Close">×</button></header><div><article><span>Episode promise</span><p>{selectedIdea?.premise || selectedIdea?.hook || 'The selected episode and its approved script.'}</p></article><article><span>Final spoken script</span><p>{spokenScript}</p></article></div></section></div> : null}
    </main>
  );
}