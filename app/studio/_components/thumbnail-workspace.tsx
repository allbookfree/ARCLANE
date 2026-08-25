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
type ThumbnailConcept = {
  id: string;
  angleType: string;
  conceptName: string;
  curiosity: string;
  viewerPromise: string;
  audienceBridge: string;
  titlePartner: string;
  testHypothesis: string;
  headline: string;
  subject: string;
  setting: string;
  composition: string;
  colorAndLight: string;
  truthAnchor: string;
  mobileRead: string;
  imagePrompt: string;
  negativePrompt: string;
};
type ThumbnailPlan = {
  version: 'ARCLANE_THUMBNAIL_PLAN_2026_08_V2';
  recommendedId: string;
  recommendationReason: string;
  concepts: ThumbnailConcept[];
};

const workflowStorageKey = 'arclane.creator-workflow.v1';
const connectionStorageKey = 'arclane.model-connections.v1';
const modelPreferenceKey = 'arclane.workflow-models.v1';
const connectionChangeEvent = 'arclane:model-connections-changed';
const planVersion = 'ARCLANE_THUMBNAIL_PLAN_2026_08_V2' as const;
const legacyPlanVersion = 'ARCLANE_THUMBNAIL_PLAN_2026_08_V1' as const;
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
  return words.slice(0, 4).join(' ');
}

function parseThumbnailPlan(content: string, allowLegacy = false): ThumbnailPlan {
  const root = parseJsonObject(content);
  const returnedVersion = stringValue(root.version);
  const legacy = returnedVersion === legacyPlanVersion;
  if (returnedVersion !== planVersion && !(allowLegacy && legacy)) {
    throw new Error('The model returned an outdated Thumbnail format. Your saved work is unchanged; click Create 3 Options again.');
  }
  const rawConcepts = Array.isArray(root.concepts) ? root.concepts : [];
  if (rawConcepts.length !== 3) {
    throw new Error('The model must return exactly 3 genuinely different Thumbnail options. Your previous options are unchanged; click Create 3 Options again.');
  }

  const concepts = rawConcepts.map((value, index): ThumbnailConcept => {
    const raw = asRecord(value);
    const concept: ThumbnailConcept = {
      id: `THUMB-${String(index + 1).padStart(2, '0')}`,
      angleType: stringValue(raw.angleType) || `Direction ${index + 1}`,
      conceptName: stringValue(raw.conceptName),
      curiosity: stringValue(raw.curiosity),
      viewerPromise: stringValue(raw.viewerPromise),
      audienceBridge: stringValue(raw.audienceBridge),
      titlePartner: stringValue(raw.titlePartner),
      testHypothesis: stringValue(raw.testHypothesis),
      headline: conciseHeadline(raw.headline),
      subject: stringValue(raw.subject),
      setting: stringValue(raw.setting),
      composition: stringValue(raw.composition),
      colorAndLight: stringValue(raw.colorAndLight),
      truthAnchor: stringValue(raw.truthAnchor),
      mobileRead: stringValue(raw.mobileRead),
      imagePrompt: stringValue(raw.imagePrompt),
      negativePrompt: stringValue(raw.negativePrompt),
    };
    if (legacy) {
      concept.viewerPromise ||= 'The truthful viewing experience described by the selected episode and Final Script.';
      concept.audienceBridge ||= 'A clear human, object or process-led idea that does not require prior regional knowledge.';
      concept.titlePartner ||= 'Use a concise title that supplies context without repeating the thumbnail.';
      concept.testHypothesis ||= 'Legacy direction preserved from the previous Thumbnail system.';
    }
    const missing = [concept.conceptName, concept.curiosity, concept.viewerPromise, concept.audienceBridge, concept.titlePartner, concept.testHypothesis, concept.subject, concept.composition, concept.truthAnchor, concept.mobileRead, concept.imagePrompt].some((field) => !field);
    if (missing || concept.imagePrompt.length < 100) {
      throw new Error(`Option ${index + 1} is incomplete. Nothing was replaced; click Create 3 Options again or choose another model.`);
    }
    const normalizedHeadline = concept.headline.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const normalizedTitlePartner = concept.titlePartner.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (normalizedHeadline && normalizedHeadline === normalizedTitlePartner) {
      throw new Error(`Option ${index + 1} repeats the same words in its title and Thumbnail. Nothing was replaced; create a complementary pair.`);
    }
    if (!concept.setting) concept.setting = 'Use the historically supported environment described in the script.';
    if (!concept.colorAndLight) concept.colorAndLight = 'Strong subject separation, restrained cinematic contrast, readable at mobile size.';
    if (!concept.mobileRead) concept.mobileRead = 'One dominant subject and one immediately readable visual question at small size.';
    if (!concept.negativePrompt) concept.negativePrompt = 'text, letters, logos, watermark, modern objects, fantasy, gore, sexualized imagery, distorted anatomy, crowded collage, tiny details, inaccurate clothing';
    return concept;
  });

  const distinctKeys = new Set(concepts.map((concept) => `${concept.angleType}|${concept.subject}|${concept.composition}|${concept.testHypothesis}`.toLowerCase().replace(/\s+/g, ' ')));
  if (distinctKeys.size !== 3) {
    throw new Error('The model repeated a Thumbnail direction. Your previous options are unchanged; create three new options with a capable model.');
  }

  const requestedRecommendation = stringValue(root.recommendedId).toUpperCase();
  const recommendedId = concepts.some((concept) => concept.id === requestedRecommendation) ? requestedRecommendation : concepts[0].id;
  return {
    version: planVersion,
    recommendedId,
    recommendationReason: stringValue(root.recommendationReason) || 'Best initial balance of truthful curiosity, clarity and mobile readability.',
    concepts,
  };
}

function readSavedPlan(content: string): ThumbnailPlan | null {
  try {
    const root = parseJsonObject(content);
    if (root.version !== planVersion && root.version !== legacyPlanVersion) return null;
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
  const planCurrent = Boolean(plan && thumbnailRecord
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
              research: compactDocument(researchRecord.content, 18000),
              scripts: compactDocument(spokenScript, 32000),
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
      if (persistWorkflow(next)) setNotice('Three distinct, test-ready title-and-thumbnail hypotheses are saved. Choose one Final direction below.');
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
    return `${concept.imagePrompt}\n\nNegative prompt: ${concept.negativePrompt}`;
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
            <div className="thumbnail-handoff-actions"><button type="button" disabled={!selectedIdea || !scriptRecord} onClick={() => setSourceOpen(true)}>View story source</button><Link href="/studio/audio">← Back to Audio</Link></div>
          </section>

          <section className="thumbnail-standard" aria-label="Thumbnail production standard">
            <div><span>3</span><strong>Different hypotheses</strong><small>Not three recolors of one concept</small></div>
            <div><span>16:9</span><strong>Long-form frame</strong><small>3840 × 2160 production target</small></div>
            <div><span>0–4</span><strong>Optional words</strong><small>Readable, complementary—not repeated title</small></div>
            <div><span>✓</span><strong>Right-viewer fit</strong><small>Truth and viewing satisfaction before raw CTR</small></div>
          </section>

          <section className="thumbnail-builder">
            <header><div><span>TH</span><strong>Thumbnail packaging engine</strong></div><div><span>Output</span><strong>Exactly 3 test hypotheses</strong></div></header>
            <div className="thumbnail-model-bar">
              {connections.length ? <>
                <label><span>AI provider</span><div><b>{providerId ? providerMark(providerId) : '—'}</b><select value={providerId} onChange={(event) => changeProvider(event.target.value as ProviderId)}>{connections.map((connection) => <option value={connection.providerId} key={connection.providerId}>{connection.providerName}</option>)}</select></div></label>
                <label><span>Model for Thumbnail strategy</span><div><select value={modelId} onChange={(event) => changeModel(event.target.value)}>{activeConnection?.models.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}</select></div></label>
                <div className="thumbnail-request-note"><i />One focused request</div>
              </> : <div className="thumbnail-no-model"><span>◇</span><div><strong>No AI model connected</strong><small>Add one provider and choose a capable model. Your key remains in this browser.</small></div><Link href="/studio/settings">Open Settings →</Link></div>}
            </div>
            <details className="thumbnail-direction"><summary>Optional direction for these three options <span>＋</span></summary><label><span>Use only for a special need. Truthfulness, mobile clarity and three genuinely different concepts cannot be overridden.</span><textarea value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="Example: Avoid close-up faces; explore an object-led mystery as one option." /></label></details>
            {!handoffReady ? <div className="thumbnail-prerequisite"><span>!</span><div><strong>The production handoff is incomplete</strong><p>Finish Research, Final Script and one current Audio Plan first.</p></div><Link href="/studio/audio">Open Audio</Link></div> : null}
            {error ? <p className="thumbnail-message error" role="alert"><span>!</span>{error}</p> : null}
            {notice ? <p className="thumbnail-message success" role="status"><span>✓</span>{notice}</p> : null}
            <div className="thumbnail-build-row"><div><strong>{planCurrent ? 'Create a fresh set without risking this one' : 'Ready for three truthful packaging directions'}</strong><span>A new result replaces saved options only after all three pass automatic checks.</span></div><button type="button" disabled={loading || !handoffReady || !activeModel} onClick={() => void buildThumbnailPlan()}>{loading ? <><i className="thumbnail-spinner" /> Designing carefully…</> : <>{planCurrent ? 'Create 3 New Options' : 'Create 3 Options'} <b>→</b></>}</button></div>
          </section>

          {plan ? <section className="thumbnail-results">
            <header><div><p>THREE TEST-READY PACKAGING HYPOTHESES</p><h2>Choose what you will produce</h2><span>Each visual has a complementary title direction. Produce all three when practical, then use YouTube&apos;s native A/B test or your deliberate editorial choice.</span></div><div><button type="button" onClick={downloadPlan}>Download plan</button><small>{thumbnailRecord?.providerName} · {thumbnailRecord?.modelName}</small></div></header>
            {!planCurrent ? <p className="thumbnail-stale"><span>!</span>This saved plan belongs to older source work. Create three current options before continuing.</p> : null}
            <div className="thumbnail-grid">
              {plan.concepts.map((concept, index) => {
                const selected = selectedThumbnailId === concept.id;
                const recommended = plan.recommendedId === concept.id;
                return <article className={`thumbnail-card${selected ? ' selected' : ''}`} key={concept.id}>
                  <div className="thumbnail-mock" aria-label={`Layout blueprint for ${concept.conceptName}`}><span>{String(index + 1).padStart(2, '0')}</span><i /><b>{concept.headline || 'NO TEXT'}</b><small>LAYOUT BLUEPRINT · IMAGE IS GENERATED ELSEWHERE</small></div>
                  <header><div><p>{concept.angleType}</p><h3>{concept.conceptName}</h3></div>{recommended ? <span>Editorial starting pick</span> : null}</header>
                  <div className="thumbnail-core"><p>THE ONE VISUAL QUESTION</p><strong>{concept.curiosity}</strong><span><b>VIEWER PROMISE</b>{concept.viewerPromise}</span></div>
                  <div className="thumbnail-package"><div><span>Title partner</span><strong>{concept.titlePartner}</strong></div><div><span>Global audience bridge</span><p>{concept.audienceBridge}</p></div><div><span>What this tests</span><p>{concept.testHypothesis}</p></div></div><dl><div><dt>Dominant subject</dt><dd>{concept.subject}</dd></div><div><dt>Setting</dt><dd>{concept.setting}</dd></div><div><dt>Composition</dt><dd>{concept.composition}</dd></div><div><dt>Color &amp; light</dt><dd>{concept.colorAndLight}</dd></div><div><dt>Truth anchor</dt><dd>{concept.truthAnchor}</dd></div><div><dt>Mobile check</dt><dd>{concept.mobileRead}</dd></div></dl>
                  <div className="thumbnail-headline"><span>Optional overlay</span><strong>{concept.headline || 'Use no words'}</strong><small>Add this later in your editor—never bake text into the generated image.</small></div>
                  <details className="thumbnail-prompt"><summary>Production-ready image prompt <span>＋</span></summary><p>{concept.imagePrompt}</p><div><strong>Negative prompt</strong><span>{concept.negativePrompt}</span></div></details>
                  <div className="thumbnail-card-actions"><button type="button" onClick={() => void copyText(fullPrompt(concept), `${concept.conceptName} image prompt copied.`)}>Copy image prompt</button><button type="button" className={selected ? 'selected' : 'primary'} disabled={!planCurrent} onClick={() => selectConcept(concept.id)}>{selected ? '✓ Final selected' : 'Select as Final'}</button></div>
                </article>;
              })}
            </div>
            <div className="thumbnail-recommendation"><span>Editorial starting recommendation</span><strong>{plan.concepts.find((concept) => concept.id === plan.recommendedId)?.conceptName}</strong><p>{plan.recommendationReason}</p><small>This is not a prediction of views. The right viewers&apos; watch-time response—or your deliberate editorial choice—decides the final package.</small></div>
          </section> : <section className="thumbnail-empty"><div>◩</div><p>STORY SOURCE READY</p><h2>{legacyPlanPreserved ? 'Your older text output is preserved.' : 'No Thumbnail options have been created.'}</h2><span>Click Create 3 Options. You will receive three distinct, script-grounded directions—not three recolors of the same idea.</span></section>}

          <footer className="thumbnail-next"><Link href="/studio/audio"><span>Previous stage</span><strong>← Audio</strong></Link><div><span>Final direction</span><strong>{selectedConcept?.conceptName ?? 'Choose one option above'}</strong></div><button type="button" disabled={!planCurrent || !selectedConcept || loading} onClick={continueToDescription}><span>{selectedConcept ? 'Final Thumbnail direction saved' : 'Select one Final direction first'}</span><strong>Description <i>→</i></strong></button></footer>
        </div>
      </section>

      {sourceOpen ? <div className="thumbnail-modal" role="dialog" aria-modal="true" aria-label="Thumbnail story source" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourceOpen(false); }}><section><header><div><p>APPROVED SOURCE</p><h2>{selectedIdea?.title}</h2></div><button type="button" onClick={() => setSourceOpen(false)} aria-label="Close">×</button></header><div><article><span>Episode promise</span><p>{selectedIdea?.premise || selectedIdea?.hook || 'The selected episode and its approved script.'}</p></article><article><span>Final spoken script</span><p>{spokenScript}</p></article></div></section></div> : null}
    </main>
  );
}