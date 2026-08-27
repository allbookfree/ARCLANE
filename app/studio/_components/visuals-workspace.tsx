'use client';

import { jsonrepair } from 'jsonrepair';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StudioStageId } from '../_lib/stages';
import { studioNavigate } from '../_lib/navigation';
import ScriptDocumentView, { getScriptSignals, getSpokenScriptText } from './script-document-view';
import StudioSidebar from './studio-sidebar';

type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'custom';
type AuthMethod = 'bearer' | 'api-key';
type VoiceProfile = 'universal' | 'advanced';
type VisualAsset = 'ai_video' | 'archive_or_artifact' | 'map_or_diagram' | 'stock_footage' | 'ai_still_motion';
type VisualDurationMode = 'auto' | 'custom';
type VisualModestyMode = 'evidence_led' | 'strict';
type VisualDurationSettings = { mode: VisualDurationMode; targetSeconds: number | null; label: string };

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
  region?: string;
  period?: string;
  everydayLens?: string;
};
type ScriptReview = {
  originalContent: string;
  status: 'pending' | 'approved';
  reviewedAt?: string;
};
type StageRecord = {
  content: string;
  providerName: string;
  modelName: string;
  updatedAt: string;
  scriptReview?: ScriptReview;
  voiceProfile?: VoiceProfile;
  sourceScriptUpdatedAt?: string;
  sourceVoiceoverUpdatedAt?: string;
  visualModestyMode?: VisualModestyMode;
};
type WorkflowState = {
  selectedIdea?: Idea;
  stages: Partial<Record<StudioStageId, StageRecord>>;
};
type ModelPreference = { providerId: ProviderId; modelId: string };

type ClipManifestItem = {
  clipId: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  narration: string;
};
type VisualStrategy = {
  primaryStyle: string;
  approach: string;
  palette: string;
  cameraLanguage: string;
  archiveRule: string;
  disclosureNote: string;
  evidenceLocks: string[];
  modestyRule: string;
  continuityRules: string[];
};
type CharacterLock = {
  id: string;
  name: string;
  role: string;
  firstClipId: string;
  identityLock: string;
  referencePrompt: string;
};
type VisualScene = {
  sceneId: string;
  asset: VisualAsset;
  shot: string;
  prompt: string;
  search: string[];
  note: string;
};
type VisualTimelineEntry = ClipManifestItem & {
  sceneId: string;
  direction: string;
  firstUse: boolean;
};
type VisualPlan = {
  version: 'ARCLANE_VISUAL_PLAN_2026_08_V2';
  duration: VisualDurationSettings;
  strategy: VisualStrategy;
  characters: CharacterLock[];
  scenes: VisualScene[];
  timeline: VisualTimelineEntry[];
};
type VisualBuildPartial = {
  batchIndex: number;
  parts: VisualPlan[];
};
type VisualBuildProgress = {
  version: 2;
  signature: string;
  totalBatches: number;
  batches: VisualPlan[];
  partial?: VisualBuildPartial;
  updatedAt: string;
};

const connectionStorageKey = 'arclane.model-connections.v1';
const workflowStorageKey = 'arclane.creator-workflow.v1';
const modelPreferenceKey = 'arclane.workflow-models.v1';
const visualDurationPreferenceKey = 'arclane.visual-duration.v1';
const visualModestyPreferenceKey = 'arclane.visual-modesty.v1';
const visualProgressStorageKey = 'arclane.visual-build-progress.v1';
const connectionChangeEvent = 'arclane:model-connections-changed';
const initialWorkflow: WorkflowState = { stages: {} };
const visualPlanVersion = 'ARCLANE_VISUAL_PLAN_2026_08_V2' as const;
const visualBuildProtocol = 'ARCLANE_VISUAL_BUILD_2026_08_V6' as const;
const visualBatchSize = 28;
const visualRecoveryMinClips = 4;
const visualRecoveryMaxPasses = 8;
const strictModestySafeguard = 'Strict modesty lock: if any woman or girl appears, her hair, neck, chest, arms and legs must be fully covered by loose opaque clothing with dignified non-body-emphasizing framing; if that would materially misrepresent the historical record, use a respectful non-identifying or alternative visual instead.';
const allowedAssets = new Set<VisualAsset>([
  'ai_video', 'archive_or_artifact', 'map_or_diagram', 'stock_footage', 'ai_still_motion',
]);

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
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringList(value: unknown, limit = 12) {
  return Array.isArray(value)
    ? value.map(stringValue).filter(Boolean).slice(0, limit)
    : [];
}

function normalizeDurationPreference(value: unknown): { mode: VisualDurationMode; customSeconds: number } {
  const candidate = asRecord(value);
  const mode: VisualDurationMode = candidate.mode === 'custom' ? 'custom' : 'auto';
  const rawSeconds = typeof candidate.customSeconds === 'number' ? candidate.customSeconds : 10;
  return { mode, customSeconds: Math.max(3, Math.min(120, Math.round(rawSeconds))) };
}

function normalizeModestyPreference(value: unknown): VisualModestyMode {
  return asRecord(value).mode === 'strict' ? 'strict' : 'evidence_led';
}

function enforceStrictModesty(value: string, strict: boolean) {
  if (!strict || !value || value.includes('Strict modesty lock:')) return value;
  return `${value} ${strictModestySafeguard}`;
}

function durationSettings(mode: VisualDurationMode, customSeconds: number): VisualDurationSettings {
  return mode === 'custom'
    ? { mode, targetSeconds: customSeconds, label: `Up to ${customSeconds}s per visual asset` }
    : { mode, targetSeconds: null, label: 'Automatic 6–8s visual beats' };
}
function providerMark(providerId: ProviderId) {
  if (providerId === 'openai') return 'O';
  if (providerId === 'anthropic') return 'A';
  if (providerId === 'gemini') return 'G';
  return '+';
}

function cleanSpokenVoiceover(content: string) {
  return content
    .replace(/^\s*```(?:markdown|md|text)?\s*$/gim, '')
    .replace(/^\s*```\s*$/gm, '')
    .replace(/\[[^\]\r\n]{1,100}\]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_`#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function boundaryScore(token: string, distance: number) {
  const end = token.match(/[.!?][\"'”’)]*$/) ? 9
    : token.match(/[;:][\"'”’)]*$/) ? 6
      : token.match(/,[\"'”’)]*$/) ? 3 : 0;
  return end - distance;
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - (minutes * 60);
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(1).padStart(4, '0')}`;
}

function buildClipManifest(voiceover: string, targetSeconds: number | null = null): ClipManifestItem[] {
  const narration = cleanSpokenVoiceover(voiceover);
  if (!narration) return [];
  const words = narration.split(/\s+/).filter(Boolean);
  const wordsPerSecond = 2.45;
  const automatic = targetSeconds === null;
  const maxWords = automatic ? 24 : Math.max(3, Math.floor(targetSeconds * wordsPerSecond));
  const clipCount = automatic
    ? Math.max(1, Math.round(words.length / 18))
    : Math.max(1, Math.ceil(words.length / maxWords));
  const groups: string[][] = [];
  let cursor = 0;

  for (let index = 0; index < clipCount; index += 1) {
    const remaining = words.length - cursor;
    const groupsLeft = clipCount - index;
    if (groupsLeft === 1) {
      groups.push(words.slice(cursor));
      break;
    }

    const balancedIdeal = Math.max(1, Math.round(remaining / groupsLeft));
    const ideal = automatic ? Math.max(12, Math.min(22, balancedIdeal)) : Math.min(maxWords, balancedIdeal);
    const radius = automatic ? 4 : Math.max(3, Math.round(ideal * 0.2));
    const minSize = automatic ? Math.max(10, ideal - radius) : Math.max(1, ideal - radius);
    const maxSize = automatic
      ? Math.min(24, ideal + radius, remaining - ((groupsLeft - 1) * 10))
      : Math.min(maxWords, ideal + radius, remaining - (groupsLeft - 1));
    let chosen = Math.max(minSize, Math.min(ideal, maxSize));
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let size = minSize; size <= maxSize; size += 1) {
      const token = words[cursor + size - 1] ?? '';
      const score = boundaryScore(token, Math.abs(size - ideal));
      if (score > bestScore) {
        bestScore = score;
        chosen = size;
      }
    }
    groups.push(words.slice(cursor, cursor + chosen));
    cursor += chosen;
  }

  let elapsed = 0;
  return groups.filter((group) => group.length).map((group, index) => {
    const spokenDuration = Math.round((group.length / wordsPerSecond) * 10) / 10;
    const durationSeconds = automatic
      ? Math.max(6, Math.min(8, spokenDuration))
      : Math.max(1, Math.min(targetSeconds, spokenDuration));
    const startSeconds = Math.round(elapsed * 10) / 10;
    elapsed = Math.round((elapsed + durationSeconds) * 10) / 10;
    return {
      clipId: `CLIP-${String(index + 1).padStart(3, '0')}`,
      startSeconds,
      endSeconds: elapsed,
      durationSeconds,
      narration: group.join(' '),
    };
  });
}
function parseJsonObject(content: string) {
  const unfenced = content
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The AI did not return the simple Visual Plan structure. Nothing was replaced; try again or choose another model.');
  const candidate = unfenced.slice(start, end + 1);
  try {
    return asRecord(JSON.parse(candidate) as unknown);
  } catch {
    try {
      const repaired = jsonrepair(candidate);
      return asRecord(JSON.parse(repaired) as unknown);
    } catch {
      throw new Error('The AI response was incomplete or too damaged to read safely. Your previous work is unchanged; try again or choose another model.');
    }
  }
}

function normalizeStrategy(value: unknown): VisualStrategy {
  const strategy = asRecord(value);
  return {
    primaryStyle: stringValue(strategy.primaryStyle) || 'Grounded cinematic reconstruction',
    approach: stringValue(strategy.approach) || 'Use cinematic reconstruction for lived experience and real historical evidence whenever it explains the story better.',
    palette: stringValue(strategy.palette) || 'Evidence-led period colour, natural contrast and one coherent documentary grade.',
    cameraLanguage: stringValue(strategy.cameraLanguage) || 'Human-scale observational frames, motivated movement and clear geography.',
    archiveRule: stringValue(strategy.archiveRule) || 'Never present an AI reconstruction as archival evidence; verify the rights of every real asset before use.',
    disclosureNote: stringValue(strategy.disclosureNote) || 'Disclose realistic synthetic historical reconstructions when required by YouTube.',
    evidenceLocks: stringList(strategy.evidenceLocks, 12),
    modestyRule: stringValue(strategy.modestyRule) || 'Use dignified, non-sexualized and modest depiction; prefer loose opaque full-coverage clothing and a head covering when historically plausible, and use respectful non-identifying framing or alternative imagery when accurate clothing would otherwise conflict with this standard.',
    continuityRules: stringList(strategy.continuityRules, 8),
  };
}

function normalizeCharacters(value: unknown, strictModesty = false): CharacterLock[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const character = asRecord(entry);
    return {
      id: stringValue(character.id) || `CHAR-${String(index + 1).padStart(2, '0')}`,
      name: stringValue(character.name) || `Recurring person ${index + 1}`,
      role: stringValue(character.role),
      firstClipId: stringValue(character.firstClipId),
      identityLock: enforceStrictModesty(stringValue(character.identityLock), strictModesty),
      referencePrompt: enforceStrictModesty(stringValue(character.referencePrompt), strictModesty),
    };
  }).filter((character) => character.identityLock && character.referencePrompt).slice(0, 8);
}

function parseModelVisualPlan(content: string, manifest: ClipManifestItem[], duration: VisualDurationSettings, modestyMode: VisualModestyMode, allowPartial = false): VisualPlan {
  const root = parseJsonObject(content);
  const strictModesty = modestyMode === 'strict';
  const rawScenes = Array.isArray(root.scenes) ? root.scenes : [];
  const scenes: VisualScene[] = [];
  const sceneIds = new Set<string>();

  for (const value of rawScenes) {
    const raw = asRecord(value);
    const sceneId = stringValue(raw.sceneId);
    const rawAsset = stringValue(raw.asset) as VisualAsset;
    const scene: VisualScene = {
      sceneId,
      asset: allowedAssets.has(rawAsset) ? rawAsset : 'ai_video',
      shot: stringValue(raw.shot),
      prompt: enforceStrictModesty(stringValue(raw.prompt), strictModesty),
      search: stringList(raw.search, 2),
      note: stringValue(raw.note),
    };
    if (!sceneId || sceneIds.has(sceneId)) throw new Error('The model returned duplicate or unnamed Scene Library items. Nothing was replaced; try again or choose another model.');
    if (!scene.shot || !scene.prompt || scene.search.length !== 2) throw new Error(`The model returned an incomplete production prompt for ${sceneId}. Nothing was replaced.`);
    sceneIds.add(sceneId);
    scenes.push(scene);
  }
  if (!scenes.length) throw new Error('The model did not return a usable Scene Library. Nothing was replaced.');

  const rawTimeline = Array.isArray(root.timeline) ? root.timeline : [];
  const byClipId = new Map<string, Record<string, unknown>>();
  for (const value of rawTimeline) {
    const entry = asRecord(value);
    const clipId = stringValue(entry.clipId);
    if (!clipId || byClipId.has(clipId)) throw new Error('The model duplicated or omitted Timeline clip IDs. Nothing was replaced; try again or choose another model.');
    byClipId.set(clipId, entry);
  }

  const manifestIds = new Set(manifest.map((item) => item.clipId));
  const missing = manifest.filter((item) => !byClipId.has(item.clipId));
  const unexpected = [...byClipId.keys()].filter((clipId) => !manifestIds.has(clipId));
  if (unexpected.length || rawTimeline.length !== byClipId.size || (!allowPartial && missing.length)) {
    throw new Error(`The model did not map the complete Voiceover (${missing.length} missing, ${unexpected.length} unexpected timeline clips). Nothing was replaced; try a model with a larger output limit.`);
  }
  if (allowPartial && !byClipId.size) {
    throw new Error('The model returned no usable Timeline clips. No saved work changed; try another model.');
  }
  const mappedManifest = allowPartial ? manifest.filter((item) => byClipId.has(item.clipId)) : manifest;

  const seenScenes = new Set<string>();
  const usage = new Map<string, number>();
  let previousSceneId = '';
  const timeline = mappedManifest.map((item) => {
    const raw = byClipId.get(item.clipId)!;
    let sceneId = stringValue(raw.sceneId);
    let direction = stringValue(raw.direction);
    if (!sceneIds.has(sceneId)) throw new Error(`${item.clipId} points to an unknown Scene Library item (${sceneId || 'missing'}). Nothing was replaced.`);
    if (!direction) throw new Error(`The model omitted the visual-use direction for ${item.clipId}. Nothing was replaced.`);

    const reuseCount = usage.get(sceneId) ?? 0;
    const needsDistinctVariant = previousSceneId === sceneId || reuseCount >= 3;
    if (needsDistinctVariant) {
      const sourceScene = scenes.find((scene) => scene.sceneId === sceneId)!;
      let variantNumber = scenes.length + 1;
      let variantId = 'SCENE-' + String(variantNumber).padStart(3, '0');
      while (sceneIds.has(variantId)) {
        variantNumber += 1;
        variantId = 'SCENE-' + String(variantNumber).padStart(3, '0');
      }
      const reason = previousSceneId === sceneId
        ? 'the immediately following narration beat'
        : 'an additional later use beyond the safe reuse limit';
      scenes.push({
        ...sourceScene,
        sceneId: variantId,
        shot: 'Distinct continuity-matched alternate for ' + item.clipId + ': ' + sourceScene.shot,
        prompt: 'Create a genuinely distinct continuity-matched alternate shot for ' + reason
          + '. Preserve the same evidence-supported period, place, identity locks, palette and material culture, but change the composition, shot scale, camera position and executable motion so no frames are repeated. '
          + sourceScene.prompt,
        note: (sourceScene.note ? sourceScene.note + ' ' : '')
          + 'This alternate was separated automatically to prevent visible repetition while preserving continuity.',
      });
      sceneIds.add(variantId);
      sceneId = variantId;
      direction = 'Create as a distinct continuity-matched alternate; '
        + direction.replace(/^Reuse\s*:?\s*/i, '');
    }

    const count = (usage.get(sceneId) ?? 0) + 1;
    usage.set(sceneId, count);
    const firstUse = !seenScenes.has(sceneId);
    seenScenes.add(sceneId);
    previousSceneId = sceneId;
    return { ...item, sceneId, direction, firstUse } satisfies VisualTimelineEntry;
  });

  const strategy = normalizeStrategy(root.strategy);
  if (strictModesty) strategy.modestyRule = strictModestySafeguard;

  return {
    version: visualPlanVersion,
    duration,
    strategy,
    characters: normalizeCharacters(root.characters, strictModesty),
    scenes: scenes.filter((scene) => usage.has(scene.sceneId)),
    timeline,
  };
}

function splitVisualManifest(manifest: ClipManifestItem[]) {
  const batches: ClipManifestItem[][] = [];
  for (let index = 0; index < manifest.length; index += visualBatchSize) {
    batches.push(manifest.slice(index, index + visualBatchSize));
  }
  return batches;
}

function visualBuildSignature(
  scriptUpdatedAt: string | undefined,
  voiceUpdatedAt: string | undefined,
  duration: VisualDurationSettings,
  modestyMode: VisualModestyMode,
  manifest: ClipManifestItem[],
) {
  const first = manifest[0];
  const last = manifest.at(-1);
  return [
    visualBuildProtocol,
    visualPlanVersion,
    scriptUpdatedAt ?? '',
    voiceUpdatedAt ?? '',
    duration.mode,
    duration.targetSeconds ?? 'auto',
    modestyMode,
    manifest.length,
    first?.narration ?? '',
    last?.narration ?? '',
  ].join('|');
}

function replaceKnownIds(value: string, replacements: Map<string, string>) {
  let next = value;
  for (const [source, target] of replacements) next = next.split(source).join(target);
  return next;
}

function mergeVisualBatches(
  plans: VisualPlan[],
  manifest: ClipManifestItem[],
  duration: VisualDurationSettings,
): VisualPlan {
  if (!plans.length) throw new Error('No saved Visual Plan batches were available to merge.');

  const scenes: VisualScene[] = [];
  const characters: CharacterLock[] = [];
  const characterIdentityIds = new Map<string, string>();
  const timelineParts: Array<Pick<VisualTimelineEntry, 'clipId' | 'sceneId' | 'direction'>> = [];
  let nextSceneNumber = 1;
  let nextCharacterNumber = 1;

  for (const plan of plans) {
    const characterIds = new Map<string, string>();
    for (const character of plan.characters) {
      const identityKey = character.identityLock.trim().toLowerCase();
      const existingId = identityKey ? characterIdentityIds.get(identityKey) : undefined;
      const globalId = existingId ?? ('CHAR-' + String(nextCharacterNumber).padStart(3, '0'));
      characterIds.set(character.id, globalId);
      if (!existingId) {
        nextCharacterNumber += 1;
        if (identityKey) characterIdentityIds.set(identityKey, globalId);
        characters.push({ ...character, id: globalId });
      }
    }

    const sceneIds = new Map<string, string>();
    for (const scene of plan.scenes) {
      const globalId = 'SCENE-' + String(nextSceneNumber).padStart(3, '0');
      nextSceneNumber += 1;
      sceneIds.set(scene.sceneId, globalId);
      scenes.push({
        ...scene,
        sceneId: globalId,
        shot: replaceKnownIds(scene.shot, characterIds),
        prompt: replaceKnownIds(scene.prompt, characterIds),
        note: replaceKnownIds(scene.note, characterIds),
      });
    }

    for (const entry of plan.timeline) {
      const globalSceneId = sceneIds.get(entry.sceneId);
      if (!globalSceneId) throw new Error(entry.clipId + ' lost its Scene Library reference while saved batches were merged.');
      timelineParts.push({
        clipId: entry.clipId,
        sceneId: globalSceneId,
        direction: replaceKnownIds(entry.direction, characterIds),
      });
    }
  }

  const manifestIds = new Set(manifest.map((item) => item.clipId));
  const byClipId = new Map<string, (typeof timelineParts)[number]>();
  for (const entry of timelineParts) {
    if (!manifestIds.has(entry.clipId) || byClipId.has(entry.clipId)) {
      throw new Error('Saved Visual Plan batches overlapped or contained an unexpected clip. Nothing was replaced.');
    }
    byClipId.set(entry.clipId, entry);
  }
  if (byClipId.size !== manifest.length) {
    throw new Error('Only ' + byClipId.size + ' of ' + manifest.length + ' Visual timeline clips were saved. Resume the protected build to finish the rest.');
  }

  const seenScenes = new Set<string>();
  const usage = new Map<string, number>();
  const timeline = manifest.map((item) => {
    const saved = byClipId.get(item.clipId)!;
    const count = (usage.get(saved.sceneId) ?? 0) + 1;
    if (count > 3) throw new Error(saved.sceneId + ' was reused more than three times while batches were merged.');
    usage.set(saved.sceneId, count);
    const firstUse = !seenScenes.has(saved.sceneId);
    seenScenes.add(saved.sceneId);
    return { ...item, sceneId: saved.sceneId, direction: saved.direction, firstUse } satisfies VisualTimelineEntry;
  });

  return {
    version: visualPlanVersion,
    duration,
    strategy: plans[0]!.strategy,
    characters,
    scenes: scenes.filter((scene) => usage.has(scene.sceneId)),
    timeline,
  };
}

function readVisualBuildProgress(signature: string, totalBatches: number): VisualBuildProgress | null {
  const root = asRecord(readJson<unknown>(visualProgressStorageKey, null));
  const rawBatches = Array.isArray(root.batches) ? root.batches : [];
  const isPlan = (value: unknown): value is VisualPlan => {
    const plan = asRecord(value);
    return plan.version === visualPlanVersion && Array.isArray(plan.scenes) && Array.isArray(plan.timeline);
  };
  const batches = rawBatches.filter(isPlan);
  if ((root.version !== 1 && root.version !== 2) || root.signature !== signature || root.totalBatches !== totalBatches) return null;
  if (batches.length !== rawBatches.length || batches.length > totalBatches) return null;

  let partial: VisualBuildPartial | undefined;
  if (root.version === 2 && root.partial !== undefined) {
    const rawPartial = asRecord(root.partial);
    const rawParts = Array.isArray(rawPartial.parts) ? rawPartial.parts : [];
    const parts = rawParts.filter(isPlan);
    const batchIndex = typeof rawPartial.batchIndex === 'number' ? Math.trunc(rawPartial.batchIndex) : -1;
    if (
      batchIndex < 0
      || batchIndex >= totalBatches
      || batchIndex !== batches.length
      || !parts.length
      || parts.length !== rawParts.length
    ) return null;
    partial = { batchIndex, parts };
  }

  return {
    version: 2,
    signature,
    totalBatches,
    batches,
    partial,
    updatedAt: typeof root.updatedAt === 'string' ? root.updatedAt : '',
  };
}
function readSavedPlan(content: string): VisualPlan | null {
  try {
    const root = parseJsonObject(content);
    if (root.version !== visualPlanVersion || !Array.isArray(root.scenes) || !Array.isArray(root.timeline)) return null;
    const rawDuration = asRecord(root.duration);
    const savedMode: VisualDurationMode = rawDuration.mode === 'custom' ? 'custom' : 'auto';
    const savedTarget = savedMode === 'custom' && typeof rawDuration.targetSeconds === 'number'
      ? Math.max(3, Math.min(120, Math.round(rawDuration.targetSeconds)))
      : null;
    const duration = durationSettings(savedMode, savedTarget ?? 10);
    const scenes = root.scenes.map((value) => {
      const scene = asRecord(value);
      const asset = stringValue(scene.asset) as VisualAsset;
      return {
        sceneId: stringValue(scene.sceneId),
        asset: allowedAssets.has(asset) ? asset : 'ai_video',
        shot: stringValue(scene.shot),
        prompt: stringValue(scene.prompt),
        search: stringList(scene.search, 2),
        note: stringValue(scene.note),
      } satisfies VisualScene;
    });
    const timeline = root.timeline.map((value) => {
      const entry = asRecord(value);
      return {
        clipId: stringValue(entry.clipId),
        startSeconds: Number(entry.startSeconds),
        endSeconds: Number(entry.endSeconds),
        durationSeconds: Number(entry.durationSeconds),
        narration: stringValue(entry.narration),
        sceneId: stringValue(entry.sceneId),
        direction: stringValue(entry.direction),
        firstUse: entry.firstUse === true,
      } satisfies VisualTimelineEntry;
    });
    const sceneIds = new Set(scenes.map((scene) => scene.sceneId));
    if (!scenes.length || !timeline.length || scenes.some((scene) => !scene.sceneId || !scene.prompt || scene.search.length !== 2)) return null;
    if (timeline.some((entry) => !entry.clipId || !entry.narration || !entry.direction || !sceneIds.has(entry.sceneId))) return null;
    return {
      version: visualPlanVersion,
      duration,
      strategy: normalizeStrategy(root.strategy),
      characters: normalizeCharacters(root.characters),
      scenes,
      timeline,
    };
  } catch {
    return null;
  }
}
function assetLabel(asset: VisualAsset) {
  if (asset === 'archive_or_artifact') return 'Archive / object';
  if (asset === 'map_or_diagram') return 'Map / diagram';
  if (asset === 'stock_footage') return 'Stock footage';
  if (asset === 'ai_still_motion') return 'AI still + motion';
  return 'AI video';
}

function sourceHints(asset: VisualAsset) {
  if (asset === 'stock_footage') return ['Pexels', 'Pixabay'];
  if (asset === 'archive_or_artifact') return ['Wikimedia Commons', 'Europeana', 'Library of Congress'];
  if (asset === 'map_or_diagram') return ['Wikimedia Commons', 'Library of Congress'];
  return [];
}

export default function VisualsWorkspace() {
  const [hydrated, setHydrated] = useState(false);
  const [connections, setConnections] = useState<Selection[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowState>(initialWorkflow);
  const [providerId, setProviderId] = useState<ProviderId | ''>('');
  const [modelId, setModelId] = useState('');
  const [direction, setDirection] = useState('');
  const [durationMode, setDurationMode] = useState<VisualDurationMode>('auto');
  const [customDurationSeconds, setCustomDurationSeconds] = useState(10);
  const [modestyMode, setModestyMode] = useState<VisualModestyMode>('evidence_led');
  const [scriptOpen, setScriptOpen] = useState(false);
  const [visibleScenes, setVisibleScenes] = useState(8);
  const [visibleClips, setVisibleClips] = useState(10);
  const [loading, setLoading] = useState(false);
  const [buildStatus, setBuildStatus] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const scriptRecord = workflow.stages.scripts;
  const voiceRecord = workflow.stages.voiceover;
  const visualsRecord = workflow.stages.visuals;
  const selectedIdea = workflow.selectedIdea;
  const scriptFinal = Boolean(scriptRecord?.content.trim() && scriptRecord.scriptReview?.status === 'approved');
  const voiceCurrent = Boolean(
    voiceRecord?.content.trim()
    && voiceRecord.sourceScriptUpdatedAt
    && voiceRecord.sourceScriptUpdatedAt === scriptRecord?.updatedAt,
  );
  const handoffReady = scriptFinal && voiceCurrent;
  const activeConnection = connections.find((item) => item.providerId === providerId);
  const activeModel = activeConnection?.models.find((model) => model.id === modelId);
  const scriptSignals = useMemo(() => getScriptSignals(scriptRecord?.content ?? ''), [scriptRecord?.content]);
  const currentDuration = useMemo(
    () => durationSettings(durationMode, customDurationSeconds),
    [customDurationSeconds, durationMode],
  );
  const manifest = useMemo(
    () => buildClipManifest(voiceRecord?.content ?? '', currentDuration.targetSeconds),
    [currentDuration.targetSeconds, voiceRecord?.content],
  );
  const visualPlan = useMemo(() => readSavedPlan(visualsRecord?.content ?? ''), [visualsRecord?.content]);
  const sceneUsage = useMemo(() => {
    if (!visualPlan) return [];

    const firstClipByScene = new Map<string, string>();
    const clipsByScene = new Map<string, string[]>();

    for (const clip of visualPlan.timeline) {
      if (!firstClipByScene.has(clip.sceneId)) firstClipByScene.set(clip.sceneId, clip.clipId);
      clipsByScene.set(clip.sceneId, [...(clipsByScene.get(clip.sceneId) ?? []), clip.clipId]);
    }

    return visualPlan.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      firstClipId: firstClipByScene.get(scene.sceneId) ?? '',
      clipIds: clipsByScene.get(scene.sceneId) ?? [],
    }));
  }, [visualPlan]);
  const reuseGuide = useMemo(() => {
    if (!visualPlan) return [];

    const firstClipByScene = new Map(sceneUsage.map((usage) => [usage.sceneId, usage.firstClipId]));
    return visualPlan.timeline
      .map((clip, index) => ({ ...clip, timelineNumber: index + 1, firstClipId: firstClipByScene.get(clip.sceneId) ?? '' }))
      .filter((clip) => !clip.firstUse);
  }, [sceneUsage, visualPlan]);
  const planCurrent = Boolean(
    visualPlan
    && visualsRecord?.sourceScriptUpdatedAt === scriptRecord?.updatedAt
    && visualsRecord?.sourceVoiceoverUpdatedAt === voiceRecord?.updatedAt
    && visualPlan.duration.mode === currentDuration.mode
    && visualPlan.duration.targetSeconds === currentDuration.targetSeconds
    && (visualsRecord?.visualModestyMode ?? 'evidence_led') === modestyMode
    && visualPlan.timeline.length === manifest.length
    && visualPlan.timeline.every((clip, index) => (
      clip.clipId === manifest[index]?.clipId
      && clip.narration === manifest[index]?.narration
      && clip.durationSeconds === manifest[index]?.durationSeconds
    )),
  );
  const estimatedDuration = manifest.at(-1)?.endSeconds ?? 0;
  const scriptPreview = useMemo(() => {
    const text = getSpokenScriptText(scriptRecord?.content ?? '');
    return text.length > 360 ? `${text.slice(0, 360).trim()}…` : text;
  }, [scriptRecord?.content]);

  const persistWorkflow = useCallback((next: WorkflowState) => {
    try {
      window.localStorage.setItem(workflowStorageKey, JSON.stringify(next));
      setWorkflow(next);
      return true;
    } catch {
      setError('This browser could not save the Visual Plan locally. Free some browser storage and try again.');
      return false;
    }
  }, []);

  const savePreference = useCallback((nextProviderId: ProviderId, nextModelId: string) => {
    const preferences = readJson<Partial<Record<StudioStageId, ModelPreference>>>(modelPreferenceKey, {});
    preferences.visuals = { providerId: nextProviderId, modelId: nextModelId };
    window.localStorage.setItem(modelPreferenceKey, JSON.stringify(preferences));
  }, []);

  useEffect(() => {
    const refreshConnections = () => setConnections(readConnections());
    const available = readConnections();
    const savedWorkflow = readJson<WorkflowState>(workflowStorageKey, initialWorkflow);
    const preference = readJson<Partial<Record<StudioStageId, ModelPreference>>>(modelPreferenceKey, {}).visuals;
    const savedDuration = normalizeDurationPreference(readJson<unknown>(visualDurationPreferenceKey, {}));
    const savedModestyMode = normalizeModestyPreference(readJson<unknown>(visualModestyPreferenceKey, {}));
    const preferredConnection = available.find((item) => item.providerId === preference?.providerId);
    const firstConnection = preferredConnection ?? available[0];
    const preferredModel = firstConnection?.models.find((model) => model.id === preference?.modelId);
    const firstModel = preferredModel ?? firstConnection?.models[0];

    // Local browser storage is the external source for this client-only workspace.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnections(available);
    setWorkflow(savedWorkflow);
    setDurationMode(savedDuration.mode);
    setCustomDurationSeconds(savedDuration.customSeconds);
    setModestyMode(savedModestyMode);
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
      // Keep the selector valid if a saved provider connection was removed elsewhere.
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

  function saveDuration(nextMode: VisualDurationMode, nextSeconds: number) {
    const normalizedSeconds = Math.max(3, Math.min(120, Math.round(nextSeconds)));
    setDurationMode(nextMode);
    setCustomDurationSeconds(normalizedSeconds);
    window.localStorage.setItem(visualDurationPreferenceKey, JSON.stringify({ mode: nextMode, customSeconds: normalizedSeconds }));
    setError('');
    setNotice('');
  }
  function saveModestyMode(nextMode: VisualModestyMode) {
    setModestyMode(nextMode);
    window.localStorage.setItem(visualModestyPreferenceKey, JSON.stringify({ mode: nextMode }));
    setError('');
    setNotice(nextMode === 'strict'
      ? 'Strict modesty is on. Build a new Visual Plan to apply it to every scene.'
      : 'Evidence-led modesty is active. Build again only if you want to replace the current plan.');
  }

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

  async function buildVisualPlan() {
    if (loading) return;
    if (!handoffReady || !scriptRecord || !voiceRecord || !manifest.length) {
      setError('Finish the current Final Script and Voiceover before building the Visual Plan.');
      return;
    }
    const connection = connections.find((item) => item.providerId === providerId);
    const model = connection?.models.find((item) => item.id === modelId);
    if (!connection || !model) {
      setError('Connect an AI provider and choose one model before building Visuals.');
      return;
    }

    const manifestBatches = splitVisualManifest(manifest);
    const signature = visualBuildSignature(
      scriptRecord.updatedAt,
      voiceRecord.updatedAt,
      currentDuration,
      modestyMode,
      manifest,
    );
    const savedProgress = readVisualBuildProgress(signature, manifestBatches.length);
    let completedPlans = savedProgress?.batches ?? [];
    let completedBatchCount = completedPlans.length;
    let checkpointedPartialClipCount = savedProgress?.partial?.parts
      .reduce((count, plan) => count + plan.timeline.length, 0) ?? 0;
    const totalBatchCount = manifestBatches.length;
    if (!savedProgress) window.localStorage.removeItem(visualProgressStorageKey);

    setLoading(true);
    setError('');
    setNotice('');
    try {
      for (let batchIndex = completedPlans.length; batchIndex < manifestBatches.length; batchIndex += 1) {
        const batchManifest = manifestBatches[batchIndex]!;
        const batchClipIds = new Set(batchManifest.map((clip) => clip.clipId));
        const candidateParts = savedProgress?.partial?.batchIndex === batchIndex
          ? savedProgress.partial.parts
          : [];
        const resumedClipIds = new Set<string>();
        let resumedPartsSafe = true;
        for (const plan of candidateParts) {
          for (const clip of plan.timeline) {
            if (!batchClipIds.has(clip.clipId) || resumedClipIds.has(clip.clipId)) {
              resumedPartsSafe = false;
              break;
            }
            resumedClipIds.add(clip.clipId);
          }
          if (!resumedPartsSafe) break;
        }
        const recoveredParts: VisualPlan[] = resumedPartsSafe ? [...candidateParts] : [];
        if (!resumedPartsSafe) {
          resumedClipIds.clear();
          checkpointedPartialClipCount = 0;
        }
        let pendingManifest = batchManifest.filter((clip) => !resumedClipIds.has(clip.clipId));
        let requestManifest = recoveredParts.length
          ? pendingManifest.slice(0, Math.min(12, pendingManifest.length))
          : [...batchManifest];
        let requestPass = 0;
        let minimalRetryUsed = false;

        while (pendingManifest.length) {
          requestPass += 1;
          if (requestPass > visualRecoveryMaxPasses) {
            throw new Error('The selected model could not finish this protected part after automatic missing-clip recovery. Saved earlier parts remain safe; choose a model with a larger structured-output capacity.');
          }

          const contextPlans = [...completedPlans, ...recoveredParts];
          const previousPlan = contextPlans.at(-1);
          const previousTimeline = previousPlan?.timeline.at(-1);
          const previousScene = previousTimeline
            ? previousPlan?.scenes.find((scene) => scene.sceneId === previousTimeline.sceneId)
            : undefined;
          const lockedCharacters = Array.from(new Map(
            contextPlans.flatMap((plan) => plan.characters)
              .map((character) => [character.identityLock.trim().toLowerCase(), character] as const),
          ).values()).map((character, index) => ({
            ...character,
            id: 'CHAR-' + String(index + 1).padStart(2, '0'),
          }));
          const lockedBible = contextPlans.length
            ? {
              strategy: contextPlans[0]!.strategy,
              characters: lockedCharacters,
              boundary: previousTimeline && previousScene
                ? {
                  clipId: previousTimeline.clipId,
                  sceneId: previousTimeline.sceneId,
                  direction: previousTimeline.direction,
                  shot: previousScene.shot,
                  prompt: previousScene.prompt,
                }
                : null,
            }
            : null;
          const sourceMode = batchIndex === 0 && recoveredParts.length === 0 ? 'full' : 'locked';
          const firstRequestIndex = manifest.findIndex((item) => item.clipId === requestManifest[0]?.clipId);
          const lastRequestIndex = manifest.findIndex((item) => item.clipId === requestManifest.at(-1)?.clipId);
          setBuildStatus(
            recoveredParts.length
              ? 'Automatic coverage recovery · ' + (batchManifest.length - pendingManifest.length)
                + ' of ' + batchManifest.length + ' clips safely retained in part ' + (batchIndex + 1)
              : 'Building protected part ' + (batchIndex + 1) + ' of ' + totalBatchCount
                + (completedBatchCount ? ' · ' + completedBatchCount + ' already saved' : ''),
          );

          const response = await fetch('/api/automation/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stage: 'visuals',
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
                visualClipManifest: requestManifest,
                visualDuration: currentDuration,
                visualModesty: { mode: modestyMode },
                visualBatch: {
                  index: batchIndex + 1,
                  total: totalBatchCount,
                  sourceMode,
                  repairMode: requestPass > 1,
                  lockedBible,
                  previousClip: firstRequestIndex > 0 ? manifest[firstRequestIndex - 1] ?? null : null,
                  nextClip: lastRequestIndex >= 0 ? manifest[lastRequestIndex + 1] ?? null : null,
                },
                outputs: sourceMode === 'full'
                  ? {
                    research: workflow.stages.research?.content ?? '',
                    scripts: scriptRecord.content,
                  }
                  : {},
              },
            }),
          });
          const result = await response.json() as {
            output?: string;
            error?: string;
            attempts?: number;
            retryAfterSeconds?: number;
            errorCode?: string;
          };
          if (!response.ok || !result.output) {
            throw new Error(result.error || 'The model did not return a usable Visual Plan.');
          }

          let recoveredPlan: VisualPlan;
          try {
            recoveredPlan = parseModelVisualPlan(
              result.output,
              requestManifest,
              currentDuration,
              modestyMode,
              true,
            );
          } catch (parseError) {
            if (requestManifest.length > visualRecoveryMinClips && requestPass < visualRecoveryMaxPasses) {
              const smallerRequestSize = Math.max(visualRecoveryMinClips, Math.ceil(requestManifest.length / 2));
              requestManifest = pendingManifest.slice(0, smallerRequestSize);
              setBuildStatus(
                'The model response was incomplete; retrying the same unsaved clips automatically in a smaller protected request.',
              );
              await new Promise<void>((resolve) => window.setTimeout(resolve, 1800));
              continue;
            }
            if (!minimalRetryUsed && requestPass < visualRecoveryMaxPasses) {
              minimalRetryUsed = true;
              setBuildStatus('The smallest protected request was malformed; retrying it once automatically before stopping.');
              await new Promise<void>((resolve) => window.setTimeout(resolve, 2200));
              continue;
            }
            throw parseError;
          }
          minimalRetryUsed = false;
          const recoveredIds = new Set(recoveredPlan.timeline.map((entry) => entry.clipId));
          recoveredParts.push(recoveredPlan);
          pendingManifest = pendingManifest.filter((item) => !recoveredIds.has(item.clipId));
          checkpointedPartialClipCount = batchManifest.length - pendingManifest.length;

          const partialProgress: VisualBuildProgress = {
            version: 2,
            signature,
            totalBatches: totalBatchCount,
            batches: completedPlans,
            partial: { batchIndex, parts: recoveredParts },
            updatedAt: new Date().toISOString(),
          };
          try {
            window.localStorage.setItem(visualProgressStorageKey, JSON.stringify(partialProgress));
          } catch {
            throw new Error('This browser could not checkpoint the accepted Visual clips safely. Free some browser storage, then resume.');
          }
          if (!pendingManifest.length) break;

          const adaptiveRequestSize = Math.max(visualRecoveryMinClips, Math.min(12, recoveredPlan.timeline.length + 2));
          requestManifest = pendingManifest.slice(0, adaptiveRequestSize);
          setBuildStatus(
            'The model covered ' + recoveredIds.size + ' clips; saving them now and completing the remaining '
            + pendingManifest.length + ' automatically.',
          );
          await new Promise<void>((resolve) => window.setTimeout(resolve, 1800));
        }

        const batchPlan = recoveredParts.length === 1
          ? recoveredParts[0]!
          : mergeVisualBatches(recoveredParts, batchManifest, currentDuration);
        completedPlans = [...completedPlans, batchPlan];
        completedBatchCount = completedPlans.length;
        checkpointedPartialClipCount = 0;
        const progress: VisualBuildProgress = {
          version: 2,
          signature,
          totalBatches: totalBatchCount,
          batches: completedPlans,
          updatedAt: new Date().toISOString(),
        };
        try {
          window.localStorage.setItem(visualProgressStorageKey, JSON.stringify(progress));
        } catch {
          throw new Error('This browser could not checkpoint the Visual Plan safely. Free some browser storage, then resume.');
        }
        setBuildStatus(
          'Protected part ' + completedBatchCount + ' of ' + totalBatchCount
          + ' saved locally' + (completedBatchCount < totalBatchCount ? ' · continuing automatically' : ' · assembling final plan'),
        );

        if (completedBatchCount < totalBatchCount) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 2500));
        }
      }

      const plan = mergeVisualBatches(completedPlans, manifest, currentDuration);
      const record: StageRecord = {
        content: JSON.stringify(plan, null, 2),
        providerName: connection.providerName,
        modelName: model.name,
        updatedAt: new Date().toISOString(),
        sourceScriptUpdatedAt: scriptRecord.updatedAt,
        sourceVoiceoverUpdatedAt: voiceRecord.updatedAt,
        visualModestyMode: modestyMode,
      };
      const next: WorkflowState = {
        ...workflow,
        stages: {
          ...workflow.stages,
          visuals: record,
          audio: undefined,
          thumbnails: undefined,
          description: undefined,
          shorts: undefined,
        },
      };
      if (persistWorkflow(next)) {
        window.localStorage.removeItem(visualProgressStorageKey);
        setBuildStatus('');
        setVisibleScenes(8);
        setVisibleClips(10);
        setNotice(
          'Complete Visual Plan saved: ' + plan.scenes.length
          + ' production scenes mapped across ' + plan.timeline.length + ' timeline clips.',
        );
      }
    } catch (requestError) {
      const rawMessage = requestError instanceof Error ? requestError.message : 'Visual planning failed.';
      const message = rawMessage
        .replace(/\s+Nothing was replaced[^.]*\./gi, '')
        .trim() || 'The returned Visual Plan part could not be accepted.';
      const providerBusy = /temporarily unavailable|overloaded|rate-limited|quota|did not finish|could not be reached|timed out/i.test(rawMessage);
      const savedUnits: string[] = [];
      if (completedBatchCount) savedUnits.push(completedBatchCount + ' complete protected part' + (completedBatchCount === 1 ? '' : 's'));
      if (checkpointedPartialClipCount) savedUnits.push(checkpointedPartialClipCount + ' accepted clips inside the current part');
      const protectedProgress = savedUnits.length > 0;
      const savedMessage = protectedProgress
        ? ' ' + savedUnits.join(' and ') + ' are already saved. Click Resume Visual Plan; saved work will not run again.'
        : providerBusy
          ? ' The AI provider is temporarily busy; no saved work changed. Wait about one minute, then try again.'
          : ' The returned part did not pass automatic validation; no saved work changed. Click Build Visual Plan once more.';
      setError(message + savedMessage);
      setBuildStatus(
        protectedProgress
          ? completedBatchCount + ' of ' + totalBatchCount + ' complete parts'
            + (checkpointedPartialClipCount ? ' · ' + checkpointedPartialClipCount + ' current-part clips saved locally' : ' saved locally')
          : '',
      );
    } finally {
      setLoading(false);
    }
  }
  async function copyText(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(message);
      setError('');
    } catch {
      setError('This browser could not copy the text. Select it manually and copy it.');
    }
  }

  function downloadPlan() {
    if (!visualPlan || !planCurrent) return;
    const blob = new Blob([JSON.stringify(visualPlan, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `arclane-visual-plan-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice('Complete Visual Plan downloaded as JSON.');
  }

  function continueToAudio() {
    if (!planCurrent) {
      setError('Build one complete current Visual Plan before continuing to Audio.');
      return;
    }
    studioNavigate('/studio/audio');
  }

  if (!hydrated) {
    return <main className="module-shell module-green visual-shell"><StudioSidebar activeStageId="visuals" /><section className="module-main"><div className="visual-loading">Loading the production handoff…</div></section></main>;
  }

  return (
    <main className="module-shell module-green visual-shell">
      <StudioSidebar activeStageId="visuals" />
      <section className="module-main">
        <header className="module-topbar"><div><span>Creator Studio</span><i>/</i><strong>Visuals</strong></div><div className="module-profile"><span>Local workspace</span><i>YC</i></div></header>

        <div className="module-content visual-content">
          <header className="visual-heading">
            <div><p>05 · Evidence-led picture plan</p><h1>Turn every spoken beat<br />into a shot you can make.</h1><span>The Final Script supplies the story and facts. The prepared Voiceover supplies the narration rhythm. One click builds the complete production plan.</span></div>
            <div className="visual-stats"><div><strong>{scriptRecord ? scriptSignals.wordCount.toLocaleString() : '—'}</strong><span>Script words</span></div><div><strong>{manifest.length || '—'}</strong><span>{durationMode === 'auto' ? 'Auto 6–8s clips' : `Up to ${customDurationSeconds}s clips`}</span></div><div><strong>{estimatedDuration ? `${Math.round((estimatedDuration / 60) * 10) / 10}m` : '—'}</strong><span>Estimated timeline</span></div></div>
          </header>

          <section className={`visual-handoff${handoffReady ? '' : ' blocked'}`}>
            <div className="visual-handoff-mark">SC</div>
            {scriptRecord ? <>
              <div className="visual-handoff-copy"><div><p>Final Script received</p><strong>{handoffReady ? '✓ Voice timing connected' : 'Voiceover is missing or outdated'}</strong></div><h2>{selectedIdea?.title ?? 'Current documentary'}</h2><span>{scriptPreview || 'No Script preview is available.'}</span><small>Story and facts: Final Script · timing and spoken order: current Voiceover · no request starts automatically</small></div>
              <div className="visual-handoff-actions"><button type="button" aria-expanded={scriptOpen} onClick={() => setScriptOpen((open) => !open)}>{scriptOpen ? 'Hide full Script' : 'View full Script'}</button><a href="/studio/voiceover" onClick={(e) => studioNavigate('/studio/voiceover', e)}>Back to Voiceover</a></div>
              {scriptOpen ? <div className="visual-source-full"><ScriptDocumentView content={scriptRecord.content} /></div> : null}
            </> : <><div className="visual-handoff-copy"><div><p>Final Script required</p></div><h2>No Script has arrived yet</h2><span>Finish Script and Voiceover first. Visual planning never starts automatically.</span></div><a href="/studio/scripts" onClick={(e) => studioNavigate('/studio/scripts', e)}>Open Script →</a></>}
          </section>

          <section className="visual-direction-card">
            <div className="visual-direction-icon">VI</div><div><p>Automatic house style</p><h2>Grounded cinematic reconstruction</h2><span>Realistic human-scale scenes are the default. Authentic objects, documents, maps and licensed archive take priority whenever they tell the truth better. People are presented with dignity and modesty; respectful framing protects that standard without falsifying history.</span></div><div className="visual-direction-badges"><span>Continuity locked</span><span>{modestyMode === 'strict' ? 'Strict covering locked' : 'Modest depiction locked'}</span><span>Rights-aware</span><span>Provider-neutral prompts</span></div>
          </section>

          <section className="visual-control">
            <header><div><span>VI</span><strong>Visual Plan builder</strong></div><small>Protected batches · every finished part saves automatically</small></header>
            <div className="visual-model-bar">
              {connections.length ? <>
                <label><span>AI provider</span><div><b>{providerId ? providerMark(providerId) : '—'}</b><select value={providerId} onChange={(event) => changeProvider(event.target.value as ProviderId)}>{connections.map((connection) => <option value={connection.providerId} key={connection.providerId}>{connection.providerName}</option>)}</select></div></label>
                <label><span>Model for Visuals</span><div><select value={modelId} onChange={(event) => changeModel(event.target.value)}>{activeConnection?.models.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}</select></div></label>
              </> : <div className="visual-no-model"><span>◇</span><div><strong>No AI model connected</strong><small>Add one provider and select a model. Your API key remains in this browser.</small></div><a href="/studio/settings" onClick={(e) => studioNavigate('/studio/settings', e)}>Open Settings →</a></div>}
            </div>

            <section className="visual-duration-control" aria-label="Visual asset duration">
              <div className="visual-duration-copy"><span>Clip duration</span><strong>Match the visual plan to your generation model</strong><p>Automatic keeps fast documentary rhythm. Custom creates fewer, longer narration blocks while still allowing AI video, animated images, archive, maps and stock wherever each one works best.</p></div>
              <div className="visual-duration-options">
                <button className={durationMode === 'auto' ? 'active' : ''} type="button" aria-pressed={durationMode === 'auto'} onClick={() => saveDuration('auto', customDurationSeconds)}><span>Recommended</span><strong>Automatic</strong><small>6–8 seconds</small></button>
                <button className={durationMode === 'custom' ? 'active' : ''} type="button" aria-pressed={durationMode === 'custom'} onClick={() => saveDuration('custom', customDurationSeconds)}><span>Your model</span><strong>Custom</strong><small>3–120 seconds</small></button>
                {durationMode === 'custom' ? <label><span>Maximum clip length</span><div><input type="number" min="3" max="120" step="1" value={customDurationSeconds} onChange={(event) => saveDuration('custom', Number(event.target.value) || 3)} /><b>seconds</b></div><small>Use only a duration your chosen video model can actually generate. Images and stock may be held, animated or trimmed to this window.</small></label> : <div className="visual-duration-auto"><strong>Smart default is active</strong><span>The planner uses complete 6–8 second beats and chooses video, still-motion, archive, maps or stock automatically.</span></div>}
              </div>
            </section>

            <section className={`visual-modesty-control${modestyMode === 'strict' ? ' strict' : ''}`} aria-label="Women’s modesty preference">
              <div className="visual-modesty-copy"><span>Faith-aligned visual rule</span><strong>Women’s strict covering</strong><p>Turn this on when every woman or girl must have fully covered hair and loose, opaque, full-coverage clothing. The preference is saved on this device.</p></div>
              <div className="visual-modesty-action">
                <button type="button" role="switch" aria-checked={modestyMode === 'strict'} aria-label="Require strict covering for women and girls" onClick={() => saveModestyMode(modestyMode === 'strict' ? 'evidence_led' : 'strict')}>
                  <span className="visual-switch-track"><i /></span>
                  <span><strong>Require covered hair</strong><small>{modestyMode === 'strict' ? 'Applied to every AI prompt and character reference' : 'Current evidence-led modest framing remains active'}</small></span>
                  <b>{modestyMode === 'strict' ? 'ON' : 'OFF'}</b>
                </button>
                <p>{modestyMode === 'strict' ? 'Hair, neck, chest, arms and legs stay covered. If that would misrepresent the historical record, the planner must use a respectful non-identifying or alternative visual instead.' : 'Period clothing remains evidence-led. Women are still depicted with dignity and sensitive framing, but full hair covering is not forced.'}</p>
              </div>
            </section>

            <details className="visual-optional"><summary>Optional direction for this Visual Plan <span>＋</span></summary><label><span>Only use this when one episode needs a special treatment. The continuity and evidence rules cannot be removed.</span><textarea value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="Example: Keep the opening restrained and emphasize the winter landscape." /></label></details>

            {!handoffReady ? <div className="visual-prerequisite"><span>!</span><div><strong>Current Voiceover required</strong><p>Prepare a Voiceover from the present Final Script so the clip timing and spoken order cannot drift.</p></div><a href="/studio/voiceover" onClick={(e) => studioNavigate('/studio/voiceover', e)}>Open Voiceover</a></div> : null}
            {error ? <p className="visual-message error" role="alert"><span>!</span>{error}</p> : null}
            {buildStatus ? <p className="visual-message progress" role="status"><span>↻</span>{buildStatus}</p> : null}
            {notice ? <p className="visual-message success" role="status"><span>✓</span>{notice}</p> : null}

            <footer><div><strong>Resumable protection</strong><span>Complete narration coverage · locally saved parts · {currentDuration.label} · {modestyMode === 'strict' ? 'strict covering on' : 'evidence-led modesty'} · continuity locked</span></div><button type="button" disabled={!handoffReady || !activeModel || loading} onClick={() => void buildVisualPlan()}>{loading ? <><i className="automation-spinner" /> Building protected parts…</> : <>{buildStatus ? 'Resume Visual Plan' : planCurrent ? 'Build again safely' : 'Build Visual Plan'} <b>→</b></>}</button></footer>
          </section>

          {visualPlan && planCurrent ? <>
            <section className="visual-bible">
              <header><div><p>Episode visual bible</p><h2>{visualPlan.strategy.primaryStyle}</h2><span>{visualPlan.strategy.approach}</span></div><strong>{visualPlan.scenes.length} scenes → {visualPlan.timeline.length} clips</strong></header>
              <div className="visual-bible-grid"><article><span>Colour & texture</span><p>{visualPlan.strategy.palette}</p></article><article><span>Camera language</span><p>{visualPlan.strategy.cameraLanguage}</p></article><article><span>Evidence rule</span><p>{visualPlan.strategy.archiveRule}</p></article><article><span>Verified visual evidence</span><p>{visualPlan.strategy.evidenceLocks.length ? visualPlan.strategy.evidenceLocks.join(' · ') : 'Use only details supported by the Final Script and Research dossier.'}</p></article><article><span>Modest depiction</span><p>{visualPlan.strategy.modestyRule}</p></article><article><span>Publishing note</span><p>{visualPlan.strategy.disclosureNote}</p></article></div>
              {visualPlan.strategy.continuityRules.length ? <div className="visual-rules"><strong>Continuity rules used in every clip</strong><div>{visualPlan.strategy.continuityRules.map((rule) => <span key={rule}>{rule}</span>)}</div></div> : null}
            </section>

            <section className="visual-publish-safety">
              <header><div><p>Before the YouTube upload</p><h2>Three safeguards that automation cannot honestly guess.</h2><span>The Visual Plan prepares these decisions, but the final source and upload checks remain attached to the real assets you choose.</span></div><strong>3 FINAL CHECKS</strong></header>
              <div><article><span>01</span><div><strong>Disclose realistic AI reconstruction</strong><p>Choose “Yes” for altered or synthetic content when a realistic generated scene could be mistaken for a real person, event or place.</p></div></article><article><span>02</span><div><strong>Keep a rights record for every real asset</strong><p>Save the item URL, creator, exact licence, retrieval date and required credit for each archive or stock file you actually download.</p></div></article><article><span>03</span><div><strong>Make every episode visibly original</strong><p>Use narration-specific selection, sequencing, crops, motion, annotation and comparison. Do not publish untouched stock or a repetitive slideshow template.</p></div></article></div>
            </section>

            {visualPlan.characters.length ? <section className="visual-characters"><header><div><p>Prepare before generating clips</p><h2>Recurring character reference pack</h2><span>Create these reference images first, then reuse the same reference whenever the character ID appears in a prompt.</span></div><strong>{visualPlan.characters.length} locked</strong></header><div>{visualPlan.characters.map((character) => <article key={character.id}><div><span>{character.id}</span><small>First used {character.firstClipId || 'in this plan'}</small></div><h3>{character.name}</h3><p>{character.role}</p><dl><div><dt>Identity lock</dt><dd>{character.identityLock}</dd></div><div><dt>Reference prompt</dt><dd>{character.referencePrompt}</dd></div></dl><button type="button" onClick={() => void copyText(character.referencePrompt, `${character.id} reference prompt copied.`)}>Copy reference prompt</button></article>)}</div></section> : null}

            <section className="visual-plan visual-scene-library">
              <header><div><p>Reusable scene library</p><h2>Generate each scene once.</h2><span>Every full production prompt lives here once. A scene may return later only when reuse protects quality and continuity.</span></div><div><button type="button" onClick={downloadPlan}>Download plan</button><button className="primary" type="button" onClick={() => void copyText(JSON.stringify(visualPlan, null, 2), 'Complete Visual Plan copied.')}>Copy all</button></div></header>
              <div className="visual-clip-list">{visualPlan.scenes.slice(0, visibleScenes).map((scene, index) => {
                const hints = sourceHints(scene.asset);
                const usage = sceneUsage.find((entry) => entry.sceneId === scene.sceneId);
                const useCount = usage?.clipIds.length ?? 0;
                return <article className="visual-clip visual-scene" id={`scene-${scene.sceneId.toLowerCase()}`} key={scene.sceneId}>
                  <header><div><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{scene.sceneId}</strong><small>{useCount === 1 ? 'Used once' : `Used ${useCount} times in the timeline`}</small></div></div><b className={`asset-${scene.asset}`}>{assetLabel(scene.asset)}</b></header>
                  {usage?.clipIds.length ? <div className={`visual-scene-usage ${usage.clipIds.length > 1 ? 'has-reuse' : ''}`}><span>{usage.clipIds.length > 1 ? 'Use this same scene in' : 'Use this scene in'}</span><strong>{usage.clipIds.join(' · ')}</strong></div> : null}
                  <section className="visual-shot"><span>What to create</span><p>{scene.shot}</p></section>
                  <section className="visual-prompt"><header><span>Production-ready visual prompt</span><button type="button" onClick={() => void copyText(scene.prompt, `${scene.sceneId} prompt copied.`)}>Copy prompt</button></header><pre>{scene.prompt}</pre></section>
                  <section className="visual-search"><header><span>Real footage / archive alternative</span><button type="button" onClick={() => void copyText(scene.search.join('\n'), `${scene.sceneId} search terms copied.`)}>Copy searches</button></header><div>{scene.search.map((query) => <code key={query}>{query}</code>)}</div>{hints.length ? <small>Good starting points: {hints.join(' · ')}. Verify the exact item’s rights and attribution before use.</small> : <small>Use these terms only when a real or licensed alternative tells the beat better.</small>}</section>
                  {scene.note ? <footer><span>Continuity & evidence note</span><p>{scene.note}</p></footer> : null}
                </article>;
              })}</div>
              {visibleScenes < visualPlan.scenes.length ? <button className="visual-show-more" type="button" onClick={() => setVisibleScenes((count) => Math.min(count + 8, visualPlan.scenes.length))}>Show 8 more scenes <span>{visibleScenes} of {visualPlan.scenes.length}</span></button> : null}
            </section>

            <section className="visual-plan visual-timeline">
              <header><div><p>Complete production timeline</p><h2>Every spoken beat is mapped.</h2><span>Every planned narration block remains here in order at the selected duration. CREATE means make the Scene Library asset; USE means reuse that numbered scene with the stated alternate treatment.</span></div><strong className="visual-plan-count">{visualPlan.scenes.length} scenes → {visualPlan.timeline.length} clips</strong></header>
              {reuseGuide.length ? <section className="visual-reuse-guide">
                <header><div><span>Simple reuse guide</span><strong>{reuseGuide.length} clips do not need a new prompt</strong><p>At each clip below, use the named Scene Library asset again. The original prompt stays in that Scene card.</p></div><b>{reuseGuide.length} REUSE</b></header>
                <div>{reuseGuide.map((clip) => <article key={clip.clipId}>
                  <span className="visual-reuse-number">Clip {String(clip.timelineNumber).padStart(2, '0')}</span>
                  <div><strong>{clip.clipId}: use {clip.sceneId} again</strong><p>First created for {clip.firstClipId}. Use it here with this treatment: {clip.direction}</p></div>
                  <a href={`#scene-${clip.sceneId.toLowerCase()}`}>View {clip.sceneId} prompt</a>
                </article>)}</div>
              </section> : <div className="visual-no-reuse"><strong>No scene reuse in this plan.</strong><span>Every timeline clip has its own Scene Library prompt.</span></div>}
              <div className="visual-timeline-list">{visualPlan.timeline.slice(0, visibleClips).map((clip, index) => <article className={`visual-timeline-card ${clip.firstUse ? 'is-new' : 'is-reuse'}`} key={clip.clipId}>
                <header><div><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{clip.clipId}</strong><small>{formatTime(clip.startSeconds)} — {formatTime(clip.endSeconds)} · {clip.durationSeconds.toFixed(1)} sec</small></div></div><span className="visual-scene-use">{clip.firstUse ? 'CREATE' : 'USE'} {clip.sceneId.replace('SCENE-', 'SCENE ')}</span></header>
                <blockquote><span>Exact narration</span>{clip.narration}</blockquote>
                <div className="visual-timeline-direction"><span>{clip.firstUse ? 'First-use direction' : 'Reuse treatment'}</span><p>{clip.direction}</p></div>
              </article>)}</div>
              {visibleClips < visualPlan.timeline.length ? <button className="visual-show-more" type="button" onClick={() => setVisibleClips((count) => Math.min(count + 10, visualPlan.timeline.length))}>Show 10 more timeline clips <span>{visibleClips} of {visualPlan.timeline.length}</span></button> : null}
            </section>
          </> : <section className="visual-empty"><div>▦</div><p>FINAL SCRIPT + VOICE TIMING READY</p><h2>No Visual Plan request has been sent.</h2><span>Review the handoff, choose the AI model, then click Build Visual Plan. A complete plan appears only after every clip passes.</span></section>}

          <footer className="visual-next"><a href="/studio/voiceover" onClick={(e) => studioNavigate('/studio/voiceover', e)}><span>Previous stage</span><strong>← Voiceover</strong></a><div><span>Current production idea</span><strong>{selectedIdea?.title ?? 'Nothing selected'}</strong></div><button type="button" disabled={!planCurrent || loading} onClick={continueToAudio}><span>{planCurrent ? 'Complete Visual Plan saved' : 'Build one current plan first'}</span><strong>Audio <i>→</i></strong></button></footer>
        </div>
      </section>
    </main>
  );
}

