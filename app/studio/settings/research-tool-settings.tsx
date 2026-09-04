'use client';

import { FormEvent, useMemo, useState, useSyncExternalStore } from 'react';

type CreditUsage = {
  remainingCredits: number;
  planCredits: number;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  checkedAt: string;
};

type ResearchToolsConfig = {
  firecrawl?: {
    apiKey: string;
    savedAt: string;
    usage?: CreditUsage;
    lastRunCreditsUsed?: number;
    lastRunAt?: string;
  };
};

const storageKey = 'arclane.research-tools.v1';
const storageChangeEvent = 'arclane:research-tools-changed';
const externalEvidencePreferenceKey = 'arclane.research-external-evidence.v1';

function readConfig(saved: string | null): ResearchToolsConfig {
  try {
    if (!saved) return {};
    const value = JSON.parse(saved) as ResearchToolsConfig;
    if (!value || typeof value !== 'object') return {};
    if (value.firecrawl && typeof value.firecrawl.apiKey !== 'string') return {};
    return value;
  } catch {
    return {};
  }
}

function subscribeToResearchTools(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(storageChangeEvent, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(storageChangeEvent, onChange);
  };
}

function getStorageSnapshot() {
  return window.localStorage.getItem(storageKey) ?? '{}';
}

function getServerStorageSnapshot() {
  return '{}';
}

function maskKey(key: string) {
  if (key.length < 10) return 'Saved on this device';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

function readableDate(value?: string) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

async function requestCreditUsage(apiKey: string) {
  const response = await fetch('/api/research/evidence/usage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  const result = await response.json() as Partial<CreditUsage> & { error?: string };
  if (!response.ok || typeof result.remainingCredits !== 'number' || typeof result.planCredits !== 'number' || !result.checkedAt) {
    throw new Error(result.error || 'Firecrawl did not return complete credit information.');
  }
  return result as CreditUsage;
}

export default function ResearchToolSettings() {
  const storedConfig = useSyncExternalStore(subscribeToResearchTools, getStorageSnapshot, getServerStorageSnapshot);
  const config = useMemo(() => readConfig(storedConfig), [storedConfig]);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [editing, setEditing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function liveLastRun(): { lastRunCreditsUsed?: number; lastRunAt?: string } {
    // Read the stored value fresh so a concurrent Research run that just wrote
    // its credit usage is never reverted by this panel's older snapshot.
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsedLive = raw ? JSON.parse(raw) as ResearchToolsConfig : {};
      return { lastRunCreditsUsed: parsedLive.firecrawl?.lastRunCreditsUsed, lastRunAt: parsedLive.firecrawl?.lastRunAt };
    } catch {
      return {};
    }
  }

  function persist(next: ResearchToolsConfig) {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    window.dispatchEvent(new Event(storageChangeEvent));
  }

  function openForm() {
    setApiKey(config.firecrawl?.apiKey ?? '');
    setShowKey(false);
    setEditing(true);
    setError('');
    setNotice('');
  }

  function closeForm() {
    if (checking) return;
    setApiKey('');
    setShowKey(false);
    setEditing(false);
    setError('');
  }

  async function checkAndSaveConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = apiKey.trim();
    if (!key || key.length > 1000) {
      setError('Enter a valid Firecrawl API key.');
      return;
    }
    setChecking(true);
    setError('');
    try {
      const usage = await requestCreditUsage(key);
      const lastRun = liveLastRun();
      persist({
        ...config,
        firecrawl: {
          ...config.firecrawl,
          apiKey: key,
          savedAt: new Date().toISOString(),
          usage,
          lastRunCreditsUsed: lastRun.lastRunCreditsUsed ?? config.firecrawl?.lastRunCreditsUsed,
          lastRunAt: lastRun.lastRunAt ?? config.firecrawl?.lastRunAt,
        },
      });
      setNotice(`Firecrawl verified. ${usage.remainingCredits.toLocaleString()} of ${usage.planCredits.toLocaleString()} credits are currently available.`);
      setApiKey('');
      setShowKey(false);
      setEditing(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Firecrawl could not verify this key.');
    } finally {
      setChecking(false);
    }
  }

  async function refreshCredits() {
    const key = config.firecrawl?.apiKey.trim();
    if (!key || checking) return;
    setChecking(true);
    setError('');
    setNotice('');
    try {
      const usage = await requestCreditUsage(key);
      const lastRun = liveLastRun();
      persist({ ...config, firecrawl: { ...config.firecrawl!, usage, lastRunCreditsUsed: lastRun.lastRunCreditsUsed ?? config.firecrawl?.lastRunCreditsUsed, lastRunAt: lastRun.lastRunAt ?? config.firecrawl?.lastRunAt } });
      setNotice(`Firecrawl balance refreshed: ${usage.remainingCredits.toLocaleString()} credits remaining.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Firecrawl credits could not be refreshed.');
    } finally {
      setChecking(false);
    }
  }

  function deleteConnection() {
    if (!window.confirm('Delete the saved Firecrawl API key from this device? External Evidence will become unavailable until you connect it again.')) return;
    try {
      const next = { ...config };
      delete next.firecrawl;
      persist(next);
      window.localStorage.setItem(externalEvidencePreferenceKey, JSON.stringify(false));
      setNotice('Firecrawl, its local credit snapshot, and External Evidence were removed from this device.');
      setApiKey('');
      setEditing(false);
      setError('');
    } catch {
      setError('This browser could not delete the Firecrawl connection.');
    }
  }

  const connected = Boolean(config.firecrawl?.apiKey);
  const usage = config.firecrawl?.usage;
  const usagePercent = usage?.planCredits ? Math.max(0, Math.min(100, (usage.remainingCredits / usage.planCredits) * 100)) : 0;

  return (
    <section className="research-tools-settings" aria-labelledby="research-tools-title">
      <header className="research-tools-heading">
        <div>
          <p>Research evidence</p>
          <h2 id="research-tools-title">External source connection</h2>
          <span>Optional evidence retrieval for Research only. It searches first, then gives a compact source pack to your selected AI model.</span>
        </div>
        <strong><i className={connected ? 'ready' : ''} />{connected ? '1 connected' : 'Not connected'}</strong>
      </header>

      {notice ? <p className="research-tools-notice" role="status"><span>✓</span>{notice}</p> : null}
      {error && !editing ? <p className="research-tools-error" role="alert"><span>!</span>{error}</p> : null}

      <article className="research-tool-card">
        <div className="firecrawl-logo">F</div>
        <div className="research-tool-copy">
          <div><h3>Firecrawl</h3><span className="official-badge"><i /> Official API</span></div>
          <p>Runs three complementary historical-search lanes, extracts readable evidence, and reports the actual credits used by each Research run.</p>
          <small>api.firecrawl.dev/v2/search · team/credit-usage</small>
        </div>
        <div className={`research-tool-status${connected ? ' ready' : ''}`}>
          <i />
          <span>{connected ? maskKey(config.firecrawl?.apiKey ?? '') : 'API key required'}</span>
        </div>
        <div className="research-tool-actions">
          <button type="button" onClick={openForm}>{connected ? 'Manage' : 'Connect'} <span aria-hidden="true">→</span></button>
          {connected ? <button className="delete" type="button" onClick={deleteConnection}>Delete</button> : null}
        </div>
      </article>

      {connected ? (
        <section className="firecrawl-credit-panel" aria-label="Firecrawl credit usage">
          <header><div><p>Verified account balance</p><h3>{usage ? `${usage.remainingCredits.toLocaleString()} credits left` : 'Balance not checked yet'}</h3></div><button type="button" disabled={checking} onClick={() => void refreshCredits()}>{checking ? 'Checking…' : 'Check credits'}</button></header>
          {usage ? <>
            <div className="firecrawl-credit-metrics"><div><span>Remaining</span><strong>{usage.remainingCredits.toLocaleString()}</strong></div><div><span>Plan allowance</span><strong>{usage.planCredits.toLocaleString()}</strong></div><div><span>Billing period ends</span><strong>{readableDate(usage.billingPeriodEnd)}</strong></div></div>
            <div className="firecrawl-credit-track" aria-label={`${usagePercent.toFixed(0)} percent of credits remaining`}><i style={{ width: `${usagePercent}%` }} /></div>
            <footer><span>Last checked {readableDate(usage.checkedAt)}</span><span>{typeof config.firecrawl?.lastRunCreditsUsed === 'number' ? `Last Research used ${config.firecrawl.lastRunCreditsUsed} credits${config.firecrawl.lastRunAt ? ` (${readableDate(config.firecrawl.lastRunAt)})` : ''}` : 'Run cost will appear after External Evidence is used'}</span><strong>Provider-reported values · no hard-coded plan limit</strong></footer>
          </> : <p className="firecrawl-credit-empty">Use “Check credits” to authenticate the saved key and load the exact balance for its Firecrawl team.</p>}
        </section>
      ) : null}

      <div className="research-tools-policy">
        <span aria-hidden="true">◇</span>
        <div><strong>One evidence engine at a time</strong><small>In Research, Native Live Search and Firecrawl External Evidence are separate controls. Turning one on turns the other off; both may remain off.</small></div>
      </div>

      <div className="research-tools-security">
        <span aria-hidden="true">⌾</span>
        <p><strong>Local key storage</strong><small>The Firecrawl key and credit snapshot stay in this browser&apos;s local storage until you delete them. Use this only on a trusted personal device.</small></p>
        <a href="https://www.firecrawl.dev/app/api-keys" target="_blank" rel="noreferrer">Open Firecrawl API keys ↗</a>
      </div>

      {editing ? (
        <div className="research-tool-dialog-layer" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeForm();
        }}>
          <section className="research-tool-dialog" role="dialog" aria-modal="true" aria-labelledby="firecrawl-dialog-title">
            <header>
              <div className="firecrawl-logo">F</div>
              <div><p>api.firecrawl.dev</p><h2 id="firecrawl-dialog-title">{connected ? 'Check or replace Firecrawl' : 'Connect Firecrawl'}</h2></div>
              <button type="button" disabled={checking} onClick={closeForm} aria-label="Close Firecrawl dialog">×</button>
            </header>
            <form onSubmit={(event) => void checkAndSaveConnection(event)}>
              <div className="research-tool-step"><span>1</span><p><strong>Verify the key and read its balance</strong><small>This makes one official account-usage request. It does not run a web search or call your AI model.</small></p></div>
              <label className="research-tool-key-field">
                <span>Firecrawl API key</span>
                <div><input required disabled={checking} type={showKey ? 'text' : 'password'} autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="fc-…" /><button type="button" disabled={checking} onClick={() => setShowKey((current) => !current)}>{showKey ? 'Hide' : 'Show'}</button></div>
              </label>
              {error ? <p className="research-tools-error" role="alert"><span>!</span>{error}</p> : null}
              <button className="research-tool-save" type="submit" disabled={checking}>{checking ? 'Checking official balance…' : 'Check key & save connection'} <span aria-hidden="true">→</span></button>
              <p className="research-tool-privacy"><span aria-hidden="true">⌾</span>The key is saved locally only after Firecrawl returns valid credit data.</p>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
