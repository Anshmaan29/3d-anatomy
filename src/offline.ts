import type { Structure } from './types';

export interface OfflineProgress { completed: number; total: number; bytes: number; cached: number; failed: number; current: string; }
export interface OfflineResult { completed: number; total: number; bytes: number; cached: number; failed: string[]; }
export const anatomyCacheName = (version: string) => `anatomy-studio-${version}-assets`;

/** Match the renderer: model geometry is versioned; external GLB textures retain their source URI. */
export function currentViewAssets(structures: Structure[], visibleIds: string[], quality: 'high' | 'balanced', version: string, origin: string): string[] {
  const ids = new Set(visibleIds), selected = structures.filter(structure => ids.has(structure.id));
  const paths = selected.map(structure => quality === 'balanced' ? structure.balancedAssetPath || structure.assetPath || `/models/balanced/${structure.system}.glb` : structure.assetPath || `/models/${structure.system}.glb`);
  return [...new Set(paths)].map(path => {
    const url = new URL(path, origin);
    url.searchParams.set('v', version);
    if (!isAnatomyAssetUrl(url.href, origin)) throw new Error('A model points outside this anatomy site.');
    return url.href;
  });
}

export function isAnatomyAssetUrl(value: string, origin: string): boolean {
  try {
    const url = new URL(value, origin), base = new URL(origin);
    return url.origin === base.origin && !url.username && !url.password && /^(?:\/models\/|\/data\/)/.test(url.pathname) && !/%(?:2f|5c|2e)/i.test(url.pathname) && !url.pathname.includes('\\');
  } catch { return false; }
}

export function glbDependencies(bytes: ArrayBuffer, modelUrl: string, origin = new URL(modelUrl).origin): string[] {
  const view = new DataView(bytes);
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== view.byteLength) throw new Error('This download is not a valid GLB model.');
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || length > view.byteLength - 20) throw new Error('The model JSON chunk is incomplete.');
  const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length)).replace(/\0+$/, '').trim()) as { images?: { uri?: unknown }[]; buffers?: { uri?: unknown }[] };
  const references = [...(Array.isArray(doc.images) ? doc.images : []), ...(Array.isArray(doc.buffers) ? doc.buffers : [])];
  return [...new Set(references.flatMap(item => {
    if (!item || typeof item.uri !== 'string' || item.uri.startsWith('data:')) return [];
    const resolved = new URL(item.uri, modelUrl);
    if (!isAnatomyAssetUrl(resolved.href, origin)) throw new Error('A model dependency points outside this anatomy site.');
    return [resolved.href];
  }))];
}

export function isUsableAssetResponse(response: Response): boolean {
  const type = response.headers.get('content-type') || '';
  return response.ok && response.type !== 'opaque' && !/text\/html|application\/xhtml/i.test(type);
}

/** Shared queue discovers dependencies while running; no more than three network reads at once. */
export async function downloadAnatomyView(options: {
  urls: string[]; cache: Pick<Cache, 'match' | 'put'>; origin: string; signal: AbortSignal;
  onProgress?: (progress: OfflineProgress) => void; fetcher?: typeof fetch; concurrency?: number;
}): Promise<OfflineResult> {
  const { cache, origin, signal, onProgress } = options;
  const fetcher = options.fetcher || fetch;
  const queue: string[] = [], seen = new Set<string>();
  const result: OfflineResult = { completed: 0, total: 0, bytes: 0, cached: 0, failed: [] };
  const add = (url: string) => {
    if (!isAnatomyAssetUrl(url, origin)) throw new Error('Only same-site anatomy files can be downloaded.');
    if (!seen.has(url)) { seen.add(url); queue.push(url); result.total = queue.length; }
  };
  options.urls.forEach(add);
  let lastReport = 0;
  const report = (current = '', force = true) => {
    const time = Date.now();
    if (!force && time - lastReport < 100) return;
    lastReport = time;
    onProgress?.({ completed: result.completed, total: result.total, bytes: result.bytes, cached: result.cached, failed: result.failed.length, current });
  };
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      signal.throwIfAborted();
      const url = queue[cursor++]; report(new URL(url).pathname.split('/').pop() || '');
      try {
        let response = await cache.match(url, { ignoreVary: true });
        if (response && !isUsableAssetResponse(response)) response = undefined;
        const wasCached = Boolean(response);
        if (!response) response = await fetcher(url, { signal, credentials: 'same-origin' });
        if (!isUsableAssetResponse(response)) throw new Error(`Anatomy asset unavailable (${response.status}).`);
        let bytes: ArrayBuffer;
        if (wasCached || !response.body) { bytes = await response.arrayBuffer(); if (!wasCached) result.bytes += bytes.byteLength; }
        else {
          const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
          try {
            while (true) {
              signal.throwIfAborted(); const { done, value } = await reader.read(); if (done) break;
              chunks.push(value); size += value.byteLength; result.bytes += value.byteLength; report(new URL(url).pathname.split('/').pop(), false);
            }
          } finally { reader.releaseLock(); }
          const merged = new Uint8Array(size); let offset = 0;
          for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
          bytes = merged.buffer;
        }
        signal.throwIfAborted();
        const path = new URL(url).pathname;
        // Validate before storing: a SPA fallback is never a usable model or catalogue.
        if (/\.glb$/i.test(path)) glbDependencies(bytes, url, origin).forEach(add);
        if (/\.json$/i.test(path)) JSON.parse(new TextDecoder().decode(bytes));
        if (!wasCached) {
          const headers = new Headers(response.headers);
          // fetch() exposes decoded bytes; do not retain a compressed wire length/encoding.
          headers.delete('content-encoding'); headers.set('content-length', String(bytes.byteLength));
          await cache.put(url, new Response(bytes, { status: response.status, statusText: response.statusText, headers }));
        }
        else result.cached++;
        result.completed++; report();
      } catch (error) {
        if (signal.aborted) throw signal.reason || error;
        result.failed.push(url); report();
      }
    }
  };
  report();
  await Promise.all(Array.from({ length: Math.max(1, Math.min(3, options.concurrency || 3, queue.length || 1)) }, worker));
  return result;
}

/** The first install may control this page before its original script requests were cached. */
export async function prepareOfflineShell(options: { origin: string; cache: Pick<Cache, 'put'>; signal: AbortSignal; fetcher?: typeof fetch }): Promise<void> {
  const fetcher = options.fetcher || fetch, root = new URL('/', options.origin).href;
  const response = await fetcher(root, { signal: options.signal, credentials: 'same-origin' });
  if (!response.ok || response.redirected || !/text\/html/i.test(response.headers.get('content-type') || '')) throw new Error('Open the deployed app online before preparing offline study.');
  const html = await response.clone().text();
  if (!/id=["']root["']/.test(html) || !/<script\b[^>]*src=["'][^"']*\/assets\//i.test(html)) throw new Error('Offline study needs the built website, rather than a development or sign-in page.');
  const urls = new Set<string>();
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
    const url = new URL(match[1], root);
    if (url.origin === options.origin && /^(?:\/assets\/[^/]+\.(?:js|css)|\/fonts\/[^/]+\.(?:ttf|otf|woff2?))$/i.test(url.pathname)) urls.add(url.href);
  }
  for (const url of urls) {
    options.signal.throwIfAborted();
    const asset = await fetcher(url, { signal: options.signal, credentials: 'same-origin' });
    if (!isUsableAssetResponse(asset)) throw new Error('An app file could not be saved. Please retry while online.');
    if (/\.css$/i.test(new URL(url).pathname)) {
      const css = await asset.clone().text();
      for (const match of css.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi)) {
        const font = new URL(match[1], url);
        if (font.origin === options.origin && /^\/fonts\/[^/]+\.(?:ttf|otf|woff2?)$/i.test(font.pathname)) urls.add(font.href);
      }
    }
    await options.cache.put(url, asset);
  }
  options.signal.throwIfAborted();
  await options.cache.put(root, response);
}

export function anatomyMetadataAssets(structures: Structure[], visibleIds: string[], origin: string): string[] {
  const selected = new Set(visibleIds);
  const atlas = structures.some(item => selected.has(item.id) && item.id.startsWith('ATLAS_'));
  const names = atlas ? ['atlas.json', 'atlas-landmarks.json', 'atlas-scenes.json'] : ['anatomy.json', 'supplement.json'];
  return names.map(name => new URL(`/data/${name}`, origin).href);
}

export async function clearAnatomyAssetCaches(storage: Pick<CacheStorage, 'keys' | 'delete'>): Promise<number> {
  const names = (await storage.keys()).filter(name => /^anatomy-studio-(?:[a-f0-9]{16}|dev|v1)-assets$/.test(name));
  const deleted = await Promise.all(names.map(name => storage.delete(name)));
  return deleted.filter(Boolean).length;
}

export function formatOfflineBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
