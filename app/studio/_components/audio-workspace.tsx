'use client';

import { jsonrepair } from 'jsonrepair';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StudioStageId } from '../_lib/stages';
import ScriptDocumentView, { getSpokenScriptText } from './script-document-view';
import StudioSidebar from './studio-sidebar';

type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'custom';
type AuthMethod = 'bearer' | 'api-key';
type AudioMode = 'normal' | 'faith_safe';
type BedType = 'music' | 'ambience' | 'silence';
type AccentType = 'ambience' | 'foley' | 'sound_effect';
type AudioSource = 'youtube_audio_library' | 'pixabay';

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
type ScriptReview = { originalContent: string; status: 'pending' | 'approved'; reviewedAt?: string };
type StageRecord = {
  content: string;
  providerName: string;
  modelName: string;
  updatedAt: string;
  scriptReview?: ScriptReview;
  sourceScriptUpdatedAt?: string;
  sourceVoiceoverUpdatedAt?: string;
  sourceVisualsUpdatedAt?: string;
  audioMode?: AudioMode;
};
type WorkflowState = { selectedIdea?: Idea; stages: Partial<Record<StudioStageId, StageRecord>> };
type ModelPreference = { providerId: ProviderId; modelId: string };

type VisualScene = { sceneId: string; asset: string; shot: string };
type VisualTimelineEntry = {
  clipId: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  narration: string;
  sceneId: string;
  direction: string;
};
type VisualPlan = { version: string; scenes: VisualScene[]; timeline: VisualTimelineEntry[] };
type AudioAccent = {
  atSeconds: number;
  type: AccentType;
  sound: string;
  purpose: string;
  searchQuery: string;
  source: AudioSource;
};
type AudioZone = {
  zoneId: string;
  startSeconds: number;
  endSeconds: number;
  purpose: string;
  bedType: BedType;
  bedDescription: string;
  mood: string;
  energy: string;
  searchQueries: string[];
  sources: AudioSource[];
  entry: string;
  exit: string;
  voiceMix: string;
  accents: AudioAccent[];
};
type AudioStrategy = {
  sonicIdentity: string;
  storyArc: string;
  voicePriority: string;
  silenceRule: string;
  copyrightRule: string;
  mixRules: string[];
};
type AudioPlan = {
  version: 'ARCLANE_AUDIO_PLAN_2026_08_V1';
  mode: AudioMode;
  strategy: AudioStrategy;
  zones: AudioZone[];
  finalChecks: string[];
};

const connectionStorageKey = 'arclane.model-connections.v1';
const workflowStorageKey = 'arclane.creator-workflow.v1';
const modelPreferenceKey = 'arclane.workflow-models.v1';
const audioModePreferenceKey = 'arclane.audio-mode.v1';
const connectionChangeEvent = 'arclane:model-connections-changed';
const initialWorkflow: WorkflowState = { stages: {} };
const audioPlanVersion = 'ARCLANE_AUDIO_PLAN_2026_08_V1' as const;
const allowedSources = new Set<AudioSource>(['youtube_audio_library', 'pixabay']);
const allowedBedTypes = new Set<BedType>(['music', 'ambience', 'silence']);
const allowedAccentTypes = new Set<AccentType>(['ambience', 'foley', 'sound_effect']);
const faithForbidden = /\b(music|musical|melody|melodic|instrument|instrumental|orchestra|orchestral|piano|violin|guitar|drum|percussion|beat|song|singing|vocal|vocals|chant|chanting|humming|choir|nasheed|synth|synthesizer|pad)\b/i;

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
function stringList(value: unknown, limit: number) {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean).slice(0, limit) : [];
}
function numberValue(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function parseJsonObject(content: string, label: string) {
  const unfenced = content.replace(/^\s*\x60{3}(?:json)?\s*/i, '').replace(/\x60{3}\s*$/i, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The AI did not return a usable ' + label + '. Your saved work is unchanged; try again or choose another model.');
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

function readVisualPlan(content: string): VisualPlan | null {
  try {
    const root = parseJsonObject(content, 'Visual Plan');
    if (!Array.isArray(root.scenes) || !Array.isArray(root.timeline)) return null;
    const scenes = root.scenes.map((value) => {
      const item = asRecord(value);
      return { sceneId: stringValue(item.sceneId), asset: stringValue(item.asset), shot: stringValue(item.shot) };
    }).filter((item) => item.sceneId);
    const sceneIds = new Set(scenes.map((scene) => scene.sceneId));
    const timeline = root.timeline.map((value) => {
      const item = asRecord(value);
      return {
        clipId: stringValue(item.clipId),
        startSeconds: numberValue(item.startSeconds),
        endSeconds: numberValue(item.endSeconds),
        durationSeconds: numberValue(item.durationSeconds),
        narration: stringValue(item.narration),
        sceneId: stringValue(item.sceneId),
        direction: stringValue(item.direction),
      };
    }).filter((item) => item.clipId && item.narration && Number.isFinite(item.startSeconds) && Number.isFinite(item.endSeconds) && sceneIds.has(item.sceneId));
    if (!scenes.length || !timeline.length) return null;
    return { version: stringValue(root.version), scenes, timeline };
  } catch {
    return null;
  }
}

function sourceLabel(source: AudioSource) {
  return source === 'youtube_audio_library' ? 'YouTube Audio Library' : 'Pixabay';
}
function sourceUrl(source: AudioSource) {
  return source === 'youtube_audio_library' ? 'https://www.youtube.com/audiolibrary' : 'https://pixabay.com/sound-effects/';
}
function bedLabel(type: BedType) {
  if (type === 'music') return 'Music bed';
  if (type === 'ambience') return 'Ambience bed';
  return 'Protected silence';
}
function accentLabel(type: AccentType) {
  if (type === 'sound_effect') return 'Sound effect';
  if (type === 'foley') return 'Foley';
  return 'Ambience';
}
function formatTime(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return Math.floor(safe / 60) + ':' + String(safe % 60).padStart(2, '0');
}

function normalizeStrategy(value: unknown): AudioStrategy {
  const strategy = asRecord(value);
  const mixRules = stringList(strategy.mixRules, 6);
  return {
    sonicIdentity: stringValue(strategy.sonicIdentity) || 'Narration-first documentary sound with restrained, story-specific texture.',
    storyArc: stringValue(strategy.storyArc) || 'Sound follows the story movements and withdraws when silence communicates more.',
    voicePriority: stringValue(strategy.voicePriority) || 'Keep the narration clearly dominant and duck every continuous bed beneath speech.',
    silenceRule: stringValue(strategy.silenceRule) || 'Protect silence around sensitive facts, turning points and the final payoff.',
    copyrightRule: stringValue(strategy.copyrightRule) || 'Download from the named official source and preserve the exact asset, source, date, licence and attribution record.',
    mixRules: mixRules.length ? mixRules : ['Keep narration dominant.', 'Use natural fades at boundaries.', 'Review the finished mix on headphones and ordinary speakers.'],
  };
}

function normalizeQueries(raw: unknown, zone: Pick<AudioZone, 'bedDescription' | 'mood' | 'bedType'>) {
  if (zone.bedType === 'silence') return [];
  const queries = stringList(raw, 2);
  const base = [zone.bedDescription, zone.mood].filter(Boolean).join(' ');
  if (!queries.length) queries.push(base || (zone.bedType === 'music' ? 'restrained documentary background' : 'natural historical environment ambience'));
  if (queries.length < 2) queries.push((base || queries[0]) + (zone.bedType === 'music' ? ' subtle narration bed' : ' clean room tone sound effect'));
  return queries.slice(0, 2);
}

function parseAudioPlan(content: string, mode: AudioMode, totalDuration: number): AudioPlan {
  const root = parseJsonObject(content, 'Audio Plan');
  const rawZones = Array.isArray(root.zones) ? root.zones : [];
  if (!rawZones.length) throw new Error('The model returned no usable Audio timeline. Your saved work is unchanged; try again or choose another model.');
  if (rawZones.length > 10) throw new Error('The model returned more than ten Audio zones. Nothing was replaced; click Build Audio Plan once more.');

  let previousEnd = -0.001;
  const zones = rawZones.map((value, index) => {
    const raw = asRecord(value);
    const startSeconds = Math.round(numberValue(raw.startSeconds) * 10) / 10;
    const endSeconds = Math.round(numberValue(raw.endSeconds) * 10) / 10;
    const requestedBed = stringValue(raw.bedType) as BedType;
    const bedType = allowedBedTypes.has(requestedBed) ? requestedBed : 'ambience';
    const sources = stringList(raw.sources, 2).filter((source): source is AudioSource => allowedSources.has(source as AudioSource));
    const zone: AudioZone = {
      zoneId: stringValue(raw.zoneId) || 'AUDIO-' + String(index + 1).padStart(2, '0'),
      startSeconds,
      endSeconds,
      purpose: stringValue(raw.purpose),
      bedType,
      bedDescription: stringValue(raw.bedDescription),
      mood: stringValue(raw.mood),
      energy: stringValue(raw.energy) || 'low',
      searchQueries: [],
      sources: bedType === 'silence'
        ? []
        : sources.length
          ? (bedType === 'music' ? sources.filter((source) => source === 'youtube_audio_library') : sources)
          : (bedType === 'music' ? ['youtube_audio_library'] : ['youtube_audio_library', 'pixabay']),
      entry: stringValue(raw.entry),
      exit: stringValue(raw.exit),
      voiceMix: stringValue(raw.voiceMix),
      accents: [],
    };
    zone.searchQueries = normalizeQueries(raw.searchQueries, zone);

    const rawAccents = Array.isArray(raw.accents) ? raw.accents.slice(0, 3) : [];
    zone.accents = rawAccents.map((accentValue) => {
      const accent = asRecord(accentValue);
      const requestedType = stringValue(accent.type) as AccentType;
      const requestedSource = stringValue(accent.source) as AudioSource;
      return {
        atSeconds: Math.round(numberValue(accent.atSeconds) * 10) / 10,
        type: allowedAccentTypes.has(requestedType) ? requestedType : 'sound_effect',
        sound: stringValue(accent.sound),
        purpose: stringValue(accent.purpose),
        searchQuery: stringValue(accent.searchQuery),
        source: allowedSources.has(requestedSource) ? requestedSource : 'youtube_audio_library',
      };
    }).filter((accent) => Number.isFinite(accent.atSeconds) && accent.sound && accent.searchQuery);

    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0 || endSeconds <= startSeconds || endSeconds > totalDuration + 1) {
      throw new Error(zone.zoneId + ' has an invalid time range. Nothing was replaced; click Build Audio Plan once more.');
    }
    if (startSeconds < previousEnd - 0.1) throw new Error('The Audio zones overlap or are out of order. Nothing was replaced; click Build Audio Plan once more.');
    if (!zone.purpose || !zone.bedDescription || !zone.entry || !zone.exit || !zone.voiceMix) {
      throw new Error(zone.zoneId + ' is incomplete. Nothing was replaced; click Build Audio Plan once more.');
    }
    if (bedType !== 'silence' && (zone.searchQueries.length !== 2 || !zone.sources.length)) {
      throw new Error(zone.zoneId + ' has no usable source search. Nothing was replaced; click Build Audio Plan once more.');
    }
    if (bedType === 'music' && zone.sources.some((source) => source !== 'youtube_audio_library')) zone.sources = ['youtube_audio_library'];
    if (zone.accents.some((accent) => accent.atSeconds < startSeconds || accent.atSeconds > endSeconds)) {
      throw new Error(zone.zoneId + ' contains a sound accent outside its own time range. Nothing was replaced.');
    }
    previousEnd = endSeconds;
    return zone;
  });

  if (mode === 'faith_safe') {
    const unsafeZone = zones.find((zone) => zone.bedType === 'music' || faithForbidden.test(JSON.stringify({
      bedDescription: zone.bedDescription,
      mood: zone.mood,
      energy: zone.energy,
      searchQueries: zone.searchQueries,
      accents: zone.accents,
    })));
    if (unsafeZone) throw new Error('The model included a musical element while Faith-safe audio was on. Nothing was replaced; try again or choose another model.');
  }

  const finalChecks = stringList(root.finalChecks, 8);
  return {
    version: audioPlanVersion,
    mode,
    strategy: normalizeStrategy(root.strategy),
    zones,
    finalChecks: finalChecks.length ? finalChecks : [
      'Verify every exact asset before editing.',
      'Preserve the source and licence record.',
      'Keep narration dominant.',
      'Review on headphones and ordinary speakers.',
      'Run YouTube checks before publishing.',
    ],
  };
}

function readSavedPlan(content: string): AudioPlan | null {
  try {
    const root = parseJsonObject(content, 'Audio Plan');
    if (root.version !== audioPlanVersion || !Array.isArray(root.zones)) return null;
    const mode: AudioMode = root.mode === 'faith_safe' ? 'faith_safe' : 'normal';
    const maxEnd = root.zones.reduce((maximum, value) => Math.max(maximum, numberValue(asRecord(value).endSeconds) || 0), 0);
    return parseAudioPlan(content, mode, Math.max(maxEnd, 1));
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

export default function AudioWorkspace() {
  const [hydrated, setHydrated] = useState(false);
  const [connections, setConnections] = useState<Selection[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowState>(initialWorkflow);
  const [providerId, setProviderId] = useState<ProviderId | ''>('');
  const [modelId, setModelId] = useState('');
  const [audioMode, setAudioMode] = useState<AudioMode>('normal');
  const [direction, setDirection] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [visibleZones, setVisibleZones] = useState(5);
  const [modal, setModal] = useState<'script' | 'timeline' | null>(null);

  const scriptRecord = workflow.stages.scripts;
  const voiceRecord = workflow.stages.voiceover;
  const visualsRecord = workflow.stages.visuals;
  const audioRecord = workflow.stages.audio;
  const selectedIdea = workflow.selectedIdea;
  const visualPlan = useMemo(() => readVisualPlan(visualsRecord?.content ?? ''), [visualsRecord?.content]);
  const audioPlan = useMemo(() => readSavedPlan(audioRecord?.content ?? ''), [audioRecord?.content]);
  const totalDuration = visualPlan?.timeline.at(-1)?.endSeconds ?? 0;
  const scriptFinal = Boolean(scriptRecord?.content.trim() && scriptRecord.scriptReview?.status === 'approved');
  const voiceCurrent = Boolean(voiceRecord?.content.trim() && voiceRecord.sourceScriptUpdatedAt === scriptRecord?.updatedAt);
  const visualsCurrent = Boolean(
    visualPlan
    && visualsRecord?.sourceScriptUpdatedAt === scriptRecord?.updatedAt
    && visualsRecord?.sourceVoiceoverUpdatedAt === voiceRecord?.updatedAt,
  );
  const handoffReady = scriptFinal && voiceCurrent && visualsCurrent;
  const planCurrent = Boolean(
    audioPlan
    && audioRecord?.sourceScriptUpdatedAt === scriptRecord?.updatedAt
    && audioRecord?.sourceVoiceoverUpdatedAt === voiceRecord?.updatedAt
    && audioRecord?.sourceVisualsUpdatedAt === visualsRecord?.updatedAt
    && audioRecord?.audioMode === audioMode
    && audioPlan.mode === audioMode,
  );
  const activeConnection = connections.find((item) => item.providerId === providerId);
  const activeModel = activeConnection?.models.find((model) => model.id === modelId);
  const scriptPreview = useMemo(() => {
    const text = getSpokenScriptText(scriptRecord?.content ?? '');
    return text.length > 330 ? text.slice(0, 330).trim() + '…' : text;
  }, [scriptRecord?.content]);

  const compactTimeline = useMemo(() => {
    if (!visualPlan) return [];
    const scenes = new Map(visualPlan.scenes.map((scene) => [scene.sceneId, scene]));
    return visualPlan.timeline.map((clip) => {
      const scene = scenes.get(clip.sceneId);
      return {
        clipId: clip.clipId,
        startSeconds: clip.startSeconds,
        endSeconds: clip.endSeconds,
        narration: clip.narration,
        visualAsset: scene?.asset ?? '',
        visualBeat: scene?.shot ?? '',
        editDirection: clip.direction,
      };
    });
  }, [visualPlan]);

  const persistWorkflow = useCallback((next: WorkflowState) => {
    try {
      window.localStorage.setItem(workflowStorageKey, JSON.stringify(next));
      setWorkflow(next);
      return true;
    } catch {
      setError('This browser could not save the Audio Plan locally. Free some browser storage and try again.');
      return false;
    }
  }, []);

  const savePreference = useCallback((nextProviderId: ProviderId, nextModelId: string) => {
    const preferences = readJson<Partial<Record<StudioStageId, ModelPreference>>>(modelPreferenceKey, {});
    preferences.audio = { providerId: nextProviderId, modelId: nextModelId };
    window.localStorage.setItem(modelPreferenceKey, JSON.stringify(preferences));
  }, []);

  useEffect(() => {
    const refreshConnections = () => setConnections(readConnections());
    const available = readConnections();
    const savedWorkflow = readJson<WorkflowState>(workflowStorageKey, initialWorkflow);
    const preference = readJson<Partial<Record<StudioStageId, ModelPreference>>>(modelPreferenceKey, {}).audio;
    const savedMode = readJson<{ mode?: AudioMode }>(audioModePreferenceKey, {}).mode === 'faith_safe' ? 'faith_safe' : 'normal';
    const preferredConnection = available.find((item) => item.providerId === preference?.providerId);
    const firstConnection = preferredConnection ?? available[0];
    const preferredModel = firstConnection?.models.find((model) => model.id === preference?.modelId);
    const firstModel = preferredModel ?? firstConnection?.models[0];

    // Local browser storage is the external source for this client-only workspace.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnections(available);
    setWorkflow(savedWorkflow);
    setAudioMode(savedMode);
    setProviderId(firstConnection?.providerId ?? '');
    setModelId(firstModel?.id ?? '');
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
  function changeAudioMode(nextMode: AudioMode) {
    setAudioMode(nextMode);
    window.localStorage.setItem(audioModePreferenceKey, JSON.stringify({ mode: nextMode }));
    setError('');
    setNotice(nextMode === 'faith_safe'
      ? 'Faith-safe audio is on. Build a new plan to use only silence, ambience, foley and necessary sound effects.'
      : 'Normal audio is on. Music remains optional, restrained and sourced through YouTube Audio Library.');
  }

  async function buildAudioPlan() {
    if (loading) return;
    if (!handoffReady || !scriptRecord || !voiceRecord || !visualsRecord || !visualPlan || !compactTimeline.length) {
      setError('Finish the current Final Script, Voiceover and complete Visual Plan before building Audio.');
      return;
    }
    const connection = connections.find((item) => item.providerId === providerId);
    const model = connection?.models.find((item) => item.id === modelId);
    if (!connection || !model) {
      setError('Connect an AI provider and choose a model before building the Audio Plan.');
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
          stage: 'audio',
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
            selectedIdea: selectedIdea ? {
              title: selectedIdea.title,
              premise: selectedIdea.premise,
              region: selectedIdea.region,
              period: selectedIdea.period,
              everydayLens: selectedIdea.everydayLens,
            } : null,
            audioTimeline: compactTimeline,
            audioDurationSeconds: totalDuration,
            audioMode: { mode: audioMode },
          },
        }),
      });
      const result = await response.json() as { output?: string; error?: string };
      if (!response.ok || !result.output) throw new Error(result.error || 'The model did not return a usable Audio Plan.');

      const plan = parseAudioPlan(result.output, audioMode, totalDuration);
      const record: StageRecord = {
        content: JSON.stringify(plan, null, 2),
        providerName: connection.providerName,
        modelName: model.name,
        updatedAt: new Date().toISOString(),
        sourceScriptUpdatedAt: scriptRecord.updatedAt,
        sourceVoiceoverUpdatedAt: voiceRecord.updatedAt,
        sourceVisualsUpdatedAt: visualsRecord.updatedAt,
        audioMode,
      };
      const next: WorkflowState = {
        ...workflow,
        stages: { ...workflow.stages, audio: record, thumbnails: undefined, description: undefined, shorts: undefined },
      };
      if (persistWorkflow(next)) {
        setVisibleZones(5);
        setNotice('Complete Audio Plan saved on this device. ' + plan.zones.length + ' precise zones are ready.');
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Audio planning failed. Your saved work is unchanged.');
    } finally {
      setLoading(false);
    }
  }

  async function copyText(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(message);
    } catch {
      setError('Copy was blocked by this browser. Select the text manually instead.');
    }
  }
  function downloadPlan() {
    if (!audioPlan || !planCurrent) return;
    const blob = new Blob([JSON.stringify(audioPlan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'arclane-audio-plan-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice('Complete Audio Plan downloaded as JSON.');
  }
  function continueToThumbnails() {
    if (!planCurrent) {
      setError('Build one current Audio Plan before continuing to Thumbnails.');
      return;
    }
    window.location.assign('/studio/thumbnails');
  }

  if (!hydrated) {
    return <main className="module-shell module-amber audio-shell"><StudioSidebar activeStageId="audio" /><section className="module-main"><div className="audio-loading">Loading the production handoff…</div></section></main>;
  }

  return (
    <main className="module-shell module-amber audio-shell">
      <StudioSidebar activeStageId="audio" />
      <section className="module-main">
        <header className="module-topbar">
          <div><span>Creator Studio</span><i>/</i><strong>Audio</strong></div>
          <div className="module-profile"><span>Local workspace</span><i>YC</i></div>
        </header>

        <div className="module-content audio-content">
          <div className="module-heading audio-heading">
            <div><p>BACKGROUND SOUND TIMELINE</p><h1>Audio</h1><span>Plan music, ambience, foley, sound effects and purposeful silence around the approved narration.</span></div>
            <div className="module-number">06<small>/ 09</small></div>
          </div>

          <section className="automation-niche" aria-label="Channel system prompt">
            <div className="automation-niche-mark">GEH</div>
            <div><p>Channel system · locked for every request</p><h2>Global Everyday History</h2><span>Narration remains the hero. Background sound supports place, clarity and feeling without turning history into a generic trailer.</span></div>
            <strong><i /> Active</strong>
          </section>

          <section className="audio-handoff">
            <div className="audio-handoff-icon">VI</div>
            <div className="audio-handoff-copy">
              <p>RECEIVED FROM VISUALS</p>
              <h2>{selectedIdea?.title ?? 'No production idea is selected'}</h2>
              <span>{scriptPreview || 'The approved Final Script preview will appear here.'}</span>
              <div className="audio-handoff-badges">
                <b className={scriptFinal ? 'ready' : ''}>{scriptFinal ? '✓ Final Script' : 'Final Script missing'}</b>
                <b className={visualsCurrent ? 'ready' : ''}>{visualsCurrent ? '✓ Complete Visual Plan' : 'Visual Plan missing'}</b>
                <b className={visualsCurrent ? 'ready' : ''}>{visualPlan?.timeline.length ?? 0} timed clips</b>
                <b className={visualsCurrent ? 'ready' : ''}>{formatTime(totalDuration)} episode</b>
              </div>
            </div>
            <div className="audio-handoff-actions">
              <button type="button" disabled={!scriptRecord?.content} onClick={() => setModal('script')}>View Final Script</button>
              <button type="button" disabled={!visualPlan} onClick={() => setModal('timeline')}>View Visual Timeline</button>
            </div>
          </section>

          <section className="audio-builder">
            <header>
              <div><span>AU</span><strong>Audio Plan workspace</strong></div>
              <div><span>Audio zones</span><strong>{planCurrent ? audioPlan?.zones.length ?? 0 : 0}</strong></div>
            </header>

            <div className="audio-model-bar">
              {connections.length ? (
                <>
                  <label><span>AI provider</span><div><b>{providerId ? providerMark(providerId) : '—'}</b><select value={providerId} onChange={(event) => changeProvider(event.target.value as ProviderId)}>{connections.map((connection) => <option value={connection.providerId} key={connection.providerId}>{connection.providerName}</option>)}</select></div></label>
                  <label><span>Model for Audio</span><div><select value={modelId} onChange={(event) => changeModel(event.target.value)}>{activeConnection?.models.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}</select></div></label>
                  <div className="audio-request-note"><i />One focused request</div>
                </>
              ) : (
                <div className="automation-no-model"><span>◇</span><div><strong>No AI model connected</strong><small>Add one provider and choose a capable model. Your key stays in this browser.</small></div><Link href="/studio/settings">Open Settings →</Link></div>
              )}
            </div>

            <div className="audio-mode-panel">
              <div><p>SOUND POLICY FOR THIS PLAN</p><h3>{audioMode === 'faith_safe' ? 'Faith-safe audio is on' : 'Normal audio is on'}</h3><span>{audioMode === 'faith_safe'
                ? 'Only silence, natural ambience, room tone, weather, foley and necessary non-musical sound effects are allowed.'
                : 'Restrained music may be used only when useful, together with ambience, foley, sound effects and silence.'}</span></div>
              <button type="button" role="switch" aria-checked={audioMode === 'faith_safe'} className={audioMode === 'faith_safe' ? 'on' : ''} onClick={() => changeAudioMode(audioMode === 'faith_safe' ? 'normal' : 'faith_safe')}>
                <i><span /></i><b>{audioMode === 'faith_safe' ? 'ON' : 'OFF'}</b><small>Faith-safe</small>
              </button>
            </div>

            <details className="audio-direction">
              <summary>Optional direction for this Audio Plan <span>＋</span></summary>
              <label><span>Use this only for a special creative need. The source, timing, rights and selected-mode rules cannot be overridden.</span><textarea value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="Example: Protect a longer silence before the final reveal." /></label>
            </details>

            {!handoffReady ? <div className="audio-prerequisite"><span>←</span><div><strong>The current Visual handoff is not ready</strong><p>Finish the current Final Script, Voiceover and complete Visual Plan first. No Audio request will be sent yet.</p></div><Link href="/studio/visuals">Open Visuals</Link></div> : null}
            {error ? <p className="audio-message error" role="alert"><span>!</span>{error}</p> : null}
            {notice ? <p className="audio-message success" role="status"><span>✓</span>{notice}</p> : null}

            <div className="audio-build-row">
              <div><strong>Two-step handoff</strong><span>Visuals only delivered the approved source. Nothing runs until you click this button.</span></div>
              <button type="button" disabled={!handoffReady || !activeModel || loading} onClick={() => void buildAudioPlan()}>{loading ? <><i className="automation-spinner" /> Building Audio Plan…</> : <>{planCurrent ? 'Build again safely' : 'Build Audio Plan'} <b>→</b></>}</button>
            </div>
          </section>

          <section className="audio-rights">
            <div><span>✓</span><div><p>PRIMARY SOURCE</p><h3>YouTube Audio Library</h3><small>YouTube identifies its own Audio Library music and sound effects as copyright-safe. Use its attribution filter and keep the exact record.</small></div><a href="https://www.youtube.com/audiolibrary" target="_blank" rel="noreferrer">Open Library ↗</a></div>
            <div><span>!</span><div><p>SECONDARY FOR AMBIENCE + SFX</p><h3>Pixabay</h3><small>Useful for sound effects, but a licence does not guarantee zero Content ID claims. Download only from the official page and preserve proof.</small></div><a href="https://pixabay.com/sound-effects/" target="_blank" rel="noreferrer">Open Sounds ↗</a></div>
          </section>

          {audioPlan && planCurrent ? (
            <>
              <section className="audio-strategy">
                <header><div><p>SONIC BLUEPRINT</p><h2>One clear sound language</h2></div><span>{audioPlan.mode === 'faith_safe' ? 'Faith-safe · non-musical' : 'Normal · music optional'}</span></header>
                <div className="audio-strategy-grid">
                  <article><span>01</span><p>Sonic identity</p><strong>{audioPlan.strategy.sonicIdentity}</strong></article>
                  <article><span>02</span><p>Story arc</p><strong>{audioPlan.strategy.storyArc}</strong></article>
                  <article><span>03</span><p>Voice priority</p><strong>{audioPlan.strategy.voicePriority}</strong></article>
                  <article><span>04</span><p>Silence rule</p><strong>{audioPlan.strategy.silenceRule}</strong></article>
                </div>
                <div className="audio-mix-rules"><p>MIXING RULES</p>{audioPlan.strategy.mixRules.map((rule, index) => <span key={index}><i>✓</i>{rule}</span>)}</div>
              </section>

              <section className="audio-timeline">
                <header><div><p>COMPLETE PRODUCTION TIMELINE</p><h2>What to use, and exactly when</h2><span>{audioPlan.zones.length} zones · {formatTime(totalDuration)} · narration-first</span></div><div><button type="button" onClick={() => void copyText(JSON.stringify(audioPlan, null, 2), 'Complete Audio Plan copied.')}>Copy all</button><button type="button" onClick={downloadPlan}>Download plan</button></div></header>
                <div className="audio-zone-list">
                  {audioPlan.zones.slice(0, visibleZones).map((zone, index) => (
                    <article className={'audio-zone ' + zone.bedType} key={zone.zoneId}>
                      <div className="audio-zone-time"><span>{String(index + 1).padStart(2, '0')}</span><strong>{formatTime(zone.startSeconds)}</strong><i>→</i><strong>{formatTime(zone.endSeconds)}</strong><small>{Math.round(zone.endSeconds - zone.startSeconds)} sec</small></div>
                      <div className="audio-zone-body">
                        <header><div><p>{zone.zoneId} · {bedLabel(zone.bedType)}</p><h3>{zone.bedDescription}</h3></div><span>{zone.energy}</span></header>
                        <div className="audio-zone-purpose"><p>Why here</p><strong>{zone.purpose}</strong><small>{zone.mood}</small></div>
                        {zone.bedType !== 'silence' ? <div className="audio-searches"><p>SEARCH THE OFFICIAL LIBRARY</p>{zone.searchQueries.map((query, queryIndex) => <button type="button" key={queryIndex} onClick={() => void copyText(query, 'Search phrase copied.')}>{query}<span>Copy</span></button>)}<div>{zone.sources.map((source) => <a href={sourceUrl(source)} target="_blank" rel="noreferrer" key={source}>{sourceLabel(source)} ↗</a>)}</div></div> : <div className="audio-silence-note">Do not add a replacement asset here. Preserve the planned silence.</div>}
                        <div className="audio-edit-grid"><div><p>Entry</p><span>{zone.entry}</span></div><div><p>Under narration</p><span>{zone.voiceMix}</span></div><div><p>Exit</p><span>{zone.exit}</span></div></div>
                        {zone.accents.length ? <div className="audio-accents"><p>SELECTIVE SOUND ACCENTS</p>{zone.accents.map((accent, accentIndex) => <div key={accentIndex}><b>{formatTime(accent.atSeconds)}</b><span><i>{accentLabel(accent.type)}</i><strong>{accent.sound}</strong><small>{accent.purpose}</small></span><button type="button" onClick={() => void copyText(accent.searchQuery, 'Sound-effect search copied.')}>Copy search</button></div>)}</div> : null}
                      </div>
                    </article>
                  ))}
                </div>
                {visibleZones < audioPlan.zones.length ? <button className="audio-show-more" type="button" onClick={() => setVisibleZones(audioPlan.zones.length)}>Show remaining Audio zones <span>{visibleZones} of {audioPlan.zones.length}</span></button> : null}
              </section>

              <section className="audio-final-check">
                <div><p>BEFORE YOU EDIT</p><h2>Rights and mix checkpoint</h2><span>{audioPlan.strategy.copyrightRule}</span></div>
                <ol>{audioPlan.finalChecks.map((check, index) => <li key={index}><span>{index + 1}</span>{check}</li>)}</ol>
              </section>
            </>
          ) : (
            <section className="audio-empty"><div>♪</div><p>FINAL SCRIPT + VISUAL TIMING READY</p><h2>No Audio Plan request has been sent.</h2><span>Review the handoff, choose the sound policy, then click Build Audio Plan. The result will contain no fabricated track titles.</span></section>
          )}

          <footer className="audio-next">
            <Link href="/studio/visuals"><span>Previous stage</span><strong>← Visuals</strong></Link>
            <div><span>Current production idea</span><strong>{selectedIdea?.title ?? 'Nothing selected'}</strong></div>
            <button type="button" disabled={!planCurrent || loading} onClick={continueToThumbnails}><span>{planCurrent ? 'Complete Audio Plan saved' : 'Build one current plan first'}</span><strong>Thumbnails <i>→</i></strong></button>
          </footer>
        </div>
      </section>

      {modal ? <div className="audio-modal" role="dialog" aria-modal="true" aria-label={modal === 'script' ? 'Final Script' : 'Visual Timeline'} onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
        <section>
          <header><div><p>APPROVED SOURCE</p><h2>{modal === 'script' ? 'Final Script' : 'Complete Visual Timeline'}</h2></div><button type="button" onClick={() => setModal(null)} aria-label="Close">×</button></header>
          <div className="audio-modal-body">{modal === 'script'
            ? <ScriptDocumentView content={scriptRecord?.content ?? ''} />
            : <div className="audio-modal-timeline">{visualPlan?.timeline.map((clip) => <article key={clip.clipId}><b>{clip.clipId}</b><span>{formatTime(clip.startSeconds)}–{formatTime(clip.endSeconds)}</span><p>{clip.narration}</p><small>{clip.sceneId} · {clip.direction}</small></article>)}</div>}</div>
        </section>
      </div> : null}
    </main>
  );
}
