import type { DatasetId, Structure, SystemId } from './types';

export type SectionAxis = 'sagittal' | 'coronal' | 'axial';
export const sectionCoordinate = (axis: SectionAxis): 0 | 1 | 2 => axis === 'sagittal' ? 0 : axis === 'axial' ? 1 : 2;
export function sectionCut(minimum: number, maximum: number, position = .5): number {
  const fraction = Number.isFinite(position) ? Math.min(1, Math.max(0, position)) : .5;
  return minimum + (maximum - minimum) * fraction;
}
export function requestedModelAssets({ structures, activeSystems, hiddenIds, isolatedIds, dataset, quality }: {
  structures: Structure[]; activeSystems: SystemId[]; hiddenIds: string[]; isolatedIds: string[];
  dataset: DatasetId; quality: 'balanced' | 'high';
}): { system: SystemId; assetPath?: string }[] {
  const hidden = new Set(hiddenIds), isolated = new Set(isolatedIds), active = new Set(activeSystems);
  const candidates = structures.filter(item => active.has(item.system) && !hidden.has(item.id) && (!isolated.size || isolated.has(item.id)));
  const seen = new Set<string>();
  return activeSystems.flatMap<{ system: SystemId; assetPath?: string }>(system => {
    const members = candidates.filter(item => item.system === system);
    if (!members.length) return [];
    const paths = [...new Set(members.filter(item => item.assetPath).map(item => quality === 'balanced' ? (item.balancedAssetPath || item.assetPath!) : item.assetPath!))];
    return [...(dataset === 'open' && members.some(item => !item.assetPath) ? [{ system }] : []), ...paths.map(assetPath => ({ system, assetPath }))];
  }).filter(asset => {
    const key = asset.assetPath || `${quality}/${asset.system}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export type ViewDirection = 'anterior' | 'posterior' | 'left' | 'right' | 'superior';
export function fitViewDistance(extent: [number, number, number], aspect: number, direction: ViewDirection = 'anterior', fov = 34): number {
  const [x, y, z] = extent;
  const [width, height, depth] = direction === 'left' || direction === 'right' ? [z, y, x] : direction === 'superior' ? [x, z, y] : [x, y, z];
  return Math.max(.25, Math.max(height, width / Math.max(.1, aspect)) / 2 / Math.tan(fov * Math.PI / 360) * 1.18 + depth / 2);
}

/** Bound fetch, decode and image work together, including overlapping scene changes. */
export function createLoadQueue(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const drain = () => { while (active < Math.max(1, concurrency) && queue.length) queue.shift()!(); };
  return function schedule<T>(work: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      queue.push(() => {
        active++;
        Promise.resolve().then(work).then(resolve, reject).finally(() => { active--; drain(); });
      });
      drain();
    });
  };
}
