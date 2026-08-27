'use client';

import { jsonrepair } from 'jsonrepair';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StudioStageId } from '../_lib/stages';
import { studioNavigate } from '../_lib/navigation';
import ScriptDocumentView, { getSpokenScriptText } from './script-document-view';
import StudioSidebar from './studio-sidebar';

type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'custom';
type AuthMethod = 'bearer' | 'api-key';
type AudioMode = 'normal' | 'faith_safe';
type BedType = 'music' | 'ambience' | 'silence';
type AudioSource = 'youtube_audio_library' | 'pixabay' | 'none';

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
type CapCutSettings = {
  volumeDb: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
};
type AudioZone = {
  zoneId: string;
  startSeconds: number;
  endSeconds: number;
  soundType: BedType;
  searchQuery: string;
  source: AudioSource;
  capCut: CapCutSettings | null;
};
type AudioPlan = {
  version: 'ARCLANE_AUDIO_PLAN_2026_08_V3';
  mode: AudioMode;
  zones: AudioZone[];
};
const connectionStorageKey = 'arclane.model-connections.v1';
const workflowStorageKey = 'arclane.creator-workflow.v1';
const modelPreferenceKey = 'arclane.workflow-models.v1';
const audioModePreferenceKey = 'arclane.audio-mode.v1';
const connectionChangeEvent = 'arclane:model-connections-changed';
const initialWorkflow: WorkflowState = { stages: {} };
const audioPlanVersion = 'ARCLANE_AUDIO_PLAN_2026_08_V3' as const;
const allowedSources = new Set<AudioSource>(['youtube_audio_library', 'pixabay', 'none']);
const allowedBedTypes = new Set<BedType>(['music', 'ambience', 'silence']);
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
function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  const number = numberValue(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
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
  if (source === 'youtube_audio_library') return 'YouTube Audio Library';
  if (source === 'pixabay') return 'Pixabay Sounds';
  return 'No sound needed';
}
function sourceUrl(source: AudioSource) {
  if (source === 'youtube_audio_library') return 'https://www.youtube.com/audiolibrary';
  if (source === 'pixabay') return 'https://pixabay.com/sound-effects/';
  return '#';
}
function bedLabel(type: BedType) {
  if (type === 'music') return 'Background music';
  if (type === 'ambience') return 'Ambience / sound';
  return 'Silence';
}
function formatTime(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return Math.floor(safe / 60) + ':' + String(safe % 60).padStart(2, '0');
}

function normalizeCapCut(value: unknown, legacyValue: unknown, soundType: BedType): CapCutSettings | null {
  if (soundType === 'silence') return null;
  const settings = asRecord(value);
  const legacy = asRecord(legacyValue);
  const music = soundType === 'music';
  const defaultVolume = music ? -22 : -24;
  return {
    volumeDb: Math.round(boundedNumber(settings.volumeDb ?? legacy.bedLevelDb, music ? -26 : -30, music ? -18 : -20, defaultVolume) * 10) / 10,
    fadeInSeconds: Math.round(boundedNumber(settings.fadeInSeconds ?? legacy.fadeInSeconds, 0, 5, 1.5) * 10) / 10,
    fadeOutSeconds: Math.round(boundedNumber(settings.fadeOutSeconds ?? legacy.fadeOutSeconds, 0, 5, 1.5) * 10) / 10,
  };
}

function parseAudioPlan(content: string, mode: AudioMode, totalDuration: number, requireCompleteCoverage = true): AudioPlan {
  const root = parseJsonObject(content, 'Audio Plan');
  const rawZones = Array.isArray(root.zones) ? root.zones : [];
  if (!rawZones.length) throw new Error('The model returned no usable Audio timeline. Your saved work is unchanged; try again or choose another model.');

  let previousEnd = -0.001;
  const zones = rawZones.map((value, index) => {
    const raw = asRecord(value);
    const startSeconds = Math.round(numberValue(raw.startSeconds) * 10) / 10;
    const endSeconds = Math.round(numberValue(raw.endSeconds) * 10) / 10;
    const requestedType = (stringValue(raw.soundType) || stringValue(raw.bedType)) as BedType;
    const soundType = allowedBedTypes.has(requestedType) ? requestedType : 'ambience';
    const legacySources = stringList(raw.sources, 1);
    const requestedSource = (stringValue(raw.source) || legacySources[0]) as AudioSource;
    const legacyQueries = stringList(raw.searchQueries, 1);
    const defaultQuery = soundType === 'music' ? 'restrained documentary background music' : 'natural historical ambience sound effect';
    const rawQuery = stringValue(raw.searchQuery) || legacyQueries[0] || defaultQuery;
    const queryWithoutUrl = /https?:\/\//i.test(rawQuery) ? defaultQuery : rawQuery.replace(/^["']|["']$/g, '');
    const searchQuery = soundType === 'silence' ? '' : queryWithoutUrl.split(/\s+/).filter(Boolean).slice(0, 14).join(' ');
    const source: AudioSource = soundType === 'silence'
      ? 'none'
      : soundType === 'music'
        ? 'youtube_audio_library'
        : allowedSources.has(requestedSource) && requestedSource !== 'none' ? requestedSource : 'youtube_audio_library';
    const zone: AudioZone = {
      zoneId: stringValue(raw.zoneId) || 'AUDIO-' + String(index + 1).padStart(2, '0'),
      startSeconds,
      endSeconds,
      soundType,
      searchQuery,
      source,
      capCut: normalizeCapCut(raw.capCut, raw.mixSettings, soundType),
    };

    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0 || endSeconds <= startSeconds || endSeconds > totalDuration + 1) {
      throw new Error(zone.zoneId + ' has an invalid time range. Nothing was replaced; click Build Audio Plan once more.');
    }
    if (startSeconds < previousEnd - 0.1) throw new Error('The Audio sections overlap or are out of order. Nothing was replaced; click Build Audio Plan once more.');
    if (zone.capCut) {
      const maximumFade = Math.max(0, Math.min(5, (endSeconds - startSeconds) / 3));
      zone.capCut.fadeInSeconds = Math.round(Math.min(zone.capCut.fadeInSeconds, maximumFade) * 10) / 10;
      zone.capCut.fadeOutSeconds = Math.round(Math.min(zone.capCut.fadeOutSeconds, maximumFade) * 10) / 10;
    }
    previousEnd = endSeconds;
    return zone;
  });

  const essentialZones = zones.reduce<AudioZone[]>((result, zone) => {
    const previous = result.at(-1);
    const sameContinuousSound = previous
      && Math.abs(previous.endSeconds - zone.startSeconds) <= 0.2
      && previous.soundType === zone.soundType
      && previous.source === zone.source
      && previous.searchQuery.toLowerCase() === zone.searchQuery.toLowerCase()
      && (previous.capCut?.volumeDb ?? null) === (zone.capCut?.volumeDb ?? null);
    if (sameContinuousSound) {
      previous.endSeconds = zone.endSeconds;
      if (previous.capCut && zone.capCut) previous.capCut.fadeOutSeconds = zone.capCut.fadeOutSeconds;
      return result;
    }
    result.push({ ...zone, capCut: zone.capCut ? { ...zone.capCut } : null });
    return result;
  }, []);
  essentialZones.forEach((zone, index) => { zone.zoneId = 'AUDIO-' + String(index + 1).padStart(2, '0'); });

  const firstZone = essentialZones[0];
  const lastZone = essentialZones[essentialZones.length - 1];
  const uncoveredBoundary = firstZone.startSeconds > 0.1 || Math.abs(lastZone.endSeconds - totalDuration) > 0.2;
  const uncoveredGap = essentialZones.some((zone, index) => index > 0 && Math.abs(zone.startSeconds - essentialZones[index - 1].endSeconds) > 0.2);
  if (requireCompleteCoverage && (uncoveredBoundary || uncoveredGap)) {
    throw new Error('The Audio plan did not cover the complete ' + formatTime(totalDuration) + ' timeline. Your previous plan is unchanged; click Build Audio Plan again.');
  }

  if (mode === 'faith_safe') {
    const unsafeZone = essentialZones.find((zone) => zone.soundType === 'music' || faithForbidden.test(zone.searchQuery));
    if (unsafeZone) throw new Error('The model included a musical element while Faith-safe audio was on. Nothing was replaced; try again or choose another model.');
  }

  return { version: audioPlanVersion, mode, zones: essentialZones };
}

function readSavedPlan(content: string, expectedDuration: number): AudioPlan | null {
  try {
    const root = parseJsonObject(content, 'Audio Plan');
    const supportedVersions = new Set([audioPlanVersion, 'ARCLANE_AUDIO_PLAN_2026_08_V2', 'ARCLANE_AUDIO_PLAN_2026_08_V1']);
    if (!supportedVersions.has(stringValue(root.version)) || !Array.isArray(root.zones)) return null;
    const mode: AudioMode = root.mode === 'faith_safe' ? 'faith_safe' : 'normal';
    const maxEnd = root.zones.reduce((maximum, value) => Math.max(maximum, numberValue(asRecord(value).endSeconds) || 0), 0);
    return parseAudioPlan(content, mode, Math.max(expectedDuration, maxEnd, 1), false);
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
  const [modal, setModal] = useState<'script' | 'timeline' | null>(null);

  const scriptRecord = workflow.stages.scripts;
  const voiceRecord = workflow.stages.voiceover;
  const visualsRecord = workflow.stages.visuals;
  const audioRecord = workflow.stages.audio;
  const selectedIdea = workflow.selectedIdea;
  const visualPlan = useMemo(() => readVisualPlan(visualsRecord?.content ?? ''), [visualsRecord?.content]);
  const totalDuration = visualPlan?.timeline.at(-1)?.endSeconds ?? 0;
  const audioPlan = useMemo(() => readSavedPlan(audioRecord?.content ?? '', totalDuration), [audioRecord?.content, totalDuration]);
  const legacyPlanPreserved = Boolean(audioRecord?.content.trim() && !audioPlan);
  const audioPlanEnd = audioPlan?.zones.at(-1)?.endSeconds ?? 0;
  const coverageComplete = Boolean(audioPlan && totalDuration > 0 && Math.abs(audioPlanEnd - totalDuration) <= 0.2);
  const coveragePercent = totalDuration > 0 ? Math.min(100, Math.round((audioPlanEnd / totalDuration) * 100)) : 0;
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
    && audioPlan.mode === audioMode
    && coverageComplete,
  );
  const activeConnection = connections.find((item) => item.providerId === providerId);
  const activeModel = activeConnection?.models.find((model) => model.id === modelId);
  const scriptPreview = useMemo(() => {
    const text = getSpokenScriptText(scriptRecord?.content ?? '');
    return text.length > 330 ? text.slice(0, 330).trim() + '…' : text;
  }, [scriptRecord?.content]);

  const compactTimeline = useMemo(() => {
    if (!visualPlan) return [];
    return visualPlan.timeline.map((clip) => ({
      clipId: clip.clipId,
      startSeconds: clip.startSeconds,
      endSeconds: clip.endSeconds,
      narration: clip.narration,
    }));
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
            selectedIdea: selectedIdea ? { title: selectedIdea.title } : null,
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
        setNotice('Complete Audio Plan saved. All ' + plan.zones.length + ' required section' + (plan.zones.length === 1 ? ' is' : 's are') + ' visible from 0:00 to ' + formatTime(totalDuration) + '.');
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
    if (!audioPlan) return;
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
    studioNavigate('/studio/thumbnails');
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
              <div><span>Complete timeline · all sections</span><strong>{audioPlan?.zones.length ?? 0}</strong></div>
            </header>

            <div className="audio-model-bar">
              {connections.length ? (
                <>
                  <label><span>AI provider</span><div><b>{providerId ? providerMark(providerId) : '—'}</b><select value={providerId} onChange={(event) => changeProvider(event.target.value as ProviderId)}>{connections.map((connection) => <option value={connection.providerId} key={connection.providerId}>{connection.providerName}</option>)}</select></div></label>
                  <label><span>Model for Audio</span><div><select value={modelId} onChange={(event) => changeModel(event.target.value)}>{activeConnection?.models.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}</select></div></label>
                  <div className="audio-request-note"><i />One focused request</div>
                </>
              ) : (
                <div className="automation-no-model"><span>◇</span><div><strong>No AI model connected</strong><small>Add one provider and choose a capable model. Your key stays in this browser.</small></div><a href="/studio/settings" onClick={(e) => studioNavigate('/studio/settings', e)}>Open Settings →</a></div>
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

            {!handoffReady ? <div className="audio-prerequisite"><span>←</span><div><strong>The current Visual handoff is not ready</strong><p>Finish the current Final Script, Voiceover and complete Visual Plan first. No Audio request will be sent yet.</p></div><a href="/studio/visuals" onClick={(e) => studioNavigate('/studio/visuals', e)}>Open Visuals</a></div> : null}
            {error ? <p className="audio-message error" role="alert"><span>!</span>{error}</p> : null}
            {notice ? <p className="audio-message success" role="status"><span>✓</span>{notice}</p> : null}
            {legacyPlanPreserved ? <p className="audio-message warning" role="status"><span>i</span>An older Audio Plan is preserved but could not be read. Building a new plan will replace it only after usable output is ready.</p> : null}
            {audioPlan && !coverageComplete ? <p className="audio-message warning" role="status"><span>i</span>This visible saved plan stops at {formatTime(audioPlanEnd)} of {formatTime(totalDuration)}. Nothing is hidden, but build again before continuing so the final result reaches the end.</p> : null}
            {audioPlan && coverageComplete && !planCurrent ? <p className="audio-message warning" role="status"><span>i</span>This complete Audio Plan is from an older handoff or sound mode. It remains visible below; build again only when you want a current version.</p> : null}


            <div className="audio-build-row">
              <div><strong>Two-step handoff</strong><span>Visuals only delivered the approved source. Nothing runs until you click this button.</span></div>
              <button type="button" disabled={!handoffReady || !activeModel || loading} onClick={() => void buildAudioPlan()}>{loading ? <><i className="automation-spinner" /> Building Audio Plan…</> : <>{planCurrent ? 'Build again safely' : 'Build Audio Plan'} <b>→</b></>}</button>
            </div>
          </section>

          {audioPlan ? (
            <section className="audio-timeline audio-simple-timeline">
              <header><div><p>COMPLETE CAPCUT AUDIO TIMELINE</p><h2>Search it, place it, set three values</h2><span>{audioPlan.zones.length} necessary sound section{audioPlan.zones.length === 1 ? '' : 's'} · {formatTime(totalDuration)} total</span></div><div><button type="button" onClick={() => void copyText(JSON.stringify(audioPlan, null, 2), 'Complete Audio Plan copied.')}>Copy all</button><button type="button" onClick={downloadPlan}>Download plan</button></div></header>
              <div className={'audio-coverage ' + (coverageComplete ? 'complete' : 'partial')}>
                <span>0:00</span>
                <div><i><b style={{ width: coveragePercent + '%' }} /></i><strong>{coverageComplete ? '100% of the video is covered' : coveragePercent + '% of the video is covered'}</strong><small>{coverageComplete ? 'All required sound sections are visible below in order.' : 'This saved output stops at ' + formatTime(audioPlanEnd) + '. Build again before moving to the next section.'}</small></div>
                <span>{coverageComplete ? formatTime(totalDuration) : formatTime(audioPlanEnd) + ' / ' + formatTime(totalDuration)}</span>
              </div>
              <div className="audio-zone-list">
                {audioPlan.zones.map((zone, index) => (
                  <article className={'audio-zone ' + zone.soundType} key={zone.zoneId}>
                    <div className="audio-zone-time"><span>{String(index + 1).padStart(2, '0')}</span><small>Section {index + 1} of {audioPlan.zones.length}</small><strong>{formatTime(zone.startSeconds)}</strong><i>→</i><strong>{formatTime(zone.endSeconds)}</strong><small>{Math.round(zone.endSeconds - zone.startSeconds)} sec</small></div>
                    <div className="audio-zone-body audio-simple-body">
                      <header><div><p>{zone.zoneId}</p><h3>{bedLabel(zone.soundType)}</h3></div></header>
                      {zone.soundType === 'silence' ? <div className="audio-silence-note"><strong>No sound needed</strong><span>Leave this section silent from {formatTime(zone.startSeconds)} to {formatTime(zone.endSeconds)}.</span></div> : <>
                        <div className="audio-searches audio-one-search"><p>1 · TYPE THIS IN THE LIBRARY</p><button type="button" onClick={() => void copyText(zone.searchQuery, 'Search phrase copied.')}>{zone.searchQuery}<span>Copy search</span></button><div><a href={sourceUrl(zone.source)} target="_blank" rel="noreferrer">Open {sourceLabel(zone.source)} ↗</a></div></div>
                        {zone.capCut ? <div className="audio-capcut-card">
                          <header><div><p>2 · CAPCUT SETTINGS</p><strong>Select audio clip → Audio → Basic</strong></div><b>CapCut</b></header>
                          <div>
                            <article><span>Volume</span><strong>{zone.capCut.volumeDb} dB</strong></article>
                            <article><span>Fade in</span><strong>{zone.capCut.fadeInSeconds} sec</strong></article>
                            <article><span>Fade out</span><strong>{zone.capCut.fadeOutSeconds} sec</strong></article>
                          </div>
                        </div> : null}
                      </>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <section className="audio-empty"><div>♪</div><p>FINAL SCRIPT + TIMING READY</p><h2>{legacyPlanPreserved ? 'Your older Audio Plan is preserved.' : 'No Audio Plan has been built.'}</h2><span>Click Build Audio Plan. The result will contain only the search phrase, source, volume and fade settings needed in CapCut.</span></section>
          )}
          <footer className="audio-next">
            <a href="/studio/visuals" onClick={(e) => studioNavigate('/studio/visuals', e)}><span>Previous stage</span><strong>← Visuals</strong></a>
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
