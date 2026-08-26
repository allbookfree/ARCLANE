'use client';

import { jsonrepair } from 'jsonrepair';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSpokenScriptText } from './script-document-view';
import StudioSidebar from './studio-sidebar';

type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'custom';
type AuthMethod = 'bearer' | 'api-key';
type ShortSlot = 1 | 2 | 3;
type LengthMode = 'auto' | 'under_60' | 'story_90' | 'deep_180';
type VisualModestyMode = 'evidence_led' | 'strict';
type AudioMode = 'normal' | 'faith_safe';
type VisualType = 'ai_video' | 'ai_still_motion' | 'map_diagram';
type SoundType = 'music' | 'ambience' | 'silence';
type AudioSource = 'youtube_audio_library' | 'pixabay' | 'none';

type Model = { id: string; name: string };
type Selection = { providerId: ProviderId; providerName: string; models: Model[]; apiKey: string; baseUrl?: string; authMethod?: AuthMethod; headerName?: string; completionPath?: string };
type Idea = { id: string; title: string; premise?: string; region?: string; period?: string; everydayLens?: string };
type StageRecord = { content: string; providerName: string; modelName: string; updatedAt: string; selectedTitleId?: string; sourceIdeaId?: string; sourceScriptUpdatedAt?: string; sourceDescriptionUpdatedAt?: string };
type WorkflowState = { selectedIdea?: Idea; stages: Record<string, StageRecord | undefined> };
type ModelPreference = { providerId: ProviderId; modelId: string };
type ShortSettings = { lengthMode: LengthMode; visualModestyMode: VisualModestyMode; audioMode: AudioMode };
type ShortClip = { id: string; startSeconds: number; endSeconds: number; spokenText: string; onScreenText: string; visualType: VisualType; visualPrompt: string; sfxSearch: string };
type AudioZone = { startSeconds: number; endSeconds: number; soundType: SoundType; searchQuery: string; source: AudioSource; volumeDb: number | null; fadeInSeconds: number; fadeOutSeconds: number };
type ShortPackage = {
  version: 'ARCLANE_SHORT_PACKAGE_2026_08_V2';
  slot: ShortSlot;
  settings: ShortSettings;
  angleKey: string;
  angle: string;
  differenceFromEarlier: string;
  durationSeconds: number;
  upload: { title: string; description: string };
  cover: { headline: string; prompt: string };
  story: { hook: string; payoff: string; fullVideoBridge: string };
  timeline: ShortClip[];
  audioZones: AudioZone[];
};
type ShortsWorkspaceData = { version: 'ARCLANE_SHORTS_WORKSPACE_2026_08_V2'; slots: [ShortPackage | null, ShortPackage | null, ShortPackage | null] };
type DescriptionHandoff = { title: string; description: string };

const workflowStorageKey = 'arclane.creator-workflow.v1';
const connectionStorageKey = 'arclane.model-connections.v1';
const modelPreferenceKey = 'arclane.workflow-models.v1';
const shortLengthPreferenceKey = 'arclane.shorts-length.v1';
const connectionChangeEvent = 'arclane:model-connections-changed';
const packageVersion = 'ARCLANE_SHORT_PACKAGE_2026_08_V2' as const;
const workspaceVersion = 'ARCLANE_SHORTS_WORKSPACE_2026_08_V2' as const;
const initialWorkflow: WorkflowState = { stages: {} };
const visualTypes = new Set<VisualType>(['ai_video', 'ai_still_motion', 'map_diagram']);
const soundTypes = new Set<SoundType>(['music', 'ambience', 'silence']);
const audioSources = new Set<AudioSource>(['youtube_audio_library', 'pixabay', 'none']);
const faithUnsafeAudioPattern = /\b(?:music|musical|song|melody|melodic|instrument|instrumental|piano|guitar|violin|flute|drum|percussion|beat|singing|humming|chant|choir|vocal)\b/i;
const strictModestyPromptRule = 'If any woman or girl appears, her hair, neck, chest, arms and legs must be fully covered with loose opaque clothing.';
const lengthProfiles: Record<LengthMode, { label: string; detail: string; min: number; max: number }> = {
  auto: { label: 'Auto · Recommended', detail: 'Usually 35–60 seconds; the story chooses.', min: 20, max: 90 },
  under_60: { label: 'Under 60 seconds', detail: 'A compact discovery Short.', min: 20, max: 60 },
  story_90: { label: '60–90 seconds', detail: 'More room for one complete mini-story.', min: 55, max: 90 },
  deep_180: { label: '90–180 seconds', detail: 'Use only when the story truly needs it.', min: 85, max: 180 },
};

function emptyWorkspace(): ShortsWorkspaceData { return { version: workspaceVersion, slots: [null, null, null] }; }
function readJson<T>(key: string, fallback: T): T { try { const value = window.localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function readConnections() {
  const value = readJson<unknown>(connectionStorageKey, []);
  return Array.isArray(value) ? value.filter((item): item is Selection => {
    const candidate = item && typeof item === 'object' ? item as Partial<Selection> : {};
    return typeof candidate.providerId === 'string' && typeof candidate.providerName === 'string' && typeof candidate.apiKey === 'string' && Array.isArray(candidate.models);
  }) : [];
}
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function numberValue(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN; }
function parseJsonObject(content: string, label: string) {
  const text = content.replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`The AI did not return a usable ${label}. Your saved work is unchanged.`);
  const candidate = text.slice(start, end + 1);
  try { return asRecord(JSON.parse(candidate) as unknown); }
  catch { try { return asRecord(JSON.parse(jsonrepair(candidate)) as unknown); } catch { throw new Error(`The ${label} response was incomplete. Your saved work is unchanged; try again or choose another model.`); } }
}
function normalizeWords(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function wordSimilarity(left: string, right: string) {
  const a = new Set(normalizeWords(left).split(' ').filter((word) => word.length > 3));
  const b = new Set(normalizeWords(right).split(' ').filter((word) => word.length > 3));
  if (!a.size || !b.size) return 0;
  return [...a].filter((word) => b.has(word)).length / Math.min(a.size, b.size);
}
function parseSettings(value: unknown): ShortSettings {
  const item = asRecord(value); const lengthMode = stringValue(item.lengthMode) as LengthMode;
  return { lengthMode: lengthMode in lengthProfiles ? lengthMode : 'auto', visualModestyMode: stringValue(item.visualModestyMode) === 'strict' ? 'strict' : 'evidence_led', audioMode: stringValue(item.audioMode) === 'faith_safe' ? 'faith_safe' : 'normal' };
}
function parseShortPackage(value: unknown, expectedSlot: ShortSlot, previous: ShortPackage[], expected?: ShortSettings): ShortPackage {
  const root = typeof value === 'string' ? parseJsonObject(value, `Short ${expectedSlot}`) : asRecord(value);
  if (stringValue(root.version) !== packageVersion || numberValue(root.slot) !== expectedSlot) throw new Error(`Short ${expectedSlot} used the wrong format or slot. Nothing was replaced.`);
  const settings = parseSettings(root.settings);
  if (expected && JSON.stringify(settings) !== JSON.stringify(expected)) throw new Error('The AI did not follow the selected Short settings. Nothing was replaced.');

  const angleKey = stringValue(root.angleKey); const angle = stringValue(root.angle); const differenceFromEarlier = stringValue(root.differenceFromEarlier);
  const durationSeconds = Math.round(numberValue(root.durationSeconds)); const profile = lengthProfiles[settings.lengthMode];
  const uploadRaw = asRecord(root.upload); const upload = { title: stringValue(uploadRaw.title).replace(/\s+/g, ' '), description: stringValue(uploadRaw.description) };
  const coverRaw = asRecord(root.cover); const cover = { headline: stringValue(coverRaw.headline).replace(/\s+/g, ' '), prompt: stringValue(coverRaw.prompt) };
  const storyRaw = asRecord(root.story); const story = { hook: stringValue(storyRaw.hook), payoff: stringValue(storyRaw.payoff), fullVideoBridge: stringValue(storyRaw.fullVideoBridge) };
  if (!angleKey || !angle || !differenceFromEarlier || !Number.isFinite(durationSeconds) || durationSeconds < profile.min || durationSeconds > profile.max) throw new Error(`Short ${expectedSlot} did not contain a complete natural-length story. Nothing was replaced.`);
  if (!upload.title || upload.title.length > 100 || !upload.description || upload.description.length > 500 || !story.hook || !story.payoff || !story.fullVideoBridge) throw new Error(`Short ${expectedSlot} upload or story details were incomplete. Nothing was replaced.`);
  const coverWords = cover.headline.split(/\s+/).filter(Boolean).length;
  if (!cover.headline || coverWords > 5 || cover.headline.length > 32 || cover.prompt.length < 140 || !/9\s*:\s*16/.test(cover.prompt) || normalizeWords(cover.headline) === normalizeWords(upload.title) || !normalizeWords(cover.prompt).includes(normalizeWords(cover.headline)) || !normalizeWords(cover.prompt).includes(normalizeWords(strictModestyPromptRule))) throw new Error(`Short ${expectedSlot} cover was not a complete, distinct and modest 9:16 thumbnail plan. Nothing was replaced.`);
  for (const earlier of previous) {
    const repeated = normalizeWords(earlier.angleKey) === normalizeWords(angleKey) || wordSimilarity(`${earlier.angle} ${earlier.story.payoff}`, `${angle} ${story.payoff}`) > .78 || normalizeWords(earlier.upload.title) === normalizeWords(upload.title);
    if (repeated) throw new Error(`Short ${expectedSlot} repeated an earlier angle. Nothing was replaced; build it again for a genuinely different story.`);
  }

  const rawTimeline = Array.isArray(root.timeline) ? root.timeline : [];
  if (rawTimeline.length < 4 || rawTimeline.length > 45) throw new Error(`Short ${expectedSlot} returned an incomplete visual timeline. Nothing was replaced.`);
  const timeline = rawTimeline.map((value, index): ShortClip => {
    const item = asRecord(value); const startSeconds = Math.round(numberValue(item.startSeconds)); const endSeconds = Math.round(numberValue(item.endSeconds));
    const visual = stringValue(item.visualType) as VisualType;
    const clip: ShortClip = { id: `SHOT-${String(index + 1).padStart(2, '0')}`, startSeconds, endSeconds, spokenText: stringValue(item.spokenText), onScreenText: stringValue(item.onScreenText), visualType: visualTypes.has(visual) ? visual : 'ai_video', visualPrompt: stringValue(item.visualPrompt), sfxSearch: stringValue(item.sfxSearch) };
    const expectedStart = index ? Math.round(numberValue(asRecord(rawTimeline[index - 1]).endSeconds)) : 0;
    if (startSeconds !== expectedStart || endSeconds <= startSeconds || endSeconds - startSeconds > 12 || !clip.spokenText || clip.visualPrompt.length < 90 || clip.onScreenText.length > 70 || !normalizeWords(clip.visualPrompt).includes(normalizeWords(strictModestyPromptRule))) throw new Error(`Short ${expectedSlot} shot ${index + 1} was incomplete, mistimed or missing its permanent modesty protection. Nothing was replaced.`);
    return clip;
  });
  if (timeline.at(-1)?.endSeconds !== durationSeconds) throw new Error(`Short ${expectedSlot} visuals did not cover the full duration. Nothing was replaced.`);
  if (new Set(timeline.map((clip) => normalizeWords(clip.visualPrompt))).size !== timeline.length) throw new Error(`Short ${expectedSlot} repeated a visual shot. Nothing was replaced.`);
  const voiceover = timeline.map((clip) => clip.spokenText.trim()).join(' ').replace(/\s+/g, ' ').trim();
  const wordsPerMinute = (voiceover.split(/\s+/).filter(Boolean).length * 60) / durationSeconds;
  if (wordsPerMinute < 90 || wordsPerMinute > 210) throw new Error(`Short ${expectedSlot} narration did not fit its timeline naturally. Nothing was replaced.`);
  if (!normalizeWords(voiceover).startsWith(normalizeWords(story.hook))) throw new Error(`Short ${expectedSlot} did not begin with its promised hook. Nothing was replaced.`);
  if (!normalizeWords(voiceover).endsWith(normalizeWords(story.fullVideoBridge))) throw new Error(`Short ${expectedSlot} did not finish with its full-video bridge. Nothing was replaced.`);
  if (/(?:https?:\/\/|www\.|#\w+)/i.test(upload.description)) throw new Error(`Short ${expectedSlot} description contained a link or hashtag. Nothing was replaced.`);
  if (settings.audioMode === 'faith_safe' && timeline.some((clip) => faithUnsafeAudioPattern.test(clip.sfxSearch))) throw new Error(`Short ${expectedSlot} returned a non-faith-safe effect suggestion. Nothing was replaced.`);

  const rawAudio = Array.isArray(root.audioZones) ? root.audioZones : [];
  if (!rawAudio.length || rawAudio.length > 10) throw new Error(`Short ${expectedSlot} returned no usable audio plan. Nothing was replaced.`);
  const audioZones = rawAudio.map((value, index): AudioZone => {
    const item = asRecord(value); const startSeconds = Math.round(numberValue(item.startSeconds)); const endSeconds = Math.round(numberValue(item.endSeconds));
    const rawType = stringValue(item.soundType) as SoundType; const rawSource = stringValue(item.source) as AudioSource;
    const soundType = soundTypes.has(rawType) ? rawType : 'silence'; const source = audioSources.has(rawSource) ? rawSource : 'none';
    const numericVolume = item.volumeDb === null ? Number.NaN : numberValue(item.volumeDb);
    const zone: AudioZone = { startSeconds, endSeconds, soundType, searchQuery: stringValue(item.searchQuery), source, volumeDb: Number.isFinite(numericVolume) ? numericVolume : null, fadeInSeconds: Math.max(0, Math.min(5, numberValue(item.fadeInSeconds) || 0)), fadeOutSeconds: Math.max(0, Math.min(5, numberValue(item.fadeOutSeconds) || 0)) };
    const expectedStart = index ? Math.round(numberValue(asRecord(rawAudio[index - 1]).endSeconds)) : 0;
    const invalidSilence = soundType === 'silence' && (source !== 'none' || Boolean(zone.searchQuery) || zone.volumeDb !== null);
    const invalidSound = soundType !== 'silence' && (!zone.searchQuery || source === 'none' || zone.volumeDb === null || zone.volumeDb < -40 || zone.volumeDb > -10);
    const invalidFaithSound = settings.audioMode === 'faith_safe' && (soundType === 'music' || faithUnsafeAudioPattern.test(zone.searchQuery));
    if (startSeconds !== expectedStart || endSeconds <= startSeconds || invalidSilence || invalidSound || invalidFaithSound) throw new Error(`Short ${expectedSlot} audio section ${index + 1} failed the sound policy. Nothing was replaced.`);
    return zone;
  });
  if (audioZones.at(-1)?.endSeconds !== durationSeconds) throw new Error(`Short ${expectedSlot} audio did not cover the full duration. Nothing was replaced.`);
  return { version: packageVersion, slot: expectedSlot, settings, angleKey, angle, differenceFromEarlier, durationSeconds, upload, cover, story, timeline, audioZones };
}
function readShortWorkspace(record: StageRecord | undefined): ShortsWorkspaceData {
  if (!record?.content) return emptyWorkspace();
  try {
    const root = parseJsonObject(record.content, 'Shorts workspace'); if (stringValue(root.version) !== workspaceVersion) return emptyWorkspace();
    const raw = Array.isArray(root.slots) ? root.slots : []; const slots: ShortsWorkspaceData['slots'] = [null, null, null];
    for (let index = 0; index < 3; index += 1) if (raw[index]) slots[index] = parseShortPackage(raw[index], (index + 1) as ShortSlot, slots.slice(0, index).filter(Boolean) as ShortPackage[]);
    return { version: workspaceVersion, slots };
  } catch { return emptyWorkspace(); }
}
function readDescriptionHandoff(record: StageRecord | undefined): DescriptionHandoff | null {
  if (!record?.content) return null;
  try {
    const root = parseJsonObject(record.content, 'Description package'); const titles = Array.isArray(root.titles) ? root.titles.map(asRecord) : [];
    const selected = titles.find((item) => stringValue(item.id) === (record.selectedTitleId || stringValue(root.recommendedTitleId))); const description = asRecord(root.description);
    const lines = Array.isArray(description.openingLines) ? description.openingLines.map(stringValue).filter(Boolean) : [];
    const title = stringValue(selected?.title); const body = stringValue(description.body);
    return title && body ? { title, description: [...lines, body].join(' ') } : null;
  } catch { return null; }
}
function compactDocument(value: string, limit = 30000) {
  if (value.length <= limit) return value;
  const segment = Math.floor((limit - 120) / 3); const middle = Math.max(0, Math.floor(value.length / 2) - Math.floor(segment / 2));
  return `${value.slice(0, segment)}\n\n[...middle of document...]\n\n${value.slice(middle, middle + segment)}\n\n[...ending of document...]\n\n${value.slice(-segment)}`;
}
function providerMark(id: ProviderId) { return id === 'openai' ? 'O' : id === 'anthropic' ? 'A' : id === 'gemini' ? 'G' : '+'; }
function formatTime(seconds: number) { const value = Math.max(0, Math.round(seconds)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; }
function visualLabel(type: VisualType) { return type === 'ai_still_motion' ? 'AI still + motion' : type === 'map_diagram' ? 'Map / diagram' : 'AI video'; }
function sourceLabel(source: AudioSource) { return source === 'youtube_audio_library' ? 'YouTube Audio Library' : source === 'pixabay' ? 'Pixabay' : 'No asset needed'; }

export default function ShortsWorkspace() {
  const [hydrated, setHydrated] = useState(false);
  const [connections, setConnections] = useState<Selection[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowState>(initialWorkflow);
  const [providerId, setProviderId] = useState<ProviderId | ''>('');
  const [modelId, setModelId] = useState('');
  const [activeSlot, setActiveSlot] = useState<ShortSlot>(1);
  const [lengthMode, setLengthMode] = useState<LengthMode>('auto');
  const visualModestyMode: VisualModestyMode = 'strict';
  const audioMode: AudioMode = 'faith_safe';
  const [direction, setDirection] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedIdea = workflow.selectedIdea;
  const scriptRecord = workflow.stages.scripts;
  const descriptionRecord = workflow.stages.description;
  const shortsRecord = workflow.stages.shorts;
  const handoff = useMemo(() => readDescriptionHandoff(descriptionRecord), [descriptionRecord]);
  const spokenScript = useMemo(() => getSpokenScriptText(scriptRecord?.content ?? ''), [scriptRecord?.content]);
  const shorts = useMemo(() => readShortWorkspace(shortsRecord), [shortsRecord]);
  const activePackage = shorts.slots[activeSlot - 1];
  const activeConnection = connections.find((item) => item.providerId === providerId);
  const activeModel = activeConnection?.models.find((item) => item.id === modelId);
  const handoffReady = Boolean(selectedIdea && scriptRecord?.content && descriptionRecord?.content && handoff);
  const workspaceCurrent = Boolean(shortsRecord && shortsRecord.sourceIdeaId === selectedIdea?.id && shortsRecord.sourceScriptUpdatedAt === scriptRecord?.updatedAt && shortsRecord.sourceDescriptionUpdatedAt === descriptionRecord?.updatedAt);
  const priorSlotReady = activeSlot === 1 || Boolean(shorts.slots[activeSlot - 2]);
  const fullVoiceover = activePackage?.timeline.map((clip) => clip.spokenText).join(' ') ?? '';

  const persistWorkflow = useCallback((next: WorkflowState) => {
    try { window.localStorage.setItem(workflowStorageKey, JSON.stringify(next)); setWorkflow(next); return true; }
    catch { setError('This browser could not save the Short. Download or clear older local data, then try again.'); return false; }
  }, []);
  const savePreference = useCallback((nextProvider: ProviderId, nextModel: string) => {
    const preferences = readJson<Record<string, ModelPreference>>(modelPreferenceKey, {});
    preferences.shorts = { providerId: nextProvider, modelId: nextModel };
    window.localStorage.setItem(modelPreferenceKey, JSON.stringify(preferences));
  }, []);

  useEffect(() => {
    const refresh = () => setConnections(readConnections());
    const available = readConnections(); const savedWorkflow = readJson<WorkflowState>(workflowStorageKey, initialWorkflow);
    const preference = readJson<Record<string, ModelPreference>>(modelPreferenceKey, {}).shorts;
    const connection = available.find((item) => item.providerId === preference?.providerId) ?? available[0];
    const model = connection?.models.find((item) => item.id === preference?.modelId) ?? connection?.models[0];
    const savedLength = readJson<{ mode?: LengthMode }>(shortLengthPreferenceKey, {}).mode;
    // Hydrate browser-owned workflow and provider state after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnections(available); setWorkflow(savedWorkflow); setProviderId(connection?.providerId ?? ''); setModelId(model?.id ?? '');
    setLengthMode(savedLength && savedLength in lengthProfiles ? savedLength : 'auto');
    setHydrated(true);
    window.addEventListener('storage', refresh); window.addEventListener(connectionChangeEvent, refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener(connectionChangeEvent, refresh); };
  }, []);

  useEffect(() => {
    if (!providerId) return;
    const connection = connections.find((item) => item.providerId === providerId);
    if (!connection) {
      const first = connections[0];
      // Keep the selected provider valid when saved connections change.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProviderId(first?.providerId ?? ''); setModelId(first?.models[0]?.id ?? '');
      return;
    }
    if (!connection.models.some((model) => model.id === modelId)) {
      const first = connection.models[0]; setModelId(first?.id ?? ''); if (first) savePreference(connection.providerId, first.id);
    }
  }, [connections, modelId, providerId, savePreference]);

  function changeProvider(next: ProviderId) {
    const connection = connections.find((item) => item.providerId === next); const model = connection?.models[0];
    setProviderId(next); setModelId(model?.id ?? ''); if (model) savePreference(next, model.id);
  }
  function changeModel(next: string) { setModelId(next); if (providerId) savePreference(providerId, next); }
  function changeLength(next: LengthMode) {
    setLengthMode(next); window.localStorage.setItem(shortLengthPreferenceKey, JSON.stringify({ mode: next }));
    setNotice(`Short length set to ${lengthProfiles[next].label}. It will apply when you build this slot.`);
  }

  async function buildShort() {
    if (loading) return;
    if (!handoffReady || !selectedIdea || !scriptRecord || !descriptionRecord || !handoff) { setError('Choose one Final title in Description before creating a Short.'); return; }
    if (!priorSlotReady) { setError(`Complete Short ${activeSlot - 1} first so Short ${activeSlot} can be genuinely different.`); return; }
    const connection = connections.find((item) => item.providerId === providerId); const model = connection?.models.find((item) => item.id === modelId);
    if (!connection || !model) { setError('Choose a connected AI provider and model first.'); return; }
    if (shorts.slots.slice(activeSlot).some(Boolean) && !window.confirm(`Rebuilding Short ${activeSlot} will clear later Shorts so their angles can be checked again. Continue?`)) return;

    const settings: ShortSettings = { lengthMode, visualModestyMode, audioMode };
    setLoading(true); setError(''); setNotice('');
    try {
      const previous = shorts.slots.slice(0, activeSlot - 1).filter(Boolean) as ShortPackage[];
      const previousSummary = previous.map((item) => ({
        slot: item.slot, angleKey: item.angleKey, angle: item.angle, title: item.upload.title,
        hook: item.story.hook, payoff: item.story.payoff, fullVideoBridge: item.story.fullVideoBridge,
      }));
      const response = await fetch('/api/automation/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 'shorts', provider: connection.providerId, providerName: connection.providerName, model: model.id, apiKey: connection.apiKey,
          baseUrl: connection.baseUrl, authMethod: connection.authMethod, headerName: connection.headerName, completionPath: connection.completionPath,
          extraInstructions: direction,
          context: {
            selectedIdea, shortSlot: activeSlot, shortLength: { mode: lengthMode, ...lengthProfiles[lengthMode] }, shortPreviousPackages: previousSummary,
            visualModesty: { mode: visualModestyMode }, audioMode: { mode: audioMode },
            outputs: { scripts: compactDocument(spokenScript), description: JSON.stringify(handoff) },
          },
        }),
      });
      const result = await response.json() as { output?: string; error?: string };
      if (!response.ok || !result.output) throw new Error(result.error || `The model did not return a usable Short ${activeSlot}.`);
      const nextPackage = parseShortPackage(result.output, activeSlot, previous, settings);
      const nextSlots = shorts.slots.map((item, index) => index < activeSlot - 1 ? item : index === activeSlot - 1 ? nextPackage : null) as ShortsWorkspaceData['slots'];
      const record: StageRecord = {
        content: JSON.stringify({ version: workspaceVersion, slots: nextSlots }, null, 2), providerName: connection.providerName, modelName: model.name, updatedAt: new Date().toISOString(),
        sourceIdeaId: selectedIdea.id, sourceScriptUpdatedAt: scriptRecord.updatedAt, sourceDescriptionUpdatedAt: descriptionRecord.updatedAt,
      };
      if (persistWorkflow({ ...workflow, stages: { ...workflow.stages, shorts: record } })) setNotice(`Short ${activeSlot} is complete and independently publishable. You may stop here or optionally prepare another distinct Short.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Short ${activeSlot} could not be created. Your saved work is unchanged.`);
    } finally { setLoading(false); }
  }

  async function copyText(value: string, message: string) { await navigator.clipboard.writeText(value); setError(''); setNotice(message); }
  function downloadPackage() {
    if (!activePackage) return;
    const blob = new Blob([JSON.stringify(activePackage, null, 2)], { type: 'application/json;charset=utf-8' }); const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `short-${activeSlot}-production-package.json`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    setNotice(`Short ${activeSlot} backup downloaded.`);
  }

  if (!hydrated) return <main className="module-shell module-lime shorts-shell"><StudioSidebar activeStageId="shorts" /><section className="module-main"><div className="shorts-loading">Loading your Shorts workspace…</div></section></main>;

  return <main className="module-shell module-lime shorts-shell">
    <StudioSidebar activeStageId="shorts" />
    <section className="module-main">
      <header className="module-topbar"><div><span>Creator Studio</span><i>/</i><strong>Shorts</strong></div><div className="module-profile"><span>Local workspace</span><i>YC</i></div></header>
      <div className="module-content shorts-content">
        <header className="module-heading shorts-heading"><div><p>One best vertical story at a time</p><h1>Shorts<br />Production.</h1><span>Create one strongest standalone Short now. A second or third is entirely optional, and each request builds only the selected slot.</span></div><div className="module-number">09<small>/ 09</small></div></header>

        <section className={`shorts-handoff${handoffReady ? ' ready' : ''}`}>
          <div className="shorts-handoff-mark">9:16</div><div><p>LONG VIDEO HANDOFF</p><h2>{handoff?.title || 'Choose one Final title first'}</h2><span>{handoffReady ? 'The Final Script and upload package are connected. Nothing runs until you choose a slot and click its build button.' : 'Return to Description and choose one Final title before creating Shorts.'}</span></div><div><strong>{spokenScript ? `${spokenScript.split(/\s+/).filter(Boolean).length.toLocaleString()} script words` : 'Not ready'}</strong><Link href="/studio/description">View Description</Link></div>
        </section>

        <section className="shorts-slots" aria-label="Three optional independent Short slots">
          {([1, 2, 3] as ShortSlot[]).map((slot) => {
            const item = shorts.slots[slot - 1]; const locked = slot > 1 && !shorts.slots[slot - 2];
            return <button type="button" className={`${activeSlot === slot ? 'active' : ''}${item ? ' complete' : ''}`} onClick={() => { setActiveSlot(slot); setDirection(''); setError(''); setNotice(''); }} key={slot}>
              <span>{item ? '✓' : locked ? '○' : slot}</span><div><strong>Short {slot}</strong><small>{item ? `${formatTime(item.durationSeconds)} · Complete` : locked ? `Complete Short ${slot - 1} first` : 'Ready to build'}</small></div><b>{activeSlot === slot ? 'OPEN' : item ? 'READY' : 'SELECT'}</b>
            </button>;
          })}
        </section>

        <section className="shorts-builder">
          <header><div><span>{activeSlot}</span><strong>Build only Short {activeSlot}</strong></div><div><span>Request</span><strong>One complete package</strong></div></header>
          <div className="shorts-model-bar">
            {connections.length ? <><label><span>AI provider</span><div><b>{providerId ? providerMark(providerId) : '—'}</b><select value={providerId} onChange={(event) => changeProvider(event.target.value as ProviderId)}>{connections.map((connection) => <option value={connection.providerId} key={connection.providerId}>{connection.providerName}</option>)}</select></div></label><label><span>Model for this Short</span><div><select value={modelId} onChange={(event) => changeModel(event.target.value)}>{activeConnection?.models.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}</select></div></label><label><span>Short length</span><div><select value={lengthMode} onChange={(event) => changeLength(event.target.value as LengthMode)}>{Object.entries(lengthProfiles).map(([value, profile]) => <option value={value} key={value}>{profile.label}</option>)}</select></div></label></> : <div className="shorts-no-model">No AI provider connected. <Link href="/studio/settings">Add one in Settings →</Link></div>}
          </div>
          <div className="shorts-policy"><div><span>VISUAL POLICY</span><strong>Strict modesty · Always on</strong></div><div><span>AUDIO POLICY</span><strong>Faith-safe sound · Always on</strong></div><p>These two creator policies are permanently protected for every Short.</p></div>
          <details className="shorts-direction"><summary><span>Optional: special direction for Short {activeSlot}</span><small>Usually leave this closed</small></summary><textarea value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="Example: Focus on the worker's final decision, but do not repeat Short 1." /></details>
          {error && <div className="shorts-message error"><span>!</span><p>{error}</p></div>}{notice && <div className="shorts-message success"><span>✓</span><p>{notice}</p></div>}
          <footer><div><strong>{!handoffReady ? 'Final Description required' : !priorSlotReady ? `Short ${activeSlot - 1} must be completed first` : activePackage ? `Short ${activeSlot} is safely saved` : `Short ${activeSlot} is ready to build`}</strong><span>{lengthProfiles[lengthMode].detail} Existing work changes only after a complete result passes every check.</span></div><button type="button" disabled={loading || !handoffReady || !priorSlotReady || !activeModel} onClick={() => void buildShort()}>{loading ? <><i className="shorts-spinner" /> Building one complete Short…</> : <>{activePackage ? `Rebuild Short ${activeSlot}` : `Create Short ${activeSlot}`} <b>→</b></>}</button></footer>
        </section>

        {shortsRecord && !workspaceCurrent && <div className="shorts-stale">The Final Script or Description changed. Earlier Shorts are preserved, but create fresh versions before publishing.</div>}

        {activePackage ? <>
          <section className="shorts-result"><header><div><p>SHORT {activeSlot} · COMPLETE PACKAGE</p><h2>{activePackage.upload.title}</h2><span>{activePackage.angle}</span></div><div><b>{formatTime(activePackage.durationSeconds)}</b><button type="button" onClick={downloadPackage}>Download backup</button></div></header><div className="shorts-result-grid"><article><span>First-second hook</span><p>{activePackage.story.hook}</p></article><article><span>Payoff</span><p>{activePackage.story.payoff}</p></article><article><span>Why it is different</span><p>{activePackage.differenceFromEarlier}</p></article><article><span>Full-video bridge</span><p>{activePackage.story.fullVideoBridge}</p></article></div></section>

          <section className="shorts-copy"><header><div><p>UPLOAD &amp; VOICEOVER</p><h2>Copy-ready essentials</h2></div><span>No links · no hashtag block · no copyrighted track name</span></header><div><article><span>SHORT TITLE</span><strong>{activePackage.upload.title}</strong><button type="button" disabled={!workspaceCurrent} onClick={() => copyText(activePackage.upload.title, `Short ${activeSlot} title copied.`)}>Copy title</button></article><article><span>SHORT DESCRIPTION</span><p>{activePackage.upload.description}</p><button type="button" disabled={!workspaceCurrent} onClick={() => copyText(activePackage.upload.description, `Short ${activeSlot} description copied.`)}>Copy description</button></article><article className="voiceover"><span>FULL VOICEOVER</span><p>{fullVoiceover}</p><button type="button" disabled={!workspaceCurrent} onClick={() => copyText(fullVoiceover, `Short ${activeSlot} voiceover copied.`)}>Copy voiceover</button></article></div></section>

          <section className="shorts-cover"><header><div><p>SHORT COVER</p><h2>9:16 channel-ready thumbnail</h2><span>Designed for channel, search and branding while the opening frame still carries the feed hook.</span></div><b>2160 × 3840</b></header><div><span>EXACT COVER TEXT</span><strong>{activePackage.cover.headline}</strong><p>{activePackage.cover.prompt}</p><button type="button" disabled={!workspaceCurrent} onClick={() => copyText(activePackage.cover.prompt, `Short ${activeSlot} cover prompt copied.`)}>Copy cover prompt</button></div></section>

          <section className="shorts-timeline"><header><div><p>VERTICAL PRODUCTION TIMELINE</p><h2>{activePackage.timeline.length} dialogue-matched shots</h2><span>Every row tells you what is heard, shown and written at that exact moment.</span></div><b>9:16 · {formatTime(activePackage.durationSeconds)}</b></header><div>{activePackage.timeline.map((clip) => <article key={clip.id}><header><span>{clip.id}</span><strong>{formatTime(clip.startSeconds)}–{formatTime(clip.endSeconds)}</strong><b>{visualLabel(clip.visualType)}</b></header><div><span>VOICEOVER</span><p>{clip.spokenText}</p></div><div><span>ON-SCREEN TEXT</span><p>{clip.onScreenText || 'No text — let the image breathe.'}</p></div><div className="prompt"><span>VERTICAL VISUAL PROMPT</span><p>{clip.visualPrompt}</p><button type="button" onClick={() => copyText(clip.visualPrompt, `${clip.id} visual prompt copied.`)}>Copy prompt</button></div>{clip.sfxSearch && <div><span>OPTIONAL SFX SEARCH</span><p>{clip.sfxSearch}</p></div>}</article>)}</div></section>

          <section className="shorts-audio"><header><div><p>FAITH-SAFE BACKGROUND SOUND</p><h2>{activePackage.audioZones.length} simple timeline section{activePackage.audioZones.length === 1 ? '' : 's'}</h2><span>No music: only useful ambience, practical effects or silence. Apply the exact CapCut values.</span></div><b>{activePackage.settings.audioMode === 'faith_safe' ? 'Faith-safe' : 'Copyright-safe'}</b></header><div>{activePackage.audioZones.map((zone, index) => <article key={`${zone.startSeconds}-${index}`}><div><span>{formatTime(zone.startSeconds)}–{formatTime(zone.endSeconds)}</span><strong>{zone.soundType === 'silence' ? 'Silence' : zone.searchQuery}</strong><small>{sourceLabel(zone.source)}</small></div><dl><div><dt>Volume</dt><dd>{zone.volumeDb === null ? 'No audio' : `${zone.volumeDb} dB`}</dd></div><div><dt>Fade in</dt><dd>{zone.fadeInSeconds}s</dd></div><div><dt>Fade out</dt><dd>{zone.fadeOutSeconds}s</dd></div></dl></article>)}</div></section>

          <section className="shorts-publish"><div><span>AFTER UPLOAD</span><strong>Add the original documentary as Related Video</strong><p>In YouTube Studio, open this Short and select the long video under Related Video. This creates the official clickable path to the full story.</p></div>{activeSlot < 3 && <button type="button" onClick={() => { setActiveSlot((activeSlot + 1) as ShortSlot); setDirection(''); setError(''); setNotice(''); }}>Prepare optional Short {activeSlot + 1} <b>→</b></button>}</section>
        </> : <section className="shorts-empty"><div>{activeSlot}</div><p>OPTIONAL SHORT {activeSlot} IS EMPTY</p><h2>{priorSlotReady ? `Build the strongest available Short ${activeSlot}.` : `Complete Short ${activeSlot - 1} first.`}</h2><span>{priorSlotReady ? 'One click creates its story, title, description, voiceover, dialogue-matched visuals, captions and background audio—without touching the other slots.' : 'The next Short needs the earlier finished angle so it can avoid repetition.'}</span></section>}

        <footer className="shorts-footer"><Link href="/studio/description"><span>Previous section</span><strong>← Description</strong></Link><div><span>Saved optional Shorts</span><strong>{shorts.slots.filter(Boolean).length} · up to 3</strong></div><p>This is the final Studio section. Publish only the Shorts you genuinely want to use.</p></footer>
      </div>
    </section>
  </main>;
}