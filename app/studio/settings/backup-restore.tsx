'use client';

import { useRef, useState, type ChangeEvent } from 'react';

const BACKUP_SCHEMA = 'arclane-workspace-backup';
const BACKUP_VERSION = 1;
const KEY_PREFIX = 'arclane.';
const MAX_BACKUP_BYTES = 25_000_000;

type BackupFile = { schema: string; version: number; exportedAt: string; entries: Record<string, string> };

export default function BackupRestore() {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const restoringRef = useRef(false);

  function downloadBackup() {
    try {
      const entries: Record<string, string> = {};
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key?.startsWith(KEY_PREFIX)) continue;
        const value = window.localStorage.getItem(key);
        if (value !== null) entries[key] = value;
      }
      const entryCount = Object.keys(entries).length;
      if (!entryCount) {
        setError('There is no workspace data to back up on this device yet.');
        return;
      }
      const backup: BackupFile = { schema: BACKUP_SCHEMA, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), entries };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `arclane-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setError('');
      setStatus(`Backup downloaded (${entryCount} workspace file${entryCount === 1 ? '' : 's'}). It contains your saved API keys, so keep the file private.`);
    } catch {
      setStatus('');
      setError('The browser blocked the backup download. Allow downloads and try again.');
    }
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || restoringRef.current) return;
    restoringRef.current = true;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('This backup file is too large.');
      const parsed = JSON.parse(await file.text()) as Partial<BackupFile>;
      const isWorkspaceBackup = parsed.schema === BACKUP_SCHEMA && parsed.version === BACKUP_VERSION
        && parsed.entries && typeof parsed.entries === 'object' && !Array.isArray(parsed.entries);
      const isLegacyProjectBackup = !parsed.entries && typeof (parsed as { workflow?: unknown }).workflow === 'object';
      if (!isWorkspaceBackup && !isLegacyProjectBackup) {
        throw new Error('This file is not an Arclane workspace backup (neither a full workspace backup nor a project backup from the New Video dialog).');
      }
      // The older "project backup" produced by the New Video dialog carries a
      // single workflow payload; ingest it into the standard entries shape.
      const legacyWorkflow = parsed.schema === undefined
        && (parsed as Partial<{ schema: unknown; workflow?: unknown }>);
      let source: Record<string, string> | undefined = parsed.entries;
      if (!source && legacyWorkflow && typeof legacyWorkflow === 'object' && 'workflow' in legacyWorkflow) {
        source = { 'arclane.creator-workflow.v1': JSON.stringify((legacyWorkflow as { workflow?: unknown }).workflow ?? {}) };
      }
      if (!source) throw new Error('This file is not an Arclane workspace backup.');
      const entries = Object.entries(source).filter((entry): entry is [string, string] =>
        entry[0].startsWith(KEY_PREFIX) && typeof entry[1] === 'string');
      if (!entries.length) throw new Error('The backup file contains no Arclane workspace data.');
      // Transactional restore: snapshot the current values first so a storage
      // failure mid-way can roll everything back instead of half-applying.
      const previous = new Map<string, string | null>();
      let written = 0;
      try {
        for (const [key, value] of entries) {
          previous.set(key, window.localStorage.getItem(key));
          window.localStorage.setItem(key, value);
          written += 1;
        }
      } catch {
        for (const [key, value] of previous) {
          try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch { /* best-effort rollback */ }
        }
        throw new Error(`This browser could not restore the backup (storage is full or blocked) after ${written} of ${entries.length} files; the previous data was rolled back.`);
      }
      window.dispatchEvent(new Event('arclane:model-connections-changed'));
      window.dispatchEvent(new Event('arclane:research-tools-changed'));
      window.dispatchEvent(new Event('arclane:workflow-changed'));
      setError('');
      const exportedTime = parsed.exportedAt ? new Date(parsed.exportedAt) : null;
      const restoredAt = exportedTime && !Number.isNaN(exportedTime.getTime()) ? exportedTime.toLocaleString() : '';
      setStatus(`Restored ${entries.length} workspace file${entries.length === 1 ? '' : 's'}${restoredAt ? ` from ${restoredAt}` : ''}. Reloading…`);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (restoreError) {
      setStatus('');
      setError(restoreError instanceof Error ? restoreError.message : 'The backup could not be restored.');
    } finally {
      restoringRef.current = false;
    }
  }

  return (
    <section className="backup-restore" aria-labelledby="backup-title">
      <header>
        <div><p>Workspace backup</p><h2 id="backup-title">Protect every hour of work.</h2><span>One file contains every production section, Idea Memory, model connection and setting saved on this device. Restoring replaces the matching workspace data with the file&apos;s version.</span></div>
        <strong><i /> Local file · no server</strong>
      </header>

      <div className="backup-restore-actions">
        <button type="button" onClick={downloadBackup}>↓ Download full backup</button>
        <button type="button" onClick={() => importInputRef.current?.click()}>↑ Restore from backup</button>
        <input ref={importInputRef} type="file" accept=".json,application/json" onChange={(event) => void restoreBackup(event)} />
      </div>

      <div className="backup-restore-note"><span>!</span><p><strong>The backup contains your API keys</strong><small>Store the downloaded file somewhere private. Restoring a backup overwrites the matching workspace data on this device.</small></p></div>

      {status ? <p className="backup-restore-message success" role="status"><span>✓</span>{status}</p> : null}
      {error ? <p className="backup-restore-message error" role="alert"><span>!</span>{error}</p> : null}
    </section>
  );
}
