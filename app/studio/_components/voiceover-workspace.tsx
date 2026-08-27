'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StudioStageId } from '../_lib/stages';
import ScriptDocumentView, { getScriptSignals, getSpokenScriptText } from './script-document-view';
import StudioSidebar from './studio-sidebar';

type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'custom';
type AuthMethod = 'bearer' | 'api-key';
type VoiceProfile = 'universal' | 'advanced';
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
};
type WorkflowState = {
  selectedIdea?: Idea;
  stages: Partial<Record<StudioStageId, StageRecord>>;
};
type ModelPreference = { providerId: ProviderId; modelId: string };

const connectionStorageKey = 'arclane.model-connections.v1';
const workflowStorageKey = 'arclane.creator-workflow.v1';
const modelPreferenceKey = 'arclane.workflow-models.v1';
const connectionChangeEvent = 'arclane:model-connections-changed';
const initialWorkflow: WorkflowState = { stages: {} };
const allowedAdvancedTags = new Set([
  'pause', 'short pause', 'medium pause', 'long pause',
  'thoughtful', 'reflective', 'curious', 'serious', 'somber', 'sombre',
  'concerned', 'warm', 'gentle', 'calm', 'cautious', 'hopeful',
  'surprised', 'amazed', 'worried', 'excited', 'reluctantly', 'sorrowful',
  'quietly', 'softly', 'slowly', 'deliberately', 'drawn out', 'rushed',
  'intimate', 'confidential', 'reassuring', 'urgent', 'tense', 'restrained',
  'whispers', 'sighs', 'exhales', 'breathes', 'laughs', 'soft laugh',
  'gasps', 'clears throat',
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

function providerMark(providerId: ProviderId) {
  if (providerId === 'openai') return 'O';
  if (providerId === 'anthropic') return 'A';
  if (providerId === 'gemini') return 'G';
  return '+';
}

function cleanVoiceoverOutput(content: string, profile: VoiceProfile) {
  let cleaned = content
    .replace(/^\s*```(?:markdown|md|text)?\s*$/gim, '')
    .replace(/^\s*```\s*$/gm, '')
    .replace(/^\s*(?:#{1,6}\s*)?(?:voice\s*over|voiceover|narration)(?:\s+(?:copy|text|script))?\s*:?\s*$/gim, '')
    .replace(/^\s*#{1,6}\s+.*$/gm, '')
    .replace(/^\s*>.*$/gm, '')
    .replace(/\n\s*##\s+Editorial handoff[\s\S]*$/i, '')
    .replace(/\[C\d{1,3}\]/gi, '')
    .trim();

  if (profile === 'universal') {
    cleaned = cleaned
      .replace(/<[^>]+>/g, '')
      .replace(/\[[^\]]+\]/g, '');
  } else {
    cleaned = cleaned.replace(/\[([^\]]+)\]/g, (tag, value: string) => (
      allowedAdvancedTags.has(value.trim().toLowerCase()) ? tag : ''
    ));
  }

  return cleaned.replace(/[*_]/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function voiceSignals(content: string) {
  const spoken = content.replace(/\[[^\]]+\]/g, ' ').replace(/<[^>]+>/g, ' ');
  const words = spoken.match(/[A-Za-z0-9]+(?:[’'][A-Za-z0-9]+)*/g) ?? [];
  const tags = content.match(/\[[^\]]+\]/g) ?? [];
  return {
    wordCount: words.length,
    estimatedMinutes: words.length ? Math.max(1, Math.round((words.length / 145) * 10) / 10) : 0,
    tagCount: tags.length,
  };
}

function minimumAdvancedCues(sourceWordCount: number) {
  return Math.max(2, Math.min(10, Math.floor(sourceWordCount / 250)));
}
export default function VoiceoverWorkspace() {
  const [hydrated, setHydrated] = useState(false);
  const [connections, setConnections] = useState<Selection[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowState>(initialWorkflow);
  const [providerId, setProviderId] = useState<ProviderId | ''>('');
  const [modelId, setModelId] = useState('');
  const [profile, setProfile] = useState<VoiceProfile>('universal');
  const [scriptOpen, setScriptOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const scriptRecord = workflow.stages.scripts;
  const voiceRecord = workflow.stages.voiceover;
  const selectedIdea = workflow.selectedIdea;
  const scriptFinal = Boolean(scriptRecord?.content.trim() && scriptRecord.scriptReview?.status === 'approved');
  const activeConnection = connections.find((item) => item.providerId === providerId);
  const activeModel = activeConnection?.models.find((model) => model.id === modelId);
  const scriptSignals = useMemo(() => getScriptSignals(scriptRecord?.content ?? ''), [scriptRecord?.content]);
  const outputSignals = useMemo(() => voiceSignals(voiceRecord?.content ?? ''), [voiceRecord?.content]);
  const scriptPreview = useMemo(() => {
    const text = getSpokenScriptText(scriptRecord?.content ?? '');
    return text.length > 330 ? `${text.slice(0, 330).trim()}…` : text;
  }, [scriptRecord?.content]);
  const outputCurrent = Boolean(
    voiceRecord?.content.trim()
    && voiceRecord.voiceProfile
    && voiceRecord.voiceProfile === profile
    && voiceRecord.sourceScriptUpdatedAt
    && voiceRecord.sourceScriptUpdatedAt === scriptRecord?.updatedAt,
  );

  const persistWorkflow = useCallback((next: WorkflowState) => {
    try {
      window.localStorage.setItem(workflowStorageKey, JSON.stringify(next));
      setWorkflow(next);
      return true;
    } catch {
      setError('This browser could not save the Voiceover locally. Free some browser storage and try again.');
      return false;
    }
  }, []);

  const savePreference = useCallback((nextProviderId: ProviderId, nextModelId: string) => {
    const preferences = readJson<Partial<Record<StudioStageId, ModelPreference>>>(modelPreferenceKey, {});
    preferences.voiceover = { providerId: nextProviderId, modelId: nextModelId };
    window.localStorage.setItem(modelPreferenceKey, JSON.stringify(preferences));
  }, []);

  useEffect(() => {
    const refreshConnections = () => setConnections(readConnections());
    const initializeTimer = window.setTimeout(() => {
      const savedWorkflow = readJson<WorkflowState>(workflowStorageKey, initialWorkflow);
      const available = readConnections();
      const preferences = readJson<Partial<Record<StudioStageId, ModelPreference>>>(modelPreferenceKey, {});
      const preference = preferences.voiceover;
      const preferredConnection = available.find((item) => item.providerId === preference?.providerId);
      const firstConnection = preferredConnection ?? available[0];
      const preferredModel = firstConnection?.models.find((model) => model.id === preference?.modelId);
      const firstModel = preferredModel ?? firstConnection?.models[0];

      setWorkflow(savedWorkflow);
      setConnections(available);
      setProviderId(firstConnection?.providerId ?? '');
      setModelId(firstModel?.id ?? '');
      setProfile(savedWorkflow.stages.voiceover?.voiceProfile === 'advanced' ? 'advanced' : 'universal');
      setHydrated(true);

      const params = new URLSearchParams(window.location.search);
      if (params.has('run')) {
        params.delete('run');
        const cleanUrl = `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', cleanUrl);
      }
    }, 0);

    window.addEventListener('storage', refreshConnections);
    window.addEventListener(connectionChangeEvent, refreshConnections);
    return () => {
      window.clearTimeout(initializeTimer);
      window.removeEventListener('storage', refreshConnections);
      window.removeEventListener(connectionChangeEvent, refreshConnections);
    };
  }, []);

  useEffect(() => {
    if (!providerId) return undefined;
    const connection = connections.find((item) => item.providerId === providerId);
    if (!connection) {
      const first = connections[0];
      const timer = window.setTimeout(() => {
        setProviderId(first?.providerId ?? '');
        setModelId(first?.models[0]?.id ?? '');
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (!connection.models.some((model) => model.id === modelId)) {
      const firstModel = connection.models[0];
      const timer = window.setTimeout(() => {
        setModelId(firstModel?.id ?? '');
        if (firstModel) savePreference(connection.providerId, firstModel.id);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
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

  async function prepareVoiceover() {
    if (loading) return;
    if (!scriptRecord || !scriptFinal) {
      setError('Return to Script and complete Recheck & Polish before preparing Voiceover.');
      return;
    }
    const connection = connections.find((item) => item.providerId === providerId);
    const model = connection?.models.find((item) => item.id === modelId);
    if (!connection || !model) {
      setError('Connect an AI provider and choose one model before preparing Voiceover.');
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');
    try {
      const spokenScript = getSpokenScriptText(scriptRecord.content);
      const response = await fetch('/api/automation/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 'voiceover',
          provider: connection.providerId,
          providerName: connection.providerName,
          model: model.id,
          apiKey: connection.apiKey,
          baseUrl: connection.baseUrl,
          authMethod: connection.authMethod,
          headerName: connection.headerName,
          completionPath: connection.completionPath,
          webSearchEnabled: false,
          context: {
            selectedIdea,
            voiceProfile: profile,
            outputs: { scripts: spokenScript },
          },
        }),
      });
      const result = await response.json() as { output?: string; error?: string };
      if (!response.ok || !result.output) throw new Error(result.error || 'The model did not return usable Voiceover text.');

      const content = cleanVoiceoverOutput(result.output, profile);
      if (!content) throw new Error('The model returned no usable Voiceover. Try again or choose another model.');

      const preparedSignals = voiceSignals(content);
      if (profile === 'advanced' && preparedSignals.tagCount < minimumAdvancedCues(preparedSignals.wordCount)) {
        throw new Error('The model returned an almost plain Script instead of a properly tagged Advanced Voiceover. Nothing was replaced.');
      }
      const record: StageRecord = {
        content,
        providerName: connection.providerName,
        modelName: model.name,
        updatedAt: new Date().toISOString(),
        voiceProfile: profile,
        sourceScriptUpdatedAt: scriptRecord.updatedAt,
      };
      const next: WorkflowState = {
        ...workflow,
        stages: {
          ...workflow.stages,
          voiceover: record,
          visuals: undefined,
          audio: undefined,
          thumbnails: undefined,
          description: undefined,
          shorts: undefined,
        },
      };
      if (persistWorkflow(next)) {
        setNotice(`${profile === 'universal' ? 'Normal' : 'Advanced'} Voiceover is ready and saved on this device.`);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Voiceover preparation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function copyVoiceover() {
    if (!voiceRecord?.content) return;
    try {
      await navigator.clipboard.writeText(voiceRecord.content);
      setNotice('The complete Voiceover was copied. Paste it directly into the compatible voice tool.');
      setError('');
    } catch {
      setError('This browser blocked clipboard access. Allow clipboard permission and try again.');
    }
  }

  function downloadVoiceover() {
    if (!voiceRecord?.content) return;
    const blob = new Blob([voiceRecord.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `arclane-${voiceRecord.voiceProfile ?? 'voiceover'}-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice('Voiceover downloaded as a plain text file.');
  }

  function continueToVisuals() {
    if (!outputCurrent) {
      setError('Prepare one current Voiceover version before continuing to Visuals.');
      return;
    }
    window.location.assign('/studio/visuals');
  }

  if (!hydrated) {
    return <main className="module-shell module-cyan voice-shell"><StudioSidebar activeStageId="voiceover" /><section className="module-main"><div className="voice-loading">Loading the final Script…</div></section></main>;
  }

  return (
    <main className="module-shell module-cyan voice-shell">
      <StudioSidebar activeStageId="voiceover" />
      <section className="module-main">
        <header className="module-topbar">
          <div><span>Creator Studio</span><i>/</i><strong>Voiceover</strong></div>
          <div className="module-profile"><span>Local workspace</span><i>YC</i></div>
        </header>

        <div className="module-content voice-content">
          <header className="voice-heading">
            <div><p>04 · Human delivery preparation</p><h1>Make the final words<br />sound lived—not read.</h1><span>Choose Normal or Advanced, click once, then copy the complete result directly into your voice generator.</span></div>
            <div className="voice-stats">
              <div><strong>{scriptRecord ? scriptSignals.wordCount.toLocaleString() : '—'}</strong><span>Source words</span></div>
              <div><strong>{scriptRecord ? `${scriptSignals.estimatedMinutes}m` : '—'}</strong><span>Estimated voice</span></div>
              <div><strong>{outputCurrent ? '1' : '—'}</strong><span>Ready version</span></div>
            </div>
          </header>

          <section className={`voice-handoff${scriptFinal ? '' : ' blocked'}`}>
            <div className="voice-handoff-mark">SC</div>
            {scriptRecord ? <>
              <div className="voice-handoff-copy">
                <div><p>Final Script received</p><strong>{scriptFinal ? '✓ Reviewed and approved' : 'Recheck still required'}</strong></div>
                <h2>{selectedIdea?.title ?? 'Current documentary Script'}</h2>
                <span>{scriptPreview || 'No spoken narration preview is available.'}</span>
                <small>{scriptSignals.wordCount.toLocaleString()} spoken words · about {scriptSignals.estimatedMinutes} minutes · {scriptRecord.providerName} · {scriptRecord.modelName}</small>
              </div>
              <div className="voice-handoff-actions"><button type="button" aria-expanded={scriptOpen} onClick={() => setScriptOpen((open) => !open)}>{scriptOpen ? 'Hide full Script' : 'View full Script'}</button><a href="/studio/scripts">Back to Script</a></div>
              {scriptOpen ? <div className="voice-source-full"><ScriptDocumentView content={scriptRecord.content} /></div> : null}
            </> : <>
              <div className="voice-handoff-copy"><div><p>Final Script required</p></div><h2>No Script has arrived yet</h2><span>Write and polish the Script first. Voiceover never starts automatically.</span></div>
              <a href="/studio/scripts">Open Script →</a>
            </>}
          </section>

          <section className="voice-lab">
            <header><div><span>VO</span><div><p>Voice preparation</p><h2>Choose one mode. Receive one complete Voiceover.</h2></div></div><strong><i /> No web search</strong></header>

            {connections.length ? <div className="voice-models">
              <label><span>AI that prepares the text</span><div><b>{providerId ? providerMark(providerId) : '—'}</b><select value={providerId} onChange={(event) => changeProvider(event.target.value as ProviderId)}>{connections.map((connection) => <option value={connection.providerId} key={connection.providerId}>{connection.providerName}</option>)}</select></div></label>
              <label><span>Model for this one request</span><div><select value={modelId} onChange={(event) => changeModel(event.target.value)}>{activeConnection?.models.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}</select></div></label>
              <div className="voice-model-note"><i /><span><strong>Formatting model only</strong><small>You will paste its result into your voice tool</small></span></div>
            </div> : <div className="voice-no-model"><span>◇</span><div><strong>No AI model connected</strong><small>Connect one text-generation model to prepare the copy-ready narration.</small></div><a href="/studio/settings">Open Settings →</a></div>}

            <section className="voice-profile-section" aria-labelledby="voice-profile-title">
              <div className="voice-profile-intro"><p>Voiceover mode</p><h3 id="voice-profile-title">How should the AI prepare the complete Script?</h3><span>Both modes send the full Final Script to your selected AI. Only one copy-ready result returns.</span></div>
              <div className="voice-profile-grid" role="radiogroup" aria-label="Voiceover compatibility profile">
                <button type="button" role="radio" aria-checked={profile === 'universal'} className={`voice-profile-card${profile === 'universal' ? ' selected' : ''}`} onClick={() => setProfile('universal')}>
                  <div><span>NORMAL</span><i>{profile === 'universal' ? '✓' : ''}</i></div><h4>Normal</h4><p>The AI removes headings, Claim IDs and production notes, then shapes the complete narration with natural punctuation, pauses and paragraphs.</p><small>Copy the whole result into ElevenLabs or almost any text-to-speech model. No manual cleanup is needed.</small>
                </button>
                <button type="button" role="radio" aria-checked={profile === 'advanced'} className={`voice-profile-card advanced${profile === 'advanced' ? ' selected' : ''}`} onClick={() => setProfile('advanced')}>
                  <div><span>ADVANCED</span><i>{profile === 'advanced' ? '✓' : ''}</i></div><h4>Tagged Voiceover</h4><p>The same clean narration, with professional inline cues such as [medium pause] and [thoughtful] exactly where delivery needs them.</p><small>Copy the complete result into a voice model that supports bracket instructions. Unsupported models may read tags aloud.</small>
                </button>
              </div>
              <div className={`voice-compatibility ${profile}`}><span>{profile === 'universal' ? 'U' : 'A'}</span><div><strong>{profile === 'universal' ? 'Normal copy-paste Voiceover' : 'Advanced copy-paste Voiceover'}</strong><p>{profile === 'universal' ? 'Only the spoken Script remains. Punctuation and paragraph spacing guide the voice naturally.' : 'Professional pause and performance tags are inserted inside the narration. Nothing else is added.'}</p></div></div>
            </section>

            {!scriptFinal ? <div className="voice-prerequisite"><span>!</span><div><strong>Final Script is not ready</strong><p>Return to Script and complete Recheck & Polish. This page will then receive the reviewed version.</p></div><a href="/studio/scripts">Return to Script</a></div> : null}

            {error ? <p className="voice-message error" role="alert"><span>!</span>{error}</p> : null}
            {notice ? <p className="voice-message success" role="status"><span>✓</span>{notice}</p> : null}

            <footer><div><strong>Automatic protection</strong><span>Full spoken Script · Claim IDs removed · one copy-ready output</span></div><button type="button" disabled={!scriptFinal || !activeModel || loading} onClick={() => void prepareVoiceover()}>{loading ? <><i className="automation-spinner" /> Preparing carefully…</> : <>{outputCurrent ? 'Prepare again' : 'Prepare Voiceover'} <b>→</b></>}</button></footer>
          </section>

          {voiceRecord && outputCurrent ? <section className="voice-output">
            <header><div><p>Copy-ready output</p><h2>Your narration is ready to paste.</h2><span>{outputCurrent ? `Saved ${new Date(voiceRecord.updatedAt).toLocaleString()}` : 'Prepare again above before sending this project forward.'}</span></div><div><strong>{voiceRecord.voiceProfile === 'advanced' ? 'Advanced' : voiceRecord.voiceProfile === 'universal' ? 'Normal' : 'Earlier format'}</strong><small>{voiceRecord.providerName} · {voiceRecord.modelName}</small></div></header>
            <div className="voice-output-summary"><span><b>{outputSignals.wordCount.toLocaleString()}</b> spoken words</span><span><b>≈ {outputSignals.estimatedMinutes}m</b> estimated</span><span><b>{voiceRecord.voiceProfile === 'advanced' ? outputSignals.tagCount : 0}</b> expressive cues</span></div>
            <pre className="voice-copy">{voiceRecord.content}</pre>
            <footer className="voice-actions"><div><span>Saved automatically on this device</span><small>{voiceRecord.voiceProfile === 'advanced' ? 'Copy everything into a bracket-tag compatible voice model.' : 'Copy everything into almost any voice model.'}</small></div><button type="button" onClick={downloadVoiceover}>Download .txt</button><button className="primary" type="button" onClick={() => void copyVoiceover()}>Copy complete Voiceover</button></footer>
          </section> : <section className="voice-empty"><div>≋</div><p>FINAL SCRIPT IS WAITING</p><h2>No voice request has been sent.</h2><span>Choose Normal or Advanced, then click Prepare Voiceover. Only the final copy-ready narration will appear here.</span></section>}

          <footer className="voice-next"><a href="/studio/scripts"><span>Previous stage</span><strong>← Script</strong></a><div><span>Current production idea</span><strong>{selectedIdea?.title ?? 'Nothing selected'}</strong></div><button type="button" disabled={!outputCurrent || loading} onClick={continueToVisuals}><span>{outputCurrent ? 'Copy-ready Voiceover saved' : 'Prepare one current version first'}</span><strong>Visuals <i>→</i></strong></button></footer>
        </div>
      </section>
    </main>
  );
}
