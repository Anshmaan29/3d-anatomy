import { useEffect, useMemo, useRef, useState } from 'react';
import type { Structure } from './types';
import { anatomyCacheName, anatomyMetadataAssets, clearAnatomyAssetCaches, currentViewAssets, downloadAnatomyView, formatOfflineBytes, prepareOfflineShell } from './offline';
import type { OfflineProgress } from './offline';
import './offline.css';

interface Props { structures: Structure[]; visibleIds: string[]; quality: 'high' | 'balanced'; }
export default function OfflinePanel({ structures, visibleIds, quality }: Props) {
  const [progress, setProgress] = useState<OfflineProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number }>({});
  const [supported, setSupported] = useState(false);
  const [ready, setReady] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [failed, setFailed] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const version = import.meta.env.VITE_MODEL_VERSION || 'dev';
  const origin = typeof window === 'undefined' ? 'https://anatomy.invalid' : window.location.origin;
  const urls = useMemo(() => currentViewAssets(structures, visibleIds, quality, version, origin), [structures, visibleIds, quality, version, origin]);
  const estimateStorage = () => { navigator.storage?.estimate().then(value => { if (mounted.current) setEstimate(value); }).catch(() => {}); };
  useEffect(() => {
    mounted.current = true;
    setSupported(window.isSecureContext && 'caches' in window && 'AbortController' in window);
    setReady(Boolean(navigator.serviceWorker?.controller));
    const changed = () => setReady(Boolean(navigator.serviceWorker?.controller));
    navigator.serviceWorker?.addEventListener('controllerchange', changed);
    estimateStorage();
    return () => { mounted.current = false; abort.current?.abort(); navigator.serviceWorker?.removeEventListener('controllerchange', changed); };
  }, []);
  const start = async () => {
    const controller = new AbortController(); abort.current = controller;
    setRunning(true); setFailed(false); setMessage('Preparing the selected model chunks and their textures…'); setProgress(null);
    try {
      await prepareOfflineShell({ origin, cache: await caches.open(`anatomy-studio-${version}`), signal: controller.signal });
      const cache = await caches.open(anatomyCacheName(version));
      const result = await downloadAnatomyView({ urls: [...urls, ...anatomyMetadataAssets(structures, visibleIds, origin)], origin, cache, signal: controller.signal, onProgress: value => { if (mounted.current) setProgress(value); } });
      if (!mounted.current) return;
      setFailed(Boolean(result.failed.length));
      setMessage(result.failed.length ? `${result.failed.length} file(s) could not be saved. Retry resumes from the files already downloaded.` : `${result.completed} files saved for this view, including model dependencies. Open the view once online before using it offline.`);
    } catch (error) {
      if (!mounted.current) return;
      if (controller.signal.aborted) setMessage('Download paused. Saved files are kept; download again to resume.');
      else { setFailed(true); setMessage(error instanceof Error ? error.message : 'The download could not complete. Please retry.'); }
    } finally {
      if (mounted.current) { setRunning(false); estimateStorage(); }
      if (abort.current === controller) abort.current = null;
    }
  };
  const clear = async () => {
    setClearing(true);
    try { await clearAnatomyAssetCaches(caches); if (mounted.current) { setProgress(null); setMessage('Downloaded anatomy files cleared. Your notes, saved views and revision progress remain.'); setFailed(false); estimateStorage(); } }
    catch { if (mounted.current) setMessage('The browser could not clear downloaded anatomy. Try again.'); }
    finally { if (mounted.current) setClearing(false); }
  };
  return <section className="offline-panel" aria-labelledby="offline-title"><div className="offline-title"><h3 id="offline-title">Study without a connection</h3><span>{quality === 'balanced' ? 'Balanced detail' : 'High detail'}</span></div><p>Save the current view’s {urls.length} model chunk{urls.length === 1 ? '' : 's'}, source labels and required textures. Files are downloaded only when you choose.</p>
    {!supported && <p className="offline-notice">Offline downloads need a browser with secure local storage and HTTPS.</p>}
    {supported && !ready && <p className="offline-notice">The offline app is not controlling this page yet. Open the installed HTTPS site online and reload once before relying on offline study.</p>}
    <div className="offline-actions"><button className="offline-download" disabled={!supported || !urls.length || running || clearing} onClick={start}>{failed ? 'Retry download' : 'Download current view'}</button>{running && <button onClick={() => abort.current?.abort()}>Cancel download</button>}<button disabled={!supported || running || clearing} onClick={clear}>{clearing ? 'Clearing…' : 'Clear downloaded models'}</button></div>
    {progress && <div className="offline-progress"><progress max={Math.max(1, progress.total)} value={progress.completed} aria-label={`${progress.completed} of ${progress.total} files downloaded`} /><div><span>{progress.completed} / {progress.total} files{progress.failed ? ` · ${progress.failed} need retry` : ''}</span><span>{formatOfflineBytes(progress.bytes)} received</span></div>{running && <small>{progress.current || 'Checking saved files…'} · texture dependencies may increase the file count</small>}</div>}
    <p className={`offline-status${failed ? ' offline-error' : ''}`} role="status" aria-live="polite">{message}</p>
    <small className="offline-storage">{estimate.quota ? `${formatOfflineBytes(estimate.usage || 0)} used of approximately ${formatOfflineBytes(estimate.quota)} browser storage. ` : ''}The browser can remove offline files when space is low. Only downloaded views work offline; this does not download the full atlas.</small>
  </section>;
}
