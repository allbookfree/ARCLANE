'use client';

import { FormEvent, useMemo, useState, useSyncExternalStore } from 'react';

type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'custom';
type AuthMethod = 'bearer' | 'api-key';

type Provider = {
  id: ProviderId;
  mark: string;
  name: string;
  purpose: string;
  endpointLabel: string;
  keyHint: string;
  tone: string;
};

type FetchedModel = {
  id: string;
  name: string;
  description?: string;
};

type Selection = {
  providerId: ProviderId;
  providerName: string;
  models: FetchedModel[];
  apiKey: string;
  baseUrl?: string;
  modelsPath?: string;
  completionPath?: string;
  authMethod?: AuthMethod;
  headerName?: string;
};

const storageKey = 'arclane.model-connections.v1';
const storageChangeEvent = 'arclane:model-connections-changed';

function readSavedSelections(saved: string | null) {
  try {
    if (!saved) return [];
    const value = JSON.parse(saved) as unknown;
    if (!Array.isArray(value)) return [];
    const valid = value.filter((item): item is Selection => {
      if (!item || typeof item !== 'object') return false;
      const selection = item as Partial<Selection>;
      return typeof selection.providerId === 'string'
        && typeof selection.providerName === 'string'
        && typeof selection.apiKey === 'string'
        && Array.isArray(selection.models);
    });
    // Keep the last entry per provider so restore-merges or hand-edited data
    // can never render duplicate connection cards.
    const deduped = new Map<string, Selection>();
    for (const selection of valid) deduped.set(selection.providerId, selection);
    return [...deduped.values()];
  } catch {
    return [];
  }
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(storageChangeEvent, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(storageChangeEvent, onChange);
  };
}

function getStorageSnapshot() {
  return window.localStorage.getItem(storageKey) ?? '[]';
}

function getServerStorageSnapshot() {
  return '[]';
}

const standardProviders: Provider[] = [
  {
    id: 'openai',
    mark: 'O',
    name: 'OpenAI',
    purpose: 'Scripts, research, images, voice, and creator automation',
    endpointLabel: 'api.openai.com',
    keyHint: 'Usually starts with sk-',
    tone: 'ink',
  },
  {
    id: 'anthropic',
    mark: 'A',
    name: 'Anthropic',
    purpose: 'Long-form research, reasoning, and script development',
    endpointLabel: 'api.anthropic.com',
    keyHint: 'Usually starts with sk-ant-',
    tone: 'sand',
  },
  {
    id: 'gemini',
    mark: 'G',
    name: 'Google Gemini',
    purpose: 'Text, image, audio, and video understanding',
    endpointLabel: 'generativelanguage.googleapis.com',
    keyHint: 'Create the key in Google AI Studio',
    tone: 'blue',
  },
];

const customProvider: Provider = {
  id: 'custom',
  mark: '+',
  name: 'Custom provider',
  purpose: 'OpenAI-compatible or custom REST models',
  endpointLabel: 'Your secure HTTPS endpoint',
  keyHint: 'Use the key supplied by your provider',
  tone: 'violet',
};

export default function ApiProviderSettings() {
  const [activeProvider, setActiveProvider] = useState<Provider | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [customName, setCustomName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelsPath, setModelsPath] = useState('/models');
  const [completionPath, setCompletionPath] = useState('/chat/completions');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('bearer');
  const [headerName, setHeaderName] = useState('Authorization');
  const [models, setModels] = useState<FetchedModel[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const storedSelections = useSyncExternalStore(subscribeToStorage, getStorageSnapshot, getServerStorageSnapshot);
  const selections = useMemo(() => readSavedSelections(storedSelections), [storedSelections]);

  function updateSelections(update: (current: Selection[]) => Selection[]) {
    const next = update(selections);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      setError('This browser could not save the connection (storage is full or blocked). Nothing was changed.');
      return;
    }
    window.dispatchEvent(new Event(storageChangeEvent));
  }

  const visibleModels = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return models;
    return models.filter((model) => `${model.name} ${model.id}`.toLowerCase().includes(query));
  }, [models, search]);

  function openConnection(provider: Provider) {
    const savedSelection = selections.find((selection) => selection.providerId === provider.id);
    setActiveProvider(provider);
    setApiKey(savedSelection?.apiKey ?? '');
    setShowKey(false);
    setCustomName(provider.id === 'custom' ? savedSelection?.providerName ?? '' : '');
    setBaseUrl(savedSelection?.baseUrl ?? '');
    setModelsPath(savedSelection?.modelsPath ?? '/models');
    setCompletionPath(savedSelection?.completionPath ?? '/chat/completions');
    setAuthMethod(savedSelection?.authMethod ?? 'bearer');
    setHeaderName(savedSelection?.headerName ?? 'Authorization');
    setModels([]);
    setSelectedIds([]);
    setSearch('');
    setError('');
    setNotice('');
  }

  function closeConnection() {
    setApiKey('');
    setActiveProvider(null);
    setModels([]);
    setSelectedIds([]);
    setError('');
  }

  async function verifyAndLoadModels(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeProvider) return;
    setLoading(true);
    setError('');
    setModels([]);
    setSelectedIds([]);

    try {
      const response = await fetch('/api/providers/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: activeProvider.id,
          apiKey,
          baseUrl: activeProvider.id === 'custom' ? baseUrl : undefined,
          modelsPath: activeProvider.id === 'custom' ? modelsPath : undefined,
          authMethod: activeProvider.id === 'custom' ? authMethod : undefined,
          headerName: activeProvider.id === 'custom' ? headerName : undefined,
        }),
      });
      const result = await response.json() as { models?: FetchedModel[]; error?: string };
      if (!response.ok || !result.models) throw new Error(result.error || 'The connection could not be verified.');
      setModels(result.models);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The connection could not be verified.');
    } finally {
      setLoading(false);
    }
  }

  function toggleModel(modelId: string) {
    setSelectedIds((current) => current.includes(modelId)
      ? current.filter((id) => id !== modelId)
      : [...current, modelId]);
  }

  function saveModels() {
    if (!activeProvider || selectedIds.length === 0) return;
    const selectedModels = models.filter((model) => selectedIds.includes(model.id));
    const providerName = activeProvider.id === 'custom' ? customName.trim() : activeProvider.name;
    const existingCustom = activeProvider.id === 'custom'
      ? selections.find((selection) => selection.providerId === 'custom' && selection.providerName !== providerName)
      : undefined;
    if (existingCustom && !window.confirm(`A custom connection named "${existingCustom.providerName}" already exists. Saving "${providerName}" replaces it, including its saved key. Continue?`)) return;
    updateSelections((current) => [
      ...current.filter((selection) => selection.providerId !== activeProvider.id),
      {
        providerId: activeProvider.id,
        providerName,
        models: selectedModels,
        apiKey,
        baseUrl: activeProvider.id === 'custom' ? baseUrl : undefined,
        modelsPath: activeProvider.id === 'custom' ? modelsPath : undefined,
        completionPath: activeProvider.id === 'custom' ? completionPath : undefined,
        authMethod: activeProvider.id === 'custom' ? authMethod : undefined,
        headerName: activeProvider.id === 'custom' ? headerName : undefined,
      },
    ]);
    setNotice(`${providerName}: API key and ${selectedModels.length} model${selectedModels.length === 1 ? '' : 's'} saved on this device.`);
    closeConnection();
  }

  function deleteSelection(providerId: ProviderId, providerName: string) {
    updateSelections((current) => current.filter((selection) => selection.providerId !== providerId));
    setNotice(`${providerName} and its saved API key were deleted from this device.`);
  }

  return (
    <div className="provider-settings connection-settings">
      <section className="connection-hero">
        <div>
          <p>Studio settings</p>
          <h1>Model connections</h1>
          <span>Add only the AI services you use. Arclane verifies the key first, then loads the models that account can actually access.</span>
        </div>
        <div className="connection-count"><strong>{selections.length}</strong><span>configured</span></div>
      </section>

      {notice ? <p className="connection-notice" role="status"><span>✓</span>{notice}</p> : null}

      <section className="connection-section" aria-labelledby="recommended-providers">
        <header>
          <div><h2 id="recommended-providers">Recommended providers</h2><p>Official direct APIs only—no editable endpoint settings.</p></div>
          <span>3 providers</span>
        </header>

        <div className="connection-list">
          {standardProviders.map((provider) => {
            const selection = selections.find((item) => item.providerId === provider.id);
            return (
              <article key={provider.id}>
                <div className={`provider-logo provider-logo-${provider.tone}`}>{provider.mark}</div>
                <div className="connection-provider-copy">
                  <div><h3>{provider.name}</h3><span className="official-badge"><i /> Official API</span></div>
                  <p>{provider.purpose}</p>
                  <small>{provider.endpointLabel}</small>
                </div>
                <div className={`connection-status ${selection ? 'ready' : ''}`}>
                  <i />
                  <span>{selection ? `${selection.models.length} models selected` : 'Not configured'}</span>
                </div>
                <div className="connection-actions">
                  <button type="button" onClick={() => openConnection(provider)}>{selection ? 'Manage' : 'Connect'} <span aria-hidden="true">→</span></button>
                  {selection ? <button className="delete" type="button" onClick={() => deleteSelection(provider.id, provider.name)}>Delete</button> : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <details className="connection-more">
        <summary><span>More providers</span><small>Connect a custom HTTPS models endpoint</small><i aria-hidden="true">＋</i></summary>
        <div>
          <div className={`provider-logo provider-logo-${customProvider.tone}`}>{customProvider.mark}</div>
          <div><strong>Custom API provider</strong><span>For OpenAI-compatible or REST services not listed above.</span></div>
          <button type="button" onClick={() => openConnection(customProvider)}>Configure <span aria-hidden="true">→</span></button>
        </div>
      </details>

      {selections.length > 0 ? (
        <section className="selected-models-section">
          <header><div><h2>Your model selection</h2><p>Fetched directly from each provider.</p></div></header>
          <div>
            {selections.map((selection) => (
              <article key={selection.providerId}>
                <strong>{selection.providerName}</strong>
                <div>{selection.models.slice(0, 4).map((model) => <span key={model.id}>{model.name}</span>)}{selection.models.length > 4 ? <span>+{selection.models.length - 4}</span> : null}</div>
                <button type="button" onClick={() => deleteSelection(selection.providerId, selection.providerName)}>Delete saved connection</button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="connection-security">
        <span aria-hidden="true">◇</span>
        <p><strong>Saved on this device</strong><small>API keys and model choices remain in this browser&apos;s local storage until you delete them. Use this option only on a trusted personal device.</small></p>
      </section>

      {activeProvider ? (
        <div className="provider-dialog-layer" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeConnection();
        }}>
          <section className="connection-dialog" role="dialog" aria-modal="true" aria-labelledby="connection-dialog-title">
            <header>
              <div className={`provider-logo provider-logo-${activeProvider.tone}`}>{activeProvider.mark}</div>
              <div><p>{activeProvider.endpointLabel}</p><h2 id="connection-dialog-title">Connect {activeProvider.name}</h2></div>
              <button type="button" onClick={closeConnection} aria-label="Close connection dialog">×</button>
            </header>

            {models.length === 0 ? (
              <form className="connection-form" onSubmit={verifyAndLoadModels}>
                <div className="connection-form-intro"><span>1</span><p><strong>Verify your API key</strong><small>We will make one official Models API request and return only the models available to this key.</small></p></div>

                {activeProvider.id === 'custom' ? (
                  <div className="connection-custom-fields">
                    <label className="provider-field"><span>Provider name</span><input required value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Example: Groq Cloud" /></label>
                    <label className="provider-field"><span>Base URL</span><input required type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.provider.com/v1" /></label>
                    <label className="provider-field"><span>Models path</span><input required value={modelsPath} onChange={(event) => setModelsPath(event.target.value)} /></label>
                    <label className="provider-field"><span>Completion path</span><input value={completionPath} onChange={(event) => setCompletionPath(event.target.value)} placeholder="/chat/completions" /></label>
                    <label className="provider-field"><span>Authentication</span><select value={authMethod} onChange={(event) => setAuthMethod(event.target.value as AuthMethod)}><option value="bearer">Bearer token</option><option value="api-key">API key header</option></select></label>
                    {authMethod === 'api-key' ? <label className="provider-field provider-field-wide"><span>Header name</span><input required value={headerName} onChange={(event) => setHeaderName(event.target.value)} placeholder="x-api-key" /></label> : null}
                  </div>
                ) : null}

                <label className="connection-key-field">
                  <span>API key</span>
                  <div><input required type={showKey ? 'text' : 'password'} autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={activeProvider.keyHint} /><button type="button" onClick={() => setShowKey((current) => !current)}>{showKey ? 'Hide' : 'Show'}</button></div>
                </label>

                {error ? <p className="connection-error" role="alert"><span>!</span>{error}</p> : null}

                <button className="connection-verify-button" type="submit" disabled={loading}>{loading ? <><i className="provider-spinner" /> Verifying connection…</> : <>Verify key & load models <span aria-hidden="true">→</span></>}</button>
                <p className="connection-key-privacy"><span aria-hidden="true">⌾</span>Your key is saved locally only after you verify it and select models.</p>
              </form>
            ) : (
              <div className="connection-model-step">
                <div className="connection-verified"><span>✓</span><p><strong>Connection verified</strong><small>{models.length} generation models are available to this key.</small></p></div>
                <div className="connection-model-heading"><span>2</span><p><strong>Choose models</strong><small>Select only the models you want available in your Studio.</small></p></div>
                <label className="connection-model-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search available models" /><small>{selectedIds.length} selected</small></label>
                <div className="connection-model-list">
                  {visibleModels.map((model) => {
                    const selected = selectedIds.includes(model.id);
                    return <button type="button" className={selected ? 'selected' : ''} onClick={() => toggleModel(model.id)} key={model.id}><span>{selected ? '✓' : ''}</span><div><strong>{model.name}</strong><small>{model.id}</small></div></button>;
                  })}
                </div>
                <footer>
                  <button type="button" onClick={() => setSelectedIds(visibleModels.map((model) => model.id))}>Select visible</button>
                  <button type="button" onClick={() => setSelectedIds([])}>Clear</button>
                  <button type="button" disabled={selectedIds.length === 0} onClick={saveModels}>Use selected models <span aria-hidden="true">→</span></button>
                </footer>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
