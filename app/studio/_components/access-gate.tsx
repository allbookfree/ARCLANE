'use client';

import { useEffect, useState, type FormEvent } from 'react';

type AccessStatus = { required: boolean; unlocked: boolean; error?: string };
type GatePhase = 'checking' | 'open' | 'locked';

export default function AccessGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<GatePhase>('checking');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/access', { headers: { Accept: 'application/json' } })
      .then((response) => response.json() as Promise<AccessStatus>)
      .then((status) => {
        if (!cancelled) setPhase(status.required && !status.unlocked ? 'locked' : 'open');
      })
      .catch(() => {
        // Fail open so a transient error cannot brick the UI; every protected
        // API route independently enforces the lock.
        if (!cancelled) setPhase('open');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const result = await response.json() as AccessStatus;
      if (response.ok && result.unlocked) {
        setPhase('open');
        return;
      }
      setError(result.error || 'That access code does not match. Try again.');
    } catch {
      setError('The access check could not complete. Check the connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === 'checking') {
    return (
      <div className="access-gate-shell" aria-busy="true">
        <div className="access-gate-card" role="status">
          <div className="access-gate-mark">A</div>
          <p>ARCLANE &middot; Creator Studio</p>
          <h1>Opening the studio&hellip;</h1>
        </div>
      </div>
    );
  }
  if (phase === 'open') return <>{children}</>;

  return (
    <div className="access-gate-shell">
      <form className="access-gate-card" onSubmit={(event) => void unlock(event)}>
        <div className="access-gate-mark">A</div>
        <p>ARCLANE · Creator Studio</p>
        <h1>This studio is private</h1>
        <span>Enter this deployment&apos;s access code once. The device stays unlocked for 30 days, and your saved API keys never leave this browser.</span>
        <label>
          <span>Access code</span>
          <input
            type="password"
            autoComplete="off"
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Access code"
          />
        </label>
        {error ? <p className="access-gate-error" role="alert">{error}</p> : null}
        <button type="submit" disabled={submitting || code.trim().length < 4}>{submitting ? 'Checking…' : 'Unlock Studio'}</button>
      </form>
    </div>
  );
}
