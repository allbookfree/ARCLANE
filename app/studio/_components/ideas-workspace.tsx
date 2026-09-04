'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { jsonrepair } from 'jsonrepair';
import { type StudioStageId } from '../_lib/stages';
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
type SavedIdea = { key: string; idea: Idea; savedAt: string; status?: IdeaStatus };
type IdeaLibraryFile = {
  schema: 'arclane-idea-memory';
  version: 1;
  exportedAt: string;
  channel: 'Global Everyday History';
  ideas: SavedIdea[];
};
type WorkflowState = {
  selectedIdea?: Idea;
  stages: Partial<Record<StudioStageId, StageRecord>>;
  ideaBatches?: IdeaBatch[];
  savedIdeas?: SavedIdea[];
};
type ModelPreference = { providerId: ProviderId; modelId: string };

const connectionStorageKey = 'arclane.model-connections.v1';
const workflowStorageKey = 'arclane.creator-workflow.v1';
const modelPreferenceKey = 'arclane.workflow-models.v1';
const searchPreferenceKey = 'arclane.ideas-web-search.v1';
const connectionChangeEvent = 'arclane:model-connections-changed';
const initialWorkflow: WorkflowState = { stages: {}, ideaBatches: [], savedIdeas: [] };

const regionOptions = ['Worldwide · no restriction', 'Africa', 'The Americas', 'Asia', 'Europe', 'Middle East & North Africa', 'Oceania', 'Cross-cultural comparison'];
const eraOptions = ['Any era · no restriction', 'Ancient world', 'Medieval world', 'Early modern world', 'Industrial transition', '19th–early 20th century', 'Cross-period comparison'];
const focusOptions = ['All everyday-life dimensions', 'Food & water', 'Work & craft', 'Homes & family', 'Health & hygiene', 'Travel & communication', 'Systems & infrastructure', 'Belief & daily practice', 'Survival & climate'];
const mixOptions = ['Automatic · AI chooses the strongest mix', 'Prefer familiar doorways', 'Prefer underexplored worlds', 'Prefer cross-cultural connections'];

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

function parseIdeas(content: string) {
  try {
    const unfenced = content.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    const candidate = start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced;
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate) as unknown;
    } catch {
      // Models occasionally emit near-JSON (trailing commas, unquoted keys).
      // Repair before giving up so one formatting slip cannot erase a batch.
      parsed = JSON.parse(jsonrepair(candidate)) as unknown;
    }
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { ideas?: unknown }).ideas)
        ? (parsed as { ideas: unknown[] }).ideas
        : [];
    return list.map(normalizeIdea).filter((idea) => idea.title && idea.premise);
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

function batchFromRecord(record?: StageRecord): IdeaBatch | null {
  if (!record?.ideas?.length) return null;
  return {
    id: `legacy-${record.updatedAt}`,
    ideas: record.ideas.map(normalizeIdea),
    content: record.content,
    sources: record.sources,
    grounded: record.grounded,
    providerName: record.providerName,
    modelName: record.modelName,
    createdAt: record.updatedAt,
  };
}

export default function IdeasWorkspace() {
  const [hydrated, setHydrated] = useState(false);
  const [connections, setConnections] = useState<Selection[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowState>(initialWorkflow);
  const [providerId, setProviderId] = useState<ProviderId | ''>('');
  const [modelId, setModelId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [region, setRegion] = useState(regionOptions[0]);
  const [era, setEra] = useState(eraOptions[0]);
  const [focus, setFocus] = useState(focusOptions[0]);
  const [mix, setMix] = useState(mixOptions[0]);
  const [direction, setDirection] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [copiedIdeaKey, setCopiedIdeaKey] = useState('');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [searchPreferences, setSearchPreferences] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [moreLikeIdea, setMoreLikeIdea] = useState<Idea | null>(null);
  const [deleteSavedIdea, setDeleteSavedIdea] = useState<SavedIdea | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const requestInFlight = useRef(false);
  const autoRunHandled = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  const batches = useMemo(() => {
    if (workflow.ideaBatches?.length) return workflow.ideaBatches;
    const legacy = batchFromRecord(workflow.stages.ideas);
    return legacy ? [legacy] : [];
  }, [workflow.ideaBatches, workflow.stages.ideas]);
  const activeBatch = batches.find((batch) => batch.id === selectedBatchId) ?? batches[0];
  const activeIdeas = activeBatch?.ideas ?? [];
  const activeConnection = connections.find((item) => item.providerId === providerId);
  const activeModel = activeConnection?.models.find((model) => model.id === modelId);
  const currentSelection = activeBatch && workflow.selectedIdea?.batchId === activeBatch.id
    ? workflow.selectedIdea
    : undefined;
  const webSearchCapable = Boolean(providerId && providerId !== 'custom');
  const webSearchEnabled = webSearchCapable && Boolean(providerId && searchPreferences[providerId]);

  const persistWorkflow = useCallback((next: WorkflowState) => {
    try {
      window.localStorage.setItem(workflowStorageKey, JSON.stringify(next));
      setWorkflow(next);
      return true;
    } catch {
      setError('This browser could not save more idea data. Export or remove older browser data before continuing.');
      return false;
    }
  }, []);

  const savePreference = useCallback((nextProviderId: ProviderId, nextModelId: string) => {
    const preferences = readJson<Partial<Record<StudioStageId, ModelPreference>>>(modelPreferenceKey, {});
    preferences.ideas = { providerId: nextProviderId, modelId: nextModelId };
    window.localStorage.setItem(modelPreferenceKey, JSON.stringify(preferences));
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- these effects hydrate and reconcile the browser-local workspace after mount */
  useEffect(() => {
    const refresh = () => setConnections(readConnections());
    const savedWorkflow = readJson<WorkflowState>(workflowStorageKey, initialWorkflow);
    const available = readConnections();
    const preference = readJson<Partial<Record<StudioStageId, ModelPreference>>>(modelPreferenceKey, {}).ideas;
    const savedSearchPreferences = readJson<Partial<Record<ProviderId, boolean>>>(searchPreferenceKey, {});
    const preferredConnection = available.find((item) => item.providerId === preference?.providerId) ?? available[0];
    const preferredModel = preferredConnection?.models.find((model) => model.id === preference?.modelId) ?? preferredConnection?.models[0];
    const savedBatches = savedWorkflow.ideaBatches?.length
      ? savedWorkflow.ideaBatches
      : batchFromRecord(savedWorkflow.stages?.ideas) ? [batchFromRecord(savedWorkflow.stages.ideas)!] : [];

    const normalizedSavedIdeas = dedupeSavedIdeas((savedWorkflow.savedIdeas ?? [])
      .map(normalizeSavedIdea).filter((item): item is SavedIdea => Boolean(item)));
    setWorkflow({ ...savedWorkflow, ideaBatches: savedBatches, savedIdeas: normalizedSavedIdeas });
    setSelectedBatchId(savedBatches[0]?.id ?? '');
    setConnections(available);
    setProviderId(preferredConnection?.providerId ?? '');
    setModelId(preferredModel?.id ?? '');
    setSearchPreferences(savedSearchPreferences);
    setHydrated(true);
    window.addEventListener('storage', refresh);
    window.addEventListener(connectionChangeEvent, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(connectionChangeEvent, refresh);
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

  const generateIdeas = useCallback(async (directionOverride?: string) => {
    if (requestInFlight.current) {
      setNotice('An Ideas request is already running. The system will not send a duplicate request.');
      return;
    }
    const connection = connections.find((item) => item.providerId === providerId);
    const model = connection?.models.find((item) => item.id === modelId);
    if (!connection || !model) {
      setError('Connect an AI provider and choose a model before generating ideas.');
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    requestInFlight.current = true;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const generatedIndex = batches.slice(0, 25).flatMap((batch) => batch.ideas.map((idea) =>
        `${idea.title} | ${idea.region} | ${idea.period} | ${idea.everydayLens}`)).join('\n');
      const memoryIndex = (workflow.savedIdeas ?? []).map((item) =>
        `${item.idea.title} | ${item.idea.region} | ${item.idea.period} | ${item.idea.everydayLens} | ${item.status === 'used' ? 'VIDEO MADE' : 'RESERVED'}`).join('\n');
      const priorIdeaIndex = [
        generatedIndex ? `PREVIOUSLY GENERATED\n${generatedIndex}` : '',
        memoryIndex ? `IDEA MEMORY — DO NOT DUPLICATE\n${memoryIndex}` : '',
      ].filter(Boolean).join('\n\n');
      const requestedDirection = directionOverride?.trim() || direction.trim();
      const creatorDirection = [
        `Geographic coverage: ${region}.`,
        `Historical range: ${era}.`,
        `Everyday-life focus: ${focus}.`,
        `Discovery mode: ${mix}.`,
        requestedDirection ? `Additional creator direction: ${requestedDirection}` : '',
      ].filter(Boolean).join('\n');

      const response = await fetch('/api/automation/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          stage: 'ideas',
          provider: connection.providerId,
          model: model.id,
          apiKey: connection.apiKey,
          baseUrl: connection.baseUrl,
          authMethod: connection.authMethod,
          headerName: connection.headerName,
          completionPath: connection.completionPath,
          webSearchEnabled,
          extraInstructions: creatorDirection,
          context: { outputs: { ideas: priorIdeaIndex } },
        }),
      });
      const result = await response.json() as { output?: string; sources?: Source[]; grounded?: boolean; attempts?: number; retryAfterSeconds?: number; errorCode?: string; error?: string };
      if (!response.ok || !result.output) throw new Error(result.error || 'The model did not return usable ideas.');
      const parsedIdeas = parseIdeas(result.output);
      const remembered = new Set((workflow.savedIdeas ?? []).map((item) => ideaFingerprint(item.idea)));
      const duplicates = parsedIdeas.filter((idea) => remembered.has(ideaFingerprint(idea))).length;
      // A repeated memory idea is removed instead of failing the batch, and a
      // slightly short batch is shown rather than discarded, so one imperfect
      // model response can no longer erase otherwise usable ideas.
      const uniqueIdeas = parsedIdeas.filter((idea) => !remembered.has(ideaFingerprint(idea)));
      if (uniqueIdeas.length < 6) {
        throw new Error(duplicates
          ? `The model returned ${parsedIdeas.length} idea${parsedIdeas.length === 1 ? '' : 's'} but ${duplicates} of ${duplicates === 1 ? 'it is' : 'them are'} already in Idea Memory, leaving only ${uniqueIdeas.length} new. Nothing was saved; generate again so the library stays duplicate-safe.`
          : `The model returned ${parsedIdeas.length || 'no'} usable ideas instead of a complete set. Nothing was saved; regenerate with this or another model.`);
      }

      const now = new Date().toISOString();
      const batchId = `batch-${Date.now()}`;
      const ideas = uniqueIdeas.map((idea) => ({ ...idea, batchId }));
      const batch: IdeaBatch = {
        id: batchId,
        ideas,
        content: result.output,
        sources: result.sources,
        grounded: result.grounded,
        providerName: connection.providerName,
        modelName: model.name,
        createdAt: now,
      };
      const record: StageRecord = {
        content: result.output,
        ideas,
        sources: result.sources,
        grounded: result.grounded,
        providerName: connection.providerName,
        modelName: model.name,
        updatedAt: now,
      };
      const next: WorkflowState = {
        ...workflow,
        stages: { ...workflow.stages, ideas: record },
        ideaBatches: [batch, ...batches],
        savedIdeas: workflow.savedIdeas ?? [],
      };
      if (persistWorkflow(next)) {
        setSelectedBatchId(batchId);
        const providerCalls = result.attempts ?? 1;
        const countNote = uniqueIdeas.length === 8
          ? 'Eight new ideas created'
          : `${uniqueIdeas.length} usable ideas saved (the model returned fewer than eight)`;
        const duplicateNote = duplicates ? ` ${duplicates} duplicate${duplicates === 1 ? '' : 's'} from Idea Memory ${duplicates === 1 ? 'was' : 'were'} removed.` : '';
        setNotice(`${countNote} with ${connection.providerName} · ${model.name}${webSearchEnabled ? ' · live search on' : ' · knowledge-only'} · ${providerCalls} provider call${providerCalls === 1 ? '' : 's'}.${duplicateNote} Choose one when you are ready.`);
      }
    } catch (requestError) {
      if (requestError instanceof Error && requestError.name === 'AbortError') {
        setNotice('Request cancelled. Nothing was changed and your previous work is safe.');
      } else {
        setError(requestError instanceof Error ? requestError.message : 'Idea generation failed. Please try again.');
      }
    } finally {
      abortControllerRef.current = null;
      requestInFlight.current = false;
      setLoading(false);
    }
  }, [batches, connections, direction, era, focus, mix, modelId, persistWorkflow, providerId, region, webSearchEnabled, workflow]);

  /* eslint-disable react-hooks/set-state-in-effect -- the run=1 handoff intentionally starts one queued discovery run after mount */
  useEffect(() => {
    if (!hydrated || loading || autoRunHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('run') !== '1') return;
    autoRunHandled.current = true;
    params.delete('run');
    const cleanUrl = `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', cleanUrl);
    if (activeConnection && activeModel) void generateIdeas();
  }, [activeConnection, activeModel, generateIdeas, hydrated, loading]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function changeProvider(nextProviderId: ProviderId) {
    const connection = connections.find((item) => item.providerId === nextProviderId);
    const nextModel = connection?.models[0];
    setProviderId(nextProviderId);
    setModelId(nextModel?.id ?? '');
    if (nextModel) savePreference(nextProviderId, nextModel.id);
  }

  function toggleWebSearch() {
    if (!providerId || providerId === 'custom') return;
    const next = { ...searchPreferences, [providerId]: !webSearchEnabled };
    setSearchPreferences(next);
    try {
      window.localStorage.setItem(searchPreferenceKey, JSON.stringify(next));
      setNotice(`Live search ${next[providerId] ? 'enabled' : 'disabled'} for ${activeConnection?.providerName ?? providerId}.`);
      setError('');
    } catch {
      setError('This browser could not save the live-search preference.');
    }
  }

  function cancelGeneration() {
    abortControllerRef.current?.abort();
  }

  function selectIdea(idea: Idea, batch = activeBatch) {
    if (!batch) return;
    const selected = { ...idea, batchId: batch.id };
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
      selectedIdea: selected,
      stages: { ideas: ideaRecord },
      ideaBatches: batches.some((item) => item.id === batch.id) ? batches : [batch, ...batches],
      savedIdeas: workflow.savedIdeas ?? [],
    };
    if (persistWorkflow(next)) {
      setSelectedBatchId(batch.id);
      setError('');
      setNotice(`Selected “${idea.title}”. Later-stage work was cleared so this idea starts with clean context.`);
    }
  }

  function savedKey(idea: Idea) {
    return ideaFingerprint(idea);
  }

  function toggleSaved(idea: Idea, batchId = activeBatch?.id) {
    const key = savedKey(idea);
    const saved = workflow.savedIdeas ?? [];
    const exists = saved.some((item) => item.key === key);
    const nextSaved = exists
      ? saved.filter((item) => item.key !== key)
      : [{ key, idea: { ...idea, batchId }, savedAt: new Date().toISOString(), status: 'saved' as const }, ...saved];
    if (persistWorkflow({ ...workflow, ideaBatches: batches, savedIdeas: nextSaved })) {
      setNotice(exists ? 'Removed from saved ideas.' : 'Saved to your idea library.');
    }
  }

  function prepareMoreLike(idea: Idea) {
    setMoreLikeIdea(idea);
    setError('');
  }

  function generateMoreLike() {
    if (!moreLikeIdea) return;
    const instruction = `Explore the same underlying human territory as “${moreLikeIdea.title}”, but produce eight genuinely different video subjects. Change the historical question, people, system, place, period, or lived experience enough that none is a duplicate or near-duplicate of the seed or Idea Memory. Related angles are welcome; repetition is not.`;
    setMoreLikeIdea(null);
    void generateIdeas(instruction);
  }

  async function copyIdea(idea: Idea) {
    const key = savedKey(idea);
    const text = [
      idea.title,
      idea.premise,
      `Region: ${idea.region || 'Global'}`,
      `Period: ${idea.period || 'Any period'}`,
      `Video type: ${idea.everydayLens || 'Everyday life'}`,
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
      setCopiedIdeaKey(key);
      setError('');
      setNotice(`Copied “${idea.title}” to the clipboard.`);
      window.setTimeout(() => setCopiedIdeaKey((current) => current === key ? '' : current), 1800);
    } catch {
      setError('This browser blocked clipboard access. Please allow clipboard permission and try again.');
    }
  }

  function selectSavedIdea(saved: SavedIdea) {
    const sourceBatch = batches.find((batch) => batch.id === saved.idea.batchId);
    const now = new Date().toISOString();
    const portableBatch: IdeaBatch = sourceBatch ?? {
      id: `memory-${Date.now()}`,
      ideas: [{ ...saved.idea }],
      content: JSON.stringify({ ideas: [saved.idea] }),
      grounded: false,
      providerName: 'Idea Memory',
      modelName: 'Portable library',
      createdAt: now,
    };
    selectIdea(saved.idea, portableBatch);
  }

  function toggleSavedStatus(saved: SavedIdea) {
    const nextStatus: IdeaStatus = saved.status === 'used' ? 'saved' : 'used';
    const nextSaved = (workflow.savedIdeas ?? []).map((item) => item.key === saved.key ? { ...item, status: nextStatus } : item);
    if (persistWorkflow({ ...workflow, savedIdeas: nextSaved })) {
      setNotice(nextStatus === 'used' ? `Marked “${saved.idea.title}” as a completed video.` : `Moved “${saved.idea.title}” back to saved ideas.`);
    }
  }

  function removeSavedIdea() {
    if (!deleteSavedIdea) return;
    const nextSaved = (workflow.savedIdeas ?? []).filter((item) => item.key !== deleteSavedIdea.key);
    const title = deleteSavedIdea.idea.title;
    if (persistWorkflow({ ...workflow, savedIdeas: nextSaved })) {
      setNotice(`Removed “${title}” from Idea Memory. It may appear in future discovery again.`);
    }
    setDeleteSavedIdea(null);
  }

  function exportIdeaMemory() {
    const saved = workflow.savedIdeas ?? [];
    if (!saved.length) {
      setError('Save at least one idea before downloading Idea Memory.');
      return;
    }
    const portableIdeas = saved.map((item) => ({
      ...item,
      key: ideaFingerprint(item.idea),
      idea: { ...item.idea, batchId: undefined },
    }));
    const payload: IdeaLibraryFile = {
      schema: 'arclane-idea-memory',
      version: 1,
      exportedAt: new Date().toISOString(),
      channel: 'Global Everyday History',
      ideas: portableIdeas,
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
    setNotice(`Downloaded ${saved.length} remembered idea${saved.length === 1 ? '' : 's'}. The file contains no API keys.`);
  }

  async function importIdeaMemory(event: ChangeEvent<HTMLInputElement>) {
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
      const existing = workflow.savedIdeas ?? [];
      const merged = dedupeSavedIdeas([...existing, ...imported]);
      const added = merged.length - existing.length;
      if (persistWorkflow({ ...workflow, savedIdeas: merged })) {
        setError('');
        setNotice(added ? `Imported ${added} new idea${added === 1 ? '' : 's'}; duplicates were skipped.` : 'Import complete. Every idea was already in this library.');
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'The Idea Memory file could not be imported.');
    }
  }

  function requestClearAllIdeas() {
    setClearDialogOpen(true);
  }

  function clearAllIdeas() {
    const remainingStages = { ...workflow.stages };
    delete remainingStages.ideas;
    const next: WorkflowState = {
      ...workflow,
      selectedIdea: undefined,
      stages: remainingStages,
      ideaBatches: [],
      savedIdeas: workflow.savedIdeas ?? [],
    };
    if (persistWorkflow(next)) {
      setSelectedBatchId('');
      setRegion(regionOptions[0]);
      setEra(eraOptions[0]);
      setFocus(focusOptions[0]);
      setMix(mixOptions[0]);
      setDirection('');
      setCopiedIdeaKey('');
      setError('');
      setNotice('Generated batches and the current selection were cleared. Idea Memory remains protected.');
    }
    setClearDialogOpen(false);
  }

  function approveAndContinue() {
    if (!currentSelection) {
      setError('Select one idea from the batch currently on screen before continuing.');
      return;
    }
    studioNavigate('/studio/research');
  }

  const savedIdeas = workflow.savedIdeas ?? [];
  const normalizedLibraryQuery = libraryQuery.trim().toLocaleLowerCase();
  const visibleSavedIdeas = normalizedLibraryQuery
    ? savedIdeas.filter((item) => [item.idea.title, item.idea.premise, item.idea.region, item.idea.period, item.idea.everydayLens]
      .some((value) => value.toLocaleLowerCase().includes(normalizedLibraryQuery)))
    : savedIdeas;

  return (
    <main className="module-shell module-blue idea-pro-shell">
      <StudioSidebar activeStageId="ideas" />
      <section className="module-main">
        <header className="module-topbar">
          <div><span>Creator Studio</span><i>/</i><strong>Ideas</strong></div>
          <div className="module-profile"><span>Local workspace</span><i>YC</i></div>
        </header>

        <div className="module-content idea-pro-content">
          <header className="idea-pro-heading">
            <div><p>01 · Global story discovery</p><h1>Find the story<br />worth making.</h1><span>Unlimited worldwide discovery, carefully screened for one clear channel promise.</span></div>
            <div className="idea-pro-stats"><div><strong>{batches.length}</strong><span>Batches</span></div><div><strong>{savedIdeas.length}</strong><span>Saved</span></div><div><strong>{activeIdeas.length}</strong><span>On screen</span></div></div>
          </header>

          <nav className="idea-pro-tabs" aria-label="Ideas workspace"><a href="#idea-controls"><span>01</span>Discover Ideas</a><a href="#idea-library"><span>02</span>Idea Memory <b>{savedIdeas.length}</b></a></nav>

          <section className="idea-pro-scope">
            <div className="idea-pro-scope-mark">GEH</div>
            <div><p>Permanent channel intelligence</p><h2>Global Everyday History</h2><span>Any place. Any civilization. Any period. Any historical category—when ordinary human experience is the centre.</span></div>
            <div className="idea-pro-scope-tags"><span>Worldwide</span><span>English</span><span>10–14 min</span></div>
          </section>

          <section className="idea-pro-panel" id="idea-controls">
            <header><div><span>01</span><div><p>Discovery setup</p><h2>Direct the search—or leave everything open</h2></div></div><strong><i /> No default topic restriction</strong></header>

            {connections.length ? (
              <div className="idea-pro-models">
                <label><span>AI provider</span><div><b>{providerId ? providerMark(providerId) : '—'}</b><select value={providerId} onChange={(event) => changeProvider(event.target.value as ProviderId)}>{connections.map((connection) => <option value={connection.providerId} key={connection.providerId}>{connection.providerName}</option>)}</select></div></label>
                <label><span>Model</span><div><select value={modelId} onChange={(event) => { setModelId(event.target.value); if (providerId) savePreference(providerId, event.target.value); }}>{activeConnection?.models.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}</select></div></label>
                <div className={`idea-pro-search-control${webSearchCapable ? webSearchEnabled ? ' enabled' : ' disabled' : ' unavailable'}`}><div><i /><span><strong>{webSearchCapable ? webSearchEnabled ? 'Live search on' : 'Live search off' : 'Live search unavailable'}</strong><small>{providerId === 'gemini' ? 'Google Search grounding · provider limits may apply' : providerId === 'openai' ? 'OpenAI web search · provider charges may apply' : providerId === 'anthropic' ? 'Anthropic web search · provider charges may apply' : 'Custom API has no verified search adapter'}</small></span></div><button type="button" role="switch" aria-checked={webSearchEnabled} disabled={!webSearchCapable} onClick={toggleWebSearch} aria-label="Toggle live web search"><i /></button></div>
              </div>
            ) : (
              <div className="idea-pro-no-model"><span>◇</span><div><strong>No AI model connected</strong><small>Connect a provider and select a model before generating ideas.</small></div><a href="/studio/settings" onClick={(e) => studioNavigate('/studio/settings', e)}>Open Settings →</a></div>
            )}

            <details className="idea-pro-advanced" id="idea-advanced">
              <summary><div><span>Advanced direction</span><small>Optional — automatic worldwide defaults are active</small></div><strong>Worldwide · Any era · All topics · AI decides the mix</strong><i>＋</i></summary>
              <div className="idea-pro-advanced-body">
                <div className="idea-pro-filters">
                  <label><span>World coverage</span><select value={region} onChange={(event) => setRegion(event.target.value)}>{regionOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
                  <label><span>Historical range</span><select value={era} onChange={(event) => setEra(event.target.value)}>{eraOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
                  <label><span>Video type</span><select value={focus} onChange={(event) => setFocus(event.target.value)}>{focusOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
                  <label><span>Discovery mode</span><select value={mix} onChange={(event) => setMix(event.target.value)}>{mixOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
                </div>
                <label className="idea-pro-direction"><span>Optional creative direction</span><textarea value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="Leave blank for fully automatic discovery. Only write here when you deliberately want a special direction." /></label>
              </div>
            </details>

            {error ? <p className="idea-pro-message error" role="alert"><span>!</span>{error}</p> : null}
            {notice ? <p className="idea-pro-message success" role="status"><span>✓</span>{notice}</p> : null}

            <footer><div><strong>How quality is protected</strong><span>One job at a time · safe retry only for temporary 429/5xx · compact context · {webSearchEnabled ? 'live web screening' : 'knowledge-only'}</span></div><div className="idea-pro-footer-actions">{loading ? <button type="button" className="idea-pro-cancel" onClick={cancelGeneration}>Cancel · {elapsedSeconds}s</button> : null}<button type="button" disabled={!activeModel || loading} onClick={() => void generateIdeas()}>{loading ? <><i className="automation-spinner" /> Screening candidates… {elapsedSeconds}s</> : <>{activeIdeas.length ? 'Generate a new batch' : 'Generate eight ideas'} <b>→</b></>}</button></div></footer>
          </section>

          {activeIdeas.length ? (
            <section className="idea-pro-results">
              <header>
                <div><p>Curated output</p><h2>Eight ideas. One production choice.</h2><span>Research, hooks, titles and packaging begin only after you approve an idea.</span></div>
                <div className="idea-pro-results-actions"><label><span>Batch history</span><select value={activeBatch?.id ?? ''} onChange={(event) => setSelectedBatchId(event.target.value)}>{batches.map((batch, index) => <option value={batch.id} key={batch.id}>{index === 0 ? 'Latest' : `Previous ${index}`} · {new Date(batch.createdAt).toLocaleString()}</option>)}</select></label><button className="idea-pro-clear-button" type="button" onClick={requestClearAllIdeas}>Clear generated Ideas</button></div>
              </header>

              <div className="idea-pro-grid">
                {activeIdeas.map((idea, index) => {
                  const selected = currentSelection?.id === idea.id;
                  const ideaKey = savedKey(idea);
                  const saved = savedIdeas.some((item) => item.key === ideaKey);
                  const copied = copiedIdeaKey === ideaKey;
                  return (
                    <article className={`idea-pro-card${selected ? ' selected' : ''}`} key={`${activeBatch?.id}-${idea.id}`}>
                      <div className="idea-pro-card-top"><span>{String(index + 1).padStart(2, '0')}</span><div><button type="button" onClick={() => void copyIdea(idea)} aria-label={`Copy ${idea.title}`}>{copied ? '✓ Copied' : '⧉ Copy'}</button><button type="button" onClick={() => toggleSaved(idea, activeBatch?.id)} aria-label={saved ? 'Remove from saved ideas' : 'Save idea'}>{saved ? '★ In Memory' : '☆ Save'}</button>{selected ? <strong>✓ Production choice</strong> : null}</div></div>
                      <div className="idea-pro-card-tags"><span>{idea.region || 'Global'}</span><span>{idea.period || 'Any period'}</span></div>
                      <h3>{idea.title}</h3>
                      <p>{idea.premise}</p>
                      <div className="idea-pro-card-type"><span>Video type</span><strong>{idea.everydayLens}</strong></div>
                      <footer><button type="button" onClick={() => prepareMoreLike(idea)}>More like this</button><button className="select" type="button" onClick={() => selectIdea(idea)}>{selected ? 'Selected' : 'Select this idea'} <i>→</i></button></footer>
                    </article>
                  );
                })}
              </div>
              <footer className="idea-pro-batch-meta"><span>{activeBatch?.grounded ? '✓ Web-screened batch' : 'Knowledge-screened batch'}</span><span>{activeBatch?.providerName} · {activeBatch?.modelName}</span><span>{activeBatch ? new Date(activeBatch.createdAt).toLocaleString() : ''}</span></footer>
            </section>
          ) : (
            <section className="idea-pro-empty"><div>✦</div><p>READY FOR DISCOVERY</p><h2>The system will explore widely, filter privately, and show only eight clean ideas.</h2><span>No hook. No final title. No premature script—just subjects worth considering.</span></section>
          )}

          <section className="idea-pro-memory" id="idea-library">
            <header>
              <div><p>Portable duplicate memory</p><h2>Idea Memory</h2><span>Save the subject—not the whole script. Every remembered idea is withheld from exact future repetition and remains portable without a database.</span></div>
              <div className="idea-pro-memory-actions"><button type="button" onClick={() => importInputRef.current?.click()}>↑ Import memory</button><button type="button" disabled={!savedIdeas.length} onClick={exportIdeaMemory}>↓ Download JSON</button><input ref={importInputRef} type="file" accept=".json,application/json" onChange={(event) => void importIdeaMemory(event)} /></div>
            </header>
            <div className="idea-pro-memory-toolbar"><label><span>⌕</span><input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="Search title, place, period or everyday-life lens" /></label><strong>{savedIdeas.length} remembered · {savedIdeas.filter((item) => item.status === 'used').length} videos made</strong></div>
            {savedIdeas.length ? (
              visibleSavedIdeas.length ? <div className="idea-pro-memory-list">{visibleSavedIdeas.map((saved) => <article key={saved.key}>
                <div className="idea-pro-memory-status"><span className={saved.status === 'used' ? 'used' : ''}>{saved.status === 'used' ? '✓ Video made' : 'Saved idea'}</span><small>{new Date(saved.savedAt).toLocaleDateString()}</small></div>
                <div className="idea-pro-memory-copy"><div><span>{saved.idea.region || 'Global'} · {saved.idea.period || 'Any period'}</span><h3>{saved.idea.title}</h3><p>{saved.idea.premise}</p><small>{saved.idea.everydayLens}</small></div></div>
                <footer><button type="button" onClick={() => toggleSavedStatus(saved)}>{saved.status === 'used' ? 'Move to saved' : 'Mark video made'}</button><button type="button" onClick={() => void copyIdea(saved.idea)}>Copy</button><button className="primary" type="button" onClick={() => selectSavedIdea(saved)}>Use this idea</button><button className="remove" type="button" onClick={() => setDeleteSavedIdea(saved)}>Delete</button></footer>
              </article>)}</div> : <div className="idea-pro-memory-empty"><strong>No matching ideas</strong><span>Try a different search phrase.</span></div>
            ) : <div className="idea-pro-memory-empty"><strong>Your long-term duplicate memory starts here.</strong><span>Use Save on any generated idea. Download the library whenever you want a portable backup.</span></div>}
          </section>

          <footer className="idea-pro-next">
            <div><span>Current production idea</span><strong>{currentSelection?.title ?? 'Nothing selected from this batch'}</strong>{(batches.length || savedIdeas.length || workflow.selectedIdea) ? <button type="button" onClick={requestClearAllIdeas}>Clear generated Ideas</button> : null}</div>
            <button type="button" disabled={!currentSelection || loading} onClick={approveAndContinue}><span>Review selected idea</span><strong>Research <i>→</i></strong></button>
          </footer>

          {clearDialogOpen ? (
            <div className="idea-pro-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setClearDialogOpen(false); }}>
              <article className="idea-pro-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-ideas-title">
                <div className="idea-pro-dialog-mark">!</div>
                <p>Ideas workspace</p>
                <h2 id="clear-ideas-title">Clear generated Ideas and start fresh?</h2>
                <span>This removes generated batches and the current Idea selection. Your portable Idea Memory, connected AI models and other Studio sections remain untouched.</span>
                <div><button type="button" autoFocus onClick={() => setClearDialogOpen(false)}>Keep current batch</button><button className="danger" type="button" onClick={clearAllIdeas}>Yes, clear generated Ideas</button></div>
              </article>
            </div>
          ) : null}
          {moreLikeIdea ? (
            <div className="idea-pro-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) setMoreLikeIdea(null); }}>
              <article className="idea-pro-dialog idea-pro-related-dialog" role="dialog" aria-modal="true" aria-labelledby="more-like-title">
                <div className="idea-pro-dialog-mark related">↗</div><p>Related discovery</p><h2 id="more-like-title">Explore the territory—not the same video.</h2>
                <div className="idea-pro-related-seed"><span>Starting from</span><strong>{moreLikeIdea.title}</strong><small>{moreLikeIdea.region} · {moreLikeIdea.period}</small></div>
                <span>The system will search for eight materially different questions, places, periods or lived experiences. The seed and everything in Idea Memory remain excluded from duplication.</span>
                <div><button type="button" disabled={loading} onClick={() => setMoreLikeIdea(null)}>Cancel</button><button className="primary" type="button" disabled={loading || !activeModel} onClick={generateMoreLike}>{loading ? 'Generating…' : 'Generate related batch'}</button></div>
              </article>
            </div>
          ) : null}

          {deleteSavedIdea ? (
            <div className="idea-pro-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteSavedIdea(null); }}>
              <article className="idea-pro-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-memory-title">
                <div className="idea-pro-dialog-mark">!</div><p>Idea Memory</p><h2 id="delete-memory-title">Remove this remembered idea?</h2>
                <div className="idea-pro-related-seed"><strong>{deleteSavedIdea.idea.title}</strong></div>
                <span>After removal, this subject will no longer be protected by Idea Memory and may appear in a future discovery batch.</span>
                <div><button type="button" autoFocus onClick={() => setDeleteSavedIdea(null)}>Keep in memory</button><button className="danger" type="button" onClick={removeSavedIdea}>Yes, remove idea</button></div>
              </article>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}






